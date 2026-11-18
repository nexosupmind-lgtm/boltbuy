const reply = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});
const surfaces = ['shop', 'delivery-admin', 'class-admin', 'church-admin', 'login', 'family', 'teacher', 'member'];
const properties = new Set(['color', 'backgroundColor', 'borderColor', 'borderRadius', 'fontSize', 'fontWeight', 'fontFamily', 'padding', 'gap', 'textAlign', 'maxWidth']);
function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Configuração inválida.');
  const pages = {};
  for (const [surface, rules] of Object.entries(input.pages || {})) {
    if (!surfaces.includes(surface) || !Array.isArray(rules) || rules.length > 250) throw Error('Página inválida.');
    pages[surface] = rules.map(rule => {
      if (typeof rule.selector !== 'string' || rule.selector.length > 600 || !/^[\w\s.#>:[\]="'()\-]+$/.test(rule.selector)) throw Error('Elemento inválido.');
      const style = {};
      for (const [key, value] of Object.entries(rule.style || {})) {
        if (!properties.has(key) || typeof value !== 'string' || value.length > 100 || /[{};<>\\]|url\s*\(|expression/i.test(value)) throw Error('Estilo inválido.');
        style[key] = value;
      }
      const clean = { selector: rule.selector, style };
      if (rule.view !== undefined) {
        if (typeof rule.view !== 'string' || rule.view.length > 500) throw Error('Seção inválida.');
        clean.view = rule.view;
      }
      if (typeof rule.text === 'string') {
        if (rule.text.length > 2000 || typeof rule.original !== 'string' || rule.original.length > 2000) throw Error('Texto inválido.');
        clean.text = rule.text;
        clean.original = rule.original;
      }
      return clean;
    });
  }
  return { version: 1, pages };
}
export async function onRequest({ request, env }) {
  if (!['GET', 'PUT'].includes(request.method)) return reply(405, { error: 'Método não permitido.' });
  try {
    const q = new URL(request.url).searchParams;
    const product = q.get('product'), slug = q.get('slug');
    if (!['buy', 'class', 'church'].includes(product) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || '')) return reply(400, { error: 'Cliente inválido.' });
    const base = (env.SUPABASE_URL || '').replace(/\/$/, ''), key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!/^https:\/\/[^/]+\.supabase\.co$/.test(base) || !key) return reply(503, { error: 'Servidor não configurado.' });
    const headers = { apikey: key, authorization: 'Bearer ' + key, 'content-type': 'application/json' };
    async function read(path) {
      const response = await fetch(base + '/rest/v1/' + path, { headers });
      if (!response.ok) throw Error('Não foi possível consultar as configurações.');
      return response.json();
    }
    if (request.method === 'PUT') {
      const token = request.headers.get('authorization');
      if (!/^Bearer \S+$/.test(token || '')) return reply(401, { error: 'Entre no Master.' });
      const auth = await fetch(base + '/auth/v1/user', { headers: { apikey: key, authorization: token } });
      if (!auth.ok) return reply(401, { error: 'Sessão expirada.' });
      const user = await auth.json();
      if (!user.id) return reply(401, { error: 'Sessão inválida.' });
      const admins = await read('bolt_master_admins?user_id=eq.' + encodeURIComponent(user.id) + '&select=user_id');
      if (admins.length !== 1) return reply(403, { error: 'A edição exige acesso Master.' });
    }
    const delivery = product === 'buy';
    const clients = await read((delivery ? 'bolt_tenants' : 'bolt_commercial_clients') + '?slug=eq.' + encodeURIComponent(slug) + (delivery ? '' : '&product=eq.' + product) + '&select=id');
    if (clients.length !== 1) return reply(404, { error: 'Cliente não encontrado.' });
    const table = delivery ? 'bolt_delivery_storefronts' : 'bolt_client_studio_settings';
    const column = delivery ? 'settings' : 'features', idColumn = delivery ? 'tenant_id' : 'client_id';
    const filter = idColumn + '=eq.' + encodeURIComponent(clients[0].id);
    const rows = await read(table + '?' + filter + '&select=' + column + ',updated_at');
    const current = rows[0], container = current?.[column] || {};
    if (request.method === 'GET') return reply(200, { visual: container.visualEditor || { version: 1, pages: {} }, revision: current?.updated_at || null });
    const text = await request.text();
    if (text.length > 300000) return reply(413, { error: 'Limite de personalização excedido.' });
    let body;
    try { body = JSON.parse(text); body.visual = validate(body.visual); }
    catch (error) { return reply(400, { error: error.message || 'Dados inválidos.' }); }
    if (body.revision !== (current?.updated_at || null)) return reply(409, { error: 'Outro editor salvou alterações. Recarregue as configurações antes de publicar.' });
    const revision = new Date().toISOString();
    const payload = { [column]: { ...container, visualEditor: body.visual }, updated_at: revision };
    if (!current) payload[idColumn] = clients[0].id;
    const response = await fetch(base + '/rest/v1/' + table + (current ? '?' + filter + '&updated_at=eq.' + encodeURIComponent(current.updated_at) : ''), {
      method: current ? 'PATCH' : 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(payload)
    });
    if (response.status === 409) return reply(409, { error: 'Configuração alterada em outra sessão. Recarregue antes de publicar.' });
    if (!response.ok) throw Error('Não foi possível salvar a personalização.');
    const saved = await response.json();
    if (!saved.length) return reply(409, { error: 'Configuração alterada em outra sessão. Recarregue antes de publicar.' });
    return reply(200, { visual: body.visual, revision });
  } catch { return reply(500, { error: 'Não foi possível concluir a operação no Studio.' }); }
}
