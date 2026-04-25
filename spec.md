# Especificação do Projeto: RetroFácil

Este documento define a especificação técnica e as diretrizes de design e arquitetura para a continuidade do desenvolvimento da aplicação **RetroFácil**.

## 1. Visão Geral
O RetroFácil é uma aplicação web leve e focada em gerenciar times, acompanhar o histórico mensal de retrospectivas e permitir a colaboração em tempo real ou assíncrona em salas de retrospectiva através de links compartilháveis.

## 2. Arquitetura Tecnológica
A aplicação segue uma arquitetura baseada em Cliente/Servidor tradicional, com as seguintes tecnologias:

- **Backend:** Node.js com Express (Servidor web leve e de fácil manutenção).
- **Banco de Dados:** SQLite (Focado no uso esporádico e facilidade de implantação, eliminando a necessidade de gerenciar um servidor de banco de dados robusto). O banco é manipulado pelas bibliotecas `sqlite` e `sqlite3`.
- **Frontend:** Vanilla HTML5, CSS3 e JavaScript (ES6+). Sem a dependência de frameworks complexos, focando em performance, simplicidade e facilidade de manutenção.

## 3. Banco de Dados (SQLite)
A estrutura do banco de dados (esquema) é composta pelas seguintes tabelas principais:
- **`teams`**: Cadastro de times (`id`, `name`, `created_at`).
- **`retros`**: Retrospectivas vinculadas a um time (`id`, `team_id`, `title`, `creator_session_id`, `created_at`, `updated_at`).
- **`retro_columns`**: Colunas customizáveis de cada retrospectiva (`id`, `retro_id`, `name`, `position`).
- **`cards`**: Cartões de feedback associados a uma coluna de uma retrospectiva (`id`, `retro_id`, `column_id`, `text`, `votes`, `position`).

## 4. Melhorias de UI/UX (Próximos Passos)
Com base nas melhores práticas, as seguintes melhorias devem ser implementadas no projeto:

### 4.1. Responsividade (Mobile First)
A aplicação deve ser completamente utilizável em dispositivos móveis.
- O painel (`index.html`) deve ajustar suas listas, relatórios e formulários em blocos empilháveis (`flex-direction: column` em telas menores).
- O quadro da retrospectiva (`retro.html`) deve permitir "swipe" horizontal (scroll) entre as colunas, ou empilhá-las logicamente, garantindo que os cartões e os botões de votação tenham uma área de toque (`touch target`) adequada (mínimo de 44x44px).

### 4.2. Tema Claro e Escuro (Light/Dark Mode)
A interface deve oferecer suporte a ambos os temas, melhorando a acessibilidade e o conforto visual:
- Implementar variáveis CSS (Custom Properties) para gerenciar cores (ex: `--bg-color`, `--text-color`, `--primary-color`, `--surface-color`, `--border-color`).
- Detectar a preferência do sistema operacional usando a media query `@media (prefers-color-scheme: dark)`.
- Oferecer um *toggle* manual na interface de usuário (salvando a preferência no `localStorage`).

### 4.3. Distribuição de Campos e Interface
Aplicar princípios e leis de UX (ex: Lei de Fitts, Lei de Proximidade) para agrupar elementos relacionados:
- **Painel de Times:** Os campos de "Criar time" e "Selecionar time" devem estar em áreas bem delimitadas. A ação de criar uma nova retrospectiva deve ser o foco principal (`Call to Action` de destaque) após selecionar um time.
- **Formulários:** Alinhar rótulos (`labels`) preferencialmente no topo dos inputs para agilizar a leitura visual. Utilizar espaçamentos (`padding/margin`) generosos para que a interface respire.
- **Quadro (Board):** Garantir que o link de compartilhamento seja copiado facilmente ("1-click copy" com feedback de sucesso, ex: "Copiado!").

## 5. Diretrizes de Código
Ao implementar estas ou novas funcionalidades, sempre basear-se no arquivo `skills.md`:
- Não quebrar rotas de APIs existentes.
- Garantir que o estilo mantenha consistência com os tokens base do projeto no `styles.css`.
- As manipulações no DOM devem ser otimizadas para reduzir reflows.
- Validação em ambas as camadas (Frontend e Backend) é obrigatória.

---

## 6. Controle de Acesso por Papel (Admin vs. Colaborador)

### 6.1. Contexto e Motivação
A tela de retrospectiva (`retro.html`) exibe atualmente todas as funcionalidades para qualquer pessoa que acessa o link, independente de ser o criador (admin) ou um colaborador convidado. Isso expõe controles sensíveis (edição de colunas, link de compartilhamento) para pessoas que não deveriam vê-los.

### 6.2. Definição de Papéis

