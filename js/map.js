/**
 * ==============================================================================
 * MAP CONTROLLER & VISUALIZATION ENGINE (FIXED & FULLY SYNCHRONIZED)
 * ==============================================================================
 */

// 1. Global Map Instances & Layer Groups
let dashMap = null, simMap = null, execMap = null;
let dashLayerGrp = null, simLayerGrp = null;
let tileLayerObj = null, simTileLayer = null, execTileLayer = null;
let currentHeatLayer = null, execGeoJsonLayer = null;

// Canvas Renderers สำหรับเร่งความเร็ว
let routeCanvasRenderer = null;
let dotCanvasRenderer = null;

// 2. Simulation & Animation State
let movingMarkers = [];
let animationFrameId = null;
let lastAnimationTime = 0;
window.simSubconRouteLayers = window.simSubconRouteLayers || {};

// 3. Performance & Lookup Caches
let cachedThailandGeoJSON = null;
let geoJsonLoadingPromise = null;
const coordCache = {};
const nodeCache = {};
let routePolylineMap = {};
let currentHighlightedKey = null;
let currentHighlightedOrigin = null;
window.shippingLocationLookup = window.shippingLocationLookup || {};
window.shippingLocationComposite = window.shippingLocationComposite || {};
window.roadRouteGeometryCache = window.roadRouteGeometryCache || {};


// ==============================================================================
// 1. CORE HELPER FUNCTIONS
// ==============================================================================
function isDarkMode() {
  return typeof state !== 'undefined' && Boolean(state?.isDark);
}

function parseSafeNum(val, defaultVal = 0) {
  if (val === null || val === undefined) return defaultVal;
  const num = parseFloat(String(val).replace(/[,%]/g, '').trim());
  return isNaN(num) ? defaultVal : num;
}

function cleanAllSpaces(val) {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\s+/g, '').trim().toLowerCase();
}

function isValidThailandCoord(lat, lng) {
  const numLat = parseFloat(lat);
  const numLng = parseFloat(lng);
  if (isNaN(numLat) || isNaN(numLng)) return false;
  return numLat >= 5.5 && numLat <= 20.5 && numLng >= 97.0 && numLng <= 106.0;
}

function parseLatLng(latLngStr) {
  if (!latLngStr) return null;
  const parts = String(latLngStr).split(',').map(s => parseFloat(s.trim()));
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { lat: parts[0], lng: parts[1] };
  }
  return null;
}

function getMapRouteKey(row) {
  if (!row) return '';
  const origin = cleanAllSpaces(row['ต้นทาง'] || row.origin);
  const prov = cleanAllSpaces(row['จังหวัด'] || row.province);
  let shipTo = cleanAllSpaces(row['Description(Ship-To (Outbound))'] || row.ship_to_desc);
  if (!shipTo || shipTo === '-') shipTo = prov;
  return `${origin}__${shipTo}`;
}

function getThaiProvinceName(enName) {
  if (!enName) return '-';
  const clean = cleanAllSpaces(enName);
  if (PROVINCE_NAME_MAP[clean]) return PROVINCE_NAME_MAP[clean];
  const matchedKey = Object.keys(PROVINCE_NAME_MAP).find(k => clean.includes(k) || k.includes(clean));
  return matchedKey ? PROVINCE_NAME_MAP[matchedKey] : enName;
}

function getCurvePoints(lat1, lng1, lat2, lng2, offset = 0) {
  const points = [];
  const midLat = (lat1 + lat2) / 2;
  const midLng = (lng1 + lng2) / 2;
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  const ctrlLat = midLat - dLng * offset;
  const ctrlLng = midLng + dLat * offset;

  points.push([lat1, lng1]);
  for (let t = 0.1; t < 0.9; t += 0.1) {
    const lat = (1 - t) * (1 - t) * lat1 + 2 * (1 - t) * t * ctrlLat + t * t * lat2;
    const lng = (1 - t) * (1 - t) * lng1 + 2 * (1 - t) * t * ctrlLng + t * t * lng2;
    points.push([lat, lng]);
  }
  points.push([lat2, lng2]);
  return points;
}

// ==============================================================================
// 2. MAP INITIALIZATION & TILES
// ==============================================================================
function initMaps() {
  console.debug('[MAP] initMaps started');

  const mapOptions = {
    zoomControl: false,
    attributionControl: false,
    preferCanvas: true,
    fadeAnimation: false,
    zoomAnimation: false,
    markerZoomAnimation: false
  };

  const dashContainer = document.getElementById('map-dashboard');

  if (dashContainer && !dashMap) {
    console.debug('[MAP] Creating dashboard map');

    dashMap = L.map('map-dashboard', mapOptions)
      .setView([13.75, 100.5], 6);

    dashLayerGrp = L.layerGroup().addTo(dashMap);
    initMapPanes(dashMap);

    routeCanvasRenderer = L.canvas({
      pane: 'routePane',
      padding: 0.5
    });

    dotCanvasRenderer = L.canvas({
      pane: 'destDotPane',
      padding: 0.5
    });
  }

  const simContainer = document.getElementById('map-simulation');
  if (simContainer) {
    if (simMap) { simMap.remove(); simMap = null; }
    simMap = L.map('map-simulation', mapOptions).setView([13.75, 100.5], 6);
    simLayerGrp = L.layerGroup().addTo(simMap);
    initMapPanes(simMap);
  }

  const execMapContainer = document.getElementById('map-exec-heatmap');
  if (execMapContainer) {
    if (execMap) { execMap.remove(); execMap = null; }
    execMap = L.map('map-exec-heatmap', mapOptions).setView([13.75, 100.5], 5);
    initMapPanes(execMap);
  }

  updateMapTiles();
  console.debug('[MAP] initMaps completed');
}

function initMapPanes(map) {
  if (!map) return;

  if (!map.getPane('heatPane')) {
    map.createPane('heatPane');
    map.getPane('heatPane').style.zIndex = 200;
    map.getPane('heatPane').style.pointerEvents = 'none';
  }

  if (!map.getPane('routePane')) {
    map.createPane('routePane');
    map.getPane('routePane').style.zIndex = 400;
  }

  if (!map.getPane('destDotPane')) {
    map.createPane('destDotPane');
    map.getPane('destDotPane').style.zIndex = 500;
  }

  if (!map.getPane('dcPane')) {
    map.createPane('dcPane');
    map.getPane('dcPane').style.zIndex = 700;
  }
}

function updateMapTiles() {
  const currentTheme = (typeof state !== 'undefined' && state?.mapTheme) || 'google-hybrid';
  let tileUrl = '';
  let subdomains = ['mt0', 'mt1', 'mt2', 'mt3'];

  if (currentTheme === 'google-hybrid') {
    tileUrl = 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
  } else if (currentTheme === 'google-satellite') {
    tileUrl = 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';
  } else if (isDarkMode()) {
    tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    subdomains = 'abcd';
  } else {
    tileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    subdomains = 'abcd';
  }

  const tileConfig = { subdomains, maxZoom: 20 };
  if (dashMap) {
    if (tileLayerObj) dashMap.removeLayer(tileLayerObj);
    tileLayerObj = L.tileLayer(tileUrl, tileConfig).addTo(dashMap);
  }
  if (simMap) {
    if (simTileLayer) simMap.removeLayer(simTileLayer);
    simTileLayer = L.tileLayer(tileUrl, tileConfig).addTo(simMap);
  }
  if (execMap) {
    if (execTileLayer) execMap.removeLayer(execTileLayer);
    execTileLayer = L.tileLayer(tileUrl, tileConfig).addTo(execMap);
  }
}

