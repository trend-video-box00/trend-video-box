const { Markup } = require('telegraf');
const crypto = require('crypto');
const User = require('../models/User');
const Video = require('../models/Video');
const Withdrawal = require('../models/Withdrawal');
const Settings = require('../models/Settings');
const AdminState = require('../models/AdminState');
const { resolveWithdrawal } = require('../handlers/withdraw');

function isAdmin(ctx) {
  return ctx.from && Number(process.env.ADMIN_TELEGRAM_ID) === ctx.from.id;
}

async function setState(adminId, step, context = {}) {
  await AdminState.findOneAndUpdate(
    { adminTelegramId: adminId },
    { step, context },
    { upsert: true }
  );
}

async function getState(adminId) {
  return AdminState.findOne({ adminTelegramId: adminId });
}

async function clearState(adminId) {
  await AdminState.findOneAndUpdate({ adminTelegramId: adminId }, { step: null, context: {} }, { upsert: true });
}

function adminMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📊 Dashboard', 'adm_dashboard'), Markup.button.callback('💸 Withdrawals', 'adm_withdrawals')],
    [Markup.button.callback('👤 User Lookup', 'adm_user_lookup'), Markup.button.callback('🎬 Add Video', 'adm_add_video')],
    [Markup.button.callback('🗂 Manage Videos', 'adm_manage_videos'), Markup.button.callback('📢 Broadcast', 'adm_broadcast')],
    [Markup.button.callback('📺 Manage Ad Units', 'adm_ad_units'), Markup.button.callback('✉️ Message User', 'adm_message_user')],
    [Markup.button.callback('⚙️ Reward Settings', 'adm_reward_settings')],
  ]);
}

