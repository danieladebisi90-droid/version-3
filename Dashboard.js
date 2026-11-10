// document.getElementById("start-tracking").addEventListener("click", function() {
//     window.location.href = "gamehub.html";

// });

// document.getElementById("roster").addEventListener("click", function() {
//     window.location.href = "roster.html";

// });

// document.getElementById("statistics").addEventListener("click", function() {
//     window.location.href = "stats.html";
// });
const selectedTeamId = sessionStorage.getItem("selectedTeamId");
async function loadTeamDashboard() {
    const { data: team, error } =   await supabaseClient.from("teams").select("*").eq("id", selectedTeamId).single()
    if(!selectedTeamId){
        window.location.href = "myTeams.html"
    }
    
let gamesQuery = supabaseClient
    .from("games")
    .select("*")
    .eq("team_id", selectedTeamId);

const activeSeasonId = sessionStorage.getItem("selectedSeasonId");


const selectedSeasonOption = document.querySelector(
    ".season-selector option:checked"
);

const recordSeason = document.getElementById(
    "dashboard-record-season"
);

if (recordSeason) {
    recordSeason.textContent =
        selectedSeasonOption?.textContent || "Selected Season";
}


if (activeSeasonId) {
    gamesQuery = gamesQuery.eq("seasons_id", activeSeasonId);
}

const { data: teamGames, error: gamesError } = await gamesQuery;

if (gamesError) {
    console.error("Dashboard games error:", gamesError);
    return;
}

    const record = calculateTeamRecord(teamGames)
    displayRecentGames(teamGames);
    
    document.getElementById("team-record-value").textContent = record.wins + " - "+ record.losses
    console.log(record)
    document.querySelector(".school-name").textContent = team.team_type === "club" ? (team.club_name || team.school_name || "") : (team.school_name || "")
    document.querySelector(".mascot").textContent = team.team_type === "club" ? (team.club_name || team.mascot || "Team") : (team.mascot || "Team")
    window.ScoridiumTheme?.apply(team)
    document.querySelector(".team-logo").style.color = team.secondary_color || "#9299A5"
    document.querySelector(".team-logo").textContent = (team.team_type === "club" ? (team.club_name || team.mascot || "T") : (team.mascot || "T")).charAt(0).toUpperCase()
    const navButtons = document.querySelectorAll("#navigation-container button")
    navButtons.forEach(function(button){
        button.style.color = team.primary_color
    })
}
// loadTeamDashboard()

function calculateResult(teamScore, opponentScore){
    if(teamScore>opponentScore){
        return "W"
    }else{
        return "L"
    }
}


function calculateTeamRecord(games) {
    let wins = 0;
    let losses = 0;

    games.forEach(function(game) {
        if (
            game.status !== "completed" ||
            game.team_score == null ||
            game.opponent_score == null
        ) {
            return;
        }

        if (game.team_score > game.opponent_score) {
            wins++;
        } else if (game.team_score < game.opponent_score) {
            losses++;
        }
    });

    return { wins, losses };
}


let dashboardRecentGames = [];
let dashboardRecentObserver = null;
let dashboardRecentRenderedCount = -1;

function getRecentGamesCapacity() {
    const panel = document.querySelector(".recent-games");
    const table = panel?.querySelector(".games-table");
    const heading = table?.querySelector("thead");

    if (!panel || !table || !heading) return 3;

    const panelStyle = getComputedStyle(panel);
    const bottomPadding =
        parseFloat(panelStyle.paddingBottom) || 0;

    const availableHeight = Math.max(
        0,
        panel.getBoundingClientRect().bottom
        - table.getBoundingClientRect().top
        - bottomPadding
        - heading.getBoundingClientRect().height
    );

    const byHeight = Math.max(
        1,
        Math.floor(availableHeight / 46)
    );

    const width = panel.getBoundingClientRect().width;

    const byWidth =
        width < 440 ? 2 :
        width < 580 ? 3 : 8;

    return Math.min(8, byHeight, byWidth);
}

