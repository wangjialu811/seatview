const assert=require('node:assert/strict');const fs=require('fs');const os=require('os');const path=require('path');const {spawn}=require('child_process');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seatview-test-'));
 const venues=[{id:'nanjing-olympic-stadium',name:'南京奥体中心体育场',status:'已发布'},{id:'beijing-workers-stadium',name:'北京工人体育场',status:'已发布'},{id:'beijing-birdnest',name:'鸟巢',status:'已发布'}];
 const sections=['A3','B1','C2'].map(name=>({id:name,name,venueId:venues[0].id})).concat({id:'552',name:'552',venueId:venues[2].id});
 const viewRecords=sections.map(s=>({id:'r-'+s.id,venueId:s.venueId,sectionId:s.id,status:'已发布',tags:s.id==='A3'?['近延伸台']:[],shootingFriendly:s.id==='A3'?'较好':null,viewingAngle:s.id==='B1'?'正面':'侧面',obstruction:'无遮挡',imageUrl:'data:image/png;base64,AAAA',image:'data:image/png;base64,AAAA'}));
 viewRecords.push({id:'draft',venueId:venues[0].id,sectionId:'A3',status:'草稿',imageUrl:'data:image/png;base64,AAAA'});
 fs.writeFileSync(path.join(dir,'db.json'),JSON.stringify({venues,sections,viewRecords,seatMaps:[],xhsDrafts:[]}));
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'5181',HOST:'127.0.0.1',DATA_DIR:dir,AI_MODE:'mock',ADMIN_PASSWORD:'test-password'},stdio:'pipe'});
 const base='http://127.0.0.1:5181';let cookie='';const post=async(route,p)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(p)});return [r,await r.json()];};
 try{
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('server exited '+code)));});
 for(const route of ['/','/login.html','/app.js','/ai-ui.js','/styles.css','/assets/nanjing-demo-map.svg','/assets/venue-search.js'])assert.equal((await fetch(base+route)).status,200,route);
 for(const route of ['/.env.example','/server.js','/services/aiService.js','/data/db.json','/package.json'])assert.equal((await fetch(base+route)).status,404,route);
 assert.equal((await fetch(base+'/admin.html',{redirect:'manual'})).status,302);
 assert.equal((await post('/api/ai/extract',{text:'A3'}))[0].status,401);
 const publicState=await (await fetch(base+'/api/public-state')).json();
 assert.equal(publicState.viewRecords.length,4);assert.ok(publicState.viewRecords.every(r=>r.imageUrl.startsWith('/api/media/')));
 assert.ok(!JSON.stringify(publicState).includes('base64'));assert.equal((await fetch(base+publicState.viewRecords[0].imageUrl)).status,200);
 assert.equal((await fetch(base+'/api/media/record/draft')).status,404);
 let [r]=await post('/api/login',{password:'test-password'});cookie=r.headers.get('set-cookie').split(';')[0];assert.equal(r.status,200);
 assert.equal((await fetch(base+'/admin.html',{headers:{Cookie:cookie}})).status,200);
 assert.equal((await post('/api/ai/extract',{text:''}))[0].status,400);
 let [,parsed]=await post('/api/ai/extract',{text:'南京奥体中心体育场 A3 区，离主舞台挺近，但是只能看侧面，前面没有明显遮挡，手机拍摄还可以。'});assert.equal(parsed.mode,'mock');assert.equal(parsed.data.section,'A3');assert.equal(parsed.data.obstruction,'无明显遮挡');
 let [,rec]=await post('/api/ai/recommend',{venueId:'nanjing-olympic-stadium',text:'近延伸台，想拍直拍，无遮挡'});assert.equal(rec.data.primary.section,'A3');assert.equal(rec.data.alternatives.length,2);
 [,rec]=await post('/api/ai/recommend',{venueId:'nanjing-olympic-stadium',text:'我不拍照，只想正面看舞台'});assert.equal(rec.data.primary.section,'B1');
 [,rec]=await post('/api/ai/recommend',{venueId:'beijing-workers-stadium',text:'正面'});assert.equal(rec.data.primary,null);
 [,rec]=await post('/api/ai/recommend',{venueId:'beijing-birdnest',text:'正面'});assert.equal(rec.data.alternatives.length,0);
 const before=await (await fetch(base+'/api/state')).json();
 const [,saved]=await post('/api/ai/records',{...parsed.data,venueId:'nanjing-olympic-stadium',section:'TEST9',source:'自动测试',image:''});assert.ok(saved.record.id);const after=await (await fetch(base+'/api/state')).json();assert.equal(after.viewRecords.length,before.viewRecords.length+1);assert.equal(after.viewRecords.at(-1).status,'已发布');
 assert.equal((await post('/api/state',before))[0].status,200);assert.equal((await (await fetch(base+'/api/state')).json()).viewRecords.length,before.viewRecords.length);
 const ai=require('../services/aiService');process.env.AI_MODE='auto';process.env.OPENAI_API_KEY='test-placeholder';const originalFetch=global.fetch;global.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:'not-json'}}]})});assert.equal((await ai.extract('A3',before.venues)).mode,'fallback');global.fetch=async()=>{throw Error('network')};assert.equal((await ai.extract('A3',before.venues)).mode,'fallback');global.fetch=originalFetch;
 console.log('PASS: routes, static privacy, auth, Mock extraction, grounded recommendations, zero/one section, persistence, legacy state API, malformed JSON/network fallback.');
 }finally{child.kill();await new Promise(resolve=>child.once('exit',resolve));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
