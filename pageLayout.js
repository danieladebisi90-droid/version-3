/* Shared navigation: cached identity first, live Supabase refresh second. */
const teamLabel = team => ((team?.team_type === 'club' ? (team?.club_name||team?.mascot) : (team?.mascot||team?.club_name)) || 'TEAM').trim().toUpperCase();
async function loadPageLayout() {
  const teamId=sessionStorage.getItem('selectedTeamId');
  const cached=(window.__scoridiumCachedTeam?.id===teamId)?window.__scoridiumCachedTeam:null;
  const headerContainer=document.querySelector('#shared-header');
  const footerContainer=document.querySelector('#shared-footer');
  // The header/footer are already in the HTML, avoiding a fetch and an empty navbar.
  const title=document.getElementById('shared-team-name');
  if(title && cached)title.textContent=teamLabel(cached);
  const currentPage=location.pathname.split('/').pop().toLowerCase();
  document.querySelectorAll('#main-navigation a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')?.toLowerCase()===currentPage));
  if(window.lucide)lucide.createIcons();
  // Fetch team and seasons together; data refresh must not block the visible shell.
  const teamPromise=teamId?supabaseClient.from('teams').select('school_name, mascot, club_name, team_type, primary_color, secondary_color').eq('id',teamId).single():Promise.resolve({data:null,error:null});
  const seasonsPromise=teamId?supabaseClient.from('seasons').select('id, seasons').eq('team_id',teamId).order('seasons',{ascending:false}):Promise.resolve({data:[],error:null});
  const [teamResult,seasonResult]=await Promise.all([teamPromise,seasonsPromise]);
  if(sessionStorage.getItem('selectedTeamId')!==teamId)return;
  if(teamResult.error)console.error('Could not refresh team theme:',teamResult.error);
  else if(teamResult.data){
    const team=teamResult.data;
    window.ScoridiumTheme?.apply(team);
    window.ScoridiumTheme?.cache(team,teamId);
    const name=document.getElementById('shared-team-name');
    if(name){name.textContent=teamLabel(team);name.removeAttribute('aria-label');}
  }
  const selector=document.querySelector('.season-selector');
  if(selector && !seasonResult.error){
    const seasons=seasonResult.data||[];
    selector.replaceChildren();
    for(const season of seasons){const option=new Option(season.seasons,season.id);selector.add(option)}
    const saved=sessionStorage.getItem('selectedSeasonId');
    if(saved && seasons.some(s=>s.id===saved))selector.value=saved;
    else if(seasons.length){selector.value=seasons[0].id;sessionStorage.setItem('selectedSeasonId',selector.value)}
    if(!seasons.length)selector.add(new Option('No seasons',''));
    if(teamId && selector.selectedOptions[0])sessionStorage.setItem('scoridium:season-label:'+teamId,selector.selectedOptions[0].textContent);
    selector.addEventListener('change',()=>{
      sessionStorage.setItem('selectedSeasonId',selector.value);
      if(teamId && selector.selectedOptions[0])sessionStorage.setItem('scoridium:season-label:'+teamId,selector.selectedOptions[0].textContent);
      dispatchEvent(new CustomEvent('seasonChanged',{detail:{seasonId:selector.value}}));
    });
  } else if(seasonResult.error)console.error('Could not refresh team seasons:',seasonResult.error);
}
window.pageLayoutReady=loadPageLayout().catch(error=>{console.error('Shared layout failed:',error)});
