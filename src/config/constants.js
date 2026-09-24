export const dict = {
  th: {
    appTitle: 'BevChain',
    appSub: 'Logistics Network',
    adminRole: 'ผู้จัดการฝ่ายขนส่ง (Logistics Manager)',
    menu: {
      exec: 'แดชบอร์ดผู้บริหาร (Executive Dashboard)',
      dashboard: 'แดชบอร์ดเส้นทางรวม (Route Dashboard)',
      mapping: 'วิเคราะห์เส้นทางลูกค้าใหม่ (New Order Mapping)'
    }
  },
  en: {
    appTitle: 'BevChain',
    appSub: 'Logistics Network',
    adminRole: 'Logistics Manager',
    menu: {
      exec: 'Executive Dashboard',
      dashboard: 'Route Dashboard',
      mapping: 'New Order Mapping'
    }
  }
};

export const locationHierarchy = {
  ภาคกลาง: ['กรุงเทพมหานคร', 'ปทุมธานี', 'พระนครศรีอยุธยา'],
  ภาคเหนือ: ['เชียงใหม่', 'เชียงราย'],
  ภาคอีสาน: ['นครราชสีมา', 'ขอนแก่น'],
  ภาคตะวันออก: ['ระยอง', 'ชลบุรี'],
  ภาคใต้: ['สุราษฎร์ธานี', 'สงขลา']
};

export const PROVINCE_NAME_MAP = {
  bangkok: 'กรุงเทพมหานคร',
  bangkokmetropolis: 'กรุงเทพมหานคร',
  krungthep: 'กรุงเทพมหานคร',
  krungthepmahanakhon: 'กรุงเทพมหานคร',
  samutprakan: 'สมุทรปราการ',
  nonthaburi: 'นนทบุรี',
  pathumthani: 'ปทุมธานี',
  samutsakhon: 'สมุทรสาคร',
  nakhonpathom: 'นครปฐม',
  samutsongkhram: 'สมุทรสงคราม',
  phranakhonsiayutthaya: 'พระนครศรีอยุธยา',
  ayutthaya: 'พระนครศรีอยุธยา',
  angthong: 'อ่างทอง',
  lopburi: 'ลพบุรี',
  singburi: 'สิงห์บุรี',
  chainat: 'ชัยนาท',
  saraburi: 'สระบุรี',
  suphanburi: 'สุพรรณบุรี',
  nakhonnayok: 'นครนายก',
  chonburi: 'ชลบุรี',
  rayong: 'ระยอง',
  chanthaburi: 'จันทบุรี',
  trat: 'ตราด',
  chachoengsao: 'ฉะเชิงเทรา',
  prachinburi: 'ปราจีนบุรี',
  sakaeo: 'สระแก้ว',
  nakhonratchasima: 'นครราชสีมา',
  korat: 'นครราชสีมา',
  buriram: 'บุรีรัมย์',
  surin: 'สุรินทร์',
  sisaket: 'ศรีสะเกษ',
  ubonratchathani: 'อุบลราชธานี',
  yasothon: 'ยโสธร',
  chaiyaphum: 'ชัยภูมิ',
  amnatcharoen: 'อำนาจเจริญ',
  buengkan: 'บึงกาฬ',
  bungkan: 'บึงกาฬ',
  nongbualamphu: 'หนองบัวลำภู',
  khonkaen: 'ขอนแก่น',
  udonthani: 'อุดรธานี',
  loei: 'เลย',
  nongkhai: 'หนองคาย',
  mahasarakham: 'มหาสารคาม',
  roiet: 'ร้อยเอ็ด',
  kalasin: 'กาฬสินธุ์',
  sakonnakhon: 'สกลนคร',
  nakhonphanom: 'นครพนม',
  mukdahan: 'มุกดาหาร',
  chiangmai: 'เชียงใหม่',
  lamphun: 'ลำพูน',
  lampang: 'ลำปาง',
  uttaradit: 'อุตรดิตถ์',
  phrae: 'แพร่',
  nan: 'น่าน',
  phayao: 'พะเยา',
  chiangrai: 'เชียงราย',
  maehongson: 'แม่ฮ่องสอน',
  nakhonsawan: 'นครสวรรค์',
  uthaithani: 'อุทัยธานี',
  kamphaengphet: 'กำแพงเพชร',
  tak: 'ตาก',
  sukhothai: 'สุโขทัย',
  phitsanulok: 'พิษณุโลก',
  phichit: 'พิจิตร',
  phetchabun: 'เพชรบูรณ์',
  ratchaburi: 'ราชบุรี',
  kanchanaburi: 'กาญจนบุรี',
  phetchaburi: 'เพชรบุรี',
  prachuapkhirikhan: 'ประจวบคีรีขันธ์',
  nakhonsithammarat: 'นครศรีธรรมราช',
  krabi: 'กระบี่',
  phangnga: 'พังงา',
  phuket: 'ภูเก็ต',
  suratthani: 'สุราษฎร์ธานี',
  ranong: 'ระนอง',
  chumphon: 'ชุมพร',
  songkhla: 'สงขลา',
  satun: 'สตูล',
  trang: 'ตรัง',
  phatthalung: 'พัทลุง',
  pattani: 'ปัตตานี',
  yala: 'ยะลา',
  narathiwat: 'นราธิวาส'
};

export const nodeLocations = {
  'P-BKK': { region: 'ภาคกลาง', province: 'ปทุมธานี' },
  'P-RYG': { region: 'ภาคตะวันออก', province: 'ระยอง' },
  'P-AYU': { region: 'ภาคกลาง', province: 'พระนครศรีอยุธยา' },
  'S-CNX': { region: 'ภาคเหนือ', province: 'เชียงใหม่' },
  'S-NMA': { region: 'ภาคอีสาน', province: 'นครราชสีมา' },
  'S-SUR': { region: 'ภาคใต้', province: 'สุราษฎร์ธานี' },
  'S-HDY': { region: 'ภาคใต้', province: 'สงขลา' }
};

