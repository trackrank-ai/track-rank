"""Runs only against the isolated local Worker using a generated local fixture."""
import json, pathlib, requests, secrets, time, os
from urllib.parse import urlparse, parse_qs
base=os.environ.get('LOCAL_SMOKE_URL', 'http://localhost:3013').rstrip('/')
u=urlparse(base)
assert u.scheme == 'http' and u.hostname in ('localhost', '127.0.0.1', '::1'), 'Local HTTP only'
def client():
 s=requests.Session();s.headers.update({'Origin':base});return s
def check(response,status=200):
 assert response.status_code==status,(response.status_code,response.text[:500]);return response.json()
s=client()
health=check(s.get(base+'/api/health'))
assert health.get('local_auth') and health.get('signup_enabled'), 'Enable local signup bypass before running; no emails should be sent'
for path in ('/', '/login', '/app'):
 r=s.get(base+path);assert r.status_code==200 and '<html' in r.text.lower(),path
print('PASS: landing, login and app HTML served')
assert s.get(base+'/api/v1/organizations').status_code==401
suffix_id=str(time.time_ns())
fixture={'email':f'smoke-owner-{suffix_id}@example.test','password':secrets.token_urlsafe(24),'name':'Local smoke owner'}
account=check(s.post(base+'/api/auth/sign-up/email',json=fixture))
assert account.get('token') and s.cookies, 'Signup must create a cookie session without verification'
session=check(s.get(base+'/api/auth/get-session'));assert session['user']['email']==fixture['email']
check(s.post(base+'/api/auth/sign-out',json={}))
assert s.post(base+'/api/auth/sign-in/email',json={**fixture,'password':'incorrect-password'}).status_code==401
login=check(s.post(base+'/api/auth/sign-in/email',json=fixture));assert login.get('user'),login
print('PASS: fresh email signup, automatic session, wrong-password rejection, logout and login')
org=check(s.post(base+'/api/v1/organizations',json={'name':'HTTP integration org'}),201);oid=org['id'];suffix='?org='+oid
ws=check(s.get(base+'/api/v1/workspaces'+suffix));assert ws['workspaces'][0]['id']==org['workspace_id'];print('PASS: organization and automatic default workspace')
brand=check(s.post(base+'/api/v1/brands'+suffix,json={'name':'Local Test Brand','domain':'example.test','kind':'own'}),201)
prompt=check(s.post(base+'/api/v1/prompts'+suffix,json={'workspace_id':org['workspace_id'],'brand_id':brand['id'],'text':'Best local test brands?','engine':'google'}),201)
rows=check(s.get(base+'/api/v1/prompts'+suffix))['prompts'];assert rows[0]['mode']=='standard';assert rows[0]['engine']=='google';print('PASS: persisted brands and prompts with standard queue default')
settings=check(s.get(base+'/api/v1/settings'+suffix));assert settings['resolve_poisoned_results']==1
schedule=check(s.post(base+'/api/v1/schedules'+suffix,json={'prompt_id':prompt['id'],'preset':'mwf','days':[1,3,5],'local_time':'09:00','timezone':'America/Los_Angeles'}),201)
check(s.patch(base+'/api/v1/schedules/'+schedule['id']+suffix,json={'local_time':'10:30'}));print('PASS: clean SERPs default and editable paused timezone schedule')
# A second new account already has its own organization when it joins the invited team.
teammate=client()
member=check(teammate.post(base+'/api/auth/sign-up/email',json={'email':f'smoke-member-{suffix_id}@example.test','password':secrets.token_urlsafe(24),'name':'Local smoke teammate'}))
mid=member['user']['id']
private=check(teammate.post(base+'/api/v1/organizations',json={'name':'Teammate private org'}),201)
assert teammate.get(base+'/api/v1/workspaces'+suffix).status_code==403
inv=check(s.post(base+'/api/v1/invites'+suffix,json={'role':'member','email':member['user']['email']}),201)
assert inv['url'].startswith(base+'/app#invite=')
token=parse_qs(urlparse(inv['url']).fragment)['invite'][0]
preview=check(teammate.post(base+'/api/v1/invites/preview',json={'token':token}));assert preview['email_matches'] and preview['email_verified'];assert preview['signed_in_email']==member['user']['email']
assert s.post(base+'/api/v1/invites/accept',json={'token':token}).status_code==403
accepted=check(teammate.post(base+'/api/v1/invites/accept',json={'token':token}));assert accepted['org_id']==oid
assert len(check(teammate.get(base+'/api/v1/organizations'))['organizations'])==2
assert teammate.post(base+'/api/v1/invites/accept',json={'token':token}).status_code==404
assert teammate.post(base+'/api/v1/invites'+suffix,json={'role':'admin'}).status_code==403
check(s.patch(base+'/api/v1/members/'+mid+suffix,json={'role':'viewer'}))
check(teammate.get(base+'/api/v1/prompts'+suffix))
assert teammate.post(base+'/api/v1/brands'+suffix,json={'name':'Not allowed','kind':'own'}).status_code==403
check(s.delete(base+'/api/v1/members/'+mid+suffix))
assert teammate.get(base+'/api/v1/workspaces'+suffix).status_code==403
print('PASS: second-account team join, single-use invitation, organization isolation, viewer restrictions and member removal')
check(s.patch(base+'/api/v1/settings'+suffix,json={'resolve_poisoned_results':False}))
updated=check(s.get(base+'/api/v1/settings'+suffix));assert 'daily_run_limit' not in updated and updated['resolve_poisoned_results']==0
for path in ('/runs','/members','/invites','/keys','/brands','/prompts','/workspaces','/schedules'):
 check(s.get(base+'/api/v1'+path+suffix))
print('PASS: app data endpoints and persisted organization settings')
state={'base':base,'fixture':fixture,'org_id':oid,'prompt_id':prompt['id']}
state_path=pathlib.Path('.wrangler/local-smoke-state.json');state_path.write_text(json.dumps(state));state_path.chmod(0o600)
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
