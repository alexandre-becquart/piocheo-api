const fs = require('node:fs')
const path = require('node:path')
const { Resend } = require('resend')

// Même fournisseur que Wayd (_helpers/email.js) : Resend, avec RESEND_API_KEY et EMAIL_FROM.
// Sans clé, hors production, l'e-mail est écrit dans les journaux pour tester le parcours.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const templates = {}
function render(name, vars) {
  templates[name] ||= fs.readFileSync(path.join(__dirname, '../templates/emails', name + '.html'), 'utf8')
  return templates[name].replace(/\{\{(\w+)\}\}/g, (_, key) => esc(vars[key]))
}

function createMailer(env = process.env) {
  const from = env.EMAIL_FROM || 'Piochéo <noreply@piocheo.com>'
  const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null
  async function send(message) {
    if (!resend) {
      if (env.NODE_ENV !== 'production') console.log(`[e-mail non envoyé, RESEND_API_KEY absent] ${message.subject}\n${message.text}`)
      else console.error('[e-mail] RESEND_API_KEY manquant, e-mail non envoyé :', message.subject)
      return
    }
    const { error } = await resend.emails.send({ from, ...message })
    if (error) throw new Error(error.message)
  }
  return {
    send,
    sendResetPassword({ to, firstName, resetUrl }) {
      return send({
        to,
        subject: 'Réinitialise ton mot de passe Piochéo',
        html: render('reset-password', { firstName, resetUrl }),
        text: `Bonjour ${firstName},\n\nRéinitialise ton mot de passe Piochéo : ${resetUrl} (valable 1 h).\n\nSi tu n’as rien demandé, ignore cet e-mail : ton mot de passe ne change pas.`,
      })
    },
  }
}

module.exports = { createMailer, render }
