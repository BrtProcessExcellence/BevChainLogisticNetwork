/**
 * ==============================================================================
 * MAIN APP CONTROLLER (VITE + ES MODULES ENTRY POINT - FULLY RESTORED)
 * ==============================================================================
 */

import { supabase } from './lib/supabase.js';
import { dict, LOGISTICS_DICT, REVERSE_DICT, t, applySmartTranslation, currentAppLang } from './config/constants.js';
import {
  signInWithMicrosoft,
  signOutUser,
  initializeAuthSession,
  updateUserProfileUI,
  setLoginButtonState
} from './services/auth.js';
import {
  fetchNewRouteSheet,
  fetchExecProvinceSummary,
  fetchOriginLocations,
  fetchProvinceLocations,
  fetchExecutiveSummaryKPI,
  initExecutiveDashboardFast,
  loadDetailedRoutesInBackground
} from './services/api.js';
import {
  dashMap,
  simMap,
  execMap,
  initMaps,
  updateMapTiles,
  renderExecRouteHeatmap,
  highlightRegionOnExecMap,
  resetExecMapHighlight,
  updateMapDisplay,
  drawAllSheetRoutesOnSimMap,
  resetMapRouteStyles,
  highlightMapRoute
} from './features/map/map.js';
import { parseNum, formatNum, cleanAllSpaces, escapeHtml, escapeAttr } from './utils/helpers.js';

// ==============================================================================
// 1. GLOBAL STATE & CONSTANTS
// ==============================================================================
const ORIGIN_WORKING_DAYS = {
  BAB: 5,
  BBTDC: 6,
  CMB: 5,
  HY: 5,
  KKB: 5,
  KKRDC: 5,
  LLKDC: 6,
  LPRDC: 5,
  MSB: 5,
  PTB: 5,
  SBC: 5,
  SRB: 5,
  WN1: 6,
  WNDC: 6
};

const PAGE_SIZE = 50;

window.state = {
  isDark: false,
  lang: 'en',
  activeMenuId: 'exec',
  isSidebarOpen: true,
  isTableExpanded: true,
  simState: 'input',
  activeFilters: { heatMetric: 'quota', heatTheme: 'thermal', heatRadius: 35, displayMode: 'routes' }
};

window.currentFilteredData = [];
window.globalRouteSheetData = [];
window.execCarrierListCache = [];
window.execAllRoutesCache = [];
window.currentGroupKeys = [];
window.currentGroupMap = {};
window.provinceLocationMap = {};
window.originLocationMap = {};
let shipToLocationMap = {};

let currentPage = 1;
let regionChart = null;

let searchDebounceTimer = null;
let numericDebounceTimer = null;
let mapRenderDebounceTimer = null;

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
window.switchMenu = switchMenu;
window.filterDropdownList = filterDropdownList;
window.handleCheckboxChange = handleCheckboxChange;
window.changePage = changePage;
window.onTableRowClick = onTableRowClick;
window.toggleRouteDetail = toggleRouteDetail;
window.highlightSubconRoute = highlightSubconRoute;
window.routeTrendChart = null;

// ฟังก์ชันเปิด-ปิด กล่องกราฟ Trend
window.toggleTrendChart = function () {
  const container = document.getElementById('trend-chart-container');
  if (!container) return;

  const isHidden = container.classList.contains('hidden') || container.classList.contains('opacity-0');

  if (isHidden) {
    container.classList.remove('hidden');
    // หน่วงเวลาเล็กน้อยให้ CSS รัน Animation เลื่อนขึ้น
    setTimeout(() => {
      container.classList.remove('opacity-0', 'translate-y-10', 'pointer-events-none');
      container.classList.add('opacity-100', 'translate-y-0', 'pointer-events-auto');
      window.renderTrendChart();
    }, 10);
  } else {
    container.classList.remove('opacity-100', 'translate-y-0', 'pointer-events-auto');
    container.classList.add('opacity-0', 'translate-y-10', 'pointer-events-none');
    setTimeout(() => container.classList.add('hidden'), 300);
  }
};

// ฟังก์ชันคำนวณและวาดกราฟ ApexCharts
window.renderTrendChart = function () {
  const chartEl = document.querySelector('#chart-route-trend');
  if (!chartEl) return;

  const filteredData = window.currentFilteredData || window.globalRouteSheetData || [];
  const timeframe = document.getElementById('trend-timeframe')?.value || 'week';

  // 1. คำนวณปริมาณงานรวมจากข้อมูลที่กรองอยู่
  let baseTotalTrips = 0;
  let baseAvailTrips = 0;
  filteredData.forEach((row) => {
    const p = row._parsed;
    if (p) {
      baseTotalTrips += timeframe === 'day' ? p.tripsDay : timeframe === 'month' ? p.trips * 4 : p.trips;
      baseAvailTrips += timeframe === 'day' ? p.availTripsDay : timeframe === 'month' ? p.availTrips * 4 : p.availTrips;
    }
  });

  // 2. จำลองข้อมูลย้อนหลัง (Mock Time-Series) ให้กราฟดูสมจริง
  const categories = [];
  const dataTotal = [];
  const dataAvail = [];
  const dataPoints = timeframe === 'day' ? 7 : timeframe === 'week' ? 8 : 6;

  const now = new Date();
  for (let i = dataPoints - 1; i >= 0; i--) {
    let label = '';
    if (timeframe === 'day') {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    } else if (timeframe === 'week') {
      label = i === 0 ? 'Current' : `Wk -${i}`;
    } else {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      label = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    }
    categories.push(label);

    // ใส่สูตรสุ่มให้กราฟขึ้นลงประมาณ +/- 15% จากค่าเฉลี่ย
    const fluctuate = () => 0.85 + Math.random() * 0.3;
    dataTotal.push(Math.round(baseTotalTrips * fluctuate()));
    dataAvail.push(Math.round(baseAvailTrips * fluctuate()));
  }

  // 3. ตั้งค่ากราฟ ApexCharts
  const options = {
    series: [
      { name: 'Total Volume', data: dataTotal },
      { name: 'Available Backhaul', data: dataAvail }
    ],
    chart: {
      type: 'area',
      height: '100%',
      toolbar: { show: false },
      fontFamily: 'Sarabun, sans-serif',
      background: 'transparent',
      animations: { enabled: true, easing: 'easeinout', speed: 800 }
    },
    colors: ['#64748b', '#f97316'], // Slate สำหรับงานรวม, Orange สำหรับ Backhaul
    fill: {
      type: 'gradient',
      gradient: { shadeIntensity: 1, opacityFrom: 0.45, opacityTo: 0.05, stops: [0, 100] }
    },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2.5 },
    xaxis: {
      categories: categories,
      labels: { style: { colors: '#94a3b8', fontSize: '10px', fontWeight: 600 } },
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: {
      labels: {
        style: { colors: '#94a3b8', fontSize: '10px', fontWeight: 600 },
        formatter: (value) => value.toLocaleString()
      }
    },
    grid: {
      borderColor: window.state.isDark ? '#334155' : '#e2e8f0',
      strokeDashArray: 4,
      yaxis: { lines: { show: true } }
    },
    theme: { mode: window.state.isDark ? 'dark' : 'light' },
    legend: { position: 'top', horizontalAlign: 'right', fontSize: '11px', fontWeight: 700 }
  };

  // 4. วาด หรือ อัปเดต กราฟ
  if (window.routeTrendChart) {
    window.routeTrendChart.updateOptions(options, false, true);
    window.routeTrendChart.updateSeries(options.series);
  } else {
    window.routeTrendChart = new ApexCharts(chartEl, options);
    window.routeTrendChart.render();
  }
};

// 💡 สร้างสะพานเชื่อมให้ HTML ปุ่ม Zoom เข้าถึง Object แผนที่ของ Leaflet ได้
Object.defineProperty(window, 'dashMap', { get: () => dashMap });
Object.defineProperty(window, 'execMap', { get: () => execMap });
Object.defineProperty(window, 'simMap', { get: () => simMap });

// ==============================================================================
// 3. UI HELPERS & FORMATTING
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

function showGlobalLoader(message = 'กำลังโหลดข้อมูล...') {
  const loader = document.getElementById('app-global-loader');
  const textEl = document.getElementById('app-loader-text');
  if (textEl) textEl.textContent = message;
  if (loader) loader.classList.remove('loader-hidden');
}

function hideGlobalLoader() {
  const loader = document.getElementById('app-global-loader');
  if (loader) loader.classList.add('loader-hidden');
}

const yieldToMain = () => new Promise((resolve) => setTimeout(resolve, 15));

function getDistinctKey(row) {
  if (!row) return '';
  if (row._parsed?.distinctKey) return row._parsed.distinctKey;
  const prov = cleanAllSpaces(row['จังหวัด'] || row.province);
  const shipTo = cleanAllSpaces(row['Description(Ship-To (Outbound))'] || row.ship_to_desc) || prov;
  return [
    cleanAllSpaces(row['ต้นทาง'] || row.origin),
    cleanAllSpaces(row['ลูกค้า'] || row.customer_name),
    cleanAllSpaces(row['ประเภทลูกค้า'] || row.customer_type),
    cleanAllSpaces(row['ประเภทสินค้า'] || row.product_category),
    prov,
    cleanAllSpaces(row['Zone'] || row.zone),
    cleanAllSpaces(row['ประเภทรถ'] || row.truck_type),
    shipTo
  ]
    .filter(Boolean)
    .join('__');
}

function getMapRouteKey(row) {
  if (!row) return '';
  if (row._parsed?.mapRouteKey) return row._parsed.mapRouteKey;
  const origin = cleanAllSpaces(row['ต้นทาง'] || row.origin);
  const prov = cleanAllSpaces(row['จังหวัด'] || row.province);
  let shipTo = cleanAllSpaces(row['Description(Ship-To (Outbound))'] || row.ship_to_desc);
  if (!shipTo || shipTo === '-') shipTo = prov;
  return `${origin}__${shipTo}`;
}

function getAvailColorScale(availPct) {
  const val = parseFloat(availPct) || 0;
  if (val === 0) return { text: 'text-slate-500 dark:text-slate-400 font-bold', hex: '#334155' };
  if (val <= 30) return { text: 'text-rose-600 dark:text-rose-400 font-bold', hex: '#ef4444' };
  if (val <= 70) return { text: 'text-amber-600 dark:text-amber-400 font-bold', hex: '#f59e0b' };
  return { text: 'text-emerald-600 dark:text-emerald-400 font-black', hex: '#10b981' };
}

