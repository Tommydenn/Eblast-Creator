import fs from 'fs';
const env=fs.readFileSync('.env.local','utf8');
process.env.DATABASE_URL=env.match(/DATABASE_URL=(.*)/)![1].trim().replace(/^["']|["']$/g,'');
const {neon}=await import('@neondatabase/serverless');
const sql=neon(process.env.DATABASE_URL!);
const rows:any[] = await sql`
  SELECT sent_at, decided_at, decision FROM saved_draft_approvals
  WHERE decided_at IS NOT NULL AND decision IN ('approved','edits_requested')
    AND is_test IS NOT TRUE` as any[];
const hrs = rows.map(r => (new Date(r.decided_at).getTime()-new Date(r.sent_at).getTime())/3600000)
                .filter(h => h >= 0).sort((a,b)=>a-b);
if(!hrs.length){ console.log('no decided requests'); process.exit(0); }
const pct = (p:number)=> hrs[Math.min(hrs.length-1, Math.floor(hrs.length*p))];
console.log(`${hrs.length} real decisions`);
console.log(`  fastest ${hrs[0].toFixed(1)}h | median ${pct(0.5).toFixed(1)}h | 90th ${pct(0.9).toFixed(1)}h | slowest ${hrs[hrs.length-1].toFixed(1)}h`);
for (const w of [24, 48, 72, 24*7, 24*14]) {
  const over = hrs.filter(h => h > w).length;
  console.log(`  a ${String(w/24).padStart(2)}-day window would have expired ${over} of ${hrs.length} (${Math.round(over/hrs.length*100)}%)`);
}
