// External read-only monitor. A failed process triggers the configured automation alert.
// The owner token is read locally, never logged or passed on a command line.
import fs from 'node:fs';
const failures=[];
const root=new URL('../',import.meta.url);
const settings=JSON.parse(fs.readFileSync(new URL('.production-operations.local',root)));
try {
 const health=await fetch('https://trackrank.ai/api/health',{signal:AbortSignal.timeout(10000)});
 if(!health.ok || !(await health.json()).ok)failures.push('Public health check failed');
 const response=await fetch('https://trackrank.ai/api/operations/readiness',{signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+settings.OPERATIONS_TOKEN}});
 if(!response.ok)throw Error('Protected readiness returned HTTP '+response.status);
 const data=await response.json();
 const rollout=JSON.parse(fs.readFileSync(new URL('reports/billing-acceptance/production-operations.json',root)));
 const deployedAt=Date.parse(rollout.deployed_at||rollout.checked_at);
 if(!data.cron_succeeded_at && (!Number.isFinite(deployedAt)||Date.now()-deployedAt>15*60000))failures.push('No successful cron heartbeat observed within 15 minutes of rollout');
 else if(data.cron_succeeded_at && Date.now()-Number(data.cron_succeeded_at)>15*60000)failures.push('Successful cron heartbeat is over 15 minutes old');
 if(Number(data.queue?.uncertain)>0)failures.push('Provider submission outcome needs review');
 if(Number(data.queue?.stuck)>0)failures.push('Provider run has waited over 24 hours');
 if(Number(data.queue?.recent_failures)>0)failures.push('Provider runs failed in the last 15 minutes');
 if(Number(data.queue?.queued)>20 || (data.queue?.oldest_queued_at && Date.now()-Number(data.queue.oldest_queued_at)>30*60000))failures.push('Run queue backlog exceeded threshold');
 if(!data.stripe?.charges_enabled)failures.push('Stripe live charges unavailable');
 fs.writeFileSync(new URL('.production-monitor-state.local',root),JSON.stringify({checked_at:new Date().toISOString(),failures,queue:data.queue,cron_succeeded_at:data.cron_succeeded_at}),{mode:0o600});
}catch{failures.push('Production readiness request failed or timed out');}
if(failures.length){console.error('TrackRank production needs attention: '+failures.join('; '));process.exitCode=1;}
