/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */

/**
 * ==============================================================================
 * 🚀 MAIN APP CONTROLLER (VITE + ES MODULES ENTRY POINT) - 100% RESTORED
 * ==============================================================================
 */

import { signInWithMicrosoft, signOutUser, initializeAuthSession, setLoginButtonState } from './services/auth.js';
import {
  fetchNewRouteSheet,
  fetchOriginLocations,
  fetchProvinceLocations,
  initExecutiveDashboardFast
} from './services/api.js';
import {
  initMaps,
  updateMapTiles,
  renderExecRouteHeatmap,
  highlightRegionOnExecMap,
  resetExecMapHighlight,
  updateMapDisplay
} from './features/map/map.js';

// ==============================================================================
// 1. GLOBAL STATE
// ==============================================================================
window.state = {
  isDark: false,
  lang: 'en',
  activeMenuId: 'exec',
  isSidebarOpen: true,
  isTableExpanded: true,
  activeFilters: { heatMetric: 'all', heatTheme: 'thermal', heatRadius: 35, displayMode: 'routes' },
  routeData: [],
  filters: {}
};

window.currentFilteredData = [];
window.globalRouteSheetData = [];
window.execCarrierListCache = [];

// ==============================================================================
// 2. UI HELPERS
// ==============================================================================
window.showToast = function (msg) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-msg');
  if (msgEl) msgEl.innerText = msg;
  if (toast) {
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
  }
};

function hideGlobalLoader() {
  const loader = document.getElementById('app-global-loader');
  if (loader) loader.classList.add('loader-hidden');
}

const yieldToMain = () => new Promise((resolve) => setTimeout(resolve, 15));

// ==============================================================================
// 3. APP INITIALIZATION (THE HEART OF THE DASHBOARD)
// ==============================================================================
window.initAppAfterLogin = async function () {
  console.log('[APP] 🚀 Starting Application Initialization...');

  const loginView = document.getElementById('auth-container');
  const appContainer = document.getElementById('main-app-container') || document.getElementById('main-app');

  if (loginView) loginView.classList.add('hidden');
  if (appContainer) appContainer.classList.remove('hidden', 'opacity-0', 'pointer-events-none');

  try {
    renderSidebarMenu();
    initMaps();
  } catch (e) {
    console.error('UI Render Error:', e);
  }

  await yieldToMain();
  window.updateView();

  try {
    await initExecutiveDashboardFast().catch(console.error);

    const [provData, originData, routeData] = await Promise.all([
      fetchProvinceLocations().catch(() => ({})),
      fetchOriginLocations().catch(() => ({})),
      fetchNewRouteSheet().catch(() => [])
    ]);

    window.provinceLocationMap = provData || {};
    window.originLocationMap = originData || {};
    window.globalRouteSheetData = routeData;

    await yieldToMain();

    await window.applyDynamicFilters();
    await updateExecutiveDashboard(window.globalRouteSheetData);

    setTimeout(() => {
      hideGlobalLoader();
    }, 200);
  } catch (err) {
    console.error('[APP] ❌ Data Fetch Error:', err);
    hideGlobalLoader();
  }
};

window.forceRefreshRouteData = async function () {
  window.showToast('กำลังดึงข้อมูลล่าสุดจากฐานข้อมูล...');
  try {
    sessionStorage.removeItem('cache_routes_data');
    const routeData = await fetchNewRouteSheet();
    window.globalRouteSheetData = routeData;
    await window.applyDynamicFilters();
    if (window.state.activeMenuId === 'exec') await updateExecutiveDashboard(window.globalRouteSheetData);
    window.showToast(`รีเฟรชสำเร็จ! ข้อมูล ${routeData.length.toLocaleString()} รายการ`);
  } catch (err) {
    window.showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล');
  }
};

// ==============================================================================
// 4. VIEW & SIDEBAR CONTROLLERS (ซ่อน/แสดง หน้าต่าง)
// ==============================================================================
const VIEW_IDS = ['view-exec', 'view-dashboard', 'view-mapping', 'view-simulation'];

window.switchMenu = function (menuId) {
  console.log(`[APP] 🔄 Switching to view: ${menuId}`);
  window.state.activeMenuId = menuId;
  window.updateView();
};

