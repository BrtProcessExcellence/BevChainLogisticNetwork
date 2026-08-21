// ==============================================================================
// 1. GLOBAL STATE & SINGLE SOURCE OF TRUTH
// ==============================================================================

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

const WORKING_DAYS_PER_WEEK = 6;
const pageSize = 50;

let currentFilteredData = [];
let currentPage = 1;
let currentSort = { column: null, direction: 'asc' };
let regionChart = null;
let shipToLocationMap = {};
let searchDebounceTimer = null;

// Global Window Caches
window.execCarrierListCache = [];
window.execAllRoutesCache = [];
window.currentGroupKeys = [];
window.currentGroupMap = {};

// ==============================================================================
// 2. UNIFIED HELPERS & KEY NORMALIZERS
// ==============================================================================
const parseNum = (val) => parseFloat(String(val || 0).replace(/[,%]/g, '').trim()) || 0;
const formatNum = (val, dec = 2) => Number(val || 0).toLocaleString('th-TH', { minimumFractionDigits: dec, maximumFractionDigits: dec });

function cleanAllSpaces(val) {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\s+/g, '').trim().toLowerCase();
}

// 💡 8-Dimensional Key สำหรับตารางด้านล่าง (แยกตามสัญญาและประเภทรถ)
function getDistinctKey(row) {
  if (!row) return '';
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

// 💡 2-Dimensional Map Key มาตรฐานเดียวกับ map.js (Origin + Destination)
function getMapRouteKey(row) {
  if (!row) return '';
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

// ==============================================================================
// 3. APPLICATION LIFECYCLE & DATA BOOTSTRAP
// ==============================================================================
async function initAppAfterLogin() {
  try {
    if (typeof renderSidebarMenu === 'function') renderSidebarMenu();
    if (typeof initMaps === 'function') initMaps();
    if (typeof initCharts === 'function') initCharts();
    if (typeof renderChat === 'function') renderChat();
    if (typeof updateView === 'function') updateView();
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

    window.globalRouteSheetData = Array.isArray(routeData) ? routeData : [];
    globalRouteSheetData = window.globalRouteSheetData;

    if (Array.isArray(shipToData) && shipToData.length > 0) {
      if (typeof initShippingLocationLookup === 'function') initShippingLocationLookup(shipToData);
      shipToData.forEach(item => {
        const desc = String(item['Description(Ship-To (Outbound))'] || item.ship_to_desc || '').trim();
        const rawLatLng = item['LAT,LONG'] || item.lat_long || '';
        const coords = (typeof parseLatLng === 'function') ? parseLatLng(rawLatLng) : null;
        const lat = coords ? coords.lat : parseFloat(item.lat);
        const lng = coords ? coords.lng : parseFloat(item.lng);

        if (desc && !isNaN(lat) && !isNaN(lng)) {
          shipToLocationMap[desc] = { lat, lng };
          shipToLocationMap[desc.toLowerCase()] = { lat, lng };
        }
      });
    }

    if (typeof populateDashboardFilters === 'function') populateDashboardFilters(globalRouteSheetData);
    if (typeof applyDynamicFilters === 'function') await applyDynamicFilters();
    if (typeof updateExecutiveDashboard === 'function') await updateExecutiveDashboard(globalRouteSheetData);

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
      window.globalRouteSheetData = routeData;
      globalRouteSheetData = window.globalRouteSheetData;
      await applyDynamicFilters();
      if (state.activeMenuId === 'exec') updateExecutiveDashboard(globalRouteSheetData);
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
  let routeData = (filteredData && filteredData.length > 0)
    ? filteredData
    : (globalRouteSheetData && globalRouteSheetData.length > 0
        ? globalRouteSheetData
        : (typeof fetchNewRouteSheet === 'function' ? await fetchNewRouteSheet() : []));

  window.globalRouteSheetData = Array.isArray(routeData) ? routeData : [];
  globalRouteSheetData = window.globalRouteSheetData;

  updateExecNewOrderMappingSection();
  updateExecAdvancedAnalytics(globalRouteSheetData);

  setTimeout(() => {
    if (typeof execMap !== 'undefined' && execMap) execMap.invalidateSize();
  }, 300);
}

function updateExecAdvancedAnalytics(routeData) {
  if (!routeData || routeData.length === 0) return;

  const carrierTotalCount = routeData.length;
  let carrierUnavailableCount = 0;
  let carrierAvailableCount = 0;
  let totalTripsSum = 0;
  let unavailTripsSum = 0;
  let availTripsSum = 0;

  const distinctRouteMap = {};
  const zoneSummaryMap = {};
  const truckAvailMap = {};
  const carrierAvailMap = {};
  const allRoutesList = [];

  routeData.forEach(row => {
    const origin = String(row['ต้นทาง'] || row.origin || '-').trim();
    const province = String(row['จังหวัด'] || row.province || '-').trim();
    let shipTo = String(row['Description(Ship-To (Outbound))'] || row.ship_to_desc || '').trim();
    if (!shipTo || shipTo === '-') shipTo = province;
    const zone = String(row['Zone'] || row.zone || '-').trim();
    const truck = String(row['ประเภทรถ'] || row.truck_type || '-').trim();
    const rawFwdAgent = String(row['Description(FwdAgent)'] || row.fwd_agent_desc || row['ผู้รับเหมา'] || '').trim();

    const trips = parseNum(row['AVG Trip/Week'] || row.avg_trip_week || row.avg_trips);
    totalTripsSum += trips;

    const pctTotal = parseNum(row['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'] || row.pct_total);
    const availPct = Math.max(0, 100 - pctTotal);
    const rowActualAvailTrips = trips * (availPct / 100);

    if (availPct === 0) {
      carrierUnavailableCount++;
      unavailTripsSum += trips;
    } else {
      carrierAvailableCount++;
      availTripsSum += rowActualAvailTrips;
    }

    const distinctKey = getDistinctKey(row);
    if (!distinctRouteMap[distinctKey]) {
      distinctRouteMap[distinctKey] = { hasAvailable: false, totalTrips: 0, availTrips: 0 };
    }
    distinctRouteMap[distinctKey].totalTrips += trips;
    distinctRouteMap[distinctKey].availTrips += rowActualAvailTrips;
    if (availPct > 0) distinctRouteMap[distinctKey].hasAvailable = true;

    if (zone && zone !== '-') {
      if (!zoneSummaryMap[zone]) zoneSummaryMap[zone] = { totalRoutes: 0, availRoutes: 0, totalTrips: 0, availTrips: 0 };
      zoneSummaryMap[zone].totalRoutes++;
      zoneSummaryMap[zone].totalTrips += trips;
      if (availPct > 0) {
        zoneSummaryMap[zone].availRoutes++;
        zoneSummaryMap[zone].availTrips += rowActualAvailTrips;
      }
    }

    if (truck && truck !== '-' && truck !== 'undefined') {
      if (!truckAvailMap[truck]) truckAvailMap[truck] = { totalRoutes: 0, availRoutes: 0, sumAvailPct: 0, totalTrips: 0, availTrips: 0 };
      truckAvailMap[truck].totalRoutes++;
      truckAvailMap[truck].totalTrips += trips;
      truckAvailMap[truck].sumAvailPct += availPct;
      if (availPct > 0) {
        truckAvailMap[truck].availRoutes++;
        truckAvailMap[truck].availTrips += rowActualAvailTrips;
      }
    }

    if (rawFwdAgent && rawFwdAgent !== '-' && rawFwdAgent !== 'ไม่ระบุ') {
      rawFwdAgent.split(/[,/|\n]+/).forEach(agent => {
        const clean = agent.trim();
        if (clean && clean !== '-' && clean !== 'ไม่ระบุ') {
          if (!carrierAvailMap[clean]) carrierAvailMap[clean] = { sumAvail: 0, count: 0, trips: 0, availTrips: 0 };
          carrierAvailMap[clean].sumAvail += availPct;
          carrierAvailMap[clean].count += 1;
          carrierAvailMap[clean].trips += trips;
          carrierAvailMap[clean].availTrips += rowActualAvailTrips;
        }
      });
    }

    allRoutesList.push({
      routeStr: `${origin} &rarr; ${shipTo}`,
      zone,
      carrier: rawFwdAgent || '-',
      trips,
      availPct,
      availTrips: rowActualAvailTrips
    });
  });

  const distinctTotalCount = Object.keys(distinctRouteMap).length;
  const distinctAvailableCount = Object.values(distinctRouteMap).filter(r => r.hasAvailable).length;
  const distinctAvailPct = distinctTotalCount > 0 ? ((distinctAvailableCount / distinctTotalCount) * 100).toFixed(1) : '0.0';

  const distinctTotalTripsWk = Object.values(distinctRouteMap).reduce((sum, r) => sum + r.totalTrips, 0);
  const distinctAvailTripsWk = Object.values(distinctRouteMap).reduce((sum, r) => sum + (r.hasAvailable ? r.availTrips : 0), 0);

  const distinctTotalTripsDay = distinctTotalTripsWk / WORKING_DAYS_PER_WEEK;
  const distinctAvailTripsDay = distinctAvailTripsWk / WORKING_DAYS_PER_WEEK;

  const carrierTotalTripsDay = totalTripsSum / WORKING_DAYS_PER_WEEK;
  const carrierUnavailTripsDay = unavailTripsSum / WORKING_DAYS_PER_WEEK;
  const carrierAvailTripsDay = availTripsSum / WORKING_DAYS_PER_WEEK;

  const carrierUnavailPct = carrierTotalCount > 0 ? ((carrierUnavailableCount / carrierTotalCount) * 100).toFixed(1) : '0.0';
  const carrierAvailPct = carrierTotalCount > 0 ? ((carrierAvailableCount / carrierTotalCount) * 100).toFixed(1) : '0.0';

  // Render Top KPI Elements
  const elDistinctTotal = document.getElementById('kpi-distinct-total');
  const elDistinctAvailCount = document.getElementById('kpi-distinct-avail-count');
  const elDistinctAvailPct = document.getElementById('kpi-distinct-avail-pct');
  const elDistinctTotalTrips = document.getElementById('kpi-distinct-total-trips');
  const elDistinctAvailTrips = document.getElementById('kpi-distinct-avail-trips');

  if (elDistinctTotal) elDistinctTotal.innerText = distinctTotalCount.toLocaleString();
  if (elDistinctAvailCount) elDistinctAvailCount.innerText = distinctAvailableCount.toLocaleString();
  if (elDistinctAvailPct) elDistinctAvailPct.innerText = `(${distinctAvailPct}%)`;

  if (elDistinctTotalTrips) {
    elDistinctTotalTrips.innerHTML = `
      <div><strong class="text-slate-700 dark:text-slate-200">${Math.round(distinctTotalTripsWk).toLocaleString()}</strong> trips/wk</div>
      <div class="text-[9px] text-slate-400 font-normal">(~${distinctTotalTripsDay.toFixed(1)} /day • 6 days)</div>
    `;
  }
  if (elDistinctAvailTrips) {
    elDistinctAvailTrips.innerHTML = `
      <div><strong class="text-emerald-700 dark:text-emerald-300">${Math.round(distinctAvailTripsWk).toLocaleString()}</strong> trips/wk</div>
      <div class="text-[9px] text-emerald-500 font-normal">(~${distinctAvailTripsDay.toFixed(1)} /day • 6 days)</div>
    `;
  }

  const elCarrierTotal = document.getElementById('kpi-carrier-total');
  const elCarrierUnavail = document.getElementById('kpi-carrier-unavail');
  const elCarrierUnavailPct = document.getElementById('kpi-carrier-unavail-pct');
  const elCarrierAvail = document.getElementById('kpi-carrier-avail');
  const elCarrierAvailPct = document.getElementById('kpi-carrier-avail-pct');
  const elCarrierTotalTrips = document.getElementById('kpi-carrier-total-trips');
  const elCarrierUnavailTrips = document.getElementById('kpi-carrier-unavail-trips');
  const elCarrierAvailTrips = document.getElementById('kpi-carrier-avail-trips');

  if (elCarrierTotal) elCarrierTotal.innerText = carrierTotalCount.toLocaleString();
  if (elCarrierUnavail) elCarrierUnavail.innerText = carrierUnavailableCount.toLocaleString();
  if (elCarrierUnavailPct) elCarrierUnavailPct.innerText = `(${carrierUnavailPct}%)`;
  if (elCarrierAvail) elCarrierAvail.innerText = carrierAvailableCount.toLocaleString();
  if (elCarrierAvailPct) elCarrierAvailPct.innerText = `(${carrierAvailPct}%)`;

  if (elCarrierTotalTrips) {
    elCarrierTotalTrips.innerHTML = `
      <div><strong class="text-slate-700 dark:text-slate-200">${Math.round(totalTripsSum).toLocaleString()}</strong> trips/wk</div>
      <div class="text-[9px] text-slate-400 font-normal">(~${carrierTotalTripsDay.toFixed(1)} /day)</div>
    `;
  }
  if (elCarrierUnavailTrips) {
    elCarrierUnavailTrips.innerHTML = `
      <div><strong class="text-rose-700 dark:text-rose-300">${Math.round(unavailTripsSum).toLocaleString()}</strong> trips/wk</div>
      <div class="text-[9px] text-rose-500 font-normal">(~${carrierUnavailTripsDay.toFixed(1)} /day)</div>
    `;
  }
  if (elCarrierAvailTrips) {
    elCarrierAvailTrips.innerHTML = `
      <div><strong class="text-emerald-700 dark:text-emerald-300">${Math.round(availTripsSum).toLocaleString()}</strong> trips/wk</div>
      <div class="text-[9px] text-emerald-500 font-normal">(~${carrierAvailTripsDay.toFixed(1)} /day)</div>
    `;
  }

  // Zone Summary List
  const regionListEl = document.getElementById('exec-region-summary-list');
  if (regionListEl) {
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
      <div onclick="drillDownExecZone('${item.zoneName}')" class="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-slate-800 hover:border-orange-500 cursor-pointer transition-all flex items-center justify-between font-sans">
        <div>
          <h5 class="text-xs font-extrabold text-slate-800 dark:text-white">${item.zoneName}</h5>
          <p class="text-[10px] text-slate-400">
            ${item.totalRoutes.toLocaleString()} routes (${Math.round(item.totalTrips).toLocaleString()} /wk • ~${(item.totalTrips / WORKING_DAYS_PER_WEEK).toFixed(1)} trips/day)
          </p>
        </div>
        <div class="text-right">
          <div class="text-xs font-black text-emerald-600 dark:text-emerald-400">
             ${item.availRoutes.toLocaleString()} routes <span class="text-[10px]">(${item.zoneAvailPct.toFixed(2)}%)</span>
          </div>
          <p class="text-[9px] text-slate-400">~${Math.round(item.availTrips).toLocaleString()} /wk (~${(item.availTrips / WORKING_DAYS_PER_WEEK).toFixed(1)} trips/day)</p>
        </div>
      </div>
    `).join('');
  }

  // Truck Type Summary
  const truckListEl = document.getElementById('exec-truck-avail-list');
  if (truckListEl) {
    const sortedTrucks = Object.entries(truckAvailMap).map(([type, stat]) => ({
      type,
      totalRoutes: stat.totalRoutes,
      availRoutes: stat.availRoutes,
      totalTrips: stat.totalTrips,
      availTrips: stat.availTrips,
      availRatio: stat.totalRoutes > 0 ? (stat.availRoutes / stat.totalRoutes) * 100 : 0
    })).sort((a, b) => b.availRoutes - a.availRoutes);

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
                <h5 class="text-xs font-black text-slate-800 dark:text-white truncate" title="${item.type}">${item.type}</h5>
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
                ${Math.round(item.availTrips).toLocaleString()} <span class="text-[9px] text-slate-400 font-normal">/wk</span>
                <span class="block text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold">(~${(item.availTrips / WORKING_DAYS_PER_WEEK).toFixed(1)} trips/day)</span>
              </strong>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Carrier Capacity List
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
              <span class="font-extrabold text-xs text-slate-800 dark:text-slate-100 block truncate" title="${item.name}">${item.name}</span>
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
    if (typeof lucide !== 'undefined') lucide.createIcons();
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
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateExecNewOrderMappingSection() {
  const container = document.getElementById('exec-region-summary-list');
  if (!container || !globalRouteSheetData || globalRouteSheetData.length === 0) return;

  const zoneStats = {};
  globalRouteSheetData.forEach(row => {
    const zoneName = String(row['Zone'] || row.zone || '').trim();
    if (zoneName && zoneName !== 'undefined' && zoneName !== 'null' && zoneName !== '-') {
      const pctTotal = parseNum(row['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'] || row.pct_total);
      const availPct = Math.max(0, 100 - pctTotal);
      if (!zoneStats[zoneName]) zoneStats[zoneName] = { count: 0, sumAvail: 0 };
      zoneStats[zoneName].count += 1;
      zoneStats[zoneName].sumAvail += availPct;
    }
  });

  const sortedZones = Object.entries(zoneStats).map(([name, stat]) => ({
    name,
    count: stat.count,
    avgAvail: Math.round(stat.sumAvail / stat.count)
  })).sort((a, b) => b.avgAvail - a.avgAvail);

  if (sortedZones.length === 0) {
    container.innerHTML = `<div class="p-4 text-center text-xs text-slate-400 font-sans">ไม่พบข้อมูล Zone</div>`;
    return;
  }

  container.innerHTML = sortedZones.map(zone => {
    const color = getAvailColorScale(zone.avgAvail);
    return `
      <div onclick="selectExecZoneCard('${zone.name}', this)" 
           class="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-slate-800/80 flex items-center justify-between shadow-sm hover:border-orange-500 cursor-pointer transition-all duration-200 hover:scale-[1.01] font-sans">
        <div class="space-y-0.5">
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">ZONE: ${zone.name}</span>
          <h4 class="text-xs font-black text-slate-800 dark:text-white flex items-center gap-1.5">
            ${zone.count.toLocaleString()} <span class="text-[10px] font-normal text-slate-500">Routes</span>
          </h4>
        </div>
        <div class="text-right">
          <span class="text-xs font-Sarabun font-extrabold ${color.text} block">${zone.avgAvail}%</span>
          <div class="w-16 bg-slate-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-1">
            <div class="${color.bg} h-full transition-all duration-300" style="width: ${Math.min(zone.avgAvail, 100)}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (typeof renderExecRouteHeatmap === 'function') renderExecRouteHeatmap(globalRouteSheetData);
}

// ==============================================================================
// 5. ROUTE DASHBOARD: FILTERS, TABLE & BIDIRECTIONAL SYNC
// ==============================================================================
function getMultiSelectValues(filterId) {
  const checkboxes = document.querySelectorAll(`.checkbox-${filterId}`);
  if (!checkboxes || checkboxes.length === 0) return ['all'];
  const selected = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value.toLowerCase());
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
      const isChecked = !isAllSelected && currentSelected.includes(opt.toLowerCase());
      return `
        <label class="dropdown-item flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-zinc-800/50 rounded-lg cursor-pointer transition-colors group">
          <input type="checkbox" value="${opt}" class="checkbox-${filterId} w-3.5 h-3.5 rounded border-slate-300 accent-[#f97316] focus:ring-[#f97316] transition-all cursor-pointer" ${isChecked ? 'checked' : ''} onchange="handleCheckboxChange('${filterId}', '${opt}')">
          <span class="text-xs text-slate-700 dark:text-slate-300 group-hover:text-orange-600 dark:group-hover:text-orange-400 truncate">${opt}</span>
        </label>
      `;
    }).join('');

    html += `</div>`;
    container.innerHTML = html;
    updateFilterLabel(filterId, defaultLabel);
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: container });
  };

  updateSelectOptions('filter-carrier', getUniqueValues('fwd_agent_desc', 'Description(FwdAgent)'), 'All Carriers');
  updateSelectOptions('filter-truck-type', getUniqueValues('truck_type', 'ประเภทรถ'), 'All Truck Types');
  updateSelectOptions('filter-origin-province', getUniqueValues('origin', 'ต้นทาง'), 'All Origin DCs');
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

  updateFilterLabel(filterId);
  applyDynamicFilters();
};

