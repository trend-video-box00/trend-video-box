require('dotenv').config();
const { connectDB } = require('../db');

// Requiring bot.js only registers handlers (see the `require.main === module`
// check inside bot.js) — it does NOT start polling or its own server here.
// This file is what Vercel actually runs. With no vercel.json present,
// Vercel's default convention exposes this file at:
//   https://<your-app>.vercel.app/api/webhook
// (NOT /webhook — update scripts/setWebhook.js and BotFather/Telegram
// webhook registration to match this path.)
let botInstance;
let dbConnected = false;

async function getBot() {
  if (!botInstance) {
    botInstance = require('../bot.js');
  }
  if (!dbConnected) {
    await connectDB();
    dbConnected = true;
  }
  return botInstance;
}

module.exports = async (req, res) => {
  try {
    const bot = await getBot();

    if (req.method === 'POST') {
      // Telegram sends the update as JSON in the body; Vercel's Node
      // runtime parses this into req.body automatically.
      if (!req.body || typeof req.body !== 'object') {
        console.warn('[webhook] Received POST with missing/invalid body');
        return res.status(400).send('Bad Request');
      }

      await bot.handleUpdate(req.body, res);
      if (!res.headersSent) res.status(200).send('OK');
      return;
    }

    // Any GET/HEAD request (e.g. opening the URL in a browser) — simple
    // health check so you can confirm the function is alive and the DB
    // connection succeeded, without needing to send a real Telegram update.
    res.status(200).send('Bot webhook is running.');
  } catch (err) {
    console.error('[webhook] error:', err && err.stack ? err.stack : err);
    if (!res.headersSent) res.status(500).send(`Error: ${err.message || 'unknown'}`);
  }
};
