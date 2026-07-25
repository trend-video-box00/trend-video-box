const User = require('../models/User');
const Withdrawal = require('../models/Withdrawal');
const { getSettings } = require('./earn');

async function requestWithdrawal(user, amountUSD, method, accountDetails) {
  const settings = await getSettings();

  if (amountUSD < settings.minWithdrawUSD) {
    return { ok: false, reason: 'below_minimum', minimum: settings.minWithdrawUSD };
  }
  if (amountUSD > user.balanceUSD) {
    return { ok: false, reason: 'insufficient_balance' };
  }

  // Deduct immediately so the user can't double-spend while pending;
  // if admin rejects, the amount is refunded (see resolveWithdrawal).
  user.balanceUSD -= amountUSD;
  await user.save();

  const withdrawal = await Withdrawal.create({
    telegramId: user.telegramId,
    amountUSD,
    method,
    accountDetails,
    status: 'pending',
  });

  return { ok: true, withdrawal };
}

async function resolveWithdrawal(withdrawalId, approve, adminNote = '') {
  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal || withdrawal.status !== 'pending') {
    return { ok: false, reason: 'not_found_or_already_resolved' };
  }

  withdrawal.status = approve ? 'approved' : 'rejected';
  withdrawal.adminNote = adminNote;
  withdrawal.resolvedAt = new Date();
  await withdrawal.save();

  if (!approve) {
    // refund the deducted balance
    await User.updateOne({ telegramId: withdrawal.telegramId }, { $inc: { balanceUSD: withdrawal.amountUSD } });
  }

  return { ok: true, withdrawal };
}

async function getUserHistory(telegramId) {
  return Withdrawal.find({ telegramId }).sort({ createdAt: -1 }).limit(20);
}

module.exports = { requestWithdrawal, resolveWithdrawal, getUserHistory };