function renderResponsiveRecentGames() {
    const tableBody =
        document.getElementById("recent-games-body");

    if (!tableBody) return;

    const count = Math.min(
        dashboardRecentGames.length,
        getRecentGamesCapacity()
    );

    if (count === dashboardRecentRenderedCount) return;

    dashboardRecentRenderedCount = count;
    tableBody.replaceChildren();

    dashboardRecentGames.slice(0, count).forEach(game => {
        const row = document.createElement("tr");

        const dateCell = document.createElement("td");
        const opponentCell = document.createElement("td");
        const resultCell = document.createElement("td");
        const resultBadge = document.createElement("span");
        const scoreCell = document.createElement("td");
        const locationCell = document.createElement("td");

        dateCell.textContent = game.date;
        opponentCell.textContent = game.opponent;

        resultBadge.textContent = calculateResult(
            game.team_score,
            game.opponent_score
        );

        resultBadge.classList.add(
            resultBadge.textContent === "W" ? "win" : "loss"
        );

        resultCell.appendChild(resultBadge);

        scoreCell.textContent =
            game.team_score + " - " + game.opponent_score;

        locationCell.textContent = game.location;

        row.append(
            dateCell,
            opponentCell,
            resultCell,
            scoreCell,
            locationCell
        );

        tableBody.appendChild(row);
    });
}

function displayRecentGames(games) {
    dashboardRecentGames = games
        .filter(game =>
            game.status === "completed" &&
            game.team_score != null &&
            game.opponent_score != null
        )
        .sort((a, b) => b.date.localeCompare(a.date));

    dashboardRecentRenderedCount = -1;
    renderResponsiveRecentGames();

    if (!dashboardRecentObserver &&
        typeof ResizeObserver !== "undefined") {

        const panel = document.querySelector(".recent-games");

        if (panel) {
            dashboardRecentObserver = new ResizeObserver(() => {
                requestAnimationFrame(renderResponsiveRecentGames);
            });

            dashboardRecentObserver.observe(panel);
        }
    }
}

function calculateAverage(statTotal, gamesPlayed){
    if(gamesPlayed > 0){
        return statTotal/gamesPlayed;
    }else{
        return 0;
    }
}

function findLeader(statistic){
    let highestAverage = -1;
    let leader = null
    playerList.forEach(function(player){
        //const average = calculateAverage(player[statistic], player.gamesPlayed)
        let average = 0;
        if(statistic === "fgPercentage"){
            average = player.fgPercentage;
        }else{
            average = calculateAverage(player[statistic], player.gamesPlayed);
        }
        if(average > highestAverage){
            highestAverage = average;
            leader = player;
        }
        
    })
    return leader;
}

function displayTeamLeaders(){
    const leadersList = document.getElementById("leaders-list")
    leadersList.replaceChildren();
    let playerList = [];
    if (!playerList || playerList.length === 0) {
        leadersList.textContent = "No player statistics available yet.";
        return;
    }
    const categories = ["points", "rebounds", "assists", "fgPercentage"]
    categories.forEach(function(category){
        const categoryLabels = {
            points: "PPG",
            rebounds: "RPG",
            assists: "APG",
            fgPercentage: "FG%"
        };
        const leader = findLeader(category);
        let average = 0;
        if(category === "fgPercentage"){
            average = leader.fgPercentage;
        }else{
            average = calculateAverage(leader[category], leader.gamesPlayed);
        }
        const leaderRow = document.createElement("div")
        leaderRow.classList.add("leader-row")
        const playerAvatar = document.createElement("div")
        const jerseynumber = document.createElement("span")
        const jerseyintials = document.createElement("span")
        jerseynumber.textContent =  "#" + leader.number;
        jerseyintials.textContent = leader.initials;
        playerAvatar.appendChild(jerseyintials)
        playerAvatar.appendChild(jerseynumber)
        playerAvatar.classList.add("player-avatar");
        jerseynumber.classList.add("jersey-number");
        jerseyintials.classList.add("jersey-intials");
        
        //playerAvatar.textContent = leader.initials + "#" + leader.number;
        const playerInfo = document.createElement("div");
        playerInfo.classList.add("player-info");
        const playerName = document.createElement("h3");
        playerName.textContent = leader.name;

        const playerDetails = document.createElement("p");
        playerDetails.textContent = leader.position + " | Grade " + leader.grade;
        
        const statInfo = document.createElement("div")
        statInfo.classList.add("leader-stat-info")
        const statlabel = document.createElement("p");
        statlabel.textContent = categoryLabels[category];
        const statValue = document.createElement("h2");
        statValue.textContent = average.toFixed(1) + (category === "fgPercentage" ? "%" : "");
        playerInfo.appendChild(playerName);
        playerInfo.appendChild(playerDetails);

        statInfo.appendChild(statlabel);
        statInfo.appendChild(statValue);

        leaderRow.appendChild(playerAvatar);
        leaderRow.appendChild(playerInfo);
        leaderRow.appendChild(statInfo);

        leadersList.appendChild(leaderRow);
    })    
};

