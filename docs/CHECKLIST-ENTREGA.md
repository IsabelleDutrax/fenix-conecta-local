# Checklist de entrega — Fênix Conecta (versão local)

| Campo | Valor |
|---|---|
| Código | CHK-FC-001 |
| Revisão | 00 |
| Data | 25/11/2026 |
| Responsável | Isabelle Dutra |
| Aplica-se a | Instalação e entrega do programa no computador da ONG |
| Documentos relacionados | MAN-FC-001 (Manual do usuário, `docs/Manual-Fenix-Conecta.pdf`), PLANO.md |

## Conclusão

A entrega leva cerca de 2 horas na ONG: instalar, fazer o primeiro acesso **com a pessoa responsável da ONG**, configurar backup e treinar a equipe. Os itens marcados com **[BLOQUEIA]** precisam estar resolvidos antes da visita.

## 5W2H da entrega

| | |
|---|---|
| **O quê** | Instalar o Fênix Conecta, criar o administrador da ONG, configurar backup e treinar a equipe. |
| **Por quê** | Colocar o sistema em uso com os dados protegidos e sob controle da ONG. |
| **Onde** | No computador da ONG que vai guardar os dados (um único computador). |
| **Quem** | Isabelle Dutra (instala e treina) + responsável da ONG (cria o administrador, guarda a chave) + equipe (treinamento). |
| **Quando** | Data a combinar com a ONG. Reservar 2 h. |
| **Como** | Seguir as etapas abaixo, na ordem. |
| **Quanto** | Sem custo de licença. Itens a validar: pendrive dedicado (custo baixo), assinatura digital (opcional), conta OneDrive (gratuita até 5 GB). |

## Etapa 1 — Antes da visita

1. **[BLOQUEIA]** Confirme com a ONG quantos computadores vão usar o sistema. A versão atual funciona em **um** computador (vários usuários, um de cada vez). Se precisarem de vários computadores ao mesmo tempo, pare e reavalie (PLANO.md, decisão 9).
2. **[BLOQUEIA]** Decida como o instalador chega à ONG:
   - (a) publicar a versão no GitHub Releases (`npm run publicar`) e levar o link — habilita a atualização automática; ou
   - (b) levar o arquivo `dist\Fenix-Conecta-Setup-<versão>.exe` em pendrive — a atualização automática só funciona depois da primeira publicação.
3. Rode os testes no computador de desenvolvimento e confirme que passam:
   - `npm test` (testes da camada de dados);
   - `npm run test:e2e` (testes de ponta a ponta).
4. Gere o instalador com `npm run dist`.
5. Rode o autoteste no programa gerado (`dist\win-unpacked\Fenix Conecta.exe --verificar-instalacao --saida=%TEMP%\autoteste.json`) e confira `"ok": true`.
6. Imprima o manual (`docs/Manual-Fenix-Conecta.pdf`): 1 cópia para a ONG.
7. Separe um **pendrive** só para os backups da ONG. Etiquete: "Backup Fênix Conecta — guardar longe do computador".
8. Confirme com a ONG:
   - o computador tem Windows 10 ou 11 de 64 bits;
   - existe uma conta Microsoft (OneDrive) conectada no computador, ou a ONG aceita usar só o pendrive;
   - uma impressora disponível no dia (para a chave de recuperação);
   - quem será o **administrador** e quem será o **segundo administrador** (recomendado).
9. Não leve nem use dados reais de doadores no seu computador de desenvolvimento.

## Etapa 2 — Instalação (no computador da ONG)

1. Feche os outros programas.
2. Abra o instalador. Se aparecer "O Windows protegeu o computador", clique em **Mais informações** → **Executar assim mesmo**.
3. Aguarde o programa abrir sozinho na tela de **Primeiro acesso**.
4. Confira o atalho **Fênix Conecta** na área de trabalho e no menu Iniciar.
5. Confira a versão no rodapé da tela de entrada.

## Etapa 3 — Primeiro acesso (com a pessoa responsável da ONG)

1. Peça para a **responsável da ONG** digitar nome, e-mail e senha do administrador. **Não digite a senha por ela e não anote a senha.**
2. Clique em **Imprimir** na tela da chave de recuperação.
3. Entregue a folha impressa à responsável. Combine onde ela vai guardar (local seguro, longe do computador).
4. Confirme que **não** existe foto, cópia digital ou mensagem com a chave.
5. Peça para ela marcar a confirmação e clicar em **Continuar**.
6. No lembrete de pendrive, clique em **Copiar agora** e faça a primeira cópia no pendrive dedicado.

