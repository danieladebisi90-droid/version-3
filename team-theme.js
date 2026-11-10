/* Scoridium shared team theme — never writes colours back to the database. */
(() => {
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const normalize = (value, fallback) => typeof value === 'string' && HEX.test(value.trim()) ? value.trim().toUpperCase() : fallback;
  const luminance = hex => {
    const channels = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255)
      .map(v => v <= 0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4);
    return channels[0]*0.2126 + channels[1]*0.7152 + channels[2]*0.0722;
  };
  const mix = (a,b,t) => '#' + [1,3,5].map(i => {
    const from=parseInt(a.slice(i,i+2),16),to=parseInt(b.slice(i,i+2),16);
    return Math.round(from+(to-from)*t).toString(16).padStart(2,'0');
  }).join('').toUpperCase();
  const ink = hex => luminance(hex) > 0.179 ? '#151515' : '#FFFFFF';
  const fallbackSecondary = main => mix(main, luminance(main)<0.26?'#FFFFFF':'#000000', luminance(main)<0.26?0.52:0.44);
  function apply(team = {}) {
    const primary=normalize(team.primary_color,'#181818');
    const secondary=normalize(team.secondary_color,fallbackSecondary(primary));
    const root=document.documentElement;
    root.style.setProperty('--team-primary',primary);
    root.style.setProperty('--team-secondary',secondary);
    root.style.setProperty('--team-primary-ink',ink(primary));
    root.style.setProperty('--team-secondary-ink',ink(secondary));
    root.style.setProperty('--team-ink',ink(primary));
    root.style.setProperty('--team-soft',mix(primary,'#FFFFFF',0.91));
    root.style.setProperty('--team-deep',mix(primary,'#000000',0.28));
    root.style.setProperty('--team-strong',luminance(primary) > .45 ? mix(primary,'#000000',.55) : primary);
    root.style.setProperty('--team-action',luminance(secondary)>.83 ? mix(secondary,'#000000',.18) : secondary);
    document.documentElement.classList.toggle('team-theme-light',luminance(primary)>0.47);
    document.body?.classList.toggle('team-theme-light',luminance(primary)>0.47);
    document.dispatchEvent(new CustomEvent('scoridium:theme',{detail:{primary,secondary}}));
    return {primary,secondary};
  }
  function cache(team,id=sessionStorage.getItem('selectedTeamId')) {
    if (!id || !team) return;
    const primary_color=normalize(team.primary_color,'#181818');
    const secondary_color=normalize(team.secondary_color,fallbackSecondary(primary_color));
    const item={id,primary_color,secondary_color,team_type:team.team_type||'',school_name:team.school_name||'',club_name:team.club_name||'',mascot:team.mascot||''};
    try { sessionStorage.setItem('scoridium:team-preview:'+id,JSON.stringify(item)); window.__scoridiumCachedTeam=item; }catch{}
    return item;
  }
  window.ScoridiumTheme={apply,cache,normalize,luminance,ink,fallbackSecondary};
})();