displayTeamLeaders()

async function loadTeamTicker() {

    const selectedSeasonId = sessionStorage.getItem("selectedSeasonId");

    if (!selectedSeasonId) {
        return;
    }

    const { data: latestGames, error } = await supabaseClient
        .from("games")
        .select("*")
        .eq("team_id", selectedTeamId)
        .eq("seasons_id", selectedSeasonId)
        .eq("status", "completed")
        .order("date", { ascending: false })
        .limit(1);

    if (error) {
        console.log("Ticker error:", error);
        return;
    }
    const latestGame = latestGames[0];

    let latestText = "Latest Result: No completed games";

    if (latestGame) {

        const result = latestGame.team_score > latestGame.opponent_score
            ? "W"
            : "L";

        latestText = "Latest Result: " +
            result + " " +
            latestGame.team_score + "-" +
            latestGame.opponent_score +
            " vs " + latestGame.opponent;
    }

    const latestItems = document.querySelectorAll(".ticker-latest");

    latestItems.forEach(function(item) {
        item.textContent = latestText;
    });

    const { data: seasonGames, error: seasonGamesError } = await supabaseClient
    .from("games")
    .select("*")
    .eq("team_id", selectedTeamId)
    .eq("seasons_id", selectedSeasonId)
    .eq("status", "completed");

    if (seasonGamesError) {
        console.log("Record error:", seasonGamesError);
        return;
    }

    let wins = 0;
    let losses = 0;

    seasonGames.forEach(function(game) {

        if (game.team_score > game.opponent_score) {
            wins++;
        } else if (game.team_score < game.opponent_score) {
            losses++;
        }

    }); 

    const recordText = "Team Record: " + wins + "-" + losses;

    const recordItems = document.querySelectorAll(".ticker-record");

    recordItems.forEach(function(item) {
        item.textContent = recordText;
    });  
    
    const today = new Date().toLocaleDateString("en-CA");

    const { data: upcomingGames, error: upcomingError } = await supabaseClient
        .from("games")
        .select("*")
        .eq("team_id", selectedTeamId)
        .eq("seasons_id", selectedSeasonId)
        .eq("status", "scheduled")
        .gte("date", today)
        .order("date", { ascending: true })
        .limit(1);

    if (upcomingError) {
        console.log("Next game error:", upcomingError);
        return;
    }

    const nextGame = upcomingGames[0];

    let nextGameText = "Next Game: No upcoming games";

    if (nextGame) {
        nextGameText = "Next Game: " +
            nextGame.date +
            " vs " +
            nextGame.opponent;
    }

    const nextGameItems = document.querySelectorAll(".ticker-next");

    nextGameItems.forEach(function(item) {
        item.textContent = nextGameText;
    });
}


document.addEventListener("DOMContentLoaded", initializeDashboard);


async function initializeDashboard() {
    await window.pageLayoutReady;

    await Promise.all([
        loadTeamDashboard(),
        loadTeamTicker(),
        renderWeeklySchedule()
    ]);

    initializeDashboardRoster();

    if (window.lucide) {
        lucide.createIcons();
    }
}

window.addEventListener("seasonChanged", async () => {
    await Promise.all([
        loadTeamDashboard(),
        loadTeamTicker(),
        renderWeeklySchedule()
    ]);
});


/* =========================================
   WEEKLY SCHEDULE - SUPABASE GAMES
   ========================================= */

