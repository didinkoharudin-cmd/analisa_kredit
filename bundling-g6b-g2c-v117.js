/* V117 — Bundling G6B/G2C dan integrasi form manual berbasis skenario. */
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
 const scenarioMode=norm(scenario)==='MENGULANG'?'MENGULANG':'NEW';
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
 if(scenarioMode==='NEW'&&salaryFacilities.length)return {ok:false,reason:'Sudah memiliki fasilitas bersumber GAJI'};
 if(scenarioMode==='MENGULANG'&&!renewalFacilities.length)return {ok:false,reason:'Tidak memiliki fasilitas G6B bersumber GAJI untuk diulang'};
 const g6bRule=typeof getProdRule==='function'?getProdRule('G6B'):productParams?.G6B;
 const g2cRule=typeof getProdRule==='function'?getProdRule('G2C'):productParams?.G2C;
 if(!g6bRule||!g2cRule)return {ok:false,reason:'Parameter G6B/G2C belum tersedia'};
 const g6bMax=Math.min(Number(g6bRule.maxTenorProduct||300),info.remainingMonths);
 const until70=new Date(birth(deb));until70.setFullYear(until70.getFullYear()+70);
 const g2cMax=Math.min(Number(g2cRule.maxTenorProduct||180),Math.max(0,monthsUntil(until70,now)||0));
 if(g6bMax<6||g2cMax<=info.remainingMonths)return {ok:false,reason:'Tenor bundling tidak mencukupi'};
 return {ok:true,mode:scenarioMode,info,salary,salaryFacilities,renewalFacilities,g6bMax:Math.floor(g6bMax),g2cMax:Math.floor(g2cMax),g2cMin:Math.max(6,Math.floor(info.remainingMonths)+1)};
}
function renewalCapacity(selectedFacilities,allSalaryFacilities,activeIncome){
 const chosen=(selectedFacilities||[]).filter(Boolean),all=(allSalaryFacilities||[]).filter(Boolean);
 const sum=(rows,key)=>rows.reduce((total,row)=>total+Math.max(0,Number(row?.[key])||0),0);
 const activeRpc=Math.max(0,Number(activeIncome)||0)*.90;
 const existingInstallment=sum(all,'angsuran_eksisting');
 const releasedInstallment=sum(chosen,'angsuran_eksisting');
 return {activeRpc,existingInstallment,releasedInstallment,
  available:Math.max(0,activeRpc-existingInstallment+releasedInstallment),
  bakiDebet:sum(chosen,'baki_debet'),bungaBerjalan:sum(chosen,'bunga_berjalan'),musisiAsuransi:sum(chosen,'musisi_asuransi')};
}
function allocate(activeCapacity,pensionCapacity,percent){
 const active=Math.max(0,Number(activeCapacity)||0),pension=Math.max(0,Number(pensionCapacity)||0);
 const pct=Math.max(0,Math.min(100,Number(percent)||0));
 const g2c=Math.min(active*pct/100,pension);
 return {g2c,g6b:Math.max(0,active-g2c),total:g2c+Math.max(0,active-g2c)};
}
function annuityInstallment(gross,tenor,annualRate){
 gross=Math.max(0,Number(gross)||0);tenor=Math.max(0,Number(tenor)||0);annualRate=Math.max(0,Number(annualRate)||0);
 if(!gross||!tenor)return 0;const i=annualRate/12;
 return i===0?gross/tenor:gross*i/(1-Math.pow(1+i,-tenor));
}
function annuityGross(installment,tenor,annualRate){
 installment=Math.max(0,Number(installment)||0);tenor=Math.max(0,Number(tenor)||0);annualRate=Math.max(0,Number(annualRate)||0);
 if(!installment||!tenor)return 0;const i=annualRate/12;
 const raw=i===0?installment*tenor:installment*(1-Math.pow(1+i,-tenor))/i;
 return Math.floor(raw/1000000)*1000000;
}
function applyInsurancePromo(fee,gross,pct,insuranceBaseOverride){
 const result=Object.assign({},fee||{}),base=Math.max(0,Number(insuranceBaseOverride??result.biayaAsuransi)||0);
 const discountPct=Math.max(0,Math.min(100,Number(pct)||0));
 const discount=Math.round(base*discountPct/100),insurance=Math.max(0,base-discount);
 const oldInsurance=Math.max(0,Number(result.biayaAsuransi)||0);
 result.biayaAsuransiBase=base;result.diskonAsuransi=discount;result.biayaAsuransi=insurance;
 result.totalPotongan=Math.max(0,Number(result.totalPotongan||0)-oldInsurance+insurance);
 result.netPencairan=Math.max(0,Number(gross||0)-result.totalPotongan);
 return result;
}
function insuranceBase(deb,gross,tenor,annualRate,product){
 try{
  const rules=getDebtorTenorRules(deb.status_pegawai,deb.tgl_lahir,deb.bup,product==='G6B'?300:180,deb.tgl_pelantikan,deb.masa_jabatan_bulan);
  const age=Math.max(0,Math.ceil(Number(rules.usiaAsuransi||rules.usiaTahun)||0));
  let pct=Number(feeParams?.asrUnder40)||.500;
  if(age>=66)pct=Number(feeParams?.asr66Up)||3.699;else if(age>=61)pct=Number(feeParams?.asr61To65)||2.573;else if(age>=56)pct=Number(feeParams?.asr56To60)||2.033;else if(age>=51)pct=Number(feeParams?.asr51To55)||1.525;else if(age>=40)pct=Number(feeParams?.asr40To50)||.700;
  return Math.ceil((gross+(gross*annualRate)/12)*Math.ceil(tenor/12)*(pct/100));
 }catch(e){return null;}
}
function calculateFees(deb,gross,tenor,product,inst,offer='NEW',settlement={},context=null,promoPct=0,effectiveRate=0){
 try{
  const rules=getDebtorTenorRules(deb.status_pegawai,deb.tgl_lahir,deb.bup,product==='G6B'?300:180,deb.tgl_pelantikan,deb.masa_jabatan_bulan);
  const base=calculateCreditFees(gross,tenor,product,deb.status_pegawai,rules.usiaAsuransi||rules.usiaTahun||0,Number(settlement.bakiDebet||0),inst,Number(settlement.bungaBerjalan||0),Number(settlement.musisiAsuransi||0),offer,context);
  return applyInsurancePromo(base,gross,promoPct,insuranceBase(deb,gross,tenor,effectiveRate,product));
 }catch(e){return applyInsurancePromo({netPencairan:0,totalPotongan:0,biayaAsuransi:0},gross,promoPct,0);}
}
function database(){try{return Object.values(cifDatabase||{});}catch(e){return [];}}
function eligibleRows(q='',scenario='NEW'){
 const needle=String(q).trim().toLowerCase(),seen=new Set(),now=new Date();
 return database().filter(d=>{const cif=norm(d?.cif);if(!cif||seen.has(cif)||!eligibility(d,now,user(),scenario).ok)return false;seen.add(cif);return !needle||[d.nama,d.cif,d.dinas,d.kode_ao].join(' ').toLowerCase().includes(needle);}).sort((a,b)=>String(a.nama||'').localeCompare(String(b.nama||''),'id'));
}

