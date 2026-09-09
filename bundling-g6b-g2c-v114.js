/* V114 — Simulasi bundling NEW atau G6B MENGULANG + G2C NEW. */
(function(){
'use strict';
const PRODUCT='BUNDLING-G6B-G2C';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>'Rp '+Math.round(Number(v)||0).toLocaleString('id-ID');
const norm=v=>String(v??'').trim().toUpperCase();
const parseMoney=v=>Math.max(0,Number(String(v??'').replace(/\./g,'').replace(/,/g,'.').replace(/[^\d.-]/g,''))||0);
const user=()=>window.currentUser||{};
function birth(deb){
 const v=deb?.tgl_lahir;
 const d=v instanceof Date?v:(typeof parseExcelDate==='function'?parseExcelDate(v):null);
 return d instanceof Date&&Number.isFinite(d.getTime())?d:null;
}
function monthsUntil(date,now=new Date()){
 if(!(date instanceof Date)||!Number.isFinite(date.getTime()))return null;
 let m=(date.getFullYear()-now.getFullYear())*12+date.getMonth()-now.getMonth();
 if(date.getDate()<now.getDate())m--;
 return m;
}
function bupInfo(deb,now=new Date()){
 const dob=birth(deb);if(!dob)return null;
 const age=typeof getConfiguredBupAge==='function'?Number(getConfiguredBupAge('PNS',deb.bup)||60):Number(deb.bup||60);
 const date=new Date(dob);date.setFullYear(dob.getFullYear()+age);
 return {age,date,remainingMonths:monthsUntil(date,now)};
}
function source(f){
 try{const parsed=norm(simFacilitySource(f));if(parsed)return parsed;}catch(e){}
 const direct=norm(f?.sumber_penghasilan||f?.prodInfo?.sumber);
 if(direct)return direct.includes('PENSIUN')?'GAJI':direct;
 const code=norm(f?.tipe_pinjaman);
 try{return norm((productParams?.[code]||getProdRule?.(code))?.sumber);}catch(e){return '';}
}
function productCode(f){
 try{const parsed=norm(simProductCodeFromFacility(f));if(parsed)return parsed;}catch(e){}
 return norm(f?.tipe_pinjaman||f?.kode_produk||f?.produk||f?.prodInfo?.code||f?.prodInfo?.name);
}
function access(deb,u=user()){
 const role=norm(u.role||u.ROLE);
 if(role==='AO'){
  const own=norm(u.kodeAO||u.kode_ao||u.KODE_AO||u.KODEAO);
  return !!own&&own===norm(deb?.kode_ao);
 }
 return ['ADMIN','SPV','SUPERVISOR','SUPER_ADMIN'].includes(role);
}
function eligibility(deb,now=new Date(),u=user(),scenario='NEW'){
 const mode=norm(scenario)==='MENGULANG'?'MENGULANG':'NEW';
 if(!deb||!access(deb,u))return {ok:false,reason:'Tidak tersedia untuk akun ini'};
 let status=norm(deb.status_pegawai);
 try{status=norm(parseStatusPegawai(status)||status);}catch(e){}
 if(status!=='PNS')return {ok:false,reason:'Khusus PNS'};
 const info=bupInfo(deb,now);
 if(!info)return {ok:false,reason:'Tanggal lahir belum tersedia'};
 if(!(info.remainingMonths>0&&info.remainingMonths<=120))return {ok:false,reason:'Di luar periode maksimal 120 bulan menuju BUP'};
 const salary=Math.max(0,Number(deb.income?.GAJI||0));
 if(!salary)return {ok:false,reason:'Penghasilan GAJI belum tersedia'};
 const salaryFacilities=(deb.facilities||[]).filter(f=>source(f)==='GAJI');
 const renewalFacilities=salaryFacilities.filter(f=>productCode(f)==='G6B');
 if(mode==='NEW'&&salaryFacilities.length)return {ok:false,reason:'Sudah memiliki fasilitas bersumber GAJI'};
 if(mode==='MENGULANG'&&!renewalFacilities.length)return {ok:false,reason:'Tidak memiliki fasilitas G6B bersumber GAJI untuk diulang'};
 const g6bRule=typeof getProdRule==='function'?getProdRule('G6B'):productParams?.G6B;
 const g2cRule=typeof getProdRule==='function'?getProdRule('G2C'):productParams?.G2C;
 if(!g6bRule||!g2cRule)return {ok:false,reason:'Parameter G6B/G2C belum tersedia'};
 const g6bMax=Math.min(Number(g6bRule.maxTenorProduct||300),info.remainingMonths);
 const until70=new Date(birth(deb));until70.setFullYear(until70.getFullYear()+70);
 const g2cMax=Math.min(Number(g2cRule.maxTenorProduct||180),Math.max(0,monthsUntil(until70,now)||0));
 if(g6bMax<6||g2cMax<=info.remainingMonths)return {ok:false,reason:'Tenor bundling tidak mencukupi'};
 return {ok:true,mode,info,salary,salaryFacilities,renewalFacilities,g6bMax:Math.floor(g6bMax),g2cMax:Math.floor(g2cMax),g2cMin:Math.max(6,Math.floor(info.remainingMonths)+1)};
}
function renewalCapacity(selectedFacilities,allSalaryFacilities,activeIncome){
 const selected=(selectedFacilities||[]).filter(Boolean),all=(allSalaryFacilities||[]).filter(Boolean);
 const sum=(rows,key)=>rows.reduce((total,row)=>total+Math.max(0,Number(row?.[key])||0),0);
 const activeRpc=Math.max(0,Number(activeIncome)||0)*.90;
 const existingInstallment=sum(all,'angsuran_eksisting');
 const releasedInstallment=sum(selected,'angsuran_eksisting');
 return {
  activeRpc,existingInstallment,releasedInstallment,
  available:Math.max(0,activeRpc-existingInstallment+releasedInstallment),
  bakiDebet:sum(selected,'baki_debet'),bungaBerjalan:sum(selected,'bunga_berjalan'),musisiAsuransi:sum(selected,'musisi_asuransi')
 };
}
function allocate(activeCapacity,pensionCapacity,percent){
 const active=Math.max(0,Number(activeCapacity)||0),pension=Math.max(0,Number(pensionCapacity)||0);
 const pct=Math.max(0,Math.min(100,Number(percent)||0));
 const g2c=Math.min(active*pct/100,pension);
 return {g2c,g6b:Math.max(0,active-g2c),total:g2c+Math.max(0,active-g2c)};
}
function database(){try{return Object.values(cifDatabase||{});}catch(e){return [];}}
function eligibleRows(q='',scenario='NEW'){
 const needle=String(q).trim().toLowerCase(),seen=new Set(),now=new Date();
 return database().filter(d=>{
  const cif=norm(d?.cif);if(!cif||seen.has(cif)||!eligibility(d,now,user(),scenario).ok)return false;seen.add(cif);
  return !needle||[d.nama,d.cif,d.dinas,d.kode_ao].join(' ').toLowerCase().includes(needle);
 }).sort((a,b)=>String(a.nama||'').localeCompare(String(b.nama||''),'id'));
}
function installment(gross,tenor,product,offer='NEW',context=null){
 try{return Math.max(0,Number(calculateInstallmentFromPlafon(gross,tenor,product,offer,context)||0));}catch(e){return 0;}
}
function grossFromInstallment(value,tenor,product,offer='NEW',context=null){
 try{return Math.max(0,Number(calculatePlafonFromAngsuran(value,tenor,product,offer,context)||0));}catch(e){return 0;}
}
function fees(deb,gross,tenor,product,inst,offer='NEW',settlement={},context=null){
 try{
  const rules=getDebtorTenorRules(deb.status_pegawai,deb.tgl_lahir,deb.bup,product==='G6B'?300:180,deb.tgl_pelantikan,deb.masa_jabatan_bulan);
  return calculateCreditFees(gross,tenor,product,deb.status_pegawai,rules.usiaAsuransi||rules.usiaTahun||0,Number(settlement.bakiDebet||0),inst,Number(settlement.bungaBerjalan||0),Number(settlement.musisiAsuransi||0),offer,context);
 }catch(e){return {netPencairan:0,totalPotongan:0};}
}
let modal,selected=null,stage='search',mode='NEW',previousProduct='G6B',previousOverflow='';
function close(){if(!modal?.open)return;modal.close();document.body.style.overflow=previousOverflow;stage='search';selected=null;}
function back(){if(stage==='calc'){stage='search';selected=null;renderSearch();}else close();}
function renderSearch(){
 stage='search';mode=modal.querySelector('[data-mode]').value==='MENGULANG'?'MENGULANG':'NEW';
 const q=modal.querySelector('[data-search]').value,rows=q.trim().length>=2?eligibleRows(q,mode):[];
 const body=modal.querySelector('[data-body]');
 const criteria=mode==='MENGULANG'?'PNS • 6–120 bulan menuju BUP • memiliki fasilitas G6B dari GAJI':'PNS • 6–120 bulan menuju BUP • GAJI tersedia • belum memiliki fasilitas GAJI';
 body.innerHTML='<div class="bundle-note"><b>Kriteria '+(mode==='MENGULANG'?'G6B MENGULANG + G2C NEW':'G6B NEW + G2C NEW')+'</b><span>'+criteria+'</span></div>'+
  (q.trim().length<2?'<div class="bundle-empty">Ketik minimal 2 karakter nama atau CIF.</div>':rows.length?'<div class="bundle-list">'+rows.slice(0,40).map((d,i)=>{const e=eligibility(d,new Date(),user(),mode);return '<button type="button" data-deb="'+i+'"><span class="bundle-avatar">'+esc(String(d.nama||'?').trim()[0]||'?')+'</span><span><b>'+esc(d.nama)+'</b><small>CIF '+esc(d.cif)+' • AO '+esc(d.kode_ao||'-')+'<br>'+esc(d.dinas||'-')+'</small></span><span><small>Menuju BUP</small><b>'+e.info.remainingMonths+' bln</b></span><i class="fa-solid fa-chevron-right"></i></button>'}).join('')+'</div>':'<div class="bundle-empty">Tidak ada debitur yang memenuhi seluruh kriteria bundling.</div>');
 body.querySelectorAll('[data-deb]').forEach((button,i)=>button.onclick=()=>select(rows[i]));
}
function selectedRenewals(){
 if(!selected||mode!=='MENGULANG')return [];
 const checks=[...modal.querySelectorAll('[data-renewal]:checked')];
 return checks.map(check=>selected.e.renewalFacilities[Number(check.dataset.renewal)]).filter(Boolean);
}
function select(deb){
 const e=eligibility(deb,new Date(),user(),mode);if(!e.ok){alert(e.reason);renderSearch();return;}
 selected={deb,e};stage='calc';
 const pension=Number(deb.income?.PENSIUN||deb.gaji_pensiun||0);
 const renewalPicker=mode==='MENGULANG'?`<fieldset class="bundle-renewals"><legend>Fasilitas G6B yang akan diulang</legend>${e.renewalFacilities.map((f,i)=>`<label><input data-renewal="${i}" type="checkbox" checked><span><b>${esc(f.no_pinjaman||f.loan_id||'G6B')}</b><small>Angsuran ${money(f.angsuran_eksisting)} • Baki ${money(f.baki_debet)}</small></span></label>`).join('')}</fieldset>`:'';
 modal.querySelector('[data-body]').innerHTML=`
 <button type="button" data-back>← Ganti debitur</button>
 <div class="bundle-person"><span class="bundle-avatar">${esc(String(deb.nama||'?')[0])}</span><span><b>${esc(deb.nama)}</b><small>CIF ${esc(deb.cif)} • ${esc(deb.dinas||'-')}<br>BUP ${e.info.age} tahun • ${e.info.remainingMonths} bulan lagi</small></span></div>
 ${renewalPicker}
 <div class="bundle-params">
  <label>Gaji aktif<input data-active type="text" inputmode="numeric" value="${Math.round(e.salary).toLocaleString('id-ID')}"></label>
  <label>Estimasi gaji pensiun<input data-pension type="text" inputmode="numeric" value="${pension?Math.round(pension).toLocaleString('id-ID'):''}" placeholder="Wajib diisi"></label>
  <label>Alokasi RPC untuk G2C <output data-allocation-out>50%</output><input data-allocation type="range" min="0" max="100" step="5" value="50"></label>
 </div>
 <div class="bundle-products">
  <section><h3>G6B <span>${mode==='MENGULANG'?'MENGULANG':'NEW'} • GAJI AKTIF</span></h3><label>Tenor<input data-g6b-tenor type="number" min="6" max="${e.g6bMax}" value="${e.g6bMax}"></label><label>Plafond Gross<input data-g6b-gross type="text" inputmode="numeric" value="0"></label><div data-g6b-result></div></section>
  <section><h3>G2C <span>NEW • GAJI AKTIF/PENSIUN</span></h3><label>Tenor<input data-g2c-tenor type="number" min="${e.g2cMin}" max="${e.g2cMax}" value="${e.g2cMax}"></label><label>Plafond Gross<input data-g2c-gross type="text" inputmode="numeric" value="0"></label><div data-g2c-result></div></section>
 </div>
 <button type="button" class="bundle-max" data-max><i class="fa-solid fa-wand-magic-sparkles"></i> Gunakan Plafond Maksimal Sesuai Alokasi</button>
 <div class="bundle-total" data-total></div>`;
 const body=modal.querySelector('[data-body]');
 body.querySelector('[data-back]').onclick=back;
 body.querySelector('[data-max]').onclick=()=>recalc(true);
 body.querySelectorAll('[data-renewal]').forEach(input=>input.addEventListener('change',()=>recalc(true)));
 body.querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>{
  if(input.matches('[data-renewal]'))return;
  if(input.matches('[data-allocation]'))body.querySelector('[data-allocation-out]').value=input.value+'%';
  recalc(input.matches('[data-active],[data-pension],[data-allocation],[data-g6b-tenor],[data-g2c-tenor]'));
 }));
 recalc(false);
}
function recalc(resetGross){
 if(!selected)return;const body=modal.querySelector('[data-body]'),{deb,e}=selected;
 const active=parseMoney(body.querySelector('[data-active]').value),pension=parseMoney(body.querySelector('[data-pension]').value);
 const g6bTenor=Math.max(6,Math.min(e.g6bMax,Number(body.querySelector('[data-g6b-tenor]').value)||e.g6bMax));
 const g2cTenor=Math.max(e.g2cMin,Math.min(e.g2cMax,Number(body.querySelector('[data-g2c-tenor]').value)||e.g2cMax));
 body.querySelector('[data-g6b-tenor]').value=g6bTenor;body.querySelector('[data-g2c-tenor]').value=g2cTenor;
 const renewals=selectedRenewals(),context=mode==='MENGULANG'?{facilities:renewals}:null;
 const settlement=renewalCapacity(renewals,mode==='MENGULANG'?e.salaryFacilities:[],active);
 const canCalculate=mode!=='MENGULANG'||renewals.length>0;
 const cap=allocate(canCalculate?settlement.available:0,pension*.90,body.querySelector('[data-allocation]').value);
 const maxG6b=grossFromInstallment(cap.g6b,g6bTenor,'G6B',mode,context),maxG2c=grossFromInstallment(cap.g2c,g2cTenor,'G2C','NEW');
 let grossG6b=parseMoney(body.querySelector('[data-g6b-gross]').value),grossG2c=parseMoney(body.querySelector('[data-g2c-gross]').value);
 if(resetGross){grossG6b=maxG6b;grossG2c=maxG2c;}else{grossG6b=Math.min(grossG6b,maxG6b);grossG2c=Math.min(grossG2c,maxG2c);}
 body.querySelector('[data-g6b-gross]').value=Math.round(grossG6b).toLocaleString('id-ID');body.querySelector('[data-g2c-gross]').value=Math.round(grossG2c).toLocaleString('id-ID');
 const instG6b=installment(grossG6b,g6bTenor,'G6B',mode,context),instG2c=installment(grossG2c,g2cTenor,'G2C','NEW');
 const feeG6b=fees(deb,grossG6b,g6bTenor,'G6B',instG6b,mode,mode==='MENGULANG'?settlement:{},context),feeG2c=fees(deb,grossG2c,g2cTenor,'G2C',instG2c,'NEW');
 const rateG6b=Number(getInterestRate?.('G6B',mode,context)||0)*100,rateG2c=Number(getInterestRate?.('G2C','NEW')||0)*100;
 body.querySelector('[data-g6b-result]').innerHTML=`<p><small>Maks. sesuai alokasi</small><b>${money(maxG6b)}</b></p><p><small>Bunga</small><b>${rateG6b.toFixed(2)}% p.a.</b></p><p><small>Angsuran</small><b>${money(instG6b)}</b></p><p><small>Nett</small><b class="green">${money(feeG6b.netPencairan)}</b></p>`;
 body.querySelector('[data-g2c-result]').innerHTML=`<p><small>Maks. sesuai alokasi</small><b>${money(maxG2c)}</b></p><p><small>Bunga</small><b>${rateG2c.toFixed(2)}% p.a.</b></p><p><small>Angsuran</small><b>${money(instG2c)}</b></p><p><small>Nett</small><b class="green">${money(feeG2c.netPencairan)}</b></p>`;
 const used=instG6b+instG2c,totalGross=grossG6b+grossG2c,totalNet=Number(feeG6b.netPencairan||0)+Number(feeG2c.netPencairan||0);
 const finalCommitment=settlement.existingInstallment-settlement.releasedInstallment+used;
 const renewalLine=mode==='MENGULANG'?`${renewals.length?'Fasilitas diulang '+renewals.length:'Pilih minimal satu fasilitas G6B'} • Angsuran dibebaskan ${money(settlement.releasedInstallment)}<br>Pelunasan: baki ${money(settlement.bakiDebet)} • bunga berjalan ${money(settlement.bungaBerjalan)} • MUSISI ${money(settlement.musisiAsuransi)}<br>`:'';
 body.querySelector('[data-total]').innerHTML=`<div><small>Total Plafond Gross Bundling</small><strong>${money(totalGross)}</strong></div><div><small>Total Nett Bundling</small><strong>${money(totalNet)}</strong></div><div><small>Total Angsuran Setelah Bundling</small><strong>${money(finalCommitment)} / ${money(settlement.activeRpc)}</strong></div><p>${renewalLine}RPC aktif ${money(settlement.activeRpc)} • kewajiban lama ${money(settlement.existingInstallment)} • ruang efektif ${money(settlement.available)}<br>Alokasi: G6B ${money(cap.g6b)} • G2C ${money(cap.g2c)}. RPC G2C juga dibatasi estimasi pensiun ${money(pension*.90)}.<br>Fase G2C: ${Math.min(g2cTenor,e.info.remainingMonths)} bulan gaji aktif + ${Math.max(0,g2cTenor-e.info.remainingMonths)} bulan gaji pensiun.</p>`;
}
function open(){
 if(!modal)return;previousOverflow=document.body.style.overflow;stage='search';selected=null;modal.querySelector('[data-search]').value='';modal.showModal();document.body.style.overflow='hidden';renderSearch();
}
function option(){
 const select=document.getElementById('v17SimProduct');if(!select)return;
 if(![...select.options].some(o=>o.value===PRODUCT)){const o=document.createElement('option');o.value=PRODUCT;o.textContent='BUNDLING G6B + G2C • PNS';select.appendChild(o);}
}
function boot(){
 const shortcut=document.getElementById('v113BundleShortcut');if(shortcut)shortcut.addEventListener('click',open);
 const select=document.getElementById('v17SimProduct');
 if(select){option();select.addEventListener('focus',()=>{if(select.value!==PRODUCT)previousProduct=select.value||'G6B';});select.addEventListener('change',event=>{if(select.value!==PRODUCT)return;event.stopImmediatePropagation();select.value=[...select.options].some(o=>o.value===previousProduct)?previousProduct:'G6B';open();},true);new MutationObserver(option).observe(select,{childList:true});}
 const style=document.createElement('style');style.textContent=`
 #v113Bundle{box-sizing:border-box;position:fixed;inset:0;margin:0;width:100vw;height:100dvh;max-width:none;max-height:none;border:0;padding:0;background:#f5f8fc;color:#0f172a;font-family:inherit;font-size:11px}#v113Bundle::backdrop{background:#0f172a99}
 #v113Bundle header{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:12px;padding:max(14px,env(safe-area-inset-top)) 16px 14px;background:linear-gradient(135deg,#1e3a8a,#0f766e);color:#fff}#v113Bundle header button{border:0;border-radius:11px;background:#ffffff26;color:#fff;min-width:44px;min-height:44px;font-size:18px}#v113Bundle header h1{margin:0;font-size:17px;font-weight:900}#v113Bundle header p{margin:3px 0 0;color:#dbeafe;font-size:9px}
 #v113Bundle main{max-width:1180px;margin:auto;padding:18px 18px max(30px,env(safe-area-inset-bottom))}#v113Bundle input,#v113Bundle select{box-sizing:border-box;width:100%;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#0f172a;padding:12px;font:inherit;font-weight:800}#v113Bundle [data-search]{font-size:13px}.bundle-scenario{display:grid;grid-template-columns:170px minmax(0,1fr);gap:10px;margin-bottom:10px}.bundle-scenario select{color:#124f9f}
 .bundle-note,.bundle-person,.bundle-total{margin:14px 0;padding:15px;border:1px solid #dbeafe;border-radius:16px;background:#eff6ff}.bundle-note{display:flex;flex-direction:column;gap:4px;color:#1e3a8a}.bundle-empty{text-align:center;padding:35px;color:#64748b}.bundle-list{display:grid;gap:9px;margin-top:12px}.bundle-list button{display:grid;grid-template-columns:46px minmax(0,1fr) auto 12px;align-items:center;gap:10px;width:100%;border:1px solid #e5eaf1;border-radius:15px;background:#fff;padding:12px;text-align:left;color:#0f172a;font:inherit}.bundle-list small,.bundle-person small{display:block;color:#64748b;font-size:9px;line-height:1.5;margin-top:3px}.bundle-avatar{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:#e4f0ff;color:#1458c8;font-size:18px;font-weight:900}.bundle-person{display:flex;align-items:center;gap:12px;background:#fff;border-color:#e5eaf1}.bundle-person>b{font-size:13px}
 #v113Bundle [data-back],.bundle-max{border:0;border-radius:11px;padding:11px 14px;font:inherit;font-weight:900}.bundle-renewals{display:grid;gap:8px;margin:12px 0;border:1px solid #fed7aa;border-radius:16px;background:#fff7ed;padding:12px}.bundle-renewals legend{padding:0 6px;color:#9a3412;font-weight:900}.bundle-renewals label{display:flex;align-items:center;gap:9px;border:1px solid #ffedd5;border-radius:11px;background:#fff;padding:10px}.bundle-renewals input{width:18px!important;height:18px;padding:0!important}.bundle-renewals small{display:block;margin-top:2px;color:#64748b}.bundle-params,.bundle-products{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0}.bundle-params label,.bundle-products section{border:1px solid #e5eaf1;border-radius:16px;background:#fff;padding:14px}.bundle-params label:nth-child(3){grid-column:1/-1}.bundle-params label{color:#50627e;font-size:9px}.bundle-params output{float:right;color:#1458c8;font-weight:900}.bundle-params input{margin-top:7px}.bundle-products section h3{display:flex;justify-content:space-between;gap:8px;margin:0 0 12px;font-size:15px;color:#172554}.bundle-products section h3 span{font-size:8px;background:#eaf3ff;color:#1157c4;border-radius:8px;padding:5px 7px}.bundle-products label{display:block;margin:9px 0;color:#50627e;font-size:9px}.bundle-products label input{margin-top:5px}.bundle-products [data-g6b-result],.bundle-products [data-g2c-result]{display:grid;grid-template-columns:1fr 1fr;gap:7px;border-top:1px solid #edf1f6;margin-top:12px;padding-top:10px}.bundle-products p{margin:0}.bundle-products small,.bundle-total small{display:block;color:#64748b;font-size:8px}.bundle-products b{display:block;margin-top:3px;color:#0648b2;font-size:12px}.bundle-products .green{color:#0e9847}.bundle-max{display:block;width:100%;background:#0757c7;color:#fff;min-height:46px}.bundle-total{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;background:#ecfdf5;border-color:#a7f3d0}.bundle-total strong{display:block;margin-top:5px;color:#047857;font-size:16px}.bundle-total p{grid-column:1/-1;margin:0;border-top:1px solid #a7f3d0;padding-top:10px;color:#166534;line-height:1.6}
 @media(max-width:680px){.bundle-scenario,.bundle-params,.bundle-products,.bundle-total{grid-template-columns:1fr}.bundle-params label:nth-child(3),.bundle-total p{grid-column:1}.bundle-list button{grid-template-columns:42px minmax(0,1fr) 10px}.bundle-list button>span:nth-child(3){display:none}#v113Bundle main{padding:14px}.bundle-products section{padding:12px}}
 `;document.head.appendChild(style);
 modal=document.createElement('dialog');modal.id='v113Bundle';modal.innerHTML='<header><button type="button" data-close aria-label="Kembali"><i class="fa-solid fa-arrow-left"></i></button><div><h1>Simulasi Bundling G6B + G2C</h1><p>NEW atau MENGULANG • satu batas RPC gaji aktif</p></div></header><main><div class="bundle-scenario"><select data-mode aria-label="Skenario bundling"><option value="NEW">G6B NEW + G2C NEW</option><option value="MENGULANG">G6B MENGULANG + G2C NEW</option></select><input data-search type="search" autocomplete="off" placeholder="Cari nama atau CIF debitur…"></div><div data-body></div></main>';
 document.body.appendChild(modal);modal.querySelector('[data-close]').onclick=back;modal.querySelector('[data-search]').oninput=renderSearch;modal.querySelector('[data-mode]').onchange=()=>{selected=null;modal.querySelector('[data-search]').value='';renderSearch();};modal.addEventListener('cancel',e=>{e.preventDefault();back();});window.v111AndroidBack?.register('v113Bundle',back);
}
window.v114BundleRules={monthsUntil,bupInfo,source,productCode,access,eligibility,renewalCapacity,allocate};
window.v113BundleRules=window.v114BundleRules;
window.openBundlingG6bG2c=open;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
