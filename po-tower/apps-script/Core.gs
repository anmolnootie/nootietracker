function manualLines(I,trkMap){
  const have=new Set();I.forEach(l=>have.add(l.po+'|'+String(l.inv||'').toUpperCase()));
  const out=[];
  Object.keys(trkMap||{}).forEach(po=>{
    const t=trkMap[po];const inv=String(t.mInv||'').trim();if(!inv)return;
    const k=po+'|'+inv.toUpperCase();if(have.has(k))return;
    const st=t.mStatus||(t.mDeliv?'Delivered':'Dispatched');
    const grnDone=!!(t.mGrnNo||t.mGrnDate||num(t.mGrnAmt)!=null);
    const grn=st==='RTO'?'NA':(grnDone?'Done':(st==='Delivered'?'Pending':''));
    out.push({disp:t.mDisp||null,po,inv,chan:normPlat(t.plat||''),loc:t.loc||'',val:num(t.mInvVal),awb:t.mAwb||'',partner:t.mPartner||'',status:st,comment:'',expiry:null,
      deliv:t.mDeliv||null,grn,sq:null,sv:null,dv:null,ev:null,cn:'',cnv:null,appt:null,dq:null,eq:null,gno:t.mGrnNo||'',gdate:t.mGrnDate||null,gamt:num(t.mGrnAmt),manual:true});
  });
  return out;
}
/* ===== CORE: parsing, merging and PO logic. No DOM here so it can be tested in Node. ===== */
const MON={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const PLATS=['Blinkit','Zepto','Swiggy Instamart','BigBasket','Flipkart','Amazon','Supertails','FirstClub','Tata 1mg','Other'];
const DECISIONS=['Pending','Accepted','Declined','Cancelled','Expired'];
const REASONS=['Low value','Expiry too close','Stock not available','Out of service area','Price mismatch','PO mapped / merged','Auto-cancelled by platform','Cancelled (reason not recorded)','Other'];
const ISSUE_TYPES=['Missing in warehouse','PO printout missing','Expiry risk','Shortage / damage claim','RTO / credit note','GRN delay','Appointment / reschedule','Platform cancellation','Price / data mismatch','Other'];
const ISSUE_STATUS=['Open','In progress','Waiting on platform','Resolved'];
const PRIORITIES=['High','Medium','Low'];
const STAGES=[
 {n:1,name:'Received, decision pending',short:'Decision pending'},
 {n:2,name:'Accepted, handover pending',short:'Handover pending'},
 {n:3,name:'Handed to warehouse, ack pending',short:'Ack pending'},
 {n:4,name:'In warehouse, pending dispatch',short:'In warehouse'},
 {n:5,name:'In transit',short:'In transit'},
 {n:6,name:'Delivered, GRN pending',short:'GRN pending'},
 {n:7,name:'RTO / returned',short:'RTO'},
 {n:8,name:'Closed, delivered and GRN done',short:'Closed'},
 {n:9,name:'Closed, not fulfilled',short:'Not fulfilled'}];
const FLAGS=[
 null,
 {n:1,name:'Expired, not dispatched',team:'Order desk',tone:'crit',act:'Dispatch now or ask the platform for an expiry extension'},
 {n:2,name:'Expiring soon',team:'Order desk',tone:'crit',act:'Prioritise dispatch and book the appointment now'},
 {n:3,name:'Printout not handed to warehouse',team:'Order desk',tone:'warn',act:'Find the printout, hand it to the warehouse, log the date'},
 {n:4,name:'Warehouse has not acknowledged',team:'Warehouse',tone:'warn',act:'Warehouse to acknowledge receipt of the PO printout'},
 {n:5,name:'In warehouse, not dispatched',team:'Warehouse',tone:'warn',act:'Pick, pack and dispatch; log the invoice'},
 {n:6,name:'In transit overdue',team:'Logistics',tone:'warn',act:'Chase the courier and update delivery status'},
 {n:7,name:'No decision',team:'Order desk',tone:'info',act:'Decide Accept or Decline and record the reason'},
 {n:8,name:'GRN pending',team:'Accounts',tone:'info',act:'Chase GRN from the platform'},
 {n:9,name:'Credit note pending',team:'Accounts',tone:'info',act:'Raise or chase the credit note'},
 {n:10,name:'Unaccounted, legacy',team:'Order desk',tone:'mute',act:'Backlog: confirm if declined, expired or lost, then set Decision'}];
const DEFAULT_CFG={sla_decision:1,sla_handover:1,sla_ack:1,sla_dispatch:3,expiry_warn:3,sla_transit:7,sla_grn:7,legacy_days:30,cn_days:60};

const pad=n=>String(n).padStart(2,'0');
function mkIso(y,m,d){const t=new Date(Date.UTC(y,m-1,d));if(t.getUTCFullYear()!==y||t.getUTCMonth()!==m-1||t.getUTCDate()!==d)return null;return y+'-'+pad(m)+'-'+pad(d);}
function dayNum(s){if(!s)return null;const p=s.split('-').map(Number);return Math.round(Date.UTC(p[0],p[1]-1,p[2])/864e5);}
function diff(a,b){const x=dayNum(a),y=dayNum(b);return(x==null||y==null)?null:x-y;}
function addDays(s,n){const t=new Date((dayNum(s)+n)*864e5);return t.getUTCFullYear()+'-'+pad(t.getUTCMonth()+1)+'-'+pad(t.getUTCDate());}
function num(x){if(x==null)return null;let s=String(x).replace(/[₹,\s]/g,'');if(s===''||isNaN(s))return null;return parseFloat(s);}
function normPo(x){return String(x==null?'':x).trim().replace(/\n/g,'').replace(/\.0$/,'').toUpperCase().replace(/\s/g,'');}
function normPlat(x){const k=String(x||'').trim().toLowerCase();return (k==='etrade'||k==='e-trade'||k==='e trade')?'Amazon':(x||'Other');}
const CH={'blinkit':'Blinkit','zepto':'Zepto','swiggy':'Swiggy Instamart','swiggy instamart':'Swiggy Instamart','big basket':'BigBasket','bigbasket':'BigBasket','supertails':'Supertails','super tails':'Supertails','flipkart':'Flipkart','etrade':'Amazon','e-trade':'Amazon','e trade':'Amazon','firstclub':'FirstClub','amazon':'Amazon','amazon india':'Amazon','tata 1mg':'Tata 1mg','tata1mg':'Tata 1mg','1mg':'Tata 1mg','first club':'FirstClub','other':'Other'};
function normChan(x){const k=String(x||'').trim().toLowerCase();if(CH[k])return CH[k];return k?'Other':'';}
const PART={'safexpress':'Safexpress','safe express':'Safexpress','self delivery':'Self Delivery','self vehicle':'Self Delivery','self vechile':'Self Delivery','dtdc':'DTDC','rivigo':'Rivigo','om logistics':'Om Logistics','delhivery':'Delhivery','bluedart':'BlueDart'};

function pdate(s,ref,pref){
  s=String(s==null?'':s).trim();
  if(!s||s==='(blank)'||s==='-')return null;
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m)return mkIso(+m[1],+m[2],+m[3]);
  m=s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if(m&&MON[m[2].toLowerCase()])return mkIso(+m[3],MON[m[2].toLowerCase()],+m[1]);
  m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if(m){
    const a=+m[1],b=+m[2],y=+m[3];const c=[];
    if(b<=12&&a<=31){const v=mkIso(y,b,a);if(v)c.push(v);}      // d/m/y
    if(a<=12&&b<=31){const v=mkIso(y,a,b);if(v&&c.indexOf(v)<0)c.push(v);} // m/d/y
    if(!c.length)return null;
    if(c.length===1)return c[0];
    if(ref){let best=c[0],bd=1e9;c.forEach(v=>{const d=Math.abs(diff(v,ref));if(d<bd){bd=d;best=v;}});return best;}
    return pref==='mdy'?c[c.length-1]:c[0];
  }
  m=s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[a-z]*,?\s+(\d{4})$/);
  if(m&&MON[m[2].toLowerCase()])return mkIso(+m[3],MON[m[2].toLowerCase()],+m[1]);
  return null;
}
const cell=(r,i)=>(r&&r[i]!=null)?String(r[i]):'';

