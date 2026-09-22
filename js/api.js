/**
 * ==============================================================================
 * API CONTROLLER & SUPABASE DATA CONNECTOR (HIGH PERFORMANCE & FAST INITIAL LOAD)
 * ==============================================================================
 */

const API_CONFIG = {
  BATCH_SIZE: 50000, 
  TABLES: {
    ROUTES_VIEW: 'view_routes_with_coords',
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

window.globalRouteSheetData = window.globalRouteSheetData || [];
window.execRouteSummaryData = window.execRouteSummaryData || [];
window.provinceLocationMap = window.provinceLocationMap || {};
window.originLocationMap = window.originLocationMap || {};

let inFlightRouteFetchPromise = null;

function getDbClient() {
  if (window._supabaseDbInstance) return window._supabaseDbInstance;

  const supabaseLib = window.supabase;
  const config = typeof CONFIG !== 'undefined' ? CONFIG : null;
  console.log("supabaseLib",supabaseLib) ;

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
/**
 * 1. ดึงข้อมูลเส้นทางหลักแบบ Dynamic Batch (ดึงครบทุกแถวแน่นอน ไม่โดนตัดที่ 15,000)
 */
// async function fetchNewRouteSheet(limit = null) {
//   if (inFlightRouteFetchPromise) {
//     return inFlightRouteFetchPromise;
//   }

//   inFlightRouteFetchPromise = (async () => {
//     const db = getDbClient();
//     if (!db) return [];

//     try {
//       // 💡 กรณีต้องการดึงเฉพาะชุดเริ่มต้น (Fast Preview)
//       if (limit && typeof limit === 'number') {
//         const { data, error } = await db
//           .from(API_CONFIG.TABLES.ROUTES_VIEW)
//           .select(API_CONFIG.ROUTE_COLUMNS)
//           .order('id', { ascending: true })
//           .limit(limit);

//         if (error) throw error;
//         window.globalRouteSheetData = data || [];
//         return window.globalRouteSheetData;
//       }
//   console.log("db",db) ;


//       // 💡 ดึงแบบ Dynamic Batch วนลูปจนกว่าจะได้ข้อมูลครบทุกแถว
//       const step = API_CONFIG.BATCH_SIZE || 5000;
//       let combinedData = [];
//       let from = 0;
//       let hasMore = true;

//       while (hasMore) {
//         const to = from + step - 1;

//         const { data, error } = await db
//           .from(API_CONFIG.TABLES.ROUTES_VIEW)
//           .select(API_CONFIG.ROUTE_COLUMNS)
//           .order('id', { ascending: true })
//           .range(from, to);

//         if (error) throw error;

//         if (data && data.length > 0) {
//           combinedData = combinedData.concat(data);
          
//           // ถ้าข้อมูลที่คืนกลับมาน้อยกว่าขนาด Batch แสดงว่าถึงแถวสุดท้ายแล้ว
//           if (data.length < step) {
//             hasMore = false;
//           } else {
//             from += step;
//           }
//         } else {
//           hasMore = false;
//         }
//       }

//       window.globalRouteSheetData = combinedData;
//       return combinedData;
//     } catch (err) {
//       console.error('Error fetching routes from view_routes_with_coords:', err);
//       return window.globalRouteSheetData || [];
//     } finally {
//       inFlightRouteFetchPromise = null;
//     }
//   })();

//   return inFlightRouteFetchPromise;
// }

/**
 * 1. ดึงข้อมูลเส้นทางหลักแบบ Dynamic Batch พร้อมระบบ Cache และ Tracking
 */
async function fetchNewRouteSheet(limit = null) {
  console.log('[API] 🚀 Start fetchNewRouteSheet()');
  console.time('[API] ⏱️ fetchNewRouteSheet Duration');

  if (inFlightRouteFetchPromise) {
    console.log('[API] ⏳ Promise already in flight, waiting...');
    return inFlightRouteFetchPromise;
  }

  inFlightRouteFetchPromise = (async () => {
    const db = getDbClient();
    if (!db) return [];

    try {
      // 💡 1. ตรวจสอบ Memory Cache ก่อน (ลดเวลาเหลือ 0ms)
      if (window.globalRouteSheetData && window.globalRouteSheetData.length > 0) {
        console.log(`[API] ✅ Loaded from Memory Cache (${window.globalRouteSheetData.length} rows)`);
        console.timeEnd('[API] ⏱️ fetchNewRouteSheet Duration');
        return window.globalRouteSheetData;
      }

      // 💡 2. ตรวจสอบ SessionStorage Cache (ลดเวลา API สลับหน้าเว็บเหลือ < 50ms)
      const CACHE_KEY = 'cache_routes_data';
      const storedData = sessionStorage.getItem(CACHE_KEY);
      if (storedData) {
        try {
          const parsed = JSON.parse(storedData);
          console.log(`[API] ✅ Loaded from SessionStorage (${parsed.length} rows)`);
          window.globalRouteSheetData = parsed;
          console.timeEnd('[API] ⏱️ fetchNewRouteSheet Duration');
          return parsed;
        } catch (e) {
          console.warn('[API] ⚠️ Cache parse error, refetching...', e);
          sessionStorage.removeItem(CACHE_KEY);
        }
      }

      // 💡 3. หากไม่มี Cache ให้ดึงจาก Supabase
      console.log('[API] 📡 Fetching fresh data from Supabase...');
      if (limit && typeof limit === 'number') {
        const { data, error } = await db
          .from(API_CONFIG.TABLES.ROUTES_VIEW)
          .select(API_CONFIG.ROUTE_COLUMNS)
          .order('id', { ascending: true })
          .limit(limit);

        if (error) throw error;
        window.globalRouteSheetData = data || [];
        return window.globalRouteSheetData;
      }

      const step = API_CONFIG.BATCH_SIZE || 5000;
      let combinedData = [];
      let from = 0;
      let hasMore = true;
      let batchCount = 1;

      while (hasMore) {
        const to = from + step - 1;
        console.log(`[API] 🔄 Fetching Batch #${batchCount} (Rows: ${from} - ${to})...`);

        const { data, error } = await db
          .from(API_CONFIG.TABLES.ROUTES_VIEW)
          .select(API_CONFIG.ROUTE_COLUMNS)
          .order('id', { ascending: true })
          .range(from, to);

        if (error) throw error;

        if (data && data.length > 0) {
          combinedData = combinedData.concat(data);
          console.log(`[API] ✔️ Batch #${batchCount} received ${data.length} rows.`);
          if (data.length < step) {
            hasMore = false;
          } else {
            from += step;
            batchCount++;
          }
        } else {
          hasMore = false;
        }
      }

      console.log(`[API] ✅ DB Fetch Complete. Total: ${combinedData.length} rows.`);

      // บันทึกลง Cache
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(combinedData));
      } catch (err) {
        console.warn('[API] ⚠️ SessionStorage quota exceeded. Using memory only.');
      }

      window.globalRouteSheetData = combinedData;
      console.timeEnd('[API] ⏱️ fetchNewRouteSheet Duration');
      return combinedData;
    } catch (err) {
      console.error('[API] ❌ Error fetching routes:', err);
      return window.globalRouteSheetData || [];
    } finally {
      inFlightRouteFetchPromise = null;
    }
  })();

  return inFlightRouteFetchPromise;
}

/**
 * 2. ดึงข้อมูลสรุปรายจังหวัด พร้อมระบบ Cache
 */
async function fetchExecProvinceSummary() {
  console.log('[API] 🚀 Start fetchExecProvinceSummary()');
  console.time('[API] ⏱️ fetchExecProvinceSummary Duration');
  
  const CACHE_KEY = 'cache_exec_summary';
  const stored = sessionStorage.getItem(CACHE_KEY);
  
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      console.log('[API] ✅ Exec Summary loaded from cache');
      window.execRouteSummaryData = parsed;
      console.timeEnd('[API] ⏱️ fetchExecProvinceSummary Duration');
      return parsed;
    } catch(e) { sessionStorage.removeItem(CACHE_KEY); }
  }

  const db = getDbClient();
  if (!db) return [];

  try {
    const { data, error } = await db
      .from(API_CONFIG.TABLES.EXEC_SUMMARY_VIEW)
      .select('*');

    if (error) throw error;
    window.execRouteSummaryData = data || [];
    
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch(e) {}
    
    console.timeEnd('[API] ⏱️ fetchExecProvinceSummary Duration');
    return window.execRouteSummaryData;
  } catch (err) {
    console.error('[API] ❌ Error fetching province summary view:', err);
    return [];
  }
}

