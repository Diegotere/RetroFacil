// === Autenticação ===
// Colaboradores acessam SEM login. Apenas verifica o papel após carregar a retro.
const token = localStorage.getItem("retrofacil_token");
const currentUserStr = localStorage.getItem("retrofacil_user");
let currentUser = null;
try {
  currentUser = JSON.parse(currentUserStr);
} catch(e){}

const SESSION_KEY = "retrofacil_session_id";
const defaultColumns = [
  { id: "col-good", name: "😀 Funcionou bem" },
  { id: "col-bad", name: "😕 Pode melhorar" },
  { id: "col-ideas", name: "💡 Ideias" },
  { id: "col-actions", name: "🚀 Ações" },
];

const params = new URLSearchParams(window.location.search);
const retroId = params.get("retro");

let state = {
  room: null,
  isAdmin: false,
  votingMode: false,
  phase: 'brainstorming',
  timerSeconds: 600,
  timerInterval: null,
  ws: null,
  participants: []
};

const columnColors = {
  0: '#10b981', // Green
  1: '#f43f5e', // Red
  2: '#4f46e5', // Indigo
  3: '#f59e0b', // Amber
  4: '#8b5cf6'  // Purple
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

// API com token opcional — colaboradores fazem chamadas sem token
async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`/api${path}`, { headers, ...options });

  // Se 401/403 e era admin, desloga. Se viewer, ignora.
  if ((response.status === 401 || response.status === 403) && token) {
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

// Aplica visibilidade baseada no papel:
// .admin-only → visível apenas para admins
// .viewer-only → visível apenas para colaboradores
function applyRoleVisibility() {
  document.querySelectorAll(".admin-only").forEach(el => {
    el.style.display = state.isAdmin ? "" : "none";
  });
}

function createBoard() {
  const container = document.getElementById("columnsContainer");
  container.innerHTML = "";
  const columns = state.room.columns || defaultColumns;

  columns.forEach((columnData, index) => {
    const template = document.getElementById("columnTemplate");
    const column = template.content.firstElementChild.cloneNode(true);
    column.dataset.columnId = columnData.id;

    const titleEl = column.querySelector(".column-title");
    titleEl.textContent = columnData.name;
    
    const dot = column.querySelector(".status-dot");
    dot.style.background = columnColors[index] || '#cbd5e1';

    column.querySelector(".add-card-btn").addEventListener("click", () => promptAddCard(columnData.id));
    column.querySelector(".btn-add-card-header").addEventListener("click", () => promptAddCard(columnData.id));

    container.appendChild(column);
  });

  if (window.lucide) lucide.createIcons();
}

function promptAddCard(columnId) {
  const text = prompt("Digite o cartão:");
  if (!text || !text.trim()) return;
  
  const userId = currentUser ? currentUser.id : null;
  const card = {
    id: createId(),
    text: text.trim(),
    votes: 0,
    columnId: columnId,
    userId,
    hidden: state.phase === 'brainstorming'
  };

  if (!state.room.cards) state.room.cards = [];
  state.room.cards.push(card);
  
  saveBoardToRetro();
  renderCards();
}

function renderCards() {
  const columns = document.querySelectorAll(".retro-column");
  columns.forEach(col => {
    const list = col.querySelector(".cards-list");
    list.innerHTML = "";
    const colId = col.dataset.columnId;
    const colCards = (state.room.cards || []).filter(c => c.columnId === colId);
    
    col.querySelector(".count").textContent = colCards.length;

    const columnData = state.room.columns.find(c => c.id === colId);
    if (colCards.length === 0 && columnData && (columnData.name.toLowerCase().includes('ação') || columnData.name.toLowerCase().includes('action'))) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = `
        <i data-lucide="list-checks"></i>
        <p>Nenhum item de ação ainda.</p>
        <span class="text-muted" style="font-size: 0.75rem;">Converta cartões em ações ou adicione-os diretamente aqui</span>
      `;
      list.appendChild(empty);
    }

    colCards.forEach(card => {
      const template = document.getElementById("cardTemplate");
      const item = template.content.firstElementChild.cloneNode(true);
      item.dataset.cardId = card.id;
      
      const textEl = item.querySelector(".card-text");
      textEl.textContent = card.text;
      
      if (card.hidden && !state.isAdmin) {
        item.classList.add('hidden-content');
        textEl.textContent = "Oculto durante escrita";
      }

      const voteBtn = item.querySelector(".vote-btn");
      const voteCount = voteBtn.querySelector(".vote-count");
      voteCount.textContent = card.votes || 0;

      voteBtn.addEventListener("click", () => {
        if (state.phase === 'brainstorming') return;
        card.votes = (card.votes || 0) + 1;
        saveBoardToRetro();
        renderCards();
      });

      const hideBtn = item.querySelector(".btn-hide-card");
      if (state.isAdmin) {
        hideBtn.addEventListener("click", () => {
          card.hidden = !card.hidden;
          saveBoardToRetro();
          renderCards();
        });
      } else {
        hideBtn.style.display = "none";
      }

      const avatar = item.querySelector(".author-avatar");
      if (card.userId) {
        avatar.src = `https://ui-avatars.com/api/?name=${card.userId}&background=random`;
      } else {
        avatar.style.display = "none";
      }

      list.appendChild(item);
    });
  });

  if (window.lucide) lucide.createIcons();
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
      userId: item.dataset.userId || null,
    });
  });
  return cards;
}

