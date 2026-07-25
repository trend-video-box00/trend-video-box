const User = require('../models/User');
const Settings = require('../models/Settings');

// Called when a referred user becomes "active" (e.g. watches their first ad).
// Rewards the referrer with free video-unlock credits — never cash — so the
// system can't be used to pull money out of the pool by pure recruitment.
async function markReferralActive(newUserTelegramId) {
  const newUser = await User.findOne({ telegramId: newUserTelegramId });
  if (!newUser || !newUser.referredBy) return;

  const settings = await Settings.findOne({ key: 'global' });
  const bonus = settings?.referral?.freeVideoUnlockPerReferral ?? 1;

  await User.updateOne(
    { telegramId: newUser.referredBy },
    { $inc: { activeReferralCount: 1, bonusVideoUnlocks: bonus } }
  );
}

function buildInviteLink(botUsername, referralCode) {
  return `https://t.me/${botUsername}?start=ref_${referralCode}`;
}

module.exports = { markReferralActive, buildInviteLink };