function precomputeRouteData(routes) {
  if (!Array.isArray(routes) || routes.length === 0) return [];
  return routes.map((row) => {
    const origin = String(row.origin || row['ต้นทาง'] || '-').trim();
    const destProv = String(row.province || row['จังหวัด'] || '-').trim();
    let shipTo = String(row.ship_to_desc || row['Description(Ship-To (Outbound))'] || '').trim();
    if (!shipTo || shipTo === '-') shipTo = destProv;

    const workingDays = ORIGIN_WORKING_DAYS[origin.toUpperCase()] || 6;
    const trips = parseNum(row.avg_trip_week || row['AVG Trip/Week'], 0);
    const tripsDay = trips / workingDays;

    const totalPct = parseNum(row.pct_total || row['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'], 0);
    const availPct = Math.max(0, 100 - totalPct);
    const availTrips = trips * (availPct / 100);
    const availTripsDay = availTrips / workingDays;

    const cleanOrigin = cleanAllSpaces(origin);
    const cleanCustomer = cleanAllSpaces(row.customer_name || row['ลูกค้า'] || '-');
    const cleanCustomerType = cleanAllSpaces(row.customer_type || row['ประเภทลูกค้า'] || '-');
    const cleanProduct = cleanAllSpaces(row.product_category || row['ประเภทสินค้า'] || '-');
    const cleanProv = cleanAllSpaces(destProv);
    const cleanZone = cleanAllSpaces(row.zone || row['Zone'] || '-');
    const cleanTruck = cleanAllSpaces(row.truck_type || row['ประเภทรถ'] || '-');
    const cleanShipTo = cleanAllSpaces(shipTo);
    const cleanCarrier = cleanAllSpaces(row.fwd_agent_desc || row['Description(FwdAgent)'] || '');

    const distinctKey = [
      cleanOrigin,
      cleanCustomer,
      cleanCustomerType,
      cleanProduct,
      cleanProv,
      cleanZone,
      cleanTruck,
      cleanShipTo
    ].join('__');
    const mapRouteKey = `${cleanOrigin}__${cleanShipTo}`;
    const searchIndex =
      `${row.id || ''} ${origin} ${destProv} ${row.customer_name || ''} ${row.fwd_agent_desc || ''}`.toLowerCase();

    return {
      ...row,
      _parsed: {
        workingDays,
        tripsDay,
        availTripsDay,
        trips,
        totalPct,
        availPct,
        availTrips,
        cleanOrigin,
        cleanCustomer,
        cleanCustomerType,
        cleanProduct,
        cleanProv,
        cleanZone,
        cleanTruck,
        cleanShipTo,
        cleanCarrier,
        distinctKey,
        mapRouteKey,
        searchIndex
      }
    };
  });
}

// ==============================================================================
// 4. APP INITIALIZATION
// ==============================================================================
window.initAppAfterLogin = async function () {
  console.log('[APP] 🚀 Starting Application Initialization...');
  showGlobalLoader('กำลังโหลดโครงสร้างระบบ...');

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

    showGlobalLoader('กำลังประมวลผลข้อมูลเส้นทาง...');
    await yieldToMain();

    window.globalRouteSheetData = precomputeRouteData(Array.isArray(routeData) ? routeData : []);

    await yieldToMain();
    updateView();
    populateDashboardFilters(window.globalRouteSheetData);
    await applyDynamicFilters();
    await updateExecutiveDashboard(window.globalRouteSheetData);

    setTimeout(() => {
      if (typeof execMap !== 'undefined' && execMap) execMap.invalidateSize();
      if (typeof dashMap !== 'undefined' && dashMap) dashMap.invalidateSize();
      hideGlobalLoader();
    }, 300);
  } catch (err) {
    console.error('[APP] ❌ Data Fetch Error:', err);
    hideGlobalLoader();
  }
};

async function forceRefreshRouteData() {
  window.showToast('กำลังดึงข้อมูลล่าสุดจากฐานข้อมูล...');
  showGlobalLoader('กำลังรีเฟรชข้อมูล...');
  try {
    sessionStorage.removeItem('cache_routes_data');
    const routeData = await fetchNewRouteSheet();
    window.globalRouteSheetData = precomputeRouteData(Array.isArray(routeData) ? routeData : []);
    populateDashboardFilters(window.globalRouteSheetData);
    await applyDynamicFilters();
    if (window.state.activeMenuId === 'exec') await updateExecutiveDashboard(window.globalRouteSheetData);

    setTimeout(() => {
      hideGlobalLoader();
    }, 300);
    window.showToast(`รีเฟรชสำเร็จ! ข้อมูล ${window.globalRouteSheetData.length.toLocaleString()} รายการ`);
  } catch (err) {
    hideGlobalLoader();
    window.showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล');
  }
}

// ==============================================================================
// 5. VIEW & SIDEBAR CONTROLLERS
// ==============================================================================
function updateView() {
  const execView = document.getElementById('view-exec');
  const dashView = document.getElementById('view-dashboard');

  if (execView) execView.style.display = window.state.activeMenuId === 'exec' ? 'flex' : 'none';
  if (dashView) dashView.style.display = window.state.activeMenuId === 'dashboard' ? 'flex' : 'none';

  const menuHeaders = {
    exec: { title: 'Executive Dashboard', subtitle: "Summarize route data for management's view" },
    dashboard: { title: 'Route Dashboard', subtitle: 'Existing routes and available backhaul data' }
  };

  const hTitle = document.getElementById('header-title');
  const hSubtitle = document.getElementById('header-subtitle');
  if (menuHeaders[window.state.activeMenuId]) {
    if (hTitle) hTitle.innerText = menuHeaders[window.state.activeMenuId].title;
    if (hSubtitle) hSubtitle.innerText = menuHeaders[window.state.activeMenuId].subtitle;
  }

  renderSidebarMenu();

  setTimeout(() => {
    if (window.state.activeMenuId === 'exec' && typeof execMap !== 'undefined' && execMap) execMap.invalidateSize();
    if (window.state.activeMenuId === 'dashboard' && typeof dashMap !== 'undefined' && dashMap)
      dashMap.invalidateSize();
  }, 300);
}

function switchMenu(id) {
  window.state.activeMenuId = id;
  updateView();

  if (id === 'dashboard') {
    setTimeout(() => {
      if (typeof window.applyDynamicFilters === 'function') {
        window.applyDynamicFilters();
      }
    }, 350);
  }
}

function renderSidebarMenu() {
  const menus = [
    { id: 'exec', icon: 'pie-chart', nameKey: 'Executive Dashboard' },
    { id: 'dashboard', icon: 'map', nameKey: 'Route Dashboard' }
  ];
  const container = document.getElementById('menu-container');
  if (!container) return;
  container.innerHTML = menus
    .map(
      (m) => `
    <button onclick="window.switchMenu('${m.id}')" class="w-full flex items-center ${window.state.isSidebarOpen ? 'px-3' : 'justify-center px-0'} h-11 gap-3 rounded-xl text-xs font-semibold transition-all duration-200 
      ${window.state.activeMenuId === m.id ? 'bg-orange-500/10 text-orange-500 shadow-inner' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-800 dark:hover:bg-zinc-800/50 dark:hover:text-slate-200'}">
      <i data-lucide="${m.icon}" class="w-4.5 h-4.5 shrink-0 ${window.state.activeMenuId === m.id ? 'text-orange-500' : 'text-slate-400'}"></i>
      ${window.state.isSidebarOpen ? `<span class="whitespace-nowrap">${m.nameKey}</span>` : ''}
    </button>
  `
    )
    .join('');
  if (typeof window.lucide !== 'undefined') window.lucide.createIcons({ root: container });
}

// ==============================================================================
// 6. EXECUTIVE DASHBOARD LOGIC (RESTORED)
// ==============================================================================
async function updateExecutiveDashboard(filteredData = []) {
  const routeData = filteredData && filteredData.length > 0 ? filteredData : window.globalRouteSheetData;
  populateExecProvinceMultiSelect(routeData);
  updateExecNewOrderMappingSection(routeData);
  updateExecAdvancedAnalytics(routeData);
  if (typeof renderExecRouteHeatmap === 'function') {
    renderExecRouteHeatmap(routeData);
  }
}

function calculateExecAnalytics(routeData) {
  const result = {
    carrierTotalCount: routeData.length,
    carrierUnavailableCount: 0,
    carrierAvailableCount: 0,
    totalTripsSum: 0,
    totalTripsDaySum: 0,
    unavailTripsSum: 0,
    unavailTripsDaySum: 0,
    availTripsSum: 0,
    availTripsDaySum: 0,
    distinctRouteMap: {},
    zoneSummaryMap: {},
    truckAvailMap: {},
    carrierAvailMap: {},
    allRoutesList: []
  };

  routeData.forEach((row) => {
    const p = row._parsed;
    const origin = String(row.origin || row['ต้นทาง'] || '-').trim();
    const province = String(row.province || row['จังหวัด'] || '-').trim();
    let shipTo = String(row.ship_to_desc || row['Description(Ship-To (Outbound))'] || '').trim();
    if (!shipTo || shipTo === '-') shipTo = province;
    const zone = String(row.zone || row['Zone'] || '-').trim();
    const truck = String(row.truck_type || row['ประเภทรถ'] || '-').trim();
    const rawFwdAgent = String(row.fwd_agent_desc || row['Description(FwdAgent)'] || row['ผู้รับเหมา'] || '').trim();

    const trips = p ? p.trips : parseNum(row.avg_trip_week, 0);
    const tripsDay = p ? p.tripsDay : trips / (ORIGIN_WORKING_DAYS[origin.toUpperCase()] || 6);

    const availPct = p ? p.availPct : Math.max(0, 100 - parseNum(row.pct_total, 0));
    const rowActualAvailTrips = p ? p.availTrips : trips * (availPct / 100);
    const rowActualAvailTripsDay = p
      ? p.availTripsDay
      : rowActualAvailTrips / (ORIGIN_WORKING_DAYS[origin.toUpperCase()] || 6);

    result.totalTripsSum += trips;
    result.totalTripsDaySum += tripsDay;

    if (availPct === 0) {
      result.carrierUnavailableCount++;
      result.unavailTripsSum += trips;
      result.unavailTripsDaySum += tripsDay;
    } else {
      result.carrierAvailableCount++;
      result.availTripsSum += rowActualAvailTrips;
      result.availTripsDaySum += rowActualAvailTripsDay;
    }

    const distinctKey = p ? p.distinctKey : getDistinctKey(row);
    if (!result.distinctRouteMap[distinctKey]) {
      result.distinctRouteMap[distinctKey] = {
        hasAvailable: false,
        totalTrips: 0,
        totalTripsDay: 0,
        availTrips: 0,
        availTripsDay: 0
      };
    }
    result.distinctRouteMap[distinctKey].totalTrips += trips;
    result.distinctRouteMap[distinctKey].totalTripsDay += tripsDay;
    result.distinctRouteMap[distinctKey].availTrips += rowActualAvailTrips;
    result.distinctRouteMap[distinctKey].availTripsDay += rowActualAvailTripsDay;
    if (availPct > 0) result.distinctRouteMap[distinctKey].hasAvailable = true;

    if (zone && zone !== '-') {
      if (!result.zoneSummaryMap[zone])
        result.zoneSummaryMap[zone] = {
          totalRoutes: 0,
          availRoutes: 0,
          totalTrips: 0,
          totalTripsDay: 0,
          availTrips: 0,
          availTripsDay: 0
        };
      result.zoneSummaryMap[zone].totalRoutes++;
      result.zoneSummaryMap[zone].totalTrips += trips;
      result.zoneSummaryMap[zone].totalTripsDay += tripsDay;
      if (availPct > 0) {
        result.zoneSummaryMap[zone].availRoutes++;
        result.zoneSummaryMap[zone].availTrips += rowActualAvailTrips;
        result.zoneSummaryMap[zone].availTripsDay += rowActualAvailTripsDay;
      }
    }

    if (truck && truck !== '-') {
      if (!result.truckAvailMap[truck])
        result.truckAvailMap[truck] = {
          totalRoutes: 0,
          availRoutes: 0,
          sumAvailPct: 0,
          totalTrips: 0,
          totalTripsDay: 0,
          availTrips: 0,
          availTripsDay: 0
        };
      result.truckAvailMap[truck].totalRoutes++;
      result.truckAvailMap[truck].totalTrips += trips;
      result.truckAvailMap[truck].totalTripsDay += tripsDay;
      result.truckAvailMap[truck].sumAvailPct += availPct;
      if (availPct > 0) {
        result.truckAvailMap[truck].availRoutes++;
        result.truckAvailMap[truck].availTrips += rowActualAvailTrips;
        result.truckAvailMap[truck].availTripsDay += rowActualAvailTripsDay;
      }
    }

    if (rawFwdAgent && rawFwdAgent !== '-' && rawFwdAgent !== 'ไม่ระบุ') {
      rawFwdAgent.split(/[,/|\n]+/).forEach((agent) => {
        const clean = agent.trim();
        if (clean && clean !== '-' && clean !== 'ไม่ระบุ') {
          if (!result.carrierAvailMap[clean])
            result.carrierAvailMap[clean] = {
              sumAvail: 0,
              count: 0,
              trips: 0,
              tripsDay: 0,
              availTrips: 0,
              availTripsDay: 0
            };
          result.carrierAvailMap[clean].sumAvail += availPct;
          result.carrierAvailMap[clean].count += 1;
          result.carrierAvailMap[clean].trips += trips;
          result.carrierAvailMap[clean].tripsDay += tripsDay;
          result.carrierAvailMap[clean].availTrips += rowActualAvailTrips;
          result.carrierAvailMap[clean].availTripsDay += rowActualAvailTripsDay;
        }
      });
    }

    result.allRoutesList.push({
      routeStr: `${origin} &rarr; ${shipTo}`,
      zone,
      carrier: rawFwdAgent || '-',
      trips,
      availPct,
      availTrips: rowActualAvailTrips
    });
  });

  return result;
}

