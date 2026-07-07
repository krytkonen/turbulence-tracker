# PIREPlog push backend (Cloudflare Worker)

**Phase 1: Web Push only.** Lets the PWA subscribe devices and lets you send
severe-turbulence / test push notifications. Push is delivered over the
platform push service (Apple / Google), so it works in flight **even where the
wifi allowlist blocks the data domain**.

> Data sync (`/events` + D1) is intentionally not here yet — it depends on the
> in-flight wifi allowlist and is a later phase.

Push encryption is **RFC 8291 `aes128gcm`** (required by Apple; the legacy
`aesgcm` scheme is rejected), implemented in [`src/push.js`](src/push.js) with
pure Web Crypto — **no runtime dependencies** (only `wrangler` for deploy).

## Endpoints

| Method | Path              | Purpose                                   |
|--------|-------------------|-------------------------------------------|
| POST   | `/subscribe`      | Register a device push subscription       |
| DELETE | `/subscribe`      | Remove a subscription                     |
| POST   | `/test`           | Send a test notification to all devices   |
| POST   | `/alert`          | Send a severe-turbulence alert to all     |
| GET    | `/vapidPublicKey` | Return the VAPID public key               |

`/test` and `/alert` can be guarded with a shared `API_KEY` (see below).

## Deploy

```bash
cd backend
npm install
npx wrangler login
```

1. **Generate your own VAPID keys** (the key committed here is a throwaway test
   key — its private half appeared in a chat log, so replace it before real use):

   ```bash
   npm run keys
   ```

   - Put `VAPID_PUBLIC_KEY` in **`wrangler.toml`** *and* in the PWA
     (`PUSH_PUBLIC_KEY` near the top of `../index.html`). They must match.
   - Store the private key as a secret (next step). **Never commit it.**

2. **KV namespace** — already created (`pireplog-subscriptions`) and its id is
   filled into `wrangler.toml`. If you deploy to a different account, recreate
   it and update the id:

   ```bash
   npx wrangler kv namespace create SUBSCRIPTIONS
   ```

3. **Set secrets** (not in any file):

   ```bash
   npx wrangler secret put VAPID_PRIVATE_KEY   # paste the private key
   npx wrangler secret put API_KEY             # optional: guards /test and /alert
   ```

4. Set `ADMIN_CONTACT` in `wrangler.toml` to your own `mailto:`.

5. **Deploy:**

   ```bash
   npm run deploy
   ```

   Note the deployed URL, e.g. `https://pireplog-push.<you>.workers.dev`.

## Use from the PWA

1. Install PIREPlog to the iPad Home Screen (Web Push on iOS requires the
   installed PWA, opened from the Home Screen — not a Safari tab).
2. Open it, tap the 🔔 button, paste the Worker URL, tap **Enable alerts**,
   grant notifications.
3. Tap **Send test** — or trigger from anywhere:

   ```bash
   curl -X POST https://pireplog-push.<you>.workers.dev/test \
     -H 'Content-Type: application/json' -d '{}'
   # with API_KEY:  -H 'Authorization: Bearer <API_KEY>'
   ```

### Testing delivery in flight

The **send** happens server-side (Worker → Apple), so you can trigger a push
from any internet-connected device on the ground while the iPad is in flight —
if the notification arrives, in-flight push works. For a hands-free test,
uncomment the `[triggers] crons` line in `wrangler.toml` and set it to a time
during your flight (UTC); the Worker's `scheduled()` handler will fire a test.

## Security notes

- Secrets (`VAPID_PRIVATE_KEY`, `API_KEY`) live only in Cloudflare via
  `wrangler secret put` — never in `wrangler.toml`, code, or git.
  `.gitignore` excludes `.dev.vars` and local state.
- The VAPID **public** key is safe to commit and to ship in the PWA.
- Before adding data sync, writes must be authenticated (operator key) so nobody
  can inject false turbulence reports; treat shared data as advisory/unverified.
