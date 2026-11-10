/* Scoridium player profile. Completed games only. No writes to Supabase. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const getClient = () => typeof supabaseClient !== 'undefined' ? supabaseClient : window.supabaseClient || null;
  const selectedId = params.get('playerId');
  
const selectedTeam =
    params.get("teamId") ||
    sessionStorage.getItem("selectedTeamId") ||
    null;

const seasonId =
    params.get("seasonId") ||
    sessionStorage.getItem("selectedSeasonId") ||
    null;

  const positionNames = {PG:'Point Guard',SG:'Shooting Guard',SF:'Small Forward',PF:'Power Forward',C:'Center'};
  const one = n => Number.isFinite(n) ? n.toFixed(1) : '—';
  const pct = (m,a) => a > 0 ? `${(m/a*100).toFixed(1)}%` : '—';
  const number = x => Number(x || 0);
  const count = (events,type) => events.filter(e => e.type === type).length;
  let team = {};
let player = null;
let gameStats = [];
let careerGameStats = [];
let careerSeasonLabels = new Map();
let shots = [];
let teamShots = [];
let inDemo = false;

  function setMessage(msg) { $('profile-message').textContent=msg; $('profile-message').hidden=!msg; }
  function setTheme(t) {
    const hex = s => typeof s==='string' && /^#[\da-f]{6}$/i.test(s) ? s : null;
    document.documentElement.style.setProperty('--primary',hex(t.primary_color)||'#123B78');
    document.documentElement.style.setProperty('--secondary',hex(t.secondary_color)||'#FFD600');
  }
  function fmtDate(d) { if(!d) return '—'; const date=new Date(`${String(d).slice(0,10)}T12:00:00`); return Number.isNaN(date.getTime())?'—':date.toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
  function total(stat) { return gameStats.reduce((sum,g)=>sum+g[stat],0); }
  function average(stat) { return gameStats.length ? total(stat)/gameStats.length : null; }
  function playerName(p) { return `${p.first_name||''} ${p.last_name||''}`.trim() || p.name || 'Player'; }
  function statsForGame(g, playerEvents, allEvents) {
    const shotsForPlayer = playerEvents.filter(e=>e.type==='shot');
    const ft = playerEvents.filter(e=>e.type==='free_throw');
    const three = shotsForPlayer.filter(e=>Number(e.points)===3);
    const fgm = shotsForPlayer.filter(e=>e.made===true).length;
    const fg3m = three.filter(e=>e.made===true).length;
    const ftm = ft.filter(e=>e.made===true).length;
    const pts = shotsForPlayer.reduce((sum,e)=>sum+(e.made?number(e.points):0),0)+ftm;
    const reb = count(playerEvents,'offensive_rebound')+count(playerEvents,'defensive_rebound');
    const totals = (allEvents||[]).reduce((acc,e)=>{
      const p=e.made===false?0:number(e.points);
      if(e.team==='us') acc.us+=p;
      else if(e.team==='opponent') acc.opponent+=p;
      return acc;
    },{us:0,opponent:0});
    const ourScore = g.team_score != null ? number(g.team_score) : totals.us;
    const oppScore = g.opponent_score != null ? number(g.opponent_score) : totals.opponent;
    return { id:g.id, date:g.date || g.game_date || g.scheduled_at,
      opponent:g.opponent||'Opponent', location:g.location||'',
      result: ourScore===oppScore?'T':ourScore>oppScore?'W':'L',
      score:`${ourScore}–${oppScore}`,
      pts,reb,ast:count(playerEvents,'assist'),stl:count(playerEvents,'steal'),blk:count(playerEvents,'block'),
      tov:count(playerEvents,'turnover'),pf:count(playerEvents,'foul'),
      fgm,fga:shotsForPlayer.length,fg3m,fg3a:three.length,ftm,fta:ft.length,
      shotEvents:shotsForPlayer };
  }
  function row(container,label,value){
    const wrap=document.createElement('div');wrap.className='stat-row';
    const l=document.createElement('span');l.textContent=label;
    const v=document.createElement('strong');v.textContent=value;
    wrap.append(l,v);container.appendChild(wrap);
  }
  function createSnapshot(items) {
    const holder=$('season-snapshot');holder.replaceChildren();
    items.forEach(([label,value])=>{const d=document.createElement('div');d.className='snapshot-item';
      const s=document.createElement('strong');s.textContent=value;const t=document.createElement('span');t.textContent=label;
      d.append(s,t);holder.append(d);});
  }
  function renderCourt(){
    const points=$('shot-points');points.replaceChildren();
    const NS='http://www.w3.org/2000/svg';
    for(const shot of shots){
      const x=Number(shot.x),y=Number(shot.y);
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<10||x>850||y<10||y>460) continue;
      const shape=document.createElementNS(NS,shot.made?'circle':'path');
      if(shot.made){shape.setAttribute('cx',x);shape.setAttribute('cy',y);shape.setAttribute('r','7');shape.setAttribute('fill','#178c31');shape.setAttribute('stroke','white');shape.setAttribute('stroke-width','2');}
      else {shape.setAttribute('d',`M ${x-7} ${y-7} L ${x+7} ${y+7} M ${x+7} ${y-7} L ${x-7} ${y+7}`);shape.setAttribute('stroke','#db1821');shape.setAttribute('stroke-width','4');shape.setAttribute('fill','none');shape.setAttribute('stroke-linecap','round');}
      const title=document.createElementNS(NS,'title');title.textContent=`${shot.made?'Made':'Missed'} ${shot.points||2}PT`;
      shape.appendChild(title);points.appendChild(shape);
    }
    const made=shots.filter(s=>s.made===true).length;
    $('made-count').textContent=made;
    $('missed-count').textContent=shots.length-made;
    $('chart-fgp').textContent=pct(made,shots.length);
    $('chart-empty').hidden=shots.length>0;
  }
  function renderBreakdown(){
    const el=$('shot-breakdown');el.replaceChildren();
    const paint=[],middle=[],three=[];
    shots.forEach(s=>{if(number(s.points)===3){three.push(s);return;}
      const x=number(s.x),y=number(s.y);
      const nearLeft=x<430,hx=nearLeft?57.25:802.75;
      const distance=Math.hypot(x-hx,y-235)/30;
      if(distance<=2.5) paint.push(s); else middle.push(s);
    });
    const total=shots.length;const values=[paint.length,middle.length,three.length];
    const percent=values.map(n=>total?Math.round(n/total*100):0);
    const donut=document.createElement('div');donut.className='donut';
    donut.style.background=total?`conic-gradient(var(--primary) 0 ${percent[0]}%,var(--secondary) ${percent[0]}% ${percent[0]+percent[1]}%,#b7c2d1 ${percent[0]+percent[1]}% 100%)`:'#e1e6ef';
    const label=document.createElement('div');label.className='donut-text';label.textContent=String(total);
    const sub=document.createElement('small');sub.textContent='FG ATT';label.append(sub);donut.append(label);
    const legend=document.createElement('div');legend.className='breakdown-legend';
    ['Paint','Midrange','3PT'].forEach((name,i)=>{const item=document.createElement('div');item.className='legend-item';
      const dot=document.createElement('span');dot.className='legend-dot';dot.style.background=['var(--primary)','var(--secondary)','#b7c2d1'][i];
      const text=document.createElement('span');text.textContent=`${name}: ${percent[i]}%`;item.append(dot,text);legend.append(item);});
    el.append(donut,legend);
  }
  function renderConceptSections(){
    const cards=$('season-average-grid');
    cards.replaceChildren();
    for(const [label,stat] of [['PTS','pts'],['REB','reb'],['AST','ast'],['STL','stl'],['BLK','blk']]){
      const tile=document.createElement('div');tile.className='average-tile';
      const value=document.createElement('strong');value.textContent=one(average(stat));
      const name=document.createElement('span');name.textContent=label;
      tile.append(value,name);cards.append(tile);
    }
    const seasonLabel=careerSeasonLabels.get(String(seasonId)) || (seasonId?'Selected season':'All seasons');
    $('season-context').textContent=seasonLabel;
    $('season-stat-context').textContent=seasonLabel;
    const recent=$('recent-games-list');recent.replaceChildren();
    const list=gameStats.slice(0,4);
    if(!list.length){recent.textContent='No completed games in this season yet.';}
    list.forEach(g=>{
      const row=document.createElement('div');row.className='recent-game-row';
      const opponent=document.createElement('div');opponent.className='recent-opponent';
      const abbr=document.createElement('span');abbr.className='opponent-initial';abbr.textContent=(g.opponent||'O').charAt(0).toUpperCase();
      const words=document.createElement('div');
      const name=document.createElement('strong');name.textContent=g.opponent;
      const date=document.createElement('small');date.textContent=fmtDate(g.date)+' · '+(String(g.location).toLowerCase()==='away'?'Away':'Home');
      words.append(name,date);opponent.append(abbr,words);
      const stats=document.createElement('span');stats.className='recent-stats';stats.textContent=`${g.pts} PTS  ·  ${g.reb} REB  ·  ${g.ast} AST`;
      const result=document.createElement('b');result.className='result '+(g.result==='W'?'win':'loss');result.textContent=g.result;
      row.append(opponent,stats,result);recent.append(row);
    });
    const shotsPanel=$('overview-shooting');shotsPanel.replaceChildren();
    const fgm=total('fgm'),fga=total('fga'),threeM=total('fg3m'),threeA=total('fg3a'),ftm=total('ftm'),fta=total('fta');
    for(const [label,value] of [['FG%',pct(fgm,fga)],['3P%',pct(threeM,threeA)],['FT%',pct(ftm,fta)]]) row(shotsPanel,label,value);
    

const highsGrid = $('season-highs-grid');

if (highsGrid) {
    highsGrid.replaceChildren();

    const stats = [
        ['PTS', 'pts'],
        ['REB', 'reb'],
        ['AST', 'ast'],
        ['STL', 'stl'],
        ['BLK', 'blk']
    ];

    stats.forEach(([label, key]) => {
        const bestGame = gameStats.reduce((best, game) => {
    if (!best || Number(game[key] || 0) > Number(best[key] || 0)) {
        return game;
    }
    return best;
}, null);

const highest = bestGame ? Number(bestGame[key] || 0) : null;

        const tile = document.createElement('div');
        tile.className = 'season-high-tile';

        const value = document.createElement('strong');
        value.textContent = highest === null ? '—' : highest;

        const name = document.createElement('span');
        name.textContent = label;

        const details = document.createElement('small');
details.className = 'season-high-details';

if (bestGame) {
    const opponent = document.createElement('span');
    opponent.textContent = `vs ${bestGame.opponent}`;

    const date = document.createElement('span');
    date.textContent = new Date(
        `${String(bestGame.date).slice(0, 10)}T12:00:00`
    ).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });

    details.append(opponent, date);
} else {
    details.textContent = 'No games';
}

tile.append(value, name, details);
        highsGrid.appendChild(tile);
    });
}

    const career=$('career-stats-body');career.replaceChildren();
    const grouped=new Map();
    for(const game of careerGameStats){
      const id=String(game.seasonId || 'Unknown');
      if(!grouped.has(id))grouped.set(id,[]);
      grouped.get(id).push(game);
    }
    const summarize=games=>{
      const sum=k=>games.reduce((a,g)=>a+Number(g[k]||0),0);
      const avg=k=>games.length?(sum(k)/games.length).toFixed(1):'—';
      return [games.length,avg('pts'),avg('reb'),avg('ast'),avg('stl'),avg('blk'),pct(sum('fgm'),sum('fga')),pct(sum('fg3m'),sum('fg3a')),pct(sum('ftm'),sum('fta'))];
    };
    for(const [id,games] of grouped){
      const rowEl=document.createElement('tr');
      const values=[careerSeasonLabels.get(id)||id,...summarize(games)];
      values.forEach(value=>{const cell=document.createElement('td');cell.textContent=value;rowEl.append(cell);});career.append(rowEl);
    }
    if(careerGameStats.length){
      const rowEl=document.createElement('tr');rowEl.className='career-total-row';
      ['Career',...summarize(careerGameStats)].forEach(value=>{const cell=document.createElement('td');cell.textContent=value;rowEl.append(cell);});career.append(rowEl);
    }else{
      const rowEl=document.createElement('tr');const cell=document.createElement('td');cell.colSpan=10;cell.textContent='No completed games yet.';rowEl.append(cell);career.append(rowEl);
    }
    const highs=$('career-highs');highs.replaceChildren();
    for(const [label,key] of [['Points','pts'],['Rebounds','reb'],['Assists','ast'],['Steals','stl'],['Blocks','blk']]){
      const best=careerGameStats.reduce((a,b)=>!a || Number(b[key]||0)>Number(a[key]||0)?b:a,null);
      row(highs,label,best?`${best[key]} · vs ${best.opponent}`:'—');
    }
  }

  function renderProfile(){
    const g=gameStats.length;
    const fgm=total('fgm'),fga=total('fga'),fg3m=total('fg3m'),fg3a=total('fg3a'),ftm=total('ftm'),fta=total('fta');
    const p=player;const position=positionNames[p.position]||p.position||'—';
    $('player-name').textContent=playerName(p).toUpperCase();
    $('header-number').textContent=p.number??'—';
    $('jersey-svg-number').textContent=p.number??'—';
    $('jersey-svg-lastname').textContent =
    (p.last_name || p.first_name || p.name || 'PLAYER')
        .toUpperCase()
        .slice(0, 13);
    $('player-position').textContent=position;
    $('player-grade').textContent=`GRADE ${p.grade??'—'}`;
    $('player-school').textContent=(team.school_name||'Team').toUpperCase();
    $('player-mascot').textContent=(team.mascot||'').toUpperCase();
    $('team-letter').textContent=String(team.mascot||team.school_name||'S').slice(0,1).toUpperCase();
    renderCourt();
    const totals=$('stat-totals');totals.replaceChildren();
    [['Games Played',g],['Points',total('pts')],['Rebounds',total('reb')],['Assists',total('ast')],['Steals',total('stl')],['Blocks',total('blk')],['Turnovers',total('tov')],['Fouls',total('pf')]].forEach(([a,b])=>row(totals,a,b));
    const avg=$('stat-averages');avg.replaceChildren();
    [['Points per game',average('pts')],['Rebounds per game',average('reb')],['Assists per game',average('ast')],['Steals per game',average('stl')],['Blocks per game',average('blk')],['Turnovers per game',average('tov')]].forEach(([a,b])=>row(avg,a,one(b)));
    const shooting=$('stat-shooting');shooting.replaceChildren();
    [['Field Goals',`${fgm} / ${fga} · ${pct(fgm,fga)}`],['3-Point',`${fg3m} / ${fg3a} · ${pct(fg3m,fg3a)}`],['Free Throws',`${ftm} / ${fta} · ${pct(ftm,fta)}`],['Effective FG%',fga?pct(fgm+0.5*fg3m,fga):'—'],['True Shooting%',total('pts')&&fga+0.44*fta?pct(total('pts'),2*(fga+0.44*fta)):'—']].forEach(([a,b])=>row(shooting,a,b));
    renderBreakdown();
    const tbody=$('game-log-body');tbody.replaceChildren();
    if(!g){const tr=document.createElement('tr');const td=document.createElement('td');td.className='no-games';td.colSpan=11;td.textContent='No completed games for this player.';tr.append(td);tbody.append(tr);}
    gameStats.forEach(s=>{
      const tr=document.createElement('tr');
      const cells=[fmtDate(s.date),`${String(s.location).toLowerCase()==='away'?'@':'vs'} ${s.opponent}`,`${s.result} ${s.score}`,s.pts,s.reb,s.ast,s.stl,s.blk,`${s.fgm}–${s.fga}`,`${s.fg3m}–${s.fg3a}`,`${s.ftm}–${s.fta}`];
      cells.forEach((value,i)=>{const td=document.createElement('td');if(i===2){const span=document.createElement('span');span.className=`result ${s.result==='W'?'win':'loss'}`;span.textContent=value;td.append(span);}else td.textContent=value;tr.append(td);});tbody.append(tr);
    });
    const summary=$('game-log-summary');summary.replaceChildren();
    [['Games',g],['PPG',one(average('pts'))],['RPG',one(average('reb'))],['APG',one(average('ast'))],['FG%',pct(fgm,fga)],['3PT%',pct(fg3m,fg3a)],['FT%',pct(ftm,fta)]].forEach(([a,b])=>row(summary,a,b));
    renderConceptSections();
    document.title=`${playerName(p)} | Scoridium`;
  }
  function switchTab(tab){
    ['overview','statistics','games','career'].forEach(id=>{
      $(`tab-${id}`).setAttribute('aria-selected',String(id===tab));
      $(`panel-${id}`).hidden=id!==tab;
    });
  }
  for(const id of ['overview','statistics','games','career']) $('tab-'+id).addEventListener('click',()=>switchTab(id));
  $('view-game-log')?.addEventListener('click',()=>switchTab('games'));
  const backQuery=new URLSearchParams();if(selectedTeam) backQuery.set('teamId',selectedTeam);if(seasonId) backQuery.set('seasonId',seasonId);
  $('back-roster').href=`roster.html${backQuery.size?'?'+backQuery.toString():''}`;
  async function loadProfile(){
    const client=getClient();
    if(!client){demo();return;}
    if(!selectedId){setMessage('No player selected. Open a jersey from Team & Roster.');return;}
    setMessage('Loading player profile…');
    const {data:p,error:pError}=await client.from('players').select('*').eq('id',selectedId).maybeSingle();
    if(pError||!p){setMessage(pError?.message||'Player not found or access denied.');return;}
    player=p;
    const teamId=selectedTeam||p.team_id;
    if(selectedTeam&&p.team_id!==selectedTeam){setMessage('This player is not on the selected team.');return;}
    const {data:t,error:tError}=await client.from('teams').select('*').eq('id',teamId).maybeSingle();
    if(tError||!t){setMessage(tError?.message||'Could not load the team.');return;}
    team=t;setTheme(team);
    // Exclude live, scheduled, paused, and unfinished games from ALL profile statistics.
    let gamesQuery=client.from('games').select('*').eq('team_id',teamId).eq('status','completed').order('date',{ascending:false});
    // Fetch completed games across seasons for Career; filter Overview and Game Log separately.
    const {data:games,error:gError}=await gamesQuery;
    if(gError){setMessage(`Could not load completed games: ${gError.message}`);return;}
    const ids=(games||[]).map(g=>g.id);
    let allEvents=[];
    if(ids.length){
      // Chunk requests to avoid oversized URL query strings on longer seasons.
      for(let i=0;i<ids.length;i+=50){
        const chunk=ids.slice(i,i+50);
        const {data,error}=await client.from('game_events').select('*').in('game_id',chunk);
        if(error){setMessage(`Could not load game events: ${error.message}`);return;}
        allEvents.push(...(data||[]));
      }
    }
    const byGame=new Map();for(const e of allEvents){if(!byGame.has(e.game_id))byGame.set(e.game_id,[]);byGame.get(e.game_id).push(e);}
    careerGameStats=(games||[]).map(g=>{
      const events=byGame.get(g.id)||[];
      const mine=events.filter(e=>e.player_id===p.id&&e.team==='us');
      return {...statsForGame(g,mine,events), seasonId:g.seasons_id || null};
    });
    gameStats=careerGameStats.filter(g=>!seasonId || String(g.seasonId)===String(seasonId));
    const seasonResponse=await client.from('seasons').select('id, seasons').eq('team_id',teamId);
    careerSeasonLabels=new Map((seasonResponse.data||[]).map(s=>[String(s.id),s.seasons]));
    
/* =========================================
   COMPLETED-GAME SHOOTING DATA
   ========================================= */

