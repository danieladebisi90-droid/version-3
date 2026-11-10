"use strict";

/*
  DATA CONNECTION
  ---------------
  This page looks for localStorage["basketballStatsGames"].
  Expected shape is an array of completed game objects:
  {
    id: "game1", date: "2026-10-20", season: "2026-27",
    team: "Cavaliers", opponent: "Lakers", location: "Home",
    ourScore: 72, opponentScore: 65,
    players: [{id:"14",number:"14",name:"Jalen Carter",min:28,
      pts:24,reb:8,oreb:2,dreb:6,ast:4,stl:2,blk:1,tov:3,pf:2,
      fgm:9,fga:17,threeMade:3,threeAtt:7,ftm:3,fta:4}],
    shots: [{playerId:"14",x:200,y:250,made:true,points:2,team:"us"}],
    quarters: [{us:16,opponent:12},{us:18,opponent:15},...],
    plays: [{period:"Q1",description:"#14 made 2PT shot"}]
  }
  IMPORTANT: Your Game Tracking app may use different localStorage keys and
  fields. Until we map them, this page shows clearly labeled DEMO data.
*/
const STORAGE_KEY = "basketballStatsGames";

const requestedGameId = new URLSearchParams(
    window.location.search
).get("gameId");

let pendingGameLink = requestedGameId;

const $ = id => document.getElementById(id);
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const sum = (arr, key) => arr.reduce((total, row) => total + number(row[key]), 0);
const pct = (made, att) => att ? 100 * made / att : 0;
const fmt = (v, digits = 1) => Number(v).toFixed(digits);
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nameOf = p => p.name || `#${p.number || p.id || '?'}`;

const demoPlayers = [
  ["14","Jalen Carter",24,8,4,2,1,3,2,9,17,3,7,3,4,29],
  ["24","Marcus Lee",18,10,3,1,2,2,3,7,15,2,6,2,3,27],
  ["3","Tyler Brooks",11,5,8,2,0,2,1,4,10,1,4,2,3,25],
  ["1","Damon Ruiz",8,6,3,1,1,1,2,3,8,1,3,1,2,23],
  ["5","Evan Kim",6,5,2,1,1,1,1,2,7,1,3,1,2,21]
];
function makeDemoGame(id, date, opponent, location, ourScore, opponentScore, offset) {
  const players = demoPlayers.map((row, index) => {
    const [number,name,pts,reb,ast,stl,blk,tov,pf,fgm,fga,threeMade,threeAtt,ftm,fta,min] = row;
    const shift = (offset + index) % 3 - 1;
    const fgmNew = Math.max(0, fgm + shift);
    return {id:number,number,name,pts:Math.max(0,pts+shift*2),reb:Math.max(0,reb+shift),oreb:Math.max(0,Math.floor(reb/3)),dreb:Math.max(0,reb-Math.floor(reb/3)),ast:Math.max(0,ast+shift),stl,blk,tov,pf,fgm:fgmNew,fga:fga+Math.max(0,shift),threeMade:Math.min(fgmNew,threeMade),threeAtt,ftm,fta,min};
  });
  const shots = Array.from({length:34}, (_,i) => {
    const player = players[i % players.length];
    const left = i % 2 === 0;
    const x = left ? 30 + (i * 43) % 300 : 910 - (i * 43) % 300;
    const y = 40 + (i * 61) % 420;
    return {playerId:player.id,x,y,made:(i + offset) % 3 !== 0,points:i % 4 === 0 ? 3 : 2,team:'us'};
  });
  return {id,date,season:'2026-27',team:'Cavaliers',opponent,location,ourScore,opponentScore,players,shots,
    quarters:[{us:16+offset,opponent:12},{us:18,opponent:15+offset},{us:19,opponent:17},{us:17,opponent:16}],
    plays:[{period:'Q1',description:'#14 made a field goal'},{period:'Q2',description:'#24 defensive rebound'},{period:'Q3',description:'#3 assist'},{period:'Q4',description:'Game ended'}]};
}
const DEMO_GAMES = [
  makeDemoGame('demo1','2026-10-20','Riverside Raptors','Home',72,65,0),
  makeDemoGame('demo2','2026-10-13','Northview Hawks','Away',53,60,1),
  makeDemoGame('demo3','2026-10-06','Westside Panthers','Home',49,44,2),
  makeDemoGame('demo4','2026-09-29','Central Titans','Home',62,55,0),
  makeDemoGame('demo5','2026-09-22','Forest Wolves','Away',46,51,1),
  makeDemoGame('demo6','2026-09-15','Blue Falcons','Home',58,42,2)
];

function loadGames() {
    // Supabase will provide the games asynchronously.
    // Never fall back to fabricated demo statistics.
    return {
        games: [],
        demo: false
    };
}
function normalizeGame(g,index) {
  const date = String(g.date ?? g.gameDate ?? '');
  const players = (Array.isArray(g.players) ? g.players : []).map(p => ({
    id:String(p.id ?? p.playerId ?? p.number ?? ''),number:String(p.number ?? p.jersey ?? p.id ?? ''),
    name:p.name ?? p.playerName ?? `#${p.number ?? p.id ?? '?'}`,
    ...Object.fromEntries(['min','pts','reb','oreb','dreb','ast','stl','blk','tov','pf','fgm','fga','threeMade','threeAtt','ftm','fta'].map(k=>[k,number(p[k])]))
  }));
  return {id:String(g.id ?? `game-${index}`),date,season:String(g.season ?? date.slice(0,4)),
    team:String(g.team ?? g.teamName ?? 'Our Team'),opponent:String(g.opponent ?? 'Opponent'),
    location:String(g.location ?? 'Home'),ourScore:number(g.ourScore ?? g.teamScore ?? g.score),
    opponentScore:number(g.opponentScore ?? g.awayScore),players,
    shots:Array.isArray(g.shots) ? g.shots : [],quarters:Array.isArray(g.quarters) ? g.quarters : [],
    plays:Array.isArray(g.plays) ? g.plays : []};
}
const loaded = loadGames();
const state = {games:loaded.games,demo:loaded.demo,season:'all',view:'team', unit:'perGame',
  playerGame:'all',search:'',sort:'pts',descending:true,leaderStat:'pts',shotPlayer:'all',shotGame:'all',
  selectedGame:loaded.games[0]?.id ?? null,summary:'box',detail:'box',courtMode:'full',detailTeam:'us',detailPlayer:'all',detailType:'all'};
const filteredGames = () => {
    const seasonId = sessionStorage.getItem("selectedSeasonId");

    if (!seasonId) return [];

    return state.games.filter(game =>
        String(game.season) === seasonId
    );
};


async function loadSupabaseStatistics() {
    const seasonId = sessionStorage.getItem("selectedSeasonId");
  const teamId = sessionStorage.getItem("selectedTeamId");

    if (!seasonId) {
        console.warn("Statistics: No season selected.");
        state.games = [];
        state.selectedGame = null;
        render();
        return;
    }

    if (!teamId || !seasonId) {
    console.warn("Statistics: Team or season not selected.");

    state.games = [];
    state.selectedGame = null;

    render();
    return;
}

    console.log("Loading Statistics from Supabase...");

    // 1. Fetch completed games for the selected season.
    const { data: games, error: gamesError } = await supabaseClient
        .from("games")
        .select("*")
        .eq("team_id", teamId)
        .eq("seasons_id", seasonId)
        .eq("status", "completed")
        .order("date", { ascending: false });

    if (gamesError) {
        console.error("Statistics games error:", gamesError);
        return;
    }

    if (games.length === 0) {
        state.games = [];
        state.selectedGame = null;
        render();
        console.log("No completed games.");
        return;
    }

    const gameIds = games.map(game => game.id);
    const teamIds = [...new Set(
        games.map(game => game.team_id).filter(Boolean)
    )];

    // 2. Fetch recorded events.
    
/* =========================================
   LOAD ALL GAME EVENTS — PAGINATED
   ========================================= */

const events = [];
const pageSize = 500;

for (let offset = 0; ; offset += pageSize) {

    const { data, error } = await supabaseClient
        .from("game_events")
        .select("*")
        .in("game_id", gameIds)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);

    if (error) {
        console.error(
            "Statistics events error:",
            error
        );
        return;
    }

    events.push(...(data || []));

    // We've retrieved the final page.
    if (!data || data.length < pageSize) {
        break;
    }
}

