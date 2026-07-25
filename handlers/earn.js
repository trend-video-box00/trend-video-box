const User = require('../models/User');
const Video = require('../models/Video');
const Settings = require('../models/Settings');

async function getSettings() {
  let settings = await Settings.findOne({ key: 'global' });
  if (!settings) settings = await Settings.create({ key: 'global' });
  return settings;
}

// Generic "Watch Ads & Earn" tab — no video attached, just reward + daily limit.
async function watchGeneralAd(user) {
  const settings = await getSettings();

  if (user.adsWatchedToday >= settings.dailyAdWatchLimit) {
    return { ok: false, reason: 'daily_limit_reached' };
  }

  user.adsWatchedToday += 1;
  user.balanceUSD += settings.perAdRewardUSD;
  await user.save();

  return {
    ok: true,
    reward: settings.perAdRewardUSD,
    watchedToday: user.adsWatchedToday,
    dailyLimit: settings.dailyAdWatchLimit,
    newBalance: user.balanceUSD,
  };
}

// Video-specific ad watch — counts toward that video's unlock progress.
// Once a video is unlocked it STAYS unlocked permanently; watching more ads
// on an already-unlocked video just earns extra reward (still capped by the
// same daily limit) without re-locking it or resetting other videos.
async function watchAdForVideo(user, videoId) {
  const settings = await getSettings();
  const video = await Video.findById(videoId);
  if (!video || !video.isActive) return { ok: false, reason: 'video_not_found' };

  if (user.adsWatchedToday >= settings.dailyAdWatchLimit) {
    return { ok: false, reason: 'daily_limit_reached' };
  }

  let progress = user.videoProgress.find((p) => String(p.videoId) === String(videoId));
  if (!progress) {
    progress = { videoId: video._id, adsWatched: 0, unlocked: false };
    user.videoProgress.push(progress);
    progress = user.videoProgress[user.videoProgress.length - 1];
  }

  const wasAlreadyUnlocked = progress.unlocked;

  user.adsWatchedToday += 1;
  user.balanceUSD += settings.perAdRewardUSD;

  if (!wasAlreadyUnlocked) {
    progress.adsWatched += 1;
    if (progress.adsWatched >= video.adsRequiredToUnlock) {
      progress.unlocked = true;
      progress.unlockedAt = new Date();
      video.timesUnlocked += 1;
      await video.save();
    }
  }

  await user.save();

  return {
    ok: true,
    reward: settings.perAdRewardUSD,
    adsWatched: progress.adsWatched,
    adsRequired: video.adsRequiredToUnlock,
    justUnlocked: !wasAlreadyUnlocked && progress.unlocked,
    alreadyUnlocked: wasAlreadyUnlocked,
    newBalance: user.balanceUSD,
  };
}

// Spend one referral-earned bonus credit to unlock a video instantly (no ads).
async function useBonusUnlock(user, videoId) {
  if (user.bonusVideoUnlocks <= 0) return { ok: false, reason: 'no_bonus_credits' };

  const video = await Video.findById(videoId);
  if (!video || !video.isActive) return { ok: false, reason: 'video_not_found' };

  let progress = user.videoProgress.find((p) => String(p.videoId) === String(videoId));
  if (progress?.unlocked) return { ok: false, reason: 'already_unlocked' };

  if (!progress) {
    user.videoProgress.push({ videoId: video._id, adsWatched: video.adsRequiredToUnlock, unlocked: true, unlockedAt: new Date() });
  } else {
    progress.adsWatched = video.adsRequiredToUnlock;
    progress.unlocked = true;
    progress.unlockedAt = new Date();
  }

  user.bonusVideoUnlocks -= 1;
  video.timesUnlocked += 1;
  await Promise.all([user.save(), video.save()]);

  return { ok: true, remainingBonusCredits: user.bonusVideoUnlocks };
}

function getVideoProgress(user, videoId) {
  const progress = user.videoProgress.find((p) => String(p.videoId) === String(videoId));
  return progress || { adsWatched: 0, unlocked: false };
}

module.exports = { watchGeneralAd, watchAdForVideo, useBonusUnlock, getVideoProgress, getSettings };
