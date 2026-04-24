const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const loginSection = document.getElementById("loginSection");
const registerSection = document.getElementById("registerSection");

// Se já estiver logado, redireciona
if (localStorage.getItem("retrofacil_token")) {
  window.location.href = "index.html";
}

document.getElementById("showRegister").addEventListener("click", () => {
  loginSection.style.display = "none";
  registerSection.style.display = "block";
});

document.getElementById("showLogin").addEventListener("click", () => {
  registerSection.style.display = "none";
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
  window.location.href = "index.html";
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

window.handleCredentialResponse = async (response) => {
  if (!response.credential) return alert("Erro: Token do Google não recebido.");
  
  const data = await apiAuth("/api/auth/google", {
    credential: response.credential,
  });
  handleSuccess(data);
};
