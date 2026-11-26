const { Schema, model } = require('mongoose')

const options = { timestamps: true, versionKey: false }

module.exports = model('Game', new Schema({
  slug: { type: String, unique: true }, name: String, description: String,
  minPlayers: Number, maxPlayers: Number, minutes: Number, type: String,
  scoring: String, direction: String, rulesUrl: String, color: String, symbol: String,
}, options))
