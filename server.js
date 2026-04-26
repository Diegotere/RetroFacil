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
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "737345557047-cd71egdu71tpd8sa66rtb09jj71d51lp.apps.googleusercontent.com";
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const app = express();
app.use(express.json({ limit: "1mb" }));

const db = await open({
  filename: path.join(__dirname, "retrofacil.db"),
  driver: sqlite3.Database,
});

// Habilita suporte a chaves estrangeiras (essencial para ON DELETE CASCADE)
await db.exec("PRAGMA foreign_keys = ON;");

await db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  google_id TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'collaborator',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(creator_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS retros (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'ongoing',
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

// Tenta adicionar a coluna status na tabela retros se não existir
try {
  await db.exec("ALTER TABLE retros ADD COLUMN status TEXT DEFAULT 'ongoing';");
} catch (e) {
  // Ignora se a coluna já existir
}

// Tenta adicionar a coluna role na tabela users se não existir
try {
  await db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'collaborator';");
} catch (e) {
  // Ignora se a coluna já existir
}

// Seed: Garante que o super admin existe e tem a senha correta
{
  const SUPER_ADMIN_EMAIL = "diegotere@yahoo.com.br";
  const hash = await bcrypt.hash("senha@123", 10);
  const existing = await db.get("SELECT id FROM users WHERE email = ?", SUPER_ADMIN_EMAIL);
  
  if (!existing) {
    const id = createId();
    await db.run(
      "INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      id, "Diego (Super Admin)", SUPER_ADMIN_EMAIL, hash, "super_admin", new Date().toISOString()
    );
    console.log("[Seed] Super admin criado:", SUPER_ADMIN_EMAIL);
  } else {
    // Garante que ele é super_admin e tem a senha definida/atualizada
    await db.run("UPDATE users SET role = 'super_admin', password_hash = ? WHERE email = ?", hash, SUPER_ADMIN_EMAIL);
    console.log("[Seed] Super admin atualizado:", SUPER_ADMIN_EMAIL);
  }
}

// Tenta adicionar a coluna reset_code na tabela users se não existir
try {
  await db.exec("ALTER TABLE users ADD COLUMN reset_code TEXT;");
  await db.exec("ALTER TABLE users ADD COLUMN reset_expires TEXT;");
} catch (e) {
  // Ignora se as colunas já existirem
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

// Middleware de Autenticação Normal
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

// Middleware exclusivo para Super Admin
function authenticateSuperAdmin(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Acesso negado." });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Token inválido ou expirado." });
    if (user.role !== "super_admin") return res.status(403).json({ error: "Acesso restrito ao Super Admin." });
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

    const role = user.role || "collaborator";
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role } });
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

    const role = user.role || "collaborator";
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role } });
  } catch (error) {
    res.status(500).json({ error: "Erro ao autenticar com Google." });
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "E-mail é obrigatório." });

  const user = await db.get("SELECT id FROM users WHERE email = ?", email.trim().toLowerCase());
  if (!user) {
    return res.status(404).json({ 
      error: "E-mail não cadastrado.", 
      suggestRegister: true 
    });
  }

  // Gera um código de 6 dígitos
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutos

  await db.run("UPDATE users SET reset_code = ?, reset_expires = ? WHERE id = ?", code, expires, user.id);

  // MOCK: Simulando o envio de e-mail (imprime no console para o desenvolvedor ver)
  console.log(`\n📧 [MOCK EMAIL] Para: ${email}`);
  console.log(`🔗 Código de recuperação: ${code}`);
  console.log(`⏱️ Expira em: 15 minutos\n`);

  res.json({ message: "Código enviado com sucesso!" });
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) return res.status(400).json({ error: "Dados incompletos." });

  const user = await db.get("SELECT * FROM users WHERE email = ?", email.trim().toLowerCase());
  if (!user || user.reset_code !== code) {
    return res.status(401).json({ error: "Código inválido." });
  }

  const now = new Date().toISOString();
  if (user.reset_expires < now) {
    return res.status(401).json({ error: "Código expirado." });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await db.run(
    "UPDATE users SET password_hash = ?, reset_code = NULL, reset_expires = NULL WHERE id = ?", 
    hash, user.id
  );

  res.json({ message: "Senha redefinida com sucesso!" });
});

