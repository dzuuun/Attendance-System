/**
 * TapTrack University Entrance Kiosk Terminal Logic
 */

// DOM Elements
const input = document.querySelector("#kioskInput");
const form = document.querySelector("#kioskForm");
const resultCard = document.querySelector("#kioskResult");
const resultIcon = document.querySelector("#resultIcon");
const resultKicker = document.querySelector("#resultKicker");
const resultTitle = document.querySelector("#resultTitle");
const resultDetail = document.querySelector("#resultDetail");
const resultPersonPhotoWrap = document.querySelector("#resultPersonPhotoWrap");
const resultPersonPhoto = document.querySelector("#resultPersonPhoto");
const attendeeDetailsContainer = document.querySelector("#attendeeDetails");
const previousLogNotice = document.querySelector("#previousLogNotice");
const resetProgressTrack = document.querySelector("#resetProgressTrack");
const resetProgressBar = document.querySelector("#resetProgressBar");
const scannerVisual = document.querySelector("#scannerVisual");
const scannerPromptTitle = document.querySelector("#scannerPromptTitle");
const readyMessage = document.querySelector("#readyMessage");
const submitScanBtn = document.querySelector("#submitScanBtn");
const statTotal = document.querySelector("#statTotal");
const statIn = document.querySelector("#statIn");
const statOut = document.querySelector("#statOut");
const recentScansList = document.querySelector("#recentScansList");
const feedEmptyState = document.querySelector("#feedEmptyState");
const feedCountBadge = document.querySelector("#feedCountBadge");
const soundToggleBtn = document.querySelector("#soundToggleBtn");
const soundIcon = document.querySelector("#soundIcon");
const fullscreenBtn = document.querySelector("#fullscreenBtn");
const scannerConfigToggle = document.querySelector("#scannerConfigToggle");
const scannerModalBackdrop = document.querySelector("#scannerModalBackdrop");
const closeScannerModal = document.querySelector("#closeScannerModal");
const doneScannerModal = document.querySelector("#doneScannerModal");
const terminalLocationInput = document.querySelector("#terminalLocationInput");
const terminalLocationBadge = document.querySelector("#terminalLocationBadge");

// State
let bridgeConnected = false;
let lastBridgeStatus = {
  available: false,
  connected: false,
  platform: "web",
};
let resetTimer = null;
let sessionStats = { total: 0, in: 0, out: 0 };
let recentScans = [];
let recentScansRequest = 0;
let soundEnabled = localStorage.getItem("taptrack_kiosk_sound") !== "false";
const fallbackPhotoUrl = "/client/images/NDMU-Logo.png";
const scannerAssignmentKey = "taptrack_kiosk_scanner_assignments";
const terminalLocationKey = "taptrack_kiosk_terminal_location";
let terminalLocation =
  localStorage.getItem(terminalLocationKey)?.trim() || "Main Entrance";
let pendingScannerAction = null;
let localScannerAssignments = loadScannerAssignments();

function loadScannerAssignments() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(scannerAssignmentKey) || "{}",
    );
    return Object.fromEntries(
      ["Time In", "Time Out"].map((action) => [
        action,
        (Array.isArray(saved[action]) ? saved[action] : [])
          .filter((device) => device?.deviceId)
          .slice(0, 2),
      ]),
    );
  } catch (_error) {
    return { "Time In": [], "Time Out": [] };
  }
}

function saveScannerAssignments() {
  localStorage.setItem(
    scannerAssignmentKey,
    JSON.stringify(localScannerAssignments),
  );
}

function updateTerminalLocation(value) {
  terminalLocation = String(value || "").trim() || "Main Entrance";
  localStorage.setItem(terminalLocationKey, terminalLocation);
  if (terminalLocationInput) terminalLocationInput.value = terminalLocation;
  if (terminalLocationBadge)
    terminalLocationBadge.textContent = terminalLocation.toUpperCase();
}

updateTerminalLocation(terminalLocation);