function updateExecAdvancedAnalytics(routeData) {
  if (!routeData || routeData.length === 0) return;
  const data = calculateExecAnalytics(routeData);
  renderExecTopKPIs(data);
  renderExecTruckAvailList(data.truckAvailMap);
  renderExecCarrierCapacity(data.carrierAvailMap, data.allRoutesList);
}

function renderExecTopKPIs(data) {
  const distinctTotalCount = Object.keys(data.distinctRouteMap).length;
  const distinctAvailableCount = Object.values(data.distinctRouteMap).filter((r) => r.hasAvailable).length;
  const distinctAvailPct =
    distinctTotalCount > 0 ? ((distinctAvailableCount / distinctTotalCount) * 100).toFixed(1) : '0.0';

  const distinctTotalTripsWk = Object.values(data.distinctRouteMap).reduce((sum, r) => sum + r.totalTrips, 0);
  const distinctTotalTripsDay = Object.values(data.distinctRouteMap).reduce((sum, r) => sum + r.totalTripsDay, 0);

  const distinctAvailTripsWk = Object.values(data.distinctRouteMap).reduce(
    (sum, r) => sum + (r.hasAvailable ? r.availTrips : 0),
    0
  );
  const distinctAvailTripsDay = Object.values(data.distinctRouteMap).reduce(
    (sum, r) => sum + (r.hasAvailable ? r.availTripsDay : 0),
    0
  );

  const carrierUnavailPct =
    data.carrierTotalCount > 0 ? ((data.carrierUnavailableCount / data.carrierTotalCount) * 100).toFixed(1) : '0.0';
  const carrierAvailPct =
    data.carrierTotalCount > 0 ? ((data.carrierAvailableCount / data.carrierTotalCount) * 100).toFixed(1) : '0.0';

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  };
  const setHtml = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };

  setText('kpi-distinct-total', distinctTotalCount.toLocaleString());
  setText('kpi-distinct-avail-count', distinctAvailableCount.toLocaleString());
  setText('kpi-distinct-avail-pct', `(${distinctAvailPct}%)`);
  setHtml(
    'kpi-distinct-total-trips',
    `<div><strong class="text-slate-700 dark:text-slate-200">${Math.round(distinctTotalTripsWk).toLocaleString()}</strong> trips/wk</div><div class="text-[9px] text-slate-400 font-normal">(~${distinctTotalTripsDay.toFixed(1)} trips/day)</div>`
  );
  setHtml(
    'kpi-distinct-avail-trips',
    `<div><strong class="text-emerald-700 dark:text-emerald-300">${Math.round(distinctAvailTripsWk).toLocaleString()}</strong> trips/wk</div><div class="text-[9px] text-emerald-500 font-normal">(~${distinctAvailTripsDay.toFixed(1)} trips/day)</div>`
  );

  setText('kpi-carrier-total', data.carrierTotalCount.toLocaleString());
  setText('kpi-carrier-unavail', data.carrierUnavailableCount.toLocaleString());
  setText('kpi-carrier-unavail-pct', `(${carrierUnavailPct}%)`);
  setText('kpi-carrier-avail', data.carrierAvailableCount.toLocaleString());
  setText('kpi-carrier-avail-pct', `(${carrierAvailPct}%)`);
  setHtml(
    'kpi-carrier-total-trips',
    `<div><strong class="text-slate-700 dark:text-slate-200">${Math.round(data.totalTripsSum).toLocaleString()}</strong> trips/wk</div><div class="text-[9px] text-slate-400 font-normal">(~${data.totalTripsDaySum.toFixed(1)} trips/day)</div>`
  );
  setHtml(
    'kpi-carrier-unavail-trips',
    `<div><strong class="text-rose-700 dark:text-rose-300">${Math.round(data.unavailTripsSum).toLocaleString()}</strong> trips/wk</div><div class="text-[9px] text-rose-500 font-normal">(~${data.unavailTripsDaySum.toFixed(1)} trips/day)</div>`
  );
  setHtml(
    'kpi-carrier-avail-trips',
    `<div><strong class="text-emerald-700 dark:text-emerald-300">${Math.round(data.availTripsSum).toLocaleString()}</strong> trips/wk</div><div class="text-[9px] text-emerald-500 font-normal">(~${data.availTripsDaySum.toFixed(1)} trips/day)</div>`
  );
}

function renderExecTruckAvailList(truckAvailMap) {
  const truckListEl = document.getElementById('exec-truck-avail-list');
  if (!truckListEl) return;

  const sortedTrucks = Object.entries(truckAvailMap)
    .map(([type, stat]) => ({
      type,
      totalRoutes: stat.totalRoutes,
      availRoutes: stat.availRoutes,
      totalTrips: stat.totalTrips,
      availTrips: stat.availTrips,
      availTripsDay: stat.availTripsDay,
      availRatio: stat.totalRoutes > 0 ? (stat.availRoutes / stat.totalRoutes) * 100 : 0
    }))
    .sort((a, b) => b.availRoutes - a.availRoutes);

  if (sortedTrucks.length === 0) {
    truckListEl.innerHTML = `<div class="col-span-full py-8 text-center text-xs text-slate-400 font-sans border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-zinc-900/50">ไม่พบข้อมูลประเภทรถสำหรับจังหวัดที่เลือก</div>`;
    return;
  }

  truckListEl.innerHTML = sortedTrucks
    .map((item) => {
      const color = getAvailColorScale(item.availRatio);
      const radius = 18,
        circumference = 2 * Math.PI * radius;
      const offset = circumference - (Math.min(item.availRatio, 100) / 100) * circumference;

      return `
      <div class="p-3.5 rounded-2xl bg-slate-50/70 dark:bg-zinc-950/70 border border-slate-200/80 dark:border-slate-800 hover:border-orange-500/60 hover:shadow-md transition-all flex flex-col justify-between space-y-3 font-sans">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-8 h-8 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-orange-500 shadow-sm shrink-0"><i data-lucide="truck" class="w-4 h-4"></i></div>
            <div class="truncate">
              <h5 class="text-xs font-black text-slate-800 dark:text-white truncate" title="${escapeAttr(item.type)}">${escapeHtml(item.type)}</h5>
              <span class="text-[10px] font-semibold text-slate-400">${item.totalRoutes.toLocaleString()} Routes</span>
            </div>
          </div>
          <div class="relative w-11 h-11 shrink-0 flex items-center justify-center">
            <svg class="w-full h-full -rotate-90" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="${radius}" class="stroke-slate-200 dark:stroke-zinc-800" stroke-width="3.5" fill="none" />
              <circle cx="22" cy="22" r="${radius}" stroke="${color.hex}" stroke-width="3.5" stroke-linecap="round" fill="none" style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset}; transition: stroke-dashoffset 0.6s ease;" />
            </svg>
            <span class="absolute text-[9px] font-black text-slate-800 dark:text-white">${Math.round(item.availRatio)}%</span>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/80 text-[10px]">
          <div class="bg-white/80 dark:bg-zinc-900/80 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
            <span class="text-slate-400 block text-[9px] font-medium">Available Routes</span><strong class="${color.text} text-xs font-black">${item.availRoutes.toLocaleString()}</strong>
          </div>
          <div class="bg-white/80 dark:bg-zinc-900/80 p-2 rounded-xl border border-slate-100 dark:border-slate-800 text-right">
            <span class="text-slate-400 block text-[9px] font-medium">Available Volume</span>
            <strong class="text-slate-800 dark:text-slate-200 text-xs font-black">${Math.round(item.availTrips).toLocaleString()} <span class="text-[9px] text-slate-400 font-normal">trips/wk</span></strong>
            <div class="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold">(~${item.availTripsDay.toFixed(1)} trips/day)</div>
          </div>
        </div>
      </div>
    `;
    })
    .join('');
  if (typeof window.lucide !== 'undefined') window.lucide.createIcons({ root: truckListEl });
}

function renderExecCarrierCapacity(carrierAvailMap, allRoutesList) {
  const availCapCountEl = document.getElementById('exec-avail-cap-count');

  window.drawCarrierCardElements = function (carriers) {
    const listEl = document.getElementById('exec-avail-cap-list');
    if (!listEl) return;
    if (!carriers || carriers.length === 0) {
      listEl.innerHTML = `<div class="col-span-full py-8 text-center text-xs text-slate-400 font-sans">No carrier matching your criteria</div>`;
      return;
    }

    listEl.innerHTML = carriers
      .map((item) => {
        const color = getAvailColorScale(item.avgAvail);
        return `
        <div class="carrier-item-card p-3 rounded-2xl bg-slate-50/80 dark:bg-zinc-950/70 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500 hover:shadow-md transition-all flex flex-col justify-between space-y-2.5 font-sans">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0"><span class="font-extrabold text-xs text-slate-800 dark:text-slate-100 block truncate" title="${escapeAttr(item.name)}">${escapeHtml(item.name)}</span><span class="text-[10px] text-slate-400 font-medium">${item.count.toLocaleString()} routes registered</span></div>
            <div class="text-right shrink-0"><span class="text-xs font-black ${color.text} block">${item.avgAvail}%</span><span class="text-[9px] text-slate-400 uppercase tracking-wider">Available</span></div>
          </div>
          <div class="w-full bg-slate-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden"><div class="h-full rounded-full transition-all duration-500" style="width: ${Math.min(item.avgAvail, 100)}%; background-color: ${color.hex};"></div></div>
          <div class="flex items-center justify-between text-[10px] pt-1 border-t border-slate-200/50 dark:border-slate-800/80 text-slate-400">
            <span class="font-medium">Available Volume</span><strong class="text-slate-700 dark:text-slate-300 font-bold">~${Math.round(item.availTrips).toLocaleString()} /wk <span class="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold">(~${item.availTripsDay.toFixed(1)} trips/day)</span></strong>
          </div>
        </div>
      `;
      })
      .join('');
    if (typeof window.lucide !== 'undefined') window.lucide.createIcons({ root: listEl });
  };

  const sortedCarrierAvail = Object.entries(carrierAvailMap)
    .map(([name, stat]) => ({
      name,
      count: stat.count,
      trips: stat.trips,
      availTrips: stat.availTrips,
      availTripsDay: stat.availTripsDay,
      avgAvail: Math.round(stat.sumAvail / stat.count)
    }))
    .sort((a, b) => (b.avgAvail !== a.avgAvail ? b.avgAvail - a.avgAvail : b.count - a.count));

  window.execCarrierListCache = sortedCarrierAvail;
  if (availCapCountEl) availCapCountEl.innerText = `${sortedCarrierAvail.length.toLocaleString()} Carriers`;

  const searchInput = document.getElementById('input-search-carrier');
  if (searchInput && searchInput.value.trim() !== '') filterCarrierCardList(searchInput.value);
  else window.drawCarrierCardElements(sortedCarrierAvail);

  window.execAllRoutesCache = allRoutesList;
}

