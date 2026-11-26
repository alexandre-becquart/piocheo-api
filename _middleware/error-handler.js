module.exports = (error, _req, res, next) => {
  if (res.headersSent) return next(error)
  if (error.code === 11000) return res.status(409).json({ message: 'Cet élément existe déjà.' })
  if (error.type === 'entity.too.large') return res.status(413).json({ message: 'Requête trop volumineuse.' })
  if (error.type === 'entity.parse.failed' || ['CastError', 'ValidationError'].includes(error.name)) {
    return res.status(400).json({ message: 'Données invalides.' })
  }
  if (error.status >= 400 && error.status < 500) return res.status(error.status).json({ message: error.message })
  console.error('Erreur API', error.name)
  return res.status(500).json({ message: 'Erreur serveur.' })
}
