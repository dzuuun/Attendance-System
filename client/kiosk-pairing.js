(() => {
  // A reader's Enter must never navigate the kiosk page, even during startup.
  document.addEventListener("submit", (event) => {
    if (event.target.id === "kioskForm") event.preventDefault();
  }, true);
  const isEntrance = location.pathname.includes("/kiosk/entrance");
  const kioskIdKey = isEntrance
    ? "taptrack_kiosk_id"
    : "taptrack_library_kiosk_id";
  let kioskId = localStorage.getItem(kioskIdKey);
  if (!kioskId) {
    kioskId = (
      crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`
    ).replace(/[^A-Za-z0-9_-]/g, "");
    localStorage.setItem(kioskIdKey, kioskId);
  }
  window.taptrackKioskId = kioskId;

  const nativeFetch = window.fetch.bind(window);
  let pairingPromise = null;

  function showPairing() {
    if (pairingPromise) return pairingPromise;
    pairingPromise = new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "kiosk-verification-backdrop";
      backdrop.innerHTML = `<form class="kiosk-verification-card" autocomplete="off">
        <div class="kiosk-verification-icon"><span class="material-symbols-rounded">admin_panel_settings</span></div>
        <p class="kiosk-verification-kicker">NEW KIOSK VERIFICATION</p>
        <h2>Authorize this kiosk</h2>
        <p class="kiosk-verification-copy">A Superadmin must verify this device once. It will remain authorized on succeeding visits.</p>
        <label>Superadmin username<input name="username" autocomplete="off" autocapitalize="none" spellcheck="false" required autofocus></label>
        <label>Superadmin password<input name="password" type="password" autocomplete="new-password" required></label>
        <p class="kiosk-verification-error" role="alert" aria-live="polite"></p>
        <button type="submit">Verify kiosk</button>
        <small>Device ID: ${kioskId}</small>
      </form>`;
      document.body.appendChild(backdrop);
      const form = backdrop.querySelector("form");
      const error = backdrop.querySelector(".kiosk-verification-error");
      const button = backdrop.querySelector("button");
      form.elements.username.focus();
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        error.textContent = "";
        button.disabled = true;
        button.textContent = "Verifyingâ€¦";
        try {
          const response = await nativeFetch("/api/kiosk/pair", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kioskId,
              username: form.elements.username.value.trim(),
              password: form.elements.password.value,
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok)
            throw new Error(data.message || "Kiosk verification failed.");
          form.elements.password.value = "";
          backdrop.remove();
          pairingPromise = null;
          resolve();
        } catch (requestError) {
          error.textContent = requestError.message;
          form.elements.password.value = "";
          form.elements.password.focus();
          button.disabled = false;
          button.textContent = "Verify kiosk";
        }
      });
    });
    return pairingPromise;
  }

  window.fetch = async (resource, options) => {
    const rawUrl = typeof resource === "string" ? resource : resource?.url || "";
    const url = new URL(rawUrl, location.href);
    const basePath = window.taptrackBasePath || "";
    const apiPath = basePath && url.pathname.startsWith(`${basePath}/`)
      ? url.pathname.slice(basePath.length) : url.pathname;
    const kioskRequest =
      url.origin === location.origin &&
      (apiPath.startsWith("/api/kiosk/") || apiPath.startsWith("/api/library-kiosk/"));
    const isPairing = apiPath.startsWith("/api/kiosk/pair");
    const method = String(options?.method || resource?.method || "GET").toUpperCase();
    if (kioskRequest && !isPairing && ["GET", "HEAD"].includes(method)) {
      // Select this device's cookie even when another kiosk page refreshed the
      // generic cookie in the same browser profile.
      url.searchParams.set("kioskId", kioskId);
      resource = typeof resource === "string"
        ? `${url.pathname}${url.search}${url.hash}`
        : new Request(url.href, resource);
    }
    const response = await nativeFetch(resource, options);
    let identityMismatch = false;
    if (kioskRequest && response.status === 403) {
      const error = await response.clone().json().catch(() => ({}));
      identityMismatch = error.code === "KIOSK_IDENTITY_MISMATCH" ||
        error.message === "This enrollment belongs to another kiosk.";
    }
    if (
      (response.status !== 401 && !identityMismatch) ||
      !kioskRequest ||
      isPairing
    )
      return response;
    await showPairing();
    const isScanRequest =
      apiPath === "/api/kiosk/scan" ||
      /^\/api\/library-kiosk\/[^/]+\/scan$/.test(apiPath);
    if (isScanRequest)
      return new Response(
        JSON.stringify({
          message: "Kiosk verified. Please scan the ID again.",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    return nativeFetch(resource, options);
  };
})();