window.toggleCustomDropdown = function(dropdownId) {
  document.querySelectorAll('.custom-select-dropdown').forEach(el => {
    if (el.id !== dropdownId) el.classList.add('hidden');
  });
  const el = document.getElementById(dropdownId);
  if (el) el.classList.toggle('hidden');
};

async function applyDynamicFilters() {
  if (!globalRouteSheetData || globalRouteSheetData.length === 0) {
    window.globalRouteSheetData = (typeof fetchNewRouteSheet === 'function') ? await fetchNewRouteSheet() : [];
    globalRouteSheetData = window.globalRouteSheetData;
  }

  const searchKeyword = (document.querySelector('#filters-content input[type="text"]')?.value || '').trim().toLowerCase();
  const selCarriers = getMultiSelectValues('filter-carrier');
  const selTruckTypes = getMultiSelectValues('filter-truck-type');
  const selOrigins = getMultiSelectValues('filter-origin-province');
  const selDestRegions = getMultiSelectValues('filter-dest-region');
  const selDestProvinces = getMultiSelectValues('filter-dest-province');
  const selCustomerTypes = getMultiSelectValues('filter-customer-type');
  const selCustomerNames = getMultiSelectValues('filter-customer-name');
  const selShipToDescs = getMultiSelectValues('filter-shipto-desc');
  const selProducts = getMultiSelectValues('filter-product-cat');

  const minBackhaulInput = document.getElementById('filter-backhaul-min')?.value;
  const maxBackhaulInput = document.getElementById('filter-backhaul-max')?.value;
  const minBackhaul = minBackhaulInput !== '' && !isNaN(minBackhaulInput) ? parseFloat(minBackhaulInput) : 0;
  const maxBackhaul = maxBackhaulInput !== '' && !isNaN(maxBackhaulInput) ? parseFloat(maxBackhaulInput) : 100;

  const heatMetric = document.getElementById('filter-heat-metric')?.value || 'all';
  state.activeFilters.heatMetric = heatMetric;

  const matchMulti = (selectedList, itemValue) => {
    if (selectedList.includes('all') || selectedList.includes('ทั้งหมด') || selectedList.length === 0) return true;
    const target = String(itemValue || '').toLowerCase();
    return selectedList.some(val => val !== 'all' && val !== 'ทั้งหมด' && target.includes(val));
  };

  const filteredData = globalRouteSheetData.filter(row => {
    const pctTotal = parseNum(row.pct_total || row['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)']);
    const availBackhaul = Math.max(0, 100 - pctTotal);

    if (heatMetric === 'quota' && availBackhaul <= 0) return false;
    if (availBackhaul < minBackhaul || availBackhaul > maxBackhaul) return false;

    if (!matchMulti(selCarriers, row.fwd_agent_desc || row['Description(FwdAgent)'])) return false;
    if (!matchMulti(selTruckTypes, row.truck_type || row['ประเภทรถ'])) return false;
    if (!matchMulti(selOrigins, row.origin || row['ต้นทาง'])) return false;
    if (!matchMulti(selDestRegions, row.zone || row['Zone'])) return false;
    if (!matchMulti(selDestProvinces, row.province || row['จังหวัด'])) return false;
    if (!matchMulti(selCustomerTypes, row.customer_type || row['ประเภทลูกค้า'])) return false;
    if (!matchMulti(selCustomerNames, row.customer_name || row['ลูกค้า'])) return false;
    if (!matchMulti(selShipToDescs, row.ship_to_desc || row['Description(Ship-To (Outbound))'])) return false;
    if (!matchMulti(selProducts, row.product_category || row['ประเภทสินค้า'])) return false;

    if (searchKeyword !== '') {
      const rowStr = [
        row.id, row['ID'], row.origin, row['ต้นทาง'], row.province, row['จังหวัด'],
        row.customer_name, row['ลูกค้า'], row.fwd_agent_desc, row['Description(FwdAgent)']
      ].filter(Boolean).join(' ').toLowerCase();
      if (!rowStr.includes(searchKeyword)) return false;
    }

    return true;
  });

  currentPage = 1;
  renderTable(filteredData);

  if (typeof updateMapDisplay === 'function') {
    updateMapDisplay(filteredData);
  } else if (typeof drawDashboardRoutes === 'function') {
    drawDashboardRoutes(filteredData);
  }
}

