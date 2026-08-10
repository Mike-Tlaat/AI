import {
  getExamsForLookup,
  getExamById,
  getPackageSelections,
} from "../includes/functions.js?v=1.0.0";
import { supabase } from "../includes/db.js?v=1.0.0";

/* ==========================================================
   نظام تنظيم الضغط العالي (Traffic Controller / Queue System)
   ========================================================== */
class TrafficQueueManager {
  constructor() {
    this.maxConcurrentRequests = 2;
    this.activeRequests = 0;
    this.queue = [];
  }

  async enqueue(taskFunction, onQueueUpdate) {
    return new Promise((resolve, reject) => {
      this.queue.push({ taskFunction, resolve, reject, onQueueUpdate });
      this.processQueue();
    });
  }

  async processQueue() {
    if (
      this.activeRequests >= this.maxConcurrentRequests ||
      this.queue.length === 0
    ) {
      return;
    }

    const totalInQueue = this.queue.length;
    this.queue.forEach((item, index) => {
      if (item.onQueueUpdate) {
        item.onQueueUpdate(index + 1, totalInQueue);
      }
    });

    const { taskFunction, resolve, reject } = this.queue.shift();
    this.activeRequests++;

    try {
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 300));
      const result = await taskFunction();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.activeRequests--;
      this.processQueue();
    }
  }
}

const trafficManager = new TrafficQueueManager();

/* ==========================================================
   المنطق الأساسي للاستعلام والتحقق والنافذة المنبثقة
   ========================================================== */
