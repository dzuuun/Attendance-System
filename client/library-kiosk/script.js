const $ = (selector) => document.querySelector(selector);
const input = $("#kioskInput");
const form = $("#kioskForm");
const resultCard = $("#kioskResult");
const fallbackPhotoUrl = window.taptrackUrl("/client/images/NDMU-Logo.png");
const locationKey = location.pathname.includes("internet-section")
  ? "internet"
  : "library";
const locationName = locationKey === "library" ? "Library" : "Internet Section";
let resetTimer = null;
let scanQueue = Promise.resolve();
let pendingScans = 0;
let sessionTotal = 0;
let studentTotal = 0;
let employeeTotal = 0;
let recentScans = [];
let soundEnabled =
  localStorage.getItem("taptrack_library_kiosk_sound") !== "false";
let audioContext = null;
const kioskIdKey = "taptrack_library_kiosk_id";
let kioskId = localStorage.getItem(kioskIdKey);
if (!kioskId) {
  kioskId = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(
    /[^A-Za-z0-9_-]/g,
    "",
  );
  localStorage.setItem(kioskIdKey, kioskId);
}
let kioskEnabled = true;
let lastKioskActivity = Date.now();
const kioskSessionStartedAt =
  Number(sessionStorage.getItem("taptrack_library_kiosk_session_started_at")) ||
  Date.now();
sessionStorage.setItem(
  "taptrack_library_kiosk_session_started_at",
  String(kioskSessionStartedAt),
);

document.title = `${locationName} Entrance Terminal — TapTrack`;
$("#brandContext").textContent =
  `TapTrack Attendance System · ${locationName} Entrance`;
$("#terminalStatusText").textContent =
  `${locationName.toUpperCase()} TERMINAL CONNECTING`;
$("#locationBadge").textContent = `${locationName.toUpperCase()} ACCESS`;
$("#locationLane").textContent = `${locationName.toUpperCase()} ENTRANCE`;
$("#recentTitle").textContent = `Recent ${locationName} Scans`;

const escapeHtml = (value) => {
  const node = document.createElement("div");
  node.textContent = value || "";
  return node.innerHTML;
};
const formatTime = (value) =>
  new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

function tone(success) {
  if (!soundEnabled || !(window.AudioContext || window.webkitAudioContext))
    return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    void audioContext.resume();
    (success ? [620, 840] : [240, 170]).forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const start = audioContext.currentTime + index * 0.11;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.16, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.19);
    });
  } catch (_error) {}
}