// ==============================================================================
// 3. ROUTING & LOCATION RESOLVER ENGINE
// ==============================================================================
function resolveDestinationCoords(rowOrDesc, provinceFallback = '') {
  if (!rowOrDesc) return null;

  if (typeof rowOrDesc === 'object') {
    const lat = parseFloat(rowOrDesc.dest_lat || rowOrDesc.lat);
    const lng = parseFloat(rowOrDesc.dest_lng || rowOrDesc.lng);

    if (!isNaN(lat) && !isNaN(lng) && isValidThailandCoord(lat, lng)) {
      return [lat, lng];
    }
  }

  const province = typeof rowOrDesc === 'object' 
    ? (rowOrDesc.province || rowOrDesc['จังหวัด'] || provinceFallback) 
    : (rowOrDesc || provinceFallback);

  return resolveLocationCoords(province);
}

function resolveLocationCoords(locationKey) {
  if (!locationKey) return null;
  const exactKey = String(locationKey).trim();
  const cleanKey = cleanAllSpaces(exactKey);

  if (coordCache[exactKey] !== undefined) return coordCache[exactKey];
  if (coordCache[cleanKey] !== undefined) return coordCache[cleanKey];

  let result = null;

  if (window.shippingLocationLookup) {
    if (window.shippingLocationLookup[exactKey]) result = [window.shippingLocationLookup[exactKey].lat, window.shippingLocationLookup[exactKey].lng];
    else if (window.shippingLocationLookup[cleanKey]) result = [window.shippingLocationLookup[cleanKey].lat, window.shippingLocationLookup[cleanKey].lng];
  }

  if (!result && typeof originLocationMap !== 'undefined') {
    if (originLocationMap[exactKey]) result = [originLocationMap[exactKey].lat, originLocationMap[exactKey].lng];
    else if (originLocationMap[cleanKey]) result = [originLocationMap[cleanKey].lat, originLocationMap[cleanKey].lng];
  }

  if (!result && typeof provinceLocationMap !== 'undefined') {
    if (provinceLocationMap[exactKey]) result = [provinceLocationMap[exactKey].lat, provinceLocationMap[exactKey].lng];
    else if (provinceLocationMap[cleanKey]) result = [provinceLocationMap[cleanKey].lat, provinceLocationMap[cleanKey].lng];
    else {
      const foundProv = Object.keys(provinceLocationMap).find(k => cleanAllSpaces(k).includes(cleanKey) || cleanKey.includes(cleanAllSpaces(k)));
      if (foundProv) result = [provinceLocationMap[foundProv].lat, provinceLocationMap[foundProv].lng];
    }
  }

  if (result && !isValidThailandCoord(result[0], result[1])) result = null;

  coordCache[exactKey] = result;
  coordCache[cleanKey] = result;
  return result;
}

// ==============================================================================
// 4. EXECUTIVE DASHBOARD CHOROPLETH (ORIGINAL COLOR LOGIC + ZERO LAYER STACKING)
// ==============================================================================

let currentSelectedZone = null;
let execRenderToken = 0; // ป้องกัน Race Condition และ Layer ซ้อนทับ

/**
 * โหลดไฟล์ GeoJSON ขอบเขตประเทศไทย พร้อมระบบ Persistent Cache (sessionStorage)
 */
async function loadThailandGeoJSON() {
  const CACHE_KEY = 'cache_thailand_geojson';

  // 1. ตรวจสอบใน Memory Cache ก่อน
  if (cachedThailandGeoJSON) return cachedThailandGeoJSON;
  if (geoJsonLoadingPromise) return geoJsonLoadingPromise;

  // 2. ตรวจสอบใน Persistent Storage (sessionStorage)
  const storedGeoJson = sessionStorage.getItem(CACHE_KEY);
  if (storedGeoJson) {
    try {
      cachedThailandGeoJSON = JSON.parse(storedGeoJson);
      return cachedThailandGeoJSON;
    } catch (e) {
      console.warn('GeoJSON cache parse error, fetching fresh data...');
      sessionStorage.removeItem(CACHE_KEY);
    }
  }

  // 3. หากไม่มีในแคช ให้ดาวน์โหลดจากไฟล์ data/thailand.json
  geoJsonLoadingPromise = (async () => {
    try {
      const res = await fetch('./data/thailand.json');
      if (res.ok) {
        const data = await res.json();
        cachedThailandGeoJSON = data;

        // บันทึกลง sessionStorage สำหรับการเปิดครั้งถัดไป
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch (storageErr) {
          console.warn('Storage quota exceeded, caching in memory only.');
        }

        return cachedThailandGeoJSON;
      }
    } catch (err) {
      console.warn('Local GeoJSON fallback to CDN...');
    }

    // Fallback CDN หากไฟล์ในเครื่องโหลดไม่ได้
    const cdnUrls = [
      'https://cdn.jsdelivr.net/gh/apisit/thailand.json@master/thailand.json',
      'https://raw.githubusercontent.com/apisit/thailand.json/master/thailand.json'
    ];

    for (const url of cdnUrls) {
      try {
        const cdnRes = await fetch(url);
        if (cdnRes.ok) {
          const data = await cdnRes.json();
          cachedThailandGeoJSON = data;
          try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
          } catch (_) {}
          return cachedThailandGeoJSON;
        }
      } catch (err) {
        console.warn(`CDN failed: ${url}`);
      }
    }

    throw new Error('Unable to load Thailand GeoJSON from any source.');
  })();

  try {
    return await geoJsonLoadingPromise;
  } finally {
    geoJsonLoadingPromise = null;
  }
}

/**
 * กำหนดช่วงสีตามสัดส่วน % โค้ดเดิม
 */
function getExecChoroplethColor(availPct) {
  if (availPct === null || availPct === undefined || isNaN(availPct)) return '#94a3b8'; // เทา (ไม่มีข้อมูล)
  const val = Number(availPct);
  if (val === 0) return '#000000';   // งานเต็ม 100% (ดำ)
  if (val <= 30) return '#ef4444';   // แดง (<= 30%)
  if (val <= 70) return '#f97316';   // ส้ม (31% - 70%)
  return '#10b981';                  // เขียว (> 70%)
}

function normalizeProvName(name) {
  if (!name || name === '-' || name === 'undefined') return '';
  let str = String(name).trim();
  if (['กรุงเทพฯ', 'กทม.', 'กทม', 'กรุงเทพ'].includes(str)) return 'กรุงเทพมหานคร';
  return str;
}

function getProvinceStat(provMap, feature) {
  if (!provMap || !feature) return null;
  const rawGeoName = feature.properties?.name || feature.properties?.name_th || '';
  const cleanGeo = cleanAllSpaces(rawGeoName);
  const thaiName = typeof getThaiProvinceName === 'function' ? getThaiProvinceName(rawGeoName) : rawGeoName;
  const cleanThai = cleanAllSpaces(thaiName);

  return provMap[cleanGeo] || provMap[cleanThai] ||
    Object.entries(provMap).find(([k]) => k.includes(cleanThai) || cleanThai.includes(k))?.[1] || null;
}

