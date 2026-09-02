const TOKEN_KEY = "taptrack_token";
async function request(url, body) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to continue.");
  return data;
}
const error = document.querySelector("#authError");
const hashToken = new URLSearchParams(location.hash.slice(1)).get("sso_token");
if (hashToken) {
  localStorage.setItem(TOKEN_KEY, hashToken);
  history.replaceState(null, "", "/login");
  location.replace("/overview");
}
const googleError = new URLSearchParams(location.search).get("google_error");
if (googleError) {
  error.textContent = googleError;
  history.replaceState(null, "", "/login");
}
request("/api/auth/google/status")
  .then(({ enabled }) => {
    document.querySelector("#googleDivider").hidden = !enabled;
    document.querySelector("#googleSignIn").hidden = !enabled;
    const note = document.querySelector("#googleNote");
    if (note) note.hidden = !enabled;
  })
  .catch(() => {});
document
  .querySelector("#passwordToggle")
  ?.addEventListener("click", (event) => {
    const password = document.querySelector("#password");
    const showing = password.type === "text";
    password.type = showing ? "password" : "text";
    event.currentTarget.setAttribute("aria-pressed", String(!showing));
    event.currentTarget.setAttribute(
      "aria-label",
      showing ? "Show password" : "Hide password",
    );
  });
document
  .querySelector("#loginForm")
  ?.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    try {
      const session = await request("/api/auth/login", {
        username: document.querySelector("#username").value,
        password: document.querySelector("#password").value,
      });
      localStorage.setItem(TOKEN_KEY, session.token);
      location.href = "/overview";
    } catch (failure) {
      error.textContent = failure.message;
    }
  });
document
  .querySelector("#setupForm")
  ?.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    try {
      const session = await request("/api/auth/setup", {
        firstName: document.querySelector("#firstName").value,
        middleName: document.querySelector("#middleName").value,
        lastName: document.querySelector("#lastName").value,
        username: document.querySelector("#username").value,
        password: document.querySelector("#password").value,
      });
      localStorage.setItem(TOKEN_KEY, session.token);
      location.href = "/overview";
    } catch (failure) {
      error.textContent = failure.message;
    }
  });
if (document.querySelector("#setupForm"))
  request("/api/auth/setup-status")
    .then((status) => {
      if (!status.required) location.href = "/login";
    })
    .catch((failure) => (error.textContent = failure.message));