console.log(
    "Total game events loaded:",
    events.length
);

    // 3. Fetch roster details for player names and numbers.
    let roster = [];

    if (teamIds.length > 0) {
        const { data, error } = await supabaseClient
            .from("players")
            .select("id, team_id, first_name, last_name, number")
            .in("team_id", teamIds);

        if (error) {
            console.warn("Could not load player names:", error);
        } else {
            roster = data || [];
        }
    }

    const rosterById = new Map(
        roster.map(player => [String(player.id), player])
    );

    const createPlayer = id => {
        const rosterPlayer = rosterById.get(String(id));

        return {
            id: String(id),
            number: rosterPlayer?.number ?? "",
            name: rosterPlayer
                ? `${rosterPlayer.first_name ?? ""} ${rosterPlayer.last_name ?? ""}`.trim()
                : "Unassigned",
            min: 0,
            pts: 0,
            reb: 0,
            oreb: 0,
            dreb: 0,
            ast: 0,
            stl: 0,
            blk: 0,
            tov: 0,
            pf: 0,
            fgm: 0,
            fga: 0,
            threeMade: 0,
            threeAtt: 0,
            ftm: 0,
            fta: 0
        };
    };

    // 4. Transform Supabase games into the existing
    // Statistics data structure.
    const loadedGames = games.map(game => {
        const gameEvents = events.filter(
            event => String(event.game_id) === String(game.id)
        );

        const playerMap = new Map();

        roster
            .filter(player => String(player.team_id) === String(game.team_id))
            .forEach(player => {
                playerMap.set(
                    String(player.id),
                    createPlayer(player.id)
                );
            });

        const quarters = [];

        const maxPeriod = Math.max(
            4,
            ...gameEvents.map(event => Number(event.period) || 1)
        );

        for (let period = 1; period <= maxPeriod; period++) {
            quarters.push({ us: 0, opponent: 0 });
        }

        const shots = [];

        const plays = [];

        gameEvents.forEach(event => {
            const team = String(event.team ?? "").toLowerCase();
            const isOurs = ["us", "our", "ours"].includes(team);

            const type = event.type;
            const made = event.made === true;
            const points = Number(event.points) || 0;
            const period = Number(event.period) || 1;

            if (type === "shot") {
                shots.push({
                    id: event.id,
                    game_id: game.id,
                    playerId: event.player_id,
                    x: event.x,
                    y: event.y,
                    made,
                    points,
                    team: isOurs ? "us" : "opponent",
                    period,
                    distanceMeters: event.distance_meters,
                    distanceFeet: event.distance_feet
                });
            }

            if (
                isOurs &&
                event.player_id != null &&
                !playerMap.has(String(event.player_id))
            ) {
                playerMap.set(
                    String(event.player_id),
                    createPlayer(event.player_id)
                );
            }

            const player = isOurs && event.player_id != null
                ? playerMap.get(String(event.player_id))
                : null;

            if (player) {
                switch (type) {
                    case "shot":
                        player.fga++;

                        if (points === 3) {
                            player.threeAtt++;
                        }

                        if (made) {
                            player.fgm++;
                            player.pts += points;

                            if (points === 3) {
                                player.threeMade++;
                            }
                        }
                        break;

                    case "free_throw":
                        player.fta++;

                        if (made) {
                            player.ftm++;
                            player.pts++;
                        }
                        break;

                    case "offensive_rebound":
                        player.oreb++;
                        player.reb++;
                        break;

                    case "defensive_rebound":
                        player.dreb++;
                        player.reb++;
                        break;

                    case "assist":
                        player.ast++;
                        break;

                    case "steal":
                        player.stl++;
                        break;

                    case "block":
                        player.blk++;
                        break;

                    case "turnover":
                        player.tov++;
                        break;

                    case "foul":
                        player.pf++;
                        break;
                }
            }

            // Calculate points scored in each period.
            if (period >= 1 && period <= quarters.length) {
                const score = made === false ? 0 : points;

                if (
                    type === "shot" ||
                    type === "free_throw" ||
                    type === "opponent_score"
                ) {
                    if (isOurs) {
                        quarters[period - 1].us += score;
                    } else if (team === "opponent") {
                        quarters[period - 1].opponent += score;
                    }
                }
            }

            const periodLabel = period <= 4
                ? `Q${period}`
                : `OT${period - 4}`;

            let description = type.replaceAll("_", " ");

            if (type === "shot") {
                description = `${made ? "Made" : "Missed"} ${points}PT shot`;
            } else if (type === "free_throw") {
                description = `${made ? "Made" : "Missed"} free throw`;
            } else if (type === "game_end") {
                description = "Game finalized";
            }

            plays.push({
                period: periodLabel,
                description: `${team ? team.toUpperCase() + " — " : ""}${description}`
            });
        });

        return {
            id: String(game.id),
            date: String(game.date ?? "").slice(0, 10),
            season: String(game.seasons_id),
            team: "Our Team",
            opponent: game.opponent ?? "Opponent",
            location: game.location ?? "Home",
            ourScore: Number(game.team_score) || 0,
            opponentScore: Number(game.opponent_score) || 0,
            players: [...playerMap.values()],
            shots,
            quarters,
            plays
        };
    });

    // 5. Ignore responses from a season that is
    // no longer selected.
    if (sessionStorage.getItem("selectedSeasonId") !== seasonId) {
        return;
    }

    // 6. Replace old local/demo data.
   
// 6. Replace old local/demo data.
state.games = loadedGames;
state.demo = false;

console.table(
    state.games.map(game => ({
        opponent: game.opponent,
        gameId: game.id,
        players: game.players.length,
        shots: game.shots.length,
        pointsRecorded: game.players.reduce(
            (sum, player) => sum + player.pts,
            0
        )
    }))
);

// Check whether Game Hub requested a specific game.
if (pendingGameLink) {
    const requestedGame = state.games.find(
        game => String(game.id) === String(pendingGameLink)
    );

   
if (requestedGame) {
    // Select the exact game from Game Hub
    state.selectedGame = requestedGame.id;

    // Open the FULL Game Details view
    state.view = "details";

    // Display its box score immediately
    state.detail = "box";

    pendingGameLink = null;
}
 else {
        console.warn(
            "Requested game was not found in this season:",
            pendingGameLink
        );

        const notice = document.getElementById("data-notice");

        if (notice) {
            notice.hidden = false;
            notice.textContent =
                "The requested game is not available in the selected season.";
        }

        pendingGameLink = null;
    }
}

// Default to the latest game only when necessary.
if (!state.games.some(game => game.id === state.selectedGame)) {
    state.selectedGame = state.games[0]?.id ?? null;
}


    // 7. Refresh game selectors and Statistics.
    fillGameOptions("player-game-filter");
    fillGameOptions("shot-game-filter");

    setView(state.view);

    console.log("Statistics loaded from Supabase:", {
        games: state.games.length,
        events: events.length,
        shots: state.games.reduce(
            (total, game) => total + game.shots.length,
            0
        )
    });
}


const selectedGame = () => filteredGames().find(g=>g.id===state.selectedGame) ?? filteredGames()[0];
const gamesForPlayers = () => filteredGames().filter(g => state.playerGame==='all' || g.id===state.playerGame);
function aggregatePlayers(games) {
  const map = new Map();
  const fields=['min','pts','reb','oreb','dreb','ast','stl','blk','tov','pf','fgm','fga','threeMade','threeAtt','ftm','fta'];
  for (const game of games) for (const player of game.players) {
    const id=String(player.id ?? player.number);
    if(!map.has(id)) map.set(id,{id,number:player.number,name:player.name,gp:0,...Object.fromEntries(fields.map(k=>[k,0]))});
    const row=map.get(id);row.gp++;
    for(const field of fields) row[field]+=number(player[field]);
  }
  return [...map.values()];
}
function teamTotals(games) {
  const players=games.flatMap(g=>g.players), shots=games.flatMap(g=>g.shots);
  return {gp:games.length,pts:games.reduce((v,g)=>v+g.ourScore,0),allowed:games.reduce((v,g)=>v+g.opponentScore,0),
    reb:sum(players,'reb'),oreb:sum(players,'oreb'),dreb:sum(players,'dreb'),ast:sum(players,'ast'),
    stl:sum(players,'stl'),blk:sum(players,'blk'),tov:sum(players,'tov'),pf:sum(players,'pf'),
    fgm:sum(players,'fgm'),fga:sum(players,'fga'),threeMade:sum(players,'threeMade'),
    threeAtt:sum(players,'threeAtt'),ftm:sum(players,'ftm'),fta:sum(players,'fta'),shots};
}

function setView(view) {
    state.view = view;

    // Show the selected statistics view
    document.querySelectorAll(".view").forEach(el => {
        el.classList.toggle(
            "active",
            el.id === `${view}-view`
        );
    });
    // Highlight the selected tab
    document.querySelectorAll(".main-tabs button").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.view === view
        );
    });
    // Update page title only if the element exists
    const pageTitle = $("page-title");
    if (pageTitle) {
        pageTitle.textContent =
            view === "details"
                ? "GAME DETAILS"
                : "STATISTICS";
    }
    render();
}

