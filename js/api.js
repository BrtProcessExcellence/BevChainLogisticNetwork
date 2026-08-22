const db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// ตัวแปร Global สำหรับเก็บข้อมูลในหน่วยความจำ
let globalRouteSheetData = [];
let execRouteSummaryData = [];
let provinceLocationMap = {};
let originLocationMap = {};

async function fetchNewRouteSheet() {
  try {
    const step = 1000;
    const { count, error: countErr } = await db
      .from('view_routes_with_coords')
      .select('*', { count: 'exact', head: true });

    if (countErr) throw countErr;
    if (!count || count === 0) return [];

    const selectedColumns = [
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
    ].join(',');

    const totalBatches = Math.ceil(count / step);
    const batchPromises = [];

    for (let i = 0; i < totalBatches; i++) {
      const from = i * step;
      const to = from + step - 1;
      batchPromises.push(
        db
          .from('view_routes_with_coords')
          .select(selectedColumns)
          .range(from, to)
      );
    }

    const batchResults = await Promise.all(batchPromises);
    globalRouteSheetData = batchResults.flatMap(res => res.data || []);
    return globalRouteSheetData;

  } catch (err) {
    console.error('Error fetching routes from view_routes_with_coords:', err);
    return [];
  }
}

async function fetchExecProvinceSummary() {
  try {
    const { data, error } = await db
      .from('view_exec_province_summary')
      .select('*');

    if (error) throw error;
    execRouteSummaryData = data || [];
    return execRouteSummaryData;
  } catch (err) {
    console.error('Error fetching province summary view:', err);
    return [];
  }
}

async function fetchOriginLocations() {
  try {
    const { data, error } = await db
      .from('brf_locations')
      .select('*');

    if (error) throw error;

    const map = {};
    (data || []).forEach(row => {
      const originName = String(row.origin || row.origin_name || '').trim();
      const lat = parseFloat(row.lat);
      const lng = parseFloat(row.long || row.lng);
      const platform = String(row.platform || '').trim();

      if (originName && !isNaN(lat) && !isNaN(lng)) {
        const locData = { lat, lng, platform };
        map[originName] = locData;
        map[originName.toLowerCase()] = locData;
      }
    });

    originLocationMap = map;
    return map;
  } catch (err) {
    console.error('Failed to fetch origin locations:', err);
    return {};
  }
}

async function fetchProvinceLocations() {
  try {
    const { data, error } = await db
      .from('province_locations')
      .select('*');

    if (error) throw error;

    const map = {};
    (data || []).forEach(row => {
      const provTH = String(row.province_th || row.province || '').trim();
      const provEN = String(row.province_en || '').trim();
      const lat = parseFloat(row.lat);
      const lng = parseFloat(row.long || row.lng);

      if (!isNaN(lat) && !isNaN(lng)) {
        if (provTH) map[provTH] = { lat, lng };
        if (provEN) map[provEN.toLowerCase()] = { lat, lng };
      }
    });

    provinceLocationMap = map;
    return map;
  } catch (err) {
    console.error('Failed to fetch province locations:', err);
    return {};
  }
}

async function fetchExecutiveSummaryKPI() {
  try {
    const { data, error } = await db.rpc('get_executive_summary_kpi');
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('KPI RPC not available, calculating fallback:', err);
    return null;
  }
}

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

  } catch (err) {
    console.error('Failed fast init:', err);
  }
}

async function loadDetailedRoutesInBackground() {
  if (globalRouteSheetData && globalRouteSheetData.length > 0) return;
  console.log('🔄 Background: Loading full route data...');
  await fetchNewRouteSheet();
  console.log('✅ Background: Full route data ready for Operation Tab');
}