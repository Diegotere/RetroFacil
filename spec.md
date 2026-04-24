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
