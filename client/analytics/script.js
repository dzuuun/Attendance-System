const { $, api, escapeHtml, init, toast } = TapTrack;
const libraryMode = location.pathname.startsWith("/library/");
const activeView = libraryMode ? "library" : "entrance";
let activeFacility = "library";
let analyticsData = null;
let entirePeriod = false;

const iso = (date) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};
const number = (value) => Number(value || 0).toLocaleString();
const shortDate = (value) =>
  new Date(`${value}T00:00:00`).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
const hourLabel = (hour) => `${hour % 12 || 12}${hour < 12 ? "a" : "p"}`;
const currentView = () =>
  libraryMode
    ? analyticsData?.library?.[activeFacility]
    : analyticsData?.entrance;

function setRange(days) {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  $("#dateFrom").value = iso(from);
  $("#dateTo").value = iso(to);
}

function filledDaily(view) {
  if (analyticsData.range.entirePeriod) return view.daily;
  const values = new Map(view.daily.map((row) => [row.date, row]));
  const rows = [];
  const cursor = new Date(`${analyticsData.range.from}T00:00:00`);
  const end = new Date(`${analyticsData.range.to}T00:00:00`);
  for (; cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = iso(cursor);
    rows.push(values.get(date) || { date, total: 0 });
  }
  return rows;
}

function buildInsights(view) {
  const busiestDay = view.daily.reduce(
    (best, row) => (!best || row.total > best.total ? row : best),
    null,
  );
  const peakHour = view.hours.reduce(
    (best, row) => (!best || row.total > best.total ? row : best),
    null,
  );
  const leader = view.breakdown[0];
  const repeatScans = Math.max(
    0,
    view.summary.total - view.summary.uniquePeople,
  );
  const repeatRate = view.summary.total
    ? Math.round((repeatScans / view.summary.total) * 100)
    : 0;
  const insights = [
    {
      icon: "calendar_month",
      title: busiestDay
        ? `${shortDate(busiestDay.date)} was busiest`
        : "No busiest day yet",
      detail: busiestDay
        ? `${number(busiestDay.total)} scans were recorded that day.`
        : "Activity will appear after the first scan.",
    },
    {
      icon: "schedule",
      title: peakHour
        ? `${hourLabel(peakHour.hour)} is the peak hour`
        : "No peak hour yet",
      detail: peakHour
        ? `${number(peakHour.total)} scans occurred during this hour.`
        : "There is not enough activity for an hourly pattern.",
    },
    {
      icon: libraryMode ? "groups" : "location_on",
      title: leader ? `${leader.label} leads activity` : "No leading group yet",
      detail: leader
        ? `${number(leader.total)} scans, ${view.summary.total ? Math.round((leader.total / view.summary.total) * 100) : 0}% of this view.`
        : "No breakdown is available for this range.",
    },
    {
      icon: "repeat",
      title: `${repeatRate}% repeat activity`,
      detail: `${number(repeatScans)} scans were additional visits by already-counted people.`,
    },
  ];
  if (!libraryMode) {
    const gap =
      Number(view.summary.timeIn || 0) - Number(view.summary.timeOut || 0);
    insights.push({
      icon: gap ? "warning" : "check_circle",
      warning: Boolean(gap),
      title: gap
        ? `${Math.abs(gap)} unmatched ${gap > 0 ? "entrances" : "exits"}`
        : "Entrance and exit totals are balanced",
      detail: gap
        ? "Review missed scans or people who may still be inside."
        : "No time-in/time-out imbalance appears in this range.",
    });
  }
  return insights;
}

function renderInsights(view) {
  $("#insightsList").innerHTML = buildInsights(view)
    .map(
      (item) =>
        `<div class="insight-item${item.warning ? " warning" : ""}"><span class="material-symbols-rounded">${item.icon}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div></div>`,
    )
    .join("");
}

