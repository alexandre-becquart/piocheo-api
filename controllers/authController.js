// Connexion reprise de Wayd (wayd-api/controllers/authController.js) : inscription avec prénom,
// nom et pseudo, connexion par e-mail ou pseudo, mot de passe oublié par e-mail, connexion Google
// côté serveur (redirection, state anti-CSRF et PKCE). La session reste le cookie HttpOnly de
// Piochéo ; `sessionVersion` permet de couper toutes les sessions comme revokeUserSessions sur Wayd.
const crypto = require('node:crypto')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const Joi = require('joi')
const User = require('../models/User')
const { fail } = require('../_helpers/http')
const { input } = require('../_helpers/validation')
const { isValidEmailFormat } = require('../_helpers/emailValidation')

const SESSION_DAYS = 7
const RESET_MS = 60 * 60_000
const USERNAME = /^[a-z0-9_]{3,20}$/
const LOGIN_FAILED = 'Identifiant ou mot de passe incorrect'
const FORGOT_OK = { message: 'Si cet e-mail est associé à un compte, tu recevras un e-mail dans quelques minutes.' }
// Hash factice : bcrypt tourne aussi quand le compte n'existe pas (même temps de réponse).
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const base64url = buffer => buffer.toString('base64url')
const GOOGLE_OAUTH_COOKIE = 'piocheo_google_oauth'

// Nom affiché dans les tables, classements et notifications : « Camille D. ».
const displayName = (firstName, lastName) => lastName?.trim() ? `${firstName} ${lastName.trim()[0].toUpperCase()}.` : firstName

function profile(user) {
  return {
    id: String(user._id), name: user.name, firstName: user.firstName ?? null, lastName: user.lastName ?? '',
    username: user.username ?? null, role: user.role,
  }
}

// Comme passwordPolicy.js sur Wayd : 8 caractères minimum, 72 octets maximum (limite de bcrypt).
const password = Joi.string().max(200).required().custom((value, helpers) => {
  if (value.length < 8) return helpers.message('Le mot de passe doit contenir au moins 8 caractères')
  if (Buffer.byteLength(value, 'utf8') > 72) return helpers.message('Le mot de passe est trop long (72 caractères maximum)')
  return value
})
const text = max => Joi.string().trim().max(max)
const schemas = {
  register: Joi.object({
    firstName: text(50).min(2).pattern(/^[^<>]*$/).required(),
    lastName: text(50).allow('', null),
    username: text(30).lowercase().allow('', null),
    email: text(254).lowercase().required(),
    password,
  }),
  // Le champ s'appelle `email` comme sur Wayd, mais accepte aussi un pseudo.
  login: Joi.object({ email: text(254).required(), password: Joi.string().max(200).required() }),
  forgot: Joi.object({ email: text(254).lowercase().required() }),
  reset: Joi.object({ token: text(200).required(), password }),
}

function validate(schema, body) {
  const result = schema.validate(body)
  if (!result.error) return result.value
  const detail = result.error.details[0]
  throw fail(400, detail.message.startsWith('Le mot de passe') ? detail.message : 'Vérifie les champs du formulaire.')
}

