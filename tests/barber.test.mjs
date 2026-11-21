import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { onRequest as barber } from '../server/barber.js';
import { onRequest as platform, MODULES } from '../server/platform.js';

const origin = 'http://bolt.test';
const uid = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const secondId = '00000000-0000-4000-8000-000000000005';
const id = '00000000-0000-4000-8000-000000000003';
const plan = { id: '00000000-0000-4000-8000-000000000004', product: 'barber', name: 'Pro',
  monthly_fee: 0, features: Object.keys(MODULES.barber) };
const client = { id, product: 'barber', slug: 'boltbarber-demo', name: 'BOLTBARBER DEMO', status: 'active' };
const subscription = { client_id: id, plan_id: plan.id, status: 'active', monthly_fee: 0 };
let row;
const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-key' };
const mockedFetch = async (input, options) => {
  const { pathname, searchParams: q } = new URL(input);
  const response = (body, status = 200) => Response.json(body, { status });
  if (pathname === '/auth/v1/user') {
    const token = new Headers(options.headers).get('authorization');
    if (token === 'Bearer master') return response({ id: uid });
    if (token === 'Bearer other') return response({ id: other });
    return response({}, 401);
  }
  switch (pathname.replace('/rest/v1/', '')) {
    case 'bolt_master_admins': return response(q.get('user_id') === 'eq.' + uid ? [{ user_id: uid }] : []);
    case 'bolt_commercial_memberships':
      return response(q.get('client_id') === 'eq.' + secondId && q.get('user_id') === 'eq.' + other ?
        [{ role: 'owner' }] : []);
    case 'bolt_commercial_clients':
      if (q.get('slug') === 'eq.second-shop') return response([{ ...client, id: secondId, slug: 'second-shop' }]);
      return response(row && (!q.has('slug') || q.get('slug') === 'eq.' + client.slug) ? [client] : []);
    case 'bolt_client_subscriptions': return response(row ? [subscription] : []);
    case 'bolt_platform_plans': return response([plan]);
    case 'rpc/bolt_barber_install_demo':
      row ??= { state: JSON.parse(options.body).p_state, revision: crypto.randomUUID() };
      return new Response(null, { status: 204 });
    case 'rpc/bolt_support_allow': return response(true);
    case 'bolt_barber_workspaces':
      if (q.get('client_id') === 'eq.' + secondId)
        return response([{ revision: 'second-revision', state: { ...row.state, customers: [], bookings: [], ledger: [] } }]);
      assert.equal(q.get('client_id'), 'eq.' + id);
      if (options.method === 'PATCH') {
        if (q.get('revision') !== 'eq.' + row.revision) return response([]);
        row = JSON.parse(options.body);
      }
      return response(row ? [row] : []);
    default: return response([]);
  }
};
const request = (action, token, body, slug = client.slug) => barber({
  env, request: new Request(origin + '/api/barber?' + new URLSearchParams({ action, slug }), {
    method: action === 'save' ? 'PUT' : body ? 'POST' : 'GET',
    headers: token ? { authorization: 'Bearer ' + token } : {},
    body: body ? JSON.stringify(body) : undefined
  })
});


