// admin-auth.js
// حماية موحّدة لكل صفحات لوحة الأدمن بنفس الباسورد.
// ملاحظة أمان: هذا تحقق على مستوى الواجهة فقط (زي التصميم الأصلي للموقع)،
// وليس بديلاً عن نظام تسجيل دخول حقيقي على السيرفر.

import { ADMIN_PASSWORD } from "../includes/config.js";

const AUTH_KEY = "admin_authenticated_v2";

export function guardAdminPage() {
  if (sessionStorage.getItem(AUTH_KEY) === "true") return;

  document.documentElement.style.visibility = "hidden";

  const overlay = document.createElement("div");
  overlay.id = "adminAuthOverlay";
  overlay.innerHTML = `
    <div class="admin-auth-box">
      <div class="admin-auth-icon"><i class="fa-solid fa-shield-halved"></i></div>
      <h3>دخول لوحة التحكم</h3>
      <p>من فضلك أدخل كلمة المرور الخاصة بالأدمن للمتابعة.</p>
      <input type="password" id="adminAuthInput" placeholder="كلمة المرور" autocomplete="off">
      <button id="adminAuthBtn">دخول <i class="fa-solid fa-arrow-left"></i></button>
      <p id="adminAuthError">كلمة المرور غير صحيحة!</p>
    </div>`;

  const style = document.createElement("style");
  style.textContent = `
    #adminAuthOverlay{position:fixed;inset:0;background:rgba(15,23,42,.96);display:flex;
      align-items:center;justify-content:center;z-index:999999;font-family:'Cairo',sans-serif;
      backdrop-filter:blur(8px);}
    .admin-auth-box{background:#fff;padding:34px 26px;border-radius:18px;text-align:center;
      max-width:380px;width:90%;box-shadow:0 25px 50px -12px rgba(0,0,0,.4);}
    .admin-auth-icon{width:60px;height:60px;background:#e0e7ff;color:#3b82f6;border-radius:50%;
      display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:24px;}
    .admin-auth-box h3{margin:0 0 8px;color:#1e293b;font-size:20px;font-weight:800;}
    .admin-auth-box p{margin:0 0 18px;color:#64748b;font-size:14px;}
    .admin-auth-box input{width:100%;padding:12px 16px;margin-bottom:12px;border:1px solid #cbd5e1;
      border-radius:10px;box-sizing:border-box;font-size:15px;text-align:center;outline:none;
      font-family:inherit;}
    .admin-auth-box input:focus{border-color:#3b82f6;}
    .admin-auth-box button{width:100%;padding:12px;background:#2563eb;color:#fff;border:none;
      border-radius:10px;font-weight:700;font-size:16px;cursor:pointer;font-family:inherit;
      transition:background .2s;}
    .admin-auth-box button:hover{background:#1d4ed8;}
    #adminAuthError{color:#ef4444;display:none;margin:12px 0 0;font-size:14px;font-weight:600;}`;

  document.head.appendChild(style);
  document.body.appendChild(overlay);
  document.documentElement.style.visibility = "visible";

  const input = document.getElementById("adminAuthInput");
  const btn = document.getElementById("adminAuthBtn");
  const errorMsg = document.getElementById("adminAuthError");

  function verify() {
    if (input.value === ADMIN_PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, "true");
      overlay.remove();
      style.remove();
    } else {
      errorMsg.style.display = "block";
      input.value = "";
      input.focus();
    }
  }

  btn.addEventListener("click", verify);
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") verify();
  });
  input.focus();
}

export function adminLogout() {
  sessionStorage.removeItem(AUTH_KEY);
  window.location.reload();
}

guardAdminPage();
