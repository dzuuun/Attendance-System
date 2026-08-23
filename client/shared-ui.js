(function () {
  const $ = (selector) => document.querySelector(selector),
    $$ = (selector) => [...document.querySelectorAll(selector)],
    TOKEN_KEY = "taptrack_token";
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
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || "Request failed.");
    }
    return response.status === 204 ? null : response.json();
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
    const now = new Date();
    $("#liveTime").textContent = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    $("#liveDate").textContent = now.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
  async function init(page) {
    const user = await api("/api/auth/me"),
      admin = ["Superadmin", "Administrator"].includes(user.role);
    if (
      [
        "events",
        "school",
        "college",
        "department",
        "program",
        "maintenance",
        "users",
      ].includes(page) &&
      !admin
    ) {
      location.href = "/app";
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
    $$(".admin-only").forEach((element) =>
      element.classList.toggle("hidden", !admin),
    );
    $(`[data-nav="${page}"]`)?.classList.add("active");
    const maintenancePages = [
        "school",
        "college",
        "department",
        "program",
        "maintenance",
      ],
      maintenance = $("#maintenanceGroup"),
      maintenanceToggle = $("#maintenanceToggle"),
      applyMaintenance = (open) => {
        maintenance.classList.toggle("open", open);
        maintenanceToggle.setAttribute("aria-expanded", String(open));
      };
    if (maintenance && admin) {
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
    const toggle = $("#sidebarToggle"),
      applySidebar = (collapsed) => {
        document.body.classList.toggle("sidebar-collapsed", collapsed);
        toggle.textContent = collapsed ? "›" : "‹";
        toggle.setAttribute("aria-expanded", String(!collapsed));
        toggle.setAttribute(
          "aria-label",
          collapsed ? "Expand sidebar" : "Collapse sidebar",
        );
      };
    applySidebar(localStorage.getItem("taptrack_sidebar_collapsed") === "true");
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
  window.TapTrack = {
    $,
    $$,
    api,
    escapeHtml,
    formatTime,
    formatDate,
    personCell,
    emptyRow,
    init,
  };
})();
