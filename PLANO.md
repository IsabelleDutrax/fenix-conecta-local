# Plano — Fênix Conecta versão local (offline)

| Campo | Valor |
|---|---|
| Documento | PLANO.md |
| Revisão | 07 |
| Data | 25/11/2026 |
| Responsável | Isabelle Dutra |
| Origem | Fork local de `IsabelleDutrax/sistema-mvp-ong-fenix` (histórico preservado; remote `upstream` somente leitura) |

## Conclusão

O sistema passa de site com Supabase para programa de computador (Electron) com banco SQLite criptografado na máquina do cliente. Os dados pessoais (CPF/CNPJ, telefone, endereço) não saem do computador, exceto pela cópia de backup criptografada na pasta do OneDrive (fase 5). A entrega é feita em 7 fases curtas; cada fase termina com o app funcionando.

## Objetivo (5W2H)

| | |
|---|---|
| **O quê** | Versão local do sistema de gestão de doações (doadores, doações, interações). |
| **Por quê** | O cliente exige que os dados sensíveis fiquem só na máquina dele. O usuário final não é técnico. |
| **Onde** | PC Windows do cliente. Programa em `Arquivos de Programas`; dados em `%APPDATA%\FenixConecta\dados`. |
| **Quem** | Desenvolvimento: Isabelle Dutra (com suporte de IA). Uso: equipe da ONG (admin + usuários comuns). |
| **Quando** | Fases 1, 2 e 3 em 17/11/2026; fases 4 e 5 em 23/11/2026; fases 6 e 7 em 25/11/2026. Versão de entrega: 1.0.0, publicada no GitHub Releases em 25/11/2026. |
| **Como** | Electron + SQLite criptografado (`better-sqlite3-multiple-ciphers`, esquema SQLCipher v4), IPC com `contextIsolation`, instalador `.exe` com atualização via GitHub Releases. |
| **Quanto** | Sem custo de licença (bibliotecas MIT). Custo de assinatura de código do instalador: precisa de validação (ver decisões em aberto). |

## Fases

| Fase | Entrega | Critério de pronto | Status |
|---|---|---|---|
| 1 Base | Estrutura Electron abre o sistema atual como janela (`npm start`). | Janela abre com login e telas originais. | Concluída |
| 2 Banco local | SQLite criptografado com as 3 tabelas e migrações versionadas. Camada de dados (`src/dados`) acessada por IPC seguro (`window.dados`). Supabase removido. | CRUD das 3 entidades funciona; dados persistem após reiniciar; arquivo ilegível sem a chave; testes automáticos passam. | Concluída |
| 3 Login local | Tabela `usuario` (migração 2), senha com hash scrypt, níveis de acesso (admin = 99, comum = 1), tela de primeiro acesso que cria o admin e mostra a **chave de recuperação** para imprimir, tela de recuperação, gestão de usuários e troca de senha. Regras de acesso no processo principal. | Login sem internet; usuário comum não vê funções de admin. | Concluída |
| 4 Offline | Bibliotecas e fonte embutidas em `vendor/` (`npm run vendor`, versões fixas, licenças incluídas). CSP restritiva (sem script inline, sem eval, sem internet). Handlers `onclick` trocados por despachante com lista branca. Rede bloqueada no processo principal (só arquivos do programa). Crédito Flaticon no rodapé. | App funciona com a rede desligada. | Concluída |
| 5 Excel e backup | Exportar Excel (cópia de consulta com data no nome + aviso LGPD). Backup criptografado diário na pasta do OneDrive (retenção 30 dias), aviso semanal de pendrive, botão "Restaurar backup", rodapé "Último backup". | Backup gerado, restaurado e verificado em teste. | Concluída — detalhes abaixo |
| 6 Instalador e atualização | `electron-builder` (NSIS `.exe`) + `electron-updater` via GitHub Releases. | Instalar, atualizar e desinstalar sem perder dados. | Concluída — detalhes abaixo (publicação da 1ª versão aguarda autorização) |
| 7 Testes e manual | Testes de ponta a ponta, manual ilustrado para usuário não técnico, checklist de entrega. | Manual revisado; testes verdes. | Concluída — detalhes abaixo |

## Arquitetura (após fase 2)

```
index.html + script.js  (telas originais, sem Node)
        │  window.dados.*   (preload.js, contextBridge)
        ▼
electron/main.js  ── ipcMain ──►  src/dados/repositorio.js  (CRUD, lista branca de colunas)
        │                                  │
        │ chave (safeStorage/DPAPI)        ▼
        └──────────────────────►  src/dados/banco.js  (abre SQLite cifrado, aplica migrações)
                                           │
                                  %APPDATA%\FenixConecta\dados\fenix.db
```