let modal,selected=null,snapshot=null,stage='search',mode='NEW',searchQuery='',searchRows=[],previousProduct='G6B',previousOverflow='';
function close(){if(!modal?.open)return;modal.close();document.body.style.overflow=previousOverflow;stage='search';selected=null;snapshot=null;}
function back(){if(stage==='calc'){selected=null;snapshot=null;renderSearch();}else close();}
function updateSearchResults(){
 const result=modal.querySelector('[data-results]');if(!result)return;
 searchRows=searchQuery.trim().length>=2?eligibleRows(searchQuery,mode):[];
 result.innerHTML=searchQuery.trim().length<2?'<div class="bundle-empty">Ketik minimal 2 karakter nama atau CIF.</div>':searchRows.length?searchRows.slice(0,40).map((d,i)=>{const e=eligibility(d,new Date(),user(),mode);return `<button type="button" class="v17-sim-person" data-deb="${i}"><span class="avatar">${esc(String(d.nama||'?').trim()[0]||'?')}</span><span><b>${esc(d.nama)}</b><small>CIF ${esc(d.cif)} • AO ${esc(d.kode_ao||'-')}<br>${esc(d.dinas||'-')}</small></span><span class="income">BUP<br>${e.info.remainingMonths} bln</span></button>`}).join(''):'<div class="bundle-empty">Tidak ada debitur yang memenuhi seluruh kriteria bundling.</div>';
}
function renderSearch(){
 stage='search';
 const criteria=mode==='MENGULANG'?'PNS • 6–120 bulan menuju BUP • memiliki fasilitas G6B dari GAJI':'PNS • 6–120 bulan menuju BUP • GAJI tersedia • belum memiliki fasilitas GAJI';
 modal.querySelector('[data-body]').innerHTML=`
 <div class="v17-sim-card">
  <div class="v17-sim-section-title"><span>1</span> Pilih Skenario</div>
  <div class="v17-sim-grid two"><label>Produk<select disabled><option>BUNDLING G6B + G2C</option></select></label><label>Jenis Pengajuan<select data-mode><option value="NEW" ${mode==='NEW'?'selected':''}>G6B NEW + G2C NEW</option><option value="MENGULANG" ${mode==='MENGULANG'?'selected':''}>G6B MENGULANG + G2C NEW</option></select></label></div>
  <div class="v17-sim-rule-strip"><span>${criteria}</span></div>
  <label class="v17-sim-search-label">Cari CIF / Nama<div class="v17-sim-searchbox"><i class="fa-solid fa-magnifying-glass"></i><input data-search type="search" autocomplete="off" value="${esc(searchQuery)}" placeholder="Ketik minimal 2 karakter..."></div></label>
  <div class="v17-sim-search-results" data-results></div>
 </div>`;
 const body=modal.querySelector('[data-body]');
 body.querySelector('[data-mode]').onchange=e=>{mode=e.target.value==='MENGULANG'?'MENGULANG':'NEW';searchQuery='';renderSearch();};
 body.querySelector('[data-search]').oninput=e=>{searchQuery=e.target.value;updateSearchResults();};
 body.querySelector('[data-results]').onclick=e=>{const button=e.target.closest('[data-deb]');if(button)selectDebtor(searchRows[Number(button.dataset.deb)]);};
 updateSearchResults();
}
function selectedRenewals(){
 if(!selected||mode!=='MENGULANG')return [];
 return [...modal.querySelectorAll('[data-renewal]:checked')].map(check=>selected.e.renewalFacilities[Number(check.dataset.renewal)]).filter(Boolean);
}
function promoMarkup(code){return `
 <div class="bundle-promo">
  <div class="v17-sim-section-title"><span><i class="fa-solid fa-shield-heart"></i></span> Promo Asuransi ${code.toUpperCase()}</div>
  <div class="v17-sim-grid two"><label>Program Asuransi<select data-${code}-promo><option value="NO">Tidak Pakai Promo</option><option value="YES">Pakai Promo Asuransi</option></select></label><label data-${code}-discount-wrap hidden>Diskon<select data-${code}-discount><option value="25">25%</option><option value="50">50%</option><option value="75">75%</option><option value="100">100%</option></select></label><label data-${code}-spread-wrap hidden>Bunga Spread (% p.a.)<input data-${code}-spread type="number" inputmode="decimal" step="0.01" min="0" value="0.85"></label></div>
  <div class="v17-promo-note">Diskon mengurangi biaya asuransi ${code.toUpperCase()}; spread hanya menambah bunga fasilitas ${code.toUpperCase()}.</div>
 </div>`;}
