require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { connectDB } = require('./db');
const { getOrCreateUser } = require('./handlers/userHelper');
const { watchGeneralAd, watchAdForVideo, useBonusUnlock, getVideoProgress, getSettings } = require('./handlers/earn');
const { markReferralActive, buildInviteLink } = require('./handlers/refer');
const { requestWithdrawal, getUserHistory } = require('./handlers/withdraw');
const { registerAdminHandlers } = require('./admin/admin');
const Video = require('./models/Video');
const User = require('./models/User');
const AdminState = require('./models/AdminState');
const { t, convert, currencySymbol } = require('./i18n');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ---------- /start ----------
bot.start(async (ctx) => {
  const user = await getOrCreateUser(ctx);

  // If this user was referred, mark referrer's bonus once they actually engage.
  // (We mark on first /start after creation is handled in getOrCreateUser;
  // "active" credit is granted the first time they watch an ad — see watch handlers.)

  await ctx.reply(`${t(user.language, 'welcome_title')}\n${t(user.language, 'welcome_subtitle')}`);
  await sendHome(ctx, user);
});

function mainMenuKeyboard(lang) {
  return Markup.keyboard([
    [t(lang, 'home'), t(lang, 'refer')],
    [t(lang, 'earn'), t(lang, 'rank')],
    [t(lang, 'profile')],
  ]).resize();
}

async function sendHome(ctx, user) {
  const settings = await getSettings();
  const symbol = currencySymbol[user.currency];
  const displayBalance = convert(user.balanceUSD, user.currency, settings.conversionRates);

  await ctx.reply(
    `💰 ${t(user.language, 'total_balance')}\n${symbol}${displayBalance} ${user.currency}\n\n` +
      `🔔 ${t(user.language, 'withdraw_min_notice', { min: convert(settings.minWithdrawUSD, user.currency, settings.conversionRates) })}`,
    Markup.inlineKeyboard([
      [Markup.button.callback(`📋 ${t(user.language, 'tasks')}`, 'nav_tasks'), Markup.button.callback(`🎥 ${t(user.language, 'videos')}`, 'nav_videos')],
      [Markup.button.callback(`👥 ${t(user.language, 'refer')}`, 'nav_refer'), Markup.button.callback(`🏦 ${t(user.language, 'withdraw')}`, 'nav_withdraw')],
      [Markup.button.callback(`⚙️ ${t(user.language, 'settings')}`, 'nav_settings')],
    ])
  );
}

bot.hears([t('en', 'home'), t('bn', 'home'), t('ur', 'home')], async (ctx) => {
  const user = await getOrCreateUser(ctx);
  await sendHome(ctx, user);
});

// "Tasks" tab -> jumps straight into Earn (per spec)
bot.action('nav_tasks', async (ctx) => {
  await ctx.answerCbQuery();
  await sendEarnTab(ctx);
});

async function sendEarnTab(ctx) {
  const user = await getOrCreateUser(ctx);
  const settings = await getSettings();
  await ctx.reply(
    `💵 ${t(user.language, 'watch_and_earn')}\n\n${t(user.language, 'per_ad_reward')}: $${settings.perAdRewardUSD}\n${t(
      user.language,
      'daily_limit'
    )}: ${user.adsWatchedToday}/${settings.dailyAdWatchLimit}`,
    Markup.inlineKeyboard([[Markup.button.callback(`▶️ ${t(user.language, 'watch_ad_now')}`, 'watch_general_ad')]])
  );
}

bot.action('watch_general_ad', async (ctx) => {
  const user = await getOrCreateUser(ctx);
  const result = await watchGeneralAd(user);
  await ctx.answerCbQuery();

  if (!result.ok) {
    return ctx.reply('⏳ Daily ad limit reached. Come back tomorrow!');
  }

  // First-ever ad watch triggers referral "active" credit for whoever invited them.
  await markReferralActive(user.telegramId);

  await ctx.reply(
    `✅ +$${result.reward.toFixed(2)}\n${t(user.language, 'daily_limit')}: ${result.watchedToday}/${result.dailyLimit}\nBalance: $${result.newBalance.toFixed(2)}`
  );
});

