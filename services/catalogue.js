const path = require('node:path')
const fs = require('node:fs')
const Game = require('../models/Game')

// Catalogue de lancement belge (100 jeux). Les fiches sont ajoutées si elles manquent,
// jamais modifiées : une fiche existante (même slug ou même titre) garde ses données et son identifiant.
const FILE = path.join(__dirname, '..', 'data', 'catalogue-belgique.json')
const normalized = name => String(name || '').toLowerCase().normalize('NFKD')
  .replace(/\p{Mark}/gu, '').replace(/[^a-z0-9]/g, '')

function loadCatalogue(file = FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

async function importCatalogue({ games = loadCatalogue(), dryRun = false } = {}) {
  const existing = await Game.find({}, 'slug name').lean()
  const slugs = new Set(existing.map(game => game.slug))
  const names = new Set(existing.map(game => normalized(game.name)))
  const missing = games.filter(game => !slugs.has(game.slug) && !names.has(normalized(game.name)))
  if (dryRun || !missing.length) return { total: games.length, added: 0, missing: missing.length }
  await Promise.all(missing.map(game => new Game(game).validate()))
  const now = new Date()
  const result = await Game.collection.bulkWrite(missing.map(game => ({
    updateOne: {
      filter: { slug: game.slug },
      update: { $setOnInsert: { ...game, createdAt: now, updatedAt: now } },
      upsert: true,
    },
  })), { ordered: false })
  return { total: games.length, added: result.upsertedCount, missing: missing.length }
}

module.exports = { importCatalogue, loadCatalogue, normalized }