function productMarkup(code,title,offer,minTenor,maxTenor,baseRate){return `
 <div class="v17-sim-card bundle-product-card">
  <div class="v17-sim-section-title"><span>3</span> ${title} <em>${offer}</em></div>
  <div class="v17-sim-limit"><small>Maksimal Plafond sesuai Alokasi RPC</small><strong data-${code}-max>${money(0)}</strong><span>Tenor maksimal ${maxTenor} bulan</span></div>
  <div class="v17-sim-grid two">
   <label>Pengajuan<input data-${code}-gross type="text" inputmode="numeric" value="0"></label>
   <label>Tenor (Bulan)<input data-${code}-tenor type="number" min="${minTenor}" max="${maxTenor}" value="${maxTenor}"></label>
   <label>Suku Bunga (% p.a.)<input data-${code}-rate type="number" inputmode="decimal" step="0.01" min="0" value="${baseRate.toFixed(2)}"></label>
   <label>Angsuran Baru<input data-${code}-installment type="text" readonly value="${money(0)}"></label>
  </div>${promoMarkup(code)}
  <div class="v17-result-hero"><small>Nett Pencairan ${code.toUpperCase()}</small><strong data-${code}-net>${money(0)}</strong><span>Estimasi berdasarkan parameter aktif.</span></div>
  <div class="v17-cost-list" data-${code}-costs></div>
 </div>`;}
