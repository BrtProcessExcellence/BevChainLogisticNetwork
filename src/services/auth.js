import { supabase } from '../lib/supabase.js';

let isDashboardInitialized = false;

// 💡 โลโก้ Microsoft
const MS_ICON_SVG = `
  <svg class="w-5 h-5 shrink-0 group-hover:scale-110 transition-transform" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="10" height="10" fill="#F25022"/>
    <rect x="11" y="0" width="10" height="10" fill="#7FBA00"/>
    <rect x="0" y="11" width="10" height="10" fill="#00A4EF"/>
    <rect x="11" y="11" width="10" height="10" fill="#FFB900"/>
  </svg>
`;

export function setLoginButtonState(state = 'idle') {
  const btn = document.getElementById('btn-login-ms');
  if (!btn) return;

  if (state === 'loading') {
    btn.disabled = true;
    btn.classList.add('opacity-75', 'cursor-not-allowed');
    btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 shrink-0 animate-spin text-orange-500"></i> <span>Authenticating...</span>`;
    if (typeof window.lucide !== 'undefined') window.lucide.createIcons({ root: btn });
  } else {
    btn.disabled = false;
    btn.classList.remove('opacity-75', 'cursor-not-allowed');
    btn.innerHTML = `
      ${MS_ICON_SVG}
      <span id="btn-login-ms-text">Sign in with Microsoft</span>
    `;
    if (typeof window.lucide !== 'undefined') window.lucide.createIcons({ root: btn });
  }
}

export async function signInWithMicrosoft() {
  setLoginButtonState('loading');

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email profile openid',
        redirectTo: window.location.origin + window.location.pathname
      }
    });

    if (error) throw error;
  } catch (err) {
    console.error('Microsoft Login Error:', err);
    if (typeof window.showToast === 'function')
      window.showToast(`เกิดข้อผิดพลาด: ${err.message || 'เข้าสู่ระบบไม่สำเร็จ'}`);
    setLoginButtonState('idle');
  }
}

export function updateUserProfileUI(user) {
  if (!user) return;

  const metadata = user.user_metadata || {};
  const fullName = metadata.full_name || metadata.name || metadata.preferred_username || user.email || 'Microsoft User';
  const email = user.email || metadata.email || '';
  const department = metadata.department || metadata.job_title || metadata.company_name || 'Transport';

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

export async function handleUserAuthenticated(user) {
  if (!user) return;

  console.log('[AUTH] User authenticated:', user.email);

  const loginScreen = document.getElementById('login-screen');
  const app = document.getElementById('main-app');

  if (loginScreen) {
    loginScreen.classList.add('hidden', 'opacity-0', 'pointer-events-none');
    loginScreen.style.display = 'none';
  }

  if (app) {
    app.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
    app.style.display = 'flex';
  }

  updateUserProfileUI(user);

  if (isDashboardInitialized) {
    console.log('[AUTH] Dashboard initialization skipped');
    return;
  }

  isDashboardInitialized = true;
  console.log('[AUTH] Dashboard initialization started');

  try {
    if (typeof window.initAppAfterLogin === 'function') {
      await window.initAppAfterLogin();
    }
    console.log('[AUTH] Dashboard initialization completed');
  } catch (err) {
    isDashboardInitialized = false;
    console.error('[AUTH] Dashboard initialization failed:', err);
  }

  if (window.location.search.includes('code=') || window.location.hash.includes('access_token=')) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

export function showLoginScreen() {
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

  setLoginButtonState('idle');
}

export async function signOutUser() {
  await supabase.auth.signOut();

  window.globalRouteSheetData = [];
  if (typeof window.currentFilteredData !== 'undefined') window.currentFilteredData = [];

  showLoginScreen();
  if (typeof window.showToast === 'function') window.showToast('ออกจากระบบเรียบร้อยแล้ว');
}

export async function initializeAuthSession() {
  const urlParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const authError = urlParams.get('error_description') || urlParams.get('error') || hashParams.get('error_description');

  if (authError) {
    console.error('OAuth Return Error:', authError);
    if (typeof window.showToast === 'function') window.showToast(`⚠️ เข้าสู่ระบบไม่สำเร็จ: ${authError}`);
    showLoginScreen();
    window.history.replaceState({}, document.title, window.location.pathname);
    return;
  }

  const isOAuthRedirect = window.location.search.includes('code=') || window.location.hash.includes('access_token=');

  if (isOAuthRedirect) {
    setLoginButtonState('loading');
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      await handleUserAuthenticated(session.user);
    } else if (event === 'SIGNED_OUT') {
      showLoginScreen();
    } else if (!isOAuthRedirect) {
      showLoginScreen();
    }
  });

  try {
    const {
      data: { session }
    } = await supabase.auth.getSession();
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
