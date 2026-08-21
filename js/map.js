/**
 * ==============================================================================
 * MAP CONTROLLER & VISUALIZATION ENGINE (REFACTORED & SYNCHRONIZED)
 * ==============================================================================
 */

// 1. Global Map Instances & Layer Groups
let dashMap = null, simMap = null, execMap = null;
let dashLayerGrp = null, simLayerGrp = null;
let tileLayerObj = null, simTileLayer = null, execTileLayer = null;
let currentHeatLayer = null, execGeoJsonLayer = null, execHeatLayer = null;

// 2. Simulation & Animation State
let movingMarkers = [];
let animationFrameId = null;
let lastAnimationTime = 0;
window.simSubconRouteLayers = window.simSubconRouteLayers || {};

// 3. Performance & Lookup Caches
let cachedThailandGeoJSON = null;
const coordCache = {};
const nodeCache = {};
let routePolylineMap = {};
let currentHighlightedKey = null;
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

// 💡 2-Dimensional Map Key มาตรฐานเดียวกับ app.js
function getMapRouteKey(row) {
  if (!row) return '';
  const origin = cleanAllSpaces(row['ต้นทาง'] || row.origin);
  const prov = cleanAllSpaces(row['จังหวัด'] || row.province);
  let shipTo = cleanAllSpaces(row['Description(Ship-To (Outbound))'] || row.ship_to_desc);
  if (!shipTo || shipTo === '-') shipTo = prov;
  return `${origin}__${shipTo}`;
}

