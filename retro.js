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

const columnsContainer = document.getElementById("columns");
const boardTitle = document.getElementById("boardTitle");
const retroTitleHeading = document.getElementById("retroTitleHeading");
const teamContext = document.getElementById("teamContext");
const viewerWelcome = document.getElementById("viewerWelcome");
const newColumnNameInput = document.getElementById("newColumnName");

const params = new URLSearchParams(window.location.search);
const retroId = params.get("retro");

let votingMode = false;
let room = null;
let isAdmin = false; // true apenas se for o criador da retro
let ws = null; // WebSocket connection

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
    el.style.display = isAdmin ? "" : "none";
  });

  // Botão de login e mensagem para colaboradores
  if (!isAdmin) {
    // Mostra o botão de login se o usuário NÃO estiver logado
    const viewerLoginBtn = document.getElementById("viewerLoginBtn");
    if (viewerLoginBtn) {
      if (!token) {
        viewerLoginBtn.style.display = "";
      } else {
        viewerLoginBtn.style.display = "none"; // logado mas não é admin, não mostra de novo
      }
    }

    // Mensagem de boas-vindas
    if (viewerWelcome) {
      viewerWelcome.style.display = "";
      const name = currentUser ? ` Olá, ${currentUser.name}!` : "";
      viewerWelcome.textContent = `${name} Você está colaborando em "${room.title}" do time ${room.team.name}.`;
    }
  }
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
    titleInput.readOnly = !isAdmin;

    if (isAdmin) {
      titleInput.addEventListener("change", () => {
        const next = titleInput.value.trim();
        titleInput.value = next || columnData.name;
        updateColumnName(columnData.id, titleInput.value);
      });
    }

    column.querySelector(".add-card").addEventListener("click", () => {
      const text = prompt("Digite o cartão:");
      if (!text || !text.trim()) return;
      const list = column.querySelector(".card-list");
      const userId = currentUser ? currentUser.id : null;
      addCard(list, {
        id: createId(),
        text: text.trim(),
        votes: 0,
        columnId: columnData.id,
        userId,
      });
      renumberColumn(list);
      saveBoardToRetro();
    });

    const removeColumnBtn = column.querySelector(".remove-column");
    if (removeColumnBtn) {
      if (isAdmin) {
        removeColumnBtn.addEventListener("click", () => removeColumn(columnData.id));
      }
    }

    columnsContainer.appendChild(column);
  });

  // Após renderizar as colunas, aplica visibilidade dos botões .admin-only dentro delas
  applyRoleVisibility();
}

function addCard(targetList, card) {
  const template = document.getElementById("cardTemplate");
  const item = template.content.firstElementChild.cloneNode(true);
  item.dataset.cardId = card.id;
  item.dataset.columnId = card.columnId;
  item.dataset.userId = card.userId || "";
  item.querySelector(".card-text").textContent = card.text;

  const removeBtn = item.querySelector(".remove-card");
  // Pode remover: admin pode tudo; colaborador só pode remover seus próprios cartões
  const canRemove = isAdmin || (currentUser && item.dataset.userId === currentUser.id);
  if (!canRemove) {
    removeBtn.style.display = "none";
  } else {
    removeBtn.addEventListener("click", () => {
      item.remove();
      renumberColumn(targetList);
      saveBoardToRetro();
    });
  }

  const voteBtn = item.querySelector(".vote-btn");
  const voteCount = voteBtn.querySelector("span");
  voteCount.textContent = String(card.votes || 0);

  voteBtn.addEventListener("click", () => {
    // Admin precisa do modo votação; colaboradores podem votar livremente
    if (isAdmin && !votingMode) return;
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
      userId: item.dataset.userId || null,
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
  
  // Broadcast the update to all connected clients
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'board_update',
      data: {
        columns: room.columns,
        cards: room.cards
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

function setupEvents() {
  // Apenas configura eventos de elementos que existem e são visíveis para admin
  const copyLinkBtn = document.getElementById("copyLink");
  if (copyLinkBtn) copyLinkBtn.addEventListener("click", copyLink);

  const saveRetroBtn = document.getElementById("saveRetro");
  if (saveRetroBtn) {
    saveRetroBtn.addEventListener("click", async () => {
      await saveBoardToRetro();
      alert("Retrospectiva salva.");
    });
  }

  const addColumnBtn = document.getElementById("addColumn");
  if (addColumnBtn) addColumnBtn.addEventListener("click", addColumn);

  const clearBoardBtn = document.getElementById("clearBoard");
  if (clearBoardBtn) clearBoardBtn.addEventListener("click", clearBoard);

  const finishRetroBtn = document.getElementById("finishRetro");
  if (finishRetroBtn) {
    finishRetroBtn.addEventListener("click", async () => {
      await saveBoardToRetro();
      window.location.href = "index.html";
    });
  }

  const viewerLoginBtn = document.getElementById("viewerLoginBtn");
  if (viewerLoginBtn) {
    viewerLoginBtn.addEventListener("click", () => {
      // Redireciona para login passando o ID da retro para retornar após autenticar
      window.location.href = `login.html?retro=${retroId}`;
    });
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("retrofacil_token");
      localStorage.removeItem("retrofacil_user");
      window.location.href = "login.html";
    });
  }

  const startVotingBtn = document.getElementById("startVoting");
  if (startVotingBtn) {
    startVotingBtn.addEventListener("click", () => {
      votingMode = !votingMode;
      startVotingBtn.textContent = votingMode ? "Encerrar votação" : "Modo votação";
    });
  }
}

function setupWebSocket() {
  // Connect to WebSocket server
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}?retro=${retroId}`;
  console.log('Connecting to WebSocket:', wsUrl);
  
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket connected for retro:', retroId);
    // Send a ping to test the connection
    ws.send(JSON.stringify({ type: 'ping' }));
  };

   ws.onmessage = (event) => {
     console.log('WebSocket message received:', event.data);
     try {
       const data = JSON.parse(event.data);
       if (data.type === 'retro_updated') {
         console.log('Updating board with data from WebSocket');
         // Update the board with the received data
         room = {
           ...room,
           id: data.payload.id,
           title: data.payload.title,
           creatorSessionId: data.payload.creatorSessionId,
           date: data.payload.date,
           updatedAt: data.payload.updatedAt,
           team: data.payload.team,
           columns: data.payload.columns,
           cards: data.payload.cards
         };
         
         // Recreate the board and reload cards
         createBoard();
         loadRetroCards();
         console.log('Board updated successfully');
       } else if (data.type === 'pong') {
         console.log('WebSocket ping/pong successful');
       }
     } catch (error) {
       console.error('Error processing WebSocket message:', error);
     }
   };

  ws.onclose = (event) => {
    console.log('WebSocket disconnected for retro:', retroId, 'code:', event.code, 'reason:', event.reason);
    // Attempt to reconnect after a short delay
    setTimeout(setupWebSocket, 3000);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

async function init() {
  if (!retroId) return showMissingMessage();

  try {
    // Busca a retro — a rota é pública para leitura (colaboradores sem token)
    room = await api(`/retros/${retroId}`);
  } catch {
    return showMissingMessage();
  }

  if (!room) return showMissingMessage();

  // Determina o papel: admin se tiver token E for o criador da retro
  isAdmin = !!(token && currentUser && room.creatorSessionId === currentUser.id);

  setupHeaderAndShare();
  applyRoleVisibility();
  createBoard();
  loadRetroCards();
  setupEvents();
  
  // Setup WebSocket connection for real-time updates
  setupWebSocket();
}

init();



