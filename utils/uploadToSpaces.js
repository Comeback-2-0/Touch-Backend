// utils/uploadToSpaces.js
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const s3 = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT,
  region: "sgp1",
  credentials: {
    accessKeyId: process.env.SPACES_KEY,
    secretAccessKey: process.env.SPACES_SECRET,
  },
});

const uploadToSpaces = async (fileBuffer, originalName, mimeType) => {
  const extension = path.extname(originalName);
  const key = `anonymous/${uuidv4()}${extension}`;

  const upload = new Upload({
    client: s3,
    params: {
      Bucket: process.env.SPACES_BUCKET,
      Key: key,
      Body: fileBuffer,
      ACL: "public-read",
      ContentType: mimeType,
    },
  });

  await upload.done();

  return `${process.env.SPACES_CDN}/${key}`;
};

module.exports = uploadToSpaces;