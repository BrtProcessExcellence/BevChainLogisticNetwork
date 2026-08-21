
const db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

let globalRouteSheetData = [];
let execRouteSheetCache = [];
let provinceLocationMap = {};
let originLocationMap = {};

// ใน api.js
async function fetchNewRouteSheet() {
  try {
    let allData = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await db
        .from('view_routes_with_coords')
        .select('*')
        .range(from, from + step - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        allData = allData.concat(data);
        from += step;

        // ถ้าได้ข้อมูลน้อยกว่า 1,000 รายการ แสดงว่าเป็นชุดสุดท้ายแล้ว
        if (data.length < step) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    return allData;
  } catch (err) {
    console.error('Error fetching all route data:', err);
    return [];
  }
}

async function fetchProvinceLocations() {
  try {
    const { data, error } = await db
      .from('province_locations')
      .select('*');

    if (error) {
      console.error('Error fetching province locations:', error);
      return {};
    }

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

async function fetchOriginLocations() {
  try {
    const { data, error } = await db
      .from('brf_locations')
      .select('*');

    if (error) {
      console.error('Error fetching origin locations:', error);
      return {};
    }

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

async function fetchShippingLocations() {
  try {
    // 💡 ใช้ตัวแปร db ที่สร้างไว้ดึงข้อมูลจากตาราง Shipping location
    const { data, error } = await db
      .from('Shipping location')
      .select('*');

    if (error) {
      console.error('Error fetching Shipping locations:', error);
      return [];
    }

    if (data && data.length > 0) {
      // อัปเดตข้อมูลพิกัดเข้าสู่ Lookup สำหรับให้แผนที่และตารางดึงไปใช้
      if (typeof initShippingLocationLookup === 'function') {
        initShippingLocationLookup(data);
      }
      return data;
    }

    return [];
  } catch (err) {
    console.error('Unexpected error in fetchShippingLocations:', err);
    return [];
  }
}
// 1. ดึงสรุปตัวเลขการ์ดบนสุดความเร็วสูง (0.05 วิ)
async function fetchExecutiveSummaryKPI() {
  const { data, error } = await db.rpc('get_executive_summary_kpi');
  if (error) {
    console.error('Error calling KPI RPC:', error);
    return null;
  }
  return data;
}

// 2. ดึงตาราง Distinct Route ทั้งหมด
async function fetchDistinctRoutes() {
  const { data, error } = await db
    .from('view_distinct_routes')
    .select('*');
  if (error) {
    console.error('Error fetching distinct view:', error);
    return [];
  }
  return data;
}
async function fetchExecProvinceSummary() {
  try {
    const { data, error } = await db
      .from('view_exec_province_summary')
      .select('*');

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching province summary:', err);
    return [];
  }
}