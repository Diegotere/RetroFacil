// theme.js
document.addEventListener("DOMContentLoaded", () => {
  const themeToggleBtn = document.getElementById("themeToggle");
  if (!themeToggleBtn) return;

  const currentTheme = localStorage.getItem("theme");
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  // Função para aplicar o tema e atualizar o botão
  function applyTheme(theme) {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      themeToggleBtn.textContent = "☀️ Modo Claro";
    } else {
      document.documentElement.classList.remove("dark");
      themeToggleBtn.textContent = "🌙 Modo Escuro";
    }
  }

  // Define o tema inicial baseado no localStorage ou na preferência do sistema
  if (currentTheme) {
    applyTheme(currentTheme);
  } else if (systemPrefersDark) {
    applyTheme("dark");
  }

  // Toggle do tema ao clicar
  themeToggleBtn.addEventListener("click", () => {
    const isDark = document.documentElement.classList.contains("dark");
    const newTheme = isDark ? "light" : "dark";
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme);
  });
});
