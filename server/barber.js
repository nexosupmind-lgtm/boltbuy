import { demoState, initialState } from './barber-demo.js';

const answer = (status, body) => Response.json(body, {
  status, headers: { 'cache-control': 'no-store' }
});
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const idPattern = /^[a-z0-9]{1,80}$/i;
const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const text = (value, max) => typeof value === 'string' && value.length <= max;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const proFeatures = ['bookings', 'customers', 'reports', 'ledger', 'catalog'];
const statuses = ['Confirmado', 'Concluído', 'Cancelado'];

function publicState(state) {
  return {
    services: state.services, payments: state.payments, hours: state.hours,
    interval: state.interval,
    barbers: state.barbers.filter(person => person.active).map(({ phone, ...person }) => person),
    bookings: state.bookings.filter(b => b.status !== 'Cancelado').map(({ date, time, serviceId, barberId }) =>
      ({ id: null, date, time, serviceId, barberId }))
  };
}

function currentTime() {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short'
  }).format(new Date());
  return parts;
}

function overlaps(bookings, candidate, services) {
  const duration = services.find(s => s.id === candidate.serviceId)?.duration || 30;
  const start = minutes(candidate.time);
  return bookings.some(b => b.id !== candidate.id && b.status !== 'Cancelado' &&
    b.date === candidate.date && b.barberId === candidate.barberId &&
    start < minutes(b.time) + (services.find(s => s.id === b.serviceId)?.duration || 30) &&
    minutes(b.time) < start + duration);
}

function validateSettings(state) {
  const list = (items, check, max = 250) => Array.isArray(items) && items.length <= max &&
    items.every(item => item && idPattern.test(item.id || '') && check(item)) &&
    new Set(items.map(item => item.id)).size === items.length;
  const image = value => text(value, 1500000) && /^(https:\/\/|data:image\/(?:png|jpeg|webp|gif);base64,)/i.test(value);
  return state && list(state.services, s => text(s.name, 120) && text(s.description, 1000) &&
      image(s.image) && Number.isFinite(s.price) && s.price >= 0 &&
      Number.isInteger(s.duration) && s.duration > 0 && s.duration <= 720) &&
    list(state.barbers, b => text(b.name, 120) && text(b.role, 120) && text(b.bio ?? '', 1000) &&
      text(b.phone ?? '', 40) && image(b.image) && typeof b.active === 'boolean') &&
    list(state.ledger, x => text(x.description, 100) && Number.isFinite(x.value) && x.value > 0 &&
      datePattern.test(x.due) && ['pagar', 'receber'].includes(x.type) && ['Pago', 'Pendente'].includes(x.status), 10000) &&
    Array.isArray(state.payments) && state.payments.length > 0 && state.payments.length <= 100 &&
    state.payments.every(p => text(p, 80) && p.trim()) &&
    Number.isInteger(state.interval) && state.interval >= 5 && state.interval <= 120 &&
    state.hours && Array.from({ length: 7 }, (_, day) => state.hours[day]).every(hours =>
      hours === null || (Array.isArray(hours) && hours.length === 2 &&
        hours.every(t => timePattern.test(t)) && hours[0] < hours[1]));
}