async function loadRecentScans() {
  const requestNumber = ++recentScansRequest;
  const requestedLocation = terminalLocation;
  recentScans = [];
  sessionStats = { total: 0, in: 0, out: 0 };
  if (statTotal) statTotal.textContent = "0";
  if (statIn) statIn.textContent = "0";
  if (statOut) statOut.textContent = "0";
  renderRecentScans();
  try {
    const response = await fetch(
      `/api/kiosk/scans?location=${encodeURIComponent(requestedLocation)}`,
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Unable to load scans.");
    if (
      requestNumber !== recentScansRequest ||
      requestedLocation !== terminalLocation
    )
      return;
    recentScans = Array.isArray(data.records) ? data.records : [];
    sessionStats = {
      total: Number(data.stats?.total || 0),
      in: Number(data.stats?.in || 0),
      out: Number(data.stats?.out || 0),
    };
    if (statTotal) statTotal.textContent = String(sessionStats.total);
    if (statIn) statIn.textContent = String(sessionStats.in);
    if (statOut) statOut.textContent = String(sessionStats.out);
    renderRecentScans();
  } catch (_error) {
    // Scanning remains available if the historical feed cannot be loaded.
  }
}

// --- Web Audio API Sound Synthesizer ---
class SoundController {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  playTone(freq, duration, type = "sine", delay = 0, gainLevel = 0.15) {
    if (!soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + delay);

      gain.gain.setValueAtTime(gainLevel, this.ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        this.ctx.currentTime + delay + duration,
      );

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(this.ctx.currentTime + delay);
      osc.stop(this.ctx.currentTime + delay + duration);
    } catch (_e) {
      // Audio autoplay policy catch
    }
  }

  timeIn() {
    // Upward pleasant harmonic chime (C5 -> E5 -> G5)
    this.playTone(523.25, 0.12, "sine", 0, 0.18);
    this.playTone(659.25, 0.14, "sine", 0.08, 0.2);
    this.playTone(783.99, 0.28, "sine", 0.16, 0.22);
  }

  timeOut() {
    // Warm harmonic descending chime (A5 -> E5)
    this.playTone(880.0, 0.14, "sine", 0, 0.18);
    this.playTone(659.25, 0.28, "sine", 0.1, 0.2);
  }

  error() {
    // Alert low tone
    this.playTone(240, 0.15, "triangle", 0, 0.22);
    this.playTone(180, 0.25, "sawtooth", 0.12, 0.18);
  }

  beep() {
    // Quick scanner feedback beep
    this.playTone(1200, 0.05, "sine", 0, 0.1);
  }
}

const SoundFX = new SoundController();

// Update Sound Toggle UI
function updateSoundUI() {
  if (soundToggleBtn && soundIcon) {
    soundIcon.textContent = soundEnabled ? "volume_up" : "volume_off";
    soundToggleBtn.title = soundEnabled
      ? "Sound ON (Press M to mute)"
      : "Sound MUTED (Press M to unmute)";
    soundToggleBtn.style.opacity = soundEnabled ? "1" : "0.65";
  }
}

if (soundToggleBtn) {
  soundToggleBtn.addEventListener("click", () => {
    SoundFX.init();
    soundEnabled = !soundEnabled;
    localStorage.setItem(
      "taptrack_kiosk_sound",
      soundEnabled ? "true" : "false",
    );
    updateSoundUI();
    if (soundEnabled) SoundFX.beep();
  });
}
updateSoundUI();

// --- Formatting Helpers ---
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

const formatShortTime = (value) =>
  new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

// --- Live Clock & Date Display ---
function updateClock() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = String(hours % 12 || 12).padStart(2, "0");

  const clockEl = document.querySelector("#clock");
  const periodEl = document.querySelector("#clockPeriod");
  const dateEl = document.querySelector("#date");
  const yearEl = document.querySelector("#currentYear");

  if (clockEl) clockEl.textContent = `${displayHours}:${minutes}:${seconds}`;
  if (periodEl) periodEl.textContent = period;
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  if (yearEl) yearEl.textContent = now.getFullYear();
}

