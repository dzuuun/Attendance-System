const input = document.querySelector("#kioskInput"),
  form = document.querySelector("#kioskForm"),
  result = document.querySelector("#kioskResult");
const locationKey = location.pathname.includes("internet-section")
    ? "internet"
    : "library",
  locationName = locationKey === "library" ? "Library" : "Internet Section";
document.title = `${locationName} Kiosk — TapTrack`;
document.querySelector("#terminalName").textContent =
  locationName.toUpperCase();
document.querySelector("#locationKicker").textContent =
  `${locationName.toUpperCase()} ENTRANCE`;
const escapeHtml = (value) => {
  const node = document.createElement("div");
  node.textContent = value || "";
  return node.innerHTML;
};
const time = (value) =>
  new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
function clock() {
  const now = new Date();
  document.querySelector("#clock").textContent = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  document.querySelector("#date").textContent = now.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
function details(data) {
  return data.type === "Student"
    ? `<div class="identity-grid"><div><span>ATTENDEE</span><b>Student</b></div><div><span>PROGRAM</span><b>${escapeHtml(data.program || "Not specified")}</b></div><div><span>YEAR LEVEL</span><b>${escapeHtml(data.yearLevel || "Not specified")}</b></div></div>`
    : `<div class="identity-grid employee-details"><div><span>ATTENDEE</span><b>Employee</b></div><div><span>DEPARTMENT</span><b>${escapeHtml(data.department || "Not specified")}</b></div></div>`;
}
function show(type, title, detail, data = null) {
  result.className = `result ${type}`;
  result.innerHTML = `<span class="result-icon">${type === "error" ? "!" : "✓"}</span><div class="result-content"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small>${data ? details(data) : ""}</div>`;
}
async function scan(raw) {
  const idNumber = String(raw || "")
    .trim()
    .toUpperCase();
  if (!idNumber) return;
  show("", "Processing scan...", "Recording Time In.");
  try {
    const response = await fetch(`/api/library-kiosk/${locationKey}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idNumber }),
      }),
      data = await response.json();
    if (!response.ok)
      throw new Error(data.message || "Unable to record entrance.");
    show(
      "success",
      `${data.name} · Time In`,
      `Recorded at ${time(data.timestamp)}.`,
      data,
    );
    return {
      success: true,
      title: `${data.name} · Time In`,
      detail: `Recorded at ${time(data.timestamp)}.`,
    };
  } catch (error) {
    show("error", "Scan not recorded", error.message);
    return {
      success: false,
      title: "Scan not recorded",
      detail: error.message,
    };
  } finally {
    input.value = "";
    input.focus();
  }
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  scan(input.value);
});
document
  .querySelector("#kioskCameraScan")
  .addEventListener("click", () => TapTrackCameraScanner.open(scan));
let buffer = "",
  timer;
document.addEventListener("keydown", (event) => {
  if (document.activeElement === input) return;
  if (event.key === "Enter" && buffer) {
    scan(buffer);
    buffer = "";
    return;
  }
  if (event.key.length === 1) {
    buffer += event.key;
    clearTimeout(timer);
    timer = setTimeout(() => (buffer = ""), 120);
  }
});
clock();
setInterval(clock, 30000);
input.focus();