async function saveBoardToRetro() {
  if (!state.room) return;
  await api(`/retros/${state.room.id}`, {
    method: "PUT",
    body: JSON.stringify({ columns: state.room.columns, cards: state.room.cards }),
  });
  
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({
      type: 'board_update',
      data: {
        columns: state.room.columns,
        cards: state.room.cards
      }
    }));
  }
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
    addCard(target, { ...card, columnId: card.columnId || fallbackColumnId });
  });

  Object.values(listsByColumn).forEach((list) => renumberColumn(list));
}

function addColumn() {
  if (!isAdmin) return;
  const name = newColumnNameInput.value.trim();
  if (!name) return;
  room.columns.push({ id: createId(), name });
  newColumnNameInput.value = "";
  createBoard();
  loadRetroCards();
  saveBoardToRetro();
}

function updateColumnName(columnId, newName) {
  if (!isAdmin) return;
  const column = room.columns.find((item) => item.id === columnId);
  if (!column) return;
  column.name = newName;
  saveBoardToRetro();
}

function removeColumn(columnId) {
  if (!isAdmin) return;
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
  if (!isAdmin) return;
  if (!confirm("Limpar todos os cartões do quadro?")) return;
  room.cards = [];
  createBoard();
  saveBoardToRetro();
}

function copyLink() {
  const shareUrlInput = document.getElementById("shareUrl");
  shareUrlInput.select();
  const btn = document.getElementById("copyLink");
  const originalText = btn.textContent;
  navigator.clipboard
    .writeText(shareUrlInput.value)
    .then(() => {
      btn.textContent = "Copiado! ✓";
      setTimeout(() => { btn.textContent = originalText; }, 2000);
    })
    .catch(() => alert("Não foi possível copiar automaticamente. Copie manualmente."));
}

function setupHeaderAndShare() {
  boardTitle.textContent = room.title;
  retroTitleHeading.textContent = room.title;
  teamContext.textContent = `Time: ${room.team.name}`;

  const shareUrlInput = document.getElementById("shareUrl");
  if (shareUrlInput) shareUrlInput.value = window.location.href;
}

function updatePhase(newPhase) {
  state.phase = newPhase;
  document.querySelectorAll('.phase-item').forEach(el => {
    el.classList.toggle('active', el.dataset.phase === newPhase);
  });

  if (state.isAdmin) {
    api(`/retros/${state.room.id}/phase`, {
      method: "PUT",
      body: JSON.stringify({ phase: newPhase })
    });
  }

  // Auto-reveal cards if moving to Discussion
  if (newPhase === 'discussion' && state.isAdmin) {
    state.room.cards.forEach(c => c.hidden = false);
    saveBoardToRetro();
  }

  renderCards();
}

function startTimer(isBroadcast = false) {
  if (state.timerInterval) clearInterval(state.timerInterval);
  
  document.getElementById("btnTimerPlay").classList.add('hidden');
  document.getElementById("btnTimerPause").classList.remove('hidden');
  document.getElementById("timerDisplay").readOnly = true;

  state.timerInterval = setInterval(() => {
    if (state.timerSeconds > 0) {
      state.timerSeconds--;
      renderTimer();
    } else {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
      document.getElementById("timerBox").classList.add('finished');
      playAlarm();
      pauseTimer(true); // Switch UI back to play state
    }
  }, 1000);

  if (!isBroadcast && state.isAdmin) {
    broadcastTimerEvent('start');
  }
}

function pauseTimer(isBroadcast = false) {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = null;

  document.getElementById("btnTimerPlay").classList.remove('hidden');
  document.getElementById("btnTimerPause").classList.add('hidden');
  document.getElementById("timerDisplay").readOnly = !state.isAdmin;

  if (!isBroadcast && state.isAdmin) {
    broadcastTimerEvent('pause');
  }
}

function stopTimer(isBroadcast = false) {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = null;
  
  state.timerSeconds = 0;
  renderTimer();
  document.getElementById("timerBox").classList.remove('finished');

  document.getElementById("btnTimerPlay").classList.remove('hidden');
  document.getElementById("btnTimerPause").classList.add('hidden');
  document.getElementById("timerDisplay").readOnly = !state.isAdmin;

  if (!isBroadcast && state.isAdmin) {
    broadcastTimerEvent('stop');
  }
}

function playAlarm() {
  const audio = new Audio('https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg');
  audio.play().catch(e => console.log("Erro ao tocar alarme (browser bloqueou auto-play):", e));
}

function broadcastTimerEvent(action) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({
      type: 'timer_control',
      payload: { action, seconds: state.timerSeconds }
    }));
  }
}