/**
 * เรนเดอร์แผนที่ด้วยตรรกะสีเดิม (ภาพที่ 1)
 */
async function renderExecRouteHeatmap(data) {
  if (!execMap) return;

  const currentToken = ++execRenderToken;
  currentSelectedZone = null;

  if (!data || data.length === 0) {
    if (execGeoJsonLayer && execMap.hasLayer(execGeoJsonLayer)) {
      execMap.removeLayer(execGeoJsonLayer);
      execGeoJsonLayer = null;
    }
    return;
  }

  const provMap = {};

  data.forEach(row => {
    const rawProv = normalizeProvName(row['จังหวัด'] || row.province || row.province_th);
    if (!rawProv) return;

    const cleanProv = cleanAllSpaces(rawProv);
    const trips = typeof parseSafeNum === 'function'
      ? parseSafeNum(row['AVG Trip/Week'] || row.avg_trip_week || row.avg_trips, 0)
      : (parseFloat(row['AVG Trip/Week'] || row.avg_trip_week) || 0);

    const pctTotal = typeof parseSafeNum === 'function'
      ? parseSafeNum(row['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'] || row.pct_total, 0)
      : (parseFloat(row['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'] || row.pct_total) || 0);

    const availPct = Math.max(0, 100 - pctTotal);
    const availTrips = trips * (availPct / 100);

    if (!provMap[cleanProv]) {
      provMap[cleanProv] = {
        totalRoutes: 0,
        availRoutes: 0,
        totalTrips: 0,
        availTrips: 0,
        displayName: rawProv
      };
    }

    provMap[cleanProv].totalRoutes += 1;
    provMap[cleanProv].totalTrips += trips;

    if (availPct > 0) {
      provMap[cleanProv].availRoutes += 1;
      provMap[cleanProv].availTrips += availTrips;
    }
  });

  // 💡 จุดสำคัญ: คืนค่าสูตรตาม Code เดิม (นับสัดส่วนจากจำนวนเส้นทาง)
  Object.values(provMap).forEach(item => {
    item.zoneAvailPct = item.totalRoutes > 0 ? (item.availRoutes / item.totalRoutes) * 100 : 0;
    item.hasData = item.totalRoutes > 0;
  });

  try {
    const geoData = await loadThailandGeoJSON();

    if (currentToken !== execRenderToken) return;

    // เคลียร์เลเยอร์เก่าทิ้งทั้งหมดก่อนวาดใหม่
    if (execGeoJsonLayer && execMap.hasLayer(execGeoJsonLayer)) {
      execMap.removeLayer(execGeoJsonLayer);
    }
    execMap.eachLayer(layer => {
      if (layer instanceof L.GeoJSON) {
        execMap.removeLayer(layer);
      }
    });

    execGeoJsonLayer = L.geoJSON(geoData, {
      style: (feature) => {
        const stat = getProvinceStat(provMap, feature);
        const availRatio = stat?.hasData ? stat.zoneAvailPct : null;

        return {
          fillColor: getExecChoroplethColor(availRatio),
          weight: 1,
          opacity: 0.9,
          color: '#ffffff',
          fillOpacity: availRatio !== null ? 0.75 : 0.2 // สีสด คมชัดตามภาพที่ 1
        };
      },
      onEachFeature: (feature, layer) => {
        const stat = getProvinceStat(provMap, feature);
        const hasData = Boolean(stat?.hasData);
        const availPct = hasData ? stat.zoneAvailPct : 0;
        const availRoutes = stat ? stat.availRoutes : 0;
        const totalRoutes = stat ? stat.totalRoutes : 0;
        const totalTrips = stat ? stat.totalTrips : 0;
        const availTrips = stat ? stat.availTrips : 0;

        const rawGeoName = feature.properties?.name || feature.properties?.name_th || '';
        const displayTitle = stat?.displayName || (typeof getThaiProvinceName === 'function' ? getThaiProvinceName(rawGeoName) : rawGeoName);
        const baseColor = getExecChoroplethColor(hasData ? availPct : null);

        layer._baseColor = baseColor;
        layer._baseOpacity = hasData ? 0.75 : 0.2;

        layer.bindTooltip(`
          <div class="px-2.5 py-1.5 min-w-[200px] font-sans">
            <strong class="text-slate-800 dark:text-white block font-bold text-xs border-b pb-1 mb-1.5 border-slate-200 dark:border-slate-700">${displayTitle}</strong>
            ${hasData ? `
              <div class="flex justify-between items-center mb-1">
                <span class="text-slate-500 dark:text-slate-400 text-[11px]">Available Backhaul:</span>
                <strong class="text-emerald-600 dark:text-emerald-400 font-extrabold text-xs">${availRoutes.toLocaleString()} routes (${availPct.toFixed(2)}%)</strong>
              </div>
              <div class="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                <span>Total Registered:</span>
                <span>${totalRoutes.toLocaleString()} routes (~${Math.round(totalTrips).toLocaleString()} trips/wk)</span>
              </div>
              <div class="flex justify-between items-center text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                <span>Available Volume:</span>
                <span>~${Math.round(availTrips).toLocaleString()} trips/wk</span>
              </div>
            ` : `
              <span class="text-slate-400 italic block text-[10px]">ไม่มีเส้นทางวิ่ง (No Data)</span>
            `}
          </div>
        `, { sticky: true, className: 'custom-leaflet-tooltip' });

        layer.on({
          mouseover: (e) => {
            const l = e.target;
            l.setStyle({ weight: 2.5, color: '#f97316', fillOpacity: 0.9 });
            l.bringToFront();
          },
          mouseout: (e) => {
            if (!execGeoJsonLayer) return;
            const l = e.target;
            if (currentSelectedZone) {
              l.setStyle(l._isZoneMatch ? {
                fillColor: l._baseColor,
                weight: 2.5,
                color: '#f97316',
                opacity: 1.0,
                fillOpacity: 0.85
              } : {
                fillColor: '#94a3b8',
                weight: 0.8,
                color: '#cbd5e1',
                opacity: 0.35,
                fillOpacity: 0.22
              });
            } else {
              l.setStyle({
                fillColor: l._baseColor,
                weight: 1,
                color: '#ffffff',
                opacity: 0.9,
                fillOpacity: l._baseOpacity
              });
            }
          }
        });
      }
    }).addTo(execMap);

    execMap.off('click', resetExecMapHighlight);
    execMap.on('click', resetExecMapHighlight);

  } catch (err) {
    console.error('Failed to render Executive Map:', err);
  }
}

// ==============================================================================
// REGION / ZONE HIGHLIGHT CONTROLLER
// ==============================================================================