// ==============================================================================
// 2. MAP INITIALIZATION & TILES
// ==============================================================================
function initMaps() {
  const mapOptions = { zoomControl: false, attributionControl: false, preferCanvas: true };

  const dashContainer = document.getElementById('map-dashboard');
  if (dashContainer) {
    if (dashMap) { dashMap.remove(); dashMap = null; }
    dashMap = L.map('map-dashboard', mapOptions).setView([13.75, 100.5], 6);
    dashLayerGrp = L.layerGroup().addTo(dashMap);
    initMapPanes(dashMap);
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
}

function initMapPanes(map) {
  if (!map) return;
  if (!map.getPane('heatPane')) {
    map.createPane('heatPane');
    map.getPane('heatPane').style.zIndex = 250;
    map.getPane('heatPane').style.pointerEvents = 'none';
  }
  if (!map.getPane('markerPane')) {
    map.createPane('markerPane');
    map.getPane('markerPane').style.zIndex = 600;
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
function initShippingLocationLookup(shippingLocationRows = []) {
  window.shippingLocationLookup = {};
  window.shippingLocationComposite = {};

  shippingLocationRows.forEach(row => {
    const shipToCode = String(row['Ship-To (Outbound)'] || row.ship_to_code || row.ship_to || '').trim();
    const shipToDesc = String(row['Description(Ship-To (Outbound))'] || row.ship_to_desc || '').trim();
    const city = String(row['City'] || row.city || row['จังหวัด'] || '').trim();
    const rawLatLng = row['LAT,LONG'] || row['lat_long'] || row['lat,long'] || '';
    const coords = parseLatLng(rawLatLng);

    if (coords && isValidThailandCoord(coords.lat, coords.lng)) {
      const locData = {
        lat: coords.lat,
        lng: coords.lng,
        city: city,
        shipToDesc: shipToDesc,
        shipToCode: shipToCode
      };

      const cDesc = cleanAllSpaces(shipToDesc);
      const cCity = cleanAllSpaces(city);
      const cCode = cleanAllSpaces(shipToCode);

      if (cCity && cDesc) window.shippingLocationComposite[`${cCity}__${cDesc}`] = locData;
      if (cCode && cCode !== '-') window.shippingLocationLookup[cCode] = locData;
      if (cDesc) window.shippingLocationLookup[cDesc] = locData;
    }
  });
}

function resolveDestinationCoords(rowOrDesc, provinceFallback = '') {
  if (!rowOrDesc) return null;

  // 💡 1. ถ้ามีพิกัด dest_lat, dest_lng ติดมาจาก Supabase View ให้ใช้ทันที (เร็วที่สุดและตรงที่สุด)
  if (typeof rowOrDesc === 'object') {
    const lat = parseFloat(rowOrDesc.dest_lat || rowOrDesc.lat);
    const lng = parseFloat(rowOrDesc.dest_lng || rowOrDesc.lng);

    if (!isNaN(lat) && !isNaN(lng) && isValidThailandCoord(lat, lng)) {
      return [lat, lng];
    }
  }

  // 💡 2. Fallback: ถ้าไม่มีพิกัดติดมา ให้ค้นหาพิกัดกึ่งกลางจังหวัด
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

  if (!result && typeof shipToLocationMap !== 'undefined') {
    if (shipToLocationMap[exactKey]) result = [shipToLocationMap[exactKey].lat, shipToLocationMap[exactKey].lng];
    else if (shipToLocationMap[cleanKey]) result = [shipToLocationMap[cleanKey].lat, shipToLocationMap[cleanKey].lng];
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

function getCurvePoints(lat1, lng1, lat2, lng2, offset = 0) {
  const points = [];
  const midLat = (lat1 + lat2) / 2;
  const midLng = (lng1 + lng2) / 2;
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  const ctrlLat = midLat - dLng * offset;
  const ctrlLng = midLng + dLat * offset;

  points.push([lat1, lng1]);
  for (let t = 0.05; t < 0.95; t += 0.05) {
    const lat = (1 - t) * (1 - t) * lat1 + 2 * (1 - t) * t * ctrlLat + t * t * lat2;
    const lng = (1 - t) * (1 - t) * lng1 + 2 * (1 - t) * t * ctrlLng + t * t * lng2;
    points.push([lat, lng]);
  }
  points.push([lat2, lng2]);
  return points;
}

// ==============================================================================
// 4. EXECUTIVE DASHBOARD CHOROPLETH
// ==============================================================================
async function loadThailandGeoJSON() {
  if (cachedThailandGeoJSON) return cachedThailandGeoJSON;
  const cdnUrls = [
    'https://cdn.jsdelivr.net/gh/apisit/thailand.json@master/thailand.json',
    'https://raw.githubusercontent.com/apisit/thailand.json/master/thailand.json'
  ];
  for (const url of cdnUrls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        cachedThailandGeoJSON = await response.json();
        return cachedThailandGeoJSON;
      }
    } catch (e) {
      console.warn(`GeoJSON mirror fallback: ${url}`);
    }
  }
  throw new Error("Unable to load Thailand GeoJSON.");
}

function getExecChoroplethColor(availPct) {
  if (availPct === null || availPct === undefined || isNaN(availPct)) return '#f1f5f9';
  const val = parseFloat(availPct);
  if (val === 0) return '#334155';
  if (val <= 30) return '#ef4444';
  if (val <= 70) return '#f59e0b';
  return '#10b981';
}

function getThaiProvinceName(enName) {
  if (!enName) return '-';
  const clean = cleanAllSpaces(enName);
  if (PROVINCE_NAME_MAP[clean]) return PROVINCE_NAME_MAP[clean];
  const matchedKey = Object.keys(PROVINCE_NAME_MAP).find(k => clean.includes(k) || k.includes(clean));
  return matchedKey ? PROVINCE_NAME_MAP[matchedKey] : enName;
}

async function renderExecRouteHeatmap(data) {
  if (!execMap) return;
  if (execGeoJsonLayer) { 
    execMap.removeLayer(execGeoJsonLayer); 
    execGeoJsonLayer = null; 
  }
  if (!data || data.length === 0) return;

  // 1. สร้าง Map ดัชนีข้อมูลรายจังหวัด (รองรับทั้ง View สรุป และข้อมูลดิบ)
  const provMap = {};
  const isSummaryView = data[0]?.hasOwnProperty('avg_avail_pct') || data[0]?.hasOwnProperty('province_th');

  if (isSummaryView) {
    // 💡 ดึงจาก view_exec_province_summary (ประมวลผลเร็วพิเศษ)
    data.forEach(row => {
      const keyTh = cleanAllSpaces(row.province_th || '');
      const keyEn = cleanAllSpaces(row.province_en || '');
      const item = {
        displayName: row.province_th || row.province_en,
        avgAvail: row.has_data && row.avg_avail_pct !== null ? Number(row.avg_avail_pct) : null,
        count: Number(row.total_routes || 0),
        hasData: Boolean(row.has_data && Number(row.total_routes) > 0)
      };
      if (keyTh) provMap[keyTh] = item;
      if (keyEn) provMap[keyEn] = item;
    });
  } else {
    // 💡 Fallback กรณีส่งข้อมูลเส้นทางดิบ (Raw routes) เข้ามา
    data.forEach(row => {
      const rawProv = String(row['จังหวัด'] || row.province || '').trim();
      if (rawProv && rawProv !== '-' && rawProv !== 'undefined') {
        const cleanProv = cleanAllSpaces(rawProv);
        const pctTotal = parseSafeNum(row['รวม% รับงานต่อทั้งหมด(ห้ามเกิน100%)'] || row.pct_total, 0);
        const availPct = Math.max(0, 100 - pctTotal);

        if (!provMap[cleanProv]) {
          provMap[cleanProv] = { count: 0, sumAvail: 0, displayName: rawProv };
        }
        provMap[cleanProv].count += 1;
        provMap[cleanProv].sumAvail += availPct;
      }
    });

    Object.keys(provMap).forEach(k => {
      const item = provMap[k];
      item.avgAvail = Math.round(item.sumAvail / item.count);
      item.hasData = true;
    });
  }

  try {
    const geoData = await loadThailandGeoJSON();

    execGeoJsonLayer = L.geoJSON(geoData, {
      style: (feature) => {
        const rawGeoName = feature.properties?.name || feature.properties?.name_th || '';
        const cleanGeo = cleanAllSpaces(rawGeoName);
        const thaiName = typeof getThaiProvinceName === 'function' ? getThaiProvinceName(rawGeoName) : rawGeoName;
        const cleanThai = cleanAllSpaces(thaiName);

        // ดึงสถิติด้วยชื่ออังกฤษ หรือชื่อไทย
        const stat = provMap[cleanGeo] || provMap[cleanThai] || 
                     Object.entries(provMap).find(([k]) => k.includes(cleanThai) || cleanThai.includes(k))?.[1];

        const avgAvail = stat && stat.hasData ? stat.avgAvail : null;

        return {
          fillColor: getExecChoroplethColor(avgAvail),
          weight: 1,
          opacity: 0.9,
          color: '#ffffff',
          fillOpacity: avgAvail !== null ? 0.75 : 0.2
        };
      },
      onEachFeature: (feature, layer) => {
        const rawGeoName = feature.properties?.name || feature.properties?.name_th || '';
        const cleanGeo = cleanAllSpaces(rawGeoName);
        const thaiName = typeof getThaiProvinceName === 'function' ? getThaiProvinceName(rawGeoName) : rawGeoName;
        const cleanThai = cleanAllSpaces(thaiName);

        const stat = provMap[cleanGeo] || provMap[cleanThai] || 
                     Object.entries(provMap).find(([k]) => k.includes(cleanThai) || cleanThai.includes(k))?.[1];

        const hasData = Boolean(stat && stat.hasData);
        const avgAvail = hasData ? stat.avgAvail : 0;
        const count = stat ? stat.count : 0;
        const displayTitle = stat?.displayName || thaiName;

        layer.bindTooltip(`
          <div class="px-2 py-1 text-xs font-sans">
            <strong class="text-slate-800 dark:text-white block font-bold">${displayTitle}</strong>
            ${hasData ? `
              <span class="text-emerald-600 dark:text-emerald-400 font-extrabold block">Available Backhaul: ${avgAvail}%</span>
              <span class="text-slate-400 block text-[10px]">${count.toLocaleString()} Routes</span>
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
            if (execGeoJsonLayer) execGeoJsonLayer.resetStyle(e.target);
          }
        });
      }
    }).addTo(execMap);

  } catch (err) {
    console.error('Failed to render Executive Map:', err);
  }
}
// ==============================================================================
// 5. DASHBOARD ROUTE MAP RENDERING (EXACT MATCH WITH TABLE)
// ==============================================================================
function drawDashboardRoutes(filteredData = []) {
  if (!dashMap) return;

  if (!dashLayerGrp) {
    dashLayerGrp = L.layerGroup().addTo(dashMap);
  } else {
    dashLayerGrp.clearLayers();
  }

  routePolylineMap = {};
  currentHighlightedKey = null;
  if (!filteredData || filteredData.length === 0) return;

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
    const originCoords = resolveLocationCoords(route.from);
    const destCoords = resolveDestinationCoords(route.rawRow || {
      'Description(Ship-To (Outbound))': route.to,
      'จังหวัด': route.province,
      'Ship-To (Outbound)': route.shipToCode
    });

    if (!originCoords || !destCoords || 
        !isValidThailandCoord(originCoords[0], originCoords[1]) || 
        !isValidThailandCoord(destCoords[0], destCoords[1])) {
      return;
    }

    allBoundsPoints.push(originCoords, destCoords);

    const densityRatio = Math.sqrt(route.totalTrips / (maxTrips || 1));
    const lineWeight = Math.max(3, densityRatio * 12);
    const lineOpacity = Math.max(0.7, densityRatio);

    const avgPctTotal = route.sumPct / route.rowCount;
    const avgAvailPct = Math.max(0, 100 - avgPctTotal);
    const availTripsDay = route.totalAvailTrips / 6;

    let lineColor = '#10b981';
    let textColor = 'text-emerald-500';

    if (avgAvailPct === 0) {
      lineColor = '#000000';
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

    const curveOffset = 0.12 * (index % 2 === 0 ? 1 : -1);
    const curvePoints = getCurvePoints(originCoords[0], originCoords[1], destCoords[0], destCoords[1], curveOffset);

    const shadowPolyline = L.polyline(curvePoints, {
      color: lineColor === '#000000' ? '#ffffff' : (isDarkTheme ? '#0f172a' : '#ffffff'),
      weight: lineWeight + 3,
      opacity: 0.9
    }).addTo(dashLayerGrp);

    const mainPolyline = L.polyline(curvePoints, {
      color: lineColor,
      weight: lineWeight,
      opacity: lineOpacity,
      lineCap: 'round'
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

    mainPolyline.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      highlightMapRoute(route.key);
      if (typeof window.focusTableRowByMapKey === 'function') {
        window.focusTableRowByMapKey(route.key);
      }
    });

    routePolylineMap[route.key] = {
      main: mainPolyline,
      shadow: shadowPolyline,
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
      item.main.setStyle({ color: item.color, weight: item.baseWeight + 5, opacity: 1.0 });
      item.shadow.setStyle({ opacity: 0.9, weight: item.baseWeight + 8 });
      item.main.bringToFront();
    } else {
      item.main.setStyle({ opacity: 0.15, weight: Math.max(2, item.baseWeight * 0.5) });
      item.shadow.setStyle({ opacity: 0.05 });
    }
  });
}