function renderTeam() {
  const games=filteredGames(), t=teamTotals(games), players=aggregatePlayers(games), gp=t.gp||1;
  const overview=[['PPG',fmt(t.pts/gp)],['FG%',fmt(pct(t.fgm,t.fga))+'%'],['3P%',fmt(pct(t.threeMade,t.threeAtt))+'%'],['FT%',fmt(pct(t.ftm,t.fta))+'%'],['RPG',fmt(t.reb/gp)],['APG',fmt(t.ast/gp)],['SPG',fmt(t.stl/gp)],['BPG',fmt(t.blk/gp)]];
  $('overview-cards').innerHTML=overview.map(([label,val])=>`<div class="metric"><span class="metric-label">${label}</span><div class="metric-value">${val}</div></div>`).join('');
  const rows=[['Points','pts'],['Field Goals Made','fgm'],['Field Goals Attempted','fga'],['Field Goal %','fgpct'],['3-Point Field Goals Made','threeMade'],['3-Point Field Goals Attempted','threeAtt'],['3-Point Percentage','threepct'],['Free Throws Made','ftm'],['Free Throws Attempted','fta'],['Free Throw Percentage','ftpct'],['Rebounds','reb'],['Offensive Rebounds','oreb'],['Defensive Rebounds','dreb'],['Assists','ast'],['Steals','stl'],['Blocks','blk'],['Turnovers','tov'],['Personal Fouls','pf'],['Points Allowed','allowed']];
  $('team-value-heading').textContent='TOTAL';
  $('team-stats-body').innerHTML=rows.map(([label,k])=>{
    const percent=k.endsWith('pct');
    const v=k==='fgpct'?pct(t.fgm,t.fga):k==='threepct'?pct(t.threeMade,t.threeAtt):k==='ftpct'?pct(t.ftm,t.fta):t[k];
    const left=percent?fmt(v)+'%':v;
    const right=percent?'—':fmt(v/gp);
    return `<tr><td>${label}</td><td><strong>${left}</strong></td><td>${right}</td></tr>`;
  }).join('');

  const q=[0,1,2,3].map(i=>({us:games.reduce((v,g)=>v+number(g.quarters[i]?.us),0)/gp,op:games.reduce((v,g)=>v+number(g.quarters[i]?.opponent),0)/gp}));
  const max=Math.max(1,...q.flatMap(x=>[x.us,x.op]));
  $('quarter-chart').innerHTML=q.map((x,i)=>`<div class="quarter-group"><div class="bars"><div class="bar" style="height:${x.us/max*95}%"><span>${fmt(x.us)}</span></div><div class="bar opponent" style="height:${x.op/max*95}%"><span>${fmt(x.op)}</span></div></div><span class="quarter-label">Q${i+1}</span></div>`).join('');
      // Display the team shooting zones and shot spots
  renderTeamShotProfile();
}
function fillGameOptions(id, allText='All Games') {
  const select=$(id),old=select.value;
  select.innerHTML=`<option value="all">${allText}</option>`+filteredGames().map(g=>`<option value="${escapeHTML(g.id)}">${escapeHTML(g.date)} · ${escapeHTML(g.opponent)}</option>`).join('');
  select.value=[...select.options].some(x=>x.value===old)?old:'all';
}
function renderPlayerTable() {
  let players=aggregatePlayers(gamesForPlayers());
  const query=state.search.toLowerCase().trim();
  players=players.filter(p=>p.name.toLowerCase().includes(query)||String(p.number).includes(query));
  const value=(p,k)=>{
    if(k==='name') return p.name.toLowerCase();
    if(k==='gp') return p.gp;
    if(k==='fg') return pct(p.fgm,p.fga);
    if(k==='three') return pct(p.threeMade,p.threeAtt);
    if(k==='ft') return pct(p.ftm,p.fta);
    return p[k]/(state.unit==='perGame' ? Math.max(1,p.gp):1);
  };
  players.sort((a,b)=>{
    const av=value(a,state.sort),bv=value(b,state.sort);
    const compare=typeof av==='string'?av.localeCompare(bv):av-bv;
    return state.descending?-compare:compare;
  });
  $('players-body').innerHTML=players.map(p=>`<tr><td>${escapeHTML(p.number)}</td><td>${escapeHTML(p.name)}</td><td>${p.gp}</td><td>${fmt(value(p,'min'))}</td><td>${fmt(value(p,'pts'))}</td><td>${fmt(value(p,'fg'))}%</td><td>${fmt(value(p,'three'))}%</td><td>${fmt(value(p,'ft'))}%</td><td>${fmt(value(p,'reb'))}</td><td>${fmt(value(p,'ast'))}</td><td>${fmt(value(p,'stl'))}</td><td>${fmt(value(p,'blk'))}</td><td>${fmt(value(p,'tov'))}</td><td>${fmt(value(p,'pf'))}</td></tr>`).join('')||'<tr><td colspan="14" class="empty">No player data available</td></tr>';
  document.querySelectorAll('#leader-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.stat===state.leaderStat));
  const leaders=[...aggregatePlayers(filteredGames())].sort((a,b)=>b[state.leaderStat]/b.gp-a[state.leaderStat]/a.gp).slice(0,5);
  $('player-leaders-list').innerHTML=leaders.map((p,i)=>`<div class="leader-line"><span>${i+1}. #${escapeHTML(p.number)} ${escapeHTML(nameOf(p))}</span><strong>${fmt(p[state.leaderStat]/p.gp)}</strong></div>`).join('')||'<div class="empty">No players yet</div>';
  const all=aggregatePlayers(filteredGames());
  const old=$('shot-player-filter').value;
  $('shot-player-filter').innerHTML='<option value="all">All Players</option>'+all.map(p=>`<option value="${escapeHTML(p.id)}">#${escapeHTML(p.number)} ${escapeHTML(p.name)}</option>`).join('');
  $('shot-player-filter').value=all.some(p=>p.id===old)?old:'all';
  renderPlayerShots();
}
function shotsFor(games, playerId='all', team='us', type='all') {
  return games.flatMap(g=>g.shots).filter(s=>{
    const shotTeam=String(s.team ?? 'us').toLowerCase();
    const ours=['us','our','ours','home'].includes(shotTeam);
    const includeTeam=team==='all'||(team==='us'?ours:!ours);
    return includeTeam && (playerId==='all'||String(s.playerId)===String(playerId)) && (type==='all'||String(s.points)===type);
  });
}

// FIBA court dimensions used by Game Tracking
const STATS_COURT = {
    fullWidth: 860,
    fullHeight: 470,
    halfWidth: 470,
    halfHeight: 440,
    centerX: 430,
    scale: 30
};


function courtSVG(shots, mode = "full") {

    const isHalf = mode === "half";

    // Convert shot locations for the selected view
    const dots = shots.map(shot => {

        if (
            shot.x == null ||
            shot.y == null ||
            !Number.isFinite(Number(shot.x)) ||
            !Number.isFinite(Number(shot.y))
        ) return "";

        let x = Number(shot.x);
        let y = Number(shot.y);

        if (isHalf) {
            const left = x < STATS_COURT.centerX;

            // Rotate either half into a vertical court
            const halfX = left ? 470 - y : y;
            const halfY = left ? x : 860 - x;

            x = halfX;
            y = halfY;

            if (
                x < 10 || x > 460 ||
                y < 10 || y > 430
            ) return "";
        }

        if (shot.made) {
            return `<circle cx="${x}" cy="${y}" r="6.8"
                    fill="#15964c"/>`;
        }

        return `<path
            d="M${x-7} ${y-7} L${x+7} ${y+7}
               M${x+7} ${y-7} L${x-7} ${y+7}"
            fill="none"
            stroke="#df3138"
            stroke-width="3.4"
            stroke-linecap="round"/>`;

    }).join("");

    if (isHalf) {
        return `
        <svg class="court-svg" viewBox="0 0 470 440"
             role="img" aria-label="FIBA half court shot chart">

            <rect x="1.5" y="1.5" width="467" height="437"
                  fill="#B98556" stroke="#A67245" stroke-width="3"/>

            <rect x="10" y="10" width="450" height="420"
                  fill="none" stroke="white" stroke-width="3"/>

            <line x1="208" y1="46" x2="262" y2="46"
                  stroke="white" stroke-width="4"/>

            <circle cx="235" cy="57.25" r="7"
                    fill="none" stroke="white" stroke-width="3"/>

            <rect x="161.5" y="10" width="147" height="174"
                  fill="none" stroke="white" stroke-width="3"/>

            <circle cx="235" cy="184" r="54"
                    fill="none" stroke="white" stroke-width="3"/>

            <path d="M37 10 V99.69
                     A202.5 202.5 0 0 0 433 99.69 V10"
                  fill="none" stroke="white" stroke-width="3"/>

            <path d="M197.5 57.25
                     A37.5 37.5 0 0 0 272.5 57.25"
                  fill="none" stroke="white" stroke-width="3"/>

            ${dots}
        </svg>`;
    }

    return `
    <svg class="court-svg" viewBox="0 0 860 470"
         role="img" aria-label="FIBA full court shot chart">

        <rect x="1.5" y="1.5" width="857" height="467"
              fill="#D2A06D" stroke="#B98556" stroke-width="3"/>

        <rect x="10" y="10" width="840" height="450"
              fill="none" stroke="white" stroke-width="3"/>

        <line x1="430" y1="10" x2="430" y2="460"
              stroke="white" stroke-width="3"/>

        <circle cx="430" cy="235" r="54"
                fill="none" stroke="white" stroke-width="3"/>

        <path d="M10 161.5 H184 V308.5 H10
                 M850 161.5 H676 V308.5 H850"
              fill="none" stroke="white" stroke-width="3"/>

        <circle cx="184" cy="235" r="54"
                fill="none" stroke="white" stroke-width="3"/>

        <circle cx="676" cy="235" r="54"
                fill="none" stroke="white" stroke-width="3"/>

        <path d="M10 37 H99.69
                 A202.5 202.5 0 0 1 99.69 433 H10
                 M850 37 H760.31
                 A202.5 202.5 0 0 0 760.31 433 H850"
              fill="none" stroke="white" stroke-width="3"/>

        <line x1="46" y1="208" x2="46" y2="262"
              stroke="white" stroke-width="4"/>

        <line x1="814" y1="208" x2="814" y2="262"
              stroke="white" stroke-width="4"/>

        <circle cx="57.25" cy="235" r="7"
                fill="none" stroke="white" stroke-width="3"/>

        <circle cx="802.75" cy="235" r="7"
        fill="none" stroke="white" stroke-width="3"/>

<!-- LEFT NO-CHARGE SEMICIRCLE -->
<path d="M57.25 272.5
         A37.5 37.5 0 0 0 57.25 197.5"
      fill="none" stroke="white" stroke-width="3"/>

<!-- RIGHT NO-CHARGE SEMICIRCLE -->
<path d="M802.75 272.5
         A37.5 37.5 0 0 1 802.75 197.5"
      fill="none" stroke="white" stroke-width="3"/>

${dots}

        ${dots}
    </svg>`;
}

function renderPlayerShots() {
  const games=filteredGames().filter(g=>$('shot-game-filter').value==='all'||g.id===$('shot-game-filter').value);
  const shots=shotsFor(games,$('shot-player-filter').value);
  $('player-shot-court').innerHTML=courtSVG(shots,'full');
  // Zones are approximate display-space bins until actual shot zone definitions are mapped.
  const zones=Array.from({length:6},()=>({m:0,a:0}));
  for(const s of shots){const x=Math.max(0,Math.min(939,number(s.x)));const y=Math.max(0,Math.min(499,number(s.y)));const index=(y<250?0:3)+Math.min(2,Math.floor(x/314));zones[index].a++;if(s.made)zones[index].m++;}
  $('player-zones').innerHTML=zones.map((z,i)=>`<div class="zone"><small>Zone ${i+1}</small><strong>${fmt(pct(z.m,z.a),0)}%</strong><small>${z.m}/${z.a}</small></div>`).join('');
}
function scoreHTML(g) {
  if(!g)return '<div class="empty">No games selected</div>';
  const abbr=name=>name.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();
  return `<div class="score-side"><div class="team-badge">${escapeHTML(abbr(g.team))}</div><strong>${escapeHTML(g.team)}</strong></div><div><div class="score">${g.ourScore} – ${g.opponentScore}</div><div class="score-label">FINAL · ${escapeHTML(g.date)}</div></div><div class="score-side"><div class="team-badge">${escapeHTML(abbr(g.opponent))}</div><strong>${escapeHTML(g.opponent)}</strong></div>`;
}
function boxHTML(g) {
  if(!g)return '<div class="empty">No game</div>';
  return `<div class="table-scroll"><table><thead><tr><th>#</th><th>PLAYER</th><th>MIN</th><th>PTS</th><th>FG</th><th>3PT</th><th>FT</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>PF</th></tr></thead><tbody>${g.players.map(p=>`<tr><td>${escapeHTML(p.number)}</td><td>${escapeHTML(nameOf(p))}</td><td>${p.min}</td><td>${p.pts}</td><td>${p.fgm}-${p.fga}</td><td>${p.threeMade}-${p.threeAtt}</td><td>${p.ftm}-${p.fta}</td><td>${p.reb}</td><td>${p.ast}</td><td>${p.stl}</td><td>${p.blk}</td><td>${p.tov}</td><td>${p.pf}</td></tr>`).join('')||'<tr><td colspan="13">No player statistics saved</td></tr>'}</tbody></table></div>`;
}
function shootingHTML(g) {
  if(!g)return '';
  const t=teamTotals([g]);
  return `<div class="ring-grid">${[['FG%',t.fgm,t.fga,'#e9ac47'],['3PT%',t.threeMade,t.threeAtt,'#2678e8'],['FT%',t.ftm,t.fta,'#2aa452']].map(([k,m,a,color])=>`<div class="ring-item"><div class="ring" style="background:conic-gradient(${color} ${pct(m,a)}%,#e5eaf0 ${pct(m,a)}%)"><strong>${fmt(pct(m,a))}%</strong></div><b>${k}</b><small>${m}/${a}</small></div>`).join('')}</div>`;
}
function playsHTML(g){return `<ul class="play-list">${(g?.plays||[]).map(p=>`<li><strong>${escapeHTML(p.period??'')}</strong> ${escapeHTML(p.description??'')}</li>`).join('')||'<li>No play-by-play recorded</li>'}</ul>`;}
function compareHTML(g){if(!g)return '';const t=teamTotals([g]);return [['Points',g.ourScore,g.opponentScore],['Rebounds',t.reb,0],['Assists',t.ast,0],['Steals',t.stl,0],['Blocks',t.blk,0]].map(([label,us,opp],i)=>`<div class="comparison"><div class="values"><strong>${label}: ${us}</strong><span>${i===0?opp:'Opponent not tracked'}</span></div><div class="compare-track"><div class="compare-fill" style="width:${i===0?pct(us,us+opp):100}%"></div></div></div>`).join('');}
function summaryHTML(g,mode){if(mode==='shooting')return shootingHTML(g);if(mode==='plays')return playsHTML(g);if(mode==='compare')return compareHTML(g);return boxHTML(g);}
function renderGames(){
  const games=filteredGames().slice().sort((a,b)=>b.date.localeCompare(a.date));
  $('game-count').textContent=`${games.length} games`;
  if(!games.some(g=>g.id===state.selectedGame)) state.selectedGame=games[0]?.id ?? null;
  $('games-body').innerHTML=games.map(g=>`<tr data-game-id="${escapeHTML(g.id)}" class="${g.id===state.selectedGame?'selected':''}"><td>${escapeHTML(g.date)}</td><td>${escapeHTML(g.opponent)}</td><td>${escapeHTML(g.location)}</td><td><span class="${g.ourScore>g.opponentScore?'win':'loss'}">${g.ourScore>g.opponentScore?'W':g.ourScore<g.opponentScore?'L':'T'}</span></td><td>${g.ourScore} - ${g.opponentScore}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No games available</td></tr>';
  const g=selectedGame();$('selected-game-date').textContent=g?.date??'';$('game-score').innerHTML=scoreHTML(g);
  document.querySelectorAll('[data-summary]').forEach(b=>b.classList.toggle('active',b.dataset.summary===state.summary));
  $('game-summary-content').innerHTML=summaryHTML(g,state.summary);
  $('open-game-details').disabled=!g;
}
function renderDetails(){
  const g=selectedGame();$('detail-score').innerHTML=scoreHTML(g);
  document.querySelectorAll('[data-detail]').forEach(b=>b.classList.toggle('active',b.dataset.detail===state.detail));
  if(!g){$('detail-content').innerHTML='<div class="empty">No game selected</div>';return;}
  if(state.detail!=='shooting'){$('detail-content').innerHTML=`<div class="details-table">${summaryHTML(g,state.detail)}</div>`;return;}
  const players=[...g.players];
  const filterSelect=(id,opts,value)=>`<select id="${id}">${opts.map(([v,label])=>`<option value="${escapeHTML(v)}" ${v===value?'selected':''}>${escapeHTML(label)}</option>`).join('')}</select>`;
  const teamFilter=filterSelect('detail-team-select',[['us',g.team],['opponent',g.opponent],['all','Both Teams']],state.detailTeam);
  const playerFilter=filterSelect('detail-player-select',[['all','All Players'],...players.map(p=>[p.id,`#${p.number} ${p.name}`])],state.detailPlayer);
  const typeFilter=filterSelect('detail-type-select',[['all','All Shots'],['2','2-Point'],['3','3-Point']],state.detailType);
  const shots=shotsFor([g],state.detailPlayer,state.detailTeam,state.detailType);
  const made=shots.filter(s=>s.made).length;
  $('detail-content').innerHTML=`<div class="detail-layout"><article class="panel"><h2>FILTER SHOTS</h2><label>Team</label>${teamFilter}<label>Player</label>${playerFilter}<label>Shot Type</label>${typeFilter}<h2>SHOOTING SUMMARY</h2><div class="detail-metric"><span>Shots</span><strong>${shots.length}</strong></div><div class="detail-metric"><span>Made</span><strong>${made}</strong></div><div class="detail-metric"><span>FG%</span><strong>${fmt(pct(made,shots.length))}%</strong></div></article><article class="panel"><div class="panel-heading"><h2>SHOT CHART</h2><div><button class="inline-btn ${state.courtMode==='full'?'active':''}" data-court="full">Full Court</button> <button class="inline-btn ${state.courtMode==='half'?'active':''}" data-court="half">Half Court</button></div></div>${courtSVG(shots,state.courtMode)}<div class="shot-legend"><span class="made-marker">●</span> Made <span class="miss-marker">✕</span> Missed</div></article><article class="panel"><h2>SHOT BREAKDOWN</h2>${shootingHTML(g)}<h2 style="margin-top:20px">SHOT TYPES</h2>${[[2,'2PT'],[3,'3PT']].map(([points,label])=>{const subset=shots.filter(s=>number(s.points)===points);return `<div class="detail-metric"><span>${label}</span><strong>${subset.filter(s=>s.made).length}/${subset.length}</strong></div>`;}).join('')}</article></div>`;
}
function render(){if(state.view==='team')renderTeam();if(state.view==='players')renderPlayerTable();if(state.view==='games')renderGames();if(state.view==='details')renderDetails();}


/* =========================================
   GET TEAM SHOTS
   ========================================= */

function getTeamShots(team = "us") {

    return filteredGames().flatMap(game => {

        return (game.shots || []).filter(shot => {

            const shotTeam = String(
                shot.team ?? "us"
            ).toLowerCase();

            if (team === "us") {
                return ["us", "our", "ours"].includes(shotTeam);
            }

            return ["opponent", "away", "them"].includes(shotTeam);

        });

    });
}


/* =========================================
   BUILD HALF-COURT ZONE CHART
   ========================================= */



function buildZoneCourt(shots, mode = "offence", showSummary = false) {

    const zones = {
        rim:         { label: "RIM", x: 250, y: 65 },
        paint:       { label: "PAINT", x: 250, y: 150 },
        leftShort:   { label: "L SHORT", x: 107, y: 95 },
        rightShort:  { label: "R SHORT", x: 393, y: 95 },
        leftMid:     { label: "L MID", x: 125, y: 215 },
        rightMid:    { label: "R MID", x: 375, y: 215 },
        leftCorner:  { label: "LC3", x: 32, y: 50 },
        rightCorner: { label: "RC3", x: 468, y: 50 },
        leftWing:    { label: "LW3", x: 85, y: 340 },
        rightWing:   { label: "RW3", x: 415, y: 340 },
        topThree:    { label: "TOP 3", x: 250, y: 390 }
    };

    Object.values(zones).forEach(zone => {
        zone.made = 0;
        zone.attempts = 0;
    });

    function identifyZone(x, y) {
        if (y <= 90 && x < 55) return "leftCorner";
        if (y <= 90 && x > 445) return "rightCorner";

        const arcDistance = Math.hypot(x - 250, y - 90);

        if (y > 90 && arcDistance > 195) {
            if (x < 175) return "leftWing";
            if (x > 325) return "rightWing";
            return "topThree";
        }

        if (Math.hypot(x - 250, y - 40) <= 48) {
            return "rim";
        }

        if (x >= 170 && x <= 330 && y <= 180) {
            return "paint";
        }

        if (x < 170 && y < 145) return "leftShort";
        if (x > 330 && y < 145) return "rightShort";

        return x < 250 ? "leftMid" : "rightMid";
    }

    // Calculate shooting statistics.
    shots.forEach(shot => {
        const x = Number(shot.x);
        const y = Number(shot.y);

        if (!Number.isFinite(x) || !Number.isFinite(y)) return;

        // Convert FIBA full-court coordinates to half-court coordinates
        const left = x < STATS_COURT.centerX;
        const halfX = left ? 470 - y : y;
        const halfY = left ? x : 860 - x;

        if (
            halfX < 10 || halfX > 460 ||
            halfY < 10 || halfY > 430
        ) return;

        const zone = zones[identifyZone(halfX, halfY)];

        zone.attempts++;

        if (shot.made === true) zone.made++;
    });

    // Each zone is highlighted separately.
    // No performance grading on Team Stats.
    const zoneFill = "#72AED2";
    const zoneOpacity = 0.32;

    // Build court shapes.
    // The 3-point areas are drawn first.
    // The curved 2-point area overlays them.
    // This creates solid shapes without horizontal strips.
    const highlights = `
        <defs>
            <clipPath id="zone-inner-court">
                <path d="
                    M 55 10
                    V 90
                    A 195 195 0 0 0 445 90
                    V 10
                    Z
                "/>
            </clipPath>

            <clipPath id="zone-rim-area">
                <circle cx="250" cy="40" r="48"/>
            </clipPath>
        </defs>

        <g fill="${zoneFill}"
           fill-opacity="${zoneOpacity}"
           stroke="white"
           stroke-width="2.5">

            <!-- LEFT CORNER THREE -->
            <rect x="10" y="10"
                  width="45" height="110"/>

            <!-- RIGHT CORNER THREE -->
            <rect x="445" y="10"
                  width="45" height="110"/>

            <!-- LEFT WING THREE -->
            <path d="M10 120 H160 V460 H10 Z"/>

            <!-- TOP THREE -->
            <path d="M160 90 H340 V460 H160 Z"/>

            <!-- RIGHT WING THREE -->
            <path d="M341 120 H490 V460 H340 Z"/>

        </g>

        <!-- INSIDE THE THREE-POINT ARC -->
        <g clip-path="url(#zone-inner-court)">

            <!-- Underlying 2-point area -->
            <path d="
                M55 10 V90
                A195 195 0 0 0 445 90
                V10 Z
            " fill="#D2A06D"/>

            <g fill="${zoneFill}"
               fill-opacity="${zoneOpacity}"
               stroke="white"
               stroke-width="3">

               <!-- LEFT short corner -->


                <!-- LEFT SHORT CORNER -->
                <rect x="55" y="10"
                      width="115" height="135"/>

                <!-- RIGHT SHORT CORNER -->
                <rect x="330" y="10"
                      width="115" height="135"/>

                <path
  id="left-side-zone"
  d="
    M 55 90
    A 195 195 0 0 0 165 205
    L 205 180
    Q 135 145 105 90
    Z
  "
  fill="#b7ae97"
  stroke="#286C9C"
  stroke-width="2"
/>

                

                <!-- PAINT -->
                <rect x="170" y="10"
                      width="160" height="170"/>

                <!-- RESTRICTED AREA -->
                <circle cx="250" cy="40" r="48"
                        fill="#93C5E1"
                        fill-opacity="0.62"/>

            </g>
        </g>

        <!-- VISIBLE THREE-POINT ARC BOUNDARY -->
        <path d="
            M55 10 V90
            A195 195 0 0 0 445 90
            V10
        " fill="none" stroke="#286C9C"
          stroke-width="2.5"/>
    `;

    // Draw the hardwood base and the actual court lines.
    let court = courtSVG([], "half");

    // Add the zone shapes directly after the hardwood rectangle.
    // Keep the white basketball lines above the highlights.
    court = court.replace(
        /(<rect x="10" y="10" width="480" height="450"[^>]*\/>)/,
        `$1${highlights}`
    );

    const labels = Object.values(zones).map(zone => {
        const fg = zone.attempts
            ? Math.round(zone.made / zone.attempts * 100) + "%"
            : "—";

        return `
            <g pointer-events="none">
                <rect
                    x="${zone.x - 29}"
                    y="${zone.y - 24}"
                    width="58"
                    height="46"
                    rx="5"
                    fill="#FFFFFF"
                    fill-opacity="0.92"
                />

                <text x="${zone.x}" y="${zone.y - 10}"
                    text-anchor="middle"
                    font-size="10"
                    font-weight="700"
                    fill="#173D79">
                    ${zone.label}
                </text>

                <text x="${zone.x}" y="${zone.y + 5}"
                    text-anchor="middle"
                    font-size="15"
                    font-weight="800"
                    fill="#173D79">
                    ${fg}
                </text>

                <text x="${zone.x}" y="${zone.y + 17}"
                    text-anchor="middle"
                    font-size="10"
                    fill="#4B5563">
                    ${zone.made}/${zone.attempts}
                </text>
            </g>
        `;
    }).join("");

    // Small previews have no text.
    // Expanded courts include all the zone statistics.
    court = court.replace(
        "</svg>",
        `${showSummary ? labels : ""}</svg>`
    );

    if (!showSummary) return court;

    const rows = Object.values(zones).map(zone => {
        const fg = zone.attempts
            ? (zone.made / zone.attempts * 100).toFixed(1) + "%"
            : "—";

        return `
            <tr>
                <td>${zone.label}</td>
                <td>${fg}</td>
                <td>${zone.made}/${zone.attempts}</td>
            </tr>
        `;
    }).join("");

    return {
        svg: court,
        table: `
            <table class="zone-summary">
                <thead>
                    <tr>
                        <th>ZONE</th>
                        <th>FG%</th>
                        <th>MAKES/ATT</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `
    };
}

function addZonePreviewLettering(svg, label) {
    const lettering = `
        <text
    x="235"
    y="350"
    text-anchor="middle"
    dominant-baseline="middle"
    font-size="48"
    font-weight="900"
    letter-spacing="3"
    fill="#654321"
    fill-opacity="0.65"
    pointer-events="none"
>
    ${label}
</text>
    `;

    return svg.replace("</svg>", `${lettering}</svg>`);
}

function renderTeamShotProfile() {

    const offensiveShots = getTeamShots("us");
    const defensiveShots = getTeamShots("opponent");

    // Full court showing all our shot locations
    $("team-shot-court").innerHTML =
        courtSVG(offensiveShots, "full");

    // Offensive efficiency zones
    $("offensive-zone-court").innerHTML =
    addZonePreviewLettering(
        buildZoneCourt(offensiveShots, "offence"),
        "OFFENCE"
    );

    // Defensive opponent shooting zones
    $("defensive-zone-court").innerHTML =
    addZonePreviewLettering(
        buildZoneCourt(defensiveShots, "defence"),
        "DEFENCE"
    );
}


function init(){
  fillGameOptions('player-game-filter');fillGameOptions('shot-game-filter');
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $('player-game-filter').addEventListener('change',e=>{state.playerGame=e.target.value;renderPlayerTable();});
  $('player-unit-filter').addEventListener('change',e=>{state.unit=e.target.value;renderPlayerTable();});
  $('player-search').addEventListener('input',e=>{state.search=e.target.value;renderPlayerTable();});
  document.querySelectorAll('[data-sort]').forEach(th=>th.addEventListener('click',()=>{if(state.sort===th.dataset.sort)state.descending=!state.descending;else{state.sort=th.dataset.sort;state.descending=true;}renderPlayerTable();}));
  document.querySelectorAll('[data-stat]').forEach(b=>b.addEventListener('click',()=>{state.leaderStat=b.dataset.stat;renderPlayerTable();}));
  $('shot-player-filter').addEventListener('change',renderPlayerShots);
  $('shot-game-filter').addEventListener('change',renderPlayerShots);
  $('games-body').addEventListener('click',e=>{const row=e.target.closest('[data-game-id]');if(!row)return;state.selectedGame=row.dataset.gameId;renderGames();});
  document.querySelectorAll('[data-summary]').forEach(b=>b.addEventListener('click',()=>{state.summary=b.dataset.summary;renderGames();}));
  $('open-game-details').addEventListener('click',()=>{state.detail='box';setView('details');});
  $('back-to-games').addEventListener('click',()=>setView('games'));
  document.querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>{state.detail=b.dataset.detail;renderDetails();}));
  $('detail-content').addEventListener('click',e=>{const b=e.target.closest('[data-court]');if(b){state.courtMode=b.dataset.court;renderDetails();}});
  $('detail-content').addEventListener('change',e=>{
    if(e.target.id==='detail-team-select'){state.detailTeam=e.target.value;state.detailPlayer='all';}
    if(e.target.id==='detail-player-select')state.detailPlayer=e.target.value;
    if(e.target.id==='detail-type-select')state.detailType=e.target.value;
    renderDetails();
  });
  setView('team');
}


