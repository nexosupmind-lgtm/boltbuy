(() => {
  'use strict';
  const labels = { buy: 'BOLT Buy', class: 'BOLT Class', church: 'BOLT Church', barber: 'BOLT Barber' };
  const money = value => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  async function api(client, query, payload) {
    const { data } = await client.auth.getSession();
    if (!data.session) throw Error('Entre com sua conta BOLT.');
    const response = await fetch('/api/commercial-finance?' + query, {
      headers: { authorization: 'Bearer ' + data.session.access_token, 'content-type': 'application/json' },
      ...(payload ? { method: 'POST', body: JSON.stringify(payload) } : {})
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error);
    return result;
  }
  function draw(root, report) {
    const fields = [['Recebido', 'revenue'], ['Faturado', 'invoiced'], ['MRR', 'mrr'], ['Despesas', 'costs'],
      ['Comissões', 'commissions'], ['Lucro estimado', 'estimatedProfit'], ['Resultado de caixa', 'cashResult']];
    root.innerHTML = Object.entries(report).map(([product, r]) => {
      const max = Math.max(1, ...Object.values(r.months));
      return `<article class="v35-card"><h3>${labels[product]}</h3><p>${r.active} contratos ativos · ${r.overdue} inadimplentes</p><dl>${fields.map(([label, key]) => `<dt>${label}</dt><dd>${money(r[key])}</dd>`).join('')}</dl><h4>Recebimentos mensais</h4>${Object.entries(r.months).sort().map(([month, value]) => `<div><span>${esc(month)} · ${money(value)}</span><meter aria-label="Recebimentos de ${esc(month)}" min="0" max="${max}" value="${value}"></meter></div>`).join('') || '<p>Sem recebimentos no período.</p>'}</article>`;
    }).join('');
  }
  function mount(node, client, partner = false) {
    node.innerHTML = `<div class="v35-card"><h3>Financeiro por produto</h3><form data-filter><label>De<input type="date" name="from"></label><label>Até<input type="date" name="to"></label><button type="submit">Aplicar período</button></form><p data-status role="status"></p><div data-report class="v35-two"></div><div data-commission></div><div data-partners></div><div data-arrears></div><details data-cash-audit><summary>Auditoria financeira</summary><ul data-audit></ul></details></div>${partner?'':`<div class="v35-two"><form class="v35-card" data-action="expense"><h3>Registrar despesa</h3><label>Descrição<input name="description" maxlength="160" required></label><label>Data<input type="date" name="expense_date" required></label><label>Valor (R$)<input name="amount" type="number" min="0.01" step="0.01" required></label><label>Categoria<select name="category"><option value="infrastructure">Infraestrutura</option><option value="tax">Imposto</option><option value="fee">Taxa</option><option value="other">Outras</option></select></label><fieldset><legend>Dividir igualmente entre</legend>${Object.entries(labels).map(([key,label])=>`<label><input type="checkbox" name="product" value="${key}">${label}</label>`).join('')}</fieldset><label><input type="checkbox" name="paid"> Despesa já paga</label><button type="submit">Registrar despesa</button></form><form class="v35-card" data-action="payout"><h3>Registrar repasse ao Samuel</h3><p>Registre somente uma transferência que você já fez.</p><label>Mês de apuração<input type="month" name="month" required></label><label>Referência do comprovante<input name="reference" required maxlength="120"></label><button type="submit">Registrar repasse</button></form><form class="v35-card" data-action="partner"><h3>Acesso de parceiros</h3><p>Vincula ou substitui a conta autorizada para o produto.</p><label>Perfil<select name="product"><option value="barber">Samuel · BOLT Barber</option><option value="class">César · BOLT Class</option></select></label><label>UUID do usuário no Supabase<input name="user_id" required maxlength="36"></label><button type="submit">Vincular conta</button></form></div>`}`;
    const status = node.querySelector('[data-status]');
    const filter = node.querySelector('[data-filter]');
    async function load() {
      status.textContent = 'Carregando financeiro…';
      const query = new URLSearchParams([...new FormData(filter)].filter(([, value]) => value));
      try {
        const data = await api(client, query);
        filter.elements.from.value = data.from; filter.elements.to.value = data.to;
        draw(node.querySelector('[data-report]'), data.report);
        const pending = data.commissions.filter(c => !c.payout_id).reduce((sum, c) => sum + Math.round(c.amount * 100), 0);
        const paid = data.commissions.filter(c => c.payout_id).reduce((sum, c) => sum + Math.round(c.amount * 100), 0);
        const payouts = data.payouts.map(p => `<li>${esc(p.month)} · ${esc(p.reference)}</li>`).join('');
        if (!partner || data.report.barber) node.querySelector('[data-commission]').innerHTML =
          `<h3>Comissões do Samuel</h3><p>Pendentes: ${money(pending)} · Pagas: ${money(paid)}</p><h4>Histórico consolidado</h4><ul>${payouts||'<li>Nenhum repasse registrado.</li>'}</ul>`;
        if (partner && data.clients) node.querySelector('[data-commission]').insertAdjacentHTML('afterend',
          `<div data-partner-sales><h3>Clientes autorizados</h3><ul>${data.clients.map(c => `<li>${esc(c.name)} · ${esc(c.status)}</li>`).join('')}</ul><h3>Histórico de cobranças</h3><ul>${data.invoices.map(i => `<li>${esc(i.due_date)} · ${money(Math.round(i.amount*100))} · ${i.paid_at?'Recebida':'Em aberto'}</li>`).join('')}</ul></div>`);
        if (!partner) node.querySelector('[data-partners]').innerHTML = `<h3>Parceiros vinculados</h3><ul>${data.partners.map(p=>`<li>${esc(p.partner)} · ${labels[p.product]} · ${esc(p.user_id)}</li>`).join('') || '<li>Nenhuma conta vinculada.</li>'}</ul>`;
        if (!partner) node.querySelector('[data-arrears]').innerHTML = `<h3>Vencimentos e atrasos registrados</h3><ul>${data.overdueAlerts.map(i=>`<li>${esc(i.client)} · ${labels[i.product]||''} · ${esc(i.due_date)} · ${i.days?i.days+' dia(s) em atraso':'Vence hoje'} · ${money(Math.round(i.amount*100))}</li>`).join('') || '<li>Nenhum vencimento pendente.</li>'}</ul>`;
        node.querySelector('[data-cash-audit]').hidden = partner;
        node.querySelector('[data-audit]').innerHTML = data.audit.map(event => `<li>${esc(event.created_at)} · ${esc(event.event)} · ${esc(event.subject)}</li>`).join('');
        status.textContent = '';
      } catch (error) { status.textContent = error.message; }
    }
    filter.onsubmit = event => { event.preventDefault(); node.querySelector('[data-partner-sales]')?.remove(); void load(); };
    for (const form of node.querySelectorAll('[data-action]')) {
      form.onsubmit = async event => {
        event.preventDefault();
        const f = new FormData(form), action = form.dataset.action;
        const payload = action === 'expense' ? { description: f.get('description'), expense_date: f.get('expense_date'),
          category: f.get('category'), cents: Math.round(Number(f.get('amount')) * 100), products: f.getAll('product'), paid: f.has('paid') }
          : action === 'partner' ? { product: f.get('product'), user_id: String(f.get('user_id')).trim() }
          : { month: f.get('month') + '-01', reference: f.get('reference') };
        const button = form.querySelector('button'); button.disabled = true;
        try { await api(client, 'action=' + action, payload); form.reset(); await load(); }
        catch (error) { status.textContent = error.message; }
        finally { button.disabled = false; }
      };
    }
    void load();
  }
  window.BOLT_COMMERCIAL_FINANCE = { mount };
})();
