// api/admin.js
// All actions require initData that (a) passes Telegram's HMAC check and
// (b) belongs to ADMIN_TELEGRAM_ID. Nobody else can call this successfully.
//
// Video:
//   POST { action: 'pendingUploads', initData }
//   POST { action: 'publishVideo', initData, pendingUploadId, title, thumbnailUrl }
//   POST { action: 'listVideos', initData }
//   POST { action: 'deleteVideo', initData, videoId }
// Broadcast:
//   POST { action: 'broadcast', initData, text, imageUrl? }
// Tasks:
//   POST { action: 'listTasks', initData }
//   POST { action: 'createTask', initData, title, link, reward }
//   POST { action: 'deleteTask', initData, taskId }
// Withdrawals:
//   POST { action: 'listWithdrawals', initData }
//   POST { action: 'markWithdrawalPaid', initData, withdrawId }

const { getDb } = require('../lib/db');
const { verifyInitData, sendMessage, sendPhoto } = require('../lib/telegram');
const { ObjectId } = require('mongodb');

const ADMIN_ID = Number(process.env.ADMIN_TELEGRAM_ID || 0);
const BOT_USERNAME = process.env.BOT_USERNAME || '';

function requireAdmin(initData) {
  const user = verifyInitData(initData);
  if (!user || user.id !== ADMIN_ID) return null;
  return user;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { action, initData } = req.body || {};
    const admin = requireAdmin(initData);
    if (!admin) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }
    const db = await getDb();

    // --- Video ---
    if (action === 'pendingUploads') {
      const pending = await db
        .collection('pending_uploads')
        .find({ published: { $ne: true } })
        .sort({ createdAt: -1 })
        .toArray();
      res.status(200).json({ pending });
      return;
    }

    if (action === 'publishVideo') {
      const { pendingUploadId, title, thumbnailUrl } = req.body;
      if (!pendingUploadId || !ObjectId.isValid(pendingUploadId) || !title || !thumbnailUrl) {
        res.status(400).json({ error: 'Missing fields' });
        return;
      }
      const pending = await db.collection('pending_uploads').findOne({ _id: new ObjectId(pendingUploadId) });
      if (!pending) {
        res.status(404).json({ error: 'Pending upload not found' });
        return;
      }
      await db.collection('videos').insertOne({
        title,
        thumbnailUrl,
        telegramFileId: pending.fileId,
        published: true,
        createdAt: new Date(),
      });
      await db.collection('pending_uploads').updateOne({ _id: pending._id }, { $set: { published: true } });
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'listVideos') {
      const videos = await db.collection('videos').find({}).sort({ createdAt: -1 }).toArray();
      res.status(200).json({ videos });
      return;
    }

    if (action === 'deleteVideo') {
      const { videoId } = req.body;
      if (!videoId || !ObjectId.isValid(videoId)) {
        res.status(400).json({ error: 'Invalid videoId' });
        return;
      }
      const result = await db.collection('videos').deleteOne({ _id: new ObjectId(videoId) });
      if (result.deletedCount === 0) {
        res.status(404).json({ error: 'Video not found' });
        return;
      }
      await db.collection('unlocks').deleteMany({ videoId: videoId });
      res.status(200).json({ success: true });
      return;
    }

    // --- Broadcast (text + optional image, always includes an
    // "Open Trending Hub" button pointing at the bot so recipients have a
    // one-tap way back in) ---
    if (action === 'broadcast') {
      const { text, imageUrl } = req.body;
      if (!text) {
        res.status(400).json({ error: 'text is required' });
        return;
      }
      const users = await db.collection('users').find({}).project({ telegramId: 1 }).toArray();
      const replyMarkup = BOT_USERNAME
        ? { inline_keyboard: [[{ text: '🚀 Open Trending Hub', url: `https://t.me/${BOT_USERNAME}` }]] }
        : undefined;

      let sent = 0;
      let failed = 0;
      for (const u of users) {
        try {
          if (imageUrl) {
            await sendPhoto(u.telegramId, imageUrl, text, replyMarkup ? { reply_markup: replyMarkup } : {});
          } else {
            await sendMessage(u.telegramId, text, replyMarkup ? { reply_markup: replyMarkup } : {});
          }
          sent++;
        } catch {
          failed++;
        }
      }
      res.status(200).json({ success: true, sent, failed, total: users.length });
      return;
    }

    // --- Tasks (admin-defined "visit this link, earn this amount") ---
    if (action === 'listTasks') {
      const tasks = await db.collection('tasks').find({}).sort({ createdAt: -1 }).toArray();
      res.status(200).json({ tasks });
      return;
    }

    if (action === 'createTask') {
      const { title, link, reward } = req.body;
      const rewardNum = Number(reward);
      if (!title || !link || !rewardNum || rewardNum <= 0) {
        res.status(400).json({ error: 'title, link, ও একটা valid reward দিন' });
        return;
      }
      await db.collection('tasks').insertOne({
        title,
        link,
        reward: rewardNum,
        active: true,
        createdAt: new Date(),
      });
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'deleteTask') {
      const { taskId } = req.body;
      if (!taskId || !ObjectId.isValid(taskId)) {
        res.status(400).json({ error: 'Invalid taskId' });
        return;
      }
      await db.collection('tasks').deleteOne({ _id: new ObjectId(taskId) });
      res.status(200).json({ success: true });
      return;
    }

    // --- Withdrawals: this app never auto-pays. The admin pays manually
    // (bKash/Nagad/Rocket etc.) and then marks the request as paid here. ---
    if (action === 'listWithdrawals') {
      const withdrawals = await db
        .collection('withdraw_requests')
        .find({})
        .sort({ createdAt: -1 })
        .toArray();
      res.status(200).json({ withdrawals });
      return;
    }

    if (action === 'markWithdrawalPaid') {
      const { withdrawId } = req.body;
      if (!withdrawId || !ObjectId.isValid(withdrawId)) {
        res.status(400).json({ error: 'Invalid withdrawId' });
        return;
      }
      await db.collection('withdraw_requests').updateOne(
        { _id: new ObjectId(withdrawId) },
        { $set: { status: 'paid', paidAt: new Date() } }
      );
      res.status(200).json({ success: true });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('admin.js error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