init();

// Wait for shared header and season selection.
async function initializeStatisticsPage() {
    await window.pageLayoutReady;

    await loadSupabaseStatistics();
}

void initializeStatisticsPage();


// Reload Statistics whenever the selected season changes.
window.addEventListener("seasonChanged", () => {
    void loadSupabaseStatistics();
});

window.addEventListener("seasonChanged", () => {
    state.season = sessionStorage.getItem("selectedSeasonId");

    state.playerGame = "all";
    state.selectedGame = null;

    fillGameOptions("player-game-filter");
    fillGameOptions("shot-game-filter");

    render();
});

function renderTeamShotSpots() {
    const container = document.getElementById("team-shot-court");
    if (!container) return;

    const shots = getAllFilteredTeamShots();

    container.innerHTML = buildShotChartSVG(shots, "full");
}

function getAllFilteredTeamShots() {
    const games = filteredGames();

    const shots = [];

    games.forEach(game => {
        (game.events || []).forEach(event => {
            if (event.type === "shot") {
                shots.push(event);
            }
        });
    });

    return shots;
}

function buildShotChartSVG(shots = [], view = "full") {
    const markers = shots.map(shot => {
        const x = shot.x ?? 200;
        const y = shot.y ?? 200;

        if (shot.made) {
            return `
                <circle cx="${x}" cy="${y}" r="5" fill="#15964c"></circle>
            `;
        }

        return `
            <text x="${x}" y="${y}" fill="#df3138"
                  font-size="12" font-weight="bold"
                  text-anchor="middle" dominant-baseline="middle">✕</text>
        `;
    }).join("");

    return `
        <svg class="court-svg" viewBox="0 0 940 500" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="10" width="920" height="480" fill="#D2A06D" stroke="white" stroke-width="4"/>
            <line x1="470" y1="10" x2="470" y2="490" stroke="white" stroke-width="3"/>
            <circle cx="470" cy="250" r="65" fill="none" stroke="white" stroke-width="3"/>

            <path d="M10 170 H185 V330 H10" fill="none" stroke="white" stroke-width="3"/>
            <circle cx="185" cy="250" r="65" fill="none" stroke="white" stroke-width="3"/>

            <path d="M930 170 H755 V330 H930" fill="none" stroke="white" stroke-width="3"/>
            <circle cx="755" cy="250" r="65" fill="none" stroke="white" stroke-width="3"/>

            <path d="M10 55 H95 A195 195 0 0 1 95 445 H10" fill="none" stroke="white" stroke-width="4"/>
            <path d="M930 55 H845 A195 195 0 0 0 845 445 H930" fill="none" stroke="white" stroke-width="4"/>

            <line x1="40" y1="220" x2="40" y2="280" stroke="white" stroke-width="4"/>
            <line x1="900" y1="220" x2="900" y2="280" stroke="white" stroke-width="4"/>

            <circle cx="53" cy="250" r="10" fill="none" stroke="white" stroke-width="3"/>
            <circle cx="887" cy="250" r="10" fill="none" stroke="white" stroke-width="3"/>

            ${markers}
        </svg>
    `;
}

