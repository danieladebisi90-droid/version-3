/* Scoridium Team & Roster: dynamic jersey card grid.
   Existing database schema: players(id, first_name, last_name, number, team_id).
   Read-only page; player management remains in your existing admin flow. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(window.location.search);
  const GRID_DESKTOP = {
    1: 1, 2: 2, 3: 3, 4: 4, 5: 5,
    6: 3, 7: 4, 8: 4, 9: 3, 10: 5,
    11: 4, 12: 4, 13: 4, 14: 5, 15: 5,
    16: 4, 17: 6, 18: 6, 19: 5, 20: 5
  };
  // Keep rows reasonably balanced for unexpected roster sizes.
  function columnsFor(count) {
    if (count <= 0) return 1;
    if (GRID_DESKTOP[count]) return GRID_DESKTOP[count];
    return Math.min(6, Math.max(3, Math.round(Math.sqrt(count * 1.6))));
  }
  window.scoridiumRosterColumns = columnsFor;

  function safeStorage(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function parseJSON(text) {
    try { return text ? JSON.parse(text) : null; } catch { return null; }
  }

function currentTeamId() {
    const params = new URLSearchParams(window.location.search);

    return (
        params.get("teamId") ||
        sessionStorage.getItem("selectedTeamId") ||
        null
    );
}

  function getClient() {
    // Works with a global `const supabaseClient` declared in another classic script.
    if (typeof supabaseClient !== 'undefined') return supabaseClient;
    return window.supabaseClient || null;
  }
  function normalizeColor(value, fallback) {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  }
  function initials(team) {
    const seed = [team.school_name, team.mascot].filter(Boolean).join(' ');
    const words = seed.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return 'SC';
    return words.length >= 2 ? (words[0][0] + words[words.length-1][0]).toUpperCase() : words[0].slice(0, 2).toUpperCase();
  }
  const playersForDemo = Array.from({ length: 30 }, (_, i) => ({
    id: `demo-${i+1}`,
    first_name: ['Jayden','Marcus','Jordan','Darius','Alex','Chris','Noah','Ethan','Kobe','Ryan','Daniel','Tyler','Amir','Liam','Devin'][i % 15],
    last_name: ['Carter','Johnson','Williams','Taylor','Martinez','Thompson','Lee','Anderson','Brown','Wilson','Miller','Davis','Hassan','Clark','Parker'][i % 15],
    number: [12,4,23,5,8,10,11,14,15,20,21,24,30,32,33,35,42,44,50,55,1,2,3,6,7,9,13,16,17,18][i],
    position: ['PG','SG','SF','PF','C'][i % 5]
  }));
  let shownPlayers = [], teamId = null, seasonId = null, demoMode = false;
  let jerseyWordmark = 'CROXFORD';
  function fullName(player) {
    return `${player.first_name || ''} ${player.last_name || ''}`.trim() || player.name || 'Unnamed player';
  }
  
function jerseySVG(player) {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");

    svg.setAttribute("viewBox", "0 0 180 210");
    svg.setAttribute("class", "jersey-svg");
    svg.setAttribute("aria-hidden", "true");

    const make = (tag, attrs, content) => {
        const element = document.createElementNS(svgNS, tag);

        for (const [name, value] of Object.entries(attrs)) {
            element.setAttribute(name, value);
        }

        if (content !== undefined) {
            element.textContent = String(content);
        }

        svg.appendChild(element);
        return element;
    };

    const number = player.number ?? "—";
    const teamName = jerseyWordmark;
    // Same jersey body as the Player Profile
    make("path", {
        d: "M25 12 H53 C58 42 70 52 90 52 C110 52 122 42 127 12 H155 V68 C155 94 167 108 177 118 V198 H3 V118 C13 108 25 94 25 68 Z",
        fill: "var(--team-primary)"
    });

    // White collar trim
    make("path", {
        d: "M53 12 C58 42 70 52 90 52 C110 52 122 42 127 12",
        fill: "none",
        stroke: "white",
        "stroke-width": "5"
    });

    // White armhole trim
    make("path", {
        d: "M25 12 V68 C25 94 13 108 3 118 M155 12 V68 C155 94 167 108 177 118",
        fill: "none",
        stroke: "white",
        "stroke-width": "5"
    });

    // Player's last name
    make("text", {
        x: "90",
        y: "88",
        "text-anchor": "middle",
        "font-size": "19",
        "font-weight": "900",
        fill: "white"
    }, teamName);

    // Player's jersey number
    make("text", {
        x: "90",
        y: "155",
        "text-anchor": "middle",
        "font-size": String(number).length > 2 ? "55" : "70",
        "font-weight": "900",
        fill: "white",
        stroke: "#111827",
        "stroke-width": "5",
        "paint-order": "stroke"
    }, number);

    return svg;
}

  function profileUrl(player) {
    const params = new URLSearchParams();
    params.set('playerId', player.id);
    if (teamId) params.set('teamId', teamId);
    if (seasonId) params.set('seasonId', seasonId);
    return `player.html?${params.toString()}`;
  }
  function setStatus(message) {
    $('roster-status').hidden = !message;
    $('roster-status').textContent = message;
  }
  function displayRoster() {
    const term = $('roster-search').value.trim().toLowerCase();
    const filtered = shownPlayers.filter(p => `${fullName(p)} ${p.number ?? ''} ${p.position ?? ''}`.toLowerCase().includes(term));
    const grid = $('jersey-grid');
    grid.replaceChildren();
    grid.style.setProperty('--grid-columns', columnsFor(filtered.length));
    $('player-count').textContent = shownPlayers.length;
    $('active-count').textContent = shownPlayers.filter(p => p.active !== false && p.status !== 'inactive').length;
    $('roster-summary').textContent = `${shownPlayers.length} player${shownPlayers.length === 1 ? '' : 's'} on the roster`;
    if (!filtered.length) {
      setStatus(shownPlayers.length ? 'No players match your search.' : 'No players on this roster yet.');
      return;
    }
    setStatus('');
    const fragment = document.createDocumentFragment();
    filtered.forEach(player => {
      const link = document.createElement('a');
      link.className = 'jersey-card';
      // Demo player URLs are visual placeholders; real player links go directly to player.html.
      link.href = demoMode ? `player.html?playerId=${encodeURIComponent(player.id)}&demo=1` : profileUrl(player);
      link.setAttribute('aria-label', `${fullName(player)}, jersey ${player.number ?? 'unassigned'}, view player profile`);
      link.appendChild(jerseySVG(player));
      const name = document.createElement('span');
      name.className = 'jersey-name';
      name.textContent = fullName(player);
      const meta = document.createElement('span');
      meta.className = 'jersey-meta';
      meta.textContent = player.position || 'PLAYER';
      link.append(name, meta);
      fragment.appendChild(link);
    });
    grid.appendChild(fragment);
  }
  function setTeam(team) {
    const school = team.team_type === 'club' ? (team.club_name || team.school_name || 'Scoridium') : (team.school_name || 'Scoridium');
    const mascot = team.mascot || (team.team_type === 'club' ? '' : 'Team');
    const label = mascot.toLowerCase().includes(school.toLowerCase()) ? mascot : `${school} ${mascot}`;
    $('team-name').textContent = label.toUpperCase();
    jerseyWordmark = String(school.split(' ')[0] || mascot).toUpperCase().slice(0, 11); 
    $('school-name').textContent = school.toUpperCase();
    $('team-emblem').textContent = String(mascot || school).charAt(0).toUpperCase();
    window.ScoridiumTheme?.apply(team);
  }
  function demo() {
    demoMode = true;
    setTeam({school_name:'Croxford High School',mascot:'Cavaliers',primary_color:'#123B78',secondary_color:'#FFD600'});
    const buttons = $('demo-buttons');
    const options = [5,8,10,12,13,15,18,20];
    function setCount(n) {
      shownPlayers = playersForDemo.slice(0, n);
      [...buttons.children].forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.count) === n)));
      displayRoster();
    }
    for (const n of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.count = String(n);
      button.textContent = String(n);
      button.addEventListener('click', () => setCount(n));
      buttons.appendChild(button);
    }
    $('demo-control').hidden = false;
    $('roster-preview-nav').hidden = false;
    $('staff-count').textContent = '3';
    $('record-count').textContent = '5–1';
    setCount(12);
  }
  async function loadRoster() {
    const client = getClient();
    teamId = currentTeamId();
    
seasonId =
    qs.get("seasonId") ||
    qs.get("season_id") ||
    sessionStorage.getItem("selectedSeasonId") ||
    null;

    const seasonLabel = qs.get('season') || qs.get('seasonLabel');
    if (seasonLabel) {
      $('season-label').textContent = seasonLabel;
      $('season-label').hidden = false;
    }
    // Standalone HTML preview when the existing app's Supabase client has not been included.
    if (!client) { demo(); return; }
    if (!teamId) {
      setStatus('No team selected. Open this page with ?teamId=YOUR_TEAM_ID or connect your existing team-selection state.');
      $('roster-summary').textContent = 'Team not selected';
      return;
    }
    const [teamResponse, playersResponse] = await Promise.all([
      client.from('teams').select('*').eq('id', teamId).maybeSingle(),
      client.from('players').select('*').eq('team_id', teamId).order('number', {ascending:true})
    ]);
    if (teamResponse.error || playersResponse.error) {
      console.error('Roster load failed:', teamResponse.error || playersResponse.error);
      setStatus('Could not load the roster from Supabase. Check your access and team selection.');
      $('roster-summary').textContent = 'Roster unavailable';
      return;
    }
    if (teamResponse.data) setTeam(teamResponse.data);
    $('staff-count').textContent = '—';
    $('record-count').textContent = '—';
    shownPlayers = playersResponse.data || [];
    // This page intentionally loads the complete team roster. If you later add a
    // season-to-player membership table, filter memberships here instead.
    displayRoster();
  }
  void loadRoster();
})();
