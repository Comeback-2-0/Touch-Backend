const defaultUploadService = require('./upload.service');

function createUploadController(uploadService = defaultUploadService) {
  return {
    uploadProfilePicture: async (req, res) => {
      try {
        const result = await uploadService.uploadProfilePicture(req.file);
        return res.status(200).json(result);
      } catch (err) {
        return res.status(err.statusCode || 500).json({ error: err.message || 'Upload failed' });
      }
    },
  };
}

module.exports = createUploadController;