function updateClock() {
  const now = new Date();
  const hours = now.getHours();
  $("#clock").textContent =
    `${String(hours % 12 || 12).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  $("#clockPeriod").textContent = hours >= 12 ? "PM" : "AM";
  $("#date").textContent = now.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  $("#currentYear").textContent = now.getFullYear();
}

async function checkInKiosk() {
  try {
    const response = await fetch("/api/kiosk/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kioskId,
        type: locationKey,
        location: locationName,
        browserStatus: navigator.onLine ? "Online" : "Offline",
        currentPage: location.pathname,
        uptimeSeconds: Math.floor((Date.now() - kioskSessionStartedAt) / 1000),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(data.message || "Unable to check in kiosk.");
    kioskEnabled = data.enabled !== false;
    if (!kioskEnabled) {
      $("#terminalStatusText").textContent = "TERMINAL DISABLED";
      input.disabled = true;
      $("#submitScanBtn").disabled = true;
    } else {
      $("#terminalStatusText").textContent =
        `${locationName.toUpperCase()} TERMINAL ONLINE`;
      input.disabled = false;
      $("#submitScanBtn").disabled = pendingScans > 0;
    }
  } catch (_error) {
    $("#terminalStatusText").textContent = navigator.onLine
      ? `${locationName.toUpperCase()} TERMINAL RECONNECTING`
      : "NETWORK OFFLINE";
    input.disabled = true;
    $("#submitScanBtn").disabled = true;
  }
}

function promptKioskHealthCheck() {
  lastKioskActivity = Date.now();
  void checkInKiosk();
}

async function completeKioskCommand(commandId, status, resultText) {
  await fetch("/api/kiosk/commands/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kioskId, commandId, status, resultText }),
  });
}
async function pollKioskCommands() {
  try {
    const response = await fetch("/api/kiosk/commands/poll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kioskId, channel: "browser" }),
    });
    const { commands = [] } = await response.json();
    for (const command of commands) {
      if (command.command === "reload") {
        await completeKioskCommand(
          command.id,
          "Completed",
          "Attendance page reloaded.",
        );
        location.reload();
        return;
      }
      if (command.command === "navigate") {
        await completeKioskCommand(
          command.id,
          "Completed",
          `Navigating to ${command.payload?.path || "/kiosk/entrance"}.`,
        );
        location.assign(command.payload?.path || "/kiosk/entrance");
        return;
      }
      if (command.command === "screenshot") {
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false,
          });
          const video = document.createElement("video");
          video.srcObject = stream;
          await video.play();
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext("2d").drawImage(video, 0, 0);
          stream.getTracks().forEach((track) => track.stop());
          const imageData = canvas.toDataURL("image/jpeg", 0.7);
          const saved = await fetch("/api/kiosk/screenshots", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kioskId, commandId: command.id, imageData }),
          });
          if (!saved.ok)
            throw new Error(
              (await saved.json().catch(() => ({}))).message ||
                "Screenshot upload failed.",
            );
        } catch (error) {
          await completeKioskCommand(
            command.id,
            "Failed",
            error.message || "Screenshot request was declined.",
          );
        }
        continue;
      }
      await completeKioskCommand(
        command.id,
        "Unsupported",
        "Unsupported browser command.",
      );
    }
  } catch (_error) {}
}

function idle() {
  resultCard.className = "result-hero-card idle";
  resultCard.classList.remove("has-person-photo");
  $("#resultPersonPhotoWrap").hidden = true;
  $("#resultKicker").textContent = "SYSTEM READY";
  $("#resultTitle").textContent = "Ready to Scan";
  $("#resultDetail").textContent = "The terminal is ready to record Time In.";
  $("#attendeeDetails").innerHTML = "";
  $("#resetProgressTrack").hidden = true;
}

function personDetails(data) {
  return data.type === "Student"
    ? `<div class="identity-grid"><div><span>ATTENDEE TYPE</span><b>${data.isAlumnus ? "Student · Alumnus" : "Student"}</b></div><div class="program-detail"><span>PROGRAM / STRAND</span><b title="${escapeHtml(data.program || "N/A")}">${escapeHtml(data.program || "Not specified")}</b></div><div><span>YEAR / SECTION</span><b>${escapeHtml([data.yearLevel, data.sectionName].filter(Boolean).join(" · ") || "Not specified")}</b></div></div>`
    : data.type === "Alumnus"
      ? `<div class="identity-grid"><div><span>ATTENDEE TYPE</span><b>Alumnus</b></div><div class="program-detail"><span>PROGRAM / STRAND</span><b title="${escapeHtml(data.program || "N/A")}">${escapeHtml(data.program || "Not specified")}</b></div><div><span>GRADUATION YEAR</span><b>${escapeHtml(data.graduationYear || "Not specified")}</b></div></div>`
      : `<div class="identity-grid employee-details"><div><span>ATTENDEE TYPE</span><b>Employee</b></div><div><span>DEPARTMENT / OFFICE</span><b>${escapeHtml(data.department || "Not specified")}</b></div></div>`;
}

function showResult(success, title, detail, data = null) {
  clearTimeout(resetTimer);
  resultCard.className = `result-hero-card ${success ? "success-in" : "error"}`;
  $("#resultKicker").textContent = success
    ? "TIME IN RECORDED"
    : "ATTENTION REQUIRED";
  $("#resultTitle").textContent = title;
  $("#resultDetail").textContent = detail;
  $("#attendeeDetails").innerHTML = data ? personDetails(data) : "";
  if (data) {
    const photo = $("#resultPersonPhoto");
    photo.onerror = () => {
      photo.onerror = null;
      photo.src = fallbackPhotoUrl;
    };
    photo.src = data.photoUrl || fallbackPhotoUrl;
    photo.alt = `${data.name} photo`;
    $("#resultPersonPhotoWrap").hidden = false;
    resultCard.classList.add("has-person-photo");
  } else {
    $("#resultPersonPhotoWrap").hidden = true;
    resultCard.classList.remove("has-person-photo");
  }
  const duration = success ? 30000 : 5000;
  const track = $("#resetProgressTrack");
  const bar = $("#resetProgressBar");
  track.hidden = false;
  bar.style.animation = "none";
  void bar.offsetWidth;
  bar.style.animation = `countdown-bar ${duration / 1000}s linear forwards`;
  resetTimer = setTimeout(idle, duration);
}

function renderRecentScans() {
  $("#statTotal").textContent = sessionTotal;
  $("#statStudents").textContent = studentTotal;
  $("#statEmployees").textContent = employeeTotal;
  $("#feedCountBadge").textContent = `${recentScans.length} RECENT`;
  $("#recentScansList").innerHTML = recentScans.length
    ? recentScans
        .map((item) => {
          const initials = item.name
            .split(/\s+/)
            .map((part) => part[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();
          return `<div class="feed-item"><div class="feed-item-person"><div class="feed-avatar">${escapeHtml(initials)}<img src="${escapeHtml(item.photoUrl || fallbackPhotoUrl)}" alt="${escapeHtml(item.name)} photo" onerror="this.onerror=null;this.src='${fallbackPhotoUrl}'"></div><div class="feed-item-info"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.idNumber)} · ${escapeHtml(item.type)}</small></div></div><div class="feed-item-meta"><span class="feed-badge in">TIME IN</span><span class="feed-time">${formatTime(item.timestamp)}</span></div></div>`;
        })
        .join("")
    : `<div class="feed-empty-state"><span class="material-symbols-rounded" aria-hidden="true">schedule</span><span>No scans recorded yet today</span><small>New Time In records will appear here.</small></div>`;
}

function addRecent(data) {
  sessionTotal += 1;
  if (data.type !== "Employee") studentTotal += 1;
  else employeeTotal += 1;
  recentScans.unshift(data);
  recentScans = recentScans.slice(0, 10);
  renderRecentScans();
}

async function loadRecentScans() {
  try {
    const response = await fetch(`/api/library-kiosk/${locationKey}/scans`);
    if (!response.ok) throw new Error("Unable to load recent scans.");
    const data = await response.json();
    recentScans = Array.isArray(data.scans) ? data.scans : [];
    sessionTotal = Number(data.stats?.total || 0);
    studentTotal = Number(data.stats?.students || 0);
    employeeTotal = Number(data.stats?.employees || 0);
    renderRecentScans();
  } catch (_error) {
    recentScans = [];
    sessionTotal = 0;
    studentTotal = 0;
    employeeTotal = 0;
    renderRecentScans();
  }
}

function scan(raw) {
  lastKioskActivity = Date.now();
  if (!kioskEnabled)
    return Promise.resolve({
      success: false,
      title: "Terminal disabled",
      detail: "This kiosk has been disabled by central management.",
    });
  const idNumber = String(raw || "")
    .trim()
    .toUpperCase();
  if (!idNumber)
    return Promise.resolve({
      success: false,
      title: "Scan not recorded",
      detail: "Enter an ID number.",
    });
  pendingScans += 1;
  $("#submitScanBtn").disabled = true;
  const request = scanQueue.then(async () => {
    try {
      const response = await fetch(`/api/library-kiosk/${locationKey}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idNumber, kioskId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.message || "Unable to record entrance.");
      tone(true);
      showResult(
        true,
        data.name,
        `Time In recorded at ${formatTime(data.timestamp)}.`,
        data,
      );
      addRecent(data);
      return {
        success: true,
        title: `${data.name} · Time In`,
        detail: `Recorded at ${formatTime(data.timestamp)}.`,
      };
    } catch (error) {
      tone(false);
      showResult(false, "Scan Not Recorded", error.message);
      return {
        success: false,
        title: "Scan Not Recorded",
        detail: error.message,
      };
    } finally {
      input.value = "";
      if (!document.querySelector(".kiosk-verification-backdrop")) input.focus();
    }
  });
  scanQueue = request.catch(() => {});
  return request.finally(() => {
    pendingScans -= 1;
    $("#submitScanBtn").disabled = pendingScans > 0;
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  scan(input.value);
});
$("#kioskCameraScan").addEventListener("click", () =>
  window.TapTrackCameraScanner?.open(scan),
);
$("#soundToggleBtn").addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem("taptrack_library_kiosk_sound", String(soundEnabled));
  $("#soundIcon").textContent = soundEnabled ? "volume_up" : "volume_off";
  if (soundEnabled) tone(true);
});
$("#fullscreenBtn").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.();
});
document.addEventListener("fullscreenchange", () =>
  document.body.classList.toggle(
    "is-fullscreen",
    Boolean(document.fullscreenElement),
  ),
);

