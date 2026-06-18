const COLORS = {
  background: '#FFF6F9',
  surface: '#FFFFFF',
  accent: '#EC407A',
  primary: '#F48FB1',
  deepText: '#32111F',
  mutedText: '#6B4B58',
  border: '#F8C9D8',
};

const DEFAULT_ACTION_URL = process.env.TOUCH_APP_URL || 'https://dophera.tech';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function greeting(name) {
  const normalized = typeof name === 'string' ? name.trim() : '';
  return normalized ? `Hi ${normalized}` : 'Hi there';
}

function paragraph(lines) {
  return lines.map(line => `<p style="margin:0 0 16px;color:${COLORS.mutedText};font-size:16px;line-height:1.65;">${line}</p>`).join('');
}

function ctaButton(label, url) {
  if (!label) return '';

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:28px 0 24px;">
                  <tr>
                    <td align="center">
                      <a href="${escapeHtml(url)}" style="display:block;max-width:240px;padding:15px 22px;border-radius:12px;background:${COLORS.accent};color:#FFFFFF;text-decoration:none;font-size:16px;line-height:1.2;font-weight:900;text-align:center;box-shadow:0 10px 22px rgba(236,64,122,0.24);">${escapeHtml(label)}</a>
                    </td>
                  </tr>
                </table>`;
}

function buildLayout({title, preheader, bodyHtml, ctaLabel, ctaUrl = DEFAULT_ACTION_URL}) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:${COLORS.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${COLORS.background};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:24px;overflow:hidden;box-shadow:0 18px 44px rgba(194,24,91,0.12);">
            <tr>
              <td style="padding:28px 28px 20px;background:linear-gradient(135deg, ${COLORS.background} 0%, #FFFFFF 60%, #FFEFF3 100%);">
                <div style="color:${COLORS.accent};font-size:30px;font-weight:900;letter-spacing:0;">Touch</div>
                <h1 style="margin:22px 0 0;color:${COLORS.deepText};font-size:28px;line-height:1.2;font-weight:900;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 26px;border-top:1px solid ${COLORS.border};color:${COLORS.mutedText};font-size:13px;line-height:1.5;">
                You are receiving this email because you used Touch. If you did not request this, contact Touch Support.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildText({title, greetingLine, lines, ctaLabel, ctaUrl = DEFAULT_ACTION_URL}) {
  return [
    title,
    '',
    greetingLine,
    '',
    ...lines,
    '',
    ctaLabel ? `${ctaLabel}: ${ctaUrl}` : null,
    '',
    'Team Touch',
  ].filter(Boolean).join('\n');
}

function makeEmail({from, to, subject, name, title, preheader, lines, ctaLabel, ctaUrl}) {
  const safeGreeting = escapeHtml(greeting(name));
  const safeLines = lines.map(escapeHtml);
  const bodyHtml = [
    `<p style="margin:0 0 16px;color:${COLORS.deepText};font-size:17px;line-height:1.6;font-weight:800;">${safeGreeting},</p>`,
    paragraph(safeLines),
    `<p style="margin:22px 0 0;color:${COLORS.deepText};font-size:16px;line-height:1.6;font-weight:800;">Team Touch</p>`,
    ctaButton(ctaLabel, ctaUrl || DEFAULT_ACTION_URL),
  ].join('');

  return {
    from,
    to,
    subject,
    html: buildLayout({title, preheader, bodyHtml, ctaLabel, ctaUrl}),
    text: buildText({
      title,
      greetingLine: `${greeting(name)},`,
      lines,
      ctaLabel,
      ctaUrl,
    }),
  };
}

function buildWelcomeEmail({to, name, actionUrl} = {}) {
  return makeEmail({
    from: 'Touch <hello-touch@dophera.tech>',
    to,
    subject: 'Welcome to Touch',
    title: 'Welcome to Touch',
    preheader: 'Your Touch account has been created successfully.',
    name,
    ctaLabel: 'Complete your profile',
    ctaUrl: actionUrl,
    lines: [
      'Welcome to Touch.',
      'Your account has been created successfully. You are now part of the early group helping shape what Touch becomes.',
      'Touch is still growing. Right now, we are building the foundation: profiles, social posting, communities, feeds, notifications, and the systems that will make the app feel alive.',
      'You can start by completing your profile so your identity is ready as new features roll out.',
      'Thanks for being early.',
    ],
  });
}

function buildProfileCompletedEmail({to, name, actionUrl} = {}) {
  return makeEmail({
    from: 'Touch Account <account-touch@dophera.tech>',
    to,
    subject: 'Your Touch profile is ready',
    title: 'Your Touch profile is ready',
    preheader: 'Your profile is now ready across Touch.',
    name,
    ctaLabel: 'Open Touch',
    ctaUrl: actionUrl,
    lines: [
      'Your Touch profile is now ready.',
      'This profile will become your identity across Touch. As we continue building posts, feeds, communities, and social features, this is where people will discover who you are and what you share.',
      'We are actively working to bring the full Touch idea to life, and your profile is the first step.',
      'Thanks for building with us from the beginning.',
    ],
  });
}

function buildBugReportConfirmationEmail({to, name, summary, actionUrl} = {}) {
  return makeEmail({
    from: 'Touch Support <support-touch@dophera.tech>',
    to,
    subject: 'We received your bug report',
    title: 'We received your bug report',
    preheader: 'Thanks for helping improve Touch.',
    name,
    ctaLabel: 'Open Touch',
    ctaUrl: actionUrl,
    lines: [
      'Thanks for reporting this issue.',
      'We received your bug report and our team will review it. Reports like yours help us find problems faster and make Touch more stable for everyone.',
      `Bug reported: ${summary || 'Not provided'}`,
      'If we need more details, we may contact you at this email address.',
      'Thanks for helping improve Touch.',
    ],
  });
}

function buildFeatureSuggestionConfirmationEmail({to, name, title, description, actionUrl} = {}) {
  return makeEmail({
    from: 'Touch Ideas <ideas-touch@dophera.tech>',
    to,
    subject: 'We received your feature idea',
    title: 'We received your feature idea',
    preheader: 'Thanks for helping shape Touch.',
    name,
    ctaLabel: 'Open Touch',
    ctaUrl: actionUrl,
    lines: [
      'Thanks for sharing your idea with us.',
      'We received your feature suggestion and will consider it as we continue shaping Touch. Since the app is still early, thoughtful ideas from users can directly influence what we build next.',
      `Feature suggested: ${title || 'Not provided'}`,
      `Description: ${description || 'Not provided'}`,
      'We cannot promise every idea will be built, but every useful suggestion helps us understand what Touch should become.',
      'Thanks for helping shape the future of Touch.',
    ],
  });
}

function buildAdminFeedbackEmail(payload = {}) {
  const isBug = payload.type === 'Bug Report';
  const detailLines = [
    `User ID: ${payload.userId || 'Not available'}`,
    `User Email: ${payload.userEmail || 'Not available'}`,
    isBug ? `What happened: ${payload.whatHappened || 'Not provided'}` : `Title: ${payload.title || 'Not provided'}`,
    isBug ? `Steps to reproduce: ${payload.stepsToReproduce || 'Not provided'}` : `Description: ${payload.description || 'Not provided'}`,
    payload.screenshotUrl ? `Screenshot: ${payload.screenshotUrl}` : null,
  ].filter(Boolean);

  return makeEmail({
    from: 'Touch Feedback <support-touch@dophera.tech>',
    to: payload.to,
    subject: `Touch ${payload.type}: ${payload.title || payload.whatHappened || 'New feedback'}`,
    title: `Touch ${payload.type}`,
    preheader: 'New feedback submitted on Touch.',
    name: 'Touch team',
    ctaLabel: null,
    lines: detailLines,
  });
}

module.exports = {
  buildWelcomeEmail,
  buildProfileCompletedEmail,
  buildBugReportConfirmationEmail,
  buildFeatureSuggestionConfirmationEmail,
  buildAdminFeedbackEmail,
  escapeHtml,
};
