// api/delete-scheduled.js
// NOT a Vercel Cron Job (Hobby plan only allows once-per-day crons, which is
// useless for a 5-minute delete). Instead, this is a plain HTTP endpoint —
// Vercel does not restrict incoming requests to your own routes, only its
// own built-in cron scheduler. So a FREE external scheduler is used to hit
// this URL once every minute:
//
//   1. Go to https://cron-job.org (free) and create an account.
//   2. Set env var DELETE_CRON_SECRET in your Vercel project
//      (Settings -> Environment Variables) to any random long string.
//   3. In cron-job.org, create a new cron job:
//        URL: https://YOUR_DOMAIN.vercel.app/api/delete-scheduled
//        Schedule: every 1 minute
//        Add a custom header: Authorization: Bearer YOUR_DELETE_CRON_SECRET
//   4. Redeploy so the env var takes effect.
//
// This endpoint finds every scheduled deletion whose time has passed and
// asks Telegram to delete that message.
const { getDb } = require('../lib/db');
const { deleteMessage } = require('../lib/telegram');

module.exports = async (req, res) => {
  // Simple shared-secret check so randoms can't hammer this endpoint.
  const expected = process.env.DELETE_CRON_SECRET;
  if (expected) {
    const authHeader = req.headers['authorization'] || '';
    if (authHeader !== `Bearer ${expected}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  try {
    const db = await getDb();
    const now = new Date();
    const due = await db
      .collection('scheduledDeletions')
      .find({ done: false, deleteAt: { $lte: now } })
      .toArray();

    let deletedCount = 0;
    for (const item of due) {
      try {
        await deleteMessage(item.chatId, item.messageId);
        deletedCount += 1;
      } catch (e) {
        console.error('delete-scheduled: failed to delete message', item, e);
      }
      // Mark done regardless of Telegram's response (e.g. "message not
      // found" if the user already deleted it themselves) so we don't keep
      // retrying it forever.
      await db.collection('scheduledDeletions').updateOne(
        { _id: item._id },
        { $set: { done: true, deletedAt: new Date() } }
      );
    }

    res.status(200).json({ success: true, checked: due.length, deleted: deletedCount });
  } catch (err) {
    console.error('delete-scheduled.js error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
