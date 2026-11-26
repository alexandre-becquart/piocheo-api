// Repris de Wayd (_helpers/emailValidation.js) : liste blanche de TLD pour refuser à l'inscription
// les fautes de frappe courantes (gmail.comm, hotmail.con…) qui créent des comptes injoignables.
const VALID_TLDS = new Set([
  'com', 'net', 'org', 'info', 'biz', 'co', 'io', 'me', 'app', 'dev', 'shop',
  'edu', 'gov', 'int', 'mil',
  'be', 'fr', 'nl', 'de', 'lu', 'uk', 'ie', 'es', 'it', 'pt', 'ch', 'at', 'eu',
  // Domaines réservés aux tests (RFC 2606) : jamais livrables, utiles aux données de démo.
  'test', 'example',
])
const EMAIL_SHAPE_REGEX = /^[^\s@]+@[^\s@]+\.([a-zA-Z]{2,24})$/

function isValidEmailFormat(email) {
  if (!email || typeof email !== 'string') return false
  const match = EMAIL_SHAPE_REGEX.exec(email.trim())
  return Boolean(match) && VALID_TLDS.has(match[1].toLowerCase())
}

module.exports = { isValidEmailFormat, VALID_TLDS }
