// ============================================================
// حماية لوحة التحكم (بدون كلمة مرور - دخول مباشر)
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

// ============================================================
// تشغيل حماية الأدمن
// ============================================================

function initAdminAuth() {
  const loginForm = document.getElementById("adminLoginForm");

  // لو الأدمن مسجل دخول بالفعل
  if (document.body.dataset.adminPage === "login" && isAdminAuthenticated()) {
    goToAdminExams();
    return;
  }

  // تسجيل الدخول (بدون أي كلمة مرور)
  if (loginForm) {
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      setAdminAuthenticated();
      goToAdminExams();
    });
  }

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