function resetMapRouteStyles() {
  if (!routePolylineMap) return;
  currentHighlightedKey = null;
  
  Object.keys(routePolylineMap).forEach(key => {
    const item = routePolylineMap[key];
    item.main.setStyle({ color: item.color, weight: item.baseWeight, opacity: item.baseOpacity });
    item.shadow.setStyle({ opacity: 0.9, weight: item.baseWeight + 3 });
  });

  if (typeof applyDynamicFilters === 'function') {
    applyDynamicFilters();
  }
}

function renderUniqueDCPins(filteredData, targetMap = dashMap, targetLayerGrp = dashLayerGrp) {
  if (!targetMap || !targetLayerGrp || !filteredData || filteredData.length === 0) return;

  const uniqueOrigins = [...new Set(
    filteredData.map(row => String(row['ต้นทาง'] || row.origin || '').trim()).filter(Boolean)
  )];

  uniqueOrigins.forEach(originName => {
    const coords = resolveLocationCoords(originName);
    if (!coords || !isValidThailandCoord(coords[0], coords[1])) return;

    const customHtml = `
      <div class="hub-badge hub-badge-plant shadow-md">
        <span class="node-pulse-dot bg-orange-500"></span>
        <span class="font-bold font-sans">${originName}</span>
      </div>
    `;

    L.marker(coords, {
      icon: L.divIcon({ html: customHtml, className: 'custom-hub-marker', iconSize: [90, 24], iconAnchor: [45, 12] }),
      pane: 'markerPane'
    }).addTo(targetLayerGrp);
  });
}