function render() {
  const view = currentView();
  if (!view) return;
  const summary = view.summary;
  $("#totalLabel").textContent = libraryMode
    ? "LIBRARY AREA SCANS"
    : "ENTRANCE SCANS";
  $("#scanTotal").textContent = number(summary.total);
  $("#uniquePeople").textContent =
    `${number(summary.uniquePeople)} unique people`;
  $("#studentTotal").textContent = number(summary.students);
  $("#studentShare").textContent =
    `${summary.total ? Math.round((summary.students / summary.total) * 100) : 0}% of scans`;
  $("#employeeTotal").textContent = number(summary.employees);
  $("#employeeShare").textContent =
    `${summary.total ? Math.round((summary.employees / summary.total) * 100) : 0}% of scans`;
  $("#actionLabel").textContent = libraryMode
    ? "CURRENT SECTION"
    : "TIME IN / OUT";
  $("#actionPrimary").textContent = libraryMode
    ? activeFacility === "library"
      ? "Library"
      : "Internet"
    : `${number(summary.timeIn)} / ${number(summary.timeOut)}`;
  $("#actionSecondary").textContent = libraryMode
    ? "Library and Internet Section"
    : "entrances / exits";
  $("#trendKicker").textContent = libraryMode
    ? activeFacility === "library"
      ? "LIBRARY"
      : "INTERNET SECTION"
    : "UNIVERSITY ENTRANCE";
  $("#rangeLabel").textContent = analyticsData.range.entirePeriod
    ? analyticsData.range.label
    : `${shortDate(analyticsData.range.from)} - ${shortDate(analyticsData.range.to)}`;
  $("#breakdownKicker").textContent = libraryMode
    ? "LIBRARY SERVICES"
    : "UNIVERSITY ENTRANCE";
  $("#breakdownTitle").textContent = libraryMode
    ? "Program and department activity"
    : "Gate and location usage";

  const daily = filledDaily(view);
  const maximum = Math.max(1, ...daily.map((row) => row.total));
  $("#dailyChart").innerHTML = summary.total
    ? daily
        .map(
          (row) =>
            `<div class="daily-column" tabindex="0" data-tooltip="${shortDate(row.date)}: ${number(row.total)} scans"><i style="height:${Math.max(2, (row.total / maximum) * 100)}%"></i><span>${shortDate(row.date)}</span></div>`,
        )
        .join("")
    : '<div class="empty-chart">No scans in this date range.</div>';

  const barMax = Math.max(1, ...view.breakdown.map((row) => row.total));
  $("#breakdownChart").innerHTML = view.breakdown.length
    ? view.breakdown
        .map(
          (row) =>
            `<div tabindex="0" data-tooltip="${escapeHtml(row.label)}: ${number(row.total)} scans"><div class="bar-row-head"><span>${escapeHtml(row.label)}</span><strong>${number(row.total)}</strong></div><div class="bar-track"><i style="width:${Math.max(2, (row.total / barMax) * 100)}%"></i></div></div>`,
        )
        .join("")
    : '<div class="empty-chart">No activity in this date range.</div>';

  const byHour = new Map(view.hours.map((row) => [row.hour, row.total]));
  const peak = Math.max(1, ...view.hours.map((row) => row.total));
  $("#hourChart").innerHTML = Array.from({ length: 24 }, (_, hour) => {
    const total = byHour.get(hour) || 0;
    return `<div class="hour-bar" tabindex="0" data-tooltip="${hourLabel(hour)}: ${number(total)} scans"><i style="height:${Math.max(2, (total / peak) * 145)}px"></i><span>${hour % 2 === 0 ? hourLabel(hour) : ""}</span></div>`;
  }).join("");
  renderInsights(view);
  document.querySelectorAll("[data-facility]").forEach((button) => {
    const selected = button.dataset.facility === activeFacility;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", selected);
  });
}

async function load() {
  const error = $("#analyticsError");
  error.hidden = true;
  try {
    analyticsData = await api(
      `/api/analytics/summary?view=${activeView}${entirePeriod ? "&scope=current-period" : `&from=${encodeURIComponent($("#dateFrom").value)}&to=${encodeURIComponent($("#dateTo").value)}`}`,
    );
    render();
  } catch (failure) {
    error.textContent = failure.message;
    error.hidden = false;
  }
}