function updateExecNewOrderMappingSection(sourceData) {
  const container = document.getElementById('exec-region-summary-list');
  if (!container || !sourceData || sourceData.length === 0) {
    if (container)
      container.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 font-sans col-span-full">No active routes found</div>`;
    return;
  }

  const zoneStats = {};
  sourceData.forEach((row) => {
    const p = row._parsed;
    const origin = String(row.origin || row['ต้นทาง'] || '-').trim();
    const zoneName = String(row.zone || row['Zone'] || '').trim();
    if (zoneName && zoneName !== 'undefined' && zoneName !== '-' && zoneName !== 'null') {
      const workingDays = p ? p.workingDays : ORIGIN_WORKING_DAYS[origin.toUpperCase()] || 6;
      const trips = p ? p.trips : parseNum(row.avg_trip_week, 0);
      const tripsDay = p ? p.tripsDay : trips / workingDays;

      const availPct = p ? p.availPct : Math.max(0, 100 - parseNum(row.pct_total, 0));
      const availTrips = p ? p.availTrips : trips * (availPct / 100);
      const availTripsDay = p ? p.availTripsDay : availTrips / workingDays;

      if (!zoneStats[zoneName])
        zoneStats[zoneName] = {
          totalRoutes: 0,
          availRoutes: 0,
          totalTrips: 0,
          totalTripsDay: 0,
          availTrips: 0,
          availTripsDay: 0
        };

      zoneStats[zoneName].totalRoutes += 1;
      zoneStats[zoneName].totalTrips += trips;
      zoneStats[zoneName].totalTripsDay += tripsDay;

      if (availPct > 0) {
        zoneStats[zoneName].availRoutes += 1;
        zoneStats[zoneName].availTrips += availTrips;
        zoneStats[zoneName].availTripsDay += availTripsDay;
      }
    }
  });

  const sortedZones = Object.entries(zoneStats)
    .map(([zoneName, stat]) => ({
      zoneName,
      totalRoutes: stat.totalRoutes,
      availRoutes: stat.availRoutes,
      totalTrips: stat.totalTrips,
      totalTripsDay: stat.totalTripsDay,
      availTrips: stat.availTrips,
      availTripsDay: stat.availTripsDay,
      zoneAvailPct: stat.totalRoutes > 0 ? (stat.availRoutes / stat.totalRoutes) * 100 : 0
    }))
    .sort((a, b) =>
      b.zoneAvailPct !== a.zoneAvailPct ? b.zoneAvailPct - a.zoneAvailPct : b.availRoutes - a.availRoutes
    );

  if (sortedZones.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 font-sans col-span-full">No active routes for selected filter</div>`;
    return;
  }

  container.innerHTML = sortedZones
    .map(
      (item) => `
    <div onclick="window.selectExecZoneCard('${escapeAttr(item.zoneName)}', this)" class="p-4 rounded-2xl bg-white dark:bg-zinc-950 border border-slate-200/90 dark:border-slate-800 hover:border-orange-500 cursor-pointer transition-all flex items-center justify-between font-sans shadow-sm hover:shadow-md">
      <div>
        <h5 class="text-sm font-extrabold text-slate-800 dark:text-white mb-1">${escapeHtml(item.zoneName)}</h5>
        <p class="text-[11px] text-slate-400 font-medium">
          ${item.totalRoutes.toLocaleString()} routes (${Math.round(item.totalTrips).toLocaleString()} trips/wk • ~${item.totalTripsDay.toFixed(1)} trips/day)
        </p>
      </div>
      <div class="text-right">
        <div class="text-sm font-black text-emerald-600 dark:text-emerald-400 mb-1">
          ${item.availRoutes.toLocaleString()} routes <span class="text-xs">(${item.zoneAvailPct.toFixed(2)}%)</span>
        </div>
        <p class="text-[11px] text-slate-400 font-medium">
          ~${Math.round(item.availTrips).toLocaleString()} trips/wk (~${item.availTripsDay.toFixed(1)} trips/day)
        </p>
      </div>
    </div>
  `
    )
    .join('');
}

function selectExecZoneCard(zoneName, cardEl) {
  const isAlreadyActive = cardEl && cardEl.classList.contains('ring-orange-500');
  if (isAlreadyActive) {
    closeExecZoneDetailTable();
    return;
  }

  window.currentSelectedZone = cleanAllSpaces(zoneName);

  document.querySelectorAll('#exec-region-summary-list > div').forEach((card) => {
    card.classList.remove('ring-2', 'ring-orange-500', 'border-orange-500', 'shadow-md');
    card.classList.add('border-slate-200/90', 'dark:border-slate-800');
  });

  if (cardEl) {
    cardEl.classList.remove('border-slate-200/90', 'dark:border-slate-800');
    cardEl.classList.add('ring-2', 'ring-orange-500', 'border-orange-500', 'shadow-md');
  }

  highlightRegionOnExecMap(zoneName);
  showExecZoneDetailsTable(zoneName);

  const filteredRoutes = getExecFilteredRoutes();
  updateExecAdvancedAnalytics(filteredRoutes);
}

function closeExecZoneDetailTable() {
  window.currentSelectedZone = null;
  const panel = document.getElementById('exec-zone-detail-panel');
  if (panel) {
    panel.classList.add('hidden');
    panel.style.display = 'none';
  }
  document.querySelectorAll('#exec-region-summary-list > div').forEach((card) => {
    card.classList.remove('ring-2', 'ring-orange-500', 'border-orange-500', 'shadow-md');
    card.classList.add('border-slate-200/90', 'dark:border-slate-800');
  });
  resetExecMapHighlight();
  const filteredRoutes = getExecFilteredRoutes();
  updateExecAdvancedAnalytics(filteredRoutes);
}

function getExecFilteredRoutes() {
  let allRoutes = window.globalRouteSheetData || [];
  const selectedProvinces = getMultiSelectValues('exec-province');
  const isAllProv = selectedProvinces.includes('all') || selectedProvinces.length === 0;

  return allRoutes.filter((row) => {
    const p = row._parsed ? row._parsed.cleanProv : cleanAllSpaces(row.province);
    const matchProv = isAllProv || selectedProvinces.some((sel) => p === sel || p.includes(sel) || sel.includes(p));
    let matchZone = true;
    if (window.currentSelectedZone) {
      const z = row._parsed ? row._parsed.cleanZone : cleanAllSpaces(row.zone);
      matchZone =
        z === window.currentSelectedZone ||
        z.includes(window.currentSelectedZone) ||
        window.currentSelectedZone.includes(z);
    }
    return matchProv && matchZone;
  });
}

function showExecZoneDetailsTable(zoneName) {
  const panel = document.getElementById('exec-zone-detail-panel');
  const tbody = document.getElementById('exec-zone-table-body');
  if (!panel || !tbody) return;

  const matchedRoutes = getExecFilteredRoutes();

  matchedRoutes.sort((a, b) => {
    const availA = a._parsed?.availPct ?? Math.max(0, 100 - parseNum(a.pct_total));
    const availB = b._parsed?.availPct ?? Math.max(0, 100 - parseNum(b.pct_total));
    if (availB !== availA) return availB - availA;
    const tripsA = a._parsed?.trips ?? parseNum(a.avg_trip_week);
    const tripsB = b._parsed?.trips ?? parseNum(b.avg_trip_week);
    return tripsB - tripsA;
  });

  const titleEl = document.getElementById('exec-selected-zone-name');
  const badgeEl = document.getElementById('exec-selected-zone-badge');
  if (titleEl) titleEl.innerText = zoneName;
  if (badgeEl) badgeEl.innerText = `${matchedRoutes.length.toLocaleString()} Routes`;

  if (matchedRoutes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400 font-sans">ไม่พบข้อมูลเส้นทางในโซน ${escapeHtml(zoneName)}</td></tr>`;
  } else {
    tbody.innerHTML = matchedRoutes
      .map((row) => {
        const p = row._parsed;
        const origin = row.origin || '-';
        const customer = row.customer_name || '-';
        const shipToDesc = row.ship_to_desc || row.province || '-';
        const avgTrip = p ? p.trips : parseNum(row.avg_trip_week);
        const availPct = p ? p.availPct : Math.max(0, 100 - parseNum(row.pct_total));
        const color = getAvailColorScale(availPct);

        return `
        <tr class="hover:bg-slate-100/60 dark:hover:bg-zinc-900/60 transition-colors font-sans border-b border-slate-100 dark:border-slate-800/60 text-xs">
          <td class="p-2.5 font-bold text-slate-800 dark:text-slate-200">${escapeHtml(origin)}</td>
          <td class="p-2.5 max-w-[220px]"><strong class="block truncate">${escapeHtml(customer)}</strong><span class="text-[10px] text-slate-400 block truncate">${escapeHtml(shipToDesc)}</span></td>
          <td class="p-2.5 font-medium">${escapeHtml(row.province || '-')}</td>
          <td class="p-2.5 text-slate-500">${escapeHtml(row.product_category || '-')}</td>
          <td class="p-2.5 text-slate-500">${escapeHtml(row.truck_type || '-')}</td>
          <td class="p-2.5 font-semibold text-orange-600 dark:text-orange-400">${escapeHtml(row.fwd_agent_desc || 'ไม่ระบุ')}</td>
          <td class="p-2.5 text-center font-Sarabun font-bold">${formatNum(avgTrip)}</td>
          <td class="p-2.5 text-right font-Sarabun font-bold ${color.text}">${Math.round(availPct)}%</td>
        </tr>
      `;
      })
      .join('');
  }

  panel.classList.remove('hidden');
  panel.style.display = 'block';
  if (typeof window.lucide !== 'undefined') window.lucide.createIcons({ root: panel });
}

function filterCarrierCardList(keyword) {
  const key = (keyword || '').trim().toLowerCase();
  const allList = window.execCarrierListCache || [];
  if (typeof window.drawCarrierCardElements === 'function') {
    window.drawCarrierCardElements(!key ? allList : allList.filter((item) => item.name.toLowerCase().includes(key)));
  }
}