document.querySelectorAll(".zone-preview").forEach(button => {
    button.addEventListener("click", () => {
        selectedAnalysisSide = button.dataset.zoneSide;
        openZonesModal();
    });
});

// =====================================
// SHOOTING ZONES POPUP
// =====================================

const zonesModal = document.getElementById("shooting-zones-modal");
const closeZonesButton = document.getElementById("close-zones");

let previousZoneFocus = null;

let selectedAnalysisSide = "offence";
let selectedZoneView = "basic";

let selectedTraditionalZones = new Set();

let selectedBasicZones = new Set();

let selectedDistanceZones = new Set();

function toggleDistanceZone(zoneKey) {
    if (selectedDistanceZones.has(zoneKey)) {
        selectedDistanceZones.delete(zoneKey);
    } else {
        selectedDistanceZones.add(zoneKey);
    }

    renderSelectedZoneView();
}

function toggleBasicZone(zoneKey) {
    if (selectedBasicZones.has(zoneKey)) {
        selectedBasicZones.delete(zoneKey);
    } else {
        selectedBasicZones.add(zoneKey);
    }

    renderSelectedZoneView();
}

const ZONE_STYLE = {
    unselected: "#FFFFFF",
    unselectedOpacity: 0.55,
    selectedOpacity: 0.85,
    fallbackSecondary: "#FFD600"
};

function getZoneHighlightColor() {
    const secondary = getComputedStyle(
        document.documentElement
    ).getPropertyValue("--team-secondary").trim();

    return secondary || ZONE_STYLE.fallbackSecondary;
}

function toggleTraditionalZone(zoneKey) {
    if (selectedTraditionalZones.has(zoneKey)) {
        selectedTraditionalZones.delete(zoneKey);
    } else {
        selectedTraditionalZones.add(zoneKey);
    }

    renderSelectedZoneView();
}

