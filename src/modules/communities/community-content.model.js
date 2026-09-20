const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  type: {type: String, enum: ['image', 'sticker', 'video'], required: true},
  url: {type: String, required: true},
  publicId: {type: String, default: ''},
  mimeType: {type: String, required: true},
}, {_id: false});

const engagementFields = {
  likes: {type: Number, default: 0},
  dislikes: {type: Number, default: 0},
  likedBy: {type: [String], default: []},
  dislikedBy: {type: [String], default: []},
  reportedBy: {type: [String], default: []},
  reports: {type: [{
    reporterId: {type: String},
    reason: {type: String, default: 'other'},
    context: {type: String, default: ''},
    createdAt: {type: Date, default: Date.now},
  }], default: []},
};

const replySchema = new mongoose.Schema({
  authorId: {type: String, required: true},
  alias: {type: String, required: true},
  text: {type: String, required: true},
  createdAt: {type: Date, default: Date.now},
  ...engagementFields,
}, {_id: true});

const commentSchema = new mongoose.Schema({
  authorId: {type: String, required: true},
  alias: {type: String, required: true},
  text: {type: String, required: true},
  createdAt: {type: Date, default: Date.now},
  ...engagementFields,
  replies: {type: [replySchema], default: []},
}, {_id: true});

const reportSchema = new mongoose.Schema({
  reporterId: {type: String, required: true, select: false},
  reason: {type: String, default: 'other'},
  context: {type: String, default: ''},
  status: {type: String, enum: ['pending', 'resolved', 'dismissed'], default: 'pending'},
  createdAt: {type: Date, default: Date.now},
}, {_id: true});

const communityContentSchema = new mongoose.Schema({
  communityId: {type: String, required: true, index: true},
  authorId: {type: String, required: true, select: false},
  alias: {type: String, required: true},
  text: {type: String, default: ''},
  link: {type: String, default: ''},
  media: {type: mediaSchema, default: null},
  state: {type: String, enum: ['queued', 'published', 'rejected', 'removed'], default: 'queued', index: true},
  score: {type: Number, default: 0},
  reactions: [{userId: {type: String}, value: String}],
  voters: [{userId: {type: String}, value: Number}],
  comments: {type: [commentSchema], default: []},
  commentIdentities: {type: [{
    userId: {type: String},
    alias: {type: String},
  }], default: []},
  pinned: {type: Boolean, default: false},
  moderation: {
    status: {type: String, default: 'none'},
    reportsCount: {type: Number, default: 0},
    reports: {type: [reportSchema], default: []},
  },
  publishedAt: Date,
}, {timestamps: true, collection: 'community_content'});

communityContentSchema.index({communityId: 1, state: 1, score: -1, createdAt: 1});

module.exports = mongoose.model('CommunityContent', communityContentSchema);
