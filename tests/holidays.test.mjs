import assert from "node:assert/strict";
import test from "node:test";
import { getSwedishHolidays } from "../public/helgdagar.mjs";

test("calculates Swedish movable holidays for 2026 and 2027", () => {
  const holidays = getSwedishHolidays("2026-01-01", "2027-12-31");
  const byNameAndYear = (name, year) => holidays.find(holiday =>
    holiday.name === name && holiday.date.startsWith(String(year))
  )?.date;

  assert.equal(byNameAndYear("Långfredagen", 2026), "2026-04-03");
  assert.equal(byNameAndYear("Påskdagen", 2026), "2026-04-05");
  assert.equal(byNameAndYear("Annandag påsk", 2026), "2026-04-06");
  assert.equal(byNameAndYear("Kristi himmelsfärdsdag", 2026), "2026-05-14");
  assert.equal(byNameAndYear("Pingstdagen", 2026), "2026-05-24");
  assert.equal(byNameAndYear("Midsommardagen", 2026), "2026-06-20");
  assert.equal(byNameAndYear("Alla helgons dag", 2026), "2026-10-31");
  assert.equal(byNameAndYear("Långfredagen", 2027), "2027-03-26");
  assert.equal(byNameAndYear("Midsommardagen", 2027), "2027-06-26");
  assert.equal(byNameAndYear("Alla helgons dag", 2027), "2027-11-06");
});

test("includes the boundaries of a date range and excludes dates outside it", () => {
  assert.deepEqual(
    getSwedishHolidays("2026-12-25", "2027-01-06"),
    [
      { date: "2026-12-25", name: "Juldagen" },
      { date: "2026-12-26", name: "Annandag jul" },
      { date: "2027-01-01", name: "Nyårsdagen" },
      { date: "2027-01-06", name: "Trettondedag jul" }
    ]
  );
});

test("rejects invalid date ranges", () => {
  assert.throws(() => getSwedishHolidays("2026-02-30", "2026-03-01"), RangeError);
  assert.throws(() => getSwedishHolidays("2026-03-02", "2026-03-01"), RangeError);
});