let weekOffset = 0;
let weeklyScheduleRequest = 0;

function formatScheduleDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatGameTime(game) {
    // We can replace this list once the actual
    // tip-off time column is confirmed.
    const raw =
        game.game_time ??
        game.start_time ??
        game.tipoff_time ??
        game.time ??
        null;

    if (!raw) return "Time TBD";

    const value = String(raw).trim();

    // Database TIME values like 18:30 or 18:30:00
    const match = value.match(/^(\d{1,2}):(\d{2})/);

    if (match) {
        const hour = Number(match[1]);
        const minute = match[2];

        if (hour > 23) return "Time TBD";

        const hour12 = hour % 12 || 12;
        const suffix = hour >= 12 ? "PM" : "AM";

        return `${hour12}:${minute} ${suffix}`;
    }

    // Do not guess a timezone for timestamp values.
    return "Time TBD";
}


/* =========================================
   WEEKLY SCHEDULE — GAMES + TEAM EVENTS
   ========================================= */

async function renderWeeklySchedule() {
    const weeklyDays =
        document.getElementById("weekly-days");

    const weekRange =
        document.getElementById("week-range");

    if (!weeklyDays || !weekRange) return;

    const requestId = ++weeklyScheduleRequest;

    const teamId =
        sessionStorage.getItem("selectedTeamId");

    const seasonId =
        sessionStorage.getItem("selectedSeasonId");

    const today = new Date();

    const monday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
    );

    const dayOfWeek = (today.getDay() + 6) % 7;

    monday.setDate(
        monday.getDate() - dayOfWeek + weekOffset * 7
    );

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const dateOptions = {
        month: "short",
        day: "numeric"
    };

    weekRange.textContent =
        monday.toLocaleDateString("en-US", dateOptions) +
        " – " +
        sunday.toLocaleDateString("en-US", dateOptions);

    weeklyDays.textContent = "Loading schedule...";

    let games = [];
    let teamEvents = [];

    if (teamId && seasonId) {
        const startDate = formatScheduleDate(monday);
        const endDate = formatScheduleDate(sunday);

        // Load basketball games.
        const gamesResult = await supabaseClient
            .from("games")
            .select("*")
            .eq("team_id", teamId)
            .eq("seasons_id", seasonId)
            .gte("date", startDate)
            .lte("date", endDate)
            .order("date", { ascending: true });

        // Load practices, meetings, training, etc.
        const eventsResult = await supabaseClient
            .from("team_events")
            .select("*")
            .eq("team_id", teamId)
            .eq("seasons_id", seasonId)
            .gte("event_date", startDate)
            .lte("event_date", endDate)
            .order("event_date", { ascending: true });

        // Prevent older requests from replacing new data.
        if (requestId !== weeklyScheduleRequest) return;

        if (
            sessionStorage.getItem("selectedTeamId") !== teamId ||
            sessionStorage.getItem("selectedSeasonId") !== seasonId
        ) {
            return;
        }

        if (gamesResult.error || eventsResult.error) {
            console.error(
                "Weekly schedule errors:",
                gamesResult.error,
                eventsResult.error
            );

            weeklyDays.textContent =
                "Unable to load this week's schedule.";

            return;
        }

        games = (gamesResult.data || []).filter(game =>
            !["cancelled", "canceled"].includes(game.status)
        );

        teamEvents = eventsResult.data || [];
    }

    if (requestId !== weeklyScheduleRequest) return;

    weeklyDays.replaceChildren();

    // Build seven day cards.
    for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);

        const dateKey = formatScheduleDate(date);

        const dayGames = games.filter(game =>
            String(game.date).slice(0, 10) === dateKey
        );

        const dayEvents = teamEvents.filter(event =>
            String(event.event_date).slice(0, 10) === dateKey
        );

        const dayCard = document.createElement("div");
        dayCard.className = "weekly-day";

        const dayName = document.createElement("span");
        dayName.className = "day-name";
        dayName.textContent = date.toLocaleDateString(
            "en-US",
            { weekday: "short" }
        );

        const dayNumber = document.createElement("span");
        dayNumber.className = "day-number";
        dayNumber.textContent = date.getDate();

        dayCard.append(dayName, dayNumber);

        if (dateKey === formatScheduleDate(today)) {
            dayCard.classList.add("selected");
        }

        // Keep existing game highlighting.
        if (dayGames.length > 0) {
            const hasAwayGame = dayGames.some(game =>
                String(game.location || "")
                    .toLowerCase() === "away"
            );

            dayCard.classList.add(
                hasAwayGame ? "away-game" : "home-game"
            );
        } else if (dayEvents.length > 0) {
            dayCard.classList.add("team-event");
        }

        // Render basketball games.
        dayGames.forEach(game => {
            const gameInfo = document.createElement("div");
            gameInfo.className = "weekly-game-info";

            const venue = document.createElement("span");
            venue.className = "weekly-game-location";

            const location =
                String(game.location || "").toLowerCase();

            venue.textContent =
                location === "away" ? "AWAY" :
                location === "home" ? "HOME" :
                "GAME";

            const opponent = document.createElement("span");
            opponent.className = "weekly-game-opponent";
            opponent.textContent = game.opponent || "TBD";

            const time = document.createElement("span");
            time.className = "weekly-game-time";
            time.textContent = formatGameTime(game);

            gameInfo.append(venue, opponent, time);
            dayCard.appendChild(gameInfo);
        });

        // Render practices, meetings and other events.
        dayEvents.forEach(event => {
            const eventInfo = document.createElement("div");
            eventInfo.className =
                "weekly-game-info weekly-team-event";

            const type = document.createElement("span");
            type.className = "weekly-game-location";

            const labels = {
                practice: "PRACTICE",
                meeting: "MEETING",
                training: "TRAINING",
                other: "EVENT"
            };

            type.textContent =
                labels[event.event_type] || "EVENT";

            const title = document.createElement("span");
            title.className = "weekly-game-opponent";
            title.textContent =
                event.title || "Team Event";

            const time = document.createElement("span");
            time.className = "weekly-game-time";

            const formatTime = value => {
                if (!value) return "";

                const [hours, minutes] =
                    String(value).split(":");

                const hour = Number(hours);

                return (
                    (hour % 12 || 12) +
                    ":" + minutes +
                    (hour >= 12 ? " PM" : " AM")
                );
            };

            const start = formatTime(event.start_time);
            const end = formatTime(event.end_time);

            time.textContent =
                start + (end ? " – " + end : "");

            const location = document.createElement("span");
            location.className = "weekly-event-venue";
            location.textContent = event.location || "";

            eventInfo.append(type, title, time, location);
            dayCard.appendChild(eventInfo);
        });

        // Show dash only when nothing is scheduled.
        if (
            dayGames.length === 0 &&
            dayEvents.length === 0
        ) {
            const empty = document.createElement("span");
            empty.className = "weekly-no-game";
            empty.textContent = "—";

            dayCard.appendChild(empty);
        }

        weeklyDays.appendChild(dayCard);
    }
}

