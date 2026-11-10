/* Scoridium mobile landscape tracker V1.
   Reuses the ORIGINAL controls and their event listeners; no extra writes or new tracker state.
   Mobile layout is isolated behind media query and device capability checks. */
(() => {
  'use strict';
  const media = window.matchMedia('(orientation: landscape) and (max-height: 650px) and (pointer: coarse)');
  const $ = id => document.getElementById(id);
  const shell = document.querySelector('.tracker-shell');
  if (!shell) return;

  // Store original locations to restore desktop DOM if the device rotates or resizes.
  const regions = [
    ['tracker-controls', 'court'],
    ['game-info-panel', 'events'],
    ['game-controls', 'events'],
  ];
  const original = new Map();
  const mobile = document.createElement('section');
  mobile.id = 'mobile-tracker';
  mobile.setAttribute('aria-label','Mobile game tracking');
  mobile.innerHTML = `
    <nav class="mobile-tracker-tabs" aria-label="Tracker view">
      <button type="button" data-mobile-view="court" aria-pressed="true">Court</button>
      <button type="button" data-mobile-view="stats" aria-pressed="false">Stats</button>
      <button type="button" data-mobile-view="events" aria-pressed="false">Events</button>
    </nav>
    <div class="mobile-tracker-content">
      <div class="mobile-tracker-view" data-mobile-panel="court"></div>
      <div class="mobile-tracker-view" data-mobile-panel="stats" hidden></div>
      <div class="mobile-tracker-view" data-mobile-panel="events" hidden></div>
    </div>
    <footer class="mobile-player-dock" aria-label="Player selection">
      <div class="mobile-player-caption"><strong>SELECT PLAYER</strong><span>Swipe for more players</span></div>
      <div id="mobile-player-slot"></div>
    </footer>`;
  const scoreboard = $('.home-score')?.closest('.scoreboard');
  scoreboard?.after(mobile);
  const playerPanel = document.querySelector('.player-panel');
  const statPanel = document.querySelector('.stats-panel');
  const nodes = [
    ...regions.map(([id, view])=>[$(id),view]),
    [statPanel,'stats'],
    [playerPanel,'dock'],
  ].filter(([node])=>node);
  for(const [node] of nodes){
    const marker=document.createComment('Original location of '+(node.id||node.className));
    node.parentNode.insertBefore(marker,node);
    original.set(node,marker);
  }
  let active = false;
  let view = 'court';
  const buttons = [...mobile.querySelectorAll('[data-mobile-view]')];
  const panels = [...mobile.querySelectorAll('[data-mobile-panel]')];
  function showView(next){
    if(!['court','stats','events'].includes(next))return;
    view=next;
    for(const btn of buttons){const selected=btn.dataset.mobileView===next;btn.setAttribute('aria-pressed',String(selected));btn.classList.toggle('active',selected)}
    for(const panel of panels)panel.hidden=panel.dataset.mobilePanel!==next;
  }
  buttons.forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.mobileView)));
  function setMobile(enabled){
    if(active===enabled)return;
    active=enabled;
    if(enabled){
      for(const [node,destination] of nodes){
        const holder=destination==='dock' ? mobile.querySelector('#mobile-player-slot') : mobile.querySelector(`[data-mobile-panel="${destination}"]`);
        holder.appendChild(node);
      }
      document.documentElement.classList.add('mobile-tracker-active');
      showView(view);
    } else {
      document.documentElement.classList.remove('mobile-tracker-active');
      for(const [node] of nodes){original.get(node).after(node)}
    }
  }
  const sync = ()=>setMobile(media.matches);
  media.addEventListener?.('change',sync);
  sync();
  // Swipe only on the navigation strip; avoid intercepting shot-chart taps and court gestures.
  let startX=null,startY=null;
  const nav=mobile.querySelector('.mobile-tracker-tabs');
  nav.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;startX=e.touches[0].clientX;startY=e.touches[0].clientY},{passive:true});
  nav.addEventListener('touchend',e=>{
    if(startX===null||!e.changedTouches.length)return;
    const dx=e.changedTouches[0].clientX-startX,dy=e.changedTouches[0].clientY-startY;startX=null;
    if(Math.abs(dx)<45||Math.abs(dx)<Math.abs(dy)*1.5)return;
    const views=['court','stats','events'];const idx=views.indexOf(view);
    showView(views[Math.max(0,Math.min(2,idx+(dx<0?1:-1)))]);
  },{passive:true});
})();
