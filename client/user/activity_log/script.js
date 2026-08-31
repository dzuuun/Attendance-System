const { $, api, escapeHtml, init } = TapTrack;

function displayDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

(async () => {
  await init("activity");
  const table = $("#body").closest("table");
  TapTrack.initDataTable(table, {
    processing: true,
    serverSide: true,
    pageLength: 25,
    ordering: false,
    columnDefs: [],
    ajax: async (request, callback) => {
      try {
        const query = new URLSearchParams({
          draw: request.draw,
          start: request.start,
          length: request.length,
          search: request.search.value,
        });
        callback(await api(`/api/activity-log?${query}`));
      } catch (error) {
        TapTrack.toast(error.message, "error");
        callback({
          draw: request.draw,
          recordsTotal: 0,
          recordsFiltered: 0,
          data: [],
        });
      }
    },
    columns: [
      {
        data: "createdAt",
        render: (value, type) =>
          type === "display" ? escapeHtml(displayDate(value)) : value,
      },
      {
        data: null,
        render: (log) =>
          `<strong>${escapeHtml(log.actorName)}</strong><small class="mt-1 block text-xs text-[#65736c]">${escapeHtml(log.actorUsername)}</small>`,
      },
      {
        data: "action",
        render: (value) =>
          `<span class="status-pill">${escapeHtml(String(value).replaceAll("_", " "))}</span>`,
      },
      { data: "module", render: (value) => escapeHtml(value) },
      { data: "description", render: (value) => escapeHtml(value) },
    ],
  });
})();
