# Guia de teste manual — Fênix Conecta

| Campo | Valor |
|---|---|
| Código | GT-FC-001 |
| Revisão | 01 |
| Data | 25/11/2026 |
| Responsável | Isabelle Dutra |
| Versão testada | 1.1.0 |
| Tempo estimado | 60 a 90 minutos |

## Conclusão

O programa **não tem usuário nem senha de fábrica**. Na primeira vez que abre (banco vazio), a tela é **Primeiro acesso**: você cria o administrador. Depois disso, o programa abre sempre na tela de **login**. Use os perfis de teste abaixo, só com **dados fictícios**. No fim, siga a etapa "Limpar o teste" para deixar o computador sem dados de teste.

## Antes de começar

1. Use **somente dados fictícios** (tabela abaixo). Não digite dados reais de doadores.
2. Neste computador, o backup automático vai para a pasta **OneDrive - CEREBRA...\Backup Fenix Conecta** (OneDrive da empresa). Os arquivos são criptografados e os dados são fictícios, mas apague a pasta no fim do teste (etapa 15).
3. Tenha um editor de texto (Bloco de Notas) aberto para anotar a chave de recuperação **de teste**. Em uso real, a chave é impressa.

## Perfis de teste

| Perfil | Nome | E-mail (login) | Senha | Quem cria |
|---|---|---|---|---|
| Administrador | Admin Teste | admin.teste@example.org | Teste#Admin2026 | Você, na tela de primeiro acesso |
| Usuário comum | Voluntário Teste | voluntario.teste@example.org | Teste#Comum2026 | O administrador, na tela Usuários |
| Senha nova do comum (passo 8.5) | — | — | Teste#Nova2026 | O administrador, botão "Redefinir senha" |

> Senhas só para teste. Não use estas senhas na instalação da ONG.

## Dados fictícios para cadastro

| Nome | E-mail | WhatsApp | CPF/CNPJ | Endereço |
|---|---|---|---|---|
| Ana Teste | ana@example.org | (11) 90000-0001 | 000.000.000-01 | Rua Exemplo, 100 |
| Bruno Teste | bruno@example.org | (11) 90000-0002 | 000.000.000-02 | Av. Modelo, 200 |
| Empresa Teste Ltda | contato@example.org | (11) 3000-0003 | 00.000.000/0001-00 | Av. Teste, 300 |

## Roteiro

Marque cada passo como OK ou anote o problema (com a hora e, se possível, um print da tela).

### 1. Primeiro acesso e chave de recuperação

| # | Faça | Resultado esperado | OK? |
|---|---|---|---|
| 1.1 | Na tela de primeiro acesso, digite nome **Admin Teste**, e-mail **admin.teste@example.org**, senha **Teste#Admin2026** e repita a senha **errada** (ex.: Teste#Admin2025). Clique em **Criar administrador**. | Aviso "As senhas não conferem". Nada é criado. | ☐ |
| 1.2 | Clique no **olho** dentro dos campos de senha. Corrija a repetição da senha e clique em **Criar administrador**. | O olho mostra/oculta a senha. Depois aparece a tela da **chave de recuperação** (8 grupos de 8 letras/números). | ☐ |
| 1.3 | Clique em **Copiar** e cole a chave no Bloco de Notas (só no teste). | Aviso "Chave copiada!". | ☐ |
| 1.4 | Tente clicar em **Continuar** sem marcar a confirmação. | O botão está desativado (cinza). | ☐ |
| 1.5 | Marque a confirmação e clique em **Continuar**. | O programa abre no Dashboard. Rodapé: "Logado como admin.teste@example.org — Administrador". | ☐ |
| 1.6 | Veja o aviso **"Hora da cópia em pendrive"**. Clique em **Lembrar amanhã**. | O aviso fecha. | ☐ |
| 1.7 | Olhe o fim do menu. | "Último backup: data e hora" em **verde**. | ☐ |

### 2. Doadores