- `src/dados` não depende do Electron. Uma futura integração de IA (Claude/MCP) pode reutilizar o mesmo módulo, sem acesso direto às telas. Não implementado nesta etapa (fora do escopo).
- Chave do banco: 32 bytes aleatórios gerados no primeiro uso, guardados em `%APPDATA%\FenixConecta\chave.bin`, protegidos pelo DPAPI do Windows (`safeStorage`). Somente o mesmo usuário do Windows abre o banco.

## Ciclo de trabalho (PDCA por fase)

1. **Plan**: definir escopo e critério de pronto da fase (tabela acima).
2. **Do**: implementar em branch `feat/versao-local`, commits em Conventional Commits.
3. **Check**: testes automáticos (`npm test`) + teste manual com dados fictícios.
4. **Act**: registrar pendências e decisões no relatório da fase; ajustar o plano.

## Fase 5 — como ficou

| Item | Comportamento |
|---|---|
| Backup automático | Uma vez por dia (primeiro uso do dia, inclusive logo após o primeiro acesso). Cópia do arquivo já cifrado, conferida (chave + integridade) antes de ir para o destino. Nome `fenix-backup-AAAA-MM-DD_HHMMSS.fenixbak`. |
| Pasta | `%OneDrive%\Backup Fenix Conecta`. Sem OneDrive: `Documentos\Backup Fenix Conecta`. O administrador pode escolher outra pasta. |
| Retenção | Apaga backups com mais de 30 dias; nunca apaga o mais recente nem arquivos com outro nome. |
| Pendrive | Lembrete semanal ao administrador ("Copiar agora" / "Lembrar amanhã"). Avisa se a pasta escolhida está no disco do próprio computador. |
| Restaurar | Somente administrador, com senha. Mostra resumo (data e quantidades), faz cópia de segurança dos dados atuais antes e volta atrás se algo falhar. Backup de outro computador pede a chave de recuperação dele. |
| Rodapé | "Último backup: data/hora" (verde), atrasado há mais de 2 dias (laranja) ou "Backup com problema" (vermelho). Visível para todos. |
| Excel | Somente administrador. Aviso LGPD antes de gerar. Nome `Fenix Conecta - consulta - DD-MM-AAAA.xlsx`. Aba LEIA-ME com aviso de dados pessoais e "alterações não voltam para o sistema"; abas Doadores, Doações, Interações. |
| Removido | Botão "Backup completo" (JSON sem criptografia) do Dashboard. |

## Fase 6 — como ficou

| Item | Comportamento |
|---|---|
| Instalador | `Fenix-Conecta-Setup-<versão>.exe` (NSIS, um clique, **por usuário**, sem senha de administrador do Windows). Atalho "Fênix Conecta" na área de trabalho e no menu Iniciar. |
| Dados | Ficam em `%APPDATA%\FenixConecta`, fora da pasta do programa. Desinstalar e atualizar **não apagam** dados nem backups. |
| Atualização | `electron-updater` consulta o GitHub Releases 10 s após abrir e a cada 6 h; baixa em segundo plano; instala ao fechar ou pelo aviso "Atualização pronta" no menu. Backup automático antes de instalar. Sem internet: nada muda no uso diário. |
| Segurança | A atualização usa uma sessão de rede própria do processo principal; a janela continua sem acesso à internet. Pacote só com o binário Windows do SQLite (sem código-fonte nem outros sistemas). |
| Chave do banco | Migrada para a API assíncrona do `safeStorage` (a síncrona ficou obsoleta no Electron 45). Compatível com chaves já gravadas. |
| Autoteste | `"Fenix Conecta.exe" --verificar-instalacao --saida=<arquivo.json>`: confere chave, banco cifrado, migrações, backup, Excel, telas offline e canais, numa pasta temporária (nunca usa dados reais nem o OneDrive). |
| Versão | Exibida no rodapé do login e do menu. |

## Fase 7 — como ficou