function registerAdminHandlers(bot) {
  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('You are not authorized to use this.');
    await clearState(ctx.from.id);
    await ctx.reply('👑 Admin Panel\nWelcome back, Admin!', adminMenuKeyboard());
  });

  bot.action('adm_dashboard', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const [userCount, videoCount, pendingWithdrawals, totalPaidOutAgg] = await Promise.all([
      User.countDocuments(),
      Video.countDocuments(),
      Withdrawal.countDocuments({ status: 'pending' }),
      Withdrawal.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, total: { $sum: '$amountUSD' } } }]),
    ]);
    const totalPaid = totalPaidOutAgg[0]?.total || 0;
    await ctx.answerCbQuery();
    await ctx.reply(
      `📊 Dashboard\n\nUsers: ${userCount}\nVideos: ${videoCount}\nPending withdrawals: ${pendingWithdrawals}\nTotal paid out: $${totalPaid.toFixed(2)}`
    );
  });

  // ---------- Add Video flow ----------
  bot.action('adm_add_video', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const uploadId = crypto.randomBytes(3).toString('hex');
    await setState(ctx.from.id, 'awaiting_video_file', { uploadId });
    await ctx.answerCbQuery();
    await ctx.reply(
      `🎬 Send me the video file now.\nUpload ID: \`${uploadId}\`\n\nAfter you send the video, I'll ask for a title, then a thumbnail image.`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.action('adm_manage_videos', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const videos = await Video.find().sort({ createdAt: -1 }).limit(15);
    await ctx.answerCbQuery();
    if (!videos.length) return ctx.reply('No videos uploaded yet.');
    const lines = videos.map(
      (v) => `${v.isActive ? '✅' : '🚫'} ${v.title || '(untitled)'} — id:${v.uploadId} — unlocked ${v.timesUnlocked}x`
    );
    await ctx.reply(`🗂 Videos:\n\n${lines.join('\n')}\n\nUse /toggle <uploadId> to enable/disable a video.`);
  });

  bot.command('toggle', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const uploadId = ctx.message.text.split(' ')[1];
    const video = await Video.findOne({ uploadId });
    if (!video) return ctx.reply('Video not found.');
    video.isActive = !video.isActive;
    await video.save();
    await ctx.reply(`${video.title || uploadId} is now ${video.isActive ? 'active ✅' : 'disabled 🚫'}`);
  });

  // ---------- Withdrawals ----------
  bot.action('adm_withdrawals', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const pending = await Withdrawal.find({ status: 'pending' }).sort({ createdAt: 1 }).limit(10);
    await ctx.answerCbQuery();
    if (!pending.length) return ctx.reply('No pending withdrawals. 🎉');

    for (const w of pending) {
      await ctx.reply(
        `💸 Withdrawal Request\nUser: ${w.telegramId}\nAmount: $${w.amountUSD.toFixed(2)}\nMethod: ${w.method}\nAccount: ${w.accountDetails}\nRequested: ${w.requestedAt.toLocaleString()}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Approve', `wd_approve_${w._id}`), Markup.button.callback('❌ Reject', `wd_reject_${w._id}`)],
        ])
      );
    }
  });

  bot.action(/wd_approve_(.+)/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const id = ctx.match[1];
    const result = await resolveWithdrawal(id, true);
    await ctx.answerCbQuery('Approved');
    if (result.ok) {
      await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n✅ APPROVED');
      bot.telegram.sendMessage(result.withdrawal.telegramId, `✅ Your withdrawal of $${result.withdrawal.amountUSD.toFixed(2)} has been approved and sent.`).catch(() => {});
    }
  });

  bot.action(/wd_reject_(.+)/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const id = ctx.match[1];
    const result = await resolveWithdrawal(id, false, 'Rejected by admin');
    await ctx.answerCbQuery('Rejected');
    if (result.ok) {
      await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n❌ REJECTED (balance refunded)');
      bot.telegram.sendMessage(result.withdrawal.telegramId, `❌ Your withdrawal of $${result.withdrawal.amountUSD.toFixed(2)} was rejected. The amount has been returned to your balance.`).catch(() => {});
    }
  });

  // ---------- User lookup ----------
  bot.action('adm_user_lookup', async (ctx) => {
    if (!isAdmin(ctx)) return;
    await setState(ctx.from.id, 'awaiting_user_lookup_id');
    await ctx.answerCbQuery();
    await ctx.reply('Send the Telegram ID or @username of the user to look up.');
  });

  // ---------- Direct message to a user ----------
  bot.action('adm_message_user', async (ctx) => {
    if (!isAdmin(ctx)) return;
    await setState(ctx.from.id, 'awaiting_message_target');
    await ctx.answerCbQuery();
    await ctx.reply('Send the Telegram ID of the user you want to message.');
  });

  // ---------- Broadcast ----------
  bot.action('adm_broadcast', async (ctx) => {
    if (!isAdmin(ctx)) return;
    await setState(ctx.from.id, 'awaiting_broadcast_text');
    await ctx.answerCbQuery();
    await ctx.reply('Send the message (text, optionally with a photo) to broadcast to ALL users.');
  });

  // ---------- Ad unit management ----------
  bot.action('adm_ad_units', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const settings = await Settings.findOne({ key: 'global' });
    await ctx.answerCbQuery();
    await ctx.reply(
      `📺 Current Adsgram block IDs:\n${(settings?.adsgramBlockIds || []).join('\n') || '(none)'}\n\nSend /addadunit <blockId> to add one, or /removeadunit <blockId> to remove.`
    );
  });

  bot.command('addadunit', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const blockId = ctx.message.text.split(' ')[1];
    if (!blockId) return ctx.reply('Usage: /addadunit <blockId>');
    await Settings.updateOne({ key: 'global' }, { $addToSet: { adsgramBlockIds: blockId } }, { upsert: true });
    await ctx.reply(`Added ad unit: ${blockId}`);
  });

  bot.command('removeadunit', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const blockId = ctx.message.text.split(' ')[1];
    if (!blockId) return ctx.reply('Usage: /removeadunit <blockId>');
    await Settings.updateOne({ key: 'global' }, { $pull: { adsgramBlockIds: blockId } });
    await ctx.reply(`Removed ad unit: ${blockId}`);
  });

  // ---------- Reward settings ----------
  bot.action('adm_reward_settings', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const s = await Settings.findOne({ key: 'global' });
    await ctx.answerCbQuery();
    await ctx.reply(
      `⚙️ Reward Settings\n\nPer ad reward: $${s.perAdRewardUSD}\nDaily ad limit: ${s.dailyAdWatchLimit}\nMin withdraw: $${s.minWithdrawUSD}\n\n` +
        `Update with:\n/setrate <usd>\n/setlimit <n>\n/setminwithdraw <usd>`
    );
  });

  bot.command('setrate', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const v = parseFloat(ctx.message.text.split(' ')[1]);
    if (isNaN(v)) return ctx.reply('Usage: /setrate 0.05');
    await Settings.updateOne({ key: 'global' }, { perAdRewardUSD: v }, { upsert: true });
    await ctx.reply(`Per-ad reward set to $${v}`);
  });

  bot.command('setlimit', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const v = parseInt(ctx.message.text.split(' ')[1], 10);
    if (isNaN(v)) return ctx.reply('Usage: /setlimit 20');
    await Settings.updateOne({ key: 'global' }, { dailyAdWatchLimit: v }, { upsert: true });
    await ctx.reply(`Daily ad limit set to ${v}`);
  });

  bot.command('setminwithdraw', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const v = parseFloat(ctx.message.text.split(' ')[1]);
    if (isNaN(v)) return ctx.reply('Usage: /setminwithdraw 2');
    await Settings.updateOne({ key: 'global' }, { minWithdrawUSD: v }, { upsert: true });
    await ctx.reply(`Minimum withdraw set to $${v}`);
  });

  // ---------- Stateful message/photo capture for the flows above ----------
  bot.on(['text', 'photo', 'video'], async (ctx, next) => {
    if (!isAdmin(ctx)) return next();
    const state = await getState(ctx.from.id);
    if (!state || !state.step) return next();

    switch (state.step) {
      case 'awaiting_video_file': {
        if (!ctx.message.video) return ctx.reply('Please send a video file.');
        const fileId = ctx.message.video.file_id;
        await Video.create({ uploadId: state.context.uploadId, videoFileId: fileId });
        await setState(ctx.from.id, 'awaiting_video_title', state.context);
        await ctx.reply('Got the video. Now send the title for this video.');
        break;
      }
      case 'awaiting_video_title': {
        const title = ctx.message.text;
        await Video.updateOne({ uploadId: state.context.uploadId }, { title });
        await setState(ctx.from.id, 'awaiting_video_thumbnail', state.context);
        await ctx.reply('Title saved. Now send the thumbnail image.');
        break;
      }
      case 'awaiting_video_thumbnail': {
        if (!ctx.message.photo) return ctx.reply('Please send a photo for the thumbnail.');
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        await Video.updateOne({ uploadId: state.context.uploadId }, { thumbnailFileId: fileId });
        await clearState(ctx.from.id);
        await ctx.reply(`✅ Video "${state.context.uploadId}" fully set up and live.`);
        break;
      }
      case 'awaiting_user_lookup_id': {
        const idOrName = ctx.message.text.replace('@', '').trim();
        const user = await User.findOne({
          $or: [{ telegramId: Number(idOrName) || 0 }, { username: idOrName }],
        });
        await clearState(ctx.from.id);
        if (!user) return ctx.reply('User not found.');
        await ctx.reply(
          `👤 ${user.firstName} (@${user.username || 'n/a'})\nID: ${user.telegramId}\nBalance: $${user.balanceUSD.toFixed(2)}\nReferrals: ${user.referralCount} (active: ${user.activeReferralCount})\nBonus unlocks: ${user.bonusVideoUnlocks}\nVideos unlocked: ${user.videoProgress.filter((p) => p.unlocked).length}`
        );
        break;
      }
      case 'awaiting_message_target': {
        const targetId = Number(ctx.message.text.trim());
        if (!targetId) return ctx.reply('Please send a valid numeric Telegram ID.');
        await setState(ctx.from.id, 'awaiting_message_content', { targetId });
        await ctx.reply('Now send the message (text/photo + optional button label will be asked next).');
        break;
      }
      case 'awaiting_message_content': {
        const targetId = state.context.targetId;
        try {
          if (ctx.message.photo) {
            const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            await bot.telegram.sendPhoto(targetId, fileId, { caption: ctx.message.caption || '' });
          } else {
            await bot.telegram.sendMessage(targetId, ctx.message.text);
          }
          await ctx.reply('✅ Message sent.');
        } catch (e) {
          await ctx.reply('❌ Failed to send — user may have blocked the bot.');
        }
        await clearState(ctx.from.id);
        break;
      }
      case 'awaiting_broadcast_text': {
        const users = await User.find({}, 'telegramId');
        await clearState(ctx.from.id);
        await ctx.reply(`📢 Broadcasting to ${users.length} users...`);
        let sent = 0;
        for (const u of users) {
          try {
            if (ctx.message.photo) {
              const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
              await bot.telegram.sendPhoto(u.telegramId, fileId, { caption: ctx.message.caption || '' });
            } else {
              await bot.telegram.sendMessage(u.telegramId, ctx.message.text);
            }
            sent += 1;
          } catch (e) {
            // user blocked bot — skip
          }
        }
        await ctx.reply(`✅ Broadcast sent to ${sent}/${users.length} users.`);
        break;
      }
      default:
        return next();
    }
  });
}

module.exports = { registerAdminHandlers, isAdmin };
