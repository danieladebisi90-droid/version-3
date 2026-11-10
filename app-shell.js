/* Persistent shell: keeps navigation and team theme while page documents change.
   The iframe intentionally isolates existing page JS/CSS to prevent breakage. */
(() => {
  'use strict';
  const allowed=new Set(['dashboard.html','gamehub.html','roster.html','stats.html','player.html','game.html']);
  const home='dashboard.html';
  const frame=document.getElementById('page-frame');
  const container=document.getElementById('shell-main');
  const teamId=sessionStorage.getItem('selectedTeamId');
  if(!teamId){location.replace('myTeams.html');return;}
  const base=location.href;
  const viewOf = value => {
    try {
      const url=new URL(value,base);
      if(url.origin!==location.origin || url.pathname.split('/').slice(0,-1).join('/') !== location.pathname.split('/').slice(0,-1).join('/'))return null;
      const filename=url.pathname.split('/').pop().toLowerCase();
      if(!allowed.has(filename))return null;
      return filename+url.search+url.hash;
    } catch {return null}
  };
  let activeView='';
  let loadingSeq=0;
  function highlight(file){document.querySelectorAll('[data-view]').forEach(link=>link.classList.toggle('active',link.dataset.view===file.split(/[?#]/)[0]));}
  function navigate(view,{replace=false}={}) {
    const next=viewOf(view);
    if(!next)return;
    if(next===activeView)return;
    activeView=next;
    highlight(next);
    container.classList.add('is-loading');
    loadingSeq++;
    const newUrl='app.html?page='+encodeURIComponent(next);
    if(replace)history.replaceState({view:next},'',newUrl);
    else history.pushState({view:next},'',newUrl);
    frame.src=next;
  }
  window.addEventListener('popstate',()=>navigate(new URLSearchParams(location.search).get('page')||home,{replace:true}));
  document.querySelectorAll('#main-navigation a[data-view]').forEach(link=>link.addEventListener('click',e=>{
    if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    const target=viewOf(link.href);if(!target)return;
    e.preventDefault();navigate(target);
  }));
  // Wire navigation within pages, including player profile links, without a full shell reload.
  const authPages=new Set(['login.html','myteams.html','signup.html','create-team.html','forgot-password.html','reset-password.html','help.html']);
  frame.addEventListener('load',()=>{
    let doc, childUrl;
    try{doc=frame.contentDocument;childUrl=frame.contentWindow.location.href;}catch{return;}
    const file=new URL(childUrl).pathname.split('/').pop().toLowerCase();
    if(authPages.has(file)){location.assign(file==='login.html'?'Login.html':file==='myteams.html'?'myTeams.html':file);return;}
    if(file==='playbook.html'){location.assign('playbook.html');return;}
    const actual=viewOf(childUrl);
    if(actual&&actual!==activeView){activeView=actual;highlight(actual);history.replaceState({view:actual},'','app.html?page='+encodeURIComponent(actual));}
    // Capture clicks before individual pages handle them. Leave forms, downloads, anchors,
    // modifier keys and external URLs to their original behavior.
    doc.addEventListener('click',e=>{
      if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
      const a=e.target.closest?.('a[href]');if(!a||a.hasAttribute('download')||a.target==='_blank')return;
      const url=new URL(a.getAttribute('href'),frame.contentWindow.location.href);
      const filename=url.pathname.split('/').pop().toLowerCase();
      if(filename==='myteams.html'){e.preventDefault();location.assign('myTeams.html');return;}
      if(filename==='playbook.html'&&!allowed.has(filename))return;
      const next=viewOf(url.href);if(!next)return;
      e.preventDefault();navigate(next);
    },true);
    // Synchronize season values: child page listeners still receive seasonChanged.
    const childSelect=doc.querySelector('.season-selector');
    if(childSelect){
      const parentSelect=document.querySelector('.season-selector');
      if(parentSelect?.value && childSelect.value!==parentSelect.value)childSelect.value=parentSelect.value;
    }
    container.classList.remove('is-loading');
  });
  // Show cached identity immediately; Supabase remains authoritative.
  const cached=window.__scoridiumCachedTeam?.id===teamId?window.__scoridiumCachedTeam:null;
  const displayName=t=>((t?.team_type==='club'?t?.club_name||t?.mascot:t?.mascot||t?.club_name)||'').toUpperCase();
  if(cached)document.getElementById('shared-team-name').textContent=displayName(cached);
  async function refreshShell(){
    if(!window.supabaseClient)return;
    const [tr,sr]=await Promise.all([
      supabaseClient.from('teams').select('id,school_name,club_name,mascot,team_type,primary_color,secondary_color').eq('id',teamId).single(),
      supabaseClient.from('seasons').select('id,seasons').eq('team_id',teamId).order('seasons',{ascending:false})
    ]);
    if(sessionStorage.getItem('selectedTeamId')!==teamId)return;
    if(!tr.error&&tr.data){
      document.getElementById('shared-team-name').textContent=displayName(tr.data);
      window.ScoridiumTheme?.apply(tr.data);
      window.ScoridiumTheme?.cache(tr.data,teamId);
    }else if(tr.error)console.warn('Team refresh:',tr.error.message);
    if(!sr.error&&sr.data){
      const sel=document.querySelector('.season-selector');
      sel.replaceChildren();for(const s of sr.data)sel.add(new Option(s.seasons,s.id));
      const saved=sessionStorage.getItem('selectedSeasonId');
      if(saved&&sr.data.some(s=>s.id===saved))sel.value=saved;
      else if(sr.data.length){sel.value=sr.data[0].id;sessionStorage.setItem('selectedSeasonId',sel.value)}
      if(!sr.data.length)sel.add(new Option('No seasons',''));
      if(sel.selectedOptions[0])sessionStorage.setItem('scoridium:season-label:'+teamId,sel.selectedOptions[0].textContent);
    }
  }
  document.querySelector('.season-selector').addEventListener('change',e=>{
    const id=e.target.value;
    sessionStorage.setItem('selectedSeasonId',id);
    sessionStorage.setItem('scoridium:season-label:'+teamId,e.target.selectedOptions[0]?.textContent||'');
    try{
      const w=frame.contentWindow;const inner=w.document.querySelector('.season-selector');
      if(inner)inner.value=id;
      w.dispatchEvent(new w.CustomEvent('seasonChanged',{detail:{seasonId:id}}));
    }catch(err){console.warn('Season update requires a page refresh',err)}
  });
  const initial=new URLSearchParams(location.search).get('page')||home;
  navigate(initial,{replace:true});
  refreshShell().catch(err=>console.warn('Shell refresh failed:',err));
})();
