(() => {
  const TOKEN_KEY = "taptrack_token";
  const token = localStorage.getItem(TOKEN_KEY);
  const staffLink = document.querySelector("#staffPortalLink");

  if (!token || !staffLink) return;

  const firstAvailablePage = (user) => {
    if (user.overviewAccess) return "/overview";
    if (user.attendanceAccess) return "/attendance";
    if (user.specialEventsAccess) return "/events";
    if (user.libraryAccess) return "/library/entrance";
    if (user.maintenanceAccess) return "/maintenance/student";
    if (user.usersAccess) return "/user/permissions";
    return null;
  };

  const sessionCheck = fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  })
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
      if (error.message === "401" || error.message === "403")
        localStorage.removeItem(TOKEN_KEY);
    });

  staffLink.addEventListener("click", async (event) => {
    if (staffLink.getAttribute("href") !== "/login") return;
    event.preventDefault();
    await sessionCheck;
    location.href = staffLink.getAttribute("href");
  });
})();
