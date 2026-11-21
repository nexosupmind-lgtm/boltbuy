import { delinquency } from './commercial-finance.js';

const sandbox = 'https://api-sandbox.asaas.com/v3';
const validIdentifier = (value, max) => typeof value === 'string' && value.length <= max && /^[a-zA-Z0-9_:-]+$/.test(value);
const json = (status, data) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
const digest = value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
async function matches(a, b) {
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  const aBytes = new Uint8Array(left), bBytes = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < aBytes.length; i++) difference |= aBytes[i] ^ bBytes[i];
  return difference === 0;
}

export function collectionDecision(status, dueDate, today, verificationSucceeded) {
  if (!verificationSucceeded) return null;
  if (status === 'RECEIVED') return 'reactivate';
  if (status !== 'PENDING' && status !== 'OVERDUE') return null;
  return delinquency((Date.parse(today) - Date.parse(dueDate)) / 86400000, true);
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { error: 'Método inválido.' });
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  const token = env.ASAAS_SANDBOX_WEBHOOK_TOKEN;
  const apiKey = env.ASAAS_SANDBOX_API_KEY;
  if (env.ASAAS_SANDBOX_ENABLED !== 'true' || !/^https:\/\/[^/]+\.supabase\.co$/.test(base) ||
      !service || !apiKey || !token || token.length < 32) return json(503, { error: 'Sandbox indisponível.' });
  const presented = request.headers.get('asaas-access-token') || '';
  if (presented.length > 512 || !await matches(token, presented)) return json(401, { error: 'Webhook não autorizado.' });
  const raw = await request.text();
  if (raw.length > 64000) return json(413, { error: 'Payload excede o limite.' });
  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { error: 'Evento inválido.' }); }
  if (!validIdentifier(body?.id, 150) || !validIdentifier(body?.payment?.id, 150) ||
      !validIdentifier(body?.event, 80) || !body.event.startsWith('PAYMENT_'))
    return json(400, { error: 'Evento inválido.' });
  const headers = { apikey: service, authorization: 'Bearer ' + service, 'content-type': 'application/json' };
  const table = base + '/rest/v1/bolt_asaas_sandbox_events';
  try {
    const seen = await fetch(table + '?select=event_id&event_id=eq.' + encodeURIComponent(body.id), { headers });
    if (!seen.ok) throw Error();
    if ((await seen.json()).length) return json(200, { ok: true, duplicate: true });
    const verification = await fetch(sandbox + '/payments/' + encodeURIComponent(body.payment.id),
      { headers: { access_token: apiKey, 'user-agent': 'BOLT-Master-Sandbox' }, redirect: 'error' });
    if (!verification.ok) throw Error();
    const payment = await verification.json();
    if (payment.id !== body.payment.id || !validIdentifier(payment.status, 60)) throw Error();
    const saved = await fetch(table + '?on_conflict=event_id', {
      method: 'POST', headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ event_id: body.id, payment_id: payment.id, event_type: body.event, verified_status: payment.status })
    });
    if (!saved.ok) throw Error();
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    return json(200, { ok: true, simulation: collectionDecision(payment.status, payment.dueDate, today, true) });
  } catch {
    return json(503, { error: 'Não foi possível verificar o evento do sandbox.' });
  }
}
