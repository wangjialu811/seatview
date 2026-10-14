const prompts = require('./prompts');
const aiConfig = require('./aiConfig');
const proxyFetch = require('./proxyFetch');
const fields = require('../assets/view-fields');

class AIRequestError extends Error {
  constructor(message) { super(message); this.name = 'AIRequestError'; }
}

function parseModelJson(content) {
  if (typeof content !== 'string' || !content.trim()) {
    throw new AIRequestError('模型返回了空内容');
  }
  // Some compatible providers wrap valid JSON even when JSON mode is requested.
  const clean = content.trim().replace(/^﻿/, '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(clean); }
  catch { throw new AIRequestError('模型返回的内容不是有效 JSON'); }
}

async function call(prompt, data, image = null) {
  const config = aiConfig();
  let endpoint;
  try {
    endpoint = new URL(config.baseUrl + '/chat/completions');
    if (!['http:', 'https:'].includes(endpoint.protocol)) throw Error('protocol');
  } catch { throw new AIRequestError('AI 接口地址格式错误，请检查 BASE_URL'); }
  const body = {
    model: config.model,
    max_tokens: 1800,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: prompt }, { role: 'user', content: image ? [{type:'text',text:JSON.stringify(data)},{type:'image_url',image_url:{url:image}}] : JSON.stringify(data) }]
  };
  // Ling 3.1 Flash does not support response_format (OpenRouter model specs).
  // Strict JSON parsing and business validation still run after generation.
  if (/^inclusionai\/ling-3\.1-flash(?::free)?$/.test(config.model)) {
    delete body.response_format;
    body.reasoning = { enabled: false };
  }
  const request = () => {
    const options = {
    method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { Authorization: 'Bearer ' + config.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
    };
    const proxy = process.env.AI_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    return proxy ? proxyFetch(endpoint, options, proxy) : fetch(endpoint, options);
  };
  let response;
  try {
    response = await request();
    if (!response.ok) {
      const errorBody = await response.text();
      // Retry only when a provider explicitly rejects JSON mode. Keep schema
      // validation below even when the format parameter is unavailable.
      if ([400, 422].includes(response.status) && /response_format|json_object|structured[-_ ]outputs/i.test(errorBody) && /support|unsupported|not available|invalid/i.test(errorBody)) {
        delete body.response_format;
        response = await request();
      }
    }
    if (!response.ok) {
      const explanation = ({401:'Key 无效或接口与 Key 不匹配',403:'访问被拒绝',402:'账户余额不足',404:'模型或接口不存在',429:'请求限流或额度不足'})[response.status] || '上游服务请求失败';
      throw new AIRequestError(config.provider + ' HTTP ' + response.status + '：' + explanation);
    }
    const result = await response.json();
    if (result.error) throw new AIRequestError('上游返回错误响应');
    if (result.choices?.[0]?.finish_reason === 'length') throw new AIRequestError('模型输出被截断，请重试或调整模型');
    return parseModelJson(result.choices?.[0]?.message?.content);
  } catch (error) {
    if (error instanceof AIRequestError) throw error;
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new AIRequestError('AI 请求超时（30秒）');
    const code = error.cause?.code || error.code;
    if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') throw new AIRequestError('连接 AI 服务超时，请检查网络或 AI_PROXY_URL 代理配置');
    if (code === 'AI_PROXY_CONNECT_FAILED') throw new AIRequestError('代理拒绝连接，请检查代理端口或鉴权');
    if (code === 'AI_PROXY_INVALID' || error.code === 'ERR_INVALID_URL') throw new AIRequestError('AI 代理地址格式错误');
    throw new AIRequestError('无法连接 AI 服务或接口响应格式异常，请检查网络与代理配置');
  }
}