function authController({ secret, production, webOrigin, mailer, google }) {
  const cookie = { httpOnly: true, sameSite: 'lax', secure: production, path: '/' }
  const oauthCookie = { httpOnly: true, sameSite: 'lax', secure: production, path: '/' }
  const front = path => `${webOrigin}${path}`

  function openSession(res, user) {
    const token = jwt.sign({ ver: user.sessionVersion || 0 }, secret, {
      algorithm: 'HS256', issuer: 'piocheo', subject: String(user._id), expiresIn: SESSION_DAYS + 'd',
    })
    res.cookie('piocheo_session', token, { ...cookie, maxAge: SESSION_DAYS * 86_400_000 })
  }

  async function checkUsername(req, res) {
    const clean = String(req.query.username || '').toLowerCase().trim()
    if (!clean) throw fail(400, 'Pseudo requis')
    if (!USERNAME.test(clean)) return res.json({ available: false, reason: 'format' })
    res.json({ available: !await User.exists({ username: clean }) })
  }

  async function register(req, res) {
    const { firstName, lastName, username, email, password: plain } = validate(schemas.register, req.body)
    if (!isValidEmailFormat(email)) throw fail(400, 'Adresse e-mail invalide (vérifie le domaine, ex. .com au lieu de .comm)')
    if (username) {
      if (!USERNAME.test(username)) throw fail(400, 'Pseudo invalide (3-20 caractères, lettres/chiffres/_)')
      if (await User.exists({ username })) throw fail(409, 'Ce pseudo est déjà pris')
    }
    if (await User.exists({ email })) throw fail(409, 'E-mail déjà utilisé')
    const user = await User.create({
      firstName, lastName: lastName || '', username: username || undefined, email,
      name: displayName(firstName, lastName), password: await bcrypt.hash(plain, 12), lastLoginAt: new Date(),
    })
    openSession(res, user)
    res.status(201).json(profile(user))
  }

  async function login(req, res) {
    const { email: identifier, password: plain } = validate(schemas.login, req.body)
    const query = identifier.includes('@') ? { email: identifier.toLowerCase() } : { username: identifier.toLowerCase() }
    const user = await User.findOne(query).select('+password')
    const valid = await bcrypt.compare(plain, user?.password || DUMMY_HASH)
    if (!user || !user.password || !valid) throw fail(401, LOGIN_FAILED)
    openSession(res, user)
    res.json(profile(user))
    User.updateOne({ _id: user._id }, { lastLoginAt: new Date() }).catch(() => {})
  }

  // Réponse identique que l'e-mail existe ou non (anti-énumération).
  async function forgotPassword(req, res) {
    const { email } = validate(schemas.forgot, req.body)
    const user = await User.findOne({ email })
    if (!user) return res.json(FORGOT_OK)
    const token = crypto.randomBytes(32).toString('hex')
    await User.updateOne({ _id: user._id }, { resetToken: sha256(token), resetTokenExpires: new Date(Date.now() + RESET_MS) })
    mailer.sendResetPassword({
      to: user.email, firstName: user.firstName || user.name, resetUrl: front(`/mot-de-passe?token=${token}`),
    }).catch(error => console.error('[e-mail] échec envoi réinitialisation :', error.message))
    res.json(FORGOT_OK)
  }

  // Comme sur Wayd : le jeton sert une fois, toutes les sessions sont coupées, puis le joueur se reconnecte.
  async function resetPassword(req, res) {
    const { token, password: plain } = validate(schemas.reset, req.body)
    const user = await User.findOneAndUpdate(
      { resetToken: sha256(token), resetTokenExpires: { $gt: new Date() } },
      { $set: { password: await bcrypt.hash(plain, 12) }, $unset: { resetToken: 1, resetTokenExpires: 1 }, $inc: { sessionVersion: 1 } },
    )
    if (!user) throw fail(400, 'Lien invalide ou expiré')
    res.json({ message: 'Mot de passe mis à jour' })
  }

  const logout = (_req, res) => res.clearCookie('piocheo_session', cookie).json({ message: 'Déconnecté' })

  // GET /auth/google : écran de consentement Google. Un nonce part dans `state` et dans un cookie
  // court (anti login-CSRF) ; le même cookie porte le code_verifier PKCE.
  function googleRedirect(_req, res) {
    if (!google.client) return res.redirect(front('/connexion?googleError=config'))
    const nonce = base64url(crypto.randomBytes(16))
    const codeVerifier = base64url(crypto.randomBytes(32))
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest())
    res.cookie(GOOGLE_OAUTH_COOKIE, `${nonce}.${codeVerifier}`, { ...oauthCookie, maxAge: 10 * 60_000 })
    res.redirect(google.client.generateAuthUrl({
      scope: ['openid', 'email', 'profile'], prompt: 'select_account', state: nonce,
      code_challenge_method: 'S256', code_challenge: codeChallenge,
    }))
  }

  function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false
    const left = Buffer.from(a)
    const right = Buffer.from(b)
    return left.length === right.length && crypto.timingSafeEqual(left, right)
  }

  async function uniqueUsername(...candidates) {
    const base = candidates.map(value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16)).find(value => value.length >= 3)
    if (!base) return undefined
    for (let attempt = 0; attempt < 6; attempt++) {
      const value = attempt ? base + crypto.randomInt(100, 10_000) : base
      if (!await User.exists({ username: value })) return value
    }
    return undefined
  }

  // GET /auth/google/callback : résout le compte (googleId, e-mail vérifié à lier, ou nouveau
  // compte), pose le cookie de session puis renvoie vers le front. Aucun jeton dans l'URL.
  async function googleCallback(req, res) {
    const { code, error, state } = req.query
    const [cookieNonce, codeVerifier] = String(req.cookies?.[GOOGLE_OAUTH_COOKIE] || '').split('.')
    res.clearCookie(GOOGLE_OAUTH_COOKIE, oauthCookie)
    if (error || !code || !google.client) return res.redirect(front('/connexion?googleError=denied'))
    if (!cookieNonce || !codeVerifier || !safeEqual(state, cookieNonce)) return res.redirect(front('/connexion?googleError=state'))
    try {
      const { tokens } = await google.client.getToken({ code: String(code), codeVerifier })
      const ticket = await google.client.verifyIdToken({ idToken: tokens.id_token, audience: google.clientId })
      const payload = ticket.getPayload()
      if (!payload?.email) throw new Error('E-mail manquant dans le profil Google')
      // L'e-mail ne sert à lier un compte existant que s'il est vérifié par Google.
      if (payload.email_verified !== true) throw new Error('E-mail Google non vérifié')
      const email = payload.email.toLowerCase()
      let user = await User.findOne({ googleId: payload.sub })
      let isNew = false
      if (!user) {
        // Liaison par e-mail : l'adresse n'a jamais été vérifiée côté Piochéo et le compte a pu être
        // créé par quelqu'un d'autre. Google prouve la possession de l'e-mail : comme sur Wayd, on
        // efface le mot de passe et on coupe les sessions ouvertes (« mot de passe oublié » le recrée).
        user = await User.findOneAndUpdate(
          { email },
          { $set: { googleId: payload.sub }, $unset: { password: 1, resetToken: 1, resetTokenExpires: 1 }, $inc: { sessionVersion: 1 } },
          { returnDocument: 'after' },
        )
      }
      if (!user) {
        isNew = true
        const firstName = payload.given_name || payload.name || 'Joueur'
        const username = await uniqueUsername(payload.given_name, email.split('@')[0])
        user = await User.create({
          firstName, lastName: payload.family_name || '', username, email, googleId: payload.sub,
          name: displayName(firstName, payload.family_name),
        })
      }
      openSession(res, user)
      res.redirect(front(`/connexion?googleAuth=success${isNew ? '&isNew=1' : ''}`))
      User.updateOne({ _id: user._id }, { lastLoginAt: new Date() }).catch(() => {})
    } catch (err) {
      console.error('Connexion Google refusée :', err.message)
      res.redirect(front('/connexion?googleError=failed'))
    }
  }

  return { checkUsername, register, login, logout, forgotPassword, resetPassword, googleRedirect, googleCallback }
}

const me = (req, res) => res.json(profile(req.user))

module.exports = { authController, me }
