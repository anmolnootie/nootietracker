/* ===== UI ===== */
const $=s=>document.querySelector(s);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inr=n=>n==null?'':Math.round(n).toLocaleString('en-IN');
function money(n){n=n||0;if(n>=1e7)return '₹'+(n/1e7).toFixed(2)+' Cr';if(n>=1e5)return '₹'+(n/1e5).toFixed(1)+' L';return '₹'+inr(n);}
const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fd(s){if(!s)return '';const p=s.split('-');return (+p[2])+' '+MN[+p[1]-1]+(p[0]!==S.asof.slice(0,4)?' '+p[0].slice(2):'');}
function pct(x){return (x*100).toFixed(0)+'%';}
const TONE_STAGE={1:'info',2:'warn',3:'warn',4:'warn',5:'info',6:'info',7:'mute',8:'ok',9:'mute'};
function flagTag(d){if(!d.pri)return '';const f=FLAGS[d.pri];return '<span class="tag '+f.tone+'">'+esc(f.name)+'</span>';}

const UI={
  view:'overview',
  f:{plat:'ALL',from:'2026-04-01',to:'',flag:'ALL',team:'ALL',q:'',wlLimit:100,kanLimit:40,issuePlat:true},
  hand:{mode:'accept',text:'',reason:'Low value',person:''},
  drawer:null,
  rows(){const p=this.f.plat;return S.D.filter(d=>p==='ALL'||d.plat===p);},
  period(){return this.rows().filter(d=>this.inP(d));},
  toast(m,err){const t=document.createElement('div');t.className='toast'+(err?' err':'');t.setAttribute('role','status');t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),err?6000:2600);},
  status(){
    const el=$('#conn');if(!el)return;
    if(S.busy){el.className='pill snap busy';el.innerHTML='<i></i>Connecting to Google Sheets';return;}
    if(S.mode==='live'){el.className='pill live';el.innerHTML='<i></i>Live · synced '+(S.lastSync?pad(S.lastSync.getHours())+':'+pad(S.lastSync.getMinutes()):'');}
    else{el.className='pill snap';el.innerHTML='<i></i>Snapshot of '+fd(SNAP.asOf)+' · not connected';}
    $('#refresh').disabled=S.busy;
  },
  render(){
    this.status();
    const D=S.D;const act=D.filter(d=>d.pri>=1&&d.pri<=6&&(this.f.plat==='ALL'||d.plat===this.f.plat)).length;
    const tabs=[['overview','Overview'],['pipeline','Pipeline'],['worklist','Worklist',act],['handover','Handover check'],['platforms','Platforms'],['recon','Daily recon'],['issues','Issues (CRM)',S.issues.filter(i=>i.status!=='Resolved').length],['settings','Settings']];
    $('#tabs').innerHTML=tabs.map(t=>'<button role="tab" aria-selected="'+(this.view===t[0])+'" data-act="tab" data-v="'+t[0]+'">'+t[1]+(t[2]?' <span class="cnt">'+t[2]+'</span>':'')+'</button>').join('');
    const bn=[];
    if(S.mode!=='live')bn.push('<div class="banner">'+(S.err?esc(S.err)+' ':'')+'You are looking at the saved snapshot from '+fd(SNAP.asOf)+'. Entries you make are kept on this device only until the app is connected to Google Sheets (see Settings).</div>');
    else if(S.err)bn.push('<div class="banner err">'+esc(S.err)+'</div>');
    const v=this.view;const fn=this['v_'+v];
    $('#main').innerHTML=bn.join('')+(fn?fn.call(this):'');
    this.drawerRender();
  },
  /* ---------- OVERVIEW ---------- */
  tile(l,v,s,tone,act,arg){return '<button class="tile '+(tone||'')+'" data-act="'+act+'" data-arg="'+esc(arg||'')+'"><span class="l">'+l+'</span><span class="v">'+v+'</span><span class="s">'+(s||'&nbsp;')+'</span></button>';},
  bars(items,max,fmt){return items.map(i=>'<button class="rowbar" data-act="'+i.act+'" data-arg="'+esc(i.arg)+'"><span class="nm"><span>'+esc(i.label)+'</span></span><span class="track"><b class="'+(i.tone||'')+'" style="width:'+(max?Math.max(i.n?2:0,i.n/max*100):0)+'%"></b></span><span class="n">'+(fmt?fmt(i):i.n)+(i.sub?'<br><span class="small">'+i.sub+'</span>':'')+'</span></button>').join('');},
  hero(P,a){
    const go=(v,l,n)=>'<button class="btn" data-act="tab" data-arg="'+v+'">'+l+(n?' <span class="cnt">'+n+'</span>':'')+'</button>';
    return '<section class="hero"><div class="hl">'+plogo(P).replace('class="plogo"','class="plogo xl"').replace('class="plogo ph"','class="plogo xl ph"')+'<div><h2>'+esc(P)+' control tower</h2><div class="small">Everything below is only '+esc(P)+'. '+inr(a.n)+' POs in this period · '+money(a.value)+' PO value · fill rate '+pct(a.fill)+'.</div></div></div><div class="hr">'+go('register','See all '+esc(P)+' POs')+go('worklist','Worklist',this.period().filter(d=>d.pri>=1&&d.pri<=6).length)+go('pipeline','Pipeline')+go('handover','Handover check')+go('issues','Issues')+'</div></section>';
  },
  facilities(){
    const m=new Map();this.period().forEach(d=>{const k=d.loc||'(no facility)';const o=m.get(k)||{n:0,open:0};o.n++;if(d.stage<=4)o.open++;m.set(k,o);});
    const it=Array.from(m).sort((a,b)=>b[1].n-a[1].n).slice(0,12).map(e=>({label:e[0],n:e[1].n,tone:e[1].open?'warn':'ok',act:'fac',arg:e[0],sub:e[1].open?e[1].open+' open':'all closed'}));
    return it.length?this.bars(it,it[0].n):'<div class="empty">No facility recorded</div>';
  },
  v_overview(){
    const R=this.period(),a=aggregate(R),P=this.f.plat,isAll=P==='ALL';
    const tiles=[
      this.tile('POs received',inr(a.n),money(a.value)+' PO value','','tab','register'),
      this.tile('Awaiting decision',inr(a.undecided),money(a.undecidedValue)+' not accepted or declined',a.undecided?'warn':'ok','flag','7'),
      this.tile('Accepted, not dispatched',inr(a.accNotDisp),money(a.notDispValue),a.accNotDisp?'warn':'ok','stage','2'),
      this.tile('POs dispatched',inr(a.dispatched),money(a.invoiced)+' invoiced','ok','tab','register'),
      this.tile('Fill rate (value)',pct(a.fill),'invoiced against PO value','','tab','register'),
      this.tile('In transit',inr(a.transit),a.flag[6]+' overdue',a.flag[6]?'warn':'','flag','6'),
      this.tile('Delivered, GRN pending',inr(a.grnP),a.flag[8]+' overdue',a.flag[8]?'warn':'','flag','8'),
      this.tile('Action items',inr(a.flags),a.expiring+' expired or expiring',a.expiring?'crit':'warn','tab','worklist')];
    const mx=Math.max.apply(null,STAGES.map(s=>a.stage[s.n].n))||1;
    const funnel=this.bars(STAGES.map(s=>({label:s.n+'. '+s.name,n:a.stage[s.n].n,tone:TONE_STAGE[s.n]==='mute'?'mute':TONE_STAGE[s.n],act:'stage',arg:s.n,sub:a.stage[s.n].v?money(a.stage[s.n].v):''})),mx);
    const fl=[];for(let i=1;i<=10;i++)fl.push({label:FLAGS[i].name,n:a.flag[i],tone:FLAGS[i].tone,act:'flag',arg:i,sub:a.flagVal[i]?money(a.flagVal[i]):''});
    const fmx=Math.max.apply(null,fl.map(x=>x.n))||1;
    const sec=(t,s)=>'<h2 class="sec">'+t+(s?' <span class="small">'+s+'</span>':'')+'</h2>';
    return (isAll?'':this.hero(P,a))+'<div class="grid g4">'+tiles.join('')+'</div>'+
      (isAll?sec('Platforms at a glance','Click a platform to open its own control tower')+'<div class="grid g3">'+this.platGrid(R)+'</div>':'')+
      '<div class="grid g2" style="margin-top:14px"><section class="card"><h2>Where every PO sits</h2><div class="sub">End to end, in the selected period. Click a stage to open it in the Pipeline.</div>'+funnel+'</section>'+
      '<section class="card"><h2>What needs action</h2><div class="sub">Found automatically, most urgent first. Click a row to open the Worklist.</div>'+this.bars(fl,fmx)+'</section></div>'+
      (isAll?'':'<section class="card" style="margin-top:14px"><h2>By facility / hub</h2><div class="sub">Where '+esc(P)+' POs are going. Click one to see its POs.</div>'+this.facilities()+'</section>')+
      '<div class="grid g2" style="margin-top:14px"><section class="card"><h2>Month by month</h2><div class="sub">POs received against POs dispatched, by PO date.</div>'+this.monthly()+'</section>'+
      '<section class="card"><h2>How old are the POs not yet dispatched?</h2><div class="sub">Accepted or undecided, with no invoice. Includes every date.</div>'+this.ageing()+'</section></div>';
  },
  monthly(){
    const rows=this.rows();const months=[];
    for(let i=0;i<12;i++){const y=2026+Math.floor((3+i)/12),m=(3+i)%12;months.push({y,m,r:0,d:0});}
    rows.forEach(d=>{if(!d.date)return;const y=+d.date.slice(0,4),m=+d.date.slice(5,7)-1;const o=months.find(x=>x.y===y&&x.m===m);if(o){o.r++;if(d.inv.n>0)o.d++;}});
    const last=months.reduce((a,x,i)=>x.r?i:a,0);const ms=months.slice(0,Math.max(last+1,6));
    const mx=Math.max.apply(null,ms.map(x=>x.r))||1;const W=640,H=210,pl=34,pb=26,pt=14,bw=(W-pl)/ms.length;
    let s='<div class="legend"><span><i style="background:var(--info)"></i>Received</span><span><i style="background:var(--ok)"></i>Dispatched</span></div><svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="POs received and dispatched by month">';
    for(let g=0;g<=4;g++){const y=pt+(H-pt-pb)*(1-g/4);s+='<line x1="'+pl+'" x2="'+W+'" y1="'+y+'" y2="'+y+'" stroke="var(--line)" stroke-width="1"/><text x="'+(pl-5)+'" y="'+(y+4)+'" text-anchor="end">'+Math.round(mx*g/4)+'</text>';}
    ms.forEach((x,i)=>{const x0=pl+i*bw+bw*.14,w=bw*.34;const h1=(H-pt-pb)*x.r/mx,h2=(H-pt-pb)*x.d/mx;
      s+='<rect x="'+x0+'" y="'+(H-pb-h1)+'" width="'+w+'" height="'+h1+'" rx="2" fill="var(--info)"/><rect x="'+(x0+w+2)+'" y="'+(H-pb-h2)+'" width="'+w+'" height="'+h2+'" rx="2" fill="var(--ok)"/>';
      s+='<text x="'+(x0+w)+'" y="'+(H-8)+'" text-anchor="middle">'+MN[x.m]+'</text>';
      if(x.r)s+='<text x="'+(x0+w/2)+'" y="'+(H-pb-h1-3)+'" text-anchor="middle" style="font-size:10px">'+x.r+'</text>';});
    return s+'</svg>';
  },
  ageing(){
    const open=this.rows().filter(d=>d.inv.n===0&&d.stage<=4);
    const B=[['0-3 days',0,3],['4-7 days',4,7],['8-15 days',8,15],['16-30 days',16,30],['Over 30 days',31,1e9]];
    const items=B.map(b=>{const m=open.filter(d=>d.age!=null&&d.age>=b[1]&&d.age<=b[2]);return {label:b[0],n:m.length,sub:money(m.reduce((s,d)=>s+(d.amt||0),0)),tone:b[1]>=31?'crit':b[1]>=8?'warn':'info',act:'tab',arg:'worklist'};});
    const nd=open.filter(d=>d.age==null);items.push({label:'No PO date',n:nd.length,sub:money(nd.reduce((s,d)=>s+(d.amt||0),0)),tone:'mute',act:'tab',arg:'worklist'});
    return this.bars(items,Math.max.apply(null,items.map(x=>x.n))||1);
  },
  platCards(){
    return PLATS.map(p=>{
      const R=S.D.filter(d=>d.plat===p&&(this.inP(d)));const a=aggregate(R);if(!a.n)return '';
      return '<button class="tile '+(a.flag[1]+a.flag[2]?'crit':a.undecided>20?'warn':'')+'" data-act="plat" data-arg="'+esc(p)+'"><span class="l plat">'+pn(p)+'</span><span class="v">'+inr(a.n)+' <span class="small" style="font:400 12px var(--body)">POs</span></span><span class="s">'+a.undecided+' undecided · '+a.accNotDisp+' not dispatched · fill '+pct(a.fill)+'</span><span class="s">'+a.flags+' action items</span></button>';}).join('');
  },
  /* ---------- PIPELINE ---------- */
  v_pipeline(){
    const rows=this.rows();const cols=[1,2,3,4,5,6,7];const sel=this.f.stage;
    const by={};cols.forEach(c=>by[c]=[]);let closed=0,nf=0;
    rows.forEach(d=>{if(by[d.stage])by[d.stage].push(d);else if(d.stage===8)closed++;else nf++;});
    cols.forEach(c=>by[c].sort((a,b)=>(b.pri>0)-(a.pri>0)||(a.pri||99)-(b.pri||99)||(b.age||0)-(a.age||0)));
    const lim=this.f.kanLimit;
    const html=cols.map(c=>{const arr=by[c];const st=STAGES[c-1];
      return '<section class="col" '+(sel==c?'style="outline:2px solid var(--accent)"':'')+'><h3><span>'+c+'. '+esc(st.short)+'</span><span class="num">'+arr.length+'</span></h3><div class="small" style="padding:0 4px">'+money(arr.reduce((s,d)=>s+(d.amt||0),0))+'</div><div class="list">'+
        arr.slice(0,lim).map(d=>this.pcard(d)).join('')+(arr.length>lim?'<button class="btn sm" data-act="morekan">Show '+Math.min(40,arr.length-lim)+' more of '+(arr.length-lim)+'</button>':'')+(arr.length?'':'<div class="empty">Nothing here</div>')+'</div></section>';}).join('');
    return '<div class="toolbar"><h2>Pipeline</h2><span class="small">Every open PO, by stage. Flagged POs come first. Closed: '+inr(closed)+' delivered and done, '+inr(nf)+' not fulfilled.</span></div><div class="kan">'+html+'</div>';
  },
  pcard(d){const tone=d.pri?FLAGS[d.pri].tone:'';return '<button class="pcard '+tone+'" data-act="po" data-arg="'+esc(d.po)+'"><span class="t"><span class="mono">'+esc(d.po)+'</span><span class="num"><b>'+(d.value?money(d.value):'')+'</b></span></span><span class="m">'+(this.f.plat==='ALL'?'<span class="pl">'+pn(d.plat)+'</span>':'')+''+(d.age!=null?'<span>'+d.age+'d old</span>':'')+(d.exp?'<span>'+(d.dte<0?'expired '+(-d.dte)+'d ago':'expires in '+d.dte+'d')+'</span>':'')+'</span>'+(d.pri?flagTag(d):'')+'</button>';},
  /* ---------- WORKLIST ---------- */
  wlRows(){
    const f=this.f;let r=this.period().filter(d=>d.pri>0);
    if(f.flag!=='ALL')r=r.filter(d=>d.pri==f.flag);
    if(f.team!=='ALL')r=r.filter(d=>FLAGS[d.pri].team===f.team);
    if(f.q)r=r.filter(d=>d.po.indexOf(normPo(f.q))>=0);
    r.sort((a,b)=>a.pri-b.pri||(b.value||0)-(a.value||0));return r;
  },
  quick(d){
    if(!S.edit)return '<button class="btn sm" data-act="po" data-arg="'+esc(d.po)+'">Open</button>';
    if(d.stage===1)return '<button class="btn sm" data-act="accept" data-arg="'+esc(d.po)+'">Accept</button> <button class="btn sm" data-act="po" data-arg="'+esc(d.po)+'">Decline…</button>';
    if(d.stage===2)return '<button class="btn sm" data-act="handed" data-arg="'+esc(d.po)+'">Handed to WH</button>';
    if(d.stage===3)return '<button class="btn sm" data-act="ack" data-arg="'+esc(d.po)+'">WH acknowledged</button>';
    return '<button class="btn sm" data-act="po" data-arg="'+esc(d.po)+'">Open</button>';
  },
  v_worklist(){
    const f=this.f,r=this.wlRows(),shown=r.slice(0,f.wlLimit);
    const teams=['Order desk','Warehouse','Logistics','Accounts'];
    const opt=(a,v,l)=>'<option value="'+esc(a)+'"'+(String(v)===String(a)?' selected':'')+'>'+esc(l)+'</option>';
    const body=shown.map(d=>{const fl=FLAGS[d.pri];return '<tr class="click" data-act="po" data-arg="'+esc(d.po)+'"><td>'+flagTag(d)+'</td><td class="mono">'+esc(d.po)+'</td>'+(this.f.plat==='ALL'?'<td>'+pn(d.plat)+'</td>':'')+'<td>'+esc(d.loc)+'</td><td class="num">'+(d.exp?fd(d.exp)+' <span class="small">('+(d.dte<0?d.dte:'+'+d.dte)+'d)</span>':'')+'</td><td class="r num">'+(d.value?inr(d.value):'')+'</td><td class="r num">'+(d.age==null?'':d.age)+'</td><td>'+esc(fl.team)+'</td><td>'+esc(fl.act)+(d.openIssues?' <span class="tag info">'+d.openIssues+' issue</span>':'')+'</td><td data-stop="1">'+this.quick(d)+'</td></tr>';}).join('');
    return '<div class="toolbar"><h2>Worklist</h2><select id="wl-flag" aria-label="Flag">'+opt('ALL',f.flag,'All flags')+FLAGS.slice(1).map(x=>opt(x.n,f.flag,x.name)).join('')+'</select><select id="wl-team" aria-label="Team">'+opt('ALL',f.team,'All teams')+teams.map(t=>opt(t,f.team,t)).join('')+'</select><input type="text" id="wl-q" placeholder="Filter by PO number" value="'+esc(f.q)+'" aria-label="Filter by PO number"><span class="grow"></span><span class="small">'+inr(r.length)+' POs · '+money(r.reduce((s,d)=>s+(d.value||0),0))+'</span><button class="btn" data-act="copywl">Copy as table</button></div>'+
      '<div class="tablewrap"><table><thead><tr><th>Flag</th><th>PO</th>'+(this.f.plat==='ALL'?'<th>Platform</th>':'')+'<th>Facility</th><th>Expiry</th><th class="r">Value ₹</th><th class="r">Age d</th><th>Owner</th><th>Next action</th><th>Quick</th></tr></thead><tbody>'+(body||'<tr><td colspan="10" class="empty">No POs need action with these filters.</td></tr>')+'</tbody></table></div>'+(r.length>shown.length?'<p><button class="btn" data-act="morewl">Show '+Math.min(100,r.length-shown.length)+' more ('+(r.length-shown.length)+' left)</button></p>':'');
  },
  /* ---------- HANDOVER CHECK ---------- */
  parseList(){return Array.from(new Set(this.hand.text.split(/[\s,;]+/).map(normPo).filter(x=>x.length>=5)));},
  v_handover(){
    const h=this.hand,list=this.parseList();const known=[],unknown=[];list.forEach(p=>(S.byPo.get(p)?known:unknown).push(p));
    const modes=[['accept','Accepted at order desk'],['handed','Handed to warehouse'],['ack','Warehouse acknowledged'],['decline','Declined']];
    const today=S.asof;
    const RS=this.rows();const handedToday=RS.filter(d=>d.handed===today),ackToday=RS.filter(d=>d.ack===today),accToday=RS.filter(d=>d.printout===today);
    const gap=RS.filter(d=>d.dec==='Accepted'&&d.inv.n===0&&d.printout&&!d.ack);
    const gapRows=gap.sort((a,b)=>(a.printout<b.printout?-1:1)).slice(0,60).map(d=>'<tr class="click" data-act="po" data-arg="'+esc(d.po)+'"><td class="mono">'+esc(d.po)+'</td><td>'+pn(d.plat)+'</td><td class="num">'+fd(d.printout)+'</td><td class="num">'+(d.handed?fd(d.handed)+(d.handedTo?' <span class="small">→ '+esc(d.handedTo)+'</span>':''):'<span class="tag warn">not handed</span>')+'</td><td class="num">'+(d.ack?fd(d.ack):'<span class="tag crit">not acknowledged</span>')+'</td><td class="r num">'+(d.value?inr(d.value):'')+'</td></tr>').join('');
    return '<div class="toolbar"><h2>Handover check</h2><span class="small">Paste the PO numbers from a stack of printouts. The app marks them and shows which accepted POs never reached the warehouse.</span></div>'+
      '<div class="grid g2"><section class="card"><h2>1. Record a batch</h2><div class="sub">One PO number per line, or separated by spaces or commas.</div><div class="seg" style="margin-bottom:10px">'+modes.map(m=>'<button data-act="hmode" data-arg="'+m[0]+'" aria-pressed="'+(h.mode===m[0])+'">'+m[1]+'</button>').join('')+'</div>'+
      (h.mode==='decline'?'<label class="small">Reason <select id="h-reason">'+REASONS.map(r=>'<option'+(h.reason===r?' selected':'')+'>'+esc(r)+'</option>').join('')+'</select></label><br><br>':'')+
      (h.mode==='handed'||h.mode==='ack'?'<label class="small">'+(h.mode==='handed'?'Handed to (warehouse person)':'Acknowledged by (warehouse person)')+' <input type="text" id="h-person" list="people-list" value="'+esc(h.person)+'" placeholder="Name" style="height:34px;border:1px solid var(--line);border-radius:8px;padding:0 10px;background:var(--surface);min-width:240px"></label><br><br>':'')+
      '<textarea class="big" id="h-text" aria-label="PO numbers" placeholder="1234567890123\n9876543210987\nP1234567">'+esc(h.text)+'</textarea>'+
      '<p class="small" id="h-preview"><b>'+known.length+'</b> found in the system'+(unknown.length?', <b style="color:var(--crit)">'+unknown.length+'</b> not found: '+unknown.slice(0,6).map(esc).join(', ')+(unknown.length>6?'…':''):'')+'. Date used: today ('+fd(today)+').</p>'+
      '<div class="toolbar" id="h-actions"><button class="btn pri" data-act="happly"'+(known.length||unknown.length?'':' disabled')+'>Apply to '+known.length+' PO'+(known.length===1?'':'s')+'</button>'+(unknown.length?'<button class="btn" data-act="happlynew">Create '+unknown.length+' missing PO'+(unknown.length===1?'':'s')+' and apply</button>':'')+'</div></section>'+
      '<section class="card"><h2>Today at a glance</h2><div class="sub">'+fd(today)+'</div><div class="grid g3" style="grid-template-columns:repeat(3,1fr)"><div><div class="mono" style="font-size:26px">'+accToday.length+'</div><div class="small">printouts received</div></div><div><div class="mono" style="font-size:26px">'+handedToday.length+'</div><div class="small">handed to warehouse</div></div><div><div class="mono" style="font-size:26px">'+ackToday.length+'</div><div class="small">acknowledged</div></div></div><p class="small">Everything accepted and not yet dispatched should appear in the list below until the warehouse acknowledges it, then in the Worklist until it ships.</p></section></div>'+
      '<h2 style="margin:16px 0 4px">2. Who is holding the printouts</h2><div class="small" style="margin-bottom:8px">Accepted POs handed to the warehouse and not dispatched yet, grouped by the person they were handed to.</div>'+this.holdTable(RS)+
      '<h2 style="margin:16px 0 8px">3. Printouts received but not yet acknowledged by the warehouse ('+gap.length+')</h2><div class="tablewrap"><table><thead><tr><th>PO</th><th>Platform</th><th>Printout received</th><th>Handed</th><th>Warehouse ack</th><th class="r">Value ₹</th></tr></thead><tbody>'+(gapRows||'<tr><td colspan="6" class="empty">Nothing outstanding. Every printout recorded here has been acknowledged.</td></tr>')+'</tbody></table></div>';
  },
  /* ---------- PLATFORMS ---------- */
  v_platforms(){
    const rows=PLATS.map(p=>{const R=S.D.filter(d=>d.plat===p&&(this.inP(d)));return {p,a:aggregate(R),open:S.issues.filter(i=>i.plat===p&&i.status!=='Resolved').length};}).filter(x=>x.a.n);
    const tot=aggregate(this.period().length?S.D.filter(d=>this.inP(d)):[]);
    const tr=(l,a,open,bold)=>'<tr'+(bold?' style="font-weight:700;background:var(--surface2)"':' class="click" data-act="plat" data-arg="'+esc(l)+'"')+'><td>'+(l==='All platforms'?esc(l):pn(l))+'</td><td class="r num">'+inr(a.n)+'</td><td class="r num">'+inr(a.value)+'</td><td class="r num">'+inr(a.accepted)+'</td><td class="r num">'+inr(a.notFul)+'</td><td class="r num" '+(a.undecided?'style="color:var(--warn);font-weight:700"':'')+'>'+inr(a.undecided)+'</td><td class="r num">'+inr(a.accNotDisp)+'</td><td class="r num">'+inr(a.dispatched)+'</td><td class="r num">'+inr(a.invoiced)+'</td><td class="r num" '+(a.fill<.7?'style="color:var(--crit);font-weight:700"':'')+'>'+pct(a.fill)+'</td><td class="r num">'+a.transit+'</td><td class="r num">'+a.grnP+'</td><td class="r num">'+a.rto+'</td><td class="r num" '+(a.flags?'style="color:var(--crit);font-weight:700"':'')+'>'+a.flags+'</td><td class="r num">'+inr(a.undecidedValue)+'</td><td class="r num">'+open+'</td></tr>';
    return '<div class="toolbar"><h2>Platform scorecard</h2><span class="small">All platforms side by side for '+fd(this.f.from)+' to '+fd(this.f.to)+'. Click a row to open that platform\'s own control tower.</span></div><div class="tablewrap"><table><thead><tr><th>Platform</th><th class="r">POs</th><th class="r">PO value ₹</th><th class="r">Accepted</th><th class="r">Not fulfilled</th><th class="r">Awaiting decision</th><th class="r">Acc., not dispatched</th><th class="r">Dispatched</th><th class="r">Invoiced ₹</th><th class="r">Fill rate</th><th class="r">In transit</th><th class="r">GRN pending</th><th class="r">With RTO</th><th class="r">Action items</th><th class="r">Undecided ₹</th><th class="r">Open issues</th></tr></thead><tbody>'+rows.map(x=>tr(x.p,x.a,x.open)).join('')+tr('All platforms',tot,S.issues.filter(i=>i.status!=='Resolved').length,true)+'</tbody></table></div>';
  },
  /* ---------- DAILY RECON ---------- */
  v_recon(){
    const rows=this.rows();const out=[];
    for(let n=0;n<30;n++){
      const day=addDays(S.asof,-n);const R=rows.filter(d=>d.date===day);
      const c={day,rec:R.length,disp:R.filter(d=>d.inv.n>0).length,nf:R.filter(d=>d.stage===9).length,und:R.filter(d=>d.stage===1).length,nh:R.filter(d=>d.stage===2).length,wh:R.filter(d=>d.stage===3||d.stage===4).length,val:R.filter(d=>d.stage<=4).reduce((s,d)=>s+(d.amt||0),0)};
      c.open=c.und+c.nh+c.wh;c.st=!c.rec?'':!c.open?'Reconciled':(n>S.cfg.sla_dispatch?'UNRESOLVED':'In progress');out.push(c);
    }
    const tone={Reconciled:'ok','In progress':'warn',UNRESOLVED:'crit'};
    const tot=out.reduce((a,c)=>{['rec','disp','nf','und','nh','wh','val'].forEach(k=>a[k]=(a[k]||0)+c[k]);return a;},{});
    return '<div class="toolbar"><h2>Daily reconciliation</h2><span class="small">For each PO date: received = dispatched + not fulfilled + still open. A day older than the dispatch SLA ('+S.cfg.sla_dispatch+' days) that still has open POs is UNRESOLVED.</span></div><div class="tablewrap"><table><thead><tr><th>PO date</th><th class="r">Received</th><th class="r">Dispatched</th><th class="r">Declined, cancelled, expired</th><th class="r">Awaiting decision</th><th class="r">Accepted, not handed over</th><th class="r">With warehouse, not dispatched</th><th class="r">Open value ₹</th><th>Status</th></tr></thead><tbody>'+
      out.map(c=>'<tr class="'+(c.open?'click':'')+'" '+(c.open?'data-act="day" data-arg="'+c.day+'"':'')+'><td class="num">'+fd(c.day)+'</td><td class="r num">'+c.rec+'</td><td class="r num">'+c.disp+'</td><td class="r num">'+c.nf+'</td><td class="r num">'+c.und+'</td><td class="r num">'+c.nh+'</td><td class="r num">'+c.wh+'</td><td class="r num">'+inr(c.val)+'</td><td>'+(c.st?'<span class="tag '+tone[c.st]+'">'+(c.st==='UNRESOLVED'?c.open+' open · unresolved':c.st)+'</span>':'')+'</td></tr>').join('')+
      '<tr style="font-weight:700;background:var(--surface2)"><td>Last 30 days</td><td class="r num">'+tot.rec+'</td><td class="r num">'+tot.disp+'</td><td class="r num">'+tot.nf+'</td><td class="r num">'+tot.und+'</td><td class="r num">'+tot.nh+'</td><td class="r num">'+tot.wh+'</td><td class="r num">'+inr(tot.val)+'</td><td></td></tr></tbody></table></div>';
  },
  /* ---------- ISSUES (CRM) ---------- */
  v_issues(){
    let L=S.issues.slice();if(this.f.plat!=='ALL')L=L.filter(i=>i.plat===this.f.plat);
    const open=L.filter(i=>i.status!=='Resolved'),over=open.filter(i=>i.next&&i.next<S.asof);
    const col=st=>{const a=L.filter(i=>i.status===st).sort((a,b)=>(PRIORITIES.indexOf(a.prio)-PRIORITIES.indexOf(b.prio))||((a.next||'9')<(b.next||'9')?-1:1));
      return '<section class="col"><h3><span>'+st+'</span><span class="num">'+a.length+'</span></h3><div class="list">'+a.slice(0,60).map(i=>{const od=i.status!=='Resolved'&&i.next&&i.next<S.asof;const days=diff(i.resolved||S.asof,i.raised);
        return '<button class="pcard '+(od?'crit':i.prio==='High'?'warn':'')+'" data-act="issue" data-arg="'+esc(i.id)+'"><span class="t"><b>'+esc(i.type)+'</b><span class="tag '+(i.prio==='High'?'warn':'mute')+'">'+esc(i.prio)+'</span></span><span class="mono">'+esc(i.po)+'</span><span class="m"><span class="pl">'+pn(i.plat)+'</span><span>'+esc(i.owner||'unassigned')+'</span><span>'+(days==null?'':days+'d open')+'</span></span><span class="small">'+esc((i.desc||'').slice(0,90))+'</span>'+(i.next&&i.status!=='Resolved'?'<span class="tag '+(od?'crit':'mute')+'">'+(od?'Follow-up overdue: ':'Follow up: ')+fd(i.next)+'</span>':'')+'</button>';}).join('')+(a.length?'':'<div class="empty">None</div>')+'</div></section>';};
    return '<div class="toolbar"><h2>Issues</h2><span class="small">'+open.length+' open · <b style="color:'+(over.length?'var(--crit)':'inherit')+'">'+over.length+' follow-ups overdue</b></span><span class="grow"></span><button class="btn pri" data-act="newissue">+ Log an issue</button></div><div class="kan">'+ISSUE_STATUS.map(col).join('')+'</div>';
  },
  /* ---------- SETTINGS ---------- */
  v_settings(){
    const names={sla_decision:'Decision SLA (days)',sla_handover:'Handover SLA (days)',sla_ack:'Warehouse acknowledgement SLA (days)',sla_dispatch:'Dispatch SLA from PO date (days)',expiry_warn:'Expiry warning (days)',sla_transit:'Transit overdue (days)',sla_grn:'GRN pending after dispatch (days)',legacy_days:'Legacy backlog after (days)',cn_days:'Credit-note window (days)'};
    const link=id=>'https://docs.google.com/spreadsheets/d/'+id+'/edit';
    return '<div class="grid g2"><section class="card"><h2>Rules and deadlines</h2><div class="sub">Every flag in the app reads these. Saved to the Settings tab of the tracking sheet.</div><div class="form">'+Object.keys(names).map(k=>'<label>'+names[k]+'<input type="number" min="0" id="cfg-'+k+'" value="'+S.cfg[k]+'"></label>').join('')+'</div><p><button class="btn pri" data-act="savecfg">Save rules</button></p></section>'+
      '<section class="card"><h2>Connection</h2><div class="sub">'+(S.mode==='live'?'Connected to Google Sheets.':'Not connected. The app is showing its saved snapshot.')+'</div>'+
      '<dl class="kv"><dt>Access</dt><dd>'+(S.edit?'Editing as <b>'+esc(S.user)+'</b>':'View only')+'</dd><dt>Reads from</dt><dd class="links"><a href="'+link(SRC_ID)+'" target="_blank" rel="noopener">Warehouse Master FY2627</a> (read only)</dd><dt>Writes to</dt><dd class="links"><a href="'+link(TRK_ID)+'" target="_blank" rel="noopener">PO Control Tower - Tracking</a></dd>'+(S.counts.pos?'<dt>Last read</dt><dd>'+S.counts.pos+' POs, '+S.counts.invoices+' invoices</dd>':'')+'</dl>'+
      '<p><button class="btn" data-act="reload"'+(S.busy?' disabled':'')+'>Reconnect and reload</button></p><div class="small">'+S.diag.map(esc).join('<br>')+'</div></section></div>'+
      '<section class="card" style="margin-top:12px"><h2>Who can edit</h2><div class="sub">The app opens in view-only mode for everyone. An editor unlocks it with a name and PIN, and every change is logged under that name.</div>'+(S.edit?'<div class="form"><label>New editor PIN<input type="password" id="new-pin" autocomplete="off" placeholder="At least 4 characters"></label></div><p><button class="btn" data-act="savepin">Change PIN</button></p>':'<p><button class="btn pri" data-act="unlock">Unlock editing</button></p>')+'<div class="small">The PIN stops accidental edits. For a hard lock, share the tracking sheet with the checker as Viewer in Google Sheets.</div></section>'+
      '<section class="card" style="margin-top:12px"><h2>How the app decides</h2><div class="sub">Plain-language rules</div><ul style="margin:0;padding-left:18px;line-height:1.7"><li>A PO with an invoice in DISPATCH + GRN counts as accepted and dispatched. Delivery and GRN come from the same row.</li><li>A PO with no invoice stays open until someone sets it to Declined, Cancelled or Expired with a reason. Nothing disappears silently.</li><li>Accepted POs must be handed to the warehouse, acknowledged, then dispatched within the SLAs above, or they show on the Worklist.</li><li>Your Warehouse Master is never edited. Everything entered here goes to the tracking sheet.</li></ul></section>';
  },
  /* ---------- DRAWER ---------- */
  openDrawer(d){this.drawer=d;this.drawerRender();},
  closeDrawer(){this.drawer=null;this.drawerRender();},
  dateField(id,val){return '<div class="dline"><input type="date" id="'+id+'" value="'+esc(val||'')+'"><button type="button" class="btn sm" data-act="today" data-arg="'+id+'">Today</button></div>';},
  sel(id,arr,val,blank){return '<select id="'+id+'">'+(blank?'<option value="">'+blank+'</option>':'')+arr.map(a=>'<option'+(a===val?' selected':'')+'>'+esc(a)+'</option>').join('')+'</select>';},
  drawerRender(){
    const dr=$('#drawer'),sc=$('#scrim');const d=this.drawer;
    if(!d){dr.hidden=true;sc.hidden=true;return;}
    dr.hidden=false;sc.hidden=false;let h='';
    if(d.type==='po'){
      const x=S.byPo.get(d.po);if(!x){this.drawer=null;dr.hidden=true;sc.hidden=true;return;}
      const a=x.inv;const mk=(t,v,st)=>'<div class="step '+(st||'')+'"><b>'+t+'</b><span>'+(v||'—')+'</span></div>';
      const p=x.pri,delivered=a.deliv>0;const lastDeliv=a.list.map(l=>l.deliv).filter(Boolean).sort().pop();
      const steps=this.poSteps(x);
      const inv=a.list.length?'<div class="tablewrap"><table><thead><tr><th>Invoice</th><th>Dispatched</th><th class="r">Value</th><th>Partner / AWB</th><th>Status</th><th>Delivered</th><th>GRN</th><th class="r">Short / dmg / excess</th></tr></thead><tbody>'+a.list.map(l=>'<tr><td class="mono">'+esc(l.inv)+'</td><td class="num">'+fd(l.disp)+'</td><td class="r num">'+inr(l.val)+'</td><td>'+esc(l.status)+'</td><td>'+esc(l.grn)+'</td><td class="r num">'+inr((l.sv||0)+(l.dv||0))+'</td></tr>').join('')+'</tbody></table></div>':'<div class="small">No invoice yet.</div>';
      const iss=S.issues.filter(i=>i.po===x.po);const hist=S.act.filter(r=>r.po===x.po).slice(-8).reverse();
      h='<div class="hd"><div><div class="mono" style="font-size:16px">'+esc(x.po)+'</div><div class="small">'+pn(x.plat)+(x.loc?' · '+esc(x.loc):'')+' · '+(x.value?money(x.value):'no value')+(x.qty?' · '+inr(x.qty)+' units':'')+'</div><div style="margin-top:6px"><span class="tag '+TONE_STAGE[x.stage]+'">Stage '+x.stage+': '+esc(STAGES[x.stage-1].name)+'</span> '+flagTag(x)+'</div></div><button class="btn sm" data-act="close" aria-label="Close">Close</button></div>'+
        '<div class="bd">'+(x.pri?'<div class="banner" style="margin:0"><b>'+esc(FLAGS[x.pri].team)+':</b> '+esc(FLAGS[x.pri].act)+'</div>':'')+steps+
        '<div><h3 style="margin-bottom:8px">Update this PO</h3><div class="form"><label>Decision'+this.sel('e-dec',DECISIONS,x.dec)+'</label><label>Reason'+this.sel('e-reason',REASONS,x.reason,'—')+'</label><label>Printout received on'+this.dateField('e-printout',x.printout)+'</label><label>Handed to warehouse on'+this.dateField('e-handed',x.handed)+'</label><label>Handed to (person)<input type="text" id="e-handedTo" list="people-list" value="'+esc(x.handedTo)+'"></label><label>Warehouse acknowledged on'+this.dateField('e-ack',x.ack)+'</label><label>Acknowledged by<input type="text" id="e-ackBy" list="people-list" value="'+esc(x.ackBy)+'"></label><label>E-way bill no.<input type="text" id="e-ewb" class="mono" value="'+esc(x.ewb)+'"></label><label>Owner<input type="text" id="e-owner" value="'+esc(x.owner)+'"></label><label>PO expiry'+this.dateField('e-exp',x.exp)+'</label><label class="full">Remarks<textarea id="e-rem">'+esc((S.trk[x.po]||{}).rem||'')+'</textarea></label></div><p><button class="btn pri" data-act="savepo" data-arg="'+esc(x.po)+'">Save</button> <button class="btn" data-act="newissue" data-arg="'+esc(x.po)+'">Log an issue</button></p></div>'+
        '<div><h3 style="margin-bottom:8px">Invoices and delivery</h3>'+inv+'</div>'+
        (iss.length?'<div><h3 style="margin-bottom:8px">Issues on this PO</h3>'+iss.map(i=>'<button class="pcard" data-act="issue" data-arg="'+esc(i.id)+'" style="width:100%;margin-bottom:6px"><span class="t"><b>'+esc(i.type)+'</b><span class="tag mute">'+esc(i.status)+'</span></span><span class="small">'+esc(i.desc)+'</span></button>').join('')+'</div>':'')+
        '<div><h3 style="margin-bottom:8px">Source and history</h3><dl class="kv"><dt>Source</dt><dd>'+esc(x.src)+'</dd>'+(x.rem?'<dt>Notes</dt><dd>'+esc(x.rem)+'</dd>':'')+'</dl>'+(hist.length?'<div class="small" style="margin-top:6px">'+hist.map(r=>esc(r.ts)+' · '+esc(r.action)+' · '+esc(r.detail)+(r.by?' · '+esc(r.by):'')).join('<br>')+'</div>':'')+'</div></div>';
    }else if(d.type==='issue'){
      const x=d.issue;
      h='<div class="hd"><div><h2>'+(x.isNew?'Log an issue':esc(x.id))+'</h2><div class="small">Anything that cannot be fixed in a day gets an owner and a follow-up date.</div></div><button class="btn sm" data-act="close">Close</button></div><div class="bd"><div class="form"><label>PO number<input type="text" id="i-po" class="mono" value="'+esc(x.po)+'"></label><label>Issue type'+this.sel('i-type',ISSUE_TYPES,x.type)+'</label><label class="full">What happened<textarea id="i-desc">'+esc(x.desc)+'</textarea></label><label>Owner<input type="text" id="i-owner" value="'+esc(x.owner)+'"></label><label>Priority'+this.sel('i-prio',PRIORITIES,x.prio)+'</label><label>Status'+this.sel('i-status',ISSUE_STATUS,x.status)+'</label><label>Next follow-up'+this.dateField('i-next',x.next)+'</label><label class="full">Latest note<textarea id="i-note">'+esc(x.note)+'</textarea></label><label class="full">Resolution<textarea id="i-res">'+esc(x.resolution)+'</textarea></label></div><p><button class="btn pri" data-act="saveissue">Save</button></p></div>';
    }else if(d.type==='newpo'){
      h='<div class="hd"><div><h2>Add a PO</h2><div class="small">Use this for a PO that is not in the Order Book yet. It is tracked from now on.</div></div><button class="btn sm" data-act="close">Close</button></div><div class="bd"><div class="form"><label>PO number<input type="text" id="n-po" class="mono"></label><label>Platform'+this.sel('n-plat',PLATS,this.f.plat==='ALL'?'Blinkit':this.f.plat)+'</label><label>PO date'+this.dateField('n-date',S.asof)+'</label><label>PO expiry'+this.dateField('n-exp','')+'</label><label>Facility / hub<input type="text" id="n-loc"></label><label>Quantity<input type="number" id="n-qty" min="0"></label><label>PO value ₹<input type="number" id="n-amt" min="0"></label><label>Decision'+this.sel('n-dec',DECISIONS,'Accepted')+'</label></div><p><button class="btn pri" data-act="savenewpo">Add PO</button></p></div>';
    }else if(d.type==='day'){
      const R=this.rows().filter(x=>x.date===d.day&&x.stage<=4);
      h='<div class="hd"><div><h2>Open POs from '+fd(d.day)+'</h2><div class="small">'+R.length+' still open</div></div><button class="btn sm" data-act="close">Close</button></div><div class="bd"><div class="tablewrap"><table><thead><tr><th>PO</th><th>Platform</th><th>Stage</th><th class="r">Value ₹</th></tr></thead><tbody>'+R.map(x=>'<tr class="click" data-act="po" data-arg="'+esc(x.po)+'"><td class="mono">'+esc(x.po)+'</td><td>'+pn(x.plat)+'</td><td>'+esc(STAGES[x.stage-1].short)+'</td><td class="r num">'+inr(x.amt)+'</td></tr>').join('')+'</tbody></table></div></div>';
    }
    dr.innerHTML=h;
  }
};