// Individual player's shots
shots = gameStats.flatMap(game => game.shotEvents);

// Entire team's shots, including the selected player
const seasonGameIds=new Set(gameStats.map(g=>String(g.id)));
teamShots = allEvents.filter(event =>
    seasonGameIds.has(String(event.game_id)) &&
    event.type === "shot" &&
    event.team === "us" &&
    event.x != null &&
    event.y != null
);

console.log("Player Shooting Analysis:", {
    playerShots: shots.length,
    teamShots: teamShots.length,
    completedGames: games.length
});

setMessage('');
renderProfile();
renderPlayerHalfCourt();

  }
  function demo(){
    inDemo=true;$('preview-header').hidden=false;
    team={school_name:'Croxford High School',mascot:'Cavaliers',primary_color:'#123B78',secondary_color:'#FFD600'};
    player={first_name:'Jayden',last_name:'Carter',number:12,position:'PG',grade:11};
    setTheme(team);
    const dummy=[{id:'1',date:'2026-10-28',opponent:'Westside Panthers',location:'away',team_score:78,opponent_score:64},
      {id:'2',date:'2026-10-24',opponent:'Central Titans',location:'home',team_score:70,opponent_score:73},
      {id:'3',date:'2026-10-17',opponent:'Blue Falcons',location:'home',team_score:82,opponent_score:71}];
    const attempts=[];for(let i=0;i<45;i++){attempts.push({type:'shot',team:'us',made:i%3!==0,points:i%4===0?3:2,x:40+(i*137)%780,y:22+(i*83)%425});}
    const sample=(g,i)=>statsForGame(g,[...attempts.slice(i*15,(i+1)*15),...Array.from({length:4+i},()=>({type:'assist'})),...Array.from({length:3+i},()=>({type:'defensive_rebound'}))],[]);
    gameStats=dummy.map(sample);careerGameStats=gameStats.map(g=>({...g,seasonId:"demo"}));careerSeasonLabels=new Map([["demo","2026–2027"]]);shots=attempts;
    setMessage('PREVIEW MODE — sample player and statistics. Connect your existing Supabase client to load real data.');
    $('data-note').textContent='Preview uses sample data. Live profiles include only completed games.';
    renderProfile();
  }
  if(typeof loadPageLayout==='function'){
    try{Promise.resolve(loadPageLayout()).catch(e=>console.warn('Layout load failed:',e));}
    catch(e){console.warn('Layout load failed:',e);}
  }

  
