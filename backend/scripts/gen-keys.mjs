// Generate a VAPID key pair in the exact format this Worker expects.
//   node scripts/gen-keys.mjs
// Put PUBLIC in wrangler.toml (VAPID_PUBLIC_KEY) AND in the PWA
// (PUSH_PUBLIC_KEY in index.html). Set PRIVATE as a secret:
//   wrangler secret put VAPID_PRIVATE_KEY
import { ApplicationServerKeys, setWebCrypto } from 'webpush-webcrypto';
import { webcrypto } from 'node:crypto';

setWebCrypto(webcrypto);

const keys = await (await ApplicationServerKeys.generate()).toJSON();
console.log('VAPID_PUBLIC_KEY  =', keys.publicKey);
console.log('VAPID_PRIVATE_KEY =', keys.privateKey);
console.log('\nPUBLIC  → wrangler.toml [vars] + index.html PUSH_PUBLIC_KEY');
console.log('PRIVATE → wrangler secret put VAPID_PRIVATE_KEY  (never commit)');
