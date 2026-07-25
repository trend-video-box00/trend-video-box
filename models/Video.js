const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema(
  {
    uploadId: { type: String, required: true, unique: true }, // short id admin uses to attach title/thumbnail
    title: { type: String, default: '' },
    thumbnailFileId: { type: String, default: '' }, // Telegram file_id for the thumbnail image
    videoFileId: { type: String, default: '' }, // Telegram file_id for the actual video
    category: { type: String, default: 'All Videos' },

    adsRequiredToUnlock: { type: Number, default: 5 },

    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },

    // simple stats
    timesUnlocked: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Video', videoSchema);
