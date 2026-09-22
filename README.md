# BevChain Logistics Network - Executive Control Tower 🚛

ระบบบริหารจัดการและวิเคราะห์เส้นทางขนส่งเชิงลึก (Control Tower & Backhaul Matching) พัฒนาขึ้นเพื่อมอนิเตอร์ความจุของรถขนส่ง (Carrier Capacity), การกระจายตัวของเที่ยววิ่ง (Route Distribution), และประเมินโอกาสในการจับคู่เที่ยวขากลับ (Backhaul Optimization) ผ่าน Interactive Dashboard และระบบแผนที่อัจฉริยะ

---

## ✨ Key Features (ความสามารถหลัก)

1. **Executive & Route Dashboards:**
   - สรุปภาพรวม KPI ระดับประเทศ (Distinct Routes, Carrier Availability, Trips/Week)
   - ตารางเจาะลึกข้อมูลเส้นทางแบบ Expandable Accordion พร้อมระบบ Pagination (หน้าละ 50 รายการ)
2. **Interactive Map Engine (Leaflet.js):**
   - **Choropleth Map:** แผนที่แสดงความหนาแน่นระดับภาค (Zone) และจังหวัด พร้อมระบบเปลี่ยนสี/เทาเมื่อเจาะลึกข้อมูล
   - **Smart Routing:** แสดงเส้นทาง Point-to-Point แบบ Bezier Curve พร้อมระบบ Fallback Coordinates (หากไม่มีพิกัดจุดส่ง จะปักหมุดที่กึ่งกลางจังหวัดอัตโนมัติ)
3. **High-Performance Data Handling:**
   - รองรับข้อมูล **> 15,000 รายการ** อย่างลื่นไหลด้วยเทคนิค **Dynamic Batch Pagination**
   - ระบบ **Persistent Cache (Session Storage)** เพื่อลดภาระ API และสลับหน้าจอได้ใน 0 มิลลิวินาที
   - การคลายล็อค CPU (`yieldToMain`) ป้องกันหน้าจอค้างระหว่างประมวลผล Filter
4. **Advanced Dynamic Filters:**
   - ตัวกรองอัจฉริยะที่เชื่อมโยงกัน (Province, Zone, Truck Type, Carrier) แบบ Real-time
5. **Data Export:** ระบบดึงข้อมูลที่ผ่านการกรองออกเป็นไฟล์ CSV

---

## 💻 Tech Stack

* **Frontend:** HTML5, CSS3, JavaScript (Vanilla ES6+)
* **Styling:** Tailwind CSS (ผ่าน CDN)
* **Icons:** Lucide Icons
* **Maps & Charts:** Leaflet.js, ApexCharts
* **Backend / Database:** Supabase (PostgreSQL) + PostgREST API

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

\`\`\`text
bevchain-dashboard/
├── index.html            # โครงสร้างหน้าจอหลัก, Login Screen, Dashboards, Global Loader
├── css/
│   └── styles.css        # Animations (@keyframes), Leaflet Custom Tooltips, Custom Scrollbar
├── data/
│   └── thailand.json     # ไฟล์ GeoJSON สำหรับขอบเขตจังหวัดในประเทศไทย
├── js/
│   ├── config.js         # ตั้งค่าตัวแปรระบบ, API Keys, และพจนานุกรมแปลภาษา (Logistics Dictionary)
│   ├── api.js            # ระบบเชื่อมต่อ Supabase, Dynamic Batching (>15k rows), และระบบ Caching
│   ├── map.js            # Leaflet Map Engine, Animated Markers, ควบคุมสถานะ Drill-down ภาค/จังหวัด
│   └── app.js            # State Management, UI Controllers, Filter Logic, Pagination และ Anti-Freeze
└── README.md             # เอกสารคู่มือโปรเจกต์
\`\`\`

---

## 🚀 การติดตั้งและรันโปรเจกต์ (Local Setup)

1. **ติดตั้ง VS Code Extension:**
   แนะนำให้ติดตั้ง Extension **"Live Server"** (โดย Ritwick Dey)
2. **ตั้งค่าฐานข้อมูล (Environment):**
   ตรวจสอบไฟล์ `js/config.js` ว่ามีการตั้งค่า `SUPABASE_URL` และ `SUPABASE_KEY` ไว้เรียบร้อยแล้ว
3. **รันโปรเจกต์:**
   คลิกขวาที่ไฟล์ `index.html` แล้วเลือก **"Open with Live Server"**

---

## 🔧 Database Architecture (Supabase)

ระบบเชื่อมต่อกับ PostgreSQL ผ่าน Materialized Views เพื่อรีดประสิทธิภาพสูงสุด:
* `view_routes_with_coords`: View หลักที่รวมข้อมูล Route, % ว่าง, และคำนวณพิกัด (Exact & Fallback) เสร็จสรรพ
* `view_exec_province_summary`: สรุปข้อมูลระดับจังหวัดสำหรับแผนที่ Choropleth
* **RPC (Remote Procedure Call):** ใช้ฟังก์ชัน `get_executive_summary_kpi` คำนวณยอดรวม Trips/Week ล่วงหน้าจากหลังบ้าน

> **Note:** ตรวจสอบให้แน่ใจว่าการตั้งค่า **Max Rows** ใน API Settings ของ Supabase ถูกปรับเป็น `50000` แล้ว เพื่อไม่ให้ข้อมูลถูกตัดตอนดึง Batch