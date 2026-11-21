const products = ['buy', 'class', 'church', 'barber'];
const categories = ['infrastructure', 'tax', 'fee', 'other'];
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const localDate = timestamp => new Date(timestamp).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const cents = amount => Math.round(Number(amount) * 100);
const reply = (status, body) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export function delinquency(days, verified) {
  if (!verified || !Number.isInteger(days) || days < 0) return null;
  if (days >= 30) return 'cancellation_review';
  if (days >= 7) return 'suspend';
  if (days >= 5) return 'suspension_warning';
  if (days >= 2) return 'friendly_reminder';
  return days === 0 ? 'due_reminder' : null;
}

export function allocate(cents, channels) {
  const selected = products.filter(product => channels.includes(product));
  const portion = Math.floor(cents / selected.length);
  return Object.fromEntries(selected.map((product, i) => [product, portion + (i < cents % selected.length ? 1 : 0)]));
}

export function summarize({ clients, subscriptions, invoices, expenses, commissions, from, to, today }) {
  const byClient = new Map(clients.map(c => [c.id, c]));
  const bySubscription = new Map(subscriptions.map(s => [s.id, s]));
  const byInvoice = new Map(invoices.map(i => [i.id, i]));
  const byProduct = Object.fromEntries(products.map(p => [p, {
    revenue: 0, invoiced: 0, paidCosts: 0, costs: 0, commissions: 0, paidCommissions: 0, mrr: 0,
    active: 0, overdue: 0, categories: Object.fromEntries(categories.map(c => [c, 0])),
    months: {}
  }]));
  const within = day => day >= from && day <= to;
  const summaryFor = subscription => byProduct[byClient.get(subscription?.tenant_id || subscription?.client_id)?.product];
  const overdue = new Set();
  for (const i of invoices) {
    const total = summaryFor(bySubscription.get(i.subscription_id));
    if (!total) continue;
    if (within(i.due_date)) total.invoiced += cents(i.amount);
    if (i.paid_at) {
      const day = localDate(i.paid_at);
      if (within(day)) {
        const value = cents(i.amount);
        const month = day.slice(0, 7);
        total.revenue += value;
        total.months[month] = (total.months[month] ?? 0) + value;
      }
    } else if (i.due_date < today) overdue.add(i.subscription_id);
  }
  for (const s of subscriptions) {
    const total = summaryFor(s);
    if (!total || !['active', 'trial', 'paused'].includes(s.status)) continue;
    if (s.status === 'active') { total.mrr += cents(s.monthly_fee); total.active++; }
    if (overdue.has(s.id)) total.overdue++;
  }
  for (const expense of expenses) {
    if (!within(expense.expense_date)) continue;
    for (const [product, share] of Object.entries(allocate(expense.cents, expense.products))) {
      const total = byProduct[product];
      total.costs += share;
      total.categories[expense.category] += share;
      if (expense.paid) total.paidCosts += share;
    }
  }
  for (const c of commissions) {
    const total = summaryFor(bySubscription.get(byInvoice.get(c.invoice_id)?.subscription_id));
    if (!total) continue;
    if (within(localDate(c.earned_at))) total.commissions += cents(c.amount);
    if (c.payout?.recorded_at && within(localDate(c.payout.recorded_at))) total.paidCommissions += cents(c.amount);
  }
  for (const total of Object.values(byProduct)) {
    total.estimatedProfit = total.invoiced - total.costs - total.commissions;
    total.cashResult = total.revenue - total.paidCosts - total.paidCommissions;
  }
  return byProduct;
}

