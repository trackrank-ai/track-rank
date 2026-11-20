"""Runs only against the isolated local Worker using a generated local fixture."""
import json, pathlib, requests
base='http://localhost:3013'
fixture=json.loads(pathlib.Path('.wrangler/auth-fixture.json').read_text())
s=requests.Session()
s.headers.update({'Origin':base})
def check(response,status=200):
 assert response.status_code==status,(response.status_code,response.text[:500]);return response.json()
check(s.get(base+'/api/health'))
login=check(s.post(base+'/api/auth/sign-in/email',json=fixture));assert login.get('user'),login
session=check(s.get(base+'/api/auth/get-session'));assert session['user']['email']==fixture['email'];print('PASS: Better Auth password login and persisted D1 session')
org=check(s.post(base+'/api/v1/organizations',json={'name':'HTTP integration org'}),201);oid=org['id'];suffix='?org='+oid
ws=check(s.get(base+'/api/v1/workspaces'+suffix));assert ws['workspaces'][0]['id']==org['workspace_id'];print('PASS: organization and automatic default workspace')
brand=check(s.post(base+'/api/v1/brands'+suffix,json={'name':'Local Test Brand','domain':'example.test','kind':'own'}),201)
prompt=check(s.post(base+'/api/v1/prompts'+suffix,json={'workspace_id':org['workspace_id'],'brand_id':brand['id'],'text':'Best local test brands?','engine':'google'}),201)
rows=check(s.get(base+'/api/v1/prompts'+suffix))['prompts'];assert rows[0]['mode']=='standard';assert rows[0]['engine']=='google';print('PASS: persisted brands and prompts with standard queue default')
settings=check(s.get(base+'/api/v1/settings'+suffix));assert settings['resolve_poisoned_results']==1
schedule=check(s.post(base+'/api/v1/schedules'+suffix,json={'prompt_id':prompt['id'],'preset':'mwf','days':[1,3,5],'local_time':'09:00','timezone':'America/Los_Angeles'}),201)
check(s.patch(base+'/api/v1/schedules/'+schedule['id']+suffix,json={'local_time':'10:30'}));print('PASS: clean SERPs default and editable paused timezone schedule')
key=check(s.post(base+'/api/v1/keys'+suffix,json={'name':'Smoke read only','scopes':['read']}),201)
a=requests.Session();a.headers.update({'Authorization':'Bearer '+key['key'],'Content-Type':'application/json','Accept':'application/json, text/event-stream'})
check(a.get(base+'/api/v1/workspaces'))
init=check(a.post(base+'/mcp',json={'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-03-26','capabilities':{},'clientInfo':{'name':'TrackRank local test','version':'1.0'}}}));assert init.get('result',{}).get('serverInfo',{}).get('name')=='trackrank',init
listed=check(a.post(base+'/mcp',json={'jsonrpc':'2.0','id':2,'method':'tools/list','params':{}}));names=[t['name'] for t in listed['result']['tools']];assert 'run_prompt' in names and 'get_context' in names
context=check(a.post(base+'/mcp',json={'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':'get_context','arguments':{}}}));assert not context['result'].get('isError'),context
print('PASS: organization API key, MCP initialize, tools/list and get_context')
assert a.post(base+'/api/v1/prompts/'+prompt['id']+'/run',json={}).status_code==403
check(s.delete(base+'/api/v1/keys/'+key['id']+suffix));assert a.get(base+'/api/v1/workspaces').status_code==401;print('PASS: read-only key enforcement and immediate revocation')
export=s.get(base+'/api/v1/export'+suffix);assert export.status_code==200 and 'text/csv' in export.headers['content-type']
check(s.post(base+'/api/auth/sign-out',json={}))
assert s.get(base+'/api/v1/organizations').status_code==401;print('PASS: CSV export and session logout')
print('All local HTTP integration checks passed. No provider calls or emails sent.')
