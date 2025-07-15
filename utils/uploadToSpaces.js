// utils/uploadToSpaces.js
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const spacesEndpoint = new AWS.Endpoint(process.env.SPACES_ENDPOINT);

const s3 = new AWS.S3({
  endpoint: spacesEndpoint,
  accessKeyId: process.env.SPACES_KEY,
  secretAccessKey: process.env.SPACES_SECRET,
});

const uploadToSpaces = async (fileBuffer, originalName, mimeType) => {
  const extension = path.extname(originalName);
  const key = `anonymous/${uuidv4()}${extension}`;

  const params = {
    Bucket: process.env.SPACES_BUCKET,
    Key: key,
    Body: fileBuffer,
    ACL: 'public-read',
    ContentType: mimeType,
  };

  await s3.upload(params).promise();

  return `${process.env.SPACES_CDN}/${key}`;
};

module.exports = uploadToSpaces;