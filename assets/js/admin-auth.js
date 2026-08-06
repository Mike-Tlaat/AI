// ============================================================
// حماية لوحة التحكم عبر كلمة مرور محفوظة في Supabase
// ============================================================

const ADMIN_ACCESS_KEY = "exam_admin_access_v2";

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

// ============================================================
// التحقق من كلمة مرور الأدمن من Supabase
// ============================================================

async function verifyAdminPassword(password) {
  const cleanPassword = password.trim();

  const { data, error } = await supabaseClient.rpc("check_admin_password", {
    p_password: cleanPassword,
  });

  if (error) {
    console.error("Supabase RPC Error:", error);
    throw error;
  }

  console.log("Supabase response:", data);

  return data === true;
}

// ============================================================
// إظهار / إخفاء كلمة المرور
// ============================================================

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

  if (button) {
    button.setAttribute("aria-pressed", nextType === "text" ? "true" : "false");
  }
}

// ============================================================
// تشغيل حماية الأدمن
// ============================================================

function initAdminAuth() {
  const loginForm = document.getElementById("adminLoginForm");
  const loginError = document.getElementById("loginError");
  const passwordInput = document.getElementById("adminPassword");

  // لو الأدمن مسجل دخول بالفعل
  if (document.body.dataset.adminPage === "login" && isAdminAuthenticated()) {
    goToAdminExams();
    return;
  }

  // تسجيل الدخول
  if (loginForm && passwordInput) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (loginError) {
        loginError.textContent = "";
      }

      try {
        const isValid = await verifyAdminPassword(passwordInput.value);

        if (isValid) {
          setAdminAuthenticated();

          goToAdminExams();

          return;
        }

        if (loginError) {
          loginError.textContent = "كلمة المرور غير صحيحة";
        }

        passwordInput.focus();
        passwordInput.select();
      } catch (error) {
        console.error("Admin login failed:", error);

        if (loginError) {
          loginError.textContent = "تعذر التحقق من كلمة المرور";
        }
      }
    });
  }

  // زر إظهار كلمة المرور
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleAdminPassword(button.dataset.passwordToggle, button);
    });
  });

  // تسجيل الخروج
  document.querySelectorAll("[data-admin-logout]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();

      clearAdminAuthenticated();

      goToAdminLogin();
    });
  });

  // حماية الصفحات الداخلية
  if (
    document.body.dataset.requireAdmin === "true" &&
    !isAdminAuthenticated()
  ) {
    goToAdminLogin();
  }
}

document.addEventListener("DOMContentLoaded", initAdminAuth);
