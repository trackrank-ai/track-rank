import manifest from '../data/provider-options.json';
import {HttpError} from './types';
type Engine='chatgpt'|'gemini'|'google';
type Group={names:string[];supported:Set<string>};
let catalog:Promise<Record<string,Group>>|undefined;
function locations(){
 if(!catalog)catalog=(async()=>{
  const bytes=Uint8Array.from(atob(manifest.locations_gzip_base64),c=>c.charCodeAt(0));
  const raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json() as Record<string,string[]>;
  return Object.fromEntries(Object.entries(raw).map(([id,names])=>[id,{names,supported:new Set(names)}]));
 })();
 return catalog;
}
export async function assertProviderOptions(engines:Engine[],location:string,language:string){
 const groups=await locations();
 for(const engine of engines){
  const option=manifest.engines[engine];
  if(!option || !groups[option.location_group].supported.has(location))throw new HttpError(400,`Choose a supported location for ${engine}`);
  if(!option.languages.some(x=>x.code===language))throw new HttpError(400,`Choose a supported language for ${engine}`);
 }
}
export async function providerOptions(engines:Engine[],query='',selected='United States'){
 if(!engines.length || engines.length>3 || engines.some(e=>!Object.hasOwn(manifest.engines,e)))throw new HttpError(400,'Choose supported engines');
 const groups=await locations();const options=engines.map(e=>manifest.engines[e]);
 const smallest=options.reduce((a,b)=>a.location_count<b.location_count?a:b);
 const common=(name:string)=>options.every(o=>groups[o.location_group].supported.has(name));
 const tokens=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 const matches=groups[smallest.location_group].names.filter(name=>tokens.every(t=>name.toLocaleLowerCase().includes(t)) && common(name));
 const names=matches.slice(0,60);
 if(common(selected) && !names.includes(selected))names.unshift(selected);
 const languages=options[0].languages.filter(l=>options.every(o=>o.languages.some(x=>x.code===l.code)));
 return {locations:names,languages,matching_location_count:matches.length,selected_location_supported:common(selected),default_location:common('United States')?'United States':names[0],default_language:languages.some(x=>x.code==='en')?'en':languages[0]?.code,catalog_updated_at:manifest.fetched_at};
}