/* ---------- parsers: rows are arrays of display strings, as the Sheets connector returns them ---------- */
function parseOrderBook(rows,asof){
  const out=new Map();let ref=null;
  for(const r of rows){
    const po=normPo(cell(r,2));if(!po)continue;
    const d=pdate(cell(r,1),ref);
    if(d&&d<=asof)ref=d;
    const q=cell(r,4),sh=cell(r,6);
    const remark=[cell(r,13),num(sh)==null?sh:'',num(q)==null?q:''].join(' ').replace(/\s+/g,' ').trim();
    const rec={po,date:d,chan:normChan(cell(r,3)),qty:num(q),amt:num(cell(r,5)),status:cell(r,11).trim(),disp:pdate(cell(r,12),ref),rem:remark?[remark]:[],n:1};
    const c=out.get(po);
    if(!c){out.set(po,rec);continue;}
    c.n++;
    ['date','qty','amt','disp'].forEach(f=>{if(c[f]==null&&rec[f]!=null)c[f]=rec[f];});
    if(!c.status&&rec.status)c.status=rec.status;
    if(!c.chan&&rec.chan)c.chan=rec.chan;
    if(remark)c.rem.push(remark);
  }
  return out;
}
function parseGrnTab(rows){
  const m={};
  for(const r of rows){
    const inv=cell(r,3).trim();if(!inv)continue;
    const s=cell(r,16).trim().toLowerCase();
    m[inv]=s==='done'?'Done':(s==='pending'||s==='partial'||s==='not updated')?'Pending':s.indexOf('n/a')===0?'NA':'';
  }
  return m;
}
function parseGrnInfo(rows){
  const m={};
  for(const r of rows){const inv=cell(r,3).trim();if(!inv)continue;m[inv]={no:cell(r,13).trim(),date:pdate(cell(r,14)),amt:num(cell(r,15))};}
  return m;
}
function parseDispatch(rows,gmap,ginfo){
  const out=[];
  for(const r of rows){
    const po=normPo(cell(r,2));if(!po)continue;
    let st=cell(r,9).trim();st=st?st.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()):'';
    if(st==='Rto')st='RTO';
    const inv=cell(r,3).trim(),alert=cell(r,23).trim(),grnTxt=cell(r,13).trim().toLowerCase();
    let grn='';
    if(st==='RTO')grn='NA';
    else if(alert.indexOf('Done')>=0)grn='Done';
    else if(alert.toUpperCase().indexOf('PENDING')>=0)grn='Pending';
    else if(gmap&&gmap[inv])grn=gmap[inv];
    else if(['completed','complete','done'].indexOf(grnTxt)>=0)grn='Done';
    else if(st==='Delivered')grn='Pending';
    const cm=cell(r,10).trim();
    out.push({disp:pdate(cell(r,1)),po,inv,chan:normChan(cell(r,4)),loc:cell(r,5).trim(),val:num(cell(r,6)),awb:cell(r,7).trim(),
      partner:PART[cell(r,8).trim().toLowerCase()]||cell(r,8).trim(),status:st,comment:cm==='#N/A'?'':cm,expiry:pdate(cell(r,11)),
      deliv:pdate(cell(r,24)),grn,sq:num(cell(r,14)),sv:num(cell(r,15)),dv:num(cell(r,17)),ev:num(cell(r,19)),cn:cell(r,21).trim(),cnv:num(cell(r,22)),
      appt:pdate(cell(r,12)),dq:num(cell(r,16)),eq:num(cell(r,18)),gno:(ginfo&&ginfo[inv]?ginfo[inv].no:''),gdate:(ginfo&&ginfo[inv]?ginfo[inv].date:null),gamt:(ginfo&&ginfo[inv]?ginfo[inv].amt:null)});
  }
  return out;
}
function parseTabs(t){
  const tabs=new Map();
  (t.blinkit||[]).forEach(r=>{const po=normPo(cell(r,0));if(!po)return;tabs.set(po,{src:'Blinkit tab',chan:'Blinkit',loc:cell(r,1).trim(),date:pdate(cell(r,2),null,'mdy'),expiry:pdate(cell(r,3),null,'mdy'),tstatus:cell(r,4).trim(),qty:num(cell(r,5)),amt:num(cell(r,7))});});
  (t.flipkart||[]).forEach(r=>{const po=normPo(cell(r,0));if(!po)return;tabs.set(po,{src:'Flipkart tab',chan:'Flipkart',date:pdate(cell(r,1),null,'mdy'),expiry:pdate(cell(r,2),null,'mdy'),amt:num(cell(r,3)),qty:num(cell(r,4)),tstatus:cell(r,5).trim()});});
  (t.zepto||[]).forEach(r=>{const po=normPo(cell(r,0));if(!po)return;const rem=cell(r,5).trim();const isd=/^\d/.test(rem);
    tabs.set(po,{src:'Zepto tab',chan:'Zepto',loc:cell(r,1).trim(),tdisp:cell(r,2).trim(),appt:pdate(cell(r,3)),qty:num(cell(r,4)),expiry:isd?pdate(rem):null,date:pdate(cell(r,6))});});
  (t.swiggy||[]).forEach(r=>{const po=normPo(cell(r,3));if(!po)return;tabs.set(po,{src:'Swiggy tab',chan:'Swiggy Instamart',loc:cell(r,0).trim(),appt:pdate(cell(r,1)),qty:num(cell(r,2)),tstatus:cell(r,4).trim()});});
  return tabs;
}
/* One row per PO from Order Book + Dispatch + platform tabs */
function buildPOs(ob,dg,tabs){
  const byPo=new Map();dg.forEach(l=>{if(!byPo.has(l.po))byPo.set(l.po,[]);byPo.get(l.po).push(l);});
  const keys=[];const seen=new Set();
  const add=k=>{if(!seen.has(k)){seen.add(k);keys.push(k);}};
  ob.forEach((v,k)=>add(k));byPo.forEach((v,k)=>add(k));tabs.forEach((v,k)=>add(k));
  const P=[];
  for(const k of keys){
    const o=ob.get(k),t=tabs.get(k),L=byPo.get(k)||[];
    const src=[];if(o)src.push('Order Book');if(L.length)src.push('Dispatch sheet');if(t)src.push(t.src);
    let chan=(o&&o.chan)||(t&&t.chan)||'';
    if(!chan&&L.length){const c={};L.forEach(l=>{c[l.chan]=(c[l.chan]||0)+1;});chan=Object.keys(c).sort((a,b)=>c[b]-c[a])[0]||'';}
    chan=chan||'Other';
    let date=o?o.date:null;if(!date&&t)date=t.date||null;
    let exp=t&&t.expiry||null;if(!exp){const e=L.find(l=>l.expiry);if(e)exp=e.expiry;}
    const loc=(t&&t.loc)||(L[0]&&L[0].loc)||'';
    let qty=o?o.qty:null,amt=o?o.amt:null;if(qty==null&&t)qty=t.qty==null?null:t.qty;if(amt==null&&t)amt=t.amt==null?null:t.amt;
    if(amt!=null&&amt>5e6)amt=null;
    const rem=o?Array.from(new Set(o.rem.filter(x=>x))).join(' | '):'';
    const ost=o?o.status.toLowerCase():'';const ru=rem.toUpperCase();
    let dec='',reason='';
    if(L.length)dec='Accepted';
    else if(ost==='cancelled'||ru.indexOf('CANCEL')>=0||ru.indexOf('CANCLLED')>=0){
      if(ru.indexOf('LESS VALUE')>=0||ru.indexOf('LOW VALUE')>=0){dec='Declined';reason='Low value';}
      else if(ru.indexOf('MAPPED')>=0){dec='Cancelled';reason='PO mapped / merged';}
      else if(ru.indexOf('AUTO')>=0){dec='Cancelled';reason='Auto-cancelled by platform';}
      else{dec='Cancelled';reason='Cancelled (reason not recorded)';}
    }else if(ru.indexOf('EXPIRY TOO CLOSE')>=0){dec='Declined';reason='Expiry too close';}
    else if(ru.indexOf('MAPPED')>=0){dec='Cancelled';reason='PO mapped / merged';}
    else if(t&&(t.appt||String(t.tdisp||'').toUpperCase()==='DISPATCHED'||['dispatched','in transit'].indexOf(String(t.tstatus||'').toLowerCase())>=0))dec='Accepted';
    else dec='Pending';
    const note=[];
    if(t&&!L.length&&(['DISPATCHED','DELIVERED'].indexOf(String(t.tdisp||'').toUpperCase())>=0||['dispatched','in transit','delivered'].indexOf(String(t.tstatus||'').toLowerCase())>=0))note.push('Platform tab shows dispatched but no invoice in Dispatch sheet');
    if(!o&&!L.length)note.push('On platform tab but NOT in Order Book');
    if(!o&&L.length)note.push('Dispatched but NOT in Order Book');
    if(o&&o.n>1)note.push('Duplicate Order Book rows merged');
    if(o&&o.amt!=null&&o.amt>5e6)note.push('PO value looked like a PO number; cleared');
    P.push({po:k,plat:chan,date,exp,loc,qty,amt,dec,reason,rem:[rem].concat(note).filter(x=>x).join(' | '),src:src.join(' + ')});
  }
  return P;
}