function highlightRegionOnExecMap(targetZone, sourceData = null) {
  if (!execMap || !execGeoJsonLayer) return;

  const cleanTargetZone = cleanAllSpaces(targetZone);

  if (currentSelectedZone === cleanTargetZone) {
    resetExecMapHighlight();
    return;
  }
  currentSelectedZone = cleanTargetZone;

  const data = sourceData || window.globalRouteSheetData || currentFilteredData || [];
  const provincesInZone = new Set();

  data.forEach(row => {
    const rowZone = cleanAllSpaces(row['โซน'] || row['ภาค'] || row.zone || row.region || '');
    if (rowZone === cleanTargetZone || rowZone.includes(cleanTargetZone) || cleanTargetZone.includes(rowZone)) {
      const prov = cleanAllSpaces(normalizeProvName(row['จังหวัด'] || row.province || row.province_th));
      if (prov) provincesInZone.add(prov);
    }
  });

  const provList = Array.from(provincesInZone);
  const matchedBounds = [];

  execGeoJsonLayer.eachLayer(layer => {
    const rawGeoName = layer.feature?.properties?.name || layer.feature?.properties?.name_th || '';
    const cleanGeo = cleanAllSpaces(rawGeoName);
    const thaiName = typeof getThaiProvinceName === 'function' ? getThaiProvinceName(rawGeoName) : rawGeoName;
    const cleanThai = cleanAllSpaces(thaiName);

    const isMatch = provincesInZone.has(cleanGeo) ||
                    provincesInZone.has(cleanThai) ||
                    provList.some(p => cleanThai.includes(p) || p.includes(cleanThai));

    layer._isZoneMatch = isMatch;

    if (isMatch) {
      layer.setStyle({
        fillColor: layer._baseColor,
        weight: 2.5,
        color: '#f97316',
        opacity: 1.0,
        fillOpacity: 0.85
      });
      layer.bringToFront();
      matchedBounds.push(layer.getBounds());
    } else {
      layer.setStyle({
        fillColor: '#94a3b8',
        weight: 0.8,
        color: '#cbd5e1',
        opacity: 0.35,
        fillOpacity: 0.22
      });
    }
  });

  if (matchedBounds.length > 0) {
    const groupBounds = matchedBounds.reduce((acc, b) => acc.extend(b), L.latLngBounds(matchedBounds[0]));
    execMap.fitBounds(groupBounds, { padding: [30, 30], maxZoom: 8 });
  }

  const mapContainer = document.getElementById('map-exec-heatmap') || execMap.getContainer();
  if (mapContainer) {
    mapContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function resetExecMapHighlight() {
  if (!execMap || !execGeoJsonLayer) return;
  currentSelectedZone = null;

  execGeoJsonLayer.eachLayer(layer => {
    layer._isZoneMatch = false;
    layer.setStyle({
      fillColor: layer._baseColor,
      weight: 1,
      color: '#ffffff',
      opacity: 0.9,
      fillOpacity: layer._baseOpacity
    });
  });

  execMap.setView([13.75, 100.5], 5);
}

// ==============================================================================
// 5. DASHBOARD ROUTE & HEATMAP VISUALIZATION CONTROLLER (SYNCHRONIZED)
// ==============================================================================

function updateMapDisplay(filteredData) {
  if (typeof dashMap === 'undefined' || !dashMap) return;

  if (!dashMap._loaded) {
    dashMap.whenReady(() => {
      renderDashboardLayersByMode(filteredData);
    });
    return;
  }

  renderDashboardLayersByMode(filteredData);
}

function renderDashboardLayersByMode(filteredData = []) {
  if (!dashMap) return;

  const displayMode = (typeof state !== 'undefined' && state?.activeFilters?.displayMode) || 'routes';
  const metric = (typeof state !== 'undefined' && state?.activeFilters?.heatMetric) || 'volume';
  const theme = (typeof state !== 'undefined' && state?.activeFilters?.heatTheme) || 'thermal';
  const radius = (typeof state !== 'undefined' && state?.activeFilters?.heatRadius) || 35;

  // 1. โหมด Heatmap อย่างเดียว: ซ่อนเส้นทาง แล้ววาดเฉพาะความร้อน
  if (displayMode === 'heatmap') {
    if (dashLayerGrp) dashLayerGrp.clearLayers();
    if (typeof renderUniqueDCPins === 'function') {
      renderUniqueDCPins(filteredData, dashMap, dashLayerGrp);
    }
    renderHeatmap(filteredData, metric, theme, radius);
    return;
  }

  // 2. โหมด Hybrid: วาดทั้งเส้นทาง และความร้อน Heatmap ซ้อนกัน
  if (displayMode === 'hybrid') {
    drawDashboardRoutes(filteredData);
    renderHeatmap(filteredData, metric, theme, radius);
    return;
  }

  // 3. โหมด Routes (ค่าเริ่มต้น): วาดเฉพาะเส้นทาง และล้าง Heatmap ออก
  if (currentHeatLayer && dashMap) {
    dashMap.removeLayer(currentHeatLayer);
    currentHeatLayer = null;
  }
  drawDashboardRoutes(filteredData);
}

function drawDashboardRoutes(filteredData = []) {
  if (!dashMap) return;

  const renderToken = mapRenderRequestId;

  console.debug('[MAP] Drawing routes:', filteredData.length);

  if (dashLayerGrp) {
    dashLayerGrp.clearLayers();
  } else {
    dashLayerGrp = L.layerGroup().addTo(dashMap);
  }

  routePolylineMap = {};
  currentHighlightedKey = null;

  if (!filteredData.length) return;

  const mapContainer = dashMap.getContainer();
  if (mapContainer && (mapContainer.offsetWidth === 0 || mapContainer.offsetHeight === 0)) {
    dashMap.invalidateSize();
  }

  // วาดป้ายหมุดต้นทาง DC
  if (typeof renderUniqueDCPins === 'function') {
    renderUniqueDCPins(filteredData, dashMap, dashLayerGrp);
  }

  const routeMap = {};
  let maxTrips = 0;

  filteredData.forEach(item => {
    const originName = String(item['ต้นทาง'] || item.origin || '').trim();
    const provName = String(item['จังหวัด'] || item.province || '').trim();
    let shipToDesc = String(item['Description(Ship-To (Outbound))'] || item.ship_to_desc || '').trim();
    const shipToCode = String(item['Ship-To (Outbound)'] || item.ship_to_code || item.ship_to || '').trim();
    if (!shipToDesc || shipToDesc === '-') shipToDesc = provName;
    if (!originName || !shipToDesc) return;

    const routeKey = getMapRouteKey(item);

    const tripVal = parseSafeNum(item['AVG Trip/Week'] || item.avg_trip_week, 0);
    const pctVal = parseSafeNum(item['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'] || item.pct_total, 0);
    const rowAvailPct = Math.max(0, 100 - pctVal);
    const rowActualAvailTrips = tripVal * (rowAvailPct / 100);
    const rawCarrier = String(item['Description(FwdAgent)'] || item.fwd_agent_desc || item['ผู้รับเหมา'] || '').trim();

    if (!routeMap[routeKey]) {
      routeMap[routeKey] = {
        key: routeKey,
        from: originName,
        to: shipToDesc,
        shipToCode: shipToCode,
        province: provName,
        rawRow: item,
        totalTrips: 0,
        totalAvailTrips: 0,
        sumPct: 0,
        rowCount: 0,
        uniqueCarriers: new Set(),
        vendors: []
      };
    }

    routeMap[routeKey].totalTrips += tripVal;
    routeMap[routeKey].totalAvailTrips += rowActualAvailTrips;
    routeMap[routeKey].sumPct += pctVal;
    routeMap[routeKey].rowCount += 1;
    routeMap[routeKey].vendors.push(item);

    if (rawCarrier && rawCarrier !== '-' && rawCarrier !== 'ไม่ระบุ') {
      rawCarrier.split(/[,/|\n]+/).forEach(c => {
        const clean = c.trim();
        if (clean && clean !== '-' && clean !== 'ไม่ระบุ') routeMap[routeKey].uniqueCarriers.add(clean);
      });
    }

    if (routeMap[routeKey].totalTrips > maxTrips) maxTrips = routeMap[routeKey].totalTrips;
  });

  const allBoundsPoints = [];
  const isDarkTheme = isDarkMode();

  Object.values(routeMap).forEach((route, index) => {
    if (renderToken !== mapRenderRequestId) return;
    const originCoords = resolveLocationCoords(route.from);
    const destCoords = resolveDestinationCoords(route.rawRow || {
      'Description(Ship-To (Outbound))': route.to,
      'จังหวัด': route.province,
      'Ship-To (Outbound)': route.shipToCode,
      dest_lat: route.rawRow?.dest_lat,
      dest_lng: route.rawRow?.dest_lng
    });
    if (renderToken !== mapRenderRequestId) {
    console.debug('[MAP] Drawing interrupted by newer request');
    return;
  }

    if (!originCoords || !destCoords || 
        !isValidThailandCoord(originCoords[0], originCoords[1]) || 
        !isValidThailandCoord(destCoords[0], destCoords[1])) {
      return;
    }

    allBoundsPoints.push(originCoords, destCoords);

    const densityRatio = Math.sqrt(route.totalTrips / (maxTrips || 1));
    const lineWeight = Math.max(1.8, Math.min(2.8, 1.6 + densityRatio * 1.0));
    const lineOpacity = 0.92;

    const avgAvailPct = route.totalTrips > 0
      ? (route.totalAvailTrips / route.totalTrips) * 100
      : Math.max(0, 100 - (route.sumPct / (route.rowCount || 1)));

    const availTripsDay = route.totalAvailTrips / 6;

    let lineColor = '#10b981';
    let textColor = 'text-emerald-500';

    if (avgAvailPct === 0) {
      lineColor = '#475569';
      textColor = 'text-slate-900 dark:text-slate-100 font-black';
    } else if (avgAvailPct <= 30) {
      lineColor = '#ef4444';
      textColor = 'text-rose-500';
    } else if (avgAvailPct <= 70) {
      lineColor = '#f97316';
      textColor = 'text-orange-500';
    }

    const carriersList = Array.from(route.uniqueCarriers);
    const carriersHtml = carriersList.length > 0
      ? carriersList.map(c => `<div class="text-slate-800 dark:text-slate-200 font-bold leading-snug break-words text-right">• ${c}</div>`).join('')
      : '<span class="text-slate-400 text-right">-</span>';

    const curveOffset = 0.14 * (index % 2 === 0 ? 1 : -1);
    const curvePoints = getCurvePoints(originCoords[0], originCoords[1], destCoords[0], destCoords[1], curveOffset);

    // 1. เส้นขอบเงา Casing
    const shadowPolyline = L.polyline(curvePoints, {
      renderer: routeCanvasRenderer,
      color: isDarkTheme ? '#020617' : '#ffffff',
      weight: lineWeight + 1.6,
      opacity: isDarkTheme ? 0.45 : 0.7,
      interactive: false
    }).addTo(dashLayerGrp);

    // 2. เส้นทางหลัก
    const mainPolyline = L.polyline(curvePoints, {
      renderer: routeCanvasRenderer,
      color: lineColor,
      weight: lineWeight,
      opacity: lineOpacity,
      lineCap: 'round',
      lineJoin: 'round',
      pane: 'routePane'
    }).addTo(dashLayerGrp);

    // 3. จุดปลายทาง
    const destDotMarker = L.circleMarker(destCoords, {
      renderer: dotCanvasRenderer,
      radius: 3.2,
      fillColor: lineColor,
      fillOpacity: 1.0,
      color: '#ffffff',
      weight: 1.2,
      opacity: 1.0,
      pane: 'destDotPane'
    }).addTo(dashLayerGrp);

    const tooltipHtml = `
      <div class="p-2 min-w-[260px] max-w-[320px] font-sans">
        <div class="font-bold border-b pb-1 mb-1 border-slate-200 dark:border-slate-700 text-xs ${textColor}">
          ${route.from} &rarr; ${route.to}
        </div>
        <div class="text-[11px] space-y-1.5 mt-1.5">
          <div class="flex justify-between items-start bg-slate-50 dark:bg-zinc-800 p-2 rounded-lg gap-2">
            <span class="text-slate-500 dark:text-slate-400 shrink-0 font-medium text-[10px]">Carriers (${carriersList.length}):</span> 
            <div class="flex flex-col gap-1 flex-1 min-w-0">${carriersHtml}</div>
          </div>
          <div class="flex justify-between items-center bg-slate-50 dark:bg-zinc-800 p-1.5 rounded-lg">
            <span class="text-slate-500 dark:text-slate-400 font-medium">Sum Trip/Week:</span> 
            <strong class="text-slate-800 dark:text-slate-200 font-bold">${route.totalTrips.toFixed(2)} trips/wk</strong>
          </div>
          <div class="flex flex-col gap-1 bg-slate-50 dark:bg-zinc-800 p-1.5 rounded-lg">
            <div class="flex justify-between items-center">
              <span class="text-slate-500 dark:text-slate-400 font-medium">Available Backhaul:</span> 
              <strong class="font-black ${textColor}">${Math.round(avgAvailPct)}%</strong>
            </div>
            <div class="w-full bg-slate-200 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden mt-0.5">
              <div class="h-full transition-all" style="width: ${Math.min(avgAvailPct, 100)}%; background-color: ${lineColor}"></div>
            </div>
            <div class="flex justify-between items-center text-[10px] mt-1 pt-1 border-t border-slate-200/50 dark:border-slate-700">
              <span class="text-slate-400">Available Volume:</span>
              <strong class="${textColor}">~${route.totalAvailTrips.toFixed(1)} trips/wk <span class="text-[9px] font-normal text-slate-400">(~${availTripsDay.toFixed(1)} trips/day)</span></strong>
            </div>
          </div>
        </div>
      </div>
    `;

    mainPolyline.bindTooltip(tooltipHtml, { sticky: true, className: 'custom-leaflet-tooltip' });
    destDotMarker.bindTooltip(tooltipHtml, { sticky: true, className: 'custom-leaflet-tooltip' });

    const handleRouteClick = (e) => {
      L.DomEvent.stopPropagation(e);
      highlightMapRoute(route.key);
      if (typeof window.focusTableRowByMapKey === 'function') {
        window.focusTableRowByMapKey(route.key);
      }
    };

    mainPolyline.on('click', handleRouteClick);
    destDotMarker.on('click', handleRouteClick);

    routePolylineMap[route.key] = {
      main: mainPolyline,
      shadow: shadowPolyline,
      destDot: destDotMarker,
      baseWeight: lineWeight,
      baseOpacity: lineOpacity,
      color: lineColor
    };
  });

  dashMap.off('click', resetMapRouteStyles);
  dashMap.on('click', resetMapRouteStyles);

  if (allBoundsPoints.length > 0) {
    dashMap.fitBounds(L.latLngBounds(allBoundsPoints), { padding: [60, 60], maxZoom: 10 });
  }
  console.debug('[MAP] Drawing completed:', Object.keys(routePolylineMap).length);
}

function highlightMapRoute(targetKey) {
  if (!routePolylineMap || Object.keys(routePolylineMap).length === 0) return;
  if (currentHighlightedKey === targetKey) {
    resetMapRouteStyles();
    return;
  }
  currentHighlightedKey = targetKey;

  Object.keys(routePolylineMap).forEach(key => {
    const item = routePolylineMap[key];
    if (key === targetKey) {
      item.main.setStyle({ color: item.color, weight: item.baseWeight + 2.5, opacity: 1.0 });
      item.shadow.setStyle({ opacity: 0.85, weight: item.baseWeight + 4.5 });
      item.main.bringToFront();
      if (item.destDot) {
        item.destDot.setRadius(5.5);
        item.destDot.setStyle({ fillColor: item.color, color: '#ffffff', weight: 2, fillOpacity: 1, opacity: 1 });
        item.destDot.bringToFront();
      }
    } else {
      item.main.setStyle({ opacity: 0.1, weight: Math.max(1, item.baseWeight * 0.6) });
      item.shadow.setStyle({ opacity: 0.05 });
      if (item.destDot) {
        item.destDot.setStyle({ opacity: 0.15, fillOpacity: 0.15 });
      }
    }
  });
}

function resetMapRouteStyles() {
  if (!routePolylineMap) return;
  currentHighlightedKey = null;
  currentHighlightedOrigin = null;

  document.querySelectorAll('[id^="dc-pin-"]').forEach(el => {
    el.classList.remove('ring-4', 'ring-orange-400', 'scale-110');
  });
  
  Object.keys(routePolylineMap).forEach(key => {
    const item = routePolylineMap[key];
    item.main.setStyle({ color: item.color, weight: item.baseWeight, opacity: item.baseOpacity });
    item.shadow.setStyle({ opacity: 0.55, weight: item.baseWeight + 1.5 });
    if (item.destDot) {
      item.destDot.setRadius(2.2);
      item.destDot.setStyle({ fillColor: item.color, color: '#ffffff', weight: 0.8, fillOpacity: 0.85, opacity: 0.9 });
    }
  });

  const currentMode = typeof state !== 'undefined' ? state?.activeFilters?.displayMode : 'routes';
  if (currentMode === 'heatmap' || currentMode === 'hybrid') {
    const activeData = typeof getFilteredData === 'function' ? getFilteredData() : (window.globalRouteSheetData || []);
    const metric = state?.activeFilters?.heatMetric || 'volume';
    const theme = state?.activeFilters?.heatTheme || 'thermal';
    const radius = state?.activeFilters?.heatRadius || 35;
    renderHeatmap(activeData, metric, theme, radius);
  }

  if (typeof applyDynamicFilters === 'function') {
    applyDynamicFilters();
  }
}

// ==============================================================================
// 6. ORIGIN DC PIN & FILTERING
// ==============================================================================
function renderUniqueDCPins(filteredData, targetMap = dashMap, targetLayerGrp = dashLayerGrp) {
  if (!targetMap || !targetLayerGrp || !filteredData || filteredData.length === 0) return;

  const uniqueOrigins = [...new Set(
    filteredData.map(row => String(row['ต้นทาง'] || row.origin || '').trim()).filter(Boolean)
  )];

  uniqueOrigins.forEach(originName => {
    const coords = resolveLocationCoords(originName);
    if (!coords || !isValidThailandCoord(coords[0], coords[1])) return;

    const cleanOrigin = cleanAllSpaces(originName);
    const isFocused = currentHighlightedOrigin === cleanOrigin;

    const customHtml = `
      <div id="dc-pin-${cleanOrigin}" class="hub-badge hub-badge-plant shadow-md cursor-pointer transition-all duration-300 ${isFocused ? 'ring-4 ring-orange-400 scale-110' : 'hover:scale-105'}">
        <span class="node-pulse-dot bg-orange-500"></span>
        <span class="font-bold font-sans">${originName}</span>
      </div>
    `;

    const marker = L.marker(coords, {
      icon: L.divIcon({ 
        html: customHtml, 
        className: 'custom-hub-marker', 
        iconSize: [90, 24], 
        iconAnchor: [45, 12] 
      }),
      pane: 'dcPane'
    }).addTo(targetLayerGrp);

    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      highlightRoutesByOrigin(originName, coords);
    });
  });
}

