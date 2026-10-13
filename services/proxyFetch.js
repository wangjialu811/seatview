// Optional HTTP(S) CONNECT proxy for Node 18, which does not automatically use
// the desktop browser's proxy. TLS certificates are still verified normally.
const http = require('http');
const https = require('https');
const tls = require('tls');
module.exports = function proxyFetch(url, options, proxyAddress) {
  const proxy = new URL(proxyAddress);
  const target = new URL(url);
  if (!['http:', 'https:'].includes(proxy.protocol) || target.protocol !== 'https:') {
    return Promise.reject(Object.assign(new Error('Invalid AI proxy protocol'), {code:'AI_PROXY_INVALID'}));
  }
  return new Promise((resolve, reject) => {
    let tunnel, upstream, agent, settled = false;
    const cleanup = () => { options.signal?.removeEventListener('abort', abort); agent?.destroy(); tunnel?.destroy(); connect.destroy(); };
    const fail = error => { if (settled) return; settled = true; cleanup(); reject(error); };
    const abort = () => { upstream?.destroy(); fail(Object.assign(new Error('AI proxy timeout'), {name:'TimeoutError'})); };
    const headers = {Host:target.hostname + ':' + (target.port || 443)};
    if (proxy.username) headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(decodeURIComponent(proxy.username) + ':' + decodeURIComponent(proxy.password)).toString('base64');
    const connect = (proxy.protocol === 'https:' ? https : http).request({hostname:proxy.hostname,port:proxy.port || (proxy.protocol==='https:'?443:80),method:'CONNECT',path:headers.Host,headers});
    connect.on('error',fail);
    connect.on('response',()=>fail(Object.assign(new Error('Proxy did not establish a tunnel'),{code:'AI_PROXY_CONNECT_FAILED'})));
    connect.on('connect',(response,socket,head)=>{
      tunnel=socket;
      if(response.statusCode!==200){fail(Object.assign(new Error('Proxy rejected connection'),{code:'AI_PROXY_CONNECT_FAILED'}));return;}
      if(head.length)socket.unshift(head);
      agent=new https.Agent({keepAlive:false});
      agent.createConnection=()=>tls.connect({socket,servername:target.hostname});
      upstream=https.request(target,{method:options.method,headers:options.headers,agent},response=>{
        const chunks=[];let size=0;
        response.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){upstream.destroy();fail(new Error('AI response too large'));}else chunks.push(chunk);});
        response.on('error',fail);
        response.on('end',()=>{if(settled)return;settled=true;const body=Buffer.concat(chunks).toString('utf8');const status=response.statusCode;cleanup();resolve({ok:status>=200&&status<300,status,text:async()=>body,json:async()=>JSON.parse(body)});});
      });
      upstream.on('error',fail);
      upstream.end(options.body);
    });
    options.signal?.addEventListener('abort',abort,{once:true});
    if(options.signal?.aborted){abort();return;}
    connect.end();
  });
};
