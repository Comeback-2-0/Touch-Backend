const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildWelcomeEmail,
  buildProfileCompletedEmail,
  buildBugReportConfirmationEmail,
  buildFeatureSuggestionConfirmationEmail,
} = require('../../../src/modules/email/email.templates');

test('welcome email uses Touch sender, branded HTML, text fallback, and CTA', () => {
  const email = buildWelcomeEmail({to: 'maya@example.com', name: 'Maya'});

  assert.equal(email.from, 'Touch <hello-touch@dophera.tech>');
  assert.equal(email.to, 'maya@example.com');
  assert.equal(email.subject, 'Welcome to Touch');
  assert.match(email.html, /#FFF6F9/i);
  assert.match(email.html, /#EC407A/i);
  assert.match(email.html, /Complete your profile/);
  assert.match(email.html, /Hi Maya/);
  assert.match(email.text, /Welcome to Touch/);
  assert.match(email.text, /Complete your profile/);
});

test('email CTA buttons are centered lower in the body with moderate radius', () => {
  const email = buildFeatureSuggestionConfirmationEmail({
    to: 'maya@example.com',
    name: 'Maya',
    title: 'Polls',
    description: 'Voting',
  });

  assert.match(email.html, /<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:28px 0 24px;">/);
  assert.match(email.html, /<td align="center">/);
  assert.match(email.html, /border-radius:12px/);
  assert.doesNotMatch(email.html, /border-radius:999px/);
  assert.ok(email.html.indexOf('Team Touch</p>') < email.html.indexOf('Open Touch</a>'));
});

test('profile completed email uses account sender and profile-ready copy', () => {
  const email = buildProfileCompletedEmail({to: 'maya@example.com', name: 'Maya'});

  assert.equal(email.from, 'Touch Account <account-touch@dophera.tech>');
  assert.equal(email.subject, 'Your Touch profile is ready');
  assert.match(email.html, /your identity across Touch/i);
  assert.match(email.text, /Your Touch profile is now ready/);
});

test('feedback confirmation emails escape user content and use correct senders', () => {
  const bug = buildBugReportConfirmationEmail({
    to: 'maya@example.com',
    name: 'Maya',
    summary: '<script>alert(1)</script>',
  });
  const feature = buildFeatureSuggestionConfirmationEmail({
    to: 'maya@example.com',
    name: 'Maya',
    title: 'Polls',
    description: '<b>Voting</b>',
  });

  assert.equal(bug.from, 'Touch Support <support-touch@dophera.tech>');
  assert.equal(bug.subject, 'We received your bug report');
  assert.doesNotMatch(bug.html, /<script>/);
  assert.match(bug.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);

  assert.equal(feature.from, 'Touch Ideas <ideas-touch@dophera.tech>');
  assert.equal(feature.subject, 'We received your feature idea');
  assert.doesNotMatch(feature.html, /<b>Voting<\/b>/);
  assert.match(feature.text, /Polls/);
});