updateClock();
setInterval(updateClock, 1000);

// --- Result Card Display & Reset ---
function renderIdleState() {
  if (!resultCard) return;
  resultCard.className = "result-hero-card idle";
  if (resultKicker) resultKicker.textContent = "SYSTEM READY";
  if (resultTitle) resultTitle.textContent = "Ready to Scan";
  if (resultDetail) {
    resultDetail.textContent = bridgeConnected
      ? "The entrance terminal is ready."
      : "Enter an ID number or use the camera scanner.";
  }
  resultCard?.classList.remove("has-person-photo");
  if (resultPersonPhotoWrap) resultPersonPhotoWrap.hidden = true;
  if (resultPersonPhoto) resultPersonPhoto.src = fallbackPhotoUrl;
  if (resultIcon) {
    resultIcon.classList.add("material-symbols-rounded");
    resultIcon.textContent = "center_focus_strong";
  }
  if (attendeeDetailsContainer) attendeeDetailsContainer.innerHTML = "";
  if (previousLogNotice) previousLogNotice.style.display = "none";
  if (resetProgressTrack) resetProgressTrack.style.display = "none";

  if (scannerVisual) {
    scannerVisual.className = "scanner-hero";
  }
  if (scannerPromptTitle)
    scannerPromptTitle.textContent = "Tap RFID Card or Scan Barcode";
  if (readyMessage)
    readyMessage.textContent = "Hold card steady in front of reader";
}

function showResult(type, title, detail, previous = "", data = null) {
  clearTimeout(resetTimer);

  const isSuccess =
    type === "success" ||
    type === "success-in" ||
    type === "success-out" ||
    type === "out";
  const isTimeOut =
    type === "out" ||
    type === "success-out" ||
    (data && data.action === "Time Out");
  const isError = type === "error";

  // Card classes
  if (resultCard) {
    resultCard.className = `result-hero-card ${isError ? "error" : isTimeOut ? "success-out" : "success-in"}`;
  }

  // Scanner hero visual effect
  if (scannerVisual) {
    scannerVisual.className = `scanner-hero ${isError ? "error" : isTimeOut ? "success-out" : "success-in"}`;
  }

  // Icons and kickers
  if (resultIcon) {
    resultIcon.classList.add("material-symbols-rounded");
    resultIcon.textContent = isError
      ? "error"
      : isTimeOut
        ? "logout"
        : "check_circle";
  }

  if (resultKicker) {
    resultKicker.textContent = isError
      ? "ATTENTION REQUIRED"
      : isTimeOut
        ? "TIME OUT RECORDED"
        : "TIME IN RECORDED";
  }

  if (resultTitle) resultTitle.textContent = title;
  if (resultDetail) resultDetail.textContent = detail;

  if (resultPersonPhotoWrap && resultPersonPhoto) {
    if (data) {
      resultPersonPhoto.onerror = () => {
        resultPersonPhoto.onerror = null;
        resultPersonPhoto.src = fallbackPhotoUrl;
      };
      resultPersonPhoto.src = data.photoUrl || fallbackPhotoUrl;
      resultPersonPhoto.alt = `${data.name || "Attendee"} photo`;
      resultPersonPhotoWrap.hidden = false;
      resultCard?.classList.add("has-person-photo");
    } else {
      resultPersonPhotoWrap.hidden = true;
      resultCard?.classList.remove("has-person-photo");
    }
  }

  // Attendee Info Grid
  if (attendeeDetailsContainer) {
    if (data) {
      const isStudent = data.type === "Student";
      attendeeDetailsContainer.innerHTML = isStudent
        ? `
          <div class="identity-grid">
            <div>
              <span>ATTENDEE TYPE</span>
              <b>Student</b>
            </div>
            <div>
              <span>PROGRAM / STRAND</span>
              <b title="${escapeHtml(data.program || "N/A")}">${escapeHtml(data.program || "Not specified")}</b>
            </div>
            <div>
              <span>YEAR LEVEL</span>
              <b>${escapeHtml(data.yearLevel || "Not specified")}</b>
            </div>
          </div>`
        : `
          <div class="identity-grid employee-details">
            <div>
              <span>ATTENDEE TYPE</span>
              <b>Employee</b>
            </div>
            <div>
              <span>DEPARTMENT / OFFICE</span>
              <b title="${escapeHtml(data.department || "N/A")}">${escapeHtml(data.department || "Not specified")}</b>
            </div>
          </div>`;
    } else {
      attendeeDetailsContainer.innerHTML = "";
    }
  }

  // Previous Log Notice
  if (previousLogNotice) {
    if (previous) {
      previousLogNotice.style.display = "flex";
      previousLogNotice.innerHTML = `<span class="material-symbols-rounded" aria-hidden="true">history</span><span>${escapeHtml(previous)}</span>`;
    } else {
      previousLogNotice.style.display = "none";
    }
  }

  // Start Auto-Reset Progress Bar & Timer
  if (resetProgressTrack && resetProgressBar) {
    resetProgressTrack.style.display = "block";
    resetProgressBar.style.animation = "none";
    // Trigger reflow to restart css animation
    void resetProgressBar.offsetWidth;
    const duration = isError ? 5000 : 30000;
    resetProgressBar.style.animation = `countdown-bar ${duration / 1000}s linear forwards`;
  }

  // Reset back to idle after delay
  resetTimer = setTimeout(
    () => {
      renderIdleState();
    },
    isError ? 5000 : 30000,
  );
}

