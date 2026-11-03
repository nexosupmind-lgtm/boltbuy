# BOLT V35 · Master, atendimento e aplicativos

Branch: `feat/ecosystem-master-v35`. A aplicação estática continua em `SITE`; as Functions efetivas estão em `functions/api`. Nenhum cliente de produção foi apagado, nem foram criadas contas reais durante os testes.

## Instalação e publicação

1. No SQL Editor **do mesmo projeto Supabase atual**, execute integralmente `SUPABASE_V35_INSTALL.sql`. É um único arquivo transacional que inclui V34 (famílias) e V35. Não substitui cadastros existentes. Requer as estruturas comerciais e V33 já instaladas. A repetição é suportada.
2. Confirme o sucesso da transação. O arquivo cria estruturas privadas com RLS e RPCs acessíveis apenas ao `service_role`. Também acrescenta políticas restritivas para o catálogo Buy: os clientes atuais sem novo plano mantêm os acessos anteriores; o Master mantém seu acesso.
3. Depois da instalação, publicar o PR no mesmo Cloudflare Pages. Permanecem as variáveis existentes `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`; nenhuma credencial privada deve ser incluída no frontend. `BOLT_FAMILY_CREDENTIAL_KEY` é opcional; se usada, mantenha-a estável para não invalidar senhas iniciais ainda não entregues.
4. Validar com um cliente de teste: login Master lembrado exige clique; escolas/igrejas/lojas corretas; assinatura, cobrança e recebimento; chamado do cliente e resposta; família vê somente seu aluno; membro vê somente publicações liberadas; instalação retém slug correto. Não usar clientes reais para testes de exclusão.

A branch agrega o Portal da Família que estava no draft #10. Não mesclar os dois PRs separadamente.

## Mudanças

- Master com navegação dark, painéis tecnológicos, transições animadas, menu mobile, assistente Bolt com duas piscadas a cada 15 segundos e respeito a movimento reduzido.
- Login Master com sessão lembrada permanece na tela inicial com **Entrar no Master** e **Usar outra conta**. A permissão é consultada novamente ao entrar.
- Catálogos de planos independentes por plataforma, com seus módulos específicos. Vínculos feitos em **Assinatura** do cliente; não há migração silenciosa de planos/preços locais. Sem vínculo novo, o acesso anterior é mantido.
- Restrição de módulos Class/Church verificada na API antes de alterar os dados correspondentes. O estado continua privado, preservando dados de módulos que deixarem de ser contratados. Class Family tem verificação própria do plano. Church filtra publicações conforme os módulos contratados.
- Buy aplica disponibilidade no menu e restringe gravação/exclusão de produtos por RLS. Módulos legados que ainda operam apenas no navegador não se tornam operações de servidor nesta atualização; ocultar seus botões não constitui uma nova barreira de segurança para dados locais.
- Clientes de cada nicho ordenados por nome, com pesquisa, filtro de situação, edição, Studio, assinatura e exclusão individual com confirmação.
- Dashboard soma os três produtos e separa **receita recorrente prevista**, **recebimentos registrados no mês**, **clientes com cobrança vencida**, valor vencido, cadastros ativos, clientes sem assinatura e chamados pendentes. Sem cobrança cadastrada não há inferência de inadimplência. Referência temporal financeira: UTC, identificada na tela.
- Financeiro manual persistido: assinaturas, cobranças por vencimento, registro de recebimento. Uma cobrança por assinatura/vencimento; recebimento condicionado a ainda estar em aberto. Não gera cobranças recorrentes automaticamente, não emite boleto nem executa pagamentos.
- Os pagamentos/planos antigos locais continuam no backup legado, sem importação automática que pudesse duplicar recebimentos. Os valores do cadastro comercial não são confundidos com dinheiro recebido.
- Suporte em Buy, Class, Church, família e membro, com origem, cliente resolvido no servidor, nome, contato, assunto, texto, resposta e status. Master gerencia a Central de suporte. Solicitantes autenticados consultam apenas seus próprios chamados. Consumidores públicos e solicitantes sem sessão na tela de login enviam com contato não verificado, sem acesso à listagem; a resposta deve ser dada ao contato informado. Até dez envios por dia por conta/IP, com contador atômico e IP somente em HMAC. Não envia mensagens externas automaticamente.
- Logo branca em login Buy/Church e ícones originais enviados para os aplicativos. Tamanhos de ícone derivados em 192/512; identidades dos clientes dentro dos sistemas são preservadas.

## Família e membro

Família: acesso individual por aluno, criação e envio pelo WhatsApp pelo administrador, senha inicial cifrada e removida do banco após primeiro login. WhatsApp abre com mensagem para revisão/envio humano. Alterar o responsável invalida o vínculo anterior. A prévia do Studio requer Master e não coloca token na URL nem no armazenamento do portal.

