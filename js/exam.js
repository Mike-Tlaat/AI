// js/exam.js - تسجيل الطالب -> اختيار الأنشطة -> الامتحان المباشر -> التصحيح والتسليم

import {
  getExamBySlug,
  getExamById,
  getAttempt,
  createAttempt,
  checkExistingAttempt,
  ensureExamStarted,
  getChurchesForExam,
  getPackageCategoriesForExam,
  savePackageSelections,
  getQuestionsByExam,
  submitExamAttempt,
} from "../includes/functions.js?v=1.0.0";

// =======================================
// آلية التحديث التلقائي للنسخة (Cache Control)
// =======================================
const CURRENT_APP_VERSION = "3.0.0";
(function checkAppVersion() {
  const savedVersion = localStorage.getItem("app_sys_version");
  if (savedVersion !== CURRENT_APP_VERSION) {
    localStorage.setItem("app_sys_version", CURRENT_APP_VERSION);
    if (savedVersion) {
      window.location.reload(true);
    }
  }
})();

const qs = new URLSearchParams(location.search);
const rawParam = (
  qs.get("slug") ||
  qs.get("exam") ||
  qs.get("id") ||
  ""
).trim();

const screens = {
  loading: document.getElementById("loadingScreen"),
  registration: document.getElementById("registrationScreen"),
  packages: document.getElementById("packagesScreen"),
  exam: document.getElementById("examScreen"),
};

