// api/rank.js
// GET /api/rank?type=earners  -> top 20 by balance
// GET /api/rank?type=refs     -> top 20 by referral count
// GET /api/rank?type=unlocks  -> top 20 by total videos unlocked
// GET /api/rank?type=topUnlocks -> same unlock ranking, shaped for the Home
//                                  page's "Top Unlocks" section (earning
//                                  shown instead of a text label)
//
// A simple, honest leaderboard — no purchasable ranks, no pay-to-climb.
//
// Profile photos come from users.photoUrl, which api/bot.js populates via
// Telegram's getUserProfilePhotos + getFile the moment a user sends /start.
// Users who joined before that change (or who have no profile photo set)
// will simply have photoUrl: null — the frontend already falls back to a
// first-letter avatar in that case.

const { getDb } = require('../lib/db');

const LIMIT = 20;

function displayName(u) {
  return (u && (u.firstName || u.username)) || 'User';
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const db = await getDb();
    const type = req.query.type || 'refs';

    if (type === 'earners') {
      const users = await db
        .collection('users')
        .find({ balance: { $gt: 0 } })
        .sort({ balance: -1 })
        .limit(LIMIT)
        .project({ firstName: 1, username: 1, balance: 1, photoUrl: 1 })
        .toArray();
      res.status(200).json({
        entries: users.map((u) => ({
          name: displayName(u),
          photoUrl: u.photoUrl || null,
          valueLabel: `$${(u.balance || 0).toFixed(2)}`,
        })),
      });
      return;
    }

    if (type === 'refs') {
      const users = await db
        .collection('users')
        .find({ referralCount: { $gt: 0 } })
        .sort({ referralCount: -1 })
        .limit(LIMIT)
        .project({ firstName: 1, username: 1, referralCount: 1, photoUrl: 1 })
        .toArray();
      res.status(200).json({
        entries: users.map((u) => ({
          name: displayName(u),
          photoUrl: u.photoUrl || null,
          valueLabel: `${u.referralCount} Refs`,
        })),
      });
      return;
    }

    if (type === 'unlocks' || type === 'topUnlocks') {
      // Count unlocks per user, then join with their profile + balance.
      const agg = await db.collection('unlocks').aggregate([
        { $group: { _id: '$userId', unlockCount: { $sum: 1 } } },
        { $sort: { unlockCount: -1 } },
        { $limit: LIMIT },
      ]).toArray();

      const userIds = agg.map((a) => a._id);
      const users = await db
        .collection('users')
        .find({ telegramId: { $in: userIds } })
        .project({ telegramId: 1, firstName: 1, username: 1, balance: 1, photoUrl: 1 })
        .toArray();
      const userMap = new Map(users.map((u) => [u.telegramId, u]));

      if (type === 'unlocks') {
        res.status(200).json({
          entries: agg.map((a) => {
            const u = userMap.get(a._id);
            return {
              name: displayName(u),
              photoUrl: (u && u.photoUrl) || null,
              valueLabel: `${a.unlockCount} Unlocks`,
            };
          }),
        });
      } else {
        res.status(200).json({
          entries: agg.map((a) => {
            const u = userMap.get(a._id);
            return {
              name: displayName(u),
              photoUrl: (u && u.photoUrl) || null,
              earning: (u && u.balance) || 0,
            };
          }),
        });
      }
      return;
    }

    res.status(400).json({ error: 'Unknown type' });
  } catch (err) {
    console.error('rank.js error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
