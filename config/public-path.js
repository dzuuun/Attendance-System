const configured = String(process.env.PUBLIC_BASE_PATH || "/attendance-system")
  .trim()
  .replace(/^\/+|\/+$/g, "");

const basePath = configured ? `/${configured}` : "";
const cookiePath = basePath || "/";

function publicPath(value = "/") {
  const path = String(value || "/");
  if (!basePath || path.startsWith(`${basePath}/`) || path === basePath)
    return path;
  return `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
}

module.exports = { basePath, cookiePath, publicPath };
