// ════════════════════════════════════════════════════════════════
// PIREPlog push backend — Cloudflare Worker
//
// Phase 1 (this file): Web Push only.
//   POST /subscribe   — register a device's push subscription
//   DELETE /subscribe — remove a subscription
//   POST /test        — send a test notification to all devices
//   POST /alert       — send a severe-turbulence alert to all devices
//   GET  /vapidPublicKey — the VAPID public key (for clients)
//
// Push delivery rides the platform push service (Apple/…), so it works
// even where the in-flight wifi allowlist blocks the data domain.
//
// Data sync (POST/GET /events with D1) is deliberately NOT here yet — it
// depends on the wifi allowlist decision and is a later phase.
// ════════════════════════════════════════════════════════════════
import { ApplicationServerKeys, generatePushHTTPRequest } from 'webpush-webcrypto';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

function vapidKeys(env) {
  return ApplicationServerKeys.fromJSON({
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  });
}

// Stable KV key derived from the (unguessable) subscription endpoint.
function subKey(sub) {
  return 'sub:' + btoa(sub.endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(-160);
}

async function pushTo(env, keys, sub, payloadObj) {
  const { endpoint, headers, body } = await generatePushHTTPRequest({
    applicationServerKeys: keys,
    payload: JSON.stringify(payloadObj),
    target: sub,
    adminContact: env.ADMIN_CONTACT || 'mailto:ops@example.com',
    ttl: 3600,
    urgency: 'high',
  });
  const res = await fetch(endpoint, { method: 'POST', headers, body });
  return res.status;
}

// Fan a payload out to every stored subscription; prune expired ones.
async function broadcast(env, payloadObj) {
  const keys = await vapidKeys(env);
  const list = await env.SUBSCRIPTIONS.list({ prefix: 'sub:' });
  let sent = 0, removed = 0, failed = 0;
  for (const k of list.keys) {
    const raw = await env.SUBSCRIPTIONS.get(k.name);
    if (!raw) continue;
    const sub = JSON.parse(raw);
    try {
      const status = await pushTo(env, keys, sub, payloadObj);
      if (status === 200 || status === 201) sent++;
      else if (status === 404 || status === 410) { await env.SUBSCRIPTIONS.delete(k.name); removed++; }
      else failed++;
    } catch (e) {
      failed++;
    }
  }
  return { subscriptions: list.keys.length, sent, removed, failed };
}

// Optional shared-secret guard for send endpoints (set API_KEY to enable).
function authorised(env, request) {
  if (!env.API_KEY) return true;
  return request.headers.get('Authorization') === `Bearer ${env.API_KEY}`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    try {
      if (path === '/vapidPublicKey' && request.method === 'GET') {
        return json({ publicKey: env.VAPID_PUBLIC_KEY });
      }

      if (path === '/subscribe' && request.method === 'POST') {
        const sub = await request.json();
        if (!sub || !sub.endpoint) return json({ error: 'invalid subscription' }, 400);
        await env.SUBSCRIPTIONS.put(subKey(sub), JSON.stringify(sub));
        return json({ ok: true });
      }

      if (path === '/subscribe' && request.method === 'DELETE') {
        const sub = await request.json().catch(() => null);
        if (sub && sub.endpoint) await env.SUBSCRIPTIONS.delete(subKey(sub));
        return json({ ok: true });
      }

      if (path === '/test' && request.method === 'POST') {
        if (!authorised(env, request)) return json({ error: 'unauthorized' }, 401);
        const b = await request.json().catch(() => ({}));
        const result = await broadcast(env, {
          title: b.title || '⚠ PIREPlog test',
          body: b.body || 'Push test — if you see this in flight, it works.',
          tag: 'pirep-test',
          url: './',
        });
        return json({ ok: true, ...result });
      }

      if (path === '/alert' && request.method === 'POST') {
        if (!authorised(env, request)) return json({ error: 'unauthorized' }, 401);
        const b = await request.json().catch(() => ({}));
        const result = await broadcast(env, {
          title: b.title || '⚠ SEVERE TURBULENCE',
          body: b.body || 'Severe turbulence reported nearby.',
          tag: 'pirep-alert',
          url: './',
        });
        return json({ ok: true, ...result });
      }

      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500);
    }
  },

  // Optional scheduled test push. Configure a cron in wrangler.toml to fire
  // this near your flight time so you can confirm delivery hands-free.
  async scheduled(event, env) {
    await broadcast(env, {
      title: '⚠ PIREPlog',
      body: 'Scheduled push test',
      tag: 'pirep-sched',
      url: './',
    });
  },
};
