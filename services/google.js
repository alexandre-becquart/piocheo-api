const { OAuth2Client } = require('google-auth-library')

const PROD_CALLBACK = 'https://api.piocheo.com/auth/google/callback'
const DEV_CALLBACK = 'http://localhost:3100/auth/google/callback'

// Comme sur Wayd, l'adresse de retour Google est connue d'avance : en production c'est
// toujours l'API publique, il n'y a donc que l'identifiant et le secret à fournir.
function callbackUrl(env, production) {
  const value = (env.PIOCHEO_GOOGLE_CALLBACK_URL || env.GOOGLE_CALLBACK_URL || '').trim()
  if (!value) return production ? PROD_CALLBACK : DEV_CALLBACK
  // Une valeur localhost copiée depuis .env.example enverrait les joueurs sur leur propre machine.
  if (production && /\/\/(localhost|127\.0\.0\.1)[:/]/.test(value)) {
    console.warn(`PIOCHEO_GOOGLE_CALLBACK_URL ignorée en production (${value}), utilisation de ${PROD_CALLBACK}.`)
    return PROD_CALLBACK
  }
  return value
}

// Client construit seulement si les identifiants sont présents : l'API démarre tant que
// Google Cloud Console n'est pas configuré, et /auth/google renvoie alors une erreur propre.
function createGoogle(env = process.env, production = env.NODE_ENV === 'production') {
  const clientId = (env.PIOCHEO_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID || '').trim()
  const secret = (env.PIOCHEO_GOOGLE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET || '').trim()
  const callback = callbackUrl(env, production)
  return { clientId, callback, client: clientId && secret ? new OAuth2Client(clientId, secret, callback) : null }
}

module.exports = { createGoogle, PROD_CALLBACK, DEV_CALLBACK }