document.getElementById("previous-week")
    ?.addEventListener("click", () => {
        weekOffset--;
        renderWeeklySchedule();
    });

document.getElementById("next-week")
    ?.addEventListener("click", () => {
        weekOffset++;
        renderWeeklySchedule();
    });

const sampleEvents = [
    {
        day: 0,
        type: "Practice",
        title: "Team Practice",
        time: "4:00 PM – 5:30 PM",
        location: "Main Gym"
    },
    {
        day: 2,
        type: "Game",
        title: "Cavaliers vs Titans",
        time: "6:30 PM",
        location: "Home Gym"
    },
    {
        day: 5,
        type: "Game",
        title: "Cavaliers vs Wolves",
        time: "2:00 PM",
        location: "Away"
    }
];
function displayDailyEvents(dayIndex) {
    const eventsList = document.getElementById("daily-events-list");

    const events = sampleEvents.filter(function(event) {
        return event.day === dayIndex;
    });

    eventsList.innerHTML = "";

    if (events.length === 0) {
        eventsList.textContent = "No events scheduled.";
        return;
    }

    events.forEach(function(event) {
        const eventCard = document.createElement("div");
        eventCard.classList.add("daily-event-card");

        eventCard.innerHTML = `
            <span class="event-type">${event.type}</span>
            <h4>${event.title}</h4>
            <p>${event.time} · ${event.location}</p>
        `;

        eventsList.appendChild(eventCard);
    });
}
renderWeeklySchedule()

