// ============================================================
// حماية لوحة التحكم عبر كلمة مرور محفوظة في Supabase
// ============================================================

const ADMIN_ACCESS_KEY = "exam_admin_access_v1";

function isAdminAuthenticated() {
  return localStorage.getItem(ADMIN_ACCESS_KEY) === "true";
}

function setAdminAuthenticated() {
  localStorage.setItem(ADMIN_ACCESS_KEY, "true");
}

function clearAdminAuthenticated() {
  localStorage.removeItem(ADMIN_ACCESS_KEY);
}

function goToAdminLogin() {
  if (location.pathname.toLowerCase().includes("/admin/index.html")) return;
  location.href = "index.html";
}

function goToAdminExams() {
  location.href = "exams.html";
}

async function verifyAdminPassword(password) {
  const { data, error } = await supabaseClient.rpc("check_admin_password", {
    p_password: password,
  });
  if (error) throw error;
  return !!data;
}

function toggleAdminPassword(inputId, button) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const nextType = input.type === "password" ? "text" : "password";
  input.type = nextType;

  const icon = button ? button.querySelector("i") : null;
  if (icon) {
    icon.className =
      nextType === "password" ? "fa-solid fa-eye" : "fa-solid fa-eye-slash";
  }

  if (button)
    button.setAttribute("aria-pressed", nextType === "text" ? "true" : "false");
}

function initAdminAuth() {
  const loginForm = document.getElementById("adminLoginForm");
  const loginError = document.getElementById("loginError");
  const passwordInput = document.getElementById("adminPassword");

  if (document.body.dataset.adminPage === "login" && isAdminAuthenticated()) {
    goToAdminExams();
    return;
  }

  if (loginForm && passwordInput) {
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (loginError) loginError.textContent = "";

      verifyAdminPassword(passwordInput.value)
        .then((isValid) => {
          if (isValid) {
            setAdminAuthenticated();
            goToAdminExams();
            return;
          }

          if (loginError) loginError.textContent = "كلمة المرور غير صحيحة";
          passwordInput.focus();
          passwordInput.select();
        })
        .catch(() => {
          if (loginError) loginError.textContent = "تعذر التحقق من كلمة المرور";
        });
    });
  }

  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () =>
      toggleAdminPassword(button.dataset.passwordToggle, button),
    );
  });

  document.querySelectorAll("[data-admin-logout]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      clearAdminAuthenticated();
      goToAdminLogin();
    });
  });

  if (
    document.body.dataset.requireAdmin === "true" &&
    !isAdminAuthenticated()
  ) {
    goToAdminLogin();
  }
}

document.addEventListener("DOMContentLoaded", initAdminAuth);
