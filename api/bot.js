// api/bot.js
// Vercel serverless function: POST target for the Telegram webhook.
// Set the webhook once (see README) to point here.
const { getDb } = require('../lib/db');
const { sendMessage, getUserPhotoUrl } = require('../lib/telegram');

const APP_URL = process.env.APP_URL; // e.g. https://your-project.vercel.app
const ADMIN_ID = String(process.env.ADMIN_TELEGRAM_ID || '');

// Referral milestone rewards. Rewards the REFERRER for their own effort
// (getting people to join) — never depends on what the referred user does
// afterwards. Each tier is credited once per referrer, the moment their
// referralCount reaches it.
// Every 10 referrals, up to 100, grants 2 free video-unlock credits
// (each credit skips the 5-ad requirement once — see api/unlock.js).
const REFERRAL_MILESTONES = Array.from({ length: 10 }, (_, i) => ({
  count: (i + 1) * 10, // 10, 20, 30, ... 100
  freeVideos: 2,
}));

const WELCOME_TEXT =
  '<b>স্বাগতম Trending Hub এ</b> 🎬\n\n' +
  'ভিডিও দেখুন, অ্যাড দেখে আর ফ্রেন্ড রেফার করে আয় করুন। নিচের বাটনে ক্লিক করুন 👇';

async function creditReferralMilestones(db, referrerTelegramId) {
  const referrer = await db.collection('users').findOne({ telegramId: referrerTelegramId });
  if (!referrer) return;
  const count = referrer.referralCount || 0;

  for (const tier of REFERRAL_MILESTONES) {
    if (count < tier.count) continue;
    const already = await db.collection('referral_claims').findOne({
      telegramId: referrerTelegramId,
      tier: tier.count,
    });
    if (already) continue;

    await db.collection('users').updateOne(
      { telegramId: referrerTelegramId },
      { $inc: { freeUnlockCredits: tier.freeVideos } }
    );
    await db.collection('referral_claims').insertOne({
      telegramId: referrerTelegramId,
      tier: tier.count,
      freeVideos: tier.freeVideos,
      claimedAt: new Date(),
    });
    await sendMessage(
      referrerTelegramId,
      `🎉 অভিনন্দন! আপনি <b>${tier.count} জন</b> রেফার করেছেন — আপনার একাউন্টে <b>+${tier.freeVideos} Videos Free</b> credit যোগ হয়েছে। এখন যেকোনো ভিডিও অ্যাড না দেখেই আনলক করতে পারবেন।`
    );
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(200).send('Trending Hub bot webhook is alive.');
    return;
  }
  try {
    const update = req.body;

    // --- Handle admin uploading a video file directly to the bot ---
    if (update.message && update.message.video) {
      const fromId = String(update.message.from.id);
      if (fromId === ADMIN_ID) {
        const db = await getDb();
        const fileId = update.message.video.file_id;
        const draft = await db.collection('pending_uploads').insertOne({
          fileId,
          telegramMessageId: update.message.message_id,
          createdAt: new Date(),
        });
        await sendMessage(
          update.message.chat.id,
          `ভিডিও পাওয়া গেছে ✅\n\nএই ভিডিওটার জন্য টাইটেল ও থাম্বনেইল সেট করতে admin panel এ যান।\n\nUpload ID: <code>${draft.insertedId}</code>`
        );
      }
      res.status(200).send('ok');
      return;
    }

    // --- Handle /start and /admin ---
    if (update.message && update.message.text) {
      const text = update.message.text.trim();
      const chatId = update.message.chat.id;
      const userId = update.message.from.id;

      if (text.startsWith('/start')) {
        const db = await getDb();
        const parts = text.split(' ');
        const payload = parts[1] || '';

        const existing = await db.collection('users').findOne({ telegramId: userId });

        await db.collection('users').updateOne(
          { telegramId: userId },
          {
            $set: {
              telegramId: userId,
              username: update.message.from.username || null,
              firstName: update.message.from.first_name || null,
              lastSeenAt: new Date(),
            },
            $setOnInsert: {
              createdAt: new Date(),
              balance: 0,
              referralCount: 0,
              referredBy: null,
              freeUnlockCredits: 0,
            },
          },
          { upsert: true }
        );

        // Fetch and store their current Telegram profile photo (if any) so
        // the Rank page leaderboard can show real avatars instead of just
        // initials. This only works because the user just sent /start —
        // Telegram only lets a bot read profile photos of users who have
        // interacted with it.
        const photoUrl = await getUserPhotoUrl(userId);
        if (photoUrl) {
          await db.collection('users').updateOne(
            { telegramId: userId },
            { $set: { photoUrl } }
          );
        }

        // First-time visit via a referral link: ?start=ref_<telegramId>
        if (!existing && payload.startsWith('ref_')) {
          const referrerId = Number(payload.slice(4));
          if (referrerId && referrerId !== userId) {
            const referrer = await db.collection('users').findOne({ telegramId: referrerId });
            if (referrer) {
              await db.collection('users').updateOne(
                { telegramId: userId },
                { $set: { referredBy: referrerId } }
              );
              await db.collection('users').updateOne(
                { telegramId: referrerId },
                { $inc: { referralCount: 1 } }
              );
              await creditReferralMilestones(db, referrerId);
            }
          }
        }

        await sendMessage(chatId, WELCOME_TEXT, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Open Trending Hub', web_app: { url: APP_URL } }],
            ],
          },
        });
      }

      // --- /admin: only opens for ADMIN_ID, everyone else gets no response ---
      if (text.startsWith('/admin')) {
        if (String(userId) === ADMIN_ID) {
          await sendMessage(chatId, 'Admin panel 👇', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '⚙️ Open Admin Panel', web_app: { url: `${APP_URL}/admin.html` } }],
              ],
            },
          });
        }
        // Silently ignore for non-admins — don't reveal that /admin exists.
      }

      res.status(200).send('ok');
      return;
    }
    res.status(200).send('ok');
  } catch (err) {
    console.error('bot.js error:', err);
    res.status(200).send('ok'); // Always 200 so Telegram doesn't retry-storm us
  }
};