const sampleGoals = [
    {
        name: "Season Wins",
        current: 8,
        target: 15,
        unit: ""
    },
    {
        name: "Points per Game",
        current: 52.5,
        target: 60,
        unit: ""
    },
    {
        name: "Free Throw %",
        current: 68,
        target: 75,
        unit: "%"
    }
];

function renderTeamGoals() {
    const goalsList = document.getElementById("team-goals-list");

    goalsList.innerHTML = "";

    sampleGoals.forEach(function(goal) {
        const progress = goal.target > 0
            ? Math.min((goal.current / goal.target) * 100, 100)
            : 0;

        const goalElement = document.createElement("div");
        goalElement.classList.add("goal-item");

        goalElement.innerHTML = `
            <div class="goal-header">
                <h3>${goal.name}</h3>
                <span>${goal.current}${goal.unit} / ${goal.target}${goal.unit}</span>
            </div>

            <div class="goal-progress-track">
                <div class="goal-progress-fill" style="width: ${progress}%"></div>
            </div>

            <p class="goal-percentage">${Math.round(progress)}%</p>
        `;

        goalsList.appendChild(goalElement);
    });
}


/* =========================================
   SCORIDIUM DASHBOARD ROSTER
   ========================================= */

function getPlayerLevel(grade) {
    const levels = {
        9: "Freshman",
        10: "Sophomore",
        11: "Junior",
        12: "Senior"
    };

    return levels[Number(grade)] || "—";
}

function createDashboardPlayerCard(player, stats, teamId, seasonId) {
    const primary = getComputedStyle(document.documentElement)
        .getPropertyValue("--team-primary").trim() || "#123B78";

    const secondary = getComputedStyle(document.documentElement)
        .getPropertyValue("--team-secondary").trim() || "#FFD600";

    const card = document.createElement("a");
    card.className = "dashboard-player-card";

    const params = new URLSearchParams({
        playerId: player.id,
        teamId: teamId
    });

    if (seasonId) params.set("seasonId", seasonId);

    card.href = `player.html?${params.toString()}`;

    const identity = document.createElement("div");
    identity.className = "card-identity";

    const jersey = document.createElement("div");
    jersey.className = "card-jersey";

    
/* =========================================
   SLEEVELESS BASKETBALL JERSEY
   ========================================= */

const ns = "http://www.w3.org/2000/svg";

const svg = document.createElementNS(ns, "svg");
svg.setAttribute("viewBox", "0 0 100 120");
svg.setAttribute("aria-hidden", "true");

// Jersey body: rounded neckline, deep armholes,
// straight sides and flat bottom.
const shape = document.createElementNS(ns, "path");

shape.setAttribute(
    "d",
    "M18 10 " +
    "L36 6 " +
    "Q50 22 64 6 " +
    "L82 10 " +
    "L82 28 " +
    "Q82 42 96 54 " +
    "L96 116 " +
    "L4 116 " +
    "L4 54 " +
    "Q18 42 18 28 " +
    "Z"
);

shape.setAttribute("fill", primary);
shape.setAttribute("stroke", secondary);
shape.setAttribute("stroke-width", "3.5");
shape.setAttribute("stroke-linejoin", "round");

// The inner neckline makes the jersey look
// closer to the reference image.
const neckline = document.createElementNS(ns, "path");

neckline.setAttribute(
    "d",
    "M36 6 Q50 40 64 6"
);

neckline.setAttribute("fill", "none");
neckline.setAttribute("stroke", secondary);
neckline.setAttribute("stroke-width", "5");
neckline.setAttribute("stroke-linecap", "round");

// Player number on the jersey
const jerseyNumber = document.createElementNS(ns, "text");

jerseyNumber.setAttribute("x", "50");
jerseyNumber.setAttribute("y", "80");
jerseyNumber.setAttribute("text-anchor", "middle");
jerseyNumber.setAttribute("dominant-baseline", "middle");
jerseyNumber.setAttribute("font-size", "40");
jerseyNumber.setAttribute("font-weight", "900");
jerseyNumber.setAttribute("font-family", "Arial, sans-serif");
jerseyNumber.setAttribute("fill", secondary);

jerseyNumber.textContent = player.number ?? "—";

svg.append(shape, neckline, jerseyNumber);
jersey.appendChild(svg);


    const name = document.createElement("div");
    name.className = "card-name";
    name.textContent =
        `${player.first_name || ""} ${player.last_name || ""}`.trim()
        || player.name || "Unnamed Player";

    
    const level = document.createElement("div");
    level.className = "card-grade";
    level.textContent = getPlayerLevel(player.grade);

    identity.append(jersey, name, level);


    const statRow = document.createElement("div");
    statRow.className = "card-stats";

    [
        ["PTS", stats.pts],
        ["RBS", stats.reb],
        ["ASTS", stats.ast]
    ].forEach(([label, value]) => {
        const stat = document.createElement("div");
        stat.className = "card-stat";

        const amount = document.createElement("strong");
        amount.textContent = value;

        const caption = document.createElement("span");
        caption.textContent = label;

        stat.append(amount, caption);
        statRow.appendChild(stat);
    });

    card.append(identity, statRow);

    return card;
}