document.addEventListener("DOMContentLoaded", async () => {
  const examSelect = document.getElementById("examSelect");
  const lookupForm = document.getElementById("lookupForm");
  const phoneInput = document.getElementById("phoneInput");
  const phoneCounter = document.getElementById("phoneCounter");
  const submitBtn = document.getElementById("submitBtn");
  const lookupError = document.getElementById("lookupError");
  const searchCard = document.getElementById("searchCard");
  const resultCard = document.getElementById("resultCard");
  const backBtn = document.getElementById("backBtn");
  const queueModal = document.getElementById("queueModal");
  const queuePosition = document.getElementById("queuePosition");
  const queueProgress = document.getElementById("queueProgress");

  // عناصر نافذة عدم وجود النتيجة
  const notFoundModal = document.getElementById("notFoundModal");
  const closeNotFoundBtn = document.getElementById("closeNotFoundBtn");
  const ackNotFoundBtn = document.getElementById("ackNotFoundBtn");

  const urlParams = new URLSearchParams(window.location.search);
  const targetSlug = urlParams.get("slug") || urlParams.get("exam");

  // --- التحكم بفتح وإغلاق مودال الإعادة عند عدم توفر النتيجة ---
  function openNotFoundModal() {
    if (notFoundModal) {
      notFoundModal.classList.add("active");
      document.body.style.overflow = "hidden"; // منع التمرير أثناء ظهور المودال
    }
  }

  function closeNotFoundModal() {
    if (notFoundModal) {
      notFoundModal.classList.remove("active");
      document.body.style.overflow = "";
    }
  }

  if (closeNotFoundBtn)
    closeNotFoundBtn.addEventListener("click", closeNotFoundModal);
  if (ackNotFoundBtn)
    ackNotFoundBtn.addEventListener("click", closeNotFoundModal);

  if (notFoundModal) {
    notFoundModal.addEventListener("click", (e) => {
      if (e.target === notFoundModal) closeNotFoundModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      notFoundModal &&
      notFoundModal.classList.contains("active")
    ) {
      closeNotFoundModal();
    }
  });

  // --- تقييد خانة رقم الهاتف لتقبل 11 رقماً فقط ومنع الأحرف ---
  if (phoneInput) {
    phoneInput.addEventListener("input", (e) => {
      let cleanVal = e.target.value.replace(/\D/g, "");
      if (cleanVal.length > 11) {
        cleanVal = cleanVal.substring(0, 11);
      }
      e.target.value = cleanVal;

      if (phoneCounter) {
        phoneCounter.textContent = `${cleanVal.length}/11`;
        if (cleanVal.length === 11) {
          phoneCounter.classList.add("valid");
        } else {
          phoneCounter.classList.remove("valid");
        }
      }
    });
  }

  // 1. تحميل قائمة الامتحانات
  try {
    const exams = await getExamsForLookup();
    if (exams && exams.length) {
      examSelect.innerHTML =
        `<option value="">-- اختر الامتحان --</option>` +
        exams
          .map(
            (e) =>
              `<option value="${e.id}" data-slug="${e.slug}">${e.name}</option>`,
          )
          .join("");

      if (targetSlug) {
        const found = exams.find(
          (e) => String(e.id) === String(targetSlug) || e.slug === targetSlug,
        );
        if (found) examSelect.value = found.id;
      }
    } else {
      examSelect.innerHTML = `<option value="">لا توجد امتحانات متاحة حالياً</option>`;
    }
  } catch (err) {
    console.error("Error fetching exams:", err);
    examSelect.innerHTML = `<option value="">خطأ في تحميل قائمة الامتحانات</option>`;
  }

  // 2. معالجة نموذج الاستعلام مع إظهار كارت الإعادة المنظم
  lookupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    lookupError.classList.add("hidden");

    const examId = examSelect.value;
    const phone = phoneInput.value.trim();

    if (!examId) {
      showError("يرجى اختيار الامتحان من القائمة أولاً.");
      return;
    }

    if (!phone || phone.length !== 11) {
      showError("يرجى إدخال رقم هاتف صحيح يتكون من 11 رقماً بالضبط.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>جاري البحث عن النتيجة...</span>`;

    const fetchResultTask = async () => {
      const { data, error } = await supabase
        .from("attempts")
        .select("*")
        .eq("exam_id", Number(examId))
        .eq("user_phone", phone)
        .in("status", ["submitted", "graded"])
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    };

    try {
      const attempt = await trafficManager.enqueue(
        fetchResultTask,
        (pos, total) => {
          if (pos > 1) {
            queueModal.classList.add("active");
            queuePosition.textContent = `#${pos}`;
            const pct = Math.max(
              10,
              Math.round(((total - pos + 1) / total) * 100),
            );
            queueProgress.style.width = `${pct}%`;
          }
        },
      );

      queueModal.classList.remove("active");

      // الشرط: إذا لم توجد نتيجة للرقم المكتوب بالامتحان المختار
      if (!attempt) {
        const examObj = await getExamById(Number(examId));
        const announcementText = document.getElementById(
          "notFoundAnnouncementText",
        );
        if (announcementText) {
          announcementText.textContent =
            (examObj && examObj.not_found_announcement) ||
            "يرجى التأكد من اختيار الامتحان الصحيح ومن رقم الهاتف المستخدم في التسجيل.";
        }
        openNotFoundModal(); // عرض كارت المودال في منتصف الشاشة
        return;
      }

      const packages = await getPackageSelections(attempt.id);
      renderResultCard(attempt, packages);
    } catch (err) {
      console.error(err);
      queueModal.classList.remove("active");
      showError(
        "حدث ضغط غير متوقع على السيرفر أو خطأ بالشبكة، يرجى إعادة المحاولة.",
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> <span>استعلام عن النتيجة</span>`;
    }
  });

  // 3. عرض النتيجة والأنشطة بشكل منظم وواضح
  function renderResultCard(attempt, packages) {
    document.getElementById("resStudentName").textContent =
      attempt.user_name || "بدون اسم";
    document.getElementById("resPhone").textContent = attempt.user_phone;

    // لو الامتحان ده مالوش كنيسة (الطالب سجل من غير خانة كنيسة)، نخفي هذا الصندوق بالكامل
    const churchBox = document.getElementById("resChurchBox");
    if (attempt.user_church && attempt.user_church.trim() !== "") {
      churchBox.classList.remove("hidden");
      document.getElementById("resChurch").textContent = attempt.user_church;
    } else {
      churchBox.classList.add("hidden");
    }

    const scorePct = Number(attempt.percentage || 0).toFixed(1);
    document.getElementById("resScore").textContent =
      `${attempt.total_score} / ${attempt.total_possible} (${scorePct}%)`;
    document.getElementById("resGrade").textContent = attempt.grade_text || "-";

    const isPass = attempt.pass_fail === "pass";
    const statusIcon = document.getElementById("statusIcon");
    const passPill = document.getElementById("resPassPill");

    if (isPass) {
      statusIcon.className = "result-icon pass";
      statusIcon.innerHTML = `<i class="fa-solid fa-circle-check"></i>`;
      passPill.className = "status-pill pass";
      passPill.innerHTML = `<i class="fa-solid fa-check"></i> ناجح`;
    } else {
      statusIcon.className = "result-icon fail";
      statusIcon.innerHTML = `<i class="fa-solid fa-circle-xmark"></i>`;
      passPill.className = "status-pill fail";
      passPill.innerHTML = `<i class="fa-solid fa-xmark"></i> غير ناجح`;
    }

    // لو الامتحان مالوش أي أقسام أنشطة/بكدجات، نخفي القسم بالكامل. كل قسم بيظهر
    // باسمه الحقيقي اللي حدده الأدمن (مش تحت اسم عام ثابت زي "الأنشطة والألعاب")
    const activitiesWrapper = document.getElementById("activitiesWrapper");
    const actContainer = document.getElementById("activitiesContainer");
    const hasAnyPackages = packages && Object.keys(packages).length > 0;

    if (hasAnyPackages) {
      activitiesWrapper.classList.remove("hidden");
      actContainer.innerHTML = Object.entries(packages)
        .map(([category, items]) => {
          const itemsList =
            Array.isArray(items) && items.length
              ? items
                  .map(
                    (it) =>
                      `<span class="activity-chip"><i class="fa-solid fa-check-double"></i> ${escapeHtml(it)}</span>`,
                  )
                  .join("")
              : `<span class="activity-chip empty">لم يتم التحديد</span>`;

          return `
          <div class="activity-block">
            <div class="activity-cat-title"><i class="fa-solid fa-layer-group"></i> ${escapeHtml(category)}:</div>
            <div class="activity-chips-wrap">${itemsList}</div>
          </div>`;
        })
        .join("");
    } else {
      activitiesWrapper.classList.add("hidden");
      actContainer.innerHTML = "";
    }

    searchCard.classList.add("hidden");
    resultCard.classList.remove("hidden");
    resultCard.classList.add("reveal-animate");
    resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  backBtn.addEventListener("click", () => {
    resultCard.classList.add("hidden");
    searchCard.classList.remove("hidden");
    searchCard.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  function showError(msg) {
    lookupError.textContent = msg;
    lookupError.classList.remove("hidden");
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str ?? "";
    return d.innerHTML;
  }
});
