(() => {
  const scriptPath = new URL(document.currentScript.src).pathname;
  const suffix = "/client/base-path.js";
  const basePath = scriptPath.endsWith(suffix)
    ? scriptPath.slice(0, -suffix.length)
    : "";
  const applicationPath =
    /^\/(?:api|client|vendor|uploads)(?:\/|$)|^\/(?:login|setup|overview|analytics|attendance|maintenance|events|history|library|user|account|kiosk)(?:\/|\?|$)|^\/$/;
  const url = (value) => {
    if (
      !basePath ||
      typeof value !== "string" ||
      !value.startsWith("/") ||
      value.startsWith("//") ||
      value === basePath ||
      value.startsWith(`${basePath}/`) ||
      !applicationPath.test(value)
    )
      return value;
    return `${basePath}${value}`;
  };

  window.taptrackBasePath = basePath;
  window.taptrackUrl = url;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (resource, options) =>
    nativeFetch(
      typeof resource === "string" ? url(resource) : resource,
      options,
    );

  if (window.EventSource) {
    const NativeEventSource = window.EventSource;
    function PrefixedEventSource(resource, options) {
      return new NativeEventSource(url(resource), options);
    }
    PrefixedEventSource.prototype = NativeEventSource.prototype;
    Object.defineProperties(PrefixedEventSource, {
      CONNECTING: { value: NativeEventSource.CONNECTING },
      OPEN: { value: NativeEventSource.OPEN },
      CLOSED: { value: NativeEventSource.CLOSED },
    });
    window.EventSource = PrefixedEventSource;
  }

  document.addEventListener(
    "click",
    (event) => {
      const anchor = event.target.closest?.("a[href]");
      if (!anchor || event.defaultPrevented) return;
      const raw = anchor.getAttribute("href");
      const prefixed = url(raw);
      if (prefixed !== raw) anchor.setAttribute("href", prefixed);
    },
    true,
  );
})();
