const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const fields = require('../assets/view-fields');
const ai = require('../services/aiService');

(async()=>{
  assert.deepEqual(fields.options.stageDistance,['非常近','较近','近','正常','较远','远','非常远']);
  assert.equal(fields.normalize('stageDistance','离舞台特别近'),'非常近');
  assert.equal(fields.normalize('viewingAngle','视线略微偏向舞台一侧'),'偏正面');
  assert.equal(fields.normalize('obstruction','有少量设备挡住视线'),'轻微遮挡');
  assert.equal(fields.normalize('shootingFriendly','适合拍摄直拍视频'),'比较适合');
  assert.equal(fields.normalize('shootingFriendly','较好'),'比较适合');
  assert.equal(fields.normalize('viewingAngle','神奇角度'),null);
  for (const seat of ['12排8座','A区5排16号','内场B3区10排6座']) {
    assert.equal(fields.seatDetails(seat).seatNo,seat);
    assert.ok(!fields.seatDetails(seat).section?.includes('排'));
  }
  assert.equal(fields.seatDetails('552区，无遮挡').seatNo,null);
  process.env.AI_MODE='mock';
  const mock=await ai.extract('内场B3区10排6座，舞台特别近，正面，无遮挡，适合拍摄直拍视频',[]);
  assert.equal(mock.data.seatNo,'内场B3区10排6座');
  assert.equal(mock.data.stageDistance,'非常近');
  assert.equal(mock.data.obstruction,'完全无遮挡');
  for(const field of Object.keys(fields.options)) assert.ok(mock.data[field]===null || fields.options[field].includes(mock.data[field]));
  const records=[{id:'old',sectionId:'s1',section:'A3',stageDistance:'近',viewingAngle:'正',obstruction:'无',shootingFriendly:'较好',tags:[]},{id:'standard',sectionId:'s2',section:'B1',stageDistance:'远',viewingAngle:'后方',obstruction:'严重遮挡',shootingFriendly:'不适合',tags:[]}];
  assert.equal((await ai.recommend('拍照、近舞台、正面、无遮挡',records)).data.primary.recordId,'old');
  const originalFetch=global.fetch;
  process.env.AI_MODE='auto';process.env.OPENAI_API_KEY='test-only-key';
  delete process.env.AI_PROXY_URL;delete process.env.HTTPS_PROXY;delete process.env.HTTP_PROXY;
  let receivedImage=false;
  global.fetch=async(url,options)=>{
    const payload=JSON.parse(options.body);receivedImage=payload.messages[1].content[1].type==='image_url';
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({section:'内场B3区10排6座',stageDistance:'特别近',viewingAngle:'怪异描述',obstruction:'少量遮挡',shootingFriendly:'适合直拍',tags:null,confidence:null})}}]})};
  };
  const result=await ai.extract('',[],'data:image/png;base64,AAAA');
  assert.equal(result.mode,'live');assert.equal(receivedImage,true);
  assert.equal(result.data.stageDistance,'非常近');assert.equal(result.data.viewingAngle,null);
  assert.equal(result.data.section,'内场B3');assert.equal(result.data.row,'10排');assert.equal(result.data.seatNo,'内场B3区10排6座');
  assert.deepEqual(result.data.tags,[]);
  global.fetch=originalFetch;

  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seatview-fields-'));
  const original={venues:[{id:'v',name:'测试场馆',status:'已发布'}],sections:[{id:'s',name:'552区',venueId:'v'}],seatMaps:[],viewRecords:[{id:'old',venueId:'v',sectionId:'s',viewingAngle:'未知历史角度',obstruction:'无',status:'已发布'}],xhsDrafts:[]};
  fs.writeFileSync(path.join(dir,'db.json'),JSON.stringify(original));
  const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'5183',HOST:'127.0.0.1',DATA_DIR:dir,AI_MODE:'mock',ADMIN_PASSWORD:'fields-test'},stdio:'pipe'});
  let cookie='';
  const post=async(route,data)=>{
    const response=await fetch('http://127.0.0.1:5183'+route,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')};
  };
  try {
    await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);});
    cookie=(await post('/api/login',{password:'fields-test'})).cookie.split(';')[0];
    assert.equal((await post('/api/state',original)).status,200);
    const payload={venueId:'v',section:'A区',row:'5排',seatNo:'A区5排16号',summary:'测试',tags:[],stageDistance:'特别近',viewingAngle:'正',obstruction:'无',shootingFriendly:'较好'};
    const saved=await post('/api/ai/records',payload);
    assert.equal(saved.status,201);assert.equal(saved.body.record.seatNo,payload.seatNo);
    assert.equal(saved.body.record.stageDistance,'非常近');assert.equal(saved.body.record.viewingAngle,'正面');
    const state=await (await fetch('http://127.0.0.1:5183/api/state')).json();
    assert.equal(state.viewRecords[0].viewingAngle,'未知历史角度');
    assert.equal(state.viewRecords.at(-1).seatNo,payload.seatNo);
    assert.equal((await post('/api/ai/records',{...payload,viewingAngle:'新建非法值'})).status,400);
    assert.equal((await post('/api/state',{...state,viewRecords:[...state.viewRecords,{id:'bad',viewingAngle:'非法值'}]})).status,400);
    assert.equal((await post('/api/ai/extract',{text:'552区无遮挡'})).body.data.seatNo,null);
    assert.equal((await post('/api/ai/extract',{text:'',image:'data:image/png;base64,AAAA'})).body.data.seatNo,null);
    assert.equal((await post('/api/ai/extract',{text:'',image:'https://example.com/image.jpg'})).status,400);
    console.log('PASS: shared enums, legacy normalization, unknown values, all seat examples, image request, incomplete AI output, recommendation compatibility, API validation, persistence and historical retention.');
  } finally {
    const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;
    if(path.dirname(dir)!==path.resolve(os.tmpdir()) || !path.basename(dir).startsWith('seatview-fields-')) throw Error('Unsafe temporary directory');
    fs.rmSync(dir,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
