const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname);
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, "data"));
const dbPath = path.join(dataDir, "db.json");
const port = Number(process.env.PORT || 5178);
const host = process.env.HOST || "0.0.0.0";
const adminPassword = process.env.ADMIN_PASSWORD || "seatview-admin";
const sessionCookie = "seatview_admin_session";
const sessions = new Set();

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

function ensureDb() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({
      venues: null,
      seatMaps: [],
      sections: [],
      viewRecords: [],
      xhsDrafts: []
    }, null, 2), "utf8");
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 30 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").map((item) => {
    const [key, ...value] = item.trim().split("=");
    return [key, decodeURIComponent(value.join("=") || "")];
  }).filter(([key]) => key));
}

function isAdminAuthenticated(req) {
  const token = parseCookies(req)[sessionCookie];
  return !!token && sessions.has(token);
}

function setSessionCookie(req, res, token) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const secure = forwardedProto === "https" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${sessionCookie}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${sessionCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function redirectToLogin(res) {
  res.writeHead(302, { Location: "/login.html" });
  res.end();
}

function safeStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath === "/" ? "/index.html" : urlPath);
  const target = path.resolve(root, decoded.replace(/^\/+/, ""));
  if (!target.toLowerCase().startsWith(root.toLowerCase())) return null;
  return target;
}

ensureDb();

function getLanUrls() {
  const interfaces = os.networkInterfaces();
  return Object.values(interfaces)
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => `http://${item.address}:${port}/`);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/login" && req.method === "POST") {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      if (payload.password !== adminPassword) {
        sendJson(res, 401, { ok: false, error: "密码不正确" });
        return;
      }
      const token = crypto.randomBytes(32).toString("hex");
      sessions.add(token);
      setSessionCookie(req, res, token);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/logout" && req.method === "POST") {
      const token = parseCookies(req)[sessionCookie];
      if (token) sessions.delete(token);
      clearSessionCookie(res);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/auth" && req.method === "GET") {
      sendJson(res, 200, { authenticated: isAdminAuthenticated(req) });
      return;
    }

    if (url.pathname === "/api/state" && req.method === "GET") {
      ensureDb();
      sendJson(res, 200, JSON.parse(fs.readFileSync(dbPath, "utf8")));
      return;
    }

    if (url.pathname === "/api/state" && req.method === "POST") {
      if (!isAdminAuthenticated(req)) {
        sendJson(res, 401, { ok: false, error: "请先登录后台" });
        return;
      }
      ensureDb();
      const body = await readBody(req);
      const state = JSON.parse(body || "{}");
      fs.writeFileSync(dbPath, JSON.stringify(state, null, 2), "utf8");
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/admin.html" && !isAdminAuthenticated(req)) {
      redirectToLogin(res);
      return;
    }

    const filePath = safeStaticPath(url.pathname);
    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": mime[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
});

server.listen(port, host, () => {
  const lanUrls = getLanUrls();
  console.log(`SeatView running at http://127.0.0.1:${port}/`);
  console.log(`Admin running at http://127.0.0.1:${port}/admin.html`);
  if (lanUrls.length) {
    console.log("Phone/LAN access:");
    lanUrls.forEach((url) => console.log(`- ${url}`));
    console.log(`Admin on phone/LAN: ${lanUrls[0]}admin.html`);
  }
});
