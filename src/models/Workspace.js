const mongoose = require('mongoose');

const workspaceSchema = new mongoose.Schema({
  teamId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  teamName: {
    type: String,
    required: true
  },
  accessToken: {
    type: String,
    required: true
  },
  botToken: {
    type: String,
    required: true
  },
  botUserId: {
    type: String,
    required: true
  },
  scope: {
    type: String,
    required: true
  },
  appId: {
    type: String,
    required: true
  },
  enterpriseId: {
    type: String,
    default: null
  },
  enterpriseName: {
    type: String,
    default: null
  },
  installerUserId: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Workspace', workspaceSchema);