function showScreen(name) {
  Object.values(screens).forEach((el) => el?.classList.add("hidden"));
  screens[name]?.classList.remove("hidden");
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

const attemptStorageKey = (examId) => `attempt_id_${examId}`;

let currentExam = null;
let currentAttempt = null;
let isSubmittingLock = false;

/* =======================================
   تحديث عنوان الصفحة والمعاينة (Link Preview)
======================================= */
function updatePageTitle(exam) {
  if (!exam) return;
  const examName = exam.name || "";
  const titleText = examName.startsWith("امتحان")
    ? examName
    : `امتحان ${examName}`;

  document.title = titleText;

  const setMeta = (selector, attr, value, createAttrs) => {
    let el = document.querySelector(selector);
    if (!el) {
      el = document.createElement("meta");
      Object.entries(createAttrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.head.appendChild(el);
    }
    el.setAttribute(attr, value);
  };

  setMeta('meta[property="og:title"]', "content", titleText, {
    property: "og:title",
  });
  setMeta('meta[name="twitter:title"]', "content", titleText, {
    name: "twitter:title",
  });
  setMeta(
    'meta[property="og:description"]',
    "content",
    "اضغط للدخول إلى الامتحان مباشرة",
    {
      property: "og:description",
    },
  );
  // ملحوظة: هذا التحديث يحدث بجافاسكريبت بعد تحميل الصفحة، فبيغيّر عنوان تبويب
  // المتصفح فوراً، لكن معاينة الروابط في واتساب/فيسبوك بتُقرأ بدون تشغيل جافاسكريبت
  // فممكن تفضل تعرض النص الافتراضي في أول لحظة قبل ما تُفتح الصفحة بالكامل.
  // لحل هذا نهائياً على مستوى المعاينة راجع ملاحظة "OG Preview" في README.
}

/* =======================================
   المودال المشترك
======================================= */
const modalOverlay = document.getElementById("customModal");
const modalIcon = document.getElementById("modalIcon");
const modalTitle = document.getElementById("modalTitle");
const modalText = document.getElementById("modalText");
const modalSummary = document.getElementById("modalSummary");
const modalButtons = document.getElementById("modalButtons");

function showModal({
  type = "alert",
  title,
  text = "",
  summaryHtml = null,
  confirmText = "حسناً",
  cancelText = "إلغاء",
  onConfirm = null,
  onCancel = null,
}) {
  if (!modalOverlay) return;
  modalTitle.textContent = title;
  modalText.textContent = text;
  modalText.classList.toggle("hidden", !text);

  if (summaryHtml) {
    modalSummary.innerHTML = summaryHtml;
    modalSummary.classList.remove("hidden");
  } else {
    modalSummary.classList.add("hidden");
  }

  modalIcon.className =
    "modal-icon-wrapper " +
    (type === "alert"
      ? "alert-type"
      : type === "success"
        ? "success-type"
        : "confirm-type");
  modalIcon.innerHTML =
    type === "alert"
      ? '<i class="fa-solid fa-triangle-exclamation"></i>'
      : '<i class="fa-solid fa-circle-question"></i>';

  modalButtons.innerHTML = "";
  if (type === "confirm") {
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "modal-btn modal-btn-secondary";
    cancelBtn.textContent = cancelText;
    cancelBtn.onclick = () => {
      modalOverlay.classList.remove("active");
      if (onCancel) onCancel();
    };
    modalButtons.appendChild(cancelBtn);
  }
  const confirmBtn = document.createElement("button");
  confirmBtn.className = "modal-btn modal-btn-primary";
  confirmBtn.textContent = confirmText;
  confirmBtn.onclick = () => {
    modalOverlay.classList.remove("active");
    if (onConfirm) onConfirm();
  };
  modalButtons.appendChild(confirmBtn);

  modalOverlay.classList.add("active");
}

/* =======================================
   نقطة البداية
======================================= */
async function init() {
  if (!rawParam) {
    showNotFoundMessage("لم يتم تحديد امتحان في رابط الصفحة!");
    return;
  }

  try {
    currentExam = await getExamBySlug(rawParam);
    if (!currentExam) {
      const numericId = Number(rawParam);
      if (!isNaN(numericId) && numericId > 0) {
        currentExam = await getExamById(numericId);
      }
    }
  } catch (err) {
    console.error("❌ خطأ أثناء الاتصال بقاعدة البيانات:", err);
  }

  if (!currentExam) {
    showNotFoundMessage(
      "لم نتمكن من العثور على امتحان بهذا الرابط. تأكد من الرابط أو تواصل مع الإدارة.",
    );
    return;
  }

  if (currentExam.is_open === false) {
    showClosedExamScreen(currentExam);
    return;
  }

  updatePageTitle(currentExam);

  const savedId = localStorage.getItem(attemptStorageKey(currentExam.id));
  if (savedId) {
    const attempt = await getAttempt(Number(savedId));
    if (
      attempt &&
      attempt.exam_id === currentExam.id &&
      attempt.status === "pending"
    ) {
      currentAttempt = attempt;
    } else {
      localStorage.removeItem(attemptStorageKey(currentExam.id));
    }
  }

  if (!currentAttempt) {
    await showRegistration();
    return;
  }

  if (!currentAttempt.packages_confirmed) {
    showPackages();
    return;
  }

  startExam();
}

function showNotFoundMessage(msg) {
  document.body.innerHTML = `
    <div class="state-screen">
      <div class="state-card">
        <div class="state-icon not-found"><i class="fa-solid fa-file-circle-question"></i></div>
        <h2>الامتحان غير موجود</h2>
        <p>${escapeHtml(msg)}</p>
        <button id="exitAppBtn" class="state-btn danger">
          <i class="fa-solid fa-right-from-bracket"></i> خروج
        </button>
      </div>
    </div>`;

  document.getElementById("exitAppBtn")?.addEventListener("click", () => {
    window.close();
    setTimeout(() => {
      window.location.href = "about:blank";
    }, 100);
  });
}

function showSubmittedThankYouScreen() {
  document.body.innerHTML = `
    <div class="state-screen">
      <div class="state-card">
        <div class="state-icon success"><i class="fa-solid fa-circle-check"></i></div>
        <h2>تم تسليم الامتحان بنجاح!</h2>
        <p>إجاباتك محفوظة بأمان. نتيجة هذا الامتحان تظهر عن طريق صفحة "الاستعلام عن النتيجة" لاحقاً وليس مباشرة.</p>
        <a href="lookup.html" class="state-btn">
          <i class="fa-solid fa-magnifying-glass"></i> الذهاب لصفحة الاستعلام عن النتيجة
        </a>
      </div>
    </div>`;
}

function showClosedExamScreen(exam) {
  const customMsg = (exam.closed_message || "").trim();
  const defaultMsg =
    "هذا الامتحان مقفول حالياً من الإدارة، وده ممكن يكون لأن وقت الامتحان انتهى أو معاده لسه مفتحش. لو محتاج تدخل الامتحان، تواصل مع المسؤول عن الامتحان.";

  document.body.innerHTML = `
    <div class="state-screen">
      <div class="state-card">
        <div class="state-icon closed"><i class="fa-solid fa-lock"></i></div>
        <h2>${escapeHtml(exam.name || "الامتحان")}</h2>
        <span class="state-pill"><i class="fa-solid fa-ban"></i> مقفول حالياً</span>
        <p>${escapeHtml(customMsg || defaultMsg)}</p>
        <button id="exitAppBtn" class="state-btn">
          <i class="fa-solid fa-right-from-bracket"></i> خروج
        </button>
      </div>
    </div>`;

  document.getElementById("exitAppBtn")?.addEventListener("click", () => {
    window.close();
    setTimeout(() => {
      window.location.href = "about:blank";
    }, 100);
  });
}

/* =======================================
   المرحلة 1: التسجيل
======================================= */
async function showRegistration() {
  showScreen("registration");
  const form = document.getElementById("registrationForm");
  const errorBox = document.getElementById("registrationError");
  const errorText = document.getElementById("registrationErrorText");

  // تحميل قائمة الكنائس الخاصة بهذا الامتحان (لو مفيش أي كنيسة متعلقة بالامتحان، نخفي الحقل بالكامل)
  const churchSelect = document.getElementById("churchSelect");
  const churchFormGroup = churchSelect?.closest(".form-group");
  let churchFieldEnabled = false;

  if (churchSelect) {
    try {
      const churches = await getChurchesForExam(currentExam.id);
      if (churches.length) {
        churchFieldEnabled = true;
        churchSelect.required = true;
        churchFormGroup?.classList.remove("hidden");
        churchSelect.innerHTML =
          `<option value="" disabled selected>اختر كنيستك من القائمة...</option>` +
          churches
            .map(
              (c) =>
                `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`,
            )
            .join("");
      } else {
        churchSelect.required = false;
        churchFormGroup?.classList.add("hidden");
      }
    } catch {
      churchSelect.innerHTML = `<option value="" disabled selected>حدث خطأ في تحميل الكنائس</option>`;
    }
  }

  if (!form || form.dataset.bound) return;
  form.dataset.bound = "true";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.classList.add("hidden");

    const name = form.user_name.value.trim();
    const church = churchFieldEnabled ? form.user_church.value.trim() : "";
    const phone = form.user_phone.value.trim();

    if (!name || (churchFieldEnabled && !church) || !phone) {
      errorText.textContent = "الرجاء ملء جميع الحقول المطلوبة بشكل صحيح.";
      errorBox.classList.remove("hidden");
      return;
    }
    if (!/^[0-9]{11}$/.test(phone)) {
      errorText.textContent = "⚠️ يرجى إدخال رقم هاتف صحيح مكون من 11 رقم.";
      errorBox.classList.remove("hidden");
      return;
    }

    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;

    try {
      const used = await checkExistingAttempt(currentExam.id, phone);
      if (used) {
        errorText.textContent =
          "⚠️ عذراً، هذا الحساب أو رقم الهاتف تم استخدامه لأداء الامتحان مسبقاً.";
        errorBox.classList.remove("hidden");
        submitBtn.disabled = false;
        return;
      }

      const attempt = await createAttempt(currentExam.id, name, church, phone);
      localStorage.setItem(
        attemptStorageKey(currentExam.id),
        String(attempt.id),
      );
      currentAttempt = attempt;
      showPackages();
    } catch (err) {
      errorText.textContent = "حدث خطأ في الاتصال بقاعدة البيانات.";
      errorBox.classList.remove("hidden");
      submitBtn.disabled = false;
    }
  });
}

