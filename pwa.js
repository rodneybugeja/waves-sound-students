(()=>{
  const qs=(s)=>document.querySelector(s);
  let deferredPrompt=null;

  function ensureUI(){
    if(document.getElementById('pwa-tools')) return;
    const status=document.createElement('div');
    status.id='pwa-status';
    document.body.appendChild(status);

    const tools=document.createElement('div');
    tools.id='pwa-tools';
    tools.innerHTML='<button id="pwa-install" type="button" hidden>⬇ Install app</button><button id="pwa-offline" type="button">☁ Make available offline</button>';
    document.body.appendChild(tools);

    qs('#pwa-offline').addEventListener('click', downloadOffline);
    qs('#pwa-install').addEventListener('click', async ()=>{
      if(!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt=null;
      qs('#pwa-install').hidden=true;
    });
  }

  function show(msg, keep=false){
    const el=qs('#pwa-status');
    if(!el) return;
    el.textContent=msg;
    el.style.display='block';
    if(!keep) setTimeout(()=>el.style.display='none',4500);
  }

  async function downloadOffline(){
    const btn=qs('#pwa-offline');
    if(btn.disabled) return;
    btn.disabled=true;
    const original=btn.textContent;
    try{
      if(!('caches' in window)) throw new Error('This browser does not support offline storage.');
      const list=await fetch('./offline-assets.json',{cache:'no-store'}).then(r=>r.json());
      const cache=await caches.open('waves-sound-v25-full');
      let done=0, failed=0;
      for(const url of list){
        try{
          const req=new Request(url,{cache:'reload'});
          const resp=await fetch(req);
          if(!resp.ok) throw new Error(String(resp.status));
          await cache.put(req,resp);
        }catch(e){ failed++; }
        done++;
        if(done===1 || done%5===0 || done===list.length){
          const pct=Math.round(done/list.length*100);
          btn.textContent=`⬇ Offline ${pct}%`;
          show(`Saving course to this laptop… ${done}/${list.length} files (${pct}%). Keep this tab open.`,true);
        }
      }
      if(failed){
        show(`Offline copy finished, but ${failed} local file(s) could not be saved. Open those items once while online to cache them.`,true);
        btn.textContent='⚠ Offline copy mostly ready';
      }else{
        show('Offline copy ready. You can now open the installed course without internet. External NASA/YouTube/PhET links still need internet.',true);
        btn.textContent='✓ Available offline';
        localStorage.setItem('wavesSoundOfflineReady','1');
      }
    }catch(e){
      show('Could not save the offline copy: '+e.message,true);
      btn.textContent=original;
    }finally{
      btn.disabled=false;
    }
  }

  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();
    deferredPrompt=e;
    const b=qs('#pwa-install'); if(b) b.hidden=false;
  });
  window.addEventListener('appinstalled',()=>{
    const b=qs('#pwa-install'); if(b) b.hidden=true;
    show('Waves & Sound installed on this laptop.');
  });

  window.addEventListener('DOMContentLoaded',()=>{
    ensureUI();
    if(localStorage.getItem('wavesSoundOfflineReady')==='1'){
      const b=qs('#pwa-offline'); if(b) b.textContent='✓ Available offline';
    }
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
    }
  });
})();