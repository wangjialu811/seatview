// Public mobile entry point: frontend reads and recommendations only.
// Administration remains on the local website.
const http = require('node:http');
const upstream = 'http://127.0.0.1:5178';
const port = Number(process.env.MOBILE_PORT || 5179);
http.createServer(async (req, res) => {
  const pathname = new URL(req.url, upstream).pathname;
  const publicRead = req.method === 'GET' && (
    ['/', '/index.html', '/styles.css', '/app.js', '/ai-ui.js', '/api/state','/api/public-state'].includes(pathname) || pathname.startsWith('/api/media/') ||
    pathname.startsWith('/assets/') || /^\/[^/]+\.(jpg|jpeg|png|webp)$/i.test(pathname)
  );
  const recommendation = req.method === 'POST' && pathname === '/api/ai/recommend';
  if (!publicRead && !recommendation) {
    res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
    return res.end('此链接仅提供前台浏览。');
  }
  try {
    let body;
    if (recommendation) {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 20000) {res.writeHead(413); return res.end();}
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks);
    }
    const response = await fetch(upstream+req.url, {
      method:req.method, body,
      headers:recommendation?{'Content-Type':'application/json'}:{},
      signal:AbortSignal.timeout(65000)
    });
    res.writeHead(response.status, {
      'Content-Type':response.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'
    });
    if (pathname === '/api/state' && response.ok) {
      const state = await response.json();
      state.venues = (state.venues || []).filter(v=>v.status !== '已下架');
      const ids = new Set(state.venues.map(v=>v.id));
      state.sections = (state.sections || []).filter(s=>ids.has(s.venueId));
      state.seatMaps = (state.seatMaps || []).filter(s=>ids.has(s.venueId));
      state.viewRecords = (state.viewRecords || []).filter(r=>r.status==='已发布' && ids.has(r.venueId));
      state.xhsDrafts = [];
      return res.end(JSON.stringify(state));
    }
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    if (!res.headersSent) res.writeHead(502, {'Content-Type':'text/plain; charset=utf-8'});
    res.end('网站服务暂不可用，请确认电脑上的 SeatView 服务正在运行。');
  }
}).listen(port, '127.0.0.1', ()=>console.log('Mobile frontend gateway: http://127.0.0.1:'+port));
