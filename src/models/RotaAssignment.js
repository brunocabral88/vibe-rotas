const mongoose = require('mongoose');

const rotaAssignmentSchema = new mongoose.Schema({
  rotaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rota',
    required: true,
    index: true
  },
  workspaceId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: String,
    required: true
  },
  assignedDate: {
    type: Date,
    required: true,
    index: true
  },
  notified: {
    type: Boolean,
    default: false
  },
  notificationSentAt: {
    type: Date,
    default: null
  },
  messageTs: {
    type: String,
    default: null
  },
  channelId: {
    type: String,
    required: true
  },
  // Skip tracking fields
  skipped: {
    type: Boolean,
    default: false,
    index: true
  },
  skippedBy: {
    type: String,
    default: null
  },
  skippedAt: {
    type: Date,
    default: null
  },
  skipReason: {
    type: String,
    default: null
  },
  replacedByAssignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RotaAssignment',
    default: null
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
rotaAssignmentSchema.index({ rotaId: 1, assignedDate: -1 });
rotaAssignmentSchema.index({ workspaceId: 1, notified: 1 });
// Index for skip queries
rotaAssignmentSchema.index({ rotaId: 1, assignedDate: -1, skipped: 1 });

module.exports = mongoose.model('RotaAssignment', rotaAssignmentSchema);
