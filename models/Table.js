const { Schema, model } = require('mongoose')

const ref = { type: Schema.Types.ObjectId, required: true }
const place = { city: String, venue: String, address: String }
const member = new Schema({ user: ref, name: String, status: String }, { _id: false })
const options = { timestamps: true, versionKey: false }

module.exports = model('Table', new Schema({
  game: { ...ref, ref: 'Game' }, host: ref, ...place, starts: Date, capacity: Number,
  visibility: String, event: { type: Schema.Types.ObjectId, ref: 'Event' }, members: [member],
}, options))
