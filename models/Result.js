const { Schema, model } = require('mongoose')

const ref = { type: Schema.Types.ObjectId, required: true }
const options = { timestamps: true, versionKey: false }

const resultSchema = new Schema({
  game: { ...ref, ref: 'Game' }, author: ref, city: String, visibility: String,
  table: Schema.Types.ObjectId, played: Date, status: String, mode: String, ruleVersion: String,
  outcome: String, decidedBy: Schema.Types.ObjectId,
  entries: [new Schema({ user: Schema.Types.ObjectId, name: String, score: Number }, { _id: false })],
}, options)
resultSchema.index({ table: 1 }, { unique: true, sparse: true })
module.exports = model('Result', resultSchema)
