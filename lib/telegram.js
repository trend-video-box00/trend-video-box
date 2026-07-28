// lib/telegram.js
// Thin wrapper around the Telegram Bot API. Uses global fetch (available on
// Vercel Node 18+ runtime).
const crypto = require('crypto');
const BOT_TOKEN = process.env.BOT_TOKEN;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;
async function tg(method, payload) {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`Telegram API error on ${method}:`, data);
  }
  return data;
}
const sendMessage = (chatId, text, extra = {}) =>
  tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
const sendPhoto = (chatId, photo, caption, extra = {}) =>
  tg('sendPhoto', { chat_id: chatId, photo, caption, parse_mode: 'HTML', ...extra });
// Sends a video the admin previously uploaded to the bot, by its Telegram
// file_id. This means we never have to host video files ourselves — Telegram
// stores and serves them, which is what keeps this workable on Vercel's free
// plan (no big blob storage needed).
const sendVideo = (chatId, fileId, caption, extra = {}) =>
  tg('sendVideo', { chat_id: chatId, video: fileId, caption, parse_mode: 'HTML', ...extra });
// Deletes a previously-sent message (used for the 5-minute auto-delete of
// unlocked videos — see api/unlock.js and api/delete-scheduled.js).
// Telegram only allows deleting messages within 48h and only ones the bot
// itself sent (or admin rights in groups) — both true for our case, since
// we always delete our own sendVideo message shortly after sending it.
const deleteMessage = (chatId, messageId) =>
  tg('deleteMessage', { chat_id: chatId, message_id: messageId });
const answerCallbackQuery = (callbackQueryId, text) =>
  tg('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
const setWebhook = (url) => tg('setWebhook', { url });

// --- Profile photo lookup (used to show real avatars on the Rank page) ---
// Telegram only lets a bot read a user's profile photo if that user has
// interacted with the bot (privacy rule) — which is true here since this
// is only ever called after that user has sent /start.
const getUserProfilePhotos = (userId, limit = 1) =>
  tg('getUserProfilePhotos', { user_id: userId, limit });
const getFile = (fileId) => tg('getFile', { file_id: fileId });

// Returns a direct https URL to the user's current profile photo (smallest
// size, since this is just for small leaderboard avatars), or null if they
// don't have one set / it can't be read.
async function getUserPhotoUrl(userId) {
  try {
    const photos = await getUserProfilePhotos(userId, 1);
    if (!photos.ok || !photos.result || !photos.result.photos.length) return null;
    const fileId = photos.result.photos[0][0].file_id; // smallest available size
    const fileResult = await getFile(fileId);
    if (!fileResult.ok || !fileResult.result?.file_path) return null;
    return `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileResult.result.file_path}`;
  } catch (e) {
    console.error('getUserPhotoUrl error:', e);
    return null;
  }
}
/**
 * Validates Telegram WebApp initData so we can trust the user id it claims.
 * This is what protects the admin panel: only requests whose initData both
 * (a) passes this HMAC check and (b) has the admin's user id are allowed to
 * upload content or broadcast messages.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function verifyInitData(initData) {
  if (!initData || !BOT_TOKEN) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheckArr = [];
  for (const [key, value] of [...params.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    dataCheckArr.push(`${key}=${value}`);
  }
  const dataCheckString = dataCheckArr.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (computedHash !== hash) return null;
  const userJson = params.get('user');
  if (!userJson) return null;
  try {
    return JSON.parse(userJson); // { id, first_name, username, ... }
  } catch {
    return null;
  }
}
module.exports = {
  sendMessage,
  sendPhoto,
  sendVideo,
  deleteMessage,
  answerCallbackQuery,
  setWebhook,
  verifyInitData,
  getUserProfilePhotos,
  getFile,
  getUserPhotoUrl,
};
