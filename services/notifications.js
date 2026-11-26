const Notification = require('../models/Notification')
const { equal } = require('../_helpers/queries')

// Inspiré des notifications Wayd : une notification nominative, créée après l’action métier.
// Seules les personnes déjà autorisées à voir l’élément lié reçoivent une notification.
async function notify(recipients, { kind, text, link }, actor) {
  const users = [...new Set(recipients.filter(Boolean).map(String))].filter(user => !actor || !equal(user, actor))
  if (!users.length) return
  try {
    await Notification.insertMany(users.map(user => ({ user, kind, text, link })))
  } catch (error) {
    console.error('Notification non enregistrée', error.name)
  }
}

module.exports = { notify }
