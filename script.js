const STORAGE_KEY = "retrofacil_data_v2";

const board = document.getElementById("retroBoard");
const columnsContainer = document.getElementById("columns");
const participantInput = document.getElementById("participant");
const startVotingBtn = document.getElementById("startVoting");
const boardTitle = document.getElementById("boardTitle");
const retroTitleInput = document.getElementById("retroTitle");

const teamNameInput = document.getElementById("teamName");
const teamSelect = document.getElementById("teamSelect");
const reportSummary = document.getElementById("reportSummary");
const topSituations = document.getElementById("topSituations");
const wordCloud = document.getElementById("wordCloud");
const monthList = document.getElementById("monthList");

const defaultColumns = [
  "😀 Funcionou bem",
  "😕 Pode melhorar",
  "💡 Ideias",
  "🚀 Ações",
];

let votingMode = false;
let state = loadState();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const initialTeam = { id: createId(), name: "Time Padrão", retros: [] };
    return { teams: [initialTeam], currentTeamId: initialTeam.id };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.teams) || parsed.teams.length === 0) throw new Error();
    return parsed;
  } catch {
    const initialTeam = { id: createId(), name: "Time Padrão", retros: [] };
    return { teams: [initialTeam], currentTeamId: initialTeam.id };
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  });

  targetList.appendChild(item);
}

