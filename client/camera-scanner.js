(function () {
  if (!document.querySelector("link[data-camera-feedback]")) {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "/client/camera-scanner-feedback.css";
    stylesheet.dataset.cameraFeedback = "true";
    document.head.appendChild(stylesheet);
  }
  let stream = null,
    frame = null,
    detecting = false,
    onDetected = null,
    zxingControls = null,
    recentValues = new Map(),
    inFlightValues = new Set(),
    audioContext = null;

  function ensureDialog() {
    let dialog = document.querySelector("#cameraScannerDialog");
    if (dialog) return dialog;
    document.body.insertAdjacentHTML(
      "beforeend",
      `<dialog id="cameraScannerDialog" class="camera-scanner-dialog">
        <div class="camera-scanner-panel">
          <header><div><small>CAMERA SCANNER</small><h2>Scan barcode</h2></div><button type="button" id="cameraScannerClose" class="close-button" aria-label="Close camera"></button></header>
          <div class="camera-preview"><video id="cameraScannerVideo" playsinline muted></video><span class="camera-target" aria-hidden="true"></span></div>
          <p id="cameraScannerStatus" role="status">Starting camera...</p>
          <div class="camera-scan-confirmation" id="cameraScanConfirmation" hidden role="status" aria-live="assertive"><span aria-hidden="true"></span><div><strong></strong><p></p></div></div>
          <footer><button type="button" id="cameraScannerCancel">Cancel</button></footer>
        </div>
      </dialog>`,
    );
    dialog = document.querySelector("#cameraScannerDialog");
    document.querySelector("#cameraScannerClose").onclick = stop;
    document.querySelector("#cameraScannerCancel").onclick = stop;
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      stop();
    });
    return dialog;
  }

  function setStatus(message, error = false) {
    const status = document.querySelector("#cameraScannerStatus");
    status.textContent = message;
    status.classList.toggle("error", error);
  }

  function stop() {
    detecting = false;
    zxingControls?.stop();
    zxingControls = null;
    recentValues.clear();
    inFlightValues.clear();
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    const video = document.querySelector("#cameraScannerVideo");
    if (video) video.srcObject = null;
    const dialog = document.querySelector("#cameraScannerDialog");
    if (dialog?.open) dialog.close();
  }

  function unlockAudio() {
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createBufferSource();
      source.buffer = audioContext.createBuffer(1, 1, 22050);
      source.connect(audioContext.destination);
      source.start(0);
      void audioContext.resume();
    } catch (_error) {}
  }

  async function playSound(success) {
    try {
      unlockAudio();
      if (audioContext.state !== "running") await audioContext.resume();
      const notes = success ? [740, 980] : [260, 180];
      notes.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator(),
          gain = audioContext.createGain(),
          startsAt = audioContext.currentTime + index * 0.12;
        oscillator.frequency.value = frequency;
        oscillator.type = "sine";
        gain.gain.setValueAtTime(0.0001, startsAt);
        gain.gain.exponentialRampToValueAtTime(0.18, startsAt + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.11);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(startsAt);
        oscillator.stop(startsAt + 0.12);
      });
    } catch (_error) {}
  }

  function vibrate(success) {
    if (!navigator.vibrate) return;
    navigator.vibrate(success ? [80, 55, 80] : [240, 90, 240]);
  }

  function showConfirmation(outcome) {
    const confirmation = document.querySelector("#cameraScanConfirmation"),
      success = outcome?.success !== false;
    confirmation.hidden = false;
    confirmation.className = `camera-scan-confirmation ${success ? "success" : "error"}`;
    confirmation
      .querySelector("span")
      .classList.add("material-symbols-rounded");
    confirmation.querySelector("span").textContent = success
      ? "check_circle"
      : "error";
    confirmation.querySelector("strong").textContent =
      outcome?.title || (success ? "Attendance recorded" : "Scan not recorded");
    confirmation.querySelector("p").textContent = outcome?.detail || "";
    playSound(success);
    vibrate(success);
  }

  async function emitDetection(value) {
    const normalized = String(value || "").trim(),
      now = Date.now(),
      previouslySeenAt = recentValues.get(normalized) || 0;
    if (!normalized) return;
    recentValues.set(normalized, now);
    if (now - previouslySeenAt < 1500 || inFlightValues.has(normalized)) return;
    inFlightValues.add(normalized);
    setStatus(`Processing ${normalized}...`);
    try {
      const outcome = (await onDetected?.(normalized)) || { success: true };
      showConfirmation(outcome);
    } catch (error) {
      showConfirmation({
        success: false,
        title: "Scan not recorded",
        detail: error.message || "The attendance request failed.",
      });
    } finally {
      inFlightValues.delete(normalized);
      setStatus(
        inFlightValues.size
          ? `Processing ${inFlightValues.size} attendance request${inFlightValues.size === 1 ? "" : "s"}...`
          : "Ready for the next barcode.",
      );
    }
  }

  function loadZXing() {
    if (window.ZXingBrowser) return Promise.resolve(window.ZXingBrowser);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-zxing-browser]");
      if (existing) {
        existing.addEventListener("load", () => resolve(window.ZXingBrowser), {
          once: true,
        });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "/vendor/zxing/zxing-browser.min.js";
      script.dataset.zxingBrowser = "true";
      script.onload = () => resolve(window.ZXingBrowser);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function startZXing(video) {
    const ZXing = await loadZXing();
    const reader = new ZXing.BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 150,
      delayBetweenScanSuccess: 300,
    });
    zxingControls = await reader.decodeFromConstraints(
      {
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      },
      video,
      (scanResult) => {
        const value = String(scanResult?.getText?.() || "").trim();
        if (!value || !detecting) return;
        emitDetection(value);
      },
    );
    detecting = true;
    setStatus("Place the barcode inside the frame.");
  }

  async function detect(detector, video) {
    if (!detecting) return;
    try {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const barcodes = await detector.detect(video);
        const value = String(barcodes[0]?.rawValue || "").trim();
        if (value) emitDetection(value);
      }
    } catch (_error) {
      // Individual frames can fail while the camera is focusing.
    }
    frame = requestAnimationFrame(() => detect(detector, video));
  }

  async function open(callback) {
    unlockAudio();
    const dialog = ensureDialog();
    onDetected = callback;
    recentValues.clear();
    inFlightValues.clear();
    document.querySelector("#cameraScanConfirmation").hidden = true;
    dialog.showModal();
    setStatus("Starting camera...");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus(
        "Camera scanning requires HTTPS. Open TapTrack using its secure university server URL.",
        true,
      );
      return;
    }
    try {
      const video = document.querySelector("#cameraScannerVideo");
      if (!("BarcodeDetector" in window)) {
        detecting = true;
        await startZXing(video);
        return;
      }
      const supported = await BarcodeDetector.getSupportedFormats();
      const preferred = [
        "code_128",
        "code_39",
        "code_93",
        "codabar",
        "ean_13",
        "ean_8",
        "upc_a",
        "upc_e",
        "qr_code",
        "data_matrix",
      ].filter((format) => supported.includes(format));
      const detector = new BarcodeDetector(
        preferred.length ? { formats: preferred } : undefined,
      );
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      video.srcObject = stream;
      await video.play();
      detecting = true;
      setStatus("Place the barcode inside the frame.");
      detect(detector, video);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      const denied = error.name === "NotAllowedError";
      setStatus(
        denied
          ? "Camera permission was denied. Allow camera access and try again."
          : "The camera could not be started. Check that it is connected and not used by another app.",
        true,
      );
    }
  }

  window.TapTrackCameraScanner = { open, stop };
})();
