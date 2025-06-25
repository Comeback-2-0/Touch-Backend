const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'dxacsyqmv',
  api_key: '146362817974255',
  api_secret: 'SSoSY5n_IT-26vC1Se3hcjW5d44',
});

cloudinary.uploader.upload("sample_vid/vid_3.mp4", {
  resource_type: "video"
})
.then(result => console.log("✅ Uploaded:", result.secure_url))
.catch(err => console.error("❌ Upload failed:", err));
