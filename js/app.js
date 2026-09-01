/**
 * ==============================================================================
 * APP CONTROLLER & DASHBOARD ENGINE (REFACTORED & OPTIMIZED)
 * ==============================================================================
 */

// ==============================================================================
// 1. GLOBAL STATE & CONSTANTS
// ==============================================================================
const WORKING_DAYS_PER_WEEK = 6;
const PAGE_SIZE = 50;

let state = {
  isDark: false,
  lang: 'en',
  activeMenuId: 'exec',
  isSidebarOpen: true,
  isTableExpanded: true,
  simState: 'input',
  selectedSimOptionId: null,
  simVolume: 28,
  currentSimOptions: [],
  currentViewMode: 'map',
  chatOpen: false,
  chatMessages: [
    {
      role: 'ai',
      text: 'สวัสดีครับ ผู้จัดการฝ่ายขนส่ง! ผมเตรียมข้อมูลประวัติเส้นทาง (Historical Data) ไว้ให้แล้ว คุณสามารถกรองประเภทสินค้าและช่วงเวลา เพื่อนำไปออกแบบเส้นทางให้กับลูกค้าใหม่ได้เลยครับ'
    }
  ],
  activeFilters: {
    heatMetric: 'all',
    heatTheme: 'thermal',
    heatRadius: 35,
    displayMode: 'routes'
  }
};

let currentFilteredData = [];
let currentPage = 1;
let currentSort = { column: null, direction: 'asc' };
let regionChart = null;
let shipToLocationMap = {};

// Independent Debounce Timers
let searchDebounceTimer = null;
let numericDebounceTimer = null;
let mapRenderDebounceTimer = null;

// Global Memory Caches
window.globalRouteSheetData = window.globalRouteSheetData || [];
window.execCarrierListCache = [];
window.execAllRoutesCache = [];
window.currentGroupKeys = [];
window.currentGroupMap = {};
window.provinceLocationMap = window.provinceLocationMap || {};
window.originLocationMap = window.originLocationMap || {};

// ==============================================================================
// 2. UNIFIED HELPERS & UTILITIES
// ==============================================================================
const parseNum = (val, defaultVal = 0) => {
  if (val === null || val === undefined) return defaultVal;
  const num = parseFloat(String(val).replace(/[,%]/g, '').trim());
  return isNaN(num) ? defaultVal : num;
};

const formatNum = (val, dec = 2) => 
  Number(val || 0).toLocaleString('th-TH', { minimumFractionDigits: dec, maximumFractionDigits: dec });

function cleanAllSpaces(val) {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\s+/g, '').trim().toLowerCase();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;');
}

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
  ].filter(Boolean).join('__');
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
  if (val === 0) {
    return {
      text: 'text-slate-500 dark:text-slate-400 font-bold',
      bg: 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300',
      border: 'border-slate-300 dark:border-slate-700',
      hex: '#334155',
      status: 'Unavailable'
    };
  }
  if (val <= 30) {
    return {
      text: 'text-rose-600 dark:text-rose-400 font-bold',
      bg: 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300',
      border: 'border-rose-200 dark:border-rose-900',
      hex: '#ef4444',
      status: 'Low Available'
    };
  }
  if (val <= 70) {
    return {
      text: 'text-amber-600 dark:text-amber-400 font-bold',
      bg: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300',
      border: 'border-amber-200 dark:border-amber-900',
      hex: '#f59e0b',
      status: 'Moderate'
    };
  }
  return {
    text: 'text-emerald-600 dark:text-emerald-400 font-black',
    bg: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-300 dark:border-emerald-800',
    hex: '#10b981',
    status: 'High Available'
  };
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-msg');
  if (msgEl) msgEl.innerText = msg;
  if (toast) {
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
  }
}

