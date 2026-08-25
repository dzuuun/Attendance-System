(function () {
  if (!document.querySelector("script[data-brand-ui]")) {
    const brandUi = document.createElement("script");
    brandUi.src = "/client/brand-ui.js?v=20260824-5";
    brandUi.dataset.brandUi = "true";
    document.head.appendChild(brandUi);
  }
  const $ = (selector) => document.querySelector(selector),
    $$ = (selector) => [...document.querySelectorAll(selector)],
    TOKEN_KEY = "taptrack_token";
  const dataTablesReady = (() => {
    if (!document.querySelector("link[data-datatables]")) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "/vendor/datatables/css/dataTables.dataTables.min.css";
      css.dataset.datatables = "true";
      document.head.appendChild(css);
    }
    if (window.DataTable) return Promise.resolve(window.DataTable);
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "/vendor/datatables/js/dataTables.min.js";
      script.dataset.datatables = "true";
      script.onload = () => resolve(window.DataTable || null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  })();
  function toast(message, type = "success") {
    let container = document.querySelector("#toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.className = "toast-container";
      container.setAttribute("aria-live", "polite");
      container.setAttribute("aria-atomic", "false");
      document.body.appendChild(container);
    }
    const item = document.createElement("div");
    item.className = `satp-toast ${type}`;
    item.setAttribute("role", type === "error" ? "alert" : "status");
    item.innerHTML = `<span class="toast-mark" aria-hidden="true">${type === "error" ? "!" : "✓"}</span><div><strong>${type === "error" ? "Action failed" : "Success"}</strong><p></p></div><button type="button" aria-label="Dismiss notification">×</button>`;
    item.querySelector("p").textContent = message;
    const dismiss = () => {
      item.classList.add("leaving");
      setTimeout(() => item.remove(), 180);
    };
    item.querySelector("button").addEventListener("click", dismiss);
    container.appendChild(item);
    requestAnimationFrame(() => item.classList.add("visible"));
    setTimeout(dismiss, 4000);
  }
  function toastAfterReload(message, type = "success") {
    sessionStorage.setItem(
      "taptrack_pending_toast",
      JSON.stringify({ message, type }),
    );
  }
  try {
    const pendingToast = JSON.parse(
      sessionStorage.getItem("taptrack_pending_toast") || "null",
    );
    sessionStorage.removeItem("taptrack_pending_toast");
    if (pendingToast?.message)
      setTimeout(() => toast(pendingToast.message, pendingToast.type), 0);
  } catch (_error) {
    sessionStorage.removeItem("taptrack_pending_toast");
  }
  let pendingConfirmedSave = null;
  function destroyDataTable(table) {
    if (!table) return;
    table.dataset.dtGeneration = String(
      Number(table.dataset.dtGeneration || 0) + 1,
    );
    if (window.DataTable?.isDataTable(table))
      new window.DataTable(table).destroy();
  }
  function initDataTable(table, options = {}) {
    if (!table || table.querySelector("tbody .empty-row")) return;
    const generation = table.dataset.dtGeneration || "0";
    dataTablesReady.then((DataTable) => {
      if (
        !DataTable ||
        !table.isConnected ||
        generation !== (table.dataset.dtGeneration || "0") ||
        DataTable.isDataTable(table)
      )
        return;
      new DataTable(table, {
        pageLength: 10,
        lengthMenu: [10, 25, 50, 100],
        order: [],
        autoWidth: false,
        language: {
          search: "",
          searchPlaceholder: "Search records…",
          lengthMenu: "Show _MENU_ entries",
          info: "Showing _START_ to _END_ of _TOTAL_ entries",
          emptyTable: "No records available",
        },
        layout: {
          topStart: "pageLength",
          topEnd: "search",
          bottomStart: "info",
          bottomEnd: "paging",
        },
        columnDefs: [{ targets: -1, orderable: false, searchable: false }],
        ...options,
      });
    });
  }
  async function api(url, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY),
      response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
          ...options.headers,
        },
      });
    if (response.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      location.href = "/login";
      throw new Error("Please sign in.");
    }
    if (!response.ok) {
      pendingConfirmedSave = null;
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || "Request failed.");
    }
    const result = response.status === 204 ? null : await response.json();
    if (
      pendingConfirmedSave &&
      ["POST", "PUT", "PATCH", "DELETE"].includes(
        String(options.method || "GET").toUpperCase(),
      )
    ) {
      toast(
        pendingConfirmedSave.editing
          ? "Changes saved successfully."
          : "Record created successfully.",
      );
      pendingConfirmedSave = null;
    }
    return result;
  }
  const escapeHtml = (value = "") => {
    const node = document.createElement("div");
    node.textContent = value;
    return node.innerHTML;
  };
  const initials = (name) =>
    name
      .split(/\s+/)
      .map((value) => value[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  const formatTime = (value) =>
    new Date(value).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  const formatDate = (value) =>
    new Date(value).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const personCell = (person) =>
    `<div class="person-cell"><span class="avatar">${initials(person.name)}</span><div><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.contact || person.groupName || "Registered user")}</small></div></div>`;
  const emptyRow = (columns, text) =>
    `<tr><td class="empty-row" colspan="${columns}">${text}</td></tr>`;
  function clock() {
    const timeNode = $("#liveTime"),
      dateNode = $("#liveDate");
    if (!timeNode || !dateNode) return;
    const now = new Date();
    timeNode.textContent = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    dateNode.textContent = now.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
  async function init(page) {
    const user = await api("/api/auth/me"),
      admin = Boolean(
        user.specialEventsAccess ||
        user.historicalDataAccess ||
        user.libraryAccess ||
        user.maintenanceAccess ||
        user.usersAccess,
      ),
      pageAccess = {
        attendance: "attendanceAccess",
        events: "specialEventsAccess",
        history: "historicalDataAccess",
        library: "libraryAccess",
        students: "maintenanceAccess",
        employees: "maintenanceAccess",
        school: "maintenanceAccess",
        college: "maintenanceAccess",
        department: "maintenanceAccess",
        program: "maintenanceAccess",
        periods: "maintenanceAccess",
        maintenance: "maintenanceAccess",
        users: "usersAccess",
        permissions: "usersAccess",
        activity: "usersAccess",
      }[page];
    if (pageAccess && !user[pageAccess] && user.role !== "Superadmin") {
      location.href = "/app";
      throw new Error("Administrator access is required.");
    }
    const peoplePage =
      page === "students"
        ? "Students"
        : page === "employees"
          ? "Employees"
          : null;
    if (
      peoplePage &&
      user.role !== "Superadmin" &&
      user.peopleAccess !== "Both" &&
      user.peopleAccess !== peoplePage
    ) {
      location.href = "/app";
      throw new Error(
        `Your permission does not include ${peoplePage.toLowerCase()}.`,
      );
    }
    const sidebar = await fetch("/sidebar.html", {
      headers: {
        Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) || ""}`,
      },
    }).then((response) => {
      if (!response.ok) throw new Error("Unable to load navigation.");
      return response.text();
    });
    $("#sidebarMount").innerHTML = sidebar;
    $("#signedInName").textContent = user.fullName;
    $("#signedInRole").textContent = user.role;
    api("/api/current-academic-period")
      .then((period) => {
        const context = document.querySelector(".satp-header-context span");
        if (context && period)
          context.textContent = `${period.schoolYear} · ${period.term}`;
      })
      .catch(() => {});
    $$(".admin-only").forEach((element) =>
      element.classList.toggle("hidden", !admin),
    );
    const sidebarMount = $("#sidebarMount");
    sidebarMount.querySelectorAll("[data-access]").forEach((element) => {
      if (!user[element.dataset.access] && user.role !== "Superadmin")
        element.remove();
    });
    sidebarMount.querySelectorAll("[data-people]").forEach((element) => {
      if (
        user.role !== "Superadmin" &&
        user.peopleAccess !== "Both" &&
        user.peopleAccess !== element.dataset.people
      )
        element.remove();
    });
    sidebarMount.querySelectorAll(".nav-group").forEach((group) => {
      if (!group.querySelector(".nav-subitem")) group.remove();
    });
    $(`[data-nav="${page}"]`)?.classList.add("active");
    const maintenancePages = [
        "school",
        "college",
        "department",
        "program",
        "periods",
        "maintenance",
      ],
      maintenance = $("#maintenanceGroup"),
      maintenanceToggle = $("#maintenanceToggle"),
      applyMaintenance = (open) => {
        maintenance.classList.toggle("open", open);
        maintenanceToggle.setAttribute("aria-expanded", String(open));
      };
    if (maintenance && (user.maintenanceAccess || user.role === "Superadmin")) {
      maintenanceToggle.classList.toggle(
        "active",
        maintenancePages.includes(page),
      );
      applyMaintenance(
        maintenancePages.includes(page) ||
          localStorage.getItem("taptrack_maintenance_open") === "true",
      );
      maintenanceToggle.addEventListener("click", () => {
        const open = !maintenance.classList.contains("open");
        localStorage.setItem("taptrack_maintenance_open", String(open));
        applyMaintenance(open);
      });
    }
    const users = $("#usersGroup"),
      usersToggle = $("#usersToggle"),
      applyUsers = (open) => {
        if (!users || !usersToggle) return;
        users.classList.toggle("open", open);
        usersToggle.setAttribute("aria-expanded", String(open));
      };
    if (users && (user.usersAccess || user.role === "Superadmin")) {
      usersToggle.classList.toggle(
        "active",
        ["users", "permissions", "activity"].includes(page),
      );
      applyUsers(
        ["users", "permissions", "activity"].includes(page) ||
          localStorage.getItem("taptrack_users_open") === "true",
      );
      usersToggle.addEventListener("click", () => {
        const open = !users.classList.contains("open");
        localStorage.setItem("taptrack_users_open", String(open));
        applyUsers(open);
      });
    }
    const toggle = $("#sidebarToggle"),
      applySidebar = (collapsed) => {
        document.body.classList.toggle("sidebar-collapsed", collapsed);
        toggle.setAttribute("aria-expanded", String(!collapsed));
        toggle.setAttribute(
          "aria-label",
          collapsed ? "Expand sidebar" : "Collapse sidebar",
        );
      };
    applySidebar(true);
    requestAnimationFrame(() => document.body.classList.add("sidebar-ready"));
    toggle.addEventListener("click", () => {
      const collapsed = !document.body.classList.contains("sidebar-collapsed");
      localStorage.setItem("taptrack_sidebar_collapsed", String(collapsed));
      applySidebar(collapsed);
    });
    $("#logoutBtn").addEventListener("click", async () => {
      try {
        await api("/api/auth/logout", { method: "POST" });
      } finally {
        localStorage.removeItem(TOKEN_KEY);
        location.href = "/login";
      }
    });
    clock();
    setInterval(clock, 30000);
    return { user, admin };
  }
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-taptrack-xlsx]");
      if (existing) {
        existing.addEventListener("load", () => resolve(window.XLSX), {
          once: true,
        });
        existing.addEventListener(
          "error",
          () => reject(new Error("Unable to load the Excel library.")),
          { once: true },
        );
        return;
      }
      const script = document.createElement("script");
      script.src = "/vendor/xlsx/xlsx.full.min.js";
      script.dataset.taptrackXlsx = "true";
      script.onload = () => resolve(window.XLSX);
      script.onerror = () =>
        reject(new Error("Unable to load the Excel library."));
      document.head.appendChild(script);
    });
  }
  function clearClosedModal(dialog) {
    dialog.querySelectorAll("form").forEach((form) => {
      form.reset();
      form
        .querySelectorAll("input, select, textarea")
        .forEach((field) => field.setCustomValidity(""));
    });
    dialog
      .querySelectorAll(".form-error, .auth-error, [data-modal-error]")
      .forEach((message) => (message.textContent = ""));
    dialog
      .querySelectorAll("[data-empty-text]")
      .forEach((element) => (element.textContent = element.dataset.emptyText));
    dialog.returnValue = "";
  }
  const confirmedModalForms = new WeakSet();
  let pendingModalSubmission = null;
  function confirmationDialog() {
    let dialog = document.querySelector("#recordConfirmationDialog");
    if (dialog) return dialog;
    document.body.insertAdjacentHTML(
      "beforeend",
      `<dialog id="recordConfirmationDialog" class="satp-modal confirmation-modal">
        <form id="recordConfirmationForm">
          <div class="modal-head"><div><span class="modal-kicker">CONFIRM ACTION</span><h2 id="recordConfirmationTitle">Confirm changes</h2></div></div>
          <div class="confirmation-body"><p id="recordConfirmationMessage">Are you sure you want to save this record?</p></div>
          <div class="modal-actions"><button type="button" class="secondary-button" id="recordConfirmationCancel">Cancel</button><button type="submit" class="primary-button" id="recordConfirmationSubmit">Confirm</button></div>
        </form>
      </dialog>`,
    );
    dialog = document.querySelector("#recordConfirmationDialog");
    document
      .querySelector("#recordConfirmationCancel")
      .addEventListener("click", () => {
        pendingModalSubmission = null;
        dialog.close();
      });
    document
      .querySelector("#recordConfirmationForm")
      .addEventListener("submit", (event) => {
        event.preventDefault();
        const pending = pendingModalSubmission;
        pendingModalSubmission = null;
        dialog.close();
        if (!pending?.form?.isConnected) return;
        confirmedModalForms.add(pending.form);
        pendingConfirmedSave = {
          form: pending.form,
          editing: pending.editing,
        };
        pending.form.requestSubmit(
          pending.submitter?.isConnected ? pending.submitter : undefined,
        );
      });
    dialog.addEventListener("cancel", () => {
      pendingModalSubmission = null;
    });
    return dialog;
  }
  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target,
        recordDialog = form.closest?.("dialog#dialog");
      if (!recordDialog || confirmedModalForms.has(form)) {
        confirmedModalForms.delete(form);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      const heading =
          recordDialog.querySelector(".modal-head h2")?.textContent.trim() ||
          "record",
        editing =
          /^edit\b/i.test(heading) ||
          Boolean(form.querySelector("#recordId")?.value),
        action = editing ? "save these changes" : "create this record",
        dialog = confirmationDialog();
      pendingModalSubmission = {
        form,
        submitter: event.submitter,
        editing,
      };
      document.querySelector("#recordConfirmationTitle").textContent = editing
        ? "Save changes?"
        : "Create record?";
      document.querySelector("#recordConfirmationMessage").textContent =
        `Are you sure you want to ${action}?`;
      document.querySelector("#recordConfirmationSubmit").textContent = editing
        ? "Save changes"
        : "Create record";
      dialog.showModal();
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key !== "Enter" ||
        event.isComposing ||
        event.target.matches("textarea, button")
      )
        return;
      const form = event.target.closest?.("dialog#dialog form");
      if (!form) return;
      const submitter = form.querySelector(
        '.modal-actions button.primary-button:not([type="button"]), button[type="submit"], input[type="submit"]',
      );
      event.preventDefault();
      if (submitter) form.requestSubmit(submitter);
      else form.requestSubmit();
    },
    true,
  );
  document.addEventListener(
    "close",
    (event) => {
      if (event.target instanceof HTMLDialogElement)
        clearClosedModal(event.target);
    },
    true,
  );
  window.TapTrack = {
    $,
    $$,
    api,
    escapeHtml,
    formatTime,
    formatDate,
    personCell,
    emptyRow,
    destroyDataTable,
    initDataTable,
    loadXlsx,
    toast,
    toastAfterReload,
    init,
  };
})();
