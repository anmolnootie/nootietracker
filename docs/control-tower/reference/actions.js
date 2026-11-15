/* ===== ACTIONS and wiring ===== */
function guessPlat(po){
  if(/^P\d{6,}$/.test(po))return 'Zepto';
  if(/^[A-Z0-9]{3}PO\d+$/.test(po))return 'Swiggy Instamart';
  if(/^FLS/.test(po))return 'Flipkart';
  if(/^\d{12,14}$/.test(po))return 'Blinkit';
  if(/^IRA/.test(po))return 'BigBasket';
  if(/^PUR-ORD/.test(po))return 'Supertails';
  return 'Other';
}
function val(id){const e=document.getElementById(id);return e?e.value.trim():'';}
function mergeTrk(po,patch){
  const d=S.byPo&&S.byPo.get(po);
  const t=Object.assign({po:po},S.trk[po]||{},patch);
  t.updated=nowStamp();t.by=S.user||'';if(!t.plat&&d)t.plat=d.plat;
  S.trk[po]=t;return t;
}
function bulkSave(patches,label,detail){
  const fresh=[],old=[];
  patches.forEach(p=>{const had=!!S.trkRow[p.po];mergeTrk(p.po,p.patch);(had?old:fresh).push(p.po);});
  recompute();
  enqueue('batch',async()=>{
    if(fresh.length){
      const res=await sheets('append_values',{spreadsheetId:TRK_ID,range:'TRACKING!A1',values:fresh.map(po=>trkRowValues(S.trk[po]))});
      const up=(res.updates&&res.updates.updatedRange)||res.updatedRange||'';const m=String(up).match(/(\d+):[A-Z]+(\d+)$/);
      if(m){fresh.forEach((po,i)=>{S.trkRow[po]=+m[1]+i;});}
      else{const rows=await getRows(TRK_ID,'TRACKING!A2:A5000');rows.forEach((r,i)=>{S.trkRow[normPo(r[0])]=i+2;});}
    }
    for(const po of old){const r=S.trkRow[po];await sheets('update_values',{spreadsheetId:TRK_ID,range:'TRACKING!A'+r+':R'+r,values:[trkRowValues(S.trk[po])]});}
  });
  logAct('',label,detail,'');
  if(S.mode!=='live')saveLocal();
}
function handPatch(d,mode,today){
  const base={};
  if(mode==='accept')return {dec:'Accepted',printout:today};
  if(mode==='handed')return {dec:'Accepted',printout:(d&&d.printout)||today,handed:today,handedTo:UI.hand.person||''};
  if(mode==='ack')return {dec:'Accepted',printout:(d&&d.printout)||today,handed:(d&&d.handed)||today,ack:today,ackBy:UI.hand.person||S.user||''};
  if(mode==='decline')return {dec:'Declined',reason:UI.hand.reason};
  return base;
}
function applyBatch(createMissing){
  const list=UI.parseList(),today=S.asof,mode=UI.hand.mode;
  const known=list.filter(p=>S.byPo.get(p)),unknown=list.filter(p=>!S.byPo.get(p));
  if(mode==='handed'&&!(UI.hand.person||'').trim()){UI.toast('Enter who the printouts were handed to.',true);return;}
  const patches=known.map(p=>({po:p,patch:handPatch(S.byPo.get(p),mode,today)}));
  if(createMissing)unknown.forEach(p=>patches.push({po:p,patch:Object.assign({created:'Y',plat:guessPlat(p),date:today},handPatch(null,mode,today))}));
  if(!patches.length){UI.toast('Nothing to apply. Paste at least one PO number.',true);return;}
  const names={accept:'Accepted at order desk',handed:'Handed to warehouse',ack:'Warehouse acknowledged',decline:'Declined'};
  bulkSave(patches,'Batch: '+names[mode],(mode==='handed'?'to '+UI.hand.person+' · ':mode==='ack'&&UI.hand.person?'by '+UI.hand.person+' · ':'')+patches.length+' POs: '+patches.slice(0,5).map(p=>p.po).join(', ')+(patches.length>5?'…':''));
  UI.hand.text='';UI.toast(patches.length+' PO'+(patches.length===1?'':'s')+' updated'+(S.mode==='live'?' and saved to Google Sheets':' on this device'));UI.render();
}
function newIssue(po){
  const d=po&&S.byPo.get(po);
  return {isNew:true,id:nextIssueId(),raised:S.asof,po:po||'',plat:d?d.plat:'',type:ISSUE_TYPES[0],desc:'',by:S.user,owner:'',prio:'Medium',status:'Open',next:addDays(S.asof,1),updated:S.asof,note:'',resolution:'',resolved:''};
}
function readIssue(base){
  const x=Object.assign({},base);delete x.isNew;
  x.po=normPo(val('i-po'));x.type=val('i-type');x.desc=val('i-desc');x.owner=val('i-owner');x.prio=val('i-prio');x.status=val('i-status');x.next=val('i-next');x.note=val('i-note');x.resolution=val('i-res');
  const d=S.byPo.get(x.po);if(d)x.plat=d.plat;
  if(x.status==='Resolved'&&!x.resolved)x.resolved=S.asof;if(x.status!=='Resolved')x.resolved='';
  if(!x.by)x.by=S.user;
  return x;
}
function copyText(txt){
  try{navigator.clipboard.writeText(txt).then(()=>UI.toast('Copied. Paste into Sheets or Excel.'),()=>UI.toast('Copy was blocked by the browser.',true));}catch(e){UI.toast('Copy was blocked by the browser.',true);}
}
async function doUnlock(){
  const name=val('u-name'),pin=val('u-pin');
  if(!name){UI.toast('Enter your name.',true);return;}
  if(!S.pinHash){const p2=val('u-pin2');if(pin.length<4){UI.toast('The PIN needs at least 4 characters.',true);return;}if(pin!==p2){UI.toast('The two PINs do not match.',true);return;}savePin(await sha(pin));}
  else if((await sha(pin))!==S.pinHash){UI.toast('Wrong PIN.',true);return;}
  S.edit=true;S.user=name;lsSet('potower_user',name);try{sessionStorage.setItem('potower_edit',name);}catch(e){}
  const back=UI.drawer&&UI.drawer.back;UI.drawer=back||null;UI.render();UI.toast('Editing unlocked. Changes are saved under '+name+'.');
}
function actionClick(act,arg,el){
  const today=S.asof;
  if(WRITE_ACTS.indexOf(act)>=0&&!S.edit){UI.toast('This is view-only. Unlock editing first.',true);UI.openDrawer({type:'unlock',back:UI.drawer&&UI.drawer.type!=='unlock'?UI.drawer:null});return;}
  switch(act){
    case 'tab':UI.view=arg;UI.render();window.scrollTo(0,0);break;
    case 'flag':UI.f.flag=String(arg);UI.f.team='ALL';UI.f.q='';UI.f.wlLimit=100;UI.view='worklist';UI.render();window.scrollTo(0,0);break;
    case 'stage':UI.f.stage=+arg;UI.view='pipeline';UI.render();window.scrollTo(0,0);break;
    case 'plat':
    case 'scope':UI.goScope(arg,el&&el.getAttribute('data-v')||'overview');UI.render();window.scrollTo(0,0);break;
    case 'home':UI.view='home';UI.render();window.scrollTo(0,0);break;
    case 'fac':UI.f.rg=UI.rgDefault();UI.f.rg.fac=arg;UI.view='register';UI.render();window.scrollTo(0,0);break;
    case 'rgpage':UI.f.rg.page=Math.max(0,UI.f.rg.page+(+arg));UI.render();window.scrollTo(0,0);break;
    case 'gap':UI.f.rg=UI.rgDefault();UI.f.rg.gap=arg;UI.view='register';UI.render();window.scrollTo(0,0);break;
    case 'applyrange':{const fr=$('#f-from').value,to=$('#f-to').value;if(!fr||!to){UI.toast&&UI.toast('Pick both dates','err');break;}UI.setPeriod('custom',fr,to);UI.f.rg.page=0;UI.render();break;}
    case 'period':UI.setPeriod(arg);UI.f.rg.page=0;UI.render();break;
    case 'rgreset':UI.f.rg=UI.rgDefault();UI.render();break;
    case 'copyreg':{const r=UI.regRows();copyText(['PO\tPlatform\tPO date\tFacility\tExpiry\tValue\tStage\tDecision\tProblem\tInvoices\tOwner'].concat(r.map(d=>[d.po,d.plat,d.date||'',d.loc,d.exp||'',Math.round(d.value||0),STAGES[d.stage-1].name,d.dec,d.pri?FLAGS[d.pri].name:'',d.inv.n||'',d.owner].join('\t'))).join('\n'));break;}
    case 'unlock':UI.openDrawer({type:'unlock',back:UI.drawer&&UI.drawer.type!=='unlock'?UI.drawer:null});break;
    case 'dounlock':doUnlock();break;
    case 'lock':S.edit=false;try{sessionStorage.removeItem('potower_edit');}catch(e){}UI.drawer=null;UI.render();UI.toast('Locked. The app is view-only again.');break;
    case 'savepin':{const p=val('new-pin');if(p.length<4){UI.toast('The PIN needs at least 4 characters.',true);break;}sha(p).then(h=>{savePin(h);UI.toast('Editor PIN changed.');UI.render();});break;}
    case 'po':UI.openDrawer({type:'po',po:arg});break;
    case 'accept':saveTrk(arg,{dec:'Accepted',printout:today},'Accepted','Accepted from worklist');UI.toast('Accepted '+arg);UI.render();break;
    case 'handed':UI.openDrawer({type:'hand1',po:arg,mode:'handed'});break;
    case 'ack':UI.openDrawer({type:'hand1',po:arg,mode:'ack'});break;
    case 'dohand1':{
      const dd=UI.drawer;const person=val('h1-person'),dt=val('h1-date')||today;
      if(!person){UI.toast(dd.mode==='handed'?'Enter who it was handed to.':'Enter who acknowledged it.',true);break;}
      const cur=S.byPo.get(dd.po)||{};
      if(dd.mode==='handed')saveTrk(dd.po,{handed:dt,handedTo:person,dec:'Accepted',printout:cur.printout||dt},'Handed to warehouse','to '+person+' on '+fd(dt));
      else saveTrk(dd.po,{ack:dt,ackBy:person,handed:cur.handed||dt},'Warehouse acknowledged','by '+person+' on '+fd(dt));
      UI.drawer=null;UI.toast((dd.mode==='handed'?'Handed to ':'Acknowledged by ')+person);UI.render();break;}
    case 'today':{const e=document.getElementById(arg);if(e)e.value=today;break;}
    case 'savepo':{
      const x=S.byPo.get(arg);const cur=S.trk[arg]||{};
      const patch={dec:val('e-dec'),reason:val('e-reason'),printout:val('e-printout'),handed:val('e-handed'),handedTo:val('e-handedTo'),ack:val('e-ack'),ackBy:val('e-ackBy'),owner:val('e-owner'),ewb:val('e-ewb'),exp:val('e-exp'),rem:val('e-rem')};
      const changed=Object.keys(patch).filter(k=>String((k==='dec'||k==='reason'?(x&&x[k]):(k==='exp'?(x&&x.exp):(cur[k]!=null?cur[k]:(x&&x[k]))))||'')!==String(patch[k]||''));
      if(!changed.length){UI.toast('No changes to save.');break;}
      if(patch.dec==='Declined'&&!patch.reason){UI.toast('Pick a reason before declining.',true);break;}
      saveTrk(arg,patch,'Updated',changed.join(', '));UI.toast('Saved'+(S.mode==='live'?' to Google Sheets':' on this device'));UI.render();break;}
    case 'newissue':UI.openDrawer({type:'issue',issue:newIssue(arg)});break;
    case 'issue':{const i=S.issues.find(y=>y.id===arg);if(i)UI.openDrawer({type:'issue',issue:Object.assign({},i)});break;}
    case 'saveissue':{
      const x=readIssue(UI.drawer.issue);
      if(!x.desc){UI.toast('Describe what happened.',true);break;}
      saveIssue(x,UI.drawer.issue.isNew?'Issue logged':'Issue updated');UI.toast(x.id+' saved');UI.drawer=null;UI.render();break;}
    case 'newpo':UI.openDrawer({type:'newpo'});break;
    case 'savenewpo':{
      const po=normPo(val('n-po'));if(po.length<5){UI.toast('Enter the PO number.',true);break;}
      if(S.byPo.get(po)){UI.toast('That PO already exists. Opening it.',true);UI.openDrawer({type:'po',po});break;}
      const dec=val('n-dec');
      saveTrk(po,{created:'Y',plat:val('n-plat'),date:val('n-date'),exp:val('n-exp'),loc:val('n-loc'),qty:num(val('n-qty')),amt:num(val('n-amt')),dec:dec,printout:dec==='Accepted'?S.asof:''},'PO added',val('n-plat')+' '+(val('n-amt')?money(num(val('n-amt'))):''));
      UI.toast('PO '+po+' added');UI.openDrawer({type:'po',po});UI.render();break;}
    case 'day':UI.openDrawer({type:'day',day:arg});break;
    case 'close':UI.closeDrawer();break;
    case 'hmode':UI.hand.mode=arg;UI.render();break;
    case 'happly':applyBatch(false);break;
    case 'happlynew':applyBatch(true);break;
    case 'morewl':UI.f.wlLimit+=100;UI.render();break;
    case 'morekan':UI.f.kanLimit+=40;UI.render();break;
    case 'copywl':{const r=UI.wlRows();copyText(['Flag\tPO\tPlatform\tFacility\tExpiry\tValue\tAge\tOwner\tNext action'].concat(r.map(d=>[FLAGS[d.pri].name,d.po,d.plat,d.loc,d.exp||'',Math.round(d.value||0),d.age==null?'':d.age,FLAGS[d.pri].team,FLAGS[d.pri].act].join('\t'))).join('\n'));break;}
    case 'savecfg':{const c={};Object.keys(DEFAULT_CFG).forEach(k=>{const v=num(val('cfg-'+k));if(v!=null&&v>=0)c[k]=v;});saveCfg(c);UI.toast('Rules saved');UI.render();break;}
    case 'reload':loadLive();break;
  }
}
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-act]');
  if(el){actionClick(el.getAttribute('data-act'),el.getAttribute('data-arg')||'',el);return;}
  if(!e.target.closest('.search'))$('#results').hidden=true;
});
document.addEventListener('change',e=>{
  const id=e.target.id;
  if(id==='wl-flag'){UI.f.flag=e.target.value;UI.f.wlLimit=100;UI.render();}
  else if(id==='wl-team'){UI.f.team=e.target.value;UI.f.wlLimit=100;UI.render();}
  else if(id==='h-reason'){UI.hand.reason=e.target.value;}
  else if(id==='f-period'){UI.setPeriod(e.target.value);UI.f.rg.page=0;UI.render();}
  else if(id&&id.indexOf('rg-')===0&&id!=='rg-q'){UI.f.rg[id.slice(3)]=e.target.value;UI.f.rg.page=0;UI.render();}
  else if(id==='user-name'){S.user=e.target.value.trim();lsSet('potower_user',S.user);}
});
let tmr;
document.addEventListener('input',e=>{
  const id=e.target.id;
  if(id==='wl-q'){UI.f.q=e.target.value;clearTimeout(tmr);tmr=setTimeout(()=>{const p=e.target.selectionStart;UI.f.wlLimit=100;UI.render();const n=$('#wl-q');if(n){n.focus();n.setSelectionRange(p,p);}},250);}
  else if(id==='h-person'){UI.hand.person=e.target.value;}
  else if(id==='h-text'){UI.hand.text=e.target.value;handPreview();}
  else if(id==='rg-q'){UI.f.rg.q=e.target.value;UI.f.rg.page=0;clearTimeout(tmr);tmr=setTimeout(()=>{const p=e.target.selectionStart;UI.render();const n=$('#rg-q');if(n){n.focus();n.setSelectionRange(p,p);}},250);}
  else if(id==='q')searchBox(e.target);
});
function handPreview(){
  const list=UI.parseList();const known=list.filter(p=>S.byPo.get(p)),unknown=list.filter(p=>!S.byPo.get(p));
  const pv=$('#h-preview');if(pv)pv.innerHTML='<b>'+known.length+'</b> found in the system'+(unknown.length?', <b style="color:var(--crit)">'+unknown.length+'</b> not found: '+unknown.slice(0,6).map(esc).join(', ')+(unknown.length>6?'…':''):'')+'. Date used: today ('+fd(S.asof)+').';
  const ac=$('#h-actions');if(ac)ac.innerHTML='<button class="btn pri" data-act="happly"'+(known.length||unknown.length?'':' disabled')+'>Apply to '+known.length+' PO'+(known.length===1?'':'s')+'</button>'+(unknown.length?'<button class="btn" data-act="happlynew">Create '+unknown.length+' missing PO'+(unknown.length===1?'':'s')+' and apply</button>':'');
}
/* global controls (the top bar is re-rendered, so everything is delegated) */
function searchBox(inp){
  const q=normPo(inp.value),box=$('#results');
  if(q.length<3){box.hidden=true;return;}
  const m=S.D.filter(d=>d.po.indexOf(q)>=0).slice(0,12);
  box.innerHTML=m.length?m.map(d=>'<button data-act="po" data-arg="'+esc(d.po)+'"><span class="mono">'+esc(d.po)+'</span><span class="small">'+esc(d.plat)+' · '+esc(STAGES[d.stage-1].short)+'</span></button>').join(''):'<div class="empty">No PO matches "'+esc(inp.value)+'"</div>';
  box.hidden=false;
}
$('#scrim').addEventListener('click',()=>UI.closeDrawer());
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&UI.drawer)UI.closeDrawer();
  if(e.key==='Enter'&&UI.drawer&&UI.drawer.type==='unlock'&&/^u-/.test(e.target.id||''))doUnlock();
});

/* ---- start ---- */
unpackSnapshot();loadLocal();
S.pinHash=lsGet('potower_pin')||'';
try{const n=sessionStorage.getItem('potower_edit');if(n){S.edit=true;S.user=n;}}catch(e){}
UI.f.rg=UI.rgDefault();UI.setPeriod('fy');
recompute();UI.render();
(async function boot(){
  if(typeof claude==='undefined'||!claude.use){S.diag.push('Google Sheets access is not available in this view.');UI.render();return;}
  const local=lsGet('potower_local');
  const ok=await loadLive();
  if(S.mode==='live'&&S.pinHash&&!S.pinInSheet)savePin(S.pinHash);
  if(ok&&local&&local.trk){
    const keep=Object.keys(local.trk).filter(po=>!S.trk[po]);
    if(keep.length){bulkSave(keep.map(po=>({po,patch:local.trk[po]})),'Local entries synced',keep.length+' POs entered while offline');UI.toast(keep.length+' offline entries were saved to Google Sheets');}
    lsSet('potower_local',null);
  }
  setInterval(()=>{if(S.mode==='live'&&!S.busy&&!document.hidden&&!UI.drawer)Q.then(()=>loadLive());},300000);
})();
