const STORAGE_KEY = "retrofacil_data_v3";
const defaultColumns = [
  { id: "col-good", name: "😀 Funcionou bem" },
  { id: "col-bad", name: "😕 Pode melhorar" },
  { id: "col-ideas", name: "💡 Ideias" },
  { id: "col-actions", name: "🚀 Ações" },
];

const columnsContainer = document.getElementById("columns");
const boardTitle = document.getElementById("boardTitle");
const retroTitleHeading = document.getElementById("retroTitleHeading");
const teamContext = document.getElementById("teamContext");
const shareUrlInput = document.getElementById("shareUrl");
const startVotingBtn = document.getElementById("startVoting");
const newColumnNameInput = document.getElementById("newColumnName");

let votingMode = false;
let state = loadState();
const params = new URLSearchParams(window.location.search);
const teamId = params.get("team");
const retroId = params.get("retro");
const room = getRoom();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { teams: [], currentTeamId: null };
  try {
    return JSON.parse(raw);
  } catch {
    return { teams: [], currentTeamId: null };
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getRoom() {
  const team = state.teams.find((item) => item.id === teamId);
  if (!team) return null;
  const retro = (team.retros || []).find((item) => item.id === retroId);
  if (!retro) return null;
  return { team, retro };
}

function normalizeRetroModel(retro) {
  if (!Array.isArray(retro.columns) || !retro.columns.length) {
    retro.columns = defaultColumns.map((col) => ({ ...col }));

    if (Array.isArray(retro.cards)) {
      retro.cards = retro.cards.map((card) => {
        const fallback = retro.columns[0]?.id;
        const byName = retro.columns.find((col) => col.name === card.column);
        return {
          ...card,
          columnId: card.columnId || byName?.id || fallback,
          author: "anônimo",
        };
      });
    }
  }
}

function showMissingMessage() {
  document.body.innerHTML = `
    <main style="padding:2rem;font-family:system-ui">
      <h1>Sala não encontrada</h1>
      <p>Esta retrospectiva não existe mais ou o link está incompleto.</p>
      <a href="index.html">Voltar ao painel</a>
    </main>
  `;
}

function createBoard() {
  columnsContainer.innerHTML = "";
  const columns = room.retro.columns || [];

  columns.forEach((columnData) => {
    const template = document.getElementById("columnTemplate");
    const column = template.content.firstElementChild.cloneNode(true);
    column.dataset.columnId = columnData.id;

    const titleInput = column.querySelector(".column-title-input");
    titleInput.value = columnData.name;
    titleInput.addEventListener("change", () => {
      const next = titleInput.value.trim();
      titleInput.value = next || columnData.name;
      updateColumnName(columnData.id, titleInput.value);
    });

    column.querySelector(".add-card").addEventListener("click", () => {
      const text = prompt("Digite o cartão:");
      if (!text || !text.trim()) return;
      const list = column.querySelector(".card-list");
      addCard(list, {
        id: createId(),
        text: text.trim(),
        author: "anônimo",
        votes: 0,
        columnId: columnData.id,
      });
      renumberColumn(list);
      saveBoardToRetro();
    });

    column.querySelector(".remove-column").addEventListener("click", () => {
      removeColumn(columnData.id);
    });

    columnsContainer.appendChild(column);
  });
}

function addCard(targetList, card) {
  const template = document.getElementById("cardTemplate");
  const item = template.content.firstElementChild.cloneNode(true);
  item.dataset.cardId = card.id;
  item.dataset.columnId = card.columnId;
  item.querySelector(".card-text").textContent = card.text;

  const voteBtn = item.querySelector(".vote-btn");
  const voteCount = voteBtn.querySelector("span");
  voteCount.textContent = String(card.votes || 0);

  item.querySelector(".remove-card").addEventListener("click", () => {
    item.remove();
    renumberColumn(targetList);
    saveBoardToRetro();
  });

  voteBtn.addEventListener("click", () => {
    if (!votingMode) return;
    const hasVoted = voteBtn.classList.toggle("active");
    const next = Number(voteCount.textContent) + (hasVoted ? 1 : -1);
    voteCount.textContent = String(Math.max(next, 0));
    saveBoardToRetro();
  });

  targetList.appendChild(item);
}

function renumberColumn(cardList) {
  [...cardList.querySelectorAll(".card-item")].forEach((item, index) => {
    item.querySelector(".card-number").textContent = `#${index + 1}`;
  });
}

function collectCards() {
  const cards = [];
  document.querySelectorAll(".card-item").forEach((item) => {
    cards.push({
      id: item.dataset.cardId || createId(),
      text: item.querySelector(".card-text").textContent,
      author: "anônimo",
      votes: Number(item.querySelector(".vote-btn span").textContent || 0),
      columnId: item.dataset.columnId,
    });
  });
  return cards;
}

function saveBoardToRetro() {
  if (!room) return;
  room.retro.cards = collectCards();
  room.retro.columns = getCurrentColumnsFromDom();
  room.retro.updatedAt = new Date().toISOString();
  persist();
}

function getCurrentColumnsFromDom() {
  return [...document.querySelectorAll(".column")].map((col) => ({
    id: col.dataset.columnId,
    name: col.querySelector(".column-title-input").value.trim() || "Coluna",
  }));
}

function loadRetroCards() {
  const cards = room.retro.cards || [];
  const listsByColumn = {};
  document.querySelectorAll(".column").forEach((col) => {
    listsByColumn[col.dataset.columnId] = col.querySelector(".card-list");
  });

  cards.forEach((card) => {
    const fallback = document.querySelector(".card-list");
    const target = listsByColumn[card.columnId] || fallback;
    const fallbackColumnId = target.closest(".column")?.dataset.columnId;

    addCard(target, {
      ...card,
      columnId: card.columnId || fallbackColumnId,
      author: "anônimo",
    });
  });

  Object.values(listsByColumn).forEach((list) => renumberColumn(list));
}

function addColumn() {
  const name = newColumnNameInput.value.trim();
  if (!name) return;
  room.retro.columns.push({ id: createId(), name });
  newColumnNameInput.value = "";
  createBoard();
  loadRetroCards();
  saveBoardToRetro();
}

function updateColumnName(columnId, newName) {
  const column = room.retro.columns.find((item) => item.id === columnId);
  if (!column) return;
  column.name = newName;
  saveBoardToRetro();
}

function removeColumn(columnId) {
  if ((room.retro.columns || []).length <= 1) {
    alert("A retro precisa ter ao menos uma coluna.");
    return;
  }

  const targetColumn = room.retro.columns.find((col) => col.id === columnId);
  if (!targetColumn) return;

  const confirmRemove = confirm(`Remover a coluna '${targetColumn.name}'? Os cartões irão para a primeira coluna.`);
  if (!confirmRemove) return;

  const remaining = room.retro.columns.filter((col) => col.id !== columnId);
  const destinationId = remaining[0].id;

  room.retro.cards = (room.retro.cards || []).map((card) =>
    card.columnId === columnId ? { ...card, columnId: destinationId } : card
  );
  room.retro.columns = remaining;

  createBoard();
  loadRetroCards();
  saveBoardToRetro();
}

function clearBoard() {
  room.retro.cards = [];
  createBoard();
  saveBoardToRetro();
}

function copyLink() {
  shareUrlInput.select();
  navigator.clipboard
    .writeText(shareUrlInput.value)
    .then(() => {
      alert("Link copiado para a área de transferência.");
    })
    .catch(() => {
      alert("Não foi possível copiar automaticamente. Copie manualmente o link no campo.");
    });
}

function setupHeaderAndShare() {
  boardTitle.textContent = room.retro.title;
  retroTitleHeading.textContent = room.retro.title;
  teamContext.textContent = `Time: ${room.team.name}`;
  shareUrlInput.value = window.location.href;
}

function setupEvents() {
  document.getElementById("copyLink").addEventListener("click", copyLink);
  document.getElementById("saveRetro").addEventListener("click", () => {
    saveBoardToRetro();
    alert("Retrospectiva salva.");
  });

  document.getElementById("addColumn").addEventListener("click", addColumn);
  document.getElementById("clearBoard").addEventListener("click", clearBoard);
  document.getElementById("finishRetro").addEventListener("click", () => {
    saveBoardToRetro();
    alert("Retrospectiva encerrada e salva. Retorne ao painel para ver relatórios.");
  });

  startVotingBtn.addEventListener("click", () => {
    votingMode = !votingMode;
    startVotingBtn.textContent = votingMode ? "Encerrar votação" : "Modo votação";
  });
}

if (!room) {
  showMissingMessage();
} else {
  normalizeRetroModel(room.retro);
  setupHeaderAndShare();
  createBoard();
  loadRetroCards();
  saveBoardToRetro();
  setupEvents();
}
