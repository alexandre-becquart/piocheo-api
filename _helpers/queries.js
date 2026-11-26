const cityCollation = { locale: 'fr', strength: 2 }
const equal = (a, b) => String(a) === String(b)

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

module.exports = { cityCollation, equal, escapeRegex }
