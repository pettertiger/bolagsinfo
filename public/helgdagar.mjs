function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return toIsoDate(result);
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toIsoDate(new Date(Date.UTC(year, month - 1, day)));
}

function saturdayBetween(year, startMonth, startDay) {
  const date = new Date(Date.UTC(year, startMonth, startDay));
  while (date.getUTCDay() !== 6) date.setUTCDate(date.getUTCDate() + 1);
  return toIsoDate(date);
}

function holidaysForYear(year) {
  const easter = easterSunday(year);
  return [
    { date: `${year}-01-01`, name: "Nyårsdagen" },
    { date: `${year}-01-06`, name: "Trettondedag jul" },
    { date: addDays(easter, -2), name: "Långfredagen" },
    { date: easter, name: "Påskdagen" },
    { date: addDays(easter, 1), name: "Annandag påsk" },
    { date: `${year}-05-01`, name: "Första maj" },
    { date: addDays(easter, 39), name: "Kristi himmelsfärdsdag" },
    { date: addDays(easter, 49), name: "Pingstdagen" },
    { date: `${year}-06-06`, name: "Sveriges nationaldag" },
    { date: saturdayBetween(year, 5, 20), name: "Midsommardagen" },
    { date: saturdayBetween(year, 9, 31), name: "Alla helgons dag" },
    { date: `${year}-12-25`, name: "Juldagen" },
    { date: `${year}-12-26`, name: "Annandag jul" }
  ];
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && toIsoDate(date) === value;
}

export function getSwedishHolidays(startDate, endDate) {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) {
    throw new RangeError("Ange ett giltigt datumintervall.");
  }

  const firstYear = Number(startDate.slice(0, 4));
  const lastYear = Number(endDate.slice(0, 4));
  const holidays = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    holidays.push(...holidaysForYear(year));
  }

  return holidays
    .filter(holiday => holiday.date >= startDate && holiday.date <= endDate)
    .sort((left, right) => left.date.localeCompare(right.date));
}
