import { supabase } from '../lib/supabase.js';

const API_CONFIG = {
  BATCH_SIZE: 50000,
  TABLES: {
    ROUTES_VIEW: 'get_view_routes_with_coords_secure',
    EXEC_SUMMARY_VIEW: 'view_exec_province_summary',
    ORIGIN_LOCATIONS: 'brf_locations',
    PROVINCE_LOCATIONS: 'province_locations'
  },
  RPC: {
    EXEC_KPI: 'get_executive_summary_kpi'
  },
  ROUTE_COLUMNS: [
    'id',
    'origin',
    'customer_name',
    'customer_type',
    'product_category',
    'province',
    'zone',
    'truck_type',
    'fwd_agent_desc',
    'ship_to_desc',
    'avg_trip_week',
    'avg_off_peak',
    'avg_peak',
    'pct_brf_outside',
    'brf_outside_route',
    'pct_boonrawd',
    'pct_own',
    'pct_total',
    'dest_lat',
    'dest_lng',
    'is_exact_location'
  ].join(',')
};

let inFlightRouteFetchPromise = null;

// ==============================================================================
// 💡 CENTRALIZED ERROR HANDLER
// ==============================================================================
function handleApiError(error, contextMessage) {
  console.error(`[API ERROR] ${contextMessage}:`, error);
  let userMsg = 'เกิดข้อผิดพลาดในการดึงข้อมูล โปรดลองอีกครั้ง';

  if (error?.message === 'Failed to fetch') {
    userMsg = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ ตรวจสอบอินเทอร์เน็ตของคุณ';
  } else if (error?.code === 'PGRST301' || error?.code === '401') {
    userMsg = 'เซสชันหมดอายุ หรือไม่มีสิทธิ์เข้าถึง กรุณาเข้าสู่ระบบใหม่';
  } else if (error?.code === '42P01') {
    userMsg = 'โครงสร้างข้อมูลขัดข้อง (Table/View not found)';
  } else if (error?.message) {
    userMsg = error.message;
  }

  if (typeof window.showToast === 'function') {
    window.showToast(`⚠️ ${userMsg}`);
  }
  return null;
}

export function parseCoordinate(latVal, lngVal) {
  const lat = parseFloat(latVal);
  const lng = parseFloat(lngVal);
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}

export async function fetchNewRouteSheet(limit = null) {
  console.log('[API] 🚀 Start fetchNewRouteSheet()');
  console.time('[API] ⏱️ fetchNewRouteSheet Duration');

  if (inFlightRouteFetchPromise) {
    console.log('[API] ⏳ Promise already in flight, waiting...');
    return inFlightRouteFetchPromise;
  }

  inFlightRouteFetchPromise = (async () => {
    try {
      if (window.globalRouteSheetData && window.globalRouteSheetData.length > 0) {
        console.timeEnd('[API] ⏱️ fetchNewRouteSheet Duration');
        return window.globalRouteSheetData;
      }

      const CACHE_KEY = 'cache_routes_data';
      const storedData = sessionStorage.getItem(CACHE_KEY);
      if (storedData) {
        try {
          const parsed = JSON.parse(storedData);
          if (parsed && parsed.length > 0) {
            console.log(`[API] ✅ Loaded from SessionStorage (${parsed.length} rows)`);
            window.globalRouteSheetData = parsed;
            console.timeEnd('[API] ⏱️ fetchNewRouteSheet Duration');
            return parsed;
          }
        } catch (e) {
          console.warn('[API] ⚠️ Cache parse error, refetching...', e);
          sessionStorage.removeItem(CACHE_KEY);
        }
      }

      console.log('[API] 📡 Fetching fresh data from Supabase...');
      if (limit && typeof limit === 'number') {
        const { data, error } = await supabase
          .rpc(API_CONFIG.TABLES.ROUTES_VIEW)
          .select(API_CONFIG.ROUTE_COLUMNS)
          .order('id', { ascending: true })
          .limit(limit);

        if (error) throw error;
        window.globalRouteSheetData = data || [];
        return window.globalRouteSheetData;
      }

      const step = API_CONFIG.BATCH_SIZE || 50000;
      let combinedData = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const to = from + step - 1;
        const { data, error } = await supabase
          .rpc(API_CONFIG.TABLES.ROUTES_VIEW)
          .select(API_CONFIG.ROUTE_COLUMNS)
          .order('id', { ascending: true })
          .range(from, to);

        if (error) throw error;

        if (data && data.length > 0) {
          combinedData = combinedData.concat(data);
          if (data.length < step) {
            hasMore = false;
          } else {
            from += step;
          }
        } else {
          hasMore = false;
        }
      }

      console.log(`[API] ✅ DB Fetch Complete. Total: ${combinedData.length} rows.`);

      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(combinedData));
      } catch (err) {
        console.warn('[API] ⚠️ SessionStorage quota exceeded. Using memory only.');
      }

      window.globalRouteSheetData = combinedData;
      console.timeEnd('[API] ⏱️ fetchNewRouteSheet Duration');
      return combinedData;
    } catch (err) {
      handleApiError(err, 'fetchNewRouteSheet');
      return window.globalRouteSheetData || [];
    } finally {
      inFlightRouteFetchPromise = null;
    }
  })();

  return inFlightRouteFetchPromise;
}

