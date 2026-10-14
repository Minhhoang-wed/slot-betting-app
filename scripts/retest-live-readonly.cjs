// Read-only comparison across a 130-second interval. Never creates/finalizes rounds.
const fs=require('node:fs'),assert=require('node:assert/strict');
const original=console.log;console.log=()=>{};
const {supabase}=require('../config/supabase.config');console.log=original;
const site='https://slot-betting-app.vercel.app';
async function get(route){const response=await fetch(site+route,{cache:'no-store',signal:AbortSignal.timeout(20000)});const body=await response.json();assert.equal(response.status,200);assert.equal(body.success,true,JSON.stringify(body));return {body,cacheControl:response.headers.get('cache-control')};}
async function snapshot(){
  const menus=(await get('/api/menus')).body.data;
  const history=await get('/api/game/history');
  const report=(await get('/api/reports/all-menus')).body.data;
  const {data,error}=await supabase.from('games').select('id,menu_id,round_number,status,next_round_id,finished_results,winners,slots(slot_number,player_name,shares)').in('menu_id',menus.map(m=>m.id));
  if(error)throw new Error(error.message);
  const slotCount=data.reduce((n,g)=>n+g.slots.filter(s=>s.player_name).length,0);
  assert.equal(report.grandTotalSlots,slotCount);
  assert.equal(history.body.data.length,data.filter(g=>g.status==='finished').length);
  const js=await (await fetch(site+'/js/app.js',{cache:'no-store',signal:AbortSignal.timeout(20000)})).text();
  assert.ok(js.includes('currentRoundReady()'),'Live JS does not contain latest round guard');
  return {time:new Date().toISOString(),menus:menus.length,games:data.length,slotCount,historyCount:history.body.data.length,buyCost:report.grandTotalBuyCost,savedResults:data.filter(g=>g.finished_results?.length).length,cacheControl:history.cacheControl,signature:data.map(g=>({...g,slots:g.slots.sort((a,b)=>a.slot_number-b.slot_number)})).sort((a,b)=>a.id.localeCompare(b.id))};
}
async function main(){const before=await snapshot();console.log(JSON.stringify({phase:'before',...before,signature:undefined}));
  await new Promise(resolve=>setTimeout(resolve,130000));
  const after=await snapshot();assert.deepEqual(after.signature,before.signature,'Live data changed during observation; inspect changes before attributing them to data loss');
  const result={scope:'Read-only production check, no writes',intervalSeconds:130,before:{...before,signature:undefined},after:{...after,signature:undefined},stable:true};
  fs.writeFileSync('outputs/retest-six-menus/web-that.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
