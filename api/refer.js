// api/refer.js
// GET /api/refer?initData=... -> referral count + milestone progress for this user.
// Milestone rewards (free video-unlock credits) are credited automatically
// in api/bot.js the moment a referral count crosses a tier — this endpoint
// only reports status.
const { getDb } = require('../lib/db');
const { verifyInitData } = require('../lib/telegram');

// Every 10 referrals, up to 100, grants 2 free video-unlock credits
// (each credit lets the user skip the 5-ad requirement once — see
// api/unlock.js).
const REFERRAL_MILESTONES = Array.from({ length: 10 }, (_, i) => ({
  count: (i + 1) * 10, // 10, 20, 30, ... 100
  freeVideos: 2,
}));

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const user = verifyInitData(req.query.initData);
    if (!user) {
      res.status(401).json({ error: 'Could not verify Telegram user' });
      return;
    }
    const db = await getDb();
    const dbUser = await db.collection('users').findOne({ telegramId: user.id });
    if (!dbUser) {
      res.status(404).json({ error: 'User not found — open /start in the bot first' });
      return;
    }
    const claims = await db.collection('referral_claims').find({ telegramId: user.id }).toArray();
    const claimedTiers = new Set(claims.map((c) => c.tier));
    const referralCount = dbUser.referralCount || 0;
    const freeUnlockCredits = dbUser.freeUnlockCredits || 0;

    const milestones = REFERRAL_MILESTONES.map((m) => ({
      count: m.count,
      freeVideos: m.freeVideos,
      rewardLabel: `+${m.freeVideos} Videos Free`,
      achieved: referralCount >= m.count,
      claimed: claimedTiers.has(m.count),
    }));

    // Next milestone the user hasn't reached yet (useful for progress UI)
    const nextMilestone = milestones.find((m) => !m.achieved) || null;

    res.status(200).json({
      referralCount,
      balance: dbUser.balance || 0,
      freeUnlockCredits,
      hasFreeCredits: freeUnlockCredits > 0,  // frontend uses this for green/gray box
      nextMilestone,
      milestones,
    });
  } catch (err) {
    console.error('refer.js error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
