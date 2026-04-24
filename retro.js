const token = localStorage.getItem("retrofacil_token");
const currentUserStr = localStorage.getItem("retrofacil_user");
let currentUser = null;
try {
  currentUser = JSON.parse(currentUserStr);
} catch(e){}

if (!token || !currentUser) {
  window.location.href = "login.html";
}

const SESSION_KEY = "retrofacil_session_id";
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
const columnConfigSection = document.getElementById("columnConfigSection");

const params = new URLSearchParams(window.location.search);
const retroId = params.get("retro");

let votingMode = false;
let room = null;
let isOwner = false;

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSessionId() {
  const current = localStorage.getItem(SESSION_KEY);
  if (current) return current;
  const created = createId();
  localStorage.setItem(SESSION_KEY, created);
  return created;
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...(options.headers || {}) 
    },
    ...options,
  });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem("retrofacil_token");
    localStorage.removeItem("retrofacil_user");
    window.location.href = "login.html";
    return;
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Falha na requisição");
  }

  if (response.status === 204) return null;
  return response.json();
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
  const columns = room.columns || defaultColumns;

  columns.forEach((columnData) => {
    const template = document.getElementById("columnTemplate");
    const column = template.content.firstElementChild.cloneNode(true);
    column.dataset.columnId = columnData.id;

    const titleInput = column.querySelector(".column-title-input");
    titleInput.value = columnData.name;
    titleInput.readOnly = !isOwner;
    titleInput.addEventListener("change", () => {
      if (!isOwner) return;
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
        votes: 0,
        columnId: columnData.id,
        userId: currentUser.id,
      });
      renumberColumn(list);
      saveBoardToRetro();
    });

    const removeColumnBtn = column.querySelector(".remove-column");
    if (!isOwner) {
      removeColumnBtn.style.display = "none";
    } else {
      removeColumnBtn.addEventListener("click", () => removeColumn(columnData.id));
    }

    columnsContainer.appendChild(column);
  });
}

function addCard(targetList, card) {
  const template = document.getElementById("cardTemplate");
  const item = template.content.firstElementChild.cloneNode(true);
  item.dataset.cardId = card.id;
  item.dataset.columnId = card.columnId;
  item.dataset.userId = card.userId || currentUser.id;
  item.querySelector(".card-text").textContent = card.text;

  const removeBtn = item.querySelector(".remove-card");
  if (!isOwner && item.dataset.userId !== currentUser.id) {
    removeBtn.style.display = "none";
  }

  const voteBtn = item.querySelector(".vote-btn");
  const voteCount = voteBtn.querySelector("span");
  voteCount.textContent = String(card.votes || 0);

  removeBtn.addEventListener("click", () => {
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
      votes: Number(item.querySelector(".vote-btn span").textContent || 0),
      columnId: item.dataset.columnId,
      userId: item.dataset.userId,
    });
  });
  return cards;
}

async function saveBoardToRetro() {
  if (!room) return;
  room.cards = collectCards();
  room.columns = getCurrentColumnsFromDom();
  await api(`/retros/${room.id}`, {
    method: "PUT",
    body: JSON.stringify({ columns: room.columns, cards: room.cards }),
  });
}

function getCurrentColumnsFromDom() {
  return [...document.querySelectorAll(".column")].map((col) => ({
    id: col.dataset.columnId,
    name: col.querySelector(".column-title-input").value.trim() || "Coluna",
  }));
}

function loadRetroCards() {
  const cards = room.cards || [];
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
    });
  });

  Object.values(listsByColumn).forEach((list) => renumberColumn(list));
}

function addColumn() {
  if (!isOwner) return;
  const name = newColumnNameInput.value.trim();
  if (!name) return;
  room.columns.push({ id: createId(), name });
  newColumnNameInput.value = "";
  createBoard();
  loadRetroCards();
  saveBoardToRetro();
}

function updateColumnName(columnId, newName) {
  if (!isOwner) return;
  const column = room.columns.find((item) => item.id === columnId);
  if (!column) return;
  column.name = newName;
  saveBoardToRetro();
}

function removeColumn(columnId) {
  if (!isOwner) return;
  if ((room.columns || []).length <= 1) {
    alert("A retro precisa ter ao menos uma coluna.");
    return;
  }

  const targetColumn = room.columns.find((col) => col.id === columnId);
  if (!targetColumn) return;
  if (!confirm(`Remover a coluna '${targetColumn.name}'? Os cartões irão para a primeira coluna.`)) return;

  const remaining = room.columns.filter((col) => col.id !== columnId);
  const destinationId = remaining[0].id;

  room.cards = (room.cards || []).map((card) =>
    card.columnId === columnId ? { ...card, columnId: destinationId } : card
  );
  room.columns = remaining;

  createBoard();
  loadRetroCards();
  saveBoardToRetro();
}

function clearBoard() {
  room.cards = [];
  createBoard();
  saveBoardToRetro();
}

function copyLink() {
  shareUrlInput.select();
  const btn = document.getElementById("copyLink");
  const originalText = btn.textContent;

  navigator.clipboard
    .writeText(shareUrlInput.value)
    .then(() => {
      btn.textContent = "Copiado! ✓";
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    })
    .catch(() => alert("Não foi possível copiar automaticamente. Copie manualmente o link no campo."));
}

function setupHeaderAndShare() {
  boardTitle.textContent = room.title;
  retroTitleHeading.textContent = room.title;
  teamContext.textContent = `Time: ${room.team.name}`;
  shareUrlInput.value = window.location.href;

  if (!isOwner && columnConfigSection) {
    columnConfigSection.style.display = "none";
  }
}

function setupEvents() {
  document.getElementById("copyLink").addEventListener("click", copyLink);
  document.getElementById("saveRetro").addEventListener("click", async () => {
    await saveBoardToRetro();
    alert("Retrospectiva salva.");
  });

  document.getElementById("addColumn").addEventListener("click", addColumn);
  document.getElementById("clearBoard").addEventListener("click", clearBoard);
  document.getElementById("finishRetro").addEventListener("click", async () => {
    await saveBoardToRetro();
    window.location.href = "index.html";
  });
  
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("retrofacil_token");
      localStorage.removeItem("retrofacil_user");
      window.location.href = "login.html";
    });
  }

  startVotingBtn.addEventListener("click", () => {
    votingMode = !votingMode;
    startVotingBtn.textContent = votingMode ? "Encerrar votação" : "Modo votação";
  });
}

async function init() {
  if (!retroId) return showMissingMessage();

  try {
    room = await api(`/retros/${retroId}`);
  } catch {
    return showMissingMessage();
  }

  isOwner = room.creatorSessionId === currentUser.id;

  setupHeaderAndShare();
  createBoard();
  loadRetroCards();
  setupEvents();
}

init();
