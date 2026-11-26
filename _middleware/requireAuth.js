const { fail } = require('../_helpers/http')

module.exports = (req, _res, next) => req.user ? next() : next(fail(401, 'Connecte-toi pour continuer.'))