export async function fetchExecProvinceSummary() {
  console.log('[API] 🚀 Start fetchExecProvinceSummary()');
  console.time('[API] ⏱️ fetchExecProvinceSummary Duration');

  const CACHE_KEY = 'cache_exec_summary';
  const stored = sessionStorage.getItem(CACHE_KEY);

  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      window.execRouteSummaryData = parsed;
      console.timeEnd('[API] ⏱️ fetchExecProvinceSummary Duration');
      return parsed;
    } catch (e) {
      sessionStorage.removeItem(CACHE_KEY);
    }
  }

  try {
    const { data, error } = await supabase.from(API_CONFIG.TABLES.EXEC_SUMMARY_VIEW).select('*');

    if (error) throw error;
    window.execRouteSummaryData = data || [];

    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) {
      /* ignore storage error */
    }

    console.timeEnd('[API] ⏱️ fetchExecProvinceSummary Duration');
    return window.execRouteSummaryData;
  } catch (err) {
    handleApiError(err, 'fetchExecProvinceSummary');
    return [];
  }
}

export async function fetchOriginLocations() {
  try {
    const { data, error } = await supabase.from(API_CONFIG.TABLES.ORIGIN_LOCATIONS).select('*');

    if (error) throw error;

    const locationMap = {};
    (data || []).forEach((row) => {
      const originName = String(row.origin || row.origin_name || '').trim();
      const coords = parseCoordinate(row.lat, row.lng || row.long);

      if (originName && coords) {
        locationMap[originName] = {
          id: row.id,
          origin: originName,
          lat: coords.lat,
          lng: coords.lng,
          zone: String(row.Zone || row.zone || '').trim(),
          province: String(row.Province || row.province || '').trim()
        };
        locationMap[originName.toLowerCase()] = locationMap[originName];
      }
    });

    window.originLocationMap = locationMap;
    return locationMap;
  } catch (err) {
    handleApiError(err, 'fetchOriginLocations');
    return {};
  }
}

export async function fetchProvinceLocations() {
  try {
    const { data, error } = await supabase.from(API_CONFIG.TABLES.PROVINCE_LOCATIONS).select('*');

    if (error) throw error;

    const locationMap = {};
    (data || []).forEach((row) => {
      const provTH = String(row.province_th || row.province || '').trim();
      const provEN = String(row.province_en || '').trim();
      const coords = parseCoordinate(row.lat, row.long || row.lng);

      if (coords) {
        if (provTH) locationMap[provTH] = coords;
        if (provEN) locationMap[provEN.toLowerCase()] = coords;
      }
    });

    window.provinceLocationMap = locationMap;
    return locationMap;
  } catch (err) {
    handleApiError(err, 'fetchProvinceLocations');
    return {};
  }
}

export async function fetchExecutiveSummaryKPI() {
  try {
    const { data, error } = await supabase.rpc(API_CONFIG.RPC.EXEC_KPI);
    if (error) throw error;
    return data;
  } catch (err) {
    handleApiError(err, 'fetchExecutiveSummaryKPI');
    return null;
  }
}

export async function initExecutiveDashboardFast() {
  try {
    const [origins, provinces, provSummary, kpi] = await Promise.all([
      fetchOriginLocations(),
      fetchProvinceLocations(),
      fetchExecProvinceSummary(),
      fetchExecutiveSummaryKPI()
    ]);

    if (typeof window.renderExecRouteHeatmap === 'function' && provSummary) {
      window.renderExecRouteHeatmap(provSummary);
    }
    if (typeof window.updateExecutiveKPICards === 'function' && kpi) {
      window.updateExecutiveKPICards(kpi);
    }

    setTimeout(() => {
      loadDetailedRoutesInBackground();
    }, 150);

    return { origins, provinces, provSummary, kpi };
  } catch (err) {
    console.error('Failed fast executive dashboard initialization:', err);
    return null;
  }
}

export async function loadDetailedRoutesInBackground() {
  if (window.globalRouteSheetData && window.globalRouteSheetData.length > 0) return;
  await fetchNewRouteSheet();

  if (typeof window.populateDashboardFilters === 'function') {
    window.populateDashboardFilters(window.globalRouteSheetData);
  }
}
