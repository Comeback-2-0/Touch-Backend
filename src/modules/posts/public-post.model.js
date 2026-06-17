const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['image'],
      required: true,
    },
    url: {type: String, required: true},
    publicId: {type: String, required: true},
    width: {type: Number, default: 0},
    height: {type: Number, default: 0},
    format: {type: String, default: ''},
  },
  {_id: false},
);

const publicPostSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    authorSnapshot: {
      name: {type: String, default: ''},
      username: {type: String, default: ''},
      profilePicture: {type: String, default: ''},
    },
    text: {type: String, default: ''},
    media: {
      type: [mediaSchema],
      default: [],
      validate: {
        validator: value => value.length <= 10,
        message: 'Only 10 media items are supported',
      },
    },
    visibility: {
      type: String,
      enum: ['public'],
      default: 'public',
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'deleted'],
      default: 'active',
      index: true,
    },
    engagement: {
      likesCount: {type: Number, default: 0, min: 0},
      commentsCount: {type: Number, default: 0, min: 0},
      sharesCount: {type: Number, default: 0, min: 0},
      savesCount: {type: Number, default: 0, min: 0},
      reportsCount: {type: Number, default: 0, min: 0},
    },
    moderation: {
      isFlagged: {type: Boolean, default: false},
      reviewStatus: {
        type: String,
        enum: ['none', 'pending', 'approved', 'rejected'],
        default: 'none',
      },
    },
  },
  {
    collection: 'posts',
    timestamps: true,
  },
);

publicPostSchema.index({createdAt: -1});
publicPostSchema.index({authorId: 1, createdAt: -1});
publicPostSchema.index({status: 1, visibility: 1, createdAt: -1});

module.exports = mongoose.model('PublicPost', publicPostSchema);