// --- Recent Scans List & Stats ---
function addRecentScan(data) {
  if (!data) return;
  recentScansRequest += 1;

  // Update Stats
  sessionStats.total += 1;
  if (data.action === "Time Out") {
    sessionStats.out += 1;
  } else {
    sessionStats.in += 1;
  }

  if (statTotal) statTotal.textContent = String(sessionStats.total);
  if (statIn) statIn.textContent = String(sessionStats.in);
  if (statOut) statOut.textContent = String(sessionStats.out);

  // Add to recent array (keep up to 10)
  recentScans.unshift({
    name: data.name,
    idNumber: data.idNumber,
    type: data.type,
    action: data.action,
    timestamp: data.timestamp || new Date().toISOString(),
    detail: data.program || data.department || "",
    photoUrl: data.photoUrl || fallbackPhotoUrl,
  });

  if (recentScans.length > 10) {
    recentScans.pop();
  }

  renderRecentScans();
}

function renderRecentScans() {
  if (!recentScansList) return;

  if (recentScans.length === 0) {
    if (feedEmptyState) feedEmptyState.style.display = "flex";
    if (feedCountBadge) feedCountBadge.textContent = "0 Scans";
    return;
  }

  if (feedEmptyState) feedEmptyState.style.display = "none";
  if (feedCountBadge)
    feedCountBadge.textContent = `${recentScans.length} Recent`;

  const itemsHtml = recentScans
    .map((item) => {
      const isOut = item.action === "Time Out";
      const initials = (item.name || "U")
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();

      return `
        <div class="feed-item">
          <div class="feed-item-person">
            <div class="feed-avatar">${escapeHtml(initials)}<img src="${escapeHtml(item.photoUrl || fallbackPhotoUrl)}" alt="${escapeHtml(item.name || "Attendee")} photo" onerror="this.onerror=null;this.src='${fallbackPhotoUrl}'"></div>
            <div class="feed-item-info">
              <strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong>
              <small>${escapeHtml(item.idNumber)} · ${escapeHtml(item.type || "Attendee")}</small>
            </div>
          </div>
          <div class="feed-item-meta">
            <span class="feed-badge ${isOut ? "out" : "in"}">${escapeHtml(item.action)}</span>
            <span class="feed-time">${formatShortTime(item.timestamp)}</span>
          </div>
        </div>`;
    })
    .join("");

  recentScansList.innerHTML = itemsHtml;
}

let scanQueue = Promise.resolve();
let pendingScans = 0;
const recentBridgeScans = new Map();
const pendingManualScans = new Set();

