# Ambientes vazios e integração online V33

Branch: `feat/isolated-online-clients`.

## Ativação

1. Execute `SUPABASE_V33_WORKSPACES.sql` no SQL Editor do mesmo Supabase do BOLT. A migração é aditiva e reexecutável. Ela cria duas tabelas e suas permissões; não apaga nem migra dados existentes.
2. Integre a PR e aguarde o deploy do Cloudflare Pages. O diretório publicado continua sendo `SITE`, com suas Functions. Não publique a pasta duplicada `SITE/SITE`.
3. Não é necessário alterar as variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já usadas por `/api/provision-commercial`. A chave secreta continua exclusivamente no servidor.
4. Crie ou reutilize um cliente de teste no Master, crie seu administrador e abra o link do portal no Studio.
5. Confirme que o primeiro acesso está vazio. Cadastre um item, aguarde **Salvo no Supabase**, e confira em outro navegador. Repita com outra organização e confirme a separação dos dados. Confirme também os clientes delivery existentes antes de encerrar a homologação.

**O SQL ainda precisa ser aplicado na instalação real. Não integrar em produção antes desta etapa.** Nenhuma conexão administrativa ao Supabase está disponível ao executor para aplicá-lo. Os testes locais usam serviços e DOM simulados. O navegador Chromium não pôde ser instalado no ambiente, portanto a validação visual e o fluxo real com Supabase/Cloudflare permanecem pendentes.

## Comportamento

- **Delivery:** catálogo e dados novos continuam vazios; sem nome de responsável, fotos, logo ou promoções do Salgaditos como fallback. Usa interface neutra até a personalização. O Studio salva nome, cores, logo, avatar e banner no Supabase. Criar usuário para empresa existente não regrava identidade/status nem produtos. Não há limpeza retroativa de empresas existentes.
- **Church:** acesso pelo portal individual; módulos existentes reutilizados; começa sem membros, ministérios, avisos, eventos, cursos ou devocionais. Não consulta `profiles`/`records` da PIB nem usa seu bucket de imagens. Os cadastros são privados por organização.
- **Class:** acesso pelo portal individual; módulos escolares existentes preservados; nenhuma escola fictícia é criada e nenhum banco local é importado automaticamente. Cadastros são carregados e salvos no Supabase por ID do cliente.
- Sessão Church/Class usa chave de autenticação própria, separada do Master/Delivery, inclusive em iframes do Studio.
- Toda leitura e gravação operacional valida sessão, vínculo `owner`, organização, nicho e situação no servidor. A tabela privada não é exposta a `anon` ou `authenticated`.
- Controle de revisão impede a sobrescrita silenciosa de outra aba. Falhas mantêm as alterações pendentes na memória, com opções de tentar novamente e exportar. Não há confirmação de salvamento antes da resposta do servidor. Recarregar uma página com alterações pendentes pode perdê-las; exporte antes.

## Limites desta integração

- Church/Class são ambientes **administrativos**. Contas separadas de professores, líderes, membros e famílias ainda exigem desenvolvimento de permissões e convites próprios. As prévias de família/professor do Class continuam acessíveis somente ao administrador e não são um portal público autenticado.
- A persistência inicial usa um documento JSON por organização, limite de 4 MB por gravação e edição serializada. Church aceita imagens de cadastros de até 300 KB; Class conserva seu limite por foto. Para crescer além disso, será necessário migrar os módulos para tabelas por registro e imagens privadas no Storage.
- A identidade visual de Church/Class vem do Studio. Seus filtros comerciais de módulos ainda não são aplicados a todos os módulos operacionais.
- Dados offline antigos não são migrados automaticamente para evitar importar dados da instituição errada. Backups existentes devem ser revisados antes de uma importação explícita.
- A mudança no delivery não implementa sincronização de pedidos, cupons ou frete entre dispositivos; mantém o fluxo existente e acrescenta a identidade pública remota do Studio. Não são armazenados pedidos nem dados pessoais na tabela de vitrine.

## Validação local

Execute na raiz: `node --test tests/workspaces.test.mjs`.

Os testes cobrem inicialização vazia, carga posterior dos dados, persistência, segregação por vínculo, troca de slug, sessão inválida, empresa pausada, estrutura ausente, formatos inválidos, conflito entre revisões, fila/repetição de salvamento e preservação de empresas delivery ao criar usuário. Sintaxe dos scripts e `git diff --check` também devem passar.

## Reversão

Reverta apenas o commit da PR se houver problema na homologação. Mantenha as tabelas novas para preservar o que já foi salvo. Não execute `DROP TABLE`, limpeza de clientes ou redefinição do banco.
