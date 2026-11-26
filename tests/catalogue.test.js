const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { test } = require('node:test')
const mongoose = require('mongoose')
const { Game } = require('../models')
const { importCatalogue, loadCatalogue } = require('../services/catalogue')

test('Catalogue belge : 100 fiches valides et uniques', async () => {
  const games = loadCatalogue()
  assert.equal(games.length, 100)
  assert.equal(new Set(games.map(game => game.slug)).size, 100)
  for (const game of games) await new Game(game).validate()
})

test('Import du catalogue idempotent et sans écrasement', async t => {
  const uri = new URL(process.env.PIOCHEO_TEST_MONGODB_URI || 'mongodb://127.0.0.1:27029')
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(uri.hostname), 'Utiliser un MongoDB de test local.')
  await mongoose.connect(uri.toString(), { dbName: 'piocheo_test_' + randomUUID().replaceAll('-', '') })
  t.after(async () => {
    try { await mongoose.connection.dropDatabase() }
    finally { await mongoose.disconnect() }
  })
  await Game.init()
  const kept = await Game.create({ slug: 'azul-maison', name: 'AZUL', description: 'Fiche locale.', minPlayers: 2, maxPlayers: 4, minutes: 30, type: 'Famille', scoring: 'points', direction: 'high' })
  const first = await importCatalogue()
  assert.deepEqual(first, { total: 100, added: 99, missing: 99 })
  assert.equal((await Game.findById(kept._id).lean()).description, 'Fiche locale.')
  assert.deepEqual(await importCatalogue(), { total: 100, added: 0, missing: 0 })
  assert.equal(await Game.countDocuments(), 100)
})