// ==============================================================================
// 7. ROUTE DASHBOARD & FILTERING LOGIC
// ==============================================================================
function getMultiSelectValues(filterId) {
  const checkboxes = document.querySelectorAll(`.checkbox-${filterId}`);
  if (!checkboxes || checkboxes.length === 0) return ['all'];
  const selected = Array.from(checkboxes)
    .filter((cb) => cb.checked)
    .map((cb) => cleanAllSpaces(cb.value));
  return selected.length === 0 || selected.includes('all') ? ['all'] : selected;
}

function updateFilterLabel(filterId, defaultLabel = 'All') {
  const checkboxes = document.querySelectorAll(`.checkbox-${filterId}`);
  const labelEl = document.getElementById(`label-${filterId}`);
  if (!labelEl) return;

  const selected = Array.from(checkboxes)
    .filter((cb) => cb.checked && cb.value !== 'ALL')
    .map((cb) => cb.value);
  if (selected.length === 0) {
    labelEl.innerText = defaultLabel;
    labelEl.className = 'truncate text-slate-500 dark:text-slate-400 font-normal';
  } else if (selected.length === 1) {
    labelEl.innerText = selected[0];
    labelEl.className = 'truncate text-slate-800 dark:text-slate-200 font-bold';
  } else {
    labelEl.innerText = `${selected.length} Selected`;
    labelEl.className =
      'truncate text-orange-600 dark:text-orange-400 font-bold bg-orange-100 dark:bg-orange-500/20 px-2 py-0.5 rounded-md';
  }
}

function toggleCustomDropdown(dropdownId) {
  const targetDropdown = document.getElementById(dropdownId);
  const isCurrentlyHidden = targetDropdown?.classList.contains('hidden');

  // ปิด Dropdown ทั้งหมดและรีเซ็ตลูกศรกลับเป็น chevron-down
  document.querySelectorAll('.custom-select-dropdown').forEach((el) => {
    el.classList.add('hidden');
  });
  document.querySelectorAll('.custom-select-container button i[data-lucide]').forEach((icon) => {
    icon.setAttribute('data-lucide', 'chevron-down');
  });

  // ถ้าตัวที่คลิกกำลังซ่อนอยู่ ให้เปิด และเปลี่ยนลูกศรเป็น chevron-up
  if (isCurrentlyHidden && targetDropdown) {
    targetDropdown.classList.remove('hidden');
    const container = targetDropdown.closest('.custom-select-container');
    if (container) {
      const icon = container.querySelector('button i[data-lucide]');
      if (icon) icon.setAttribute('data-lucide', 'chevron-up');
    }
  }

  // รีเฟรชไอคอน
  if (typeof window.lucide !== 'undefined') window.lucide.createIcons();
}

function filterDropdownList(filterId, keyword) {
  const container = document.getElementById(`list-${filterId}`);
  if (!container) return;
  const items = container.querySelectorAll('.dropdown-item');
  const searchKey = keyword.trim().toLowerCase();
  items.forEach((item) => {
    const isAllOption = item.querySelector('input')?.value === 'ALL';
    const text = item.innerText.toLowerCase();
    item.style.display = isAllOption || text.includes(searchKey) ? 'flex' : 'none';
  });
}

function handleCheckboxChange(filterId, value) {
  const checkboxes = document.querySelectorAll(`.checkbox-${filterId}`);
  const allCheckbox = Array.from(checkboxes).find((cb) => cb.value === 'ALL');

  if (value === 'ALL') {
    if (allCheckbox?.checked) {
      checkboxes.forEach((cb) => {
        if (cb.value !== 'ALL') cb.checked = false;
      });
    } else if (allCheckbox) {
      allCheckbox.checked = true;
    }
  } else {
    const anyChecked = Array.from(checkboxes).some((cb) => cb.value !== 'ALL' && cb.checked);
    if (allCheckbox) allCheckbox.checked = !anyChecked;
  }

  updateFilterLabel(filterId, filterId === 'exec-province' ? 'All Provinces' : 'All');
  if (filterId === 'exec-province') {
    const filteredRoutes = getExecFilteredRoutes();
    updateExecNewOrderMappingSection(filteredRoutes);
    updateExecAdvancedAnalytics(filteredRoutes);
    renderExecRouteHeatmap(filteredRoutes);
  } else {
    applyDynamicFilters();
  }
}

