const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema(
  {
    telegramId: { type: Number, required: true, index: true },
    amountUSD: { type: Number, required: true },
    method: { type: String, enum: ['Bkash', 'Nagad', 'Rocket', 'Binance'], required: true },
    accountDetails: { type: String, required: true }, // phone number / wallet address user provides

    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    adminNote: { type: String, default: '' },
    requestedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