// /**
//  * 2. ดึงข้อมูลสรุปรายจังหวัดสำหรับ Executive Dashboard (เร็วมาก < 200ms)
//  */
// async function fetchExecProvinceSummary() {
//   const db = getDbClient();
//   if (!db) return [];

//   try {
//     const { data, error } = await db
//       .from(API_CONFIG.TABLES.EXEC_SUMMARY_VIEW)
//       .select('*');

//     if (error) throw error;
//     window.execRouteSummaryData = data || [];
//     return window.execRouteSummaryData;
//   } catch (err) {
//     console.error('Error fetching province summary view:', err);
//     return [];
//   }
// }

/**
 * 3. ดึงพิกัดจุดต้นทาง (Origin DCs / Plants)
 */
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
      const coords = parseCoordinate(row.lat, row.lng || row.long);

      if (originName && coords) {
        const locationEntry = {
          id: row.id,
          origin: originName,
          lat: coords.lat,
          lng: coords.lng,
          zone: String(row.Zone || row.zone || '').trim(),
          province: String(row.Province || row.province || '').trim(),
          plant: String(row.Plant || row.plant || '').trim(),
          descriptionPlant: String(row.DescriptionPlant || row.description_plant || '').trim(),
          platform: String(row.DescriptionPlant || row.Plant || '').trim()
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

/**
 * 4. ดึงพิกัดกึ่งกลางจังหวัด 77 จังหวัด
 */
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

/**
 * 5. ดึงข้อมูล Executive KPI ผ่าน RPC
 */
async function fetchExecutiveSummaryKPI() {
  const db = getDbClient();
  if (!db) return null;

  try {
    const { data, error } = await db.rpc(API_CONFIG.RPC.EXEC_KPI);
    if (error) throw error;
    return data;  
    console.log("data",data) ;

    
  } catch (err) {
    return null;
  }
}

/**
 * 6. FAST INITIALIZATION (Two-Phase Loading Strategy)
 * แสดงผลหน้า Executive ทันทีใน 300ms แล้วค่อยโหลด Full Routes ในพื้นหลัง
 */
async function initExecutiveDashboardFast() {
  try {
    // Phase 1: โหลดเฉพาะข้อมูลสรุปและ Master Locations (ขนาดเล็กมาก)
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

    // Phase 2: โหลดข้อมูลเส้นทางเต็มเบื้องหลังแบบ Non-blocking
    setTimeout(() => {
      loadDetailedRoutesInBackground();
    }, 150);

    return { origins, provinces, provSummary, kpi };
  } catch (err) {
    console.error('Failed fast executive dashboard initialization:', err);
    return null;
  }
}

async function loadDetailedRoutesInBackground() {
  if (window.globalRouteSheetData && window.globalRouteSheetData.length > 0) return;
  await fetchNewRouteSheet();
  
  // แจ้งให้อัปเดตตัวกรองตารางเมื่อข้อมูลเบื้องหลังพร้อม
  if (typeof populateDashboardFilters === 'function') {
    populateDashboardFilters(window.globalRouteSheetData);
  }
}

// Global Exports
window.fetchNewRouteSheet = fetchNewRouteSheet;
window.fetchExecProvinceSummary = fetchExecProvinceSummary;
window.fetchOriginLocations = fetchOriginLocations;
window.fetchProvinceLocations = fetchProvinceLocations;
window.fetchExecutiveSummaryKPI = fetchExecutiveSummaryKPI;
window.initExecutiveDashboardFast = initExecutiveDashboardFast;
window.loadDetailedRoutesInBackground = loadDetailedRoutesInBackground;