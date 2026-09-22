/**
 * Master Data Dictionaries & Configuration
 */
const CONFIG = {
 SUPABASE_URL : 'https://mjjvjokqotbfkswgwjfp.supabase.co',
 SUPABASE_KEY : 'sb_publishable_6loV82EOMVbjBC7nw_XsEg_wPf7pN1v'  
}

const dict = {
  th: {
    appTitle: 'BevChain', appSub: 'Logistics Network', adminRole: 'ผู้จัดการฝ่ายขนส่ง (Logistics Manager)',
    menu: { 
      exec: 'แดชบอร์ดผู้บริหาร (Executive Dashboard)', 
      dashboard: 'แดชบอร์ดเส้นทางรวม (Route Dashboard)', 
      mapping: 'วิเคราะห์เส้นทางลูกค้าใหม่ (New Order Mapping)' 
    }
  },
  en: {
    appTitle: 'BevChain', appSub: 'Logistics Network', adminRole: 'Logistics Manager',
    menu: { 
      exec: 'Executive Dashboard', 
      dashboard: 'Route Dashboard', 
      mapping: 'New Order Mapping' 
    }
  }
};

const locationHierarchy = {
  'ภาคกลาง': ['กรุงเทพมหานคร', 'ปทุมธานี', 'พระนครศรีอยุธยา'],
  'ภาคเหนือ': ['เชียงใหม่', 'เชียงราย'],
  'ภาคอีสาน': ['นครราชสีมา', 'ขอนแก่น'],
  'ภาคตะวันออก': ['ระยอง', 'ชลบุรี'],
  'ภาคใต้': ['สุราษฎร์ธานี', 'สงขลา']
};
const PROVINCE_NAME_MAP = {
  // กรุงเทพฯ และปริมณฑล
  'bangkok': 'กรุงเทพมหานคร',
  'bangkokmetropolis': 'กรุงเทพมหานคร',
  'krungthep': 'กรุงเทพมหานคร',
  'krungthepmahanakhon': 'กรุงเทพมหานคร',
  'samutprakan': 'สมุทรปราการ',
  'nonthaburi': 'นนทบุรี',
  'pathumthani': 'ปทุมธานี',
  'samutsakhon': 'สมุทรสาคร',
  'nakhonpathom': 'นครปฐม',
  'samutsongkhram': 'สมุทรสงคราม',

  // ภาคกลาง
  'phranakhonsiayutthaya': 'พระนครศรีอยุธยา',
  'ayutthaya': 'พระนครศรีอยุธยา',
  'angthong': 'อ่างทอง',
  'lopburi': 'ลพบุรี',
  'singburi': 'สิงห์บุรี',
  'chainat': 'ชัยนาท',
  'saraburi': 'สระบุรี',
  'suphanburi': 'สุพรรณบุรี',
  'nakhonnayok': 'นครนายก',

  // ภาคตะวันออก
  'chonburi': 'ชลบุรี',
  'rayong': 'ระยอง',
  'chanthaburi': 'จันทบุรี',
  'trat': 'ตราด',
  'chachoengsao': 'ฉะเชิงเทรา',
  'prachinburi': 'ปราจีนบุรี',
  'sakaeo': 'สระแก้ว',

  // ภาคตะวันออกเฉียงเหนือ (อีสาน)
  'nakhonratchasima': 'นครราชสีมา',
  'korat': 'นครราชสีมา',
  'buriram': 'บุรีรัมย์',
  'surin': 'สุรินทร์',
  'sisaket': 'ศรีสะเกษ',
  'ubonratchathani': 'อุบลราชธานี',
  'yasothon': 'ยโสธร',
  'chaiyaphum': 'ชัยภูมิ',
  'amnatcharoen': 'อำนาจเจริญ',
  'buengkan': 'บึงกาฬ',
  'bungkan': 'บึงกาฬ',
  'nongbualamphu': 'หนองบัวลำภู',
  'khonkaen': 'ขอนแก่น',
  'udonthani': 'อุดรธานี',
  'loei': 'เลย',
  'nongkhai': 'หนองคาย',
  'mahasarakham': 'มหาสารคาม',
  'roiet': 'ร้อยเอ็ด',
  'kalasin': 'กาฬสินธุ์',
  'sakonnakhon': 'สกลนคร',
  'nakhonphanom': 'นครพนม',
  'mukdahan': 'มุกดาหาร',

  // ภาคเหนือ
  'chiangmai': 'เชียงใหม่',
  'lamphun': 'ลำพูน',
  'lampang': 'ลำปาง',
  'uttaradit': 'อุตรดิตถ์',
  'phrae': 'แพร่',
  'nan': 'น่าน',
  'phayao': 'พะเยา',
  'chiangrai': 'เชียงราย',
  'maehongson': 'แม่ฮ่องสอน',
  'nakhonsawan': 'นครสวรรค์',
  'uthaithani': 'อุทัยธานี',
  'kamphaengphet': 'กำแพงเพชร',
  'tak': 'ตาก',
  'sukhothai': 'สุโขทัย',
  'phitsanulok': 'พิษณุโลก',
  'phichit': 'พิจิตร',
  'phetchabun': 'เพชรบูรณ์',

  // ภาคตะวันตก
  'ratchaburi': 'ราชบุรี',
  'kanchanaburi': 'กาญจนบุรี',
  'phetchaburi': 'เพชรบุรี',
  'prachuapkhirikhan': 'ประจวบคีรีขันธ์',

  // ภาคใต้
  'nakhonsithammarat': 'นครศรีธรรมราช',
  'krabi': 'กระบี่',
  'phangnga': 'พังงา',
  'phuket': 'ภูเก็ต',
  'suratthani': 'สุราษฎร์ธานี',
  'ranong': 'ระนอง',
  'chumphon': 'ชุมพร',
  'songkhla': 'สงขลา',
  'satun': 'สตูล',
  'trang': 'ตรัง',
  'phatthalung': 'พัทลุง',
  'pattani': 'ปัตตานี',
  'yala': 'ยะลา',
  'narathiwat': 'นราธิวาส'
};