function rememberBridgeScan(raw) {
  const idNumber = String(raw || "")
    .trim()
    .toUpperCase();
  if (!idNumber) return;
  const now = Date.now();
  recentBridgeScans.set(idNumber, now);
  for (const [value, timestamp] of recentBridgeScans)
    if (now - timestamp > 2000) recentBridgeScans.delete(value);
}

function wasJustHandledByBridge(raw) {
  const idNumber = String(raw || "")
    .trim()
    .toUpperCase();
  return Date.now() - (recentBridgeScans.get(idNumber) || 0) < 1000;
}

function submitManualScan(raw) {
  const idNumber = String(raw || "")
    .trim()
    .toUpperCase();
  if (!idNumber) return;
  // Raw-input scanner devices also type into the focused field. Give the SSE
  // bridge event a moment to arrive, then suppress that keyboard echo.
  if (bridgeConnected) {
    if (pendingManualScans.has(idNumber)) return;
    pendingManualScans.add(idNumber);
    setTimeout(() => {
      if (!wasJustHandledByBridge(idNumber)) scan(idNumber);
      if (input) input.value = "";
      pendingManualScans.delete(idNumber);
    }, 250);
    return;
  }
  scan(idNumber);
}

// --- Main Scan Request Handler ---
function scan(raw, actionOverride) {
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
  if (submitScanBtn) submitScanBtn.disabled = true;
  const request = scanQueue.then(() => performScan(idNumber, actionOverride));
  scanQueue = request.catch(() => {});
  return request.finally(() => {
    pendingScans -= 1;
    if (submitScanBtn) submitScanBtn.disabled = pendingScans > 0;
  });
}

async function performScan(idNumber, actionOverride) {
  const action = actionOverride || "Auto";

  // Visual processing state
  if (scannerVisual) scannerVisual.className = "scanner-hero processing";
  if (scannerPromptTitle)
    scannerPromptTitle.textContent = "Validating Attendance...";
  if (readyMessage)
    readyMessage.textContent =
      action === "Auto"
        ? `Checking the next entrance action for ID: ${idNumber}`
        : `Recording ${action} for ID: ${idNumber}`;
  SoundFX.beep();

  try {
    const response = await fetch("/api/kiosk/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idNumber, action, location: terminalLocation }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || "Unable to record attendance.");
    }

    const isTimeOut = data.action === "Time Out";
    const previous = data.previousAction
      ? `Previous: ${data.previousAction} at ${formatShortTime(data.previousTimestamp)}`
      : "Previous: No earlier entrance log today";

    // Play appropriate sound chime
    if (isTimeOut) {
      SoundFX.timeOut();
    } else {
      SoundFX.timeIn();
    }

    showResult(
      isTimeOut ? "success-out" : "success-in",
      data.name,
      `Recorded successfully at ${formatTime(data.timestamp)}.`,
      previous,
      data,
    );

    // Add to live recent scans ticker
    addRecentScan(data);

    return {
      success: true,
      title: `${data.name} · ${data.action}`,
      detail: `Recorded successfully at ${formatTime(data.timestamp)}.`,
    };
  } catch (error) {
    SoundFX.error();
    showResult("error", "Scan Not Recorded", error.message);
    return {
      success: false,
      title: "Scan Not Recorded",
      detail: error.message,
    };
  } finally {
    if (input) {
      input.value = "";
      input.focus();
    }
  }
}

// Form Submit Event
if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    SoundFX.init();
    submitManualScan(input.value);
  });
}

// Camera Scanner Button
const kioskCameraScanBtn = document.querySelector("#kioskCameraScan");
if (kioskCameraScanBtn) {
  kioskCameraScanBtn.addEventListener("click", () => {
    SoundFX.init();
    if (window.TapTrackCameraScanner) {
      window.TapTrackCameraScanner.open((value) => scan(value));
    }
  });
}

