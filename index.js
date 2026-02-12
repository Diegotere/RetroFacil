const STORAGE_KEY = "retrofacil_data_v3";

const teamNameInput = document.getElementById("teamName");
const teamSelect = document.getElementById("teamSelect");
const retroTitleInput = document.getElementById("retroTitle");
const retroList = document.getElementById("retroList");
const reportSummary = document.getElementById("reportSummary");
const topSituations = document.getElementById("topSituations");
const wordCloud = document.getElementById("wordCloud");
const monthList = document.getElementById("monthList");

let state = loadState();

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const team = { id: createId(), name: "Time Padrão", retros: [] };
    return { teams: [team], currentTeamId: team.id };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.teams) || !parsed.teams.length) throw new Error("invalid");
    return parsed;
  } catch {
    const team = { id: createId(), name: "Time Padrão", retros: [] };
    return { teams: [team], currentTeamId: team.id };
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getCurrentTeam() {
  return state.teams.find((team) => team.id === state.currentTeamId) || state.teams[0];
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

function createTeam() {
  const name = teamNameInput.value.trim();
  if (!name) return;

  if (state.teams.some((team) => team.name.toLowerCase() === name.toLowerCase())) {
    alert("Já existe um time com este nome.");
    return;
  }

  const team = { id: createId(), name, retros: [] };
  state.teams.push(team);
  state.currentTeamId = team.id;
  teamNameInput.value = "";
  persist();
  renderTeamSelect();
  renderRetroList();
  renderReports();
}

function createRetroAndOpen() {
  const team = getCurrentTeam();
  const title = retroTitleInput.value.trim() || "Retrospectiva";
  const retro = {
    id: createId(),
    title,
    date: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cards: [],
  };

  team.retros.push(retro);
  persist();
  renderRetroList();
  renderReports();

  window.location.href = `retro.html?team=${encodeURIComponent(team.id)}&retro=${encodeURIComponent(retro.id)}`;
}

function renderRetroList() {
  const team = getCurrentTeam();
  const retros = [...(team.retros || [])].sort((a, b) => b.date.localeCompare(a.date));
  retroList.innerHTML = "";

  if (!retros.length) {
    retroList.innerHTML = "<li>Nenhuma retrospectiva criada para este time.</li>";
    return;
  }

  retros.forEach((retro) => {
    const li = document.createElement("li");
    const openLink = document.createElement("a");
    openLink.className = "link-btn ghost";
    openLink.href = `retro.html?team=${encodeURIComponent(team.id)}&retro=${encodeURIComponent(retro.id)}`;
    openLink.textContent = "Abrir sala";

    const text = document.createElement("span");
    text.textContent = `${retro.title} — ${retro.date.slice(0, 10)} (${retro.cards.length} cartões)`;

    li.appendChild(text);
    li.appendChild(openLink);
    retroList.appendChild(li);
  });
}

function renderReports() {
  const team = getCurrentTeam();
  const retros = team.retros || [];

  reportSummary.textContent = `${team.name}: ${retros.length} retrospectiva(s) salvas.`;

  const groupedByText = new Map();
  const wordFreq = new Map();
  const monthFreq = new Map();

  retros.forEach((retro) => {
    monthFreq.set(retro.date.slice(0, 7), (monthFreq.get(retro.date.slice(0, 7)) || 0) + 1);

    (retro.cards || []).forEach((card) => {
      const key = (card.text || "").trim().toLowerCase();
      if (!key) return;
      const item = groupedByText.get(key) || { text: card.text, votes: 0, count: 0 };
      item.votes += Number(card.votes || 0);
      item.count += 1;
      groupedByText.set(key, item);

      key
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((word) => word.length > 2)
        .forEach((word) => wordFreq.set(word, (wordFreq.get(word) || 0) + 1));
    });
  });

  const top = [...groupedByText.values()].sort((a, b) => b.votes - a.votes || b.count - a.count).slice(0, 8);
  topSituations.innerHTML = top.length
    ? top.map((item) => `<li>${item.text} — ${item.votes} voto(s)</li>`).join("")
    : "<li>Nenhuma situação registrada ainda.</li>";

  const words = [...wordFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
  wordCloud.innerHTML = "";
  if (!words.length) {
    wordCloud.textContent = "A nuvem aparecerá após colaboradores adicionarem cartões nas retros.";
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

  const monthItems = [...monthFreq.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  monthList.innerHTML = monthItems.length
    ? monthItems.map(([month, count]) => `<li>${month} — ${count} retrospectiva(s)</li>`).join("")
    : "<li>Sem retrospectivas salvas.</li>";
}

function setupEvents() {
  document.getElementById("createTeam").addEventListener("click", createTeam);
  document.getElementById("createRetro").addEventListener("click", createRetroAndOpen);

  teamSelect.addEventListener("change", (event) => {
    state.currentTeamId = event.target.value;
    persist();
    renderRetroList();
    renderReports();
  });
}

renderTeamSelect();
renderRetroList();
renderReports();
setupEvents();