function calculateBasicZones(shots) {

    const zones = {
        paint: { label: "PAINT", made: 0, attempts: 0 },
        midrange: { label: "MIDRANGE", made: 0, attempts: 0 },
        three: { label: "THREE-POINT", made: 0, attempts: 0 }
    };

    shots.forEach(shot => {

        const x = Number(shot.x);
        const y = Number(shot.y);

        if (
            shot.x == null ||
            shot.y == null ||
            !Number.isFinite(x) ||
            !Number.isFinite(y)
        ) return;

        // Coordinates are stored in FIBA full-court SVG units.
        const left = x < 430;

        // Convert into a vertical half-court view.
        const halfX = left ? 470 - y : y;
        const halfY = left ? x : 860 - x;

        if (
            halfX < 10 || halfX > 460 ||
            halfY < 10 || halfY > 430
        ) return;

        const inPaint =
            halfX >= 161.5 &&
            halfX <= 308.5 &&
            halfY >= 10 &&
            halfY <= 184;

        // Reuse the shot's recorded 2PT/3PT classification.
        const isThree = Number(shot.points) === 3;

        const zone = isThree
            ? zones.three
            : inPaint
                ? zones.paint
                : zones.midrange;

        zone.attempts++;

        if (shot.made === true) {
            zone.made++;
        }
    });

    return zones;
}


function buildBasicZoneCourt(shots) {
    const zones = calculateBasicZones(shots);

    const selectedKeys = selectedBasicZones.size > 0
    ? [...selectedBasicZones]
    : Object.keys(zones);

const totals = selectedKeys.reduce((result, key) => {
    const zone = zones[key];

    result.made += zone.made;
    result.attempts += zone.attempts;

    if (key === "three") {
        result.threeMade += zone.made;
        result.threeAttempts += zone.attempts;
    } else {
        result.twoMade += zone.made;
        result.twoAttempts += zone.attempts;
    }

    return result;
}, {
    made: 0,
    attempts: 0,
    twoMade: 0,
    twoAttempts: 0,
    threeMade: 0,
    threeAttempts: 0
});

const formatBasicFG = (made, attempts) =>
    attempts > 0
        ? (made / attempts * 100).toFixed(1) + "%"
        : "—";

const shootingMetrics = `
    <div class="zone-shooting-metrics">
        <div>
            <span>2PT FG%</span>
            <strong>${formatBasicFG(totals.twoMade, totals.twoAttempts)}</strong>
            <small>${totals.twoMade}/${totals.twoAttempts}</small>
        </div>

        <div>
            <span>3PT FG%</span>
            <strong>${formatBasicFG(totals.threeMade, totals.threeAttempts)}</strong>
            <small>${totals.threeMade}/${totals.threeAttempts}</small>
        </div>

        <div>
            <span>OVERALL FG%</span>
            <strong>${formatBasicFG(totals.made, totals.attempts)}</strong>
            <small>${totals.made}/${totals.attempts}</small>
        </div>
    </div>
`;

    const zoneList = [
        zones.paint,
        zones.midrange,
        zones.three
    ];

    const summaryRows = Object.entries(zones).map(([key, zone]) => {
    const isSelected = selectedBasicZones.has(key);

    const percentage = zone.attempts
        ? (zone.made / zone.attempts * 100).toFixed(1) + "%"
        : "—";

    return `
        <tr data-basic-zone="${key}"
            class="${isSelected ? "zone-selected" : ""}"
            style="cursor: pointer;">

            <td>${isSelected ? "☑" : "☐"} ${zone.label}</td>
            <td>${percentage}</td>
            <td>${zone.made}/${zone.attempts}</td>
        </tr>
    `;
}).join("");

    // Use the existing FIBA half-court drawing
    let svg = courtSVG([], "half");

    const basicZoneFill = key =>
    selectedBasicZones.has(key)
        ? getZoneHighlightColor()
        : "#FFFFFF";

const basicZoneOpacity = key =>
    selectedBasicZones.has(key)
        ? 0.85
        : 0.55;

    const overlays = `
        <g pointer-events="none">
            <!-- Three-point region, behind the arc -->
            <path
                d="M10 10 H37 V99.69
                   A202.5 202.5 0 0 0 433 99.69
                   V10 H460 V430 H10 Z"
                fill="${basicZoneFill("three")}"
fill-opacity="${basicZoneOpacity("three")}"
            />

            <!-- Two-point region inside the arc -->
            <path
    d="
        M37 10 V99.69
        A202.5 202.5 0 0 0 433 99.69
        V10 Z

        M161.5 10
        H308.5
        V184
        H161.5
        Z
    "
    fill="${basicZoneFill("midrange")}"
    fill-opacity="${basicZoneOpacity("midrange")}"
    fill-rule="evenodd"
/>
            <!-- Paint -->
            <rect
                x="161.5" y="10"
                width="147" height="174"
                fill="${basicZoneFill("paint")}"
fill-opacity="${basicZoneOpacity("paint")}"
            />
        </g>
    `;

    // Place coloured zones above the floor
    svg = svg.replace(
        /(<rect x="10" y="10" width="450" height="420"[^>]*\/>)/,
        `$1${overlays}`
    );

    const labels = [
        { zone: zones.paint, x: 235, y: 110 },
        { zone: zones.midrange, x: 100, y: 180 },
        { zone: zones.three, x: 235, y: 350 }
    ];

    const labelSVG = labels.map(({ zone, x, y }) => {
    const key = Object.keys(zones).find(
        key => zones[key] === zone
    );

    const hasSelection = selectedBasicZones.size > 0;

    if (hasSelection && !selectedBasicZones.has(key)) {
        return "";
    }

    const percentage = zone.attempts > 0
        ? Math.round(zone.made / zone.attempts * 100) + "%"
        : "—";

    return `
        <text
            x="${x}"
            y="${y}"
            text-anchor="middle"
            dominant-baseline="middle"
            font-size="17"
            font-weight="800"
            fill="#123B78"
            stroke="#FFFFFF"
            stroke-width="1.5"
            paint-order="stroke"
            pointer-events="none"
        >
            ${percentage}
        </text>
    `;
}).join("");

    svg = svg.replace("</svg>", `${labelSVG}</svg>`);

    return {
    svg,
    table: `
        ${shootingMetrics}

        <div class="zone-summary-actions">
            <span class="zone-selection-count">
                ${selectedBasicZones.size === 0
                    ? "All zones"
                    : `${selectedBasicZones.size} selected`}
            </span>

            <button type="button"
                    class="clear-basic-zones"
                    ${selectedBasicZones.size === 0 ? "disabled" : ""}>
                Clear Selection
            </button>
        </div>

        <table class="zone-summary">
                <thead>
                    <tr>
                        <th>ZONE</th>
                        <th>FG%</th>
                        <th>MADE/ATT</th>
                    </tr>
                </thead>
                <tbody>${summaryRows}</tbody>
            </table>
        `
    };
}


function getTraditionalZone(x, y) {
    const hoopX = 235;
    const hoopY = 57.25;
    const distance = Math.hypot(x - hoopX, y - hoopY);

    const radius = 202.5;
    const cornerLeft = 37;
    const cornerRight = 433;
    const arcY = hoopY +
        Math.sqrt(radius ** 2 - (hoopX - cornerLeft) ** 2);

    const outsideThree =
        (y <= arcY && (x < cornerLeft || x > cornerRight)) ||
        (y > arcY && distance > radius);

    if (outsideThree) {
        if (y <= arcY) {
            return x < hoopX ? "leftCorner" : "rightCorner";
        }

        if (x < 170) return "leftWing";
        if (x > 300) return "rightWing";
        return "topThree";
    }

    if (
    x >= 161.5 && x <= 308.5 &&
    y >= 10 && y <= 184
) {
    const leftSide = x < 235;
    const lowPaint = y < 97;

    if (lowPaint) {
        return leftSide ? "leftLowPaint" : "rightLowPaint";
    }

    return leftSide ? "leftHighPaint" : "rightHighPaint";
}

    if (y < 145) {
        if (x < 161.5) return "leftShort";
        if (x > 308.5) return "rightShort";
    }

    if (x < 170) return "leftMid";
    if (x > 300) return "rightMid";

    return "topMid";
}


function calculateTraditionalZones(shots) {
    const names = {
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
    };

    const zones = Object.fromEntries(
        Object.entries(names).map(([key, label]) => [
            key,
            { label, made: 0, attempts: 0 }
        ])
    );

    shots.forEach(shot => {
        if (shot.x == null || shot.y == null) return;

        const x = Number(shot.x);
        const y = Number(shot.y);

        if (!Number.isFinite(x) || !Number.isFinite(y)) return;

        const left = x < STATS_COURT.centerX;

        const halfX = left ? 470 - y : y;
        const halfY = left ? x : 860 - x;

        if (
            halfX < 10 || halfX > 460 ||
            halfY < 10 || halfY > 430
        ) return;

        const key = getTraditionalZone(halfX, halfY);

        zones[key].attempts++;

        if (shot.made === true) {
            zones[key].made++;
        }
    });

    return zones;
}


function buildTraditionalZoneLines() {
    const lines = [];

    // Check every 1-unit grid boundary
    for (let y = 10; y < 430; y++) {
        for (let x = 11; x < 460; x++) {
            const leftZone = getTraditionalZone(x - 0.5, y + 0.5);
            const rightZone = getTraditionalZone(x + 0.5, y + 0.5);

            if (leftZone !== rightZone) {
                lines.push(`M${x} ${y}v1`);
            }
        }
    }

    for (let y = 11; y < 430; y++) {
        for (let x = 10; x < 460; x++) {
            const upperZone = getTraditionalZone(x + 0.5, y - 0.5);
            const lowerZone = getTraditionalZone(x + 0.5, y + 0.5);

            if (upperZone !== lowerZone) {
                lines.push(`M${x} ${y}h1`);
            }
        }
    }

    return `
        <path
            d="${lines.join(" ")}"
            fill="none"
            stroke="#FFFFFF"
            stroke-width="1.5"
            stroke-opacity="0.9"
            stroke-linecap="round"
            pointer-events="none"
        />
    `;
}

function getDistanceZone(distanceFeet) {
    if (distanceFeet < 5) return "zeroToFive";
    if (distanceFeet < 10) return "fiveToTen";
    if (distanceFeet < 15) return "tenToFifteen";
    if (distanceFeet < 20) return "fifteenToTwenty";

    return "twentyPlus";
}

