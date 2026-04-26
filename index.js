const token = localStorage.getItem("retrofacil_token");
const currentUser = JSON.parse(localStorage.getItem("retrofacil_user") || "{}");

if (!token) {
  window.location.href = "login.html";
} else if (currentUser.role === 'collaborator') {
  // Se for colaborador, ele não pode estar no Dashboard.
  // Redireciona para uma página de erro ou de volta para a última retro se existir
  alert("Você não tem permissão para acessar o painel administrativo.");
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
  activeTab: 'ongoing', // 'ongoing' | 'completed'
  wizard: {
    currentStep: 1,
    selectedTemplate: 'glad_sad_mad',
    columns: [
      { id: 'glad', name: '😀 Contente' },
      { id: 'sad', name: '😢 Triste' },
      { id: 'mad', name: '😠 Irritado' }
    ]
  }
};

const templates = {
  glad_sad_mad: [
    { id: 'glad', name: '😀 Contente' },
    { id: 'sad', name: '😢 Triste' },
    { id: 'mad', name: '😠 Irritado' }
  ],
  start_stop_continue: [
    { id: 'start', name: '▶️ Começar' },
    { id: 'stop', name: '⏹️ Parar' },
    { id: 'continue', name: '➡️ Continuar' }
  ]
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
  if (!state.teams || state.teams.length === 0) return null;
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

function renderTeamsList() {
  const teamsList = document.getElementById("teamsList");
  if (!teamsList) return;

  if (!state.teams || state.teams.length === 0) {
    teamsList.innerHTML = '<p class="text-muted">Nenhum time cadastrado.</p>';
    return;
  }

  teamsList.innerHTML = state.teams
    .map(
      (team) => `
      <div class="team-item" data-team-id="${team.id}">
        <div class="team-info">
          <div class="team-name">${team.name}</div>
          <div class="team-details">
            ${team.retros?.length || 0} retrospectiva(s)
          </div>
        </div>
        <div class="team-actions">
          <button class="btn-edit" title="Editar time" data-team-id="${team.id}">
            ✏️
          </button>
          <button class="btn-delete" title="Excluir time" data-team-id="${team.id}">
            🗑️
          </button>
        </div>
      </div>
    `
    )
    .join("");

  // Add event listeners to edit/delete buttons
  teamsList.querySelectorAll(".btn-edit").forEach((button) => {
    button.addEventListener("click", (e) => {
      const teamId = e.currentTarget.dataset.teamId;
      editTeam(teamId);
    });
  });

  teamsList.querySelectorAll(".btn-delete").forEach((button) => {
    button.addEventListener("click", (e) => {
      const teamId = e.currentTarget.dataset.teamId;
      deleteTeam(teamId);
    });
  });
}

function editTeam(teamId) {
  const team = state.teams.find((t) => t.id === teamId);
  if (!team) return;

  const newName = prompt("Editar nome do time:", team.name);
  if (newName === null || newName.trim() === "") return;

  const trimmedName = newName.trim();
  if (trimmedName === team.name) return; // No change

  // Check if name already exists for another team
  const duplicate = state.teams.some(
    (t) => t.id !== teamId && t.name.toLowerCase() === trimmedName.toLowerCase()
  );
  if (duplicate) {
    alert("Já existe um time com este nome.");
    return;
  }

  api(`/teams/${teamId}`, {
    method: "PUT",
    body: JSON.stringify({ name: trimmedName }),
  })
    .then(() => {
      alert("Time atualizado com sucesso!");
      refreshTeams(teamId);
    })
    .catch((error) => alert(error.message));
}

function deleteTeam(teamId) {
  const team = state.teams.find((t) => t.id === teamId);
  if (!team) return;

  // Don't allow deleting the currently selected team
  if (team.id === state.currentTeamId) {
    alert(
      "Você não pode excluir o time atualmente selecionado. Selecione outro time primeiro."
    );
    return;
  }

  if ((team.retros || []).length > 0) {
    const confirmDelete = confirm(
      `O time '${team.name}' possui retrospectivas. Todas serão excluídas. Deseja continuar?`
    );
    if (!confirmDelete) return;
  } else if (
    !confirm(`Deseja realmente excluir o time '${team.name}'?`)
  ) {
    return;
  }

  api(`/teams/${teamId}`, { method: "DELETE" })
    .then(() => {
      alert("Time excluído com sucesso!");
      refreshTeams();
    })
    .catch((error) => alert(error.message));
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
  renderTeamsList(); // Atualiza a lista de times no modal
}

async function createTeam() {
  const name = teamNameInput.value.trim();
  if (!name) {
    document.getElementById('teamCreateHint').textContent = 'Por favor, digite um nome para o time.';
    document.getElementById('teamCreateHint').style.color = 'var(--danger)';
    return;
  }

  // Verifica se já existe um time com o mesmo nome (case insensitive)
  const existingTeam = state.teams.find(team => 
    team.name.toLowerCase() === name.toLowerCase()
  );

  if (existingTeam) {
    document.getElementById('teamCreateHint').textContent = `Já existe um time com o nome '${name}'. Por favor, escolha outro nome.`;
    document.getElementById('teamCreateHint').style.color = 'var(--danger)';
    return;
  }

  try {
    const created = await api("/teams", { method: "POST", body: JSON.stringify({ name }) });
    teamNameInput.value = "";
    document.getElementById('teamCreateHint').textContent = `Time '${created.name}' criado com sucesso!`;
    document.getElementById('teamCreateHint').style.color = 'var(--success)';
    closeModal(modalManageTeams);
    await refreshTeams(created.id);
  } catch (error) {
    document.getElementById('teamCreateHint').textContent = error.message;
    document.getElementById('teamCreateHint').style.color = 'var(--danger)';
  }
}

// Removed - now handled by deleteTeam function in renderTeamsList

async function createRetroAndOpen() {
  const teamId = document.getElementById("wizardTeamSelect").value;
  const title = retroTitleInput.value.trim() || "Retrospectiva";
  
  if (!teamId) {
    alert("Por favor, selecione um time.");
    return;
  }

  try {
    const created = await api("/retros", {
      method: "POST",
      body: JSON.stringify({ 
        teamId, 
        title, 
        columns: state.wizard.columns.map(c => ({ name: c.name })),
        creatorSessionId: getSessionId() 
      }),
    });
    window.location.href = `retro.html?retro=${encodeURIComponent(created.id)}`;
  } catch(e) {
    alert(e.message);
  }
}

function updateWizardStep(step) {
  state.wizard.currentStep = step;
  
  // Update Indicators
  document.querySelectorAll('.wizard-step').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.toggle('active', s === step);
    el.classList.toggle('completed', s < step);
  });

  // Update Content
  document.querySelectorAll('.wizard-content').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.step) === step);
  });

  // Update Footer Buttons
  const prevBtn = document.getElementById("wizardPrevBtn");
  const nextBtn = document.getElementById("wizardNextBtn");
  const finishBtn = document.getElementById("finishWizardBtn");

  prevBtn.style.visibility = step === 1 ? "hidden" : "visible";
  
  if (step === 3) {
    nextBtn.classList.add('hidden');
    finishBtn.classList.remove('hidden');
    
    // Set invite link
    const baseUrl = window.location.origin + window.location.pathname.replace('index.html', '');
    document.getElementById("retroLinkDisplay").value = `${baseUrl}retro.html?retro=TEMP_ID`;
  } else {
    nextBtn.classList.remove('hidden');
    finishBtn.classList.add('hidden');
  }

  if (window.lucide) lucide.createIcons();
}

