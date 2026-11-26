require('dotenv').config()
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const { User, Game, Table, Event, Review, Result, Notification } = require('../models')
const { VERSION } = require('../services/ranking')

const games = [
  ['cartographes', 'Les Cartographes', 'Dessine les vallées, les villages et les forêts d’un territoire à explorer. Chaque saison te lance un nouveau défi.', 2, 8, 35, 'Stratégie', 'points', 'high', 'indigo', '✦'],
  ['dernier-biscuit', 'Le Dernier Biscuit', 'Collectionne les biscuits et évite les miettes. Le joueur qui en accumule le moins remporte la partie.', 2, 6, 20, 'Famille', 'points', 'low', 'peach', '●'],
  ['lanternes', 'Les Lanternes', 'Éclairez ensemble les sentiers avant que la nuit ne recouvre le village.', 2, 5, 45, 'Coopératif', 'cooperative', 'high', 'blue', '✷'],
  ['mots-en-vrac', 'Mots en vrac', 'Fais deviner tes mots avant la fin du sablier et comparez vos places à la fin.', 3, 8, 25, 'Ambiance', 'rank', 'low', 'yellow', '◆'],
  ['tour-des-des', 'La Tour des dés', 'Empile tes dés, sécurise tes étages et marque des points avant que la tour ne vacille.', 2, 4, 45, 'Famille', 'points', 'high', 'peach', '■'],
  ['chateau-de-cartes', 'Château de cartes', 'Bâtis ton domaine carte après carte et fais fructifier tes remparts à chaque manche.', 2, 4, 45, 'Stratégie', 'points', 'high', 'indigo', '▲'],
  ['clair-de-lune', 'Clair de lune', 'Pose tes cartes dans la nuit et devine les intentions des autres pour terminer en tête.', 3, 8, 30, 'Ambiance', 'rank', 'low', 'yellow', '☾'],
  ['petits-sentiers', 'Petits sentiers', 'Trace ton chemin à travers bois et prairies pour relier le plus de clairières.', 1, 4, 30, 'Famille', 'points', 'high', 'indigo', '✿'],
  ['grandes-empreintes', 'Grandes Empreintes', 'Suis la piste des créatures du volcan et place tes campements au meilleur endroit.', 2, 5, 90, 'Stratégie', 'points', 'high', 'peach', '◉'],
  ['mammouths', 'Les Mammouths', 'Unissez votre tribu pour traverser l’hiver et ramener le troupeau au campement.', 1, 4, 60, 'Coopératif', 'cooperative', 'high', 'indigo', '❄'],
  ['quiz-du-comptoir', 'Quiz du comptoir', 'Réponds vite, mise juste et grimpe sur le podium du comptoir.', 3, 10, 20, 'Ambiance', 'rank', 'low', 'yellow', '?'],
  ['feu-de-camp', 'Feu de camp', 'Gardez la flamme allumée toute la nuit en partageant vos ressources.', 2, 6, 40, 'Coopératif', 'cooperative', 'high', 'blue', '✺'],
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
  await Promise.all([User, Game, Table, Event, Review, Result, Notification].map(model => model.init()))
  const password = await bcrypt.hash('DemoPiocheo2026!', 12)
  const people = await Promise.all([
    ['camille@example.test', 'Camille', 'organizer'], ['sam@example.test', 'Sam', 'player'],
    ['lea@example.test', 'Léa', 'player'], ['thomas@example.test', 'Thomas', 'player'],
    ['nora@example.test', 'Nora', 'player'], ['hugo@example.test', 'Hugo', 'player'],
  ].map(([email, name, role]) => User.findOneAndUpdate({ email }, {
    $setOnInsert: { email, role, password },
    $set: { name, firstName: name, lastName: 'Démo', username: email.split('@')[0] },
  }, { upsert: true, returnDocument: 'after' })))
  const [organizer, player, lea, thomas, nora, hugo] = people
  await User.updateOne({ _id: organizer._id }, { $addToSet: { circle: { $each: [player._id, lea._id] } } })
  await User.updateOne({ _id: player._id }, { $addToSet: { circle: organizer._id } })
  const catalog = await Promise.all(games.map(game => Game.findOneAndUpdate({ slug: game.slug }, { $set: game }, { upsert: true, returnDocument: 'after' })))
  const bySlug = slug => catalog.find(game => game.slug === slug)
  const city = process.env.PIOCHEO_DEMO_CITY || 'Tournai'
  const venue = 'Café des Dés (démo)'
  const member = (person, status = 'accepted') => ({ user: person._id, name: person.name, status })
  // Créneaux relatifs à aujourd’hui, à heure ronde en UTC pour rester lisibles à Bruxelles.
  const slot = (days, hour) => {
    const date = new Date(Date.now() + days * 86400_000)
    date.setUTCHours(hour, 0, 0, 0)
    return date
  }
  const begins = slot(2, 17)
  const event = await Event.findOneAndUpdate({ host: organizer._id, name: 'La soirée des curieux' }, {
    $setOnInsert: { organizer: organizer.name, description: 'Un événement de démonstration pour découvrir des jeux en petit groupe.', type: 'soirée jeux', city, venue },
    $set: { starts: begins },
  }, { upsert: true, returnDocument: 'after' })
  const tournament = await Event.findOneAndUpdate({ host: organizer._id, name: 'Tournoi du dimanche' }, {
    $setOnInsert: { organizer: organizer.name, description: 'Un tournoi convivial de démonstration, avec des tables de quatre joueurs.', type: 'tournoi', city, venue: 'Maison des jeux (démo)' },
    $set: { starts: slot(5, 13) },
  }, { upsert: true, returnDocument: 'after' })
  await Event.updateOne({ host: organizer._id, name: 'Rencontre des nouveaux joueurs' }, {
    $setOnInsert: { organizer: organizer.name, description: 'Une rencontre de démonstration pour faire connaissance autour de jeux courts.', type: 'rencontre', city, venue: 'Bibliothèque (démo)' },
    $set: { starts: slot(9, 18) },
  }, { upsert: true })
  const tables = [
    [{ event: event._id, game: catalog[0]._id, host: organizer._id }, { capacity: 4, visibility: 'open', venue, members: [member(organizer)] }, new Date(begins.getTime() + 3600_000)],
    [{ event: tournament._id, game: bySlug('chateau-de-cartes')._id, host: organizer._id }, { capacity: 4, visibility: 'open', venue: 'Maison des jeux (démo)', members: [member(organizer), member(nora)] }, slot(5, 14)],
    [{ game: bySlug('dernier-biscuit')._id, host: lea._id, event: null }, { capacity: 4, visibility: 'open', venue: 'Le Comptoir (démo)', members: [member(lea), member(thomas), member(hugo)] }, slot(3, 18)],
    [{ game: bySlug('petits-sentiers')._id, host: thomas._id, event: null }, { capacity: 3, visibility: 'open', venue: 'Parc (démo)', members: [member(thomas)] }, slot(4, 14)],
    [{ game: bySlug('tour-des-des')._id, host: organizer._id, event: null, visibility: 'private' }, { capacity: 4, venue: 'Chez Camille (démo)', address: 'Adresse fictive réservée aux participants', members: [member(organizer), member(lea), member(player, 'invited')] }, slot(6, 18)],
  ]
  for (const [key, data, starts] of tables) {
    await Table.updateOne(key, { $setOnInsert: { city, ...data }, $set: { starts } }, { upsert: true })
  }
  await Review.updateOne({ game: catalog[0]._id, author: player._id }, {
    $setOnInsert: { name: player.name, text: 'Un défi agréable à découvrir en petit groupe.', rating: 4 },
  }, { upsert: true })
  await Review.updateOne({ game: bySlug('dernier-biscuit')._id, author: lea._id }, {
    $setOnInsert: { name: lea.name, text: 'Parfait pour commencer la soirée, on rit beaucoup.', rating: 5 },
  }, { upsert: true })
  // Résultats confirmés à dates fixes, pour un classement de démonstration rejouable sans doublon.
  const results = [
    ['dernier-biscuit', '2026-10-02T19:00:00Z', organizer, [[organizer, 12], [player, 18], [lea, 9], [thomas, 15]]],
    ['dernier-biscuit', '2026-10-09T19:00:00Z', lea, [[lea, 7], [thomas, 11], [hugo, 14]]],
    ['dernier-biscuit', '2026-10-16T19:00:00Z', thomas, [[thomas, 10], [nora, 10], [organizer, 13], [player, 16]]],
    ['dernier-biscuit', '2026-10-23T19:00:00Z', nora, [[nora, 8], [hugo, 12], [player, 9]]],
    ['dernier-biscuit', '2026-10-30T19:00:00Z', organizer, [[organizer, 6], [lea, 11], [nora, 14]]],
    ['dernier-biscuit', '2026-11-06T19:00:00Z', player, [[player, 7], [hugo, 9], [thomas, 12]]],
    ['cartographes', '2026-10-05T18:00:00Z', organizer, [[organizer, 84], [player, 79], [lea, 72]]],
    ['cartographes', '2026-10-19T18:00:00Z', lea, [[lea, 91], [thomas, 77], [nora, 80], [organizer, 88]]],
    ['cartographes', '2026-11-02T18:00:00Z', thomas, [[thomas, 70], [player, 82], [hugo, 68]]],
  ]
  for (const [slug, played, author, scores] of results) {
    const game = bySlug(slug)
    const decider = scores.find(([person]) => !person._id.equals(author._id))[0]
    await Result.updateOne({ game: game._id, author: author._id, played: new Date(played) }, { $setOnInsert: {
      city, visibility: 'open', status: 'confirmed', mode: game.scoring, ruleVersion: VERSION, decidedBy: decider._id,
      entries: scores.map(([person, score]) => ({ user: person._id, name: person.name, score })),
    } }, { upsert: true })
  }
  const pendingPlayed = new Date('2026-11-13T19:00:00Z')
  const pending = await Result.findOneAndUpdate({ game: bySlug('dernier-biscuit')._id, author: organizer._id, played: pendingPlayed }, { $setOnInsert: {
    city, visibility: 'open', status: 'pending', mode: 'points', ruleVersion: VERSION,
    entries: [{ user: organizer._id, name: organizer.name, score: 9 }, { user: player._id, name: player.name, score: 13 }],
  } }, { upsert: true, returnDocument: 'after', includeResultMetadata: true })
  if (!pending.lastErrorObject?.updatedExisting) {
    await Notification.create({ user: player._id, kind: 'result.pending', link: '/resultats/' + pending.value._id,
      text: `${organizer.name} a encodé un score pour Le Dernier Biscuit. Confirme-le ou conteste-le.` })
  }
  if (!await Notification.exists({ user: player._id, kind: 'table.invited' })) {
    const invitation = await Table.findOne({ host: organizer._id, game: bySlug('tour-des-des')._id, visibility: 'private' }).lean()
    await Notification.create({ user: player._id, kind: 'table.invited', link: '/tables/' + invitation._id,
      text: `${organizer.name} t’invite à sa table privée La Tour des dés.` })
  }
  console.log('Catalogue, comptes, événements, tables, résultats et notifications de démonstration disponibles.')
}

main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(() => mongoose.disconnect())
