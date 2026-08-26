/**
 * ==============================================================================
 * MICROSOFT AZURE AD AUTHENTICATION & SESSION MANAGER (auth.js - BULLETPROOF)
 * ==============================================================================
 */

// 1. ดึงหรือสร้าง Supabase Client Instance ที่ถูกต้อง 100%
function getAuthDbClient() {
  if (window._supabaseDbInstance) return window._supabaseDbInstance;
  if (typeof getDbClient === 'function') {
    const client = getDbClient();
    if (client) return client;
  }
  const config = typeof CONFIG !== 'undefined' ? CONFIG : null;
  if (window.supabase && typeof window.supabase.createClient === 'function' && config?.SUPABASE_URL && config?.SUPABASE_KEY) {
    window._supabaseDbInstance = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
    return window._supabaseDbInstance;
  }
  return null;
}

// 2. ฟังก์ชันสั่งล็อกอินผ่าน Microsoft Azure AD
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
    if (typeof showToast === 'function') showToast(`เกิดข้อผิดพลาด: ${err.message || 'เข้าสู่ระบบไม่สำเร็จ'}`);
    if (btn) btn.innerHTML = `Sign in with Microsoft`;
  }
}

// 3. ฟังก์ชันอัปเดตข้อมูลโปรไฟล์ผู้ใช้บน Sidebar
function updateUserProfileUI(user) {
  if (!user) return;

  const metadata = user.user_metadata || {};
  const fullName = metadata.full_name || metadata.name || metadata.preferred_username || user.email || 'Microsoft User';
  const email = user.email || metadata.email || '';
  const department = metadata.department || metadata.job_title || metadata.company_name || 'Transport';

  // คำนวณตัวย่อชื่อ 2 ตัวอักษร
  let initials = 'MS';
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      initials = (parts[0][0] + parts[1][0]).toUpperCase();
    } else if (parts[0].length >= 2) {
      initials = parts[0].substring(0, 2).toUpperCase();
    }
  }

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

// 4. ฟังก์ชันสลับหน้าจอแสดงผลเมื่อ Authenticated
async function handleUserAuthenticated(user) {
  if (!user) return;

  const loginScreen = document.getElementById('login-screen');
  const app = document.getElementById('main-app');

  // สลับหน้าจอ UI ทันที
  if (loginScreen) {
    loginScreen.classList.add('hidden', 'opacity-0', 'pointer-events-none');
    loginScreen.style.display = 'none';
  }
  if (app) {
    app.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
    app.style.display = 'flex';
  }

  // อัปเดตข้อมูล Sidebar
  try {
    updateUserProfileUI(user);
  } catch (e) {
    console.error('Profile UI Error:', e);
  }

  // โหลดข้อมูล Dashboard
  try {
    if (typeof initAppAfterLogin === 'function') {
      await initAppAfterLogin();
    }
  } catch (e) {
    console.error('App Init Error:', e);
  }

  // ล้าง Query Params / Hash token ออกจาก URL ให้สะอาด
  if (window.location.search.includes('code=') || window.location.hash.includes('access_token=')) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// 5. ฟังก์ชันแสดงหน้าจอ Login
function showLoginScreen() {
  const app = document.getElementById('main-app');
  const loginScreen = document.getElementById('login-screen');
  const btn = document.getElementById('btn-login-ms');

  if (app) {
    app.classList.add('hidden', 'opacity-0', 'pointer-events-none');
    app.style.display = 'none';
  }
  if (loginScreen) {
    loginScreen.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
    loginScreen.style.display = 'flex';
  }
  if (btn) {
    btn.innerHTML = `Sign in with Microsoft`;
  }
}

// 6. ฟังก์ชันออกจากระบบ
async function signOutUser() {
  const db = getAuthDbClient();
  if (db) {
    await db.auth.signOut();
  }

  window.globalRouteSheetData = [];
  if (typeof currentFilteredData !== 'undefined') currentFilteredData = [];

  showLoginScreen();
  if (typeof showToast === 'function') showToast('ออกจากระบบเรียบร้อยแล้ว');
}

// 7. ฟังก์ชัน Session Listener รองรับการดักจับ Code และ Error จาก URL
async function initializeAuthSession() {
  const db = getAuthDbClient();
  if (!db) return;

  // 💡 ตรวจสอบว่ามี Error ส่งกลับมาจาก Microsoft ใน URL หรือไม่
  const urlParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const authError = urlParams.get('error_description') || urlParams.get('error') || hashParams.get('error_description');

  if (authError) {
    console.error('OAuth Return Error:', authError);
    if (typeof showToast === 'function') showToast(`⚠️ เข้าสู่ระบบไม่สำเร็จ: ${authError}`);
    showLoginScreen();
    window.history.replaceState({}, document.title, window.location.pathname);
    return;
  }

  const isOAuthRedirect = window.location.search.includes('code=') || window.location.hash.includes('access_token=');
  
  // หากกำลัง Redirect กลับมาพร้อม Token ให้ค้างสถานะ Loading ไว้ก่อน
  if (isOAuthRedirect) {
    const btn = document.getElementById('btn-login-ms');
    if (btn) btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin inline mr-1.5"></i> กำลังตรวจสอบสิทธิ์...`;
  }

  // 💡 ดักฟังสถานะ Auth จาก Supabase
  db.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      await handleUserAuthenticated(session.user);
    } else if (event === 'SIGNED_OUT') {
      showLoginScreen();
    } else if (!isOAuthRedirect) {
      showLoginScreen();
    }
  });

  // ตรวจสอบ Session ปัจจุบัน (Fallback)
  try {
    const { data: { session } } = await db.auth.getSession();
    if (session?.user) {
      await handleUserAuthenticated(session.user);
    } else if (!isOAuthRedirect) {
      showLoginScreen();
    }
  } catch (err) {
    console.error('Session verification error:', err);
    showLoginScreen();
  }
}

// ผูก Event Listener เมื่อ DOM โหลดเสร็จ
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-login-ms')?.addEventListener('click', signInWithMicrosoft);
  document.getElementById('btn-logout')?.addEventListener('click', signOutUser);
  initializeAuthSession();
});

// Global Exports
window.signInWithMicrosoft = signInWithMicrosoft;
window.signOutUser = signOutUser;
window.initializeAuthSession = initializeAuthSession;
window.updateUserProfileUI = updateUserProfileUI;