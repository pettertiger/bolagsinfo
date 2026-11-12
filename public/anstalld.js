import { getSwedishHolidays } from "/helgdagar.mjs";

const tabButtons = [...document.querySelectorAll("[role='tab'][data-tab]")];
const tabPanels = [...document.querySelectorAll("[role='tabpanel'][data-panel]")];
const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC"
});
const weekdayFormatter = new Intl.DateTimeFormat("sv-SE", {
  weekday: "long",
  timeZone: "UTC"
});

function getStockholmDate() {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addOneYear(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const result = new Date(Date.UTC(year + 1, month - 1, day));
  if (result.getUTCMonth() !== month - 1) result.setUTCDate(0);
  return result.toISOString().slice(0, 10);
}

function asUtcDate(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`);
}

function formatDate(isoDate) {
  return dateFormatter.format(asUtcDate(isoDate));
}

function formatWeekday(isoDate) {
  const weekday = weekdayFormatter.format(asUtcDate(isoDate));
  return `${weekday[0].toLocaleUpperCase("sv-SE")}${weekday.slice(1)}`;
}

function renderHolidayItem(holiday) {
  const item = document.createElement("li");
  item.className = "holiday-item";

  const date = document.createElement("span");
  date.className = "holiday-date";
  date.textContent = `${formatWeekday(holiday.date)} ${formatDate(holiday.date)}`;

  const name = document.createElement("span");
  name.className = "holiday-name";
  name.textContent = holiday.name;

  item.append(date, name);
  return item;
}

function renderEmptyState(list, message) {
  const item = document.createElement("li");
  item.className = "empty-state";
  item.textContent = message;
  list.replaceChildren(item);
}

function renderHolidays() {
  const startDate = getStockholmDate();
  const endDate = addOneYear(startDate);
  const holidays = getSwedishHolidays(startDate, endDate);
  const holidayList = document.querySelector("#holiday-list");
  const overviewList = document.querySelector("#overview-holidays");
  const period = document.querySelector("#holiday-period");
  const nextHoliday = document.querySelector("#next-holiday");

  period.textContent = `Visar ${formatDate(startDate)}–${formatDate(endDate)}`;
  holidayList.replaceChildren(...holidays.map(renderHolidayItem));

  if (!holidays.length) {
    renderEmptyState(holidayList, "Inga namngivna helgdagar i perioden.");
    renderEmptyState(overviewList, "Inga kommande helgdagar i perioden.");
    nextHoliday.textContent = "Inga kommande helgdagar i perioden.";
    return;
  }

  const next = holidays[0];
  nextHoliday.replaceChildren();
  const nextName = document.createElement("span");
  nextName.className = "next-holiday-name";
  nextName.textContent = next.name;
  const nextDate = document.createElement("span");
  nextDate.className = "next-holiday-date";
  nextDate.textContent = `${formatWeekday(next.date)} ${formatDate(next.date)}`;
  nextHoliday.append(nextName, nextDate);

  overviewList.replaceChildren(...holidays.slice(0, 4).map(renderHolidayItem));
}

function selectTab(tabId, focus = false) {
  for (const button of tabButtons) {
    const selected = button.dataset.tab === tabId;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected && focus) button.focus();
  }

  for (const panel of tabPanels) {
    panel.hidden = panel.dataset.panel !== tabId;
  }
}

for (const [index, button] of tabButtons.entries()) {
  button.addEventListener("click", () => selectTab(button.dataset.tab));
  button.addEventListener("keydown", event => {
    let targetIndex;
    if (event.key === "ArrowRight") targetIndex = (index + 1) % tabButtons.length;
    if (event.key === "ArrowLeft") targetIndex = (index - 1 + tabButtons.length) % tabButtons.length;
    if (event.key === "Home") targetIndex = 0;
    if (event.key === "End") targetIndex = tabButtons.length - 1;
    if (targetIndex === undefined) return;
    event.preventDefault();
    selectTab(tabButtons[targetIndex].dataset.tab, true);
  });
}

for (const button of document.querySelectorAll("[data-open-tab]")) {
  button.addEventListener("click", () => selectTab(button.dataset.openTab, true));
}

renderHolidays();
