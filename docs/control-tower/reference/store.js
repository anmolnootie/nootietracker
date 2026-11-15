/* ===== STORE: Google Sheets connection, caching and write queue ===== */
const SRC_ID='10vLMqODDWeo8g4wFCmYATH59hhg2s4W7VTWp1e8euQo';   // Warehouse Master (read only)
const TRK_ID='1XkWpydTQPviypiN2-xmhfYzPyc_hTRHRFLKQDVLMT98';   // PO Control Tower - Tracking (app data)
const SERVER='Google Sheets';
const TRK_COLS=['po','dec','reason','printout','handed','ack','ackBy','owner','rem','updated','by','plat','date','exp','loc','qty','amt','created','handedTo','ewb'];
const ISS_COLS=['id','raised','po','plat','type','desc','by','owner','prio','status','next','updated','note','resolution','resolved'];

const S={
  mode:'snapshot',busy:false,err:'',diag:[],lastSync:null,counts:{},
  P:[],I:[],trk:{},trkRow:{},issues:[],issRow:{},act:[],cfg:Object.assign({},DEFAULT_CFG),
  user:'',asof:'',mcp:null,D:[],edit:false,pinHash:'',
};
function todayIso(){const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function nowStamp(){const d=new Date();return todayIso()+' '+pad(d.getHours())+':'+pad(d.getMinutes());}
function lsGet(k){try{return JSON.parse(localStorage.getItem(k));}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}

/* --- unwrap whatever shape the connector returns --- */
function unwrap(res){
  let p=(res&&res.payload!==undefined)?res.payload:res;
  for(let i=0;i<3;i++){
    if(typeof p==='string'){try{p=JSON.parse(p);}catch(e){break;}}
    if(p&&p.structuredContent)p=p.structuredContent;
    else if(p&&Array.isArray(p.content)&&p.content[0]&&typeof p.content[0].text==='string'){try{p=JSON.parse(p.content[0].text);}catch(e){break;}}
    else if(p&&p.content&&typeof p.content==='object'&&!Array.isArray(p.content)&&p.values===undefined)p=p.content;
    else break;
  }
  return p||{};
}
const snake=a=>{const o={};Object.keys(a).forEach(k=>{o[k.replace(/[A-Z]/g,c=>'_'+c.toLowerCase())]=a[k];});return o;};
async function rawCall(tool,args){
  const m=S.mcp;const errs=[];
  const tries=[
    async()=>m.callTool(SERVER,tool,args),
    async()=>{const s=await m.server(SERVER);return s[tool](args);},
    async()=>m.callTool({server:SERVER,tool:tool,input:args}),
  ];
  for(const t of tries){try{return await t();}catch(e){errs.push(String(e&&e.message||e));if(e&&e.retryable===false&&/denied|authz|consent/i.test(errs[errs.length-1]))break;}}
  throw new Error(errs.join(' | ').slice(0,300));
}
async function sheets(tool,args){
  try{return unwrap(await rawCall(tool,args));}
  catch(e){
    if(/spreadsheet_id|spreadsheetId/i.test(String(e.message))){return unwrap(await rawCall(tool,snake(args)));}
    throw e;
  }
}
async function getRows(id,range){const r=await sheets('get_values',{spreadsheetId:id,range:range});return r.values||[];}

/* --- load --- */
function unpackSnapshot(){
  S.asof=todayIso();
  S.P=SNAP.P.map(a=>({po:a[0],plat:a[1],date:a[2]||null,exp:a[3]||null,loc:a[4]||'',qty:a[5],amt:a[6],dec:a[7],reason:a[8]||'',rem:a[9]||'',src:a[10]||''}));
  S.I=SNAP.I.map(a=>({disp:a[0]||null,po:a[1],inv:a[2],loc:a[3],val:a[4],awb:a[5],partner:a[6],status:a[7],deliv:a[8]||null,grn:a[9],sq:a[10],sv:a[11],dv:a[12],ev:a[13],cn:a[14],cnv:a[15],comment:a[16]||'',appt:a[17]||null,dq:a[18],eq:a[19],gno:a[20]||'',gdate:a[21]||null,gamt:a[22]}));
}
function rowsToTrk(rows){
  const t={},rm={};
  rows.forEach((r,i)=>{
    const po=normPo(r[0]);if(!po)return;
    const o={po};TRK_COLS.forEach((k,j)=>{o[k]=(r[j]==null?'':String(r[j]));});
    ['printout','handed','ack','date','exp'].forEach(k=>{o[k]=pdate(o[k])||'';});
    o.qty=num(o.qty);o.amt=num(o.amt);o.po=po;
    t[po]=o;rm[po]=i+2;
  });
  return {t,rm};
}
function rowsToIssues(rows){
  const a=[],rm={};
  rows.forEach((r,i)=>{
    if(!r[0])return;const o={};ISS_COLS.forEach((k,j)=>{o[k]=(r[j]==null?'':String(r[j]));});
    ['raised','next','updated','resolved'].forEach(k=>{o[k]=pdate(o[k])||'';});o.po=normPo(o.po);
    a.push(o);rm[o.id]=i+2;
  });
  return {a,rm};
}
function mergeCreated(P){
  const have=new Set(P.map(p=>p.po));const out=P.slice();
  Object.values(S.trk).forEach(t=>{
    if(t.created==='Y'&&!have.has(t.po)){have.add(t.po);out.push({po:t.po,plat:t.plat||'Other',date:t.date||null,exp:t.exp||null,loc:t.loc||'',qty:t.qty,amt:t.amt,dec:'Pending',reason:'',rem:'',src:'Created in app'});}
  });
  return out;
}
function recompute(){
  S.allP=mergeCreated(S.P);
  S.issues.forEach(i=>{i.plat=normPlat(i.plat);});
  S.D=deriveAll(S.allP,S.I,S.trk,S.issues,S.cfg,S.asof);
  S.byPo=new Map(S.D.map(d=>[d.po,d]));
}
function loadLocal(){
  const L=lsGet('potower_local');
  S.user=lsGet('potower_user')||'';
  if(L){S.trk=L.trk||{};S.issues=L.issues||[];S.act=L.act||[];if(L.cfg)S.cfg=Object.assign({},DEFAULT_CFG,L.cfg);}
}
function saveLocal(){lsSet('potower_local',{trk:S.trk,issues:S.issues,act:S.act.slice(-500),cfg:S.cfg});}

async function loadLive(){
  S.busy=true;S.err='';S.diag=[];UI.status();
  try{
    const m=await claude.use('mcp');
    if(!m){S.diag.push('Google Sheets access is not available in this view. Showing the saved snapshot.');S.busy=false;UI.status();return false;}
    S.mcp=m;
    const t0=Date.now();
    const [trkR,issR,actR,setR]=await Promise.all([getRows(TRK_ID,'TRACKING!A2:T5000'),getRows(TRK_ID,'ISSUES!A2:O3000'),getRows(TRK_ID,'ACTIVITY!A2:F6000'),getRows(TRK_ID,'SETTINGS!A2:B20')]);
    S.diag.push('Tracking sheet read: '+trkR.length+' PO rows, '+issR.length+' issues.');
    const [obR,dgR,grnR,blR,fkR,zpR,swR]=await Promise.all([
      getRows(SRC_ID,"'ORDER BOOK'!A4:N5500"),getRows(SRC_ID,"'DISPATCH + GRN'!A4:Y5000"),getRows(SRC_ID,'GRN!A2:Q5000'),
      getRows(SRC_ID,'Blinkit!A2:H400'),getRows(SRC_ID,"'Flipkart '!A2:G120"),getRows(SRC_ID,'Zepto!A2:G400'),getRows(SRC_ID,'Swiggy!A2:E200')]);
    S.asof=todayIso();
    const ob=parseOrderBook(obR,S.asof),gm=parseGrnTab(grnR),gi=parseGrnInfo(grnR),I=parseDispatch(dgR,gm,gi),tabs=parseTabs({blinkit:blR,flipkart:fkR,zepto:zpR,swiggy:swR});
    const P=buildPOs(ob,I,tabs);
    if(P.length<200)throw new Error('Warehouse Master looked too small ('+P.length+' POs). Keeping the snapshot.');
    S.P=P;S.I=I;
    const tk=rowsToTrk(trkR);S.trk=tk.t;S.trkRow=tk.rm;
    const is=rowsToIssues(issR);S.issues=is.a;S.issRow=is.rm;
    S.act=actR.map(r=>({ts:r[0]||'',po:normPo(r[1]),action:r[2]||'',detail:r[3]||'',by:r[4]||'',plat:r[5]||''})).slice(-3000);
    const cfg=Object.assign({},DEFAULT_CFG);setR.forEach(r=>{const v=num(r[1]);if(r[0]&&v!=null)cfg[String(r[0]).trim()]=v;});S.cfg=cfg;
    setR.forEach(r=>{if(String(r[0]||'').trim()==='editor_pin_hash'&&r[1])S.pinHash=String(r[1]);S.pinInSheet=true;});
    S.mode='live';S.lastSync=new Date();
    S.counts={orderBook:ob.size,invoices:I.length,tabs:tabs.size,pos:P.length};
    S.diag.push('Warehouse Master read: '+ob.size+' order-book POs, '+I.length+' invoices, '+tabs.size+' platform-tab POs in '+((Date.now()-t0)/1000).toFixed(1)+'s.');
    S.busy=false;recompute();UI.render();return true;
  }catch(e){
    S.mode='snapshot';S.err='Could not load live data: '+String(e&&e.message||e).slice(0,260);S.diag.push(S.err);S.busy=false;recompute();UI.render();return false;
  }
}

/* --- write queue --- */
let Q=Promise.resolve();
function enqueue(label,fn){
  if(S.mode!=='live'){saveLocal();return Promise.resolve();}
  Q=Q.then(fn).catch(e=>{S.err='Save failed ('+label+'): '+String(e&&e.message||e).slice(0,200);UI.toast(S.err,true);UI.status();});
  return Q;
}
function trkRowValues(t){return TRK_COLS.map(k=>{const v=t[k];return v==null?'':v;});}
async function writeTrk(po){
  const t=S.trk[po];const vals=[trkRowValues(t)];
  if(S.trkRow[po]){const r=S.trkRow[po];await sheets('update_values',{spreadsheetId:TRK_ID,range:'TRACKING!A'+r+':T'+r,values:vals});}
  else{
    const res=await sheets('append_values',{spreadsheetId:TRK_ID,range:'TRACKING!A1',values:vals});
    const up=(res.updates&&res.updates.updatedRange)||res.updatedRange||'';const m=String(up).match(/(\d+):[A-Z]+(\d+)$/);
    if(m)S.trkRow[po]=+m[1];else{const rows=await getRows(TRK_ID,'TRACKING!A2:A5000');rows.forEach((r,i)=>{S.trkRow[normPo(r[0])]=i+2;});}
  }
}
async function appendAct(rows){await sheets('append_values',{spreadsheetId:TRK_ID,range:'ACTIVITY!A1',values:rows});}
function logAct(po,action,detail,plat){
  const row={ts:nowStamp(),po:po||'',action,detail:detail||'',by:S.user||'',plat:plat||''};
  S.act.push(row);
  enqueue('activity',()=>appendAct([[row.ts,row.po,row.action,row.detail,row.by,row.plat]]));
}
function saveTrk(po,patch,action,detail){
  const d=S.byPo&&S.byPo.get(po);
  const t=Object.assign({po:po},S.trk[po]||{},patch);
  t.updated=nowStamp();t.by=S.user||'';if(!t.plat&&d)t.plat=d.plat;
  S.trk[po]=t;
  recompute();
  enqueue('tracking',()=>writeTrk(po));
  if(action)logAct(po,action,detail,t.plat);
  if(S.mode!=='live')saveLocal();
}
function issRowValues(x){return ISS_COLS.map(k=>x[k]==null?'':x[k]);}
async function writeIssue(x){
  const vals=[issRowValues(x)];
  if(S.issRow[x.id]){const r=S.issRow[x.id];await sheets('update_values',{spreadsheetId:TRK_ID,range:'ISSUES!A'+r+':O'+r,values:vals});}
  else{
    const res=await sheets('append_values',{spreadsheetId:TRK_ID,range:'ISSUES!A1',values:vals});
    const up=(res.updates&&res.updates.updatedRange)||res.updatedRange||'';const m=String(up).match(/(\d+):[A-Z]+(\d+)$/);
    if(m)S.issRow[x.id]=+m[1];else{const rows=await getRows(TRK_ID,'ISSUES!A2:A3000');rows.forEach((r,i)=>{S.issRow[r[0]]=i+2;});}
  }
}
function nextIssueId(){let mx=0;S.issues.forEach(i=>{const n=parseInt(String(i.id).replace(/\D/g,''),10);if(n>mx)mx=n;});return 'ISS-'+String(mx+1).padStart(4,'0');}
function saveIssue(x,action){
  x.updated=todayIso();
  const i=S.issues.findIndex(y=>y.id===x.id);
  if(i>=0)S.issues[i]=x;else S.issues.push(x);
  recompute();
  enqueue('issue',()=>writeIssue(x));
  logAct(x.po,action||'Issue',x.id+' '+x.type+' ('+x.status+')',x.plat);
  if(S.mode!=='live')saveLocal();
}
async function saveCfg(cfg){
  S.cfg=Object.assign({},S.cfg,cfg);recompute();
  const keys=Object.keys(DEFAULT_CFG);
  enqueue('settings',()=>sheets('update_values',{spreadsheetId:TRK_ID,range:'SETTINGS!B2:B'+(keys.length+1),values:keys.map(k=>[S.cfg[k]])}));
  if(S.mode!=='live')saveLocal();
}

function savePin(h){
  S.pinHash=h;lsSet('potower_pin',h);
  if(S.mode==='live')enqueue('pin',()=>sheets('update_values',{spreadsheetId:TRK_ID,range:'SETTINGS!A12:B12',values:[['editor_pin_hash',h]]}));
}
async function sha(s){
  try{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('potower|'+s));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');}
  catch(e){let h=5381;const t='potower|'+s;for(let i=0;i<t.length;i++)h=((h<<5)+h+t.charCodeAt(i))>>>0;return 'f'+h.toString(16);}
}
