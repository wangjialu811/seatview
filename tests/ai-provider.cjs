const assert = require('node:assert/strict');
const config = require('../services/aiConfig');
const ai = require('../services/aiService');
const names = ['AI_MODE','OPENAI_API_KEY','OPENAI_BASE_URL','OPENAI_MODEL','OPENROUTER_API_KEY','OPENROUTER_BASE_URL','OPENROUTER_MODEL'];
const saved = Object.fromEntries(names.map(k=>[k,process.env[k]]));
const originalFetch = global.fetch;
const content = {venueName:null,section:'A3',stageDistance:null,viewingAngle:null,obstruction:null,shootingFriendly:null,tags:[],summary:'测试',confidence:0.5};
const response = data => ({ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(data)},finish_reason:'stop'}]})});
(async()=>{
 try {
  for(const k of names) delete process.env[k];
  assert.equal(config().baseUrl,'https://api.openai.com/v1');
  process.env.OPENAI_API_KEY='test-only-key';
  process.env.OPENROUTER_BASE_URL='https://openrouter.ai/api/v1';
  process.env.OPENROUTER_MODEL='inclusionai/ling-3.1-flash';
  assert.equal(config().apiKey,'test-only-key');
  process.env.OPENROUTER_API_KEY='test-only-router-key';
  assert.equal(config().apiKey,'test-only-router-key');
  global.fetch=async(url,options)=>{
   assert.equal(String(url),'https://openrouter.ai/api/v1/chat/completions');
   assert.equal(options.headers.Authorization,'Bearer test-only-router-key');
   assert.equal(JSON.parse(options.body).model,'inclusionai/ling-3.1-flash');
   assert.equal(JSON.parse(options.body).response_format,undefined);
   assert.equal(JSON.parse(options.body).reasoning.enabled,false);
   return response(content);
  };
  assert.equal((await ai.extract('A3',[])).mode,'live');
  process.env.OPENROUTER_MODEL='test-provider/model';
  let calls=0;
  global.fetch=async(url,options)=>{calls++;if(calls===1)return {ok:false,status:400,text:async()=>'response_format json_object unsupported'};assert.equal(JSON.parse(options.body).response_format,undefined);return response(content);};
  assert.equal((await ai.extract('A3',[])).mode,'live');assert.equal(calls,2);
  global.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:'```json\n'+JSON.stringify(content)+'\n```'}}]})});
  assert.equal((await ai.extract('A3',[])).mode,'live');
  global.fetch=async()=>({ok:false,status:401,text:async()=>'secret upstream details'});
  const denied=await ai.extract('A3',[]);assert.equal(denied.mode,'fallback');assert.match(denied.warning,/401/);assert.ok(!denied.warning.includes('secret'));assert.ok(!denied.warning.includes(config().apiKey));
  const records=[{id:'r1',sectionId:'s1',section:'A3',tags:[]}];
  let turn=0;
  global.fetch=async()=>response(++turn===1?{photography:null,front:null,near:null,unobstructed:null,extension:null}:{primary:{recordId:'invented',score:5},alternatives:[]});
  assert.equal((await ai.recommend('正面',records)).mode,'fallback');
  console.log('PASS: OpenRouter config priority, legacy key compatibility, real request routing, JSON-mode retry, fenced JSON, sanitized HTTP errors, invented-section rejection.');
 } finally {global.fetch=originalFetch;for(const k of names){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
})().catch(error=>{console.error(error.message);process.exitCode=1;});

