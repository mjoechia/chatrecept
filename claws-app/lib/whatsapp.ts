// Meta WhatsApp Cloud API wrapper. Talks to the Graph API send-message
// endpoint. Two env vars must be set on the deployment:
//
//   META_WHATSAPP_TOKEN   — system-user permanent access token (preferred)
//                           or the short-lived dashboard token while testing.
//                           Starts with EAA…
//   META_PHONE_NUMBER_ID  — the WhatsApp Business phone NUMBER ID — NOT the
//                           phone number itself. Visible in Meta dashboard
//                           under WhatsApp → API Setup as "Phone number ID".
//
// Messaging window: outside the 24-hour "customer service window" Meta only
// allows approved template messages. For OTPs, signup verification, or any
// first-contact message, you MUST use a template. The free-form text helper
// below is included for in-window replies; it will fail outside the window.

const GRAPH_API_VERSION = 'v22.0'

// A template "component" is a section of the template (header, body, button)
// that may contain variable parameters substituted at send time. For the
// built-in `hello_world` template the components are not needed at all.
// For an OTP authentication template, you'll pass a body component with one
// text parameter (the code).
export interface TemplateComponent {
  type:        'header' | 'body' | 'button'
  sub_type?:   'url' | 'quick_reply'
  index?:      number  // for button components
  parameters?: TemplateParameter[]
}

export type TemplateParameter =
  | { type: 'text'; text: string }
  | { type: 'currency'; currency: { fallback_value: string; code: string; amount_1000: number } }
  | { type: 'date_time'; date_time: { fallback_value: string } }

export interface SendTemplateArgs {
  to:            string                 // +<country><digits>, e.g. +6591234567
  templateName:  string                 // exact template name as approved in Meta
  languageCode?: string                 // BCP-47 code, default 'en_US'
  components?:   TemplateComponent[]
}

interface MetaSendResponse {
  messaging_product: 'whatsapp'
  contacts?:         Array<{ input: string; wa_id: string }>
  messages?:         Array<{ id: string }>
  error?:            { message: string; type: string; code: number; error_subcode?: number; fbtrace_id?: string }
}

// Normalises a WA number to the bare digits format Meta expects (no + sign,
// no spaces, no dashes). Returns the cleaned number or throws if it's
// implausibly short.
function normaliseRecipient(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 8) {
    throw new Error(`Invalid WhatsApp recipient: "${raw}" (need country code + number)`)
  }
  return digits
}

function getCredentials(): { token: string; phoneId: string } {
  const token   = process.env.META_WHATSAPP_TOKEN
  const phoneId = process.env.META_PHONE_NUMBER_ID
  if (!token || !phoneId) {
    throw new Error(
      'WhatsApp not configured — set META_WHATSAPP_TOKEN and META_PHONE_NUMBER_ID in Railway env',
    )
  }
  return { token, phoneId }
}

// Sends a templated WhatsApp message. Returns the message ID (WAMID) on
// success. Throws with the full Meta error payload on failure so the
// caller can surface specifics (template not approved, recipient not in
// allowed list during dev, etc.).
export async function sendWhatsAppTemplate(args: SendTemplateArgs): Promise<{ wamid: string }> {
  const { token, phoneId } = getCredentials()
  const recipient = normaliseRecipient(args.to)

  const body = {
    messaging_product: 'whatsapp',
    to:                recipient,
    type:              'template',
    template: {
      name:     args.templateName,
      language: { code: args.languageCode ?? 'en_US' },
      ...(args.components && args.components.length > 0 ? { components: args.components } : {}),
    },
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneId}/messages`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
    },
  )

  const json = await res.json() as MetaSendResponse
  if (!res.ok || json.error) {
    const err = json.error
      ? `${json.error.message} (code=${json.error.code}${json.error.error_subcode ? `, subcode=${json.error.error_subcode}` : ''})`
      : `HTTP ${res.status}`
    throw new Error(`WhatsApp send failed: ${err}`)
  }
  const wamid = json.messages?.[0]?.id
  if (!wamid) {
    throw new Error(`WhatsApp send returned no message id: ${JSON.stringify(json)}`)
  }
  return { wamid }
}

// In-window text reply. Only works if the recipient messaged you in the
// past 24 hours. For first-contact you must use sendWhatsAppTemplate.
export async function sendWhatsAppText(args: { to: string; body: string }): Promise<{ wamid: string }> {
  const { token, phoneId } = getCredentials()
  const recipient = normaliseRecipient(args.to)

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneId}/messages`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to:                recipient,
        type:              'text',
        text:              { body: args.body },
      }),
    },
  )

  const json = await res.json() as MetaSendResponse
  if (!res.ok || json.error) {
    const err = json.error ? `${json.error.message} (code=${json.error.code})` : `HTTP ${res.status}`
    throw new Error(`WhatsApp send failed: ${err}`)
  }
  const wamid = json.messages?.[0]?.id
  if (!wamid) throw new Error('WhatsApp send returned no message id')
  return { wamid }
}
