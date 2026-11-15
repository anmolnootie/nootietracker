/* ===== Shell: sidebar, top bar, home, PO register, editor / view-only access ===== */
const PERIODS=[['fy','This financial year'],['90d','Last 90 days'],['30d','Last 30 days'],['7d','Last 7 days'],['month','This month'],['all','All time']];
const WRITE_ACTS=['accept','handed','ack','savepo','newissue','saveissue','newpo','savenewpo','happly','happlynew','savecfg','savepin','dohand1'];
const TABS=[['overview','Overview'],['pipeline','Pipeline'],['register','All POs'],['worklist','Worklist'],['handover','Handover check'],['recon','Daily recon'],['issues','Issues'],['platforms','Compare platforms']];
const ICON={
  home:'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  all:'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  cog:'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
  lock:'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 118 0v4"/></svg>',
  pen:'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>'
};
function lblPlat(p){return PLATS.indexOf(p)>=0?p:'Other';}
Object.assign(UI,{
  view:'home',pkey:'fy',
  rgDefault(){return {q:'',stage:'ALL',dec:'ALL',flag:'ALL',fac:'ALL',sort:'new',page:0};},
  setPeriod(k){
    const a=S.asof,f=this.f;this.pkey=k;f.to=a;
    f.from=k==='fy'?'2026-04-01':k==='90d'?addDays(a,-90):k==='30d'?addDays(a,-30):k==='7d'?addDays(a,-7):k==='month'?a.slice(0,8)+'01':'2000-01-01';
  },
  goScope(p,v){const f=this.f;f.plat=p;f.flag='ALL';f.team='ALL';f.q='';f.stage=undefined;f.wlLimit=100;f.kanLimit=40;f.rg=this.rgDefault();this.view=v||'overview';},
  platStats(){
    const m={};PLATS.forEach(p=>m[p]={n:0,act:0});
    S.D.forEach(d=>{if(!this.inP(d))return;const o=m[d.plat]||(m[d.plat]={n:0,act:0});o.n++;if(d.pri>=1&&d.pri<=6)o.act++;});
    return m;
  },
  /* ---------- sidebar ---------- */
  renderSide(){
    const st=this.platStats(),P=this.f.plat,v=this.view,scoped=v!=='home'&&v!=='settings';
    const totalAct=Object.keys(st).reduce((s,k)=>s+st[k].act,0);
    const item=(act,arg,label,on,badge,logo,sub)=>'<button class="sb-item'+(on?' on':'')+'" data-act="'+act+'" data-arg="'+esc(arg||'')+'"'+(on?' aria-current="page"':'')+'>'+logo+'<span class="lb">'+esc(label)+(sub?'<small>'+sub+'</small>':'')+'</span>'+(badge?'<span class="bd" title="'+badge+' items need action">'+inr(badge)+'</span>':'')+'</button>';
    const plats=PLATS.filter(p=>p!=='Other'||(st.Other&&st.Other.n));
    const acc=S.edit
      ?'<div class="acc edit"><div class="al">'+ICON.pen+'<span><b>Editing</b><small>as '+esc(S.user)+'</small></span></div><button class="btn sm" data-act="lock">Lock</button></div>'
      :'<div class="acc"><div class="al">'+ICON.lock+'<span><b>View only</b><small>Look, search, export</small></span></div><button class="btn sm pri" data-act="unlock">Unlock editing</button></div>';
    $('#side').innerHTML='<div class="sb-brand"><div class="sb-logo"><img src="'+NOOTIE_LOGO+'" alt="Nootie"></div><b>PO Control Tower</b><span>Every PO, order to GRN</span></div><nav class="sb-nav" aria-label="Choose a view">'+
      item('home','','Home',v==='home',0,ICON.home)+
      item('scope','ALL','Overall control tower',scoped&&P==='ALL',totalAct,ICON.all,'All platforms together')+
      '<div class="sb-h">Platform control towers</div>'+
      plats.map(p=>item('scope',p,p,scoped&&P===p,(st[p]||{}).act,plogo(p,1).replace('class="plogo','class="plogo sb'))).join('')+'</nav>'+
      '<div class="sb-foot">'+item('tab','settings','Settings & access',v==='settings',0,ICON.cog)+acc+'<div class="sb-conn"><span id="conn" class="pill snap"></span><button class="btn sm" id="refresh" data-act="reload">Refresh</button></div></div>';
  },
  /* ---------- top bar ---------- */
  renderTop(){
    const v=this.view,P=this.f.plat;let title,crumb,logo='';
    if(v==='home'){title='Home';crumb='Choose what you want to look at';}
    else if(v==='settings'){title='Settings & access';crumb='Rules, connection and who can edit';}
    else if(P==='ALL'){title='Overall control tower';crumb='All platforms together';}
    else{title=P+' control tower';crumb='Only '+P+' POs';logo=plogo(P).replace('class="plogo','class="plogo xl');}
    const per=v==='settings'?'':'<label class="field">Period<select id="f-period">'+PERIODS.map(p=>'<option value="'+p[0]+'"'+(this.pkey===p[0]?' selected':'')+'>'+p[1]+'</option>').join('')+'</select></label>';
    const q=(document.getElementById('q')||{}).value||'';
    $('#topbar').innerHTML='<div class="tb-title">'+logo+'<div><div class="small">'+esc(crumb)+'</div><h1>'+esc(title)+'</h1></div></div><span class="grow"></span>'+per+
      '<div class="search"><input id="q" type="search" placeholder="Find any PO number" aria-label="Find any PO number" autocomplete="off" value="'+esc(q)+'"><div id="results" class="results" hidden></div></div><button class="btn pri ed" data-act="newpo">+ Add PO</button>';
  },
  status(){
    const el=$('#conn');if(!el)return;
    if(S.busy){el.className='pill snap busy';el.innerHTML='<i></i>Connecting';}
    else if(S.mode==='live'){el.className='pill live';el.innerHTML='<i></i>Live · '+(S.lastSync?pad(S.lastSync.getHours())+':'+pad(S.lastSync.getMinutes()):'');}
    else{el.className='pill snap';el.innerHTML='<i></i>Snapshot '+fd(SNAP.asOf);}
    const r=$('#refresh');if(r)r.disabled=S.busy;
  },
  render(){
    if(this.f.to!==S.asof&&S.asof&&this.pkey!=='custom'&&this.pkey!=='last')this.setPeriod(this.pkey);
    document.body.classList.toggle('viewonly',!S.edit);
    this.renderSide();this.renderTop();this.status();
    const v=this.view,P=this.f.plat,tb=$('#tabs');
    if(v==='home'||v==='settings'){tb.innerHTML='';tb.hidden=true;}
    else{
      const act=this.rows().filter(d=>d.pri>=1&&d.pri<=6).length,iss=S.issues.filter(i=>i.status!=='Resolved'&&(P==='ALL'||i.plat===P)).length;
      tb.hidden=false;
      tb.innerHTML=TABS.filter(t=>P==='ALL'||t[0]!=='platforms').map(t=>'<button role="tab" aria-selected="'+(v===t[0])+'" data-act="tab" data-arg="'+t[0]+'">'+t[1]+(t[0]==='worklist'&&act?' <span class="cnt">'+act+'</span>':'')+(t[0]==='issues'&&iss?' <span class="cnt info">'+iss+'</span>':'')+'</button>').join('');
    }
    const bn=[];
    if(S.mode!=='live')bn.push('<div class="banner">'+(S.err?esc(S.err)+' ':'')+'You are looking at the saved snapshot from '+fd(SNAP.asOf)+'. Entries you make are kept on this device only until the app is connected to Google Sheets (see Settings).</div>');
    else if(S.err)bn.push('<div class="banner err">'+esc(S.err)+'</div>');
    if(!S.edit&&(v==='handover'||v==='issues'))bn.push('<div class="lockbar">'+ICON.lock+'<span><b>View only.</b> You can look at everything, but changes need an editor.</span><button class="btn sm pri" data-act="unlock">Unlock editing</button></div>');
    const fn=this['v_'+v];
    $('#main').innerHTML=bn.join('')+(fn?fn.call(this):'')+'<datalist id="people-list">'+this.people().map(p=>'<option value="'+esc(p)+'">').join('')+'</datalist>';
    if(!S.edit)this.lockMain();
    this.drawerRender();
  },
  lockMain(){
    const m=$('#main');
    m.querySelectorAll(WRITE_ACTS.map(a=>'[data-act="'+a+'"]').join(',')).forEach(e=>{if(!e.closest('.lockbar')&&e.getAttribute('data-act')!=='unlock')e.hidden=true;});
    m.querySelectorAll('#h-text,#h-person,#h-reason,[id^="cfg-"],[data-act="hmode"]').forEach(e=>e.disabled=true);
  },
  platGrid(R){
    const stat=(n,l,tone)=>'<div class="st '+(tone||'')+'"><b>'+n+'</b><span>'+l+'</span></div>';
    return PLATS.filter(p=>p!=='Other').concat(R.some(d=>d.plat==='Other')?['Other']:[]).map(p=>{
      const A=aggregate(R.filter(d=>d.plat===p));
      const tone=A.flag[1]+A.flag[2]?'crit':A.undecided>20?'warn':'';
      return '<button class="pc '+tone+(A.n?'':' empty0')+'" data-act="scope" data-arg="'+esc(p)+'"><div class="pc-top">'+plogo(p).replace('class="plogo','class="plogo xl')+'<div><b>'+esc(p)+'</b><span class="small">'+(A.n?inr(A.n)+' POs · '+money(A.value):'No POs in this period')+'</span></div></div>'+
        (A.n?'<div class="pc-stats">'+stat(inr(A.undecided),'awaiting decision',A.undecided?'warn':'')+stat(inr(A.accNotDisp),'not dispatched',A.accNotDisp?'warn':'')+stat(inr(A.flags),'need action',A.flags?'crit':'')+'</div><div class="pc-bar" title="Fill rate"><i style="width:'+Math.min(100,Math.round((A.fill||0)*100))+'%"></i></div><div class="small">Fill rate (invoiced vs PO value): '+pct(A.fill)+'</div>':'')+
        '<span class="go">Open '+esc(p)+' →</span></button>';}).join('');
  },
  /* ---------- HOME ---------- */
  v_home(){
    const R=S.D.filter(d=>this.inP(d)),a=aggregate(R);
    const per=PERIODS.filter(x=>x[0]===this.pkey)[0][1];
    const stat=(n,l,tone)=>'<div class="st '+(tone||'')+'"><b>'+n+'</b><span>'+l+'</span></div>';
    const big='<button class="pc big" data-act="scope" data-arg="ALL"><div class="pc-top"><div class="allicon">'+ICON.all+'</div><div><b>Overall control tower</b><span class="small">All platforms together · '+per+'</span></div></div>'+
      '<div class="pc-stats">'+stat(inr(a.n),'POs received')+stat(inr(a.undecided),'awaiting decision',a.undecided?'warn':'')+stat(inr(a.accNotDisp),'accepted, not dispatched',a.accNotDisp?'warn':'')+stat(inr(a.flags),'need action',a.flags?'crit':'')+'</div><span class="go">Open the overall view →</span></button>';
    const cards=this.platGrid(R);
    const urgent=R.filter(d=>d.pri>=1&&d.pri<=6).sort((x,y)=>x.pri-y.pri||(y.value||0)-(x.value||0)).slice(0,10);
    const rows=urgent.map(d=>'<tr class="click" data-act="po" data-arg="'+esc(d.po)+'"><td>'+flagTag(d)+'</td><td class="mono">'+esc(d.po)+'</td><td>'+pn(d.plat)+'</td><td class="r num">'+(d.value?inr(d.value):'')+'</td><td class="r num">'+(d.age==null?'':d.age)+'</td><td>'+esc(FLAGS[d.pri].team)+': '+esc(FLAGS[d.pri].act)+'</td></tr>').join('');
    return '<section class="welcome"><h2>What do you want to look at?</h2><p>Open the <b>overall control tower</b> to see every platform together, or open a single platform to see only its POs, pipeline, to-dos and issues.</p></section>'+
      '<div class="grid" style="grid-template-columns:1fr">'+big+'</div>'+
      '<h2 class="sec">Or go platform by platform <span class="small">Each platform has its own overview, all POs, pipeline, worklist and issues</span></h2><div class="grid g3">'+cards+'</div>'+
      '<h2 class="sec">Most urgent right now, across all platforms <button class="btn sm" data-act="scope" data-arg="ALL" data-v="worklist">Open the full worklist</button></h2>'+
      '<div class="tablewrap"><table><thead><tr><th>Problem</th><th>PO</th><th>Platform</th><th class="r">Value ₹</th><th class="r">Age (days)</th><th>What to do</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6" class="empty">Nothing urgent. Nice.</td></tr>')+'</tbody></table></div>';
  },
  /* ---------- ALL POs register ---------- */
  regRows(){
    const g=this.f.rg;let r=this.period();
    if(g.q)r=r.filter(d=>d.po.indexOf(normPo(g.q))>=0);
    if(g.stage!=='ALL')r=r.filter(d=>d.stage==g.stage);
    if(g.gap)r=r.filter(d=>this.inGap(d,g.gap));
    if(g.dec!=='ALL')r=r.filter(d=>d.dec===g.dec);
    if(g.flag==='ACT')r=r.filter(d=>d.pri>0&&d.pri<=6);else if(g.flag==='NONE')r=r.filter(d=>!d.pri);else if(g.flag!=='ALL')r=r.filter(d=>d.pri==g.flag);
    if(g.fac!=='ALL')r=r.filter(d=>(d.loc||'(no facility)')===g.fac);
    const dk=d=>d.date||'';const s=g.sort;
    return r.slice().sort(s==='old'?(a,b)=>(dk(a)<dk(b)?-1:dk(a)>dk(b)?1:0):s==='val'?(a,b)=>(b.value||0)-(a.value||0):s==='age'?(a,b)=>(b.age==null?-1:b.age)-(a.age==null?-1:a.age):(a,b)=>(dk(a)<dk(b)?1:dk(a)>dk(b)?-1:0));
  },
  v_register(){
    const g=this.f.rg,P=this.f.plat,all=P==='ALL',PS=50;
    const r=this.regRows();const pages=Math.max(1,Math.ceil(r.length/PS));if(g.page>=pages)g.page=pages-1;
    const shown=r.slice(g.page*PS,g.page*PS+PS);
    const o=(cur,v,l)=>'<option value="'+esc(v)+'"'+(String(cur)===String(v)?' selected':'')+'>'+esc(l)+'</option>';
    const facs=Array.from(new Set(this.period().map(d=>d.loc||'(no facility)'))).sort();
    const filt=(g.gap||g.q||g.stage!=='ALL'||g.dec!=='ALL'||g.flag!=='ALL'||g.fac!=='ALL');
    const body=shown.map(d=>'<tr class="click" data-act="po" data-arg="'+esc(d.po)+'"><td class="mono">'+esc(d.po)+'</td>'+(all?'<td>'+pn(d.plat)+'</td>':'')+'<td class="num">'+fd(d.date)+'</td><td>'+esc(d.loc)+'</td><td class="num">'+(d.exp?fd(d.exp):'')+'</td><td class="r num">'+(d.value?inr(d.value):'')+'</td><td><span class="tag '+TONE_STAGE[d.stage]+'">'+d.stage+'. '+esc(STAGES[d.stage-1].short)+'</span></td><td>'+esc(d.dec)+'</td><td>'+(d.pri?flagTag(d):'<span class="small">—</span>')+'</td><td class="r num">'+(d.inv.n||'')+'</td><td>'+esc(d.owner)+'</td></tr>').join('');
    const pager=pages>1?'<div class="toolbar" style="justify-content:center;margin-top:10px"><button class="btn sm" data-act="rgpage" data-arg="-1"'+(g.page?'':' disabled')+'>← Previous</button><span class="small">Page '+(g.page+1)+' of '+pages+'</span><button class="btn sm" data-act="rgpage" data-arg="1"'+(g.page<pages-1?'':' disabled')+'>Next →</button></div>':'';
    return '<div class="toolbar"><h2>All '+(all?'':esc(P)+' ')+'POs</h2><span class="small">Every PO in the period, with where it stands. Click a row for its full story.</span></div>'+
      (g.gap?'<div class="gapnote">Showing POs that reached “'+esc(JSTEPS.filter(x=>x.k===g.gap)[0].name)+'” but not the next step <button class="btn sm" data-act="rgreset">Clear</button></div>':'')+'<div class="filters"><input type="text" id="rg-q" placeholder="Search PO number" value="'+esc(g.q)+'" aria-label="Search PO number">'+
      '<select id="rg-stage" aria-label="Stage">'+o(g.stage,'ALL','Any stage')+STAGES.map(s=>o(g.stage,s.n,s.n+'. '+s.name)).join('')+'</select>'+
      '<select id="rg-dec" aria-label="Decision">'+o(g.dec,'ALL','Any decision')+DECISIONS.map(x=>o(g.dec,x,x)).join('')+'</select>'+
      '<select id="rg-flag" aria-label="Problem">'+o(g.flag,'ALL','Any problem status')+o(g.flag,'ACT','Needs action now')+o(g.flag,'NONE','No problem')+FLAGS.slice(1).map(x=>o(g.flag,x.n,x.name)).join('')+'</select>'+
      '<select id="rg-fac" aria-label="Facility">'+o(g.fac,'ALL','Any facility')+facs.map(x=>o(g.fac,x,x)).join('')+'</select>'+
      '<select id="rg-sort" aria-label="Sort">'+o(g.sort,'new','Newest first')+o(g.sort,'old','Oldest first')+o(g.sort,'val','Highest value')+o(g.sort,'age','Oldest open (days)')+'</select>'+
      (filt?'<button class="btn sm" data-act="rgreset">Clear filters</button>':'')+'<span class="grow"></span><button class="btn sm" data-act="copyreg">Copy list</button></div>'+
      '<div class="small" style="margin:6px 2px 8px"><b>'+inr(r.length)+'</b> POs · '+money(r.reduce((s,d)=>s+(d.value||0),0))+(r.length>PS?' · showing '+(g.page*PS+1)+'–'+Math.min(r.length,g.page*PS+PS):'')+' · '+this.periodLabel().toLowerCase()+'</div>'+
      '<div class="tablewrap"><table><thead><tr><th>PO number</th>'+(all?'<th>Platform</th>':'')+'<th>PO date</th><th>Facility</th><th>Expiry</th><th class="r">Value ₹</th><th>Stage</th><th>Decision</th><th>Problem</th><th class="r">Invoices</th><th>Owner</th></tr></thead><tbody>'+(body||'<tr><td colspan="'+(all?11:10)+'" class="empty">No POs match these filters.</td></tr>')+'</tbody></table></div>'+pager;
  },
  people(){const m=new Set();Object.keys(S.trk).forEach(k=>{const t=S.trk[k];if(t.handedTo)m.add(t.handedTo);if(t.ackBy)m.add(t.ackBy);});return Array.from(m).sort();},
  holdTable(R){
    const today=S.asof,g=new Map();
    R.filter(d=>d.dec==='Accepted'&&d.handed&&d.inv.n===0).forEach(d=>{
      const k=d.handedTo||'(person not recorded)';const o=g.get(k)||{n:0,v:0,ack:0,tod:0,old:null};
      o.n++;o.v+=d.value||0;if(d.ack)o.ack++;if(d.handed===today)o.tod++;if(!o.old||d.handed<o.old)o.old=d.handed;g.set(k,o);});
    const rows=Array.from(g).sort((a,b)=>b[1].n-a[1].n).map(e=>{const o=e[1];return '<tr><td><b>'+esc(e[0])+'</b></td><td class="r num">'+o.n+'</td><td class="r num">'+o.tod+'</td><td class="r num">'+o.ack+'</td><td class="r num" '+(o.n-o.ack?'style="color:var(--warn);font-weight:700"':'')+'>'+(o.n-o.ack)+'</td><td class="num">'+fd(o.old)+' <span class="small">('+diff(today,o.old)+'d ago)</span></td><td class="r num">'+inr(o.v)+'</td></tr>';}).join('');
    const hd=R.filter(d=>d.handed===today);const by=new Map();hd.forEach(d=>{const k=d.handedTo||'(person not recorded)';by.set(k,(by.get(k)||0)+1);});
    const line=hd.length?'<div class="small" style="margin-bottom:6px">Handed today: '+Array.from(by).map(e=>'<b>'+e[1]+'</b> to '+esc(e[0])).join(', ')+'.</div>':'';
    return line+'<div class="tablewrap"><table><thead><tr><th>Handed to</th><th class="r">Printouts held</th><th class="r">Handed today</th><th class="r">Acknowledged</th><th class="r">Not acknowledged</th><th>Oldest handover</th><th class="r">PO value ₹</th></tr></thead><tbody>'+(rows||'<tr><td colspan="7" class="empty">No handovers recorded yet. Record a batch above and enter who received it.</td></tr>')+'</tbody></table></div>';
  },
  hand1Html(d){
    const x=S.byPo.get(d.po)||{},h=d.mode==='handed';
    return '<div class="hd"><div><h2>'+(h?'Handed to the warehouse':'Warehouse acknowledged')+'</h2><div class="small"><span class="mono">'+esc(d.po)+'</span> · '+esc(x.plat||'')+(x.value?' · '+money(x.value):'')+'</div></div><button class="btn sm" data-act="close">Close</button></div><div class="bd"><div class="form"><label class="full">'+(h?'Handed to (warehouse person)':'Acknowledged by (warehouse person)')+'<input type="text" id="h1-person" list="people-list" autocomplete="off" placeholder="Name"></label><label class="full">Date'+this.dateField('h1-date',S.asof)+'</label></div><p><button class="btn pri" data-act="dohand1">Save</button></p><div class="small">Several printouts at once? Use the Handover check tab and paste all the PO numbers with one name.</div></div>';
  },
  /* ---------- editor access ---------- */
  unlockHtml(){
    const first=!S.pinHash;
    return '<div class="hd"><div><h2>'+(first?'Set up editing':'Unlock editing')+'</h2><div class="small">'+(first?'Choose a PIN for editors. Anyone who has it can change POs. Everyone else can only look.':'Enter your name and the editor PIN. Your name is saved with every change you make.')+'</div></div><button class="btn sm" data-act="close">Close</button></div>'+
      '<div class="bd"><div class="form"><label class="full">Your name<input type="text" id="u-name" value="'+esc(S.user)+'" autocomplete="off"></label><label class="full">Editor PIN<input type="password" id="u-pin" autocomplete="off" placeholder="'+(first?'At least 4 characters':'')+'"></label>'+(first?'<label class="full">Repeat PIN<input type="password" id="u-pin2" autocomplete="off"></label>':'')+'</div>'+
      '<p><button class="btn pri" data-act="dounlock">'+(first?'Save PIN and start editing':'Unlock')+'</button></p>'+(first?'':'<p class="small">Forgot the PIN? Ask the person who set it. They can change it from Settings while editing.</p>')+'</div>';
  }
});
(function(){
  const _dr=UI.drawerRender;
  UI.drawerRender=function(){
    _dr.call(this);
    const d=this.drawer,dr=$('#drawer');if(!d)return;
    if(d.type==='hand1'){dr.innerHTML=this.hand1Html(d);setTimeout(()=>{const e=document.getElementById('h1-person');if(e)e.focus();},40);return;}
    if(d.type==='unlock'){dr.innerHTML=this.unlockHtml();setTimeout(()=>{const e=document.getElementById(S.user?'u-pin':'u-name');if(e)e.focus();},40);return;}
    if(!S.edit&&(d.type==='po'||d.type==='issue')){
      dr.querySelectorAll('.bd input,.bd select,.bd textarea').forEach(e=>e.disabled=true);
      dr.querySelectorAll(WRITE_ACTS.map(a=>'[data-act="'+a+'"]').join(',')+',.dline .btn').forEach(e=>e.hidden=true);
      const bd=dr.querySelector('.bd');if(bd)bd.insertAdjacentHTML('afterbegin','<div class="lockbar">'+ICON.lock+'<span><b>View only.</b> Unlock editing to change this.</span><button class="btn sm pri" data-act="unlock">Unlock editing</button></div>');
    }
  };
})();
