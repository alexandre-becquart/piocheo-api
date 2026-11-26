require('dotenv').config()
const mongoose = require('mongoose')
const { Game } = require('../models')
const { importCatalogue } = require('../services/catalogue')

// npm run catalogue            ajoute les jeux manquants
// npm run catalogue -- --plan  affiche seulement le nombre de jeux à ajouter
async function main() {
  const dryRun = process.argv.includes('--plan')
  if (!process.env.PIOCHEO_MONGODB_URI) throw new Error('Configure PIOCHEO_MONGODB_URI.')
  await mongoose.connect(process.env.PIOCHEO_MONGODB_URI)
  await Game.init()
  const { total, added, missing } = await importCatalogue({ dryRun })
  console.log(dryRun
    ? `Catalogue : ${missing} jeux à ajouter sur ${total}.`
    : `Catalogue : ${added} jeux ajoutés, ${total - missing} déjà présents.`)
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
  .finally(() => mongoose.disconnect())
