// api/earn.js
// GET  /api/earn?initData=...                                    -> wallet + today's per-network ad counts + task list
// POST /api/earn { action:'watchAd', initData, network }         -> credit one ad reward for that network
// POST /api/earn { action:'completeTask', initData, taskId }     -> credit one task reward (once per user)

const { getDb } = require('../lib/db');
const { verifyInitData } = require('../lib/telegram');
const { ObjectId } = require('mongodb');

// Same reward for every ad network, as requested — only the daily quantity
// (limit) differs per network.
const PER_AD_REWARD = 0.05;

const NETWORK_CONFIG = {
  adsgramDaily: { limit: 15 },
  adsgramSpecial: { limit: 5 },
  monetag: { limit: 20 }, // unchanged — this was the original DAILY_AD_LIMIT
  gigapub: { limit: 20 },
};
const NETWORK_IDS = Object.keys(NETWORK_CONFIG);

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

// Makes sure user.networkAds has a { date, count } entry for every known
// network, resetting any entry whose date isn't today. Also migrates the
// old single adsToday/adDate fields (which used to represent Monetag only)
// into networkAds.monetag the first time this runs for a user.
async function ensureDailyReset(db, user) {
  const today = todayKey();
  const networkAds = { ...(user.networkAds || {}) };

  // One-time migration from the old flat fields.
  if (!networkAds.monetag && (user.adsToday !== undefined || user.adDate !== undefined)) {
    networkAds.monetag = { date: user.adDate || today, count: user.adsToday || 0 };
  }

  let changed = false;
  for (const id of NETWORK_IDS) {
    const entry = networkAds[id];
    if (!entry || entry.date !== today) {
      networkAds[id] = { date: today, count: 0 };
      changed = true;
    }
  }

  if (changed || !user.networkAds) {
    await db.collection('users').updateOne(
      { telegramId: user.telegramId },
      { $set: { networkAds } }
    );
  }

  return { ...user, networkAds };
}

module.exports = async (req, res) => {
  try {
    const initData = req.method === 'GET' ? req.query.initData : (req.body || {}).initData;
    const user = verifyInitData(initData);
    if (!user) {
      res.status(401).json({ error: 'Could not verify Telegram user' });
      return;
    }

    const db = await getDb();
    let dbUser = await db.collection('users').findOne({ telegramId: user.id });
    if (!dbUser) {
      res.status(404).json({ error: 'User not found — open /start in the bot first' });
      return;
    }
    dbUser = await ensureDailyReset(db, dbUser);

    if (req.method === 'GET') {
      const tasks = await db.collection('tasks').find({ active: true }).sort({ createdAt: -1 }).toArray();
      const completions = await db
        .collection('task_completions')
        .find({ telegramId: user.id })
        .toArray();
      const completedIds = new Set(completions.map((c) => c.taskId.toString()));

      const networks = {};
      for (const id of NETWORK_IDS) {
        networks[id] = {
          reward: PER_AD_REWARD,
          today: dbUser.networkAds[id].count,
          limit: NETWORK_CONFIG[id].limit,
        };
      }

      res.status(200).json({
        balance: dbUser.balance || 0,
        networks,
        tasks: tasks.map((t) => ({
          id: t._id,
          title: t.title,
          link: t.link,
          reward: t.reward,
          completed: completedIds.has(t._id.toString()),
        })),
      });
      return;
    }

    if (req.method === 'POST') {
      const { action } = req.body || {};

      if (action === 'watchAd') {
        const { network } = req.body || {};
        if (!network || !NETWORK_CONFIG[network]) {
          res.status(400).json({ error: 'Invalid network' });
          return;
        }
        const limit = NETWORK_CONFIG[network].limit;
        const current = dbUser.networkAds[network].count;
        if (current >= limit) {
          res.status(429).json({
            error: 'আজকের অ্যাড দেখার লিমিট শেষ, কাল আবার আসুন',
            today: current,
            limit,
          });
          return;
        }
        await db.collection('users').updateOne(
          { telegramId: user.id },
          {
            $inc: { balance: PER_AD_REWARD, [`networkAds.${network}.count`]: 1 },
          }
        );
        const updated = await db.collection('users').findOne({ telegramId: user.id });
        res.status(200).json({
          success: true,
          balance: updated.balance,
          reward: PER_AD_REWARD,
          today: updated.networkAds[network].count,
          limit,
        });
        return;
      }

      if (action === 'completeTask') {
        const { taskId } = req.body;
        if (!taskId || !ObjectId.isValid(taskId)) {
          res.status(400).json({ error: 'Invalid taskId' });
          return;
        }
        const task = await db.collection('tasks').findOne({ _id: new ObjectId(taskId), active: true });
        if (!task) {
          res.status(404).json({ error: 'Task not found' });
          return;
        }
        const already = await db.collection('task_completions').findOne({
          telegramId: user.id,
          taskId: task._id,
        });
        if (already) {
          res.status(409).json({ error: 'এই টাস্ক আগেই সম্পন্ন করেছেন' });
          return;
        }
        await db.collection('task_completions').insertOne({
          telegramId: user.id,
          taskId: task._id,
          completedAt: new Date(),
        });
        await db.collection('users').updateOne(
          { telegramId: user.id },
          { $inc: { balance: task.reward } }
        );
        const updated = await db.collection('users').findOne({ telegramId: user.id });
        res.status(200).json({ success: true, balance: updated.balance });
        return;
      }

      res.status(400).json({ error: 'Unknown action' });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('earn.js error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
