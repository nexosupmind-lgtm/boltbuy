const seed={services:[{id:'s1',name:'Corte Signature',price:45,duration:45,description:'Degradê, acabamento e finalização impecável.',image:'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=800&q=85'},{id:'s2',name:'Barba Premium',price:35,duration:30,description:'Toalha quente, contorno e tratamento de barba.',image:'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=800&q=85'},{id:'s3',name:'Combo Completo',price:70,duration:75,description:'Corte e barba para uma transformação completa.',image:'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=85'}],barbers:[{id:'b1',name:'Lucas Ferreira',role:'Especialista em fade',image:'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=700&q=85',active:true},{id:'b2',name:'Rafael Costa',role:'Especialista em barba',image:'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=700&q=85',active:true},{id:'b3',name:'Matheus Oliveira',role:'Cortes clássicos e modernos',image:'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=700&q=85',active:true}],payments:['Pix','Cartão de crédito','Cartão de débito','Dinheiro'],hours:{0:null,1:['09:00','19:00'],2:['09:00','19:00'],3:['09:00','19:00'],4:['09:00','19:00'],5:['09:00','19:00'],6:['09:00','16:00']},interval:30,bookings:[]};
const names = ['Marcos Silva', 'Pedro Henrique', 'André Souza', 'Gabriel Lima',
  'Bruno Martins', 'Felipe Alves', 'Thiago Rocha', 'Diego Santos', 'Caio Mendes', 'Gustavo Nunes'];
export function demoState(now = new Date()) {
  const state = structuredClone(seed);
  const date = now.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const start = new Date(date + 'T12:00:00Z');
  const day = offset => new Date(start.getTime() + offset * 86400000).toISOString().slice(0, 10);
  state.customers = names.map((name, i) => ({ id: 'demo' + i, name, phone: '(00) 00000-' + (1000 + i) }));
  state.bookings = Array.from({ length: 18 }, (_, i) => {
    const { name, phone } = state.customers[i % names.length];
    return { id: 'demo' + i, name, phone, serviceId: state.services[i % 3].id,
      barberId: state.barbers[i % 3].id, date: day(i < 7 ? -(i % 3) : 1 + i % 5),
      time: String(9 + Math.floor(i / 3)).padStart(2, '0') + ':00',
      payment: state.payments[i % 4], status: i < 7 ? 'Concluído' : i === 9 ? 'Cancelado' : 'Confirmado',
      createdAt: now.toISOString() };
  });
  state.ledger = [
    { id: 'ledger1', description: 'Aluguel (demo)', type: 'pagar', value: 850, due: day(5), status: 'Pendente' },
    { id: 'ledger2', description: 'Pacote corporativo (demo)', type: 'receber', value: 350, due: day(8), status: 'Pendente' }
  ];
  return state;
}
