const barberIntegration = (() => {
  const params = new URLSearchParams(location.search);
  const studioPreview = params.get('studioVisual') === '1' && window.parent !== window;
  const slug = params.get('tenant') || '';
  let client, revision, committed, publicData, inAdmin = false;

  const supabase = () => {
    if (!client) {
      const config = window.BOLT_CONFIG;
      client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { detectSessionInUrl: false }
      });
    }
    return client;
  };

  async function request(action, body) {
    if (studioPreview && body) throw Error('Alterações operacionais estão desativadas na prévia do Studio.');
    const headers = {};
    if (['admin', 'save'].includes(action)) {
      const { data } = await supabase().auth.getSession();
      if (!data.session) throw Error('Entre com sua conta BOLT.');
      headers.authorization = 'Bearer ' + data.session.access_token;
    }
    if (body) headers['content-type'] = 'application/json';
    const response = await fetch('/api/barber?' + new URLSearchParams({ action, slug }), {
      method: action === 'save' ? 'PUT' : body ? 'POST' : 'GET',
      headers, body: body ? JSON.stringify(body) : undefined
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Não foi possível concluir.');
    return result;
  }

  function applyAdmin(result) {
    revision = result.revision;
    committed = structuredClone(result.state);
    db = result.state;
  }

  async function reload() {
    if (inAdmin) {
      applyAdmin(await request('admin'));
      renderAdmin();
    } else {
      publicData = (await request('public')).state;
      db = structuredClone(publicData);
    }
    renderPublic();
  }

  async function enterAdmin() {
    applyAdmin(await request('admin'));
    inAdmin = true;
    closeLogin();
    $('publicSite').classList.add('hidden');
    $('adminApp').classList.remove('hidden');
    showPage('dashboard');
  }

  async function login(email, password) {
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw Error('E-mail ou senha inválidos.');
    await enterAdmin();
  }

  function closeAdmin() {
    inAdmin = false;
    committed = null;
    revision = null;
    db = structuredClone(publicData);
    $('adminApp').classList.add('hidden');
    for (const section of document.querySelectorAll('.admin-section')) section.replaceChildren();
    $('publicSite').classList.remove('hidden');
    renderPublic();
    reload().catch(error => toast(error.message));
    window.scrollTo(0, 0);
  }

  async function save(state) {
    if (!inAdmin || !committed) return false;
    const panel = $('adminApp');
    if (panel.inert) return false;
    panel.inert = true;
    try {
      applyAdmin(await request('save', { revision, state }));
      return true;
    } catch (error) {
      db = structuredClone(committed);
      await reload().catch(() => renderAdmin());
      toast(error.message);
      return false;
    } finally {
      panel.inert = false;
    }
  }

  async function refreshAfterBooking(state) {
    publicData = state;
    db = structuredClone(state);
    renderPublic();
  }

  async function start() {
    $('confirmBooking').disabled = true;
    try {
      await reload();
      $('confirmBooking').disabled = false;
      if (params.get('view') === 'login') openLogin();
      if (params.get('view') === 'admin') {
        try { await enterAdmin(); }
        catch (error) {
          openLogin();
          $('loginError').textContent = error.message;
        }
      }
    } catch (error) {
      $('slots').textContent = error.message;
      toast(error.message);
    }
  }

  return { slug, start, request, reload, login, closeAdmin, save, refreshAfterBooking };
})();
