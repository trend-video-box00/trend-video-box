const User = require('../models/User');
const crypto = require('crypto');

function genReferralCode() {
  return crypto.randomBytes(4).toString('hex');
}

async function getOrCreateUser(ctx) {
  const tgUser = ctx.from;
  let user = await User.findOne({ telegramId: tgUser.id });

  if (!user) {
    // check for referral payload, e.g. /start ref_abc123
    let referredBy = null;
    const payload = ctx.startPayload; // set by telegraf if using ctx.startPayload
    if (payload && payload.startsWith('ref_')) {
      const code = payload.replace('ref_', '');
      const referrer = await User.findOne({ referralCode: code });
      if (referrer && referrer.telegramId !== tgUser.id) {
        referredBy = referrer.telegramId;
      }
    }

    user = await User.create({
      telegramId: tgUser.id,
      username: tgUser.username || '',
      firstName: tgUser.first_name || '',
      referralCode: genReferralCode(),
      referredBy,
      isAdmin: Number(process.env.ADMIN_TELEGRAM_ID) === tgUser.id,
    });

    if (referredBy) {
      await User.updateOne({ telegramId: referredBy }, { $inc: { referralCount: 1 } });
    }
  }

  // Reset daily ad watch counter if it's a new day
  const now = new Date();
  const last = new Date(user.lastAdWatchReset);
  const isNewDay =
    now.getUTCFullYear() !== last.getUTCFullYear() ||
    now.getUTCMonth() !== last.getUTCMonth() ||
    now.getUTCDate() !== last.getUTCDate();

  if (isNewDay) {
    user.adsWatchedToday = 0;
    user.lastAdWatchReset = now;
    await user.save();
  }

  return user;
}

module.exports = { getOrCreateUser, genReferralCode };
