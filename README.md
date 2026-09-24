# BevChain Logistics Network - Executive Control Tower 🚛

ระบบบริหารจัดการและวิเคราะห์เส้นทางขนส่งเชิงลึก (Control Tower & Backhaul Matching) พัฒนาขึ้นเพื่อมอนิเตอร์ความจุของรถขนส่ง (Carrier Capacity), การกระจายตัวของเที่ยววิ่ง (Route Distribution), และประเมินโอกาสในการจับคู่เที่ยวขากลับ (Backhaul Optimization) ผ่าน Interactive Dashboard และระบบแผนที่อัจฉริยะ

---

## ✨ Key Features (ความสามารถหลัก)

1. **Executive Dashboard:**
   - สรุปภาพรวม KPI ระดับประเทศ (Distinct Routes, Carrier Availability, Trips/Week)
   - แผนที่ **Choropleth Map** แสดงความหนาแน่นและ Available Backhaul ระดับจังหวัด
2. **Route Dashboard & Analytics:**
   - แผนที่เส้นทางพร้อม Polyline แบบ Bezier Curve
   - ตัวกรองอัจฉริยะแบบ Dynamic (Province, Zone, Truck Type, Carrier)
   - ระบบตารางเจาะลึกพร้อม Pagination และ Export เป็น CSV
3. **New Order Mapping (Simulation):**
   - จำลองการเปิดเส้นทางใหม่ และดึงรายชื่อผู้รับเหมาที่มีโควตาว่าง (Available Capacity) บนเส้นทางนั้น
4. **Enterprise-Grade Performance & Security:**
   - โครงสร้าง **Vite + ES Modules** ช่วยให้โค้ดโหลดเร็วและจัดการง่าย
   - รองรับข้อมูล **> 15,000 รายการ** ด้วย Dynamic Batch Pagination และ SessionStorage Caching
   - ฐานข้อมูลปลอดภัยด้วย **Row Level Security (RLS)** บน Supabase
   - **Microsoft Azure AD** (OAuth) Integration สำหรับการยืนยันตัวตนพนักงาน

---

## 💻 Tech Stack

* **Frontend Build Tool:** Vite
* **Language:** JavaScript (ES6+ Modules)
* **Styling:** Tailwind CSS
* **Mapping Engine:** Leaflet.js
* **Charts & Data:** ApexCharts, PapaParse
* **Code Quality:** ESLint, Prettier, Husky, lint-staged
* **Testing:** Vitest, jsdom
* **Backend & Auth:** Supabase (PostgreSQL, PostgREST API, OAuth)

---

## 📁 โครงสร้างโปรเจกต์ (Folder Structure)

\`\`\`text
bevchain-control-tower/
├── .github/workflows/    # CI Pipeline (GitHub Actions)
├── public/
│   └── data/             # ไฟล์ Static เช่น thailand.json
├── src/
│   ├── config/           # ค่าคงที่ (Constants) และพจนานุกรม
│   ├── features/map/     # ระบบแผนที่ Leaflet และเลเยอร์ต่างๆ
│   ├── lib/              # การเชื่อมต่อ Supabase Client
│   ├── services/         # API fetching และ Authentication
│   ├── styles/           # Custom CSS (Animations, Scrollbar)
│   ├── utils/            # ฟังก์ชันช่วยเหลือ (Helpers)
│   └── main.js           # Entry Point ของแอปพลิเคชัน
├── tests/                # ไฟล์ Unit Tests (Vitest)
├── .env.example          # ตัวอย่างไฟล์ Environment Variables
├── index.html            # โครงสร้าง UI และ Layout หลัก
├── package.json          # รายชื่อ Dependencies และ Scripts
└── README.md             # เอกสารคู่มือโปรเจกต์
\`\`\`

---

## 🚀 การติดตั้งและรันโปรเจกต์ (Local Development)

**1. Clone โปรเจกต์และติดตั้ง Dependencies:**
\`\`\`bash
git clone <your-repo-url>
cd bevchain-control-tower
npm install
\`\`\`

**2. ตั้งค่า Environment Variables:**
สร้างไฟล์ `.env` ที่ Root โฟลเดอร์ (ห้ามนำขึ้น Git) และกำหนดค่าดังนี้:
\`\`\`env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
\`\`\`

**3. รัน Development Server:**
\`\`\`bash
npm run dev
\`\`\`
จากนั้นเปิดเบราว์เซอร์ที่ `http://localhost:5173/`

---

## 🛠️ คำสั่งสำหรับนักพัฒนา (Available Scripts)

- \`npm run dev\` : รันเซิร์ฟเวอร์สำหรับพัฒนา (Hot Reload)
- \`npm run build\` : สร้างไฟล์สำหรับนำขึ้น Production (Minified)
- \`npm run preview\` : ทดสอบรันไฟล์ Production บนเครื่องตัวเอง
- \`npm run format\` : จัดฟอร์แมตโค้ดอัตโนมัติด้วย Prettier
- \`npm run lint\` : ตรวจสอบข้อผิดพลาดของโค้ดด้วย ESLint
- \`npm run test\` : รัน Unit Test ทั้งหมดด้วย Vitest

*(หมายเหตุ: โปรเจกต์นี้มี Husky ติดตั้งอยู่ ระบบจะรัน Lint & Format อัตโนมัติทุกครั้งที่มีการ \`git commit\`)*

---

## 🔒 Database Configuration (Supabase)

เพื่อให้แอปทำงานได้อย่างสมบูรณ์ ต้องมีการตั้งค่าฐานข้อมูลดังนี้:
1. **API Max Rows:** ปรับตั้งค่าที่ `Project Settings > API > Max Rows` เป็น `50000`
2. **Security Definer View:** เนื่องจาก Materialized View ไม่รองรับ RLS เราจึงใช้ Function เพื่อดึงข้อมูลอย่างปลอดภัย:
   \`\`\`sql
   CREATE OR REPLACE FUNCTION get_view_routes_with_coords_secure()
   RETURNS SETOF "public"."view_routes_with_coords"
   LANGUAGE sql SECURITY DEFINER SET search_path = ''
   AS $$ SELECT * FROM "public"."view_routes_with_coords"; $$;
   \`\`\`
3. **RLS Enabled:** ทุกตาราง (`new_routes`, `province_locations`) ต้องเปิดใช้งาน RLS เพื่อให้เฉพาะ Authenticated Users เท่านั้นที่อ่านได้