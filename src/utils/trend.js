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
