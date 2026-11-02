# Portal da Família V34

## Ativação

1. Execute `SUPABASE_V34_FAMILY.sql` no SQL Editor do Supabase atual. É uma migração aditiva/reexecutável: não altera alunos, clientes ou usuários existentes.
2. Integre a PR do Portal da Família e aguarde o Cloudflare. O diretório estático é `SITE`; a Function compilada é `functions/api/family.js`, que importa `server/family.js`. A cópia em `SITE/functions/api` usa o mesmo módulo.
3. Não há novo segredo obrigatório. A senha inicial usa AES-GCM com chave derivada por HKDF do segredo existente do servidor. Opcionalmente, defina `BOLT_FAMILY_CREDENTIAL_KEY` como segredo estável de alta entropia para separar esse uso. Trocar a chave torna credenciais iniciais antigas ilegíveis; nesse caso, gere novo acesso pela escola.
4. Na escola de teste, cadastre aluno, foto, nome e WhatsApp do responsável; aguarde o salvamento.
5. Abra **Famílias → Criar acesso do responsável**. O botão ficará verde como **Enviar acesso**. Ao clicar, o WhatsApp abre com a mensagem pronta para envio. A pessoa confirma o envio no WhatsApp; não há integração automática de mensagens.
6. Entre no portal com as credenciais geradas em um navegador separado e confirme que aparecem somente os dados desse aluno. Teste também outro aluno e outra escola.
7. No Master, abra o Studio Class e confira a seção **Portal da Família**, incluindo a seleção de aluno. Essa prévia usa autorização administrativa e não cria uma conta de responsável.

O SQL ainda não foi aplicado pelo executor: esta sessão não tem acesso administrativo ao banco. A ativação em produção depende da confirmação de sua execução e da homologação real com uma conta de teste. Os testes de Auth, REST e UI são simulados; nenhum usuário de produção foi criado durante o desenvolvimento.

## Acesso e envio

- Um acesso é vinculado ao ID imutável da escola e ao ID do aluno. Não agrupa irmãos pelo nome do responsável. Para outro filho, gere o acesso do cadastro correspondente.
- Login e senha são gerados no servidor com aleatoriedade criptográfica. O login não exige e-mail real do responsável; usa uma identidade técnica exclusiva no Supabase Auth.
- A tabela privada não tem permissão para `anon`, `authenticated` ou `public`. As APIs verificam sessão, escola, situação e vínculo antes de ler ou gravar.
- A senha inicial fica criptografada apenas para preparar o envio. Nunca vai para o documento da escola, logs ou armazenamento local da aplicação.
- No primeiro login, a cópia recuperável da senha inicial é removida. Reenvios posteriores incluem link e login, orientando usar a senha atual. Para recuperar o acesso, use **Gerar novo acesso**, com confirmação; o vínculo anterior deixa de funcionar imediatamente.
- O responsável pode alterar a própria senha no portal. A escola não pode consultar a senha escolhida por ele.
- Alterações no nome ou telefone do responsável invalidam o vínculo antigo. A escola precisa recriar o acesso para o contato atualizado. Mudanças apenas de formatação/capitalização não invalidam.
- Um telefone inválido ou responsável sem nome bloqueia criação e envio. Números brasileiros com DDD recebem o prefixo 55; números internacionais devem incluir +DDI.
- A mensagem pode ser personalizada em Famílias usando `{escola}`, `{responsavel}` e `{aluno}`.

## Dados da família

A resposta é uma projeção dos dados: foto/nome/turma do próprio aluno, presenças, notas publicadas, atividades publicadas da turma, comunicados e calendário destinados ao aluno/turma ou à escola. Não envia outros alunos, CPF, saúde, observações privadas de notas, credenciais ou o documento administrativo inteiro. A família não obtém permissões administrativas de Class.

A prévia do Studio usa `postMessage` restrito à mesma origem e ao iframe ativo. A autorização fica somente na memória; não aparece no link do portal nem no armazenamento persistente. O endpoint valida Master ou administrador daquela escola antes da prévia.

## Nome do administrador

Os formulários do Master passaram a enviar `name`, salvo em Auth `user_metadata.full_name`. Para contas existentes, o Class inclui **Configurações → Meu perfil → Salvar meu nome**. Essa opção modifica apenas o próprio perfil autenticado, sem recriar a conta.

## Validação e limites

Execute `node --test tests/*.test.mjs`. Os testes cobrem autorização, segregação, criptografia e AAD, mudança de responsável, concorrência na recriação, filtragem de dados, login, mensagens e origem da prévia. Verifique também `node --check` dos scripts e `git diff --check`.

A criação de Auth e a gravação do vínculo usam serviços separados: em uma falha de rede com resultado incerto, atualize a lista antes de repetir. Um Auth sem vínculo não consegue abrir dados familiares. Em conflitos confirmados, apenas o Auth recém-criado sem vínculo é removido. Contas substituídas permanecem no Auth sem vínculo familiar; uma limpeza administrativa futura pode removê-las.

Os limites de 4 MB por documento da escola e a persistência de Class V33 continuam valendo. Nenhuma migração automática de dados locais ou envio em massa de mensagens foi implementado.

## Reversão

Reverta os commits da interface/API se necessário. Preserve a tabela e os usuários criados. Não apague alunos nem redefina o banco como parte da reversão.
