import { describe, it, expect } from 'vitest';
import { parseNum, cleanAllSpaces, escapeHtml } from '../src/utils/helpers.js'; // 💡 เปลี่ยน Path มาที่นี่
import {
  aggregateTrendByDistinctRoute,
  calculateTrendPlanBaseline,
  calculateDistinctRoutePlanTotals,
  generateTrendTimeKeysInRange,
  getTrendBucketCoverage,
  getTrendIsoWeekNumber,
  getTrendTimeframe,
  getTrendTimeKey,
  getTrendWeekday,
  isTrendOnPeakWeek,
  parseTrendDateKey,
  summarizeActualPeriods
} from '../src/utils/trend.js';

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
  it('chooses chart granularity from the selected date range', () => {
    expect(getTrendTimeframe('2026-01-01', '2026-01-31')).toBe('day');
    expect(getTrendTimeframe('2026-01-01', '2026-03-15')).toBe('week');
    expect(getTrendTimeframe('2026-01-01', '2026-10-01')).toBe('month');
    expect(getTrendTimeframe('2023-01-01', '2026-10-01')).toBe('year');
  });

  it('summarizes actual periods and excludes zero-data periods from the average', () => {
    expect(summarizeActualPeriods([100, 0, 300])).toEqual({
      totalActualTrips: 400,
      averageActualPerPeriod: 200,
      peakActualPerPeriod: 300,
      periodsWithData: 2
    });
    expect(summarizeActualPeriods([])).toEqual({
      totalActualTrips: 0,
      averageActualPerPeriod: 0,
      peakActualPerPeriod: 0,
      periodsWithData: 0
    });
  });

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

  it('groups dates by weekday and limits annual weekly charts to 52 weeks', () => {
    expect(getTrendWeekday('2026-01-04')).toBe('Sun');
    expect(generateTrendTimeKeysInRange('2025-10-03', '2026-10-02', 'weekday')).toEqual([
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat'
    ]);
    expect(generateTrendTimeKeysInRange('2025-10-03', '2026-10-02', 'week')).toHaveLength(52);
  });

  it('classifies exactly 13 ISO weeks as on-peak', () => {
    const peakWeeks = Array.from({ length: 52 }, (_, index) => index + 1).filter((weekNumber) => {
      const monday = new Date(Date.UTC(2025, 0, 6 + (weekNumber - 1) * 7));
      const dateKey = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
      return isTrendOnPeakWeek(dateKey);
    });

    expect(peakWeeks).toHaveLength(13);
    expect(getTrendIsoWeekNumber('2026-03-02')).toBe(10);
    expect(isTrendOnPeakWeek('2026-03-02')).toBe(true);
    expect(isTrendOnPeakWeek('2026-04-20')).toBe(false);
    expect(isTrendOnPeakWeek('2026-11-16')).toBe(true);
    expect(isTrendOnPeakWeek('2026-12-28')).toBe(false);
  });

  it('uses the selected peak plan for each weekly baseline and removes excluded periods', () => {
    const baseOptions = {
      timeframe: 'week',
      startKey: '2026-03-02',
      endKey: '2026-03-08',
      weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      onPeakWeekly: 140,
      offPeakWeekly: 70,
      showOnPeak: true,
      showOffPeak: true
    };

    expect(calculateTrendPlanBaseline({ ...baseOptions, bucketKey: '2026-03-02' })).toBe(140);
    expect(
      calculateTrendPlanBaseline({
        ...baseOptions,
        bucketKey: '2026-03-02',
        weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
      })
    ).toBe(100);
    expect(calculateTrendPlanBaseline({ ...baseOptions, bucketKey: '2026-03-02', showOnPeak: false })).toBeNull();
  });

  it('uses the matching peak plan for daily and weekday baselines', () => {
    const baselineOptions = {
      startKey: '2026-03-02',
      endKey: '2026-03-08',
      weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      onPeakWeekly: 140,
      offPeakWeekly: 70,
      showOnPeak: true,
      showOffPeak: false
    };

    expect(calculateTrendPlanBaseline({ ...baselineOptions, timeframe: 'day', bucketKey: '2026-03-02' })).toBe(20);
    expect(calculateTrendPlanBaseline({ ...baselineOptions, timeframe: 'weekday', bucketKey: 'Mon' })).toBe(20);
    expect(
      calculateTrendPlanBaseline({
        ...baselineOptions,
        startKey: '2026-04-20',
        endKey: '2026-04-26',
        timeframe: 'weekday',
        bucketKey: 'Sun'
      })
    ).toBeNull();
  });

  it('rejects invalid calendar dates and reversed ranges', () => {
    expect(parseTrendDateKey('2026-02-30')).toBeNull();
    expect(generateTrendTimeKeysInRange('2026-04-10', '2026-01-15', 'month')).toEqual([]);
  });

  it('prorates partial weekly and monthly buckets by selected calendar days', () => {
    expect(getTrendBucketCoverage('2026-01-05', 'week', '2026-01-06', '2026-01-08')).toBeCloseTo(3 / 7);
    expect(getTrendBucketCoverage('2026-01', 'month', '2026-01-15', '2026-02-10')).toBeCloseTo(17 / 31);
    expect(getTrendBucketCoverage('2026-02', 'month', '2026-01-15', '2026-02-10')).toBeCloseTo(10 / 28);
    expect(getTrendBucketCoverage('2026-02', 'month', '2026-03-01', '2026-03-31')).toBe(0);
  });
});

