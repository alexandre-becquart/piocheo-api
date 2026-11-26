const { Schema, model } = require('mongoose')

const ref = { type: Schema.Types.ObjectId, required: true }
const options = { timestamps: true, versionKey: false }

module.exports = model('Event', new Schema({
  host: ref, organizer: String, name: String, description: String, type: String,
  city: String, venue: String, starts: Date, attendees: [Schema.Types.ObjectId],
}, options))
