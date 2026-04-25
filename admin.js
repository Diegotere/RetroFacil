const adminLoginForm = document.getElementById("adminLoginForm");
const adminLoginSection = document.getElementById("adminLoginSection");
const adminPanelSection = document.getElementById("adminPanelSection");
const usersTableBody = document.getElementById("usersTableBody");
const logoutBtn = document.getElementById("logoutBtn");

let adminToken = localStorage.getItem("retrofacil_admin_token");

async function apiAdmin(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (adminToken) headers["Authorization"] = `Bearer ${adminToken}`;

  const res = await fetch(path, { ...options, headers });
  
  // Se for erro de autorização em rotas que NÃO são a de login, limpa o token
  if ((res.status === 401 || res.status === 403) && !path.includes("/auth/login")) {
    localStorage.removeItem("retrofacil_admin_token");
    showLogin();
    return null;
  }
  
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Erro na requisição");
  }
  return res.status === 204 ? null : res.json();
}

function showLogin() {
  adminLoginSection.style.display = "block";
  adminPanelSection.style.display = "none";
}

function showPanel() {
  adminLoginSection.style.display = "none";
  adminPanelSection.style.display = "block";
  loadUsers();
}

async function loadUsers() {
  try {
    const users = await apiAdmin("/api/admin/users");
    if (!users) return;

    usersTableBody.innerHTML = users.map(user => `
      <tr style="border-bottom: 1px solid var(--border);">
        <td style="padding: 1rem;">${user.name}</td>
        <td style="padding: 1rem;">${user.email}</td>
        <td style="padding: 1rem;">
          <select onchange="updateRole('${user.id}', this.value)" style="padding: 0.25rem;" ${user.role === 'super_admin' ? 'disabled' : ''}>
            <option value="collaborator" ${user.role === 'collaborator' ? 'selected' : ''}>Colaborador</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin (Criador)</option>
            ${user.role === 'super_admin' ? '<option value="super_admin" selected>Super Admin</option>' : ''}
          </select>
        </td>
        <td style="padding: 1rem;">
          <div style="display: flex; gap: 0.5rem;">
            <input type="text" placeholder="Nova senha" id="pwd-${user.id}" style="width: 100px; padding: 0.2rem;">
            <button class="ghost small" onclick="updatePassword('${user.id}')">💾</button>
          </div>
        </td>
        <td style="padding: 1rem;">
          ${user.role !== 'super_admin' ? `
            <button class="ghost danger small" onclick="deleteUser('${user.id}')">🗑️ Excluir</button>
          ` : '-'}
        </td>
      </tr>
    `).join("");
  } catch (err) {
    alert(err.message);
  }
}

window.updateRole = async (userId, newRole) => {
  try {
    const encodedId = encodeURIComponent(userId);
    await apiAdmin(`/api/admin/users/${encodedId}/role`, {
      method: "PUT",
      body: JSON.stringify({ role: newRole })
    });
    loadUsers();
  } catch (err) {
    console.error("Erro ao atualizar papel:", err);
    alert(err.message);
  }
};

window.updatePassword = async (userId) => {
  const pwdInput = document.getElementById(`pwd-${userId}`);
  const newPassword = pwdInput.value.trim();
  if (!newPassword) return alert("Digite a nova senha.");
  
  if (!confirm("Deseja realmente alterar a senha deste usuário?")) return;

  try {
    const encodedId = encodeURIComponent(userId);
    await apiAdmin(`/api/admin/users/${encodedId}/password`, {
      method: "PUT",
      body: JSON.stringify({ password: newPassword })
    });
    alert("Senha atualizada com sucesso!");
    pwdInput.value = "";
  } catch (err) {
    console.error("Erro ao atualizar senha:", err);
    alert(err.message);
  }
};

window.deleteUser = async (userId) => {
  if (!userId) return;
  if (!confirm("⚠️ ATENÇÃO: Deseja realmente excluir este usuário? Todos os seus times e retrospectivas serão deletados permanentemente!")) return;

  try {
    const encodedId = encodeURIComponent(userId);
    await apiAdmin(`/api/admin/users/${encodedId}`, { method: "DELETE" });
    loadUsers();
  } catch (err) {
    console.error("Erro ao excluir usuário:", err);
    alert("Erro ao excluir: " + err.message);
  }
};

adminLoginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const data = await apiAdmin("/api/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("adminEmail").value,
        password: document.getElementById("adminPassword").value
      })
    });
    if (data && data.token) {
      adminToken = data.token;
      localStorage.setItem("retrofacil_admin_token", adminToken);
      showPanel();
    }
  } catch (err) {
    alert(err.message);
  }
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("retrofacil_admin_token");
  window.location.href = "admin.html";
});

// Inicialização
if (adminToken) {
  showPanel();
} else {
  showLogin();
}
