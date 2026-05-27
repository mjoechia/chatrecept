// Thin Slack incoming-webhook wrapper for admin-facing operational
// alerts (Lever 6). No-ops if SLACK_WEBHOOK_URL isn't set, so dev /
// staging doesn't need a webhook configured.
//
// Always fire-and-forget at the call site (`.catch(...)`) so a Slack
// outage never tanks a user-facing request.

export interface SlackMessage {
  text:    string
  blocks?: unknown[]   // Slack block-kit payload, opaque to us
}

export async function sendSlack(msg: SlackMessage): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) return  // not configured — silent no-op

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(msg),
  })

  if (!res.ok) {
    // Surface via the caller's .catch — don't throw in the recordUserSpend
    // path itself, that's wrapped in fire-and-forget.
    throw new Error(`Slack webhook failed (${res.status}): ${await res.text()}`)
  }
}

// Threshold-crossing alert for a per-user monthly cap. Called from
// recordUserSpend when the user crosses 50% / 80% / 100% of their cap
// for the first time in the current month.
export async function sendSpendAlert(args: {
  email:   string
  name:    string | null
  pct:     number     // 0.5 | 0.8 | 1.0
  spent:   number     // current SGD this month
  cap:     number     // monthly cap SGD
}): Promise<void> {
  const display = args.name ?? args.email
  const pctLabel = `${Math.round(args.pct * 100)}%`
  const tone    = args.pct >= 1 ? '🔴' : args.pct >= 0.8 ? '🟠' : '🟡'

  await sendSlack({
    text: `${tone} ${display} hit ${pctLabel} of monthly cap — SGD ${args.spent.toFixed(2)} of SGD ${args.cap}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${tone} *${display}* hit *${pctLabel}* of monthly mapping cap\n*Spent:* SGD ${args.spent.toFixed(2)} / SGD ${args.cap}`,
        },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `<mailto:${args.email}|${args.email}>` }],
      },
    ],
  })
}