function calculateDistanceZones(shots) {
    const zones = {
        zeroToFive: {
            label: "0–5 FT",
            made: 0,
            attempts: 0,
            twoMade: 0,
            twoAttempts: 0,
            threeMade: 0,
            threeAttempts: 0
        },
        fiveToTen: {
            label: "5–10 FT",
            made: 0,
            attempts: 0,
            twoMade: 0,
            twoAttempts: 0,
            threeMade: 0,
            threeAttempts: 0
        },
        tenToFifteen: {
            label: "10–15 FT",
            made: 0,
            attempts: 0,
            twoMade: 0,
            twoAttempts: 0,
            threeMade: 0,
            threeAttempts: 0
        },
        fifteenToTwenty: {
            label: "15–20 FT",
            made: 0,
            attempts: 0,
            twoMade: 0,
            twoAttempts: 0,
            threeMade: 0,
            threeAttempts: 0
        },
        twentyPlus: {
            label: "20+ FT",
            made: 0,
            attempts: 0,
            twoMade: 0,
            twoAttempts: 0,
            threeMade: 0,
            threeAttempts: 0
        }
    };

    shots.forEach(shot => {
        if (shot.x == null || shot.y == null) return;

        const x = Number(shot.x);
        const y = Number(shot.y);

        if (!Number.isFinite(x) || !Number.isFinite(y)) return;

        // Use the closest basket, matching Game Tracking.
        const hoopX = x < 430 ? 57.25 : 802.75;
        const hoopY = 235;

        // Convert SVG units to feet (30 units = 1 metre).
        // Recalculate here so older shots without a stored
        // distance can still be included.
        const distanceFeet =
            Math.hypot(x - hoopX, y - hoopY) / 30 * 3.28084;

        const key = getDistanceZone(distanceFeet);
        const zone = zones[key];

        zone.attempts++;

        if (shot.made === true) {
            zone.made++;
        }

        if (Number(shot.points) === 3) {
            zone.threeAttempts++;

            if (shot.made === true) zone.threeMade++;
        } else if (Number(shot.points) === 2) {
            zone.twoAttempts++;

            if (shot.made === true) zone.twoMade++;
        }
    });

    return zones;
}


function buildDistanceZoneCourt(shots) {
    const zones = calculateDistanceZones(shots);

    const selectedKeys = selectedDistanceZones.size > 0
    ? [...selectedDistanceZones]
    : Object.keys(zones);

const totals = selectedKeys.reduce((result, key) => {
    const zone = zones[key];

    result.made += zone.made;
    result.attempts += zone.attempts;
    result.twoMade += zone.twoMade;
    result.twoAttempts += zone.twoAttempts;
    result.threeMade += zone.threeMade;
    result.threeAttempts += zone.threeAttempts;

    return result;
}, {
    made: 0,
    attempts: 0,
    twoMade: 0,
    twoAttempts: 0,
    threeMade: 0,
    threeAttempts: 0
});

const formatDistanceFG = (made, attempts) =>
    attempts > 0
        ? (made / attempts * 100).toFixed(1) + "%"
        : "—";

const shootingMetrics = `
    <div class="zone-shooting-metrics">
        <div>
            <span>2PT FG%</span>
            <strong>${formatDistanceFG(totals.twoMade, totals.twoAttempts)}</strong>
            <small>${totals.twoMade}/${totals.twoAttempts}</small>
        </div>

        <div>
            <span>3PT FG%</span>
            <strong>${formatDistanceFG(totals.threeMade, totals.threeAttempts)}</strong>
            <small>${totals.threeMade}/${totals.threeAttempts}</small>
        </div>

        <div>
            <span>OVERALL FG%</span>
            <strong>${formatDistanceFG(totals.made, totals.attempts)}</strong>
            <small>${totals.made}/${totals.attempts}</small>
        </div>
    </div>
`;

    let svg = courtSVG([], "half");

    const feetToSVG = feet => feet / 3.28084 * 30;

    const bands = [
        { key: "twentyPlus", outer: null, inner: 20 },
        { key: "fifteenToTwenty", outer: 20, inner: 15 },
        { key: "tenToFifteen", outer: 15, inner: 10 },
        { key: "fiveToTen", outer: 10, inner: 5 },
        { key: "zeroToFive", outer: 5, inner: 0 }
    ];

    const overlays = `
        <defs>
            <clipPath id="distance-court-clip">
                <rect x="10" y="10" width="450" height="420"/>
            </clipPath>
        </defs>

        <g clip-path="url(#distance-court-clip)"
           pointer-events="none">

            ${bands.map(band => {
                const selected =
                    selectedDistanceZones.has(band.key);

                const fill = selected
                    ? getZoneHighlightColor()
                    : "#FFFFFF";

                const opacity = selected ? 0.85 : 0.55;

                const outerRadius = band.outer === null
                    ? 700
                    : feetToSVG(band.outer);

                const innerRadius = feetToSVG(band.inner);

                return `
                    <path
                        d="
                            M${235 - outerRadius} 57.25
                            a${outerRadius} ${outerRadius} 0 1 0 ${outerRadius * 2} 0
                            a${outerRadius} ${outerRadius} 0 1 0 ${-outerRadius * 2} 0

                            M${235 - innerRadius} 57.25
                            a${innerRadius} ${innerRadius} 0 1 1 ${innerRadius * 2} 0
                            a${innerRadius} ${innerRadius} 0 1 1 ${-innerRadius * 2} 0
                        "
                        fill="${fill}"
                        fill-opacity="${opacity}"
                        fill-rule="evenodd"
                    />
                `;
            }).join("")}

        </g>
    `;

    // White boundaries between distance bands
const distanceLines = `
    <g
        fill="none"
        stroke="#FFFFFF"
        stroke-width="2.5"
        stroke-opacity="0.95"
        pointer-events="none"
        clip-path="url(#distance-court-clip)"
    >
        ${[5, 10, 15, 20].map(feet => `
            <circle
                cx="235"
                cy="57.25"
                r="${feetToSVG(feet)}"
            />
        `).join("")}
    </g>
`;

    svg = svg.replace(
    /(<rect x="10" y="10" width="450" height="420"[^>]*\/>)/,
    `$1${overlays}${distanceLines}`
);

  const distanceLabelPositions = {
    zeroToFive: [235, 83],
    fiveToTen: [235, 124],
    tenToFifteen: [235, 170],
    fifteenToTwenty: [235, 215],
    twentyPlus: [235, 365]
};

const distanceLabels = Object.entries(
    distanceLabelPositions
).map(([key, [x, y]]) => {
    const zone = zones[key];

    const hasSelection = selectedDistanceZones.size > 0;

if (hasSelection && !selectedDistanceZones.has(key)) {
    return "";
}

    const percentage = zone.attempts > 0
        ? Math.round(zone.made / zone.attempts * 100) + "%"
        : "—";

    return `
        <text
            x="${x}"
            y="${y}"
            text-anchor="middle"
            dominant-baseline="middle"
            font-size="15"
            font-weight="800"
            fill="#123B78"
            stroke="#FFFFFF"
            stroke-width="1.5"
            paint-order="stroke"
            pointer-events="none"
        >
            ${percentage}
        </text>
    `;
}).join("");

svg = svg.replace(
    "</svg>",
    `${distanceLabels}</svg>`
);

    const rows = Object.entries(zones).map(([key, zone]) => {
        const selected = selectedDistanceZones.has(key);

        const percentage = zone.attempts
            ? (zone.made / zone.attempts * 100).toFixed(1) + "%"
            : "—";

        return `
            <tr data-distance-zone="${key}"
                class="${selected ? "zone-selected" : ""}"
                style="cursor:pointer">
                <td>${selected ? "☑" : "☐"} ${zone.label}</td>
                <td>${percentage}</td>
                <td>${zone.made}/${zone.attempts}</td>
            </tr>
        `;
    }).join("");

    return {
    svg,
    table: `
        ${shootingMetrics}

        <div class="zone-summary-actions">
            <span class="zone-selection-count">
                ${selectedDistanceZones.size === 0
                    ? "All zones"
                    : `${selectedDistanceZones.size} selected`}
            </span>

            <button type="button"
                    class="clear-distance-zones"
                    ${selectedDistanceZones.size === 0 ? "disabled" : ""}>
                Clear Selection
            </button>
        </div>
        <table class="zone-summary">
                <thead>
                    <tr>
                        <th>ZONE</th>
                        <th>FG%</th>
                        <th>MADE/ATT</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `
    };
}