app.get("/api/auth/me", authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// =======================
// Rotas da Aplicação
// =======================

async function getTeams(userId) {
  const teams = await db.all("SELECT id, name FROM teams WHERE creator_id = ? ORDER BY name ASC", userId);
  for (const team of teams) {
    team.retros = await db.all(
      `SELECT r.id, r.title, r.status, r.created_at AS date, r.updated_at AS updatedAt,
              (SELECT COUNT(1) FROM cards c WHERE c.retro_id = r.id) AS cardCount
       FROM retros r WHERE r.team_id = ? ORDER BY r.created_at DESC`, team.id
    );
  }
  return teams;
}

app.get("/api/teams", authenticateToken, async (req, res) => {
  if (req.user.role === 'collaborator') {
    return res.status(403).json({ error: "Acesso restrito ao Dashboard." });
  }
  res.json({ teams: await getTeams(req.user.id) });
});

app.post("/api/teams", authenticateToken, async (req, res) => {
  if (req.user.role === 'collaborator') {
    return res.status(403).json({ error: "Você não tem permissão para criar times." });
  }
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Nome é obrigatório" });

  try {
    const id = createId();
    await db.run("INSERT INTO teams (id, name, creator_id, created_at) VALUES (?, ?, ?, ?)", id, name, req.user.id, new Date().toISOString());
    res.status(201).json({ id, name });
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar time" });
  }
});

app.delete("/api/teams/:teamId", authenticateToken, async (req, res) => {
  // Garante que o usuário só pode deletar o PRÓPRIO time
  const team = await db.get("SELECT creator_id FROM teams WHERE id = ?", req.params.teamId);
  if (!team || team.creator_id !== req.user.id) {
    return res.status(403).json({ error: "Ação não permitida" });
  }
  await db.run("DELETE FROM teams WHERE id = ?", req.params.teamId);
  res.status(204).end();
});

app.post("/api/retros", authenticateToken, async (req, res) => {
  const { teamId, title } = req.body || {};
  if (!teamId || !title) return res.status(400).json({ error: "Dados inválidos" });

  const id = createId();
  const now = new Date().toISOString();
  await db.run(
    "INSERT INTO retros (id, team_id, title, status, creator_session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id, teamId, title, 'ongoing', req.user.id, now, now
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

app.put("/api/retros/:retroId/status", authenticateToken, async (req, res) => {
  const { status } = req.body || {};
  if (!status || !['ongoing', 'completed'].includes(status)) {
    return res.status(400).json({ error: "Status inválido" });
  }

  const retro = await db.get("SELECT creator_session_id FROM retros WHERE id = ?", req.params.retroId);
  if (!retro) return res.status(404).json({ error: "Retro não encontrada" });

  if (retro.creator_session_id !== req.user.id) {
     return res.status(403).json({ error: "Apenas o criador pode alterar o status" });
  }

  await db.run("UPDATE retros SET status = ?, updated_at = ? WHERE id = ?", status, new Date().toISOString(), req.params.retroId);
  res.status(204).end();
});

app.get("/api/retros/:retroId", async (req, res) => {
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

// Middleware opcional — tenta autenticar mas não bloqueia se não houver token
function optionalAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    req.user = null;
    return next();
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    req.user = err ? null : user;
    next();
  });
}

app.put("/api/retros/:retroId", optionalAuth, async (req, res) => {
  const retroId = req.params.retroId;
  const { columns = [], cards = [] } = req.body || {};

  const retro = await db.get("SELECT id, creator_session_id FROM retros WHERE id = ?", retroId);
  if (!retro) return res.status(404).json({ error: "Retro não encontrada" });

  const currentUserId = req.user ? req.user.id : null;
  const isOwner = currentUserId && retro.creator_session_id === currentUserId;

  // Apenas o criador (admin) pode mudar colunas
  if (isOwner) {
    await db.run("DELETE FROM retro_columns WHERE retro_id = ?", retroId);
    for (const [index, column] of columns.entries()) {
      await db.run("INSERT INTO retro_columns (id, retro_id, name, position) VALUES (?, ?, ?, ?)", column.id, retroId, column.name, index);
    }
  }

  // Pega os cartões antigos para preservar os que não são do usuário atual
  const oldCards = await db.all("SELECT * FROM cards WHERE retro_id = ?", retroId);

  await db.run("DELETE FROM cards WHERE retro_id = ?", retroId);

  const cardsToSave = [];

  // Preserva cartões de outros usuários (não pode deletar o cartão de outro se não for owner)
  oldCards.forEach(oldCard => {
    if (oldCard.user_id !== currentUserId && !isOwner) {
      const payloadCard = cards.find(c => c.id === oldCard.id);
      if (payloadCard) {
        cardsToSave.push({ ...oldCard, column_id: payloadCard.columnId, position: cards.indexOf(payloadCard), votes: payloadCard.votes });
      } else {
        cardsToSave.push(oldCard);
      }
    }
  });

  // Adiciona/Atualiza os cartões do próprio usuário (ou anônimos, ou todos se for owner)
  cards.forEach((card, index) => {
    const old = oldCards.find(c => c.id === card.id);
    // Permite se: novo cartão, ou é o dono do cartão, ou é admin, ou cartão anônimo (null)
    const cardOwner = old ? old.user_id : null;
    const canSave = !old || isOwner || cardOwner === currentUserId || cardOwner === null;
    if (canSave) {
      cardsToSave.push({
        id: card.id,
        retro_id: retroId,
        column_id: card.columnId,
        text: card.text,
        votes: Number(card.votes || 0),
        position: index,
        user_id: old ? old.user_id : currentUserId
      });
    }
  });

  const uniqueCardsToSave = [...new Map(cardsToSave.map(item => [item.id, item])).values()];

  for (const card of uniqueCardsToSave) {
    await db.run(
      "INSERT INTO cards (id, retro_id, column_id, text, votes, position, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      card.id, retroId, card.column_id, card.text, card.votes, card.position, card.user_id
    );
  }

   await db.run("UPDATE retros SET updated_at = ? WHERE id = ?", new Date().toISOString(), retroId);
   
    // Broadcast update to all clients viewing this retro
    const updatedRetro = await db.get(
      `SELECT r.id, r.title, r.creator_session_id AS creatorSessionId, r.created_at AS date, r.updated_at AS updatedAt, t.id AS teamId, t.name AS teamName
       FROM retros r JOIN teams t ON t.id = r.team_id WHERE r.id = ?`, retroId
    );
   if (updatedRetro) {
     const columns = await db.all("SELECT id, name, position FROM retro_columns WHERE retro_id = ? ORDER BY position ASC", retroId);
     const cards = await db.all("SELECT id, text, votes, column_id AS columnId, position, user_id AS userId FROM cards WHERE retro_id = ? ORDER BY position ASC", retroId);
     
     broadcastToRetro(retroId, {
       type: 'retro_updated',
       payload: {
         id: updatedRetro.id,
         title: updatedRetro.title,
         creatorSessionId: updatedRetro.creatorSessionId,
         date: updatedRetro.date,
         updatedAt: updatedRetro.updatedAt,
         team: { id: updatedRetro.teamId, name: updatedRetro.teamName },
         columns: columns.map((c) => ({ id: c.id, name: c.name })),
         cards
       }
     });
   }
   
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

// =======================
// Rotas de Administração (Super Admin)
// =======================

// Login do super admin (retorna token com role=super_admin)
app.post("/api/admin/auth/login", async (req, res) => {
  let { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Preencha email e senha." });

  email = email.trim().toLowerCase();
  try {
    const user = await db.get("SELECT * FROM users WHERE email = ?", email);
    if (!user || !user.password_hash) return res.status(401).json({ error: "Usuário não encontrado ou sem senha local." });
    
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Senha incorreta." });

    if (user.role !== "super_admin") {
      console.log(`[Admin Login Denied] Usuário ${email} tem role: ${user.role}`);
      return res.status(403).json({ error: "Acesso negado: seu usuário não é um Super Admin." });
    }

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: "super_admin" }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: "super_admin" } });
  } catch (error) {
    res.status(500).json({ error: "Erro no servidor." });
  }
});

// Lista todos os usuários
app.get("/api/admin/users", authenticateSuperAdmin, async (_req, res) => {
  const users = await db.all(
    `SELECT id, name, email, role, created_at,
      (SELECT COUNT(*) FROM teams t WHERE t.creator_id = users.id) AS teamCount,
      (SELECT COUNT(*) FROM retros r WHERE r.creator_session_id = users.id) AS retroCount
     FROM users ORDER BY created_at DESC`
  );
  // Não enviamos o hash da senha por segurança e porque ele é ilegível
  res.json(users);
});

// Atualiza a senha de um usuário
app.put("/api/admin/users/:userId/password", authenticateSuperAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 3) return res.status(400).json({ error: "Senha muito curta." });

  const hash = await bcrypt.hash(password, 10);
  await db.run("UPDATE users SET password_hash = ? WHERE id = ?", hash, req.params.userId);
  res.status(204).end();
});

