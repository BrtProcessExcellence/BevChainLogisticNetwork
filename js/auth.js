/**
 * ==============================================================================
 * MICROSOFT AZURE AD AUTHENTICATION & SESSION MANAGER (auth.js - FIXED)
 * ==============================================================================
 */

function getAuthDbClient() {
  if (typeof getDbClient === 'function') return getDbClient();
  return window.supabase || window._supabaseDbInstance || null;
}

/**
 * 1. ฟังก์ชันสั่งล็อกอินผ่าน Microsoft Azure AD
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
 * 2. ฟังก์ชันอัปเดตข้อมูลโปรไฟล์บน Sidebar
 */
function updateUserProfileUI(user) {
  if (!user) return;

  const metadata = user.user_metadata || {};
  const fullName = metadata.full_name || metadata.name || metadata.preferred_username || user.email || 'Microsoft User';
  const email = user.email || metadata.email || '';
  const department = metadata.department || metadata.job_title || metadata.company_name || 'Transport';

  // คำนวณตัวย่อชื่อ (Initials)
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

/**
 * 3. ฟังก์ชันสลับหน้าจอและเริ่มต้นระบบ (บังคับแสดงหน้า Dashboard ทันที)
 */
async function handleUserAuthenticated(user) {
  if (!user) return;

  const loginScreen = document.getElementById('login-screen');
  const app = document.getElementById('main-app');

  // 💡 บังคับสลับหน้าจอ UI ทันที ไม่ต้องรอฟังก์ชันอื่น
  if (loginScreen) {
    loginScreen.classList.add('hidden', 'opacity-0', 'pointer-events-none');
    loginScreen.style.display = 'none';
  }
  if (app) {
    app.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
    app.style.display = 'flex';
  }

  // อัปเดต Profile บน Sidebar
  try {
    updateUserProfileUI(user);
  } catch (e) {
    console.error('Error updating profile UI:', e);
  }

  // เริ่มโหลดข้อมูลแอปพลิเคชัน
  try {
    if (typeof initAppAfterLogin === 'function') {
      await initAppAfterLogin();
    }
  } catch (e) {
    console.error('Error in initAppAfterLogin:', e);
  }
}

/**
 * 4. ฟังก์ชันออกจากระบบ
 */
async function signOutUser() {
  const db = getAuthDbClient();
  if (db) {
    await db.auth.signOut();
  }

  window.globalRouteSheetData = [];
  if (typeof currentFilteredData !== 'undefined') currentFilteredData = [];

  const app = document.getElementById('main-app');
  const loginScreen = document.getElementById('login-screen');
  
  if (app) {
    app.classList.add('hidden', 'opacity-0', 'pointer-events-none');
    app.style.display = 'none';
  }
  if (loginScreen) {
    loginScreen.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
    loginScreen.style.display = 'flex';
  }
  
  const btnLogin = document.getElementById('btn-login-ms');
  if (btnLogin) btnLogin.innerHTML = `Sign in with Microsoft`;

  if (typeof showToast === 'function') showToast('ออกจากระบบเรียบร้อยแล้ว');
}

/**
 * 5. ฟังก์ชัน Session Listener รองรับทั้ง INITIAL_SESSION และ SIGNED_IN
 */
async function initializeAuthSession() {
  const db = getAuthDbClient();
  if (!db) return;

  // 💡 ดักฟัง Event ทันที ครอบคลุม INITIAL_SESSION, SIGNED_IN, และ TOKEN_REFRESHED
  db.auth.onAuthStateChange(async (event, session) => {
    if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
      await handleUserAuthenticated(session.user);
    } else if (event === 'SIGNED_OUT') {
      const loginScreen = document.getElementById('login-screen');
      const app = document.getElementById('main-app');
      if (loginScreen) {
        loginScreen.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
        loginScreen.style.display = 'flex';
      }
      if (app) {
        app.classList.add('hidden', 'opacity-0', 'pointer-events-none');
        app.style.display = 'none';
      }
    }
  });

  // ตรวจสอบ Session สำรอง
  try {
    const { data: { session } } = await db.auth.getSession();
    if (session && session.user) {
      await handleUserAuthenticated(session.user);
    }
  } catch (err) {
    console.error('Session Check Error:', err);
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