document.addEventListener("keydown", (event) => {
  if (document.activeElement === input) return;

  const activeElement = document.activeElement;
  const isEditingAnotherControl = activeElement?.matches?.(
    "input, textarea, select, [contenteditable='true']",
  );
  const hasOpenDialog = document.querySelector("dialog[open], .kiosk-verification-backdrop");
  if (
    !input ||
    isEditingAnotherControl ||
    hasOpenDialog ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  ) {
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    input.focus();
    if (input.value.trim()) form.requestSubmit();
    return;
  }

  if (event.key.length === 1) {
    event.preventDefault();
    input.focus();
    input.value += event.key;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
});

idle();
updateClock();
setInterval(updateClock, 1000);
loadRecentScans();
checkInKiosk();
setInterval(checkInKiosk, 30_000);
document.addEventListener("keydown", () => {
  lastKioskActivity = Date.now();
});
document.addEventListener("pointerdown", () => {
  lastKioskActivity = Date.now();
});
window.addEventListener("online", promptKioskHealthCheck);
window.addEventListener("focus", promptKioskHealthCheck);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") promptKioskHealthCheck();
});
setInterval(() => {
  if (Date.now() - lastKioskActivity < 90_000) return;
  checkInKiosk().finally(() => location.reload());
}, 15_000);
setInterval(pollKioskCommands, 5_000);
pollKioskCommands();
input.focus();