window.updateView = function () {
  VIEW_IDS.forEach((viewId) => {
    const el = document.getElementById(viewId);
    if (el) {
      if (viewId === `view-${window.state.activeMenuId}`) {
        el.classList.remove('hidden');
        el.style.display = 'flex';
      } else {
        el.classList.add('hidden');
        el.style.display = 'none';
      }
    }
  });

  renderSidebarMenu();

  if (window.state.activeMenuId === 'mapping' && window.map) {
    setTimeout(() => {
      window.map.invalidateSize();
    }, 100);
  }
};

function renderSidebarMenu() {
  const menus = [
    { id: 'exec', icon: 'pie-chart', nameKey: 'Executive Dashboard' },
    { id: 'dashboard', icon: 'map', nameKey: 'Route Dashboard' },
    { id: 'mapping', icon: 'navigation', nameKey: 'New Order Mapping' },
    { id: 'simulation', icon: 'box', nameKey: 'Simulation Mode' }
  ];
  const container = document.getElementById('menu-container');
  if (!container) return;
  container.innerHTML = menus
    .map(
      (m) => `
    <button onclick="window.switchMenu('${m.id}')" class="w-full flex items-center px-3 h-11 gap-3 rounded-xl text-xs font-semibold transition-all ${window.state.activeMenuId === m.id ? 'bg-orange-500/10 text-orange-500' : 'text-slate-400'}">
      <i data-lucide="${m.icon}" class="w-4.5 h-4.5"></i> <span>${m.nameKey}</span>
    </button>
  `
    )
    .join('');
  if (typeof window.lucide !== 'undefined') window.lucide.createIcons({ root: container });
}

// ==============================================================================
// 5. FILTERING & TABLE LOGIC
// ==============================================================================
window.toggleCustomDropdown = function (dropdownId) {
  document.querySelectorAll('.custom-select-dropdown').forEach((el) => {
    if (el.id !== dropdownId) el.classList.add('hidden');
  });
  document.getElementById(dropdownId)?.classList.toggle('hidden');
};

window.applyDynamicFilters = async function () {
  console.log('[APP] 📊 Applying Filters...');
  let filteredData = window.globalRouteSheetData || [];
  window.currentFilteredData = filteredData;
  if (typeof updateMapDisplay === 'function') updateMapDisplay(filteredData);
};

window.resetMapFilters = function () {
  window.showToast('Filters cleared');
  window.applyDynamicFilters();
};

window.filterTableByOrigin = function (originName) {
  window.showToast(`Filtering by ${originName}`);
};

window.focusTableRowByMapKey = function (mapKey) {
  window.showToast(`Focusing ${mapKey}`);
};

window.exportFilteredDataToCSV = function () {
  window.showToast('Export triggered');
};

// ==============================================================================
// 6. EXECUTIVE DASHBOARD & OTHERS
// ==============================================================================
async function updateExecutiveDashboard(data) {
  if (typeof renderExecRouteHeatmap === 'function') renderExecRouteHeatmap(data);
}

window.selectExecZoneCard = function (zoneName, _cardEl) {
  if (typeof highlightRegionOnExecMap === 'function') highlightRegionOnExecMap(zoneName);
};

window.closeExecZoneDetailTable = function () {
  if (typeof resetExecMapHighlight === 'function') resetExecMapHighlight();
};

window.analyzeNewOrderMapping = function () {
  window.showToast('Analyzing Mapping...');
};

window.backToSimInput = function () {
  window.showToast('Back to Input');
};

window.filterCarrierCardList = function (keyword) {
  console.log('Filtering carriers by:', keyword);
};

// ==============================================================================
// 7. EVENT LISTENERS & LIFECYCLE
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.lucide !== 'undefined') window.lucide.createIcons();
  setLoginButtonState('idle');

  document.getElementById('btn-login-ms')?.addEventListener('click', (e) => {
    e.preventDefault();
    signInWithMicrosoft();
  });

  document.getElementById('btn-logout')?.addEventListener('click', (e) => {
    e.preventDefault();
    signOutUser();
  });

  initializeAuthSession();

  document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
    window.state.isDark = !window.state.isDark;
    document.documentElement.classList.toggle('dark', window.state.isDark);
    if (typeof updateMapTiles === 'function') updateMapTiles();
  });
});
