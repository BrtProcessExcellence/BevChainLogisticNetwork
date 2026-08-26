/**
 * ==============================================================================
 * MICROSOFT AZURE AD AUTHENTICATION & SESSION MANAGER (auth.js)
 * ==============================================================================
 */

// Helper: ดึง Supabase Client
function getAuthDbClient() {
  if (typeof getDbClient === 'function') return getDbClient();
  return window.supabase || window._supabaseDbInstance || null;
}

/**
 * 1. ฟังก์ชันสั่งล็อกอินผ่าน Microsoft Azure AD / Entra ID
 */
async function signInWithMicrosoft() {
  const db = getAuthDbClient();
  if (!db) {
    if (typeof showToast === 'function') showToast('❌ ไม่พบการเชื่อมต่อ Supabase');
    return;
  }

  const btn = document.getElementById('btn-login-ms');
  if (btn) {
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin inline mr-1.5"></i> กำลังเชื่อมต่อ Microsoft...`;
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: btn });
  }

  try {
    const { error } = await db.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email profile openid',
        redirectTo: window.location.origin + window.location.pathname
      }
    });

    if (error) throw error;
  } catch (err) {
    console.error('Microsoft Login Error:', err);
    if (typeof showToast === 'function') showToast('เกิดข้อผิดพลาดในการเข้าสู่ระบบ Microsoft');
    if (btn) btn.innerHTML = `Sign in with Microsoft`;
  }
}

/**
 * 2. ฟังก์ชันอัปเดตข้อมูลผู้ใช้บน Sidebar อัตโนมัติ
 */
function updateUserProfileUI(user) {
  if (!user) return;

  const metadata = user.user_metadata || {};
  
  // ดึงชื่อเต็ม หรือใช้อีเมลเป็นตัวสำรอง
  const fullName = metadata.full_name || metadata.name || metadata.preferred_username || user.email || 'Microsoft User';
  const email = user.email || metadata.email || '';
  
  // ดึงแผนก / ตำแหน่งงาน (Department / Job Title)
  const department = metadata.department || metadata.job_title || metadata.company_name || 'Transport';

  // สร้างตัวย่อ 2 ตัวอักษร (Initials) เช่น Jakkrit Latthawanichphan -> JL
  let initials = 'MS';
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      initials = (parts[0][0] + parts[1][0]).toUpperCase();
    } else if (parts[0].length >= 2) {
      initials = parts[0].substring(0, 2).toUpperCase();
    }
  }

  // อัปเดตลง DOM
  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-display-role');
  const avatarEl = document.getElementById('user-avatar-initials');

  if (nameEl) {
    nameEl.innerText = fullName;
    nameEl.title = `${fullName} (${email})`;
  }
  if (roleEl) {
    roleEl.innerText = department;
    roleEl.title = email;
  }
  if (avatarEl) {
    avatarEl.innerText = initials;
  }
}

/**
 * 3. ฟังก์ชันจัดการเมื่อยืนยันตัวตนสำเร็จ (สลับหน้าจอและโหลดข้อมูล)
 */
async function handleUserAuthenticated(user) {
  const loginScreen = document.getElementById('login-screen');
  const app = document.getElementById('main-app');

  // ซ่อนหน้าล็อกอิน และแสดงหน้าแอปพลิเคชัน
  if (loginScreen) {
    loginScreen.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => loginScreen.classList.add('hidden'), 400);
  }
  if (app) {
    app.classList.remove('hidden');
    setTimeout(() => app.classList.remove('opacity-0', 'pointer-events-none'), 50);
  }

  // อัปเดต Profile บน Sidebar
  updateUserProfileUI(user);

  // เริ่มโหลดข้อมูลเริ่มต้นของระบบ (เรียก initAppAfterLogin ใน app.js)
  if (typeof initAppAfterLogin === 'function') {
    await initAppAfterLogin();
  }
}

/**
 * 4. ฟังก์ชันออกจากระบบ (Logout)
 */
async function signOutUser() {
  const db = getAuthDbClient();
  if (db) {
    await db.auth.signOut();
  }

  // เคลียร์ข้อมูลในหน่วยความจำชั่วคราว
  window.globalRouteSheetData = [];
  if (typeof currentFilteredData !== 'undefined') currentFilteredData = [];

  // สลับหน้าจอกลับไปยังหน้าล็อกอิน
  const app = document.getElementById('main-app');
  const loginScreen = document.getElementById('login-screen');
  
  if (app) app.classList.add('hidden', 'opacity-0', 'pointer-events-none');
  if (loginScreen) loginScreen.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
  
  const btnLogin = document.getElementById('btn-login-ms');
  if (btnLogin) btnLogin.innerHTML = `Sign in with Microsoft`;

  if (typeof showToast === 'function') showToast('ออกจากระบบเรียบร้อยแล้ว');
}

/**
 * 5. ฟังก์ชันตั้งค่า Session Listener ตอนโหลดหน้าเว็บครั้งแรก
 */
async function initializeAuthSession() {
  const db = getAuthDbClient();
  if (!db) return;

  // 1. ตรวจสอบ Session ปัจจุบัน
  try {
    const { data: { session } } = await db.auth.getSession();

    if (session && session.user) {
      await handleUserAuthenticated(session.user);
    } else {
      const loginScreen = document.getElementById('login-screen');
      const app = document.getElementById('main-app');
      if (loginScreen) loginScreen.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
      if (app) app.classList.add('hidden', 'opacity-0', 'pointer-events-none');
    }
  } catch (err) {
    console.error('Session Check Error:', err);
  }

  // 2. ดักฟัง Event เปลี่ยนแปลงสถานะ (Login / Logout / Token Expired)
  db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      await handleUserAuthenticated(session.user);
    } else if (event === 'SIGNED_OUT') {
      const loginScreen = document.getElementById('login-screen');
      const app = document.getElementById('main-app');
      if (loginScreen) loginScreen.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
      if (app) app.classList.add('hidden', 'opacity-0', 'pointer-events-none');
    }
  });
}

// ผูก Event Listener ของปุ่ม Auth เมื่อ DOM พร้อมทำงาน
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-login-ms')?.addEventListener('click', signInWithMicrosoft);
  document.getElementById('btn-logout')?.addEventListener('click', signOutUser);
  initializeAuthSession();
});

// ส่งออกเป็นฟังก์ชัน Global
window.signInWithMicrosoft = signInWithMicrosoft;
window.signOutUser = signOutUser;
window.initializeAuthSession = initializeAuthSession;
window.updateUserProfileUI = updateUserProfileUI;