export function parseTrendDateKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey || '');
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function getTrendTimeframe(startKey, endKey) {
  const start = parseTrendDateKey(startKey);
  const end = parseTrendDateKey(endKey);
  if (!start || !end || startKey > endKey) return 'day';

  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const rangeDays = (endUtc - startUtc) / 86400000;

  if (rangeDays <= 31) return 'day';
  if (rangeDays <= 180) return 'week';
  if (rangeDays <= 730) return 'month';
  return 'year';
}

export function formatTrendDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getWeekStartDateStr(dateKey) {
  const date = parseTrendDateKey(dateKey);
  if (!date) return dateKey;

  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  return formatTrendDateKey(date);
}

export function getTrendTimeKey(dateKey, timeframe) {
  if (!parseTrendDateKey(dateKey)) return null;

  if (timeframe === 'day') return dateKey;
  if (timeframe === 'week') return getWeekStartDateStr(dateKey);
  if (timeframe === 'month') return dateKey.slice(0, 7);
  if (timeframe === 'year') return dateKey.slice(0, 4);
  return null;
}

export function summarizeActualPeriods(values) {
  const totalActualTrips = values.reduce((sum, value) => sum + value, 0);
  const periodsWithData = values.filter((value) => value > 0).length;

  return {
    totalActualTrips,
    averageActualPerPeriod: periodsWithData ? totalActualTrips / periodsWithData : 0,
    peakActualPerPeriod: values.length ? Math.max(...values) : 0,
    periodsWithData
  };
}

export function getTrendBucketCoverage(bucketKey, timeframe, rangeStartKey, rangeEndKey) {
  const rangeStart = parseTrendDateKey(rangeStartKey);
  const rangeEnd = parseTrendDateKey(rangeEndKey);
  if (!rangeStart || !rangeEnd || rangeStartKey > rangeEndKey) return 0;

  let bucketStart;
  let bucketEnd;

  if (timeframe === 'day') {
    bucketStart = parseTrendDateKey(bucketKey);
    bucketEnd = bucketStart;
  } else if (timeframe === 'week') {
    bucketStart = parseTrendDateKey(bucketKey);
    if (bucketStart) {
      bucketEnd = new Date(bucketStart);
      bucketEnd.setDate(bucketEnd.getDate() + 6);
    }
  } else if (timeframe === 'month') {
    bucketStart = parseTrendDateKey(`${bucketKey}-01`);
    if (bucketStart) bucketEnd = new Date(bucketStart.getFullYear(), bucketStart.getMonth() + 1, 0);
  } else if (timeframe === 'year') {
    bucketStart = parseTrendDateKey(`${bucketKey}-01-01`);
    if (bucketStart) bucketEnd = parseTrendDateKey(`${bucketKey}-12-31`);
  }

  if (!bucketStart || !bucketEnd) return 0;

  const toUtcDay = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const bucketStartDay = toUtcDay(bucketStart);
  const bucketEndDay = toUtcDay(bucketEnd);
  const overlapStartDay = Math.max(bucketStartDay, toUtcDay(rangeStart));
  const overlapEndDay = Math.min(bucketEndDay, toUtcDay(rangeEnd));
  if (overlapStartDay > overlapEndDay) return 0;

  const bucketDayCount = (bucketEndDay - bucketStartDay) / 86400000 + 1;
  const overlapDayCount = (overlapEndDay - overlapStartDay) / 86400000 + 1;
  return overlapDayCount / bucketDayCount;
}