| # | Faça | Resultado esperado | OK? |
|---|---|---|---|
| 2.1 | Menu **Doadores** → **Novo Doador +**. Cadastre **Ana Teste** com todos os dados da tabela e clique em **Criar**. | O botão do formulário novo é **Criar**. A Ana aparece na lista. | ☐ |
| 2.2 | Cadastre **Bruno Teste** e **Empresa Teste Ltda**. | 3 doadores na lista. | ☐ |
| 2.3 | Tente cadastrar "Teste Erro" com CPF **123**. | Aviso "CPF/CNPJ inválido". Não salva. | ☐ |
| 2.4 | Tente cadastrar "Teste Erro" com telefone **1234**. | Aviso "Telefone inválido". Não salva. | ☐ |
| 2.5 | Tente cadastrar "Teste Erro" com e-mail **ana@**. | Aviso "E-mail inválido". Não salva. | ☐ |
| 2.6 | Tente cadastrar "teste minúsculo" só com o nome. | Aviso "Informe o WhatsApp". Não salva. | ☐ |
| 2.6b | Repita marcando **Ainda sem informações de contato**. | Salva como "Teste minúsculo" (1ª letra maiúscula), com o selo **Sem contato** na coluna WhatsApp. | ☐ |
| 2.7 | Clique no **lápis** do Bruno, mude o WhatsApp para (11) 90000-0022 e clique em **Salvar**. | O botão da edição é **Salvar**. Aviso "Informações salvas!" e WhatsApp atualizado. | ☐ |
| 2.8 | Clique no título da coluna **Nome**. | A lista ordena por nome (clique de novo inverte). | ☐ |
| 2.9 | Clique na **prancheta** da Ana. | Aviso "Mensagem copiada!". Cole no Bloco de Notas: mensagem de agradecimento com o nome dela. | ☐ |

### 3. Doações

| # | Faça | Resultado esperado | OK? |
|---|---|---|---|
| 3.1 | Menu **Doações** → **Nova Doação +** (o botão fica ao lado de **Exportar**). Doador: digite "Ana" e escolha **Ana Teste**. Valor **150**, forma **Pix**. Clique em **Criar**. | Aparece "R$ 150,00", status **Pendente**. | ☐ |
| 3.2 | Cadastre para **Empresa Teste Ltda**: valor **1500**, forma Transferência. | Aparece "R$ 1.500,00". | ☐ |
| 3.3 | Cadastre para **Bruno Teste**: valor **80,50** e data **daqui a 10 dias**. | Aparece um **relógio vermelho** ao lado da data (doação futura). | ☐ |
| 3.4 | Tente cadastrar valor **0**. | Aviso "Informe um valor válido maior que zero". | ☐ |
| 3.5 | Clique no **lápis** da doação da Ana e mude o status para **Pago**. Clique em **Salvar**. | Selo verde "Pago". | ☐ |
| 3.5b | Edite a doação do **Bruno** (data futura), mude o status para **Pago** e clique em **Salvar**. | Aviso "Data futura só para doação Pendente". Não salva. Com status **Pendente**, a data futura é aceita. | ☐ |
| 3.6 | Volte ao **Dashboard**. | Total arrecadado **R$ 1.730,50** (todo o período) e **4 doadores**. Mude o período para "Última semana" e veja o total mudar. | ☐ |
| 3.7 | Em **Doadores**, clique no número da coluna **Doações** da Ana. | Janela com as doações da Ana. | ☐ |

### 4. Interações

| # | Faça | Resultado esperado | OK? |
|---|---|---|---|
| 4.1 | Menu **Interações** → **Nova Interação +**. Em **Doador ou pessoa**, escolha Ana. Em **Doação relacionada**, escolha a doação de R$ 150,00. Tipo **Ligação**, observação "Agradeceu a doação". Clique em **Criar**. | Aparece na lista, com a doação na coluna **Doação**. | ☐ |
| 4.2 | Tente cadastrar com data **amanhã**. | Aviso "A data da interação não pode ser no futuro". | ☐ |
| 4.3 | Nova interação: em **Doador ou pessoa**, escolha **+ Pessoa não registrada (lead / prospecção)**. Deixe o nome vazio e clique em **Criar**. | Aviso "Informe o nome da pessoa não registrada". | ☐ |
| 4.4 | Digite nome **Lead Teste** e contato **(11) 90000-0099**, tipo **Mensagem**. Clique em **Criar**. | Aparece "Lead Teste · (11) 90000-0099" com o selo **Não registrado**. | ☐ |

### 5. Exportar tabelas

| # | Faça | Resultado esperado | OK? |
|---|---|---|---|
| 5.1 | Em **Doadores**, clique em **Exportar** → **CSV (Excel)**. Salve na Área de Trabalho. | Arquivo .csv abre no Excel com os 3+ doadores e acentos corretos. | ☐ |
| 5.2 | Faça o mesmo com **PDF**. | PDF com a tabela de doadores. | ☐ |
| 5.3 | Apague os dois arquivos exportados. | — | ☐ |

