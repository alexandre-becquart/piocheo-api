const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const Joi = require('joi')
const User = require('../models/User')
const { fail } = require('../_helpers/http')
const { input, label } = require('../_helpers/validation')

function profile(user) {
  return { id: String(user._id), name: user.name, role: user.role }
}

const credentials = Joi.object({
  email: Joi.string().trim().lowercase().email({ tlds: false }).max(254).required(),
  password: Joi.string().min(8).max(72).custom((value, helpers) =>
    Buffer.byteLength(value) <= 72 ? value : helpers.error('string.max')).required(),
})
const dummyHash = bcrypt.hashSync('piocheo-invalid-account', 12)

function authController(secret, production) {
  const cookie = { httpOnly: true, sameSite: 'lax', secure: production, path: '/' }

  function session(res, user, status = 200) {
    const token = jwt.sign({}, secret, { algorithm: 'HS256', issuer: 'piocheo', subject: String(user._id), expiresIn: '12h' })
    res.cookie('piocheo_session', token, { ...cookie, maxAge: 12 * 3600_000 }).status(status).json(profile(user))
  }

  async function register(req, res) {
    const { password, ...data } = input(credentials.keys({ name: label.required() }), req.body)
    session(res, await User.create({ ...data, password: await bcrypt.hash(password, 12) }), 201)
  }
  async function login(req, res) {
    const { email, password } = input(credentials, req.body)
    const user = await User.findOne({ email }).select('+password')
    if (!await bcrypt.compare(password, user?.password || dummyHash) || !user) {
      throw fail(401, 'E-mail ou mot de passe incorrect.')
    }
    session(res, user)
  }
  const logout = (_req, res) => res.clearCookie('piocheo_session', cookie).sendStatus(204)
  return { register, login, logout }
}

const me = (req, res) => res.json(profile(req.user))

module.exports = { authController, me }
