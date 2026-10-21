(() => {
  localStorage.removeItem("taptrack_token");
  const staffLink = document.querySelector("#staffPortalLink");
  if (!staffLink) return;

  const firstAvailablePage = (user) => {
    if (user.overviewAccess) return "/overview";
    if (user.attendanceAccess) return "/attendance";
    if (user.specialEventsAccess) return "/events";
    if (user.libraryAccess) return "/library/entrance";
    if (user.maintenanceAccess) {
      const routes = {
        cardEnrollment: "/maintenance/card-enrollment",
        students: "/maintenance/student",
        alumni: "/maintenance/alumni",
        employees: "/maintenance/employee",
        schools: "/maintenance/school",
        colleges: "/maintenance/college",
        departments: "/maintenance/department",
        employeeDepartments: "/maintenance/employee-department",
        programs: "/maintenance/program",
        sections: "/maintenance/sections",
        gates: "/maintenance/gates",
        kiosks: "/maintenance/kiosks",
        academicPeriods: "/maintenance/academic-periods",
        settings: "/maintenance/settings",
      };
      const maintenancePage = (user.maintenanceModules || [])
        .map((module) => routes[module])
        .find(Boolean);
      if (maintenancePage) return maintenancePage;
    }
    if (user.usersAccess) return "/user/permissions";
    return null;
  };

  const sessionCheck = fetch("/api/auth/me")
    .then(async (response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    })
    .then((user) => {
      const destination = firstAvailablePage(user);
      if (!destination) return;
      staffLink.href = destination;
      staffLink.querySelector(".staff-action-label").textContent =
        "Continue to staff portal";
    })
    .catch((error) => {
      return error;
    });

  staffLink.addEventListener("click", async (event) => {
    if (
      new URL(staffLink.href, location.href).pathname !==
      window.taptrackUrl("/login")
    )
      return;
    event.preventDefault();
    await sessionCheck;
    location.href = window.taptrackUrl(staffLink.getAttribute("href"));
  });
})();
