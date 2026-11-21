import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allocate, summarize, onRequest as finance } from '../server/commercial-finance.js';
import { collectionDecision, onRequest as webhook } from '../server/asaas-sandbox.js';

test('Divides expenses without dropping cents and separates cash, billing and estimates', () => {
  assert.deepEqual(allocate(101, ['barber', 'class']), { class: 51, barber: 50 });
  const report = summarize({
    clients: [{ id: 'a', product: 'barber' }, { id: 'b', product: 'class' }],
    subscriptions: [{ id: 's', client_id: 'a', status: 'active', monthly_fee: 59.9 }],
    invoices: [{ id: 'initial', subscription_id: 's', due_date: '2025-01-10', paid_at: '2025-01-12T13:00:00Z', amount: 250 },
      { id: 'recurring', subscription_id: 's', due_date: '2025-02-10', amount: 59.9 }],
    expenses: [{ expense_date: '2025-01-10', cents: 101, paid: true, category: 'fee', products: ['barber','class'] }],
    commissions: [{ invoice_id: 'initial', amount: 150, earned_at: '2025-01-12T13:00:00Z' }],
    from: '2025-01-01', to: '2025-12-31', today: '2025-02-18'
  });
  assert.equal(report.barber.revenue, 25000);
  assert.equal(report.barber.mrr, 5990);
  assert.equal(report.barber.overdue, 1);
  assert.equal(report.barber.cashResult, 24950);
  assert.equal(report.barber.estimatedProfit, 15940);
  assert.equal(report.class.costs, 51);
});

test('Simulates due reminders, suspension, reactivation and an unavailable provider', () => {
  const due = '2025-01-01';
  const expected = { '01': 'due_reminder', '02': null, '03': 'friendly_reminder',
    '06': 'suspension_warning', '08': 'suspend', '31': 'cancellation_review' };
  for (const [day, action] of Object.entries(expected))
    assert.equal(collectionDecision('OVERDUE', due, '2025-01-' + day, true), action);
  assert.equal(collectionDecision('RECEIVED', due, '2025-01-31', true), 'reactivate');
  assert.equal(collectionDecision('OVERDUE', due, '2025-01-31', false), null);
});

test('Sandbox webhook verifies the event against Asaas and deduplicates delivery', async t => {
  let visitedAsaas = 0, saved = null;
  const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'mock-service',
    ASAAS_SANDBOX_API_KEY: 'mock-key', ASAAS_SANDBOX_ENABLED: 'true', ASAAS_SANDBOX_WEBHOOK_TOKEN: 'sandbox-fixture-token-long-enough' };
  const invoke = token => webhook({ env, request: new Request('https://example.test/api/asaas-sandbox', {
    method: 'POST', headers: { 'asaas-access-token': token },
    body: JSON.stringify({ id: 'evt_001', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_001', status: 'RECEIVED' } })
  }) });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (new URL(url).hostname === 'api-sandbox.asaas.com') {
      visitedAsaas++;
      return Response.json({ id: 'pay_001', status: 'OVERDUE', dueDate: '2025-01-01' });
    }
    if (options.method === 'POST') { saved = JSON.parse(options.body); return new Response(null, { status: 201 }); }
    return Response.json(saved ? [saved] : []);
  });
  assert.equal((await invoke('wrong-token')).status, 401);
  assert.equal(visitedAsaas, 0);
  assert.equal((await invoke(env.ASAAS_SANDBOX_WEBHOOK_TOKEN)).status, 200);
  assert.equal(saved.verified_status, 'OVERDUE');
  assert.equal((await (await invoke(env.ASAAS_SANDBOX_WEBHOOK_TOKEN)).json()).duplicate, true);
  assert.equal(visitedAsaas, 1);
});

test('Samuel sees Barber records only and cannot write financial or partner data', async t => {
  const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'mock-service' };
  const collections = {
    bolt_master_admins: [], bolt_partner_access: [{ partner: 'samuel', product: 'barber' }],
    bolt_commercial_clients: [{ id: 'a', name: 'Barbearia A', product: 'barber', status: 'active' }],
    bolt_client_subscriptions: [{ id: 's1', client_id: 'a', status: 'active', monthly_fee: 59.9 },
      { id: 's2', client_id: 'b', status: 'active', monthly_fee: 99 }],
    bolt_client_invoices: [{ id: 'i1', subscription_id: 's1' }, { id: 'i2', subscription_id: 's2' }],
    bolt_commissions: [], bolt_commission_payouts: []
  };
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname;
    if (path === '/auth/v1/user') return Response.json({ id: '00000000-0000-4000-8000-000000000111' });
    const table = path.split('/').at(-1);
    assert(Object.hasOwn(collections, table));
    if (table === 'bolt_commercial_clients') assert.equal(new URL(url).searchParams.get('product'), 'eq.barber');
    return Response.json(collections[table]);
  });
  const invoke = (method, action) => finance({ env, request: new Request('https://example.test/api/commercial-finance?action=' + action,
    { method, headers: { authorization: 'Bearer fixture' }, ...(method === 'POST' ? { body: '{}' } : {}) }) });
  const response = await invoke('GET', 'summary');
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(Object.keys(result.report), ['barber']);
  assert.deepEqual(result.invoices.map(i => i.id), ['i1']);
  assert.equal((await invoke('POST', 'partner')).status, 403);
  assert.equal((await invoke('POST', 'payout')).status, 403);
});
