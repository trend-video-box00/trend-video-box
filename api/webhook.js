require('dotenv').config();
const { connectDB } = require('../db');

// Requiring bot.js only registers handlers (see require.main check in
// bot.js) — it does not start polling or its own server here.
let botInstance;
let dbReady = false;

async function getBot() {
  if (!botInstance) botInstance = require('../bot.js');
  if (!dbReady) {
    await connectDB();
    dbReady = true;
  }
  return botInstance;
}

module.exports = async (req, res) => {
  try {
    const bot = await getBot();
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body, res);
      if (!res.headersSent) res.status(200).send('OK');
    } else {
      res.status(200).send('Bot webhook is running.');
    }
  } catch (err) {
    console.error('[webhook] error:', err);
    if (!res.headersSent) res.status(500).send('Error');
  }
};
