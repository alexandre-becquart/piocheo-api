const { Schema, model } = require('mongoose')
const ref = { type: Schema.Types.ObjectId, required: true }
const place = { city: String, venue: String, address: String }
const options = { timestamps: true, versionKey: false }
const member = new Schema({ user: ref, name: String, status: String }, { _id: false })

const User = model('User', new Schema({
  email: { type: String, unique: true }, name: String, password: { type: String, select: false },
  role: { type: String, default: 'player' }, circle: [Schema.Types.ObjectId],
}, options))
const Game = model('Game', new Schema({
  slug: { type: String, unique: true }, name: String, description: String,
  minPlayers: Number, maxPlayers: Number, minutes: Number, type: String,
  scoring: String, direction: String, rulesUrl: String, color: String, symbol: String,
}, options))
const reviewSchema = new Schema({ game: ref, author: ref, name: String, text: String, rating: Number }, options)
reviewSchema.index({ game: 1, author: 1 }, { unique: true })
const Review = model('Review', reviewSchema)
const Table = model('Table', new Schema({
  game: { ...ref, ref: 'Game' }, host: ref, ...place, starts: Date, capacity: Number,
  visibility: String, event: { type: Schema.Types.ObjectId, ref: 'Event' }, members: [member],
}, options))
const Event = model('Event', new Schema({
  host: ref, organizer: String, name: String, description: String, type: String,
  city: String, venue: String, starts: Date, attendees: [Schema.Types.ObjectId],
}, options))
const resultSchema = new Schema({
  game: { ...ref, ref: 'Game' }, author: ref, city: String, visibility: String,
  table: Schema.Types.ObjectId, played: Date, status: String, mode: String, ruleVersion: String,
  outcome: String, decidedBy: Schema.Types.ObjectId,
  entries: [new Schema({ user: Schema.Types.ObjectId, name: String, score: Number }, { _id: false })],
}, options)
resultSchema.index({ table: 1 }, { unique: true, sparse: true })
const Result = model('Result', resultSchema)

module.exports = { User, Game, Review, Table, Event, Result }