### 6. Excel de consulta (administrador)

| # | Faça | Resultado esperado | OK? |
|---|---|---|---|
| 6.1 | No **Dashboard**, clique em **Exportar Excel (consulta)**. | Aviso sobre **dados pessoais (LGPD)**. | ☐ |
| 6.2 | Clique em **Entendi, exportar** e salve. | Arquivo "Fenix Conecta - consulta - DD-MM-AAAA.xlsx". | ☐ |
| 6.3 | Abra a planilha. | Abas **LEIA-ME**, Doadores, Doações, Interações. Valores em R$, datas DD/MM/AAAA. Doadores com coluna "Sem contato". Interações com "Situação" (Doador / Não registrado), "Doação relacionada" e "Registrado por" = Admin Teste. | ☐ |
| 6.4 | Apague a planilha. | — | ☐ |

### 7. Backup (administrador)

| # | Faça | Resultado esperado | OK? |
|---|---|---|---|
| 7.1 | Menu **Backup**. | Último backup, pasta com selo **OneDrive**, lista de backups. | ☐ |
| 7.2 | Clique em **Fazer backup agora**. | Aviso "Backup feito!" e mais uma linha na lista. | ☐ |
| 7.3 | Clique em **Abrir pasta**. | O Explorador abre a pasta com os arquivos `fenix-backup-...fenixbak`. | ☐ |
| 7.4 | (Opcional, com pendrive) Clique em **Copiar para pendrive** e escolha o pendrive. | "Cópia feita!" e o arquivo no pendrive. Sem pendrive, escolha uma pasta da Área de Trabalho: o programa avisa que **não é um pendrive**. | ☐ |

### 8. Usuários e perfil comum

| # | Faça | Resultado esperado | OK? |
|---|---|---|---|
| 8.1 | Menu **Usuários** → **Novo Usuário +**. Nome **Voluntário Teste**, e-mail **voluntario.teste@example.org**, nível **Usuário comum**, senha **Teste#Comum2026** (confira o olho). Clique em **Criar**. | 2 usuários na lista. | ☐ |
| 8.2 | Clique em **Sair**. Entre com **voluntario.teste@example.org** / **Teste#Comum2026**. | Rodapé: "Usuário comum". Menu **sem** Usuários e Backup; sem "Chave de recuperação". | ☐ |
| 8.3 | Abra Doadores, Doações e Interações. | **Sem** botões de lixeira. Dashboard **sem** "Exportar Excel". Rodapé mostra o último backup. | ☐ |
| 8.4 | Cadastre uma interação. | Salva normalmente. | ☐ |
| 8.5 | Saia. Entre como **admin**, menu **Usuários**, botão **chave** do Voluntário: senha nova **Teste#Nova2026**. Saia e entre como voluntário com a senha **antiga**. | "E-mail ou senha incorretos". Com **Teste#Nova2026**, entra. | ☐ |
| 8.6 | Ainda como voluntário: **Alterar minha senha** de Teste#Nova2026 para **Teste#Comum2026**. Saia e entre de novo. | Entra com Teste#Comum2026. | ☐ |
| 8.7 | Saia. Digite a senha errada **5 vezes** seguidas para o admin. | Na 6ª tentativa: "Muitas tentativas. Aguarde 30 segundos." Depois de 30 s, a senha certa funciona. | ☐ |
| 8.8 | Na tela de entrada, marque **Lembrar meu e-mail** e entre como admin. Saia, feche e abra o programa. | O e-mail do admin já vem preenchido; a senha não. Desmarque e entre de novo: na próxima vez o e-mail não vem. | ☐ |
| 8.9 | Clique em **Esqueci minha senha**. | Explica: usuário comum pede ao administrador; administrador usa a chave. | ☐ |
| 8.10 | Clique em **Sou administrador: usar a chave**. Digite o e-mail do admin, uma chave **errada** e uma senha nova. | "E-mail de administrador ou chave de recuperação incorretos." | ☐ |
| 8.11 | Repita com a chave anotada no passo 1.3 e a senha nova **Teste#Chave2026**. Entre com ela. Depois volte a senha para **Teste#Admin2026** (Alterar minha senha). | "Senha nova criada!" e o login funciona com a senha nova. | ☐ |