function highlightRoutesByOrigin(originName, originCoords) {
  if (!routePolylineMap || Object.keys(routePolylineMap).length === 0) return;

  const cleanTargetOrigin = cleanAllSpaces(originName);

  if (currentHighlightedOrigin === cleanTargetOrigin) {
    resetMapRouteStyles();
    return;
  }

  currentHighlightedOrigin = cleanTargetOrigin;
  currentHighlightedKey = null;

  const matchedBounds = [];
  if (originCoords) matchedBounds.push(originCoords);

  Object.keys(routePolylineMap).forEach(key => {
    const item = routePolylineMap[key];
    const isOriginMatch = key.startsWith(`${cleanTargetOrigin}__`);

    if (isOriginMatch) {
      item.main.setStyle({ color: item.color, weight: item.baseWeight + 1.5, opacity: 1.0 });
      item.shadow.setStyle({ opacity: 0.9, weight: item.baseWeight + 3.5 });
      item.main.bringToFront();

      if (item.destDot) {
        item.destDot.setRadius(4.5);
        item.destDot.setStyle({ fillColor: item.color, color: '#ffffff', weight: 1.5, fillOpacity: 1, opacity: 1 });
        item.destDot.bringToFront();
        matchedBounds.push(item.destDot.getLatLng());
      }
    } else {
      item.main.setStyle({ opacity: 0.05, weight: Math.max(1, item.baseWeight * 0.5) });
      item.shadow.setStyle({ opacity: 0.01 });
      if (item.destDot) {
        item.destDot.setStyle({ opacity: 0.05, fillOpacity: 0.05 });
      }
    }
  });

  document.querySelectorAll('[id^="dc-pin-"]').forEach(el => {
    el.classList.remove('ring-4', 'ring-orange-400', 'scale-110');
  });
  const activePin = document.getElementById(`dc-pin-${cleanTargetOrigin}`);
  if (activePin) {
    activePin.classList.add('ring-4', 'ring-orange-400', 'scale-110');
  }

  if (dashMap && matchedBounds.length > 0) {
    dashMap.fitBounds(L.latLngBounds(matchedBounds), { padding: [60, 60], maxZoom: 9 });
  }

  if (typeof window.filterTableByOrigin === 'function') {
    window.filterTableByOrigin(originName);
  }

  const currentMode = typeof state !== 'undefined' ? state?.activeFilters?.displayMode : 'routes';
  if (currentMode === 'heatmap' || currentMode === 'hybrid') {
    const activeData = typeof getFilteredData === 'function' ? getFilteredData() : (window.globalRouteSheetData || []);
    const metric = state?.activeFilters?.heatMetric || 'volume';
    const theme = state?.activeFilters?.heatTheme || 'thermal';
    const radius = state?.activeFilters?.heatRadius || 35;
    renderHeatmap(activeData, metric, theme, radius);
  }
}

