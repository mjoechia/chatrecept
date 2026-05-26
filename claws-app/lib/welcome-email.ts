// HTML builder for the admin-sent welcome email. Mirrors the Supabase
// "Confirm signup" template (3-step illustration + brand palette) but
// targets a one-click set-password link instead of an email-confirmation
// link, since the admin has already vouched for the user.

export interface WelcomeEmailArgs {
  name:           string | null
  email:          string
  setPasswordUrl: string
}

export function buildWelcomeEmail(args: WelcomeEmailArgs): { subject: string; html: string } {
  const greeting = args.name
    ? `Hi ${escapeHtml(args.name)}, welcome to JC CLAWs.`
    : 'Welcome to JC CLAWs.'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Welcome to JC CLAWs</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f6ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#12304f;">

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f3f6ff;">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background-color:#ffffff;border:1px solid #dde8f5;border-radius:12px;">

        <tr>
          <td style="padding:28px 32px 4px 32px;text-align:center;">
            <p style="margin:0;font-size:13px;font-weight:700;color:#006092;letter-spacing:2px;text-transform:uppercase;">JC CLAWs</p>
            <p style="margin:4px 0 0 0;font-size:12px;color:#94afd5;">AI Territory Intelligence · Singapore</p>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px 0 32px;">
            <h1 style="margin:0 0 10px 0;font-size:22px;font-weight:700;color:#12304f;line-height:1.3;">
              ${greeting}
            </h1>
            <p style="margin:0;font-size:15px;line-height:1.5;color:#425d7f;">
              Your account is ready. Set your password to sign in — the link below logs you in once and lets you pick a password you'll remember.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 32px 0 32px;">
            <div style="background-color:#f3f6ff;border:1px solid #dde8f5;border-radius:8px;padding:16px;">
              <p style="margin:0;font-size:11px;font-weight:700;color:#94afd5;letter-spacing:2px;text-transform:uppercase;">Your account</p>
              <p style="margin:6px 0 0 0;font-size:14px;color:#12304f;">
                <span style="color:#94afd5;">Email:</span> <span style="font-weight:600;">${escapeHtml(args.email)}</span>
              </p>
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px 4px 32px;text-align:center;">
            <a href="${escapeHtmlAttr(args.setPasswordUrl)}" style="display:inline-block;background-color:#006092;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:10px;">
              Set my password →
            </a>
          </td>
        </tr>

        <tr>
          <td style="padding:6px 32px 0 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94afd5;line-height:1.5;">
              Open this link in the same browser to set your password. It expires in 24 hours.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 24px 4px 24px;">
            <p style="margin:0 0 12px 8px;font-size:11px;font-weight:700;color:#94afd5;letter-spacing:2px;text-transform:uppercase;">What's inside</p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td width="33%" valign="top" style="padding:14px 10px;text-align:center;background-color:#f3f6ff;border-radius:8px;">
                  <div style="font-size:11px;font-weight:700;color:#94afd5;letter-spacing:2px;">01</div>
                  <div style="font-size:30px;line-height:1;margin:8px 0;">📍</div>
                  <div style="font-size:14px;font-weight:600;color:#12304f;">Enter Postcode</div>
                  <div style="font-size:12px;color:#425d7f;margin-top:4px;line-height:1.4;">Any SG postal — Orchard, Tampines, Tuas.</div>
                </td>
                <td width="8" style="font-size:0;line-height:0;">&nbsp;</td>
                <td width="33%" valign="top" style="padding:14px 10px;text-align:center;background-color:#f3f6ff;border-radius:8px;">
                  <div style="font-size:11px;font-weight:700;color:#94afd5;letter-spacing:2px;">02</div>
                  <div style="font-size:30px;line-height:1;margin:8px 0;">🏢</div>
                  <div style="font-size:14px;font-weight:600;color:#12304f;">See Businesses</div>
                  <div style="font-size:12px;color:#425d7f;margin-top:4px;line-height:1.4;">Phone, email, IG, FB, WhatsApp — scored by reachability.</div>
                </td>
                <td width="8" style="font-size:0;line-height:0;">&nbsp;</td>
                <td width="33%" valign="top" style="padding:14px 10px;text-align:center;background-color:#f3f6ff;border-radius:8px;">
                  <div style="font-size:11px;font-weight:700;color:#94afd5;letter-spacing:2px;">03</div>
                  <div style="font-size:30px;line-height:1;margin:8px 0;">💬</div>
                  <div style="font-size:14px;font-weight:600;color:#12304f;">Get Report</div>
                  <div style="font-size:12px;color:#425d7f;margin-top:4px;line-height:1.4;">WhatsApp report on outreach: who replied, who needs you.</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:18px 32px 28px 32px;border-top:1px solid #dde8f5;margin-top:16px;">
            <p style="margin:16px 0 0 0;font-size:12px;color:#94afd5;line-height:1.5;">
              <strong style="color:#425d7f;">Didn't expect this email?</strong> An admin invited you to JC CLAWs. If that doesn't match, you can ignore this — the link won't do anything until clicked.
            </p>
          </td>
        </tr>

      </table>

      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;">
        <tr>
          <td style="padding:16px 32px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#94afd5;line-height:1.5;">
              JC CLAWs · ChatRecept · Singapore
            </p>
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>

</body>
</html>`

  return {
    subject: 'Welcome to JC CLAWs — set your password →',
    html,
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// For values that go into an attribute; same escapes work.
function escapeHtmlAttr(s: string): string {
  return escapeHtml(s)
}
