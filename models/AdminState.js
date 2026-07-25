const mongoose = require('mongoose');

const adminStateSchema = new mongoose.Schema({
  adminTelegramId: { type: Number, required: true, unique: true },
  step: { type: String, default: null }, // e.g. 'awaiting_video_upload', 'awaiting_title'
  context: { type: mongoose.Schema.Types.Mixed, default: {} }, // e.g. { uploadId: 'abc123' }
});

module.exports = mongoose.model('AdminState', adminStateSchema);