// --- Hardware Scanner Bridge & SSE Status ---
function renderScannerStatus(status) {
  if (!status) return;

  lastBridgeStatus = { ...lastBridgeStatus, ...status };
  const bridgeAvailable = !!lastBridgeStatus.available;
  bridgeConnected = !!lastBridgeStatus.connected;
  if (input) {
    input.placeholder = bridgeConnected
      ? "Physical scanner connected — ready to tap..."
      : "Tap card or enter ID number...";
  }

  const statusBadge = document.querySelector("#terminalStatusBadge");
  const statusText = document.querySelector("#terminalStatusText");
  if (statusBadge && statusText) {
    if (bridgeConnected) {
      statusBadge.classList.remove("disconnected");
      statusText.textContent = "ENTRANCE TERMINAL ONLINE";
    } else if (!bridgeAvailable) {
      statusBadge.classList.remove("disconnected");
      statusText.textContent = "TERMINAL ONLINE · MANUAL INPUT";
    } else {
      statusBadge.classList.add("disconnected");
      statusText.textContent = "SCANNER BRIDGE OFFLINE";
    }
  }

  const assignments = localScannerAssignments;
  const devicesFor = (action) => {
    const devices = assignments[action];
    if (!devices) return [];
    return Array.isArray(devices) ? devices : [devices];
  };
  const deviceNames = (action) =>
    devicesFor(action)
      .map((device, index) => device.name || `Scanner ${index + 1}`)
      .join(" · ");
  const deviceIds = (action) =>
    devicesFor(action)
      .map((device) => device.deviceId)
      .join(" · ");
  const laneLabel = (action) => {
    const count = devicesFor(action).length;
    return count
      ? `${count} scanner${count === 1 ? "" : "s"} assigned`
      : "Not assigned";
  };
  const timeInDev = document.querySelector("#timeInDeviceName");
  const timeInId = document.querySelector("#timeInDeviceId");
  const timeOutDev = document.querySelector("#timeOutDeviceName");
  const timeOutId = document.querySelector("#timeOutDeviceId");
  const laneInDevice = document.querySelector("#laneInDevice");
  const laneOutDevice = document.querySelector("#laneOutDevice");

  if (timeInDev)
    timeInDev.textContent = deviceNames("Time In") || "Not assigned";
  if (timeInId)
    timeInId.textContent = deviceIds("Time In") || "No hardware device mapped";
  if (timeOutDev)
    timeOutDev.textContent = deviceNames("Time Out") || "Not assigned";
  if (timeOutId)
    timeOutId.textContent =
      deviceIds("Time Out") || "No hardware device mapped";
  if (laneInDevice) laneInDevice.textContent = laneLabel("Time In");
  if (laneOutDevice) laneOutDevice.textContent = laneLabel("Time Out");

  const bridgeStatusPill = document.querySelector("#bridgeStatusPill");
  const bridgeStatusDesc = document.querySelector("#bridgeStatusDesc");
  const bridgePlatformInfo = document.querySelector("#bridgePlatformInfo");

  if (bridgeStatusPill) {
    bridgeStatusPill.textContent = bridgeConnected
      ? "BRIDGE CONNECTED"
      : bridgeAvailable
        ? "BRIDGE OFFLINE"
        : "MANUAL MODE";
    bridgeStatusPill.style.background = bridgeConnected ? "#dcfce7" : "#fef3c7";
    bridgeStatusPill.style.color = bridgeConnected ? "#15803d" : "#b45309";
  }

  if (bridgePlatformInfo) {
    const platformNames = {
      darwin: "macOS (development)",
      win32: "Windows",
      linux: "Raspberry Pi / Linux",
      web: "Web browser",
    };
    const platform = lastBridgeStatus.platform || "web";
    bridgePlatformInfo.textContent = `Platform: ${platformNames[platform] || platform}`;
  }

  if (bridgeStatusDesc) {
    bridgeStatusDesc.textContent = pendingScannerAction
      ? `Use the scanner being assigned as ${pendingScannerAction}.`
      : bridgeConnected
        ? "Hardware scanners are active. Assignments are stored only on this terminal."
        : bridgeAvailable
          ? "The hardware scanner helper stopped or could not start. Check its terminal output and restart the server."
          : "Physical scanner identification is available on Windows and Raspberry Pi. On macOS, use manual keyboard-wedge or camera scanning for development.";
  }

  document.querySelectorAll("[data-pair]").forEach((button) => {
    button.disabled = !bridgeConnected;
    button.title = bridgeConnected
      ? "Assign this physical scanner"
      : bridgeAvailable
        ? "Start the scanner helper before assigning devices"
        : "Physical device assignment requires Windows or Raspberry Pi";
  });
}

