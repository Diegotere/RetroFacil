const SESSION_KEY = "retrofacil_session_id";

const teamNameInput = document.getElementById("teamName");
const teamSelect = document.getElementById("teamSelect");
const retroTitleInput = document.getElementById("retroTitle");
const retroList = document.getElementById("retroList");
const reportSummary = document.getElementById("reportSummary");
const topSituations = document.getElementById("topSituations");
const wordCloud = document.getElementById("wordCloud");
const monthList = document.getElementById("monthList");

const state = {
  teams: [],
  currentTeamId: null,
};

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
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Falha na requisição");
  }

  if (response.status === 204) return null;
  return response.json();
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

async function refreshTeams(preferTeamId) {
  const data = await api("/teams");
  state.teams = data.teams || [];
  if (!state.teams.length) return;

  if (preferTeamId && state.teams.some((t) => t.id === preferTeamId)) {
    state.currentTeamId = preferTeamId;
  } else if (!state.currentTeamId || !state.teams.some((t) => t.id === state.currentTeamId)) {
    state.currentTeamId = state.teams[0].id;
  }

  renderTeamSelect();
  renderRetroList();
  await renderReports();
}

async function createTeam() {
  const name = teamNameInput.value.trim();
  if (!name) return;

  try {
    const created = await api("/teams", { method: "POST", body: JSON.stringify({ name }) });
    teamNameInput.value = "";
    await refreshTeams(created.id);
  } catch (error) {
    alert(error.message);
  }
}

async function deleteSelectedTeam() {
  const team = getCurrentTeam();
  if (!team) return;

  if ((team.retros || []).length > 0) {
    const confirmDelete = confirm(
      `O time '${team.name}' possui retrospectivas cadastradas. Se você continuar, todas as retros deste time serão excluídas. Deseja continuar?`
    );
    if (!confirmDelete) return;
  } else if (!confirm(`Deseja realmente excluir o time '${team.name}'?`)) {
    return;
  }

  await api(`/teams/${team.id}`, { method: "DELETE" });
  await refreshTeams();
}

async function createRetroAndOpen() {
  const team = getCurrentTeam();
  const title = retroTitleInput.value.trim() || "Retrospectiva";
  const created = await api("/retros", {
    method: "POST",
    body: JSON.stringify({ teamId: team.id, title, creatorSessionId: getSessionId() }),
  });

  window.location.href = `retro.html?retro=${encodeURIComponent(created.id)}`;
}

async function deleteRetro(retroId) {
  const team = getCurrentTeam();
  const retro = (team.retros || []).find((item) => item.id === retroId);
  if (!retro) return;

  if (!confirm(`Deseja realmente excluir a retrospectiva '${retro.title}'? Não será possível recuperar.`)) return;

  await api(`/retros/${retroId}`, { method: "DELETE" });
  await refreshTeams(team.id);
}

function renderRetroList() {
  const team = getCurrentTeam();
  const retros = [...(team?.retros || [])].sort((a, b) => b.date.localeCompare(a.date));
  retroList.innerHTML = "";

  if (!retros.length) {
    retroList.innerHTML = "<li>Nenhuma retrospectiva criada para este time.</li>";
    return;
  }

  retros.forEach((retro) => {
    const li = document.createElement("li");

    const text = document.createElement("span");
    text.textContent = `${retro.title} — ${retro.date.slice(0, 10)} (${retro.cardCount || 0} cartões)`;

    const actions = document.createElement("div");
    actions.className = "retro-actions";

    const openLink = document.createElement("a");
    openLink.className = "link-btn ghost";
    openLink.href = `retro.html?retro=${encodeURIComponent(retro.id)}`;
    openLink.textContent = "Abrir sala";

    const deleteButton = document.createElement("button");
    deleteButton.className = "ghost danger";
    deleteButton.textContent = "Excluir retro";
    deleteButton.addEventListener("click", () => deleteRetro(retro.id));

    actions.append(openLink, deleteButton);
    li.append(text, actions);
    retroList.appendChild(li);
  });
}

async function renderReports() {
  const team = getCurrentTeam();
  if (!team) return;

  const report = await api(`/reports/${team.id}`);
  reportSummary.textContent = `${team.name}: ${report.retroCount} retrospectiva(s) salvas.`;

  topSituations.innerHTML = report.top.length
    ? report.top.map((item) => `<li>${item.text} — ${item.votes} voto(s)</li>`).join("")
    : "<li>Nenhuma situação registrada ainda.</li>";

  wordCloud.innerHTML = "";
  if (!report.words.length) {
    wordCloud.textContent = "A nuvem aparecerá após colaboradores adicionarem cartões nas retros.";
  } else {
    const max = report.words[0].count || 1;
    report.words.forEach(({ word, count }) => {
      const span = document.createElement("span");
      span.textContent = word;
      span.style.fontSize = `${12 + (count / max) * 24}px`;
      span.style.opacity = `${0.55 + count / max / 2}`;
      wordCloud.appendChild(span);
    });
  }

  monthList.innerHTML = report.months.length
    ? report.months.map((item) => `<li>${item.month} — ${item.count} retrospectiva(s)</li>`).join("")
    : "<li>Sem retrospectivas salvas.</li>";
}

function setupEvents() {
  document.getElementById("createTeam").addEventListener("click", createTeam);
  document.getElementById("deleteTeam").addEventListener("click", deleteSelectedTeam);
  document.getElementById("createRetro").addEventListener("click", createRetroAndOpen);

  teamSelect.addEventListener("change", async (event) => {
    state.currentTeamId = event.target.value;
    renderRetroList();
    await renderReports();
  });
}

setupEvents();
refreshTeams();