/* =======================================
   المرحلة 2: اختيار الأنشطة
======================================= */
async function showPackages() {
  showScreen("packages");
  const container = document.getElementById("packagesContainer");
  const categories = await getPackageCategoriesForExam(currentExam.id);

  if (!categories.length) {
    // مفيش أي أقسام أنشطة لهذا الامتحان - نتخطى الشاشة تلقائياً
    await ensureExamStarted(currentAttempt.id);
    currentAttempt = await getAttempt(currentAttempt.id);
    startExam();
    return;
  }

  container.innerHTML = categories
    .map((cat) => {
      const limitParts = [];
      if (cat.min_select > 0)
        limitParts.push(`لازم تختار ${cat.min_select} على الأقل`);
      limitParts.push(
        cat.max_select ? `بحد أقصى ${cat.max_select}` : "بلا حد أقصى",
      );

      return `
      <div class="pkg-card" data-category-id="${cat.id}" data-category="${escapeHtml(cat.name)}" data-min="${cat.min_select}" data-max="${cat.max_select ?? ""}">
        <div class="pkg-card-title">
          <h3>${escapeHtml(cat.name)}</h3>
          <span class="limit-badge">${limitParts.join(" - ")}</span>
        </div>
        <div class="pkg-options">
          ${
            cat.items.length
              ? cat.items.map((item) => optionHtml(cat.id, item)).join("")
              : `<div class="pkg-empty-note">لا توجد عناصر متاحة حالياً.</div>`
          }
        </div>
      </div>`;
    })
    .join("");

  container.querySelectorAll(".pkg-card").forEach((card) => {
    const maxSelect = card.dataset.max ? Number(card.dataset.max) : null;
    const catName = card.dataset.category;

    card.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.addEventListener("change", (e) => {
        if (maxSelect !== null) {
          const checkedCount = card.querySelectorAll(
            'input[type="checkbox"]:checked',
          ).length;
          if (checkedCount > maxSelect) {
            e.target.checked = false;
            e.target
              .closest(".pkg-option")
              ?.classList.remove("selected-active");
            showModal({
              type: "alert",
              title: "⚠️ الحد الأقصى للاختيار",
              confirmText: "حسناً، فهمت",
              text: `لا يمكنك اختيار أكثر من ${maxSelect} من قسم "${catName}".`,
            });
            return;
          }
        }
        e.target
          .closest(".pkg-option")
          ?.classList.toggle("selected-active", e.target.checked);
      });
    });
  });

  const reviewBtn = document.getElementById("reviewPackagesBtn");
  if (reviewBtn) {
    const newReviewBtn = reviewBtn.cloneNode(true);
    reviewBtn.parentNode.replaceChild(newReviewBtn, reviewBtn);

    newReviewBtn.addEventListener("click", () => {
      // تحقق من الحد الأدنى المطلوب لكل قسم قبل المتابعة
      let missingCategory = null;
      container.querySelectorAll(".pkg-card").forEach((card) => {
        const min = Number(card.dataset.min) || 0;
        if (min > 0) {
          const checkedCount = card.querySelectorAll(
            'input[type="checkbox"]:checked',
          ).length;
          if (checkedCount < min && !missingCategory) {
            missingCategory = {
              name: card.dataset.category,
              min,
              count: checkedCount,
            };
          }
        }
      });

      if (missingCategory) {
        showModal({
          type: "alert",
          title: "⚠️ اختيار غير مكتمل",
          confirmText: "حسناً، فهمت",
          text: `يجب اختيار ${missingCategory.min} على الأقل من قسم "${missingCategory.name}" (اخترت ${missingCategory.count} فقط).`,
        });
        return;
      }

      const selections = collectSelections(container);
      const categoriesById = new Map(categories.map((c) => [c.id, c]));
      const summaryHtml = Object.entries(selections)
        .filter(([, itemIds]) => itemIds && itemIds.length)
        .map(([catId, itemIds]) => {
          const cat = categoriesById.get(Number(catId));
          const itemNames = itemIds
            .map((id) => cat.items.find((it) => it.id === id)?.name)
            .filter(Boolean);
          return `<div style="margin-bottom:0.5rem;"><strong>${escapeHtml(cat?.name || "")}:</strong> ${itemNames.map(escapeHtml).join("، ")}</div>`;
        })
        .join("");

      showModal({
        type: "success",
        title: "تأكيد الاختيار",
        summaryHtml:
          summaryHtml ||
          `<div style="color:#94a3b8;">لم تقم باختيار أي نشاط (يمكنك الاستمرار).</div>`,
        confirmText: "تأكيد والدخول للامتحان",
        cancelText: "تعديل الاختيار",
        onCancel: () => {},
        onConfirm: async () => {
          await savePackageSelections(
            currentAttempt.id,
            currentExam.id,
            selections,
          );
          await ensureExamStarted(currentAttempt.id);
          currentAttempt = await getAttempt(currentAttempt.id);
          startExam();
        },
      });
    });
  }
}

