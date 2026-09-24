import { describe, it, expect } from 'vitest';
import { parseNum, cleanAllSpaces, escapeHtml } from '../src/utils/helpers.js'; // 💡 เปลี่ยน Path มาที่นี่

describe('Utility Functions', () => {
  describe('parseNum', () => {
    it('ควรแปลงข้อความที่มีจุลภาค (comma) ให้เป็นตัวเลขได้ถูกต้อง', () => {
      expect(parseNum('1,234.56')).toBe(1234.56);
    });

    it('ควรลบเครื่องหมายเปอร์เซ็นต์ (%) และคืนค่าตัวเลขที่ถูกต้อง', () => {
      expect(parseNum('50%')).toBe(50);
    });

    it('ควรคืนค่า default (0) หากใส่ค่าที่ไม่ใช่ตัวเลข (invalid)', () => {
      expect(parseNum('invalid data')).toBe(0);
    });

    it('ควรคืนค่า default ที่กำหนดเองได้เมื่อเจอค่า null/undefined', () => {
      expect(parseNum(null, 10)).toBe(10);
    });
  });

  describe('cleanAllSpaces', () => {
    it('ควรลบช่องว่างทั้งหมดและแปลงตัวอักษรเป็นพิมพ์เล็ก', () => {
      expect(cleanAllSpaces('  BANGKOK  Metro  ')).toBe('bangkokmetro');
    });

    it('ควรคืนค่าสตริงว่างหากข้อมูลเป็น null', () => {
      expect(cleanAllSpaces(null)).toBe('');
    });
  });

  describe('escapeHtml', () => {
    it('ควรแปลงอักขระพิเศษ HTML เพื่อป้องกัน XSS Attack', () => {
      expect(escapeHtml('<script>alert("XSS")</script>')).toBe('&lt;script&gt;alert("XSS")&lt;/script&gt;');
    });
  });
});
