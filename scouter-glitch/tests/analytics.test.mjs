import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeContent,parseCsv} from '../server/analytics.mjs';
import {Store} from '../server/store.mjs';
import {Projects,aiBrief,productionHandoff} from '../server/projects.mjs';
import {createApp} from '../server/main.mjs';
const csv='Content,Video title,Content type,Promotion,Views,Subscribers gained,Thumbnail impressions,Thumbnail click-through rate (%),Average percentage viewed (%)\na,"Video, A",Long-form,Unpromoted,1000,10,4000,2,70\nb,Video B,Long-form,Unpromoted,1000,5,4000,6,60\nc,Video C,Long-form,Unpromoted,1000,5,4000,8,50\nTotal,Total,,,3000,20,12000,5,60\n';
const input={csv,filename:'authorized.csv',start:'2026-09-01',end:'2026-09-30',goal:'Improve packaging'};
test('CSV handles BOM, CRLF, escaped quotes and multiline titles; rejects malformed imports',()=>{
 assert.equal(parseCsv('\uFEFFVideo title,Views\r\n"A ""quote""\nnext line","1,200"\r\n').rows[0]['Video title'],'A "quote"\nnext line');
 for(const bad of ['Views,Views\n1,2','Video title,Views\n"unclosed,3','Video title,Views\nX,3,4','Video title,Views\n"X"oops,3'])assert.throws(()=>parseCsv(bad));
 assert.throws(()=>analyzeContent({...input,csv:'Video title,Views\nBad,abc'}),/Invalid Views/);
 assert.throws(()=>analyzeContent({...input,start:'2026-02-30'}),/valid/);
 assert.throws(()=>analyzeContent({...input,start:'2026-10-01'}),/end/);
});
test('isolates formats and acquisition, omits totals, preserves unknowns and missing values',()=>{
 const r=analyzeContent(input);assert.equal(r.videoCount,3);assert.ok(r.strengths.some(s=>s.videoId==='a'));assert.equal(analyzeContent({...input,minViews:2000}).experiments.length,0);assert.throws(()=>analyzeContent({...input,minViews:-1}),/comparison setting/);assert.equal(r.excludedTotals,1);assert.equal(r.videos[0].subsPer1k,10);assert.equal(r.videos[0].engagement,null);assert.equal(r.experiments.find(e=>e.id==='packaging-a').baseline,2);
 const mixed=analyzeContent({...input,csv:csv.replaceAll('Long-form,Unpromoted','Short,Unknown')});assert.ok(!mixed.experiments.some(e=>e.id.startsWith('packaging')));assert.equal(mixed.groups[0].promotion,'Unknown');
 const unknown=analyzeContent({...input,csv:'Video title,Views\nUnknown,0\n'});assert.equal(unknown.videos[0].subsPer1k,null);assert.equal(unknown.videos[0].format,'Unknown');assert.equal(unknown.experiments.length,0);
 const sparse=analyzeContent({...input,csv:csv.replace(',8,50',',,')});assert.equal(sparse.experiments.length,0);
});
test('saved evidence survives edits; experiments require approval and sourced follow-up; export carries actual context',t=>{
 const store=new Store(':memory:');t.after(()=>store.close());const projects=new Projects(store,'/unused');let p=projects.save({title:'Customer',lane:'Creator',notes:'Keep this'});
 p=projects.analytics(p.id,{...input,version:p.version,experimentId:'packaging-a'});assert.equal(p.experiment.status,'Proposed');assert.equal(p.amount,null);
 assert.throws(()=>projects.analytics(p.id,{...input,version:0}),/another window/);
 p=projects.save({...p,offer:'Packaging test'},p.id);assert.equal(p.analytics.videoCount,3);assert.equal(p.notes,'Keep this');
 const plan={deliverables:'One title and thumbnail',successMeasure:'CTR in matched period; inspect traffic mix',followUpDate:'2026-10-15'};
 assert.throws(()=>projects.experiment(p.id,{...plan,version:p.version,status:'Delivered'}),/Approve/);
 p=projects.experiment(p.id,{...plan,version:p.version,status:'Approved'});
 assert.throws(()=>projects.analytics(p.id,{...input,version:p.version}),/active experiment/);
 p=projects.experiment(p.id,{...plan,version:p.version,status:'Delivered'});
 assert.throws(()=>projects.experiment(p.id,{...plan,version:p.version,status:'Completed',resultStart:'2026-10-01',resultEnd:'2026-10-15',resultValue:''}),/valid result/);
 p=projects.experiment(p.id,{...plan,version:p.version,status:'Completed',resultStart:'2026-10-01',resultEnd:'2026-10-15',resultValue:4,resultSource:'Studio follow-up CSV',resultContext:'Same video, changed traffic mix; interpret cautiously'});
 assert.equal(p.experiment.result.delta,2);assert.match(aiBrief(p),/authorized.csv/);assert.equal(productionHandoff(p).projectId,p.id);assert.match(p.experiment.result.interpretation,/does not establish/);p=projects.analytics(p.id,{...input,version:p.version});assert.equal(p.evidenceHistory[0].experiment.result.value,4);assert.equal(p.experiment,null);
});
test('analytics HTTP routes enforce auth, validation, optimistic updates and persistence',async t=>{
 const store=new Store(':memory:'),{server}=createApp({store,providers:{status:()=>({google:{configured:false}})}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.close();store.close();});const base='http://127.0.0.1:'+server.address().port;
 const boot=await(await fetch(base+'/api/bootstrap')).json();const headers={'Content-Type':'application/json','X-Scouter-Token':boot.token};const call=(path,data,method='POST')=>fetch(base+'/api/'+path,{method,headers,body:JSON.stringify(data)});
 assert.equal((await fetch(base+'/api/creator/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)})).status,403);
 const r=await call('creator/analytics',input);assert.equal(r.status,200);assert.equal((await r.json()).videoCount,3);
 const p=await(await call('projects',{title:'Fixture',lane:'Creator'})).json();const saved=await call(`projects/${p.id}/analytics`,{...input,version:p.version,experimentId:'packaging-a'});assert.equal(saved.status,200);
 assert.equal((await call(`projects/${p.id}/analytics`,{...input,version:p.version})).status,409);
 const handoff=await fetch(base+`/api/projects/${p.id}/handoff`,{headers});assert.equal((await handoff.json()).experiment.status,'Proposed');
 assert.equal((await call('creator/analytics',{...input,csv:'wrong\n1'})).status,400);
 assert.equal((await fetch(base+'/analytics.mjs')).status,200);
});
