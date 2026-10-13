const assert = require('node:assert/strict');
(async()=>{
  const base = 'http://127.0.0.1:5179';
  for (const path of ['/', '/styles.css', '/app.js', '/ai-ui.js', '/assets/venue-search.js']) {
    assert.equal((await fetch(base+path)).status,200,path);
  }
  for (const path of ['/admin.html','/login.html','/data/db.json','/.env','/server.js']) {
    assert.equal((await fetch(base+path)).status,404,path);
  }
  for (const path of ['/api/state','/api/login','/api/ai/records','/api/ai/extract']) {
    assert.equal((await fetch(base+path,{method:'POST',body:'{}'})).status,404,path);
  }
  const state = await (await fetch(base+'/api/state')).json();
  assert.ok(state.venues.length);
  assert.ok(state.viewRecords.every(r=>r.status==='已发布'));
  assert.equal(state.xhsDrafts.length,0);
  const result = await fetch(base+'/api/ai/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({venueId:state.venues[0].id,text:'想选无遮挡的座区'})});
  assert.equal(result.status,200);
  console.log('PASS: frontend assets, published data, recommendations, blocked administration and writes.');
})().catch(error=>{console.error(error);process.exitCode=1;});
