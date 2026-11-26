const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { test } = require('node:test')
const mongoose = require('mongoose')
const request = require('supertest')
const { createApp } = require('../app')
const models = require('../models')
const { Game, Table, User } = models

test('Parcours Piochéo avec MongoDB', async t => {
  const uri = new URL(process.env.PIOCHEO_TEST_MONGODB_URI || 'mongodb://127.0.0.1:27029')
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(uri.hostname), 'Utiliser un MongoDB de test local.')
  const dbName = 'piocheo_test_' + randomUUID().replaceAll('-', '')
  await mongoose.connect(uri.toString(), { dbName })
  t.after(async () => {
    try { await mongoose.connection.dropDatabase() }
    finally { await mongoose.disconnect() }
  })
  await Promise.all(Object.values(models).map(model => model.init()))
  const app = createApp({ secret: randomUUID(), allowedOrigins: ['http://localhost:8080'] })
  const host = request.agent(app)
  const guest = request.agent(app)
  const other = request.agent(app)
  const anonymous = request(app)
  const password = 'SyntheticDemo2026!'
  const [cam, sam, lou] = await Promise.all([
    [host, 'Camille', 'cam'], [guest, 'Sam', 'sam'], [other, 'Lou', 'lou'],
  ].map(async ([agent, name, handle]) => (await agent.post('/auth/register').send({
    firstName: name, lastName: 'Test', email: handle + '@example.test', password,
  }).expect(201)).body))
  await User.updateOne({ _id: cam.id }, { $set: { role: 'organizer' } })
  const game = await Game.create({
    slug: 'tests', name: 'Cartographes tests', description: 'Fiche synthétique.',
    minPlayers: 2, maxPlayers: 6, minutes: 35, type: 'Stratégie', scoring: 'points', direction: 'high',
  })
  const city = 'Tournai'
  const dataTable = { game: String(game._id), starts: new Date(Date.now() + 3600_000).toISOString(), city, venue: 'Café fictif', address: 'Rue de démo 12', capacity: 2, visibility: 'open' }
  const upcoming = new Date(Date.now() + 86_400_000).toISOString()
  let openId
  let privateId
  let eventId
  let confirmedId

  await t.test('authentification, filtre du catalogue et avis', async () => {
    await anonymous.get('/health').expect(200, { status: 'ok', mongo: 'connected' })
    await anonymous.get('/auth/me').expect(401)
    await anonymous.get('/games').set('Origin', 'https://example.test').expect(403)
    await anonymous.get('/games').set('Origin', 'http://127.0.0.1:8081').expect(200)
    await anonymous.get('/games').set('Origin', 'http://192.168.1.20:8080').expect(200)
    await anonymous.get('/games').set('Origin', 'http://localhost.example.test').expect(403)
    const production = createApp({ secret: randomUUID(), allowedOrigins: ['https://piocheo.example'], production: true })
    await request(production).get('/games').set('Origin', 'http://127.0.0.1:8081').expect(403)
    await request(production).get('/games').set('Origin', 'https://piocheo.example').expect(200)
    // Une barre finale saisie dans PIOCHEO_WEB_ORIGINS ne doit pas bloquer les inscriptions.
    const trailing = createApp({ secret: randomUUID(), allowedOrigins: [' https://piocheo.example/ '], production: true })
    await request(trailing).post('/auth/logout').set('Origin', 'https://piocheo.example').expect(200)
    const proxied = createApp({ secret: randomUUID(), allowedOrigins: ['https://piocheo.com'], production: true, trustProxy: 1 })
    const secure = await request(proxied).post('/auth/register').set('Origin', 'https://piocheo.com').set('Sec-Fetch-Site', 'same-site')
      .set('X-Forwarded-Proto', 'https').set('X-Forwarded-For', '203.0.113.9').send({ firstName: 'Proxy', lastName: 'Test', email: 'proxy@example.test', password })
    assert.equal(secure.status, 201)
    assert.equal(secure.headers['access-control-allow-origin'], 'https://piocheo.com')
    assert.equal(secure.headers['access-control-allow-credentials'], 'true')
    assert.match(secure.headers['set-cookie'][0], /Secure/)
    await request(proxied).post('/auth/register').set('Origin', 'https://autre.example').set('Sec-Fetch-Site', 'cross-site').send({}).expect(403)
    assert.equal((await host.get('/auth/me').expect(200)).body.id, cam.id)
    const { body } = await anonymous.get('/games').query({ q: 'carto', players: 2, minutes: 45, type: 'Stratégie' }).expect(200)
    assert.equal(body.total, 1)
    assert.equal(body.items[0]._id, String(game._id))
    await guest.put('/games/' + game._id + '/review').send({ text: 'Très chouette', rating: null }).expect(204)
    const detail = await anonymous.get('/games/' + game._id).expect(200)
    assert.equal(detail.body.reviews[0].text, 'Très chouette')
  })

  await t.test('demandes en concurrence sur la dernière place', async () => {
    openId = (await host.post('/tables').send(dataTable).expect(201)).body.id
    const url = '/tables/' + openId
    await guest.get(url).expect(200).expect(response => assert.equal(response.body.address, undefined))
    await Promise.all([guest, other].map(agent => agent.post(url + '/request').expect(204)))
    await guest.post(url + '/request').expect(409)
    const replies = await Promise.all([sam, lou].map(person => host.post(url + '/reply').send({user:person.id,accept:true})))
    assert.deepEqual(replies.map(response => response.status).sort(), [204, 409])
    const {body} = await anonymous.get(url).expect(200)
    assert.equal(body.remaining, 0)
    assert.equal(body.members.length, 2)
  })

  await t.test('accès privé par invitation et protection de l’adresse', async () => {
    privateId = (await host.post('/tables').send({ ...dataTable, visibility: 'private' }).expect(201)).body.id
    const url = '/tables/' + privateId
    await host.put('/circle/' + sam.id).expect(204)
    await guest.get(url).expect(404)
    await guest.get('/tables').query({view:'circle',game:String(game._id)}).expect(200, [])
    await host.post(url + '/invite').send({user:sam.id}).expect(204)
    await other.get(url).expect(404)
    await other.get('/tables').query({view:'circle',game:String(game._id),city}).expect(200, [])
    await anonymous.get(url).expect(404)
    const invitation = await guest.get(url).expect(200)
    assert.equal(invitation.body.membership, 'invited')
    assert.equal(invitation.body.address, undefined)
    await guest.post(url + '/reply').send({accept:true}).expect(204)
    assert.equal((await guest.get(url).expect(200)).body.address, dataTable.address)
  })

  await t.test('résultats liés, confirmation idempotente, contestation et historique', async () => {
    const confirmedTable = await Table.findById(openId).lean()
    const accepted = confirmedTable.members.find(person => person.status === 'accepted' && String(person.user) !== cam.id)
    const scorer = String(accepted.user) === sam.id ? guest : other
    const outside = scorer === guest ? other : guest
    await Table.updateOne({ _id: openId }, { $set: { starts: new Date(Date.now() - 1000) } })
    const payload = {
      game:String(game._id), table:openId, city, visibility:'open',
      entries:[{user:cam.id, score:45}, {user:String(accepted.user), score:40}],
    }
    confirmedId = (await host.post('/results').send(payload).expect(201)).body.id
    await host.post('/results').send(payload).expect(409)
    const url = '/results/' + confirmedId
    await outside.get(url).expect(404)
    await host.post(url + '/decision').send({confirm:true}).expect(404)
    const reactions = await Promise.all([scorer, scorer].map(agent => agent.post(url + '/decision').send({confirm:true})))
    assert.deepEqual(reactions.map(response => response.status).sort(), [204,409])
    const ranking = (await host.get('/rankings').query({game:String(game._id),city}).expect(200)).body
    assert.deepEqual(ranking.items.map(item => item.points), [3,1])
    assert.equal(ranking.confirmed, 1)
    const busiest = (await anonymous.get('/rankings').query({city}).expect(200)).body
    assert.equal(busiest.game, String(game._id))
    assert.equal((await anonymous.get('/rankings').query({city:'Ville sans partie'}).expect(200)).body.game, null)
    assert.equal(ranking.personal.user, cam.id)
    const draft = { game:String(game._id),city,visibility:'open',entries:[{user:cam.id,score:8},{user:sam.id,score:8}] }
    const contested = (await host.post('/results').send(draft).expect(201)).body.id
    await guest.post('/results/' + contested + '/decision').send({confirm:false}).expect(204)
    const local = (await host.post('/results').send({...draft,entries:[{user:cam.id,score:8},{name:'Invité démo',score:7}]}).expect(201)).body.id
    await guest.get('/results/' + local).expect(404)
    const localEntry = await host.get('/results/' + local).expect(200)
    assert.equal(localEntry.body.status, 'local')
    assert.equal(localEntry.body.visibility, 'private')
    const after = await anonymous.get('/rankings').query({game:String(game._id),city}).expect(200)
    assert.deepEqual(after.body.items, ranking.items)
  })

  await t.test('inscription à l’événement et réservation distinctes', async () => {
    const payload = { name:'Soirée test', description:'Événement synthétique', type:'tournoi', starts:upcoming, city, venue:'Café fictif' }
    await guest.post('/events').send(payload).expect(403)
    eventId = (await host.post('/events').send(payload).expect(201)).body.id
    const url = '/events/' + eventId
    await guest.post('/tables').send({...dataTable,event:eventId}).expect(404)
    const linked = (await host.post('/tables').send({...dataTable,event:eventId}).expect(201)).body.id
    await guest.put(url + '/registration').expect(204)
    await guest.put(url + '/registration').expect(204)
    const event = await guest.get(url).expect(200)
    assert.equal(event.body.registered, true)
    assert.equal(event.body.count, 1)
    assert.equal(event.body.attendees, undefined)
    const tables = await guest.get('/tables').query({event:eventId}).expect(200)
    assert.equal(tables.body[0]._id, linked)
    assert.equal(tables.body[0].membership, null)
    await guest.post('/tables/' + linked + '/request').expect(204)
    await host.post('/tables/' + linked + '/reply').send({user:sam.id,accept:true}).expect(204)
    assert.equal((await guest.get('/tables/' + linked).expect(200)).body.membership, 'accepted')
  })

  await t.test('notifications nominatives sans fuite des tables privées', async () => {
    await anonymous.get('/notifications').expect(401)
    const hostFeed = (await host.get('/notifications').expect(200)).body
    const kinds = feed => feed.items.map(item => item.kind)
    assert.ok(kinds(hostFeed).filter(kind => kind === 'seat.requested').length >= 3)
    assert.ok(kinds(hostFeed).includes('invite.accepted'))
    assert.ok(kinds(hostFeed).includes('result.confirmed'))
    assert.ok(kinds(hostFeed).includes('result.contested'))
    const guestFeed = (await guest.get('/notifications').expect(200)).body
    assert.ok(kinds(guestFeed).includes('table.invited'))
    assert.ok(kinds(guestFeed).includes('result.pending'))
    assert.ok(guestFeed.items.some(item => item.link === '/tables/' + privateId))
    const otherFeed = (await other.get('/notifications').expect(200)).body
    assert.ok(!otherFeed.items.some(item => item.link === '/tables/' + privateId))
    assert.ok(!kinds(otherFeed).includes('table.invited'))
    assert.ok(otherFeed.items.every(item => item.user === undefined))
    assert.ok(guestFeed.unread > 0)
    await other.post('/notifications/read').send({ ids: guestFeed.items.map(item => item._id) }).expect(204)
    assert.equal((await guest.get('/notifications').expect(200)).body.unread, guestFeed.unread)
    await guest.post('/notifications/read').send({ ids: [guestFeed.items[0]._id] }).expect(204)
    assert.equal((await guest.get('/notifications').expect(200)).body.unread, guestFeed.unread - 1)
    await guest.post('/notifications/read').send({}).expect(204)
    assert.equal((await guest.get('/notifications').expect(200)).body.unread, 0)
  })
})
