const { Schema, model } = require('mongoose')

const ref = { type: Schema.Types.ObjectId, required: true }
const options = { timestamps: true, versionKey: false }

const reviewSchema = new Schema({ game: ref, author: ref, name: String, text: String, rating: Number }, options)
reviewSchema.index({ game: 1, author: 1 }, { unique: true })
module.exports = model('Review', reviewSchema)
