/* V120: bounded matrix batches; no database contents or credentials in storage. */
(function(){
  let busy=false;
  const originalChoose=window.v87ChooseImportFile;
  window.v87ChooseImportFile=async function(type,input){
    if(busy){alert('Tunggu upload selesai sebelum memilih file lain.');return;}
    delete v87AdminState.files[type];
    await originalChoose(type,input);
    const f=v87AdminState.files[type], file=input.files&&input.files[0];
    if(f&&file){
      try {
        const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
        f.fingerprint=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
      }catch(e){delete v87AdminState.files[type];alert('Gagal menyiapkan file: '+e.message);}
    }
  };
  window.v87Import=async function(type){
    if(busy)return;
    const f=v87AdminState.files[type], status=document.getElementById('v87ImportStatus');
    if(!f||!f.fingerprint){alert('Pilih file Excel dan tunggu sampai pembacaan selesai.');return;}
    if(!confirm('Upload '+f.rows.length.toLocaleString('id-ID')+' baris '+type+'? Database aktif diganti setelah seluruh upload selesai.'))return;
    busy=true;
    let wake;
    try {
      try{wake=await navigator.wakeLock?.request('screen');}catch(_){}
      const user=window.currentUser||{}, storageKey='upload120:'+String(user.email||'')+':'+type+':'+f.fingerprint;
      let id=f.uploadId;
      try{id=id||localStorage.getItem(storageKey);}catch(_){}
      if(!id)id=crypto.randomUUID().replace(/-/g,'');
      f.uploadId=id;
      try{localStorage.setItem(storageKey,id);}catch(_){}
      const request=async extra=>{
        for(let attempt=0;attempt<3;attempt++){
          try {
            const r=await callApi('importBranchData',window.googleCredential||'',{uploadProtocol:120,uploadId:id,dataType:type,...extra});
            if(r?.success && r.uploadProtocol===120)return r;
            if(r?.code==='UPLOAD_BUSY' && attempt<2){await new Promise(r=>setTimeout(r,1500*(attempt+1)));continue;}
            const e=Error(r?.error||'Backend upload V120 belum dipasang.');e.server=true;throw e;
          }catch(e){
            if(e.server||attempt===2)throw e;
            status.textContent='Koneksi terganggu. Mencoba melanjutkan upload...';
            await new Promise(r=>setTimeout(r,1500*(attempt+1)));
          }
        }
      };
      let r=await request({operation:'BEGIN',headers:f.headers,total:f.rows.length});
      let offset=r.next;
      if(!Number.isSafeInteger(offset)||offset<0||offset>f.rows.length)throw Error('Posisi upload dari server tidak valid.');
      while(offset<f.rows.length){
        const matrix=[];let bytes=0;
        while(offset+matrix.length<f.rows.length && matrix.length<1000){
          const row=f.headers.map(h=>f.rows[offset+matrix.length][h]??'');
          const size=new TextEncoder().encode(JSON.stringify(row)).length;
          if(matrix.length && bytes+size>750000)break;
          if(size>750000)throw Error('Satu baris terlalu besar untuk dikirim. Periksa file Excel.');
          matrix.push(row);bytes+=size;
        }
        status.textContent='Mengupload '+type+': '+offset.toLocaleString('id-ID')+' / '+f.rows.length.toLocaleString('id-ID')+' ('+Math.floor(offset/f.rows.length*100)+'%). Tetap buka aplikasi.';
        r=await request({operation:'CHUNK',offset,matrix});
        if(r.next!==offset+matrix.length)throw Error('Konfirmasi batch tidak sesuai. Klik Upload kembali.');
        offset=r.next;
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      status.textContent='Semua baris terkirim. Mengaktifkan database '+type+'...';
      r=await request({operation:'COMMIT'});
      if(!r.committed)throw Error('Database belum diaktifkan. Klik Upload kembali.');
      try{localStorage.removeItem(storageKey);}catch(_){}
      delete f.uploadId;
      const count=document.getElementById(type==='KREDIT'?'v87KreditRows':'v87PenghasilanRows');
      if(count)count.textContent=f.rows.length.toLocaleString('id-ID');
      status.textContent='Selesai: '+f.rows.length.toLocaleString('id-ID')+' baris '+type+' tersimpan. Gunakan Muat Database / Sync untuk memakai data baru; sinkronisasi pertama dapat memerlukan waktu.';
    }catch(e){
      status.textContent='Upload terhenti: '+e.message+' Pilih file yang sama lalu klik Upload untuk melanjutkan. Jika sesi habis, login kembali dahulu.';
    }finally{busy=false;try{await wake?.release();}catch(_){}}
  };
  window.v129ResetPendingUpload=async function(){
    if(busy){alert('Tunggu proses upload yang sedang berjalan selesai.');return;}
    const type=String(document.getElementById('v128ResetUploadType')?.value||'').toUpperCase();
    if(!['KREDIT','PENGHASILAN'].includes(type))return;
    if(!confirm('Reset upload tertunda '+type+'?\n\nDatabase aktif tidak akan dihapus. Hanya sesi dan sheet upload sementara yang dibersihkan.'))return;
    const status=document.getElementById('v87ImportStatus'),btn=document.getElementById('v128ResetUploadBtn'),
      box=document.getElementById('v129ResetProgress'),bar=document.getElementById('v129ResetProgressBar'),
      label=document.getElementById('v129ResetProgressText'),pct=document.getElementById('v129ResetProgressPct'),
      detail=document.getElementById('v129ResetProgressDetail');
    const progress=(n,title,description,error)=>{
      n=Math.max(0,Math.min(100,Number(n)||0));box?.classList.remove('hidden');
      if(bar){bar.style.width=n+'%';bar.className='h-full rounded-full transition-all duration-300 '+(error?'bg-rose-500':n===100?'bg-emerald-500':'bg-amber-500');}
      if(label){label.textContent=title;label.className='text-[9px] font-bold '+(error?'text-rose-700':n===100?'text-emerald-700':'text-amber-900');}
      if(pct){pct.textContent=n+'%';pct.className='text-[9px] font-bold '+(error?'text-rose-600':n===100?'text-emerald-600':'text-amber-700');}
      if(detail)detail.textContent=description||'';
    };
    busy=true;if(btn)btn.disabled=true;
    let ticker;
    try{
      progress(8,'Memeriksa sesi login','Memastikan akun Admin/SPV dan cabang aktif.');
      if(!window.googleCredential)throw Error('Sesi Google tidak tersedia. Login kembali lalu ulangi reset.');
      if(status)status.textContent='Reset '+type+' sedang diproses. Jangan tutup aplikasi.';
      progress(20,'Menghubungi server','Mencari sesi upload '+type+' yang tertunda.');
      let shown=20;ticker=setInterval(()=>{shown=Math.min(72,shown+4);progress(shown,'Membersihkan sesi server',shown<48?'Memeriksa status upload sementara.':'Menghapus sheet sementara dengan aman.');},650);
      const apiCall=callApi('importBranchData',window.googleCredential||'',{uploadProtocol:120,operation:'RESET',dataType:type,clientVersion:129});
      const timeout=new Promise((_,reject)=>setTimeout(()=>reject(Error('Server tidak merespons dalam 45 detik. Periksa koneksi lalu coba Reset kembali.')),45000));
      const r=await Promise.race([apiCall,timeout]);clearInterval(ticker);ticker=null;
      if(!r?.success||r.uploadProtocol!==120||!r.reset)throw Error(r?.error||'Reset upload belum didukung backend.');
      progress(84,'Sesi server dibersihkan',r.removedStage?'Sheet upload sementara berhasil dihapus.':r.hadSession?'Sesi ditemukan; tidak ada sheet sementara yang perlu dihapus.':'Tidak ditemukan sesi server yang tertunda.');
      const user=window.currentUser||{},prefix='upload120:'+String(user.email||'')+':'+type+':';
      try{for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k&&k.startsWith(prefix))localStorage.removeItem(k);}}catch(_){}
      const f=v87AdminState.files[type];if(f)delete f.uploadId;
      progress(100,'Reset berhasil','Pilih kembali file Excel dan mulai upload '+type+' dari awal.');
      if(status)status.textContent='Reset '+type+' berhasil. Pilih file lalu mulai upload kembali dari awal.';
    }catch(e){
      if(ticker)clearInterval(ticker);const raw=String(e?.message||e);let message=raw;
      if(/ID upload tidak valid|belum didukung backend/i.test(raw))message='Backend V129 belum terpasang. Ganti upload-v120.gs dan deploy Apps Script sebagai versi baru.';
      progress(100,'Reset gagal',message,true);if(status)status.textContent='Reset gagal: '+message;
    }finally{busy=false;if(btn)btn.disabled=false;}
  };
  window.v128ResetPendingUpload=window.v129ResetPendingUpload;
})();
