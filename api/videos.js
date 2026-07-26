// api/videos.js
// GET /api/videos                -> list of published videos (title + thumbnail only;
//                                    never exposes the Telegram file_id to the frontend).
// GET /api/videos?userId=123     -> list, also including each video's lock status for that user.
// GET /api/videos?id=abc         -> single video by id (used by the watch page).
// GET /api/videos?id=abc&userId=123 -> single video by id, including that user's lock status.
const { getDb } = require('../lib/db');
const { ObjectId } = require('mongodb');
const LOCK_HOURS = 24;

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const db = await getDb();
    const { id } = req.query;
    const userId = req.query.userId ? Number(req.query.userId) : null;

    // ---- Single-video mode: /api/videos?id=xxx ----
    // This is what the watch page (public/watch.js) calls. It was previously
    // missing entirely, so `id` was silently ignored and the list branch ran
    // instead — which never returns `data.video`, causing the watch page to
    // always show "video not found".
    if (id) {
      let objectId;
      try {
        objectId = new ObjectId(String(id));
      } catch (e) {
        res.status(404).json({ error: 'Video not found' });
        return;
      }

      const v = await db.collection('videos').findOne({ _id: objectId });
      if (!v) {
        res.status(404).json({ error: 'Video not found' });
        return;
      }

      let lockedUntil = null;
      if (userId) {
        const unlock = await db
          .collection('unlocks')
          .findOne({ userId, videoId: v._id.toString() });
        if (unlock) {
          const unlockedAt = new Date(unlock.unlockedAt).getTime();
          const until = unlockedAt + LOCK_HOURS * 60 * 60 * 1000;
          lockedUntil = until > Date.now() ? until : null;
        }
      }

      res.status(200).json({
        video: {
          id: v._id,
          title: v.title,
          thumbnailUrl: v.thumbnailUrl,
          lockedUntil,
        },
      });
      return;
    }

    // ---- List mode: /api/videos or /api/videos?userId=123 ----
    const videos = await db
      .collection('videos')
      .find({ published: true })
      .sort({ createdAt: -1 })
      .project({ title: 1, thumbnailUrl: 1, createdAt: 1 })
      .toArray();

    let unlockMap = {};
    if (userId) {
      const unlocks = await db
        .collection('unlocks')
        .find({ userId })
        .toArray();
      const now = Date.now();
      for (const u of unlocks) {
        const unlockedAt = new Date(u.unlockedAt).getTime();
        const lockedUntil = unlockedAt + LOCK_HOURS * 60 * 60 * 1000;
        unlockMap[u.videoId] = lockedUntil > now ? lockedUntil : null;
      }
    }

    const result = videos.map((v) => ({
      id: v._id,
      title: v.title,
      thumbnailUrl: v.thumbnailUrl,
      lockedUntil: unlockMap[v._id.toString()] || null,
    }));

    res.status(200).json({ videos: result });
  } catch (err) {
    console.error('videos.js error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