function optionHtml(categoryId, item) {
  return `<label class="pkg-option">
    <input type="checkbox" name="cat_${categoryId}" value="${item.id}">
    <span>${escapeHtml(item.name)}</span>
  </label>`;
}

function collectSelections(container) {
  const result = {};
  container.querySelectorAll(".pkg-card").forEach((card) => {
    const categoryId = Number(card.dataset.categoryId);
    if (!categoryId) return;
    const values = Array.from(card.querySelectorAll("input:checked")).map((i) =>
      Number(i.value),
    );
    result[categoryId] = values;
  });
  return result;
}

/* =======================================
   المرحلة 3: الامتحان المباشر
======================================= */
let questions = [];
let answers = {};
let attemptId = null;
let timerInterval = null;
let examStartedAtMs = null;

const answersStorageKey = () => `exam_ans_${attemptId}`;

async function startExam() {
  showScreen("exam");
  attemptId = currentAttempt.id;

  await ensureExamStarted(attemptId);
  const updatedAttempt = await getAttempt(attemptId);
  if (updatedAttempt) currentAttempt = updatedAttempt;

  questions = (await getQuestionsByExam(currentExam.id)) || [];

  document.getElementById("examTitle").textContent = currentExam.name;

  const stageEl = document.getElementById("examStage");
  if (stageEl) {
    const stageVal = currentExam.stage || currentExam.category || "";
    stageEl.textContent = stageVal ? `(${stageVal})` : "";
  }

  document.getElementById("userNameTag").textContent = currentAttempt.user_name;
  document.getElementById("userPhoneTag").textContent =
    currentAttempt.user_phone;

  try {
    answers = JSON.parse(localStorage.getItem(answersStorageKey())) || {};
  } catch {
    answers = {};
  }

  renderQuestions();
  evaluateProgress();
  startTimer();

  const submitBtn = document.getElementById("submitExamBtn");
  if (submitBtn) {
    const newSubmitBtn = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
    newSubmitBtn.addEventListener("click", () => validateAndSubmit(false));
  }
}