/* ---------- derived state ---------- */
function indexInvoices(I,cfg,asof){
  const m=new Map();
  for(const l of I){
    let a=m.get(l.po);if(!a){a={n:0,val:0,first:null,last:null,transit:0,deliv:0,rto:0,grnP:0,loss:0,cnP:0,list:[]};m.set(l.po,a);}
    a.n++;a.val+=l.val||0;a.list.push(l);
    if(l.disp){if(!a.first||l.disp<a.first)a.first=l.disp;if(!a.last||l.disp>a.last)a.last=l.disp;}
    const s=l.status;
    if(s==='Dispatched'||s==='In Transit'||s==='Arrived')a.transit++;else if(s==='Delivered')a.deliv++;else if(s==='RTO')a.rto++;
    if(l.grn==='Pending')a.grnP++;
    const loss=(l.sv||0)+(l.dv||0);a.loss+=loss;
    const days=l.disp?diff(asof,l.disp):null;
    if(!l.cn&&(s==='RTO'||loss>0)&&days!=null&&days<=cfg.cn_days)a.cnP++;
  }
  return m;
}
function derive(p,inv,trk,cfg,asof,openIssues){
  const t=trk||{};
  const a=inv||{n:0,val:0,first:null,last:null,transit:0,deliv:0,rto:0,grnP:0,loss:0,cnP:0,list:[]};
  const dec=t.dec||p.dec||'Pending';
  const plat=normPlat(p.plat);
  const pdt=p.date||a.first||null;
  const age=pdt?diff(asof,pdt):null;
  const dte=p.exp?diff(p.exp,asof):null;
  const K=t.handed||null,L=t.ack||null;
  let stage;
  if(a.n>0){
    if(a.transit>0)stage=5;else if(a.grnP>0)stage=6;else if(a.rto>0&&a.deliv===0)stage=7;else stage=8;
  }else if(dec==='Declined'||dec==='Cancelled'||dec==='Expired')stage=9;
  else if(L)stage=4;else if(K)stage=3;else if(dec==='Accepted')stage=2;else stage=1;
  let pri=0;
  const openNo=a.n===0&&(dec==='Pending'||dec==='Accepted');
  if(openNo){
    if(p.exp&&dte<0)pri=1;
    else if(p.exp&&dte<=cfg.expiry_warn)pri=2;
    else if(dec==='Accepted'){
      if(!K&&age!=null&&age>cfg.sla_handover)pri=3;
      else if(K&&!L&&diff(asof,K)>cfg.sla_ack)pri=4;
      else if(L&&age!=null&&age>cfg.sla_dispatch)pri=5;
    }else{
      if(age==null||age>cfg.legacy_days)pri=10;else if(age>cfg.sla_decision)pri=7;
    }
  }else if(a.n>0){
    const dl=a.last?diff(asof,a.last):0;
    if(a.transit>0&&dl>cfg.sla_transit)pri=6;
    else if(a.grnP>0&&dl>cfg.sla_grn)pri=8;
    else if(a.cnP>0)pri=9;
  }
  const value=p.amt!=null&&p.amt>0?p.amt:(a.val||0);
  return {po:p.po,plat,date:pdt,orderDate:p.date,exp:p.exp,loc:p.loc,qty:p.qty,amt:p.amt,dec,reason:t.reason||p.reason||'',stage,pri,age,dte,
    inv:a,invoiced:a.val,value,openIssues:openIssues||0,rem:[p.rem,t.rem].filter(x=>x).join(' | '),src:p.src,
    ewb:t.ewb||'',printout:t.printout||null,handed:K,handedTo:t.handedTo||'',ack:L,ackBy:t.ackBy||'',owner:t.owner||'',tracked:!!trk,
    fill:(p.amt>0)?a.val/p.amt:null};
}
function deriveAll(P,I,trkMap,issues,cfg,asof){
  I=I.concat(manualLines(I,trkMap));
  const idx=indexInvoices(I,cfg,asof);
  const oi={};issues.forEach(x=>{if(x.status!=='Resolved'&&x.po)oi[x.po]=(oi[x.po]||0)+1;});
  return P.map(p=>derive(p,idx.get(p.po),trkMap[p.po],cfg,asof,oi[p.po]));
}
function aggregate(D){
  const r={n:0,value:0,accepted:0,notFul:0,undecided:0,accNotDisp:0,dispatched:0,invoiced:0,transit:0,grnP:0,rto:0,flags:0,expiring:0,undecidedValue:0,notDispValue:0,fillNum:0,fillDen:0,stage:{},flag:{},flagVal:{}};
  for(let i=1;i<=9;i++)r.stage[i]={n:0,v:0};for(let i=1;i<=10;i++){r.flag[i]=0;r.flagVal[i]=0;}
  for(const d of D){
    r.n++;r.value+=d.amt||0;if(d.dec==='Accepted')r.accepted++;
    r.stage[d.stage].n++;r.stage[d.stage].v+=d.amt||0;
    if(d.stage===9)r.notFul++;if(d.stage===1){r.undecided++;r.undecidedValue+=d.amt||0;}
    if(d.stage>=2&&d.stage<=4){r.accNotDisp++;r.notDispValue+=d.amt||0;}
    if(d.inv.n>0){r.dispatched++;r.invoiced+=d.invoiced;}
    if(d.stage===5)r.transit++;if(d.stage===6)r.grnP++;if(d.inv.rto>0)r.rto++;
    if(d.pri>0){r.flags++;r.flag[d.pri]++;r.flagVal[d.pri]+=(d.pri===6||d.pri===8||d.pri===9)?d.invoiced:(d.value||0);if(d.pri<=2)r.expiring++;}
    if(d.amt>0){r.fillNum+=d.invoiced;r.fillDen+=d.amt;}
  }
  r.fill=r.fillDen?r.fillNum/r.fillDen:0;
  return r;
}