function graphicalReport() {
  const view = currentView();
  if (!view) return "";
  const daily = filledDaily(view);
  const dailyMax = Math.max(1, ...daily.map((row) => row.total));
  const hourMap = new Map(view.hours.map((row) => [row.hour, row.total]));
  const hourMax = Math.max(1, ...view.hours.map((row) => row.total));
  const breakdownMax = Math.max(1, ...view.breakdown.map((row) => row.total));
  const insights = buildInsights(view);
  const title = libraryMode
    ? activeFacility === "library"
      ? "Library Analytics"
      : "Internet Section Analytics"
    : "University Entrance Analytics";
  const metrics = [
    ["Total scans", view.summary.total],
    ["Unique people", view.summary.uniquePeople],
    ["Student scans", view.summary.students],
    ["Employee scans", view.summary.employees],
  ];
  if (!libraryMode)
    metrics.push(
      ["Time in", view.summary.timeIn],
      ["Time out", view.summary.timeOut],
    );
  return `<!doctype html><html><head><title>${title}</title><style>
  *{box-sizing:border-box}body{margin:0;padding:34px;color:#173c30;font-family:Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}header{display:flex;justify-content:space-between;border-bottom:3px solid #087a50;padding-bottom:16px}h1{margin:0;font-family:Georgia,serif}header p{margin:6px 0 0;color:#65736c}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:20px 0}.metric,.card{border:1px solid #dbe7e0;border-radius:12px;padding:15px}.metric small{display:block;color:#71837b;text-transform:uppercase;font-size:9px}.metric b{display:block;margin-top:5px;font-size:24px}.cards{display:grid;grid-template-columns:1.4fr 1fr;gap:12px}.card{break-inside:avoid}.card.wide{grid-column:1/-1}.chart{height:190px;display:flex;align-items:end;gap:3px;border-bottom:1px solid #cadbd2;padding-top:12px}.column{flex:1;min-width:2px;background:#0b8b5c;border-radius:3px 3px 0 0}.bars{display:grid;gap:12px}.barhead{display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px}.track{height:9px;background:#edf4f0;border-radius:8px;overflow:hidden}.fill{height:100%;background:#18a871}.hours{height:140px;display:flex;align-items:end;gap:4px}.hour{flex:1;background:#e0b936;border-radius:3px 3px 0 0}.report-insights{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.report-insight{padding:10px;border-radius:8px;background:#f1f7f4}.report-insight b,.report-insight small{display:block}.report-insight b{font-size:11px}.report-insight small{margin-top:3px;color:#65736c;font-size:9px;line-height:1.35}h2{font:700 16px Georgia,serif;margin:0 0 12px}@media print{@page{size:landscape;margin:12mm}body{padding:0}}
  </style></head><body><header><div><h1>${title}</h1><p>TapTrack Attendance System</p></div><p>${analyticsData.range.entirePeriod ? escapeHtml(analyticsData.range.label) : `${analyticsData.range.from} to ${analyticsData.range.to}`}</p></header><section class="metrics">${metrics.map(([label, value]) => `<div class="metric"><small>${label}</small><b>${number(value)}</b></div>`).join("")}</section><section class="cards"><article class="card"><h2>Daily scan trend</h2><div class="chart">${daily.map((row) => `<i class="column" title="${row.date}: ${row.total}" style="height:${Math.max(1, (row.total / dailyMax) * 100)}%"></i>`).join("")}</div></article><article class="card"><h2>${libraryMode ? "Program and department activity" : "Gate and location usage"}</h2><div class="bars">${view.breakdown.map((row) => `<div><div class="barhead"><span>${escapeHtml(row.label)}</span><b>${number(row.total)}</b></div><div class="track"><i class="fill" style="display:block;width:${(row.total / breakdownMax) * 100}%"></i></div></div>`).join("")}</div></article><article class="card"><h2>Peak scan hours</h2><div class="hours">${Array.from(
    { length: 24 },
    (_, hour) => {
      const total = hourMap.get(hour) || 0;
      return `<i class="hour" title="${hourLabel(hour)}: ${total}" style="height:${Math.max(1, (total / hourMax) * 100)}%"></i>`;
    },
  ).join(
    "",
  )}</div></article><article class="card"><h2>Operational insights</h2><div class="report-insights">${insights.map((item) => `<div class="report-insight"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.detail)}</small></div>`).join("")}</div></article></section></body></html>`;
}

function exportReport() {
  const report = graphicalReport();
  if (!report) return;
  const popup = window.open("", "_blank");
  if (!popup)
    return toast("Allow pop-ups to export the graphical report.", "error");
  popup.opener = null;
  popup.document.open();
  popup.document.write(report);
  popup.document.close();
  setTimeout(() => {
    popup.focus();
    popup.print();
  }, 250);
}

$("#rangeForm").addEventListener("submit", (event) => {
  event.preventDefault();
  entirePeriod = false;
  $("#dateFrom").disabled = false;
  $("#dateTo").disabled = false;
  document
    .querySelectorAll("[data-days]")
    .forEach((button) => button.classList.remove("active"));
  load();
});
$("#exportAnalytics").addEventListener("click", exportReport);
document.querySelectorAll("[data-facility]").forEach((button) =>
  button.addEventListener("click", () => {
    activeFacility = button.dataset.facility;
    render();
  }),
);
document.querySelectorAll("[data-days]").forEach((button) =>
  button.addEventListener("click", () => {
    entirePeriod = false;
    $("#dateFrom").disabled = false;
    $("#dateTo").disabled = false;
    document
      .querySelectorAll("[data-days]")
      .forEach((item) => item.classList.toggle("active", item === button));
    setRange(Number(button.dataset.days));
    load();
  }),
);
document.querySelector("[data-period]").addEventListener("click", (event) => {
  entirePeriod = true;
  $("#dateFrom").disabled = true;
  $("#dateTo").disabled = true;
  document
    .querySelectorAll(".preset-row button")
    .forEach((button) =>
      button.classList.toggle("active", button === event.currentTarget),
    );
  load();
});

(async () => {
  $("#pageKicker").textContent = libraryMode
    ? "LIBRARY INSIGHTS"
    : "ATTENDANCE INSIGHTS";
  $("#pageTitle").textContent = libraryMode
    ? "Library analytics"
    : "Entrance analytics";
  document.title = `${$("#pageTitle").textContent} - TapTrack`;
  await init(libraryMode ? "libraryAnalytics" : "analytics");
  $("#facilityTabs").hidden = !libraryMode;
  setRange(30);
  await load();
})();
