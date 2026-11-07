const cron = require('node-cron');
const Post = require('../modules/posts/post.model');
const {runCommunityPublication} = require('./community-publication');
const {createStage1NotificationOutboxRunner} = require('./stage1NotificationOutbox');
const {createStage1NotificationDeliveryOutboxRunner} = require('./stage1NotificationDeliveryOutbox');
const {createStage1UserGraphOutboxRunner} = require('./stage1UserGraphOutbox');

const runStage1NotificationOutbox = createStage1NotificationOutboxRunner();
const runStage1NotificationDeliveryOutbox = createStage1NotificationDeliveryOutboxRunner();
const runStage1UserGraphOutbox = createStage1UserGraphOutboxRunner();

cron.schedule('* * * * *', async () => {
  try { await runCommunityPublication(); } catch (error) { console.error('[CRON] Community publication failed', error); }
});

cron.schedule('*/10 * * * * *', async () => {
  try { await runStage1NotificationOutbox(); } catch (error) { console.error('[CRON] Stage 1 notification outbox failed', error); }
  try { await runStage1NotificationDeliveryOutbox(); } catch (error) { console.error('[CRON] Stage 1 notification delivery outbox failed', error); }
  try { await runStage1UserGraphOutbox(); } catch (error) { console.error('[CRON] Stage 1 user graph outbox failed', error); }
});

cron.schedule('*/5 * * * *', async () => {
  try {
    const {runCommunityTrending} = require('./community-trending');
    await runCommunityTrending();
  } catch (error) {
    console.error('[CRON] Community trending failed', error);
  }
});

cron.schedule('0 0 * * *', async () => {
  console.log('[CRON] Running post promotion task');

  const groupIds = await Post.distinct('groupId', { isQueued: true });

  for (const groupId of groupIds) {
    const topPost = await Post.findOne({ groupId, isQueued: true }).sort({ votes: -1 });

    if (topPost) {
      topPost.isQueued = false;
      topPost.approvedAt = new Date();
      topPost.votes = 0;
      await topPost.save();

      // Delete or reset other queue items
      await Post.updateMany(
        { groupId, isQueued: true, _id: { $ne: topPost._id } },
        { $set: { votes: 0 } }
      );
    }
  }
});

// Retrying is independent of request delivery: failed mail never loses a saved request.
let retryingDeletionEmails=false;
cron.schedule('*/5 * * * *',async()=>{
 if(retryingDeletionEmails)return;
 retryingDeletionEmails=true;
 try{await require('../modules/users/account-deletion.service').createAccountDeletionService().retryNotifications();}
 catch{console.error('[CRON] Deletion email retry failed');}
 finally{retryingDeletionEmails=false;}
});
