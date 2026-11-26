function tableScope(user) {
  return user ? { $or: [
    { visibility: 'open' }, { host: user._id },
    { members: { $elemMatch: { user: user._id, status: { $in: ['invited', 'accepted'] } } } },
  ] } : { visibility: 'open' }
}

module.exports = tableScope
