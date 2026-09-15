const express = require('express');
const router = express.Router();
const communityRepository = require('./community.repository');
const auth = require('../../middleware/auth');
const {createInviteToken} = require('./community-invite.service');
const {communityForViewer, canManageCommunity} = require('./community-access');
const {normalizeJoinRequestIdentity} = require('./community-join-request.service');
const {normalizeQueueSchedule} = require('./community-publication.service');

function sendError(res, err) {
  const status = err.statusCode || 500;
  return res.status(status).json({error: err.message || 'Request failed'});
}

function deriveQueueScheduleMinutes(queueMode, queueSchedule) {
  if (queueMode !== 'scheduled' || !queueSchedule) return null;
  if (queueSchedule.type === 'interval') return Number(queueSchedule.intervalHours || 1) * 60;
  if (queueSchedule.type === 'daily') return Number(queueSchedule.everyDays || 1) * 24 * 60;
  return Number(queueSchedule.everyDays || 1) * 24 * 60;
}

function buildQueueSettings(input = {}, current = {}) {
  const queueMode = input.queueMode || current.queueMode || 'manual';
  if (queueMode === 'manual') {
    return {queueMode: 'manual', queueSchedule: null, queueScheduleMinutes: null};
  }
  const rawSchedule = input.queueSchedule || current.queueSchedule;
  if (!rawSchedule) {
    const minutes = Number(input.queueScheduleMinutes || current.queueScheduleMinutes || 0) || null;
    return {queueMode: 'scheduled', queueSchedule: null, queueScheduleMinutes: minutes};
  }
  const queueSchedule = normalizeQueueSchedule(rawSchedule);
  return {
    queueMode: 'scheduled',
    queueSchedule,
    queueScheduleMinutes: deriveQueueScheduleMinutes('scheduled', queueSchedule),
  };
}

router.get('/', async (req, res) => {
  try {
    const communities = await communityRepository.listAll();
    res.json(communities);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch communities' });
  }
});

router.post('/', auth, async (req, res) => {
  const {name, description = '', image = '', rules = '', contentVisibility = 'public', joinMode = 'open', showLeadership = false, queueMode = 'manual', queueScheduleMinutes = null, queueSchedule = null} = req.body || {};
  if (!String(name).trim()) return res.status(400).json({error: 'Community name is required'});
  if (!['public', 'members'].includes(contentVisibility)) return res.status(400).json({error: 'Invalid content visibility'});
  if (!['open', 'approval', 'invite-only'].includes(joinMode)) return res.status(400).json({error: 'Invalid join mode'});
  if (!['manual', 'scheduled'].includes(queueMode)) return res.status(400).json({error: 'Invalid queue mode'});
  try {
    const queueSettings = buildQueueSettings({queueMode, queueScheduleMinutes, queueSchedule});
    const community = await communityRepository.create({
      name: String(name).trim(), description: String(description), image: String(image), rules: String(rules),
      contentVisibility, joinMode, showLeadership: Boolean(showLeadership),
      ...queueSettings,
      createdBy: req.user.id,
    });
    await communityRepository.audit({communityId: community.id, actorId: req.user.id, action: 'community_created', targetType: 'community', targetId: community.id});
    return res.status(201).json({community, membership: {role: 'owner', status: 'active'}});
  } catch (err) {
    return sendError(res, err.statusCode ? err : Object.assign(new Error('Failed to create community'), {statusCode: 500}));
  }
});

router.get('/:communityId', auth, async (req, res) => {
  try {
    const community = await communityRepository.findById(req.params.communityId);
    if (!community) return res.status(404).json({error: 'Community not found'});
    const membership = await communityRepository.getMembership(req.user.id, req.params.communityId);
    const joinRequest = membership?.status === 'active'
      ? null
      : await communityRepository.getJoinRequest({userId: req.user.id, communityId: req.params.communityId});
    const pendingJoinRequestCount = canManageCommunity(membership)
      ? await communityRepository.countPendingJoinRequests(req.params.communityId)
      : 0;
    return res.json({
      community: communityForViewer(community, membership),
      membership,
      joinRequest,
      pendingJoinRequestCount,
    });
  } catch (err) {
    return res.status(500).json({error: 'Failed to fetch community'});
  }
});

router.put('/:communityId', auth, async (req, res) => {
  const input = req.body || {};
  if (!['public', 'members'].includes(input.contentVisibility || 'public') || !['open', 'approval', 'invite-only'].includes(input.joinMode || 'open') || !['manual', 'scheduled'].includes(input.queueMode || 'manual')) return res.status(400).json({error: 'Invalid community settings'});
  try {
    const actor = await communityRepository.getMembership(req.user.id, req.params.communityId);
    if (!actor || actor.status !== 'active' || !['owner', 'moderator'].includes(actor.role)) {
      return res.status(403).json({error: 'Moderator permission required'});
    }
    const current = await communityRepository.findById(req.params.communityId);
    if (!current) return res.status(404).json({error: 'Community not found'});
    const queueSettings = buildQueueSettings(input, current);
    const community = await communityRepository.update(req.params.communityId, {
      ...current,
      ...input,
      ...queueSettings,
    });
    if (!community) return res.status(404).json({error: 'Community not found'});
    await communityRepository.audit({communityId: community.id, actorId: req.user.id, action: 'community_settings_updated', targetType: 'community', targetId: community.id});
    return res.json({community});
  } catch (err) {
    return sendError(res, err.statusCode ? err : Object.assign(new Error('Failed to update community'), {statusCode: 500}));
  }
});