function resetMapFilters() {
  const searchInput = document.querySelector('#filters-content input[type="text"]');
  if (searchInput) searchInput.value = '';

  const filterIds = [
    'filter-carrier', 'filter-truck-type', 'filter-origin-province',
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

function renderTable(filteredData = []) {
  const thead = document.getElementById('table-head');
  const tbody = document.getElementById('table-body');
  const opsEl = document.getElementById('ops-count');
  const paginationEl = document.getElementById('table-pagination');

  if (!thead || !tbody) return;
  currentFilteredData = filteredData;

  const columns = ['', 'Route', 'Customer (Type) & Item (Type)', 'Truck (Type)', 'Carriers', 'Sum Trip/Week', 'Available Backhaul'];
  thead.innerHTML = `
    <tr class="text-[10px] uppercase tracking-wider border-b text-slate-500 border-slate-200 dark:text-slate-400 dark:border-slate-700 bg-slate-50/60 dark:bg-zinc-900/60 font-sans">
      ${columns.map((col, i) => `<th class="p-3 font-bold ${i === 0 ? 'w-10 text-center' : ''}">${col}</th>`).join('')}
    </tr>
  `;

  if (!filteredData || filteredData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-500 font-sans">ไม่พบข้อมูล Route ตามเงื่อนไขตัวกรอง</td></tr>`;
    if (opsEl) opsEl.innerText = '0';
    if (paginationEl) paginationEl.innerHTML = '';
    return;
  }

  const groupedRoutes = {};
  filteredData.forEach(row => {
    const origin = String(row.origin || row['ต้นทาง'] || '-').trim();
    const customer = String(row.customer_name || row['ลูกค้า'] || '-').trim();
    const customerType = String(row.customer_type || row['ประเภทลูกค้า'] || '-').trim();
    const product = String(row.product_category || row['ประเภทสินค้า'] || '-').trim();
    const destProv = String(row.province || row['จังหวัด'] || '-').trim();
    const zone = String(row.zone || row['Zone'] || '-').trim();
    const truck = String(row.truck_type || row['ประเภทรถ'] || '-').trim();
    let shipToDesc = String(row.ship_to_desc || row['Description(Ship-To (Outbound))'] || '').trim();
    if (!shipToDesc || shipToDesc === '-') shipToDesc = destProv;

    const routeKey = getDistinctKey(row);
    const mapRouteKey = getMapRouteKey(row);

    if (!groupedRoutes[routeKey]) {
      groupedRoutes[routeKey] = {
        id: 'grp-' + Math.random().toString(36).substring(2, 11),
        origin,
        zone,
        province: destProv,
        customerName: customer,
        customerType,
        shipToDesc,
        productCat: product,
        truckType: truck,
        mapRouteKey: mapRouteKey,
        uniqueSubcons: new Set(),
        totalTrips: 0,
        totalAvailTrips: 0,
        sumPct: 0,
        vendors: []
      };
    }

    const fwdAgent = String(row.fwd_agent_desc || row['Description(FwdAgent)'] || 'ไม่ระบุ').trim();
    const tripWeek = parseNum(row.avg_trip_week || row['AVG Trip/Week']);
    const totalPct = parseNum(row.pct_total || row['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)']);
    const rowAvailPct = Math.max(0, 100 - totalPct);

    if (fwdAgent !== 'ไม่ระบุ' && fwdAgent !== '-') {
      groupedRoutes[routeKey].uniqueSubcons.add(fwdAgent);
    }
    groupedRoutes[routeKey].totalTrips += tripWeek;
    groupedRoutes[routeKey].totalAvailTrips += (tripWeek * (rowAvailPct / 100));
    groupedRoutes[routeKey].sumPct += totalPct;
    groupedRoutes[routeKey].vendors.push(row);
  });

  const routeKeys = Object.keys(groupedRoutes);
  window.currentGroupKeys = routeKeys;
  window.currentGroupMap = groupedRoutes;

  const totalPages = Math.ceil(routeKeys.length / pageSize);
  if (currentPage > totalPages) currentPage = 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedKeys = routeKeys.slice(startIndex, startIndex + pageSize);

  let html = '';
  paginatedKeys.forEach(key => {
    const grp = groupedRoutes[key];
    const subconCount = grp.uniqueSubcons.size;
    const vendorCount = grp.vendors.length;
    const avgPct = vendorCount > 0 ? Math.round(grp.sumPct / vendorCount) : 0;

    const totalOffPeak = grp.vendors.reduce((sum, v) => sum + parseNum(v.avg_off_peak || v['Avg Off Peak']), 0);
    const totalPeak = grp.vendors.reduce((sum, v) => sum + parseNum(v.avg_peak || v['Avg Peak']), 0);
    const availablePct = Math.max(0, 100 - avgPct);
    const color = getAvailColorScale(availablePct);

    const avgBoonrawd = vendorCount > 0 ? Math.round(grp.vendors.reduce((sum, v) => sum + parseNum(v.pct_boonrawd || v['%รับงานต่อสำหรับงานบุญรอด']), 0) / vendorCount) : 0;
    const avgOwn = vendorCount > 0 ? Math.round(grp.vendors.reduce((sum, v) => sum + parseNum(v.pct_own || v['%รับงานต่องานของผู้รับเหมาเอง']), 0) / vendorCount) : 0;
    const avgOutside = vendorCount > 0 ? Math.round(grp.vendors.reduce((sum, v) => sum + parseNum(v.pct_brf_outside || v['%รับงานต่อ สำหรับงานนอกของ BRF']), 0) / vendorCount) : 0;

    html += `
      <tr id="row-${grp.id}" data-map-key="${grp.mapRouteKey}"
          class="text-xs border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer font-sans"
          onclick="onTableRowClick('${grp.mapRouteKey}', '${grp.id}')">
        <td class="p-3 text-center">
          <i data-lucide="chevron-right" id="icon-${grp.id}" class="w-4 h-4 text-slate-400 transition-transform duration-200 inline-block"></i>
        </td>
        <td class="p-3 whitespace-nowrap">
          <div class="font-bold text-slate-800 dark:text-white">${grp.origin} &rarr; ${grp.shipToDesc}</div>
          <div class="text-[10px] text-slate-400">Zone: ${grp.zone}</div>
        </td>
        <td class="p-3 max-w-[200px]">
          <div class="font-bold text-slate-800 dark:text-slate-200 truncate" title="${grp.customerName}">
            ${grp.customerName} <span class="font-normal text-[10px] text-slate-400">(${grp.customerType})</span>
          </div>
          <div class="text-[10px] text-slate-400 truncate mt-0.5" title="${grp.productCat}">${grp.productCat}</div>
        </td>
        <td class="p-3 whitespace-nowrap">
          <div class="font-semibold text-blue-600 dark:text-blue-400">${grp.truckType}</div>
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
                    const fwdAgentName = v.fwd_agent_desc || v['Description(FwdAgent)'] || '-';
                    const vOutsideRoute = String(v.brf_outside_route || v['ระบุต้นทาง และ ปลายทาง งานนอกของ BRF'] || '').trim();
                    const vTrip = parseNum(v.avg_trip_week || v['AVG Trip/Week']);
                    const vOffPeak = parseNum(v.avg_off_peak || v['Avg Off Peak']);
                    const vPeak = parseNum(v.avg_peak || v['Avg Peak']);
                    const vTotalPct = parseNum(v.pct_total || v['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)']);
                    const vendorAvailablePct = Math.max(0, 100 - vTotalPct);
                    const vendorAvailTrips = vTrip * (vendorAvailablePct / 100);
                    const isFull = vendorAvailablePct === 0;
                    const bVal = parseNum(v.pct_boonrawd || v['%รับงานต่อสำหรับงานบุญรอด']);
                    const oVal = parseNum(v.pct_own || v['%รับงานต่องานของผู้รับเหมาเอง']);
                    const extVal = parseNum(v.pct_brf_outside || v['%รับงานต่อ สำหรับงานนอกของ BRF']);
                    const vendorBadgeColor = isFull 
                      ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50' 
                      : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50';

                    return `
                      <tr class="hover:bg-slate-100/60 dark:hover:bg-zinc-900/60 transition-colors">
                        <td class="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">
                          ${fwdAgentName}
                          ${vOutsideRoute && vOutsideRoute !== '-' ? `<span class="block text-[10px] text-slate-400 font-normal mt-0.5">เส้นทางนอก BRF: ${vOutsideRoute}</span>` : ''}
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
  if (opsEl) opsEl.innerText = routeKeys.length.toLocaleString();
  renderPaginationControls(totalPages, routeKeys.length);
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: tbody });
}

window.onTableRowClick = function(mapRouteKey, grpId) {
  if (typeof highlightMapRoute === 'function') highlightMapRoute(mapRouteKey);
  if (typeof toggleRouteDetail === 'function') toggleRouteDetail(grpId);
};

// 💡 Sync เป๊ะ 100%: รับ mapKey ตรงกับที่วาดบนแผนที่
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
      lucide.createIcons();
    }
  }

  const sourceData = (currentFilteredData && currentFilteredData.length > 0)
    ? currentFilteredData
    : (globalRouteSheetData || []);

  // กรองเฉพาะแถวที่มี MapRouteKey ตรงกับเส้นที่คลิก
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
// ==============================================================================
// ฟังก์ชันกรองตารางข้อมูลเฉพาะต้นทางที่ถูกคลิกเลือกจากแผนที่ (Origin Filter Bridge)
// ==============================================================================
window.filterTableByOrigin = function(originName) {
  if (!originName) {
    applyDynamicFilters();
    return;
  }

  // 1. ถ้าตารางถูกพับเก็บอยู่ ให้สั่งกางออกอัตโนมัติ
  const tc = document.getElementById('table-container');
  const chevron = document.getElementById('table-chevron');
  if (tc && tc.classList.contains('table-hidden')) {
    state.isTableExpanded = true;
    tc.classList.remove('table-hidden');
    tc.classList.add('table-expanded');
    if (chevron && typeof lucide !== 'undefined') {
      chevron.setAttribute('data-lucide', 'chevron-down');
      lucide.createIcons();
    }
  }

  const cleanTargetOrigin = cleanAllSpaces(originName);
  const sourceData = (globalRouteSheetData && globalRouteSheetData.length > 0)
    ? globalRouteSheetData
    : [];

  // 2. กรองข้อมูลเฉพาะแถวที่มีต้นทางตรงกับ DC ที่เลือก
  const matchedRows = sourceData.filter(row => {
    const rowOrigin = cleanAllSpaces(row['ต้นทาง'] || row.origin || '');
    return rowOrigin === cleanTargetOrigin || rowOrigin.includes(cleanTargetOrigin);
  });

  if (matchedRows.length === 0) {
    showToast(`⚠️ ไม่พบข้อมูลเส้นทางสำหรับต้นทาง: ${originName}`);
    return;
  }

  // 3. รีเฟรชตารางและตัวนับหน้า
  currentPage = 1;
  currentFilteredData = matchedRows;
  renderTable(matchedRows);
  showToast(`📍 กรองเฉพาะต้นทาง: ${originName} | พบ ${matchedRows.length.toLocaleString()} รายการ`);

  // 4. เลื่อนมุมมองหน้าจอลงมาที่ตารางข้อมูลอย่างนุ่มนวล
  setTimeout(() => {
    const tableEl = document.getElementById('table-container');
    if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 150);
};

function renderPaginationControls(totalPages, totalItems) {
  const paginationEl = document.getElementById('table-pagination');
  if (!paginationEl) return;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

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
// 6. ZONE DRILLDOWN & RPC
// ==============================================================================
window.selectExecZoneCard = async function(zoneName, cardEl) {
  document.querySelectorAll('#exec-region-summary-list > div').forEach(card => {
    card.classList.remove('ring-2', 'ring-orange-500', 'border-orange-500', 'shadow-md');
    card.classList.add('border-slate-100', 'dark:border-slate-800/80');
  });
  if (cardEl) {
    cardEl.classList.remove('border-slate-100', 'dark:border-slate-800/80');
    cardEl.classList.add('ring-2', 'ring-orange-500', 'border-orange-500', 'shadow-md');
  }
  showExecZoneDetailsTable(zoneName);
};

function showExecZoneDetailsTable(zoneName) {
  const panel = document.getElementById('exec-zone-detail-panel');
  const titleEl = document.getElementById('exec-selected-zone-name');
  const badgeEl = document.getElementById('exec-selected-zone-badge');
  const tbody = document.getElementById('exec-zone-table-body');
  if (!panel || !tbody) return;

  const matchedRoutes = globalRouteSheetData.filter(row => String(row['Zone'] || row.zone || '').trim() === zoneName);
  if (titleEl) titleEl.innerText = zoneName;
  if (badgeEl) badgeEl.innerText = `${matchedRoutes.length.toLocaleString()} Routes`;

  if (matchedRoutes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-slate-400 font-sans">ไม่พบข้อมูล Route ในโซนนี้</td></tr>`;
  } else {
    tbody.innerHTML = matchedRoutes.map(row => {
      const origin = row['ต้นทาง'] || row.origin || '-';
      const customer = row['ลูกค้า'] || row.customer_name || '-';
      const shipToDesc = row['Description(Ship-To (Outbound))'] || row.ship_to_desc || '-';
      const province = row['จังหวัด'] || row.province || '-';
      const product = row['ประเภทสินค้า'] || row.product_category || '-';
      const truck = row['ประเภทรถ'] || row.truck_type || '-';
      const fwdAgent = row['Description(FwdAgent)'] || row.fwd_agent_desc || 'ไม่ระบุ';
      const avgTrip = parseNum(row['AVG Trip/Week'] || row.avg_trip_week);
      const totalPct = parseNum(row['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'] || row.pct_total);
      const availPct = Math.max(0, 100 - totalPct);
      const color = getAvailColorScale(availPct);

      return `
        <tr class="hover:bg-slate-100/60 dark:hover:bg-zinc-900/60 transition-colors font-sans">
          <td class="p-2.5 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">${origin}</td>
          <td class="p-2.5 max-w-[220px]">
            <strong class="block text-slate-800 dark:text-slate-200 font-bold truncate" title="${customer}">${customer}</strong>
            <span class="text-[10px] text-slate-400 block leading-tight mt-0.5 truncate" title="${shipToDesc}">${shipToDesc}</span>
          </td>
          <td class="p-2.5 font-medium whitespace-nowrap">${province}</td>
          <td class="p-2.5 text-slate-500 whitespace-nowrap">${product}</td>
          <td class="p-2.5 text-slate-500 whitespace-nowrap">${truck}</td>
          <td class="p-2.5 font-semibold text-orange-600 dark:text-orange-400 whitespace-nowrap">${fwdAgent}</td>
          <td class="p-2.5 text-center font-Sarabun font-bold">${avgTrip.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td class="p-2.5 text-right font-Sarabun font-bold ${color.text}">${Math.round(availPct)}%</td>
        </tr>
      `;
    }).join('');
  }

  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.closeExecZoneDetailTable = function() {
  const panel = document.getElementById('exec-zone-detail-panel');
  if (panel) {
    panel.classList.add('hidden');
    panel.style.display = 'none';
  }
  document.querySelectorAll('#exec-region-summary-list > div').forEach(card => {
    card.classList.remove('ring-2', 'ring-orange-500', 'border-orange-500', 'shadow-md');
  });
};

window.drillDownExecZone = function(zoneName) {
  showExecZoneDetailsTable(zoneName);
};

// ==============================================================================
// 7. SIMULATION & ORDER MAPPING ENGINE
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

  if ((isNaN(latInput) || isNaN(lngInput)) && typeof provinceLocationMap !== 'undefined' && provinceLocationMap[selectedProvince]) {
    latInput = provinceLocationMap[selectedProvince].lat;
    lngInput = provinceLocationMap[selectedProvince].lng;
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
  if (summaryRouteEl) summaryRouteEl.innerHTML = `${selectedOrigin} <i data-lucide="arrow-right" class="w-3 h-3 text-orange-500 inline"></i> ${selectedProvince}`;
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

  let routeData = globalRouteSheetData.length > 0 ? globalRouteSheetData : ((typeof fetchNewRouteSheet === 'function') ? await fetchNewRouteSheet() : []);
  if (!routeData || routeData.length === 0) {
    if (rankListEl) rankListEl.innerHTML = `<div class="p-4 text-center text-xs font-bold text-rose-500 font-sans">ไม่สามารถดึงข้อมูลได้</div>`;
    return;
  }

  const matchedSubcons = routeData.filter(row => {
    const fwdAgent = String(row['Description(FwdAgent)'] || row.fwd_agent_desc || '').trim();
    const pctTotal = parseNum(row['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'] || row.pct_total);
    if (!fwdAgent || pctTotal >= 100) return false;

    const rowOrigin = String(row['ต้นทาง'] || row.origin || '').trim().toLowerCase();
    const rowProduct = String(row['ประเภทสินค้า'] || row.product_category || '').trim().toLowerCase();
    const rowProvince = String(row['จังหวัด'] || row.province || '').trim().toLowerCase();
    const rowZone = String(row['Zone'] || row.zone || '').trim().toLowerCase();
    const rowTruck = String(row['ประเภทรถ'] || row.truck_type || '').trim().toLowerCase();

    const sOrigin = selectedOrigin.toLowerCase();
    const sProduct = selectedProduct.toLowerCase();
    const sProvince = selectedProvince.toLowerCase();
    const sZone = selectedZone.toLowerCase();
    const sTruck = selectedTruck.toLowerCase();

    if (selectedOrigin !== 'ทั้งหมด' && rowOrigin && !rowOrigin.includes(sOrigin) && !sOrigin.includes(rowOrigin)) return false;
    if (selectedProduct !== 'ทั้งหมด' && rowProduct && !rowProduct.includes(sProduct) && !sProduct.includes(rowProduct)) return false;
    if (selectedProvince !== 'ทั้งหมด' && rowProvince && !rowProvince.includes(sProvince) && !sProvince.includes(rowProvince)) return false;
    if (selectedZone !== 'ทั้งหมด' && rowZone && !rowZone.includes(sZone) && !sZone.includes(rowZone)) return false;
    if (selectedTruck !== 'ทั้งหมด' && rowTruck && !rowTruck.includes(sTruck) && !sTruck.includes(rowTruck)) return false;

    return true;
  });

  matchedSubcons.sort((a, b) => parseNum(a['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'] || a.pct_total) - parseNum(b['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'] || b.pct_total));

  const allRankedSubcons = matchedSubcons.map(item => {
    const totalPct = parseNum(item['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'] || item.pct_total);
    return {
      id: item['ID'] || item.id || '-',
      origin: item['ต้นทาง'] || item.origin || '-',
      customer: item['ลูกค้า'] || item.customer_name || '-',
      customerType: item['ประเภทลูกค้า'] || item.customer_type || '-',
      productCategory: item['ประเภทสินค้า'] || item.product_category || '-',
      province: item['จังหวัด'] || item.province || '-',
      zone: item['Zone'] || item.zone || '-',
      truckType: item['ประเภทรถ'] || item.truck_type || '-',
      fwdAgent: item['Description(FwdAgent)'] || item.fwd_agent_desc || 'ไม่ระบุผู้รับเหมา',
      shipToDesc: item['Description(Ship-To (Outbound))'] || item.ship_to_desc || '-',
      avgTripWeek: item['AVG Trip/Week'] || item.avg_trip_week || 0,
      avgOffPeak: item['Avg Off Peak'] || item.avg_off_peak || 0,
      avgPeak: item['Avg Peak'] || item.avg_peak || 0,
      pctBRFOutside: parseNum(item['%รับงานต่อ สำหรับงานนอกของ BRF'] || item.pct_brf_outside),
      brfOutsideRoute: item['ระบุต้นทาง และ ปลายทาง งานนอกของ BRF'] || item.brf_outside_route || '-',
      pctBoonrawd: parseNum(item['%รับงานต่อสำหรับงานบุญรอด'] || item.pct_boonrawd),
      pctOwn: parseNum(item['%รับงานต่องานของผู้รับเหมาเอง'] || item.pct_own),
      pctTotal: totalPct,
      availableCapacityPct: Math.max(0, 100 - totalPct)
    };
  });

  renderSubconRankings(allRankedSubcons, matchedSubcons.length);

  if (typeof drawAllSheetRoutesOnSimMap === 'function') {
    const customerInfo = { name: customerNameInput, lat: latInput, lng: lngInput };
    const originInfo = typeof originLocationMap !== 'undefined' ? originLocationMap[selectedOrigin] : null;
    drawAllSheetRoutesOnSimMap(matchedSubcons, selectedOrigin, selectedProvince, customerInfo, originInfo);
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
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
      <div onclick="highlightSubconRoute('${item.id}', this)" 
           class="p-4 rounded-2xl bg-white dark:bg-zinc-950 border ${badge.border} shadow-sm hover:shadow-md cursor-pointer transition-all duration-200 space-y-3 hover:scale-[1.01] font-sans">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 overflow-hidden">
            <span class="px-2 py-0.5 text-[10px] font-extrabold rounded-md shrink-0 ${badge.bg}">${badge.label}</span>
            <h4 class="text-xs font-extrabold text-slate-800 dark:text-white truncate" title="${item.fwdAgent}">${item.fwdAgent}</h4>
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
          <div><span class="text-slate-500">Row ID:</span> <strong class="text-slate-800 dark:text-slate-200">${item.id}</strong></div>
          <div><span class="text-slate-500">ต้นทาง (DC):</span> <strong class="text-slate-800 dark:text-slate-200">${item.origin}</strong></div>
          <div><span class="text-slate-500">จังหวัด:</span> <strong class="text-slate-800 dark:text-slate-200">${item.province}</strong></div>
          <div><span class="text-slate-500">Zone:</span> <strong class="text-slate-800 dark:text-slate-200">${item.zone}</strong></div>
          <div><span class="text-slate-500">ประเภทสินค้า:</span> <strong class="text-slate-800 dark:text-slate-200">${item.productCategory}</strong></div>
          <div><span class="text-slate-500">ประเภทรถ:</span> <strong class="text-slate-800 dark:text-slate-200">${item.truckType}</strong></div>
        </div>
      </div>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
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
  let routeData = globalRouteSheetData.length > 0 ? globalRouteSheetData : ((typeof fetchNewRouteSheet === 'function') ? await fetchNewRouteSheet() : []);
  if (!routeData || routeData.length === 0) return;

  const extractUnique = (data, columnName) => {
    const list = data.map(row => String(row[columnName] || '').trim()).filter(val => val !== '' && val !== 'undefined' && val !== 'null' && val !== '-');
    return [...new Set(list)].sort();
  };

  const updateDropdown = (elementId, optionsList, defaultLabel = 'ทั้งหมด') => {
    const selectEl = document.getElementById(elementId);
    if (!selectEl) return;
    let html = defaultLabel ? `<option value="ทั้งหมด">${defaultLabel}</option>` : '';
    html += optionsList.map(val => `<option value="${val}">${val}</option>`).join('');
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
// 8. CHARTS, VIEWS & UI CONTROLS
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
    lucide.createIcons();
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
    if (state.activeMenuId === 'exec') updateExecutiveDashboard(globalRouteSheetData);
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
  if (typeof lucide !== 'undefined') lucide.createIcons();
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
      ${m.text}
    </div>
  `).join('');
  msgContainer.scrollTop = msgContainer.scrollHeight;
}


// ==============================================================================
// 9. EXPORT & EVENT LISTENERS
// ==============================================================================
window.exportFilteredDataToCSV = function() {
  const dataToExport = (currentFilteredData && currentFilteredData.length > 0) ? currentFilteredData : globalRouteSheetData;
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
    const avgTrip = parseNum(row['AVG Trip/Week'] || row.avg_trip_week);
    const totalPct = parseNum(row['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'] || row.pct_total);
    const availPct = Math.max(0, 100 - totalPct);
    const availTrips = (avgTrip * (availPct / 100)).toFixed(2);

    const values = [
      row['ID'] || row.id || '',
      row['ต้นทาง'] || row.origin || '',
      row['จังหวัด'] || row.province || '',
      row['Zone'] || row.zone || '',
      row['ลูกค้า'] || row.customer_name || '',
      row['ประเภทลูกค้า'] || row.customer_type || '',
      row['Description(Ship-To (Outbound))'] || row.ship_to_desc || '',
      row['ประเภทสินค้า'] || row.product_category || '',
      row['ประเภทรถ'] || row.truck_type || '',
      row['Description(FwdAgent)'] || row.fwd_agent_desc || '',
      avgTrip,
      parseNum(row['Avg Off Peak'] || row.avg_off_peak),
      parseNum(row['Avg Peak'] || row.avg_peak),
      `${parseNum(row['%รับงานต่อสำหรับงานบุญรอด'] || row.pct_boonrawd)}%`,
      `${parseNum(row['%รับงานต่องานของผู้รับเหมาเอง'] || row.pct_own)}%`,
      `${parseNum(row['%รับงานต่อ สำหรับงานนอกของ BRF'] || row.pct_brf_outside)}%`,
      row['ระบุต้นทาง และ ปลายทาง งานนอกของ BRF'] || row.brf_outside_route || '-',
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

function setupEventListeners() {
  document.getElementById('btn-login-ms')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-login-ms');
    const loginScreen = document.getElementById('login-screen');
    const app = document.getElementById('main-app');

    if (btn) {
      btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Authenticating...`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
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

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    const app = document.getElementById('main-app');
    const loginScreen = document.getElementById('login-screen');
    if (app) app.classList.add('hidden', 'opacity-0', 'pointer-events-none');
    if (loginScreen) loginScreen.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
    const btnLogin = document.getElementById('btn-login-ms');
    if (btnLogin) btnLogin.innerHTML = `Sign in with Microsoft`;
    showToast('ออกจากระบบเรียบร้อยแล้ว');
  });

  const searchInput = document.querySelector('#filters-content input[type="text"]');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => applyDynamicFilters(), 300);
    });
  }

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
      lucide.createIcons();
    }

    renderSidebarMenu();
    setTimeout(() => {
      if (typeof execMap !== 'undefined' && execMap) execMap.invalidateSize();
      if (typeof dashMap !== 'undefined' && dashMap) dashMap.invalidateSize();
      if (typeof simMap !== 'undefined' && simMap) simMap.invalidateSize();
    }, 310);
  });

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
      lucide.createIcons();
    }
    if (typeof dashMap !== 'undefined' && dashMap) setTimeout(() => dashMap.invalidateSize(), 300);
  });

  document.getElementById('toggle-filters-main')?.addEventListener('click', () => {
    const content = document.getElementById('filters-content');
    const chevron = document.getElementById('filters-main-chevron');
    if (content) {
      content.classList.toggle('hidden');
      if (chevron && typeof lucide !== 'undefined') {
        chevron.setAttribute('data-lucide', content.classList.contains('hidden') ? 'chevron-down' : 'chevron-up');
        lucide.createIcons();
      }
    }
  });

  document.querySelectorAll('.filter-accordion-toggle').forEach(toggleBtn => {
    toggleBtn.addEventListener('click', () => {
      const targetEl = document.getElementById(toggleBtn.getAttribute('data-target'));
      const chevron = toggleBtn.querySelector('.accordion-chevron');
      if (targetEl) {
        targetEl.classList.toggle('hidden');
        if (chevron && typeof lucide !== 'undefined') {
          chevron.setAttribute('data-lucide', targetEl.classList.contains('hidden') ? 'chevron-down' : 'chevron-up');
          lucide.createIcons();
        }
      }
    });
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.custom-select-container')) {
      document.querySelectorAll('.custom-select-dropdown').forEach(el => el.classList.add('hidden'));
    }
  });

  document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleDarkMode);
}

window.addEventListener('DOMContentLoaded', () => {
  if (typeof lucide !== 'undefined') lucide.createIcons();
  setupEventListeners();
});