// Scanner Pairing Buttons
document.querySelectorAll("[data-pair]").forEach((button) => {
  button.addEventListener("click", () => {
    SoundFX.init();
    if (!bridgeConnected) {
      showResult(
        "error",
        lastBridgeStatus.available
          ? "Scanner Bridge Offline"
          : "Hardware Pairing Unavailable",
        lastBridgeStatus.available
          ? "Restart the server and check the scanner helper output."
          : "Configure physical scanners on the Windows or Raspberry Pi kiosk.",
      );
      return;
    }
    pendingScannerAction = button.dataset.pair;
    renderScannerStatus(lastBridgeStatus);
    showResult(
      "",
      `Pair ${pendingScannerAction} Scanner`,
      "Use that physical scanner now to save it on this terminal.",
    );
  });
});

// EventSource for Scanner Bridge
try {
  const scannerEvents = new EventSource("/api/kiosk/scanners/events");

  scannerEvents.addEventListener("status", (event) => {
    try {
      renderScannerStatus(JSON.parse(event.data));
    } catch (_e) {}
  });

  scannerEvents.addEventListener("scan", (event) => {
    try {
      const data = JSON.parse(event.data);
      // Keyboard-wedge scanners emit through the bridge and also type into the
      // focused input. Mark every bridge scan immediately so pairing scans (and
      // rejected pairing attempts) cannot be replayed as attendance records by
      // the delayed manual-input fallback.
      rememberBridgeScan(data.idNumber);
      if (pendingScannerAction) {
        const action = pendingScannerAction;
        const target = localScannerAssignments[action] || [];
        const alreadyAssigned = target.some(
          (device) => device.deviceId === data.deviceId,
        );
        if (!alreadyAssigned && target.length >= 2) {
          pendingScannerAction = null;
          SoundFX.error();
          showResult(
            "error",
            "Assignment Limit Reached",
            `${action} already has two assigned scanners.`,
          );
          renderScannerStatus({ connected: bridgeConnected });
          return;
        }
        for (const assignedAction of ["Time In", "Time Out"]) {
          localScannerAssignments[assignedAction] = (
            localScannerAssignments[assignedAction] || []
          ).filter((device) => device.deviceId !== data.deviceId);
        }
        localScannerAssignments[action] ||= [];
        localScannerAssignments[action].push({
          deviceId: data.deviceId,
          name: data.name || "USB scanner",
        });
        pendingScannerAction = null;
        saveScannerAssignments();
        SoundFX.timeIn();
        showResult(
          "success",
          `${action} Scanner Assigned`,
          "The hardware device was saved on this kiosk terminal.",
        );
        renderScannerStatus({ connected: bridgeConnected });
        return;
      }
      const assignment = Object.entries(localScannerAssignments).find(
        ([, devices]) =>
          devices.some((device) => device.deviceId === data.deviceId),
      );
      if (!assignment) {
        SoundFX.error();
        showResult(
          "error",
          "Scanner Not Assigned",
          `${data.name || "This scanner"} must be assigned on this terminal before use.`,
        );
        return;
      }
      scan(data.idNumber, assignment[0]);
    } catch (_e) {}
  });

  scannerEvents.addEventListener("assigned", (event) => {
    try {
      const data = JSON.parse(event.data);
      SoundFX.timeIn();
      showResult(
        "success",
        `${data.action} Scanner Assigned`,
        "The hardware device was saved for this kiosk.",
      );
      renderScannerStatus({ connected: bridgeConnected });
    } catch (_e) {}
  });

  scannerEvents.addEventListener("unassigned", (event) => {
    try {
      const data = JSON.parse(event.data);
      SoundFX.error();
      showResult(
        "error",
        "Scanner Not Assigned",
        data.message ||
          `${data.name || "New scanner"} must be assigned before use.`,
      );
    } catch (_e) {}
  });
} catch (_e) {
  // EventSource unavailable
}

