(() => {
  'use strict';
  const config = window.BOLT_CONFIG;
  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { storageKey: 'bolt-partner-session', detectSessionInUrl: false }
  });
  const form = document.getElementById('partner-login');
  const report = document.getElementById('partner-finance');
  const message = document.getElementById('partner-message');
  const signout = document.getElementById('partner-signout');
  function enter() {
    form.hidden = true;
    signout.hidden = report.hidden = false;
    window.BOLT_COMMERCIAL_FINANCE.mount(report, client, true);
  }
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const { error } = await client.auth.signInWithPassword({
        email: form.elements.email.value.trim(), password: form.elements.password.value
      });
      if (error) throw error;
      message.textContent = '';
      enter();
    } catch { message.textContent = 'Não foi possível entrar com essa conta.'; }
    finally { button.disabled = false; form.elements.password.value = ''; }
  };
  signout.onclick = async () => {
    await client.auth.signOut();
    report.replaceChildren();
    signout.hidden = report.hidden = true;
    form.hidden = false;
  };
})();
