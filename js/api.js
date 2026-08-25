// ==============================================================================
// 1. CONFIGURATION & CONSTANTS
// ==============================================================================
const API_CONFIG = {
  BATCH_SIZE: 1000,
  TABLES: {
    ROUTES_VIEW: 'view_routes_with_coords',
    EXEC_SUMMARY_VIEW: 'view_exec_province_summary',
    ORIGIN_LOCATIONS: 'brf_locations',
    PROVINCE_LOCATIONS: 'province_locations',
    SHIPPING_LOCATIONS: 'Shipping location'
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

window.globalRouteSheetData = window.globalRouteSheetData || [];
window.execRouteSummaryData = window.execRouteSummaryData || [];
window.provinceLocationMap = window.provinceLocationMap || {};
window.originLocationMap = window.originLocationMap || {};

let inFlightRouteFetchPromise = null;

// ==============================================================================
// 2. DATABASE CLIENT & UTILITY HELPERS
// ==============================================================================

function getDbClient() {
  if (window._supabaseDbInstance) return window._supabaseDbInstance;

  const supabaseLib = window.supabase;
  const config = typeof CONFIG !== 'undefined' ? CONFIG : null;

  if (!supabaseLib || !config?.SUPABASE_URL || !config?.SUPABASE_KEY) {
    console.error('Supabase library or CONFIG is not properly initialized.');
    return null;
  }

  window._supabaseDbInstance = supabaseLib.createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
  return window._supabaseDbInstance;
}

function parseCoordinate(latVal, lngVal) {
  const lat = parseFloat(latVal);
  const lng = parseFloat(lngVal);
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}

// ==============================================================================
// 3. CORE DATA ACCESS METHODS
// ==============================================================================

async function fetchNewRouteSheet() {
  if (inFlightRouteFetchPromise) {
    return inFlightRouteFetchPromise;
  }

  inFlightRouteFetchPromise = (async () => {
    const db = getDbClient();
    if (!db) return [];

    try {
      const { count, error: countErr } = await db
        .from(API_CONFIG.TABLES.ROUTES_VIEW)
        .select('*', { count: 'exact', head: true });

      if (countErr) throw countErr;
      if (!count || count === 0) {
        window.globalRouteSheetData = [];
        return [];
      }

      const step = API_CONFIG.BATCH_SIZE;
      const totalBatches = Math.ceil(count / step);
      const batchPromises = [];

      for (let i = 0; i < totalBatches; i++) {
        const from = i * step;
        const to = from + step - 1;

        batchPromises.push(
          db
            .from(API_CONFIG.TABLES.ROUTES_VIEW)
            .select(API_CONFIG.ROUTE_COLUMNS)
            .order('id', { ascending: true })
            .range(from, to)
        );
      }

      const batchResults = await Promise.all(batchPromises);
      const combinedData = batchResults.flatMap(res => res.data || []);

      window.globalRouteSheetData = combinedData;
      return combinedData;
    } catch (err) {
      console.error('Error fetching routes from view_routes_with_coords:', err);
      return [];
    } finally {
      inFlightRouteFetchPromise = null;
    }
  })();

  return inFlightRouteFetchPromise;
}


async function fetchExecProvinceSummary() {
  const db = getDbClient();
  if (!db) return [];

  try {
    const { data, error } = await db
      .from(API_CONFIG.TABLES.EXEC_SUMMARY_VIEW)
      .select('*');

    if (error) throw error;
    window.execRouteSummaryData = data || [];
    return window.execRouteSummaryData;
  } catch (err) {
    console.error('Error fetching province summary view:', err);
    return [];
  }
}

async function fetchOriginLocations() {
  const db = getDbClient();
  if (!db) return {};

  try {
    const { data, error } = await db
      .from(API_CONFIG.TABLES.ORIGIN_LOCATIONS)
      .select('*');

    if (error) throw error;

    const locationMap = {};
    (data || []).forEach(row => {
      const originName = String(row.origin || row.origin_name || '').trim();
      // รองรับทั้ง lng และ long เดิม
      const coords = parseCoordinate(row.lat, row.lng || row.long);

      // ดึงข้อมูลคอลัมน์ใหม่
      const id = row.id;
      const zone = String(row.Zone || row.zone || '').trim();
      const province = String(row.Province || row.province || '').trim();
      const plant = String(row.Plant || row.plant || '').trim();
      const descriptionPlant = String(row.DescriptionPlant || row.description_plant || '').trim();

      if (originName && coords) {
        const locationEntry = {
          id,
          origin: originName,
          lat: coords.lat,
          lng: coords.lng,
          zone,
          province,
          plant,
          descriptionPlant,
          platform: descriptionPlant || plant // เก็บไว้รองรับ Backward Compatibility
        };

        locationMap[originName] = locationEntry;
        locationMap[originName.toLowerCase()] = locationEntry;
      }
    });

    window.originLocationMap = locationMap;
    return locationMap;
  } catch (err) {
    console.error('Failed to fetch origin locations:', err);
    return {};
  }
}


async function fetchProvinceLocations() {
  const db = getDbClient();
  if (!db) return {};

  try {
    const { data, error } = await db
      .from(API_CONFIG.TABLES.PROVINCE_LOCATIONS)
      .select('*');

    if (error) throw error;

    const locationMap = {};
    (data || []).forEach(row => {
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
    console.error('Failed to fetch province locations:', err);
    return {};
  }
}


async function fetchShippingLocations() {
  const db = getDbClient();
  if (!db) return [];

  try {
    const { data, error } = await db
      .from(API_CONFIG.TABLES.SHIPPING_LOCATIONS)
      .select('*');

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Shipping locations table query skipped or empty:', err);
    return [];
  }
}


async function fetchExecutiveSummaryKPI() {
  const db = getDbClient();
  if (!db) return null;

  try {
    const { data, error } = await db.rpc(API_CONFIG.RPC.EXEC_KPI);
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('KPI RPC not available, fallback to client calculations:', err);
    return null;
  }
}

// ==============================================================================
// 4. INITIALIZATION ORCHESTRATION
// ==============================================================================


async function initExecutiveDashboardFast() {
  try {
    const [origins, provinces, provSummary, kpi] = await Promise.all([
      fetchOriginLocations(),
      fetchProvinceLocations(),
      fetchExecProvinceSummary(),
      fetchExecutiveSummaryKPI()
    ]);

    if (typeof renderExecRouteHeatmap === 'function' && provSummary) {
      renderExecRouteHeatmap(provSummary);
    }
    if (typeof updateExecutiveKPICards === 'function' && kpi) {
      updateExecutiveKPICards(kpi);
    }

    setTimeout(() => {
      loadDetailedRoutesInBackground();
    }, 100);

    return { origins, provinces, provSummary, kpi };
  } catch (err) {
    console.error('Failed fast executive dashboard initialization:', err);
    return null;
  }
}

async function loadDetailedRoutesInBackground() {
  if (window.globalRouteSheetData && window.globalRouteSheetData.length > 0) return;
  await fetchNewRouteSheet();
}

// ==============================================================================
// 5. GLOBAL EXPORTS
// ==============================================================================
window.fetchNewRouteSheet = fetchNewRouteSheet;
window.fetchExecProvinceSummary = fetchExecProvinceSummary;
window.fetchOriginLocations = fetchOriginLocations;
window.fetchProvinceLocations = fetchProvinceLocations;
window.fetchShippingLocations = fetchShippingLocations;
window.fetchExecutiveSummaryKPI = fetchExecutiveSummaryKPI;
window.initExecutiveDashboardFast = initExecutiveDashboardFast;
window.loadDetailedRoutesInBackground = loadDetailedRoutesInBackground;