/* =========================================
   BASIC SHOOTING ANALYSIS
   PLAYER VS TEAM
   ========================================= */

function renderBasicShootingAnalysis() {

    const quarter =
        document.getElementById("zone-quarter")?.value || "all";

    // Filter by quarter if selected
    const filterQuarter = events => {
        if (quarter === "all") return events;

        return events.filter(event =>
            Number(event.period) === Number(quarter)
        );
    };

    const playerAttempts = filterQuarter(shots);
    const teamAttempts = filterQuarter(teamShots);

    // Identify the shooting area
    function getShotZone(shot) {

        if (Number(shot.points) === 3) {
            return "three";
        }

        const x = Number(shot.x);
        const y = Number(shot.y);

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
        }

        const hoopX = x < 430 ? 57.25 : 802.75;

        const distance = Math.hypot(
            x - hoopX,
            y - 235
        ) / 30;

        return distance <= 2.5 ? "rim" : "midrange";
    }

    const zones = [
        { id: "rim", label: "RIM", x: 235, y: 95 },
        { id: "midrange", label: "MIDRANGE", x: 235, y: 215 },
        { id: "three", label: "3PT", x: 235, y: 345 }
    ];

    function calculateZone(events, zoneId) {

        const attempts = events.filter(event =>
            getShotZone(event) === zoneId
        );

        const made = attempts.filter(event =>
            event.made === true
        ).length;

        return {
            made,
            attempts: attempts.length,
            percentage: attempts.length
                ? (made / attempts.length * 100).toFixed(1) + "%"
                : "—"
        };
    }

    // Update the expanded shooting comparison
    const summary = document.getElementById(
        "zone-comparison-data"
    );

    if (summary) {
        summary.replaceChildren();

        zones.forEach(zone => {

            const playerStats =
                calculateZone(playerAttempts, zone.id);

            const teamStats =
                calculateZone(teamAttempts, zone.id);

            const row = document.createElement("div");
            row.className = "basic-zone-row";

            row.innerHTML = `
                <strong>${zone.label}</strong>

                <div>
                    <span>Player</span>
                    <b>${playerStats.percentage}</b>
                    <small>${playerStats.made}/${playerStats.attempts}</small>
                </div>

                <div>
                    <span>Team</span>
                    <b>${teamStats.percentage}</b>
                    <small>${teamStats.made}/${teamStats.attempts}</small>
                </div>
            `;

            summary.appendChild(row);
        });
    }

    // Add basic shooting labels to both half courts
    ["player-zone-preview", "player-zone-court"].forEach(id => {

        const svg = document.querySelector(`#${id} svg`);
        if (!svg) return;

        svg.querySelector(".basic-shooting-labels")?.remove();

        const group = document.createElementNS(
            "http://www.w3.org/2000/svg", "g"
        );

        group.setAttribute("class", "basic-shooting-labels");
        group.setAttribute("pointer-events", "none");

        zones.forEach(zone => {

            const stats = calculateZone(playerAttempts, zone.id);

            const text = document.createElementNS(
                "http://www.w3.org/2000/svg", "text"
            );

            text.setAttribute("x", zone.x);
            text.setAttribute("y", zone.y);
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("font-size", "17");
            text.setAttribute("font-weight", "800");
            text.setAttribute("fill", "#102d58");
            text.setAttribute("stroke", "white");
            text.setAttribute("stroke-width", "3");
            text.setAttribute("paint-order", "stroke");

            text.textContent =
                `${zone.label}: ${stats.percentage}`;

            group.appendChild(text);
        });

        svg.appendChild(group);
    });
}


  
/* =========================================
   PLAYER SHOOTING HALF-COURT
   ========================================= */

