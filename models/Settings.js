const mongoose = require('mongoose');

// Singleton document holding all admin-configurable knobs, so admin can
// change reward rate / ad units / conversion rates without redeploying.
const settingsSchema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true },

  perAdRewardUSD: { type: Number, default: 0.05 },
  dailyAdWatchLimit: { type: Number, default: 20 },
  minWithdrawUSD: { type: Number, default: 2 },

  // Adsgram (or any rewarded-ad network) block/unit ids the admin manages
  adsgramBlockIds: { type: [String], default: [] },

  // Display-only conversion rates (real money always tracked in USD)
  conversionRates: {
    BDT: { type: Number, default: 110 },
    PKR: { type: Number, default: 280 },
  },

  // Non-cash referral rewards
  referral: {
    freeVideoUnlockPerReferral: { type: Number, default: 1 },
  },
});

module.exports = mongoose.model('Settings', settingsSchema);