// ==============================================================================
// 6. SIMULATION & ROAD ROUTE VISUALIZATION
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
// 7. HEATMAP & DISPLAY CONTROLLER
// ==============================================================================
function renderHeatmap(filteredData, metric, themeKey, radius) {
  if (currentHeatLayer && dashMap) {
    dashMap.removeLayer(currentHeatLayer);
    currentHeatLayer = null;
  }
  if (!dashMap || !dashMap.getContainer()) return;
  const container = dashMap.getContainer();
  if (container.clientWidth === 0 || container.clientHeight === 0 || !filteredData || filteredData.length === 0) return;

  const nodeWeightMap = {};

  filteredData.forEach(item => {
    const originName = String(item['ต้นทาง'] || item.origin || item.fromId || '').trim();
    let destName = String(item['Description(Ship-To (Outbound))'] || item.ship_to_desc || '').trim();
    if (!destName || destName === '-') destName = String(item['จังหวัด'] || item.province || item.toId || '').trim();

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

function updateMapDisplay(filteredData) {
  if (!dashMap) return;
  initMapPanes(dashMap);
  updateMapTiles();

  const mode = (typeof state !== 'undefined' && state?.activeFilters?.displayMode) || 'routes';
  const metric = (typeof state !== 'undefined' && state?.activeFilters?.heatMetric) || 'volume';
  const theme = (typeof state !== 'undefined' && state?.activeFilters?.heatTheme) || 'thermal';
  const radius = (typeof state !== 'undefined' && state?.activeFilters?.heatRadius) || 35;

  if (mode === 'routes') {
    drawDashboardRoutes(filteredData);
    if (currentHeatLayer && dashMap) {
      dashMap.removeLayer(currentHeatLayer);
      currentHeatLayer = null;
    }
  } else if (mode === 'heatmap') {
    if (dashLayerGrp) dashLayerGrp.clearLayers();
    renderHeatmap(filteredData, metric, theme, radius);
  } else if (mode === 'hybrid') {
    drawDashboardRoutes(filteredData);
    renderHeatmap(filteredData, metric, theme, radius);
  }
}