| Item | Entrega |
|---|---|
| Testes de ponta a ponta | `npm run test:e2e`: 5 cenários (cadastro, login/recuperação, exclusão, offline/CSP, backup/Excel), 119 verificações no programa real, em pastas temporárias isoladas. Somados aos 50 testes de `npm test`. |
| Manual do usuário | `docs/Manual-Fenix-Conecta.pdf` (MAN-FC-001 rev. 00, 25 páginas, 21 telas com dados fictícios). Fonte em `docs/manual/manual.html`; `npm run manual` recaptura as telas e refaz o PDF. Incluído no instalador e aberto pelo botão **Ajuda (manual)**. |
| Checklist de entrega | `docs/CHECKLIST-ENTREGA.md` (CHK-FC-001 rev. 00): antes da visita, instalação, primeiro acesso com a ONG, configuração, treinamento, conferência e acompanhamento de 30 dias. |
| Correções encontradas | Itens de admin e aviso de atualização apareciam na tela mesmo escondidos (CSS); valores em R$ sem formato brasileiro; barra de rolagem na janela de senha. Testes passaram a conferir a visibilidade real. |
| Versão | 1.0.0 (`dist\Fenix-Conecta-Setup-1.0.0.exe`). |

## Versão 1.1.0 — ajustes após o teste da responsável (25/11/2026)

| Pedido | Como ficou |
|---|---|
| Verificações no cadastro de doador | WhatsApp obrigatório, exceto com "Ainda sem informações de contato" (selo "Sem contato" na lista). |
| Botões dos formulários | "Criar" nos formulários novos; "Salvar" nos de edição (inclusive usuários). |
| Data futura na doação | Só com status Pendente (doação prometida). Decisão da responsável entre bloquear sempre e manter como promessa. |
| Botão principal | "Novo ... +" ao lado de "Exportar", à esquerda, em todas as listas. |
| Interação | Doação relacionada (opcional, só doações do doador escolhido) e opção "Pessoa não registrada (lead / prospecção)" com nome e contato. Migração 4. |
| Olho na senha | Em todos os campos de senha (primeiro acesso, usuários, alterar senha, restaurar, esqueci a senha). |
| Salvar senha no login | **Não implementado** por segurança (computador compartilhado, LGPD). Implementado "Lembrar meu e-mail" (a senha nunca é guardada). Abrir Bloco de Notas com e-mail e senha foi desaconselhado (senha em texto aberto). |
| Esqueci minha senha | Usuário comum: administrador redefine. Administrador: cria senha nova com a chave de recuperação (mesmo bloqueio de 5 tentativas). |
| Selos coloridos no status, layout centralizado em telas largas, guia de teste em PDF | Cancelados pela responsável em 25/11/2026. |

Manual MAN-FC-001 rev. 01 (26 páginas) e guia de teste GT-FC-001 rev. 01 atualizados.

## Decisões em aberto

1. ~~Nome do repositório~~: resolvido em 17/11/2026 — `IsabelleDutrax/fenix-conecta-local` (público).
2. ~~Histórico herdado~~: resolvido em 17/11/2026 — histórico reescrito sem chaves, URLs do Supabase, e-mail pessoal e senha de teste. **Ação pendente da responsável:** revogar a chave no painel do Supabase (o repositório original ainda a expõe).
3. ~~Permissões do usuário comum~~: resolvido em 17/11/2026 — o usuário comum cadastra e edita; **só o administrador exclui** doadores, doações e interações (bloqueado também no processo principal). Gestão de usuários e chave de recuperação: só administrador.
4. **Valor monetário** armazenado como `REAL` (paridade com o sistema atual). Na fase 5 o Excel formata como moeda (R$ 0,00) e não houve diferença nos testes. Manter `REAL`; reavaliar só se surgirem somas com centavos incorretos.
6. **Excel só para administrador** (decisão da fase 5, por conter todos os dados pessoais). Validar com o cliente.
7. **Exportar CSV/PDF por tabela** (herdado do sistema web) continua disponível a todos e gera arquivo sem criptografia, sem aviso LGPD. Opções: (a) manter; (b) restringir ao administrador e incluir o mesmo aviso do Excel. Recomendado: (b).
5. **Assinatura de código** do instalador (evita alerta do Windows SmartScreen): custo e fornecedor precisam de validação. Sem ela, o manual (fase 7) mostra o passo "Mais informações → Executar assim mesmo".
8. ~~Publicar a 1ª versão no GitHub Releases~~: resolvido em 25/11/2026 — 1.0.0 publicada em https://github.com/IsabelleDutrax/fenix-conecta-local/releases/tag/v1.0.0 (instalador, blockmap e latest.yml; feed de atualização conferido). Próximas versões: `npm run publicar` (script `scripts/publicar-release.js`).
9. **Uso em mais de um computador**: cada instalação tem banco próprio. Se a ONG precisar de uso simultâneo em vários PCs, avaliar fase extra "computador servidor na rede local" (dados continuam na ONG).

---
Elaborado com suporte de IA — Revisado por Isabelle Dutra
