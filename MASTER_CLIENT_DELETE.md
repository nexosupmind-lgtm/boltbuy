# Login Master e exclusão de clientes

## Comportamento

- Login do Master com formulário visível, composição em duas colunas, identidade BOLT, botão mostrar/ocultar senha e layout compacto no celular. O login do delivery conserva a interface existente.
- A autenticação continua verificando `bolt_master_admins` antes de liberar o Master. A marcação do documento identifica o Master inclusive quando o fallback de rotas serve o mesmo HTML em outro endereço.
- Comercial de Church/Class inclui **Excluir cliente**; o botão existente no delivery agora usa a mesma exclusão online.
- O diálogo consulta o servidor, mostra registros/arquivos relacionados e exige digitar o identificador do cliente e marcar a ciência da exclusão permanente. Abrir o diálogo não exclui nada.

## Dados removidos

A Function `/api/delete-client` usa o segredo existente no servidor e valida a sessão Master em toda chamada. O plano de exclusão é assinado por HMAC, vinculado ao nicho, ID, identificador e prazo. Um cliente renomeado exige uma nova confirmação.

O registro principal é removido com uma única operação no banco. As chaves estrangeiras com `ON DELETE CASCADE` removem os dados/vínculos daquele cliente, incluindo o documento operacional, identidade e configurações. Se uma restrição impedir a exclusão, a API interrompe antes de apagar arquivos; não faz uma sequência de exclusões parciais de tabelas dependentes.

Depois da confirmação do banco, a API limpa somente os prefixos `<id-do-cliente>/` dos buckets BOLT `bolt-branding` e `bolt-product-images`. Não remove objetos de outros clientes, buckets de outros aplicativos ou imagens externas. Fotos contidas no documento JSON são removidas com esse documento. Assets compartilhados do aplicativo permanecem no repositório.

As contas do Supabase Auth são preservadas, pois podem ser usadas em outros clientes/aplicativos. Os vínculos e acessos ao cliente excluído são removidos. Esta ação não faz limpeza global de usuários.

## Falhas e retomada

Banco e Storage são serviços separados. Se o banco confirmar a exclusão e a limpeza de arquivos falhar, a resposta informa explicitamente o estado parcial; a interface permite **Concluir limpeza de arquivos**. A repetição usa o mesmo plano assinado, sem excluir outra linha do banco. Antes de limpar, a API verifica que o ID não está em uso nos cadastros de clientes. Uma falha nessa verificação é apresentada como pendência após a exclusão, sem apagar arquivos.

Cada chamada processa até 500 objetos por bucket, com suporte a pastas. Coleções maiores podem exigir repetir a limpeza. O plano expira em uma hora; mantenha o diálogo aberto até concluir. Se ele for fechado/expirar com pendências, revise os arquivos remanescentes no Storage antes de remover o prefixo específico manualmente. O sistema nunca declara limpeza completa quando o servidor relata pendência.

Os caches conhecidos do delivery e os pagamentos locais daquele identificador são limpos no navegador após confirmação do banco. Outros clientes e seus caches são preservados.

## Implantação e validação

Sem novo SQL ou segredo obrigatório. Mantém os relacionamentos em cascata dos scripts atuais. O backend está em `server/delete-client.js`; os dois layouts de Functions importam esse mesmo módulo.

Execute `node --test tests/*.test.mjs`. Testes usam Auth, REST, Storage e DOM simulados; não apagaram clientes reais. Foram verificadas autorização Master, plano inválido/expirado, confirmação incorreta, cliente renomeado, preservação de outras escolas/lojas, ausência do módulo de família, recusa do banco, retomada do Storage, confirmação da interface e isolamento dos caches.

O módulo Portal da Família V34 permanece em uma PR separada, aguardando instalação do SQL. Este trabalho não publica nem depende daquele módulo.
