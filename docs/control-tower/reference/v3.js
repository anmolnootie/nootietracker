/* ===== v3: period bar with custom range, end-to-end pipeline, status boards ===== */
PERIODS.splice(0,PERIODS.length,['fy','This financial year'],['90d','Last 90 days'],['30d','Last 30 days'],['7d','Last 7 days'],['month','This month'],['last','Last month'],['all','All time'],['custom','Custom range']);
function monthStart(iso,off){const y=+iso.slice(0,4),m=+iso.slice(5,7)-1+off;const d=new Date(Date.UTC(y,m,1));return d.toISOString().slice(0,10);}
Object.assign(UI,{
  inP(d){if(this.pkey==='all')return true;const f=this.f;return !!d.date&&d.date>=f.from&&d.date<=f.to;},
  setPeriod(k,from,to){
    const a=S.asof,f=this.f;this.pkey=k;
    if(k==='custom'){f.from=from||f.from||addDays(a,-30);f.to=to||f.to||a;if(f.from>f.to){const t=f.from;f.from=f.to;f.to=t;}return;}
    f.to=a;
    if(k==='last'){f.from=monthStart(a,-1);f.to=addDays(monthStart(a,0),-1);return;}
    f.from=k==='fy'?'2026-04-01':k==='90d'?addDays(a,-90):k==='30d'?addDays(a,-30):k==='7d'?addDays(a,-7):k==='month'?a.slice(0,8)+'01':'2000-01-01';
  },
  periodLabel(){return this.pkey==='custom'?fd(this.f.from)+' to '+fd(this.f.to):PERIODS.filter(x=>x[0]===this.pkey)[0][1];},
  periodBar(){
    const chips=PERIODS.map(p=>'<button class="pchip'+(this.pkey===p[0]?' on':'')+'" data-act="period" data-arg="'+p[0]+'" aria-pressed="'+(this.pkey===p[0])+'">'+({fy:'FY','90d':'90d','30d':'30d','7d':'7d',month:'Month',last:'Last mo.',all:'All',custom:'Custom'})[p[0]]+'</button>').join('');
    const cust=this.pkey==='custom'?'<span class="pcust"><label>From<input type="date" id="f-from" value="'+esc(this.f.from)+'"></label><label>To<input type="date" id="f-to" value="'+esc(this.f.to)+'"></label><button class="btn pri sm" data-act="applyrange">Apply</button></span>':'';
    const sub=this.pkey==='all'?'All POs, any date':'POs dated '+fd(this.f.from)+' to '+fd(this.f.to);
    return '<div class="periodbar"><div class="pchips" role="group" aria-label="Period">'+chips+'</div>'+cust+'</div>';
  },
  renderTop(){
    const v=this.view,P=this.f.plat;let title,crumb,logo='';
    if(v==='home'){title='Home';crumb='Choose what you want to look at';}
    else if(v==='settings'){title='Settings & access';crumb='Rules, connection and who can edit';}
    else if(P==='ALL'){title='Overall control tower';crumb='All platforms together';}
    else{title=P+' control tower';crumb='Only '+P+' POs';logo=plogo(P).replace('class="plogo','class="plogo xl');}
    const q=(document.getElementById('q')||{}).value||'';
    $('#topbar').innerHTML='<div class="tb-row"><div class="tb-title">'+logo+'<div><div class="small">'+esc(crumb)+'</div><h1>'+esc(title)+'</h1></div></div><span class="grow"></span>'+(v==='settings'?'':this.periodBar())+
      '<div class="search"><input id="q" type="search" placeholder="Find any PO number" aria-label="Find any PO number" autocomplete="off" value="'+esc(q)+'"><div id="results" class="results" hidden></div></div><button class="btn pri ed" data-act="newpo">+ Add PO</button></div>';
  },
  gapDefs(){return JSTEPS.slice(0,-1).map((s,i)=>({k:s.k,from:s.name,to:JSTEPS[i+1].name}));},
  inGap(d,k){const j=journeyOf(d),i=JSTEPS.findIndex(s=>s.k===k);return j[k]&&!j[JSTEPS[i+1].k]&&d.stage!==9;},
  /* ---------- PIPELINE (end to end) ---------- */
  v_pipeline(){
    const R=this.rows().filter(d=>this.inP(d));
    const J=journey(R),st=J.steps,sd=J.side,top=st[0].n||1;
    const fm=v=>money(v);
    const rows=st.map((s,i)=>{
      const w=Math.max(2,Math.round(s.n/top*100));
      const lost=i<st.length-1?R.filter(d=>this.inGap(d,s.k)).length:0;
      const lostV=i<st.length-1?R.filter(d=>this.inGap(d,s.k)).reduce((a,d)=>a+(d.value||0),0):0;
      const gap=i<st.length-1?'<div class="fgap'+(lost?' has':'')+'">'+(lost?'<button data-act="gap" data-arg="'+s.k+'"><b>'+inr(lost)+' POs</b> reached “'+esc(s.name)+'” but not “'+esc(st[i+1].name)+'” · '+fm(lostV)+' · <u>see which</u></button>':'<span>Nothing lost between these two steps</span>')+'</div>':'';
      return '<div class="frow"><div class="fl"><span class="fn">'+(i+1)+'</span><div><b>'+esc(s.name)+'</b><small>'+esc(s.hint)+'</small></div></div><div class="ft"><i class="fb s'+(i+1)+'" style="width:'+w+'%"></i></div><div class="fv"><b class="num">'+inr(s.n)+'</b><small>'+fm(s.v)+' · '+Math.round(s.n/top*100)+'%</small></div></div>'+gap;
    }).join('');
    const seg=(obj,order,tone)=>{const keys=order.filter(k=>obj[k]).concat(Object.keys(obj).filter(k=>order.indexOf(k)<0));const tot=keys.reduce((a,k)=>a+obj[k].n,0)||1;
      return '<div class="stack">'+keys.map(k=>'<i class="'+(tone[k]||'mute')+'" style="width:'+(obj[k].n/tot*100)+'%" title="'+esc(k)+': '+obj[k].n+'"></i>').join('')+'</div><ul class="leg">'+keys.map(k=>'<li><i class="'+(tone[k]||'mute')+'"></i><span>'+esc(k)+'</span><b class="num">'+inr(obj[k].n)+'</b><small>'+fm(obj[k].v)+'</small></li>').join('')+'</ul>';};
    const dTone={Delivered:'ok','In Transit':'info',Dispatched:'info',Arrived:'info',RTO:'crit'},gTone={Done:'ok',Pending:'warn',NA:'mute'};
    const card=(t,sub,body)=>'<section class="card bcard"><h2>'+t+'</h2><div class="sub">'+sub+'</div>'+body+'</section>';
    const disc=[['Shortage',sd.short],['Damage',sd.dmg],['Excess',sd.exc]].map(x=>'<li><i class="'+(x[0]==='Excess'?'info':'warn')+'"></i><span>'+x[0]+'</span><b class="num">'+inr(x[1].q)+' units</b><small>'+fm(x[1].v)+'</small></li>').join('');
    const ewbPct=sd.ewbNeed?Math.round(sd.ewbHave/sd.ewbNeed*100):0;
    const boards='<div class="bgrid">'+
      card('Dispatch and delivery','Every invoice, by delivery status (from the Dispatch sheet)',seg(sd.ds,['Delivered','In Transit','Dispatched','Arrived','RTO'],dTone))+
      card('GRN (platform receipt)','Every invoice, by GRN status',seg(sd.gs,['Done','Pending','NA'],gTone))+
      card('Returns and credit notes','Returned shipments and the credit notes raised for them','<ul class="leg big"><li><i class="crit"></i><span>Returned to us (RTO)</span><b class="num">'+inr(sd.rto.n)+'</b><small>'+fm(sd.rto.v)+'</small></li><li><i class="ok"></i><span>Credit notes raised</span><b class="num">'+inr(sd.cnRaised.n)+'</b><small>'+fm(sd.cnRaised.v)+'</small></li><li><i class="warn"></i><span>POs still waiting for a credit note</span><b class="num">'+inr(sd.cnPending.n)+'</b><small>'+fm(sd.cnPending.v)+' short or damaged</small></li></ul>')+
      card('Short, damaged and excess goods','Quantity and value the platforms reported on GRN','<ul class="leg big">'+disc+'</ul>')+
      card('E-way bills','Recorded by the team on each dispatched PO','<div class="ewb"><b class="num">'+inr(sd.ewbHave)+'</b><span>of '+inr(sd.ewbNeed)+' dispatched POs have an E-way bill number</span></div><div class="stack"><i class="ok" style="width:'+ewbPct+'%"></i><i class="mute" style="width:'+(100-ewbPct)+'%"></i></div><p class="small">The Warehouse Master has no E-way column, so numbers are entered on each PO. Open a PO and fill “E-way bill no.”</p>')+
      card('Printouts and handover','How many printouts have a named person','<ul class="leg big"><li><i class="ok"></i><span>Handed with a recorded person</span><b class="num">'+inr(sd.handExplicit)+'</b></li><li><i class="mute"></i><span>Declined, cancelled or expired</span><b class="num">'+inr(sd.declined)+'</b></li></ul><p class="small">Dispatched POs count as handed and acknowledged because they reached an invoice.</p>')+
      '</div>';
    return '<div class="toolbar"><h2>Pipeline</h2><span class="small">Every PO from the moment it arrives to GRN. A PO that reaches a later step counts as having passed the earlier ones, so the red boxes show exactly where POs stopped.</span></div>'+
      '<section class="card"><h2>End-to-end journey</h2><div class="sub">'+inr(R.length)+' POs · '+esc(this.periodLabel())+'</div><div class="funnel">'+rows+'</div></section>'+
      '<h2 class="sec">Status boards</h2>'+boards+
      '<h2 class="sec">Open POs by stage</h2>'+this.v_kanban();
  },
  v_kanban(){
    const rows=this.period();const cols=[1,2,3,4,5,6,7];const sel=this.f.stage;
    const by={};cols.forEach(c=>by[c]=[]);let closed=0,nf=0;
    rows.forEach(d=>{if(by[d.stage])by[d.stage].push(d);else if(d.stage===8)closed++;else nf++;});
    cols.forEach(c=>by[c].sort((a,b)=>(b.pri>0)-(a.pri>0)||(a.pri||99)-(b.pri||99)||(b.age||0)-(a.age||0)));
    const lim=this.f.kanLimit;
    const html=cols.map(c=>{const arr=by[c];const st=STAGES[c-1];
      return '<section class="col" '+(sel==c?'style="outline:2px solid var(--accent)"':'')+'><h3><span>'+c+'. '+esc(st.short)+'</span><span class="num">'+arr.length+'</span></h3><div class="small" style="padding:0 4px">'+money(arr.reduce((s,d)=>s+(d.value||0),0))+'</div><div class="list">'+
        arr.slice(0,lim).map(d=>this.pcard(d)).join('')+(arr.length>lim?'<button class="btn sm" data-act="morekan">Show '+Math.min(40,arr.length-lim)+' more of '+(arr.length-lim)+'</button>':'')+(arr.length?'':'<div class="empty">Nothing here</div>')+'</div></section>';}).join('');
    return '<div class="small" style="margin-bottom:8px">Closed: '+inr(closed)+' delivered and done, '+inr(nf)+' not fulfilled.</div><div class="kan">'+html+'</div>';
  },
  /* full PO journey for the drawer */
  poSteps(x){
    const a=x.inv,p=x.pri,L=a.list;const mk=(t,v,st,sub)=>'<div class="jstep '+(st||'')+'"><i></i><div><b>'+t+'</b><span>'+(v||'Not yet')+'</span>'+(sub?'<small>'+sub+'</small>':'')+'</div></div>';
    const uniq=f=>Array.from(new Set(L.map(f).filter(Boolean)));
    const delivered=a.deliv>0,lastD=L.map(l=>l.deliv).filter(Boolean).sort().pop(),appt=uniq(l=>l.appt?fd(l.appt):'');
    const grnDone=L.filter(l=>l.grn==='Done').length;
    const gno=uniq(l=>l.gno),gamt=L.reduce((s,l)=>s+(l.gamt||0),0);
    const sq=L.reduce((s,l)=>s+(l.sq||0),0),dq=L.reduce((s,l)=>s+(l.dq||0),0),eq=L.reduce((s,l)=>s+(l.eq||0),0);
    const cn=uniq(l=>l.cn);
    return '<div class="journey">'+
     mk('PO received',fd(x.orderDate),x.orderDate?'done':'')+
     mk('Decision',x.dec+(x.reason?' · '+esc(x.reason):''),x.dec==='Pending'?(p===7||p===10?'late':''):'done')+
     mk('Printout received',x.printout?fd(x.printout):'',x.printout?'done':'')+
     mk('Handed to warehouse',x.handed?fd(x.handed)+(x.handedTo?' → '+esc(x.handedTo):''):'',x.handed?'done':(p===3?'late':''))+
     mk('Warehouse acknowledged',x.ack?fd(x.ack)+(x.ackBy?' by '+esc(x.ackBy):''):'',x.ack?'done':(p===4?'late':''))+
     mk('Invoiced',a.n?a.n+' invoice'+(a.n>1?'s':'')+' · '+inr(a.val):'',a.n?'done':(p===5?'late':''),a.n?uniq(l=>l.inv).map(esc).join(', '):'')+
     mk('E-way bill',x.ewb?esc(x.ewb):'',x.ewb?'done':'',a.n&&!x.ewb?'Add the number below':'')+
     mk('Dispatched',a.n?fd(a.first)+(a.last&&a.last!==a.first?' to '+fd(a.last):''):'',a.n?'done':(p===1||p===2?'late':''),a.n?uniq(l=>l.partner).map(esc).join(', ')+(uniq(l=>l.awb).length?' · AWB '+uniq(l=>l.awb).slice(0,3).map(esc).join(', '):''):'')+
     mk('Delivered',delivered?(lastD?fd(lastD):a.deliv+' delivered'):(a.transit?'In transit':''),delivered?'done':(p===6?'late':''),appt.length?'Appointment '+appt.join(', '):'')+
     mk('GRN',grnDone?grnDone+' of '+a.n+' done':(a.grnP?a.grnP+' pending':''),grnDone&&!a.grnP?'done':(p===8?'late':''),(gno.length?'GRN '+gno.slice(0,2).map(esc).join(', ')+' · ':'')+(gamt?'₹'+inr(Math.round(gamt)):''))+
     (sq||dq||eq?mk('Discrepancy',inr(sq)+' short · '+inr(dq)+' damaged · '+inr(eq)+' excess','late',inr((a.loss||0))+' value at stake'):'')+
     (a.rto?mk('Returned (RTO)',a.rto+' shipment'+(a.rto>1?'s':'')+' came back','late'):'')+
     (cn.length||a.cnP?mk('Credit note',cn.length?cn.map(esc).join(', '):'Pending',cn.length?'done':'late'):'')+
     '</div>';
  }
});
