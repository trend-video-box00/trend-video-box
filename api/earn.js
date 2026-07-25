// api/earn.js
// GET  /api/earn?initData=...                -> wallet + today's ad count + task list
// POST /api/earn { action:'watchAd', initData }                       -> credit one ad reward
// POST /api/earn { action:'completeTask', initData, taskId }          -> credit one task reward (once per user)

const { getDb } = require('../lib/db');
const { verifyInitData } = require('../lib/telegram');
const { ObjectId } = require('mongodb');

const PER_AD_REWARD = 0.05;
const DAILY_AD_LIMIT = 20;

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

async function ensureDailyReset(db, user) {
  const today = todayKey();
  if (user.adDate !== today) {
    await db.collection('users').updateOne(
      { telegramId: user.telegramId },
      { $set: { adDate: today, adsToday: 0 } }
    );
    return { ...user, adDate: today, adsToday: 0 };
  }
  return user;
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

      res.status(200).json({
        balance: dbUser.balance || 0,
        adsToday: dbUser.adsToday || 0,
        adsLimit: DAILY_AD_LIMIT,
        perAd: PER_AD_REWARD,
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
        if ((dbUser.adsToday || 0) >= DAILY_AD_LIMIT) {
          res.status(429).json({ error: 'আজকের অ্যাড দেখার লিমিট শেষ, কাল আবার আসুন', adsToday: dbUser.adsToday, adsLimit: DAILY_AD_LIMIT });
          return;
        }
        await db.collection('users').updateOne(
          { telegramId: user.id },
          { $inc: { balance: PER_AD_REWARD, adsToday: 1 } }
        );
        const updated = await db.collection('users').findOne({ telegramId: user.id });
        res.status(200).json({
          success: true,
          balance: updated.balance,
          adsToday: updated.adsToday,
          adsLimit: DAILY_AD_LIMIT,
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
