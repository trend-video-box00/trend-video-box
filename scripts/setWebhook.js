// Run once after each deploy: node scripts/setWebhook.js
require('dotenv').config();
const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);
const url = `${process.env.WEBAPP_URL}/webhook`;

bot.telegram
  .setWebhook(url)
  .then(() => {
    console.log(`Webhook set to ${url}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed to set webhook:', err);
    process.exit(1);
  });
