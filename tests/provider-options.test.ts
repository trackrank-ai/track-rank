import {test} from 'node:test';import assert from 'node:assert/strict';import {assertProviderOptions,providerOptions} from '../src/server/provider-options';
test('provider catalog validates real engine-specific locations and languages, not plausible-looking strings',async()=>{
 await assertProviderOptions(['google'],'Seattle,Washington,United States','en');await assertProviderOptions(['chatgpt','google','gemini'],'United States','en');await assert.rejects(assertProviderOptions(['chatgpt'],'Seattle,Washington,United States','en'),/supported location/);await assert.rejects(assertProviderOptions(['google'],'Bullshit City','en'),/supported location/);await assert.rejects(assertProviderOptions(['google'],'United States','bullshit'),/supported language/);
});
test('search returns bounded canonical city choices and only common multi-engine languages/locations',async()=>{
 const google=await providerOptions(['google'],'Seattle');assert.ok(google.locations.includes('Seattle,Washington,United States'));assert.ok(google.locations.length<=61);assert.ok(google.languages.some(l=>l.code==='en'&&l.name==='English'));
 const mixed=await providerOptions(['chatgpt','google','gemini'],'Seattle');assert.ok(!mixed.locations.includes('Seattle,Washington,United States'));assert.ok(mixed.locations.includes('United States'));await assert.rejects(providerOptions(['google','google','google','google']),/supported engines/);
});
