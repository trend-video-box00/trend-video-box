// api/unlock.js
// POST /api/unlock  { videoId, initData, useFreeCredit }
// Called by the frontend ONLY after the ad SDK reports the ad was actually
// watched/completed (see public/watch.html) — UNLESS useFreeCredit is true,
// in which case the frontend calls this directly (no ads needed) because
// the user is spending one of their referral-earned free-unlock credits
// (see api/refer.js / api/bot.js).
//
// Verifies the Telegram WebApp initData (so we know the real user id, not
// something the client can fake), enforces the 24h re-lock (still applies
// even when using a free credit — the credit only skips the ad requirement,
// not the re-lock timer), then sends the video to the user's chat via the
// bot and records the unlock.
//
// Also schedules the sent video message for auto-deletion 5 minutes later.
// NOTE: this only WRITES the schedule to the DB — the actual deletion is
// performed by a separate cron endpoint (see api/delete-scheduled.js),
// because a Vercel serverless function cannot just `setTimeout` for 5
// minutes and stay alive to run it.
const { getDb } = require('../lib/db');
const { sendVideo, verifyInitData } = require('../lib/telegram');
const { ObjectId } = require('mongodb');
const LOCK_HOURS = 24;
const AUTO_DELETE_MINUTES = 5;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { videoId, initData, useFreeCredit } = req.body || {};
    const user = verifyInitData(initData);
    if (!user) {
      res.status(401).json({ error: 'Could not verify Telegram user' });
      return;
    }
    const userId = user.id;
    if (!videoId || !ObjectId.isValid(videoId)) {
      res.status(400).json({ error: 'Invalid videoId' });
      return;
    }
    const db = await getDb();
    const video = await db.collection('videos').findOne({ _id: new ObjectId(videoId), published: true });
    if (!video) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }
    // Enforce 24h re-lock per user per video — applies whether or not a
    // free credit is used.
    const existing = await db.collection('unlocks').findOne({ userId, videoId: videoId });
    if (existing) {
      const unlockedAt = new Date(existing.unlockedAt).getTime();
      const lockedUntil = unlockedAt + LOCK_HOURS * 60 * 60 * 1000;
      if (lockedUntil > Date.now()) {
        res.status(423).json({ error: 'Video is locked', lockedUntil });
        return;
      }
    }

    let remainingFreeCredits = null;
    if (useFreeCredit) {
      // Atomic check-and-decrement: only succeeds if the user still has at
      // least 1 credit at the moment of the update, so two rapid clicks
      // can't both spend the same credit.
      const creditResult = await db.collection('users').findOneAndUpdate(
        { telegramId: userId, freeUnlockCredits: { $gte: 1 } },
        { $inc: { freeUnlockCredits: -1 } },
        { returnDocument: 'after' }
      );
      if (!creditResult.value) {
        res.status(400).json({ error: 'আপনার কোনো ফ্রি ভিডিও credit নেই।' });
        return;
      }
      remainingFreeCredits = creditResult.value.freeUnlockCredits;
    }

    // Send the video into the user's chat with the bot.
    // sendVideo is expected to return the raw Telegram API response, which
    // includes result.message_id — needed below to schedule deletion.
    const sentMessage = await sendVideo(userId, video.telegramFileId, `🎬 ${video.title}`);
    const sentMessageId = sentMessage?.result?.message_id || sentMessage?.message_id || null;

    await db.collection('unlocks').updateOne(
      { userId, videoId: videoId },
      { $set: { userId, videoId, unlockedAt: new Date(), viaFreeCredit: !!useFreeCredit } },
      { upsert: true }
    );

    // Schedule auto-deletion 5 minutes from now (actual deletion happens in
    // the cron endpoint, api/delete-scheduled.js).
    if (sentMessageId) {
      await db.collection('scheduledDeletions').insertOne({
        chatId: userId,
        messageId: sentMessageId,
        videoId,
        deleteAt: new Date(Date.now() + AUTO_DELETE_MINUTES * 60 * 1000),
        done: false,
      });
    } else {
      console.warn('unlock.js: could not determine sent message_id, auto-delete not scheduled for user', userId);
    }

    res.status(200).json({ success: true, freeUnlockCredits: remainingFreeCredits });
  } catch (err) {
    console.error('unlock.js error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
