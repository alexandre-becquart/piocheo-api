const fail = (status, message) => Object.assign(new Error(message), { status })
const missing = () => fail(404, 'Cet élément est introuvable.')
const wrap = handler => (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(next)

module.exports = { fail, missing, wrap }