function renderPlayerHalfCourt() {

    const halfCourt = `
        <svg
            class="player-half-court-svg"
            viewBox="0 0 470 440"
            role="img"
            aria-label="FIBA half-court shooting analysis">

            <!-- COURT BACKGROUND -->
            <rect
                x="1.5" y="1.5"
                width="467" height="437"
                fill="#B98556"
                stroke="#A67245"
                stroke-width="3"/>

            <!-- COURT BOUNDARY -->
            <rect
                x="10" y="10"
                width="450" height="420"
                fill="none"
                stroke="white"
                stroke-width="3"/>

                <!-- PLAYER NAME -->
<text
    x="235"
    y="405"
    text-anchor="middle"
    font-size="28"
    font-weight="800"
    fill="rgba(255,255,255,0.65)"
    letter-spacing="2"
    pointer-events="none"
>
    ${player
        ? `${player.first_name || ""} ${player.last_name || ""}`.trim().toUpperCase()
        : "PLAYER"}
</text>

            <!-- BACKBOARD -->
            <line
                x1="208" y1="46"
                x2="262" y2="46"
                stroke="white"
                stroke-width="4"/>

            <!-- BASKET -->
            <circle
                cx="235" cy="57.25"
                r="7"
                fill="none"
                stroke="white"
                stroke-width="3"/>

            <!-- PAINT -->
            <rect
                x="161.5" y="10"
                width="147" height="174"
                fill="none"
                stroke="white"
                stroke-width="3"/>

            <!-- FREE THROW CIRCLE -->
            <circle
                cx="235" cy="184"
                r="54"
                fill="none"
                stroke="white"
                stroke-width="3"/>

            <!-- FIBA THREE-POINT LINE -->
            <path
                d="M37 10 V99.69
                   A202.5 202.5 0 0 0 433 99.69
                   V10"
                fill="none"
                stroke="white"
                stroke-width="3"/>

            <!-- NO-CHARGE SEMICIRCLE -->
            <path
                d="M197.5 57.25
                   A37.5 37.5 0 0 0 272.5 57.25"
                fill="none"
                stroke="white"
                stroke-width="3"/>

        </svg>
    `;

    // Small Overview preview
    const preview = $('player-zone-preview');

    if (preview) {
        preview.innerHTML = halfCourt;
    }

    // Expanded analysis window
    const expanded = $('player-zone-court');

    if (expanded) {
        expanded.innerHTML = halfCourt;
    }
}