function collectCardsFromBoard() {
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

function renderTeamSelect() {
  teamSelect.innerHTML = "";
  state.teams.forEach((team) => {
    const option = document.createElement("option");
    option.value = team.id;
    option.textContent = team.name;
    if (team.id === state.currentTeamId) option.selected = true;
    teamSelect.appendChild(option);
  });
}

function getCurrentTeam() {
  return state.teams.find((team) => team.id === state.currentTeamId) || state.teams[0];
}

function renderReports() {
  const team = getCurrentTeam();
  const retros = team.retros || [];

  reportSummary.textContent = `${team.name}: ${retros.length} retrospectiva(s) salvas.`;

  const groupedByText = new Map();
  const wordFreq = new Map();
  const monthFreq = new Map();

  retros.forEach((retro) => {
    const monthKey = retro.date.slice(0, 7);
    monthFreq.set(monthKey, (monthFreq.get(monthKey) || 0) + 1);

    retro.cards.forEach((card) => {
      const key = card.text.trim().toLowerCase();
      if (!key) return;

      const entry = groupedByText.get(key) || { text: card.text, totalVotes: 0, count: 0 };
      entry.totalVotes += Number(card.votes || 0);
      entry.count += 1;
      groupedByText.set(key, entry);

      key
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((word) => word.length > 2)
        .forEach((word) => {
          wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
        });
    });
  });

  const top = [...groupedByText.values()]
    .sort((a, b) => b.totalVotes - a.totalVotes || b.count - a.count)
    .slice(0, 8);

  topSituations.innerHTML = "";
  if (!top.length) {
    topSituations.innerHTML = "<li>Nenhuma situação registrada ainda.</li>";
  } else {
    top.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = `${item.text} — ${item.totalVotes} voto(s)`;
      topSituations.appendChild(li);
    });
  }

  const words = [...wordFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
  wordCloud.innerHTML = "";
  if (!words.length) {
    wordCloud.textContent = "A nuvem aparecerá após salvar retrospectivas.";
  } else {
    const max = words[0][1] || 1;
    words.forEach(([word, count]) => {
      const span = document.createElement("span");
      span.textContent = word;
      span.style.fontSize = `${12 + (count / max) * 24}px`;
      span.style.opacity = `${0.55 + count / max / 2}`;
      wordCloud.appendChild(span);
    });
  }

  monthList.innerHTML = "";
  const monthItems = [...monthFreq.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  if (!monthItems.length) {
    monthList.innerHTML = "<li>Sem retrospectivas salvas.</li>";
  } else {
    monthItems.forEach(([month, count]) => {
      const li = document.createElement("li");
      li.textContent = `${month} — ${count} retrospectiva(s)`;
      monthList.appendChild(li);
    });
  }
}

function saveCurrentRetro() {
  const team = getCurrentTeam();
  const title = retroTitleInput.value.trim() || "Retrospectiva";
  const cards = collectCardsFromBoard();

  if (!cards.length) {
    alert("Adicione pelo menos um cartão antes de salvar.");
    return;
  }

  const retro = {
    id: createId(),
    title,
    date: new Date().toISOString(),
    cards,
  };

  team.retros.push(retro);
  persist();
  renderReports();
  alert(`Retrospectiva '${title}' salva no ${team.name}.`);
}

function loadLastRetro() {
  const team = getCurrentTeam();
  const last = team.retros.at(-1);

  if (!last) {
    alert("Este time ainda não possui retrospectivas salvas.");
    return;
  }

  clearBoard();
  retroTitleInput.value = last.title;
  boardTitle.textContent = last.title;

  const listsByColumn = {};
  document.querySelectorAll(".column").forEach((col) => {
    listsByColumn[col.dataset.column] = col.querySelector(".card-list");
  });

  last.cards.forEach((card) => {
    const target = listsByColumn[card.column] || document.querySelector(".card-list");
    addCard(target, card);
  });

  openBoard();
}

function getParticipantName() {
  const name = participantInput.value.trim();
  return name || "Anônimo";
}

function openBoard() {
  board.classList.remove("hidden");
  board.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearBoard() {
  createBoard();
  votingMode = false;
  startVotingBtn.textContent = "Modo votação";
}

function createTeam() {
  const name = teamNameInput.value.trim();
  if (!name) return;

  const alreadyExists = state.teams.some((team) => team.name.toLowerCase() === name.toLowerCase());
  if (alreadyExists) {
    alert("Já existe um time com este nome.");
    return;
  }

  const team = { id: createId(), name, retros: [] };
  state.teams.push(team);
  state.currentTeamId = team.id;
  teamNameInput.value = "";
  persist();
  renderTeamSelect();
  renderReports();
}

function loadDemoContent() {
  clearBoard();
  const lists = [...document.querySelectorAll(".card-list")];

  addCard(lists[0], { id: createId(), text: "Conseguimos finalizar as histórias críticas", author: "Bia", votes: 2, column: defaultColumns[0] });
  addCard(lists[1], { id: createId(), text: "Reuniões longas sem pauta", author: "Carlos", votes: 1, column: defaultColumns[1] });
  addCard(lists[2], { id: createId(), text: "Definir turno de suporte diário", author: "Aline", votes: 3, column: defaultColumns[2] });
  addCard(lists[3], { id: createId(), text: "Criar template de planning", author: "João", votes: 1, column: defaultColumns[3] });

  openBoard();
}

function setupEvents() {
  document.getElementById("openRoom").addEventListener("click", openBoard);
  document.getElementById("openRoomAlt").addEventListener("click", openBoard);
  document.getElementById("loadDemo").addEventListener("click", loadDemoContent);

  document.getElementById("clearBoard").addEventListener("click", clearBoard);
  document.getElementById("finishRetro").addEventListener("click", () => {
    alert("Retrospectiva encerrada! Você já pode salvar e acompanhar os relatórios do time.");
  });

  startVotingBtn.addEventListener("click", () => {
    votingMode = !votingMode;
    startVotingBtn.textContent = votingMode ? "Encerrar votação" : "Modo votação";
  });

  document.getElementById("createTeam").addEventListener("click", createTeam);
  document.getElementById("saveRetro").addEventListener("click", saveCurrentRetro);
  document.getElementById("loadLastRetro").addEventListener("click", loadLastRetro);

  teamSelect.addEventListener("change", (event) => {
    state.currentTeamId = event.target.value;
    persist();
    renderReports();
  });

  retroTitleInput.addEventListener("input", () => {
    boardTitle.textContent = retroTitleInput.value.trim() || "Retrospectiva";
  });
}

createBoard();
renderTeamSelect();
renderReports();
setupEvents();
