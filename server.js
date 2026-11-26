require('dotenv').config()
const mongoose = require('mongoose')
const { createApp } = require('./app')
const models = require('./models')
const { createMailer } = require('./services/mailer')
const { createGoogle } = require('./services/google')
const { envOrigins } = require('./_helpers/corsOrigins')
const { importCatalogue } = require('./services/catalogue')

// Comme Wayd : les adresses de production (piocheo.com, api.piocheo.com) sont dans le code.
// Coolify n'a à fournir que les secrets (JWT, MongoDB, Google, Resend).
async function main() {
  const production = process.env.NODE_ENV === 'production'
  const google = createGoogle(process.env, production)
  const app = createApp({
    secret: process.env.PIOCHEO_JWT_SECRET,
    allowedOrigins: envOrigins(),
    production,
    trustProxy: process.env.PIOCHEO_TRUST_PROXY === undefined ? (production ? 1 : 0) : Number(process.env.PIOCHEO_TRUST_PROXY),
    webUrl: process.env.PIOCHEO_WEB_URL || process.env.CLIENT_URL,
    google,
    mailer: createMailer(),
  })
  if (!process.env.PIOCHEO_MONGODB_URI) throw new Error('Configure PIOCHEO_MONGODB_URI.')
  await mongoose.connect(process.env.PIOCHEO_MONGODB_URI)
  await Promise.all(Object.values(models).map(model => model.init()))
  // Ajoute au démarrage les jeux du catalogue qui manquent (sans toucher aux fiches existantes).
  if (process.env.PIOCHEO_IMPORT_CATALOGUE !== 'false') {
    try {
      const { added, total } = await importCatalogue()
      if (added) console.log(`Catalogue : ${added} jeux ajoutés sur ${total}.`)
    } catch (error) {
      console.error(`Import du catalogue impossible : ${error.message}`)
    }
  }
  app.listen(Number(process.env.PORT || 3100), process.env.HOST || '127.0.0.1', () => {
    console.log(`API Piochéo démarrée (${production ? 'production' : 'développement'}). Google : ${google.client ? google.callback : 'non configuré'}.`)
  })
}

main().catch(error => { console.error(error.message); process.exitCode = 1; void mongoose.disconnect() })
