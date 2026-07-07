// ════════════════════════════════════════════════════════════════
// Web Push — RFC 8291 (aes128gcm) payload encryption + RFC 8292 VAPID.
// Pure Web Crypto: runs unchanged on Cloudflare Workers and Node 19+.
//
// Apple Web Push (Safari / iOS PWA) requires the aes128gcm content
// coding — the older "aesgcm" scheme is rejected — so this is hand-rolled
// against the RFCs rather than using a legacy library.
// ════════════════════════════════════════════════════════════════
const enc = new TextEncoder();

const b64uToBytes = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  s += '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const bytesToB64u = (u) => {
  const a = new Uint8Array(u);
  let s = '';
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const concat = (...arrs) => {
  let n = 0; arrs.forEach((a) => (n += a.length));
  const o = new Uint8Array(n); let off = 0;
  arrs.forEach((a) => { o.set(a, off); off += a.length; });
  return o;
};

async function hkdf(ikmBytes, salt, info, len) {
  const key = await crypto.subtle.importKey('raw', ikmBytes, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8);
  return new Uint8Array(bits);
}

// Encrypt a payload for a push subscription (RFC 8291, single record).
async function encryptPayload(sub, plaintextBytes) {
  const uaPublic = b64uToBytes(sub.keys.p256dh);   // 65-byte EC point
  const authSecret = b64uToBytes(sub.keys.auth);   // 16-byte auth secret

  const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(ecdh, authSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, enc.encode('Content-Encoding: nonce\0'), 12);

  const record = concat(plaintextBytes, new Uint8Array([0x02])); // last-record delimiter
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, record));

  const rs = new Uint8Array([0, 0, 0x10, 0x00]); // record size 4096
  const idlen = new Uint8Array([asPublic.length]);
  return concat(salt, rs, idlen, asPublic, ct);   // RFC 8188 body header + ciphertext
}

// Build the VAPID Authorization header (RFC 8292, aes128gcm form).
async function vapidAuthorization(endpoint, publicKey, privateKey, subject) {
  const pub = b64uToBytes(publicKey);
  const signKey = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', d: privateKey,
    x: bytesToB64u(pub.slice(1, 33)), y: bytesToB64u(pub.slice(33, 65)),
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

  const header = bytesToB64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToB64u(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  })));
  const signingInput = `${header}.${payload}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signKey, enc.encode(signingInput)));
  return `vapid t=${signingInput}.${bytesToB64u(sig)}, k=${publicKey}`;
}

// Encrypt + POST a notification. Returns the push service HTTP status.
export async function sendPush(sub, payloadObj, vapid) {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(payloadObj)));
  const authorization = await vapidAuthorization(sub.endpoint, vapid.publicKey, vapid.privateKey, vapid.subject);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '3600',
      Urgency: 'high',
    },
    body,
  });
  return res.status;
}

// Generate a fresh VAPID key pair (public: 65-byte point, private: raw d).
export async function generateVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { publicKey: bytesToB64u(pub), privateKey: jwk.d };
}
