# BevChain Logistics Network (Full Feature Edition)

ระบบบริหารจัดการและวิเคราะห์เส้นทางขนส่ง **BevChain Control Tower** ที่พัฒนาและแยกไฟล์สำหรับรันบน VS Code โดยดึงความสามารถหลักทั้งหมดจากโค้ดฉบับเต็มมาทำงานร่วมกันอย่างสมบูรณ์

---

## 📁 โครงสร้างโปรเจกต์ (VS Code Folder Structure)

```text
bevchain-dashboard/
├── index.html            # โครงสร้างหน้าจอหลัก, Login Screen, Layout
├── css/
│   └── styles.css        # Animations (@keyframes), Leaflet Custom Tooltips, Scrollbar
├── js/
│   ├── config.js         # Master Data Dictionaries, Node Coordinates, Table Headers, Gemini Config
│   ├── api.js            # Subcontractors Master (17 fields), Scoring Logic, Mock Historical Data & Gemini API Call
│   ├── map.js            # Leaflet Map Engine, Animated Flow Markers, Bezier Curve Routes
│   └── app.js            # State Management, ApexCharts, Dynamic Accordion Filters, Simulation & UI Handlers
└── README.md             # เอกสารอธิบายโปรเจกต์