| Papel | Como Acessa | O que pode ver/fazer |
|---|---|---|
| **Admin (Criador)** | Faz login com e-mail/senha ou Google e acessa a retro pelo Dashboard | Vê tudo: quadro completo, edição de colunas, link de compartilhamento, botão "Encerrar retrospectiva", "Limpar quadro" e modo de votação. |
| **Colaborador (Viewer)** | Acessa diretamente via link compartilhável, **sem login** | Vê apenas: nome da sprint, nome do time, e o quadro de cartões (pode adicionar cartões e votar, mas não edita colunas nem vê controles admin). |

### 6.3. Regras de Negócio

- O **criador da retrospectiva** é identificado pelo `creator_session_id` (campo `retros.creator_session_id`), que armazena o `user.id` do usuário autenticado que criou a retro.
- O **papel do usuário atual** é determinado assim:
  - Se há um token JWT válido no `localStorage` **E** o `user.id` do token corresponde ao `creator_session_id` da retro → **ADMIN**.
  - Caso contrário (sem token, token de outro usuário, ou acesso pelo link) → **COLABORADOR**.
- A verificação de papel deve ocorrer tanto no **Frontend** (para esconder/mostrar elementos) quanto no **Backend** (para proteger rotas de edição).

### 6.4. Interface do Colaborador (Viewer)

A interface simplificada para colaboradores deve exibir apenas:
1. **Cabeçalho:** Logo do RetroFácil + Nome da sprint + Nome do time.
2. **Quadro:** As colunas e os cartões, com botão `+ Cartão` em cada coluna e botão de votação (👍) em cada cartão.
3. **Sem acesso a:**
   - Seção "Compartilhar sala" (link + botão "Copiar link")
   - Seção "Configurar colunas" (adicionar/remover/renomear colunas)
   - Botão "Encerrar retrospectiva"
   - Botão "Limpar quadro"
   - Botão "Salvar agora" (a versão viewer deve salvar automaticamente ao adicionar cartão)

### 6.5. Interface do Admin

O admin vê todos os controles já existentes na tela atual, conforme a imagem de referência (screenshot fornecido pelo usuário):
- Seção "Compartilhar sala" com link e botão "Copiar link"
- Seção "Configurar colunas" com campo de texto e botão "Adicionar coluna"
- Botão de lápis (✏️) e lixeira (🗑️) em cada coluna
- Botão "Salvar agora"
- Botão "Encerrar retrospectiva"
- Botão "Limpar quadro"
- Botão "Modo votação"

### 6.6. Mudanças Necessárias no Código

#### Backend (`server.js`)
- A rota `GET /api/retros/:retroId` deve retornar o campo `creator_session_id` para que o frontend possa comparar com o usuário logado.
- As rotas de **edição de colunas** e **limpar quadro** devem validar se o requisitante é o criador da retro, retornando `403 Forbidden` caso contrário.

#### Frontend (`retro.js` / `retro.html`)
- Após carregar os dados da retro, comparar `retro.creatorSessionId` com o `user.id` do localStorage.
- Se for admin → renderizar a interface completa (comportamento atual).
- Se for colaborador → ocultar todos os elementos admin (via CSS classe `.admin-only { display: none }` ou remoção do DOM).

#### Banco de Dados
- Nenhuma alteração de schema necessária. O campo `creator_session_id` já existe na tabela `retros` e já armazena o `user.id`.

### 6.7. UX para Colaboradores
- O colaborador que acessa pelo link **não precisa fazer login**.
- Seus cartões são salvos como "anônimo" (sem `user_id`).
- A página deve exibir uma mensagem de boas-vindas simples, ex: *"Você está colaborando em [Nome da Sprint] do time [Nome do Time]."*
### 5. Hierarquia de Usuários e Permissões

A plataforma utiliza um sistema de papéis (RBAC) para controlar o acesso:

#### A. Super Admin (Dono da Plataforma)
- **Acesso**: Página `/admin.html`.
- **Credenciais Iniciais**: `diegotere@yahoo.com.br` / `senha@123`.
- **Funcionalidades**:
  - Visualizar todos os usuários cadastrados.
  - Alterar o papel de um usuário de **Colaborador** para **Admin (Criador)**.
  - Monitorar o volume de times e retrospectivas por usuário.

#### B. Admin (Criador de Times/Retros)
- **Acesso**: Dashboard (`index.html`).
- **Funcionalidades**:
  - Criar e gerenciar seus próprios times (isolados por `userId`).
  - Criar e configurar colunas de retrospectivas.
  - Encerrar sessões e gerar relatórios.

#### C. Colaborador (Participante)
- **Acesso**: Apenas via links compartilhados de retrospectivas (`retro.html`).
- **Restrição**: Redirecionado para fora do Dashboard se tentar acesso direto.
- **Funcionalidades**:
  - Adicionar cartões e votar.
  - Pode fazer login para se identificar nos cartões, mas continua restrito à visualização da retro.

### 6. Isolamento de Dados
Cada usuário com papel de **Admin** possui seu próprio ecossistema:
- Os times criados por um usuário são vinculados ao seu `id` via `creator_id`.
- Ao carregar o dashboard, o sistema filtra automaticamente apenas os times e retrospectivas pertencentes ao usuário logado.