const nodeLocations = {
  'P-BKK': { region: 'ภาคกลาง', province: 'ปทุมธานี' },
  'P-RYG': { region: 'ภาคตะวันออก', province: 'ระยอง' },
  'P-AYU': { region: 'ภาคกลาง', province: 'พระนครศรีอยุธยา' },
  'S-CNX': { region: 'ภาคเหนือ', province: 'เชียงใหม่' },
  'S-NMA': { region: 'ภาคอีสาน', province: 'นครราชสีมา' },
  'S-SUR': { region: 'ภาคใต้', province: 'สุราษฎร์ธานี' },
  'S-HDY': { region: 'ภาคใต้', province: 'สงขลา' }
};

const mapNodes = [
  { id: 'P-BKK', type: 'plant', name: {th: 'โรงงาน ปทุมธานี', en: 'Pathum Thani Brewery'}, lat: 14.0208, lon: 100.5250 },
  { id: 'P-RYG', type: 'plant', name: {th: 'ศูนย์กระจาย ระยอง', en: 'Rayong DC'}, lat: 12.6814, lon: 101.2816 },
  { id: 'P-AYU', type: 'plant', name: {th: 'โรงงาน อยุธยา', en: 'Ayutthaya Plant'}, lat: 14.3500, lon: 100.5667 },
  { id: 'S-CNX', type: 'shipto', name: {th: 'เชียงใหม่ (DC)', en: 'Chiang Mai (DC)'}, lat: 18.7883, lon: 98.9853 },
  { id: 'S-NMA', type: 'shipto', name: {th: 'โคราช (DC)', en: 'Korat (DC)'}, lat: 14.9799, lon: 102.0978 },
  { id: 'S-SUR', type: 'shipto', name: {th: 'สุราษฎร์ฯ (DC)', en: 'Surat (DC)'}, lat: 9.1333, lon: 99.3333 },
  { id: 'S-HDY', type: 'shipto', name: {th: 'หาดใหญ่ (DC)', en: 'Hat Yai (DC)'}, lat: 7.0096, lon: 100.4736 },
];

