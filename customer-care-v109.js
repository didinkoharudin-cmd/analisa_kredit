/* V110 presentation update; V109 customer-care behavior preserved. */
(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').trim().toUpperCase();
const user=()=>window.currentUser||{};
function today(){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const n=t=>Number(p.find(x=>x.type===t).value);
  return new Date(n('year'),n('month')-1,n('day'),12);
}
function dob(d){
  const v=d.tgl_lahir;
  const date=v instanceof Date?v:(typeof parseExcelDate==='function'?parseExcelDate(v):null);
  return date instanceof Date && Number.isFinite(date.getTime())?date:null;
}
function retirement(d){
  if(norm(typeof parseStatusPegawai==='function'?parseStatusPegawai(d.status_pegawai):d.status_pegawai)!=='PNS')return null;
  const birth=dob(d);if(!birth)return null;
  const age=getConfiguredBupAge('PNS',d.bup);
  if(!(age>0))return null;
  const date=new Date(birth);date.setFullYear(birth.getFullYear()+age);
  return {date,age};
}
function matches(d,kind,now=today()){
  const birth=dob(d);if(!birth||birth>now)return false;
  if(kind==='birthday')return birth.getMonth()===now.getMonth()&&birth.getDate()===now.getDate();
  const r=retirement(d),target=new Date(now.getFullYear(),now.getMonth()+3,1);
  return !!r&&r.date.getFullYear()===target.getFullYear()&&r.date.getMonth()===target.getMonth();
}
function allowed(d,u=user()){
  const role=norm(u.role||u.ROLE);
  if(role==='AO'){
    const code=norm(u.kodeAO||u.kode_ao||u.KODE_AO||u.KODEAO);
    return !!code&&code===norm(d.kode_ao);
  }
  return ['ADMIN','SPV','SUPERVISOR','SUPER_ADMIN'].includes(role);
}
function customers(){
  // Data sumber cabang aktif; tidak bergantung pada kelayakan kartu potensi.
  const database=typeof cifDatabase!=='undefined'?cifDatabase:{};
  const seen=new Set();
  return Object.values(database||{}).filter(d=>{
    if(!d||!allowed(d))return false;
    const key=norm(d.cif);if(!key||seen.has(key))return false;
    seen.add(key);return true;
  });
}
function sortOffers(rows){
  return rows.map((row,index)=>({row,index,flag:!!window.isMonthlyOffered?.(row),time:window.v109OfferTimestamp?.(row)||0}))
    .sort((a,b)=>Number(a.flag)-Number(b.flag)||(a.flag&&b.flag?a.time-b.time:0)||a.index-b.index).map(x=>x.row);
}
window.v109SortOffers=sortOffers;
function template(d,kind){
  const name=String(d.nama||'Bapak/Ibu'),ao=String(user().name||user().nama||user().namaAO||'Account Officer');
  if(kind==='birthday')return `Halo Bapak/Ibu ${name}, perkenalkan saya ${ao} dari bank bjb.\n\nSelamat ulang tahun! Semoga Bapak/Ibu senantiasa diberikan kesehatan, kebahagiaan, keberkahan, dan kesuksesan.\n\nTerima kasih atas kepercayaan Bapak/Ibu kepada bank bjb. Semoga kami dapat terus memberikan pelayanan terbaik.\n\nSalam hangat,\n${ao}`;
  return `Halo bapak/ibu ${name}, perkenalkan saya ${ao}. 3 bulan lagi bapak/ibu akan memasuki masa pensiun, kami bisa membantu pengurusan pensiun bapak/ibu dengan melengkapi persyaratan sebagai berikut :\n- copy ktp\n- copy KK\n- copy buku nikah\n- copy npwp\n- copy SK pensiun\n- pas photo ukuran 3x4\n- copy buku tabungan\n- SKPP\n- Surat keterangan Kuliah (jika masih memiliki anak yg masih kuliah)\n\nUntuk informasi lebih lanjut silahkan balas pesan ini atau datang langsung ke kantor terdekat.\nTerima kasih`;
}
const fmt=d=>d.toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
let modal,kind='birthday',limit=40,selection=null,previousOverflow='',opener=null;
function close(){modal.close();document.body.style.overflow=previousOverflow;selection=null;modal.querySelector('[data-body]').innerHTML='';opener?.focus();}
function showPreview(d){
  if(!allowed(d))return;
  selection=d;
  const body=modal.querySelector('[data-body]');
  body.innerHTML='<button type="button" data-back>← Kembali ke daftar</button><h2>'+esc(d.nama)+'</h2><label for="v109Message">Pesan WhatsApp — dapat diedit</label><textarea id="v109Message" rows="17"></textarea><p>Nomor tujuan: '+esc(d.no_hp||'Belum tersedia')+'</p><button type="button" class="care-wa" data-send><i class="fa-brands fa-whatsapp"></i> Buka WhatsApp</button>';
  body.querySelector('textarea').value=template(d,kind);
  body.querySelector('[data-send]').disabled=!d.no_hp;
}
function render(){
  selection=null;
  const q=modal.querySelector('input').value.trim().toLowerCase(),now=today();
  const rows=customers().filter(d=>matches(d,kind,now)&&(!q||[d.nama,d.cif,d.kode_ao,d.dinas].join(' ').toLowerCase().includes(q)));
  rows.sort((a,b)=>kind==='birthday'?String(a.nama).localeCompare(String(b.nama),'id'):retirement(a).date-retirement(b).date);
  const target=new Date(now.getFullYear(),now.getMonth()+3,1);
  const note=kind==='birthday'?'Ulang tahun '+fmt(now)+' (WIB)': 'Mencapai BUP pada '+target.toLocaleDateString('id-ID',{month:'long',year:'numeric'})+' • Estimasi tanggal lahir + BUP; khusus PNS.';
  const body=modal.querySelector('[data-body]');
  body.innerHTML='<div class="care-summary"><p>'+esc(note)+'</p><span>'+rows.length.toLocaleString('id-ID')+' debitur • satu kartu per CIF</span></div><div class="care-grid v16-debtor-cards"></div>';
  const grid=body.querySelector('.care-grid');
  rows.slice(0,limit).forEach(d=>{
    const card=document.createElement('article'),r=kind==='retirement'?retirement(d):null;
    const tone=r?'topup':'new';
    const initials=String(d.nama||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
    card.className='v16-debtor-card care-card';
    card.innerHTML='<div class="v16-card-main"><div class="v16-avatar '+tone+'" aria-hidden="true">'+esc(initials)+'</div><div class="v16-card-identity"><div class="v16-name-row"><h3 title="'+esc(d.nama)+'">'+esc(d.nama)+'</h3></div><div class="v16-employee">'+esc(d.status_pegawai||'Debitur')+'</div><div class="v16-ao">AO '+esc(d.kode_ao||'-')+' • CIF '+esc(d.cif)+'</div><div class="care-agency">'+esc(d.dinas||'-')+'</div></div></div><div class="care-dates"><div><small>Tanggal lahir</small><strong>'+esc(fmt(dob(d)))+'</strong></div><div><small>'+(r?'Estimasi pensiun':'Ulang tahun')+'</small><strong class="'+(r?'care-green':'')+'">'+(r?esc(fmt(r.date)):'Hari ini')+'</strong></div></div><div class="care-footer"><span class="v16-offer-tag '+tone+'"><i class="fa-solid '+(r?'fa-person-cane':'fa-cake-candles')+'"></i> '+(r?'BUP '+esc(r.age)+' tahun':'Selamat ulang tahun')+'</span><button type="button" class="care-wa"><i class="fa-brands fa-whatsapp"></i> '+(d.no_hp?'Siapkan pesan WA':'Nomor WA belum tersedia')+'</button></div>';
    const button=card.querySelector('button');button.disabled=!d.no_hp;button.onclick=()=>showPreview(d);grid.appendChild(card);
  });
  if(!rows.length)grid.textContent='Tidak ada debitur yang sesuai. Pastikan database cabang sudah dimuat dan tanggal lahir tersedia.';
  if(rows.length>limit){const more=document.createElement('button');more.textContent='Tampilkan 40 berikutnya';more.onclick=()=>{limit+=40;render();};body.appendChild(more);}
}
function open(mode,button){
  kind=mode;limit=40;opener=button;modal.querySelector('input').value='';
  modal.querySelector('h1').textContent=mode==='birthday'?'Debitur berulang tahun hari ini':'Debitur 3 bulan menuju pensiun';
  modal.style.fontFamily=getComputedStyle(document.getElementById('mobileV9Home')||document.body).fontFamily;
  previousOverflow=document.body.style.overflow;modal.showModal();document.body.style.overflow='hidden';render();
}
function boot(){
  const menu=document.querySelector('#v9PageMenu .v9-panel');if(!menu)return;
  const style=document.createElement('style');style.textContent=`
  #v109Care{box-sizing:border-box;position:fixed;inset:0;margin:0;width:100vw;max-width:none;height:100dvh;max-height:none;border:0;padding:0;background:#f5f8fc;color:#172554;font-family:inherit}
  #v109Care::backdrop{background:#0f172a88}#v109Care header{position:sticky;top:0;background:#fff;border-bottom:1px solid #dbe4f0;padding:max(16px,env(safe-area-inset-top)) 20px 16px;display:flex;align-items:center;gap:16px;z-index:1}
  #v109Care h1{font-size:20px;margin:0}#v109Care h2{font-size:17px;font-weight:800;margin:0 0 12px}#v109Care p{margin:10px 0;line-height:1.6}#v109Care main{max-width:1280px;margin:auto;padding:20px 20px max(30px,env(safe-area-inset-bottom))}
  #v109Care button,.v109-menu{border:1px solid #dbe4f0;border-radius:12px;padding:12px 16px;background:white;font:inherit;cursor:pointer;min-height:44px}#v109Care button:disabled{opacity:.5;cursor:default}
  #v109Care .care-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:16px}#v109Care article{padding:22px;border:1px solid #dbe4f0;border-radius:18px;background:white;overflow-wrap:anywhere}
  #v109Care .care-wa{background:#07865e;color:white;border:0}#v109Care input,#v109Care textarea{box-sizing:border-box;width:100%;font:inherit;border:1px solid #cbd5e1;border-radius:12px;padding:14px;background:white;color:#172554}#v109Care textarea{margin:12px 0;line-height:1.6}
  #v9PageMenu .v109-menu{display:flex;width:100%;align-items:center;gap:10px;text-align:left;margin-bottom:10px;color:#fff;font-size:11px;font-weight:900;background:linear-gradient(135deg,#0757c7,#2563eb);border:0;border-radius:14px;padding:13px;box-shadow:0 5px 16px rgba(30,49,80,.055)}
  #v9PageMenu .v109-menu[data-care-kind="retirement"]{background:linear-gradient(135deg,#0f766e,#0891b2)}
  #v9PageMenu .v109-menu i{font-size:20px}#v9PageMenu .v109-menu .care-chevron{font-size:11px;margin-left:auto}
  #v9PageMenu .v109-menu b{display:block}#v9PageMenu .v109-menu small{display:block;margin-top:3px;font-size:8px;font-weight:600;color:#dbeafe}
  #v109Care{background:#f5f8fc;font-size:11px}#v109Care header{background:linear-gradient(135deg,#0757c7,#2563eb);color:white;border-bottom:1px solid #dbe4f0}#v109Care header h1{font-size:17px;font-weight:900}
  #v109Care header button{color:#0757c7;background:#eaf3ff;font-size:11px;font-weight:800;border:1px solid #dbeafe}
  #v109Care .care-summary{color:#50627e;margin:16px 0}#v109Care .care-summary p{margin:0 0 6px}
  #v109Care .care-grid{grid-template-columns:minmax(0,1fr);gap:10px}
  #v109Care article.care-card{min-width:0;padding:12px 12px 9px;border:1px solid #e5eaf1;border-radius:17px;background:#fff;box-shadow:0 5px 16px rgba(30,49,80,.055)}
  #v109Care .v16-name-row h3{font-size:13px;font-weight:900}#v109Care .v16-employee{font-size:9.5px}#v109Care .v16-ao{font-size:9px}
  #v109Care .care-agency{color:#64748b;font-size:9px;margin-top:5px;overflow-wrap:anywhere}
  #v109Care .care-dates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0;padding-left:60px}
  #v109Care .care-dates small{display:block;font-size:8px;color:#64748b;margin-bottom:3px}#v109Care .care-dates strong{display:block;font-size:12.5px;line-height:1.4;color:#0648b2;font-weight:900;overflow-wrap:anywhere}#v109Care .care-dates .care-green{color:#0e9847}
  #v109Care .care-footer{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;border-top:1px solid #edf1f6;padding-top:8px}
  #v109Care .care-wa{display:inline-flex;align-items:center;justify-content:center;gap:6px;max-width:100%;background:linear-gradient(145deg,#25d366,#11a84e);border:0;border-radius:10px;color:#fff;font-size:9.5px;font-weight:900;padding:10px 12px;box-shadow:0 5px 10px rgba(22,163,74,.20)}
  #v109Care button:focus-visible,#v9PageMenu .v109-menu:focus-visible{outline:3px solid #93c5fd;outline-offset:3px}
  @media(min-width:769px){#v109Care .care-grid{gap:16px}#v109Care article.care-card{padding:18px}#v109Care .v16-name-row h3{font-size:15px!important}#v109Care .v16-employee,#v109Care .v16-ao,#v109Care .care-agency{font-size:11px}#v109Care .care-dates small{font-size:11px}#v109Care .care-dates strong{font-size:17px}#v109Care .care-wa{font-size:11px}}
  @media(min-width:1101px){#v109Care .care-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(min-width:1600px){#v109Care main{max-width:1600px}#v109Care .care-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @media(max-width:360px){#v109Care main{padding:12px}#v109Care .care-dates{padding-left:0}#v109Care header h1{font-size:15px}}
  `;document.head.appendChild(style);
  modal=document.createElement('dialog');modal.id='v109Care';modal.setAttribute('aria-labelledby','v109Title');
  modal.innerHTML='<header><button type="button" data-close aria-label="Kembali ke menu">← Menu</button><h1 id="v109Title"></h1></header><main><input type="search" aria-label="Cari debitur" placeholder="Cari nama, CIF, AO atau instansi…"><div data-body></div></main>';
  document.body.appendChild(modal);modal.querySelector('[data-close]').onclick=close;
  const back=()=>{if(selection)render();else close();};
  modal.addEventListener('cancel',e=>{e.preventDefault();if(window.v111AndroidBack)back();else close();});
  window.v111AndroidBack?.register('v109Care',back);
  modal.querySelector('input').oninput=()=>{limit=40;render();};
  modal.addEventListener('click',e=>{
    if(e.target.closest('[data-back]'))render();
    if(e.target.closest('[data-send]')&&selection){
      // Re-resolve in the currently active branch/account before opening the link.
      const d=customers().find(x=>x===selection);if(!d){alert('Data/sesi berubah. Silakan buka kembali daftar debitur.');return;}
      let phone=String(d.no_hp||'').replace(/\D/g,'');if(phone.startsWith('0'))phone='62'+phone.slice(1);else if(phone.startsWith('8'))phone='62'+phone;
      if(!/^\d{8,15}$/.test(phone)){alert('Nomor WhatsApp tidak valid. Perbarui nomor debitur.');return;}
      const message=modal.querySelector('textarea')?.value.trim();if(!message){alert('Isi pesan terlebih dahulu.');return;}
      window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(message),'_blank','noopener');
    }
  });
  for(const [mode,title,icon] of [['birthday','Debitur berulang tahun hari ini','fa-cake-candles'],['retirement','Debitur 3 bulan menuju pensiun','fa-person-cane']]){
    const button=document.createElement('button');button.type='button';button.className='v109-menu';button.dataset.careKind=mode;button.innerHTML='<i class="fa-solid '+icon+'"></i><span><b>'+title+'</b><small>'+(mode==='birthday'?'Ucapan hangat untuk debitur di hari istimewa':'Persiapan pensiun PNS sesuai parameter BUP')+'</small></span><i class="fa-solid fa-chevron-right care-chevron"></i>';button.onclick=()=>open(mode,button);menu.prepend(button);
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&modal.open){if(selection)render();else render();}});
}
// Pure helpers are exposed for deterministic regression checks without production data.
window.v109CareRules={matches,retirement,allowed,template,sortOffers};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
