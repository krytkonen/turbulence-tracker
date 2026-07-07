// Generate a VAPID key pair for this Worker (pure Web Crypto, no deps).
//   npm run keys
// Put PUBLIC in wrangler.toml (VAPID_PUBLIC_KEY) AND in the PWA
// (PUSH_PUBLIC_KEY in index.html) — they must match. Set PRIVATE as a secret:
//   wrangler secret put VAPID_PRIVATE_KEY   (never commit it)
import { generateVapidKeys } from '../src/push.js';

const keys = await generateVapidKeys();
console.log('VAPID_PUBLIC_KEY  =', keys.publicKey);
console.log('VAPID_PRIVATE_KEY =', keys.privateKey);
console.log('\nPUBLIC  → wrangler.toml [vars] + index.html PUSH_PUBLIC_KEY');
console.log('PRIVATE → wrangler secret put VAPID_PRIVATE_KEY  (never commit)');
