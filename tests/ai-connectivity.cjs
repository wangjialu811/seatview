require('../services/env');
const config = require('../services/aiConfig')();
const ai = require('../services/aiService');
const fs = require('node:fs');

(async () => {
  console.log(JSON.stringify({provider:config.provider,model:config.model,mode:process.env.AI_MODE || 'auto',hasKey:!!config.apiKey,hasProxy:!!(process.env.AI_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY)}));
  const text = '国家体育场（鸟巢）552区第15排，正面观看，无遮挡，距离舞台较远，手机拍摄一般。';
  const base = `http://127.0.0.1:${process.env.PORT || 5178}`;
  let available = false;
  try { available = (await fetch(base+'/api/state', {signal:AbortSignal.timeout(3000)})).ok; } catch {}
  const start = Date.now();
  let result;
  if (available) {
    const login = await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:process.env.ADMIN_PASSWORD || 'seatview-admin'})});
    if (!login.ok) throw Error('网站后台测试登录失败：HTTP '+login.status);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const response = await fetch(base+'/api/ai/extract',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({text}),signal:AbortSignal.timeout(65000)});
    result = await response.json();
    console.log('Website API HTTP '+response.status);
  } else {
    console.log('Website not listening at '+base+'; testing configured AI service directly.');
    const db = JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../data/db.json'),'utf8'));
    result = await ai.extract(text,db.venues || []);
  }
  console.log(JSON.stringify({seconds:((Date.now()-start)/1000).toFixed(1),mode:result.mode,warning:result.warning || null,data:result.data},null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