test('Master provisions one demo, isolates it, registers customers and serializes competing bookings', async t => {
  t.mock.method(globalThis, 'fetch', mockedFetch);
  assert.equal((await request('demo', 'other', {})).status, 403);
  assert.equal((await request('demo', 'master', {})).status, 200);
  const initial = structuredClone(row);
  assert.equal((await request('demo', 'master', {})).status, 200);
  assert.deepEqual(row, initial);
  assert.equal(row.state.barbers.length, 3);
  const overview = await platform({
    env, request: new Request(origin + '/api/platform?action=overview', { headers: { authorization: 'Bearer master' } })
  });
  const { clients, plans } = await overview.json();
  assert.deepEqual(clients, [client]);
  assert.equal(plans[0].name, 'Pro');

  assert.equal((await request('admin')).status, 401);
  assert.equal((await request('admin', 'other')).status, 403);
  const secondAdmin = await request('admin', 'other', undefined, 'second-shop');
  assert.equal(secondAdmin.status, 200);
  assert.deepEqual((await secondAdmin.json()).state.customers, []);
  assert.equal((await request('save', 'other', {})).status, 403);
  assert.equal((await request('admin', 'master')).status, 200);
  const publicData = (await (await request('public')).json()).state;
  assert(!JSON.stringify(publicData).includes('Marcos Silva'));
  assert(publicData.bookings.every(booking => !booking.phone && !booking.payment));

  const registration = await request('profile', null, { name: 'Cliente Teste', phone: '62999990001' });
  assert.equal(registration.status, 201);
  const { profile } = await registration.json();
  assert.equal(row.state.customers.find(person => person.id === profile.id).name, 'Cliente Teste');
  const future = new Date(Date.now() + 14 * 86400000);
  while (future.getUTCDay() !== 1) future.setUTCDate(future.getUTCDate() + 1);
  const date = future.toISOString().slice(0, 10);
  const booking = { profileId: profile.id, serviceId: 's1', barberId: 'b1', date, time: '12:00', payment: 'Pix' };
  assert.equal((await request('book', null, booking, 'second-shop')).status, 400);
  const results = await Promise.all([request('book', null, booking), request('book', null, booking)]);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  const details = (await (await request('admin', 'master')).json()).state;
  assert.equal(details.bookings.filter(b => b.date === date && b.time === '12:00').length, 1);
  details.bookings.at(-1).status = 'Concluído';
  const oldRevision = row.revision;
  assert.equal((await request('save', 'master', { revision: oldRevision, state: details })).status, 200);
  assert.equal((await request('save', 'master', { revision: oldRevision, state: details })).status, 409);
  assert.equal(row.state.bookings.at(-1).status, 'Concluído');

  const html = await readFile(new URL('../SITE/Boltbarber/index.html', import.meta.url), 'utf8');
  for (const block of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(block[1]);
  const insights = html.match(/<script id="bolt-v11-insights">([\s\S]*?)<\/script>/)[1];
  const sections = Object.fromEntries(['dashboard', 'financeiro'].map(name => {
    const section = {
      output: '',
      querySelector: () => ({ remove: () => { section.output = ''; } }),
      insertAdjacentHTML: (_, output) => { section.output += output; }
    };
    return [name, section];
  }));
  const state = row.state;
  const context = vm.createContext({
    db: state, document: { getElementById: name => sections[name] },
    svc: id => state.services.find(s => s.id === id),
    barber: id => state.barbers.find(p => p.id === id),
    money: value => Number(value).toFixed(2), escapeHtml: String,
    fmtDate: String, today: () => date
  });
  vm.runInContext(insights + '\ndateRangePreset("all");', context);
  assert.match(sections.dashboard.output, /Ranking de cortes por barbeiro/);
  assert.match(sections.financeiro.output, /Faturamento por forma de pagamento/);
  assert.match(sections.financeiro.output, /390\.00/);
  vm.runInContext('insightFrom="2000-01-01";insightTo="2000-01-02";renderInsights();', context);
  assert.match(sections.financeiro.output, /<strong>0\.00<\/strong>/);
  assert.equal(sections.financeiro.output.match(/data-insights/g).length, 1);
});

test('A Master can create a Pro barbershop and retry after partial provisioning', async t => {
  let company, workspace, contract, failOnce = true;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const resource = new URL(url).pathname;
    const method = options.method || 'GET';
    const noContent = () => new Response(null, { status: 204 });
    const body = () => JSON.parse(options.body);
    if (resource.endsWith('/auth/v1/user') || resource.endsWith('/bolt_master_admins') ||
        resource.endsWith('/bolt_platform_plans')) return mockedFetch(url, options);
    if (resource.endsWith('/bolt_commercial_clients')) {
      if (method === 'POST') { company ??= { id, ...body() }; return new Response(null, { status: 201 }); }
      if (method === 'PATCH') { Object.assign(company, body()); return noContent(); }
      return Response.json(company ? [company] : []);
    }
    if (resource.endsWith('/bolt_barber_workspaces')) {
      workspace ??= body();
      return new Response(null, { status: 201 });
    }
    if (resource.endsWith('/bolt_client_subscriptions')) {
      if (failOnce) { failOnce = false; return Response.json({}, { status: 503 }); }
      contract ??= body();
      return new Response(null, { status: 201 });
    }
    throw Error(resource);
  });
  const business = { name: 'Barbearia Centro', slug: 'barbearia-centro' };
  assert.equal((await request('create', 'other', business)).status, 403);
  assert.equal((await request('create', 'master', business)).status, 503);
  assert.equal(company.status, 'prospect');
  assert.equal((await request('create', 'master', business)).status, 201);
  assert.equal(company.status, 'active');
  assert.equal(contract.plan_id, plan.id);
  assert.deepEqual(workspace.state.customers, []);
  assert.deepEqual(workspace.state.bookings, []);
  assert.equal((await request('create', 'master', business)).status, 409);
});

test('Barber plan creation accepts the empty HTTP 201 from PostgREST', async t => {
  let saved;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (new URL(url).pathname.endsWith('/bolt_platform_plans') && options.method === 'POST') {
      saved = JSON.parse(options.body);
      return new Response(null, { status: 201 });
    }
    return mockedFetch(url, options);
  });
  const payload = { product: 'barber', name: 'Premium', monthly_fee: 99.9, features: Object.keys(MODULES.barber) };
  const result = await platform({
    env,
    request: new Request(origin + '/api/platform?action=plan', {
      method: 'POST', headers: { authorization: 'Bearer master' }, body: JSON.stringify(payload)
    })
  });
  assert.equal(result.status, 200);
  assert.equal(saved.name, payload.name);
  assert.equal(saved.monthly_fee, payload.monthly_fee);
});
