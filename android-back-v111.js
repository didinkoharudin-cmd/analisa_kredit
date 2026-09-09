/* V112: Android/iOS back navigation. Compatibility filename retained. */
(function(){
'use strict';
const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
if((!/Android/i.test(navigator.userAgent)&&!ios)||window.v111AndroidBack)return;
const registry=new Map();
let pages=['home'],replaying=false,armed=false,leaving=false,account='',frame=0;
const visible=el=>!!el&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';
const session=()=>String(window.currentUser?.email||window.currentUser?.EMAIL||'');
function arm(){
 if(armed||leaving||!session())return;
 if(!history.state?.v111BackGuard)history.pushState({...history.state,v111BackGuard:true},'',location.href);
 armed=true;
}
function register(id,back){registry.set(id,back);}
// Call existing close/back controls so cleanup, timers and form behavior are preserved.
const buttons=[
 'v81CloseDetail','v81CloseProductivity','v80CloseFunnelDetail',
 'v20PhotoViewerClose','v20PhotoClose','v17SimWaClose','v17UserInfoClose',
 'v51ActivityClose','v41CloseInstallmentBrochure','v47CloseProductRequirements',
 'v74SharedDocumentClose','v46ClosePipeline','v25CloseAoMonitoring',
 'v39ChatClose','v12MobileAdminClose','v15AdminBackBtn','v17SimBackHome','pwaInstallClose'
];
function layer(el){
 let z=0;
 for(let p=el;p&&p!==document.body;p=p.parentElement){
  const n=Number.parseInt(getComputedStyle(p).zIndex,10);if(Number.isFinite(n))z=Math.max(z,n);
 }
 return z;
}
function actions(){
 const found=[];
 for(const [id,back] of registry){const el=document.getElementById(id);if(visible(el))found.push({el,back,z:layer(el),priority:2});}
 for(const id of buttons){
  const el=document.getElementById(id);if(visible(el)&&!el.disabled)found.push({el,back:()=>el.click(),z:layer(el),priority:0});
 }
 for(const selector of [
  '#debtorModal button[onclick="closeDebtorModal()"]',
  '#mengulangDetailModal button[onclick="closeMengulangDetailModal()"]',
  '#v77OfferComposer button[onclick="closeVerifiedOfferComposer()"]',
  '#v46ProspectForm button[id*="Close"],#v46ProspectForm button[id*="Cancel"]',
  '#v56BulkModal [data-v56-modal-close]',
  '#v64CloudTestModal [data-v64-test-close]',
  '#mengulangDiagnosticModal button[onclick="closeMengulangDiagnostic()"]'
 ]){
  const el=[...document.querySelectorAll(selector)].find(visible);
  if(el&&!el.disabled)found.push({el,back:()=>el.click(),z:layer(el),priority:1});
 }
 // Thread back precedes closing chat; changing simulator debtor precedes leaving it.
 for(const id of ['v39ChatBack','v17SimBackSearch']){
  const el=document.getElementById(id);if(visible(el))found.push({el,back:()=>el.click(),z:layer(el),priority:3});
 }
 return found.sort((a,b)=>b.z-a.z||b.priority-a.priority)[0];
}
function sync(){
 frame=0;
 const next=session();
 if(next!==account){account=next;pages=['home'];}
 if(next)arm();else pages=['home'];
}
function schedule(){if(!frame)frame=requestAnimationFrame(sync);}
function page(name){
 if(!['home','menu','debitur','activity'].includes(name))return;
 if(replaying)return;
 const next=session();if(next!==account){account=next;pages=['home'];}
 if(name==='home')pages=['home'];
 else if(pages[pages.length-1]!==name){pages.push(name);if(pages.length>40)pages.splice(1,1);}
 arm();
}
function back(){
 const top=actions();
 if(top){top.back();return true;}
 const active=document.querySelector('.v9-page.active');
 const map={v9PageHome:'home',v9PageMenu:'menu',v9PageDebitur:'debitur',v9PageActivity:'activity'};
 const current=map[active?.id];
 if(current&&current!=='home'){
  if(pages[pages.length-1]===current)pages.pop();
  const previous=pages[pages.length-1]||'home';
  const button=document.querySelector('#v9BottomNav [data-v9-page="'+previous+'"]');
  if(button){replaying=true;try{button.click();}finally{replaying=false;}return true;}
 }
 return false;
}
window.v111AndroidBack={page,register};
window.addEventListener('popstate',()=>{
 if(!armed)return;
 armed=false;
 if(session()&&back()){arm();return;}
 // At Home/login hand navigation back to Android/browser; no endless history trap.
 leaving=true;history.back();
});
document.addEventListener('click',schedule,true);
// Safari uses its native edge gesture/history. Installed iOS web apps also get
// a narrow edge gesture; cancel its touch movement to avoid double navigation.
const standalone=ios&&(navigator.standalone===true||window.matchMedia?.('(display-mode: standalone)').matches);
if(standalone){
 let gesture=null;
 document.addEventListener('touchstart',event=>{
  gesture=null;
  if(event.touches.length!==1||!session())return;
  const t=event.touches[0];
  if(t.clientX>24||t.clientX<0||event.target.closest?.('input,textarea,select,[contenteditable="true"],input[type="range"]'))return;
  gesture={x:t.clientX,y:t.clientY,id:t.identifier,start:Date.now(),claimed:false};
 },{passive:true});
 document.addEventListener('touchmove',event=>{
  if(!gesture)return;
  if(event.touches.length!==1){gesture=null;return;}
  const t=event.touches[0],dx=t.clientX-gesture.x,dy=t.clientY-gesture.y;
  if(t.identifier!==gesture.id||Math.abs(dy)>35||dx< -8){gesture=null;return;}
  if(dx>12&&dx>Math.abs(dy)*2){
   if(!event.cancelable){gesture=null;return;}
   event.preventDefault();gesture.claimed=true;
  }
 },{passive:false});
 document.addEventListener('touchend',event=>{
  const g=gesture;gesture=null;if(!g||!g.claimed)return;
  const t=Array.from(event.changedTouches).find(t=>t.identifier===g.id);
  if(!t||t.clientX-g.x<70||Math.abs(t.clientY-g.y)>35||Date.now()-g.start>1200)return;
  if(event.cancelable)event.preventDefault();
  // Do not attempt to close iOS itself from the installed app's Home screen.
  const active=document.querySelector('.v9-page.active');
  if(actions()||(active&&active.id!=='v9PageHome')){arm();if(armed)history.back();}
 },{passive:false});
 document.addEventListener('touchcancel',()=>{gesture=null;},{passive:true});
}
window.addEventListener('focus',schedule);
window.addEventListener('pageshow',()=>{leaving=false;armed=!!history.state?.v111BackGuard;schedule();});
// Login is asynchronous; observe only changes to account/layout containers.
const observer=new MutationObserver(records=>{
 if(records.some(r=>/^(mobileV9Home|v12RoleGate|v12MobileAdmin|login|auth)/i.test(r.target.id||'')))schedule();
});
observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','style','hidden']});
schedule();
})();
