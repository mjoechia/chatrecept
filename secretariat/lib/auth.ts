const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://chatrecept.chat'

// Redirect to the central login on chatrecept.chat, passing the current
// secretariat origin as the redirect target after successful OAuth.
export function redirectToLogin() {
  const redirect = encodeURIComponent(window.location.origin)
  window.location.href = `${APP_URL}/login?redirect=${redirect}`
}
