const { Schema, model } = require('mongoose')

const options = { timestamps: true, versionKey: false }

module.exports = model('User', new Schema({
  email: { type: String, unique: true }, name: String, password: { type: String, select: false },
  role: { type: String, default: 'player' }, circle: [Schema.Types.ObjectId],
}, options))