// คอลัมน์สำหรับ Route Summary
const routeSummaryColumns = [
  { key: 'originRegion', label: 'ภาคต้นทาง' },
  { key: 'originProvince', label: 'จังหวัดต้นทาง' },
  { key: 'destProvince', label: 'จังหวัดปลายทางสุดท้าย' },
  { key: 'descPlant', label: 'ต้นทาง (Plant)' },
  { key: 'descShipTo', label: 'ปลายทางหลัก' },
  { key: 'loadCount', label: 'จำนวน Load (เที่ยว)' },
  { key: 'shipmentCount', label: 'จำนวน Shipment' },
  { key: 'totalCBM', label: 'Total Volume (CBM)' },
  { key: 'totalWeightTons', label: 'Total Weight (Tons)' },
  { key: 'avgShipPerLoad', label: 'Avg Ship/Load' },
  { key: 'pctGT', label: '%GT' }
];

// ฟังก์ชันแปลงข้อมูลดิบ (จัดกลุ่ม loadId, หาปลายทางสุดท้าย, คำนวณ Multi-drop)
function processRawData(rawShipments) {
  const loadsMap = {};
  rawShipments.forEach(s => {
    if (!loadsMap[s.loadId]) loadsMap[s.loadId] = [];
    loadsMap[s.loadId].push(s);
  });

  const processed = [];
  Object.values(loadsMap).forEach(shipmentsInLoad => {
    // เรียงตามเวลา POD
    shipmentsInLoad.sort((a, b) => new Date(a.podDate || 0) - new Date(b.podDate || 0));

    const totalDrops = shipmentsInLoad.length;
    const isMultiDrop = totalDrops > 1;
    const finalShipment = shipmentsInLoad[totalDrops - 1];

    shipmentsInLoad.forEach((shp, idx) => {
      processed.push({
        ...shp,
        dropSeq: idx + 1,
        totalDropsInLoad: totalDrops,
        isMultiDrop: isMultiDrop,
        finalToId: finalShipment.toId,
        finalDestProvince: finalShipment.destProvince,
        finalDestRegion: finalShipment.destRegion
      });
    });
  });
  return processed;
}

// คอลัมน์ระดับที่ 2: Load Table
const loadColumns = [
  { key: 'orderType', label: 'Order Type' },
  { key: 'shippingPointDesc', label: 'Description(Shipping Point)' },
  { key: 'shipToDesc', label: 'Description(Ship-To (Outbound))' },
  { key: 'soldToDesc', label: 'Description(Sold-To)' },
  { key: 'fwdAgentDesc', label: 'Description(FwdAgent)' },
  { key: 'originZone', label: 'Origin Zone' },
  { key: 'destZone', label: 'Destination Zone' },
  { key: 'equipmentGroup', label: 'Equipment group/service ID' },
  { key: 'intransitDate', label: 'Mobility Intransit start date' },
  { key: 'podDate', label: 'POD Date' },
  { key: 'plateNumber', label: 'Vehicle Number Plate' },
  { key: 'itemType', label: 'Item Type' },
  { key: 'loadId', label: 'Load Id' },
  { key: 'companyCode', label: 'Company Code' }
];

// คอลัมน์ระดับที่ 3: Shipment Table
const shipmentColumns = [
  { key: 'orderType', label: 'Order Type' },
  { key: 'shippingPointDesc', label: 'Description(Shipping Point)' },
  { key: 'shipToDesc', label: 'Description(Ship-To (Outbound))' },
  { key: 'soldToDesc', label: 'Description(Sold-To)' },
  { key: 'materialDesc', label: 'Description(Material)' },
  { key: 'deliveryQty', label: 'Delivery Qty' },
  { key: 'deliveryUnit', label: 'Delivery Unit' },
  { key: 'plannedPalletQty', label: 'Planned Pallet Quantity' },
  { key: 'volume', label: 'Volume' },
  { key: 'weight', label: 'Weight' },
  { key: 'originZone', label: 'Origin Zone' },
  { key: 'destZone', label: 'Destination Zone' },
  { key: 'specialProcessInd', label: 'Special Process Indicator' },
  { key: 'specialProcessDesc', label: 'Description(Special Process Indicator)' },
  { key: 'intransitDate', label: 'Mobility Intransit start date' },
  { key: 'podDate', label: 'POD Date' }
];