renderPlayerHalfCourt();

/* =========================================
   PLAYER VS TEAM SHOOTING ANALYSIS
   ========================================= */

const playerZoneState = {
    mode: "basic",
    selected: new Set()
};

let playerZoneColors = {};

const playerZoneDefinitions = {
    basic: {
        paint: "PAINT",
        midrange: "MIDRANGE",
        three: "THREE-POINT"
    },

    traditional: {
        leftLowPaint: "LEFT LOW PAINT",
        rightLowPaint: "RIGHT LOW PAINT",
        leftHighPaint: "LEFT HIGH PAINT",
        rightHighPaint: "RIGHT HIGH PAINT",
        leftShort: "LEFT SHORT",
        rightShort: "RIGHT SHORT",
        leftMid: "LEFT MID",
        rightMid: "RIGHT MID",
        topMid: "TOP MID",
        leftCorner: "LEFT CORNER 3",
        rightCorner: "RIGHT CORNER 3",
        leftWing: "LEFT WING 3",
        rightWing: "RIGHT WING 3",
        topThree: "TOP 3"
    },

    distance: {
        zeroToFive: "0–5 FT",
        fiveToTen: "5–10 FT",
        tenToFifteen: "10–15 FT",
        fifteenToTwenty: "15–20 FT",
        twentyPlus: "20+ FT"
    }
};

function playerShotHalfCoordinates(shot) {
    if (shot.x == null || shot.y == null) return null;

    const x = Number(shot.x);
    const y = Number(shot.y);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
    }

    const left = x < 430;

    const hx = left ? 470 - y : y;
    const hy = left ? x : 860 - x;

    if (hx < 10 || hx > 460 || hy < 10 || hy > 430) {
        return null;
    }

    return { x: hx, y: hy };
}

function playerTraditionalZone(x, y) {
    const hoopX = 235;
    const hoopY = 57.25;
    const radius = 202.5;
    const distance = Math.hypot(x - hoopX, y - hoopY);
    const cornerY = hoopY + Math.sqrt(
        radius ** 2 - (hoopX - 37) ** 2
    );

    const outsideThree =
        (y <= cornerY && (x < 37 || x > 433)) ||
        (y > cornerY && distance > radius);

    if (outsideThree) {
        if (y <= cornerY) {
            return x < 235 ? "leftCorner" : "rightCorner";
        }

        if (x < 170) return "leftWing";
        if (x > 300) return "rightWing";
        return "topThree";
    }

    if (
        x >= 161.5 && x <= 308.5 &&
        y >= 10 && y <= 184
    ) {
        if (y < 97) {
            return x < 235
                ? "leftLowPaint"
                : "rightLowPaint";
        }

        return x < 235
            ? "leftHighPaint"
            : "rightHighPaint";
    }

    if (y < 145) {
        if (x < 161.5) return "leftShort";
        if (x > 308.5) return "rightShort";
    }

    if (x < 170) return "leftMid";
    if (x > 300) return "rightMid";

    return "topMid";
}

