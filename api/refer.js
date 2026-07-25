// api/refer.js
// GET /api/refer?initData=... -> referral count + milestone progress for this user.
// Milestone bonuses are credited automatically in api/bot.js the moment a
// referral count crosses a tier — this endpoint only reports status.

const { getDb } = require('../lib/db');
const { verifyInitData } = require('../lib/telegram');

const REFERRAL_MILESTONES = [
  { count: 5, bonus: 0.5 },
  { count: 10, bonus: 1 },
  { count: 25, bonus: 3 },
  { count: 50, bonus: 7 },
  { count: 100, bonus: 15 },
];

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

    const milestones = REFERRAL_MILESTONES.map((m) => ({
      count: m.count,
      bonus: m.bonus,
      achieved: referralCount >= m.count,
      claimed: claimedTiers.has(m.count),
    }));

    res.status(200).json({
      referralCount,
      balance: dbUser.balance || 0,
      milestones,
    });
  } catch (err) {
    console.error('refer.js error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
