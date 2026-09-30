import { describe, it, expect } from 'vitest';
import { parseNum, cleanAllSpaces, escapeHtml } from '../src/utils/helpers.js'; // 💡 เปลี่ยน Path มาที่นี่
import { generateTrendTimeKeysInRange, getTrendTimeKey, parseTrendDateKey } from '../src/utils/trend.js';

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

describe('Trend time helpers', () => {
  it('creates continuous monthly keys for a partial date range', () => {
    expect(generateTrendTimeKeysInRange('2026-01-15', '2026-04-10', 'month')).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04'
    ]);
  });

  it('creates continuous yearly keys across year boundaries', () => {
    expect(generateTrendTimeKeysInRange('2025-12-20', '2026-02-10', 'year')).toEqual(['2025', '2026']);
  });

  it('groups weeks from Monday, including dates that start on Sunday', () => {
    expect(getTrendTimeKey('2026-01-04', 'week')).toBe('2025-12-29');
    expect(generateTrendTimeKeysInRange('2026-01-04', '2026-01-04', 'week')).toEqual(['2025-12-29']);
  });

  it('rejects invalid calendar dates and reversed ranges', () => {
    expect(parseTrendDateKey('2026-02-30')).toBeNull();
    expect(generateTrendTimeKeysInRange('2026-04-10', '2026-01-15', 'month')).toEqual([]);
  });
});
