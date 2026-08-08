import { getAllExams, updateExamStatus } from "../includes/functions.js?v=2.2.0";

// --- منطق حماية الصفحة بكلمة المرور ---
function initPasswordProtection() {
  const REQUIRED_PASS = "mike213510#";
  const AUTH_KEY = "admin_authenticated";

  const overlay = document.getElementById("authOverlay");
  const input = document.getElementById("passInput");
  const btn = document.getElementById("passSubmitBtn");
  const errorMsg = document.getElementById("passError");

  // إذا تم إدخال كلمة المرور سابقاً في نفس الجلسة، يتم إخفاء النافذة فوراً
  if (sessionStorage.getItem(AUTH_KEY) === "true") {
    if (overlay) overlay.style.display = "none";
    return true;
  }

  function verify() {
    if (input && input.value === REQUIRED_PASS) {
      sessionStorage.setItem(AUTH_KEY, "true");
      if (overlay) overlay.style.display = "none";
      if (errorMsg) errorMsg.style.display = "none";
    } else {
      if (errorMsg) errorMsg.style.display = "block";
      if (input) {
        input.value = "";
        input.focus();
      }
    }
  }

  if (btn) {
    btn.addEventListener("click", verify);
  }

  if (input) {
    input.focus();
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") verify();
    });
  }

  return false;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function checkIsOpen(status) {
  if (status === null || status === undefined) return true;
  if (typeof status === "boolean") return status;
  if (typeof status === "number") return status === 1;
  if (typeof status === "string") return status.toLowerCase() === "true" || status === "1";
  return Boolean(status);
}

async function renderExams() {
  const grid = document.getElementById("examsGrid");
  if (!grid) return;

  try {
    const exams = await getAllExams();

    if (!exams || !exams.length) {
      grid.innerHTML = `
        <div class="idx-empty">
          <i class="fa-solid fa-circle-exclamation"></i>
          <span>لا توجد امتحانات متاحة حالياً.</span>
        </div>`;
      return;
    }

    grid.innerHTML = exams
      .map((exam) => {
        const examSlug = exam.slug || exam.id;
        const isOpen = checkIsOpen(exam.is_open);
        
        const currentOrigin = window.location.origin;
        const currentPath = window.location.pathname.substring(
          0,
          window.location.pathname.lastIndexOf("/") + 1
        );
        const examUrl = `${currentOrigin}${currentPath}exam.html?slug=${encodeURIComponent(examSlug)}`;

        const statusBadge = isOpen
          ? `<span class="status-badge open"><i class="fa-solid fa-lock-open"></i> مفتوح</span>`
          : `<span class="status-badge closed"><i class="fa-solid fa-lock"></i> مغلق</span>`;

        const toggleBtn = isOpen
          ? `<button type="button" class="btn-action toggle-btn danger" data-id="${exam.id}" data-open="true">
              <i class="fa-solid fa-lock"></i> إغلاق الامتحان
             </button>`
          : `<button type="button" class="btn-action toggle-btn success" data-id="${exam.id}" data-open="false">
              <i class="fa-solid fa-lock-open"></i> فتح الامتحان
             </button>`;

        const startBtnClass = isOpen ? "btn-action primary" : "btn-action primary disabled";
        const startBtnClick = isOpen ? "" : 'onclick="event.preventDefault(); alert(\'هذا الامتحان مغلق حالياً.\');"';

        return `
        <div class="idx-card">
          <div class="idx-card-top">
            <div class="idx-card-header">
              <div class="idx-card-icon"><i class="fa-solid fa-file-pen"></i></div>
              ${statusBadge}
            </div>
            <h3 class="idx-card-title">${escapeHtml(exam.name)}</h3>
            <p class="idx-card-desc">${escapeHtml(exam.description || "اضغط أدناه للبدء في أداء هذا الامتحان فوراً.")}</p>
          </div>
          
          <div class="idx-card-actions">
            <a href="exam.html?slug=${encodeURIComponent(examSlug)}" class="${startBtnClass}" ${startBtnClick}>
              <i class="fa-solid fa-play"></i> ابدأ الامتحان
            </a>
            <button type="button" class="btn-action secondary copy-btn" data-url="${escapeHtml(examUrl)}">
              <i class="fa-solid fa-copy"></i> نسخ الرابط
            </button>
            ${toggleBtn}
          </div>
        </div>`;
      })
      .join("");

    // أحداث زر الفتح/الإغلاق
    document.querySelectorAll(".toggle-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const targetBtn = e.currentTarget;
        const examId = Number(targetBtn.getAttribute("data-id"));
        const currentIsOpen = targetBtn.getAttribute("data-open") === "true";
        const newIsOpen = !currentIsOpen;

        targetBtn.disabled = true;
        targetBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري...`;

        try {
          await updateExamStatus(examId, newIsOpen);
          await renderExams();
        } catch (err) {
          console.error("Error toggling exam status:", err);
          alert("حدث خطأ أثناء تغيير حالة الامتحان. يرجى المحاولة لاحقاً.");
          await renderExams();
        }
      });
    });

    // أحداث زر نسخ الرابط
    document.querySelectorAll(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const targetBtn = e.currentTarget;
        const url = targetBtn.getAttribute("data-url");
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(url);
          } else {
            const ta = document.createElement("textarea");
            ta.value = url;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
          }

          const originalHtml = targetBtn.innerHTML;
          targetBtn.innerHTML = `<i class="fa-solid fa-check" style="color: #10b981;"></i> تم النسخ!`;
          targetBtn.style.borderColor = "#10b981";

          setTimeout(() => {
            targetBtn.innerHTML = originalHtml;
            targetBtn.style.borderColor = "var(--border)";
          }, 2000);
        } catch (err) {
          alert("يمكنك نسخ الرابط التالي:\n" + url);
        }
      });
    });
  } catch (err) {
    console.error("Error loading exams:", err);
    grid.innerHTML = `
      <div class="idx-empty error">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>حدث خطأ أثناء تحميل الامتحانات. يرجى إعادة المحاولة لاحقاً.</span>
      </div>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initPasswordProtection();
  renderExams();
});
