/* V122: reliable active-time pulses for web, Android PWA, and iOS PWA. */
(function(){
'use strict';
const HEARTBEAT_MS=30000, MAX_COLLECT_MS=60000;
let visible=document.visibilityState!=='hidden',anchor=Date.now(),pendingMs=0,inFlight=false,lastSent=0,pulse=null,sequence=0;
const sessionId=(crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random()).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,70);
function credential(){return window.googleCredential||(typeof googleCredential!=='undefined'?googleCredential:'')||'';}
function collect(now){
  now=now||Date.now();
  if(visible){const elapsed=Math.max(0,now-anchor);pendingMs+=Math.min(elapsed,MAX_COLLECT_MS);}
  anchor=now;
}
function resetWithoutSession(){pendingMs=0;pulse=null;anchor=Date.now();}
window.sendUsageHeartbeat=async function(force,allowHidden){
  const now=Date.now(),token=credential();
  if(!token){resetWithoutSession();return;}
  collect(now);
  if(document.visibilityState==='hidden'&&!allowHidden)return;
  if(inFlight||(!force&&now-lastSent<HEARTBEAT_MS-2000))return;
  if(!pulse){
    const seconds=Math.min(60,Math.floor(pendingMs/1000));
    pulse={id:sessionId+'-'+(++sequence),seconds:seconds};
  }
  inFlight=true;
  try{
    const result=await window.callApi('trackUsage',token,{
      clientTime:new Date().toISOString(),source:'PWA_V18.3.11.122',
      pulseId:pulse.id,activeDeltaSeconds:pulse.seconds
    });
    if(!result?.success)throw new Error(result?.error||'Pencatatan durasi gagal.');
    pendingMs=Math.max(0,pendingMs-pulse.seconds*1000);pulse=null;lastSent=Date.now();
  }catch(e){console.warn('Heartbeat penggunaan gagal:',e);}
  finally{inFlight=false;}
};
function hideAndFlush(){
  if(visible)collect(Date.now());
  visible=false;
  window.sendUsageHeartbeat(true,true);
}
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='hidden')hideAndFlush();
  else {visible=true;anchor=Date.now();window.sendUsageHeartbeat(true,false);}
});
window.addEventListener('pagehide',hideAndFlush);
window.addEventListener('pageshow',function(){visible=true;anchor=Date.now();});
})();