## Etapa 4 — Configuração

1. Crie o **segundo administrador** (tela Usuários). Peça para a pessoa trocar a senha no primeiro acesso.
2. Crie um usuário **comum** para cada pessoa da equipe. Não crie usuário compartilhado.
3. Abra a tela **Backup** e confira:
   - a pasta mostra **OneDrive** (badge "OneDrive"). Se mostrar "Documentos", o OneDrive não está conectado: conecte ou registre que a ONG depende só do pendrive;
   - o **Último backup** aparece em verde.
4. Clique em **Abrir pasta** e confira que o arquivo `fenix-backup-...fenixbak` existe.
5. Se a ONG tiver cadastros antigos em planilha, combine a migração dos dados como uma tarefa separada (não incluída nesta entrega).

## Etapa 5 — Treinamento (cerca de 1 h)

Use o manual impresso. Para cada item, a pessoa da ONG executa e você observa.

| # | Atividade | Quem | Capítulo do manual | Feito |
|---|---|---|---|---|
| 1 | Entrar e sair | Todos | 4 | ☐ |
| 2 | Cadastrar um doador de teste ("Doador Teste") | Todos | 6 | ☐ |
| 3 | Registrar uma doação e marcar como paga | Todos | 7 | ☐ |
| 4 | Registrar uma interação | Todos | 8 | ☐ |
| 5 | Alterar a própria senha | Todos | 13 | ☐ |
| 6 | Criar usuário e redefinir senha | Admins | 10 | ☐ |
| 7 | Fazer backup agora e cópia em pendrive | Admins | 11 | ☐ |
| 8 | Onde fica a chave de recuperação e quando usar | Admins | 3 e 15 | ☐ |
| 9 | Excel de consulta e cuidados LGPD | Admins | 12 | ☐ |
| 10 | Excluir os registros de teste | Admin | 6 a 8 | ☐ |

## Etapa 6 — Conferência final

1. Confira que os registros de teste foram excluídos.
2. Confira o **Último backup** em verde no rodapé.
3. Confira que a responsável tem: a chave impressa, o manual impresso e o pendrive.
4. Confira que existem **dois administradores** ativos.
5. Feche o programa e abra de novo: entra na tela de login, sem pedir a chave.
6. Registre a data da entrega, a versão instalada e os nomes dos administradores (sem senhas) no registro de entrega do projeto.

## Etapa 7 — Acompanhamento (primeiros 30 dias)

1. Após 1 semana: confirme com a ONG que o lembrete de pendrive apareceu e que a cópia foi feita.
2. Após 30 dias: confirme que a pasta de backup tem cópias diárias e que as mais antigas foram apagadas.
3. Ao publicar uma versão nova: avise a ONG que aparecerá "Atualização pronta" no menu.

## LGPD — pontos de atenção (validar com profissional da área)

- A ONG é a **controladora** dos dados. A chave de recuperação e as senhas de administrador ficam com a ONG.
- Recomenda-se um **termo de responsabilidade / acordo de tratamento de dados** entre a desenvolvedora e a ONG, cobrindo suporte e acesso eventual ao computador. **Requer validação jurídica.**
- Suporte remoto (Assistência Rápida, AnyDesk) só com a pessoa da ONG presente, sem copiar dados para o seu computador.
- Exportações (Excel, CSV, PDF) não têm criptografia: orientar a apagar após o uso (manual, capítulos 9 e 12).

## Pendências conhecidas na data desta revisão

| # | Item | Impacto | Responsável |
|---|---|---|---|
| 1 | Publicar a primeira versão no GitHub Releases | Sem isso, não há atualização automática | Isabelle Dutra |
| 2 | Assinatura digital do instalador | Aviso do Windows na instalação | Decisão: Isabelle Dutra |
| 3 | Uso em vários computadores | Hoje: um computador | Validar com a ONG |
| 4 | Excel só para administrador | Validar com a ONG | Isabelle Dutra |
| 5 | CSV/PDF por tabela liberados a todos, sem aviso LGPD | Risco de exportação indevida | Decisão: Isabelle Dutra |
| 6 | Revogar a chave do Supabase do projeto web original | Chave exposta no repositório original | Isabelle Dutra |

---
Elaborado com suporte de IA — Revisado por Isabelle Dutra