const GEMINI_CONFIG = {
  API_KEY: "", // ใส่ Gemini API Key ของคุณที่นี่
  MODEL: "gemini-3-flash-preview"
};
// ==============================================================================
// SMART LOGISTICS i18n ENGINE (ACCURATE DOMAIN-SPECIFIC TRANSLATION)
// ==============================================================================

// 1. คลังคำศัพท์เฉพาะทางด้านโลจิสติกส์และภูมิศาสตร์ (กำหนดความหมายที่ถูกต้อง)
const LOGISTICS_DICT = {
  // --- ภูมิภาค / โซน (ZONES & REGIONS) ---
  'เหนือบน': 'Upper North',
  'เหนือล่าง': 'Lower North',
  'ภาคเหนือตอนบน': 'Upper Northern',
  'ภาคเหนือตอนล่าง': 'Lower Northern',
  'ภาคเหนือ': 'Northern',
  'อีสานบน': 'Upper Northeast',
  'อีสานล่าง': 'Lower Northeast',
  'ภาคอีสาน': 'Northeastern',
  'ตะวันออกเฉียงเหนือ': 'Northeast',
  'กลางบน': 'Upper Central',
  'กลางล่าง': 'Lower Central',
  'ภาคกลาง': 'Central Region',
  'ใต้บน': 'Upper South',
  'ใต้ล่าง': 'Lower South',
  'ภาคใต้ตอนบน': 'Upper Southern',
  'ภาคใต้ตอนล่าง': 'Lower Southern',
  'ภาคใต้': 'Southern',
  'ตะวันออก': 'Eastern',
  'ตะวันตก': 'Western',
  'กรุงเทพฯ และปริมณฑล': 'Bangkok & Vicinity',
  'ชานเมือง': 'Suburbs',
  'กรุงเทพฯ': 'Bangkok',
  'กทม.': 'BKK',

  // --- แผนที่ & ตัวกรอง (MAP & FILTERS) ---
  // 'เส้นทางทั้งหมด': 'All Routes',
  // 'ความหนาแน่นของเส้นทาง': 'Trip Density',
  // 'โควตาว่าง': 'Available Backhaul',
  // 'งานเต็ม': 'Full / 0% Available',
  // 'ต้นทาง': 'Origin',
  // 'ปลายทาง': 'Destination',
  // 'จังหวัด': 'Province',
  // 'โซน': 'Zone',
  // 'ภาค': 'Region',
  // 'ค้นหา': 'Search',
  // 'ทั้งหมด': 'All',

  // --- ประเภทรถ (TRUCK TYPES) ---
  'ประเภทรถ': 'Truck Type',
  '4 ล้อ': '4-Wheeler',
  'รถ 4 ล้อ': '4-Wheel Truck',
  '6 ล้อ': '6-Wheeler',
  'รถ 6 ล้อ': '6-Wheel Truck',
  '10 ล้อ': '10-Wheeler',
  'รถ 10 ล้อ': '10-Wheel Truck',
  'เทรลเลอร์': 'Trailer',
  'รถเทรลเลอร์': 'Trailer',
  'หัวลาก': 'Prime Mover',

  // // --- ข้อมูลตาราง & งานขนส่ง (OPERATIONS & KPI) ---
  // 'ผู้รับเหมา': 'Carriers',
  // 'ประเภทรถ': 'Truck Type',
  // 'ประเภทสินค้า': 'Product Category',
  // 'ลูกค้า': 'Customer',
  // 'ประเภทลูกค้า': 'Customer Type',
  // 'เที่ยว/สัปดาห์': 'Trips/Wk',
  // 'เที่ยวว่าง': 'Available Trips',
  // 'ภาระงานรวม': 'Total Workload',
  // 'สัดส่วนรถว่าง': 'Available Proportion',
  // 'งานบุญรอด': 'Boonrawd Task',
  // 'งานของผู้รับเหมาเอง': 'Own Task',
  // 'งานนอกของ BRF': 'BRF External',
  // 'ระบุต้นทาง และ ปลายทาง งานนอกของ BRF': 'External Route Details',
  // 'ไม่มีเส้นทางวิ่ง': 'No Routes Available',
  // 'ไม่พบข้อมูล': 'No Data Found',
  // 'ไม่ระบุ': 'Unspecified'
};

