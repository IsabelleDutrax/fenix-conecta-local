# Plano — Fênix Conecta versão local (offline)

| Campo | Valor |
|---|---|
| Documento | PLANO.md |
| Revisão | 03 |
| Data | 23/11/2026 |
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
| **Quando** | Fases 1, 2 e 3 em 17/11/2026; fase 4 em 23/11/2026. Datas das fases 5 a 7 a definir com a responsável. |
| **Como** | Electron + SQLite criptografado (`better-sqlite3-multiple-ciphers`, esquema SQLCipher v4), IPC com `contextIsolation`, instalador `.exe` com atualização via GitHub Releases. |
| **Quanto** | Sem custo de licença (bibliotecas MIT). Custo de assinatura de código do instalador: precisa de validação (ver decisões em aberto). |

## Fases

| Fase | Entrega | Critério de pronto | Status |
|---|---|---|---|
| 1 Base | Estrutura Electron abre o sistema atual como janela (`npm start`). | Janela abre com login e telas originais. | Concluída |
| 2 Banco local | SQLite criptografado com as 3 tabelas e migrações versionadas. Camada de dados (`src/dados`) acessada por IPC seguro (`window.dados`). Supabase removido. | CRUD das 3 entidades funciona; dados persistem após reiniciar; arquivo ilegível sem a chave; testes automáticos passam. | Concluída |
| 3 Login local | Tabela `usuario` (migração 2), senha com hash scrypt, níveis de acesso (admin = 99, comum = 1), tela de primeiro acesso que cria o admin e mostra a **chave de recuperação** para imprimir, tela de recuperação, gestão de usuários e troca de senha. Regras de acesso no processo principal. | Login sem internet; usuário comum não vê funções de admin. | Concluída |
| 4 Offline | Bibliotecas e fonte embutidas em `vendor/` (`npm run vendor`, versões fixas, licenças incluídas). CSP restritiva (sem script inline, sem eval, sem internet). Handlers `onclick` trocados por despachante com lista branca. Rede bloqueada no processo principal (só arquivos do programa). Crédito Flaticon no rodapé. | App funciona com a rede desligada. | Concluída |
| 5 Excel e backup | Exportar Excel (cópia de consulta com data no nome + aviso LGPD). Backup criptografado diário na pasta do OneDrive (retenção 30 dias), aviso semanal de pendrive, botão "Restaurar backup", rodapé "Último backup". | Backup gerado, restaurado e verificado em teste. | Pendente |
| 6 Instalador e atualização | `electron-builder` (NSIS `.exe`) + `electron-updater` via GitHub Releases. | Instalar, atualizar e desinstalar sem perder dados. | Pendente |
| 7 Testes e manual | Testes de ponta a ponta, manual ilustrado para usuário não técnico, checklist de entrega. | Manual revisado; testes verdes. | Pendente |

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

## Decisões em aberto

1. ~~Nome do repositório~~: resolvido em 17/11/2026 — `IsabelleDutrax/fenix-conecta-local` (público).
2. ~~Histórico herdado~~: resolvido em 17/11/2026 — histórico reescrito sem chaves, URLs do Supabase, e-mail pessoal e senha de teste. **Ação pendente da responsável:** revogar a chave no painel do Supabase (o repositório original ainda a expõe).
3. ~~Permissões do usuário comum~~: resolvido em 17/11/2026 — o usuário comum cadastra e edita; **só o administrador exclui** doadores, doações e interações (bloqueado também no processo principal). Gestão de usuários e chave de recuperação: só administrador.
4. **Valor monetário** armazenado como `REAL` (paridade com o sistema atual). Alternativa mais precisa: centavos em `INTEGER` — avaliar na fase 5 (Excel).
5. **Assinatura de código** do instalador (evita alerta do Windows SmartScreen): custo e fornecedor precisam de validação.

---
Elaborado com suporte de IA — Revisado por Isabelle Dutra