function createDashboardCoachCard(role) {
    const card = document.createElement("div");
    card.className = "dashboard-player-card";

    const top = document.createElement("div");
    top.className = "card-top";

    const roleLabel = document.createElement("span");
    roleLabel.className = "card-level";
    roleLabel.textContent = role;

    top.append(roleLabel);

    const identity = document.createElement("div");
    identity.className = "card-identity";

    const symbol = document.createElement("div");
    symbol.className = "staff-symbol";
    symbol.textContent = "♟";

    const name = document.createElement("div");
    name.className = "card-name";
    name.textContent = "Not assigned";

    identity.append(symbol, name);
    card.append(top, identity);

    return card;
}

let dashboardRosterRequest = 0;

async function loadDashboardRoster() {
    const track = document.getElementById("dashboard-roster-track");
    if (!track) return;

    const requestId = ++dashboardRosterRequest;
    const teamId = sessionStorage.getItem("selectedTeamId");
    const seasonId = sessionStorage.getItem("selectedSeasonId");

    if (!teamId) {
        track.textContent = "Select a team to view the roster.";
        return;
    }

    track.textContent = "Loading roster...";

    // Load actual team players.
    const { data: players, error: playerError } =
        await supabaseClient
            .from("players")
            .select("*")
            .eq("team_id", teamId);

    if (requestId !== dashboardRosterRequest) return;

    if (playerError) {
        console.error("Roster error:", playerError);
        track.textContent = "Unable to load players.";
        return;
    }

    // Only completed games from the selected season.
    let games = [];

    if (seasonId) {
        const result = await supabaseClient
            .from("games")
            .select("id")
            .eq("team_id", teamId)
            .eq("seasons_id", seasonId)
            .eq("status", "completed");

        if (result.error) {
            console.error("Roster games error:", result.error);
            track.textContent = "Unable to load season games.";
            return;
        }

        games = result.data || [];
    }

    const gameIds = games.map(game => game.id);
    const playerTotals = new Map();

    // Read events in pages to avoid the 1,000-row response limit.
    for (let i = 0; i < gameIds.length; i += 40) {
        const chunk = gameIds.slice(i, i + 40);

        for (let offset = 0; ; offset += 500) {
            const result = await supabaseClient
                .from("game_events")
                .select("id, game_id, player_id, team, type, made, points")
                .in("game_id", chunk)
                .order("id", { ascending: true })
                .range(offset, offset + 499);

            if (requestId !== dashboardRosterRequest) return;

            if (result.error) {
                console.error("Roster stats error:", result.error);
                track.textContent = "Unable to load player statistics.";
                return;
            }

            const events = result.data || [];

            events.forEach(event => {
                if (event.team !== "us" || !event.player_id) return;

                const totals = playerTotals.get(event.player_id) || {
                    pts: 0,
                    reb: 0,
                    ast: 0
                };

                if (event.type === "shot" && event.made === true) {
                    totals.pts += Number(event.points || 0);
                }

                if (event.type === "free_throw" && event.made === true) {
                    totals.pts += 1;
                }

                if (
                    event.type === "offensive_rebound" ||
                    event.type === "defensive_rebound"
                ) {
                    totals.reb++;
                }

                if (event.type === "assist") {
                    totals.ast++;
                }

                playerTotals.set(event.player_id, totals);
            });

            if (events.length < 500) break;
        }
    }

    if (requestId !== dashboardRosterRequest) return;

    track.replaceChildren();

    track.append(
        createDashboardCoachCard("HEAD COACH"),
        createDashboardCoachCard("ASSISTANT COACH")
    );

    const sortedPlayers = [...(players || [])].sort(
        (a, b) => Number(a.number || 0) - Number(b.number || 0)
    );

    const gameCount = games.length;

    sortedPlayers.forEach(player => {
        const totals = playerTotals.get(player.id) || {
            pts: 0,
            reb: 0,
            ast: 0
        };

        const avg = value =>
            gameCount ? (value / gameCount).toFixed(1) : "—";

        track.appendChild(
            createDashboardPlayerCard(
                player,
                {
                    pts: avg(totals.pts),
                    reb: avg(totals.reb),
                    ast: avg(totals.ast)
                },
                teamId,
                seasonId
            )
        );
    });
    // Duplicate the cards for seamless infinite scrolling.
    const cards = [...track.children];

    cards.forEach(card => {
        const duplicate = card.cloneNode(true);
        duplicate.setAttribute("aria-hidden", "true");
        duplicate.setAttribute("inert", "");
        track.appendChild(duplicate);
    });

    track.scrollLeft = 0;
    track.classList.add("roster-auto-scroll");

    startDashboardRosterAutoScroll();

}


