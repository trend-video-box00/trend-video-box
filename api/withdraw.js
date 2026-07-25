// api/withdraw.js
// POST /api/withdraw { initData, amount, method, accountNumber }
// Deducts the requested amount from the user's balance and logs a pending
// request. The admin pays it out manually (bKash/Nagad/Rocket) and marks it
// paid from the admin panel — this app never auto-sends money.

const { getDb } = require('../lib/db');
const { verifyInitData } = require('../lib/telegram');

const MIN_WITHDRAW = 2;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { initData, amount, method, accountNumber } = req.body || {};
    const user = verifyInitData(initData);
    if (!user) {
      res.status(401).json({ error: 'Could not verify Telegram user' });
      return;
    }

    const amt = Number(amount);
    if (!amt || amt < MIN_WITHDRAW) {
      res.status(400).json({ error: `সর্বনিম্ন উইথড্র $${MIN_WITHDRAW}` });
      return;
    }
    if (!method || !accountNumber) {
      res.status(400).json({ error: 'Payment method ও account number দিন' });
      return;
    }

    const db = await getDb();
    const dbUser = await db.collection('users').findOne({ telegramId: user.id });
    if (!dbUser || (dbUser.balance || 0) < amt) {
      res.status(400).json({ error: 'পর্যাপ্ত ব্যালেন্স নেই' });
      return;
    }

    await db.collection('users').updateOne({ telegramId: user.id }, { $inc: { balance: -amt } });
    await db.collection('withdraw_requests').insertOne({
      telegramId: user.id,
      username: dbUser.username || null,
      amount: amt,
      method,
      accountNumber,
      status: 'pending',
      createdAt: new Date(),
    });

    const updated = await db.collection('users').findOne({ telegramId: user.id });
    res.status(200).json({ success: true, balance: updated.balance });
  } catch (err) {
    console.error('withdraw.js error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
