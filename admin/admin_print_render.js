import {
  getChurchPrintData,
  getAllPackageItemsGrouped,
  getAllExams,
  getAllChurches,
  deletePackageSelectionsByFilter,
} from "../includes/functions.js?v=1.0.0";
import { adminAlert, adminConfirm } from "./admin-ui.js?v=1.0.01";

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

// دالة تنسيق كل الأقسام والعناصر المختارة بشكل عام (الأقسام بقت ديناميكية بالكامل)
function formatAllPackages(pkgObj) {
  if (!pkgObj || !Object.keys(pkgObj).length) {
    return '<span class="p-no-item">لم يتم الاختيار</span>';
  }
  const blocks = Object.entries(pkgObj)
    .filter(([, items]) => items && items.length)
    .map(
      ([cat, items]) =>
        `<div class="p-pkg-cat-line"><b>${escapeHtml(cat)}:</b> ${items
          .map((it) => `<span class="p-chip activity">${escapeHtml(it)}</span>`)
          .join(" ")}</div>`,
    );
  return blocks.length
    ? blocks.join("")
    : '<span class="p-no-item">لم يتم الاختيار</span>';
}

// دالة تشغيل الطباعة وتسمية ملف PDF باسم الكنيسة
window.triggerChurchPrint = function (churchName) {
  if (churchName) {
    const cleanName = churchName.replace(/[/\\?%*:|"<>]/g, "").trim();
    document.title = `كشف_نتائج_${cleanName}`;
  }
  window.print();
};

export async function renderAdminPrintPage() {
  const app = document.getElementById("app");
  const urlParams = new URLSearchParams(location.search);
  const selectedChurch = urlParams.get("church") || "";

  // جلب بيانات البكدجات والامتحانات والكنائس لأداة الحذف
  const [packages, exams, churchesList] = await Promise.all([
    getAllPackageItemsGrouped(),
    getAllExams(),
    getAllChurches(),
  ]);

  // تحديث عنوان الصفحة ديناميكياً لتسمية ملف PDF عند الحفظ
  if (selectedChurch) {
    const cleanChurch = selectedChurch.replace(/[/\\?%*:|"<>]/g, "").trim();
    document.title = `كشف_نتائج_${cleanChurch}`;
  } else {
    document.title = "تقارير_طباعة_الكنائس";
  }

  let printData = null;
  if (selectedChurch) {
    printData = await getChurchPrintData(selectedChurch);
  }

  const churchOptionsHtml = churchesList
    .map((c) => {
      const selected = selectedChurch === c.name ? "selected" : "";
      return `<option value="${escapeHtml(c.name)}" ${selected}>${escapeHtml(c.name)}</option>`;
    })
    .join("");

  const examOptionsHtml = exams
    .map(
      (exam) => `<option value="${exam.id}">${escapeHtml(exam.name)}</option>`,
    )
    .join("");

  const filterOptionsHtml = Object.entries(packages)
    .filter(([, items]) => items.length)
    .map(
      ([category, items]) => `
      <optgroup label="${escapeHtml(category)}">
        ${items
          .map((item) => {
            const val = `${category}|||${item}`;
            return `<option value="${escapeHtml(val)}">${escapeHtml(item)}</option>`;
          })
          .join("")}
      </optgroup>`,
    )
    .join("");

  let examsHtml = "";
  if (printData && printData.examsData.length) {
    examsHtml = printData.examsData
      .map((item) => {
        const examName = escapeHtml(item.exam.name || `امتحان ${item.exam.id}`);

        // جدول الناجحين
        const passedRows = item.passed.length
          ? item.passed
              .map(
                (st, idx) => `
              <tr>
                <td class="col-num">${idx + 1}</td>
                <td class="col-name"><b>${escapeHtml(st.user_name)}</b></td>
                <td class="col-phone">${escapeHtml(st.user_phone)}</td>
                <td class="col-score">
                  <span class="p-grade-badge pass">${st.total_score} / ${st.total_possible} (${Number(st.percentage).toFixed(1)}%) - ${escapeHtml(st.grade_text || "ناجح")}</span>
                </td>
                <td class="col-tags" colspan="2">${formatAllPackages(st.packages)}</td>
              </tr>`,
              )
              .join("")
          : `<tr><td colspan="5" class="p-empty-row"><i class="fa-solid fa-circle-info"></i> لا يوجد طلاب ناجحون في هذا الامتحان</td></tr>`;

        // جدول الراسبين
        const failedRows = item.failed.length
          ? item.failed
              .map(
                (st, idx) => `
              <tr>
                <td class="col-num">${idx + 1}</td>
                <td class="col-name"><b>${escapeHtml(st.user_name)}</b></td>
                <td class="col-phone">${escapeHtml(st.user_phone)}</td>
                <td class="col-score">
                  <span class="p-grade-badge fail">${st.total_score} / ${st.total_possible} (${Number(st.percentage).toFixed(1)}%) - ${escapeHtml(st.grade_text || "غير ناجح")}</span>
                </td>
                <td class="col-tags" colspan="2">${formatAllPackages(st.packages)}</td>
              </tr>`,
              )
              .join("")
          : `<tr><td colspan="5" class="p-empty-row"><i class="fa-solid fa-circle-info"></i> لا يوجد طلاب غير ناجحين في هذا الامتحان</td></tr>`;

        return `
        <div class="p-exam-card">
          <div class="p-exam-header">
            <i class="fa-solid fa-book-bookmark"></i> ${examName}
          </div>

          <!-- جدول الناجحين -->
          <div class="p-section-divider pass">
            <span><i class="fa-solid fa-circle-check"></i> قائمة الناجحين (${item.passed.length})</span>
          </div>
          <table class="p-report-table">
            <thead>
              <tr>
                <th style="width: 5%;">#</th>
                <th style="width: 25%;">اسم الطالب</th>
                <th style="width: 15%;">رقم الهاتف</th>
                <th style="width: 20%;">النتيجة والتقدير</th>
                <th style="width: 35%;" colspan="2">الأنشطة والاختيارات المسجلة</th>
              </tr>
            </thead>
            <tbody>${passedRows}</tbody>
          </table>

          <!-- جدول الراسبين -->
          <div class="p-section-divider fail">
            <span><i class="fa-solid fa-circle-xmark"></i> قائمة غير الناجحين (${item.failed.length})</span>
          </div>
          <table class="p-report-table">
            <thead>
              <tr>
                <th style="width: 5%;">#</th>
                <th style="width: 25%;">اسم الطالب</th>
                <th style="width: 15%;">رقم الهاتف</th>
                <th style="width: 20%;">النتيجة والتقدير</th>
                <th style="width: 35%;" colspan="2">الأنشطة والاختيارات المسجلة</th>
              </tr>
            </thead>
            <tbody>${failedRows}</tbody>
          </table>
        </div>`;
      })
      .join("");
  }

  app.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');

      .print-page-wrapper {
        font-family: 'Cairo', system-ui, -apple-system, sans-serif;
        color: #0f172a;
        direction: rtl;
      }

      /* شريط التحكم بالطباعة */
      .p-control-panel {
        background: var(--a-bg-card, #1e293b);
        padding: 1.25rem 1.5rem;
        border-radius: 14px;
        margin-bottom: 1.5rem;
        display: flex;
        flex-wrap: wrap;
        gap: 1.25rem;
        align-items: center;
        justify-content: space-between;
        border: 1px solid var(--a-border, #334155);
      }
      .p-select-group {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex: 1 1 350px;
      }
      .p-select-group label {
        font-weight: 700;
        font-size: 0.95rem;
        white-space: nowrap;
        color: var(--a-text, #f8fafc);
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .p-select-group select {
        padding: 0.65rem 1rem;
        border-radius: 10px;
        border: 1px solid var(--a-border, #334155);
        background: var(--a-bg, #0f172a);
        color: var(--a-text, #f8fafc);
        font-family: inherit;
        font-size: 0.95rem;
        font-weight: 600;
        flex: 1;
        outline: none;
      }
      .p-print-btn {
        background: #0284c7;
        color: #ffffff;
        border: none;
        padding: 0.75rem 1.75rem;
        border-radius: 10px;
        font-weight: 800;
        font-size: 0.95rem;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 0.6rem;
        transition: all 0.2s ease;
        box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25);
      }
      .p-print-btn:hover {
        background: #0369a1;
        transform: translateY(-2px);
      }

      /* لوحة حذف الأنشطة والرياضات */
      .p-delete-panel {
        background: var(--a-bg-card, #1e293b);
        border: 1px solid #ef444440;
        border-radius: 14px;
        padding: 1.25rem 1.5rem;
        margin-bottom: 2rem;
      }
      .p-delete-title {
        font-weight: 800;
        font-size: 1rem;
        color: #f87171;
        margin-bottom: 1rem;
        display: flex;
        align-items: center;
        gap: 0.6rem;
      }
      .p-delete-form {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        align-items: center;
      }
      .p-input-group {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: 1 1 220px;
      }
      .p-input-group label {
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--a-text-soft, #cbd5e1);
        white-space: nowrap;
      }
      .p-input-group select {
        width: 100%;
        padding: 0.6rem 0.85rem;
        border-radius: 8px;
        border: 1px solid var(--a-border, #334155);
        background: var(--a-bg, #0f172a);
        color: var(--a-text, #f8fafc);
        font-family: inherit;
        font-size: 0.88rem;
      }
      .p-delete-action-btn {
        background: #dc2626;
        color: #ffffff;
        border: none;
        padding: 0.65rem 1.5rem;
        border-radius: 8px;
        font-weight: 800;
        font-size: 0.9rem;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        transition: all 0.2s ease;
      }
      .p-delete-action-btn:hover {
        background: #b91c1c;
      }

      /* ورقة التقرير المطبوعة */
      .p-report-container {
        background: #ffffff;
        color: #0f172a;
        border-radius: 16px;
        padding: 2.25rem;
        border: 1px solid #e2e8f0;
        box-shadow: 0 10px 30px rgba(0,0,0,0.04);
      }
      
      /* هيدر الكنيسة */
      .p-church-header {
        text-align: center;
        padding-bottom: 1.25rem;
        border-bottom: 2px solid #0f172a;
        margin-bottom: 1.5rem;
      }
      .p-cross-emblem {
        width: 52px;
        height: 52px;
        background: #f0f9ff;
        color: #0284c7;
        border: 2px solid #0284c7;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
        margin-bottom: 0.5rem;
      }
      .p-church-header h1 {
        margin: 0.2rem 0;
        font-size: 1.85rem;
        font-weight: 900;
        color: #0f172a;
      }
      .p-church-header p {
        margin: 0;
        color: #475569;
        font-size: 0.95rem;
        font-weight: 700;
      }

      /* بطاقات الإحصائيات */
      .p-metrics-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1.25rem;
        margin-bottom: 2rem;
      }
      .p-metric-card {
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        padding: 1rem 1.25rem;
        text-align: center;
      }
      .p-metric-card .title {
        font-size: 0.88rem;
        font-weight: 800;
        color: #475569;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
      }
      .p-metric-card .number {
        font-size: 1.8rem;
        font-weight: 900;
        margin-top: 0.2rem;
        line-height: 1.2;
      }
      .p-metric-card.pass .number { color: #15803d; }
      .p-metric-card.fail .number { color: #b91c1c; }
      .p-metric-card.total .number { color: #0369a1; }

      /* تقارير الامتحانات */
      .p-exam-card {
        margin-bottom: 2.25rem;
      }
      .p-exam-header {
        background: #0f172a;
        color: #ffffff;
        padding: 0.8rem 1.25rem;
        border-radius: 8px;
        font-size: 1.1rem;
        font-weight: 800;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 1rem;
      }
      .p-section-divider {
        font-size: 0.95rem;
        font-weight: 800;
        margin: 1.25rem 0 0.75rem 0;
        padding-right: 0.75rem;
        border-right: 4px solid #16a34a;
        color: #0f172a;
        display: flex;
        align-items: center;
      }
      .p-section-divider.fail { border-right-color: #dc2626; }

      .p-report-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 1.25rem;
        font-size: 0.88rem;
      }
      .p-report-table th {
        background: #f1f5f9;
        color: #0f172a;
        font-weight: 800;
        border: 1px solid #cbd5e1;
        padding: 0.7rem 0.75rem;
        text-align: right;
      }
      .p-report-table td {
        border: 1px solid #e2e8f0;
        padding: 0.6rem 0.75rem;
        text-align: right;
        vertical-align: middle;
      }
      .p-report-table tr:nth-child(even) td {
        background: #f8fafc;
      }
      .col-num { text-align: center !important; font-weight: 800; color: #64748b; }
      .col-phone { direction: ltr; text-align: right !important; font-family: monospace; font-size: 0.92rem; font-weight: 600; }

      /* البادجات والأنشطة */
      .p-grade-badge {
        display: inline-block;
        padding: 3px 10px;
        border-radius: 6px;
        font-size: 0.82rem;
        font-weight: 800;
      }
      .p-grade-badge.pass { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
      .p-grade-badge.fail { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }

      .p-chip {
        display: inline-block;
        padding: 3px 9px;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 700;
        margin: 2px;
      }
      .p-chip.activity { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
      .p-chip.game { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
      .p-no-item { color: #94a3b8; font-style: italic; font-size: 0.85rem; }
      .p-empty-row { text-align: center !important; color: #94a3b8; font-style: italic; padding: 1.25rem !important; }

      /* ========================================================
         تنسيقات الطباعة الاحترافية والـ PDF الصارمة
      ======================================================== */
      @media print {
        @page {
          size: A4 portrait;
          margin: 12mm 10mm 12mm 10mm;
        }

        body {
          background: #ffffff !important;
          color: #000000 !important;
          font-family: 'Cairo', sans-serif !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        /* إخفاء عناصر واجهة الأدمن وأزرار الحذف نهائياً في الطباعة */
        .p-control-panel, .p-delete-panel, .a-topbar, .a-tabs-row, header, footer, nav {
          display: none !important;
        }

        .print-page-wrapper {
          padding: 0 !important;
          margin: 0 !important;
          width: 100% !important;
        }

        .p-report-container {
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
          width: 100% !important;
        }

        .p-church-header {
          border-bottom: 2px solid #000000 !important;
          padding-bottom: 10px !important;
          margin-bottom: 14px !important;
          break-after: avoid !important;
          page-break-after: avoid !important;
        }

        .p-cross-emblem {
          border-color: #000000 !important;
          color: #000000 !important;
          background: transparent !important;
        }

        .p-metrics-grid {
          margin-bottom: 16px !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }

        .p-metric-card {
          border: 1px solid #000000 !important;
          background: #f8fafc !important;
        }

        .p-metric-card .number {
          color: #000000 !important;
        }

        .p-exam-card {
          margin-bottom: 20px !important;
          break-inside: auto !important;
        }

        .p-exam-header {
          background: #0f172a !important;
          color: #ffffff !important;
          break-after: avoid !important;
          page-break-after: avoid !important;
        }

        .p-section-divider {
          break-after: avoid !important;
          page-break-after: avoid !important;
          color: #000000 !important;
          font-weight: 900 !important;
        }

        .p-report-table {
          width: 100% !important;
          border-collapse: collapse !important;
          margin-bottom: 12px !important;
        }

        .p-report-table th {
          background: #e2e8f0 !important;
          color: #000000 !important;
          border: 1px solid #000000 !important;
          font-weight: 900 !important;
        }

        .p-report-table td {
          border: 1px solid #475569 !important;
          color: #000000 !important;
          font-weight: 700 !important;
        }

        .p-report-table tr {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }

        .p-grade-badge {
          border: 1px solid #000000 !important;
          font-weight: 900 !important;
        }

        .p-chip {
          border: 1px solid #475569 !important;
          color: #000000 !important;
          background: #f1f5f9 !important;
          font-weight: 800 !important;
        }
      }
    </style>

    <div class="print-page-wrapper">
      <div class="a-topbar">
        <div>
          <h1><i class="fa-solid fa-print"></i> تقارير طباعة الكنائس الاحترافية</h1>
          <p>تصدير واستخراج كشوفات النتائج والأنشطة بصيغة PDF عالية الجودة</p>
        </div>
        <div>
          <a href="passed.html" class="a-tab-btn" style="text-decoration:none;"><i class="fa-solid fa-arrow-right"></i> لوحة التحكم</a>
        </div>
      </div>

      <!-- شريط اختيار الكنيسة للطباعة -->
      <div class="p-control-panel">
        <form class="p-select-group" method="GET">
          <label><i class="fa-solid fa-church"></i> اختر الكنيسة:</label>
          <select name="church" onchange="this.form.submit()">
            <option value="">-- اختر الكنيسة من القائمة --</option>
            ${churchOptionsHtml}
          </select>
        </form>

        ${
          selectedChurch
            ? `<button class="p-print-btn" onclick="window.triggerChurchPrint('${escapeHtml(selectedChurch)}')"><i class="fa-solid fa-file-pdf"></i> طباعة / حفظ كملف PDF</button>`
            : ""
        }
      </div>

      <!-- لوحة حذف نشاط أو رياضة جماعياً -->
      <div class="p-delete-panel">
        <div class="p-delete-title">
          <i class="fa-solid fa-trash-can"></i> أداة حذف نشاط أو رياضة لامتحان وكنيسة محددة (أو جميع الكنائس)
        </div>
        <div class="p-delete-form">
          <div class="p-input-group">
            <label><i class="fa-solid fa-book-open"></i> الامتحان:</label>
            <select id="del_exam_id">
              <option value="">-- اختر الامتحان --</option>
              ${examOptionsHtml}
            </select>
          </div>

          <div class="p-input-group">
            <label><i class="fa-solid fa-church"></i> الكنيسة:</label>
            <select id="del_church_name">
              <option value="ALL">-- جميع الكنائس --</option>
              ${churchOptionsHtml}
            </select>
          </div>

          <div class="p-input-group">
            <label><i class="fa-solid fa-running"></i> النشاط / الرياضة:</label>
            <select id="del_package_item">
              <option value="">-- اختر النشاط أو الرياضة --</option>
              ${filterOptionsHtml}
            </select>
          </div>

          <button type="button" class="p-delete-action-btn" onclick="window.handleDeletePackage()">
            <i class="fa-solid fa-trash-can"></i> مسح النشاط
          </button>
        </div>
      </div>

      ${
        selectedChurch
          ? `
        <div class="p-report-container">
          <div class="p-church-header">
            <div class="p-cross-emblem"><i class="fa-solid fa-cross"></i></div>
            <h1>${escapeHtml(selectedChurch)}</h1>
            <p>تقرير معتمد لنتائج كشف الاختبارات </p>
          </div>

          <div class="p-metrics-grid">
            <div class="p-metric-card pass">
              <div class="title"><i class="fa-solid fa-user-check"></i> الناجحون</div>
              <div class="number">${printData ? printData.totalPassed : 0}</div>
            </div>
            <div class="p-metric-card fail">
              <div class="title"><i class="fa-solid fa-user-xmark"></i> غير الناجحين</div>
              <div class="number">${printData ? printData.totalFailed : 0}</div>
            </div>
            <div class="p-metric-card total">
              <div class="title"><i class="fa-solid fa-users"></i> إجمالي الطلاب</div>
              <div class="number">${printData ? printData.totalStudents : 0}</div>
            </div>
          </div>

          ${
            examsHtml ||
            '<div class="a-empty-state"><i class="fa-solid fa-folder-open"></i> لا توجد بيانات نتائج مسجلة لهذه الكنيسة.</div>'
          }
        </div>
      `
          : `
        <div class="a-empty-state" style="padding: 4rem 1rem; background: var(--a-bg-card, #1e293b); border-radius:16px;">
          <i class="fa-solid fa-church" style="font-size: 3.5rem; margin-bottom: 1rem; color: #0284c7;"></i>
          <h2>يرجى اختيار الكنيسة للبدء</h2>
          <p>حدد الكنيسة المطلوبة لعرض الكشف المنسق والجاهز للطباعة مباشرة.</p>
        </div>
      `
      }
    </div>
  `;

  // دالة التعامل مع حذف النشاط من الواجهة
  window.handleDeletePackage = async function () {
    const examId = document.getElementById("del_exam_id").value;
    const churchName = document.getElementById("del_church_name").value;
    const rawItem = document.getElementById("del_package_item").value;

    if (!examId) {
      await adminAlert("يرجى اختيار الامتحان أولاً", {
        type: "danger",
        title: "بيانات ناقصة",
      });
      return;
    }
    if (!rawItem) {
      await adminAlert("يرجى اختيار النشاط أو الرياضة المراد حذفها", {
        type: "danger",
        title: "بيانات ناقصة",
      });
      return;
    }

    let category = "";
    let item = rawItem;
    if (rawItem.includes("|||")) {
      [category, item] = rawItem.split("|||");
    }

    const churchText =
      !churchName || churchName === "ALL"
        ? "جميع الكنائس"
        : `كنيسة (${churchName})`;

    const confirmMsg = `هل أنت متأكد من حذف (${item}) لجميع الطلاب المتقدمين في هذا الامتحان لـ ${churchText}؟\n\nلن يظهر هذا النشاط في كشوفات الطباعة نهائياً بعد الحذف.`;

    const ok = await adminConfirm(confirmMsg, {
      title: "مسح نشاط بالجملة",
      confirmText: "نعم، حذف",
      danger: true,
    });
    if (!ok) return;

    try {
      const deletedCount = await deletePackageSelectionsByFilter(
        category,
        item,
        examId,
        churchName,
      );
      await adminAlert(
        `تم حذف النشاط/الرياضة بنجاح!\nإجمالي عدد الطلاب الذين تم مسح النشاط لهم: ${deletedCount}`,
        { type: "success", title: "تم الحذف" },
      );
      window.location.reload();
    } catch (err) {
      console.error(err);
      await adminAlert(
        "حدث خطأ أثناء الحذف: " + (err.message || "خطأ غير معروف"),
        { type: "danger", title: "خطأ" },
      );
    }
  };
}
