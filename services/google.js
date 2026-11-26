const { OAuth2Client } = require('google-auth-library')

// Client construit seulement si les identifiants sont présents, comme sur Wayd : l'API démarre
// tant que Google Cloud Console n'est pas configuré, et /auth/google renvoie alors une erreur propre.
function createGoogle(env = process.env) {
  const clientId = env.PIOCHEO_GOOGLE_CLIENT_ID
  const secret = env.PIOCHEO_GOOGLE_CLIENT_SECRET
  const callback = env.PIOCHEO_GOOGLE_CALLBACK_URL
  return { clientId, client: clientId && secret && callback ? new OAuth2Client(clientId, secret, callback) : null }
}

module.exports = { createGoogle }