function selectDebtor(deb){
 const e=eligibility(deb,new Date(),user(),mode);if(!e.ok){alert(e.reason);renderSearch();return;}
 selected={deb,e};snapshot=null;stage='calc';const pension=Number(deb.income?.PENSIUN||deb.gaji_pensiun||0);
 const context=mode==='MENGULANG'?{facilities:e.renewalFacilities}:null;
 const g6bRate=Number(getInterestRate?.('G6B',mode,context)||0)*100,g2cRate=Number(getInterestRate?.('G2C','NEW')||0)*100;
 const picker=mode==='MENGULANG'?`<div class="v17-sim-card"><div class="v17-sim-section-title"><span>2</span> Fasilitas G6B yang Dilunasi</div><div class="bundle-renewals">${e.renewalFacilities.map((f,i)=>`<label><input data-renewal="${i}" type="checkbox" checked><span><b>${esc(f.no_pinjaman||f.loan_id||'G6B')}</b><small>Angsuran ${money(f.angsuran_eksisting)} • Baki ${money(f.baki_debet)} • Bunga berjalan ${money(f.bunga_berjalan)}</small></span></label>`).join('')}</div></div>`:'';
 modal.querySelector('[data-body]').innerHTML=`
 <div class="v17-sim-card"><div class="v17-sim-section-title"><span>2</span> Data Pegawai</div><div class="v17-employee-top"><div class="v17-employee-avatar">${esc(String(deb.nama||'?')[0])}</div><div class="v17-employee-main"><b>${esc(deb.nama)}</b><span>CIF ${esc(deb.cif)} • ${esc(deb.dinas||'-')}</span></div><span class="v17-status-pill">PNS</span></div><div class="v17-employee-grid"><div><small>Menuju BUP</small><b>${e.info.remainingMonths} bulan</b></div><div><small>Kode AO</small><b>${esc(deb.kode_ao||'-')}</b></div></div></div>
 ${picker}
 <div class="v17-sim-card"><div class="v17-sim-section-title"><span>3</span> Parameter Bundling</div><div class="v17-sim-grid two"><label>Gaji Aktif<input data-active type="text" inputmode="numeric" value="${Math.round(e.salary).toLocaleString('id-ID')}"></label><label>Estimasi Gaji Pensiun<input data-pension type="text" inputmode="numeric" value="${pension?Math.round(pension).toLocaleString('id-ID'):''}" placeholder="Wajib diisi"></label></div><label class="bundle-range">Alokasi RPC untuk G2C <output data-allocation-out>50%</output><input data-allocation type="range" min="0" max="100" step="5" value="50"></label><div class="v17-sim-existing" data-rpc-summary></div></div>
 ${productMarkup('g6b','Simulasi G6B',mode,6,e.g6bMax,g6bRate)}
 ${productMarkup('g2c','Simulasi G2C','NEW',e.g2cMin,e.g2cMax,g2cRate)}
 <div class="v17-sim-card"><div class="v17-sim-section-title"><span>4</span> Hasil Kalkulasi Bundling</div><div class="v17-result-hero"><small>Total Nett Pencairan Bundling</small><strong data-total-net>${money(0)}</strong><span>Gabungan hasil G6B dan G2C.</span></div><div class="v17-cost-list" data-total-costs></div><div class="v17-sim-actions"><button type="button" data-back><i class="fa-solid fa-arrow-left"></i> Ganti Debitur</button><button type="button" data-max><i class="fa-solid fa-rotate"></i> Maksimum</button></div><div class="v17-sim-share-actions bundle-share"><button type="button" data-download><i class="fa-solid fa-download"></i><span>Download Hasil</span></button><button type="button" data-share><i class="fa-brands fa-whatsapp"></i><span>Kirim Gambar ke WA</span></button></div></div>`;
 bindCalc();recalc(true);modal.scrollTo({top:0,behavior:'instant'});
}
function promoSettings(code){
 const used=modal.querySelector(`[data-${code}-promo]`)?.value==='YES';
 return {used,pct:used?Number(modal.querySelector(`[data-${code}-discount]`)?.value||0):0,spread:used?Math.max(0,Number(modal.querySelector(`[data-${code}-spread]`)?.value||0)):0};
}
function costHtml(result,isRenew){
 const fee=result.fee,promo=result.promo;
 return `<div><span>Plafond Gross</span><b>${money(result.gross)}</b></div><div><span>Angsuran Baru</span><b>${money(result.installment)}</b></div><div><span>Biaya Provisi</span><b>${money(fee.biayaProvisi)}</b></div><div><span>Biaya Administrasi</span><b>${money(fee.biayaAdmin)}</b></div>${promo.used?`<div><span>Asuransi sebelum Promo</span><b>${money(fee.biayaAsuransiBase)}</b></div><div><span>Diskon Asuransi ${promo.pct}%</span><b class="bundle-discount">- ${money(fee.diskonAsuransi)}</b></div>`:''}<div><span>Biaya Asuransi</span><b>${money(fee.biayaAsuransi)}</b></div><div><span>Tabungan Wajib</span><b>${money(fee.tabunganWajib)}</b></div>${isRenew?`<div><span>Pelunasan Sisa Pokok</span><b>${money(fee.pelunasanBakiDebet)}</b></div><div><span>Bunga Berjalan</span><b>${money(fee.bungaBerjalan)}</b></div><div><span>Musisi Asuransi</span><b>${money(fee.pengembalianMusisiAsuransi||fee.biayaMusisiAsuransi)}</b></div>`:''}<div class="total"><span>Total Potongan</span><b>${money(fee.totalPotongan)}</b></div>`;
}
function recalc(resetGross){
 if(!selected)return;const {deb,e}=selected;
 const active=parseMoney(modal.querySelector('[data-active]').value),pension=parseMoney(modal.querySelector('[data-pension]').value);
 const renewals=selectedRenewals(),context=mode==='MENGULANG'?{facilities:renewals}:null;
 const settlement=renewalCapacity(renewals,mode==='MENGULANG'?e.salaryFacilities:[],active),canCalculate=mode!=='MENGULANG'||renewals.length>0;
 const allocation=allocate(canCalculate?settlement.available:0,pension*.90,modal.querySelector('[data-allocation]').value);
 const calcProduct=(code,product,offer,capacity,minTenor,maxTenor,settle)=>{
  const tenorEl=modal.querySelector(`[data-${code}-tenor]`),grossEl=modal.querySelector(`[data-${code}-gross]`);
  const tenor=Math.max(minTenor,Math.min(maxTenor,Number(tenorEl.value)||maxTenor));tenorEl.value=tenor;
  const promo=promoSettings(code),baseRate=Math.max(0,Number(modal.querySelector(`[data-${code}-rate]`).value)||0),effectiveRate=(baseRate+promo.spread)/100;
  const maxGross=annuityGross(capacity,tenor,effectiveRate);let gross=parseMoney(grossEl.value);
  if(resetGross)gross=maxGross;else gross=Math.min(gross,maxGross);grossEl.value=Math.round(gross).toLocaleString('id-ID');
  const installment=annuityInstallment(gross,tenor,effectiveRate),fee=calculateFees(deb,gross,tenor,product,installment,offer,settle,offer==='MENGULANG'?context:null,promo.pct,effectiveRate);
  const result={code,product,offer,tenor,gross,maxGross,installment,fee,promo,baseRate,effectiveRate:effectiveRate*100};
  modal.querySelector(`[data-${code}-max]`).textContent=money(maxGross);modal.querySelector(`[data-${code}-installment]`).value=money(installment);modal.querySelector(`[data-${code}-net]`).textContent=money(fee.netPencairan);modal.querySelector(`[data-${code}-costs]`).innerHTML=costHtml(result,offer==='MENGULANG');
  return result;
 };
 const g6b=calcProduct('g6b','G6B',mode,allocation.g6b,6,e.g6bMax,mode==='MENGULANG'?settlement:{});
 const g2c=calcProduct('g2c','G2C','NEW',allocation.g2c,e.g2cMin,e.g2cMax,{});
 const used=g6b.installment+g2c.installment,finalCommitment=settlement.existingInstallment-settlement.releasedInstallment+used,totalGross=g6b.gross+g2c.gross,totalNet=Number(g6b.fee.netPencairan||0)+Number(g2c.fee.netPencairan||0),totalDeductions=Number(g6b.fee.totalPotongan||0)+Number(g2c.fee.totalPotongan||0);
 modal.querySelector('[data-rpc-summary]').innerHTML=`<div><small>RPC Gaji Aktif 90%</small><b>${money(settlement.activeRpc)}</b></div><div><small>Kewajiban GAJI Lama</small><b>${money(settlement.existingInstallment)}</b></div>${mode==='MENGULANG'?`<div><small>Angsuran G6B Dibebaskan</small><b>${money(settlement.releasedInstallment)}</b></div>`:''}<div><small>Ruang RPC Efektif</small><b>${money(settlement.available)}</b></div><div><small>RPC Pensiun 90%</small><b>${money(pension*.90)}</b></div><div><small>Alokasi G6B / G2C</small><b>${money(allocation.g6b)} / ${money(allocation.g2c)}</b></div>`;
 modal.querySelector('[data-total-net]').textContent=money(totalNet);
 modal.querySelector('[data-total-costs]').innerHTML=`<div><span>Total Plafond Gross</span><b>${money(totalGross)}</b></div><div><span>Nett G6B</span><b>${money(g6b.fee.netPencairan)}</b></div><div><span>Nett G2C</span><b>${money(g2c.fee.netPencairan)}</b></div><div><span>Total Potongan</span><b>${money(totalDeductions)}</b></div><div><span>Total Angsuran Baru</span><b>${money(used)}</b></div><div class="total"><span>Total Angsuran Setelah Bundling</span><b>${money(finalCommitment)} / ${money(settlement.activeRpc)}</b></div>`;
 snapshot={deb,e,mode,renewals,active,pension,settlement,allocation,g6b,g2c,totalGross,totalNet,totalDeductions,used,finalCommitment,createdAt:new Date()};
}
function togglePromo(code){
 const used=modal.querySelector(`[data-${code}-promo]`).value==='YES';
 modal.querySelector(`[data-${code}-discount-wrap]`).hidden=!used;modal.querySelector(`[data-${code}-spread-wrap]`).hidden=!used;recalc(false);
}
function bindCalc(){
 modal.querySelector('[data-back]').onclick=back;modal.querySelector('[data-max]').onclick=()=>recalc(true);modal.querySelector('[data-download]').onclick=downloadCapture;modal.querySelector('[data-share]').onclick=shareCapture;
 modal.querySelectorAll('[data-renewal]').forEach(input=>input.addEventListener('change',()=>recalc(true)));
 modal.querySelectorAll('[data-g6b-gross],[data-g2c-gross]').forEach(input=>input.addEventListener('change',()=>recalc(false)));
 ['g6b','g2c'].forEach(code=>{modal.querySelector(`[data-${code}-promo]`).onchange=()=>togglePromo(code);modal.querySelector(`[data-${code}-discount]`).onchange=()=>recalc(false);modal.querySelector(`[data-${code}-spread]`).oninput=()=>recalc(false);});
 modal.querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>{if(input.matches('[data-renewal],[data-g6b-spread],[data-g2c-spread],[data-g6b-gross],[data-g2c-gross]'))return;if(input.matches('[data-allocation]'))modal.querySelector('[data-allocation-out]').value=input.value+'%';recalc(false);}));
}
function captureBlob(){
 if(!snapshot||snapshot.totalGross<=0)return Promise.reject(new Error('Lengkapi simulasi bundling terlebih dahulu.'));
 const s=snapshot;return new Promise((resolve,reject)=>{try{
  const W=1080,H=2780,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  x.fillStyle='#f5f7fb';x.fillRect(0,0,W,H);x.fillStyle='#064cad';x.fillRect(0,0,W,190);x.fillStyle='#fff';x.font='700 46px Arial';x.fillText('SIMULASI BUNDLING',70,82);x.font='24px Arial';x.fillText('G6B + G2C • Bank bjb',70,125);
  const card=(y,h,color='#fff')=>{x.fillStyle=color;x.beginPath();if(x.roundRect)x.roundRect(45,y,W-90,h,28);else x.rect(45,y,W-90,h);x.fill();};
  const line=(label,value,y,accent=false)=>{x.fillStyle='#64748b';x.font='22px Arial';x.textAlign='left';x.fillText(label,75,y);x.fillStyle=accent?'#08783c':'#172554';x.font='700 27px Arial';x.textAlign='right';x.fillText(value,W-75,y);x.textAlign='left';};
  const section=(title,y)=>{x.strokeStyle='#dce4ef';x.lineWidth=2;x.beginPath();x.moveTo(75,y);x.lineTo(W-75,y);x.stroke();x.fillStyle='#334155';x.font='700 21px Arial';x.fillText(title,75,y+34);return y+72;};
  card(220,205);x.fillStyle='#172554';x.font='700 34px Arial';x.fillText(String(s.deb.nama||'-'),75,280);x.fillStyle='#64748b';x.font='22px Arial';x.fillText('CIF '+String(s.deb.cif||'-')+' • '+String(s.deb.status_pegawai||'PNS'),75,322);x.fillText(String(s.deb.dinas||'-'),75,363);x.fillStyle='#0757c7';x.font='700 22px Arial';x.fillText(s.mode==='MENGULANG'?'G6B MENGULANG + G2C NEW':'G6B NEW + G2C NEW',75,402);
  card(450,355);x.fillStyle='#172554';x.font='700 30px Arial';x.fillText('Kapasitas Bundling',75,505);let y=section('RPC BERSAMA',530);line('RPC Gaji Aktif 90%',money(s.settlement.activeRpc),y);y+=50;line('Kewajiban GAJI Lama',money(s.settlement.existingInstallment),y);y+=50;if(s.mode==='MENGULANG'){line('Angsuran G6B Dibebaskan',money(s.settlement.releasedInstallment),y);y+=50;}line('Ruang RPC Efektif',money(s.settlement.available),y);y+=50;line('Alokasi G6B / G2C',money(s.allocation.g6b)+' / '+money(s.allocation.g2c),y);
  const drawProduct=(result,title,start,height)=>{card(start,height);x.fillStyle='#172554';x.font='700 30px Arial';x.fillText(title,75,start+55);let py=section('RINCIAN FASILITAS & BIAYA',start+80),step=43;line('Plafond Gross',money(result.gross),py);py+=step;line('Tenor',result.tenor+' bulan',py);py+=step;line('Bunga Efektif',result.effectiveRate.toFixed(2)+'% p.a.',py);py+=step;line('Angsuran',money(result.installment),py);py+=step;if(result.promo.used){line('Promo Asuransi','Diskon '+result.promo.pct+'% • Spread '+result.promo.spread.toFixed(2)+'%',py);py+=step;line('Asuransi sebelum Promo',money(result.fee.biayaAsuransiBase),py);py+=step;line('Diskon Asuransi','- '+money(result.fee.diskonAsuransi),py,true);py+=step;}line('Biaya Asuransi',money(result.fee.biayaAsuransi),py);py+=step;line('Biaya Provisi',money(result.fee.biayaProvisi),py);py+=step;line('Biaya Administrasi',money(result.fee.biayaAdmin),py);py+=step;line('Tabungan Wajib',money(result.fee.tabunganWajib),py);py+=step;if(result.offer==='MENGULANG'){line('Pelunasan Sisa Pokok',money(result.fee.pelunasanBakiDebet),py);py+=step;line('Bunga Berjalan',money(result.fee.bungaBerjalan),py);py+=step;line('Musisi Asuransi',money(result.fee.biayaMusisiAsuransi),py);py+=step;}line('Total Potongan',money(result.fee.totalPotongan),py);py+=step;line('DITERIMA NETT',money(result.fee.netPencairan),py,true);};
  drawProduct(s.g6b,'G6B • '+s.g6b.offer,835,850);drawProduct(s.g2c,'G2C • NEW',1715,700);
  card(2450,165,'#ecfdf5');line('TOTAL PLAFOND BUNDLING',money(s.totalGross),2510);line('TOTAL NETT BUNDLING',money(s.totalNet),2570,true);x.fillStyle='#64748b';x.font='19px Arial';x.textAlign='left';x.fillText('Simulasi bersifat estimasi dan mengikuti parameter kredit yang berlaku.',55,2705);x.fillText('Tanggal: '+new Date().toLocaleString('id-ID'),55,2745);
  c.toBlob(blob=>blob?resolve(blob):reject(new Error('Gagal membuat gambar simulasi bundling.')),'image/png',.95);
 }catch(err){reject(err);}});
}
function filename(){const safe=String(snapshot?.deb?.nama||'Debitur').replace(/[^a-z0-9]+/gi,'_').replace(/^_+|_+$/g,'');return 'Simulasi_Bundling_'+safe+'_'+new Date().toISOString().slice(0,10)+'.png';}
function logActivity(type){
 if(!snapshot)return Promise.resolve();const s=snapshot,record={key:'SIM-BUNDLING-'+String(s.deb.cif||Date.now())+'-'+s.mode,waktu:new Date().toISOString(),waktuDisplay:new Date().toLocaleString('id-ID'),cif:s.deb.cif||'',nama:s.deb.nama||'',kode_ao:s.deb.kode_ao||'',no_hp:s.deb.no_hp||'',tipe_pinjaman:'BUNDLING G6B+G2C',sumber_pembayaran:'GAJI/GAJI-PENSIUN',jenis_penawaran:s.mode,nominal_type:'SIMULASI',plafond_gross:s.totalGross,potensi_nett:s.totalNet,estimasi_angsuran:s.used,fasilitas_dilunasi:s.renewals.length};
 try{const rows=JSON.parse(localStorage.getItem('analisaKredit_offerActivity_v1')||'[]'),i=rows.findIndex(x=>x.key===record.key);if(i>=0)rows[i]=record;else rows.unshift(record);localStorage.setItem('analisaKredit_offerActivity_v1',JSON.stringify(rows.slice(0,500)));}catch(e){}
 try{return Promise.resolve(window.pushCentralActivity?.(record,type));}catch(e){return Promise.resolve();}
}
async function downloadCapture(){try{const blob=await captureBlob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.download=filename();a.href=url;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);await logActivity('DOWNLOAD_SIMULASI');}catch(err){alert(err?.message||'Gagal membuat hasil simulasi bundling.');}}
async function shareCapture(){
 const button=modal.querySelector('[data-share]'),old=button?.innerHTML||'';if(button){button.disabled=true;button.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i><span>Menyiapkan Gambar...</span>';}
 try{const blob=await captureBlob(),file=new File([blob],filename(),{type:'image/png'});Promise.resolve(logActivity('DOWNLOAD_SIMULASI')).catch(()=>{});if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({files:[file]});return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.download=filename();a.href=url;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);let phone=String(snapshot?.deb?.no_hp||'').replace(/\D/g,'');if(phone.startsWith('0'))phone='62'+phone.slice(1);if(phone)window.location.href='https://wa.me/'+phone;else alert('Gambar sudah di-download. Nomor WhatsApp debitur belum tersedia.');}catch(err){if(err?.name!=='AbortError')alert('Gagal menyiapkan gambar: '+(err?.message||String(err)));}finally{if(button){button.disabled=false;button.innerHTML=old;}}
}
function open(){if(!modal)return;previousOverflow=document.body.style.overflow;stage='search';selected=null;snapshot=null;searchQuery='';modal.showModal();document.body.style.overflow='hidden';renderSearch();}
function option(){const select=document.getElementById('v17SimProduct');if(!select)return;if(![...select.options].some(o=>o.value===PRODUCT)){const o=document.createElement('option');o.value=PRODUCT;o.textContent='BUNDLING G6B + G2C • PNS';select.appendChild(o);}}
function boot(){
 document.getElementById('v113BundleShortcut')?.addEventListener('click',open);const select=document.getElementById('v17SimProduct');
 if(select){option();select.addEventListener('focus',()=>{if(select.value!==PRODUCT)previousProduct=select.value||'G6B';});select.addEventListener('change',event=>{if(select.value!==PRODUCT)return;event.stopImmediatePropagation();select.value=[...select.options].some(o=>o.value===previousProduct)?previousProduct:'G6B';open();},true);new MutationObserver(option).observe(select,{childList:true});}
 const style=document.createElement('style');style.textContent=`
 #v115Bundle{box-sizing:border-box;position:fixed;inset:0;margin:0;width:100vw;height:100dvh;max-width:none;max-height:none;border:0;padding:0;background:#f5f7fb;color:#0f172a;font-family:inherit;font-size:11px;overflow-y:auto}#v115Bundle::backdrop{background:#0f172a99}#v115Bundle .v17-sim-head{position:sticky;top:0;z-index:5;padding-top:calc(13px + env(safe-area-inset-top,0px))}#v115Bundle main{max-width:760px;margin:auto;padding:10px 10px max(28px,env(safe-area-inset-bottom))}#v115Bundle .bundle-empty{text-align:center;padding:30px;color:#64748b}#v115Bundle .v17-sim-person span:nth-child(2){min-width:0}#v115Bundle .bundle-renewals{display:grid;gap:7px}#v115Bundle .bundle-renewals label{display:flex;align-items:center;gap:9px;border:1px solid #fde7b4;border-radius:11px;background:#fff8eb;padding:9px}#v115Bundle .bundle-renewals input{width:18px;height:18px;flex:none}#v115Bundle .bundle-renewals small{display:block;color:#8a641f;font-size:8px;margin-top:2px}#v115Bundle .bundle-range{display:block;margin-top:10px;font-size:8.5px;font-weight:900;color:#64748b}#v115Bundle .bundle-range output{float:right;color:#0757c7}#v115Bundle input[type=range]{padding:0;background:transparent;border:0}#v115Bundle .bundle-product-card .v17-sim-section-title em{margin-left:auto;border-radius:999px;padding:5px 8px;background:#eef2ff;color:#4338ca;font-size:8px;font-style:normal}#v115Bundle .bundle-promo{margin:11px 0;padding:10px;border:1px solid #bbf7d0;border-radius:14px;background:#f0fdf4}#v115Bundle [hidden]{display:none!important}#v115Bundle .bundle-discount{color:#16a34a}#v115Bundle .v17-sim-actions [data-back]{background:#f1f5f9;color:#475569}#v115Bundle .v17-sim-actions [data-max]{background:#eaf3ff;color:#0757c7}#v115Bundle .bundle-share [data-download]{background:#eaf3ff;color:#0757c7}#v115Bundle .bundle-share [data-share]{background:#16a34a;color:#fff}#v115Bundle .v17-sim-existing{grid-template-columns:repeat(2,minmax(0,1fr))}@media(min-width:760px){#v115Bundle main{padding-top:16px}#v115Bundle .bundle-product-card{padding:16px}#v115Bundle .v17-sim-grid.two{grid-template-columns:1fr 1fr}}@media(max-width:360px){#v115Bundle .v17-sim-grid.two{grid-template-columns:1fr}}
 `;document.head.appendChild(style);
 modal=document.createElement('dialog');modal.id='v115Bundle';modal.innerHTML='<div class="v17-sim-head"><button type="button" data-close aria-label="Kembali"><i class="fa-solid fa-arrow-left"></i></button><div><div class="v17-sim-title">Simulasi Interaktif Bundling</div><div class="v17-sim-subtitle">G6B + G2C • NEW atau MENGULANG • promo per produk</div></div></div><main><div data-body></div></main>';document.body.appendChild(modal);modal.querySelector('[data-close]').onclick=back;modal.addEventListener('cancel',e=>{e.preventDefault();back();});window.v111AndroidBack?.register('v115Bundle',back);
}
window.v117BundleRules={monthsUntil,bupInfo,source,productCode,access,eligibility,renewalCapacity,allocate,annuityInstallment,annuityGross,applyInsurancePromo};
window.v116BundleRules=window.v117BundleRules;
window.v115BundleRules=window.v117BundleRules;
window.openBundlingG6bG2c=open;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
