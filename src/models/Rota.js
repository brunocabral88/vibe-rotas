const mongoose = require('mongoose');

const rotaSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  workspaceId: {
    type: String,
    required: true,
    index: true
  },
  channelId: {
    type: String,
    required: true
  },
  members: [{
    type: String,
    required: true
  }],
  schedule: {
    rrule: {
      type: String,
      required: true
    },
    frequency: {
      type: String,
      enum: ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'],
      required: true
    },
    startDate: {
      type: Date,
      required: true
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    notificationHour: {
      type: Number,
      min: 0,
      max: 23,
      default: 10,
      required: true
    },
    notificationMinute: {
      type: Number,
      enum: [0, 15, 30, 45],
      default: 0,
      required: true
    },
    weekdaysOnly: {
      type: Boolean,
      default: false,
      required: true
    }
  },
  customMessage: {
    type: Object,
    required: false,
    default: null
  },
  currentIndex: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Index for efficient lookups
rotaSchema.index({ workspaceId: 1, isActive: 1 });
rotaSchema.index({ workspaceId: 1, channelId: 1 });

module.exports = mongoose.model('Rota', rotaSchema);
