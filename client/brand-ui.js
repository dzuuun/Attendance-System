(function () {
  "use strict";
  if (window.__tapTrackBrandUi) return;
  window.__tapTrackBrandUi = true;

  let favicon = document.querySelector('link[rel~="icon"]');
  if (!favicon) {
    favicon = document.createElement("link");
    favicon.rel = "icon";
    document.head.appendChild(favicon);
  }
  favicon.type = "image/png";
  favicon.href = "/client/images/NDMU-Logo.png";

  if (!document.querySelector("link[data-material-symbols]")) {
    const materialSymbols = document.createElement("link");
    materialSymbols.rel = "stylesheet";
    materialSymbols.href = "/vendor/material-symbols/rounded.css";
    materialSymbols.dataset.materialSymbols = "true";
    document.head.appendChild(materialSymbols);
  }

  const collapseFix = document.createElement("style");
  collapseFix.id = "taptrack-collapse-fix";
  collapseFix.textContent = `
    .ndmu-brand-seal{width:44px!important;height:44px!important;max-width:44px!important;object-fit:contain!important;border-radius:9999px!important;background:#fff!important;padding:2px!important}
    .attendance-system-header-identity img{width:44px!important;height:44px!important;max-width:44px!important;object-fit:contain!important}
    dialog[open]{position:fixed!important;inset:0!important;margin:auto!important;max-width:calc(100vw - 32px)!important;max-height:calc(100vh - 40px)!important}
    body.sidebar-collapsed .app-shell{grid-template-columns:0 minmax(0,1fr)!important}
    body.sidebar-collapsed .sidebar{width:0!important;min-width:0!important;padding:0!important;border:0!important;overflow:hidden!important}
    body.sidebar-collapsed .sidebar-inner{visibility:hidden!important}
    body.sidebar-collapsed .main{width:100%!important;min-width:0!important;max-width:100vw!important;margin:0!important}
    .material-symbols-rounded,.material-icon{font-family:"Material Symbols Rounded"!important;font-weight:normal!important;font-style:normal!important;line-height:1!important;letter-spacing:normal!important;text-transform:none!important;white-space:nowrap!important;word-wrap:normal!important;direction:ltr!important;-webkit-font-smoothing:antialiased!important;text-rendering:optimizeLegibility!important;font-feature-settings:"liga"!important;font-variation-settings:"FILL" 0,"wght" 500,"GRAD" 0,"opsz" 24!important}
    .nav-icon.material-symbols-rounded{font-size:20px!important}
    .nav-chevron.material-symbols-rounded{font-size:18px!important}
    .btn-icon.material-symbols-rounded,.input-icon.material-symbols-rounded,.submit-btn .material-symbols-rounded,.kiosk-camera-button .material-symbols-rounded{font-size:19px!important}
    .result-icon-badge.material-symbols-rounded{display:grid!important;place-items:center!important;font-size:30px!important;font-variation-settings:"FILL" 0,"wght" 500,"GRAD" 0,"opsz" 32!important}
    .feed-empty-state>.material-symbols-rounded{font-size:38px!important}
    .attendance-system-menu-button>.material-symbols-rounded{font-size:24px!important}
    .search-box>.material-symbols-rounded{font-size:19px!important;color:#71847a!important}
    .logout-button>.material-symbols-rounded{font-size:17px!important;vertical-align:middle!important}
    .close-button,.modal-close-btn{font-size:0!important}
    .close-button::before,.modal-close-btn::before{content:"close";font-family:"Material Symbols Rounded";font-size:22px;font-weight:normal;line-height:1;font-feature-settings:"liga"}
    .edit-icon{font-size:0!important}
    .edit-icon::before,.secondary-button.edit:not(:has(.material-symbols-rounded))::before{content:"edit"!important;font-family:"Material Symbols Rounded"!important;font-size:19px!important;font-weight:normal!important;line-height:1!important;font-feature-settings:"liga"!important;transform:none!important}
  `;
  document.head.appendChild(collapseFix);

  if (!document.querySelector("link[data-tailwind-local]")) {
    const localTailwind = document.createElement("link");
    localTailwind.rel = "stylesheet";
    localTailwind.href = "/client/tailwind.css";
    localTailwind.dataset.tailwindLocal = "true";
    document.head.prepend(localTailwind);
  }
  const rules = {
    body: "min-h-screen bg-[#f4f7f5] text-[#183128] antialiased selection:bg-[#f3c94d]/40",
    ".app-shell": "min-h-screen bg-[#f4f7f5]",
    ".main": "min-w-0 !m-0 !w-full !max-w-none !bg-[#f4f7f5] !p-0",
    ".brand-workspace":
      "mx-auto w-full max-w-[1320px] flex-1 px-5 py-10 md:px-8 md:py-14 xl:px-10",
    ".topbar":
      "mb-8 flex flex-wrap items-end justify-between gap-5 !border-0 !pb-0",
    ".topbar h1":
      "mt-1 [font-family:Georgia,serif] !text-3xl !font-medium !tracking-tight text-[#183128] md:!text-4xl",
    ".eyebrow,.section-kicker":
      "!text-[11px] !font-extrabold !tracking-[.16em] !text-[#087247]",
    ".live-time":
      "rounded-xl border border-[#d8e3dd] bg-white px-4 py-2 text-right shadow-sm",
    ".live-time span": "!text-sm !font-bold text-[#183128]",
    ".live-time small": "!text-[11px] text-[#65736c]",
    ".section-header": "mb-5 flex flex-wrap items-center justify-between gap-4",
    ".section-header p,.muted": "!text-sm !leading-6 !text-[#65736c]",
    ".table-card,.scanner-card,.stat-card,.settings-card":
      "!rounded-2xl !border !border-[#d8e3dd] !bg-white !shadow-[0_12px_35px_rgba(7,50,34,.07)]",
    ".table-card": "overflow-hidden",
    ".filter-row,.table-toolbar":
      "!border-b !border-[#e5ece8] !bg-[#fafcfb] !p-4",
    ".table-wrap": "overflow-x-auto",
    table: "!w-full !border-collapse !text-sm",
    thead: "bg-[#f5f8f6]",
    th: "!border-b !border-[#dfe8e3] !px-4 !py-3 !text-left !text-[10px] !font-extrabold !tracking-[.12em] !text-[#65736c]",
    td: "!border-b !border-[#edf2ef] !px-4 !py-3.5 !text-[#354b42]",
    "tbody tr": "transition hover:bg-[#f8fbf9]",
    ".primary-button,.button":
      "!inline-flex !min-h-10 !items-center !justify-center !rounded-[10px] !border !border-[#075c3b] !bg-[#075c3b] !px-4 !py-2 !text-sm !font-bold !text-white !no-underline !shadow-sm transition hover:!bg-[#043b2a] focus:!outline-none focus:!ring-2 focus:!ring-[#f3c94d] focus:!ring-offset-2",
    ".secondary-button,.row-action,.icon-button":
      "!inline-flex !min-h-9 !items-center !justify-center !rounded-[9px] !border !border-[#d1ddd7] !bg-white !px-3 !py-2 !text-sm !font-bold !text-[#315b49] !shadow-sm transition hover:!border-[#8eab9d] hover:!bg-[#f4f8f6]",
    "input,select,textarea":
      "!rounded-[9px] !border !border-[#ccd9d2] !bg-white !px-3 !py-2.5 !text-sm !text-[#183128] !outline-none transition placeholder:!text-[#91a099] focus:!border-[#087247] focus:!ring-2 focus:!ring-[#087247]/15",
    label: "!text-xs !font-bold !text-[#40564c]",
    ".search-box":
      "!rounded-[10px] !border !border-[#d8e3dd] !bg-white !px-3 !shadow-sm",
    ".search-box input": "!border-0 !bg-transparent !shadow-none focus:!ring-0",
    ".status-pill,.connection-pill":
      "!inline-flex !items-center !rounded-full !bg-[#e8f5ed] !px-2.5 !py-1 !text-[10px] !font-extrabold !tracking-wide !text-[#087247]",
    ".status-pill.time-out": "!bg-[#fde8e7] !text-[#b42318]",
    ".person-cell": "flex items-center gap-3",
    ".avatar":
      "!grid !h-9 !w-9 !place-items-center !rounded-full !bg-[#075c3b] !text-xs !font-extrabold !text-[#f3c94d]",
    dialog:
      "!rounded-2xl !border-0 !bg-white !p-0 !text-[#183128] !shadow-2xl backdrop:!bg-[#043b2a]/55",
    "dialog form,dialog>div": "!p-6",
    ".modal-head":
      "!mb-5 !flex !items-start !justify-between !gap-4 !border-b !border-[#e3ebe7] !pb-4",
    ".modal-head h2":
      "[font-family:Georgia,serif] !text-2xl !font-medium !text-[#183128]",
    ".close-button":
      "!grid !h-9 !w-9 !place-items-center !rounded-full !border-0 !bg-transparent !p-0 !text-2xl !text-[#65736c] hover:!bg-[#eef3f0]",
    ".form-grid": "!gap-4",
    ".modal-actions":
      "!mt-5 !flex !justify-end !gap-3 !border-t !border-[#e3ebe7] !pt-4",
    ".form-error,.auth-error": "!text-sm !font-semibold !text-red-700",
    ".sidebar":
      "!bg-[#043b2a] !text-white !shadow-[18px_0_45px_rgba(3,31,22,.18)]",
    ".sidebar .brand":
      "!flex !items-center !gap-3 !text-white !no-underline [font-family:Georgia,serif] !text-xl",
    ".sidebar .brand>span": "grid gap-0.5",
    ".sidebar .brand strong": "!font-medium !leading-none",
    ".sidebar .brand small":
      "[font-family:Inter,sans-serif] !text-[9px] !font-extrabold !uppercase !tracking-[.14em] !text-white/45",
    ".sidebar .ndmu-brand-seal":
      "!h-11 !w-11 !rounded-full !bg-white !p-0.5 !object-contain",
    ".nav": "!gap-1.5",
    ".nav-item":
      "!min-h-11 !rounded-[11px] !border !border-transparent !text-[13px] !font-semibold !text-white/75 transition hover:!border-white/5 hover:!bg-white/[.07] hover:!text-white",
    ".nav-item.active":
      "!border-[#f3c94d] !bg-[#f3c94d] !font-extrabold !text-[#043b2a] !shadow-[0_7px_18px_rgba(243,201,77,.22)] hover:!bg-[#f7d66c] hover:!text-[#043b2a]",
    ".nav-item.active .nav-icon,.nav-item.active .nav-chevron":
      "!text-[#043b2a]",
    ".nav-subitem":
      "!rounded-lg !text-white/55 hover:!bg-white/[.06] hover:!text-white",
    ".nav-subitem.active":
      "!bg-[#f3c94d] !font-extrabold !text-[#043b2a] !shadow-[0_5px_14px_rgba(243,201,77,.18)] hover:!bg-[#f7d66c] hover:!text-[#043b2a]",
    ".sidebar-foot": "!border-t !border-white/10 !bg-black/10",
    ".logout-button":
      "!rounded-lg !border !border-white/10 !bg-white/[.06] !px-3 !py-2 !text-xs !font-bold !text-white/75 hover:!text-[#f3c94d]",
    ".hero-grid": "!gap-5",
    ".scanner-card": "!p-6",
    ".stat-card": "!p-5",
    ".stat-card.accent": "!border-[#d9c36a] !bg-[#fffdf4]",
    ".scanner-visual": "!rounded-2xl !border-[#b8d0c4] !bg-[#edf6f1]",
    ".mode-picker": "!rounded-xl !border !border-[#d8e3dd] !bg-[#fafcfb] !p-3",
    ".scan-form": "!mt-5",
    ".scan-message": "!mt-3 !rounded-xl !text-sm",
    ".card-heading": "!mb-4 !flex !items-start !justify-between !gap-4",
    ".stat-icon":
      "!grid !h-11 !w-11 !place-items-center !rounded-xl !bg-[#e8f5ed] !text-[#087247]",
    ".recent-card": "!mt-5",
    ".settings-grid": "!gap-5",
    ".auth-page":
      "!grid !min-h-screen !bg-[#f4f7f5] lg:!grid-cols-[minmax(380px,42%)_1fr]",
    ".auth-side":
      "!flex !min-h-[260px] !flex-col !justify-between !bg-[#043b2a] !p-8 !text-white md:!p-12 lg:!min-h-screen",
    ".auth-side h1":
      "[font-family:Georgia,serif] !text-4xl !font-medium md:!text-5xl",
    ".auth-form-wrap":
      "!flex !flex-col !items-center !justify-center !gap-6 !bg-[#f4f7f5] !p-5 md:!p-10",
    ".auth-card":
      "!w-full !max-w-md !rounded-2xl !border !border-[#d8e3dd] !bg-white !p-7 !shadow-[0_20px_55px_rgba(7,50,34,.12)] md:!p-9",
    ".auth-card h2": "[font-family:Georgia,serif] !text-3xl !font-medium",
    ".auth-card p": "!text-sm !leading-6 !text-[#65736c]",
    ".auth-card .button": "!mt-2 !w-full",
    ".back-link":
      "!mt-4 !block !text-center !text-xs !font-semibold !text-[#087247] !no-underline hover:!underline",
    ".portal-brand":
      "!inline-flex !items-center !gap-3 !text-white !no-underline [font-family:Georgia,serif] !text-xl",
    ".kiosk": "!min-h-screen !bg-[#043b2a] !p-5 md:!p-8",
    ".terminal-card":
      "!mx-auto !max-w-5xl !rounded-3xl !border !border-white/10 !bg-white !p-6 !shadow-2xl md:!p-10",
    ".terminal-card h1":
      "[font-family:Georgia,serif] !text-4xl !font-medium !text-[#183128]",
    ".scanner": "!border-[#c4d8ce] !bg-[#edf6f1]",
    ".terminal-status":
      "!rounded-full !border !border-white/15 !bg-white/[.07] !px-3 !py-1.5 !text-xs !font-bold !text-white/80",
    ".result": "!rounded-xl !border !border-[#d8e3dd] !bg-[#fafcfb]",
    ".landing-hero": "!bg-[#043b2a] !text-white",
    ".landing-hero h1": "[font-family:Georgia,serif] !font-medium",
    ".landing-hero h1 span": "!text-[#f3c94d]",
    ".portal-nav": "!border-b !border-white/10 !bg-[#043b2a] !text-white",
    ".portal-nav .nav-links a":
      "!text-white/70 !no-underline hover:!text-white",
    ".hero-copy p": "!text-white/65",
    ".hero-actions .light":
      "!border-white/20 !bg-white/[.08] !text-white hover:!bg-white/[.14]",
    ".terminal": "!border-white/15 !bg-[#062f23] !shadow-2xl",
    ".feature-strip": "!bg-[#f4f7f5]",
    ".feature":
      "!rounded-2xl !border !border-[#d8e3dd] !bg-white !p-6 !shadow-sm",
    ".attendance-system-site-header":
      "sticky top-0 z-30 flex min-h-[80px] items-center justify-between gap-5 border-b border-white/10 !bg-[#043b2a] px-5 py-3 text-white shadow-sm md:px-8 xl:px-10",
    ".attendance-system-header-brand": "flex min-w-0 items-center gap-3",
    ".attendance-system-menu-button":
      "grid h-10 w-10 flex-none place-items-center rounded-[10px] border border-[#d8e3dd] bg-white text-[#075c3b] transition hover:bg-[#edf5f1] focus:outline-none focus:ring-2 focus:ring-[#f3c94d]",
    ".attendance-system-menu-button svg":
      "h-5 w-5 fill-none stroke-current stroke-2",
    ".attendance-system-header-identity":
      "flex min-w-0 items-center gap-3 no-underline",
    ".attendance-system-header-identity img":
      "h-11 w-11 flex-none rounded-full object-contain",
    ".attendance-system-header-identity span": "hidden min-w-0 sm:grid",
    ".attendance-system-header-identity strong":
      "truncate [font-family:Georgia,serif] text-base font-medium !text-white md:text-lg",
    ".attendance-system-header-identity small":
      "truncate text-[9px] font-extrabold uppercase tracking-[.1em] !text-white/55",
    ".attendance-system-header-context": "hidden text-right sm:grid",
    ".attendance-system-header-context span":
      "text-[9px] font-extrabold uppercase tracking-[.14em] !text-white/55",
    ".attendance-system-header-context strong": "text-sm font-bold !text-white",
    ".attendance-system-site-footer":
      "mt-auto flex flex-wrap items-center justify-center gap-2 border-t border-[#d8e3dd] bg-white px-5 py-4 text-center text-[11px] font-medium text-[#65736c] md:justify-between md:px-8 xl:px-10",
    ".attendance-system-site-footer>span":
      "hidden h-1 w-1 rounded-full bg-[#f3c94d] md:block",
  };

  function addClasses(element, classes) {
    if (element.dataset.brandStyled === classes) return;
    element.classList.add(...classes.split(/\s+/).filter(Boolean));
    element.dataset.brandStyled = classes;
  }

  function installBrand(root = document) {
    for (const [selector, classes] of Object.entries(rules)) {
      if (root instanceof Element && root.matches(selector))
        addClasses(root, classes);
      root
        .querySelectorAll?.(selector)
        .forEach((element) => addClasses(element, classes));
    }
    root.querySelectorAll?.(".brand,.portal-brand").forEach((brand) => {
      if (brand.querySelector(".ndmu-brand-seal")) return;
      brand.querySelector(".brand-mark,i")?.remove();
      const image = document.createElement("img");
      image.src = "/client/images/NDMU-Logo.png";
      image.alt = "";
      image.className =
        "ndmu-brand-seal h-10 w-10 rounded-full bg-white p-0.5 object-contain";
      brand.prepend(image);
    });
    root.querySelectorAll?.("dialog .modal-head").forEach((head) => {
      if (head.querySelector(".modal-kicker,.eyebrow")) return;
      const heading = head.querySelector("h2");
      if (!heading) return;
      const wrapper = document.createElement("div");
      const kicker = document.createElement("span");
      kicker.className = "modal-kicker";
      kicker.textContent = /^edit\b/i.test(heading.textContent.trim())
        ? "EDIT RECORD"
        : "NEW RECORD";
      heading.before(wrapper);
      wrapper.append(kicker, heading);
    });
    root.querySelectorAll?.("table thead th:last-child").forEach((heading) => {
      if (!heading.textContent.trim()) heading.textContent = "ACTION";
    });
    document.querySelectorAll("table").forEach((table) => {
      const headings = [...table.querySelectorAll("thead th")];
      const statusIndex = headings.findIndex(
        (heading) => heading.textContent.trim().toUpperCase() === "STATUS",
      );
      const typeIndex = headings.findIndex(
        (heading) => heading.textContent.trim().toUpperCase() === "TYPE",
      );
      const actionIndex = headings.findLastIndex((heading) =>
        ["ACTION", "ACTIONS", "MANAGE"].includes(
          heading.textContent.trim().toUpperCase(),
        ),
      );
      table.querySelectorAll("tr").forEach((row) => {
        if (statusIndex >= 0)
          row.children[statusIndex]?.classList.add(
            "attendance-system-status-column",
          );
        if (typeIndex >= 0)
          row.children[typeIndex]?.classList.add(
            "attendance-system-type-column",
          );
        if (actionIndex >= 0)
          row.children[actionIndex]?.classList.add(
            "attendance-system-actions-column",
          );
      });
    });
  }

  function installAppShell() {
    const main = document.querySelector(".app-shell > .main");
    if (!main || main.dataset.attendanceSystemShell === "true") return;
    main.dataset.attendanceSystemShell = "true";
    const pageTitle =
      main.querySelector(".topbar h1")?.textContent?.trim() || "Attendance";
    const pageArea =
      main.querySelector(".topbar .eyebrow")?.textContent?.trim() ||
      "Workspace";
    const defaultDescriptions = {
      Overview: "Monitor today's university entrance activity.",
      "Attendance scanner":
        "Record attendee Time In and Time Out for this event.",
      Maintenance: "Manage system settings and attendance data.",
    };
    const breadcrumbLabel = (value) => {
      const acronyms = new Set(["ID", "MIS", "NDMU", "NFC", "RFID"]);
      return String(value)
        .split(/\s+/)
        .map((word) => {
          const upper = word.toUpperCase();
          if (acronyms.has(upper)) return upper;
          return /^[A-Z]+$/.test(word)
            ? word.charAt(0) + word.slice(1).toLowerCase()
            : word;
        })
        .join(" ");
    };
    const header = document.createElement("header");
    header.className = "attendance-system-site-header";
    header.innerHTML = `<div class="attendance-system-header-brand"><button type="button" class="attendance-system-menu-button" aria-label="Toggle navigation"><span class="material-symbols-rounded" aria-hidden="true">menu</span></button><a class="attendance-system-header-identity" href="/app"><img src="/client/images/NDMU-Logo.png" alt=""><span><strong>Notre Dame of Marbel University</strong><small>TapTrack Attendance System</small></span></a></div><div class="attendance-system-header-context"><span>${pageArea}</span><strong>${pageTitle}</strong></div>`;
    header
      .querySelector(".attendance-system-menu-button")
      .addEventListener("click", () =>
        document.getElementById("sidebarToggle")?.click(),
      );
    const workspace = document.createElement("div");
    workspace.className = "brand-workspace";
    while (main.firstChild) workspace.appendChild(main.firstChild);
    const topbar = workspace.querySelector(".topbar");
    if (topbar) {
      const sourceTitle = topbar.querySelector("h1");
      const sourceArea = topbar.querySelector(".eyebrow");
      const description =
        topbar
          .querySelector(".attendance-system-page-description")
          ?.textContent?.trim() ||
        workspace.querySelector(".section-header > p")?.textContent?.trim() ||
        workspace
          .querySelector(".directory-card-header > div:first-child > p")
          ?.textContent?.trim() ||
        defaultDescriptions[pageTitle];
      if (
        description &&
        !topbar.querySelector(".attendance-system-page-description")
      ) {
        const paragraph = document.createElement("p");
        paragraph.className = "attendance-system-page-description";
        paragraph.textContent = description;
        topbar.firstElementChild?.appendChild(paragraph);
      }
      if (description) {
        const normalizedDescription = description.replace(/\s+/g, " ").trim();
        workspace.querySelectorAll("p").forEach((paragraph) => {
          if (topbar.contains(paragraph)) return;
          const text = paragraph.textContent.replace(/\s+/g, " ").trim();
          if (text === normalizedDescription) paragraph.remove();
        });
      }
      topbar
        .querySelector(".live-time")
        ?.classList.add("attendance-system-topbar-utility");
      const breadcrumb = document.createElement("nav");
      breadcrumb.className = "attendance-system-breadcrumb";
      breadcrumb.setAttribute("aria-label", "Breadcrumb");
      breadcrumb.innerHTML = `<span>TapTrack</span><b aria-hidden="true">-</b><span>${breadcrumbLabel(pageArea)}</span><b aria-hidden="true">-</b><strong>${breadcrumbLabel(pageTitle)}</strong>`;
      topbar.appendChild(breadcrumb);
      const contextArea = header.querySelector(
        ".attendance-system-header-context span",
      );
      const contextTitle = header.querySelector(
        ".attendance-system-header-context strong",
      );
      const breadcrumbArea = breadcrumb.querySelector("span:nth-of-type(2)");
      const breadcrumbTitle = breadcrumb.querySelector("strong");
      const syncHeaderText = () => {
        const currentArea = sourceArea?.textContent?.trim() || pageArea;
        const currentTitle = sourceTitle?.textContent?.trim() || pageTitle;
        contextArea.textContent = currentArea;
        contextTitle.textContent = currentTitle;
        breadcrumbArea.textContent = breadcrumbLabel(currentArea);
        breadcrumbTitle.textContent = breadcrumbLabel(currentTitle);
      };
      const headerObserver = new MutationObserver(syncHeaderText);
      if (sourceArea)
        headerObserver.observe(sourceArea, {
          childList: true,
          characterData: true,
          subtree: true,
        });
      if (sourceTitle)
        headerObserver.observe(sourceTitle, {
          childList: true,
          characterData: true,
          subtree: true,
        });
    }
    const recordsHeading = workspace.querySelector(".section-header");
    if (
      recordsHeading &&
      !recordsHeading.querySelector(".attendance-system-records-heading")
    ) {
      const copy = recordsHeading.querySelector("p");
      const heading = document.createElement("div");
      const hasInactiveDirectory = Boolean(
        recordsHeading.querySelector("#showInactive"),
      );
      const directoryName = pageTitle.replace(/s$/i, "");
      heading.className = hasInactiveDirectory
        ? ""
        : "attendance-system-records-heading";
      heading.innerHTML = hasInactiveDirectory
        ? `<span class="section-kicker">${directoryName.toUpperCase()} DIRECTORY</span><h2 id="academicDirectoryTitle">Active ${pageTitle.toLowerCase()}</h2>`
        : `<span>RECORD DIRECTORY</span><h2>${pageTitle}</h2>`;
      copy?.remove();
      recordsHeading.prepend(heading);
      if (hasInactiveDirectory) {
        const tableCard = recordsHeading.nextElementSibling;
        recordsHeading.className = "directory-card-header";
        const directoryActions = recordsHeading.querySelector(".event-actions");
        if (directoryActions) directoryActions.className = "directory-actions";
        if (tableCard?.matches(".table-card"))
          tableCard.prepend(recordsHeading);
      }
    }
    const footer = document.createElement("footer");
    footer.className = "attendance-system-site-footer";
    footer.innerHTML = `<p>&copy; <span class="attendance-system-year"></span> Notre Dame of Marbel University</p><span></span><p>Developed by the MIS Department</p>`;
    footer.querySelector(".attendance-system-year").textContent =
      new Date().getFullYear();
    main.append(header, workspace, footer);
    main.classList.add("flex", "min-h-screen", "flex-col");
    installBrand(main);
  }

  function installPublicFooter() {
    if (document.querySelector(".app-shell,.attendance-system-site-footer"))
      return;
    const target =
      document.querySelector(".kiosk") ||
      (document.body.matches(".auth-page")
        ? document.querySelector(".auth-form-wrap")
        : document.body);
    if (!target) return;
    const footer = document.createElement("footer");
    footer.className = "attendance-system-site-footer";
    footer.innerHTML = `<p>&copy; <span>${new Date().getFullYear()}</span> Notre Dame of Marbel University</p><span></span><p>Developed by the MIS Department</p>`;
    target.appendChild(footer);
    installBrand(footer);
  }

  installBrand();
  installAppShell();
  installPublicFooter();
  new MutationObserver((mutations) =>
    mutations.forEach((mutation) =>
      mutation.addedNodes.forEach(
        (node) => node instanceof Element && installBrand(node),
      ),
    ),
  ).observe(document.documentElement, { childList: true, subtree: true });
})();
