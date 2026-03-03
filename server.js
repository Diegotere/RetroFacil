import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { open } from "sqlite";
import sqlite3 from "sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "1mb" }));

const db = await open({
  filename: path.join(__dirname, "retrofacil.db"),
  driver: sqlite3.Database,
});

await db.exec(`
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
  FOREIGN KEY(retro_id) REFERENCES retros(id) ON DELETE CASCADE
);
`);

const defaultColumns = [
  { id: "col-good", name: "😀 Funcionou bem" },
  { id: "col-bad", name: "😕 Pode melhorar" },
  { id: "col-ideas", name: "💡 Ideias" },
  { id: "col-actions", name: "🚀 Ações" },
];

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureDefaultTeam() {
  const row = await db.get("SELECT id FROM teams LIMIT 1");
  if (!row) {
    await db.run(
      "INSERT INTO teams (id, name, created_at) VALUES (?, ?, ?)",
      createId(),
      "Time Padrão",
      new Date().toISOString()
    );
  }
}

async function getTeams() {
  const teams = await db.all("SELECT id, name FROM teams ORDER BY name ASC");
  for (const team of teams) {
    team.retros = await db.all(
      `SELECT r.id, r.title, r.created_at AS date, r.updated_at AS updatedAt,
              (SELECT COUNT(1) FROM cards c WHERE c.retro_id = r.id) AS cardCount
       FROM retros r
       WHERE r.team_id = ?
       ORDER BY r.created_at DESC`,
      team.id
    );
  }
  return teams;
}

app.get("/api/teams", async (_req, res) => {
  await ensureDefaultTeam();
  res.json({ teams: await getTeams() });
});

app.post("/api/teams", async (req, res) => {
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

app.delete("/api/teams/:teamId", async (req, res) => {
  await db.run("DELETE FROM teams WHERE id = ?", req.params.teamId);
  await ensureDefaultTeam();
  res.status(204).end();
});

app.post("/api/retros", async (req, res) => {
  const { teamId, title, creatorSessionId } = req.body || {};
  if (!teamId || !title || !creatorSessionId) return res.status(400).json({ error: "Dados inválidos" });

  const id = createId();
  const now = new Date().toISOString();
  await db.run(
    "INSERT INTO retros (id, team_id, title, creator_session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    teamId,
    title,
    creatorSessionId,
    now,
    now
  );

  for (const [index, column] of defaultColumns.entries()) {
    await db.run(
      "INSERT INTO retro_columns (id, retro_id, name, position) VALUES (?, ?, ?, ?)",
      `${id}-${column.id}`,
      id,
      column.name,
      index
    );
  }

  res.status(201).json({ id });
});

app.delete("/api/retros/:retroId", async (req, res) => {
  await db.run("DELETE FROM retros WHERE id = ?", req.params.retroId);
  res.status(204).end();
});

app.get("/api/retros/:retroId", async (req, res) => {
  const retro = await db.get(
    `SELECT r.id, r.title, r.creator_session_id AS creatorSessionId,
            r.created_at AS date, r.updated_at AS updatedAt,
            t.id AS teamId, t.name AS teamName
     FROM retros r
     JOIN teams t ON t.id = r.team_id
     WHERE r.id = ?`,
    req.params.retroId
  );

  if (!retro) return res.status(404).json({ error: "Retro não encontrada" });

  const columns = await db.all(
    "SELECT id, name, position FROM retro_columns WHERE retro_id = ? ORDER BY position ASC",
    retro.id
  );

  const cards = await db.all(
    "SELECT id, text, votes, column_id AS columnId, position FROM cards WHERE retro_id = ? ORDER BY position ASC",
    retro.id
  );

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

app.put("/api/retros/:retroId", async (req, res) => {
  const retroId = req.params.retroId;
  const { columns = [], cards = [] } = req.body || {};

  const retro = await db.get("SELECT id FROM retros WHERE id = ?", retroId);
  if (!retro) return res.status(404).json({ error: "Retro não encontrada" });

  await db.run("DELETE FROM retro_columns WHERE retro_id = ?", retroId);
  await db.run("DELETE FROM cards WHERE retro_id = ?", retroId);

  for (const [index, column] of columns.entries()) {
    await db.run(
      "INSERT INTO retro_columns (id, retro_id, name, position) VALUES (?, ?, ?, ?)",
      column.id,
      retroId,
      column.name,
      index
    );
  }

  for (const [index, card] of cards.entries()) {
    await db.run(
      "INSERT INTO cards (id, retro_id, column_id, text, votes, position) VALUES (?, ?, ?, ?, ?, ?)",
      card.id,
      retroId,
      card.columnId,
      card.text,
      Number(card.votes || 0),
      index
    );
  }

  await db.run("UPDATE retros SET updated_at = ? WHERE id = ?", new Date().toISOString(), retroId);
  res.status(204).end();
});

app.get("/api/reports/:teamId", async (req, res) => {
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

      key
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .forEach((w) => wordFreq.set(w, (wordFreq.get(w) || 0) + 1));
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
