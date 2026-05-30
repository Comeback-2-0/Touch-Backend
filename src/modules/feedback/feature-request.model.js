const mongoose = require('mongoose');

const featureRequestSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    userEmail: { type: String, default: '' },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    status: {
      type: String,
      enum: ['open', 'reviewing', 'planned', 'shipped', 'closed'],
      default: 'open',
      index: true,
    },
  },
  { timestamps: true, collection: 'feature_requests' },
);

module.exports = mongoose.model('FeatureRequest', featureRequestSchema);
