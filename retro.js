const STORAGE_KEY = "retrofacil_data_v3";
const defaultColumns = [
  "😀 Funcionou bem",
  "😕 Pode melhorar",
  "💡 Ideias",
  "🚀 Ações",
];

const columnsContainer = document.getElementById("columns");
const participantInput = document.getElementById("participant");
const boardTitle = document.getElementById("boardTitle");
const retroTitleHeading = document.getElementById("retroTitleHeading");
const teamContext = document.getElementById("teamContext");
const shareUrlInput = document.getElementById("shareUrl");
const startVotingBtn = document.getElementById("startVoting");

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
  defaultColumns.forEach((name) => {
    const template = document.getElementById("columnTemplate");
    const column = template.content.firstElementChild.cloneNode(true);
    column.dataset.column = name;
    column.querySelector("h3").textContent = name;
    column.querySelector(".add-card").addEventListener("click", () => {
      const text = prompt("Digite o cartão:");
      if (!text || !text.trim()) return;
      addCard(column.querySelector(".card-list"), {
        id: createId(),
        text: text.trim(),
        author: getParticipantName(),
        votes: 0,
        column: name,
      });
      saveBoardToRetro();
    });
    columnsContainer.appendChild(column);
  });
}

function addCard(targetList, card) {
  const template = document.getElementById("cardTemplate");
  const item = template.content.firstElementChild.cloneNode(true);
  item.dataset.cardId = card.id;
  item.dataset.column = card.column;
  item.querySelector(".card-text").textContent = card.text;
  item.querySelector(".meta").textContent = `por ${card.author}`;

  const voteBtn = item.querySelector(".vote-btn");
  const voteCount = voteBtn.querySelector("span");
  voteCount.textContent = String(card.votes || 0);

  voteBtn.addEventListener("click", () => {
    if (!votingMode) return;
    const hasVoted = voteBtn.classList.toggle("active");
    const next = Number(voteCount.textContent) + (hasVoted ? 1 : -1);
    voteCount.textContent = String(Math.max(next, 0));
    saveBoardToRetro();
  });

  targetList.appendChild(item);
}

function collectCards() {
  const cards = [];
  document.querySelectorAll(".card-item").forEach((item) => {
    cards.push({
      id: item.dataset.cardId || createId(),
      text: item.querySelector(".card-text").textContent,
      author: item.querySelector(".meta").textContent.replace(/^por\s+/, "") || "Anônimo",
      votes: Number(item.querySelector(".vote-btn span").textContent || 0),
      column: item.dataset.column || "Sem coluna",
    });
  });
  return cards;
}

function saveBoardToRetro() {
  if (!room) return;
  room.retro.cards = collectCards();
  room.retro.updatedAt = new Date().toISOString();
  persist();
}

function loadRetroCards() {
  const cards = room.retro.cards || [];
  const listsByColumn = {};
  document.querySelectorAll(".column").forEach((col) => {
    listsByColumn[col.dataset.column] = col.querySelector(".card-list");
  });

  cards.forEach((card) => {
    const target = listsByColumn[card.column] || document.querySelector(".card-list");
    addCard(target, card);
  });
}

function getParticipantName() {
  return participantInput.value.trim() || "Anônimo";
}

function clearBoard() {
  createBoard();
  saveBoardToRetro();
}

function copyLink() {
  shareUrlInput.select();
  navigator.clipboard.writeText(shareUrlInput.value).then(() => {
    alert("Link copiado para a área de transferência.");
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
  setupHeaderAndShare();
  createBoard();
  loadRetroCards();
  setupEvents();
}
