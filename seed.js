require('dotenv').config()
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const { User, Game, Table, Event, Review } = require('./models')

const games = [
  ['cartographes', 'Les Cartographes', 'Dessine les vallées, les villages et les forêts d’un territoire à explorer. Chaque saison te lance un nouveau défi.', 2, 8, 35, 'Stratégie', 'points', 'high', 'indigo', '✦'],
  ['dernier-biscuit', 'Le Dernier Biscuit', 'Collectionne les biscuits et évite les miettes. Le joueur qui en accumule le moins remporte la partie.', 2, 6, 20, 'Famille', 'points', 'low', 'peach', '●'],
  ['lanternes', 'Les Lanternes', 'Éclairez ensemble les sentiers avant que la nuit ne recouvre le village.', 2, 5, 45, 'Coopératif', 'cooperative', 'high', 'blue', '✷'],
  ['mots-en-vrac', 'Mots en vrac', 'Fais deviner tes mots avant la fin du sablier et comparez vos places à la fin.', 3, 8, 25, 'Ambiance', 'rank', 'low', 'yellow', '◆'],
].map(([slug, name, description, minPlayers, maxPlayers, minutes, type, scoring, direction, color, symbol]) => ({
  slug, name, description, minPlayers, maxPlayers, minutes, type, scoring, direction, color, symbol,
}))

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Seed réservé au développement.')
  const uri = process.env.PIOCHEO_MONGODB_URI
  if (!uri) throw new Error('Configure PIOCHEO_MONGODB_URI.')
  const parsed = new URL(uri)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || parsed.pathname !== '/piocheo_dev') {
    throw new Error('Le seed nécessite la base locale piocheo_dev.')
  }
  await mongoose.connect(uri)
  await Promise.all([User, Game, Table, Event, Review].map(model => model.init()))
  const password = await bcrypt.hash('DemoPiocheo2026!', 12)
  const [organizer, player] = await Promise.all([
    ['camille@example.test', 'Camille', 'organizer'], ['sam@example.test', 'Sam', 'player'],
  ].map(([email, name, role]) => User.findOneAndUpdate({ email }, { $setOnInsert: { email, name, role, password } }, { upsert: true, returnDocument: 'after' })))
  await User.updateOne({ _id: organizer._id }, { $addToSet: { circle: player._id } })
  const catalog = await Promise.all(games.map(game => Game.findOneAndUpdate({ slug: game.slug }, { $set: game }, { upsert: true, returnDocument: 'after' })))
  const city = process.env.PIOCHEO_DEMO_CITY || 'Tournai'
  const venue = 'Café des Dés (démo)'
  const begins = new Date(Date.now() + 2 * 86400_000)
  const event = await Event.findOneAndUpdate({ host: organizer._id, name: 'La soirée des curieux' }, {
    $setOnInsert: { organizer: organizer.name, description: 'Un événement de démonstration pour découvrir des jeux en petit groupe.', type: 'soirée jeux', city, venue },
    $set: { starts: begins },
  }, { upsert: true, returnDocument: 'after' })
  await Table.updateOne({ event: event._id, game: catalog[0]._id, host: organizer._id }, {
    $setOnInsert: { city, venue, capacity: 4, visibility: 'open', members: [{ user: organizer._id, name: organizer.name, status: 'accepted' }] },
    $set: { starts: new Date(begins.getTime() + 3600_000) },
  }, { upsert: true })
  await Review.updateOne({ game: catalog[0]._id, author: player._id }, {
    $setOnInsert: { name: player.name, text: 'Un défi agréable à découvrir en petit groupe.', rating: 4 },
  }, { upsert: true })
  console.log('Catalogue, comptes, événement et table de démonstration disponibles.')
}

main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(() => mongoose.disconnect())
