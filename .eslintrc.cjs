module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true
  },
  extends: [
    'eslint:recommended',
    'plugin:prettier/recommended' // ผูก Prettier เข้ากับ ESLint
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  // อนุญาตให้ใช้ตัวแปรจาก CDN (จะได้ไม่ฟ้อง Error ว่า undefined)
  globals: {
    L: 'readonly',
    ApexCharts: 'readonly',
    Papa: 'readonly',
    lucide: 'readonly',
    tailwind: 'readonly'
  },
  rules: {
    // ปรับให้เตือน (warn) แทนที่จะ error พังไปเลย เพื่อความยืดหยุ่น
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug', 'time', 'timeEnd', 'log'] }]
  }
};