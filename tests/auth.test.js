const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { test } = require('node:test')
const mongoose = require('mongoose')
const request = require('supertest')
const { createApp } = require('../app')
const models = require('../models')
const { User } = models

const cookieValue = (response, name) => (response.headers['set-cookie'] || []).find(value => value.startsWith(name + '='))?.split(';')[0]

test('Connexion reprise de Wayd', async t => {
  const uri = new URL(process.env.PIOCHEO_TEST_MONGODB_URI || 'mongodb://127.0.0.1:27029')
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(uri.hostname), 'Utiliser un MongoDB de test local.')
  await mongoose.connect(uri.toString(), { dbName: 'piocheo_test_' + randomUUID().replaceAll('-', '') })
  t.after(async () => {
    try { await mongoose.connection.dropDatabase() }
    finally { await mongoose.disconnect() }
  })
  await Promise.all(Object.values(models).map(model => model.init()))

  const mails = []
  const mailer = { sendResetPassword: async message => { mails.push(message) } }
  let googleProfile
  const google = {
    clientId: 'client-test',
    client: {
      generateAuthUrl: options => 'https://accounts.google.test/auth?' + new URLSearchParams(options),
      getToken: async ({ code, codeVerifier }) => {
        assert.ok(codeVerifier)
        if (code === 'refuse') throw new Error('code refusé')
        return { tokens: { id_token: 'jeton' } }
      },
      verifyIdToken: async ({ audience }) => {
        assert.equal(audience, 'client-test')
        return { getPayload: () => googleProfile }
      },
    },
  }
  const app = createApp({ secret: randomUUID(), allowedOrigins: ['https://piocheo.test'], mailer, google })
  const anonymous = request(app)
  const password = 'SyntheticDemo2026!'
  const account = { firstName: 'Margaux', lastName: 'Dupont', username: 'MeepleQueen', email: 'margaux@example.test', password }

  await t.test('inscription avec prénom, nom, pseudo et e-mail', async () => {
    assert.deepEqual((await anonymous.get('/auth/check-username').query({ username: 'meeplequeen' }).expect(200)).body, { available: true })
    const created = await request.agent(app).post('/auth/register').send(account).expect(201)
    assert.equal(created.body.username, 'meeplequeen')
    assert.equal(created.body.name, 'Margaux D.')
    assert.equal(created.body.firstName, 'Margaux')
    assert.deepEqual((await anonymous.get('/auth/check-username').query({ username: 'MeepleQueen' }).expect(200)).body, { available: false })
    assert.deepEqual((await anonymous.get('/auth/check-username').query({ username: 'a b' }).expect(200)).body, { available: false, reason: 'format' })
    assert.equal((await anonymous.post('/auth/register').send({ ...account, email: 'autre@example.test' }).expect(409)).body.message, 'Ce pseudo est déjà pris')
    assert.equal((await anonymous.post('/auth/register').send({ ...account, username: '' }).expect(409)).body.message, 'E-mail déjà utilisé')
    assert.match((await anonymous.post('/auth/register').send({ ...account, username: '', email: 'x@gmail.comm' }).expect(400)).body.message, /Adresse e-mail invalide/)
    assert.equal((await anonymous.post('/auth/register').send({ ...account, username: '', email: 'c@example.test', password: 'court' }).expect(400)).body.message,
      'Le mot de passe doit contenir au moins 8 caractères')
    const noUsername = await anonymous.post('/auth/register').send({ firstName: 'Sans', email: 'sans@example.test', password }).expect(201)
    assert.equal(noUsername.body.username, null)
    assert.equal(noUsername.body.name, 'Sans')
  })

  await t.test('connexion par e-mail ou par pseudo', async () => {
    const agent = request.agent(app)
    await agent.post('/auth/login').send({ email: 'MeepleQueen', password }).expect(200)
    assert.equal((await agent.get('/auth/me').expect(200)).body.username, 'meeplequeen')
    const byEmail = await anonymous.post('/auth/login').send({ email: 'MARGAUX@example.test', password }).expect(200)
    assert.match(byEmail.headers['set-cookie'][0], /Max-Age=604800/)
    assert.equal((await anonymous.post('/auth/login').send({ email: 'meeplequeen', password: 'mauvais-mot' }).expect(401)).body.message, 'Identifiant ou mot de passe incorrect')
    await anonymous.post('/auth/login').send({ email: 'inconnu', password }).expect(401)
  })

  await t.test('mot de passe oublié puis nouveau mot de passe', async () => {
    const openSession = request.agent(app)
    await openSession.post('/auth/login').send({ email: 'meeplequeen', password }).expect(200)
    const ok = await anonymous.post('/auth/forgot-password').send({ email: 'personne@example.test' }).expect(200)
    assert.match(ok.body.message, /Si cet e-mail est associé à un compte/)
    assert.equal(mails.length, 0)
    assert.deepEqual((await anonymous.post('/auth/forgot-password').send({ email: 'margaux@example.test' }).expect(200)).body, ok.body)
    assert.equal(mails.length, 1)
    assert.equal(mails[0].to, 'margaux@example.test')
    assert.equal(mails[0].firstName, 'Margaux')
    const token = new URL(mails[0].resetUrl).searchParams.get('token')
    assert.ok(mails[0].resetUrl.startsWith('https://piocheo.test/mot-de-passe?token='))
    assert.notEqual((await User.findOne({ email: 'margaux@example.test' }).select('+resetToken').lean()).resetToken, token)
    await anonymous.post('/auth/reset-password').send({ token: 'inconnu', password: 'NouveauMotDePasse1' }).expect(400)
    await anonymous.post('/auth/reset-password').send({ token, password: 'court' }).expect(400)
    await anonymous.post('/auth/reset-password').send({ token, password: 'NouveauMotDePasse1' }).expect(200, { message: 'Mot de passe mis à jour' })
    await anonymous.post('/auth/reset-password').send({ token, password: 'EncoreUnAutre1' }).expect(400)
    await openSession.get('/auth/me').expect(401)
    await anonymous.post('/auth/login').send({ email: 'meeplequeen', password }).expect(401)
    await anonymous.post('/auth/login').send({ email: 'meeplequeen', password: 'NouveauMotDePasse1' }).expect(200)
  })

  await t.test('continuer avec Google', async () => {
    const start = await anonymous.get('/auth/google').expect(302)
    const location = new URL(start.headers.location)
    const state = location.searchParams.get('state')
    assert.equal(location.searchParams.get('code_challenge_method'), 'S256')
    const oauth = cookieValue(start, 'piocheo_google_oauth')
    assert.ok(oauth.startsWith('piocheo_google_oauth=' + state + '.'))
    const callback = (query, cookie = oauth) => anonymous.get('/auth/google/callback').query(query).set('Cookie', cookie).expect(302)

    assert.equal((await callback({ code: 'ok', state: 'autre' })).headers.location, 'https://piocheo.test/connexion?googleError=state')
    assert.equal((await callback({ error: 'access_denied', state })).headers.location, 'https://piocheo.test/connexion?googleError=denied')
    assert.equal((await callback({ code: 'refuse', state })).headers.location, 'https://piocheo.test/connexion?googleError=failed')
    googleProfile = { sub: 'g-1', email: 'Elodie@example.test', email_verified: false, given_name: 'Élodie' }
    assert.equal((await callback({ code: 'ok', state })).headers.location, 'https://piocheo.test/connexion?googleError=failed')

    googleProfile = { sub: 'g-1', email: 'Elodie@example.test', email_verified: true, given_name: 'Élodie', family_name: 'Martin' }
    const created = await callback({ code: 'ok', state })
    assert.equal(created.headers.location, 'https://piocheo.test/connexion?googleAuth=success&isNew=1')
    const session = cookieValue(created, 'piocheo_session')
    const me = (await anonymous.get('/auth/me').set('Cookie', session).expect(200)).body
    assert.deepEqual([me.firstName, me.name, me.username], ['Élodie', 'Élodie M.', 'elodie'])
    assert.equal((await callback({ code: 'ok', state })).headers.location, 'https://piocheo.test/connexion?googleAuth=success')

    googleProfile = { sub: 'g-2', email: 'elodie2@example.test', email_verified: true, given_name: 'Élodie' }
    await callback({ code: 'ok', state })
    assert.match((await User.findOne({ email: 'elodie2@example.test' }).lean()).username, /^elodie\d+$/)

    // Liaison d'un compte existant : mot de passe effacé et sessions coupées, comme sur Wayd.
    const before = request.agent(app)
    await before.post('/auth/login').send({ email: 'meeplequeen', password: 'NouveauMotDePasse1' }).expect(200)
    googleProfile = { sub: 'g-3', email: 'margaux@example.test', email_verified: true, given_name: 'Margaux' }
    const linked = await callback({ code: 'ok', state })
    assert.equal(linked.headers.location, 'https://piocheo.test/connexion?googleAuth=success')
    assert.equal((await anonymous.get('/auth/me').set('Cookie', cookieValue(linked, 'piocheo_session')).expect(200)).body.username, 'meeplequeen')
    await before.get('/auth/me').expect(401)
    await anonymous.post('/auth/login').send({ email: 'meeplequeen', password: 'NouveauMotDePasse1' }).expect(401)

    const off = createApp({ secret: randomUUID(), allowedOrigins: ['https://piocheo.test'] })
    assert.equal((await request(off).get('/auth/google').expect(302)).headers.location, 'https://piocheo.test/connexion?googleError=config')
  })
})