// ==============================================================================
// 7. SIMULATION & ROAD ROUTE VISUALIZATION
// ==============================================================================
async function fetchRealRoadGeometry(startLatLng, endLatLng) {
  if (!startLatLng || !endLatLng) return null;
  const cacheKey = `${startLatLng[0].toFixed(5)},${startLatLng[1].toFixed(5)}_${endLatLng[0].toFixed(5)},${endLatLng[0].toFixed(5)}`;
  if (window.roadRouteGeometryCache[cacheKey]) return window.roadRouteGeometryCache[cacheKey];

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${startLatLng[1]},${startLatLng[0]};${endLatLng[1]},${endLatLng[0]}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Routing error');
    const data = await response.json();
    if (data.routes && data.routes.length > 0) {
      const routeInfo = data.routes[0];
      const roadCoordinates = routeInfo.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      const result = {
        latlngs: [[startLatLng[0], startLatLng[1]], ...roadCoordinates, [endLatLng[0], endLatLng[1]]],
        distanceKm: (routeInfo.distance / 1000).toFixed(1),
        durationHr: (routeInfo.duration / 3600).toFixed(1)
      };
      window.roadRouteGeometryCache[cacheKey] = result;
      return result;
    }
  } catch (err) {
    console.warn("OSRM API offline, fallback to curve:", err);
  }

  return {
    latlngs: getCurvePoints(startLatLng[0], startLatLng[1], endLatLng[0], endLatLng[1], 0.05),
    distanceKm: null,
    durationHr: null
  };
}