function playerShotZone(shot, mode) {
    const point = playerShotHalfCoordinates(shot);
    if (!point) return null;

    const { x, y } = point;

    if (mode === "traditional") {
        return playerTraditionalZone(x, y);
    }

    if (mode === "basic") {
        if (Number(shot.points) === 3) return "three";

        if (
            x >= 161.5 && x <= 308.5 &&
            y >= 10 && y <= 184
        ) {
            return "paint";
        }

        return "midrange";
    }

    const distanceFeet =
        Math.hypot(x - 235, y - 57.25) / 30 * 3.28084;

    if (distanceFeet < 5) return "zeroToFive";
    if (distanceFeet < 10) return "fiveToTen";
    if (distanceFeet < 15) return "tenToFifteen";
    if (distanceFeet < 20) return "fifteenToTwenty";

    return "twentyPlus";
}

function playerZoneFilteredShots(source) {
    const quarter = $('zone-quarter')?.value || "all";

    return source.filter(shot =>
        quarter === "all" ||
        Number(shot.period) === Number(quarter)
    );
}

function playerZoneTotals(source, mode) {
    const definitions = playerZoneDefinitions[mode];

    const zones = Object.fromEntries(
        Object.entries(definitions).map(([key, label]) => [
            key,
            { label, made: 0, attempts: 0 }
        ])
    );

    playerZoneFilteredShots(source).forEach(shot => {
        const key = playerShotZone(shot, mode);
        if (!key || !zones[key]) return;

        zones[key].attempts++;

        if (shot.made === true) {
            zones[key].made++;
        }
    });

    return zones;
}

function playerZonePercentage(zone) {
    return zone.attempts
        ? (zone.made / zone.attempts * 100).toFixed(1) + "%"
        : "—";
}

function playerZoneSum(zones, keys) {
    return keys.reduce(
        (total, key) => {
            total.made += zones[key]?.made || 0;
            total.attempts += zones[key]?.attempts || 0;
            return total;
        },
        { made: 0, attempts: 0 }
    );
}

function playerZoneHighlight() {
    const style = getComputedStyle(document.documentElement);

    return (
        style.getPropertyValue("--team-secondary").trim() ||
        style.getPropertyValue("--secondary").trim() ||
        "#FFD600"
    );
}

function playerZoneSVGElement(tag, attributes = {}) {
    const element = document.createElementNS(
        "http://www.w3.org/2000/svg",
        tag
    );

    Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
    });

    return element;
}

function playerZoneRegionColor(key) {
    return playerZoneColors[key] || "#B8C1CC";
}

function playerZoneOverlay(mode) {
    const group = playerZoneSVGElement("g", {
        "pointer-events": "none"
    });

    const addPath = (key, d) => {
        const path = playerZoneSVGElement("path", {
            d,
            fill: playerZoneRegionColor(key),
            "fill-opacity": playerZoneState.selected.has(key)
                ? "0.85"
                : "0.55"
        });

        group.appendChild(path);
    };

    if (mode === "basic") {
        addPath(
            "three",
            "M10 10 H37 V99.69 A202.5 202.5 0 0 0 433 99.69 V10 H460 V430 H10 Z"
        );

        addPath(
            "midrange",
            "M37 10 V99.69 A202.5 202.5 0 0 0 433 99.69 V10 Z " +
            "M161.5 10 H308.5 V184 H161.5 Z"
        );

        group.lastChild.setAttribute("fill-rule", "evenodd");

        addPath(
            "paint",
            "M161.5 10 H308.5 V184 H161.5 Z"
        );

        return group;
    }

    if (mode === "traditional") {
        // Same 13-zone classification as Team Statistics.
        // Build region shapes without overlapping fills.
        const paths = Object.fromEntries(
            Object.keys(playerZoneDefinitions.traditional)
                .map(key => [key, []])
        );

        for (let y = 10; y < 430; y += 2) {
            let current = null;
            let start = 10;

            for (let x = 10; x <= 460; x += 2) {
                const key = x === 460
                    ? null
                    : playerTraditionalZone(x + 1, y + 1);

                if (key !== current) {
                    if (current !== null) {
                        const width = x - start;
                        paths[current].push(
                            `M${start} ${y}h${width}v2h-${width}z`
                        );
                    }

                    current = key;
                    start = x;
                }
            }
        }

        
Object.entries(paths).forEach(([key, pieces]) => {
    addPath(key, pieces.join(""));
});

// Draw visible boundaries between the Detailed shooting zones.
const boundarySegments = [];
const step = 2;

// Vertical boundaries
for (let y = 10; y < 430; y += step) {
    for (let x = 12; x < 460; x += step) {
        const leftZone = playerTraditionalZone(x - 1, y + 1);
        const rightZone = playerTraditionalZone(x + 1, y + 1);

        if (leftZone !== rightZone) {
            boundarySegments.push(
                `M${x} ${y}v${step}`
            );
        }
    }
}

// Horizontal boundaries
for (let y = 12; y < 430; y += step) {
    for (let x = 10; x < 460; x += step) {
        const upperZone = playerTraditionalZone(x + 1, y - 1);
        const lowerZone = playerTraditionalZone(x + 1, y + 1);

        if (upperZone !== lowerZone) {
            boundarySegments.push(
                `M${x} ${y}h${step}`
            );
        }
    }
}

// Draw boundaries above all zone fills.
const boundaries = playerZoneSVGElement("path", {
    d: boundarySegments.join(" "),
    fill: "none",
    stroke: "#FFFFFF",
    "stroke-width": 2.5,
    "stroke-linecap": "round",
    "pointer-events": "none"
});

group.appendChild(boundaries);

return group;

    }

    // Distance mode: concentric bands from the basket.
    const feetToSVG = feet => feet / 3.28084 * 30;

    const clip = playerZoneSVGElement("clipPath", {
        id: "player-distance-court-clip"
    });

    clip.appendChild(playerZoneSVGElement("rect", {
        x: 10, y: 10, width: 450, height: 420
    }));

    const defs = playerZoneSVGElement("defs");
    defs.appendChild(clip);
    group.appendChild(defs);

    const clippedGroup = playerZoneSVGElement("g", {
        "clip-path": "url(#player-distance-court-clip)"
    });

    
const bands = [
    ["twentyPlus", feetToSVG(20), 700],
    ["fifteenToTwenty", feetToSVG(15), feetToSVG(20)],
    ["tenToFifteen", feetToSVG(10), feetToSVG(15)],
    ["fiveToTen", feetToSVG(5), feetToSVG(10)],
    ["zeroToFive", 0, feetToSVG(5)]
];

bands.forEach(([key, innerRadius, outerRadius]) => {

    const centerX = 235;
    const centerY = 57.25;

    // Build a filled ring, excluding everything inside its inner radius.
    const path = playerZoneSVGElement("path", {
        d: `
            M ${centerX + outerRadius} ${centerY}
            A ${outerRadius} ${outerRadius} 0 1 0
              ${centerX - outerRadius} ${centerY}
            A ${outerRadius} ${outerRadius} 0 1 0
              ${centerX + outerRadius} ${centerY}
            Z

            M ${centerX + innerRadius} ${centerY}
            A ${innerRadius} ${innerRadius} 0 1 1
              ${centerX - innerRadius} ${centerY}
            A ${innerRadius} ${innerRadius} 0 1 1
              ${centerX + innerRadius} ${centerY}
            Z
        `,
        fill: playerZoneRegionColor(key),
        "fill-opacity": playerZoneState.selected.has(key)
            ? 0.85
            : 0.75,
        "fill-rule": "evenodd"
    });

    // The innermost zone is a solid circle.
    if (innerRadius === 0) {
        path.setAttribute(
            "d",
            `
                M ${centerX + outerRadius} ${centerY}
                A ${outerRadius} ${outerRadius} 0 1 0
                  ${centerX - outerRadius} ${centerY}
                A ${outerRadius} ${outerRadius} 0 1 0
                  ${centerX + outerRadius} ${centerY}
                Z
            `
        );
    }

    clippedGroup.appendChild(path);
});


    [5, 10, 15, 20].forEach(feet => {
        clippedGroup.appendChild(
            playerZoneSVGElement("circle", {
                cx: 235,
                cy: 57.25,
                r: feetToSVG(feet),
                fill: "none",
                stroke: "#FFFFFF",
                "stroke-width": 2
            })
        );
    });

    group.appendChild(clippedGroup);
    return group;
}