router.post('/:communityId/join', auth, async (req, res) => {
  try {
    const community = await communityRepository.findById(req.params.communityId);
    if (!community) return res.status(404).json({error: 'Community not found'});
    if (community.joinMode === 'approval') {
      const identity = normalizeJoinRequestIdentity({
        useAlias: Boolean(req.body?.useAlias),
        alias: req.body?.alias,
        revealUsername: Boolean(req.body?.revealUsername),
        username: req.body?.username || req.user?.username || '',
      });
      const request = await communityRepository.requestJoin({
        userId: req.user.id,
        communityId: req.params.communityId,
        alias: identity.alias,
        revealUsername: identity.revealUsername,
        revealedUsername: identity.revealedUsername,
        note: req.body?.note || '',
      });
      return res.status(202).json({request, joinRequest: request, membership: null});
    }
    if (community.joinMode === 'invite-only') return res.status(403).json({error: 'An invite link is required'});
    const membership = await communityRepository.joinCommunity({
      userId: req.user.id,
      communityId: req.params.communityId,
    });
    return res.status(200).json({community: membership, membership: {role: 'member', status: 'active'}, joinRequest: null});
  } catch (err) {
    return sendError(res, err.statusCode ? err : Object.assign(new Error('Failed to join community'), {statusCode: 500}));
  }
});

router.delete('/:communityId/join-requests/me', auth, async (req, res) => {
  try {
    const cancelled = await communityRepository.cancelJoinRequest({
      userId: req.user.id,
      communityId: req.params.communityId,
    });
    if (!cancelled) return res.status(404).json({error: 'No pending join request to cancel'});
    return res.json({cancelled: true, joinRequest: null});
  } catch {
    return res.status(500).json({error: 'Failed to cancel join request'});
  }
});

router.post('/:communityId/leave', auth, async (req, res) => {
  try { const community = await communityRepository.leaveCommunity({userId: req.user.id, communityId: req.params.communityId}); return res.json({community}); }
  catch { return res.status(500).json({error: 'Failed to leave community'}); }
});

router.get('/:communityId/join-requests', auth, async (req, res) => {
  try {
    const actor = await communityRepository.getMembership(req.user.id, req.params.communityId);
    if (!actor || actor.status !== 'active' || !['owner', 'moderator'].includes(actor.role)) return res.status(403).json({error: 'Moderator permission required'});
    return res.json({requests: await communityRepository.listJoinRequests(req.params.communityId)});
  } catch { return res.status(500).json({error: 'Failed to load join requests'}); }
});

router.put('/:communityId/join-requests/:requestId', auth, async (req, res) => {
  const decision = String(req.body?.decision || '');
  if (!['approved', 'declined'].includes(decision)) return res.status(400).json({error: 'Decision must be approved or declined'});
  try {
    const actor = await communityRepository.getMembership(req.user.id, req.params.communityId);
    if (!actor || actor.status !== 'active' || !['owner', 'moderator'].includes(actor.role)) return res.status(403).json({error: 'Moderator permission required'});
    const request = await communityRepository.reviewJoinRequest({requestId: req.params.requestId, reviewerId: req.user.id, decision});
    if (!request || String(request.communityId) !== String(req.params.communityId)) return res.status(404).json({error: 'Pending join request not found'});
    await communityRepository.audit({communityId: req.params.communityId, actorId: req.user.id, action: `join_request_${decision}`, targetType: 'join_request', targetId: req.params.requestId});
    return res.json({request});
  } catch { return res.status(500).json({error: 'Failed to review join request'}); }
});

router.post('/:communityId/invites', auth, async (req, res) => {
  try {
    const actor = await communityRepository.getMembership(req.user.id, req.params.communityId);
    if (!actor || actor.status !== 'active' || !['owner', 'moderator'].includes(actor.role)) return res.status(403).json({error: 'Moderator permission required'});
    const token = createInviteToken();
    const invite = await communityRepository.createInvite({communityId: req.params.communityId, createdBy: req.user.id, token, expiresAt: req.body?.expiresAt || null, maxUses: Number(req.body?.maxUses) || null});
    await communityRepository.audit({communityId: req.params.communityId, actorId: req.user.id, action: 'invite_created', targetType: 'invite', targetId: invite.id});
    return res.status(201).json({invite, token});
  } catch { return res.status(500).json({error: 'Failed to create invite'}); }
});

router.post('/:communityId/invites/accept', auth, async (req, res) => {
  if (!req.body?.token) return res.status(400).json({error: 'Invite token is required'});
  try {
    const community = await communityRepository.acceptInvite({communityId: req.params.communityId, userId: req.user.id, token: req.body.token});
    if (!community) return res.status(404).json({error: 'Invite is invalid, expired, or revoked'});
    return res.json({community, membership: {role: 'member', status: 'active'}});
  } catch { return res.status(500).json({error: 'Failed to accept invite'}); }
});

