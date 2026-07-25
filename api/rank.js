// api/rank.js
// GET /api/rank -> top 20 users by referral count (a simple, honest leaderboard;
// no purchasable ranks, no pay-to-climb).

const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const db = await getDb();
    const users = await db
      .collection('users')
      .find({ referralCount: { $gt: 0 } })
      .sort({ referralCount: -1 })
      .limit(20)
      .project({ firstName: 1, username: 1, referralCount: 1 })
      .toArray();

    res.status(200).json({
      leaderboard: users.map((u) => ({
        name: u.firstName || u.username || 'User',
        referralCount: u.referralCount,
      })),
    });
  } catch (err) {
    console.error('rank.js error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
