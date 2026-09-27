const test = require('node:test');
const assert = require('node:assert/strict');

test('uploads reel video buffers to Cloudinary as video media', async () => {
  const calls = [];
  const {createReelStorage} = require('../../../src/modules/reels/reel-storage');
  const storage = createReelStorage({
    upload: async (file, options) => {
      calls.push({file, options});
      return {secure_url: 'https://res.cloudinary.com/demo/video/upload/reel.mp4', public_id: 'touch/reels/reel'};
    },
  });

  const result = await storage.upload({buffer: Buffer.from('video'), mimetype: 'video/mp4'});

  assert.deepEqual(result, {
    url: 'https://res.cloudinary.com/demo/video/upload/reel.mp4',
    publicId: 'touch/reels/reel',
  });
  assert.equal(calls[0].file.buffer.toString(), 'video');
  assert.deepEqual(calls[0].options, {folder: 'touch/reels', resource_type: 'video'});
});
