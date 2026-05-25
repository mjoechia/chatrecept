// Resend REST API wrapper. Used for admin-triggered emails (e.g. the
// welcome / set-password invite). Supabase SMTP handles auth-flow emails
// (confirm signup, reset password) on its own — this is for app-driven
// sends where we want full control over the timing and content.

// Read env at call time, not module load — Railway-style deploys may have
// already-loaded module instances with stale values, and `||` lets us fall
// back when the env is set to an empty string (a common Railway mishap).
function resolveFrom(): string {
  return process.env.RESEND_FROM_EMAIL || 'JC CLAWs <onboarding@resend.dev>'
}

export interface SendEmailArgs {
  to:      string
  subject: string
  html:    string
  from?:   string
}

// Posts the email to Resend's REST API and returns the message id on
// success. Throws with the upstream response body on failure so callers
// can surface a useful error to the admin. The thrown error includes the
// `from` address actually used, which is critical for diagnosing whether
// RESEND_FROM_EMAIL took effect.
export async function sendEmail(args: SendEmailArgs): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured — set it in Railway env')
  }
  const from = args.from ?? resolveFrom()

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from,
      to:      args.to,
      subject: args.subject,
      html:    args.html,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend ${res.status} (from=${from}): ${body}`)
  }
  return res.json() as Promise<{ id: string }>
}
