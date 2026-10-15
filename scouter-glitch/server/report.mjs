import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { AppError, safeUrl } from './domain.mjs';

export function publicIPv4(ip) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
  const p = ip.split('.').map(Number), [a,b] = p;
  if (p.some(n=>n>255)) return false;
  return !(a===0 || a===10 || a===127 || a>=224 || (a===100&&b>=64&&b<=127) || (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&(b===168||b===0||b===2)) || (a===198&&(b===18||b===19||(b===51&&p[2]===100))) || (a===203&&b===0&&p[2]===113));
}
function checkUrl(raw) {
  const url = new URL(safeUrl(raw, {publicOnly:true}));
  if (url.port && !['80','443'].includes(url.port)) throw new AppError('Use a normal public website address.');
  return url;
}
export async function fetchPublicPage(raw, hops=0) {
  if (hops>4) throw new AppError('This page redirects too many times. Check it in a browser.');
  const url = checkUrl(raw);
  let addresses;
  try { addresses = await Promise.race([lookup(url.hostname,{family:4,all:true}), new Promise((_,reject)=>setTimeout(()=>reject(new Error('DNS timeout')),5000).unref())]); }
  catch { throw new AppError('The website address could not be resolved here. Check it in a browser.'); }
  if (!addresses.length || addresses.some(a=>!publicIPv4(a.address))) throw new AppError('Only public website addresses can be checked.');
  const selected = addresses[0];
  const result = await new Promise((resolve,reject)=>{
    const req = (url.protocol==='https:'?https:http).get(url, {agent:false, headers:{'User-Agent':'ScouterWebsiteCheck/0.1','Accept':'text/html,application/xhtml+xml'}, lookup:(_host,options,callback)=>options.all?callback(null,[selected]):callback(null,selected.address,4)}, res=>{
      const status = res.statusCode || 0, headers = res.headers;
      if ([301,302,303,307,308].includes(status) && headers.location) { res.resume(); resolve({redirect:new URL(headers.location,url).href}); return; }
      if (!/text\/html|application\/xhtml\+xml/i.test(headers['content-type']||'')) {res.resume();resolve({url:url.href,status,html:'',htmlAvailable:false});return;}
      let size=0; const chunks=[];
      res.on('data',chunk=>{size+=chunk.length;if(size>1500000){res.destroy();reject(new AppError('This page is too large for the quick check. Open it in a browser.'));}else chunks.push(chunk);});
      res.on('end',()=>resolve({url:url.href,status,html:Buffer.concat(chunks).toString('utf8'),htmlAvailable:true}));
      res.on('error',reject);
    });
    const deadline=setTimeout(()=>req.destroy(new Error('Website timeout')),12000);
    req.on('close',()=>clearTimeout(deadline));
    req.setTimeout(12000,()=>req.destroy(new Error('Website timeout')));
    req.on('error',()=>reject(new AppError('The website could not be checked from this server. It may block automated checks; verify in a browser.')));
  });
  return result.redirect ? fetchPublicPage(result.redirect,hops+1) : result;
}
const decode = s => s.replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/g,"'");
export function inspectHtml(html, base) {
  const clean = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
  const hrefs=[...clean.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].slice(0,1200).map(m=>decode(m[1]??m[2]));
  const phones=[...new Set(hrefs.filter(x=>/^tel:/i.test(x)).map(x=>x.slice(4).split('?')[0]))].slice(0,4);
  const emails=[...new Set(hrefs.filter(x=>/^mailto:/i.test(x)).map(x=>x.slice(7).split('?')[0]))].slice(0,4);
  const links=[...clean.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi)].slice(0,1200).flatMap(m=>{try{const u=new URL(decode(m[1]??m[2]),base);return /^https?:$/.test(u.protocol)?[{url:u.href,label:decode(m[3].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()).slice(0,160)}]:[];}catch{return [];}});
  const visible=decode(clean.replace(/<[^>]*>/g,' ').replace(/\s+/g,' '));
  const origin=new URL(base).origin;
  const contacts=hrefs.flatMap(h=>{try{const u=new URL(h,base);return u.origin===origin && /\bcontact(?:-us)?\b/i.test(u.pathname)?[u.href]:[];}catch{return [];}});
  return {links,visible,phones,emails,contacts:[...new Set(contacts)].slice(0,2),formPresent:/<form\b/i.test(clean),viewportPresent:/<meta\b[^>]*\bname\s*=\s*["']viewport["']/i.test(clean),title:decode((clean.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/<[^>]*>/g,'').trim()).slice(0,250)};
}
export async function buildReport(target, fetchPage=fetchPublicPage, options={}) {
  const at=new Date().toISOString(), findings=[], checks=[], services=[], sources=[{label:'Google listing',url:target.sourceUrl}], contacts=[];
  const add=(id,label,observation,fix,question,certainty='Observed')=>findings.push({id,label,observation,fix,question,certainty});
  if(target.businessStatus && target.businessStatus!=='OPERATIONAL' && target.businessStatus!=='UNKNOWN')add('status','Confirm the business is operating',`Google returned ${target.businessStatus}.`,'Confirm current operations before preparing any offer. A closed listing may be accurate.','Are you currently serving customers?','Owner confirmation needed');
  checks.push({label:'Google opening hours',state:target.hours?.length?'Listed':'Not returned',evidence:target.hours?.join(' · ')||'Google did not return regular hours.',source:target.sourceUrl});
  if(Array.isArray(target.hours)&&!target.hours.length){add('hours','Opening hours not returned by Google','No regular opening hours were returned for this listing. Appointment-only businesses may not need public hours.','Confirm whether published hours are useful, then help the owner update their listing if needed.','Do customers need opening hours, or do you work by appointment?');services.push({name:'Business listing cleanup',reason:'Confirm and maintain public hours and contact details.'});}
  if(target.phone) contacts.push({kind:'Phone listed on Google',value:target.phone,source:target.sourceUrl,tested:false});
  else add('phone','Phone not listed on Google','Google did not return a public phone number for this listing.','Confirm the preferred public contact route. If the owner wants phone inquiries, help update the listing.','How do customers usually reach you, and is that working?');
  let checkedPage=null, websiteError='', pages=[];
  if(!target.website) add('website','Website not listed on Google','Google did not return a website address. A site may exist elsewhere.','Find and confirm the official site before offering a new one. If one exists, offer to correct the listing link.','Do you already have a website or another page you want customers to use?');
  else {
    try {
      checkedPage=await fetchPage(target.website); pages.push({url:checkedPage.url,status:checkedPage.status});sources.push({label:'Checked website',url:checkedPage.url});
      if(checkedPage.status>=400) add('homepage','Homepage check returned an error',`The server returned HTTP ${checkedPage.status} for ${checkedPage.url}. Automated access may differ from a customer browser.`,'Reproduce the problem in a browser first. If confirmed, repair the page or correct the listing link.','Is this the current official site your customers should use?','Verify in browser');
      if(checkedPage.status<400 && checkedPage.htmlAvailable) {
        const parsed=inspectHtml(checkedPage.html,checkedPage.url);
        const phoneDigits=x=>{const d=x.replace(/\D/g,'');return d.length===11&&d[0]==='1'?d.slice(1):d;};
        if(target.phone&&parsed.phones.length&&!parsed.phones.some(p=>phoneDigits(p)===phoneDigits(target.phone)))add('phone-mismatch','Website and listing show different phone links',`Google lists ${target.phone}; the homepage phone links show ${parsed.phones.join(', ')}. These may be valid separate lines.`,'Confirm each number’s purpose. If the difference is accidental, align the listing and website.','Which number should a new customer use?','Compare with owner');
        const social=parsed.links.filter(l=>/^(www\.)?(instagram\.com|facebook\.com|tiktok\.com|youtube\.com|youtu\.be|twitch\.tv)$/i.test(new URL(l.url).hostname));
        checks.push({label:'Social profile links',state:social.length?'Links found':'Not found in homepage HTML',evidence:social.length?social.map(l=>l.url).join(' · '):'No supported social-profile link was found in the returned homepage HTML. Profiles may exist elsewhere.',source:checkedPage.url});
        if(!social.length)services.push({name:'Connect existing social profiles',reason:'Ask whether the owner uses social channels and wants them linked from the site. This does not establish a need to create accounts.'});
        const restaurant=/restaurant|cafe|coffee|bakery|grill|pizza|food|diner/i.test(target.category||'');
        const appointments=/salon|barber|spa|dentist|massage|beauty|fitness|gym|therap/i.test(target.category||'');
        const journeys=restaurant?[['Menu / ordering','menu|order|delivery|pickup|takeout','menu'],['Catering inquiry','catering','catering']]:appointments?[['Booking / appointment','book|appointment|schedule|reserve','booking']]:[['Service / inquiry','service|quote|estimate|contact|enquir|inquir','inquiry']];
        for(const[label,pattern,id]of journeys){const hits=parsed.links.filter(l=>new RegExp(pattern,'i').test(l.label+' '+new URL(l.url).pathname));const hit=hits[0]||(id==='inquiry'&&contacts.length?{url:contacts[0].source,label:'Listed contact route'}:null);checks.push({label,state:hit?'Link found; completion untested':'No matching link found',evidence:hit?`${hit.label||label}: ${hit.url}`:'No matching link was found in the returned homepage HTML. The business may use a different process.',source:checkedPage.url});if(!hit){services.push({name:label+' setup or clarification',reason:'Confirm demand for this customer action before offering work.'});if(id!=='catering')add('journey-'+id,label+' path needs a look','No clearly labelled matching link was found in the returned homepage HTML. This may be intentional or provided through JavaScript.','Ask how customers complete this action. If they struggle, clarify the existing path before proposing a new system.','How do customers currently '+(id==='menu'?'see the menu or place an order':id==='booking'?'book an appointment':'ask about your services')+'?','Owner confirmation needed');}else if(id!=='catering'&&new URL(hit.url).origin===new URL(checkedPage.url).origin&&!parsed.contacts.includes(hit.url)&&hit.url!==checkedPage.url){try{const page=await fetchPage(hit.url);pages.push({url:page.url,status:page.status});sources.push({label:label+' page checked',url:page.url});if(page.status>=400)add('journey-error-'+id,label+' link returned an error',`${hit.url} returned HTTP ${page.status} to this check. Automated access can differ from a browser.`,'Repeat the customer journey in a browser. If the failure is confirmed, repair or replace the destination.','Have customers mentioned trouble using this page?','Verify in browser');}catch{pages.push({url:hit.url,status:null});}}}
        checks.push({label:'Website business identity',state:parsed.title?'Page title found':'No title found',evidence:parsed.title||'No HTML title was found.',source:checkedPage.url});
        const addContacts=(p,url)=>{p.phones.forEach(value=>contacts.push({kind:'Phone link on website',value,source:url,tested:false}));p.emails.forEach(value=>contacts.push({kind:'Email link on website',value,source:url,tested:false}));if(p.formPresent)contacts.push({kind:'Form markup (purpose unverified)',value:url,source:url,tested:false});};
        addContacts(parsed,checkedPage.url);
        if(new URL(checkedPage.url).protocol!=='https:')add('https','Site remained on an HTTP address','The checked page did not redirect to HTTPS.','Check certificate and hosting support, then enable HTTPS and redirects if appropriate.','Who manages the domain and hosting?');
        if(!parsed.viewportPresent)add('mobile','Mobile layout needs a check','No mobile viewport declaration was found in the returned HTML. This does not establish how the page looks.','Check the page on a phone. If the layout is cramped, adjust the viewport and responsive layout.','Do customers usually use phones to view this page?','Verify on phone');
        for(const link of parsed.contacts) {
          try {
            const p=await fetchPage(link);pages.push({url:p.url,status:p.status});sources.push({label:'Contact page checked',url:p.url});
            if(p.status>=400)add('contact-'+findings.length,'A contact link returned an error',`The homepage linked to ${link}, which returned HTTP ${p.status} to this check.`,'Confirm the failure in a browser, then repair the contact page or point the link to the correct destination.','Have customers mentioned trouble contacting you online?','Verify in browser');
            else if(p.htmlAvailable){const info=inspectHtml(p.html,p.url);addContacts(info,p.url);contacts.push({kind:'Contact page available',value:p.url,source:p.url,tested:false});}
          } catch { pages.push({url:link,status:null}); }
        }
        if(!contacts.length)add('route','No contact route found by this check','No phone was returned by Google and no phone, email, form, or working contact-page link was found in the pages checked. JavaScript or other pages may provide one.','Find a route you can test before building a concept or quote. Confirm the owner’s preferred channel.','What is the best way for a customer to reach you?','Needs manual verification');
      }
    } catch(e) { websiteError=e.message; }
  }
  if(options.compareUrl){try{const candidate=checkUrl(options.compareUrl).href;if(target.website&&new URL(candidate).hostname.replace(/^www\./,'')===new URL(target.website).hostname.replace(/^www\./,''))throw new AppError('Choose a different website domain to compare.');const other=await fetchPage(candidate);pages.push({url:other.url,status:other.status});sources.push({label:'Additional website supplied for comparison',url:other.url});if(other.status<400&&other.htmlAvailable){const info=inspectHtml(other.html,other.url);checks.push({label:'Additional website identity',state:'Supplied for comparison; ownership unverified',evidence:info.title||other.url,source:other.url});add('multiple-sites','Two website destinations to clarify',`Google lists ${target.website||'no website'}; you supplied ${other.url}, titled “${info.title||'untitled'}”. A second domain may be legitimate and ownership has not been established.`,'Confirm whether both sites represent this location, who maintains them, and which destination customers should use. Offer link/menu/contact alignment only if confusion is confirmed.','Which site should a new customer use, and should the other point to it?','Research lead supplied by you');services.push({name:'Website and listing consistency review',reason:'Confirm official ownership and customer confusion across the supplied domains.'});}else checks.push({label:'Additional website',state:'Check incomplete',evidence:`HTTP ${other.status}. Verify manually.`,source:other.url});}catch(e){checks.push({label:'Additional website',state:'Check incomplete',evidence:e.message,source:options.compareUrl});}}
  const routes=[...new Map(contacts.map(c=>[c.kind+':'+c.value,c])).values()];
  return {version:1,generatedAt:at,target:{name:target.title,website:target.website||'',sourceUrl:target.sourceUrl,location:target.location||'',placeId:target.externalId},contactState:routes.length?'Possible contact routes found; delivery untested':'Pause: no contact route found by these checks',contacts:routes,findings,checks,services,sources:sources.filter(s=>s.url),pages,websiteError,summary:findings.length?`${findings.length} observations to investigate`:'No specific issue established by this quick check',limitations:['This is a public-information check, not proof that the owner needs or wants a service.','Phone activity, inbox delivery, Instagram DMs, form submissions, and owner interest were not tested.','Only returned HTML is inspected. JavaScript-rendered content may be missed.','Additional sites are checked only when supplied for comparison. Discovery of other domains, official ownership, travel feasibility, revenue loss, and business performance are not established.','Suggested fixes require verification and the owner’s agreement.']};
}
export function reportText(r) {
  return [`SCOUTER — OPPORTUNITY REVIEW`,r.target.name,`Checked: ${r.generatedAt}`,`Google source: ${r.target.sourceUrl}`,`Website: ${r.target.website||'Not listed on Google'}`,'',`CONTACT FIRST`,r.contactState,...r.contacts.map(c=>`${c.kind}: ${c.value} (listed, not tested)\nSource: ${c.source}`),'',`CUSTOMER PATH CHECKS`,...r.checks.map(c=>`${c.label}: ${c.state}\nEvidence: ${c.evidence}\nSource: ${c.source}`),'',`OBSERVATIONS AND POSSIBLE FIXES`,...r.findings.flatMap((f,i)=>[`${i+1}. ${f.label} [${f.certainty}]`,`Observation: ${f.observation}`,`Possible fix: ${f.fix}`,`Ask the owner: ${f.question}`,'']),r.websiteError?`Website check incomplete: ${r.websiteError}`:'',`SERVICES TO DISCUSS, ONLY IF THE OWNER CONFIRMS A NEED`,...r.services.map(s=>`${s.name}: ${s.reason}`),'',`PAGES CHECKED`,...r.pages.map(p=>`${p.url} — ${p.status??'Could not complete'}`),'',`BEFORE A CONCEPT OR QUOTE`,`Confirm a contact route, the owner’s current priority, and whether you can serve them remotely or travel.`,`This report is preparation for a conversation. It is not a diagnosis of lost sales.`,'',`LIMITATIONS`,...r.limitations].filter(x=>x!==null).join('\n');
}
