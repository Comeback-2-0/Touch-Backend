require('dotenv').config();
const admin = require('firebase-admin');
const {getPostgresClient} = require('../src/database/postgresClient');

async function run() {
  const sql = getPostgresClient();
  console.log('Fetching active device tokens from database...');
  const rows = await sql`
    SELECT nd.token, nd.user_id, u.email 
    FROM notification_devices nd
    LEFT JOIN users u ON nd.user_id = u.id
    WHERE nd.revoked_at IS NULL
  `;

  console.log(`Found ${rows.length} active devices.`);

  if (rows.length === 0) {
    console.log('No devices to notify.');
    process.exit(0);
  }

  console.log('Initializing Firebase Admin SDK...');
  const options = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? {credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))}
    : {credential: admin.credential.applicationDefault()};
  
  if (!admin.apps.length) admin.initializeApp(options);
  const messaging = admin.messaging();

  console.log('Sending broadcast message...');
  
  // Track success by email
  const successEmails = [];

  for (const row of rows) {
    try {
      const response = await messaging.send({
        token: row.token,
        notification: {
          title: 'New Message',
          body: 'Hi'
        }
      });
      console.log(`Successfully sent to token for email: ${row.email || 'Unknown (User ID: ' + row.user_id + ')'}`);
      successEmails.push(row.email || 'Unknown');
    } catch (err) {
      console.error(`Failed to send to token for email: ${row.email} - Error: ${err.message}`);
    }
  }

  console.log(`\nFinished sending! Successful emails: ${[...new Set(successEmails)].join(', ')}`);
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
