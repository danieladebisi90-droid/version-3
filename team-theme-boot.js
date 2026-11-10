/* Runs in <head> before stylesheets: restore last verified team identity for this tab. */
(() => {
  const id=sessionStorage.getItem('selectedTeamId');
  if(!id) return;
  try {
    const item=JSON.parse(sessionStorage.getItem('scoridium:team-preview:'+id)||'null');
    if(!item || item.id!==id) return;
    const hex=v=>typeof v==='string' && /^#[0-9a-fA-F]{6}$/.test(v);
    const p=item.primary_color,s=item.secondary_color;
    if(!hex(p)||!hex(s)) return;
    const root=document.documentElement.style;
    const luminance=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
    const mix=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
    const ink=h=>luminance(h)>.179?'#151515':'#FFFFFF';
    Object.entries({'--team-primary':p,'--team-secondary':s,'--team-primary-ink':ink(p),'--team-secondary-ink':ink(s),'--team-ink':ink(p),'--team-soft':mix(p,'#FFFFFF',.91),'--team-deep':mix(p,'#000000',.28),'--team-strong':luminance(p)>.45?mix(p,'#000000',.55):p,'--team-action':luminance(s)>.83?mix(s,'#000000',.18):s}).forEach(([k,v])=>root.setProperty(k,v));
    if(luminance(p)>.47)document.documentElement.classList.add('team-theme-light');
    document.documentElement.style.backgroundColor=p;
    window.__scoridiumCachedTeam=item;
    // Restore visible identity as soon as the HTML is parsed, avoiding placeholder text.
    document.addEventListener('DOMContentLoaded',()=>{
      const label=(item.team_type==='club' ? item.club_name||item.mascot : item.mascot||item.club_name)||'';
      const school=item.team_type==='club' ? item.club_name||'' : item.school_name||'';
      const update=(selector,value)=>{const el=document.querySelector(selector);if(el&&value)el.textContent=value};
      update('.team-logo',label.charAt(0).toUpperCase());
      update('.school-name',school);
      update('.mascot',label);
      update('#team-emblem',label.charAt(0).toUpperCase());
      update('#team-name',item.team_type==='club' ? label : [school,label].filter(Boolean).join(' '));
      update('#school-name',school);
    },{once:true});
  } catch(e) { console.warn('Could not restore cached team theme',e); }
})();