function initializeDashboardRoster() {
    loadDashboardRoster();
}


window.addEventListener("seasonChanged", loadDashboardRoster);


/* =========================================
   AUTOMATIC ROSTER SCROLLING
   ========================================= */

let rosterAnimationFrame = null;
let rosterLastFrameTime = null;


/* =========================================
   SMOOTH AUTOMATIC ROSTER SCROLLING
   ========================================= */


function startDashboardRosterAutoScroll() {
    const track = document.getElementById("dashboard-roster-track");
    if (!track) return;

    // Stop any existing animations.
    track.getAnimations().forEach(animation => animation.cancel());

    // Find the first duplicated card.
    const firstDuplicate = track.querySelector(
        '[aria-hidden="true"]'
    );

    const firstCard = track.firstElementChild;

    if (!firstDuplicate || !firstCard) return;

    // Calculate the distance between original and duplicate cards.
    
const cardCount = track.querySelectorAll(
    ".dashboard-player-card"
).length / 2;

const trackStyles = getComputedStyle(track);
const gap = parseFloat(trackStyles.columnGap) || 0;

const originalCards = [...track.children].slice(0, cardCount);

const loopDistance = originalCards.reduce(
    (total, card) => total + card.getBoundingClientRect().width + gap,
    0
);

console.log("Roster loop distance:", loopDistance);


    // Prevent invalid animation durations.
    if (!Number.isFinite(loopDistance) || loopDistance <= 0) {
        console.warn("Invalid roster scroll distance:", loopDistance);
        return;
    }

    const speed = 28;
    const duration = (loopDistance / speed) * 1000;

    if (!Number.isFinite(duration) || duration <= 0) {
        console.warn("Invalid roster animation duration:", duration);
        return;
    }

    // Respect reduced-motion preferences.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
    }

    const animation = track.animate(
        [
            { transform: "translateX(0px)" },
            { transform: `translateX(-${loopDistance}px)` }
        ],
        {
            duration: duration,
            iterations: Infinity,
            easing: "linear"
        }
    );

    const pause = () => animation.pause();

    const resume = () => {
        if (!document.hidden) {
            animation.play();
        }
    };

    track.addEventListener("mouseenter", pause);
    track.addEventListener("mouseleave", resume);
    track.addEventListener("focusin", pause);
    track.addEventListener("focusout", resume);
}

