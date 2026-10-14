require('./services/env');
const ai = require('./services/aiService');
const viewFields = require('./assets/view-fields');
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
    const seedPath = path.join(root, 'data', 'db.json');
    if (seedPath !== dbPath && fs.existsSync(seedPath)) { fs.copyFileSync(seedPath,dbPath); return; }
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
  if (!target.toLowerCase().startsWith((root + path.sep).toLowerCase())) return null;
  const relative = path.relative(root, target).replace(/\\/g, '/');
  if (!['index.html','admin.html','login.html','app.js','ai-ui.js','styles.css','鸟巢.jpg','鸟巢-552.jpg','青岛国信.png'].includes(relative) && !relative.startsWith('assets/')) return null;
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

    if (url.pathname.startsWith('/api/ai/') && req.method === 'POST') {
      if (url.pathname !== '/api/ai/recommend' && !isAdminAuthenticated(req)) return sendJson(res,401,{error:'请先登录后台'});
      const payload = JSON.parse(await readBody(req) || '{}');
      const db = JSON.parse(fs.readFileSync(dbPath,'utf8'));
      if (url.pathname === '/api/ai/extract') {
        if (typeof payload.text !== 'string' || (!payload.text.trim() && !payload.image)) return sendJson(res,400,{error:'请输入观演描述或上传图片。'});
        if (payload.text.length > 5000) return sendJson(res,400,{error:'描述最多5000字'});
        if (payload.image && (typeof payload.image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(payload.image) || payload.image.length > 8*1024*1024)) return sendJson(res,400,{error:'请选择不超过 6 MB 的 PNG、JPG 或 WebP 图片。'});
        return sendJson(res,200,await ai.extract(payload.text,db.venues || [],payload.image || null));
      }
      if (url.pathname === '/api/ai/recommend') {
        const venue = db.venues?.find(v=>v.id===payload.venueId && v.status !== '已下架');
        if (!venue) return sendJson(res,404,{error:'场馆不存在'});
        if (typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length>5000) return sendJson(res,400,{error:'请输入选座需求（最多5000字）。'});
        const seen = new Set();
        const records = db.viewRecords.filter(r=>r.venueId===venue.id && r.status==='已发布').map(r=>({...r,section:db.sections.find(s=>s.id===r.sectionId && s.venueId===venue.id)?.name})).filter(r=>{if(!r.section || seen.has(r.sectionId))return false;seen.add(r.sectionId);return true;}).map(r=>({id:r.id,sectionId:r.sectionId,section:r.section,stageDistance:r.stageDistance||null,viewingAngle:r.viewingAngle||null,obstruction:r.obstruction||null,shootingFriendly:r.shootingFriendly||null,tags:r.tags||[],description:r.description||r.reviewText,source:r.source||r.sourcePlatform}));
        if (!records.length) return sendJson(res,200,{mode:'mock',data:{primary:null,alternatives:[],notice:'当前场馆暂无足够座区数据，暂时无法进行 AI 推荐。'}});
        return sendJson(res,200,await ai.recommend(payload.text,records));
      }
      if (url.pathname === '/api/ai/records') {
        const venue=db.venues?.find(v=>v.id===payload.venueId);
        if(!venue || typeof payload.section!=='string' || !payload.section.trim() || typeof payload.summary!=='string' || !payload.summary.trim()) return sendJson(res,400,{error:'请选择已有场馆，并填写座区及总结。'});
        if (!Array.isArray(payload.tags) || payload.tags.some(t=>typeof t!=='string')) return sendJson(res,400,{error:'标签格式错误'});
        for(const k of Object.keys(viewFields.options)) {
          if (payload[k] == null || payload[k] === '') { payload[k] = null; continue; }
          const value = viewFields.normalize(k,payload[k]);
          if (!value) return sendJson(res,400,{error:'请选择标准选项：'+k});
          payload[k] = value;
        }
        if(payload.source != null && typeof payload.source !== 'string') return sendJson(res,400,{error:'来源格式错误'});
        if(payload.row != null && typeof payload.row !== 'string') return sendJson(res,400,{error:'排数格式错误'});
        if(payload.seatNo != null && typeof payload.seatNo !== 'string') return sendJson(res,400,{error:'座位号格式错误'});
        if(payload.image && !/^data:image\/(png|jpeg|webp);base64,/.test(payload.image)) return sendJson(res,400,{error:'图片格式错误'});
        let section=db.sections.find(s=>s.venueId===venue.id && s.name===payload.section.trim());
        if(!section){section={id:crypto.randomUUID(),venueId:venue.id,name:payload.section.trim(),position:payload.viewingAngle||'',note:'AI解析后人工确认'};db.sections.push(section);}
        const record={id:crypto.randomUUID(),venueId:venue.id,venueName:venue.name,sectionId:section.id,section:section.name,row:payload.row || '',image:payload.image||'',imageUrl:payload.image||'',stageDistance:payload.stageDistance,viewingAngle:payload.viewingAngle,obstruction:payload.obstruction,shootingFriendly:payload.shootingFriendly,description:payload.summary,reviewText:payload.summary,rawDescription:payload.rawDescription||'',source:payload.source||'运营录入（AI辅助，人工确认）',sourcePlatform:payload.source||'运营录入（AI辅助，人工确认）',tags:payload.tags,createdAt:new Date().toISOString(),status:'已发布'};
        record.seatNo = payload.seatNo || '';
        db.viewRecords.push(record);fs.writeFileSync(dbPath,JSON.stringify(db,null,2));return sendJson(res,201,{ok:true,record});
      }
      return sendJson(res,404,{error:'接口不存在'});
    }
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

    if (url.pathname === "/api/public-state" && req.method === "GET") {
      ensureDb();
      const db=JSON.parse(fs.readFileSync(dbPath,'utf8'));
      const mediaUrl=(kind,item,value)=>value?.startsWith('data:image/') ? `/api/media/${kind}/${encodeURIComponent(item.id)}` : value || '';
      const venues=(db.venues || []).filter(v=>v.status!=='已下架').map(v=>({...v,coverImage:mediaUrl('venue',v,v.coverImage)}));
      const ids=new Set(venues.map(v=>v.id));
      const records=(db.viewRecords || []).filter(r=>r.status==='已发布' && ids.has(r.venueId)).map(r=>{const {image,rawDescription,...record}=r;return {...record,imageUrl:mediaUrl('record',r,r.imageUrl || image)};});
      return sendJson(res,200,{venues,sections:(db.sections || []).filter(s=>ids.has(s.venueId)),seatMaps:(db.seatMaps || []).filter(m=>ids.has(m.venueId)).map(m=>({...m,url:mediaUrl('map',m,m.url)})),viewRecords:records,xhsDrafts:[]});
    }

    if (url.pathname.startsWith('/api/media/') && req.method === 'GET') {
      ensureDb();
      const db=JSON.parse(fs.readFileSync(dbPath,'utf8'));
      const [,,,kind,id]=url.pathname.split('/');
      const item=({venue:db.venues,map:db.seatMaps,record:db.viewRecords}[kind] || []).find(item=>item.id===decodeURIComponent(id || ''));
      const venue=kind==='venue' ? item : db.venues?.find(v=>v.id===item?.venueId);
      const value=kind==='venue' ? item?.coverImage : kind==='map' ? item?.url : item?.imageUrl || item?.image;
      const match=value?.match(/^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/);
      if(!match || !venue || venue.status==='已下架' || (kind==='record' && item.status!=='已发布')) return sendJson(res,404,{error:'图片不存在'});
      res.writeHead(200,{'Content-Type':match[1],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      return res.end(Buffer.from(match[2],'base64'));
    }

    if (url.pathname === "/api/state" && req.method === "POST") {
      if (!isAdminAuthenticated(req)) {
        sendJson(res, 401, { ok: false, error: "请先登录后台" });
        return;
      }
      ensureDb();
      const body = await readBody(req);
      const state = JSON.parse(body || "{}");
      if (!['venues','seatMaps','sections','viewRecords','xhsDrafts'].every(k=>Array.isArray(state[k]))) return sendJson(res,400,{error:'数据结构错误，未保存'});
      const previousRecords = JSON.parse(fs.readFileSync(dbPath,'utf8')).viewRecords || [];
      for (const record of state.viewRecords) {
        if (!record || typeof record !== 'object') return sendJson(res,400,{error:'视角记录格式错误'});
        const previous = previousRecords.find(item=>item.id===record.id);
        for (const field of Object.keys(viewFields.options)) {
          const value = record[field];
          if (value == null || value === '' || (previous && value === previous[field])) continue;
          const normalized = viewFields.normalize(field,value);
          if (!normalized) return sendJson(res,400,{error:'请选择标准选项：'+field});
          record[field] = normalized;
        }
      }
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
    sendJson(res, error instanceof SyntaxError ? 400 : 500, { ok: false, error: error instanceof SyntaxError ? "请求 JSON 格式错误" : "请求失败，请稍后重试。" });
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