// ---------- Videos tab ----------
bot.action('nav_videos', async (ctx) => {
  await ctx.answerCbQuery();
  await sendVideoList(ctx);
});

async function sendVideoList(ctx) {
  const user = await getOrCreateUser(ctx);
  const videos = await Video.find({ isActive: true }).sort({ createdAt: -1 }).limit(20);

  if (!videos.length) {
    return ctx.reply('No videos available yet — check back soon!');
  }

  for (const v of videos) {
    const progress = getVideoProgress(user, v._id);
    const status = progress.unlocked ? '🔓 Unlocked' : `🔒 ${progress.adsWatched}/${v.adsRequiredToUnlock} ads`;
    const caption = `${v.title || '(untitled)'}\n${status}`;
    const buttons = progress.unlocked
      ? [[Markup.button.callback('▶️ Watch Video', `play_${v._id}`)]]
      : [[Markup.button.callback('▶️ Watch Ad to Unlock', `unlock_${v._id}`)]];

    if (v.thumbnailFileId) {
      await ctx.replyWithPhoto(v.thumbnailFileId, { caption, ...Markup.inlineKeyboard(buttons) });
    } else {
      await ctx.reply(caption, Markup.inlineKeyboard(buttons));
    }
  }
}

bot.action(/unlock_(.+)/, async (ctx) => {
  const videoId = ctx.match[1];
  const user = await getOrCreateUser(ctx);
  const settings = await getSettings();

  if (user.adsWatchedToday >= settings.dailyAdWatchLimit) {
    await ctx.answerCbQuery();
    return ctx.reply('⏳ Daily ad limit reached. Come back tomorrow!');
  }

  const result = await watchAdForVideo(user, videoId);
  await ctx.answerCbQuery();

  if (!result.ok) return ctx.reply('Could not process — please try again.');

  await markReferralActive(user.telegramId);

  if (result.justUnlocked) {
    const video = await Video.findById(videoId);
    await ctx.reply(`🎉 Unlocked! +$${result.reward.toFixed(2)}`, Markup.inlineKeyboard([[Markup.button.callback('▶️ Watch Video', `play_${videoId}`)]]));
  } else {
    await ctx.reply(`✅ +$${result.reward.toFixed(2)} — ${result.adsWatched}/${result.adsRequired} ads watched for this video.`);
  }
});

bot.action(/play_(.+)/, async (ctx) => {
  const video = await Video.findById(ctx.match[1]);
  await ctx.answerCbQuery();
  if (!video || !video.videoFileId) return ctx.reply('Video not available.');
  await ctx.replyWithVideo(video.videoFileId, { caption: video.title || '' });
});

// ---------- Refer tab ----------
bot.action('nav_refer', async (ctx) => {
  const user = await getOrCreateUser(ctx);
  const me = await ctx.telegram.getMe();
  const link = buildInviteLink(me.username, user.referralCode);
  const settings = await getSettings();

  await ctx.answerCbQuery();
  await ctx.reply(
    `👥 ${t(user.language, 'invite_friends')}\n\n${t(user.language, 'invite_friends_desc', {
      n: settings.referral.freeVideoUnlockPerReferral,
    })}\n\n${t(user.language, 'joined')}: ${user.referralCount} | ${t(user.language, 'active')}: ${user.activeReferralCount}\n🎁 Bonus unlock credits: ${user.bonusVideoUnlocks}\n\n${t(
      user.language,
      'your_invite_link'
    )}:\n${link}`
  );
});

// ---------- Withdraw tab ----------
bot.action('nav_withdraw', async (ctx) => {
  const user = await getOrCreateUser(ctx);
  const settings = await getSettings();
  const symbol = currencySymbol[user.currency];

  await ctx.answerCbQuery();
  await ctx.reply(
    `🏦 ${t(user.language, 'total_balance')}: ${symbol}${convert(user.balanceUSD, user.currency, settings.conversionRates)}\n` +
      `${t(user.language, 'withdraw_min_notice', { min: convert(settings.minWithdrawUSD, user.currency, settings.conversionRates) })}`,
    Markup.inlineKeyboard([
      [Markup.button.callback('💸 Withdraw', 'withdraw_start'), Markup.button.callback(`🕘 ${t(user.language, 'history')}`, 'withdraw_history')],
    ])
  );
});