function renderQuestions() {
  const container = document.getElementById("questionsContainer");
  const typeLabels = {
    true_false: "صواب أم خطأ",
    multiple_choice: "اختيار من متعدد",
    location_source: "تحديد الموقع",
    fill_in_the_blank: "إكمال الفراغ",
    answer: "إجابة قصيرة",
    essay: "سؤال مقالي",
  };

  container.innerHTML = questions
    .map((q, index) => {
      const type = q.type;
      const savedAnswer = answers[index];
      let bodyHtml = "";

      if (type === "fill_in_the_blank") {
        const segments = String(q.question).split(/\.{3,}/u);
        const blanksCount = Math.max(segments.length - 1, 1);
        while (segments.length < blanksCount + 1) segments.push("");
        const userBlanks = Array.isArray(savedAnswer) ? savedAnswer : [];

        let text = "";
        for (let b = 0; b < blanksCount; b++) {
          text += escapeHtml(segments[b] || "").replace(/\n/g, "<br>");
          text += `<input type="text" class="blank-input" data-index="${index}" data-blank="${b}" value="${escapeHtml(userBlanks[b] || "")}" placeholder="الفراغ ${b + 1}">`;
        }
        text += escapeHtml(segments[blanksCount] || "").replace(/\n/g, "<br>");
        bodyHtml = `<div class="question-text fill-blank-text">${text}</div>`;
      } else {
        const questionText = escapeHtml(q.question).replace(/\n/g, "<br>");
        bodyHtml = `<div class="question-text">${questionText}</div>`;

        if (
          ["true_false", "multiple_choice", "location_source"].includes(type)
        ) {
          bodyHtml += `<div class="options-list">${(q.options || [])
            .map((opt) => {
              const selected = savedAnswer === opt ? "selected-active" : "";
              const checked = savedAnswer === opt ? "checked" : "";
              return `<label class="option-item ${selected}">
                <input type="radio" data-index="${index}" name="q_${index}" value="${escapeHtml(opt)}" ${checked}>
                <span>${escapeHtml(opt)}</span>
              </label>`;
            })
            .join("")}</div>`;
        } else if (type === "essay" || type === "answer") {
          bodyHtml += `<textarea class="text-answer-input" data-index="${index}" placeholder="اكتب إجابتك بالتفصيل هنا...">${escapeHtml(typeof savedAnswer === "string" ? savedAnswer : "")}</textarea>`;
        }
      }

      return `
        <div class="question-card" id="q_card_${index}" data-index="${index}" data-type="${type}">
          <div class="question-card-header">
            <span class="question-number">${index + 1}</span>
            <span class="question-type-badge">${typeLabels[type] || type}</span>
          </div>
          ${bodyHtml}
        </div>`;
    })
    .join("");

  container.querySelectorAll('input[type="radio"]').forEach((input) => {
    input.addEventListener("change", () => {
      const index = input.dataset.index;
      answers[index] = input.value;
      const card = input.closest(".question-card");
      card
        .querySelectorAll(".option-item")
        .forEach((it) => it.classList.remove("selected-active"));
      input.closest(".option-item").classList.add("selected-active");
      persistAndEvaluate();
    });
  });

  container.querySelectorAll(".blank-input").forEach((input) => {
    input.addEventListener("input", () => {
      const index = input.dataset.index;
      const blank = Number(input.dataset.blank);
      const arr = Array.isArray(answers[index]) ? [...answers[index]] : [];
      arr[blank] = input.value;
      answers[index] = arr;
      persistAndEvaluate();
    });
  });

  container.querySelectorAll(".text-answer-input").forEach((input) => {
    input.addEventListener("input", () => {
      answers[input.dataset.index] = input.value;
      persistAndEvaluate();
    });
  });
}