// Deleta um usuário e tudo o que ele criou
app.delete("/api/admin/users/:userId", authenticateSuperAdmin, async (req, res) => {
  const { userId } = req.params;

  // Não permite que o super admin se delete
  if (userId === req.user.id) {
    return res.status(403).json({ error: "Você não pode deletar sua própria conta de Super Admin." });
  }

  // Com PRAGMA foreign_keys = ON, o banco cuidará de deletar times -> retros -> cards
  // desde que as tabelas tenham sido criadas com ON DELETE CASCADE.
  // Vamos garantir que o usuário seja removido.
  await db.run("DELETE FROM users WHERE id = ?", userId);
  res.status(204).end();
});

// Atualiza o papel (role) de um usuário
app.put("/api/admin/users/:userId/role", authenticateSuperAdmin, async (req, res) => {
  const { role } = req.body;
  const validRoles = ["admin", "collaborator"];
  if (!validRoles.includes(role)) return res.status(400).json({ error: "Papel inválido. Use 'admin' ou 'collaborator'." });

  // Não permite rebaixar o super admin
  const target = await db.get("SELECT role FROM users WHERE id = ?", req.params.userId);
  if (!target) return res.status(404).json({ error: "Usuário não encontrado." });
  if (target.role === "super_admin") return res.status(403).json({ error: "Não é possível alterar o papel do Super Admin." });

  await db.run("UPDATE users SET role = ? WHERE id = ?", role, req.params.userId);
  res.status(204).end();
});