describe('Distinct Route trend aggregation', () => {
  it('groups carriers into one route while applying each carrier availability', () => {
    const activeRoutes = [
      {
        _parsed: {
          distinctKey: 'route-a',
          rowMatchKey: 'route-a__carrier-full',
          trips: 10,
          tripsDay: 2,
          availTrips: 0,
          availTripsDay: 0,
          availPct: 0
        }
      },
      {
        _parsed: {
          distinctKey: 'route-a',
          rowMatchKey: 'route-a__carrier-available',
          trips: 5,
          tripsDay: 1,
          availTrips: 2.5,
          availTripsDay: 0.5,
          availPct: 50
        }
      }
    ];
    const routeTxIndex = {
      'route-a__carrier-full': [{ d: '2026-01-05', v: 100 }],
      'route-a__carrier-available': [{ d: '2026-01-05', v: 20 }]
    };

    const result = aggregateTrendByDistinctRoute(activeRoutes, routeTxIndex, {
      startKey: '2026-01-01',
      endKey: '2026-01-31',
      timeframe: 'month'
    });

    expect(Object.keys(result)).toEqual(['route-a']);
    expect(result['route-a']).toMatchObject({
      hasAvailable: true,
      totalTrips: 15,
      availableTrips: 2.5,
      periods: {
        '2026-01': { totalActual: 120, estimatedAvailable: 10 }
      }
    });
  });

  it('weights carrier availability by planned trips', () => {
    const activeRoutes = [
      {
        _parsed: {
          distinctKey: 'route-a',
          rowMatchKey: 'route-a__carrier-a',
          trips: 10,
          tripsDay: 2,
          availTrips: 10,
          availTripsDay: 2,
          availPct: 100
        }
      },
      {
        _parsed: {
          distinctKey: 'route-a',
          rowMatchKey: 'route-a__carrier-a',
          trips: 90,
          tripsDay: 18,
          availTrips: 0,
          availTripsDay: 0,
          availPct: 0
        }
      }
    ];
    const routeTxIndex = {
      'route-a__carrier-a': [{ d: '2026-01-05', v: 100 }]
    };

    const result = aggregateTrendByDistinctRoute(activeRoutes, routeTxIndex, {
      startKey: '2026-01-01',
      endKey: '2026-01-31',
      timeframe: 'month'
    });

    expect(result['route-a'].periods['2026-01']).toEqual({ totalActual: 100, estimatedAvailable: 10 });
  });

  it('filters transaction totals by selected weekdays, including an empty selection', () => {
    const activeRoutes = [
      {
        _parsed: {
          distinctKey: 'route-a',
          rowMatchKey: 'route-a__carrier-a',
          trips: 7,
          tripsDay: 1,
          availTrips: 7,
          availTripsDay: 1,
          availPct: 100
        }
      }
    ];
    const routeTxIndex = {
      'route-a__carrier-a': [
        { d: '2026-01-04', v: 10 },
        { d: '2026-01-05', v: 20 }
      ]
    };
    const options = { startKey: '2026-01-04', endKey: '2026-01-05', timeframe: 'weekday' };

    const sundayOnly = aggregateTrendByDistinctRoute(activeRoutes, routeTxIndex, {
      ...options,
      weekdays: ['Sun']
    });
    const noDays = aggregateTrendByDistinctRoute(activeRoutes, routeTxIndex, { ...options, weekdays: [] });

    expect(sundayOnly['route-a'].periods.Sun.totalActual).toBe(10);
    expect(noDays['route-a'].periods).toEqual({});
  });

  it('uses total planned trips across Distinct Routes', () => {
    const distinctRoutes = [
      { totalTrips: 12, totalTripsDay: 2, availableTrips: 6, availableTripsDay: 1 },
      { totalTrips: 4, totalTripsDay: 1, availableTrips: 0, availableTripsDay: 0 }
    ];

    expect(calculateDistinctRoutePlanTotals(distinctRoutes, 'week')).toEqual({
      baselineValue: 16,
      baselineAvailableValue: 6
    });
    expect(calculateDistinctRoutePlanTotals(distinctRoutes, 'day')).toEqual({
      baselineValue: 3,
      baselineAvailableValue: 1
    });
    expect(calculateDistinctRoutePlanTotals([], 'week')).toEqual({ baselineValue: 0, baselineAvailableValue: 0 });
  });
});