export function aggregateTrendByDistinctRoute(activeRoutes, routeTxIndex, { startKey, endKey, timeframe }) {
  const distinctRoutes = {};
  const carrierStats = {};

  for (const row of activeRoutes) {
    const parsed = row?._parsed;
    if (!parsed?.distinctKey || !parsed.rowMatchKey) continue;

    if (!distinctRoutes[parsed.distinctKey]) {
      distinctRoutes[parsed.distinctKey] = {
        hasAvailable: false,
        totalTrips: 0,
        totalTripsDay: 0,
        availableTrips: 0,
        availableTripsDay: 0,
        periods: {}
      };
    }

    const distinctRoute = distinctRoutes[parsed.distinctKey];
    distinctRoute.totalTrips += parsed.trips;
    distinctRoute.totalTripsDay += parsed.tripsDay;
    distinctRoute.availableTrips += parsed.availTrips;
    distinctRoute.availableTripsDay += parsed.availTripsDay;
    if (parsed.availPct > 0) distinctRoute.hasAvailable = true;

    if (!carrierStats[parsed.rowMatchKey]) {
      carrierStats[parsed.rowMatchKey] = {
        distinctKey: parsed.distinctKey,
        sumAvailPct: 0,
        count: 0,
        sumWeightedAvailPct: 0,
        sumWeight: 0
      };
    }
    const carrierStat = carrierStats[parsed.rowMatchKey];
    const weight = Number(parsed.trips) || 0;
    carrierStat.sumAvailPct += parsed.availPct;
    carrierStat.count += 1;
    carrierStat.sumWeightedAvailPct += parsed.availPct * weight;
    carrierStat.sumWeight += weight;
  }

  for (const [rowMatchKey, carrierStat] of Object.entries(carrierStats)) {
    const txList = routeTxIndex[rowMatchKey] || [];
    const distinctRoute = distinctRoutes[carrierStat.distinctKey];
    const availRatio =
      carrierStat.sumWeight > 0
        ? carrierStat.sumWeightedAvailPct / carrierStat.sumWeight / 100
        : carrierStat.count
          ? carrierStat.sumAvailPct / carrierStat.count / 100
          : 0;

    for (const tx of txList) {
      if (tx.d < startKey || tx.d > endKey) continue;

      const timeKey = getTrendTimeKey(tx.d, timeframe);
      if (!timeKey) continue;

      if (!distinctRoute.periods[timeKey]) {
        distinctRoute.periods[timeKey] = { totalActual: 0, estimatedAvailable: 0 };
      }
      distinctRoute.periods[timeKey].totalActual += tx.v;
      distinctRoute.periods[timeKey].estimatedAvailable += tx.v * availRatio;
    }
  }

  return distinctRoutes;
}

export function calculateDistinctRoutePlanTotals(distinctRoutes, timeframe) {
  const totalWeeklyTrips = distinctRoutes.reduce((sum, route) => sum + route.totalTrips, 0);
  const totalDailyTrips = distinctRoutes.reduce((sum, route) => sum + route.totalTripsDay, 0);
  const totalAvailableWeeklyTrips = distinctRoutes.reduce((sum, route) => sum + route.availableTrips, 0);
  const totalAvailableDailyTrips = distinctRoutes.reduce((sum, route) => sum + route.availableTripsDay, 0);

  const baselineValue =
    timeframe === 'day'
      ? totalDailyTrips
      : timeframe === 'week'
        ? totalWeeklyTrips
        : timeframe === 'month'
          ? totalWeeklyTrips * 4.33
          : totalWeeklyTrips * 52.14;
  const baselineAvailableValue =
    timeframe === 'day'
      ? totalAvailableDailyTrips
      : timeframe === 'week'
        ? totalAvailableWeeklyTrips
        : timeframe === 'month'
          ? totalAvailableWeeklyTrips * 4.33
          : totalAvailableWeeklyTrips * 52.14;

  return {
    baselineValue: Number(baselineValue.toFixed(1)),
    baselineAvailableValue: Number(baselineAvailableValue.toFixed(1))
  };
}

export function generateTrendTimeKeysInRange(startKey, endKey, timeframe) {
  const start = parseTrendDateKey(startKey);
  const end = parseTrendDateKey(endKey);
  if (!start || !end || startKey > endKey) return [];

  if (timeframe === 'day') {
    const keys = [];
    const current = new Date(start);
    while (current <= end) {
      keys.push(formatTrendDateKey(current));
      current.setDate(current.getDate() + 1);
    }
    return keys;
  }

  if (timeframe === 'week') {
    const current = parseTrendDateKey(getWeekStartDateStr(startKey));
    const endWeek = parseTrendDateKey(getWeekStartDateStr(endKey));
    const keys = [];
    while (current <= endWeek) {
      keys.push(formatTrendDateKey(current));
      current.setDate(current.getDate() + 7);
    }
    return keys;
  }

  if (timeframe === 'month') {
    const keys = [];
    let year = start.getFullYear();
    let month = start.getMonth();
    const endYear = end.getFullYear();
    const endMonth = end.getMonth();

    while (year < endYear || (year === endYear && month <= endMonth)) {
      keys.push(`${year}-${String(month + 1).padStart(2, '0')}`);
      month += 1;
      if (month === 12) {
        year += 1;
        month = 0;
      }
    }
    return keys;
  }

  if (timeframe === 'year') {
    return Array.from({ length: end.getFullYear() - start.getFullYear() + 1 }, (_, index) =>
      String(start.getFullYear() + index)
    );
  }

  return [];
}
