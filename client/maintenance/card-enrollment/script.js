const { $, api, escapeHtml, personCell, init } = TapTrack;
let people = [];
let selectedPerson = null;
let searchTimer;
let saving = false;
let peopleTable = null;
let latestDraw = 0;
const typeLabels = { student: "Student", employee: "Employee", alumni: "Alumni" };
const sortColumns = ["idNumber", "name", "type", "cardId"];

async function initializeTable() {
  const table = $("#body").closest("table");
  peopleTable = await TapTrack.initDataTable(table, {
    serverSide: true,
    processing: true,
    deferRender: true,
    searchDelay: 300,
    layout: { topStart: null, topEnd: null, bottomStart: "info", bottomEnd: "paging" },
    order: [[1, "asc"]],
    ajax: async (request, callback) => {
      latestDraw = request.draw;
      const order = request.order?.[0];
      const params = new URLSearchParams({
        mode: "table", draw: request.draw, start: request.start, length: request.length,
        search: request.search.value, type: $("#personType").value,
        orderBy: sortColumns[order?.column] || "name", direction: order?.dir || "asc",
      });
      try {
        const result = await api(`/api/card-enrollment/people?${params}`);
        // DataTables ignores stale draws; keep enrollment targets in sync too.
        if (request.draw === latestDraw) {
          people = result.data;
          $("#searchStatus").hidden = true;
        }
        callback(result);
      } catch (error) {
        if (request.draw === latestDraw) {
          people = [];
          $("#searchStatus").textContent = error.message;
          $("#searchStatus").hidden = false;
        }
        callback({ draw: request.draw, data: [], recordsTotal: 0, recordsFiltered: 0 });
      }
    },
    columns: [
      { data: "idNumber", render: (value, mode) => mode === "display" ? `<strong>${escapeHtml(value)}</strong>` : value },
      { data: "name", render: (value, mode, person) => mode === "display" ? personCell({ name: value, photoUrl: person.photoUrl ? window.taptrackUrl(person.photoUrl) : null }) : value },
      { data: "type", render: (value) => typeLabels[value] || value },
      { data: "cardId", render: (value, mode) => mode === "display" ? (value ? `<span class="status-pill" title="${escapeHtml(value)}">Enrolled</span>` : "Not enrolled") : (value || "") },
      { data: null, orderable: false, searchable: false, render: (_value, mode, person) => mode === "display" ? `<button type="button" class="event-action-trigger card-enroll-trigger" data-enroll="${person.type}:${person.id}">Enroll card</button>` : "" },
    ],
  });
}

$("#search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => peopleTable?.search($("#search").value.trim()).draw(), 300);
});
$("#search").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  clearTimeout(searchTimer);
  peopleTable?.search($("#search").value.trim()).draw();
});
$("#personType").addEventListener("change", () => peopleTable?.draw());
$("#body").addEventListener("click", (event) => {
  const button = event.target.closest("[data-enroll]");
  if (!button) return;
  selectedPerson = people.find((person) => `${person.type}:${person.id}` === button.dataset.enroll);
  if (!selectedPerson) return;
  $("#cardStudentName").textContent = `${selectedPerson.name} (${selectedPerson.idNumber})`;
  const photo = $("#cardPersonPhoto");
  photo.onerror = () => { photo.hidden = true; };
  photo.hidden = !selectedPerson.photoUrl;
  photo.alt = `${selectedPerson.name} photo`;
  if (selectedPerson.photoUrl) photo.src = window.taptrackUrl(selectedPerson.photoUrl);
  else photo.removeAttribute("src");
  $("#cardPersonType").textContent = `${typeLabels[selectedPerson.type]} card`;
  $("#cardCurrentStatus").textContent = selectedPerson.cardId
    ? `Current card ID: ${selectedPerson.cardId}` : "No card enrolled.";
  $("#enrollmentCardId").value = "";
  $("#cardError").textContent = "";
  $("#cardDialog").showModal();
  $("#enrollmentCardId").focus();
});
$("#cardDialog").addEventListener("click", (event) => {
  if (event.target.closest('.close-button,button[value="cancel"]')) {
    event.preventDefault();
    if (!saving) $("#cardDialog").close();
  }
});
$("#cardDialog").addEventListener("cancel", (event) => {
  if (saving) event.preventDefault();
});
TapTrack.initCardEnrollmentInput($("#enrollmentCardId"), $("#cardDialog"));
$("#enrollmentCardId").addEventListener("input", (event) => {
  $("#cardEnrollmentForm").dataset.confirmMessage =
    `Save card ${event.target.value.trim()} for ${selectedPerson?.name || "this person"}?`;
});
$("#cardEnrollmentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedPerson || saving) return;
  const person = selectedPerson;
  const button = $("#saveCardBtn");
  saving = true;
  button.disabled = true;
  try {
    const result = await api(`/api/card-enrollment/${person.type}/${person.id}/card`, {
      method: "PATCH",
      body: JSON.stringify({ cardId: $("#enrollmentCardId").value }),
    });
    person.cardId = result.cardId;
    $("#cardDialog").close();
    peopleTable?.ajax.reload(null, false);
    TapTrack.toast("Card enrolled.", "success");
  } catch (error) {
    $("#cardError").textContent = error.message;
  } finally {
    saving = false;
    button.disabled = false;
  }
});

(async () => {
  $("#search").disabled = true;
  $("#personType").disabled = true;
  try {
    await init("cardEnrollment");
    await initializeTable();
    $("#search").disabled = false;
    $("#personType").disabled = false;
    $("#search").focus();
  } catch (error) {
    $("#searchStatus").textContent = error.message;
    $("#searchStatus").hidden = false;
  }
})();