function highlightMapRouteById(selectedSubconId) {
  if (!window.simSubconRouteLayers) return;
  Object.keys(window.simSubconRouteLayers).forEach(subconId => {
    const layerGroup = window.simSubconRouteLayers[subconId];
    if (!layerGroup) return;
    const isMatch = String(subconId) === String(selectedSubconId);

    layerGroup.eachLayer(layer => {
      if (layer instanceof L.Polyline) {
        if (isMatch) {
          layer.setStyle({ opacity: 1, weight: 5, color: '#f97316' });
          if (typeof layer.bringToFront === 'function') layer.bringToFront();
        } else {
          layer.setStyle({ opacity: 0.15, weight: 2, color: '#94a3b8' });
        }
      } else if (layer instanceof L.Marker && typeof layer.setOpacity === 'function') {
        layer.setOpacity(isMatch ? 1 : 0.3);
      }
    });
  });
}

async function drawAllSheetRoutesOnSimMap(subconData, originName, provinceName, customerInfo = {}, originInfo = null) {
  if (!simMap) return;
  if (simLayerGrp) simLayerGrp.clearLayers();
  else simLayerGrp = L.layerGroup().addTo(simMap);

  if (window.simSubconRouteLayers) {
    Object.values(window.simSubconRouteLayers).forEach(group => {
      if (simMap.hasLayer(group)) simMap.removeLayer(group);
    });
  }
  window.simSubconRouteLayers = {};
  if (!subconData || subconData.length === 0) return;

  let startLat = originInfo?.lat;
  let startLng = originInfo?.lng;
  if (!startLat || !startLng) {
    const originCoords = resolveLocationCoords(originName) || [13.7563, 100.5018];
    startLat = originCoords[0];
    startLng = originCoords[1];
  }

  let endLat = parseFloat(customerInfo?.lat);
  let endLng = parseFloat(customerInfo?.lng);
  if (isNaN(endLat) || isNaN(endLng)) {
    const destCoords = resolveDestinationCoords({
      'Description(Ship-To (Outbound))': customerInfo?.name || provinceName,
      'จังหวัด': provinceName
    }) || [14.0, 100.6];
    endLat = destCoords[0];
    endLng = destCoords[1];
  }

  const originCoords = [startLat, startLng];
  const destCoords = [endLat, endLng];

  L.marker(originCoords, {
    icon: L.divIcon({ className: 'custom-hub-marker', html: `<div class="hub-badge hub-badge-plant"><span class="node-pulse-dot bg-orange-500"></span><span>${originName}</span></div>`, iconSize: [90, 24], iconAnchor: [45, 12] })
  }).addTo(simLayerGrp);

  L.marker(destCoords, {
    icon: L.divIcon({ className: 'custom-hub-marker', html: `<div class="hub-badge hub-badge-shipto"><span class="node-pulse-dot bg-blue-500"></span><span>${customerInfo.name || provinceName}</span></div>`, iconSize: [100, 24], iconAnchor: [50, 12] })
  }).addTo(simLayerGrp);

  const roadData = await fetchRealRoadGeometry(originCoords, destCoords);
  const roadPoints = roadData.latlngs;
  const isDarkTheme = isDarkMode();

  subconData.forEach((item, index) => {
    const subconId = String(item['ID'] || item.id || index);
    const layerGroup = L.layerGroup();
    const fwdAgent = item['Description(FwdAgent)'] || item.fwd_agent_desc || item.fwdAgent || 'ไม่ระบุผู้รับเหมา';
    const pctTotal = parseSafeNum(item['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'] || item.pct_total || item.pctTotal, 0);
    const availableCap = Math.max(0, 100 - pctTotal);

    let lineColor = '#10b981';
    if (pctTotal > 60) lineColor = '#3b82f6';
    if (pctTotal > 80) lineColor = '#f97316';

    const casingLine = L.polyline(roadPoints, {
      color: isDarkTheme ? '#0f172a' : '#ffffff',
      weight: 6,
      opacity: 0.8
    });
    layerGroup.addLayer(casingLine);

    const mainLine = L.polyline(roadPoints, {
      color: lineColor,
      weight: 3.5,
      opacity: 0.95
    });

    const distLabel = roadData.distanceKm ? ` | ${roadData.distanceKm} กม. (~${roadData.durationHr} ชม.)` : '';
    const tooltipHtml = `
      <div class="p-1.5 min-w-[200px] font-sans">
        <div class="font-bold border-b pb-1 mb-1 text-xs text-orange-500">${fwdAgent}</div>
        <div class="text-[11px] space-y-1 text-slate-700 dark:text-slate-200">
          <div class="flex justify-between"><span>เส้นทาง:</span> <strong>${originName || '-'} &rarr; ${provinceName || '-'}${distLabel}</strong></div>
          <div class="flex justify-between"><span>ภาระงานรวม:</span> <strong>${pctTotal}%</strong></div>
          <div class="flex justify-between"><span>โควตาว่าง:</span> <strong class="text-emerald-500">${availableCap}%</strong></div>
        </div>
      </div>
    `;
    mainLine.bindTooltip(tooltipHtml, { sticky: true, className: 'custom-leaflet-tooltip' });
    layerGroup.addLayer(mainLine);

    layerGroup.addTo(simMap);
    window.simSubconRouteLayers[subconId] = layerGroup;
  });

  simMap.fitBounds(L.latLngBounds([originCoords, destCoords]), { padding: [60, 60] });
}

