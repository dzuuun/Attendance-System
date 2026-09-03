(function () {
  if (!document.querySelector("script[data-brand-ui]")) {
    const brandUi = document.createElement("script");
    brandUi.src = "/client/brand-ui.js?v=20260830-1";
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
    item.className = `attendance-system-toast ${type}`;
    item.setAttribute("role", type === "error" ? "alert" : "status");
    item.innerHTML = `<span class="toast-mark material-symbols-rounded" aria-hidden="true">${type === "error" ? "error" : "check_circle"}</span><div><strong>${type === "error" ? "Action failed" : "Success"}</strong><p></p></div><button type="button" aria-label="Dismiss notification"><span class="material-symbols-rounded" aria-hidden="true">close</span></button>`;
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
    if (!table) return Promise.resolve(null);
    const hasEmptyRow = Boolean(table.querySelector("tbody .empty-row"));
    const headings = [...table.querySelectorAll("thead th")];
    const idIndex = headings.findIndex((cell) =>
      /^(ID NUMBER|ID NO\.?|STUDENT ID|EMPLOYEE ID)$/.test(
        cell.textContent.trim().toUpperCase(),
      ),
    );
    const isNameHeading = (cell) =>
      /^(PERSON|NAME|FULL NAME|STUDENT|EMPLOYEE|ATTENDEE|USER|SCHOOL|COLLEGE|DEPARTMENT|EMPLOYEE DEPARTMENT|PROGRAM)$/.test(
        cell.textContent.trim().toUpperCase(),
      );
    if (idIndex > 0 && !options.data) {
      table.querySelectorAll("tr").forEach((row) => {
        const cells = row.children;
        if (cells[idIndex]) row.insertBefore(cells[idIndex], cells[0]);
      });
    }
    let currentHeadings = [...table.querySelectorAll("thead th")];
    const codeIndex = currentHeadings.findIndex(
        (cell) => cell.textContent.trim().toUpperCase() === "CODE",
      ),
      entityNameIndex = currentHeadings.findIndex(isNameHeading);
    if (codeIndex > entityNameIndex && entityNameIndex >= 0 && !options.data) {
      table.querySelectorAll("tr").forEach((row) => {
        const cells = row.children;
        if (cells[codeIndex] && cells[entityNameIndex])
          row.insertBefore(cells[codeIndex], cells[entityNameIndex]);
      });
    }
    currentHeadings = [...table.querySelectorAll("thead th")];
    const nameIndex = currentHeadings.findIndex(isNameHeading);
    if (hasEmptyRow) return Promise.resolve(null);
    const generation = table.dataset.dtGeneration || "0";
    const hasCustomSearch = Boolean(
      table
        .closest(".table-card")
        ?.querySelector(
          ".filter-row input[type='search'], .filter-row input#search",
        ),
    );
    return dataTablesReady.then((DataTable) => {
      if (
        !DataTable ||
        !table.isConnected ||
        generation !== (table.dataset.dtGeneration || "0") ||
        DataTable.isDataTable(table)
      )
        return null;
      return new DataTable(table, {
        pageLength: 10,
        deferRender: true,
        lengthMenu: [10, 25, 50, 100],
        order: nameIndex >= 0 ? [[nameIndex, "asc"]] : [],
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
          topEnd: hasCustomSearch ? null : "search",
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
  async function uploadProfilePhoto(type, id, file) {
    if (!file) return null;
    const data = new FormData();
    data.append("photo", file);
    const token = localStorage.getItem(TOKEN_KEY);
    const response = await fetch("/api/" + type + "/" + id + "/photo", {
      method: "POST",
      headers: { Authorization: "Bearer " + (token || "") },
      body: data,
    });
    if (response.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      location.href = "/login";
      throw new Error("Please sign in.");
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(result.message || "Profile photo upload failed.");
    return result;
  }
  const escapeHtml = (value = "") => {
    const node = document.createElement("div");
    node.textContent = value;
    return node.innerHTML;
  };
  const dropdownCollator = new Intl.Collator(undefined, {
    sensitivity: "base",
    numeric: true,
  });
  function sortSelectOptions(select) {
    if (
      !(select instanceof HTMLSelectElement) ||
      select.dataset.sortOptions === "false"
    )
      return;
    const sortContainer = (container) => {
      const options = [...container.children].filter(
        (child) => child instanceof HTMLOptionElement,
      );
      if (options.length < 2) return;
      const placeholders = options.filter((option) => option.value === "");
      const choices = options
        .filter((option) => option.value !== "")
        .map((option, index) => ({ option, index }))
        .sort(
          (left, right) =>
            dropdownCollator.compare(
              left.option.textContent.trim(),
              right.option.textContent.trim(),
            ) || left.index - right.index,
        )
        .map(({ option }) => option);
      const sorted = [...placeholders, ...choices];
      if (sorted.every((option, index) => option === options[index])) return;
      sorted.forEach((option) => container.appendChild(option));
    };
    sortContainer(select);
    select.querySelectorAll(":scope > optgroup").forEach(sortContainer);
  }
  function sortDropdowns(root = document) {
    const selects = new Set();
    if (root.matches?.("select")) selects.add(root);
    const parentSelect = root.closest?.("select");
    if (parentSelect) selects.add(parentSelect);
    root.querySelectorAll?.("select").forEach((select) => selects.add(select));
    selects.forEach(sortSelectOptions);
  }
  function enhanceSearchableSelect(select) {
    if (
      !select ||
      select.multiple ||
      select.closest(".searchable-select") ||
      select.closest(".dt-length") ||
      select.matches(".dt-input, [name$='_length']") ||
      select.dataset.nativeSelect === "true"
    )
      return select;
    const wrapper = document.createElement("div");
    wrapper.className = "searchable-select";
    select.before(wrapper);
    wrapper.appendChild(select);
    select.classList.add("searchable-select-native");
    wrapper.insertAdjacentHTML(
      "beforeend",
      `<button type="button" class="searchable-select-trigger" aria-haspopup="listbox" aria-expanded="false"><span></span><span class="material-symbols-rounded" aria-hidden="true">expand_more</span></button><div class="searchable-select-menu" hidden><input type="search" class="searchable-select-search" placeholder="Search options..." autocomplete="off"><div class="searchable-select-options" role="listbox"></div></div>`,
    );
    const trigger = wrapper.querySelector(".searchable-select-trigger"),
      triggerLabel = trigger.querySelector("span:first-child"),
      menu = wrapper.querySelector(".searchable-select-menu"),
      search = wrapper.querySelector(".searchable-select-search"),
      optionList = wrapper.querySelector(".searchable-select-options");
    const close = () => {
      menu.hidden = true;
      menu.style.removeProperty("top");
      menu.style.removeProperty("left");
      menu.style.removeProperty("width");
      optionList.style.removeProperty("max-height");
      wrapper.classList.remove("open", "open-up");
      trigger.setAttribute("aria-expanded", "false");
    };
    const sync = () => {
      const selected = select.selectedOptions[0];
      triggerLabel.textContent = selected?.textContent || "Select an option";
      trigger.classList.toggle("placeholder", !select.value);
      trigger.disabled = select.disabled;
    };
    const renderOptions = () => {
      const query = search.value.trim().toLowerCase();
      const available = [...select.options].filter(
        (option) =>
          !option.disabled &&
          option.value &&
          option.textContent.toLowerCase().includes(query),
      );
      optionList.innerHTML = available.length
        ? available
            .map(
              (option) =>
                `<button type="button" role="option" data-value="${escapeHtml(option.value)}" aria-selected="${String(option.value === select.value)}" class="${option.value === select.value ? "selected" : ""}">${escapeHtml(option.textContent)}</button>`,
            )
            .join("")
        : '<p class="searchable-select-empty">No matching options</p>';
    };
    trigger.addEventListener("click", () => {
      const opening = menu.hidden;
      document.querySelectorAll(".searchable-select.open").forEach((item) => {
        if (item !== wrapper) {
          item.classList.remove("open", "open-up");
          item.querySelector(".searchable-select-menu").hidden = true;
          item
            .querySelector(".searchable-select-trigger")
            .setAttribute("aria-expanded", "false");
        }
      });
      if (!opening) return close();
      search.value = "";
      renderOptions();
      menu.hidden = false;
      const triggerRect = trigger.getBoundingClientRect();
      const spaceAbove = triggerRect.top - 12;
      const spaceBelow = window.innerHeight - triggerRect.bottom - 12;
      const naturalHeight = menu.offsetHeight;
      const openUp = naturalHeight > spaceBelow && spaceAbove > spaceBelow;
      const available = openUp ? spaceAbove : spaceBelow;
      const menuChrome = naturalHeight - optionList.offsetHeight;
      optionList.style.maxHeight = `${Math.max(80, Math.min(210, available - menuChrome))}px`;
      menu.style.left = `${triggerRect.left}px`;
      menu.style.width = `${triggerRect.width}px`;
      menu.style.top = openUp
        ? `${Math.max(12, triggerRect.top - menu.offsetHeight - 6)}px`
        : `${triggerRect.bottom + 6}px`;
      wrapper.classList.toggle("open-up", openUp);
      wrapper.classList.add("open");
      trigger.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => search.focus());
    });
    search.addEventListener("input", renderOptions);
    optionList.addEventListener("click", (event) => {
      const option = event.target.closest("[data-value]");
      if (!option) return;
      select.value = option.dataset.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      sync();
      close();
      trigger.focus();
    });
    wrapper.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        close();
        trigger.focus();
      }
    });
    select.addEventListener("change", sync);
    select.addEventListener("invalid", (event) => {
      event.preventDefault();
      trigger.focus();
      if (menu.hidden) trigger.click();
    });
    select.searchableSelectSync = sync;
    new MutationObserver(sync).observe(select, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    sync();
    return select;
  }
  function enhanceSearchableSelects(root = document) {
    sortDropdowns(root);
    if (root.matches?.("select")) enhanceSearchableSelect(root);
    root.querySelectorAll?.("select").forEach(enhanceSearchableSelect);
  }
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
  const personName = (person) =>
    person?.lastName
      ? `${person.lastName}, ${person.firstName || ""}${person.middleName ? ` ${person.middleName}` : ""}`.trim()
      : person?.name || "";
  const personCell = (person) => {
    const secondary = person.contact || person.groupName || "";
    const name = personName(person);
    return `<div class="person-cell"><span class="avatar">${initials(name)}${person.photoUrl ? `<img src="${escapeHtml(person.photoUrl)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</span><div><strong>${escapeHtml(name)}</strong>${secondary ? `<small>${escapeHtml(secondary)}</small>` : ""}</div></div>`;
  };
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
        user.libraryAccess ||
        user.maintenanceAccess ||
        user.usersAccess,
      ),
      pageAccess = {
        dashboard: "overviewAccess",
        attendance: "attendanceAccess",
        events: "specialEventsAccess",
        history: "specialEventsAccess",
        library: "libraryAccess",
        libraryEntrance: "libraryAccess",
        internetEntrance: "libraryAccess",
        students: "maintenanceAccess",
        employees: "maintenanceAccess",
        school: "maintenanceAccess",
        college: "maintenanceAccess",
        department: "maintenanceAccess",
        employee_department: "maintenanceAccess",
        program: "maintenanceAccess",
        gates: "maintenanceAccess",
        periods: "maintenanceAccess",
        maintenance: "maintenanceAccess",
        users: "usersAccess",
        permissions: "usersAccess",
        activity: "usersAccess",
      }[page];
    const hasPageAccess = !pageAccess || user[pageAccess];
    if (!hasPageAccess && user.role !== "Superadmin") {
      const landing = user.overviewAccess
        ? "/overview"
        : user.attendanceAccess
          ? "/attendance"
          : user.specialEventsAccess
            ? "/events"
            : user.libraryAccess
              ? "/library/entrance"
              : user.maintenanceAccess
                ? "/maintenance/student"
                : user.usersAccess
                  ? "/user/permissions"
                  : null;
      if (!landing) {
        localStorage.removeItem(TOKEN_KEY);
        location.href = "/login?error=no_access";
      } else location.href = landing;
      throw new Error("Administrator access is required.");
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
        const context = document.querySelector(
          ".attendance-system-header-context span",
        );
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
    sidebarMount.querySelectorAll("[data-access-any]").forEach((element) => {
      const accessKeys = element.dataset.accessAny.split(/\s+/).filter(Boolean);
      if (user.role !== "Superadmin" && !accessKeys.some((key) => user[key]))
        element.remove();
    });
    sidebarMount.querySelectorAll(".nav-group").forEach((group) => {
      if (!group.querySelector(".nav-subitem")) group.remove();
    });
    $(`[data-nav="${page}"]`)?.classList.add("active");
    const sidebarGroups = [
      {
        group: $("#eventsGroup"),
        toggle: $("#eventsToggle"),
        pages: ["events", "history"],
      },
      {
        group: $("#libraryGroup"),
        toggle: $("#libraryToggle"),
        pages: ["libraryEntrance", "internetEntrance"],
      },
      {
        group: $("#maintenanceGroup"),
        toggle: $("#maintenanceToggle"),
        pages: [
          "students",
          "employees",
          "school",
          "college",
          "department",
          "employee_department",
          "program",
          "periods",
          "maintenance",
        ],
      },
      {
        group: $("#usersGroup"),
        toggle: $("#usersToggle"),
        pages: ["users", "permissions", "activity"],
      },
    ].filter(({ group, toggle }) => group && toggle);

    const setGroupOpen = ({ group, toggle }, open) => {
      group.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };

    sidebarGroups.forEach((entry) => {
      const isCurrentModule = entry.pages.includes(page);
      entry.toggle.classList.toggle("active", isCurrentModule);
      setGroupOpen(entry, isCurrentModule);
      entry.toggle.addEventListener("click", () => {
        const shouldOpen = !entry.group.classList.contains("open");
        sidebarGroups.forEach((groupEntry) =>
          setGroupOpen(groupEntry, groupEntry === entry && shouldOpen),
        );
      });
    });

    localStorage.removeItem("taptrack_maintenance_open");
    localStorage.removeItem("taptrack_users_open");
    localStorage.removeItem("taptrack_library_open");
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
      .querySelectorAll("input, select, textarea")
      .forEach((field) => {
        if (!field.closest("form")) {
          if (field instanceof HTMLInputElement) {
            if (["checkbox", "radio"].includes(field.type))
              field.checked = field.defaultChecked;
            else if (field.type !== "button" && field.type !== "submit")
              field.value = "";
          } else if (field instanceof HTMLSelectElement) {
            const defaultOption = [...field.options].findIndex(
              (option) => option.defaultSelected,
            );
            field.selectedIndex = defaultOption >= 0 ? defaultOption : 0;
          } else field.value = "";
        }
        field.setCustomValidity("");
        if (field instanceof HTMLSelectElement)
          field.searchableSelectSync?.();
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
      `<dialog id="recordConfirmationDialog" class="attendance-system-modal confirmation-modal">
        <form id="recordConfirmationForm">
          <div class="modal-head"><div><span class="modal-kicker">CONFIRM ACTION</span><h2 id="recordConfirmationTitle">Confirm changes</h2></div></div>
          <div class="confirmation-body"><p id="recordConfirmationMessage">Are you sure you want to save this record?</p></div>
          <div class="modal-actions"><button type="button" class="secondary-button" id="recordConfirmationCancel">Cancel</button><button type="submit" class="primary-button" id="recordConfirmationSubmit" autofocus>Confirm</button></div>
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
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      document
        .querySelector("#recordConfirmationForm")
        .requestSubmit(document.querySelector("#recordConfirmationSubmit"));
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
      document.querySelector("#recordConfirmationSubmit").focus();
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
  document.addEventListener("click", (event) => {
    if (event.target.closest(".searchable-select")) return;
    document.querySelectorAll(".searchable-select.open").forEach((wrapper) => {
      wrapper.classList.remove("open", "open-up");
      wrapper.querySelector(".searchable-select-menu").hidden = true;
      wrapper
        .querySelector(".searchable-select-trigger")
        .setAttribute("aria-expanded", "false");
    });
  });
  enhanceSearchableSelects();
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) =>
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) enhanceSearchableSelects(node);
      }),
    );
  }).observe(document.body, { childList: true, subtree: true });
  window.TapTrack = {
    $,
    $$,
    api,
    uploadProfilePhoto,
    escapeHtml,
    formatTime,
    formatDate,
    personCell,
    personName,
    emptyRow,
    destroyDataTable,
    initDataTable,
    enhanceSearchableSelect,
    enhanceSearchableSelects,
    loadXlsx,
    toast,
    toastAfterReload,
    init,
  };
})();
