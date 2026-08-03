// ============================================================
// إعدادات الاتصال بـ Supabase
// غيّر القيمتين تحت بمعلومات مشروعك (Project Settings > API)
// ============================================================
const SUPABASE_URL = "https://ubavepfzrwtlinsansxi.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_v2sbdwmrgbiwoTtUFuwVsA_2UwJbuBz";

// عميل Supabase مشترك بين كل الصفحات
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

// رقم واتساب الإدارة لفتح الامتحانات المقفولة
const ADMIN_WHATSAPP_NUMBER = "201277573021";

const THEME_STORAGE_KEY = "exam_system_theme";
let dialogResolver = null;

function whatsappLink(message) {
  const text = encodeURIComponent(message || "أريد فتح الامتحان من فضلك");
  return `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${text}`;
}

function getPreferredTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyTheme(theme) {
  const resolved = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = resolved;
  localStorage.setItem(THEME_STORAGE_KEY, resolved);
  const btn = document.getElementById("themeToggleBtn");
  if (btn) {
    btn.setAttribute(
      "aria-label",
      resolved === "dark" ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن",
    );
    btn.innerHTML =
      resolved === "dark"
        ? '<i class="fa-solid fa-sun"></i><span>Light</span>'
        : '<i class="fa-solid fa-moon"></i><span>Dark</span>';
  }
}

function toggleTheme() {
  applyTheme(
    document.documentElement.dataset.theme === "dark" ? "light" : "dark",
  );
}

function ensureGlobalShell() {
  if (!document.body) return;

  if (!document.getElementById("globalDialog")) {
    const dialog = document.createElement("div");
    dialog.id = "globalDialog";
    dialog.className = "global-dialog hidden";
    dialog.innerHTML = `
      <div class="global-dialog__backdrop" data-dialog-close></div>
      <div class="global-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="globalDialogTitle">
        <div class="global-dialog__head">
          <div>
            <div class="global-dialog__eyebrow" id="globalDialogEyebrow">تنبيه</div>
            <h3 id="globalDialogTitle"></h3>
          </div>
          <button type="button" class="icon-button" data-dialog-close aria-label="إغلاق الحوار">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="global-dialog__body" id="globalDialogBody"></div>
        <div class="global-dialog__actions" id="globalDialogActions"></div>
      </div>`;
    dialog.addEventListener("click", (event) => {
      if (event.target.matches("[data-dialog-close]")) closeDialog(false);
    });
    document.body.appendChild(dialog);
  }

  if (!document.getElementById("themeToggleBtn")) {
    const btn = document.createElement("button");
    btn.id = "themeToggleBtn";
    btn.type = "button";
    btn.className = "theme-toggle btn btn-ghost btn-sm";
    btn.addEventListener("click", toggleTheme);
    document.body.appendChild(btn);
  }

  if (!document.getElementById("developerBadge")) {
    const badge = document.createElement("div");
    badge.id = "developerBadge";
    badge.className = "developer-badge";
    badge.innerHTML =
      '<i class="fa-solid fa-wand-magic-sparkles"></i><span>Developed by Mike Talaat</span>';
    document.body.appendChild(badge);
  }

  applyTheme(getPreferredTheme());
}

function openDialog({
  title = "تنبيه",
  eyebrow = "تنبيه",
  message = "",
  actions = [],
}) {
  ensureGlobalShell();
  const dialog = document.getElementById("globalDialog");
  const titleEl = document.getElementById("globalDialogTitle");
  const eyebrowEl = document.getElementById("globalDialogEyebrow");
  const bodyEl = document.getElementById("globalDialogBody");
  const actionsEl = document.getElementById("globalDialogActions");

  titleEl.textContent = title;
  eyebrowEl.textContent = eyebrow;
  bodyEl.innerHTML = message;
  actionsEl.innerHTML = "";

  return new Promise((resolve) => {
    dialogResolver = resolve;
    if (!actions.length) {
      actions = [{ text: "حسنًا", variant: "primary", value: true }];
    }

    actions.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `btn ${action.variant === "danger" ? "btn-danger" : action.variant === "outline" ? "btn-outline" : "btn-primary"}`;
      button.textContent = action.text;
      button.addEventListener("click", () => closeDialog(action.value));
      actionsEl.appendChild(button);
    });

    dialog.classList.remove("hidden");
  });
}

function closeDialog(result) {
  const dialog = document.getElementById("globalDialog");
  if (!dialog) return;
  dialog.classList.add("hidden");
  if (dialogResolver) {
    const resolve = dialogResolver;
    dialogResolver = null;
    resolve(result);
  }
}

function showAlert(message, title = "تنبيه") {
  return openDialog({
    title,
    eyebrow: "رسالة",
    message: `<div class="dialog-message">${message}</div>`,
    actions: [{ text: "حسنًا", variant: "primary", value: true }],
  });
}

function showConfirm(
  message,
  title = "تأكيد",
  confirmText = "تأكيد",
  cancelText = "إلغاء",
) {
  return openDialog({
    title,
    eyebrow: "إجراء مطلوب",
    message: `<div class="dialog-message">${message}</div>`,
    actions: [
      { text: cancelText, variant: "outline", value: false },
      { text: confirmText, variant: "danger", value: true },
    ],
  });
}

document.addEventListener("DOMContentLoaded", ensureGlobalShell);