async function run(real, mock) {
  if (process.env.AI_MODE === 'mock' || !aiConfig().apiKey) {
    return { data: mock(), mode: 'mock', warning: 'Mock 模式：本地规则演示，非真实大模型结果。' };
  }
  try { return { data: await real(), mode: 'live' }; }
  catch (error) {
    const reason = error instanceof AIRequestError ? error.message : 'AI 返回字段不符合约定或推荐超出已有数据范围';
    // Never expose upstream response bodies, credentials, or prompts in errors.
    return { data: mock(), mode: 'fallback', warning: 'AI 调用失败（' + reason + '），已降级为本地规则，可重试。' };
  }
}
exports.extract = (text, venues, image = null) => {
  const details = fields.seatDetails(text);
  const mock = () => {
    const venue = venues.find(v=>text.includes(v.name) || (v.id==='nanjing-olympic-stadium' && text.includes('南京奥体中心体育场')));
    const d = {...details,venueName:venue?.name || null,summary:text || '图片信息待人工确认',tags:[],confidence:text ? 0.65 : 0};
    d.stageDistance = fields.normalize('stageDistance', text);
    d.viewingAngle = fields.normalize('viewingAngle', text);
    d.obstruction = fields.normalize('obstruction', text);
    d.shootingFriendly = fields.normalize('shootingFriendly', text);
    d.tags = [d.stageDistance && /近/.test(d.stageDistance)?'近舞台':null,d.viewingAngle==='侧面'?'侧视角':null,d.obstruction && /无遮挡/.test(d.obstruction)?'无遮挡':null,d.shootingFriendly && /^(非常|比较)适合$/.test(d.shootingFriendly)?'适合拍摄':null].filter(Boolean);
    return d;
  };
  return run(async()=>{
    const parsed = await call(prompts.extract,{text,venues:venues.map(v=>v.name)},image);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('格式错误');
    const d = fields.normalizeRecord(parsed);
    for (const field of ['venueName','section','row','seatNo','summary']) d[field] = typeof parsed[field]==='string' ? parsed[field].trim() || null : null;
    d.row ||= details.row;
    d.seatNo ||= details.seatNo;
    // A model sometimes puts a complete seat description in section. Separate it.
    const location = fields.seatDetails(d.section || '');
    if (location.row || location.seatNo) {
      d.section = location.section;
      d.row ||= location.row; d.seatNo ||= location.seatNo;
    }
    d.summary ||= text || '图片信息待人工确认';
    d.tags = Array.isArray(parsed.tags) ? parsed.tags.filter(t=>typeof t==='string') : [];
    d.confidence = Number.isFinite(parsed.confidence) ? Math.max(0,Math.min(1,parsed.confidence)) : 0;
    return d;
  },mock);
};
exports.recommend = async (text, records) => {
 const local={photography:/不拍|不.*拍照/.test(text)?false:/拍摄|拍照|直拍|录像/.test(text),front:/正面/.test(text),near:/近|前排/.test(text),unobstructed:/无遮挡/.test(text),extension:/延伸台/.test(text)};
 const score=(record,p)=>{const r=fields.normalizeRecord(record);return (p.photography&&['非常适合','比较适合'].includes(r.shootingFriendly)?3:0)+(p.front&&['正面','偏正面'].includes(r.viewingAngle)?3:0)+(p.near&&['非常近','较近','近'].includes(r.stageDistance)?2:0)+(p.unobstructed&&['完全无遮挡','基本无遮挡'].includes(r.obstruction)?3:0)+(p.extension&&r.tags?.includes('近延伸台')?3:0);};
 const rank=p=>records.map(r=>fields.normalizeRecord(r)).sort((a,b)=>score(b,p)-score(a,p));
 const mock=()=>{const list=rank(local);return {preferences:local,primary:list[0]?{recordId:list[0].id,score:4}:null,alternatives:list.slice(1,3).map(r=>({recordId:r.id,score:3}))};};
 const result=await run(async()=>{const p=await call(prompts.preferences,{text});if(!p||!['photography','front','near','unobstructed','extension'].every(k=>p[k]===null||typeof p[k]==='boolean')) throw Error('偏好格式'); const candidates=rank(p).slice(0,12);const d=await call(prompts.recommend,{text,preferences:p,records:candidates});if(!d.primary||!Array.isArray(d.alternatives)||d.alternatives.length>2)throw Error('格式');const picks=[d.primary,...d.alternatives];if(new Set(picks.map(x=>x.recordId)).size!==picks.length||picks.some(x=>!candidates.some(r=>r.id===x.recordId)||!Number.isInteger(x.score)||x.score<1||x.score>5))throw Error('越界');return {...d,preferences:p};},mock);
 const enrich=x=>{if(!x)return null;const r=fields.normalizeRecord(records.find(r=>r.id===x.recordId));return {recordId:r.id,sectionId:r.sectionId,section:r.section,score:x.score,reasons:Object.entries({stageDistance:'舞台距离',viewingAngle:'观看角度',obstruction:'遮挡',shootingFriendly:'拍摄友好度'}).filter(([k])=>r[k]).map(([k,v])=>`${v}：${r[k]}`).concat((r.tags||[]).map(t=>'已有标签：'+t)),disadvantages:[/侧|后/.test(r.viewingAngle||'')?'观看角度：'+r.viewingAngle:null,/远/.test(r.stageDistance||'')?'距离舞台：'+r.stageDistance:null,r.obstruction && !/无遮挡/.test(r.obstruction)?r.obstruction:null].filter(Boolean),source:r.source||r.sourcePlatform||'来源待补充'};};
 result.data={preferences:result.data.preferences,primary:enrich(result.data.primary),alternatives:result.data.alternatives.map(enrich),notice:'推荐仅基于当前场馆已有已发布座区信息，数据量有限；部分为 Demo 示例。舞台布局和前排观众可能改变体验。'};return result;
};