function precomputeRouteData(routes) {
  if (!Array.isArray(routes) || routes.length === 0) return [];
  
  return routes.map(row => {
    const origin = String(row.origin || row['ต้นทาง'] || '-').trim();
    const destProv = String(row.province || row['จังหวัด'] || '-').trim();
    let shipTo = String(row.ship_to_desc || row['Description(Ship-To (Outbound))'] || '').trim();
    if (!shipTo || shipTo === '-') shipTo = destProv;

    const trips = parseNum(row.avg_trip_week || row['AVG Trip/Week'], 0);
    const totalPct = parseNum(row.pct_total || row['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'], 0);
    const availPct = Math.max(0, 100 - totalPct);
    const availTrips = trips * (availPct / 100);

    const cleanOrigin = cleanAllSpaces(origin);
    const cleanCustomer = cleanAllSpaces(row.customer_name || row['ลูกค้า'] || '-');
    const cleanCustomerType = cleanAllSpaces(row.customer_type || row['ประเภทลูกค้า'] || '-');
    const cleanProduct = cleanAllSpaces(row.product_category || row['ประเภทสินค้า'] || '-');
    const cleanProv = cleanAllSpaces(destProv);
    const cleanZone = cleanAllSpaces(row.zone || row['Zone'] || '-');
    const cleanTruck = cleanAllSpaces(row.truck_type || row['ประเภทรถ'] || '-');
    const cleanShipTo = cleanAllSpaces(shipTo);
    const cleanCarrier = cleanAllSpaces(row.fwd_agent_desc || row['Description(FwdAgent)'] || '');

    const distinctKey = [cleanOrigin, cleanCustomer, cleanCustomerType, cleanProduct, cleanProv, cleanZone, cleanTruck, cleanShipTo].join('__');
    const mapRouteKey = `${cleanOrigin}__${cleanShipTo}`;
    const searchIndex = `${row.id || ''} ${origin} ${destProv} ${row.customer_name || ''} ${row.fwd_agent_desc || ''}`.toLowerCase();

    return {
      ...row,
      _parsed: {
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
// 3. APPLICATION LIFECYCLE & DATA BOOTSTRAP
// ==============================================================================
async function initAppAfterLogin() {
  try {
    if (typeof renderSidebarMenu === 'function') renderSidebarMenu();
    if (typeof initMaps === 'function') initMaps();
    if (typeof initCharts === 'function') initCharts();
    if (typeof renderChat === 'function') renderChat();
  } catch (e) {
    console.error('UI Render Error:', e);
  }

  try {
    const [provData, originData, routeData, shipToData] = await Promise.all([
      typeof fetchProvinceLocations === 'function' ? fetchProvinceLocations().catch(() => ({})) : Promise.resolve({}),
      typeof fetchOriginLocations === 'function' ? fetchOriginLocations().catch(() => ({})) : Promise.resolve({}),
      typeof fetchNewRouteSheet === 'function' ? fetchNewRouteSheet().catch(() => []) : Promise.resolve([]),
      typeof fetchShippingLocations === 'function' ? fetchShippingLocations().catch(() => []) : Promise.resolve([])
    ]);

    window.provinceLocationMap = provData || {};
    window.originLocationMap = originData || {};
    window.globalRouteSheetData = precomputeRouteData(Array.isArray(routeData) ? routeData : []);

    if (Array.isArray(shipToData) && shipToData.length > 0) {
      if (typeof initShippingLocationLookup === 'function') initShippingLocationLookup(shipToData);
      
      shipToData.forEach(item => {
        const desc = String(item['Description(Ship-To (Outbound))'] || item.ship_to_desc || '').trim();
        const rawLatLng = item['LAT,LONG'] || item.lat_long || '';
        const coords = (typeof parseLatLng === 'function') ? parseLatLng(rawLatLng) : null;
        const lat = coords ? coords.lat : parseFloat(item.lat || item.dest_lat);
        const lng = coords ? coords.lng : parseFloat(item.lng || item.dest_lng);

        if (desc && !isNaN(lat) && !isNaN(lng)) {
          shipToLocationMap[desc] = { lat, lng };
          shipToLocationMap[desc.toLowerCase()] = { lat, lng };
        }
      });
    }

    if (typeof updateView === 'function') updateView();
    if (typeof populateDashboardFilters === 'function') populateDashboardFilters(window.globalRouteSheetData);
    if (typeof applyDynamicFilters === 'function') await applyDynamicFilters();
    if (typeof updateExecutiveDashboard === 'function') await updateExecutiveDashboard(window.globalRouteSheetData);

    setTimeout(() => {
      if (typeof dashMap !== 'undefined' && dashMap) dashMap.invalidateSize();
      if (typeof simMap !== 'undefined' && simMap) simMap.invalidateSize();
      if (typeof execMap !== 'undefined' && execMap) execMap.invalidateSize();
    }, 300);

  } catch (err) {
    console.error('Data Fetch Error:', err);
  }
}

window.forceRefreshRouteData = async function() {
  showToast('กำลังดึงข้อมูลล่าสุดจากฐานข้อมูล...');
  try {
    const routeData = await fetchNewRouteSheet();
    if (Array.isArray(routeData)) {
      window.globalRouteSheetData = precomputeRouteData(routeData);

      if (typeof populateDashboardFilters === 'function') {
        populateDashboardFilters(window.globalRouteSheetData);
      }
      await applyDynamicFilters();
      
      if (state.activeMenuId === 'exec' && typeof updateExecutiveDashboard === 'function') {
        updateExecutiveDashboard(window.globalRouteSheetData);
      }
      showToast(`รีเฟรชสำเร็จ! ข้อมูล ${routeData.length.toLocaleString()} รายการ`);
    }
  } catch (err) {
    console.error('Refresh error:', err);
    showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล');
  }
};

// ==============================================================================
// 4. EXECUTIVE DASHBOARD & KPIS
// ==============================================================================
async function updateExecutiveDashboard(filteredData = []) {
  const routeData = (filteredData && filteredData.length > 0)
    ? filteredData
    : (window.globalRouteSheetData && window.globalRouteSheetData.length > 0
        ? window.globalRouteSheetData
        : (typeof fetchNewRouteSheet === 'function' ? await fetchNewRouteSheet() : []));

  window.globalRouteSheetData = Array.isArray(routeData) ? (routeData[0]?._parsed ? routeData : precomputeRouteData(routeData)) : [];

  if (typeof populateExecProvinceMultiSelect === 'function') {
    populateExecProvinceMultiSelect(window.globalRouteSheetData);
  }

  updateExecNewOrderMappingSection(window.globalRouteSheetData);
  updateExecAdvancedAnalytics(window.globalRouteSheetData);

  if (typeof renderExecRouteHeatmap === 'function') {
    renderExecRouteHeatmap(window.globalRouteSheetData);
  }

  setTimeout(() => {
    if (typeof execMap !== 'undefined' && execMap) execMap.invalidateSize();
  }, 300);
}

function calculateExecAnalytics(routeData) {
  const result = {
    carrierTotalCount: routeData.length,
    carrierUnavailableCount: 0,
    carrierAvailableCount: 0,
    totalTripsSum: 0,
    unavailTripsSum: 0,
    availTripsSum: 0,
    distinctRouteMap: {},
    zoneSummaryMap: {},
    truckAvailMap: {},
    carrierAvailMap: {},
    allRoutesList: []
  };

  routeData.forEach(row => {
    const p = row._parsed;
    const origin = String(row.origin || row['ต้นทาง'] || '-').trim();
    const province = String(row.province || row['จังหวัด'] || '-').trim();
    let shipTo = String(row.ship_to_desc || row['Description(Ship-To (Outbound))'] || '').trim();
    if (!shipTo || shipTo === '-') shipTo = province;
    const zone = String(row.zone || row['Zone'] || '-').trim();
    const truck = String(row.truck_type || row['ประเภทรถ'] || '-').trim();
    const rawFwdAgent = String(row.fwd_agent_desc || row['Description(FwdAgent)'] || row['ผู้รับเหมา'] || '').trim();

    const trips = p ? p.trips : parseNum(row.avg_trip_week || row['AVG Trip/Week'], 0);
    const availPct = p ? p.availPct : Math.max(0, 100 - parseNum(row.pct_total || row['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'], 0));
    const rowActualAvailTrips = p ? p.availTrips : (trips * (availPct / 100));

    result.totalTripsSum += trips;

    if (availPct === 0) {
      result.carrierUnavailableCount++;
      result.unavailTripsSum += trips;
    } else {
      result.carrierAvailableCount++;
      result.availTripsSum += rowActualAvailTrips;
    }

    const distinctKey = p ? p.distinctKey : getDistinctKey(row);
    if (!result.distinctRouteMap[distinctKey]) {
      result.distinctRouteMap[distinctKey] = { hasAvailable: false, totalTrips: 0, availTrips: 0 };
    }
    result.distinctRouteMap[distinctKey].totalTrips += trips;
    result.distinctRouteMap[distinctKey].availTrips += rowActualAvailTrips;
    if (availPct > 0) result.distinctRouteMap[distinctKey].hasAvailable = true;

    if (zone && zone !== '-') {
      if (!result.zoneSummaryMap[zone]) {
        result.zoneSummaryMap[zone] = { totalRoutes: 0, availRoutes: 0, totalTrips: 0, availTrips: 0 };
      }
      result.zoneSummaryMap[zone].totalRoutes++;
      result.zoneSummaryMap[zone].totalTrips += trips;
      if (availPct > 0) {
        result.zoneSummaryMap[zone].availRoutes++;
        result.zoneSummaryMap[zone].availTrips += rowActualAvailTrips;
      }
    }

    if (truck && truck !== '-' && truck !== 'undefined') {
      if (!result.truckAvailMap[truck]) {
        result.truckAvailMap[truck] = { totalRoutes: 0, availRoutes: 0, sumAvailPct: 0, totalTrips: 0, availTrips: 0 };
      }
      result.truckAvailMap[truck].totalRoutes++;
      result.truckAvailMap[truck].totalTrips += trips;
      result.truckAvailMap[truck].sumAvailPct += availPct;
      if (availPct > 0) {
        result.truckAvailMap[truck].availRoutes++;
        result.truckAvailMap[truck].availTrips += rowActualAvailTrips;
      }
    }

    if (rawFwdAgent && rawFwdAgent !== '-' && rawFwdAgent !== 'ไม่ระบุ') {
      rawFwdAgent.split(/[,/|\n]+/).forEach(agent => {
        const clean = agent.trim();
        if (clean && clean !== '-' && clean !== 'ไม่ระบุ') {
          if (!result.carrierAvailMap[clean]) {
            result.carrierAvailMap[clean] = { sumAvail: 0, count: 0, trips: 0, availTrips: 0 };
          }
          result.carrierAvailMap[clean].sumAvail += availPct;
          result.carrierAvailMap[clean].count += 1;
          result.carrierAvailMap[clean].trips += trips;
          result.carrierAvailMap[clean].availTrips += rowActualAvailTrips;
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
  renderExecZoneSummaryList(data.zoneSummaryMap, routeData);
  renderExecTruckAvailList(data.truckAvailMap);
  renderExecCarrierCapacity(data.carrierAvailMap, data.allRoutesList);
}

function renderExecTopKPIs(data) {
  const distinctTotalCount = Object.keys(data.distinctRouteMap).length;
  const distinctAvailableCount = Object.values(data.distinctRouteMap).filter(r => r.hasAvailable).length;
  const distinctAvailPct = distinctTotalCount > 0 ? ((distinctAvailableCount / distinctTotalCount) * 100).toFixed(1) : '0.0';

  const distinctTotalTripsWk = Object.values(data.distinctRouteMap).reduce((sum, r) => sum + r.totalTrips, 0);
  const distinctAvailTripsWk = Object.values(data.distinctRouteMap).reduce((sum, r) => sum + (r.hasAvailable ? r.availTrips : 0), 0);

  const distinctTotalTripsDay = distinctTotalTripsWk / WORKING_DAYS_PER_WEEK;
  const distinctAvailTripsDay = distinctAvailTripsWk / WORKING_DAYS_PER_WEEK;
  const carrierTotalTripsDay = data.totalTripsSum / WORKING_DAYS_PER_WEEK;
  const carrierUnavailTripsDay = data.unavailTripsSum / WORKING_DAYS_PER_WEEK;
  const carrierAvailTripsDay = data.availTripsSum / WORKING_DAYS_PER_WEEK;

  const carrierUnavailPct = data.carrierTotalCount > 0 ? ((data.carrierUnavailableCount / data.carrierTotalCount) * 100).toFixed(1) : '0.0';
  const carrierAvailPct = data.carrierTotalCount > 0 ? ((data.carrierAvailableCount / data.carrierTotalCount) * 100).toFixed(1) : '0.0';

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
  setHtml('kpi-distinct-total-trips', `
    <div><strong class="text-slate-700 dark:text-slate-200">${Math.round(distinctTotalTripsWk).toLocaleString()}</strong> trips/wk</div>
    <div class="text-[9px] text-slate-400 font-normal">(~${distinctTotalTripsDay.toFixed(1)} trips/day • 6 days)</div>
  `);
  setHtml('kpi-distinct-avail-trips', `
    <div><strong class="text-emerald-700 dark:text-emerald-300">${Math.round(distinctAvailTripsWk).toLocaleString()}</strong> trips/wk</div>
    <div class="text-[9px] text-emerald-500 font-normal">(~${distinctAvailTripsDay.toFixed(1)} trips/day • 6 days)</div>
  `);

  setText('kpi-carrier-total', data.carrierTotalCount.toLocaleString());
  setText('kpi-carrier-unavail', data.carrierUnavailableCount.toLocaleString());
  setText('kpi-carrier-unavail-pct', `(${carrierUnavailPct}%)`);
  setText('kpi-carrier-avail', data.carrierAvailableCount.toLocaleString());
  setText('kpi-carrier-avail-pct', `(${carrierAvailPct}%)`);
  setHtml('kpi-carrier-total-trips', `
    <div><strong class="text-slate-700 dark:text-slate-200">${Math.round(data.totalTripsSum).toLocaleString()}</strong> trips/wk</div>
    <div class="text-[9px] text-slate-400 font-normal">(~${carrierTotalTripsDay.toFixed(1)} trips/day)</div>
  `);
  setHtml('kpi-carrier-unavail-trips', `
    <div><strong class="text-rose-700 dark:text-rose-300">${Math.round(data.unavailTripsSum).toLocaleString()}</strong> trips/wk</div>
    <div class="text-[9px] text-rose-500 font-normal">(~${carrierUnavailTripsDay.toFixed(1)} trips/day)</div>
  `);
  setHtml('kpi-carrier-avail-trips', `
    <div><strong class="text-emerald-700 dark:text-emerald-300">${Math.round(data.availTripsSum).toLocaleString()}</strong> trips/wk</div>
    <div class="text-[9px] text-emerald-500 font-normal">(~${carrierAvailTripsDay.toFixed(1)} trips/day)</div>
  `);
}

function renderExecZoneSummaryList(zoneSummaryMap) {
  const regionListEl = document.getElementById('exec-region-summary-list');
  if (!regionListEl) return;

  const sortedZones = Object.entries(zoneSummaryMap)
    .map(([zoneName, stat]) => ({
      zoneName,
      totalRoutes: stat.totalRoutes,
      availRoutes: stat.availRoutes,
      totalTrips: stat.totalTrips,
      availTrips: stat.availTrips,
      zoneAvailPct: stat.totalRoutes > 0 ? ((stat.availRoutes / stat.totalRoutes) * 100) : 0
    }))
    .sort((a, b) => b.zoneAvailPct !== a.zoneAvailPct ? b.zoneAvailPct - a.zoneAvailPct : b.availRoutes - a.availRoutes);

  regionListEl.innerHTML = sortedZones.map(item => `
    <div onclick="selectExecZoneCard('${escapeAttr(item.zoneName)}', this)" class="p-3.5 rounded-2xl bg-white dark:bg-zinc-950 border border-slate-200/90 dark:border-slate-800 hover:border-orange-500 cursor-pointer transition-all flex items-center justify-between font-sans shadow-sm hover:scale-[1.01]">
      <div>
        <h5 class="text-xs font-extrabold text-slate-800 dark:text-white">${escapeHtml(item.zoneName)}</h5>
        <p class="text-[10px] text-slate-400 mt-0.5">
          ${item.totalRoutes.toLocaleString()} routes (${Math.round(item.totalTrips).toLocaleString()} trips/wk • ~${(item.totalTrips / WORKING_DAYS_PER_WEEK).toFixed(1)} trips/day)
        </p>
      </div>
      <div class="text-right">
        <div class="text-xs font-black text-emerald-600 dark:text-emerald-400">
           ${item.availRoutes.toLocaleString()} routes <span class="text-[10px]">(${item.zoneAvailPct.toFixed(2)}%)</span>
        </div>
        <p class="text-[10px] text-slate-400 mt-0.5">~${Math.round(item.availTrips).toLocaleString()} trips/wk (~${(item.availTrips / WORKING_DAYS_PER_WEEK).toFixed(1)} trips/day)</p>
      </div>
    </div>
  `).join('');
}

function renderExecTruckAvailList(truckAvailMap) {
  const truckListEl = document.getElementById('exec-truck-avail-list');
  if (!truckListEl) return;

  const sortedTrucks = Object.entries(truckAvailMap).map(([type, stat]) => ({
    type,
    totalRoutes: stat.totalRoutes,
    availRoutes: stat.availRoutes,
    totalTrips: stat.totalTrips,
    availTrips: stat.availTrips,
    availRatio: stat.totalRoutes > 0 ? (stat.availRoutes / stat.totalRoutes) * 100 : 0
  })).sort((a, b) => b.availRoutes - a.availRoutes);

  // 💡 กรณีตัวกรองจังหวัดที่เลือก ไม่มีข้อมูลประเภทรถ
  if (sortedTrucks.length === 0) {
    truckListEl.innerHTML = `
      <div class="col-span-full py-8 text-center text-xs text-slate-400 font-sans border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-zinc-900/50">
        ไม่พบข้อมูลประเภทรถสำหรับจังหวัดที่เลือก
      </div>
    `;
    return;
  }

  truckListEl.innerHTML = sortedTrucks.map(item => {
    const color = getAvailColorScale(item.availRatio);
    const radius = 18;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (Math.min(item.availRatio, 100) / 100) * circumference;

    return `
      <div class="p-3.5 rounded-2xl bg-slate-50/70 dark:bg-zinc-950/70 border border-slate-200/80 dark:border-slate-800 hover:border-orange-500/60 hover:shadow-md transition-all font-sans flex flex-col justify-between space-y-3">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-8 h-8 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-orange-500 shadow-sm shrink-0">
              <i data-lucide="truck" class="w-4 h-4"></i>
            </div>
            <div class="truncate">
              <h5 class="text-xs font-black text-slate-800 dark:text-white truncate" title="${escapeAttr(item.type)}">${escapeHtml(item.type)}</h5>
              <span class="text-[10px] font-semibold text-slate-400">${item.totalRoutes.toLocaleString()} Routes</span>
            </div>
          </div>

          <div class="relative w-11 h-11 shrink-0 flex items-center justify-center">
            <svg class="w-full h-full -rotate-90" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="${radius}" class="stroke-slate-200 dark:stroke-zinc-800" stroke-width="3.5" fill="none" />
              <circle cx="22" cy="22" r="${radius}" stroke="${color.hex}" stroke-width="3.5" stroke-linecap="round" fill="none"
                style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset}; transition: stroke-dashoffset 0.6s ease;" />
            </svg>
            <span class="absolute text-[9px] font-black text-slate-800 dark:text-white">${Math.round(item.availRatio)}%</span>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/80 text-[10px]">
          <div class="bg-white/80 dark:bg-zinc-900/80 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
            <span class="text-slate-400 block text-[9px] font-medium">Available Routes</span>
            <strong class="${color.text} text-xs font-black">${item.availRoutes.toLocaleString()}</strong>
          </div>
          <div class="bg-white/80 dark:bg-zinc-900/80 p-2 rounded-xl border border-slate-100 dark:border-slate-800 text-right">
            <span class="text-slate-400 block text-[9px] font-medium">Available Volume</span>
            <strong class="text-slate-800 dark:text-slate-200 text-xs font-black">
              ${Math.round(item.availTrips).toLocaleString()} <span class="text-[9px] text-slate-400 font-normal">trips/wk</span>
              <span class="block text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold">(~${(item.availTrips / WORKING_DAYS_PER_WEEK).toFixed(1)} trips/day)</span>
            </strong>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons({ root: truckListEl });
}

function renderExecCarrierCapacity(carrierAvailMap, allRoutesList) {
  const availCapCountEl = document.getElementById('exec-avail-cap-count');
  const searchCarrierInput = document.getElementById('input-search-carrier');

  window.drawCarrierCardElements = function(carriers) {
    const listEl = document.getElementById('exec-avail-cap-list');
    if (!listEl) return;
    if (!carriers || carriers.length === 0) {
      listEl.innerHTML = `<div class="col-span-full py-8 text-center text-xs text-slate-400 font-sans">No carrier matching your criteria</div>`;
      return;
    }

    listEl.innerHTML = carriers.map(item => {
      const color = getAvailColorScale(item.avgAvail);
      return `
        <div class="carrier-item-card p-3 rounded-2xl bg-slate-50/80 dark:bg-zinc-950/70 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500 hover:shadow-md transition-all font-sans flex flex-col justify-between space-y-2.5">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <span class="font-extrabold text-xs text-slate-800 dark:text-slate-100 block truncate" title="${escapeAttr(item.name)}">${escapeHtml(item.name)}</span>
              <span class="text-[10px] text-slate-400 font-medium">${item.count.toLocaleString()} routes registered</span>
            </div>
            <div class="text-right shrink-0">
              <span class="text-xs font-black ${color.text} block">${item.avgAvail}%</span>
              <span class="text-[9px] text-slate-400 uppercase tracking-wider">Available</span>
            </div>
          </div>
          <div class="w-full bg-slate-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all duration-500" style="width: ${Math.min(item.avgAvail, 100)}%; background-color: ${color.hex};"></div>
          </div>
          <div class="flex items-center justify-between text-[10px] pt-1 border-t border-slate-200/50 dark:border-slate-800/80 text-slate-400">
            <span class="font-medium">Available Volume</span>
            <strong class="text-slate-700 dark:text-slate-300 font-bold">
              ~${Math.round(item.availTrips).toLocaleString()} /wk <span class="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold">(~${(item.availTrips / WORKING_DAYS_PER_WEEK).toFixed(1)} trips/day)</span>
            </strong>
          </div>
        </div>
      `;
    }).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: listEl });
  };

  window.filterCarrierCardList = function(keyword) {
    const key = (keyword || '').trim().toLowerCase();
    const allList = window.execCarrierListCache || [];
    window.drawCarrierCardElements(!key ? allList : allList.filter(item => item.name.toLowerCase().includes(key)));
  };

  const sortedCarrierAvail = Object.entries(carrierAvailMap).map(([name, stat]) => ({
    name,
    count: stat.count,
    trips: stat.trips,
    availTrips: stat.availTrips,
    avgAvail: Math.round(stat.sumAvail / stat.count)
  })).sort((a, b) => b.avgAvail !== a.avgAvail ? b.avgAvail - a.avgAvail : b.count - a.count);

  window.execCarrierListCache = sortedCarrierAvail;
  if (availCapCountEl) availCapCountEl.innerText = `${sortedCarrierAvail.length.toLocaleString()} Carriers`;

  const currentKeyword = searchCarrierInput?.value || '';
  if (currentKeyword.trim() !== '') {
    window.filterCarrierCardList(currentKeyword);
  } else {
    window.drawCarrierCardElements(sortedCarrierAvail);
  }

  window.execAllRoutesCache = allRoutesList;
  const currentZone = document.getElementById('select-top10-zone')?.value || 'ALL';
  if (typeof renderTop10AvailableRoutes === 'function') renderTop10AvailableRoutes(currentZone);
}

function updateExecNewOrderMappingSection(customData = null) {
  const container = document.getElementById('exec-region-summary-list');
  const sourceData = customData || window.globalRouteSheetData;
  if (!container || !sourceData || sourceData.length === 0) {
    if (container) container.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 font-sans col-span-full">No active routes found</div>`;
    return;
  }

  const zoneStats = {};
  sourceData.forEach(row => {
    const p = row._parsed;
    const zoneName = String(row.zone || row['Zone'] || '').trim();
    if (zoneName && zoneName !== 'undefined' && zoneName !== 'null' && zoneName !== '-') {
      const trips = p ? p.trips : parseNum(row.avg_trip_week || row['AVG Trip/Week'], 0);
      const availPct = p ? p.availPct : Math.max(0, 100 - parseNum(row.pct_total || row['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'], 0));
      const availTrips = p ? p.availTrips : (trips * (availPct / 100));

      if (!zoneStats[zoneName]) {
        zoneStats[zoneName] = { totalRoutes: 0, availRoutes: 0, totalTrips: 0, availTrips: 0 };
      }
      zoneStats[zoneName].totalRoutes += 1;
      zoneStats[zoneName].totalTrips += trips;
      if (availPct > 0) {
        zoneStats[zoneName].availRoutes += 1;
        zoneStats[zoneName].availTrips += availTrips;
      }
    }
  });

  const sortedZones = Object.entries(zoneStats).map(([zoneName, stat]) => ({
    zoneName,
    totalRoutes: stat.totalRoutes,
    availRoutes: stat.availRoutes,
    totalTrips: stat.totalTrips,
    availTrips: stat.availTrips,
    zoneAvailPct: stat.totalRoutes > 0 ? ((stat.availRoutes / stat.totalRoutes) * 100) : 0
  })).sort((a, b) => b.zoneAvailPct !== a.zoneAvailPct ? b.zoneAvailPct - a.zoneAvailPct : b.availRoutes - a.availRoutes);

  if (sortedZones.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 font-sans col-span-full">No active routes for selected filter</div>`;
    return;
  }

  container.innerHTML = sortedZones.map(item => `
    <div onclick="selectExecZoneCard('${escapeAttr(item.zoneName)}', this)" 
         class="p-3.5 rounded-2xl bg-white dark:bg-zinc-950 border border-slate-200/90 dark:border-slate-800 hover:border-orange-500 cursor-pointer transition-all flex items-center justify-between font-sans shadow-sm hover:scale-[1.01]">
      <div>
        <h5 class="text-xs font-extrabold text-slate-800 dark:text-white">${escapeHtml(item.zoneName)}</h5>
        <p class="text-[10px] text-slate-400 mt-0.5">
          ${item.totalRoutes.toLocaleString()} routes (${Math.round(item.totalTrips).toLocaleString()} trips/wk • ~${(item.totalTrips / WORKING_DAYS_PER_WEEK).toFixed(1)} trips/day)
        </p>
      </div>
      <div class="text-right">
        <div class="text-xs font-black text-emerald-600 dark:text-emerald-400">
          ${item.availRoutes.toLocaleString()} routes <span class="text-[10px]">(${item.zoneAvailPct.toFixed(2)}%)</span>
        </div>
        <p class="text-[10px] text-slate-400 mt-0.5">
          ~${Math.round(item.availTrips).toLocaleString()} trips/wk (~${(item.availTrips / WORKING_DAYS_PER_WEEK).toFixed(1)} trips/day)
        </p>
      </div>
    </div>
  `).join('');
}

function renderExecZoneSummaryList(zoneSummaryMap, sourceRoutes = null) {
  if (sourceRoutes) {
    updateExecNewOrderMappingSection(sourceRoutes);
  }
}

// ==============================================================================
// 5. EXECUTIVE MULTI-SELECT & SYNC
// ==============================================================================
function populateExecProvinceMultiSelect(routeData) {
  const container = document.getElementById('dropdown-exec-province');
  if (!container || !routeData || routeData.length === 0) return;

  const provinces = [...new Set(
    routeData.map(r => String(r.province || r['จังหวัด'] || '').trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'th'));

  const currentSelected = getMultiSelectValues('exec-province');
  const isAllSelected = currentSelected.includes('all') || currentSelected.length === 0;

  let html = `
    <div class="p-1 mb-1 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-zinc-900 z-10 font-sans">
      <div class="relative">
        <i data-lucide="search" class="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"></i>
        <input type="text" placeholder="Search All Provinces..." 
               oninput="filterDropdownList('exec-province', this.value)" 
               onclick="event.stopPropagation()"
               class="w-full pl-7 pr-2 py-1 rounded-lg text-[11px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-slate-200 outline-none focus:border-orange-500 transition-colors font-sans">
      </div>
    </div>
    <div id="list-exec-province" class="max-h-44 overflow-y-auto custom-scrollbar flex flex-col gap-0.5 pr-0.5 font-sans">
      <label class="dropdown-item flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-orange-50 dark:hover:bg-orange-500/10 rounded-lg cursor-pointer transition-colors group">
        <input type="checkbox" value="ALL" class="checkbox-exec-province w-3.5 h-3.5 rounded border-slate-300 accent-[#f97316] focus:ring-[#f97316] transition-all cursor-pointer" 
               ${isAllSelected ? 'checked' : ''} 
               onchange="handleCheckboxChange('exec-province', 'ALL')">
        <span class="text-xs text-slate-800 dark:text-slate-200 font-bold group-hover:text-orange-600 dark:group-hover:text-orange-400">All Provinces</span>
      </label>
  `;

  html += provinces.map(prov => {
    const isChecked = !isAllSelected && currentSelected.includes(cleanAllSpaces(prov));
    return `
      <label class="dropdown-item flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-zinc-800/50 rounded-lg cursor-pointer transition-colors group">
        <input type="checkbox" value="${escapeAttr(prov)}" class="checkbox-exec-province w-3.5 h-3.5 rounded border-slate-300 accent-[#f97316] focus:ring-[#f97316] transition-all cursor-pointer" 
               ${isChecked ? 'checked' : ''} 
               onchange="handleCheckboxChange('exec-province', '${escapeAttr(prov)}')">
        <span class="text-xs text-slate-700 dark:text-slate-300 group-hover:text-orange-600 dark:group-hover:text-orange-400 truncate">${escapeHtml(prov)}</span>
      </label>
    `;
  }).join('');

  html += `</div>`;
  container.innerHTML = html;
  updateFilterLabel('exec-province', 'All Provinces');
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: container });
}

function applyExecProvinceFilter() {
  const selectedCleanProvs = getMultiSelectValues('exec-province');
  const allRoutes = window.globalRouteSheetData || [];
  if (!allRoutes || allRoutes.length === 0) return;

  const isAll = selectedCleanProvs.includes('all') || selectedCleanProvs.length === 0;

  let filteredRoutes = allRoutes;
  if (!isAll) {
    filteredRoutes = allRoutes.filter(row => {
      const p = row._parsed ? row._parsed.cleanProv : cleanAllSpaces(row.province || row['จังหวัด'] || '');
      return selectedCleanProvs.some(sel => p === sel || p.includes(sel) || sel.includes(p));
    });
  }

  // 1. อัปเดตการ์ดสรุปรายโซน (Regional Summary Cards)
  updateExecNewOrderMappingSection(filteredRoutes);

  // 💡 2. อัปเดตสถิติประเภทรถ (Truck Types), KPIs และ Carriers ให้ล้อตามจังหวัดที่เลือก
  updateExecAdvancedAnalytics(filteredRoutes);

  // 3. อัปเดตแผนที่ Choropleth Heatmap
  if (typeof renderExecRouteHeatmap === 'function') {
    renderExecRouteHeatmap(filteredRoutes);
  }

  // 4. อัปเดตตารางเจาะลึกด้านล่าง (ถ้าเปิดอยู่)
  const detailPanel = document.getElementById('exec-zone-detail-panel');
  if (detailPanel && !detailPanel.classList.contains('hidden')) {
    const currentZone = document.getElementById('exec-selected-zone-name')?.innerText || '';
    if (typeof showExecZoneDetailsTable === 'function') {
      showExecZoneDetailsTable(currentZone, filteredRoutes);
    }
  }
}

// ==============================================================================
// 6. ROUTE DASHBOARD: FILTERS, TABLE & SYNC
// ==============================================================================
function getMultiSelectValues(filterId) {
  const checkboxes = document.querySelectorAll(`.checkbox-${filterId}`);
  if (!checkboxes || checkboxes.length === 0) return ['all'];
  const selected = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cleanAllSpaces(cb.value));
  return (selected.length === 0 || selected.includes('all')) ? ['all'] : selected;
}

function updateFilterLabel(filterId, defaultLabel = 'All') {
  const checkboxes = document.querySelectorAll(`.checkbox-${filterId}`);
  const labelEl = document.getElementById(`label-${filterId}`);
  if (!labelEl) return;

  const selected = Array.from(checkboxes).filter(cb => cb.checked && cb.value !== 'ALL').map(cb => cb.value);
  if (selected.length === 0) {
    labelEl.innerText = defaultLabel;
    labelEl.className = 'truncate text-slate-500 dark:text-slate-400 font-normal';
  } else if (selected.length === 1) {
    labelEl.innerText = selected[0];
    labelEl.className = 'truncate text-slate-800 dark:text-slate-200 font-bold';
  } else {
    labelEl.innerText = `${selected.length} Selected`;
    labelEl.className = 'truncate text-orange-600 dark:text-orange-400 font-bold bg-orange-100 dark:bg-orange-500/20 px-2 py-0.5 rounded-md';
  }
}

function populateDashboardFilters(data) {
  if (!data || data.length === 0) return;

  const getUniqueValues = (keyEN, keyTH) => {
    const set = new Set();
    data.forEach(row => {
      const val = String(row[keyEN] || row[keyTH] || '').trim();
      if (val && val !== 'undefined' && val !== 'null' && val !== '-') set.add(val);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'));
  };

  const updateSelectOptions = (filterId, options, defaultLabel = 'All') => {
    const container = document.getElementById(`dropdown-${filterId}`);
    if (!container) return;

    const currentSelected = getMultiSelectValues(filterId);
    const isAllSelected = currentSelected.includes('all');

    let html = `
      <div class="p-1 mb-1 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-zinc-900 z-10">
        <div class="relative">
          <i data-lucide="search" class="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"></i>
          <input type="text" placeholder="Search ${defaultLabel}..." oninput="filterDropdownList('${filterId}', this.value)" onclick="event.stopPropagation()"
                 class="w-full pl-7 pr-2 py-1 rounded-lg text-[11px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-slate-200 outline-none focus:border-orange-500 transition-colors">
        </div>
      </div>
      <div id="list-${filterId}" class="max-h-44 overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
        <label class="dropdown-item flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-orange-50 dark:hover:bg-orange-500/10 rounded-lg cursor-pointer transition-colors group">
          <input type="checkbox" value="ALL" class="checkbox-${filterId} w-3.5 h-3.5 rounded border-slate-300 accent-[#f97316] focus:ring-[#f97316] transition-all cursor-pointer" ${isAllSelected ? 'checked' : ''} onchange="handleCheckboxChange('${filterId}', 'ALL')">
          <span class="text-xs text-slate-800 dark:text-slate-200 font-bold group-hover:text-orange-600 dark:group-hover:text-orange-400">${defaultLabel}</span>
        </label>
    `;

    html += options.map(opt => {
      const isChecked = !isAllSelected && currentSelected.includes(cleanAllSpaces(opt));
      return `
        <label class="dropdown-item flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-zinc-800/50 rounded-lg cursor-pointer transition-colors group">
          <input type="checkbox" value="${escapeAttr(opt)}" class="checkbox-${filterId} w-3.5 h-3.5 rounded border-slate-300 accent-[#f97316] focus:ring-[#f97316] transition-all cursor-pointer" ${isChecked ? 'checked' : ''} onchange="handleCheckboxChange('${filterId}', '${escapeAttr(opt)}')">
          <span class="text-xs text-slate-700 dark:text-slate-300 group-hover:text-orange-600 dark:group-hover:text-orange-400 truncate">${escapeHtml(opt)}</span>
        </label>
      `;
    }).join('');

    html += `</div>`;
    container.innerHTML = html;
    updateFilterLabel(filterId, defaultLabel);
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: container });
  };

  const originLocations = Object.values(window.originLocationMap || {});
  const uniqueOriginZones = [...new Set(originLocations.map(l => l.zone).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
  const uniqueOriginProvinces = [...new Set(originLocations.map(l => l.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));

  updateSelectOptions('filter-origin-zone', uniqueOriginZones, 'All Origin Zones');
  updateSelectOptions('filter-origin-province', uniqueOriginProvinces, 'All Origin Provinces');
  updateSelectOptions('filter-origin-dc', getUniqueValues('origin', 'ต้นทาง'), 'All Origin DCs');

  updateSelectOptions('filter-carrier', getUniqueValues('fwd_agent_desc', 'Description(FwdAgent)'), 'All Carriers');
  updateSelectOptions('filter-truck-type', getUniqueValues('truck_type', 'ประเภทรถ'), 'All Truck Types');
  updateSelectOptions('filter-dest-region', getUniqueValues('zone', 'Zone'), 'All Zones');
  updateSelectOptions('filter-dest-province', getUniqueValues('province', 'จังหวัด'), 'All Provinces');
  updateSelectOptions('filter-customer-type', getUniqueValues('customer_type', 'ประเภทลูกค้า'), 'All Types');
  updateSelectOptions('filter-customer-name', getUniqueValues('customer_name', 'ลูกค้า'), 'All Customers');
  updateSelectOptions('filter-shipto-desc', getUniqueValues('ship_to_desc', 'Description(Ship-To (Outbound))'), 'All Locations');
  updateSelectOptions('filter-product-cat', getUniqueValues('product_category', 'ประเภทสินค้า'), 'All Categories');
}

window.filterDropdownList = function(filterId, keyword) {
  const container = document.getElementById(`list-${filterId}`);
  if (!container) return;
  const items = container.querySelectorAll('.dropdown-item');
  const searchKey = keyword.trim().toLowerCase();

  items.forEach(item => {
    const isAllOption = item.querySelector('input')?.value === 'ALL';
    const text = item.innerText.toLowerCase();
    item.style.display = (isAllOption || text.includes(searchKey)) ? 'flex' : 'none';
  });
};

window.handleCheckboxChange = function(filterId, value) {
  const checkboxes = document.querySelectorAll(`.checkbox-${filterId}`);
  const allCheckbox = Array.from(checkboxes).find(cb => cb.value === 'ALL');

  if (value === 'ALL') {
    if (allCheckbox?.checked) {
      checkboxes.forEach(cb => { if (cb.value !== 'ALL') cb.checked = false; });
    } else if (allCheckbox) {
      allCheckbox.checked = true;
    }
  } else {
    const anyChecked = Array.from(checkboxes).some(cb => cb.value !== 'ALL' && cb.checked);
    if (allCheckbox) allCheckbox.checked = !anyChecked;
  }

  updateFilterLabel(filterId, filterId === 'exec-province' ? 'All Provinces' : 'All');

  if (filterId === 'exec-province') {
    applyExecProvinceFilter();
  } else {
    applyDynamicFilters();
  }
};

window.toggleCustomDropdown = function(dropdownId) {
  document.querySelectorAll('.custom-select-dropdown').forEach(el => {
    if (el.id !== dropdownId) el.classList.add('hidden');
  });
  const el = document.getElementById(dropdownId);
  if (el) el.classList.toggle('hidden');
};

async function applyDynamicFilters() {
  if (!window.globalRouteSheetData || window.globalRouteSheetData.length === 0) {
    window.globalRouteSheetData = (typeof fetchNewRouteSheet === 'function') ? await fetchNewRouteSheet() : [];
    window.globalRouteSheetData = precomputeRouteData(window.globalRouteSheetData);
  }

  if (!window.globalRouteSheetData[0]?._parsed) {
    window.globalRouteSheetData = precomputeRouteData(window.globalRouteSheetData);
  }

  const searchKeyword = (document.querySelector('#filters-content input[type="text"]')?.value || '').trim().toLowerCase();
  
  const selCarriers = getMultiSelectValues('filter-carrier');
  const selTruckTypes = getMultiSelectValues('filter-truck-type');
  const selOriginDCs = getMultiSelectValues('filter-origin-dc');
  const selOriginZones = getMultiSelectValues('filter-origin-zone');
  const selOriginProvinces = getMultiSelectValues('filter-origin-province');
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
    return selectedList.some(val => val !== 'all' && (cleanVal.includes(val) || val.includes(cleanVal)));
  };

  const hasOriginZoneFilter = !isAll(selOriginZones);
  const hasOriginProvFilter = !isAll(selOriginProvinces);

  const filteredData = window.globalRouteSheetData.filter(row => {
    const p = row._parsed;

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

    if (hasOriginZoneFilter || hasOriginProvFilter) {
      const originInfo = window.originLocationMap ? (window.originLocationMap[p.cleanOrigin] || window.originLocationMap[row.origin]) : null;
      if (hasOriginZoneFilter && !matchCriteria(selOriginZones, cleanAllSpaces(originInfo?.zone))) return false;
      if (hasOriginProvFilter && !matchCriteria(selOriginProvinces, cleanAllSpaces(originInfo?.province))) return false;
    }

    if (searchKeyword && !p.searchIndex.includes(searchKeyword)) return false;

    return true;
  });

  currentPage = 1;
  renderTable(filteredData);

  clearTimeout(mapRenderDebounceTimer);
  mapRenderDebounceTimer = setTimeout(() => {

  if (state.activeMenuId === 'dashboard') {
    if (typeof updateMapDisplay === 'function') {
      updateMapDisplay(filteredData);
    } else if (typeof drawDashboardRoutes === 'function') {
      drawDashboardRoutes(filteredData);
    }
  }
}, 120);
}

function resetMapFilters() {
  const searchInput = document.querySelector('#filters-content input[type="text"]');
  if (searchInput) searchInput.value = '';

  const filterIds = [
    'filter-carrier', 'filter-truck-type', 
    'filter-origin-zone', 'filter-origin-province', 'filter-origin-dc',
    'filter-dest-region', 'filter-dest-province', 'filter-customer-type',
    'filter-customer-name', 'filter-shipto-desc', 'filter-product-cat'
  ];

  filterIds.forEach(id => {
    const checkboxes = document.querySelectorAll(`.checkbox-${id}`);
    checkboxes.forEach(cb => { cb.checked = (cb.value === 'ALL'); });
    updateFilterLabel(id);
  });

  const minInput = document.getElementById('filter-backhaul-min');
  const maxInput = document.getElementById('filter-backhaul-max');
  if (minInput) minInput.value = '';
  if (maxInput) maxInput.value = '';

  const minTripsInput = document.getElementById('filter-min-avail-trips');
  if (minTripsInput) minTripsInput.value = '';

  const metricEl = document.getElementById('filter-heat-metric');
  if (metricEl) metricEl.value = 'all';

  state.activeFilters.heatMetric = 'all';
  state.activeFilters.displayMode = 'routes';

  document.querySelectorAll('#display-mode-segmented .mode-btn').forEach(btn => {
    const mode = btn.getAttribute('data-mode');
    btn.className = mode === 'routes'
      ? 'mode-btn flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 bg-[#f97316] text-white shadow-sm'
      : 'mode-btn flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-zinc-700/50';
  });

  showToast('Filters cleared');
  applyDynamicFilters();
}

function groupRouteData(filteredData = []) {
  const groupedRoutes = {};

  filteredData.forEach(row => {
    const p = row._parsed;
    const routeKey = p ? p.distinctKey : getDistinctKey(row);
    const trips = p ? p.trips : parseNum(row.avg_trip_week || row['AVG Trip/Week'], 0);
    const totalPct = p ? p.totalPct : parseNum(row.pct_total || row['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'], 0);
    const availTrips = p ? p.availTrips : (trips * (Math.max(0, 100 - totalPct) / 100));

    if (!groupedRoutes[routeKey]) {
      groupedRoutes[routeKey] = {
        id: 'grp-' + Math.random().toString(36).substring(2, 11),
        origin: row.origin || row['ต้นทาง'] || '-',
        zone: row.zone || row['Zone'] || '-',
        province: row.province || row['จังหวัด'] || '-',
        customerName: row.customer_name || row['ลูกค้า'] || '-',
        customerType: row.customer_type || row['ประเภทลูกค้า'] || '-',
        shipToDesc: row.ship_to_desc || row['Description(Ship-To (Outbound))'] || row.province || '-',
        productCat: row.product_category || row['ประเภทสินค้า'] || '-',
        truckType: row.truck_type || row['ประเภทรถ'] || '-',
        mapRouteKey: p ? p.mapRouteKey : getMapRouteKey(row),
        uniqueSubcons: new Set(),
        totalTrips: 0,
        totalAvailTrips: 0,
        sumPct: 0,
        availablePct: 0,
        vendors: []
      };
    }

    const fwdAgent = String(row.fwd_agent_desc || row['Description(FwdAgent)'] || 'ไม่ระบุ').trim();
    if (fwdAgent !== 'ไม่ระบุ' && fwdAgent !== '-') {
      groupedRoutes[routeKey].uniqueSubcons.add(fwdAgent);
    }

    groupedRoutes[routeKey].totalTrips += trips;
    groupedRoutes[routeKey].totalAvailTrips += availTrips;
    groupedRoutes[routeKey].sumPct += totalPct;
    groupedRoutes[routeKey].vendors.push(row);
  });

  Object.values(groupedRoutes).forEach(grp => {
    const count = grp.vendors.length;
    const avgTotalPct = count > 0 ? (grp.sumPct / count) : 0;
    grp.availablePct = Math.max(0, Math.round(100 - avgTotalPct));

    grp.vendors.sort((a, b) => {
      const availA = a._parsed ? a._parsed.availPct : Math.max(0, 100 - parseNum(a.pct_total || a['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'], 0));
      const availB = b._parsed ? b._parsed.availPct : Math.max(0, 100 - parseNum(b.pct_total || b['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'], 0));
      return availB - availA;
    });
  });

  return groupedRoutes;
}

function renderTable(filteredData = []) {
  const thead = document.getElementById('table-head');
  const tbody = document.getElementById('table-body');
  const paginationEl = document.getElementById('table-pagination');

  // ฟังก์ชันช่วยอัปเดตข้อความลง DOM (รองรับ fallback หลายชื่อ ID)
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  };

  if (!thead || !tbody) return;
  currentFilteredData = filteredData;
  const groupedRoutes = groupRouteData(filteredData);
  const routeKeys = Object.keys(groupedRoutes);

  // กรณีไม่มีข้อมูลตรงตาม Filter
  if (!filteredData || filteredData.length === 0 || routeKeys.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-500 font-sans">ไม่พบข้อมูล Route ตามเงื่อนไขตัวกรอง</td></tr>`;
    setText('ops-count', '0');
    setText('ops-avail-groups', '0');
    setText('ops-unavail-groups', '0');
    setText('ops-avail-pct', '0.0%');
    setText('ops-total-volume', '0');
    setText('ops-sum-trips', '0');
    setText('ops-avail-volume', '0');
    setText('ops-avail-trips', '0');
    if (paginationEl) paginationEl.innerHTML = '';
    return;
  }

  // 💡 คำนวณ Group Count, Total Trips และ Available Trips รวมทั้งหมด
  let totalTripsSum = 0;
  let totalAvailTripsSum = 0;
  let availRouteGroupsCount = 0;
  let unavailRouteGroupsCount = 0;

  routeKeys.forEach(key => {
    const grp = groupedRoutes[key];
    totalTripsSum += (grp.totalTrips || 0);
    totalAvailTripsSum += (grp.totalAvailTrips || 0);

    if (grp.availablePct > 0) {
      availRouteGroupsCount += 1;
    } else {
      unavailRouteGroupsCount += 1;
    }
  });

  const totalRouteGroups = routeKeys.length;
  const availPct = totalRouteGroups > 0 ? ((availRouteGroupsCount / totalRouteGroups) * 100).toFixed(1) : '0.0';

  // เรียงลำดับจาก % ว่างมากไปน้อย (และตามด้วยเที่ยวว่าง)
  routeKeys.sort((a, b) => {
    const availA = Number(groupedRoutes[a]?.availablePct || 0);
    const availB = Number(groupedRoutes[b]?.availablePct || 0);
    if (availB !== availA) {
      return availB - availA;
    }
    const tripsA = Number(groupedRoutes[a]?.totalAvailTrips || 0);
    const tripsB = Number(groupedRoutes[b]?.totalAvailTrips || 0);
    return tripsB - tripsA;
  });

  window.currentGroupKeys = routeKeys;
  window.currentGroupMap = groupedRoutes;

  // 💡 อัปเดตสถิติบนแถบหัวตารางครบทุกค่า
  setText('ops-count', totalRouteGroups.toLocaleString());
  setText('ops-avail-groups', availRouteGroupsCount.toLocaleString());
  setText('ops-unavail-groups', unavailRouteGroupsCount.toLocaleString());
  setText('ops-avail-pct', `${availPct}%`);

  // อัปเดต Total Volume
  const formattedTotalVolume = Math.round(totalTripsSum).toLocaleString();
  setText('ops-total-volume', formattedTotalVolume);
  setText('ops-sum-trips', formattedTotalVolume);

  // อัปเดต Available Volume
  const formattedAvailVolume = formatNum(totalAvailTripsSum, 1);
  setText('ops-avail-volume', formattedAvailVolume);
  setText('ops-avail-trips', formattedAvailVolume);

  const columns = ['', 'Route', 'Customer (Type) & Item (Type)', 'Truck (Type)', 'Carriers', 'Sum Trip/Week', 'Available Backhaul'];
  thead.innerHTML = `
    <tr class="text-[10px] uppercase tracking-wider border-b text-slate-500 border-slate-200 dark:text-slate-400 dark:border-slate-700 bg-slate-50/60 dark:bg-zinc-900/60 font-sans">
      ${columns.map((col, i) => `<th class="p-3 font-bold ${i === 0 ? 'w-10 text-center' : ''}">${col}</th>`).join('')}
    </tr>
  `;

  const totalPages = Math.ceil(routeKeys.length / PAGE_SIZE);
  if (currentPage > totalPages) currentPage = 1;
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedKeys = routeKeys.slice(startIndex, startIndex + PAGE_SIZE);

  let html = '';
  paginatedKeys.forEach(key => {
    const grp = groupedRoutes[key];
    const subconCount = grp.uniqueSubcons.size;
    const vendorCount = grp.vendors.length;
    const availablePct = grp.availablePct;
    const color = getAvailColorScale(availablePct);

    const totalOffPeak = grp.vendors.reduce((sum, v) => sum + parseNum(v.avg_off_peak || v['Avg Off Peak'], 0), 0);
    const totalPeak = grp.vendors.reduce((sum, v) => sum + parseNum(v.avg_peak || v['Avg Peak'], 0), 0);

    const avgBoonrawd = vendorCount > 0 ? Math.round(grp.vendors.reduce((sum, v) => sum + parseNum(v.pct_boonrawd || v['%รับงานต่อสำหรับงานบุญรอด'], 0), 0) / vendorCount) : 0;
    const avgOwn = vendorCount > 0 ? Math.round(grp.vendors.reduce((sum, v) => sum + parseNum(v.pct_own || v['%รับงานต่องานของผู้รับเหมาเอง'], 0), 0) / vendorCount) : 0;
    const avgOutside = vendorCount > 0 ? Math.round(grp.vendors.reduce((sum, v) => sum + parseNum(v.pct_brf_outside || v['%รับงานต่อ สำหรับงานนอกของ BRF'], 0), 0) / vendorCount) : 0;

    html += `
      <tr id="row-${grp.id}" data-map-key="${escapeAttr(grp.mapRouteKey)}"
          class="text-xs border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer font-sans"
          onclick="onTableRowClick('${escapeAttr(grp.mapRouteKey)}', '${grp.id}')">
        <td class="p-3 text-center">
          <i data-lucide="chevron-right" id="icon-${grp.id}" class="w-4 h-4 text-slate-400 transition-transform duration-200 inline-block"></i>
        </td>
        <td class="p-3 whitespace-nowrap">
          <div class="font-bold text-slate-800 dark:text-white">${escapeHtml(grp.origin)} &rarr; ${escapeHtml(grp.shipToDesc)}</div>
          <div class="text-[10px] text-slate-400">Zone: ${escapeHtml(grp.zone)}</div>
        </td>
        <td class="p-3 max-w-[200px]">
          <div class="font-bold text-slate-800 dark:text-slate-200 truncate" title="${escapeAttr(grp.customerType)}">
            ${escapeHtml(grp.customerType)}
          </div>
          <div class="text-[10px] text-slate-400 truncate mt-0.5" title="${escapeAttr(grp.productCat)}">
            ${escapeHtml(grp.productCat)}
          </div>
        </td>
        <td class="p-3 whitespace-nowrap">
          <div class="font-semibold text-blue-600 dark:text-blue-400">${escapeHtml(grp.truckType)}</div>
        </td>
        <td class="p-3">
          <span class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 font-extrabold text-[10px]">
            ${subconCount}
          </span>
        </td>
        <td class="p-3 whitespace-nowrap">
          <div class="font-Sarabun font-bold text-slate-800 dark:text-slate-200">${formatNum(grp.totalTrips)} Trip/WK</div>
          <div class="text-[10px] font-Sarabun text-slate-500 dark:text-slate-400 mt-0.5">
            Off: <span class="font-bold text-slate-700 dark:text-slate-300">${formatNum(totalOffPeak)}</span> | On: <span class="font-bold text-slate-700 dark:text-slate-300">${formatNum(totalPeak)}</span>
          </div>
        </td>
        <td class="p-3 min-w-[170px]">
          <div class="flex items-center justify-between text-[10px] font-Sarabun font-bold mb-1">
            <span class="text-slate-500">Available:</span>
            <span class="${color.text}">${availablePct}% <span class="text-slate-400 font-normal">(~${formatNum(grp.totalAvailTrips, 1)} trips/wk)</span></span>
          </div>
          <div class="w-full bg-slate-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden flex shadow-inner mb-1">
            <div class="bg-blue-500 h-full transition-all" style="width: ${avgBoonrawd}%"></div>
            <div class="bg-emerald-500 h-full transition-all" style="width: ${avgOwn}%"></div>
            <div class="bg-amber-500 h-full transition-all" style="width: ${avgOutside}%"></div>
          </div>
          <div class="flex justify-between text-[9px] font-Sarabun leading-tight">
            <span class="text-blue-500 font-semibold">BRT ${avgBoonrawd}%</span>
            <span class="text-emerald-500 font-semibold">Own ${avgOwn}%</span>
            <span class="text-amber-500 font-semibold">BRF-Ext ${avgOutside}%</span>
          </div>
        </td>
      </tr>
      <tr id="detail-${grp.id}" class="border-b border-slate-200 dark:border-slate-800 font-sans">
        <td colspan="7" class="p-0">
          <div class="accordion-detail" id="content-${grp.id}">
            <div class="p-4 pl-12 border-l-4 border-orange-500 m-3 rounded-2xl bg-slate-50/80 dark:bg-zinc-950/80 shadow-inner">
              <div class="flex items-center justify-between mb-3 pb-2 border-b border-slate-200 dark:border-slate-800">
                <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <i data-lucide="users" class="w-4 h-4 text-orange-500"></i> Carriers Details (${vendorCount})
                </h4>
              </div>
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
                  ${grp.vendors.map(v => {
                    const vp = v._parsed;
                    const fwdAgentName = v.fwd_agent_desc || v['Description(FwdAgent)'] || '-';
                    const vOutsideRoute = String(v.brf_outside_route || v['ระบุต้นทาง และ ปลายทาง งานนอกของ BRF'] || '').trim();
                    const vTrip = vp ? vp.trips : parseNum(v.avg_trip_week || v['AVG Trip/Week'], 0);
                    const vOffPeak = parseNum(v.avg_off_peak || v['Avg Off Peak'], 0);
                    const vPeak = parseNum(v.avg_peak || v['Avg Peak'], 0);
                    const vendorAvailablePct = vp ? vp.availPct : Math.max(0, 100 - parseNum(v.pct_total || v['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'], 0));
                    const vendorAvailTrips = vp ? vp.availTrips : (vTrip * (vendorAvailablePct / 100));
                    const isFull = vendorAvailablePct === 0;
                    const bVal = parseNum(v.pct_boonrawd || v['%รับงานต่อสำหรับงานบุญรอด'], 0);
                    const oVal = parseNum(v.pct_own || v['%รับงานต่องานของผู้รับเหมาเอง'], 0);
                    const extVal = parseNum(v.pct_brf_outside || v['%รับงานต่อ สำหรับงานนอกของ BRF'], 0);
                    const vendorBadgeColor = isFull 
                      ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50' 
                      : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50';

                    return `
                      <tr class="hover:bg-slate-100/60 dark:hover:bg-zinc-900/60 transition-colors">
                        <td class="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">
                          ${escapeHtml(fwdAgentName)}
                          ${vOutsideRoute && vOutsideRoute !== '-' ? `<span class="block text-[10px] text-slate-400 font-normal mt-0.5">เส้นทางนอก BRF: ${escapeHtml(vOutsideRoute)}</span>` : ''}
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
                              <span class="text-blue-500 font-semibold">Boonrawd ${bVal}%</span>
                              <span class="text-emerald-500 font-semibold">Own Task ${oVal}%</span>
                              <span class="text-amber-500 font-semibold">BRF-External ${extVal}%</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
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
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: tbody });
}

window.onTableRowClick = function(mapRouteKey, grpId) {
  if (typeof highlightMapRoute === 'function') highlightMapRoute(mapRouteKey);
  if (typeof toggleRouteDetail === 'function') toggleRouteDetail(grpId);
};

window.focusTableRowByMapKey = function(mapKey) {
  if (!mapKey) return;

  const tc = document.getElementById('table-container');
  const chevron = document.getElementById('table-chevron');
  if (tc && tc.classList.contains('table-hidden')) {
    state.isTableExpanded = true;
    tc.classList.remove('table-hidden');
    tc.classList.add('table-expanded');
    if (chevron && typeof lucide !== 'undefined') {
      chevron.setAttribute('data-lucide', 'chevron-down');
      lucide.createIcons({ root: chevron.parentElement });
    }
  }

  const sourceData = (currentFilteredData && currentFilteredData.length > 0)
    ? currentFilteredData
    : (window.globalRouteSheetData || []);

  const matchedRows = sourceData.filter(row => getMapRouteKey(row) === mapKey);

  if (matchedRows.length === 0) {
    showToast(`⚠️ ไม่พบข้อมูลในตารางสำหรับเส้นทางนี้`);
    return;
  }

  const distinctRouteSet = new Set();
  const uniqueCarriersSet = new Set();

  matchedRows.forEach(row => {
    distinctRouteSet.add(getDistinctKey(row));
    const carrier = String(row.fwd_agent_desc || row['Description(FwdAgent)'] || row['ผู้รับเหมา'] || '').trim();
    if (carrier && carrier !== '-' && carrier !== 'ไม่ระบุ') {
      carrier.split(/[,/|\n]+/).forEach(c => {
        const clean = c.trim();
        if (clean && clean !== '-' && clean !== 'ไม่ระบุ') uniqueCarriersSet.add(clean);
      });
    }
  });

  const displayFrom = matchedRows[0]?.['ต้นทาง'] || matchedRows[0]?.origin || '-';
  const displayTo = matchedRows[0]?.['Description(Ship-To (Outbound))'] || matchedRows[0]?.ship_to_desc || matchedRows[0]?.['จังหวัด'] || '-';

  currentPage = 1;
  renderTable(matchedRows);
  showToast(`📍 ${displayFrom} → ${displayTo} | พบ ${distinctRouteSet.size} เส้นทาง (${uniqueCarriersSet.size} ผู้รับเหมา)`);

  setTimeout(() => {
    const tableEl = document.getElementById('table-container');
    if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

    document.querySelectorAll('.accordion-detail').forEach(content => {
      content.classList.add('expanded');
      content.style.maxHeight = content.scrollHeight + 'px';
    });
    document.querySelectorAll('[id^="icon-grp-"]').forEach(icon => {
      icon.style.transform = 'rotate(90deg)';
    });
    document.querySelectorAll('[id^="row-grp-"]').forEach(row => {
      row.classList.add('ring-2', 'ring-orange-500', 'bg-orange-50', 'dark:bg-orange-950/40');
      setTimeout(() => row.classList.remove('ring-2', 'ring-orange-500', 'bg-orange-50', 'dark:bg-orange-950/40'), 3000);
    });
  }, 200);
};

window.filterTableByOrigin = function(originName) {
  if (!originName) {
    applyDynamicFilters();
    return;
  }

  const tc = document.getElementById('table-container');
  const chevron = document.getElementById('table-chevron');
  if (tc && tc.classList.contains('table-hidden')) {
    state.isTableExpanded = true;
    tc.classList.remove('table-hidden');
    tc.classList.add('table-expanded');
    if (chevron && typeof lucide !== 'undefined') {
      chevron.setAttribute('data-lucide', 'chevron-down');
      lucide.createIcons({ root: chevron.parentElement });
    }
  }

  const cleanTargetOrigin = cleanAllSpaces(originName);
  const sourceData = (window.globalRouteSheetData && window.globalRouteSheetData.length > 0)
    ? window.globalRouteSheetData
    : [];

  const matchedRows = sourceData.filter(row => {
    const rowOrigin = row._parsed ? row._parsed.cleanOrigin : cleanAllSpaces(row['ต้นทาง'] || row.origin || '');
    return rowOrigin === cleanTargetOrigin || rowOrigin.includes(cleanTargetOrigin);
  });

  if (matchedRows.length === 0) {
    showToast(`⚠️ ไม่พบข้อมูลเส้นทางสำหรับต้นทาง: ${originName}`);
    return;
  }

  currentPage = 1;
  currentFilteredData = matchedRows;
  renderTable(matchedRows);
  showToast(`📍 กรองเฉพาะต้นทาง: ${originName} | พบ ${matchedRows.length.toLocaleString()} รายการ`);

  setTimeout(() => {
    const tableEl = document.getElementById('table-container');
    if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 150);
};

function renderPaginationControls(totalPages, totalItems) {
  const paginationEl = document.getElementById('table-pagination');
  if (!paginationEl) return;

  const startItem = (currentPage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(currentPage * PAGE_SIZE, totalItems);

  paginationEl.innerHTML = `
    <div class="flex items-center justify-between p-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 font-sans">
      <div>
        แสดง <strong class="text-slate-800 dark:text-slate-200">${startItem} - ${endItem}</strong> จาก <strong class="text-slate-800 dark:text-slate-200">${totalItems.toLocaleString()}</strong> รายการ
      </div>
      <div class="flex items-center gap-2">
        <button onclick="changePage(-1)" ${currentPage === 1 ? 'disabled' : ''} 
          class="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-slate-200 font-bold hover:bg-orange-500 hover:text-white disabled:opacity-30 transition-all cursor-pointer">
          &lt; ก่อนหน้า
        </button>
        <span class="font-Sarabun font-bold px-2 text-slate-700 dark:text-slate-300">หน้า ${currentPage} / ${totalPages}</span>
        <button onclick="changePage(1)" ${currentPage === totalPages ? 'disabled' : ''} 
          class="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-slate-200 font-bold hover:bg-orange-500 hover:text-white disabled:opacity-30 transition-all cursor-pointer">
          ถัดไป &gt;
        </button>
      </div>
    </div>
  `;
}

function changePage(step) {
  currentPage += step;
  renderTable(currentFilteredData);
}

window.toggleRouteDetail = function(routeId) {
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
};

// ==============================================================================
// 7. ZONE DRILLDOWN & DETAIL TABLE CONTROLLER (PROVINCE FILTER SYNCED & SORTED)
// ==============================================================================
function getExecFilteredRoutes() {
  let allRoutes = window.globalRouteSheetData || [];
  if (!allRoutes || allRoutes.length === 0) return [];
  if (!allRoutes[0]?._parsed) {
    allRoutes = precomputeRouteData(allRoutes);
    window.globalRouteSheetData = allRoutes;
  }

  const selectedProvinces = (typeof getMultiSelectValues === 'function') 
    ? getMultiSelectValues('exec-province') 
    : ['all'];

  const isAll = selectedProvinces.includes('all') || selectedProvinces.length === 0;
  if (isAll) return allRoutes;

  return allRoutes.filter(row => {
    const p = row._parsed ? row._parsed.cleanProv : cleanAllSpaces(row.province || row['จังหวัด'] || '');
    return selectedProvinces.some(sel => p === sel || p.includes(sel) || sel.includes(p));
  });
}

window.selectExecZoneCard = function(zoneName, cardEl) {
  document.querySelectorAll('#exec-region-summary-list > div').forEach(card => {
    card.classList.remove('ring-2', 'ring-orange-500', 'border-orange-500', 'shadow-md');
    card.classList.add('border-slate-200/90', 'dark:border-slate-800');
  });

  if (cardEl) {
    cardEl.classList.remove('border-slate-200/90', 'dark:border-slate-800');
    cardEl.classList.add('ring-2', 'ring-orange-500', 'border-orange-500', 'shadow-md');
  }

  showExecZoneDetailsTable(zoneName);
};

function showExecZoneDetailsTable(zoneName, customData = null) {
  const panel = document.getElementById('exec-zone-detail-panel');
  const titleEl = document.getElementById('exec-selected-zone-name');
  const badgeEl = document.getElementById('exec-selected-zone-badge');
  const tbody = document.getElementById('exec-zone-table-body');
  
  if (!panel || !tbody) return;

  tbody.innerHTML = '';

  const sourceData = customData || getExecFilteredRoutes();
  const cleanTargetZone = cleanAllSpaces(zoneName);

  const matchedRoutes = sourceData.filter(row => {
    const rowZone = row._parsed ? row._parsed.cleanZone : cleanAllSpaces(row.zone || row['Zone'] || '');
    return rowZone === cleanTargetZone || rowZone.includes(cleanTargetZone);
  });

  // 💡 Sort อย่างแม่นยำ ป้องกัน NaN และเรียงจาก % ว่างมากไปน้อย (100% -> 0%)
  matchedRoutes.sort((a, b) => {
    const getAvail = (row) => {
      if (row._parsed && typeof row._parsed.availPct === 'number' && !isNaN(row._parsed.availPct)) {
        return row._parsed.availPct;
      }
      const total = parseNum(row.pct_total || row['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'], 0);
      return Math.max(0, 100 - total);
    };

    const getTrips = (row) => {
      if (row._parsed && typeof row._parsed.trips === 'number' && !isNaN(row._parsed.trips)) {
        return row._parsed.trips;
      }
      return parseNum(row.avg_trip_week || row['AVG Trip/Week'], 0);
    };

    const availA = getAvail(a);
    const availB = getAvail(b);
    if (availB !== availA) return availB - availA;

    const tripsA = getTrips(a);
    const tripsB = getTrips(b);
    return tripsB - tripsA;
  });

  if (titleEl) titleEl.innerText = zoneName;
  if (badgeEl) badgeEl.innerText = `${matchedRoutes.length.toLocaleString()} Routes`;

  if (matchedRoutes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400 font-sans">ไม่พบข้อมูลเส้นทางในโซน ${escapeHtml(zoneName)} ตามจังหวัดที่เลือก</td></tr>`;
  } else {
    tbody.innerHTML = matchedRoutes.map(row => {
      const p = row._parsed;
      const origin = row.origin || row['ต้นทาง'] || '-';
      const customer = row.customer_name || row['ลูกค้า'] || '-';
      const shipToDesc = row.ship_to_desc || row['Description(Ship-To (Outbound))'] || row.province || row['จังหวัด'] || '-';
      const province = row.province || row['จังหวัด'] || '-';
      const product = row.product_category || row['ประเภทสินค้า'] || '-';
      const truck = row.truck_type || row['ประเภทรถ'] || '-';
      const fwdAgent = row.fwd_agent_desc || row['Description(FwdAgent)'] || 'ไม่ระบุ';
      
      const avgTrip = p ? p.trips : parseNum(row.avg_trip_week || row['AVG Trip/Week'], 0);
      const availPct = p ? p.availPct : Math.max(0, 100 - parseNum(row.pct_total || row['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'], 0));
      const color = getAvailColorScale(availPct);

      return `
        <tr class="hover:bg-slate-100/60 dark:hover:bg-zinc-900/60 transition-colors font-sans border-b border-slate-100 dark:border-slate-800/60 text-xs">
          <td class="p-2.5 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">${escapeHtml(origin)}</td>
          <td class="p-2.5 max-w-[220px]">
            <strong class="block text-slate-800 dark:text-slate-200 font-bold truncate" title="${escapeAttr(customer)}">${escapeHtml(customer)}</strong>
            <span class="text-[10px] text-slate-400 block leading-tight mt-0.5 truncate" title="${escapeAttr(shipToDesc)}">${escapeHtml(shipToDesc)}</span>
          </td>
          <td class="p-2.5 font-medium whitespace-nowrap text-slate-700 dark:text-slate-300">${escapeHtml(province)}</td>
          <td class="p-2.5 text-slate-500 whitespace-nowrap">${escapeHtml(product)}</td>
          <td class="p-2.5 text-slate-500 whitespace-nowrap">${escapeHtml(truck)}</td>
          <td class="p-2.5 font-semibold text-orange-600 dark:text-orange-400 whitespace-nowrap">${escapeHtml(fwdAgent)}</td>
          <td class="p-2.5 text-center font-Sarabun font-bold text-slate-700 dark:text-slate-300">${formatNum(avgTrip)}</td>
          <td class="p-2.5 text-right font-Sarabun font-bold ${color.text}">${Math.round(availPct)}%</td>
        </tr>
      `;
    }).join('');
  }

  panel.classList.remove('hidden');
  panel.style.display = 'block';

  setTimeout(() => {
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);

  if (typeof lucide !== 'undefined') lucide.createIcons({ root: panel });
}

window.showExecZoneDetailsTable = showExecZoneDetailsTable;

window.closeExecZoneDetailTable = function() {
  const panel = document.getElementById('exec-zone-detail-panel');
  if (panel) {
    panel.classList.add('hidden');
    panel.style.display = 'none';
  }

  document.querySelectorAll('#exec-region-summary-list > div').forEach(card => {
    card.classList.remove('ring-2', 'ring-orange-500', 'border-orange-500', 'shadow-md');
    card.classList.add('border-slate-200/90', 'dark:border-slate-800');
  });
};

window.drillDownExecZone = function(zoneName) {
  showExecZoneDetailsTable(zoneName);
};

// ==============================================================================
// 8. SIMULATION & ORDER MAPPING ENGINE
// ==============================================================================
async function analyzeNewOrderMapping() {
  const selectedOrigin = document.getElementById('select-origin')?.value.trim() || 'ทั้งหมด';
  const selectedProduct = document.getElementById('select-product-category')?.value.trim() || 'ทั้งหมด';
  const selectedProvince = document.getElementById('select-dest-province')?.value.trim() || 'ทั้งหมด';
  const selectedZone = document.getElementById('select-zone')?.value.trim() || 'ทั้งหมด';
  const selectedTruck = document.getElementById('select-truck-type')?.value.trim() || 'ทั้งหมด';
  const customerNameInput = document.getElementById('input-customer-name')?.value.trim() || 'ลูกค้าใหม่';

  let latInput = parseFloat(document.getElementById('input-lat')?.value);
  let lngInput = parseFloat(document.getElementById('input-lng')?.value);

  if ((isNaN(latInput) || isNaN(lngInput)) && window.provinceLocationMap && window.provinceLocationMap[selectedProvince]) {
    latInput = window.provinceLocationMap[selectedProvince].lat;
    lngInput = window.provinceLocationMap[selectedProvince].lng;
    const latEl = document.getElementById('input-lat');
    const lngEl = document.getElementById('input-lng');
    if (latEl) latEl.value = latInput;
    if (lngEl) lngEl.value = lngInput;
  }

  const inputState = document.getElementById('sim-input-state');
  const resultsState = document.getElementById('sim-results-state');
  if (inputState) inputState.classList.add('hidden');
  if (resultsState) resultsState.classList.remove('hidden');

  const summaryRouteEl = document.getElementById('summary-route-label');
  const summaryCustomerEl = document.getElementById('summary-customer-name');
  if (summaryRouteEl) summaryRouteEl.innerHTML = `${escapeHtml(selectedOrigin)} <i data-lucide="arrow-right" class="w-3 h-3 text-orange-500 inline"></i> ${escapeHtml(selectedProvince)}`;
  if (summaryCustomerEl) summaryCustomerEl.innerText = customerNameInput;

  const rankListEl = document.getElementById('subcon-rank-list');
  if (rankListEl) {
    rankListEl.innerHTML = `
      <div class="p-6 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2 font-sans">
        <span class="animate-spin w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full"></span>
        กำลังประมวลผลข้อมูลเส้นทาง...
      </div>
    `;
  }

  let routeData = window.globalRouteSheetData.length > 0 ? window.globalRouteSheetData : ((typeof fetchNewRouteSheet === 'function') ? await fetchNewRouteSheet() : []);
  if (!routeData || routeData.length === 0) {
    if (rankListEl) rankListEl.innerHTML = `<div class="p-4 text-center text-xs font-bold text-rose-500 font-sans">ไม่สามารถดึงข้อมูลได้</div>`;
    return;
  }

  const sOrigin = cleanAllSpaces(selectedOrigin);
  const sProduct = cleanAllSpaces(selectedProduct);
  const sProvince = cleanAllSpaces(selectedProvince);
  const sZone = cleanAllSpaces(selectedZone);
  const sTruck = cleanAllSpaces(selectedTruck);

  const matchedSubcons = routeData.filter(row => {
    const p = row._parsed;
    const fwdAgent = String(row.fwd_agent_desc || row['Description(FwdAgent)'] || '').trim();
    const pctTotal = p ? p.totalPct : parseNum(row.pct_total || row['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'], 0);
    if (!fwdAgent || pctTotal >= 100) return false;

    const rowOrigin = p ? p.cleanOrigin : cleanAllSpaces(row.origin || row['ต้นทาง'] || '');
    const rowProduct = p ? p.cleanProduct : cleanAllSpaces(row.product_category || row['ประเภทสินค้า'] || '');
    const rowProvince = p ? p.cleanProv : cleanAllSpaces(row.province || row['จังหวัด'] || '');
    const rowZone = p ? p.cleanZone : cleanAllSpaces(row.zone || row['Zone'] || '');
    const rowTruck = p ? p.cleanTruck : cleanAllSpaces(row.truck_type || row['ประเภทรถ'] || '');

    if (selectedOrigin !== 'ทั้งหมด' && rowOrigin && !rowOrigin.includes(sOrigin) && !sOrigin.includes(rowOrigin)) return false;
    if (selectedProduct !== 'ทั้งหมด' && rowProduct && !rowProduct.includes(sProduct) && !sProduct.includes(rowProduct)) return false;
    if (selectedProvince !== 'ทั้งหมด' && rowProvince && !rowProvince.includes(sProvince) && !sProvince.includes(rowProvince)) return false;
    if (selectedZone !== 'ทั้งหมด' && rowZone && !rowZone.includes(sZone) && !sZone.includes(rowZone)) return false;
    if (selectedTruck !== 'ทั้งหมด' && rowTruck && !rowTruck.includes(sTruck) && !sTruck.includes(rowTruck)) return false;

    return true;
  });

  matchedSubcons.sort((a, b) => {
    const totalA = a._parsed ? a._parsed.totalPct : parseNum(a.pct_total || a['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'], 0);
    const totalB = b._parsed ? b._parsed.totalPct : parseNum(b.pct_total || b['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'], 0);
    return totalA - totalB;
  });

  const allRankedSubcons = matchedSubcons.map(item => {
    const p = item._parsed;
    const totalPct = p ? p.totalPct : parseNum(item.pct_total || item['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'], 0);
    const availCapPct = p ? p.availPct : Math.max(0, 100 - totalPct);

    return {
      id: item.id || item['ID'] || '-',
      origin: item.origin || item['ต้นทาง'] || '-',
      customer: item.customer_name || item['ลูกค้า'] || '-',
      customerType: item.customer_type || item['ประเภทลูกค้า'] || '-',
      productCategory: item.product_category || item['ประเภทสินค้า'] || '-',
      province: item.province || item['จังหวัด'] || '-',
      zone: item.zone || item['Zone'] || '-',
      truckType: item.truck_type || item['ประเภทรถ'] || '-',
      fwdAgent: item.fwd_agent_desc || item['Description(FwdAgent)'] || 'ไม่ระบุผู้รับเหมา',
      shipToDesc: item.ship_to_desc || item['Description(Ship-To (Outbound))'] || '-',
      avgTripWeek: p ? p.trips : parseNum(item.avg_trip_week || item['AVG Trip/Week'], 0),
      avgOffPeak: parseNum(item.avg_off_peak || item['Avg Off Peak'], 0),
      avgPeak: parseNum(item.avg_peak || item['Avg Peak'], 0),
      pctBRFOutside: parseNum(item.pct_brf_outside || item['%รับงานต่อ สำหรับงานนอกของ BRF'], 0),
      brfOutsideRoute: item.brf_outside_route || item['ระบุต้นทาง และ ปลายทาง งานนอกของ BRF'] || '-',
      pctBoonrawd: parseNum(item.pct_boonrawd || item['%รับงานต่อสำหรับงานบุญรอด'], 0),
      pctOwn: parseNum(item.pct_own || item['%รับงานต่องานของผู้รับเหมาเอง'], 0),
      pctTotal: totalPct,
      availableCapacityPct: availCapPct
    };
  });

  renderSubconRankings(allRankedSubcons, matchedSubcons.length);

  if (typeof drawAllSheetRoutesOnSimMap === 'function') {
    const customerInfo = { name: customerNameInput, lat: latInput, lng: lngInput };
    const originInfo = window.originLocationMap ? window.originLocationMap[selectedOrigin] : null;
    drawAllSheetRoutesOnSimMap(matchedSubcons, selectedOrigin, selectedProvince, customerInfo, originInfo);
  }

  if (typeof lucide !== 'undefined') lucide.createIcons({ root: resultsState });
}

function renderSubconRankings(recommendations, totalMatches) {
  const rankListEl = document.getElementById('subcon-rank-list');
  const badgeEl = document.getElementById('match-count-badge');
  if (!rankListEl) return;

  if (!recommendations || recommendations.length === 0) {
    rankListEl.innerHTML = `
      <div class="p-6 text-center text-xs text-slate-400 border border-dashed rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-zinc-950/50 font-sans">
        ไม่พบผู้รับเหมาแนะนำที่ตรงตามเงื่อนไข หรือผู้รับเหมาโควตาเต็มแล้ว (100%)
      </div>
    `;
    if (badgeEl) badgeEl.innerText = 'พบ 0 เส้นทาง (0 ผู้รับเหมา)';
    return;
  }

  const uniqueCarriers = new Set(recommendations.map(r => r.fwdAgent).filter(c => c && c !== 'ไม่ระบุผู้รับเหมา'));
  if (badgeEl) badgeEl.innerText = `พบ ${totalMatches.toLocaleString()} เส้นทาง (${uniqueCarriers.size.toLocaleString()} ผู้รับเหมา)`;

  const rankBadges = [
    { rank: 1, label: 'อันดับ 1 (ว่างสูงสุด)', bg: 'bg-emerald-500 text-white', border: 'border-emerald-500/40' },
    { rank: 2, label: 'อันดับ 2', bg: 'bg-blue-500 text-white', border: 'border-blue-500/40' },
    { rank: 3, label: 'อันดับ 3', bg: 'bg-amber-500 text-white', border: 'border-amber-500/40' }
  ];

  rankListEl.innerHTML = recommendations.map((item, idx) => {
    const badge = rankBadges[idx] || { rank: idx + 1, label: `อันดับ ${idx + 1}`, bg: 'bg-slate-500 text-white dark:bg-slate-700', border: 'border-slate-200 dark:border-slate-800' };

    return `
      <div onclick="highlightSubconRoute('${escapeAttr(item.id)}', this)" 
           class="p-4 rounded-2xl bg-white dark:bg-zinc-950 border ${badge.border} shadow-sm hover:shadow-md cursor-pointer transition-all duration-200 space-y-3 hover:scale-[1.01] font-sans">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 overflow-hidden">
            <span class="px-2 py-0.5 text-[10px] font-extrabold rounded-md shrink-0 ${badge.bg}">${badge.label}</span>
            <h4 class="text-xs font-extrabold text-slate-800 dark:text-white truncate" title="${escapeAttr(item.fwdAgent)}">${escapeHtml(item.fwdAgent)}</h4>
          </div>
          <span class="text-xs font-Sarabun font-bold text-emerald-600 dark:text-emerald-400 shrink-0">ว่างรับงานอีก ${item.availableCapacityPct}%</span>
        </div>
        <div>
          <div class="w-full bg-slate-100 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden flex mb-1">
            <div class="bg-orange-500 h-full transition-all duration-300" style="width: ${item.pctTotal}%"></div>
            <div class="bg-emerald-500 h-full transition-all duration-300" style="width: ${item.availableCapacityPct}%"></div>
          </div>
          <div class="flex justify-between text-[9px] font-medium text-slate-500 dark:text-slate-400">
            <span>รวม % รับงานต่อทั้งหมด: <strong class="text-orange-500 font-bold">${item.pctTotal}%</strong></span>
            <span>ความจุคงเหลือ: <strong class="text-emerald-500 font-bold">${item.availableCapacityPct}%</strong></span>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2 text-[10px] p-2.5 bg-slate-50 dark:bg-zinc-900/80 rounded-xl border border-slate-100 dark:border-slate-800">
          <div><span class="text-slate-500">Row ID:</span> <strong class="text-slate-800 dark:text-slate-200">${escapeHtml(item.id)}</strong></div>
          <div><span class="text-slate-500">ต้นทาง (DC):</span> <strong class="text-slate-800 dark:text-slate-200">${escapeHtml(item.origin)}</strong></div>
          <div><span class="text-slate-500">จังหวัด:</span> <strong class="text-slate-800 dark:text-slate-200">${escapeHtml(item.province)}</strong></div>
          <div><span class="text-slate-500">Zone:</span> <strong class="text-slate-800 dark:text-slate-200">${escapeHtml(item.zone)}</strong></div>
          <div><span class="text-slate-500">ประเภทสินค้า:</span> <strong class="text-slate-800 dark:text-slate-200">${escapeHtml(item.productCategory)}</strong></div>
          <div><span class="text-slate-500">ประเภทรถ:</span> <strong class="text-slate-800 dark:text-slate-200">${escapeHtml(item.truckType)}</strong></div>
        </div>
      </div>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons({ root: rankListEl });
}

function highlightSubconRoute(subconId, cardEl) {
  document.querySelectorAll('#subcon-rank-list > div').forEach(card => {
    card.classList.remove('ring-2', 'ring-orange-500', 'border-orange-500', 'shadow-lg');
    card.classList.add('border-slate-200', 'dark:border-slate-800');
  });

  if (cardEl) {
    cardEl.classList.remove('border-slate-200', 'dark:border-slate-800');
    cardEl.classList.add('ring-2', 'ring-orange-500', 'border-orange-500', 'shadow-lg');
  }

  if (typeof highlightMapRouteById === 'function') {
    highlightMapRouteById(subconId);
  }
}

async function initNewOrderMappingDropdowns() {
  const routeData = window.globalRouteSheetData.length > 0 ? window.globalRouteSheetData : ((typeof fetchNewRouteSheet === 'function') ? await fetchNewRouteSheet() : []);
  if (!routeData || routeData.length === 0) return;

  const extractUnique = (data, columnName) => {
    const list = data.map(row => String(row[columnName] || '').trim()).filter(val => val !== '' && val !== 'undefined' && val !== 'null' && val !== '-');
    return [...new Set(list)].sort();
  };

  const updateDropdown = (elementId, optionsList, defaultLabel = 'ทั้งหมด') => {
    const selectEl = document.getElementById(elementId);
    if (!selectEl) return;
    let html = defaultLabel ? `<option value="ทั้งหมด">${defaultLabel}</option>` : '';
    html += optionsList.map(val => `<option value="${escapeAttr(val)}">${escapeHtml(val)}</option>`).join('');
    selectEl.innerHTML = html;
  };

  updateDropdown('select-origin', extractUnique(routeData, 'origin'));
  updateDropdown('select-product-category', extractUnique(routeData, 'product_category'));
  updateDropdown('select-dest-province', extractUnique(routeData, 'province'));
  updateDropdown('select-zone', extractUnique(routeData, 'zone'));
  updateDropdown('select-truck-type', extractUnique(routeData, 'truck_type'));
}

function backToSimInput() {
  const inputState = document.getElementById('sim-input-state');
  const resultsState = document.getElementById('sim-results-state');
  if (inputState) inputState.classList.remove('hidden');
  if (resultsState) resultsState.classList.add('hidden');
}

// ==============================================================================
// 9. CHARTS, VIEWS & UI CONTROLS
// ==============================================================================
function initCharts() {
  const commonOptions = {
    chart: { fontFamily: 'Sarabun, sans-serif', background: 'transparent', toolbar: { show: false } },
    theme: { mode: isDarkMode() ? 'dark' : 'light' }
  };

  const regionEl = document.querySelector("#chart-region");
  if (regionEl) {
    if (regionChart) regionChart.destroy();
    const regionOptions = {
      ...commonOptions,
      series: [{ name: 'Routes', data: [] }],
      chart: { type: 'bar', height: 230, parentHeightOffset: 0 },
      colors: ['#3b82f6'],
      plotOptions: { bar: { borderRadius: 5, horizontal: false, columnWidth: '45%' } },
      dataLabels: { enabled: false },
      xaxis: { categories: [], labels: { style: { fontSize: '10px', fontWeight: 600 } } },
      yaxis: { labels: { style: { fontSize: '10px', fontWeight: 600 } } },
      grid: { borderColor: isDarkMode() ? '#27272a' : '#f1f5f9', strokeDashArray: 3 }
    };
    regionChart = new ApexCharts(regionEl, regionOptions);
    regionChart.render();
  }
}

function toggleDarkMode() {
  state.isDark = !state.isDark;
  document.documentElement.classList.toggle('dark', state.isDark);

  const themeBtn = document.getElementById('btn-theme-toggle');
  if (themeBtn && typeof lucide !== 'undefined') {
    themeBtn.innerHTML = `<i data-lucide="${state.isDark ? 'sun' : 'moon'}" class="w-4.5 h-4.5 text-slate-500 dark:text-slate-400 hover:text-orange-500 transition-colors"></i>`;
    lucide.createIcons({ root: themeBtn });
  }

  if (regionChart) {
    regionChart.updateOptions({
      theme: { mode: state.isDark ? 'dark' : 'light' },
      grid: { borderColor: state.isDark ? '#334155' : '#e2e8f0' }
    });
  }

  if (typeof updateMapTiles === 'function') updateMapTiles();
  if (typeof applyDynamicFilters === 'function') applyDynamicFilters();
}

function updateView() {
  const execView = document.getElementById('view-exec');
  const dashView = document.getElementById('view-dashboard');
  const mapKeyView = document.getElementById('view-mapping');

  if (execView) execView.style.display = state.activeMenuId === 'exec' ? 'flex' : 'none';
  if (dashView) dashView.style.display = state.activeMenuId === 'dashboard' ? 'flex' : 'none';
  if (mapKeyView) mapKeyView.style.display = state.activeMenuId === 'none';

  const menuHeaders = {
    exec: { title: 'Executive Dashboard', subtitle: "Summarize route data for management's view" },
    dashboard: { title: 'Route Dashboard', subtitle: 'Existing routes and available backhaul data' },
    mapping: { title: 'New Order Mapping', subtitle: 'Simulate routes, match subcontractors & backhaul' }
  };

  const hTitle = document.getElementById('header-title');
  const hSubtitle = document.getElementById('header-subtitle');
  if (menuHeaders[state.activeMenuId]) {
    if (hTitle) hTitle.innerText = menuHeaders[state.activeMenuId].title;
    if (hSubtitle) hSubtitle.innerText = menuHeaders[state.activeMenuId].subtitle;
  }

  renderSidebarMenu();

  setTimeout(() => {
    if (state.activeMenuId === 'exec') updateExecutiveDashboard(window.globalRouteSheetData);
    if (state.activeMenuId === 'dashboard' && typeof dashMap !== 'undefined' && dashMap) {
      dashMap.invalidateSize();
      applyDynamicFilters();
    }
    if (state.activeMenuId === 'mapping') {
      if (typeof simMap !== 'undefined' && simMap) simMap.invalidateSize();
      initNewOrderMappingDropdowns();
    }
  }, 100);
}

function renderSidebarMenu() {
  const menus = [
    { id: 'exec', icon: 'pie-chart', nameKey: 'menu.exec' },
    { id: 'dashboard', icon: 'map', nameKey: 'menu.dashboard' }
  ];
  const container = document.getElementById('menu-container');
  if (!container) return;

  container.innerHTML = menus.map(m => `
    <button onclick="switchMenu('${m.id}')" title="${!state.isSidebarOpen && typeof dict !== 'undefined' ? dict[state.lang].menu[m.id] : ''}"
      class="w-full flex items-center ${state.isSidebarOpen ? 'px-3' : 'justify-center px-0'} h-11 gap-3 rounded-xl text-xs font-semibold transition-all duration-200 
      ${state.activeMenuId === m.id ? 'bg-orange-500/10 text-orange-500 shadow-inner' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-800 dark:hover:bg-zinc-800/50 dark:hover:text-slate-200'}">
      <i data-lucide="${m.icon}" class="w-4.5 h-4.5 shrink-0 ${state.activeMenuId === m.id ? 'text-orange-500' : 'text-slate-400'}"></i>
      ${state.isSidebarOpen && typeof dict !== 'undefined' ? `<span class="whitespace-nowrap">${dict[state.lang].menu[m.id]}</span>` : ''}
    </button>
  `).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: container });
}

function switchMenu(id) {
  state.activeMenuId = id;
  updateView();
}

function renderChat() {
  const msgContainer = document.getElementById('chat-messages');
  if (!msgContainer) return;
  msgContainer.innerHTML = state.chatMessages.map(m => `
    <div class="p-3 rounded-xl max-w-[85%] ${m.role === 'user' ? 'bg-orange-500 text-white rounded-tr-none ml-auto' : 'bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-white rounded-tl-none'} font-sans">
      ${escapeHtml(m.text)}
    </div>
  `).join('');
  msgContainer.scrollTop = msgContainer.scrollHeight;
}

// ==============================================================================
// 10. EXPORT & EVENT LISTENERS
// ==============================================================================
window.exportFilteredDataToCSV = function() {
  const dataToExport = (currentFilteredData && currentFilteredData.length > 0) ? currentFilteredData : window.globalRouteSheetData;
  if (!dataToExport || dataToExport.length === 0) {
    showToast('No data available to export');
    return;
  }

  const headers = [
    'Route ID', 'Origin DC', 'Destination Province', 'Zone', 'Customer Name', 'Customer Type',
    'Ship-To Description', 'Product Category', 'Truck Type', 'Carrier Name', 'AVG Trips/Week',
    'Avg Off Peak', 'Avg Peak', '% Boonrawd Task', '% Own Task', '% BRF-External Task',
    'BRF-External Route', 'Total Allocated Workload (%)', 'Available Capacity (%)', 'Available Trips/Week'
  ];

  let csvContent = '\uFEFF' + headers.join(',') + '\n';
  dataToExport.forEach(row => {
    const p = row._parsed;
    const avgTrip = p ? p.trips : parseNum(row.avg_trip_week || row['AVG Trip/Week'], 0);
    const totalPct = p ? p.totalPct : parseNum(row.pct_total || row['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'], 0);
    const availPct = Math.max(0, 100 - totalPct);
    const availTrips = (avgTrip * (availPct / 100)).toFixed(2);

    const values = [
      row.id || row['ID'] || '',
      row.origin || row['ต้นทาง'] || '',
      row.province || row['จังหวัด'] || '',
      row.zone || row['Zone'] || '',
      row.customer_name || row['ลูกค้า'] || '',
      row.customer_type || row['ประเภทลูกค้า'] || '',
      row.ship_to_desc || row['Description(Ship-To (Outbound))'] || '',
      row.product_category || row['ประเภทสินค้า'] || '',
      row.truck_type || row['ประเภทรถ'] || '',
      row.fwd_agent_desc || row['Description(FwdAgent)'] || '',
      avgTrip,
      parseNum(row.avg_off_peak || row['Avg Off Peak'], 0),
      parseNum(row.avg_peak || row['Avg Peak'], 0),
      `${parseNum(row.pct_boonrawd || row['%รับงานต่อสำหรับงานบุญรอด'], 0)}%`,
      `${parseNum(row.pct_own || row['%รับงานต่องานของผู้รับเหมาเอง'], 0)}%`,
      `${parseNum(row.pct_brf_outside || row['%รับงานต่อ สำหรับงานนอกของ BRF'], 0)}%`,
      row.brf_outside_route || row['ระบุต้นทาง และ ปลายทาง งานนอกของ BRF'] || '-',
      `${totalPct}%`,
      `${availPct}%`,
      availTrips
    ].map(val => `"${String(val ?? '').replace(/"/g, '""')}"`);

    csvContent += values.join(',') + '\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Route_Backhaul_Analytics_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast(`Exported ${dataToExport.length.toLocaleString()} routes successfully`);
};

// ==============================================================================
// LOGIN BUTTON STATE HELPER (INLINE SVG - OFFLINE READY)
// ==============================================================================
const MS_ICON_SVG = `
  <svg class="w-5 h-5 shrink-0 group-hover:scale-110 transition-transform" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="10" height="10" fill="#F25022"/>
    <rect x="11" y="0" width="10" height="10" fill="#7FBA00"/>
    <rect x="0" y="11" width="10" height="10" fill="#00A4EF"/>
    <rect x="11" y="11" width="10" height="10" fill="#FFB900"/>
  </svg>
`;

/**
 * ฟังก์ชันควบคุมสถานะและการเรนเดอร์ไอคอนของปุ่ม Login จากศูนย์กลาง
 * @param {'idle' | 'loading'} state - สถานะของปุ่ม
 */
function setLoginButtonState(state = 'idle') {
  const btn = document.getElementById('btn-login-ms');
  if (!btn) return;

  if (state === 'loading') {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 shrink-0 animate-spin text-orange-500"></i> <span>Authenticating...</span>`;
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: btn });
  } else {
    btn.disabled = false;
    btn.innerHTML = `
      ${MS_ICON_SVG}
      <span id="btn-login-ms-text">Sign in with Microsoft</span>
    `;
  }
}

// ==============================================================================
// 10. EVENT LISTENERS CONTROLLER (CLEAN & REFACTORED)
// ==============================================================================
function setupEventListeners() {
  // 1. เรนเดอร์ปุ่ม Login เริ่มต้นพร้อมไอคอน Microsoft อัตโนมัติ
  setLoginButtonState('idle');

  // 2. จัดการ Event การล็อกอิน
  document.getElementById('btn-login-ms')?.addEventListener('click', async () => {
    const loginScreen = document.getElementById('login-screen');
    const app = document.getElementById('main-app');

    setLoginButtonState('loading');

    if (loginScreen) {
      loginScreen.classList.add('opacity-0', 'pointer-events-none');
      setTimeout(() => loginScreen.classList.add('hidden'), 500);
    }
    if (app) {
      app.classList.remove('hidden');
      setTimeout(() => app.classList.remove('opacity-0', 'pointer-events-none'), 50);
    }
    await initAppAfterLogin();
  });

  // 3. จัดการ Event การออกจากระบบ (คืนค่าปุ่ม Login พร้อมไอคอนกลับมา)
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    const app = document.getElementById('main-app');
    const loginScreen = document.getElementById('login-screen');

    if (app) app.classList.add('hidden', 'opacity-0', 'pointer-events-none');
    if (loginScreen) loginScreen.classList.remove('hidden', 'opacity-0', 'pointer-events-none');

    setLoginButtonState('idle');
    showToast('You have successfully logged out.');
  });

  // 4. ตัวกรองค้นหาข้อความ (Debounce 300ms)
  const searchInput = document.querySelector('#filters-content input[type="text"]');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => applyDynamicFilters(), 300);
    });
  }

  // 5. ตัวกรองตัวเลข (Debounce 250ms แยกอิสระ)
  const numericFilterIds = ['filter-backhaul-min', 'filter-backhaul-max', 'filter-min-avail-trips'];
  numericFilterIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.removeAttribute('oninput');
      el.addEventListener('input', () => {
        clearTimeout(numericDebounceTimer);
        numericDebounceTimer = setTimeout(() => applyDynamicFilters(), 250);
      });
    }
  });

  // 6. สลับโหมดการแสดงผล Segmented Control
  document.querySelectorAll('#display-mode-segmented .mode-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const selectedBtn = e.currentTarget;
      state.activeFilters.displayMode = selectedBtn.getAttribute('data-mode');

      document.querySelectorAll('#display-mode-segmented .mode-btn').forEach(b => {
        b.className = 'mode-btn flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-zinc-700/50';
      });
      selectedBtn.className = 'mode-btn flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 bg-[#f97316] text-white shadow-sm';
      applyDynamicFilters();
    });
  });

  // 7. พับ/กางแถบ Sidebar
  document.getElementById('toggle-sidebar')?.addEventListener('click', () => {
    state.isSidebarOpen = !state.isSidebarOpen;
    const sb = document.getElementById('sidebar');
    if (sb) sb.className = `${state.isSidebarOpen ? 'w-64' : 'w-20'} relative z-50 border-r flex flex-col shrink-0 transition-[width] duration-300 ease-in-out bg-white dark:bg-zinc-900 border-slate-200 dark:border-slate-800`;

    const brand = document.getElementById('sidebar-brand');
    if (brand) brand.style.display = state.isSidebarOpen ? 'flex' : 'none';

    const user = document.getElementById('sidebar-user');
    if (user) user.classList.toggle('justify-center', !state.isSidebarOpen);

    const userInfo = document.querySelector('.user-info-wrapper');
    if (userInfo) userInfo.style.display = state.isSidebarOpen ? 'flex' : 'none';

    const toggleBtn = document.getElementById('toggle-sidebar');
    if (toggleBtn && typeof lucide !== 'undefined') {
      toggleBtn.innerHTML = `<i data-lucide="${state.isSidebarOpen ? 'chevron-left' : 'menu'}" class="w-4 h-4"></i>`;
      lucide.createIcons({ root: toggleBtn });
    }

    renderSidebarMenu();
    setTimeout(() => {
      if (typeof execMap !== 'undefined' && execMap) execMap.invalidateSize();
      if (typeof dashMap !== 'undefined' && dashMap) dashMap.invalidateSize();
      if (typeof simMap !== 'undefined' && simMap) simMap.invalidateSize();
    }, 310);
  });

  // 8. พับ/กางตารางข้อมูลด้านล่าง
  document.getElementById('toggle-table')?.addEventListener('click', () => {
    state.isTableExpanded = !state.isTableExpanded;
    const tc = document.getElementById('table-container');
    if (tc) {
      tc.classList.toggle('table-hidden', !state.isTableExpanded);
      tc.classList.toggle('table-expanded', state.isTableExpanded);
    }
    const chevron = document.getElementById('table-chevron');
    if (chevron && typeof lucide !== 'undefined') {
      chevron.setAttribute('data-lucide', state.isTableExpanded ? 'chevron-down' : 'chevron-up');
      lucide.createIcons({ root: chevron.parentElement });
    }
    if (typeof dashMap !== 'undefined' && dashMap) setTimeout(() => dashMap.invalidateSize(), 300);
  });

  // 9. พับ/กางแถบตัวกรองหลัก (Main Filter)
  document.getElementById('toggle-filters-main')?.addEventListener('click', () => {
    const content = document.getElementById('filters-content');
    const chevron = document.getElementById('filters-main-chevron');
    if (content) {
      content.classList.toggle('hidden');
      if (chevron && typeof lucide !== 'undefined') {
        chevron.setAttribute('data-lucide', content.classList.contains('hidden') ? 'chevron-down' : 'chevron-up');
        lucide.createIcons({ root: chevron.parentElement });
      }
    }
  });

  // 10. Accordion ของกลุ่มตัวกรองย่อย
  document.querySelectorAll('.filter-accordion-toggle').forEach(toggleBtn => {
    toggleBtn.addEventListener('click', () => {
      const targetEl = document.getElementById(toggleBtn.getAttribute('data-target'));
      const chevron = toggleBtn.querySelector('.accordion-chevron');
      if (targetEl) {
        targetEl.classList.toggle('hidden');
        if (chevron && typeof lucide !== 'undefined') {
          chevron.setAttribute('data-lucide', targetEl.classList.contains('hidden') ? 'chevron-down' : 'chevron-up');
          lucide.createIcons({ root: toggleBtn });
        }
      }
    });
  });

  // 11. ปิด Custom Dropdown เมื่อคลิกพื้นที่อื่นภายนอก
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.custom-select-container')) {
      document.querySelectorAll('.custom-select-dropdown').forEach(el => el.classList.add('hidden'));
    }
  });

  // 12. ปุ่มสลับ Dark / Light Theme
  document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleDarkMode);
}

window.addEventListener('DOMContentLoaded', () => {
  if (typeof lucide !== 'undefined') lucide.createIcons();
  setupEventListeners();
});