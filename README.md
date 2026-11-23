# Fênix Conecta — versão local (offline)

Programa de computador (Electron) para gestão de doações da ONG Fênix. Os dados ficam **só na máquina** do cliente, em um banco SQLite **criptografado** (esquema SQLCipher v4). Não há servidor nem Supabase.

> Projeto derivado do MVP web [sistema-mvp-ong-fenix](https://github.com/IsabelleDutrax/sistema-mvp-ong-fenix). O plano de fases está em [PLANO.md](PLANO.md).

## Como rodar (desenvolvimento)

```bash
npm install
npm start      # abre o programa
npm test       # testes da camada de dados
npm run vendor # recopia as bibliotecas para vendor/ (após mudar versões)
```

- Dados: `%APPDATA%\FenixConecta\dados\fenix.db` (cifrado).
- Chave do banco: `%APPDATA%\FenixConecta\chave.bin`, protegida pelo DPAPI do Windows.
- Para testar sem tocar nos dados normais: defina `FENIX_PASTA_DADOS=<pasta>` antes de `npm start`.
- Primeiro uso: a tela de **primeiro acesso** cria o administrador e mostra a **chave de recuperação** (imprimir e guardar). Sem `chave.bin` (ex.: Windows reinstalado), o programa pede essa chave.
- Usuários: senha com hash scrypt; níveis 99 (administrador) e 1 (usuário comum). O usuário comum cadastra e edita; só o administrador exclui registros, gerencia usuários (menu **Usuários**) e pode rever a chave com a própria senha. 5 senhas erradas seguidas bloqueiam o login por 30 s.

## Segurança e modo offline

- Funciona sem internet: todas as bibliotecas e fontes ficam em `vendor/`.
- A janela só carrega arquivos da pasta do programa; pedidos à internet são cancelados no processo principal.
- CSP sem script inline e sem `eval`. Botões usam `data-click="funcao(args)"`, executados por um despachante com lista branca (`ACOES_PERMITIDAS` em `script.js`). Ao criar um botão novo, inclua a função nessa lista.
- Ícones: Uicons by Flaticon (crédito exigido pela licença, exibido no rodapé).

## Estrutura nova

```
electron/main.js        janela do programa (contextIsolation, sandbox)
electron/preload.js     expõe window.dados, window.sessao e window.usuarios
electron/ipc.js         canais IPC + sessão + regras de acesso
electron/chave.js       gera/guarda/recupera a chave do banco (safeStorage)
src/dados/banco.js      abre o SQLite cifrado e aplica migrações
src/dados/migracoes.js  migrações versionadas
src/dados/repositorio.js CRUD com lista branca de tabelas/colunas
src/dados/usuarios.js   usuários locais, hash scrypt, autenticação
vendor/                 bibliotecas embutidas (gerado por npm run vendor; ver vendor/VERSOES.md)
scripts/copiar-vendor.js copia as bibliotecas de node_modules para vendor/
test/                   testes (node --test)
```

---

## README original do MVP web (referência)

💰 **MVP Doações - Sistema de Gestão de Doações**
=================================================

Um simples sistema de gestão de doações voltado para ONGs, desenvolvido utilizando HTML, CSS, SCSS, JavaScript e a plataforma Supabase. Este projeto permite que organizações gerenciem doadores, doações e interações em um só lugar.

📝 **Sumário**
--------------

*   Descrição
    
*   Funcionalidades
    
*   Tecnologias Utilizadas
    
*   Instalação
    
*   Uso
    
*   Como Contribuir
    
*   Licença
    

🖥️ **Descrição**
-----------------

O **MVP Doações** é um sistema que ajuda ONGs a gerenciarem:

*   Doadores (criação, atualização e remoção de registros).
    
*   Doações realizadas por doadores, incluindo consulta e controle.
    
*   Interações realizadas com os doadores, para acompanhar o histórico de contato.
    

O sistema inclui uma interface simples e intuitiva com botões estilizados e ícones responsivos.

🛠️ **Funcionalidades**
-----------------------

*   **Autenticação** de usuários (login e logout).
    
*   Gerenciamento de **doadores**:
    
    *   Adicionar novos doadores.
        
    *   Editar ou excluir informações de doadores.
        
*   Controle de **doações**:
    
    *   Registrar novas doações.
        
    *   Visualizar histórico de doações.
        
*   Registro de **interações** com doadores:
    
    *   Adicionar observações e histórico de contato realizado.
        
    *   Editar ou deletar essas interações.
        
*   Design responsivo para melhor experiência em dispositivos móveis e desktops.
    

⚙️ **Tecnologias Utilizadas**
-----------------------------

| Tecnologia      | Descrição                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HTML**        | Estruturação da aplicação.                                                                                                                                                      |
| **CSS/SCSS**    | Estilização aprimorada com o uso de mixins, variáveis e estrutura modular do SCSS.                                                                                              |
| **JavaScript**  | Lógica e interação do cliente (frontend).                                                                                                                                       |
| **Supabase**    | Backend como serviço para banco de dados, autenticação e APIs.                                                                                                                  |
| **Bootstrap 5** | Componentes de UI (modais e formulários) das telas de cadastro. Carregado via CDN, sem necessidade de build/bundler — ver seção [Modais (Bootstrap)](#modais-bootstrap) abaixo. |
| **Flaticon**    | Ícones responsivos e minimalistas para melhorar a interface do usuário.                                                                                                         |
| **SweetAlert2** | Alertas estilizados e responsivos nas interações do sistema.                                                                                                                    |

### Modais (Bootstrap) {#modais-bootstrap}

Os formulários de criação (Novo Doador, Nova Doação, Nova Interação) usam o componente **Modal** do [Bootstrap 5](https://getbootstrap.com/docs/5.3/components/modal/): um botão "+" abre um formulário em overlay, em vez dos campos ficarem soltos na tela.

Como está incluído (sem instalação, direto via CDN no `index.html`):
```html
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
```
O CSS do Bootstrap é carregado **antes** do `style.css` do projeto, para que os estilos customizados continuem tendo prioridade sobre o padrão do Bootstrap.

Abrir/fechar um modal não precisa de JavaScript próprio — usa os atributos `data-bs-toggle="modal"` e `data-bs-target="#idDoModal"` do próprio Bootstrap. O fechamento programático (depois de salvar com sucesso) é feito pela função utilitária `fecharModal(modalId, formId)` em `index.html`, que também limpa os campos do formulário.

⚠️ Se for adicionar novos modais ou componentes Bootstrap, atenção ao `<style>` legado no `<head>` do `index.html` (regra `input, button { margin: 5px; padding: 8px; }`) — ela pode conflitar com o espaçamento próprio dos componentes `.form-control`/`.btn`. Por isso existe um reset específico em `scss/_components.scss` (bloco `.modal { .form-control, .btn { margin: 0; } }`).

🚀 **Instalação**
-----------------

Siga os passos abaixo para rodar o projeto localmente:

### Pré-requisitos

1.  Certifique-se de que você possui o [**nodejs.org**](https://nodejs.org/) instalado (para instalação do Sass, se necessário).
    
2.  Conhecimento básico de **Supabase** e uma conta criada.
    

### Passos

1.  bashCopiargit clone https://github.com/seu-usuario/seu-repositorio.git
    
2.  bashCopiarcd mvp-doacoes
    
3.  Configure as variáveis do Supabase no arquivo principal de JavaScript:
    
    *   Substitua os valores das constantes SUPABASE\_URL e SUPABASE\_KEY pelas informações do seu projeto no Supabase.
        
4.  Instale as dependências de build (Sass) e compile o SCSS:
    ```bash
    npm install
    npm run build:css       # compila scss/main.scss para style.css uma vez
    npm run watch:css       # ou: deixa observando e recompilando a cada alteração
    ```
    *   Bootstrap, Supabase JS, Flaticon e SweetAlert2 **não** precisam de instalação — são carregados via CDN direto no `index.html`.
5.  (Opcional) Utilize um servidor para rodar a aplicação localmente:
    ```bash
    python -m http.server
    ```
        

📖 **Uso**
----------

1.  Acesse a interface pelo seu navegador, usando o endereço local (http://127.0.0.1:8000) ou pela sua hospedagem.
    
2.  **Login** ou **cadastro**:
    
    *   Use os e-mails padrão cadastrados no Supabase (ou crie novos diretamente pela interface).
        
3.  Comece a gerenciar doadores, doações e interações diretamente pelo painel do sistema.
    

🌐 **Estrutura do Projeto**
---------------------------

```
sistema-mvp-ong-cru/
├── index.html            # Página principal (HTML + JS + CDNs: Supabase, Bootstrap, Flaticon, SweetAlert2)
├── style.css             # CSS compilado a partir de scss/ (não editar à mão)
├── package.json           # Scripts de build do Sass (build:css / watch:css)
├── scss/                 # Arquivos SCSS (estilo modular)
│   ├── main.scss          # Ponto de entrada, importa os demais parciais
│   ├── _variables.scss     # Variáveis reutilizáveis (cores, espaçamento, etc.)
│   ├── _mixins.scss        # Mixins reutilizáveis
│   ├── _base.scss          # Estilos básicos/reset
│   ├── _components.scss    # Botões, inputs, seções, ajustes dos modais Bootstrap
│   └── _login.scss         # Layout da tela de Login/Cadastro
├── RELEASE_NOTES.md       # Histórico de mudanças por commit
└── README.md              # Documentação do projeto
```

🤝 **Como Contribuir**
----------------------

Contribuições são bem-vindas! Aqui está como você pode ajudar:

1.  Faça um fork do repositório.
    
2.  bashCopiargit checkout -b minha-feature
    
3.  Faça suas alterações e salve seus commits.
    
4.  bashCopiargit push origin minha-feature
    
5.  Crie um Pull Request explicando sua contribuição.