// สร้างพจนานุกรมแปลกลับ (EN -> TH) อัตโนมัติ
const REVERSE_DICT = Object.entries(LOGISTICS_DICT).reduce((acc, [th, en]) => {
  acc[en] = th;
  return acc;
}, {});

// สถานะภาษาปัจจุบัน (ดึงจาก localStorage ถ้ามี)
let currentAppLang = localStorage.getItem('app_lang') || 'th';

/**
 * ฟังก์ชันแปลคำศัพท์เดี่ยวสำหรับใช้ใน JavaScript Template Literal
 * เช่น t('เหนือบน') -> 'Upper North'
 */
function t(term) {
  if (!term) return '';
  const clean = String(term).trim();
  if (currentAppLang === 'en') {
    return LOGISTICS_DICT[clean] || clean;
  }
  return REVERSE_DICT[clean] || clean;
}

/**
 * สแกนและแปลข้อความบนหน้าเว็บอัตโนมัติ (DOM Tree Walker)
 * ปลอดภัย ไม่ทำลายแท็ก HTML, Event Listener หรือโครงสร้างเดิม
 */
function applySmartTranslation(targetLang) {
  currentAppLang = targetLang;
  localStorage.setItem('app_lang', targetLang);

  const isEn = targetLang === 'en';
  const dict = isEn ? LOGISTICS_DICT : REVERSE_DICT;
  const dictKeys = Object.keys(dict).sort((a, b) => b.length - a.length); // คำยาวแปลก่อน ป้องกันคำสั้นทับ

  // ฟังก์ชันแทนที่คำในข้อความ
  const replaceText = (text) => {
    let result = text;
    dictKeys.forEach(key => {
      if (result.includes(key)) {
        // ใช้ RegExp แบบ Safe Replace
        result = result.split(key).join(dict[key]);
      }
    });
    return result;
  };

  // เดินตรวจ Text Node ทั้งหน้าเว็บ ยกเว้น tag script, style
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parentTag = node.parentElement ? node.parentElement.tagName.toLowerCase() : '';
        if (['script', 'style', 'noscript', 'code'].includes(parentTag)) {
          return NodeFilter.FILTER_REJECT;
        }
        return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    }
  );

  let currentNode;
  while ((currentNode = walker.nextNode())) {
    const originalText = currentNode.nodeValue;
    const translated = replaceText(originalText);
    if (originalText !== translated) {
      currentNode.nodeValue = translated;
    }
  }

  // อัปเดตข้อความบนปุ่ม
  const langBtn = document.getElementById('toggle-lang');
  if (langBtn) {
    langBtn.innerText = isEn ? 'TH' : 'EN';
  }
}

// ==============================================================================
// ผูก EVENT เข้ากับปุ่ม #toggle-lang
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => {
  const langBtn = document.getElementById('toggle-lang');
  if (!langBtn) return;

  // ตั้งค่าเริ่มต้นปุ่ม
  langBtn.innerText = currentAppLang === 'en' ? 'TH' : 'EN';

  // ถ้าเคยเลือกภาษาอังกฤษไว้ ให้แปลทันทีตอนโหลดหน้า
  if (currentAppLang === 'en') {
    setTimeout(() => applySmartTranslation('en'), 200);
  }

  langBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const nextLang = currentAppLang === 'th' ? 'en' : 'th';
    applySmartTranslation(nextLang);

    // หากมีตารางที่เพิ่ง render ให้สั่ง renderTable ใหม่อีกครั้งให้สอดคล้องกัน (ถ้ามีฟังก์ชัน)
    if (typeof renderTable === 'function' && typeof currentFilteredData !== 'undefined') {
      renderTable(currentFilteredData);
    }
  });
});