function playerZoneLabelPositions(mode) {
    if (mode === "basic") {
        return {
            paint: [235, 110],
            midrange: [100, 180],
            three: [235, 350]
        };
    }

    if (mode === "distance") {
        return {
            zeroToFive: [235, 83],
            fiveToTen: [235, 124],
            tenToFifteen: [235, 170],
            fifteenToTwenty: [235, 215],
            twentyPlus: [235, 365]
        };
    }

    return {
        leftLowPaint: [195, 65],
        rightLowPaint: [275, 65],
        leftHighPaint: [195, 145],
        rightHighPaint: [275, 145],
        leftShort: [94, 93],
        rightShort: [376, 93],
        leftMid: [103, 208],
        rightMid: [367, 208],
        topMid: [235, 232],
        leftCorner: [22, 55],
        rightCorner: [448, 55],
        leftWing: [83, 328],
        rightWing: [387, 328],
        topThree: [235, 385]
    };
}

function renderPlayerZoneAnalysis() {
    const courtContainer = $('player-zone-court');
    const summaryContainer = $('zone-comparison-data');
    const previewSVG = $('player-zone-preview')?.querySelector("svg");

    if (!courtContainer || !summaryContainer || !previewSVG) {
        return;
    }

    const mode = playerZoneState.mode;

    const playerZones = playerZoneTotals(shots, mode);
    const teamZones = playerZoneTotals(teamShots, mode);

    
/* =========================================
   PLAYER PERFORMANCE VS TEAM
   ========================================= */

const PERFORMANCE_THRESHOLD = 5;

playerZoneColors = {};

Object.keys(playerZones).forEach(key => {

    const playerZone = playerZones[key];
    const teamZone = teamZones[key];

    // No shooting attempts = no performance rating.
    if (
        playerZone.attempts === 0 ||
        teamZone.attempts === 0
    ) {
        playerZoneColors[key] = "#B8C1CC";
        return;
    }

    const playerFG =
        playerZone.made / playerZone.attempts * 100;

    const teamFG =
        teamZone.made / teamZone.attempts * 100;

    const difference = playerFG - teamFG;

    if (difference >= PERFORMANCE_THRESHOLD) {

        // Player shoots better than team
        playerZoneColors[key] = "#34A853";

    } else if (difference <= -PERFORMANCE_THRESHOLD) {

        // Player shoots worse than team
        playerZoneColors[key] = "#E25B5B";

    } else {

        // Player performs similarly to team
        playerZoneColors[key] = "#F5C542";

    }
});

    // Copy the plain preview court, without modifying it.
    const svg = previewSVG.cloneNode(true);
    svg.removeAttribute("aria-label");
    svg.setAttribute(
        "aria-label",
        "Player versus team shooting zone analysis"
    );

    // Place zone fills above the hardwood and below court lines.
    svg.insertBefore(
        playerZoneOverlay(mode),
        svg.children[1]
    );

    const positions = playerZoneLabelPositions(mode);

    Object.entries(positions).forEach(([key, [x, y]]) => {
        if (
            playerZoneState.selected.size > 0 &&
            !playerZoneState.selected.has(key)
        ) return;

        const zone = playerZones[key];

        const label = playerZoneSVGElement("text", {
            x, y,
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            "font-size": key.includes("Corner") ? 10 : 15,
            "font-weight": 800,
            fill: "#123B78",
            stroke: "#FFFFFF",
            "stroke-width": 2,
            "paint-order": "stroke",
            "pointer-events": "none"
        });

        label.textContent = zone.attempts
            ? Math.round(zone.made / zone.attempts * 100) + "%"
            : "—";

        svg.appendChild(label);
    });

    courtContainer.replaceChildren(svg);

    const selectedKeys = playerZoneState.selected.size
        ? [...playerZoneState.selected]
        : Object.keys(playerZones);

    const playerOverall = playerZoneSum(
        playerZones,
        selectedKeys
    );

    const teamOverall = playerZoneSum(
        teamZones,
        selectedKeys
    );

    const table = document.createElement("table");
    table.className = "player-zone-comparison-table";

    table.innerHTML = `
        <thead>
            <tr>
                <th>ZONE</th>
                <th>PLAYER</th>
                <th>TEAM</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");

    Object.entries(playerZones).forEach(([key, zone]) => {
        const teamZone = teamZones[key];
        const selected = playerZoneState.selected.has(key);

        const row = document.createElement("tr");
        row.dataset.playerZone = key;

        if (selected) row.classList.add("zone-selected");

        const nameCell = document.createElement("td");
        nameCell.textContent =
            `${selected ? "☑" : "☐"} ${zone.label}`;

        const playerCell = document.createElement("td");
        playerCell.innerHTML = `
            <strong>${playerZonePercentage(zone)}</strong>
            <small>${zone.made}/${zone.attempts}</small>
        `;

        const teamCell = document.createElement("td");
        teamCell.innerHTML = `
            <strong>${playerZonePercentage(teamZone)}</strong>
            <small>${teamZone.made}/${teamZone.attempts}</small>
        `;

        row.append(nameCell, playerCell, teamCell);
        tbody.appendChild(row);
    });
    
    const overall = document.createElement("div");
overall.className = "player-zone-overall";


const fgDifference =
    playerOverall.attempts > 0 && teamOverall.attempts > 0
        ? (
            playerOverall.made / playerOverall.attempts * 100 -
            teamOverall.made / teamOverall.attempts * 100
          )
        : null;

overall.innerHTML = `
    <div>
        <span>PLAYER FG%</span>
        <strong>${playerZonePercentage(playerOverall)}</strong>
        <small>${playerOverall.made}/${playerOverall.attempts}</small>
    </div>

    <div>
        <span>TEAM FG%</span>
        <strong>${playerZonePercentage(teamOverall)}</strong>
        <small>${teamOverall.made}/${teamOverall.attempts}</small>
    </div>

    <div>
        <span>DIFFERENCE</span>
        <strong class="${
            fgDifference === null ? "" :
            fgDifference > 0 ? "fg-positive" :
            fgDifference < 0 ? "fg-negative" : ""
        }">
            ${fgDifference === null
                ? "—"
                : `${fgDifference > 0 ? "+" : ""}${fgDifference.toFixed(1)}`}
        </strong>
        <small>Percentage points</small>
    </div>
