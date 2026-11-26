require('dotenv').config()
const mongoose = require('mongoose')
const { createApp } = require('./app')
const models = require('./models')

async function main() {
  const app = createApp({
    secret: process.env.PIOCHEO_JWT_SECRET,
    allowedOrigins: (process.env.PIOCHEO_WEB_ORIGINS || 'http://localhost:8080').split(',').map(value => value.trim()),
    production: process.env.NODE_ENV === 'production',
    trustProxy: Number(process.env.PIOCHEO_TRUST_PROXY || 0),
  })
  if (!process.env.PIOCHEO_MONGODB_URI) throw new Error('Configure PIOCHEO_MONGODB_URI.')
  await mongoose.connect(process.env.PIOCHEO_MONGODB_URI)
  await Promise.all(Object.values(models).map(model => model.init()))
  app.listen(Number(process.env.PORT || 3100), process.env.HOST || '127.0.0.1', () => {
    console.log('API Piochéo démarrée.')
  })
}

main().catch(error => { console.error(error.message); process.exitCode = 1; void mongoose.disconnect() })