export async function onRequest({ request, env }) {
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get('authorization');
  if (!/^Bearer \S+$/.test(token || '')) return reply(401, { error: 'Entre no BOLT.' });
  if (!/^https:\/\/[^/]+\.supabase\.co$/.test(base) || !key) return reply(503, { error: 'Servidor indisponível.' });
  const method = request.method;
  const q = new URL(request.url).searchParams;
  const action = q.get('action') || 'summary';
  const headers = { apikey: key, authorization: 'Bearer ' + key, 'content-type': 'application/json' };
  async function rest(path, payload, prefer) {
    const response = await fetch(base + '/rest/v1/' + path, {
      headers: prefer ? { ...headers, Prefer: prefer } : headers, ...(payload === undefined ? {} : { method: 'POST', body: JSON.stringify(payload) })
    });
    const raw = await response.text();
    if (!response.ok) throw Object.assign(Error('Não foi possível confirmar a operação financeira.'), { status: response.status });
    return raw ? JSON.parse(raw) : null;
  }
  async function all(path) {
    const rows = [];
    for (let offset = 0; offset < 100000; offset += 500) {
      const batch = await rest(path + '&limit=500&offset=' + offset);
      rows.push(...batch);
      if (batch.length < 500) return rows;
    }
    throw Error('Volume acima do limite.');
  }
  try {
    const auth = await fetch(base + '/auth/v1/user', { headers: { apikey: key, authorization: token } });
    if (!auth.ok) return reply(401, { error: 'Sessão inválida.' });
    const user = (await auth.json()).id;
    if (!/^[a-f0-9-]{36}$/i.test(user || '')) return reply(401, { error: 'Sessão inválida.' });
    const master = (await rest('bolt_master_admins?select=user_id&user_id=eq.' + user)).length === 1;
    const partner = master ? null : (await rest('bolt_partner_access?select=product,partner&user_id=eq.' + user))[0];
    if (!master && (!partner || method !== 'GET' || action !== 'summary')) return reply(403, { error: 'Acesso negado.' });

    if (method === 'POST' && ['expense','payout','partner'].includes(action)) {
      const raw = await request.text();
      if (raw.length > 4096) return reply(413, { error: 'Solicitação muito grande.' });
      let body;
      try { body = JSON.parse(raw); } catch { return reply(400, { error: 'Dados inválidos.' }); }
      if (action === 'partner') {
        if (!['barber','class'].includes(body?.product) || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(body.user_id || ''))
          return reply(400, { error: 'Informe o UUID de uma conta já cadastrada e o produto.' });
        await rest('bolt_partner_access?on_conflict=product', {
          product: body.product, partner: body.product === 'barber' ? 'samuel' : 'cesar', user_id: body.user_id
        }, 'resolution=merge-duplicates,return=minimal');
      } else if (action === 'payout') {
        if (!date(body?.month) || !body.month.endsWith('-01') || typeof body.reference !== 'string' ||
            !body.reference.trim() || body.reference.length > 120)
          return reply(400, { error: 'Informe um mês encerrado e a referência do repasse já efetuado.' });
        await rest('rpc/bolt_record_commission_payout', { p_month: body.month, p_actor: user, p_reference: body.reference.trim() });
      } else {
        if (!date(body?.expense_date) || !categories.includes(body.category) ||
          !Number.isInteger(body.cents) || body.cents < 1 || body.cents > 2147483647 ||
          typeof body.description !== 'string' || !body.description.trim() || body.description.length > 160 ||
          !Array.isArray(body.products) || !body.products.length || !body.products.every(p => products.includes(p)) ||
          typeof body.paid !== 'boolean') return reply(400, { error: 'Confira os dados da despesa.' });
        await rest('bolt_product_expenses', { expense_date: body.expense_date, category: body.category,
          description: body.description.trim(), cents: body.cents, products: [...new Set(body.products)], paid: body.paid, actor: user });
      }
      return reply(201, { ok: true });
    }
    if (method !== 'GET' || action !== 'summary') return reply(405, { error: 'Operação inválida.' });
    const today = localDate(Date.now());
    const from = q.get('from') || today.slice(0, 4) + '-01-01', to = q.get('to') || today;
    if (!date(from) || !date(to) || from > to) return reply(400, { error: 'Informe um período válido.' });

    const [delivery, commercial, subscriptions, invoices, expenses, commissions, payouts] = await Promise.all([
      master ? all('bolt_tenants?select=id,name,status&order=id') : [],
      all('bolt_commercial_clients?select=id,name,product,status&order=id' + (partner ? '&product=eq.' + partner.product : '')),
      all('bolt_client_subscriptions?select=id,tenant_id,client_id,monthly_fee,status&order=id'),
      all('bolt_client_invoices?select=id,subscription_id,amount,due_date,paid_at,billing_kind&order=id'),
      master ? all('bolt_product_expenses?select=expense_date,description,category,cents,products,paid&order=id&expense_date=gte.' + from + '&expense_date=lte.' + to) : [],
      master || partner?.partner === 'samuel' ? all('bolt_commissions?select=invoice_id,amount,earned_at,payout_id,payout:bolt_commission_payouts(recorded_at)&order=invoice_id') : [],
      master || partner?.partner === 'samuel' ? all('bolt_commission_payouts?select=id,month,recorded_at,reference&order=id') : []
    ]);
    const clients = [...delivery.map(c => ({ ...c, product: 'buy' })), ...commercial];
    const ids = new Set(clients.map(c => c.id));
    const scopedSubscriptions = subscriptions.filter(s => ids.has(s.tenant_id || s.client_id));
    const scope = new Set(scopedSubscriptions.map(s => s.id));
    const scopedInvoices = invoices.filter(i => scope.has(i.subscription_id));
    const invoiceIds = new Set(scopedInvoices.map(i => i.id));
    const scopedCommissions = commissions.filter(c => invoiceIds.has(c.invoice_id));
    const report = summarize({ clients, subscriptions: scopedSubscriptions, invoices: scopedInvoices, expenses,
      commissions: scopedCommissions, from, to, today });
    const overdueAlerts = master ? scopedInvoices.filter(i => !i.paid_at && i.due_date <= today).map(i => {
      const subscription = scopedSubscriptions.find(s => s.id === i.subscription_id);
      const client = clients.find(c => c.id === (subscription?.tenant_id || subscription?.client_id));
      const days = (Date.parse(today) - Date.parse(i.due_date)) / 86400000;
      return { client: client?.name, product: client?.product, days, due_date: i.due_date, amount: i.amount };
    }) : [];
    const partners = master ? await rest('bolt_partner_access?select=product,partner,user_id&order=product') : [];
    const audit = master ? await rest('bolt_financial_audit?select=event,subject,metadata,created_at&order=id.desc&limit=100') : [];
    return reply(200, { from, to, report: master ? report : { [partner.product]: report[partner.product] },
      clients: master ? undefined : commercial, invoices: master ? undefined : scopedInvoices, expenses, audit, partners, overdueAlerts,
      commissions: scopedCommissions, payouts: master ? payouts : payouts.map(({ id, month, recorded_at })=>({ id, month, recorded_at })) });
  } catch (error) {
    return reply(error.status === 409 ? 409 : 503, { error: 'Não foi possível concluir. Confira as migrações e o período selecionado.' });
  }
}
