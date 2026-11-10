(() => {
  const client=window.supabaseClient;
  const list=document.getElementById('teams-list'), notice=document.getElementById('teams-notice');
  const valid = (value,fallback) => /^#[0-9a-fA-F]{6}$/.test(value||'') ? value : fallback;
  function luminance(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)}
  function show(message,error=false){notice.className=message?`notice${error?' error':''}`:'';notice.textContent=message}
  async function load(){
    if(!client){show('Supabase is not initialized.',true);return;}
    show('Loading your teams…');
    const {data:{user},error:authError}=await client.auth.getUser();
    if(authError||!user){window.location.href='Login.html';return;}
    const {data:memberships,error}=await client.from('team_members')
      .select('role,team_id,teams(id,team_type,school_name,club_name,mascot,division,primary_color,secondary_color)')
      .eq('user_id',user.id);
    if(error){show('Unable to load teams: '+error.message,true);return;}
    show('');list.replaceChildren();
    for(const membership of memberships||[]){
      const team=Array.isArray(membership.teams)?membership.teams[0]:membership.teams;
      if(!team)continue;
      const primary=valid(team.primary_color,'#181818'),secondary=valid(team.secondary_color,'#9299A5');
      const name=team.team_type==='club'?(team.club_name||team.school_name||'Team'):(team.mascot||team.school_name||'Team');
      const organization=team.team_type==='club'?'Club basketball':(team.school_name||'School basketball');
      const abbreviation=(team.mascot || team.club_name || team.school_name || 'T').trim().charAt(0).toUpperCase();
      const card=document.createElement('button');card.type='button';card.className='team-card';
      card.style.setProperty('--card-primary',primary);card.style.setProperty('--card-secondary',secondary);
      card.style.setProperty('--card-primary-ink',luminance(primary)>.179?'#161616':'#FFFFFF');
      const banner=document.createElement('div');banner.className='team-card-banner';
      const logo=document.createElement('div');logo.className='team-card-logo';logo.textContent=abbreviation;
      if(Math.abs(luminance(primary)-luminance(secondary))<.18)logo.classList.add('light-logo');
      const title=document.createElement('div');title.className='team-card-banner-name';title.textContent=name;
      banner.append(logo,title);
      const body=document.createElement('div');body.className='team-card-body';
      const info=document.createElement('div');info.className='team-card-info';
      const org=document.createElement('p');org.textContent=organization;
      const badges=document.createElement('div');badges.className='team-card-badges';
      [team.division,membership.role?.replaceAll('_',' ')].filter(Boolean).forEach(t=>{const b=document.createElement('span');b.textContent=t;badges.appendChild(b)});
      info.append(org,badges);
      const arrow=document.createElement('span');arrow.className='team-card-arrow';arrow.textContent='→';
      body.append(info,arrow);card.append(banner,body);
      card.addEventListener('click',()=>{
        sessionStorage.setItem('selectedTeamId',membership.team_id);
        sessionStorage.removeItem('selectedSeasonId');
        // Immediately available to next page before its first paint.
        try {sessionStorage.setItem('scoridium:team-preview:'+membership.team_id,JSON.stringify({id:membership.team_id,...team}));}catch{}
        window.location.href='app.html?page=dashboard.html';
      });
      list.appendChild(card);
    }
    const create=document.createElement('a');create.href='create-team.html';create.className='empty-team-card';create.textContent='+ Create another team';list.appendChild(create);
  }
  document.getElementById('sign-out').addEventListener('click',async()=>{
    const {error}=await client.auth.signOut();if(error){show(error.message,true);return;}
    sessionStorage.removeItem('selectedTeamId');sessionStorage.removeItem('selectedSeasonId');location.href='Login.html';
  });
  load().catch(e=>show('Unable to load teams: '+e.message,true));
})();
