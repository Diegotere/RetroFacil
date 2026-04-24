import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { open } from "sqlite";
import sqlite3 from "sqlite3";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || "retrofacil_secret_key_123";

// ATENÇÃO: Substitua pelo seu Client ID real
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "COLOQUE_SEU_CLIENT_ID_AQUI";
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const app = express();
app.use(express.json({ limit: "1mb" }));

const db = await open({
  filename: path.join(__dirname, "retrofacil.db"),
  driver: sqlite3.Database,
});

await db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  google_id TEXT UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS retros (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  title TEXT NOT NULL,
  creator_session_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS retro_columns (
  id TEXT PRIMARY KEY,
  retro_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  FOREIGN KEY(retro_id) REFERENCES retros(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  retro_id TEXT NOT NULL,
  column_id TEXT NOT NULL,
  text TEXT NOT NULL,
  votes INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  user_id TEXT,
  FOREIGN KEY(retro_id) REFERENCES retros(id) ON DELETE CASCADE
);
`);

// Tenta adicionar a coluna user_id se ela ainda não existir na tabela antiga
try {
  await db.exec("ALTER TABLE cards ADD COLUMN user_id TEXT;");
} catch (e) {
  // Ignora se a coluna já existir
}

const defaultColumns = [
  { id: "col-good", name: "😀 Funcionou bem" },
  { id: "col-bad", name: "😕 Pode melhorar" },
  { id: "col-ideas", name: "💡 Ideias" },
  { id: "col-actions", name: "🚀 Ações" },
];

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Middleware de Autenticação
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Acesso negado. Token não fornecido." });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Token inválido ou expirado." });
    req.user = user;
    next();
  });
}

// =======================
// Rotas de Autenticação
// =======================

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: "Preencha todos os campos." });

  try {
    const existing = await db.get("SELECT id FROM users WHERE email = ?", email);
    if (existing) return res.status(409).json({ error: "E-mail já cadastrado." });

    const id = createId();
    const hash = await bcrypt.hash(password, 10);
    await db.run(
      "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
      id, name, email, hash, new Date().toISOString()
    );

    const token = jwt.sign({ id, name, email }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ token, user: { id, name, email } });
  } catch (error) {
    res.status(500).json({ error: "Erro ao criar usuário." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Preencha email e senha." });

  try {
    const user = await db.get("SELECT * FROM users WHERE email = ?", email);
    if (!user || !user.password_hash) return res.status(401).json({ error: "Credenciais inválidas." });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Credenciais inválidas." });

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    res.status(500).json({ error: "Erro no servidor." });
  }
});

app.post("/api/auth/google", async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: "Token do Google não fornecido." });

  try {
    // Verifica o token usando a biblioteca oficial do Google
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const googleId = payload.sub; // ID único do Google
    const email = payload.email;
    const name = payload.name;

    let user = await db.get("SELECT * FROM users WHERE google_id = ? OR email = ?", googleId, email);
    
    if (!user) {
      user = { id: createId(), name, email, google_id: googleId };
      await db.run(
        "INSERT INTO users (id, name, email, google_id, created_at) VALUES (?, ?, ?, ?, ?)",
        user.id, user.name, user.email, user.google_id, new Date().toISOString()
      );
    } else if (!user.google_id) {
      // Relaciona a conta existente com o Google
      await db.run("UPDATE users SET google_id = ? WHERE id = ?", googleId, user.id);
    }

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    res.status(500).json({ error: "Erro ao autenticar com Google." });
  }
});

app.get("/api/auth/me", authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// =======================
// Rotas da Aplicação
// =======================

async function ensureDefaultTeam() {
  const row = await db.get("SELECT id FROM teams LIMIT 1");
  if (!row) {
    await db.run("INSERT INTO teams (id, name, created_at) VALUES (?, ?, ?)", createId(), "Time Padrão", new Date().toISOString());
  }
}

async function getTeams() {
  const teams = await db.all("SELECT id, name FROM teams ORDER BY name ASC");
  for (const team of teams) {
    team.retros = await db.all(
      `SELECT r.id, r.title, r.created_at AS date, r.updated_at AS updatedAt,
              (SELECT COUNT(1) FROM cards c WHERE c.retro_id = r.id) AS cardCount
       FROM retros r WHERE r.team_id = ? ORDER BY r.created_at DESC`, team.id
    );
  }
  return teams;
}

app.get("/api/teams", authenticateToken, async (_req, res) => {
  await ensureDefaultTeam();
  res.json({ teams: await getTeams() });
});

app.post("/api/teams", authenticateToken, async (req, res) => {
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Nome é obrigatório" });

  try {
    const id = createId();
    await db.run("INSERT INTO teams (id, name, created_at) VALUES (?, ?, ?)", id, name, new Date().toISOString());
    res.status(201).json({ id, name });
  } catch {
    res.status(409).json({ error: "Time já existe" });
  }
});

app.delete("/api/teams/:teamId", authenticateToken, async (req, res) => {
  await db.run("DELETE FROM teams WHERE id = ?", req.params.teamId);
  await ensureDefaultTeam();
  res.status(204).end();
});

app.post("/api/retros", authenticateToken, async (req, res) => {
  const { teamId, title } = req.body || {};
  if (!teamId || !title) return res.status(400).json({ error: "Dados inválidos" });

  const id = createId();
  const now = new Date().toISOString();
  await db.run(
    "INSERT INTO retros (id, team_id, title, creator_session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    id, teamId, title, req.user.id, now, now
  );

  for (const [index, column] of defaultColumns.entries()) {
    await db.run(
      "INSERT INTO retro_columns (id, retro_id, name, position) VALUES (?, ?, ?, ?)",
      `${id}-${column.id}`, id, column.name, index
    );
  }

  res.status(201).json({ id });
});

app.delete("/api/retros/:retroId", authenticateToken, async (req, res) => {
  await db.run("DELETE FROM retros WHERE id = ?", req.params.retroId);
  res.status(204).end();
});

app.get("/api/retros/:retroId", authenticateToken, async (req, res) => {
  const retro = await db.get(
    `SELECT r.id, r.title, r.creator_session_id AS creatorSessionId, r.created_at AS date, r.updated_at AS updatedAt, t.id AS teamId, t.name AS teamName
     FROM retros r JOIN teams t ON t.id = r.team_id WHERE r.id = ?`, req.params.retroId
  );

  if (!retro) return res.status(404).json({ error: "Retro não encontrada" });

  const columns = await db.all("SELECT id, name, position FROM retro_columns WHERE retro_id = ? ORDER BY position ASC", retro.id);
  const cards = await db.all("SELECT id, text, votes, column_id AS columnId, position, user_id AS userId FROM cards WHERE retro_id = ? ORDER BY position ASC", retro.id);

  res.json({
    id: retro.id,
    title: retro.title,
    creatorSessionId: retro.creatorSessionId,
    date: retro.date,
    updatedAt: retro.updatedAt,
    team: { id: retro.teamId, name: retro.teamName },
    columns: columns.map((c) => ({ id: c.id, name: c.name })),
    cards,
  });
});

app.put("/api/retros/:retroId", authenticateToken, async (req, res) => {
  const retroId = req.params.retroId;
  const { columns = [], cards = [] } = req.body || {};

  const retro = await db.get("SELECT id, creator_session_id FROM retros WHERE id = ?", retroId);
  if (!retro) return res.status(404).json({ error: "Retro não encontrada" });

  // Apenas o criador da retro pode mudar colunas
  if (retro.creator_session_id === req.user.id) {
    await db.run("DELETE FROM retro_columns WHERE retro_id = ?", retroId);
    for (const [index, column] of columns.entries()) {
      await db.run("INSERT INTO retro_columns (id, retro_id, name, position) VALUES (?, ?, ?, ?)", column.id, retroId, column.name, index);
    }
  }

  // Pega os cartões antigos para preservar os que não são do usuário atual
  const oldCards = await db.all("SELECT * FROM cards WHERE retro_id = ?", retroId);
  
  await db.run("DELETE FROM cards WHERE retro_id = ?", retroId);

  // Filtra cartões que o usuário enviou. Ele só pode enviar/alterar os dele (ou novos que não têm user_id salvo ainda).
  // Se for o dono da retro, ele pode salvar qualquer coisa (excluir de outros).
  const isOwner = retro.creator_session_id === req.user.id;

  const cardsToSave = [];
  
  // Adiciona de volta os cartões de outros usuários que não foram deletados pelo owner
  oldCards.forEach(oldCard => {
    if (oldCard.user_id !== req.user.id && !isOwner) {
      // Se não sou o dono, mantenho o cartão do coleguinha intocado, pegando a nova posição se ele foi movido?
      // O PUT reordena tudo. Pega a posição do payload se existir, senão mantém a antiga.
      const payloadCard = cards.find(c => c.id === oldCard.id);
      if (payloadCard) {
        cardsToSave.push({ ...oldCard, column_id: payloadCard.columnId, position: cards.indexOf(payloadCard), votes: payloadCard.votes });
      } else {
        cardsToSave.push(oldCard); // Se não mandou, mas não pode deletar, salva de novo.
      }
    }
  });

  // Adiciona/Atualiza os cartões do próprio usuário (e os de outros se for o owner)
  cards.forEach((card, index) => {
    const old = oldCards.find(c => c.id === card.id);
    if (!old || old.user_id === req.user.id || isOwner) {
      cardsToSave.push({
        id: card.id,
        retro_id: retroId,
        column_id: card.columnId,
        text: card.text,
        votes: Number(card.votes || 0),
        position: index,
        user_id: old ? old.user_id : req.user.id
      });
    }
  });

  // Remove duplicatas que possam ter surgido
  const uniqueCardsToSave = [...new Map(cardsToSave.map(item => [item.id, item])).values()];

  for (const card of uniqueCardsToSave) {
    await db.run(
      "INSERT INTO cards (id, retro_id, column_id, text, votes, position, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      card.id, retroId, card.column_id, card.text, card.votes, card.position, card.user_id
    );
  }

  await db.run("UPDATE retros SET updated_at = ? WHERE id = ?", new Date().toISOString(), retroId);
  res.status(204).end();
});

app.get("/api/reports/:teamId", authenticateToken, async (req, res) => {
  const teamId = req.params.teamId;
  const retros = await db.all("SELECT id, created_at AS date FROM retros WHERE team_id = ?", teamId);

  const monthFreq = new Map();
  const groupedByText = new Map();
  const wordFreq = new Map();

  for (const retro of retros) {
    const month = retro.date.slice(0, 7);
    monthFreq.set(month, (monthFreq.get(month) || 0) + 1);

    const cards = await db.all("SELECT text, votes FROM cards WHERE retro_id = ?", retro.id);
    for (const card of cards) {
      const key = (card.text || "").trim().toLowerCase();
      if (!key) continue;
      const data = groupedByText.get(key) || { text: card.text, votes: 0, count: 0 };
      data.votes += Number(card.votes || 0);
      data.count += 1;
      groupedByText.set(key, data);

      key.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2).forEach((w) => wordFreq.set(w, (wordFreq.get(w) || 0) + 1));
    }
  }

  const top = [...groupedByText.values()].sort((a, b) => b.votes - a.votes || b.count - a.count).slice(0, 8);
  const months = [...monthFreq.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, count]) => ({ month, count }));
  const words = [...wordFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([word, count]) => ({ word, count }));

  res.json({ retroCount: retros.length, top, months, words });
});

app.use(express.static(__dirname));

const port = process.env.PORT || 4173;
app.listen(port, () => {
  console.log(`RetroFacil rodando em http://0.0.0.0:${port}`);
});