function renderWizardColumns() {
  const list = document.getElementById("wizardColumnsList");
  list.innerHTML = "";
  
  state.wizard.columns.forEach((col, index) => {
    const div = document.createElement("div");
    div.className = "wizard-column-item";
    div.innerHTML = `
      <div class="col-dot" style="background: var(--primary);"></div>
      <input type="text" value="${col.name}" data-index="${index}" placeholder="Nome da coluna" />
      <button class="ghost small btn-remove-col" data-index="${index}"><i data-lucide="trash-2"></i></button>
    `;
    list.appendChild(div);
  });

  list.querySelectorAll("input").forEach(input => {
    input.addEventListener("input", (e) => {
      const idx = e.target.dataset.index;
      state.wizard.columns[idx].name = e.target.value;
      renderPreview();
    });
  });

  list.querySelectorAll(".btn-remove-col").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = e.currentTarget.dataset.index;
      state.wizard.columns.splice(idx, 1);
      renderWizardColumns();
      renderPreview();
    });
  });

  if (window.lucide) lucide.createIcons();
}

function renderPreview() {
  const board = document.getElementById("previewBoard");
  board.innerHTML = "";
  
  state.wizard.columns.forEach(col => {
    const div = document.createElement("div");
    div.className = "preview-column";
    div.innerHTML = `
      <div class="preview-column-title">${col.name}</div>
      <div class="preview-card"></div>
      <div class="preview-card short"></div>
    `;
    board.appendChild(div);
  });
}

