const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const loginSection = document.getElementById("loginSection");
const registerSection = document.getElementById("registerSection");

// Verifica se veio de um link de retro compartilhada (?retro=XXXX)
const loginParams = new URLSearchParams(window.location.search);
const retroRedirect = loginParams.get("retro");
if (retroRedirect) {
  // Salva para usar após o login
  localStorage.setItem("retrofacil_retro_redirect", retroRedirect);
  // Mostra o banner de contexto
  const ctx = document.getElementById("retroContext");
  if (ctx) ctx.style.display = "block";
}

// Função central de redirecionamento pós-login
function getRedirectUrl() {
  const savedRetro = localStorage.getItem("retrofacil_retro_redirect");
  if (savedRetro) {
    localStorage.removeItem("retrofacil_retro_redirect");
    return `retro.html?retro=${savedRetro}`;
  }
  return "index.html";
}

// Se já estiver logado, redireciona para o destino correto
if (localStorage.getItem("retrofacil_token")) {
  window.location.href = getRedirectUrl();
}

const forgotSection = document.getElementById("forgotSection");
const resetSection = document.getElementById("resetSection");
const forgotForm = document.getElementById("forgotForm");
const resetForm = document.getElementById("resetForm");

document.getElementById("showRegister").addEventListener("click", () => {
  loginSection.style.display = "none";
  registerSection.style.display = "block";
  forgotSection.style.display = "none";
});

document.getElementById("showLogin").addEventListener("click", () => {
  registerSection.style.display = "none";
  loginSection.style.display = "block";
  forgotSection.style.display = "none";
});

document.getElementById("showForgot").addEventListener("click", () => {
  loginSection.style.display = "none";
  forgotSection.style.display = "block";
  resetSection.style.display = "none";
});

document.getElementById("backToLogin").addEventListener("click", () => {
  forgotSection.style.display = "none";
  loginSection.style.display = "block";
});

async function apiAuth(path, body) {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro na autenticação");
    return data;
  } catch (err) {
    alert(err.message);
    throw err;
  }
}

function handleSuccess(data) {
  localStorage.setItem("retrofacil_token", data.token);
  localStorage.setItem("retrofacil_user", JSON.stringify(data.user));
  window.location.href = getRedirectUrl();
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = await apiAuth("/api/auth/login", {
    email: document.getElementById("loginEmail").value,
    password: document.getElementById("loginPassword").value,
  });
  handleSuccess(data);
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = await apiAuth("/api/auth/register", {
    name: document.getElementById("registerName").value,
    email: document.getElementById("registerEmail").value,
    password: document.getElementById("registerPassword").value,
  });
  handleSuccess(data);
});

forgotForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("forgotEmail").value;
  try {
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.suggestRegister) {
        if (confirm(`${data.error} Deseja ir para a tela de cadastro?`)) {
          forgotSection.style.display = "none";
          registerSection.style.display = "block";
          document.getElementById("registerEmail").value = email;
        }
      } else {
        alert(data.error);
      }
      return;
    }
    alert("Código enviado! Verifique o console do servidor (Simulação de e-mail).");
    resetSection.style.display = "block";
  } catch (err) {
    alert("Erro ao enviar código.");
  }
});

resetForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("forgotEmail").value;
  const code = document.getElementById("resetCode").value;
  const newPassword = document.getElementById("newPassword").value;
  
  try {
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    alert("Senha redefinida! Agora você pode fazer login.");
    forgotSection.style.display = "none";
    loginSection.style.display = "block";
  } catch (err) {
    alert(err.message);
  }
});

window.handleCredentialResponse = async (response) => {
  if (!response.credential) return alert("Erro: Token do Google não recebido.");
  
  const data = await apiAuth("/api/auth/google", {
    credential: response.credential,
  });
  handleSuccess(data);
};