// --- Hardware Keyboard Wedge Buffer ---
let keyBuffer = "";
let keyTimer = null;

document.addEventListener("keydown", (event) => {
  SoundFX.init();

  // If focus is inside input, let standard typing work
  if (document.activeElement === input) {
    return;
  }

  // Hotkeys
  if (
    (event.key === "m" || event.key === "M") &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    soundEnabled = !soundEnabled;
    localStorage.setItem(
      "taptrack_kiosk_sound",
      soundEnabled ? "true" : "false",
    );
    updateSoundUI();
    if (soundEnabled) SoundFX.beep();
    return;
  }
  if (
    (event.key === "f" || event.key === "F") &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    toggleFullscreen();
    return;
  }
  if (
    (event.key === "s" || event.key === "S") &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    toggleScannerModal();
    return;
  }

  // Enter triggers buffer submission
  if (event.key === "Enter" && keyBuffer) {
    submitManualScan(keyBuffer);
    keyBuffer = "";
    return;
  }

  // Fast typing accumulation (typical barcode / RFID reader)
  if (event.key.length === 1) {
    keyBuffer += event.key;
    clearTimeout(keyTimer);
    keyTimer = setTimeout(() => {
      keyBuffer = "";
    }, 120);
  }
});

// Keep autofocus on input when clicking around background
document.addEventListener("click", (event) => {
  if (
    event.target.closest("button") ||
    event.target.closest("a") ||
    event.target.closest(".scanner-modal")
  ) {
    return;
  }
  input?.focus();
});

// --- Fullscreen Toggle Helper ---
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
    document.body.classList.add("is-fullscreen");
  } else {
    document.exitFullscreen?.().catch(() => {});
    document.body.classList.remove("is-fullscreen");
  }
}

if (fullscreenBtn) {
  fullscreenBtn.addEventListener("click", () => {
    SoundFX.init();
    toggleFullscreen();
  });
}

document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement) {
    document.body.classList.add("is-fullscreen");
  } else {
    document.body.classList.remove("is-fullscreen");
  }
});

// --- Scanner Settings Modal Drawer ---
function toggleScannerModal(open) {
  if (!scannerModalBackdrop) return;
  const shouldOpen =
    open !== undefined
      ? open
      : !scannerModalBackdrop.classList.contains("open");
  if (shouldOpen) {
    scannerModalBackdrop.classList.add("open");
    fetch("/api/kiosk/scanners")
      .then((res) => res.json())
      .then(renderScannerStatus)
      .catch(() => {});
  } else {
    scannerModalBackdrop.classList.remove("open");
    input?.focus();
  }
}

if (scannerConfigToggle) {
  scannerConfigToggle.addEventListener("click", () => toggleScannerModal(true));
}
if (closeScannerModal) {
  closeScannerModal.addEventListener("click", () => toggleScannerModal(false));
}
if (terminalLocationInput) {
  terminalLocationInput.addEventListener("change", () => {
    updateTerminalLocation(terminalLocationInput.value);
    loadRecentScans();
  });
}
if (doneScannerModal) {
  doneScannerModal.addEventListener("click", () => {
    updateTerminalLocation(terminalLocationInput?.value);
    loadRecentScans();
    toggleScannerModal(false);
  });
}
if (scannerModalBackdrop) {
  scannerModalBackdrop.addEventListener("click", (e) => {
    if (e.target === scannerModalBackdrop) toggleScannerModal(false);
  });
}

// Initial setup
renderIdleState();
loadRecentScans();
input?.focus();
