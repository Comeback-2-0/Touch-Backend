require('dotenv').config();
const {
  createAccountDeletionService,
} = require('../src/modules/users/account-deletion.service');
const {closePostgres} = require('../src/database/postgresClient');
const mongoose = require('mongoose');
(async () => {
  try {
    const {shouldUsePostgres} = require('../src/modules/users/user.repository');
    if (!shouldUsePostgres()) await mongoose.connect(process.env.MONGO_URI);
    await createAccountDeletionService().retryNotifications();
  } finally {
    await closePostgres();
    await mongoose.disconnect();
  }
})().catch(() => {
  console.error('Deletion notification retry failed');
  process.exitCode = 1;
});
