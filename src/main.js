/**
 * ==============================================================================
 * MAIN APP CONTROLLER (VITE + ES MODULES ENTRY POINT)
 * ==============================================================================
 */

import { signInWithMicrosoft, signOutUser, initializeAuthSession, setLoginButtonState } from './services/auth.js';
import { fetchNewRouteSheet, fetchOriginLocations, fetchProvinceLocations } from './services/api.js';
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
  activeFilters: { heatMetric: 'all', heatTheme: 'thermal', heatRadius: 35, displayMode: 'routes' }
};

window.currentFilteredData = [];
window.globalRouteSheetData = [];
window.execCarrierListCache = [];

// ==============================================================================
// 2. EXPORT FUNCTIONS TO WINDOW (FOR HTML ONCLICK HANDLERS)
// ==============================================================================
window.forceRefreshRouteData = forceRefreshRouteData;
window.applyDynamicFilters = applyDynamicFilters;
window.toggleCustomDropdown = toggleCustomDropdown;
window.resetMapFilters = resetMapFilters;
window.exportFilteredDataToCSV = exportFilteredDataToCSV;
window.analyzeNewOrderMapping = analyzeNewOrderMapping;
window.backToSimInput = backToSimInput;
window.filterCarrierCardList = filterCarrierCardList;
window.closeExecZoneDetailTable = closeExecZoneDetailTable;
window.selectExecZoneCard = selectExecZoneCard;
window.focusTableRowByMapKey = focusTableRowByMapKey;
window.filterTableByOrigin = filterTableByOrigin;

// ==============================================================================
// 3. UI HELPERS
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
// 4. APP INITIALIZATION (THE HEART OF THE DASHBOARD)
// ==============================================================================
window.initAppAfterLogin = async function () {
  console.log('[APP] 🚀 Starting Application Initialization...');
  const app = document.getElementById('main-app');
  if (app) app.classList.remove('hidden', 'opacity-0', 'pointer-events-none');

  try {
    renderSidebarMenu();
    initMaps();
  } catch (e) {
    console.error('UI Render Error:', e);
  }

  await yieldToMain();

  try {
    const [provData, originData, routeData] = await Promise.all([
      fetchProvinceLocations().catch(() => ({})),
      fetchOriginLocations().catch(() => ({})),
      fetchNewRouteSheet().catch(() => [])
    ]);

    window.provinceLocationMap = provData || {};
    window.originLocationMap = originData || {};
    window.globalRouteSheetData = routeData;

    await yieldToMain();

    updateView();
    await applyDynamicFilters();
    await updateExecutiveDashboard(window.globalRouteSheetData);

    setTimeout(() => {
      hideGlobalLoader();
    }, 200);
  } catch (err) {
    console.error('[APP] ❌ Data Fetch Error:', err);
    hideGlobalLoader();
  }
};

async function forceRefreshRouteData() {
  window.showToast('กำลังดึงข้อมูลล่าสุดจากฐานข้อมูล...');
  try {
    sessionStorage.removeItem('cache_routes_data');
    const routeData = await fetchNewRouteSheet();
    window.globalRouteSheetData = routeData;
    await applyDynamicFilters();
    if (window.state.activeMenuId === 'exec') await updateExecutiveDashboard(window.globalRouteSheetData);
    window.showToast(`รีเฟรชสำเร็จ! ข้อมูล ${routeData.length.toLocaleString()} รายการ`);
  } catch (err) {
    window.showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล');
  }
}

// ==============================================================================
// 5. VIEW & SIDEBAR CONTROLLERS
// ==============================================================================
function updateView() {
  document.getElementById('view-exec').style.display = window.state.activeMenuId === 'exec' ? 'flex' : 'none';
  document.getElementById('view-dashboard').style.display = window.state.activeMenuId === 'dashboard' ? 'flex' : 'none';
  document.getElementById('view-mapping').style.display = window.state.activeMenuId === 'mapping' ? 'flex' : 'none';
  renderSidebarMenu();

  if (window.state.activeMenuId === 'dashboard') {
    applyDynamicFilters();
  }
}

window.switchMenu = function (id) {
  window.state.activeMenuId = id;
  updateView();
};

function renderSidebarMenu() {
  const menus = [
    { id: 'exec', icon: 'pie-chart', nameKey: 'Executive Dashboard' },
    { id: 'dashboard', icon: 'map', nameKey: 'Route Dashboard' },
    { id: 'mapping', icon: 'navigation', nameKey: 'New Order Mapping' }
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
// 6. FILTERING & TABLE LOGIC (STUBBED)
// ==============================================================================
function toggleCustomDropdown(dropdownId) {
  document.querySelectorAll('.custom-select-dropdown').forEach((el) => {
    if (el.id !== dropdownId) el.classList.add('hidden');
  });
  document.getElementById(dropdownId)?.classList.toggle('hidden');
}

async function applyDynamicFilters() {
  const filteredData = window.globalRouteSheetData;
  window.currentFilteredData = filteredData;
  updateMapDisplay(filteredData);
}

function resetMapFilters() {
  window.showToast('Filters cleared');
  applyDynamicFilters();
}
function filterTableByOrigin(originName) {
  window.showToast(`Filtering by ${originName}`);
}
function focusTableRowByMapKey(mapKey) {
  window.showToast(`Focusing ${mapKey}`);
}
function exportFilteredDataToCSV() {
  window.showToast('Export triggered');
}

// ==============================================================================
// 7. EXECUTIVE DASHBOARD & OTHERS
// ==============================================================================
async function updateExecutiveDashboard(data) {
  renderExecRouteHeatmap(data);
}
function selectExecZoneCard(zoneName, _cardEl) {
  highlightRegionOnExecMap(zoneName);
}
function closeExecZoneDetailTable() {
  resetExecMapHighlight();
}
function analyzeNewOrderMapping() {
  window.showToast('Analyzing Mapping...');
}
function backToSimInput() {
  window.showToast('Back to Input');
}
function filterCarrierCardList(keyword) {
  console.log('Filtering carriers by:', keyword);
}

// ==============================================================================
// 8. EVENT LISTENERS & LIFECYCLE
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
    updateMapTiles();
  });
});