/* End-to-end journey: has each PO reached each step (a later step implies the earlier ones) */
const JSTEPS=[
 {k:'recv',name:'PO received',hint:'Every PO that reached us'},
 {k:'acc',name:'Accepted',hint:'Order desk said yes'},
 {k:'hand',name:'Printout handed to warehouse',hint:'Printout given to a person'},
 {k:'ack',name:'Warehouse acknowledged',hint:'Warehouse confirmed it holds it'},
 {k:'inv',name:'Invoiced',hint:'Invoice raised'},
 {k:'disp',name:'Dispatched',hint:'Left with a courier or own vehicle'},
 {k:'deliv',name:'Delivered',hint:'Reached the platform warehouse'},
 {k:'grn',name:'GRN done',hint:'Platform confirmed receipt'}];
function journeyOf(d){
  const a=d.inv,n=a.n>0;
  const grn=a.list.some(l=>l.grn==='Done');
  const deliv=a.deliv>0||grn;
  const disp=n&&a.list.some(l=>l.disp||l.awb);
  const j={recv:true,grn,deliv,disp,inv:n};
  j.ack=!!d.ack||n;j.hand=!!d.handed||j.ack;j.acc=d.dec==='Accepted'||j.hand||n;
  return j;
}
function journey(D){
  const out=JSTEPS.map(s=>({k:s.k,name:s.name,hint:s.hint,n:0,v:0,rows:[]}));
  const by={};out.forEach(o=>by[o.k]=o);
  const side={rto:{n:0,v:0},cnRaised:{n:0,v:0},cnPending:{n:0,v:0},short:{q:0,v:0},dmg:{q:0,v:0},exc:{q:0,v:0},ewbHave:0,ewbNeed:0,
    ds:{},gs:{},handExplicit:0,declined:0,expired:0,lost:{}};
  for(const d of D){
    const j=journeyOf(d);
    out.forEach(o=>{if(j[o.k]){o.n++;o.v+=d.value||0;}});
    d.j=j;
    if(d.stage===9)side.declined++;
    if(d.handed)side.handExplicit++;
    for(const l of d.inv.list){
      const st=l.status||'(no status)';side.ds[st]=side.ds[st]||{n:0,v:0};side.ds[st].n++;side.ds[st].v+=l.val||0;
      const g=l.grn||'(no GRN info)';side.gs[g]=side.gs[g]||{n:0,v:0};side.gs[g].n++;side.gs[g].v+=l.val||0;
      if(l.status==='RTO'){side.rto.n++;side.rto.v+=l.val||0;}
      side.short.q+=l.sq||0;side.short.v+=l.sv||0;side.dmg.q+=l.dq||0;side.dmg.v+=l.dv||0;side.exc.q+=l.eq||0;side.exc.v+=l.ev||0;
      if(l.cn){side.cnRaised.n++;side.cnRaised.v+=l.cnv||0;}
    }
    if(d.inv.n>0){side.ewbNeed++;if(d.ewb)side.ewbHave++;}
    if(d.inv.cnP>0){side.cnPending.n++;side.cnPending.v+=d.inv.loss||0;}
  }
  return {steps:out,side};
}
