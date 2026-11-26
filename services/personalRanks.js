const Game = require('../models/Game')
const Result = require('../models/Result')
const { cityCollation, equal } = require('../_helpers/queries')
const { VERSION, standings } = require('./ranking')

// Rangs locaux d'un joueur pour tout le catalogue, en une seule passe : le catalogue affiche « Mon classement »
// et filtre « Mes jeux classés » sans un appel par carte. Mêmes règles que GET /rankings (parties ouvertes,
// confirmées, compétitives) : un score privé, en attente ou coopératif n'établit pas de rang.
async function personalRanks(userId, city) {
  const scope = { city, visibility: 'open', status: 'confirmed', mode: { $ne: 'cooperative' }, ruleVersion: VERSION }
  const played = await Result.distinct('game', { ...scope, 'entries.user': userId }).collation(cityCollation)
  if (!played.length) return new Map()
  const [games, results] = await Promise.all([
    Game.find({ _id: { $in: played } }).select('direction').lean(),
    Result.find({ ...scope, game: { $in: played } }).collation(cityCollation).lean(),
  ])
  const ranks = new Map()
  for (const game of games) {
    const items = standings(results.filter(result => equal(result.game, game._id)), game.direction)
    const mine = items.find(item => equal(item.user, userId))
    if (mine) ranks.set(String(game._id), { game: String(game._id), rank: mine.rank, points: mine.points, played: mine.played, players: items.length })
  }
  return ranks
}

module.exports = { personalRanks }