function persistAndEvaluate() {
  localStorage.setItem(answersStorageKey(), JSON.stringify(answers));
  evaluateProgress();
}

function isQuestionAnswered(questionObj, value) {
  if (!questionObj) return false;
  const type = questionObj.type;

  if (type === "fill_in_the_blank") {
    const segments = String(questionObj.question).split(/\.{3,}/u);
    const expectedBlanks = Math.max(segments.length - 1, 1);

    if (!Array.isArray(value) || value.length < expectedBlanks) return false;

    for (let i = 0; i < expectedBlanks; i++) {
      if (String(value[i] ?? "").trim() === "") return false;
    }
    return true;
  }

  return (
    value !== undefined &&
    !Array.isArray(value) &&
    String(value ?? "").trim() !== ""
  );
}

function evaluateProgress() {
  let answeredCount = 0;
  questions.forEach((q, index) => {
    if (isQuestionAnswered(q, answers[index])) answeredCount++;
  });
  const total = questions.length;
  const pct = total > 0 ? (answeredCount / total) * 100 : 0;
  const bar = document.getElementById("progressBar");
  const text = document.getElementById("progressText");
  if (bar) bar.style.width = pct + "%";
  if (text) text.textContent = `تم حل ${answeredCount} من أصل ${total} أسئلة`;
}

function safeParseDate(dateStr) {
  if (!dateStr) return null;
  if (typeof dateStr === "number") return dateStr;

  let s = String(dateStr).trim().replace(" ", "T");
  if (!s.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(s)) {
    s += "Z";
  }
  const time = new Date(s).getTime();
  return isNaN(time) ? null : time;
}

function startTimer() {
  const durationSec = Number(currentExam?.duration_seconds) || 1800;
  const localTimerKey = `timer_start_ms_${attemptId}`;

  let savedLocalMs = localStorage.getItem(localTimerKey);
  savedLocalMs = savedLocalMs ? Number(savedLocalMs) : null;

  const dbStartMs = safeParseDate(
    currentAttempt?.exam_started_at || currentAttempt?.start_time,
  );
  const nowMs = Date.now();

  if (
    savedLocalMs &&
    !isNaN(savedLocalMs) &&
    savedLocalMs > 0 &&
    nowMs - savedLocalMs < durationSec * 1000
  ) {
    examStartedAtMs = savedLocalMs;
  } else if (
    dbStartMs &&
    nowMs - dbStartMs < durationSec * 1000 &&
    nowMs - dbStartMs >= 0
  ) {
    examStartedAtMs = dbStartMs;
    localStorage.setItem(localTimerKey, String(dbStartMs));
  } else {
    examStartedAtMs = nowMs;
    localStorage.setItem(localTimerKey, String(nowMs));
  }

  const timerEl = document.getElementById("timer");
  const timerContainer = document.getElementById("timerContainer");

  function tick() {
    const now = Date.now();
    const elapsed = Math.max(0, Math.floor((now - examStartedAtMs) / 1000));
    const remaining = Math.max(0, durationSec - elapsed);

    if (remaining <= 0) {
      if (timerEl) timerEl.textContent = "00:00";
      if (timerInterval) clearInterval(timerInterval);
      submitExam(true);
      return;
    }

    if (remaining <= 120 && timerContainer)
      timerContainer.classList.add("critical");

    const mins = String(Math.floor(remaining / 60)).padStart(2, "0");
    const secs = String(remaining % 60).padStart(2, "0");
    if (timerEl) timerEl.textContent = `${mins}:${secs}`;
  }

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tick, 1000);
  tick();
}

