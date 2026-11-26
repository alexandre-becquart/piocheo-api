const Joi = require('joi')
const { fail } = require('./http')

const id = Joi.string().hex().length(24)
const label = Joi.string().trim().min(2).max(100)
const notes = Joi.string().trim().min(3).max(2000)
const date = Joi.string().pattern(/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/).custom((value, helpers) =>
  Number.isFinite(Date.parse(value)) ? new Date(value) : helpers.error('date.format'))

function input(schema, value) {
  const result = schema.validate(value)
  if (result.error) throw fail(400, 'Vérifie les champs du formulaire.')
  return result.value
}

function lookupId(value) {
  return input(id.required(), value)
}

module.exports = { id, label, notes, date, input, lookupId }
