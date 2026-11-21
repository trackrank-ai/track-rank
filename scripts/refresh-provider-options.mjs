// Free metadata only. Run with DataForSEO credentials injected through environment.
import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const login=process.env.DATA_FOR_SEO_LOGIN,password=process.env.DATA_FOR_SEO_PASSWORD;
if(!login||!password)throw Error('DataForSEO environment credentials required');
const endpoints={chatgpt:'ai_optimization/chat_gpt/llm_scraper',gemini:'ai_optimization/gemini/llm_scraper',google:'serp/google'};
const result={fetched_at:new Date().toISOString(),engines:{}};
await Promise.all(Object.entries(endpoints).map(async([engine,path])=>{
 const get=async(kind)=>{const r=await fetch(`https://api.dataforseo.com/v3/${path}/${kind}`,{headers:{Authorization:'Basic '+Buffer.from(login+':'+password).toString('base64')},signal:AbortSignal.timeout(60000)});const d=await r.json();if(!r.ok||d.status_code!==20000||d.tasks?.[0]?.status_code!==20000)throw Error(`Provider ${engine} ${kind} metadata unavailable`);return d.tasks[0].result;};
 const [locations,languages]=await Promise.all([get('locations'),get('languages')]);
 result.engines[engine]={locations:[...new Set(locations.map(x=>x.location_name))].sort(),languages:languages.map(x=>({code:x.language_code,name:x.language_name})).sort((a,b)=>a.name.localeCompare(b.name))};
}));
const groups={},engines={};
for(const [engine,options] of Object.entries(result.engines)){
 const id=createHash('sha256').update(JSON.stringify(options.locations)).digest('hex').slice(0,16);
 groups[id]=options.locations;engines[engine]={location_group:id,location_count:options.locations.length,languages:options.languages};
}
const manifest={fetched_at:result.fetched_at,engines,locations_gzip_base64:gzipSync(Buffer.from(JSON.stringify(groups)),{level:9}).toString('base64')};
fs.mkdirSync('src/data',{recursive:true});fs.writeFileSync('src/data/provider-options.json',JSON.stringify(manifest)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(result.engines).map(([k,v])=>[k,{locations:v.locations.length,languages:v.languages.length}]))));