function populateExecProvinceMultiSelect(routeData) {
  const container = document.getElementById('dropdown-exec-province');
  if (!container || !routeData || routeData.length === 0) return;
  const provinces = [...new Set(routeData.map((r) => String(r.province || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'th')
  );
  let html = `
    <div class="p-1 mb-1 border-b sticky top-0 bg-white dark:bg-zinc-900 z-10 font-sans">
      <div class="relative"><i data-lucide="search" class="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"></i><input type="text" placeholder="Search All Provinces..." oninput="filterDropdownList('exec-province', this.value)" onclick="event.stopPropagation()" class="w-full pl-7 pr-2 py-1 rounded-lg text-[11px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-slate-200 outline-none focus:border-orange-500"></div>
    </div>
    <div id="list-exec-province" class="max-h-44 overflow-y-auto custom-scrollbar flex flex-col gap-0.5 pr-0.5 font-sans">
      <label class="dropdown-item flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-orange-50 dark:hover:bg-orange-500/10 rounded-lg cursor-pointer transition-colors group">
        <input type="checkbox" value="ALL" class="checkbox-exec-province w-3.5 h-3.5 rounded border-slate-300 accent-[#f97316] focus:ring-[#f97316] transition-all cursor-pointer" checked onchange="window.handleCheckboxChange('exec-province', 'ALL')">
        <span class="text-xs font-bold">All Provinces</span>
      </label>
  `;
  html += provinces
    .map(
      (prov) =>
        `<label class="dropdown-item flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-zinc-800/50 rounded-lg cursor-pointer transition-colors group"><input type="checkbox" value="${escapeAttr(prov)}" class="checkbox-exec-province w-3.5 h-3.5 rounded border-slate-300 accent-[#f97316] focus:ring-[#f97316]" onchange="window.handleCheckboxChange('exec-province', '${escapeAttr(prov)}')"><span class="text-xs truncate">${escapeHtml(prov)}</span></label>`
    )
    .join('');
  html += `</div>`;
  container.innerHTML = html;
  updateFilterLabel('exec-province', 'All Provinces');
  if (typeof window.lucide !== 'undefined') window.lucide.createIcons({ root: container });
}

function populateDashboardFilters(data) {
  if (!data || data.length === 0) return;
  const getUniqueValues = (keyEN) => {
    const set = new Set();
    data.forEach((row) => {
      const val = String(row[keyEN] || '').trim();
      if (val && val !== 'undefined' && val !== '-') set.add(val);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'));
  };

  const updateSelectOptions = (filterId, options, defaultLabel = 'All') => {
    const container = document.getElementById(`dropdown-${filterId}`);
    if (!container) return;
    let html = `
      <div class="p-1 mb-1 border-b sticky top-0 bg-white dark:bg-zinc-900 z-10"><div class="relative"><i data-lucide="search" class="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"></i><input type="text" placeholder="Search ${defaultLabel}..." oninput="window.filterDropdownList('${filterId}', this.value)" onclick="event.stopPropagation()" class="w-full pl-7 pr-2 py-1 rounded-lg text-[11px] border outline-none focus:border-orange-500 bg-slate-50 dark:bg-zinc-950 dark:border-slate-700"></div></div>
      <div id="list-${filterId}" class="max-h-44 overflow-y-auto custom-scrollbar flex flex-col gap-0.5"><label class="dropdown-item flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-orange-50 dark:hover:bg-orange-500/10 rounded-lg cursor-pointer"><input type="checkbox" value="ALL" class="checkbox-${filterId} w-3.5 h-3.5 rounded border-slate-300 accent-[#f97316]" checked onchange="window.handleCheckboxChange('${filterId}', 'ALL')"><span class="text-xs font-bold">${defaultLabel}</span></label>
    `;
    html += options
      .map(
        (opt) =>
          `<label class="dropdown-item flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-zinc-800/50 rounded-lg cursor-pointer"><input type="checkbox" value="${escapeAttr(opt)}" class="checkbox-${filterId} w-3.5 h-3.5 rounded border-slate-300 accent-[#f97316]" onchange="window.handleCheckboxChange('${filterId}', '${escapeAttr(opt)}')"><span class="text-xs truncate">${escapeHtml(opt)}</span></label>`
      )
      .join('');
    html += `</div>`;
    container.innerHTML = html;
    updateFilterLabel(filterId, defaultLabel);
    if (typeof window.lucide !== 'undefined') window.lucide.createIcons({ root: container });
  };

  const originLocations = Object.values(window.originLocationMap || {});
  const uniqueOriginZones = [...new Set(originLocations.map((l) => l.zone).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'th')
  );

  updateSelectOptions('filter-origin-zone', uniqueOriginZones, 'All Origin Zones');
  updateSelectOptions('filter-origin-dc', getUniqueValues('origin'), 'All Origin DCs');
  updateSelectOptions('filter-carrier', getUniqueValues('fwd_agent_desc'), 'All Carriers');
  updateSelectOptions('filter-truck-type', getUniqueValues('truck_type'), 'All Truck Types');
  updateSelectOptions('filter-dest-region', getUniqueValues('zone'), 'All Zones');
  updateSelectOptions('filter-dest-province', getUniqueValues('province'), 'All Provinces');
  updateSelectOptions('filter-customer-type', getUniqueValues('customer_type'), 'All Types');
  updateSelectOptions('filter-customer-name', getUniqueValues('customer_name'), 'All Customers');
  updateSelectOptions('filter-shipto-desc', getUniqueValues('ship_to_desc'), 'All Locations');
  updateSelectOptions('filter-product-cat', getUniqueValues('product_category'), 'All Categories');
}

async function applyDynamicFilters() {
  if (!window.globalRouteSheetData || window.globalRouteSheetData.length === 0) return;

  const searchKeyword = (document.querySelector('#filters-content input[type="text"]')?.value || '')
    .trim()
    .toLowerCase();
  const selCarriers = getMultiSelectValues('filter-carrier');
  const selTruckTypes = getMultiSelectValues('filter-truck-type');
  const selOriginDCs = getMultiSelectValues('filter-origin-dc');
  const selOriginZones = getMultiSelectValues('filter-origin-zone');
  const selDestRegions = getMultiSelectValues('filter-dest-region');
  const selDestProvinces = getMultiSelectValues('filter-dest-province');
  const selCustomerTypes = getMultiSelectValues('filter-customer-type');
  const selCustomerNames = getMultiSelectValues('filter-customer-name');
  const selShipToDescs = getMultiSelectValues('filter-shipto-desc');
  const selProducts = getMultiSelectValues('filter-product-cat');

  const minBackhaul = parseFloat(document.getElementById('filter-backhaul-min')?.value) || 0;
  const maxBackhaul = parseFloat(document.getElementById('filter-backhaul-max')?.value) || 100;
  const minAvailTrips = parseFloat(document.getElementById('filter-min-avail-trips')?.value) || 0;
  const heatMetric = document.getElementById('filter-heat-metric')?.value || 'all';

  const isAll = (arr) => arr.includes('all') || arr.length === 0;
  const matchCriteria = (selectedList, cleanVal) => {
    if (isAll(selectedList)) return true;
    return selectedList.some((val) => val !== 'all' && (cleanVal.includes(val) || val.includes(cleanVal)));
  };

  const hasOriginZoneFilter = !isAll(selOriginZones);

  const filteredData = window.globalRouteSheetData.filter((row) => {
    const p = row._parsed;
    if (!p) return false;
    if (p.availPct < minBackhaul || p.availPct > maxBackhaul) return false;
    if (p.availTrips < minAvailTrips) return false;
    if (heatMetric === 'quota' && p.availPct <= 0) return false;

    if (!matchCriteria(selCarriers, p.cleanCarrier)) return false;
    if (!matchCriteria(selTruckTypes, p.cleanTruck)) return false;
    if (!matchCriteria(selOriginDCs, p.cleanOrigin)) return false;
    if (!matchCriteria(selDestRegions, p.cleanZone)) return false;
    if (!matchCriteria(selDestProvinces, p.cleanProv)) return false;
    if (!matchCriteria(selCustomerTypes, p.cleanCustomerType)) return false;
    if (!matchCriteria(selCustomerNames, p.cleanCustomer)) return false;
    if (!matchCriteria(selShipToDescs, p.cleanShipTo)) return false;
    if (!matchCriteria(selProducts, p.cleanProduct)) return false;

    if (hasOriginZoneFilter) {
      const originInfo = window.originLocationMap ? window.originLocationMap[p.cleanOrigin] : null;
      if (hasOriginZoneFilter && !matchCriteria(selOriginZones, cleanAllSpaces(originInfo?.zone))) return false;
    }

    if (searchKeyword && !p.searchIndex.includes(searchKeyword)) return false;
    return true;
  });

  window.currentFilteredData = filteredData;
  currentPage = 1;
  renderTable(filteredData);

  clearTimeout(mapRenderDebounceTimer);
  mapRenderDebounceTimer = setTimeout(() => {
    if (window.state.activeMenuId === 'dashboard') updateMapDisplay(filteredData);

    // 💡 สั่งอัปเดตกราฟทันทีเมื่อมีการเปลี่ยนฟิลเตอร์ (ถ้ากราฟเปิดอยู่)
    const trendContainer = document.getElementById('trend-chart-container');
    if (trendContainer && !trendContainer.classList.contains('hidden')) {
      window.renderTrendChart();
    }
  }, 250);
}

function resetMapFilters() {
  const searchInput = document.querySelector('#filters-content input[type="text"]');
  if (searchInput) searchInput.value = '';

  const filterIds = [
    'filter-carrier',
    'filter-truck-type',
    'filter-origin-zone',
    'filter-origin-dc',
    'filter-dest-region',
    'filter-dest-province',
    'filter-customer-type',
    'filter-customer-name',
    'filter-shipto-desc',
    'filter-product-cat'
  ];
  filterIds.forEach((id) => {
    const checkboxes = document.querySelectorAll(`.checkbox-${id}`);
    checkboxes.forEach((cb) => {
      cb.checked = cb.value === 'ALL';
    });
    updateFilterLabel(id);
  });

  const minInput = document.getElementById('filter-backhaul-min');
  const maxInput = document.getElementById('filter-backhaul-max');
  const minTripsInput = document.getElementById('filter-min-avail-trips');
  if (minInput) minInput.value = '';
  if (maxInput) maxInput.value = '';
  if (minTripsInput) minTripsInput.value = '';

  const metricEl = document.getElementById('filter-heat-metric');
  if (metricEl) metricEl.value = 'quota';

  window.state.activeFilters.heatMetric = 'quota';
  window.state.activeFilters.displayMode = 'routes';

  document.querySelectorAll('#display-mode-segmented .mode-btn').forEach((btn) => {
    const mode = btn.getAttribute('data-mode');
    btn.className =
      mode === 'routes'
        ? 'mode-btn flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 bg-[#f97316] text-white shadow-sm'
        : 'mode-btn flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-zinc-700/50';
  });

  window.showToast('Filters cleared');
  applyDynamicFilters();
}

function groupRouteData(filteredData = []) {
  const groupedRoutes = {};
  filteredData.forEach((row) => {
    const p = row._parsed;
    if (!p) return;
    const routeKey = p.distinctKey;

    if (!groupedRoutes[routeKey]) {
      groupedRoutes[routeKey] = {
        id: 'grp-' + Math.random().toString(36).substring(2, 11),
        origin: row.origin || '-',
        zone: row.zone || '-',
        province: row.province || '-',
        customerName: row.customer_name || '-',
        customerType: row.customer_type || '-',
        shipToDesc: row.ship_to_desc || row.province || '-',
        productCat: row.product_category || '-',
        truckType: row.truck_type || '-',
        mapRouteKey: p.mapRouteKey,
        uniqueSubcons: new Set(),
        totalTrips: 0,
        totalAvailTrips: 0,
        sumPct: 0,
        availablePct: 0,
        vendors: []
      };
    }

    if (p.cleanCarrier && p.cleanCarrier !== '-') {
      groupedRoutes[routeKey].uniqueSubcons.add(row.fwd_agent_desc);
    }

    groupedRoutes[routeKey].totalTrips += p.trips;
    groupedRoutes[routeKey].totalAvailTrips += p.availTrips;
    groupedRoutes[routeKey].sumPct += p.totalPct;
    groupedRoutes[routeKey].vendors.push(row);
  });

  Object.values(groupedRoutes).forEach((grp) => {
    const count = grp.vendors.length;
    grp.availablePct = Math.max(0, Math.round(100 - (count > 0 ? grp.sumPct / count : 0)));
    grp.vendors.sort((a, b) => b._parsed.availPct - a._parsed.availPct);
  });

  return groupedRoutes;
}

function renderTable(filteredData = []) {
  const tbody = document.getElementById('table-body');
  if (!tbody) return;
  const groupedRoutes = groupRouteData(filteredData);
  const routeKeys = Object.keys(groupedRoutes);

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  };

  if (routeKeys.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-500 font-sans">ไม่พบข้อมูล Route ตามเงื่อนไขตัวกรอง</td></tr>`;
    setText('ops-count', '0');
    setText('ops-avail-groups', '0');
    setText('ops-unavail-groups', '0');
    setText('ops-avail-pct', '0.0%');
    setText('ops-total-volume', '0');
    setText('ops-avail-volume', '0');
    document.getElementById('table-pagination').innerHTML = '';
    return;
  }

  let totalTripsSum = 0,
    totalAvailTripsSum = 0,
    availRouteGroupsCount = 0,
    unavailRouteGroupsCount = 0;
  routeKeys.forEach((key) => {
    const grp = groupedRoutes[key];
    totalTripsSum += grp.totalTrips;
    totalAvailTripsSum += grp.totalAvailTrips;
    if (grp.availablePct > 0) availRouteGroupsCount++;
    else unavailRouteGroupsCount++;
  });

  const availPct = ((availRouteGroupsCount / routeKeys.length) * 100).toFixed(1);

  routeKeys.sort((a, b) => {
    const routeA = groupedRoutes[a];
    const routeB = groupedRoutes[b];
    if (routeB.totalTrips !== routeA.totalTrips) return routeB.totalTrips - routeA.totalTrips;
    return String(a).localeCompare(String(b), 'th');
  });

  window.currentGroupKeys = routeKeys;
  window.currentGroupMap = groupedRoutes;

  setText('ops-count', routeKeys.length.toLocaleString());
  setText('ops-avail-groups', availRouteGroupsCount.toLocaleString());
  setText('ops-unavail-groups', unavailRouteGroupsCount.toLocaleString());
  setText('ops-avail-pct', `${availPct}%`);
  setText('ops-total-volume', Math.round(totalTripsSum).toLocaleString());
  setText('ops-avail-volume', formatNum(totalAvailTripsSum, 1));

  const columns = [
    '',
    'Route',
    'Customer (Type) & Item (Type)',
    'Truck (Type)',
    'Carriers',
    'Sum Trip/Week',
    'Available Backhaul'
  ];
  document.getElementById('table-head').innerHTML =
    `<tr class="text-[10px] uppercase tracking-wider border-b text-slate-500 border-slate-200 dark:text-slate-400 dark:border-slate-700 bg-slate-50/60 dark:bg-zinc-900/60 font-sans">${columns.map((col, i) => `<th class="p-3 font-bold ${i === 0 ? 'w-10 text-center' : ''}">${col}</th>`).join('')}</tr>`;

  const totalPages = Math.ceil(routeKeys.length / PAGE_SIZE);
  if (currentPage > totalPages) currentPage = 1;
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedKeys = routeKeys.slice(startIndex, startIndex + PAGE_SIZE);

  let html = '';
  paginatedKeys.forEach((key) => {
    const grp = groupedRoutes[key];
    const color = getAvailColorScale(grp.availablePct);
    const vendorCount = grp.vendors.length;

    const totalOffPeak = grp.vendors.reduce((sum, v) => sum + parseNum(v.avg_off_peak || v['Avg Off Peak'], 0), 0);
    const totalPeak = grp.vendors.reduce((sum, v) => sum + parseNum(v.avg_peak || v['Avg Peak'], 0), 0);

    const avgBoonrawd =
      vendorCount > 0
        ? Math.round(
            grp.vendors.reduce((sum, v) => sum + parseNum(v.pct_boonrawd || v['%รับงานต่อสำหรับงานบุญรอด'], 0), 0) /
              vendorCount
          )
        : 0;
    const avgOwn =
      vendorCount > 0
        ? Math.round(
            grp.vendors.reduce((sum, v) => sum + parseNum(v.pct_own || v['%รับงานต่องานของผู้รับเหมาเอง'], 0), 0) /
              vendorCount
          )
        : 0;
    const avgOutside =
      vendorCount > 0
        ? Math.round(
            grp.vendors.reduce(
              (sum, v) => sum + parseNum(v.pct_brf_outside || v['%รับงานต่อ สำหรับงานนอกของ BRF'], 0),
              0
            ) / vendorCount
          )
        : 0;

    html += `
      <tr id="row-${grp.id}" data-map-key="${escapeAttr(grp.mapRouteKey)}" class="text-xs border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer font-sans" onclick="window.onTableRowClick('${escapeAttr(grp.mapRouteKey)}', '${grp.id}')">
        <td class="p-3 text-center"><i data-lucide="chevron-right" id="icon-${grp.id}" class="w-4 h-4 text-slate-400 transition-transform duration-200 inline-block"></i></td>
        <td class="p-3 whitespace-nowrap">
          <div class="font-bold text-slate-800 dark:text-white">${escapeHtml(grp.origin)} &rarr; ${escapeHtml(grp.shipToDesc)}</div>
          <div class="text-[10px] text-slate-400">Zone: ${escapeHtml(grp.zone)}</div>
        </td>
        <td class="p-3 max-w-[200px]">
          <div class="font-bold text-slate-800 dark:text-slate-200 truncate"><span>${escapeHtml(grp.customerName)}</span> <span class="text-xs font-normal text-slate-500">(${escapeHtml(grp.customerType)})</span></div>
          <div class="text-[10px] text-slate-400 truncate mt-0.5">${escapeHtml(grp.productCat)}</div>
        </td>
        <td class="p-3 whitespace-nowrap"><div class="font-semibold text-blue-600 dark:text-blue-400">${escapeHtml(grp.truckType)}</div></td>
        <td class="p-3"><span class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 font-extrabold text-[10px]">${vendorCount}</span></td>
        <td class="p-3 whitespace-nowrap">
          <div class="font-Sarabun font-bold text-slate-800 dark:text-slate-200">${formatNum(grp.totalTrips)} Trip/WK</div>
          <div class="text-[10px] font-Sarabun text-slate-500 dark:text-slate-400 mt-0.5">
            Off: <span class="font-bold text-slate-700 dark:text-slate-300">${formatNum(totalOffPeak)}</span> | On: <span class="font-bold text-slate-700 dark:text-slate-300">${formatNum(totalPeak)}</span>
          </div>
        </td>
        <td class="p-3 min-w-[170px]">
          <div class="flex items-center justify-between text-[10px] font-Sarabun font-bold mb-1">
            <span class="text-slate-500">Available:</span>
            <span class="${color.text}">${grp.availablePct}% <span class="text-slate-400 font-normal">(~${formatNum(grp.totalAvailTrips, 1)} trips/wk)</span></span>
          </div>
          <div class="w-full bg-slate-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden flex shadow-inner mb-1">
            <div class="bg-blue-500 h-full transition-all" style="width: ${avgBoonrawd}%"></div>
            <div class="bg-emerald-500 h-full transition-all" style="width: ${avgOwn}%"></div>
            <div class="bg-amber-500 h-full transition-all" style="width: ${avgOutside}%"></div>
          </div>
          <div class="flex justify-between text-[9px] font-Sarabun leading-tight">
            <span class="text-blue-500 font-semibold">BRT ${avgBoonrawd}%</span>
            <span class="text-emerald-500 font-semibold">Own ${avgOwn}%</span>
            <span class="text-amber-500 font-semibold">Ext ${avgOutside}%</span>
          </div>
        </td>
      </tr>
      <tr id="detail-${grp.id}" class="border-b border-slate-200 dark:border-slate-800 font-sans">
        <td colspan="7" class="p-0">
          <div class="accordion-detail" id="content-${grp.id}">
            <div class="p-4 pl-12 border-l-4 border-orange-500 m-3 rounded-2xl bg-slate-50/80 dark:bg-zinc-950/80 shadow-inner">
              <h4 class="text-xs font-bold mb-2 text-slate-700 dark:text-slate-300">Carriers Details (${vendorCount})</h4>
              <table class="w-full text-xs text-left border-collapse">
                <thead class="text-slate-400 dark:text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th class="py-2 px-3 font-bold w-1/4">Carrier Name</th>
                    <th class="py-2 px-2 font-bold text-center w-20">Avg Trip</th>
                    <th class="py-2 px-2 font-bold text-center w-20">Off Peak</th>
                    <th class="py-2 px-2 font-bold text-center w-20">Peak</th>
                    <th class="py-2 px-3 font-bold text-center w-28">Available Capacity</th>
                    <th class="py-2 px-3 font-bold text-center w-28">Available Trips/Wk</th>
                    <th class="py-2 px-3 font-bold text-center">Available Proportion</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-200/60 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                  ${grp.vendors
                    .map((v) => {
                      const vp = v._parsed;
                      const fwdAgentName = v.fwd_agent_desc || '-';
                      const vOutsideRoute = String(v.brf_outside_route || '').trim();
                      const vTrip = vp ? vp.trips : parseNum(v.avg_trip_week, 0);
                      const vOffPeak = parseNum(v.avg_off_peak || v['Avg Off Peak'], 0);
                      const vPeak = parseNum(v.avg_peak || v['Avg Peak'], 0);
                      const vendorAvailablePct = vp ? vp.availPct : Math.max(0, 100 - parseNum(v.pct_total, 0));
                      const vendorAvailTrips = vp ? vp.availTrips : vTrip * (vendorAvailablePct / 100);
                      const isFull = vendorAvailablePct === 0;
                      const bVal = parseNum(v.pct_boonrawd || v['%รับงานต่อสำหรับงานบุญรอด'], 0);
                      const oVal = parseNum(v.pct_own || v['%รับงานต่องานของผู้รับเหมาเอง'], 0);
                      const extVal = parseNum(v.pct_brf_outside || v['%รับงานต่อ สำหรับงานนอกของ BRF'], 0);
                      const vendorBadgeColor = isFull
                        ? 'bg-rose-50 text-rose-600 border border-rose-200'
                        : 'bg-emerald-50 text-emerald-600 border border-emerald-200';

                      return `
                      <tr class="hover:bg-slate-100/60 dark:hover:bg-zinc-900/60 transition-colors">
                        <td class="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">
                          ${escapeHtml(fwdAgentName)}${vOutsideRoute && vOutsideRoute !== '-' ? `<span class="block text-[10px] text-slate-400 font-normal mt-0.5">เส้นทางนอก BRF: ${escapeHtml(vOutsideRoute)}</span>` : ''}
                        </td>
                        <td class="py-3 px-2 text-center font-Sarabun font-bold">${formatNum(vTrip)}</td>
                        <td class="py-3 px-2 text-center font-Sarabun text-slate-500">${formatNum(vOffPeak)}</td>
                        <td class="py-3 px-2 text-center font-Sarabun text-slate-500">${formatNum(vPeak)}</td>
                        <td class="py-3 px-3 text-center">
                          <span class="px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center whitespace-nowrap ${vendorBadgeColor}">
                            <span class="w-1.5 h-1.5 rounded-full shrink-0 mr-1.5 ${isFull ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}"></span>
                            ${Math.round(vendorAvailablePct)}%
                          </span>
                        </td>
                        <td class="py-3 px-3 text-center font-Sarabun font-bold text-slate-700 dark:text-slate-300">
                          ${formatNum(vendorAvailTrips, 1)}
                        </td>
                        <td class="py-3 px-4">
                          <div class="max-w-xs mx-auto space-y-1">
                            <div class="w-full bg-slate-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden flex shadow-inner">
                              <div class="bg-blue-500 h-full transition-all" style="width: ${bVal}%"></div>
                              <div class="bg-emerald-500 h-full transition-all" style="width: ${oVal}%"></div>
                              <div class="bg-amber-500 h-full transition-all" style="width: ${extVal}%"></div>
                            </div>
                            <div class="flex justify-between text-[10px] font-Sarabun text-slate-500 dark:text-slate-400 px-0.5">
                              <span class="text-blue-500 font-semibold">BRT ${bVal}%</span>
                              <span class="text-emerald-500 font-semibold">Own ${oVal}%</span>
                              <span class="text-amber-500 font-semibold">Ext ${extVal}%</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    `;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  renderPaginationControls(totalPages, routeKeys.length);
  if (typeof window.lucide !== 'undefined') window.lucide.createIcons({ root: tbody });
}

function renderPaginationControls(totalPages, totalItems) {
  const paginationEl = document.getElementById('table-pagination');
  if (!paginationEl) return;
  const startItem = (currentPage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(currentPage * PAGE_SIZE, totalItems);
  paginationEl.innerHTML = `
    <div class="flex items-center justify-between p-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 font-sans">
      <div>แสดง <strong class="text-slate-800 dark:text-slate-200">${startItem} - ${endItem}</strong> จาก <strong class="text-slate-800 dark:text-slate-200">${totalItems.toLocaleString()}</strong> รายการ</div>
      <div class="flex items-center gap-2">
        <button onclick="window.changePage(-1)" ${currentPage === 1 ? 'disabled' : ''} class="px-3 py-1 rounded-lg border border-slate-200 bg-slate-50 font-bold hover:bg-orange-500 hover:text-white disabled:opacity-30 transition-all cursor-pointer">&lt; ก่อนหน้า</button>
        <span class="font-Sarabun font-bold px-2">หน้า ${currentPage} / ${totalPages}</span>
        <button onclick="window.changePage(1)" ${currentPage === totalPages ? 'disabled' : ''} class="px-3 py-1 rounded-lg border border-slate-200 bg-slate-50 font-bold hover:bg-orange-500 hover:text-white disabled:opacity-30 transition-all cursor-pointer">ถัดไป &gt;</button>
      </div>
    </div>
  `;
}

function changePage(step) {
  currentPage += step;
  renderTable(window.currentFilteredData);
}

function toggleRouteDetail(routeId) {
  const contentDiv = document.getElementById(`content-${routeId}`);
  const icon = document.getElementById(`icon-${routeId}`);
  if (contentDiv && icon) {
    contentDiv.classList.toggle('expanded');
    if (contentDiv.classList.contains('expanded')) {
      contentDiv.style.maxHeight = contentDiv.scrollHeight + 'px';
      icon.style.transform = 'rotate(90deg)';
    } else {
      contentDiv.style.maxHeight = '0px';
      icon.style.transform = 'rotate(0deg)';
    }
  }
}

function onTableRowClick(mapRouteKey, grpId) {
  highlightMapRoute(mapRouteKey);
  toggleRouteDetail(grpId);
}

function focusTableRowByMapKey(mapKey) {
  if (!mapKey) return;
  const tc = document.getElementById('table-container');
  const chevron = document.getElementById('table-chevron'); // ดึงลูกศรตารางมา
  if (tc && tc.classList.contains('table-hidden')) {
    window.state.isTableExpanded = true;
    tc.classList.remove('table-hidden');
    tc.classList.add('table-expanded');

    // อัปเดตลูกศรให้ชี้ลงเมื่อตารางกางออก
    if (chevron && typeof window.lucide !== 'undefined') {
      chevron.setAttribute('data-lucide', 'chevron-down');
      window.lucide.createIcons({ root: chevron.parentElement });
    }
  }
  const sourceData =
    window.currentFilteredData && window.currentFilteredData.length > 0
      ? window.currentFilteredData
      : window.globalRouteSheetData;
  const matchedRows = sourceData.filter((row) => row._parsed.mapRouteKey === mapKey);
  if (matchedRows.length === 0) {
    window.showToast(`⚠️ ไม่พบข้อมูลในตารางสำหรับเส้นทางนี้`);
    return;
  }
  currentPage = 1;
  renderTable(matchedRows);
}

function filterTableByOrigin(originName) {
  if (!originName) {
    applyDynamicFilters();
    return;
  }
  const cleanTargetOrigin = cleanAllSpaces(originName);
  const matchedRows = window.globalRouteSheetData.filter((row) => row._parsed.cleanOrigin.includes(cleanTargetOrigin));
  if (matchedRows.length === 0) {
    window.showToast(`⚠️ ไม่พบข้อมูลเส้นทางสำหรับต้นทาง: ${originName}`);
    return;
  }
  currentPage = 1;
  window.currentFilteredData = matchedRows;
  renderTable(matchedRows);
}

function exportFilteredDataToCSV() {
  const dataToExport =
    window.currentFilteredData && window.currentFilteredData.length > 0
      ? window.currentFilteredData
      : window.globalRouteSheetData;
  if (!dataToExport || dataToExport.length === 0) return;
  const headers = [
    'Route ID',
    'Origin',
    'Province',
    'Zone',
    'Customer',
    'Product',
    'Truck',
    'Carrier',
    'Avg Trips/Wk',
    'Available Backhaul %',
    'Available Trips'
  ];
  let csvContent = '\uFEFF' + headers.join(',') + '\n';
  dataToExport.forEach((row) => {
    const p = row._parsed;
    const values = [
      row.id,
      row.origin,
      row.province,
      row.zone,
      row.customer_name,
      row.product_category,
      row.truck_type,
      row.fwd_agent_desc,
      p.trips,
      p.availPct,
      p.availTrips
    ].map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`);
    csvContent += values.join(',') + '\n';
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
  link.download = `Export_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==============================================================================
// 8. SIMULATION ENGINE
// ==============================================================================
async function initNewOrderMappingDropdowns() {
  const routeData = window.globalRouteSheetData;
  if (!routeData || routeData.length === 0) return;

  const extractUnique = (columnName) =>
    [
      ...new Set(
        routeData.map((row) => String(row[columnName] || '').trim()).filter((val) => val !== '' && val !== '-')
      )
    ].sort();
  const updateDropdown = (elementId, optionsList) => {
    const selectEl = document.getElementById(elementId);
    if (!selectEl) return;
    selectEl.innerHTML =
      `<option value="ทั้งหมด">ทั้งหมด</option>` +
      optionsList.map((val) => `<option value="${escapeAttr(val)}">${escapeHtml(val)}</option>`).join('');
  };

  updateDropdown('select-origin', extractUnique('origin'));
  updateDropdown('select-product-category', extractUnique('product_category'));
  updateDropdown('select-dest-province', extractUnique('province'));
  updateDropdown('select-zone', extractUnique('zone'));
  updateDropdown('select-truck-type', extractUnique('truck_type'));
}

function analyzeNewOrderMapping() {
  const selectedOrigin = document.getElementById('select-origin')?.value.trim() || 'ทั้งหมด';
  const selectedProvince = document.getElementById('select-dest-province')?.value.trim() || 'ทั้งหมด';
  const customerNameInput = document.getElementById('input-customer-name')?.value.trim() || 'ลูกค้าใหม่';

  let latInput = parseFloat(document.getElementById('input-lat')?.value);
  let lngInput = parseFloat(document.getElementById('input-lng')?.value);

  if (
    (isNaN(latInput) || isNaN(lngInput)) &&
    window.provinceLocationMap &&
    window.provinceLocationMap[selectedProvince]
  ) {
    latInput = window.provinceLocationMap[selectedProvince].lat;
    lngInput = window.provinceLocationMap[selectedProvince].lng;
  }

  document.getElementById('sim-input-state')?.classList.add('hidden');
  document.getElementById('sim-results-state')?.classList.remove('hidden');

  const summaryRouteEl = document.getElementById('summary-route-label');
  if (summaryRouteEl)
    summaryRouteEl.innerHTML = `${escapeHtml(selectedOrigin)} <i data-lucide="arrow-right" class="w-3 h-3 text-orange-500 inline"></i> ${escapeHtml(selectedProvince)}`;

  const matchedSubcons = window.globalRouteSheetData
    .filter((row) => {
      const p = row._parsed;
      if (selectedOrigin !== 'ทั้งหมด' && !p.cleanOrigin.includes(cleanAllSpaces(selectedOrigin))) return false;
      if (selectedProvince !== 'ทั้งหมด' && !p.cleanProv.includes(cleanAllSpaces(selectedProvince))) return false;
      if (p.availPct <= 0 || !row.fwd_agent_desc || row.fwd_agent_desc === 'ไม่ระบุ') return false;
      return true;
    })
    .sort((a, b) => b._parsed.availPct - a._parsed.availPct);

  renderSubconRankings(matchedSubcons);

  if (typeof drawAllSheetRoutesOnSimMap === 'function') {
    const customerInfo = { name: customerNameInput, lat: latInput, lng: lngInput };
    const originInfo = window.originLocationMap ? window.originLocationMap[selectedOrigin] : null;
    drawAllSheetRoutesOnSimMap(matchedSubcons, selectedOrigin, selectedProvince, customerInfo, originInfo);
  }
}

function renderSubconRankings(recommendations) {
  const rankListEl = document.getElementById('subcon-rank-list');
  if (!rankListEl) return;
  if (!recommendations || recommendations.length === 0) {
    rankListEl.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 border border-dashed rounded-2xl border-slate-200">ไม่พบผู้รับเหมาที่มีโควตาว่างในเส้นทางนี้</div>`;
    return;
  }

  rankListEl.innerHTML = recommendations
    .slice(0, 20)
    .map((item, idx) => {
      return `
      <div onclick="window.highlightSubconRoute('${escapeAttr(item.id)}', this)" class="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm cursor-pointer transition-all hover:scale-[1.01] font-sans">
        <div class="flex items-center justify-between gap-2 mb-2">
          <h4 class="text-xs font-extrabold text-slate-800">${escapeHtml(item.fwd_agent_desc)}</h4>
          <span class="text-xs font-Sarabun font-bold text-emerald-600">ว่างอีก ${Math.round(item._parsed.availPct)}%</span>
        </div>
        <div class="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden flex mb-2"><div class="bg-orange-500 h-full" style="width: ${item._parsed.totalPct}%"></div><div class="bg-emerald-500 h-full" style="width: ${item._parsed.availPct}%"></div></div>
      </div>
    `;
    })
    .join('');
}

function highlightSubconRoute(subconId, cardEl) {
  document.querySelectorAll('#subcon-rank-list > div').forEach((card) => {
    card.classList.remove('ring-2', 'ring-orange-500', 'shadow-lg');
  });
  if (cardEl) cardEl.classList.add('ring-2', 'ring-orange-500', 'shadow-lg');
}

function backToSimInput() {
  document.getElementById('sim-input-state')?.classList.remove('hidden');
  document.getElementById('sim-results-state')?.classList.add('hidden');
}

// ==============================================================================
// 9. EVENT LISTENERS SETUP
// ==============================================================================
function setupEventListeners() {
  // 1. Sidebar Toggle
  document.getElementById('toggle-sidebar')?.addEventListener('click', () => {
    window.state.isSidebarOpen = !window.state.isSidebarOpen;
    const sb = document.getElementById('sidebar');
    if (sb)
      sb.className = `${window.state.isSidebarOpen ? 'w-64' : 'w-20'} relative z-50 border-r flex flex-col shrink-0 transition-[width] duration-300 ease-in-out bg-white dark:bg-zinc-900 border-slate-200 dark:border-slate-800`;
    document.getElementById('sidebar-brand').style.display = window.state.isSidebarOpen ? 'flex' : 'none';
    document.querySelector('.user-info-wrapper').style.display = window.state.isSidebarOpen ? 'flex' : 'none';
    const toggleBtn = document.getElementById('toggle-sidebar');
    if (toggleBtn && typeof window.lucide !== 'undefined') {
      toggleBtn.innerHTML = `<i data-lucide="${window.state.isSidebarOpen ? 'chevron-left' : 'menu'}" class="w-4 h-4"></i>`;
      window.lucide.createIcons({ root: toggleBtn });
    }
    renderSidebarMenu();
    setTimeout(() => {
      if (execMap) execMap.invalidateSize();
      if (dashMap) dashMap.invalidateSize();
      if (simMap) simMap.invalidateSize();
    }, 310);
  });

  // 2. Table Toggle (สลับลูกศรขึ้น/ลง ของตาราง)
  document.getElementById('toggle-table')?.addEventListener('click', () => {
    window.state.isTableExpanded = !window.state.isTableExpanded;
    const tc = document.getElementById('table-container');
    const chevron = document.getElementById('table-chevron');
    if (tc) {
      tc.classList.toggle('table-hidden', !window.state.isTableExpanded);
      tc.classList.toggle('table-expanded', window.state.isTableExpanded);
    }
    if (chevron && typeof window.lucide !== 'undefined') {
      chevron.setAttribute('data-lucide', window.state.isTableExpanded ? 'chevron-down' : 'chevron-up');
      window.lucide.createIcons({ root: chevron.parentElement });
    }
    if (dashMap) setTimeout(() => dashMap.invalidateSize(), 300);
  });

  // 3. Filters Toggles - Main (สลับลูกศรขึ้น/ลง ของแผงค้นหาหลัก)
  document.getElementById('toggle-filters-main')?.addEventListener('click', () => {
    const content = document.getElementById('filters-content');
    const chevron = document.getElementById('filters-main-chevron');
    if (content) {
      content.classList.toggle('hidden');
      if (chevron && typeof window.lucide !== 'undefined') {
        chevron.setAttribute('data-lucide', content.classList.contains('hidden') ? 'chevron-down' : 'chevron-up');
        window.lucide.createIcons({ root: chevron.parentElement });
      }
    }
  });

  // 4. Filters Toggles - Accordions (สลับลูกศรขึ้น/ลง ของหมวดย่อย)
  document.querySelectorAll('.filter-accordion-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetEl = document.getElementById(btn.getAttribute('data-target'));
      const chevron = btn.querySelector('.accordion-chevron');
      if (targetEl) {
        targetEl.classList.toggle('hidden');
        if (chevron && typeof window.lucide !== 'undefined') {
          chevron.setAttribute('data-lucide', targetEl.classList.contains('hidden') ? 'chevron-down' : 'chevron-up');
          window.lucide.createIcons({ root: btn });
        }
      }
    });
  });

  // 5. ปิด Custom Dropdown เมื่อคลิกที่อื่น (พร้อมคืนค่าลูกศรกลับเป็นชี้ลง)
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.custom-select-container')) {
      document.querySelectorAll('.custom-select-dropdown').forEach((el) => el.classList.add('hidden'));
      document.querySelectorAll('.custom-select-container button i[data-lucide]').forEach((icon) => {
        icon.setAttribute('data-lucide', 'chevron-down');
      });
      if (typeof window.lucide !== 'undefined') window.lucide.createIcons();
    }
  });

  // 6. Inputs Debouncing
  const searchInput = document.querySelector('#filters-content input[type="text"]');
  if (searchInput)
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => applyDynamicFilters(), 300);
    });

  ['filter-backhaul-min', 'filter-backhaul-max', 'filter-min-avail-trips'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => {
      clearTimeout(numericDebounceTimer);
      numericDebounceTimer = setTimeout(() => applyDynamicFilters(), 250);
    });
  });

  // 7. Display Mode
  document.querySelectorAll('#display-mode-segmented .mode-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const selectedBtn = e.currentTarget;
      window.state.activeFilters.displayMode = selectedBtn.getAttribute('data-mode');
      document
        .querySelectorAll('#display-mode-segmented .mode-btn')
        .forEach(
          (b) =>
            (b.className =
              'mode-btn flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-slate-600 hover:bg-white/50')
        );
      selectedBtn.className =
        'mode-btn flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 bg-[#f97316] text-white shadow-sm';
      applyDynamicFilters();
    });
  });

  // 8. ปุ่มสลับภาษา TH/EN
  document.getElementById('toggle-lang')?.addEventListener('click', (e) => {
    e.preventDefault();
    const currentLang = localStorage.getItem('app_lang') || 'th';
    const nextLang = currentLang === 'th' ? 'en' : 'th';
    if (typeof applySmartTranslation === 'function') {
      applySmartTranslation(nextLang);
    }
    e.target.innerText = nextLang.toUpperCase();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.lucide !== 'undefined') window.lucide.createIcons();
  setLoginButtonState('idle');
  setupEventListeners();

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

    if (window.routeTrendChart) window.renderTrendChart();
  });
});