bot.action('withdraw_start', async (ctx) => {
  const user = await getOrCreateUser(ctx);
  const settings = await getSettings();
  await ctx.answerCbQuery();

  if (user.balanceUSD < settings.minWithdrawUSD) {
    return ctx.reply(`You need at least $${settings.minWithdrawUSD} to withdraw. Current balance: $${user.balanceUSD.toFixed(2)}`);
  }

  await AdminState.findOneAndUpdate(
    { adminTelegramId: -user.telegramId }, // negative id namespace = user-side flow state, reuses same collection safely
    { step: 'awaiting_withdraw_method', context: {} },
    { upsert: true }
  );

  await ctx.reply(
    'Choose withdrawal method:',
    Markup.inlineKeyboard([
      [Markup.button.callback('Bkash', 'wm_Bkash'), Markup.button.callback('Nagad', 'wm_Nagad')],
      [Markup.button.callback('Rocket', 'wm_Rocket'), Markup.button.callback('Binance', 'wm_Binance')],
    ])
  );
});

bot.action(/wm_(.+)/, async (ctx) => {
  const method = ctx.match[1];
  const user = await getOrCreateUser(ctx);
  await AdminState.findOneAndUpdate(
    { adminTelegramId: -user.telegramId },
    { step: 'awaiting_withdraw_details', context: { method } },
    { upsert: true }
  );
  await ctx.answerCbQuery();
  await ctx.reply(`Send your ${method} account number/address, then the amount separated by a space.\nExample: 01712345678 5`);
});

bot.action('withdraw_history', async (ctx) => {
  const user = await getOrCreateUser(ctx);
  const history = await getUserHistory(user.telegramId);
  await ctx.answerCbQuery();

  if (!history.length) return ctx.reply('No withdrawal history yet.');

  const lines = history.map((w) => {
    const label = { pending: t(user.language, 'pending'), approved: t(user.language, 'approved'), rejected: t(user.language, 'rejected') }[w.status];
    return `$${w.amountUSD.toFixed(2)} via ${w.method} — ${label} (${w.requestedAt.toLocaleDateString()})`;
  });
  await ctx.reply(`🕘 ${t(user.language, 'history')}:\n\n${lines.join('\n')}`);
});

// ---------- Settings tab ----------
bot.action('nav_settings', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    'Settings',
    Markup.inlineKeyboard([
      [Markup.button.callback('🌐 Language', 'set_language'), Markup.button.callback('💱 Currency', 'set_currency')],
    ])
  );
});

bot.action('set_language', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    'Choose language:',
    Markup.inlineKeyboard([[Markup.button.callback('English', 'lang_en'), Markup.button.callback('বাংলা', 'lang_bn'), Markup.button.callback('اردو', 'lang_ur')]])
  );
});

bot.action(/lang_(en|bn|ur)/, async (ctx) => {
  await User.updateOne({ telegramId: ctx.from.id }, { language: ctx.match[1] });
  await ctx.answerCbQuery('Language updated');
  await ctx.reply('✅ Language updated.');
});

bot.action('set_currency', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    'Choose currency:',
    Markup.inlineKeyboard([[Markup.button.callback('USD', 'cur_USD'), Markup.button.callback('BDT', 'cur_BDT'), Markup.button.callback('PKR', 'cur_PKR')]])
  );
});

bot.action(/cur_(USD|BDT|PKR)/, async (ctx) => {
  await User.updateOne({ telegramId: ctx.from.id }, { currency: ctx.match[1] });
  await ctx.answerCbQuery('Currency updated');
  await ctx.reply(`✅ Currency set to ${ctx.match[1]}. (Display only — real balance tracked in USD.)`);
});

