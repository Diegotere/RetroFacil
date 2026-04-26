// theme.js

// Função global para alternar visibilidade da senha (definida fora do DOMContentLoaded para ser acessível imediatamente)
window.togglePassword = function(inputId, button) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPassword = input.getAttribute("type") === "password";
  input.setAttribute("type", isPassword ? "text" : "password");
  
  if (button) {
    button.textContent = isPassword ? "Ocultar" : "Mostrar";
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const themeToggleBtn = document.getElementById("themeToggle");
  if (!themeToggleBtn) return;

  const currentTheme = localStorage.getItem("theme");
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  // Função para aplicar o tema e atualizar o botão
  function applyTheme(theme) {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      if (themeToggleBtn.type === "checkbox") {
        themeToggleBtn.checked = true;
      } else {
        themeToggleBtn.textContent = "☀️ Modo Claro";
      }
    } else {
      document.documentElement.classList.remove("dark");
      if (themeToggleBtn.type === "checkbox") {
        themeToggleBtn.checked = false;
      } else {
        themeToggleBtn.textContent = "🌙 Modo Escuro";
      }
    }
  }

  // Define o tema inicial baseado no localStorage ou na preferência do sistema
  if (currentTheme) {
    applyTheme(currentTheme);
  } else if (systemPrefersDark) {
    applyTheme("dark");
  }

  // Toggle do tema ao clicar
  themeToggleBtn.addEventListener("change", () => {
    const isDark = themeToggleBtn.checked;
    const newTheme = isDark ? "dark" : "light";
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme);
  });
});
