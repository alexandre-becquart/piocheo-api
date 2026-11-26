// Comme wayd-api/_helpers/corsOrigins.js : les origines de production sont écrites dans le code,
// la configuration Coolify n'a donc rien à fournir pour que le site parle à l'API.
// PIOCHEO_WEB_ORIGINS (ou ALLOWED_ORIGINS, comme Wayd) ajoute des origines exactes, ex. une préversion.
const PROD_ORIGINS = ['https://piocheo.com', 'https://www.piocheo.com']
const WEB_URL = 'https://piocheo.com'
const DEV_WEB_URL = 'http://localhost:8080'

// « https://piocheo.com/ » ou « https://piocheo.com/connexion » valent « https://piocheo.com » :
// le navigateur envoie toujours l'origine seule.
function normalizeOrigins(values) {
  return values.map(value => String(value).trim()).filter(Boolean).map(value => {
    try { return new URL(value).origin } catch { return value }
  })
}

function envOrigins(env = process.env) {
  return normalizeOrigins(`${env.PIOCHEO_WEB_ORIGINS || ''},${env.ALLOWED_ORIGINS || ''}`.split(','))
}

// En développement, le front peut être ouvert via localhost, 127.0.0.1 ou l'adresse réseau
// affichée par Vue CLI (test sur téléphone). Jamais en production.
function localOrigin(origin) {
  try {
    const { protocol, hostname } = new URL(origin)
    return ['http:', 'https:'].includes(protocol) && (['localhost', '127.0.0.1', '[::1]'].includes(hostname) ||
      /^(10\.\d+|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+$/.test(hostname))
  } catch {
    return false
  }
}

module.exports = { PROD_ORIGINS, WEB_URL, DEV_WEB_URL, normalizeOrigins, envOrigins, localOrigin }