export const mapNodes = [
  {
    id: 'P-BKK',
    type: 'plant',
    name: { th: 'โรงงาน ปทุมธานี', en: 'Pathum Thani Brewery' },
    lat: 14.0208,
    lon: 100.525
  },
  {
    id: 'P-RYG',
    type: 'plant',
    name: { th: 'ศูนย์กระจาย ระยอง', en: 'Rayong DC' },
    lat: 12.6814,
    lon: 101.2816
  },
  {
    id: 'P-AYU',
    type: 'plant',
    name: { th: 'โรงงาน อยุธยา', en: 'Ayutthaya Plant' },
    lat: 14.35,
    lon: 100.5667
  },
  {
    id: 'S-CNX',
    type: 'shipto',
    name: { th: 'เชียงใหม่ (DC)', en: 'Chiang Mai (DC)' },
    lat: 18.7883,
    lon: 98.9853
  },
  {
    id: 'S-NMA',
    type: 'shipto',
    name: { th: 'โคราช (DC)', en: 'Korat (DC)' },
    lat: 14.9799,
    lon: 102.0978
  },
  {
    id: 'S-SUR',
    type: 'shipto',
    name: { th: 'สุราษฎร์ฯ (DC)', en: 'Surat (DC)' },
    lat: 9.1333,
    lon: 99.3333
  },
  {
    id: 'S-HDY',
    type: 'shipto',
    name: { th: 'หาดใหญ่ (DC)', en: 'Hat Yai (DC)' },
    lat: 7.0096,
    lon: 100.4736
  }
];

export const routeSummaryColumns = [
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

export const loadColumns = [
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

export const shipmentColumns = [
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
  {
    key: 'specialProcessDesc',
    label: 'Description(Special Process Indicator)'
  },
  { key: 'intransitDate', label: 'Mobility Intransit start date' },
  { key: 'podDate', label: 'POD Date' }
];

export const GEMINI_CONFIG = {
  API_KEY: import.meta.env.VITE_GEMINI_API_KEY || '',
  MODEL: 'gemini-3-flash-preview'
};

export const LOGISTICS_DICT = {
  เหนือบน: 'Upper North',
  เหนือล่าง: 'Lower North',
  ภาคเหนือตอนบน: 'Upper Northern',
  ภาคเหนือตอนล่าง: 'Lower Northern',
  ภาคเหนือ: 'Northern',
  อีสานบน: 'Upper Northeast',
  อีสานล่าง: 'Lower Northeast',
  ภาคอีสาน: 'Northeastern',
  ตะวันออกเฉียงเหนือ: 'Northeast',
  กลางบน: 'Upper Central',
  กลางล่าง: 'Lower Central',
  ภาคกลาง: 'Central Region',
  ใต้บน: 'Upper South',
  ใต้ล่าง: 'Lower South',
  ภาคใต้ตอนบน: 'Upper Southern',
  ภาคใต้ตอนล่าง: 'Lower Southern',
  ภาคใต้: 'Southern',
  ตะวันออก: 'Eastern',
  ตะวันตก: 'Western',
  'กรุงเทพฯ และปริมณฑล': 'Bangkok & Vicinity',
  ชานเมือง: 'Suburbs',
  กรุงเทพฯ: 'Bangkok',
  'กทม.': 'BKK',
  ประเภทรถ: 'Truck Type',
  '4 ล้อ': '4-Wheeler',
  'รถ 4 ล้อ': '4-Wheel Truck',
  '6 ล้อ': '6-Wheeler',
  'รถ 6 ล้อ': '6-Wheel Truck',
  '10 ล้อ': '10-Wheeler',
  'รถ 10 ล้อ': '10-Wheel Truck',
  เทรลเลอร์: 'Trailer',
  รถเทรลเลอร์: 'Trailer',
  หัวลาก: 'Prime Mover'
};

export const REVERSE_DICT = Object.entries(LOGISTICS_DICT).reduce((acc, [th, en]) => {
  acc[en] = th;
  return acc;
}, {});

export let currentAppLang = localStorage.getItem('app_lang') || 'th';

export function t(term) {
  if (!term) return '';
  const clean = String(term).trim();
  if (currentAppLang === 'en') {
    return LOGISTICS_DICT[clean] || clean;
  }
  return REVERSE_DICT[clean] || clean;
}

export function applySmartTranslation(targetLang) {
  currentAppLang = targetLang;
  localStorage.setItem('app_lang', targetLang);

  const isEn = targetLang === 'en';
  const dictToUse = isEn ? LOGISTICS_DICT : REVERSE_DICT;
  const dictKeys = Object.keys(dictToUse).sort((a, b) => b.length - a.length);

  const replaceText = (text) => {
    let result = text;
    dictKeys.forEach((key) => {
      if (result.includes(key)) {
        result = result.split(key).join(dictToUse[key]);
      }
    });
    return result;
  };

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parentTag = node.parentElement ? node.parentElement.tagName.toLowerCase() : '';
      if (['script', 'style', 'noscript', 'code'].includes(parentTag)) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });

  let currentNode;
  while ((currentNode = walker.nextNode())) {
    const originalText = currentNode.nodeValue;
    const translated = replaceText(originalText);
    if (originalText !== translated) {
      currentNode.nodeValue = translated;
    }
  }

  const langBtn = document.getElementById('toggle-lang');
  if (langBtn) {
    langBtn.innerText = isEn ? 'TH' : 'EN';
  }
}