function renderTimer() {
  const min = Math.floor(state.timerSeconds / 60);
  const sec = state.timerSeconds % 60;
  const display = document.getElementById("timerDisplay");
  display.value = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function parseTimerInput(val) {
  const parts = val.split(':');
  if (parts.length === 2) {
    const min = parseInt(parts[0]) || 0;
    const sec = parseInt(parts[1]) || 0;
    return (min * 60) + sec;
  }
  return parseInt(val) || 0;
}

function exportToCSV() {
  const cards = state.room.cards || [];
  const headers = ["Coluna", "Texto", "Votos", "Autor"];
  const rows = cards.map(c => {
    const col = state.room.columns.find(col => col.id === c.columnId);
    return [
      `"${col ? col.name : ''}"`,
      `"${c.text.replace(/"/g, '""')}"`,
      c.votes || 0,
      `"${c.userId || 'Anônimo'}"`
    ];
  });

  const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `retro_${state.room.id}.csv`;
  link.click();
}

function setupEvents() {
  document.querySelectorAll('.phase-item').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.isAdmin) return;
      updatePhase(btn.dataset.phase);
    });
  });

  document.getElementById("btnExport").addEventListener("click", exportToCSV);
  document.getElementById("btnEndSession").addEventListener("click", () => {
    if (confirm("Encerrar sessão? Todos serão redirecionados.")) {
      window.location.href = "index.html";
    }
  });

  document.getElementById("btnInviteTeam").addEventListener("click", (e) => {
    e.preventDefault();
    navigator.clipboard.writeText(window.location.href);
    alert("Link da sala copiado!");
  });

  // Timer Controls
  if (state.isAdmin) {
    document.getElementById("btnTimerPlay").addEventListener("click", () => startTimer());
    document.getElementById("btnTimerPause").addEventListener("click", () => pauseTimer());
    document.getElementById("btnTimerStop").addEventListener("click", () => stopTimer());
    
    const display = document.getElementById("timerDisplay");
    display.addEventListener("change", (e) => {
      state.timerSeconds = parseTimerInput(e.target.value);
      document.getElementById("timerBox").classList.remove('finished');
      renderTimer();
      broadcastTimerEvent('update');
    });
  }
}

function setupWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}?retro=${retroId}`;
  
  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    if (currentUser) {
      state.ws.send(JSON.stringify({
        type: 'identify',
        payload: { user: currentUser }
      }));
    }
  };

  state.ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'retro_updated' || data.type === 'board_update') {
        const payload = data.type === 'retro_updated' ? data.payload : data.data;
        state.room.columns = payload.columns;
        state.room.cards = payload.cards;
        renderCards();
      } else if (data.type === 'phase_updated') {
        updatePhase(data.payload.phase);
      } else if (data.type === 'timer_updated') {
        state.timerSeconds = data.payload.seconds;
        renderTimer();
      } else if (data.type === 'timer_control') {
        const { action, seconds } = data.payload;
        state.timerSeconds = seconds;
        renderTimer();
        if (action === 'start') startTimer(true);
        if (action === 'pause') pauseTimer(true);
        if (action === 'stop') stopTimer(true);
      } else if (data.type === 'participants_update') {
        state.participants = data.payload.participants;
        renderParticipants();
      }
    } catch (error) {
      console.error('WebSocket Error:', error);
    }
  };

  state.ws.onclose = () => setTimeout(setupWebSocket, 3000);
}

async function init() {
  if (!retroId) return showMissingMessage();

  try {
    state.room = await api(`/retros/${retroId}`);
  } catch {
    return showMissingMessage();
  }

  if (!state.room) return showMissingMessage();

  state.isAdmin = !!(token && currentUser && state.room.creatorSessionId === currentUser.id);
  state.phase = state.room.phase || 'brainstorming';
  state.timerSeconds = state.room.timerSeconds || 600;

  document.getElementById("teamName").textContent = state.room.team.name;
  document.getElementById("retroTitle").textContent = state.room.title;

  const display = document.getElementById("timerDisplay");
  display.readOnly = !state.isAdmin;

  createBoard();
  renderCards();
  updatePhase(state.phase);
  renderTimer();
  setupEvents();
  setupWebSocket();
}

init();




function renderParticipants() {
  const list = document.getElementById("participantsList");
  const stack = document.getElementById("avatarStack");
  
  list.innerHTML = "";
  stack.innerHTML = "";
  
  state.participants.forEach((p, index) => {
    // Sidebar list
    const item = document.createElement("div");
    item.className = "footer-item"; // Reuse style
    item.style.marginBottom = "0.5rem";
    item.innerHTML = `<img src="${p.avatar}" style="width: 24px; height: 24px; border-radius: 50%;" /> ${p.name}`;
    list.appendChild(item);
    
    // Header stack
    if (index < 3) {
      const img = document.createElement("img");
      img.src = p.avatar;
      img.alt = p.name;
      stack.appendChild(img);
    }
  });
  
  if (state.participants.length > 3) {
    const more = document.createElement("div");
    more.className = "more";
    more.textContent = `+${state.participants.length - 3}`;
    stack.appendChild(more);
  }
}
