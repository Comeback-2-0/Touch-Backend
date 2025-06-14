const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json'); // path to your downloaded private key JSON

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

module.exports = admin;
