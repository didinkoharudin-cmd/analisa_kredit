/* V109: birthdays, PNS retirement outreach and stable offer ordering. */
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
  body.innerHTML='<p>'+esc(note)+'</p><p>'+rows.length.toLocaleString('id-ID')+' debitur • satu kartu per CIF</p><div class="care-grid"></div>';
  const grid=body.querySelector('.care-grid');
  rows.slice(0,limit).forEach(d=>{
    const card=document.createElement('article'),r=kind==='retirement'?retirement(d):null;
    card.innerHTML='<h2>'+esc(d.nama)+'</h2><p>CIF '+esc(d.cif)+' • AO '+esc(d.kode_ao||'-')+'</p><p>'+esc(d.dinas||'-')+'</p><p>Tanggal lahir: '+esc(fmt(dob(d)))+'</p>'+(r?'<p>BUP: '+esc(r.age)+' tahun<br>Estimasi pensiun: '+esc(fmt(r.date))+'</p>':'')+'<button type="button" class="care-wa"><i class="fa-brands fa-whatsapp"></i> '+(d.no_hp?'Siapkan pesan WA':'Nomor WA belum tersedia')+'</button>';
    const button=card.querySelector('button');button.disabled=!d.no_hp;button.onclick=()=>showPreview(d);grid.appendChild(card);
  });
  if(!rows.length)grid.textContent='Tidak ada debitur yang sesuai. Pastikan database cabang sudah dimuat dan tanggal lahir tersedia.';
  if(rows.length>limit){const more=document.createElement('button');more.textContent='Tampilkan 40 berikutnya';more.onclick=()=>{limit+=40;render();};body.appendChild(more);}
}
function open(mode,button){
  kind=mode;limit=40;opener=button;modal.querySelector('input').value='';
  modal.querySelector('h1').textContent=mode==='birthday'?'Debitur berulang tahun hari ini':'Debitur 3 bulan menuju pensiun';
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
  .v109-menu{display:flex;width:100%;align-items:center;gap:12px;text-align:left;margin-bottom:12px;color:#1e3a8a;font-weight:700;background:#eff6ff}.v109-menu i{font-size:22px}
  `;document.head.appendChild(style);
  modal=document.createElement('dialog');modal.id='v109Care';modal.setAttribute('aria-labelledby','v109Title');
  modal.innerHTML='<header><button type="button" data-close aria-label="Kembali ke menu">← Menu</button><h1 id="v109Title"></h1></header><main><input type="search" aria-label="Cari debitur" placeholder="Cari nama, CIF, AO atau instansi…"><div data-body></div></main>';
  document.body.appendChild(modal);modal.querySelector('[data-close]').onclick=close;modal.addEventListener('cancel',e=>{e.preventDefault();close();});
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
    const button=document.createElement('button');button.type='button';button.className='v109-menu';button.innerHTML='<i class="fa-solid '+icon+'"></i><span>'+title+'</span>';button.onclick=()=>open(mode,button);menu.prepend(button);
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&modal.open){if(selection)render();else render();}});
}
// Pure helpers are exposed for deterministic regression checks without production data.
window.v109CareRules={matches,retirement,allowed,template,sortOffers};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