app.use(express.static(__dirname));

const port = process.env.PORT || 4173;
const server = app.listen(port, () => {
  console.log(`RetroFacil rodando em http://0.0.0.0:${port}`);
});

// WebSocket setup for real-time updates
import { WebSocketServer } from 'ws';
const wss = new WebSocketServer({ noServer: true });

// Store active connections by retro ID
const retroConnections = new Map();

// Broadcast function to send updates to all clients viewing a specific retro
function broadcastToRetro(retroId, data) {
  const connections = retroConnections.get(retroId);
  if (connections) {
    console.log(`Broadcasting to ${connections.size} connections for retro ${retroId}`);
    connections.forEach((ws) => {
      if (ws.readyState === 1) { // WebSocket.OPEN = 1
        ws.send(JSON.stringify(data));
      }
    });
  } else {
    console.log(`No connections found for retro ${retroId}`);
  }
}

// Handle WebSocket upgrades
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const retroId = url.searchParams.get('retro');
  
  if (!retroId) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }
  
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
    
    // Add connection to the retro's connection set
    if (!retroConnections.has(retroId)) {
      retroConnections.set(retroId, new Set());
    }
    const connections = retroConnections.get(retroId);
    connections.add(ws);
    
    // Clean up when connection closes
    ws.on('close', () => {
      connections.delete(ws);
      if (connections.size === 0) {
        retroConnections.delete(retroId);
      }
    });
  });
});
