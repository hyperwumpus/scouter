import {AppError,text} from './domain.mjs';

// Ported from youtube-analytics-toolkit's content enrichment and strategy rules.
// No bundled channel data, title-based promotion rules, or cross-format ranking.
export function parseCsv(csv){
 if(typeof csv!=='string'||!csv.trim())throw new AppError('Choose a nonempty CSV export.');
 if(Buffer.byteLength(csv)>700000)throw new AppError('Choose a CSV smaller than 700 KB.');
 csv=csv.replace(/^\uFEFF/,'');
 const rows=[];let row=[],value='',quoted=false,closed=false;
 for(let i=0;i<csv.length;i++){
  const c=csv[i];
  if(quoted){if(c==='"'){if(csv[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;}
  else if(c===','||c==='\n'||c==='\r'){
   row.push(value);value='';closed=false;
   if(c!==','){if(c==='\r'&&csv[i+1]==='\n')i++;if(row.some(v=>v.trim()))rows.push(row);row=[];}
  }else if(c==='"'){if(value.length||closed)throw new AppError('Invalid CSV quoting.');quoted=true;}
  else {if(closed&&c.trim())throw new AppError('Unexpected text after a CSV quote.');if(!closed)value+=c;}
 }
 if(quoted)throw new AppError('CSV has an unclosed quote.');
 row.push(value);if(row.some(v=>v.trim()))rows.push(row);
 const headers=rows.shift()?.map(v=>v.replace(/^\uFEFF/,'').trim());
 if(!headers?.length||new Set(headers).size!==headers.length||headers.some(h=>!h))throw new AppError('CSV needs unique, nonempty column headings.');
 if(rows.length>3000)throw new AppError('Import up to 3,000 video rows at a time.');
 if(rows.some(r=>r.length!==headers.length))throw new AppError('CSV rows do not match the column headings.');
 return {headers,rows:rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i].trim()])))};
}
const number=(v,{percent=false,signed=false}={})=>{
 if(v==null||String(v).trim()===''||/^(—|-|n\/a)$/i.test(String(v).trim()))return null;
 const s=String(v).trim().replace(/,/g,'').replace(/%$/,'');
 if(!/^-?\d+(\.\d+)?$/.test(s))return null;
 const n=Number(s);return Number.isFinite(n)&&(signed||n>=0)&&(!percent||n<=100)?n:null;
};
const median=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?(a[Math.floor(a.length/2)]+a[Math.ceil(a.length/2)-1])/2:null;};
export function date(value,label){const s=text(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw new AppError('Choose a valid '+label+'.');return s;}
export function analyzeContent(input){
 const start=date(input.start,'report start date'),end=date(input.end,'report end date');if(start>end)throw new AppError('Report end must follow its start.');
 const settings={};for(const [key,fallback,min] of [['minViews',100,0],['minImpressions',100,0],['minVideos',3,3]]){const value=input[key]===undefined||input[key]===''?fallback:Number(input[key]);if(!Number.isSafeInteger(value)||value<min||value>100000000)throw new AppError('Invalid comparison setting: '+key);settings[key]=value;}
 const {headers,rows}=parseCsv(input.csv);
 if(!headers.includes('Video title')||!headers.includes('Views'))throw new AppError('Use a YouTube Studio content CSV with Video title and Views columns.');
 const formats=['Long-form','Short','Live / VOD','Unknown'];
 const defaultFormat=formats.includes(input.format)?input.format:'Unknown';
 const warnings=new Set(['All metrics cover the supplied report period; publication date does not indicate equal video age. Comparisons are exploratory, not causal.','No retention curve, thumbnail image, revenue, traffic-source or repeat-viewing diagnosis is available from this content report.']);
 let excludedTotals=0;const seen=new Set();
 const videos=rows.flatMap((r,index)=>{
  if(r.Content==='Total'||r['Video title']==='Total'){excludedTotals++;return [];}
  if(!r['Video title'])throw new AppError('A video row is missing its title.');
  const id=r.Content||String(index+1);if(seen.has(id))throw new AppError('Duplicate content IDs found. Import one report at a time.');seen.add(id);
  const views=number(r.Views);if(views===null)throw new AppError('Invalid Views value for '+text(r['Video title'],100)+'.');
  const read=(key,options)=>{const n=number(r[key],options);if(r[key]&&n===null)warnings.add('Some invalid '+key+' values were treated as missing.');return n;};
  const format=formats.includes(r['Content type'])?r['Content type']:defaultFormat;
  const promotion={yes:'Promoted',promoted:'Promoted',no:'Unpromoted',unpromoted:'Unpromoted',unknown:'Unknown'}[r.Promotion?.toLowerCase()]||'Unknown';
  const gained=read('Subscribers gained'),watchHours=read('Watch time (hours)'),likes=read('Likes'),comments=read('Comments added'),shares=read('Shares');
  return [{id,title:text(r['Video title'],400),publishedAt:text(r['Video publish time'],40),format,promotion,views,watchHours,gained,netSubscribers:read('Subscribers',{signed:true}),impressions:read(headers.includes('Thumbnail impressions')?'Thumbnail impressions':'Impressions'),ctr:read(headers.includes('Thumbnail click-through rate (%)')?'Thumbnail click-through rate (%)':'Impressions click-through rate (%)',{percent:true}),retention:read('Average percentage viewed (%)'),stayed:read('Stayed to watch (%)',{percent:true}),subsPer1k:views>0&&gained!==null?gained/views*1000:null,watchHoursPer1k:views>0&&watchHours!==null?watchHours/views*1000:null,engagement:views>0&&[likes,comments,shares].every(Number.isFinite)?(likes+comments+shares)/views*100:null}];
 });
 if(!videos.length)throw new AppError('The CSV has no video rows to analyze.');
 if(videos.some(v=>v.format==='Unknown'))warnings.add('Unknown formats are listed but excluded from comparisons. Set a format for a single-format export or add Content type per row. Duration alone cannot reliably identify Shorts.');
 if(videos.some(v=>v.promotion==='Unknown'))warnings.add('Promotion status is unknown unless supplied in a Promotion column. Unknown is never labelled organic.');
 const groups=[];const experiments=[];const strengths=[];
 for(const format of formats.filter(f=>f!=='Unknown'))for(const promotion of ['Promoted','Unpromoted','Unknown']){
  const group=videos.filter(v=>v.format===format&&v.promotion===promotion);if(!group.length)continue;
  const eligible=group.filter(v=>v.views>=settings.minViews);
  const metrics={retention:median(eligible.map(v=>v.retention)),subsPer1k:median(eligible.map(v=>v.subsPer1k)),ctr:median(eligible.filter(v=>v.impressions!==null&&v.impressions>=settings.minImpressions).map(v=>v.ctr))};
  groups.push({format,promotion,count:group.length,comparisonCount:eligible.length,medians:metrics});
  for(const [key,label,unit] of [['retention','Average percentage viewed','%'],['subsPer1k','Subscribers gained per 1K views','']]){
   const comparable=eligible.filter(v=>v[key]!==null);
   if(comparable.length>=settings.minVideos){const center=median(comparable.map(v=>v[key]));const best=comparable.toSorted((a,b)=>b[key]-a[key])[0];
    if(best[key]>center)strengths.push({videoId:best.id,title:best.title,format,promotion,label,observation:`${best[key].toFixed(2)}${unit} versus cohort median ${center.toFixed(2)}${unit} (${comparable.length} comparable rows).`,action:'Inspect what this video does well and test repeating that element in a comparable upload. This is relative performance, not proof of a cause.'});
   }
  }
  // Require three actual observations for each compared metric, not just three rows.
  const packaging=eligible.filter(v=>v.impressions!==null&&v.impressions>=settings.minImpressions&&v.ctr!==null&&v.retention!==null);
  const ctrMedian=median(packaging.map(v=>v.ctr)),retMedian=median(packaging.map(v=>v.retention));
  if(format==='Long-form'&&packaging.length>=settings.minVideos)for(const v of packaging.filter(v=>v.ctr<ctrMedian&&v.retention>=retMedian).slice(0,3))experiments.push({id:'packaging-'+v.id,productionType:'Title and thumbnail',name:'Test title / thumbnail packaging',videoId:v.id,title:v.title,format,promotion,observation:`CTR ${v.ctr}% versus cohort median ${ctrMedian.toFixed(2)}%; average percentage viewed ${v.retention}% versus ${retMedian.toFixed(2)}% (${packaging.length} comparable rows with at least ${settings.minViews} views and ${settings.minImpressions} impressions).`,hypothesis:'Packaging may be limiting clicks. Traffic source, topic, and video age may also explain the difference.',action:'Review the title and thumbnail against the opening, then test one approved packaging change.',measure:'Compare CTR and watch time over a matched follow-up period with traffic-source and impression context.',metric:'CTR (%)',baseline:v.ctr});
  const retention=eligible.filter(v=>v.retention!==null);
  if(retention.length>=settings.minVideos){const baseline=median(retention.map(v=>v.retention));const v=retention.toSorted((a,b)=>a.retention-b.retention)[0];if(v.retention<baseline)experiments.push({id:'opening-'+v.id,productionType:'Video editing',name:'Inspect opening and pacing',videoId:v.id,title:v.title,format,promotion,observation:`Average percentage viewed ${v.retention}% versus cohort median ${baseline.toFixed(2)}% (${retention.length} rows with at least ${settings.minViews} views).`,hypothesis:'The opening or pacing may need work. Average percentage viewed alone does not show where viewers left.',action:'Inspect the retention curve and recording first; if supported, prepare one revised opening for a comparable future upload.',measure:'Compare average percentage viewed in a matched window; retain duration and traffic context.',metric:'Average percentage viewed (%)',baseline:v.retention});}
 }
 if(!experiments.length)warnings.add('No supported experiment surfaced. Add comparable videos with sufficient metric coverage, or inspect the evidence manually.');
 return {schemaVersion:1,source:'User-supplied YouTube Studio CSV',filename:text(input.filename,180)||'Content export.csv',goal:text(input.goal,1800),period:{start,end},importedAt:new Date().toISOString(),excludedTotals,settings,videoCount:videos.length,videos,groups,strengths,experiments:experiments.slice(0,12),warnings:[...warnings]};
}
export function analyticsText(r){return `SCOUTER CREATOR / CSV EVIDENCE\nSource: ${r.filename}\nPeriod: ${r.period.start} to ${r.period.end}\nGoal: ${r.goal||'To confirm'}\nVideos: ${r.videoCount}\n\nCOHORTS\n${r.groups.map(g=>`${g.format} / ${g.promotion}: ${g.count} videos; ${g.comparisonCount} with >=${r.settings.minViews} views`).join('\n')}\n\nRELATIVE STRENGTHS\n${r.strengths.map(s=>`${s.title}: ${s.label} — ${s.observation}\n${s.action}`).join('\n\n')}\n\nPROPOSED EXPERIMENTS (not approved)\n${r.experiments.map(e=>`${e.name}: ${e.title}\nObserved: ${e.observation}\nHypothesis: ${e.hypothesis}\nAction: ${e.action}\nMeasure: ${e.measure}`).join('\n\n')}\n\nLIMITS\n${r.warnings.join('\n')}`;}