### 9. Exclusão (administrador)

| # | Faça | Resultado esperado | OK? |
|---|---|---|---|
| 9.1 | Entre como admin. Em **Doadores**, clique na **lixeira** da Ana. | Aviso "Não é possível excluir" (ela tem doação e interação). | ☐ |
| 9.2 | Exclua a doação e as interações da Ana; depois exclua a Ana. | Pede confirmação; depois some da lista. | ☐ |

### 10. Restaurar backup (administrador)

| # | Faça | Resultado esperado | OK? |
|---|---|---|---|
| 10.1 | Cadastre o doador **"Depois do backup"**. | Aparece na lista. | ☐ |
| 10.2 | Menu **Backup** → **Restaurar** no backup feito no passo 7.2. Confira o resumo (data e quantidades). Digite a senha **errada**. | "Backup não restaurado — Senha incorreta". Nada muda. | ☐ |
| 10.3 | Repita com a senha certa (**Teste#Admin2026**). | "Backup restaurado!" e volta à tela de entrada. | ☐ |
| 10.4 | Entre como admin. | "Depois do backup" **sumiu**; a Ana voltou (estado do passo 7.2). Na lista de backups há um backup novo (cópia de segurança feita antes de restaurar). | ☐ |

### 11. Chave de recuperação e ajuda

| # | Faça | Resultado esperado | OK? |
|---|---|---|---|
| 11.1 | Menu → **Chave de recuperação**. Digite a senha do admin. | Mostra a mesma chave anotada no passo 1.3. | ☐ |
| 11.2 | Clique em **Imprimir** (pode cancelar a impressão). | A prévia mostra só a folha da chave. | ☐ |
| 11.3 | Menu → **Ajuda (manual)**. | O manual em PDF abre. | ☐ |

### 12. Persistência

| # | Faça | Resultado esperado | OK? |
|---|---|---|---|
| 12.1 | Feche o programa (X) e abra de novo pelo atalho. | Tela de entrada (não pede a chave). Depois de entrar, todos os dados continuam. | ☐ |
| 12.2 | Tente abrir o programa duas vezes. | Abre só uma janela. | ☐ |

### 13. Recuperação com a chave (opcional, simula Windows reinstalado)

| # | Faça | Resultado esperado | OK? |
|---|---|---|---|
| 13.1 | Feche o programa. No Explorador, abra `%APPDATA%\FenixConecta` e **renomeie** `chave.bin` para `chave.bin.teste`. | — | ☐ |
| 13.2 | Abra o programa. | Tela "Os dados estão protegidos". | ☐ |
| 13.3 | Digite uma chave errada (ex.: 0000...). | "Chave de recuperação incorreta." | ☐ |
| 13.4 | Cole a chave anotada no passo 1.3 (pode ser em minúsculas). Clique em **Abrir dados**. | Tela de entrada; os dados continuam lá. Um novo `chave.bin` foi criado. | ☐ |

### 14. Sem internet

| # | Faça | Resultado esperado | OK? |
|---|---|---|---|
| 14.1 | Desligue o Wi-Fi/cabo. Feche e abra o programa. Navegue pelas telas. | Tudo funciona igual (ícones, fontes, cadastros). | ☐ |
| 14.2 | Ligue a internet de novo. | — | ☐ |

### 15. Limpar o teste (obrigatório)

1. Feche o programa.
2. Desinstale: Configurações do Windows → Aplicativos → **Fênix Conecta** → Desinstalar.
3. Apague a pasta `%APPDATA%\FenixConecta` (dados e chave de teste; desinstalar **não** apaga).
4. Apague a pasta **Backup Fenix Conecta** dentro do OneDrive e, se usou, a cópia no pendrive.
5. Apague o Bloco de Notas com a chave de teste.

## Registro de problemas

| # do passo | O que aconteceu | Esperado | Hora | Print |
|---|---|---|---|---|
| | | | | |

## Itens que este roteiro não cobre

- **Atualização automática:** só aparece quando existir uma versão mais nova que a 1.0.0 publicada. Para testar, é preciso publicar uma 1.0.1 de teste (posso preparar).
- **Envelope (e-mail):** abre o programa de e-mail do Windows; o resultado depende do programa configurado.

---
Elaborado com suporte de IA — Revisado por Isabelle Dutra