router.delete('/:communityId/invites/:inviteId', auth, async (req, res) => {
  try {
    const actor = await communityRepository.getMembership(req.user.id, req.params.communityId);
    if (!actor || actor.status !== 'active' || !['owner', 'moderator'].includes(actor.role)) return res.status(403).json({error: 'Moderator permission required'});
    if (!await communityRepository.revokeInvite({communityId: req.params.communityId, inviteId: req.params.inviteId})) return res.status(404).json({error: 'Invite not found'});
    await communityRepository.audit({communityId: req.params.communityId, actorId: req.user.id, action: 'invite_revoked', targetType: 'invite', targetId: req.params.inviteId});
    return res.status(204).end();
  } catch { return res.status(500).json({error: 'Failed to revoke invite'}); }
});

router.put('/:communityId/mute', auth, async (req, res) => {
  try {
    const membership = await communityRepository.getMembership(req.user.id, req.params.communityId);
    if (!membership || membership.status !== 'active') return res.status(404).json({error: 'Active membership not found'});
    const preference = await communityRepository.setCommunityNotificationMute({userId: req.user.id, communityId: req.params.communityId, muted: Boolean(req.body?.muted)});
    return res.json({preference});
  }
  catch { return res.status(500).json({error: 'Failed to update community mute'}); }
});

router.get('/:communityId/audit', auth, async (req, res) => {
  try {
    const actor = await communityRepository.getMembership(req.user.id, req.params.communityId);
    const platformAdmin = req.user.role === 'admin';
    if (!platformAdmin && (!actor || actor.status !== 'active' || !['owner', 'moderator'].includes(actor.role))) return res.status(403).json({error: 'Moderator permission required'});
    return res.json({events: await communityRepository.listAudit(req.params.communityId)});
  } catch { return res.status(500).json({error: 'Failed to load audit history'}); }
});

router.put('/:communityId/platform-suspension', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({error: 'Platform administrator permission required'});
  try {
    const community = await communityRepository.setSuspension(req.params.communityId, Boolean(req.body?.suspended));
    if (!community) return res.status(404).json({error: 'Community not found'});
    await communityRepository.audit({communityId: community.id, actorId: req.user.id, action: community.suspendedAt ? 'platform_suspended' : 'platform_restored', targetType: 'community', targetId: community.id});
    return res.json({community});
  } catch { return res.status(500).json({error: 'Failed to update community suspension'}); }
});

router.put('/:communityId/members/:userId/role', auth, async (req, res) => {
  try {
    const actor = await communityRepository.getMembership(req.user.id, req.params.communityId);
    if (!actor || actor.status !== 'active' || actor.role !== 'owner') return res.status(403).json({error: 'Owner permission required'});
    const role = req.body?.role;
    if (!['member', 'moderator'].includes(role)) return res.status(400).json({error: 'Role must be member or moderator'});
    const membership = await communityRepository.updateMembershipRole({userId: req.params.userId, communityId: req.params.communityId, role});
    if (!membership) return res.status(404).json({error: 'Active member not found'});
    await communityRepository.audit({communityId: req.params.communityId, actorId: req.user.id, action: 'membership_role_updated', targetType: 'membership', targetId: req.params.userId, metadata: {role}});
    return res.json({membership});
  } catch { return res.status(500).json({error: 'Failed to update member role'}); }
});

router.post('/:communityId/ownership-transfers', auth, async (req, res) => {
  try {
    const owner = await communityRepository.getMembership(req.user.id, req.params.communityId);
    const target = await communityRepository.getMembership(req.body?.toUserId, req.params.communityId);
    if (!owner || owner.status !== 'active' || owner.role !== 'owner') return res.status(403).json({error: 'Owner permission required'});
    if (!target || target.status !== 'active') return res.status(400).json({error: 'Ownership may only be transferred to an active member'});
    const transfer = await communityRepository.requestOwnershipTransfer({communityId: req.params.communityId, fromUserId: req.user.id, toUserId: req.body.toUserId});
    await communityRepository.audit({communityId: req.params.communityId, actorId: req.user.id, action: 'ownership_transfer_requested', targetType: 'membership', targetId: req.body.toUserId});
    return res.status(201).json({transfer});
  } catch { return res.status(500).json({error: 'Failed to request ownership transfer'}); }
});

router.post('/:communityId/ownership-transfers/:transferId/accept', auth, async (req, res) => {
  try {
    const transfer = await communityRepository.acceptOwnershipTransfer({transferId: req.params.transferId, userId: req.user.id});
    if (!transfer || String(transfer.community_id) !== String(req.params.communityId)) return res.status(404).json({error: 'Pending ownership transfer not found'});
    await communityRepository.audit({communityId: req.params.communityId, actorId: req.user.id, action: 'ownership_transfer_accepted', targetType: 'membership', targetId: req.user.id});
    return res.json({transfer});
  } catch { return res.status(500).json({error: 'Failed to accept ownership transfer'}); }
});

module.exports = router;
