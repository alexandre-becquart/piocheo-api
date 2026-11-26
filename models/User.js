const { Schema, model } = require('mongoose')

const options = { timestamps: true, versionKey: false }

// Champs de connexion repris de Wayd : prénom/nom, pseudo (username) facultatif et unique,
// compte Google lié, jeton de réinitialisation haché. `sessionVersion` coupe toutes les sessions
// ouvertes (réinitialisation du mot de passe, liaison Google), comme revokeUserSessions sur Wayd.
module.exports = model('User', new Schema({
  email: { type: String, unique: true }, name: String, password: { type: String, select: false },
  firstName: String, lastName: String,
  username: { type: String, unique: true, sparse: true },
  googleId: { type: String, unique: true, sparse: true, select: false },
  resetToken: { type: String, select: false }, resetTokenExpires: { type: Date, select: false },
  sessionVersion: { type: Number, default: 0 },
  lastLoginAt: Date,
  role: { type: String, default: 'player' }, circle: [Schema.Types.ObjectId],
}, options))
