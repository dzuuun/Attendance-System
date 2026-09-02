(() => {
  const base = "http://127.0.0.1:47831";
  async function request(path, body) {
    let response;
    try {
      response = await fetch(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (_error) {
      throw new Error("The NFC bridge is not running on this client PC.");
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "Local NFC operation failed.");
    return result;
  }
  window.TapTrackNfc = {
    status: () => request("/status"),
    read: () => request("/read", {}),
    write: (value) => request("/write", { value }),
  };
})();