`;

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "clear-player-zones";
    clearButton.textContent = playerZoneState.selected.size
        ? `Clear Selection (${playerZoneState.selected.size})`
        : "All Zones";
    clearButton.disabled = playerZoneState.selected.size === 0;

    const note = document.createElement("p");
    const legend = document.createElement("div");
legend.className = "player-zone-legend";

legend.innerHTML = `
    <span><i class="zone-green"></i> Above Team</span>
    <span><i class="zone-yellow"></i> Near Team</span>
    <span><i class="zone-red"></i> Below Team</span>
    <span><i class="zone-grey"></i> No Data</span>
`;
    note.className = "player-zone-note";
    note.textContent =
        "Select zones to compare them. Team figures include the selected player's shots.";

    // Remember where the user was scrolling.
const previousScrollTop =
    summaryContainer.querySelector(".player-zone-table-scroll")
        ?.scrollTop ?? 0;

    const tableScroll = document.createElement("div");
tableScroll.className = "player-zone-table-scroll";
tableScroll.appendChild(table);

summaryContainer.replaceChildren(
    overall,
    legend,
    clearButton,
    tableScroll,
    note
);

// Keep the table in the same position after selecting a zone.
tableScroll.scrollTop = previousScrollTop;

    document.querySelectorAll("[data-analysis-mode]")
        .forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.analysisMode === mode
            );
        });
}

// Change analysis mode.
document.querySelectorAll("[data-analysis-mode]")
    .forEach(button => {
        button.addEventListener("click", () => {
            playerZoneState.mode = button.dataset.analysisMode;
            playerZoneState.selected.clear();
            renderPlayerZoneAnalysis();
        });
    });

// Filter by quarter.
$('zone-quarter')?.addEventListener("change", () => {
    playerZoneState.selected.clear();
    renderPlayerZoneAnalysis();
});

// Select individual shooting zones.
$('zone-comparison-data')?.addEventListener("click", event => {
    if (event.target.closest(".clear-player-zones")) {
        playerZoneState.selected.clear();
        renderPlayerZoneAnalysis();
        return;
    }

    const row = event.target.closest("[data-player-zone]");
    if (!row) return;

    const key = row.dataset.playerZone;

    if (playerZoneState.selected.has(key)) {
        playerZoneState.selected.delete(key);
    } else {
        playerZoneState.selected.add(key);
    }

    renderPlayerZoneAnalysis();
});

// Refresh the expanded analysis when the thumbnail is clicked.
$('open-player-analysis')?.addEventListener(
    "click",
    renderPlayerZoneAnalysis
);

/* =========================================
   PLAYER SHOOTING ANALYSIS MODAL
   ========================================= */

const analysisModal = $('player-analysis-modal');
const openAnalysis = $('open-player-analysis');
const closeAnalysis = $('close-player-analysis');

if (analysisModal && openAnalysis && closeAnalysis) {

    // Open the expanded analysis
    openAnalysis.addEventListener('click', () => {
        analysisModal.showModal();
    });

    // Close using the X button
    closeAnalysis.addEventListener('click', () => {
        analysisModal.close();
    });

    // Close when clicking outside the modal
    analysisModal.addEventListener('click', event => {
        if (event.target === analysisModal) {
            analysisModal.close();
        }
    });

}


  loadProfile().catch(error => {
    console.error("PLAYER PROFILE ERROR:", error);

    setMessage(
        `Player profile error: ${error.message}`
    );
});

})();