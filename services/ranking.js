const VERSION = 'demo-v1'

function eligible(result) {
  return result.status === 'confirmed' && result.visibility === 'open' &&
    result.mode !== 'cooperative' && result.ruleVersion === VERSION
}

function contributions(result, direction) {
  if (!eligible(result)) return []
  const values = result.entries.map(entry => entry.score)
  const best = result.mode === 'rank' || direction === 'low' ? Math.min(...values) : Math.max(...values)
  return result.entries.filter(entry => entry.user).map(entry => ({
    user: String(entry.user), name: entry.name, points: entry.score === best ? 3 : 1,
  }))
}

function standings(results, direction) {
  const players = new Map()
  for (const result of results) {
    for (const entry of contributions(result, direction)) {
      const player = players.get(entry.user) || { ...entry, points: 0, played: 0 }
      player.points += entry.points
      player.played++
      players.set(entry.user, player)
    }
  }
  const ordered = [...players.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'fr') || a.user.localeCompare(b.user))
  let rank = 0
  return ordered.map((player, index) => {
    if (!index || player.points !== ordered[index - 1].points) rank = index + 1
    return { ...player, rank }
  })
}

module.exports = { VERSION, eligible, standings }