// ==============================================================================
// 8. HEATMAP & DISPLAY CONTROLLER
// ==============================================================================
function renderHeatmap(filteredData, metric, themeKey, radius) {
  if (currentHeatLayer && dashMap) {
    dashMap.removeLayer(currentHeatLayer);
    currentHeatLayer = null;
  }
  if (!dashMap || !dashMap.getContainer()) return;

  // 💡 ตรวจสอบว่าแผนที่กำลังแสดงผลอยู่จริงและมีขนาดหน้าจอมากกว่า 0
  const container = dashMap.getContainer();
  const mapSize = dashMap.getSize();
  if (
    container.offsetWidth === 0 || 
    container.offsetHeight === 0 || 
    mapSize.x === 0 || 
    mapSize.y === 0 || 
    !filteredData || 
    filteredData.length === 0
  ) {
    return;
  }

  let targetData = filteredData;
  if (currentHighlightedOrigin) {
    targetData = filteredData.filter(item => {
      const orig = cleanAllSpaces(item['ต้นทาง'] || item.origin || item.fromId || '');
      return orig === currentHighlightedOrigin || orig.includes(currentHighlightedOrigin);
    });
  }

  if (targetData.length === 0) return;

  const nodeWeightMap = {};

  targetData.forEach(item => {
    const originName = String(item['ต้นทาง'] || item.origin || item.fromId || '').trim();
    const originCoords = resolveLocationCoords(originName);
    const destCoords = resolveDestinationCoords(item, item['จังหวัด'] || item.province);

    let w = 1.0;
    if (metric === 'volume') {
      const vol = parseSafeNum(item['AVG Trip/Week'] || item.avg_trip_week || item.volume, 0);
      w = vol > 0 ? vol : 1;
    } else if (metric === 'quota') {
      const pct = parseSafeNum(item['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'] || item.pct_total, 0);
      w = pct > 0 ? pct : 5;
    }

    if (originCoords && isValidThailandCoord(originCoords[0], originCoords[1])) {
      const k = `${originCoords[0]},${originCoords[1]}`;
      nodeWeightMap[k] = (nodeWeightMap[k] || 0) + w;
    }
    if (destCoords && isValidThailandCoord(destCoords[0], destCoords[1])) {
      const k = `${destCoords[0]},${destCoords[1]}`;
      nodeWeightMap[k] = (nodeWeightMap[k] || 0) + w;
    }
  });

  const maxW = Math.max(...Object.values(nodeWeightMap), 1);
  const heatPoints = [];

  Object.entries(nodeWeightMap).forEach(([coordStr, totalW]) => {
    const [lat, lon] = coordStr.split(',').map(Number);
    const normW = Math.min(1.0, Math.max(0.2, totalW / maxW));
    heatPoints.push([lat, lon, normW]);

    const spread = 0.018;
    for (let i = 0; i < 3; i++) {
      heatPoints.push([
        lat + (Math.random() - 0.5) * spread,
        lon + (Math.random() - 0.5) * spread,
        normW * 0.8
      ]);
    }
  });

  if (heatPoints.length > 0 && typeof L.heatLayer === 'function') {
    const themes = {
      thermal: { 0.2: '#3b82f6', 0.4: '#10b981', 0.6: '#eab308', 0.8: '#f97316', 1.0: '#ef4444' },
      cool: { 0.2: '#06b6d4', 0.6: '#3b82f6', 1.0: '#1d4ed8' },
      spectral: { 0.2: '#3b82f6', 0.5: '#10b981', 0.8: '#f59e0b', 1.0: '#ef4444' },
      danger: { 0.3: '#fef08a', 0.7: '#f97316', 1.0: '#dc2626' }
    };

    const gradient = themes[themeKey] || themes.thermal;
    const rVal = parseInt(radius) || 45;

    currentHeatLayer = L.heatLayer(heatPoints, {
      radius: rVal,
      blur: 20,
      maxZoom: 18,
      max: 0.6,
      minOpacity: 0.35,
      gradient: gradient,
      pane: 'heatPane'
    }).addTo(dashMap);
  }
}
/**
 * ดึงข้อมูลเส้นทางขนส่ง พร้อมระบบ Persistent Cache ป้องกันการ Query ซ้ำ
 * @param {boolean} forceRefresh - กำหนด true เมื่อต้องการบังคับดึงข้อมูลใหม่
 */
async function fetchRouteMasterData(forceRefresh = false) {
  const CACHE_KEY = 'cache_supabase_routes_data';
  const CACHE_TIME_KEY = 'cache_supabase_routes_time';
  const CACHE_TTL_MS = 15 * 60 * 1000; // อายุแคช 15 นาที

  const now = Date.now();
  const cachedTime = Number(sessionStorage.getItem(CACHE_TIME_KEY) || 0);
  const isCacheValid = (now - cachedTime) < CACHE_TTL_MS;

  // 1. ถ้ามีแคชและยังไม่หมดอายุ ให้ใช้ข้อมูลจากเครื่องทันที
  if (!forceRefresh && isCacheValid) {
    const rawData = sessionStorage.getItem(CACHE_KEY);
    if (rawData) {
      try {
        const parsed = JSON.parse(rawData);
        window.globalRouteSheetData = parsed;
        return parsed;
      } catch (e) {
        sessionStorage.removeItem(CACHE_KEY);
      }
    }
  }

  // 2. ดึงข้อมูลใหม่จาก Supabase View
  const { data, error } = await supabaseClient
    .from('view_routes_with_coords')
    .select('*');

  if (error) {
    console.error('Error fetching routes from Supabase:', error);
    throw error;
  }

  // 3. บันทึกผลลัพธ์ลง sessionStorage
  window.globalRouteSheetData = data || [];
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
    sessionStorage.setItem(CACHE_TIME_KEY, String(now));
  } catch (quotaErr) {
    console.warn('sessionStorage full: data retained in window memory only.');
  }

  return window.globalRouteSheetData;
}
// ...existing code...

let mapRenderRequestId = 0;
let lastMapRenderSignature = '';

function getMapRenderSignature(filteredData = []) {
  const mode = state?.activeFilters?.displayMode || 'routes';
  const metric = state?.activeFilters?.heatMetric || 'all';

  const first = filteredData[0]?._parsed?.searchIndex || '';
  const last = filteredData[filteredData.length - 1]?._parsed?.searchIndex || '';

  return `${mode}|${metric}|${filteredData.length}|${first}|${last}`;
}

function runWhenIdle(callback) {
  if ('requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout: 500 });
  }

  return window.setTimeout(callback, 80);
}

function cancelIdleTask(taskId) {
  if (!taskId) return;

  if ('cancelIdleCallback' in window) {
    window.cancelIdleCallback(taskId);
  } else {
    window.clearTimeout(taskId);
  }
}

// ...existing code...

let pendingMapIdleTask = null;

function updateMapDisplay(filteredData = []) {
  if (!dashMap) return;

  const signature = getMapRenderSignature(filteredData);

  // ไม่วาดซ้ำ ถ้าข้อมูลและโหมดเหมือนเดิม
  if (signature === lastMapRenderSignature) {
    console.debug('[MAP] Render skipped: same data signature');
    return;
  }

  lastMapRenderSignature = signature;

  // ยกเลิกงานวาดรอบก่อน
  mapRenderRequestId += 1;
  const currentRequestId = mapRenderRequestId;

  if (pendingMapIdleTask) {
    cancelIdleTask(pendingMapIdleTask);
  }

  pendingMapIdleTask = runWhenIdle(() => {
    if (currentRequestId !== mapRenderRequestId) {
      console.debug('[MAP] Stale render cancelled');
      return;
    }

    requestAnimationFrame(() => {
      if (currentRequestId !== mapRenderRequestId) return;

      console.time('[MAP] Render dashboard layers');

      if (!dashMap._loaded) {
        dashMap.whenReady(() => {
          if (currentRequestId === mapRenderRequestId) {
            renderDashboardLayersByMode(filteredData);
          }
        });
      } else {
        renderDashboardLayersByMode(filteredData);
      }

      console.timeEnd('[MAP] Render dashboard layers');
    });
  });
}


// ...existing code...