export async function onRequest({ request, env }) {
  const base = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!/^https:\/\/[^/]+\.supabase\.co$/.test(base) || !key)
    return answer(503, { error: 'Servidor indisponível.' });
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const slug = url.searchParams.get('slug') || '';
  const routes = { public: 'GET', admin: 'GET', save: 'PUT', profile: 'POST', book: 'POST', demo: 'POST', create: 'POST' };
  if (!Object.hasOwn(routes, action) || routes[action] !== request.method)
    return answer(405, { error: 'Operação inválida.' });
  if (!['demo', 'create'].includes(action) && (slug.length > 80 || !slugPattern.test(slug)))
    return answer(400, { error: 'Empresa inválida.' });

  const headers = { apikey: key, authorization: 'Bearer ' + key, 'content-type': 'application/json' };
  const rest = async (path, options = {}) => {
    const result = await fetch(base + '/rest/v1/' + path, {
      ...options, headers: { ...headers, ...options.headers }
    });
    if (!result.ok) throw Error('Falha na persistência do Barber.');
    return result.status === 204 ? null : result.json();
  };
  const mutate = (path, method, body, prefer = 'return=representation') =>
    rest(path, { method, headers: { Prefer: prefer }, body: JSON.stringify(body) });

  try {
    let admin = false, user;
    if (['admin', 'save', 'demo', 'create'].includes(action)) {
      const token = request.headers.get('authorization');
      if (!/^Bearer \S+$/.test(token || '')) return answer(401, { error: 'Entre com sua conta BOLT.' });
      const auth = await fetch(base + '/auth/v1/user', { headers: { apikey: key, authorization: token } });
      if (!auth.ok) return answer(401, { error: 'Sessão inválida ou expirada.' });
      user = (await auth.json()).id;
      if (!uuid.test(user || '')) return answer(401, { error: 'Sessão inválida.' });
      admin = (await rest('bolt_master_admins?select=user_id&user_id=eq.' + encodeURIComponent(user))).length === 1;
    }
    if (action === 'demo') {
      if (!admin) return answer(403, { error: 'Ação exclusiva do Master.' });
      await rest('rpc/bolt_barber_install_demo', { method: 'POST', body: JSON.stringify({ p_state: demoState() }) });
      return answer(200, { slug: 'boltbarber-demo' });
    }

    if (action === 'create') {
      if (!admin) return answer(403, { error: 'Ação exclusiva do Master.' });
      const raw = await request.text();
      if (raw.length > 4096) return answer(413, { error: 'Limite de dados excedido.' });
      let input;
      try { input = JSON.parse(raw); } catch { return answer(400, { error: 'Dados inválidos.' }); }
      const name = typeof input?.name === 'string' ? input.name.trim() : '', tenant = input?.slug;
      if (!text(name, 120) || !name || !text(tenant, 80) || !slugPattern.test(tenant) || tenant === 'boltbarber-demo')
        return answer(400, { error: 'Informe o nome e um identificador exclusivo.' });
      const [plan] = await rest('bolt_platform_plans?select=id,monthly_fee&product=eq.barber&name=eq.Pro');
      if (!plan) return answer(503, { error: 'Plano Pro do Barber indisponível.' });

      // Each step is retryable. The company stays out of the public API until all steps complete.
      const organization = 'bolt_commercial_clients?product=eq.barber&slug=eq.' + encodeURIComponent(tenant);
      await mutate('bolt_commercial_clients?on_conflict=product,slug', 'POST',
        { product: 'barber', name, slug: tenant, status: 'prospect' }, 'resolution=ignore-duplicates,return=minimal');
      const [created] = await rest(organization + '&select=id,name,status');
      if (!created || created.status !== 'prospect' || created.name !== name)
        return answer(409, { error: 'Este identificador já está em uso.' });
      await mutate('bolt_barber_workspaces?on_conflict=client_id', 'POST',
        { client_id: created.id, state: { ...initialState(), barbers: [] } }, 'resolution=ignore-duplicates,return=minimal');
      await mutate('bolt_client_subscriptions?on_conflict=client_id', 'POST',
        { client_id: created.id, plan_id: plan.id, monthly_fee: plan.monthly_fee, status: 'active' },
        'resolution=ignore-duplicates,return=minimal');
      await mutate(organization + '&status=eq.prospect', 'PATCH', { status: 'active' }, 'return=minimal');
      return answer(201, { slug: tenant });
    }

    const [client] = await rest('bolt_commercial_clients?product=eq.barber&select=id,status&slug=eq.' + encodeURIComponent(slug));
    if (!client || client.status !== 'active') return answer(404, { error: 'Barbearia indisponível.' });
    if (user && !admin) {
      const roles = await rest('bolt_commercial_memberships?select=role&client_id=eq.' + client.id +
        '&user_id=eq.' + encodeURIComponent(user));
      if (!roles.some(row => row.role === 'owner')) return answer(403, { error: 'Conta sem acesso a esta empresa.' });
    }
    const [contract] = await rest('bolt_client_subscriptions?select=status,plan_id&client_id=eq.' + client.id);
    if (!['active', 'trial'].includes(contract?.status) || !uuid.test(contract.plan_id || ''))
      return answer(403, { error: 'Empresa com assinatura indisponível.' });

    const [plan] = await rest('bolt_platform_plans?product=eq.barber&select=features&id=eq.' + contract.plan_id);
    if (!Array.isArray(plan?.features) || !proFeatures.every(feature => plan.features.includes(feature)))
      return answer(403, { error: 'Os módulos do BOLT Barber não estão habilitados nesta assinatura.' });

    const scope = 'bolt_barber_workspaces?client_id=eq.' + client.id;
    const [row] = await rest(scope + '&select=state,revision');
    if (!row) return answer(404, { error: 'Barbearia ainda não configurada.' });
    const { state, revision } = row;
    if (action === 'public') return answer(200, { state: publicState(state) });
    if (action === 'admin') return answer(200, row);
    const raw = await request.text();
    if (raw.length > (action === 'save' ? 4000000 : 4096))
      return answer(413, { error: 'Limite de dados excedido.' });
    let body;
    try { body = JSON.parse(raw); } catch { return answer(400, { error: 'Dados inválidos.' }); }
    if (!body || typeof body !== 'object') return answer(400, { error: 'Dados inválidos.' });

    let booking, profile;
    const next = structuredClone(state);
    if (action === 'save') {
      if (body.revision !== revision) return answer(409, { error: 'A agenda mudou. Atualize e tente novamente.' });
      const settings = body.state;
      if (!validateSettings(settings) || !Array.isArray(settings.bookings) || settings.bookings.length !== state.bookings.length)
        return answer(400, { error: 'Configuração inválida.' });
      const byId = new Map(settings.bookings.map(b => [b?.id, b?.status]));
      if (state.bookings.some(b => !statuses.includes(byId.get(b.id)) ||
        !settings.services.some(s => s.id === b.serviceId) || !settings.barbers.some(p => p.id === b.barberId)))
        return answer(400, { error: 'Agenda inválida.' });
      next.bookings = state.bookings.map(b => ({ ...b, status: byId.get(b.id) }));
      const changedServices = new Set(settings.services.filter(s =>
        state.services.find(old => old.id === s.id)?.duration !== s.duration).map(s => s.id));
      if (next.bookings.some((b, i) => b.status !== 'Cancelado' &&
        (b.status !== state.bookings[i].status || changedServices.has(b.serviceId)) &&
        overlaps(next.bookings, b, settings.services)))
        return answer(409, { error: 'A alteração gera um conflito de horários.' });
      for (const field of ['services', 'barbers', 'payments', 'hours', 'interval', 'ledger']) next[field] = settings[field];
      // Public responses use explicit field lists, even for owner-supplied objects.
      next.services = next.services.map(({ id, name, price, duration, image, description }) =>
        ({ id, name, price, duration, image, description }));
      next.barbers = next.barbers.map(({ id, name, role, image, bio, phone, active }) =>
        ({ id, name, role, image, bio, phone, active }));
    } else if (action === 'profile') {
      if (!text(body.name, 120) || !/\S+\s+\S+/.test(body.name.trim()) ||
        !text(body.phone, 40) || !/^\d{10,13}$/.test(body.phone.replace(/\D/g, '')))
        return answer(400, { error: 'Confira o nome e o telefone.' });
      profile = { id: crypto.randomUUID(), name: body.name.trim(), phone: body.phone.trim() };
      next.customers.push(profile);
    } else {
      const customer = uuid.test(body.profileId || '') && state.customers.find(c => c.id === body.profileId);
      const service = state.services.find(s => s.id === body.serviceId);
      const barber = state.barbers.find(p => p.id === body.barberId && p.active);
      const date = body.date, time = body.time;
      const day = datePattern.test(date || '') ? new Date(date + 'T12:00:00Z') : null;
      const hours = day && state.hours[day.getUTCDay()];
      if (!customer || !service || !barber || !day || !Number.isFinite(day.getTime()) ||
        day.toISOString().slice(0, 10) !== date || !timePattern.test(time || '') || !hours ||
        date + ' ' + time <= currentTime() || minutes(time) < minutes(hours[0]) ||
        minutes(time) + service.duration > minutes(hours[1]) ||
        (minutes(time) - minutes(hours[0])) % state.interval || !state.payments.includes(body.payment))
        return answer(400, { error: 'Confira o perfil, o serviço e o horário.' });
      booking = { id: crypto.randomUUID().replaceAll('-', ''), name: customer.name, phone: customer.phone,
        serviceId: service.id, barberId: barber.id, date, time, payment: body.payment,
        status: 'Confirmado', createdAt: new Date().toISOString() };
      if (overlaps(state.bookings, booking, state.services))
        return answer(409, { error: 'Horário ocupado. Selecione outro.' });
      next.bookings.push(booking);
    }

    if (!user) {
      const address = request.headers.get('CF-Connecting-IP') || 'local';
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address));
      const fingerprint = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
      const allowed = await rest('rpc/bolt_support_allow', {
        method: 'POST', body: JSON.stringify({ p_key: 'barber:' + client.id + ':' + action + ':' + fingerprint })
      });
      if (!allowed) return answer(429, { error: 'Limite de solicitações atingido. Tente mais tarde.' });
    }
    const saved = await mutate(scope + '&revision=eq.' + revision, 'PATCH',
      { state: next, revision: crypto.randomUUID() });
    if (!saved.length) return answer(409, { error: 'A agenda mudou. Tente novamente.' });
    if (booking) return answer(201, { booking, state: publicState(next) });
    if (profile) return answer(201, { profile });
    return answer(200, saved[0]);
  } catch {
    return answer(503, { error: 'BOLT Barber indisponível. Confira a instalação e tente novamente.' });
  }
}