function initWizard() {
  updateWizardStep(1);
  
  // Fill teams in wizard
  const wizardTeamSelect = document.getElementById("wizardTeamSelect");
  wizardTeamSelect.innerHTML = state.teams.map(t => `<option value="${t.id}">${t.name}</option>`).join("");
  
  // Set default template
  applyTemplate('glad_sad_mad');
  renderPreview();
}

function applyTemplate(name) {
  state.wizard.selectedTemplate = name;
  state.wizard.columns = JSON.parse(JSON.stringify(templates[name] || []));
  
  document.querySelectorAll('.preset-option').forEach(el => {
    el.classList.toggle('active', el.dataset.template === name);
  });

  renderWizardColumns();
  renderPreview();
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
        <i data-lucide="files" style="width: 14px; height: 14px;"></i>
        <span>${retro.cardCount || 0} cartões</span>
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
  
  if (window.lucide) lucide.createIcons();
}

async function renderReports() {
  const team = getCurrentTeam();
  if (!team) {
    reportSummary.textContent = "Crie um time para ver relatórios.";
    topSituations.innerHTML = "<li>Nenhum time selecionado.</li>";
    wordCloud.textContent = "-";
    monthList.innerHTML = "<li>-</li>";
    return;
  }

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
  document.getElementById("btnNovaRetro").addEventListener("click", () => {
    openModal(modalNewRetro);
    initWizard();
  });
  document.getElementById("cancelWizardBtn").addEventListener("click", () => closeModal(modalNewRetro));
  document.getElementById("btnManageTeams").addEventListener("click", () => openModal(modalManageTeams));
  document.getElementById("closeTeamsModalBtn").addEventListener("click", () => closeModal(modalManageTeams));

  // Wizard Navigation
  document.getElementById("wizardNextBtn").addEventListener("click", () => {
    if (state.wizard.currentStep < 3) updateWizardStep(state.wizard.currentStep + 1);
  });
  document.getElementById("wizardPrevBtn").addEventListener("click", () => {
    if (state.wizard.currentStep > 1) updateWizardStep(state.wizard.currentStep - 1);
  });
  document.getElementById("finishWizardBtn").addEventListener("click", createRetroAndOpen);

  document.getElementById("templateSelect").addEventListener("change", (e) => {
    if (e.target.value !== 'custom') {
      applyTemplate(e.target.value);
    }
  });

  document.querySelectorAll('.preset-option').forEach(opt => {
    opt.addEventListener('click', () => applyTemplate(opt.dataset.template));
  });

  document.getElementById("addWizardColumnBtn").addEventListener("click", () => {
    state.wizard.columns.push({ name: "Nova Coluna" });
    renderWizardColumns();
    renderPreview();
  });

  document.getElementById("copyRetroLinkBtn").addEventListener("click", () => {
    const input = document.getElementById("retroLinkDisplay");
    input.select();
    document.execCommand("copy");
    alert("Link copiado!");
  });

  // Actions
  document.getElementById("createTeamBtn").addEventListener("click", createTeam);
  // Removed - delete functionality now handled per-team in the teams list
  
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

// Inicializa ícones se o Lucide estiver disponível
if (window.lucide) lucide.createIcons();
