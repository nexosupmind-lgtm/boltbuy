# Auditoria BOLT v6 — protótipo local

## Master
- Cadastro de empresas, configuração de identidade, planos, mensalidades e backup local.
- Falta autenticação segura, trilha de auditoria, cobrança automatizada, provisionamento real e RLS por tenant.
- As permissões atuais são apenas controles visuais: não constituem autorização segura.

## Admin da empresa
- PDV, produtos/fotos, banners, pedidos online, iFood manual, relatórios, frete e assistente BOLT.
- Falta gestão robusta de estoque, impressão, conciliação financeira, estornos, equipe e permissões seguras.
- O registro iFood é manual, sem integração oficial.

## Shop do consumidor
- Catálogo, banners, destaque, carrinho, retirada/delivery, histórico local e status de pedidos.
- Falta persistência entre dispositivos, identificação segura do cliente, pagamento online, áreas de entrega e notificações push reais.

## Antes de publicar comercialmente
1. Migrar localStorage para Supabase e políticas RLS testadas.
2. Implementar autenticação e papéis Master, Admin, Operador e Consumidor.
3. API de provisionamento idempotente, isolamento de tenants e subdomínios reais.
4. Garantir pedidos em tempo real, sem perda/duplicação, e fluxo completo de status.
5. Configurar backups, observabilidade, termos/LGPD e proteção de dados.
6. Integrar pagamentos, taxas, cancelamentos e conciliação.
7. PWA por subdomínio com manifesto e ícone da empresa e push por serviço backend.
8. Testes de responsividade, performance, acessibilidade e segurança.
