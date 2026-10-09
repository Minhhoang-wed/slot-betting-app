// Read-only diagnosis. Does not create games, finalize rounds, or change data.
const originalLog = console.log;
console.log = () => {};
const { supabase, isConfigured } = require('../config/supabase.config');
console.log = originalLog;

async function main() {
  const site = 'https://slot-betting-app.vercel.app';
  const liveResponse = await fetch(site + '/api/menus', { signal: AbortSignal.timeout(20000) });
  const live = await liveResponse.json();
  if (!live.success || !Array.isArray(live.data)) throw new Error('Cannot read live menus');
  console.log(JSON.stringify({ liveMenuCount: live.data.length, localConfigured: isConfigured() }));
  if (!supabase) return;
  const menus = await supabase.from('menus').select('id').abortSignal(AbortSignal.timeout(15000));
  if (menus.error) { console.log(JSON.stringify({ menusReadError: menus.error.code, message: menus.error.message })); return; }
  const common = live.data.filter(m => menus.data.some(local => local.id === m.id));
  console.log(JSON.stringify({ matchedLiveMenus: common.length }));
  if (!common.length) return; // Do not inspect a different project's history.
  const games = await supabase.from('games').select('id,status,round_number,finished_results,winners,slots(slot_number,player_name)')
    .in('menu_id', common.map(m => m.id)).abortSignal(AbortSignal.timeout(15000));
  if (games.error) { console.log(JSON.stringify({ gamesReadError: games.error.code, message: games.error.message })); return; }
  console.log(JSON.stringify({
    databaseGames: games.data.length,
    completedGames: games.data.filter(g => g.status === 'finished').length,
    gamesWithSavedResults: games.data.filter(g => Array.isArray(g.finished_results) && g.finished_results.length > 0).length,
    occupiedSlots: games.data.reduce((sum, g) => sum + (g.slots || []).filter(s => s.player_name).length, 0)
  }));
  const js = await (await fetch(site + '/js/app.js?v=2.4', { signal: AbortSignal.timeout(20000) })).text();
  console.log(JSON.stringify({ deployedFinalizeHandlesOnlyNetworkFailure: js.includes('}).catch(e => console.warn("Lỗi đồng bộ finalize game:", e));') }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