function validateAndSubmit(isTimeOut) {
  if (isSubmittingLock) return;

  if (isTimeOut) {
    submitExam(true);
    return;
  }

  let firstUnanswered = null;
  questions.forEach((q, index) => {
    if (firstUnanswered === null && !isQuestionAnswered(q, answers[index])) {
      firstUnanswered = index;
    }
  });

  if (firstUnanswered !== null) {
    document
      .querySelectorAll(".question-card")
      .forEach((c) => c.classList.remove("highlight-error"));
    const card = document.getElementById(`q_card_${firstUnanswered}`);
    card?.classList.add("highlight-error");
    card?.scrollIntoView({ behavior: "smooth", block: "center" });

    showModal({
      type: "alert",
      title: "⚠️ أسئلة غير مكتملة",
      text: "لا يمكنك تسليم الامتحان قبل الإجابة على جميع الأسئلة المطروحة بشكل كامل. يرجى مراجعة السؤال المحدد.",
      confirmText: "حسناً، سأكمل الحل",
    });
    return;
  }

  showModal({
    type: "confirm",
    title: "📝 إنهاء وتسليم الإجابة",
    text: "هل أنت متأكد من رغبتك في إرسال ورقة الإجابة الحالية وإنهاء الامتحان؟ لن تتمكن من التعديل مجدداً.",
    confirmText: "نعم، قم بالتسليم فوراً",
    cancelText: "تراجع، مراجعة الإجابات",
    onConfirm: () => submitExam(false),
  });
}

async function submitExam(isTimeOut) {
  if (isSubmittingLock) return;
  isSubmittingLock = true;

  if (timerInterval) clearInterval(timerInterval);

  const submitBtn = document.getElementById("submitExamBtn");
  const errorBox = document.getElementById("submitErrorBox");

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "جاري حجز دورك في طابور التسليم...";
  }
  if (errorBox) errorBox.classList.add("hidden");

  const baseSlot = (Number(attemptId) % 60) * 150;
  const randomJitter = Math.floor(Math.random() * 250);
  const calculatedQueueDelay = isTimeOut
    ? baseSlot + randomJitter
    : randomJitter;

  if (calculatedQueueDelay > 0) {
    await new Promise((res) => setTimeout(res, calculatedQueueDelay));
  }

  if (submitBtn) {
    submitBtn.textContent = "جاري إرسال إجاباتك ولحفظ النتائج...";
  }

  const maxRetries = 5;
  let retryCount = 0;
  let success = false;

  while (retryCount < maxRetries && !success) {
    try {
      await submitExamAttempt(attemptId, questions, answers);
      success = true;
    } catch (err) {
      retryCount++;
      console.warn(
        `⚠️ السيرفر مشغول، إعادة المحاولة (${retryCount}/${maxRetries})...`,
        err,
      );

      if (retryCount < maxRetries) {
        if (submitBtn) {
          submitBtn.textContent = `السيرفر مكتظ، جاري إرسال إجاباتك تلقائياً (محاولة ${retryCount}/${maxRetries})...`;
        }
        const retryDelay =
          Math.pow(2, retryCount) * 800 + Math.floor(Math.random() * 400);
        await new Promise((res) => setTimeout(res, retryDelay));
      }
    }
  }

  if (success) {
    localStorage.removeItem(answersStorageKey());
    localStorage.removeItem(attemptStorageKey(currentExam.id));
    localStorage.removeItem(`timer_start_ms_${attemptId}`);

    if (currentExam.result_visibility === "lookup_only") {
      showSubmittedThankYouScreen();
    } else {
      window.location.href = `results.html?attempt=${attemptId}`;
    }
  } else {
    isSubmittingLock = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "🔄 إعادة محاولة التسليم الآن";
    }

    if (errorBox) {
      errorBox.textContent =
        "⚠️ يوجد ضغط شديد جداً على الشبكة، ولكن إجاباتك محفوظة بأمان على جهازك! انقر على زر 'إعادة محاولة التسليم' بالأسفل.";
      errorBox.classList.remove("hidden");
    }

    showModal({
      type: "alert",
      title: "⚠️ تم حفظ إجاباتك محلياً",
      text: "إجاباتك محفوظة تماماً على هاتفك/جهازك ولن تضيع. يرجى الضغط على زر إعادة محاولة التسليم لإكمال الحفظ.",
      confirmText: "حسناً، فهمت",
    });
  }
}

init();
