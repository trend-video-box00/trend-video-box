# Trending Hub — Telegram Mini App

Video content + reward-ad earning + referral bonuses + admin panel, built for Vercel's free plan. Videos are stored via Telegram's own file storage (`file_id`) — this project never hosts video files itself.

## ⚠️ Step 0 — Rotate your credentials NOW

You pasted your real bot token and MongoDB password in plaintext chat messages **more than once**. Anyone who can see this conversation can see them. Before you deploy anything:

1. **BotFather** → `/mybots` → your bot → **API Token** → **Revoke current token** → get a new one.
2. **MongoDB Atlas** → Database Access → your user → **Edit** → set a new password.
3. Use only the *new* token/password below — never paste live secrets into a chat again; put them straight into Vercel's environment variables instead.

## What's in this build

- **Home** — total balance, quick links to Tasks/Videos/Refer/Withdraw, a one-time welcome popup (with a haptic buzz) that's honest about what the app does and the actual minimum withdrawal.
- **Videos** — your existing ad-gated video unlock flow, unchanged.
- **Earn** — watch a reward ad for $0.05, capped at 20/day (shown transparently on-screen, not hidden), plus admin-defined "visit this link, earn $X" tasks.
- **Refer** — a referral link; **milestone bonuses that reward only the referrer's own invites** (5 refers = $0.50, 10 = $1, 25 = $3, 50 = $7, 100 = $15). Bonuses never depend on what the referred person does afterward — that keeps it from turning into a chain where people are pressured into recruiting or grinding on someone else's behalf.
- **Rank** — a simple top-referrers leaderboard.
- **Withdraw** — minimum $2, via bKash/Nagad/Rocket. This app never auto-sends money: a request is logged, and you pay it manually and mark it "paid" from the admin panel. Do not accept withdrawal requests you don't intend to honor.
- **Admin panel** — publish videos, broadcast messages (text + optional image + an automatic "Open Trending Hub" button), add/remove tasks, and view/mark-paid withdrawal requests. All actions require Telegram's `initData` to verify you're really the admin.

## Step 1 — Create a GitHub repo
Push this whole folder to a new GitHub repository.

## Step 2 — Deploy on Vercel
1. Vercel → New Project → import this GitHub repo.
2. Project → Settings → Environment Variables — add every variable from `.env.example` (with your **new**, rotated token/password):
   - `BOT_TOKEN` — your new bot token
   - `BOT_USERNAME` — your bot's `@username` without the `@`
   - `ADMIN_TELEGRAM_ID` — your numeric Telegram user id
   - `APP_URL` — fill in after your first deploy (e.g. `https://trending-hub.vercel.app`)
   - `MONGODB_URI` — your connection string with the new password
   - `MONGODB_DB` — `trendinghub`
3. Deploy. Then set `APP_URL` to your real deployed URL and redeploy.

## Step 3 — Set the Telegram webhook
Visit once in a browser:
```
https://api.telegram.org/bot<YOUR_NEW_TOKEN>/setWebhook?url=https://trending-hub.vercel.app/api/bot
```

## Step 4 — Menu button
`/mybots` → your bot → **Bot Settings** → **Menu Button** → set it to your `APP_URL`.

## Step 5 — Configure the reward ad SDK
`public/watch.js` and `public/earn.js` already point at the same ad SDK config (`pubId`/`appId`) that was in your original project. If you switch providers, update both files together.

## Step 6 — Upload content
Same as before: send a video directly to the bot from your admin account, then open `APP_URL/admin.html` (via a `/admin` command or menu button) to attach a title + thumbnail and publish it.

## File structure
```
/api
  bot.js       -> webhook: /start (+ referral capture), /admin, admin video uploads
  videos.js    -> GET published video list
  unlock.js    -> POST ad-completed -> sends video, applies 24h lock
  earn.js      -> GET wallet/tasks state; POST watchAd / completeTask
  refer.js     -> GET referral count + milestone progress
  rank.js      -> GET top-referrers leaderboard
  withdraw.js  -> POST withdraw request (admin pays manually)
  admin.js     -> all admin-only actions (protected by initData + ADMIN_TELEGRAM_ID)
/public
  index.html / app.js        -> Home dashboard
  videos.html / videos.js    -> video grid (ad-gated unlock)
  watch.html / watch.js      -> ad-gate + unlock flow for videos
  earn.html / earn.js        -> watch-ad-and-earn + tasks
  refer.html / refer.js      -> referral link + milestones
  rank.html / rank.js        -> leaderboard
  admin.html / admin.js      -> admin panel
  style.css
/lib
  db.js         -> MongoDB connection
  telegram.js   -> Telegram API helpers + initData verification
```

## Honest-by-design choices worth keeping
- The daily ad count is always shown on-screen (`X/20`), never hidden from the user.
- Withdrawals are never auto-paid by code — you review and pay each one, so payouts stay real.
- Referral bonuses are milestone-based on the referrer's own invites only, not gated behind a referred user's activity.