Membro: novo `member.html?slug=...`, separado da administração. A igreja cria o login em **Acesso de membros**; senha aleatória é exibida uma única vez, sem armazenamento recuperável. O membro pode alterar sua senha. O portal exibe seu nome e somente comunicados, agenda e devocionais explicitamente publicados. Devocionais também respeitam a data UTC. Não retorna cadastro de outros membros, CPF ou contatos privados. Alterações no contato/nome ou remoção do membro invalidam o vínculo e exigem revisão administrativa. Recuperação de conta é administrativa; a atualização não altera a configuração de e-mails/redirecionamentos do Supabase.

Em **Publicações do portal**, a igreja libera o conteúdo para membros. Registros anteriores não são automaticamente publicados. Contas Auth órfãs ou de outros aplicativos não são removidas automaticamente em falhas de criação ou na exclusão de um cliente; os vínculos privados impedem seu acesso ao BOLT.

## Consumo

**Capacidade e consumo → Medir agora** consulta uma RPC administrativa:

- Banco: `pg_database_size`, alocação física total do projeto, inclusive outros aplicativos e índices.
- Storage total: tamanhos declarados nos metadados de todos os buckets do projeto.
- Por cliente: tamanho lógico serializado de registros atribuíveis (incluindo dados de escola/igreja, cobranças e chamados) mais Storage nos buckets BOLT sob prefixo UUID. Inclui fotos embutidas no JSON. Não inclui Auth, índices/overhead, arquivos legados fora desse prefixo nem outros buckets.

As medidas não são equivalentes e a soma por cliente não corresponde ao tamanho físico do banco. Limites para alerta são informados pelo Master conforme seu contrato e ficam neste dispositivo. O aviso aparece a partir de 80%, após atualizar a medição. Não há monitoramento em segundo plano ou garantia contra interrupção: tráfego, CPU, conexões, Auth, disponibilidade do provedor e faturas também precisam ser acompanhados no Supabase.

## PWA

Sete identidades de instalação: Master, Buy admin/consumidor, Class admin/família e Church admin/membro. Manifesto dinâmico mantém rota individual e slug; modo standalone e ícones do produto, Apple touch icon e botão de instalar quando suportado pelo navegador.

Não é aplicação nativa de loja. O suporte de instalação depende do navegador; no iPhone utiliza-se o menu Compartilhar → Adicionar à Tela de Início. A atualização não configura notificações push.

O service worker guarda **somente a tela de falta de conexão**. Não armazena páginas autenticadas, APIs, respostas privadas, dados de outros clientes nem senhas. Sem internet, apresenta reconexão; não promete operação offline. Caches antigos conhecidos do shell BOLT são removidos; não apaga o localStorage dos clientes.

## Verificação e limites

`node --test tests/*.test.mjs`: 78 testes automatizados, com mocks de Auth, REST, Storage e DOM. Incluem login lembrado, dados de diferentes nichos, métricas financeiras, plano incompatível, gravação em módulo não contratado, privacidade família/membro, atendimento público/autenticado e manifestos separados. `node --check` nos scripts alterados e scripts inline; `git diff --check`.

A prévia do navegador não pôde ser aberta: revisão automática bloqueou o acesso por limite de uso da ferramenta. Não houve validação visual real desta branch, nem teste SQL/RLS no projeto de produção. A migração permanece pendente da execução pelo proprietário; o PR fica em draft até instalar e validar. Esses testes não equivalem a uma auditoria de segurança nem demonstram funcionamento real das APIs ainda não publicadas.

Rollback: reverter o commit de código no GitHub. Manter as novas tabelas para preservar os registros já criados. Revisar políticas restritivas apenas se necessário e nunca apagar dados como procedimento de rollback.

## Ajuste visual e suporte V36

Master dark com detalhes violeta/ciano, transições de navegação e feedback nos cliques, respeitando `prefers-reduced-motion`. Menu desktop fixo ao viewport com rolagem própria; barras mobile preservadas. Mesmo comportamento fixo aplicado aos menus administrativos Class/Church/Buy, mantendo as larguras por breakpoint.

Suporte discreto dentro do cartão de login, inclusive quando o formulário é renderizado assincronamente. No ambiente autenticado, o atalho fica ao lado do Bolt, reposicionado ao rolar/redimensionar. Chamados sem sessão são contatos públicos não verificados: exigem contato e proteção de IP, usam o mesmo limite diário e não liberam histórico nem acesso ao sistema. Nenhuma nova migração SQL.

Validação: 78 testes automatizados, incluindo movimentação dinâmica do suporte, separação do Bolt, chamado de acesso não autenticado e bloqueio de histórico/rate limit. Conferência visual permanece não realizada por bloqueio da ferramenta de navegador.
