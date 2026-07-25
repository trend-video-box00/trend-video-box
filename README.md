# ViralVideoHub Bot

Telegram video-unlock reward bot with an admin panel. Users watch rewarded ads to
unlock videos and earn a small balance; admin manages content, ads, and withdrawals.

## ⚠️ First: rotate your credentials

You pasted a live bot token and DB password earlier in chat — **revoke/rotate both
before deploying**:
- Telegram: message @BotFather → `/revoke` on your bot, get a new token
- MongoDB Atlas → Database Access → edit the user → set a new password

Never commit the real `.env` file — `.gitignore` already excludes it.

## Local setup

```bash
npm install
cp .env.example .env
# fill in .env with your (new) BOT_TOKEN, MONGO_URI, ADMIN_TELEGRAM_ID, etc.
npm start
```

This runs in long-polling mode locally — good for testing.

## Deploy to Vercel (webhook mode)

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. In Vercel → Settings → Environment Variables, add everything from `.env.example`
   (with your real values), plus set `WEBAPP_URL` to your Vercel deployment URL
   (e.g. `https://your-app.vercel.app`).
4. Deploy.
5. Locally, run `node scripts/setWebhook.js` (with the same `.env` values) to point
   Telegram at `https://your-app.vercel.app/api/webhook`.

> Note: there is no `vercel.json` in this project — it was removed because the
> old `builds`/`routes` config conflicts with Vercel's current build system
> (you may have seen a "Due to `builds` existing..." warning). Vercel's default
> convention already exposes `api/webhook.js` at `/api/webhook` automatically,
> so no routing config is needed. If you visit the bare root URL
> (`https://your-app.vercel.app`) you'll see a 404 — that's expected, since no
> page is defined there. Check `/api/webhook` instead (GET shows "Bot webhook
> is running." as a health check).

## How the reward economics work (and why)

- `PER_AD_REWARD_USD` / `ADS_PER_VIDEO_UNLOCK` / `DAILY_AD_WATCH_LIMIT` /
  `MIN_WITHDRAW_USD` are all admin-editable at runtime via bot commands
  (`/setrate`, `/setlimit`, `/setminwithdraw`) — no redeploy needed.
- **Minimum withdrawal is set relative to what a user can actually earn** — the
  default ($2 at $0.05/ad, 20 ads/day = $1/day max) means it's reachable in a
  couple of days, not hundreds of ads. Please keep it realistic when you tune it;
  a threshold users structurally can't reach is what turns a rewarded-ads bot
  into a deceptive one.
- **Referral rewards are free video-unlock credits, not cash** (`bonusVideoUnlocks`
  on the user model, spent via `useBonusUnlock`). This was a deliberate change from
  the original screenshots you shared — a per-referral cash bonus paid out of the
  same balance pool that new recruits also draw from is a pyramid structure
  regardless of intent, so I didn't build that part. If you want to revisit this,
  happy to talk through it, but I'd want to understand the payout math first.
- Withdrawals deduct balance immediately on request and refund automatically if
  an admin rejects them — so a user's visible balance is always accurate, not
  silently frozen.

## Admin commands

- `/admin` — opens the panel (dashboard, withdrawals, add/manage videos, ad units,
  broadcast, direct message, reward settings)
- `/toggle <uploadId>` — enable/disable a video
- `/addadunit <blockId>` / `/removeadunit <blockId>` — manage Adsgram block IDs
- `/setrate`, `/setlimit`, `/setminwithdraw` — tune reward economics

## Project structure

```
bot.js              # user-facing flows (home, tasks, videos, refer, rank, profile, withdraw, settings)
admin/admin.js       # admin panel, video upload flow, withdrawal approval, broadcast
handlers/earn.js      # ad-watching + per-video unlock logic
handlers/refer.js     # referral tracking (non-cash rewards)
handlers/withdraw.js  # withdrawal request/approve/reject
handlers/userHelper.js# get-or-create user, daily reset
models/               # Mongoose schemas
locales/              # en / bn / ur UI strings
api/webhook.js        # Vercel serverless entrypoint
scripts/setWebhook.js # one-time webhook registration
```

## What's still on you to add/test

- Adsgram SDK integration itself — this bot tracks *that an ad was watched* via
  the `watch_general_ad` / `unlock_<videoId>` button callbacks, but you'll need
  to wire the actual Adsgram rewarded-ad show/callback into those handlers (or
  into a Telegram Mini App front-end that calls back to this bot) so the reward
  is only granted after Adsgram confirms a genuine completed view, not just a
  button tap.
- The "same design" Mini App screens (colors/layout from your screenshots) —
  this repo currently implements the flow as native Telegram bot messages/buttons.
  If you want the exact visual Mini App (HTML/CSS pages), that's a separate
  front-end (React or plain HTML) hosted alongside this and opened via Telegram's
  Web App button — let me know if you want that built next.
