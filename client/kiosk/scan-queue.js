(function (root) {
  function createScanQueue(concurrency = 4) {
    const waiting = [];
    const activeKeys = new Set();
    let active = 0;
    function drain() {
      while (active < concurrency) {
        const index = waiting.findIndex((job) => !activeKeys.has(job.key));
        if (index < 0) return;
        const job = waiting.splice(index, 1)[0];
        active++;
        activeKeys.add(job.key);
        Promise.resolve().then(job.operation).then(job.resolve, job.reject).finally(() => {
          active--;
          activeKeys.delete(job.key);
          drain();
        });
      }
    }
    return {
      add(key, operation) {
        return new Promise((resolve, reject) => {
          waiting.push({ key, operation, resolve, reject });
          drain();
        });
      },
    };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { createScanQueue };
  else root.TapTrackScanQueue = { create: createScanQueue };
})(typeof window !== "undefined" ? window : globalThis);
