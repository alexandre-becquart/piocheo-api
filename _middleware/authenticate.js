const jwt = require('jsonwebtoken')
const User = require('../models/User')

function authenticateWith(secret) {
  return async (req, _res, next) => {
    const token = req.cookies.piocheo_session
    if (!token) return next()
    let session
    try {
      session = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'piocheo' })
    } catch {
      return next()
    }
    try {
      req.user = await User.findById(session.sub).lean()
      next()
    } catch (error) {
      next(error)
    }
  }
}

module.exports = authenticateWith
