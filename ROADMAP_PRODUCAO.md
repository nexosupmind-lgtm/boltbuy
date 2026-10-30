# BOLT — Plano para produção

## Bloqueadores antes de clientes reais
1. Backend multiempresa (Postgres/Supabase), esquema de tenant_id, RLS em todas as tabelas, testes automatizados de isolamento.
2. Autenticação Master, equipe de cada estabelecimento, consumidores; recuperação de senha, MFA no Master, papéis e permissões aplicadas no servidor.
3. Provisionamento de subdomínios, TLS wildcard, roteamento por host e resolução segura de tenant; sem depender de query string.
4. Pedidos reais em tempo real, máquina de estados com transições autorizadas, idempotência e trilha de eventos.
5. Upload seguro de logos/fotos, limites, políticas de armazenamento, validação de tipo, URLs públicas por tenant.
6. Pagamento online via provedor autorizado e webhooks assinados; nunca guardar dados de cartão.
7. Push PWA com consentimento, service worker e VAPID no backend; suporte iOS conforme requisitos da plataforma.
8. LGPD: privacidade, consentimentos quando aplicáveis, retenção, exclusão, exportação, contratos e controle de acesso.
9. Monitoramento, backups externos com restauração testada, rate limiting, logs e alertas.
10. Homologação de pedidos, estoque, cancelamentos, frete, caixa, conciliação e eventual integração oficial iFood.

## Próximas melhorias de produto
- Estoque e fichas técnicas, baixa automática e alerta de ruptura.
- Caixa por turno, sangrias, reforços, conferência e fechamento.
- Cozinha/KDS, impressão, etiquetas, entregadores e zonas de frete.
- Fidelidade, cupons com regras, recuperação de carrinho, avaliações e reordenação.
- Cobrança de assinaturas, contratos, inadimplência e bloqueio seguro com período de tolerância.
- Dashboard por empresa e por rede com funil, retenção, ticket médio e margem.
- Assistente com consultas autorizadas e ações confirmadas, não respostas inventadas.
