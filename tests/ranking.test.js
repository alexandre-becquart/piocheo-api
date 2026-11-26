const assert = require('node:assert/strict')
const { test } = require('node:test')
const { standings, VERSION } = require('../services/ranking')

const base = {
  status: 'confirmed',
  visibility: 'open',
  ruleVersion: VERSION,
  mode: 'points',
  entries: [
    { user: 'abc', name: 'Camille', score: 2 },
    { user: 'def', name: 'Lou', score: 2 },
    { user: 'ghi', name: 'Sam', score: 4 },
  ],
}

test('score bas et ordre d’arrivée avec ex æquo', () => {
  const expected = [['Camille', 3, 1], ['Lou', 3, 1], ['Sam', 1, 3]]
  const view = items => items.map(({name, points, rank}) => [name, points, rank])
  assert.deepEqual(view(standings([base], 'low')), expected)
  assert.deepEqual(view(standings([{...base, mode:'rank'}], 'high')), expected)
})

test('seuls les résultats ouverts confirmés et non coopératifs sont classés', () => {
  const excluded = [
    {...base, status:'pending'}, {...base, status:'contested'},
    {...base, visibility:'private'}, {...base, mode:'cooperative'},
  ]
  assert.deepEqual(standings(excluded, 'high'), [])
})