// ---------- Rank tab ----------
bot.hears([t('en', 'rank'), t('bn', 'rank'), t('ur', 'rank')], async (ctx) => sendRank(ctx));
async function sendRank(ctx) {
  const [topEarners, topRefs, topUnlocks] = await Promise.all([
    User.find().sort({ balanceUSD: -1 }).limit(5),
    User.find().sort({ activeReferralCount: -1 }).limit(5),
    User.find().sort({ 'videoProgress.length': -1 }).limit(5),
  ]);

  const fmt = (list, valueFn) => list.map((u, i) => `${i + 1}. ${u.firstName || u.username || u.telegramId} — ${valueFn(u)}`).join('\n') || '—';

  await ctx.reply(
    `🏆 Top Champions\n\n💰 Top Earners:\n${fmt(topEarners, (u) => `$${u.balanceUSD.toFixed(2)}`)}\n\n👥 Top Referrers:\n${fmt(
      topRefs,
      (u) => `${u.activeReferralCount} refs`
    )}\n\n🎥 Top Unlocks:\n${fmt(topUnlocks, (u) => `${u.videoProgress.filter((p) => p.unlocked).length} unlocks`)}`
  );
}

// ---------- Profile tab ----------
bot.hears([t('en', 'profile'), t('bn', 'profile'), t('ur', 'profile')], async (ctx) => {
  const user = await getOrCreateUser(ctx);
  const unlockedCount = user.videoProgress.filter((p) => p.unlocked).length;
  await ctx.reply(
    `👤 ${user.firstName}\nBalance: $${user.balanceUSD.toFixed(2)}\nVideos unlocked: ${unlockedCount}\nActive referrals: ${user.activeReferralCount}\nBonus unlock credits: ${user.bonusVideoUnlocks}`
  );
});

// ---------- Earn tab (bottom menu shortcut) ----------
bot.hears([t('en', 'earn'), t('bn', 'earn'), t('ur', 'earn')], async (ctx) => sendEarnTab(ctx));

// ---------- Withdraw request text capture (amount+details) ----------
bot.on('text', async (ctx, next) => {
  const state = await AdminState.findOne({ adminTelegramId: -ctx.from.id });
  if (!state || state.step !== 'awaiting_withdraw_details') return next();

  const parts = ctx.message.text.trim().split(' ');
  const amount = parseFloat(parts[parts.length - 1]);
  const accountDetails = parts.slice(0, -1).join(' ');

  if (!accountDetails || isNaN(amount)) {
    return ctx.reply('Format: <account> <amount>. Example: 01712345678 5');
  }

  const user = await getOrCreateUser(ctx);
  const result = await requestWithdrawal(user, amount, state.context.method, accountDetails);
  await AdminState.deleteOne({ adminTelegramId: -ctx.from.id });

  if (!result.ok) {
    if (result.reason === 'below_minimum') return ctx.reply(`Minimum withdrawal is $${result.minimum}.`);
    if (result.reason === 'insufficient_balance') return ctx.reply('Insufficient balance.');
    return ctx.reply('Withdrawal request failed.');
  }

  await ctx.reply(`✅ Withdrawal of $${amount.toFixed(2)} requested via ${state.context.method}. Status: Pending admin approval.`);

  // notify admin
  const adminId = Number(process.env.ADMIN_TELEGRAM_ID);
  bot.telegram
    .sendMessage(
      adminId,
      `💸 New withdrawal request\nUser: ${ctx.from.id}\nAmount: $${amount.toFixed(2)}\nMethod: ${state.context.method}\nAccount: ${accountDetails}\n\nUse /admin → Withdrawals to review.`
    )
    .catch(() => {});
});

registerAdminHandlers(bot);

// ---------- Launch ----------
// Only start polling (local/dev) here. On Vercel, api/webhook.js imports
// this file purely to register handlers, connects to the DB itself, and
// Telegram delivers updates via HTTP POST to /api/webhook — no server or
// bot.launch() needed in that path.
async function main() {
  await connectDB();
  await bot.launch();
  console.log('[bot] Long-polling started (local/dev mode)');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[bot] Fatal startup error:', err);
    process.exit(1);
  });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

module.exports = bot;
