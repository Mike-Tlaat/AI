// results.js - عرض نتيجة محاولة الامتحان
import { getAttempt, getExamById } from "../includes/functions.js";

const card = document.getElementById("resultCard");

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

async function render() {
  const qs = new URLSearchParams(location.search);
  const attemptId = Number(qs.get("attempt") || 0);

  if (!attemptId) {
    card.innerHTML = `<p>رقم المحاولة غير صحيح</p>`;
    return;
  }

  const attempt = await getAttempt(attemptId);
  if (!attempt) {
    card.innerHTML = `<p>المحاولة غير موجودة</p>`;
    return;
  }

  const exam = await getExamById(attempt.exam_id);
  const notFinished = attempt.status === "pending";
  const isPass = attempt.pass_fail === "pass";
  const percentage = Number(attempt.percentage || 0).toFixed(1);
  const gradeText = attempt.grade_text || "-";
  const totalScore = Number(attempt.total_score || 0);
  const totalPossible = Number(attempt.total_possible || 0);

  if (notFinished) {
    card.innerHTML = `
      <div class="result-icon pending"><i class="fa-solid fa-hourglass-half"></i></div>
      <h2>لم يتم إنهاء الامتحان بعد</h2>
      <p class="result-desc">لا يمكن عرض النتيجة الآن لأن هذه المحاولة لم تُسلَّم بعد.</p>
      <button class="btn-exit" onclick="exitEntireSite()">الخروج نهائياً</button>
    `;
  } else {
    card.innerHTML = `
      <div class="result-icon ${isPass ? "pass" : "fail"}">
        <i class="fa-solid ${isPass ? "fa-circle-check" : "fa-circle-xmark"}"></i>
      </div>
      <h2>${escapeHtml(exam?.name || "")}</h2>
      <div class="result-student-name"><i class="fa-regular fa-user"></i> ${escapeHtml(attempt.user_name)}</div>

      <div class="status-pill ${isPass ? "pass" : "fail"}">
        <i class="fa-solid ${isPass ? "fa-check" : "fa-xmark"}"></i>
        ${isPass ? "تم اجتياز الامتحان بنجاح" : "لم يتم اجتياز الامتحان"}
      </div>

      <div class="stats-grid">
        <div class="stat-box"><div class="label">النسبة المئوية</div><div class="value">${percentage}%</div></div>
        <div class="stat-box"><div class="label">التقدير</div><div class="value">${escapeHtml(gradeText)}</div></div>
        <div class="stat-box"><div class="label">الدرجة</div><div class="value">${totalScore} / ${totalPossible}</div></div>
        <div class="stat-box"><div class="label">الحالة</div><div class="value" style="font-size:1rem;">${isPass ? "ناجح" : "راسب"}</div></div>
      </div>

      <button class="btn-exit" onclick="exitEntireSite()">الخروج نهائياً</button>
    `;
  }
}

window.exitEntireSite = function () {
  window.close();
  setTimeout(() => {
    window.location.href = "https://www.google.com";
  }, 100);
};

render();