function buildTraditionalZoneCourt(shots) {
    const zones = calculateTraditionalZones(shots);
    const selectedKeys = selectedTraditionalZones.size > 0
    ? [...selectedTraditionalZones]
    : Object.keys(zones);

const getTotals = keys => {
    return keys.reduce((totals, key) => {
        totals.made += zones[key].made;
        totals.attempts += zones[key].attempts;
        return totals;
    }, { made: 0, attempts: 0 });
};

const twoPointKeys = selectedKeys.filter(key =>
    !["leftCorner", "rightCorner", "leftWing",
      "rightWing", "topThree"].includes(key)
);

const threePointKeys = selectedKeys.filter(key =>
    ["leftCorner", "rightCorner", "leftWing",
     "rightWing", "topThree"].includes(key)
);

const twoPT = getTotals(twoPointKeys);
const threePT = getTotals(threePointKeys);
const overall = getTotals(selectedKeys);

const formatShooting = totals =>
    totals.attempts
        ? (totals.made / totals.attempts * 100).toFixed(1) + "%"
        : "—";

const shootingMetrics = `
    <div class="zone-shooting-metrics">
        <div>
            <span>2PT FG%</span>
            <strong>${formatShooting(twoPT)}</strong>
            <small>${twoPT.made}/${twoPT.attempts}</small>
        </div>

        <div>
            <span>3PT FG%</span>
            <strong>${formatShooting(threePT)}</strong>
            <small>${threePT.made}/${threePT.attempts}</small>
        </div>

        <div>
            <span>OVERALL FG%</span>
            <strong>${formatShooting(overall)}</strong>
            <small>${overall.made}/${overall.attempts}</small>
        </div>
    </div>
`;
    let svg = courtSVG([], "half");

    const percentage = zone =>
        zone.attempts
            ? Math.round(zone.made / zone.attempts * 100) + "%"
            : "—";

    // Use one-unit-wide horizontal strips to form each
    // zone. This avoids overlapping filled regions.
    const zonePaths = Object.fromEntries(
        Object.keys(zones).map(key => [key, []])
    );

    for (let y = 10; y < 430; y++) {
        let currentZone = null;
        let startX = 10;

        for (let x = 10; x <= 460; x++) {
            const key = x === 460
                ? null
                : getTraditionalZone(x + 0.5, y + 0.5);

            if (key !== currentZone) {
                if (currentZone !== null) {
                    const width = x - startX;

                    zonePaths[currentZone].push(
                        `M${startX} ${y}h${width}v1h-${width}z`
                    );
                }

                currentZone = key;
                startX = x;
            }
        }
    }

    // Dividing lines between the four paint sections
const paintDividers = `
    <g pointer-events="none"
       fill="none"
       stroke="#FFFFFF"
       stroke-width="2"
       stroke-opacity="0.9">

        <!-- Vertical divider -->
        <line x1="235" y1="10"
              x2="235" y2="184"/>

        <!-- Horizontal divider -->
        <line x1="161.5" y1="97"
              x2="308.5" y2="97"/>

    </g>
`;

    const selectedCount = selectedTraditionalZones.size;
    const secondaryColor = getZoneHighlightColor();

    const zoneColours = `
        <g pointer-events="none">
            ${Object.entries(zonePaths).map(([key, paths]) => {
                const selected = selectedTraditionalZones.has(key);

                const fill = selected
                    ? secondaryColor
                    : ZONE_STYLE.unselected;

                const opacity = selected
                    ? ZONE_STYLE.selectedOpacity
                    : ZONE_STYLE.unselectedOpacity;

                return `
                    <path
                        d="${paths.join("")}"
                        fill="${fill}"
                        fill-opacity="${opacity}"
                    />
                `;
            }).join("")}
        </g>
    `;

    // Place highlights above the hardwood, but
    // underneath the basketball court markings.
    svg = svg.replace(
    /(<rect x="10" y="10" width="450" height="420"[^>]*\/>)/,
    `$1${zoneColours}`
);

// Draw dividers above the highlighted areas
svg = svg.replace(
    "</svg>",
    `${paintDividers}</svg>`
);

    // Percentage positions
    const positions = {
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

    const labels = Object.entries(positions).map(([key, pos]) => {
        const selected = selectedTraditionalZones.has(key);

        // No selection: all percentages visible.
        // Active selection: selected percentages only.
        if (selectedCount > 0 && !selected) {
            return "";
        }

        const [x, y] = pos;
        const isCorner = key.includes("Corner");

        const displayPercentage = zones[key].attempts > 0
      ? percentage(zones[key])
      : "—";
        
        return `
            <text
                x="${x}"
                y="${y}"
                text-anchor="middle"
                dominant-baseline="middle"
                font-size="${isCorner ? 10 : 15}"
font-weight="800"
fill="#123B78"
stroke="#FFFFFF"
stroke-width="1.5"
paint-order="stroke"
pointer-events="none"
            >
                ${displayPercentage}
            </text>
        `;
    }).join("");

    const zoneLines = buildTraditionalZoneLines();

svg = svg.replace(
    "</svg>",
    `${zoneLines}${labels}</svg>`
);

    // Interactive summary table
    const rows = Object.entries(zones).map(([key, zone]) => {
        const selected = selectedTraditionalZones.has(key);

        return `
            <tr
                data-traditional-zone="${key}"
                class="${selected ? "zone-selected" : ""}"
                style="cursor: pointer;"
            >
                <td>
                    ${selected ? "☑" : "☐"}
                    ${zone.label}
                </td>

                <td>${percentage(zone)}</td>

                <td>${zone.made}/${zone.attempts}</td>
            </tr>
        `;
    }).join("");

    return {
    svg,
    table: `
    ${shootingMetrics}

    <div class="zone-summary-actions">
        <span class="zone-selection-count">
            ${selectedTraditionalZones.size === 0
                ? "All zones"
                : `${selectedTraditionalZones.size} selected`}
        </span>

        <button type="button"
                class="clear-traditional-zones"
                ${selectedTraditionalZones.size === 0 ? "disabled" : ""}>
            Clear Selection
        </button>
    </div>
    <div class="traditional-zone-scroll">
    <table class="zone-summary">
                <thead>
                    <tr>
                        <th>ZONE</th>
                        <th>FG%</th>
                        <th>MADE/ATT</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
    </div>
        `
    };
}


$("expanded-analysis-summary").addEventListener("click", event => {

  if (selectedZoneView === "distance") {

    if (event.target.closest(".clear-distance-zones")) {
        selectedDistanceZones.clear();
        renderSelectedZoneView();
        return;
    }

    const row = event.target.closest("[data-distance-zone]");

    if (row) {
        toggleDistanceZone(row.dataset.distanceZone);
    }

    return;
}

  if (selectedZoneView === "basic") {
    const row = event.target.closest("[data-basic-zone]");

    if (selectedZoneView === "basic") {

    if (event.target.closest(".clear-basic-zones")) {
        selectedBasicZones.clear();
        renderSelectedZoneView();
        return;
    }

    const row = event.target.closest("[data-basic-zone]");

    if (row) {
        toggleBasicZone(row.dataset.basicZone);
    }

    return;
}
}
  
  if (selectedZoneView !== "traditional") return;

    // Clear all selected zones
    if (event.target.closest(".clear-traditional-zones")) {
        selectedTraditionalZones.clear();
        renderSelectedZoneView();
        return;
    }

    // Select or deselect individual zones
    const row = event.target.closest("[data-traditional-zone]");

    if (!row) return;

    toggleTraditionalZone(row.dataset.traditionalZone);
});

function renderSelectedZoneView() {
    const shots = selectedAnalysisSide === "offence"
        ? getTeamShots("us")
        : getTeamShots("opponent");

    let analysis;

if (selectedZoneView === "basic") {
    analysis = buildBasicZoneCourt(shots);
} else if (selectedZoneView === "traditional") {
    analysis = buildTraditionalZoneCourt(shots);
} else if (selectedZoneView === "distance") {
    analysis = buildDistanceZoneCourt(shots);
} else {
    analysis = buildZoneCourt(shots, selectedAnalysisSide, true);
}

    $("expanded-analysis-court").innerHTML = analysis.svg;
    $("expanded-analysis-summary").innerHTML = analysis.table;

    // Update active button
    document.querySelectorAll("[data-zone-view]").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.zoneView === selectedZoneView
        );
    });
}

function openZonesModal() {
    previousZoneFocus = document.activeElement;

    $("zones-modal-title").textContent =
        selectedAnalysisSide === "offence"
            ? "OFFENSIVE SHOT ANALYSIS"
            : "DEFENSIVE SHOT ANALYSIS";

    selectedZoneView = "basic";

    renderSelectedZoneView();

    selectedTraditionalZones.clear();

    zonesModal.hidden = false;
    closeZonesButton.focus();
}


function closeZonesModal() {
    zonesModal.hidden = true;
    previousZoneFocus?.focus();
}

// Clicking either small court opens the popup
document.querySelectorAll(".zone-preview").forEach(button => {
    button.addEventListener("click", () => {
        selectedAnalysisSide = button.dataset.zoneSide;
        openZonesModal();
    });
});

document.querySelectorAll("[data-zone-view]").forEach(button => {
    button.addEventListener("click", () => {
        selectedZoneView = button.dataset.zoneView;
        renderSelectedZoneView();
    });
});

// Close button
closeZonesButton.addEventListener("click", closeZonesModal);

// Clicking the dark background closes the popup
zonesModal.querySelector(".zones-modal-backdrop")
    .addEventListener("click", closeZonesModal);

// Escape key closes the popup
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !zonesModal.hidden) {
        closeZonesModal();
    }
});


/* =========================================
   SUPABASE REALTIME — STATISTICS
   ========================================= */

let statisticsRealtimeChannel = null;
let statisticsRefreshTimer = null;

function startStatisticsRealtime() {
    const teamId = sessionStorage.getItem("selectedTeamId");
    const seasonId = sessionStorage.getItem("selectedSeasonId");

    // Remove the previous subscription before creating another.
    if (statisticsRealtimeChannel) {
        void supabaseClient.removeChannel(statisticsRealtimeChannel);
        statisticsRealtimeChannel = null;
    }

    if (statisticsRefreshTimer) {
        clearTimeout(statisticsRefreshTimer);
        statisticsRefreshTimer = null;
    }

    if (!teamId || !seasonId) {
        console.warn("Realtime: Select a team and season first.");
        return;
    }

    function refreshStatistics() {
        // Group rapid database changes into one reload.
        clearTimeout(statisticsRefreshTimer);

        statisticsRefreshTimer = setTimeout(() => {
            statisticsRefreshTimer = null;

            console.log("Realtime: Refreshing Statistics...");

            void loadSupabaseStatistics();
        }, 300);
    }

    const channelName = `stats-${teamId}-${seasonId}`;

    statisticsRealtimeChannel = supabaseClient
        .channel(channelName)

        // Watch game changes for the selected team.
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "games",
                filter: `team_id=eq.${teamId}`
            },
            payload => {
                const changedGame = payload.new || payload.old;

                // Ignore changes for another season when
                // the season is available in the payload.
                if (
                    changedGame?.seasons_id &&
                    String(changedGame.seasons_id) !== String(seasonId)
                ) {
                    return;
                }

                console.log("Realtime game change:", payload.eventType);

                refreshStatistics();
            }
        )

        // Watch events belonging to the completed games
        // currently shown on the Statistics page.
        
.on(
    "postgres_changes",
    {
        event: "*",
        schema: "public",
        table: "game_events"
    },
    payload => {
        console.log(
            "Realtime event received:",
            payload.eventType,
            payload
        );

        // DELETE events may only contain the deleted row's ID.
        // We cannot always check game_id for deletions.
        if (payload.eventType === "DELETE") {
            console.log("Shot/event deleted. Refreshing Statistics...");
            refreshStatistics();
            return;
        }

        // For INSERT and UPDATE, only refresh if the
        // event belongs to a displayed game.
        const changedGameId = payload.new?.game_id;

        const belongsToSelectedGames = state.games.some(
            game => String(game.id) === String(changedGameId)
        );

        if (!belongsToSelectedGames) return;

        console.log(
            "Realtime event change:",
            payload.eventType
        );

        refreshStatistics();
    }
)


        .subscribe(status => {
            console.log("Statistics Realtime:", status);

            if (status === "SUBSCRIBED") {
                console.log("Statistics Realtime connected.");
                // Catch changes that occurred before subscribing.
                refreshStatistics();
            }

            if (
                status === "CHANNEL_ERROR" ||
                status === "TIMED_OUT"
            ) {
                console.warn(
                    "Statistics Realtime connection problem:",
                    status
                );
            }
        });
}

// Start listening when Statistics loads.
startStatisticsRealtime();

// Reconnect when switching seasons.
window.addEventListener("seasonChanged", () => {
    startStatisticsRealtime();
});

// Reconnect when switching teams.
window.addEventListener("teamChanged", () => {
    startStatisticsRealtime();
    void loadSupabaseStatistics();
});

// Refresh when returning to the browser tab.
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
        void loadSupabaseStatistics();
    }
});
