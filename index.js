const token = localStorage.getItem("retrofacil_token");
if (!token) {
  window.location.href = "login.html";
}

const SESSION_KEY = "retrofacil_session_id";

// DOM Elements
const teamSelect = document.getElementById("teamSelect");
const retroGrid = document.getElementById("retroGrid");
const reportSummary = document.getElementById("reportSummary");
const topSituations = document.getElementById("topSituations");
const wordCloud = document.getElementById("wordCloud");
const monthList = document.getElementById("monthList");

// Navigation
const navDashboard = document.getElementById("navDashboard");
const navReports = document.getElementById("navReports");
const viewDashboard = document.getElementById("viewDashboard");
const viewReports = document.getElementById("viewReports");

// Modals
const modalNewRetro = document.getElementById("modalNewRetro");
const modalManageTeams = document.getElementById("modalManageTeams");
const retroTitleInput = document.getElementById("retroTitle");
const teamNameInput = document.getElementById("teamName");

const state = {
  teams: [],
  currentTeamId: null,
  activeTab: 'ongoing' // 'ongoing' | 'completed'
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
  const currentToken = localStorage.getItem("retrofacil_token");
  const response = await fetch(`/api${path}`, {
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${currentToken}`,
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
    closeModal(modalManageTeams);
    await refreshTeams(created.id);
  } catch (error) {
    alert(error.message);
  }
}

async function deleteCurrentTeam() {
  const team = getCurrentTeam();
  if (!team) return;

  if ((team.retros || []).length > 0) {
    const confirmDelete = confirm(
      `O time '${team.name}' possui retrospectivas. Todas serão excluídas. Deseja continuar?`
    );
    if (!confirmDelete) return;
  } else if (!confirm(`Deseja realmente excluir o time '${team.name}'?`)) {
    return;
  }

  await api(`/teams/${team.id}`, { method: "DELETE" });
  closeModal(modalManageTeams);
  await refreshTeams();
}

async function createRetroAndOpen() {
  const team = getCurrentTeam();
  const title = retroTitleInput.value.trim() || "Retrospectiva";
  try {
    const created = await api("/retros", {
      method: "POST",
      body: JSON.stringify({ teamId: team.id, title, creatorSessionId: getSessionId() }),
    });
    window.location.href = `retro.html?retro=${encodeURIComponent(created.id)}`;
  } catch(e) {
    alert(e.message);
  }
}

async function updateRetroStatus(retroId, newStatus) {
  const team = getCurrentTeam();
  try {
    await api(`/retros/${retroId}/status`, { 
      method: "PUT",
      body: JSON.stringify({ status: newStatus })
    });
    await refreshTeams(team.id);
  } catch(e) {
    alert("Erro ao alterar status: " + e.message);
  }
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
  if (!team) return;

  const allRetros = team.retros || [];
  
  // Retro compatibility: Se não tiver status, assume 'ongoing'
  const filteredRetros = allRetros.filter(r => (r.status || 'ongoing') === state.activeTab)
                                  .sort((a, b) => b.date.localeCompare(a.date));

  retroGrid.innerHTML = "";

  if (!filteredRetros.length) {
    retroGrid.innerHTML = `<p class="text-muted" style="grid-column: 1/-1;">Nenhuma retrospectiva ${state.activeTab === 'ongoing' ? 'em andamento' : 'finalizada'} encontrada.</p>`;
    return;
  }

  filteredRetros.forEach((retro) => {
    const card = document.createElement('div');
    card.className = 'retro-card';
    
    const isOngoing = (retro.status || 'ongoing') === 'ongoing';
    const badgeHtml = isOngoing 
      ? `<span class="badge ongoing">Em Andamento</span>` 
      : `<span class="badge completed">Finalizada</span>`;

    card.innerHTML = `
      <div class="retro-card-header">
        <div>
          <h3 class="retro-card-title">${retro.title}</h3>
          <span class="retro-card-date">Criada em ${retro.date.slice(0, 10)}</span>
        </div>
        ${badgeHtml}
      </div>
      <div class="retro-card-body">
        <span>📄 ${retro.cardCount || 0} cartões</span>
      </div>
      <div class="retro-card-actions"></div>
    `;

    const actionsDiv = card.querySelector('.retro-card-actions');

    const openBtn = document.createElement("a");
    openBtn.className = "link-btn ghost primary";
    openBtn.href = `retro.html?retro=${encodeURIComponent(retro.id)}`;
    openBtn.textContent = isOngoing ? "Acessar" : "Visualizar";
    actionsDiv.appendChild(openBtn);

    if (isOngoing) {
      const finishBtn = document.createElement("button");
      finishBtn.className = "ghost success";
      finishBtn.style.color = "var(--success)";
      finishBtn.textContent = "Finalizar";
      finishBtn.onclick = () => updateRetroStatus(retro.id, 'completed');
      actionsDiv.appendChild(finishBtn);
    } else {
      const reopenBtn = document.createElement("button");
      reopenBtn.className = "ghost";
      reopenBtn.textContent = "Reabrir";
      reopenBtn.onclick = () => updateRetroStatus(retro.id, 'ongoing');
      actionsDiv.appendChild(reopenBtn);
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "ghost danger";
    deleteBtn.textContent = "Excluir";
    deleteBtn.onclick = () => deleteRetro(retro.id);
    actionsDiv.appendChild(deleteBtn);

    retroGrid.appendChild(card);
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

function openModal(modal) {
  modal.classList.remove('hidden');
}

function closeModal(modal) {
  modal.classList.add('hidden');
}

function setupEvents() {
  // Modals
  document.getElementById("btnNovaRetro").addEventListener("click", () => openModal(modalNewRetro));
  document.getElementById("cancelRetroBtn").addEventListener("click", () => closeModal(modalNewRetro));
  document.getElementById("btnManageTeams").addEventListener("click", () => openModal(modalManageTeams));
  document.getElementById("closeTeamsModalBtn").addEventListener("click", () => closeModal(modalManageTeams));

  // Actions
  document.getElementById("createTeamBtn").addEventListener("click", createTeam);
  document.getElementById("deleteCurrentTeamBtn").addEventListener("click", deleteCurrentTeam);
  document.getElementById("createRetroBtn").addEventListener("click", createRetroAndOpen);
  
  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      state.activeTab = e.target.dataset.tab;
      renderRetroList();
    });
  });

  // Nav Views
  navDashboard.addEventListener("click", () => {
    navDashboard.classList.add("active");
    navReports.classList.remove("active");
    viewDashboard.classList.remove("hidden");
    viewReports.classList.add("hidden");
  });

  navReports.addEventListener("click", () => {
    navReports.classList.add("active");
    navDashboard.classList.remove("active");
    viewReports.classList.remove("hidden");
    viewDashboard.classList.add("hidden");
  });

  // Logout
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("retrofacil_token");
      localStorage.removeItem("retrofacil_user");
      window.location.href = "login.html";
    });
  }

  teamSelect.addEventListener("change", async (event) => {
    state.currentTeamId = event.target.value;
    renderRetroList();
    await renderReports();
  });
}

setupEvents();
refreshTeams();
