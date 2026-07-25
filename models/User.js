const mongoose = require('mongoose');

const videoProgressSchema = new mongoose.Schema(
  {
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
    adsWatched: { type: Number, default: 0 },
    unlocked: { type: Boolean, default: false },
    unlockedAt: { type: Date },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    telegramId: { type: Number, required: true, unique: true, index: true },
    username: { type: String },
    firstName: { type: String },

    language: { type: String, enum: ['en', 'bn', 'ur'], default: 'en' },
    currency: { type: String, enum: ['USD', 'BDT', 'PKR'], default: 'USD' },

    // Balances are always stored in USD internally; converted for display only.
    balanceUSD: { type: Number, default: 0 },

    // Referral system: reward is free video unlocks + leaderboard rank, not cash.
    // (Cash-per-referral was intentionally dropped — see project notes.)
    referredBy: { type: Number, default: null }, // telegramId of referrer
    referralCode: { type: String, unique: true, sparse: true },
    referralCount: { type: Number, default: 0 },
    activeReferralCount: { type: Number, default: 0 },
    bonusVideoUnlocks: { type: Number, default: 0 }, // free unlock credits earned from referrals

    // Ad watching
    adsWatchedToday: { type: Number, default: 0 },
    lastAdWatchReset: { type: Date, default: Date.now },

    // Per-video unlock progress — independent per video, persists permanently once unlocked
    videoProgress: { type: [videoProgressSchema], default: [] },

    isBanned: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
