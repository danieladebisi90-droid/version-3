/* Basketball Game Tracker — Supabase-backed with local recovery journal.
   Requires authenticated users and database-enforced RLS. The browser alone
   cannot authorize tracking or prevent conflicting edits across devices. */

const params = new URLSearchParams(location.search);
const gameId = params.get("gameId");
const key = `basketball-tracker-v2:${gameId || "demo"}`;
const $ = (id) => document.getElementById(id);
let players =  [];
async function loadGameRoster() {
    if (!currentGame) return;

    const { data, error } = await supabaseClient
        .from("players")
        .select("id, first_name, last_name, number")
        .eq("team_id", currentGame.team_id)
        .order("number");

    if (error) {
        console.error("Error loading game roster:", error);
        return;
    }

    players = data.map(player => ({
        id: player.id,
        name: `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim(),
        number: player.number ?? ""
    }));

    console.log("Game roster loaded:", players);

    renderPlayers();
}
let selectedPlayerId = null;
let pendingShot = null;
let courtView = "full";
let courtSide = "home";
let currentGame = null;
let teamName = "OUR TEAM";
let state = { period: 1, status: "not_started", events: [] };

// Official FIBA court measurements (metres)
const FIBA_COURT = {
    length: 28,
    width: 15,
    halfCourtLength: 14,
    hoopDistanceFromBaseline: 1.575,
    threePointRadius: 6.75,
    paintWidth: 4.9
};

try {
  const saved = JSON.parse(localStorage.getItem(key) || "null");
  if (saved && Array.isArray(saved.events)) {
    state = { period: saved.period || 1, status: saved.status || "not_started", events: saved.events };
  }
} catch (error) { console.warn("Could not read saved tracker events", error); }


function syncStatisticsGame() {
    // Only completed games contribute to statistics.
    if (
        !gameId ||
        !currentGame ||
        currentGame.status !== "completed"
    ) {
        return;
    }

    // Keep the rest of your existing function here.


    const statsKey = "basketballStatsGames";

    const shotEvents = state.events.filter(
        event => event.type === "shot"
    );

    // Create player statistics from recorded events.
    const playerMap = new Map();

    function createPlayer(id) {
        const player = players.find(
            p => String(p.id) === String(id)
        );

        return {
            id: String(id),
            number: player?.number ?? "",
            name: player?.name ??
                  player?.last_name ??
                  "Unassigned",
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
fta: 0,
totalShotDistance: 0,
shotsWithDistance: 0,
avgShotDistance: null
        };
    }

    players.forEach(player => {
        playerMap.set(
            String(player.id),
            createPlayer(player.id)
        );
    });

    state.events.forEach(event => {
        if (event.team !== "us") return;

        // Keep unassigned team stats instead of losing them.
        const id = event.playerId == null
            ? "__unassigned__"
            : String(event.playerId);

        if (!playerMap.has(id)) {
            playerMap.set(id, createPlayer(id));
        }

        const p = playerMap.get(id);

        switch (event.type) {
            case "shot":
                p.fga++;
                if (typeof event.distanceFeet === "number" &&
                    Number.isFinite(event.distanceFeet)
                    ) {
                    p.totalShotDistance += event.distanceFeet;
                    p.shotsWithDistance++;
                }
                if (event.points === 3) p.threeAtt++;

                if (event.made) {
                    p.fgm++;
                    p.pts += Number(event.points);
                    if (event.points === 3) p.threeMade++;
                }
                break;

            case "free_throw":
                p.fta++;
                if (event.made) {
                    p.ftm++;
                    p.pts++;
                }
                break;

            case "offensive_rebound":
                p.oreb++;
                p.reb++;
                break;

            case "defensive_rebound":
                p.dreb++;
                p.reb++;
                break;

            case "assist": p.ast++; break;
            case "steal": p.stl++; break;
            case "block": p.blk++; break;
            case "turnover": p.tov++; break;
            case "foul": p.pf++; break;
        }
    });

    // Calculate points scored during each period.
    const quarters = [];

    for (let period = 1; period <= Math.max(4, state.period); period++) {
        const events = state.events.filter(
            event => event.period === period
        );

        quarters.push(
            events.reduce((totals, event) => {
                const points = event.made === false
                    ? 0
                    : Number(event.points || 0);

                if (event.team === "us") {
                    totals.us += points;
                } else if (event.team === "opponent") {
                    totals.opponent += points;
                }

                return totals;
            }, { us: 0, opponent: 0 })
        );
    }

    playerMap.forEach(player => {
    player.avgShotDistance =
        player.shotsWithDistance > 0
            ? Math.round(
                player.totalShotDistance /
                player.shotsWithDistance
            )
            : null;
    });

    const total = scores();

    const gameRecord = {
        id: String(gameId),
        date: String(
            currentGame.game_date ??
            currentGame.date ??
            currentGame.scheduled_at ??
            ""
        ).slice(0, 10),
        season: String(currentGame.seasons_id ?? "Unknown"),
        team: teamName,
        opponent: currentGame.opponent ?? "Opponent",
        location: currentGame.location ?? "Home",
        ourScore: total.us,
        opponentScore: total.opponent,
        players: [...playerMap.values()],
        shots: shotEvents.map(event => ({
            playerId: event.playerId,
            x: event.x,
            y: event.y,
            made: event.made,
            points: event.points,
            team: event.team,
            period: event.period,
            distanceMeters: event.distanceMeters ?? null,
            distanceFeet: event.distanceFeet ?? null
        })),
        quarters,
        plays: state.events.map(event => ({
            period: periodName(event.period),
            description: eventDescription(event)
        }))
    };

    // Read any existing Statistics games.
    let storedGames = [];

    try {
        const stored = localStorage.getItem(statsKey);

        if (stored !== null) {
            const parsed = JSON.parse(stored);

            if (!Array.isArray(parsed)) {
                console.error("Statistics storage is not an array.");
                return;
            }

            storedGames = parsed;
        }
    } catch (error) {
        console.error("Could not read Statistics games:", error);
        return;
    }

    // Update an existing game instead of creating duplicates.
    const index = storedGames.findIndex(
        game => String(game.id) === String(gameId)
    );

    if (index >= 0) {
        storedGames[index] = gameRecord;
    } else {
        storedGames.push(gameRecord);
    }

    try {
        localStorage.setItem(
            statsKey,
            JSON.stringify(storedGames)
        );
    } catch (error) {
        console.error("Could not save Statistics data:", error);
    }
}


function save() {
  localStorage.setItem(key, JSON.stringify(state));
  syncStatisticsGame();
}


function detectShot(x, y) {
    const isLeftSide = x < 430;

// Teams switch baskets at halftime
const switchedEnds = state.period >= 3;

const team = isLeftSide
    ? (switchedEnds ? "away" : "home")
    : (switchedEnds ? "home" : "away");

    // Hoop positions
    const hoopX = isLeftSide ? 57.25 : 802.75;
    const hoopY = 235;

    // FIBA three-point measurements
    // FIBA three-point measurements
const radius = FIBA_COURT.threePointRadius * 30;

const distance = Math.hypot(
    x - hoopX,
    y - hoopY
);

// Straight corner-three boundaries
const cornerTop = 37;
const cornerBottom = 433;

// Distance from the basket to where the
// straight corner lines meet the arc
const arcOffset = Math.sqrt(
    radius ** 2 - (hoopY - cornerTop) ** 2
);

const arcStartX = isLeftSide
    ? hoopX + arcOffset
    : hoopX - arcOffset;

// Beyond the corner-three lines
const outsideCornerLines =
    y < cornerTop || y > cornerBottom;

// Three-point classification
const isThree = isLeftSide
    ? (
        x <= arcStartX
            ? outsideCornerLines
            : distance > radius
    )
    : (
        x >= arcStartX
            ? outsideCornerLines
            : distance > radius
    );

    return {
        team,
        points: isThree ? 3 : 2
    };
}


function calculateShotDistance(x, y) {

    // Determine which basket the shot is near
    const isLeftSide = x < 430;

    // FIBA hoop coordinates
    const hoopX = isLeftSide ? 57.25 : 802.75;
    const hoopY = 235;

    // Distance in SVG units
    const distanceSVG = Math.hypot(
        x - hoopX,
        y - hoopY
    );

    // Convert SVG units to metres
    const meters = distanceSVG / 30;

    // Convert metres to feet
    const feet = meters * 3.28084;

    return {
        meters: Number(meters.toFixed(2)),
        feet: Number(feet.toFixed(2))
    };
}

function periodName(period) { return period <= 4 ? `Q${period}` : `OT${period - 4}`; }
function scores(events = state.events) {
  return events.reduce((result, event) => {
    const points = event.made === false ? 0 : Number(event.points || 0);
    if (event.team === "us") result.us += points;
    if (event.team === "opponent") result.opponent += points;
    return result;
  }, { us: 0, opponent: 0 });
}

let eventSyncQueue = Promise.resolve();
let pendingEventSyncs = 0;
const pendingEventIds = new Set();
const eventSyncFailureKey = `event-sync-failed:${gameId || "demo"}`;
const eventRecoveryKey = `event-recovery:${gameId || "demo"}`;
const confirmedEventsKey = `confirmed-game-events:${gameId || "demo"}`;
let eventSyncHasFailed = localStorage.getItem(eventSyncFailureKey) === "true";
let recoveryInProgress = false;
let recoveryTimer = null;

function getEventRecoveryQueue() {
    try {
        const parsed = JSON.parse(localStorage.getItem(eventRecoveryKey) || "[]");
        if (!Array.isArray(parsed)) throw new Error("Not an array");
        return parsed;
    } catch (error) {
        // Never discard malformed journal entries silently.
        reportEventSyncError(error);
        return null;
    }
}

function saveEventRecoveryQueue(operations) {
    localStorage.setItem(eventRecoveryKey, JSON.stringify(operations));
}

function saveConfirmedEventIds(ids) {
    localStorage.setItem(confirmedEventsKey, JSON.stringify([...ids]));
}
function getConfirmedEventIds() {
    try {
        const values = JSON.parse(localStorage.getItem(confirmedEventsKey) || "[]");
        return new Set(Array.isArray(values) ? values : []);
    } catch (error) {
        reportEventSyncError(error);
        return new Set();
    }
}

function setSyncFailed(error) {
    eventSyncHasFailed = true;
    localStorage.setItem(eventSyncFailureKey, "true");
    if (error) console.error("Game event sync failed:", error);
    if ($("saving-note")) $("saving-note").textContent = "SYNC FAILED — WILL RETRY";
}
function reportEventSyncError(error) { setSyncFailed(error); }

function addEventRecoveryOperation(operation) {
    const entries = getEventRecoveryQueue();
    if (!entries || !["upsert", "delete", "player_update"].includes(operation.type) ||
        !Array.isArray(operation.eventIds) || !operation.eventIds.length) {
        setSyncFailed(new Error("Could not record recovery operation"));
        return null;
    }
    const entry = { id: crypto.randomUUID(), createdAt: Date.now(), ...operation };
    try { saveEventRecoveryQueue([...entries, entry]); }
    catch (error) { setSyncFailed(error); return null; }
    return entry.id;
}


function createEventRecoveryOperation(type, eventIds, eventData = null) {
    const ids = Array.isArray(eventIds)
        ? eventIds
        : [eventIds];

    const allowedTypes = [
        "upsert",
        "delete",
        "player_update"
    ];

    if (!allowedTypes.includes(type)) {
        console.error("Unsupported recovery type:", type);
        return null;
    }

    if (!ids.length || ids.some(id => !id)) {
        console.error("Invalid recovery event IDs:", ids);
        return null;
    }

    if (type !== "delete") {
        if (!eventData || eventData.id !== ids[0]) {
            console.error("Missing or mismatched event data.");
            return null;
        }
    }

    if (type === "player_update") {
        const version = Number(eventData.expectedVersion);

        if (!Number.isInteger(version) || version < 1) {
            console.error("Invalid player assignment version.");
            return null;
        }
    }

    return addEventRecoveryOperation({
        type,
        eventId: ids[0],
        eventIds: ids,
        eventData: eventData ? { ...eventData } : null
    });
}

function removeEventRecoveryOperation(operationId) {
    const entries = getEventRecoveryQueue();
    if (!entries) return false;
    saveEventRecoveryQueue(entries.filter(entry => entry.id !== operationId));
    return entries.some(entry => entry.id === operationId);
}

function queueEventSync(operation, eventIds = []) {
    pendingEventSyncs++;
    eventIds.forEach(id => pendingEventIds.add(id));
    const task = eventSyncQueue.catch(() => {}).then(async () => {
        const result = await operation();
        if (result === false) throw new Error("Supabase event synchronization failed");
        return result;
    });
    eventSyncQueue = task;
    void task.then(() => {}, () => {}).finally(() => {
        pendingEventSyncs--;
        eventIds.forEach(id => pendingEventIds.delete(id));
    });
    return task;
}



function trackEventWrite(type, eventIds, eventData = null) {
    const ids = Array.isArray(eventIds)
        ? eventIds
        : [eventIds];

    const isVersionedEdit =
        type === "player_update" ||
        (
            type === "upsert" &&
            eventData != null &&
            eventData.expectedVersion != null
        );

    if (isVersionedEdit) {
        const version = Number(eventData?.expectedVersion);

        if (!Number.isInteger(version) || version < 1) {
            reportEventSyncError(
                new Error("Invalid expected event version")
            );

            return Promise.resolve(false);
        }
    }

    const entryId = createEventRecoveryOperation(
        type,
        ids,
        eventData
    );

    if (!entryId) {
        reportEventSyncError(
            new Error("Could not create recovery operation")
        );

        return Promise.resolve(false);
    }

    const action = () => {
        if (type === "delete") {
            return deleteEventsFromSupabase(ids);
        }

        if (type === "player_update") {
            return updatePlayerInSupabase(eventData);
        }

        if (type === "upsert" && isVersionedEdit) {
            return updateShotInSupabase(eventData);
        }

        if (type === "upsert") {
            return saveEventToSupabase(eventData);
        }

        return false;
    };

    return queueEventSync(action, ids)
        .then(() => {
            removeEventRecoveryOperation(entryId);
            return true;
        })
        
        .catch(error => {
            reportEventSyncError(error);

    // Keep the recovery journal intact.
    // Retry when the connection is available.
    scheduleGameRecovery(2000);

    return false;
});

}

function coordinatesMatch(a, b) {
    if (a == null || b == null) {
        return a == null && b == null;
    }

    return (
        Number.isFinite(Number(a)) &&
        Number.isFinite(Number(b)) &&
        Math.abs(Number(a) - Number(b)) < 0.000001
    );
}

function eventDataMatches(local, remote) {
    return remote && local.id === remote.id &&
        local.type === remote.type && local.team === remote.team &&
        Number(local.period) === Number(remote.period) &&
        (local.made ?? null) === (remote.made ?? null) &&
        (local.playerId ?? null) === (remote.player_id ?? null) &&
        (local.points ?? null) === (remote.points ?? null) &&
        coordinatesMatch(local.x, remote.x) &&
        coordinatesMatch(local.y, remote.y) &&
        (local.linkedEventId ?? null) === (remote.linked_event_id ?? null) &&
        (local.distanceMeters ?? null) === (remote.distance_meters ?? null) &&
        (local.distanceFeet ?? null) === (remote.distance_feet ?? null);
}

async function verifyWholeGameEvents() {
    const {data, error} = await supabaseClient.from("game_events")
        .select("*").eq("game_id", gameId);
    if (error || !data) { console.error("Verification failed:", error); return false; }
    const byId = new Map(data.map(e => [e.id, e]));
    if (state.events.length !== data.length ||
        !state.events.every(e => eventDataMatches(e, byId.get(e.id)))) {
        console.warn("Local and remote events differ. Recovery flag retained.");
        return false;
    }
    saveConfirmedEventIds(new Set(data.map(e => e.id)));
    return true;
}

async function recoverPendingGameEvents() {
    if (
        recoveryInProgress ||
        !navigator.onLine ||
        !currentGame ||
        !gameId
    ) return false;

    recoveryInProgress = true;

    try {
        if (pendingEventSyncs > 0) return false;

        try {
            await eventSyncQueue;
        } catch (_) {
            // Previous synchronization failure.
        }

        if (pendingEventSyncs > 0) return false;

        const operations = getEventRecoveryQueue();

        if (!Array.isArray(operations)) {
            setSyncFailed(
                new Error("Recovery queue is invalid")
            );
            return false;
        }

        for (const operation of operations) {
            if (pendingEventSyncs > 0) return false;

            if (
                !operation.eventIds?.length ||
                !["upsert", "delete", "player_update"]
                    .includes(operation.type)
            ) {
                setSyncFailed(
                    new Error("Unsupported recovery operation")
                );
                return false;
            }

            const currentEvent = state.events.find(
                event => event.id === operation.eventId
            );

            // Handle deletions first.
            if (operation.type === "delete" || !currentEvent) {
                const deleted = await deleteEventsFromSupabase(
                    operation.eventIds
                );

                if (!deleted) {
                    setSyncFailed(
                        new Error("Deletion recovery failed")
                    );
                    return false;
                }

                removeEventRecoveryOperation(operation.id);
                continue;
            }

            if (
                !operation.eventData ||
                operation.eventData.id !== operation.eventId
            ) {
                setSyncFailed(
                    new Error("Invalid recovery event data")
                );
                return false;
            }

            const { data, error } = await supabaseClient
                .from("game_events")
                .select("*")
                .eq("game_id", gameId)
                .eq("id", operation.eventId);

            if (error || !data) {
                setSyncFailed(
                    error || new Error("Recovery lookup failed")
                );
                return false;
            }

            const remote = data[0] ?? null;

            const previouslyConfirmed =
                getConfirmedEventIds().has(operation.eventId);

            // A remote deletion must not be undone
            // by an outdated offline edit.
            if (!remote && previouslyConfirmed) {
                console.warn(
                    "Remote deletion wins:",
                    operation.eventId
                );

                state.events = state.events.filter(
                    event => event.id !== operation.eventId
                );

                const confirmed = getConfirmedEventIds();
                confirmed.delete(operation.eventId);
                saveConfirmedEventIds(confirmed);

                save();
                render();

                removeEventRecoveryOperation(operation.id);
                continue;
            }

            const expectedVersion =
                operation.eventData.expectedVersion;

            const isVersionedEdit =
                operation.type === "player_update" ||
                expectedVersion != null;

            if (isVersionedEdit) {
                const version = Number(expectedVersion);

                if (!Number.isInteger(version) || version < 1) {
                    setSyncFailed(
                        new Error("Invalid expected version")
                    );
                    return false;
                }

                if (!remote) {
                    setSyncFailed(
                        new Error("Edited event missing remotely")
                    );
                    return false;
                }

                if (Number(remote.version) !== version) {
                    // The intended final event state
                    // may already have been saved.
                    if (eventDataMatches(currentEvent, remote)) {
                        currentEvent.version =
                            Number(remote.version);

                        save();

                        removeEventRecoveryOperation(operation.id);
                        continue;
                    }

                    console.warn(
                        "VERSION CONFLICT:",
                        operation.eventId
                    );

                    setSyncFailed(
                        new Error(
                            "Event version conflict requires resolution"
                        )
                    );

                    return false;
                }

                let updated = false;

                if (operation.type === "player_update") {
                    updated = await updatePlayerInSupabase({
                        ...currentEvent,
                        expectedVersion: version
                    });
                } else {
                    updated = await updateShotInSupabase({
                        ...currentEvent,
                        expectedVersion: version
                    });
                }

                if (!updated) {
                    setSyncFailed(
                        new Error(
                            "Version-checked recovery update failed"
                        )
                    );
                    return false;
                }

            } else if (!remote) {
                const inserted = await saveEventToSupabase(
                    currentEvent
                );

                if (!inserted) {
                    setSyncFailed(
                        new Error("Event creation recovery failed")
                    );
                    return false;
                }

            } else {
                // Do not overwrite an existing event
                // without an expected version.
                if (!eventDataMatches(currentEvent, remote)) {
                    setSyncFailed(
                        new Error("Unversioned event conflict")
                    );
                    return false;
                }
            }

            // Verify that Supabase now matches local state.
            const {
                data: verified,
                error: verifyError
            } = await supabaseClient
                .from("game_events")
                .select("*")
                .eq("game_id", gameId)
                .eq("id", operation.eventId);

            if (
                verifyError ||
                verified?.length !== 1 ||
                !eventDataMatches(currentEvent, verified[0])
            ) {
                setSyncFailed(
                    new Error("Recovery verification failed")
                );
                return false;
            }

            currentEvent.version =
                Number(verified[0].version);

            const confirmed = getConfirmedEventIds();
            confirmed.add(operation.eventId);
            saveConfirmedEventIds(confirmed);

            save();

            removeEventRecoveryOperation(operation.id);

            console.log(
                "Recovered operation:",
                operation.type,
                operation.eventId,
                "Version:",
                currentEvent.version
            );
        }

        if (
            pendingEventSyncs > 0 ||
            getEventRecoveryQueue()?.length !== 0
        ) return false;

        if (!(await verifyWholeGameEvents())) {
            setSyncFailed(
                new Error("Whole-game verification failed")
            );
            return false;
        }

        eventSyncHasFailed = false;
        localStorage.removeItem(eventSyncFailureKey);

        if ($("saving-note")) {
            $("saving-note").textContent = "SAVED TO SUPABASE";
        }

        console.log(
            "Game recovery complete and verified."
        );

        await loadGameEvents();

        return true;

    } catch (error) {
        setSyncFailed(error);
        return false;

    } finally {
        recoveryInProgress = false;
    }
}

function scheduleGameRecovery(delay = 400) {
    clearTimeout(recoveryTimer);
    recoveryTimer = setTimeout(() => {
        if (!currentGame || !navigator.onLine) return;
        const entries = getEventRecoveryQueue();
        if (entries?.length || eventSyncHasFailed) void recoverPendingGameEvents();
    }, delay);
}
window.addEventListener("online", () => scheduleGameRecovery(800));
window.addEventListener("focus", () => scheduleGameRecovery(500));
// Online may fire before a failed request has settled. Retry later as well.
setInterval(() => {
    const entries = getEventRecoveryQueue();
    if (navigator.onLine && !recoveryInProgress && pendingEventSyncs === 0 &&
        (entries?.length || eventSyncHasFailed)) scheduleGameRecovery(200);
}, 20000);


async function saveEventToSupabase(event) {
    if (!gameId || !currentGame || !event?.id) {
        return false;
    }

    const eventRow = {
        id: event.id,
        game_id: gameId,
        player_id: event.playerId ?? null,
        team: event.team,
        type: event.type,
        period: event.period,
        x: event.x ?? null,
        y: event.y ?? null,
        points: event.points ?? null,
        made: event.made ?? null,
        distance_meters: event.distanceMeters ?? null,
        distance_feet: event.distanceFeet ?? null,
        linked_event_id: event.linkedEventId ?? null
    };

    // First check whether this event already exists.
    const { data: existing, error: lookupError } =
        await supabaseClient
            .from("game_events")
            .select("id, version")
            .eq("game_id", gameId)
            .eq("id", event.id);

    if (lookupError) {
        console.error("Could not check existing event:", lookupError);
        return false;
    }

    if (existing.length > 0) {
        // Do not overwrite an existing event through an upsert.
        // Existing edits must use a version-checked update.
        console.warn(
            "Event already exists; unrestricted overwrite prevented:",
            event.id
        );

        return false;
    }

    // Insert new events only.
    const { data, error } = await supabaseClient
        .from("game_events")
        .insert(eventRow)
        .select("id, version");

    if (error) {
        console.error("Failed to create event:", error);
        return false;
    }

    if (data?.length !== 1) {
        console.error("New event was not confirmed:", event.id);
        return false;
    }

    
event.version = Number(data[0].version);

// Update the actual event in local state.
// Most callers send a copy of the event.
const localEvent = state.events.find(
    item => item.id === event.id
);

if (localEvent) {
    localEvent.version = event.version;
    save();
}


    const confirmed = getConfirmedEventIds();
    confirmed.add(event.id);
    saveConfirmedEventIds(confirmed);

    console.log(
        "New event saved:",
        event.id,
        "Version:",
        event.version
    );

    return true;
}

function addEvent(event) {
    if (state.status !== "live") {
        alert("Start the game before recording events.");
        return;
    }

    const newEvent = {
        id: crypto.randomUUID(),
        period: state.period,
        time: Date.now(),
        ...event
    };

    state.events.push(newEvent);

    // Preserve existing local functionality.
    save();
    render();

    // Save a copy to Supabase.
    void trackEventWrite("upsert", [newEvent.id], {...newEvent});
}

function recordStat(type, team, playerId = null) {
    if (state.status !== "live") {
        alert("Start the game before recording events.");
        return;
    }

    const event = {
        id: crypto.randomUUID(),
        period: state.period,
        time: Date.now(),
        type,
        team,
        playerId
    };

    state.events.push(event);

    // A steal automatically creates a turnover for the other team.
    if (type === "steal") {
        state.events.push({
    id: crypto.randomUUID(),
    period: state.period,
    time: Date.now(),
    type: "turnover",
    team: team === "us" ? "opponent" : "us",

    // If opponent steals, assign turnover to selected player
    playerId: team === "opponent" ? selectedPlayerId : null,

    linkedEventId: event.id
});
    }

    const newEvents = state.events.filter(
    e => e.id === event.id || e.linkedEventId === event.id
);


newEvents.forEach(newEvent => {
    const snapshot = { ...newEvent };

    void trackEventWrite("upsert", [snapshot.id], snapshot);
});

    save();
    render();
}

function shotValue(x, y) {
  // Matches the SVG's baseline corners and 200-radius three-point arc.
  // The center of the arc is (250,110). Boundary points are 2s.
  if (y <= 110) return (x < 50 || x > 450) ? 3 : 2;
  const distance = Math.hypot(x - 250, y - 110);
  return distance > 200 ? 3 : 2;
}

function playerName(id) {
  const player = players.find(p => String(p.id) === String(id));
  return player ? `#${player.number ?? "?"} ${player.name || player.last_name || "Player"}` : "Unassigned";
}

function eventDescription(event) {
  if (event.type === "period_end") return `End of ${periodName(event.period)}`;
  if (event.type === "game_end") return "Game finalized";
  if (event.type === "shot") {
    const name = event.team === "opponent"
        ? currentGame?.opponent || "OPPONENT"
        : playerName(event.playerId);

    const distance = Number.isFinite(event.distanceFeet)
        ? ` • ${Math.round(event.distanceFeet)} FT`
        : "";

    return `${name} — ${event.made ? "Made" : "Missed"} ${event.points}PT${distance}`;
}
 if (event.type === "free_throw") {
    const name = event.team === "opponent"
        ? currentGame?.opponent || "OPPONENT"
        : playerName(event.playerId);

    return `${name} — ${event.made ? "Made" : "Missed"} Free Throw`;
}
  if (event.type === "opponent_score") return `Opponent — +${event.points} points`;
  const names = { assist:"Assist", defensive_rebound:"Defensive rebound", offensive_rebound:"Offensive rebound", steal:"Steal", block:"Block", turnover:"Turnover", foul:"Personal foul" };
  const name = event.team === "opponent"
    ? currentGame?.opponent || "OPPONENT"
    : playerName(event.playerId);
if (event.type === "steal") {
    const stealingTeam = event.team === "us"
        ? playerName(event.playerId)
        : currentGame?.opponent || "OPPONENT";

    const losingTeam = event.team === "us"
        ? currentGame?.opponent || "OPPONENT"
        : teamName;

    return `${stealingTeam} — Steal / ${losingTeam} Turnover`;
}
return `${name} — ${names[event.type] || event.type}`;
}

function totalAt(index) { return scores(state.events.slice(0, index + 1)); }

function renderScoreboard() {
  const total = scores();
  const isHome = currentGame?.location?.toLowerCase() !== "away";
  $("home-name").textContent = isHome ? teamName : currentGame?.opponent || "OPPONENT";
  $("away-name").textContent = isHome ? currentGame?.opponent || "OPPONENT" : teamName;
  $("home-score").textContent = isHome ? total.us : total.opponent;
  $("away-score").textContent = isHome ? total.opponent : total.us;
  $("current-period").textContent = periodName(state.period);
  $("period-note").textContent = `Period ${periodName(state.period)}`;
  $("game-status").textContent = state.status.replaceAll("_", " ").toUpperCase();
  const live = state.status === "live";
  $("start-game").disabled = live || state.status === "final";
  $("start-game").textContent = state.status === "paused" ? "RESUME GAME" : "START GAME";
  $("end-quarter").disabled = !live;
  $("end-game").disabled = !live;
  $("undo-event").disabled = !live || state.events.length === 0;
  $("shot-dialog").hidden = !pendingShot;
  document.querySelectorAll("#tracker-controls button").forEach(button => { button.disabled = !live; });
  $("shot-dialog").querySelectorAll("button").forEach(button => { button.disabled = !live; });
  $("basketball-court").style.pointerEvents = live ? "auto" : "none";
}

function renderPlayers() {
    const grid = $("player-grid");
    grid.replaceChildren();

    players.forEach(player => {
        const button = document.createElement("button");

        // Jersey number only
        button.textContent = `#${player.number ?? "?"}`;

        const isSelected =
            String(player.id) === String(selectedPlayerId);

        if (isSelected) {
            button.classList.add("active");
        }

        button.addEventListener("click", () => {
            // Clicking the selected player again deselects them
            selectedPlayerId = isSelected ? null : player.id;

            renderPlayers();
            renderPlayerBox();
        });

        grid.appendChild(button);
    });
}


function getBasketState() {
    const ourName = teamName || "OUR TEAM";
    const oppName = currentGame?.opponent || "OPPONENT";

    const ourIsHome = currentGame?.location?.toLowerCase() !== "away";

    const homeTeamName = ourIsHome ? ourName : oppName;
    const awayTeamName = ourIsHome ? oppName : ourName;

    // switch ends at halftime
    const switchedEnds = state.period >= 3;

    const leftTeamName = switchedEnds
        ? awayTeamName
        : homeTeamName;

    const rightTeamName = switchedEnds
        ? homeTeamName
        : awayTeamName;

    return {
        homeTeamName,
        awayTeamName,
        leftTeamName,
        rightTeamName
    };
}

function renderCourtLabels() {
    const {
        homeTeamName,
        awayTeamName,
        leftTeamName,
        rightTeamName
    } = getBasketState();

    if ($("left-basket-label")) {
        $("left-basket-label").textContent = leftTeamName.toUpperCase();
    }

    if ($("right-basket-label")) {
        $("right-basket-label").textContent = rightTeamName.toUpperCase();
    }

    if ($("half-basket-label")) {
        $("half-basket-label").textContent =
            (courtSide === "home" ? homeTeamName : awayTeamName).toUpperCase();
    }
}


function getSelectedBasketSide() {
    const switched = state.period >= 3;

    if (courtSide === "home") {
        return switched ? "right" : "left";
    }

    return switched ? "left" : "right";
}

function displayToCourt(x, y) {
    if (courtView === "full") {
        return { x, y };
    }

    const selectedSide = getSelectedBasketSide();

    if (selectedSide === "left") {
        return {
            x: y,
            y: 470 - x
        };
    }

    return {
        x: 860 - y,
        y: x
    };
}

function courtToDisplay(x, y) {
    if (courtView === "full") {
        return { x, y };
    }

    const selectedSide = getSelectedBasketSide();

    const shotIsLeft = x < 430;

    if (
        (selectedSide === "left" && !shotIsLeft) ||
        (selectedSide === "right" && shotIsLeft)
    ) {
        return null;
    }

    if (selectedSide === "left") {
        return {
            x: 470 - y,
            y: x
        };
    }

    return {
        x: y,
        y: 860 - x
    };
}



function renderCourt() {
    renderCourtLabels();

    const markers = $("shot-markers");
    markers.replaceChildren();

    state.events
        .filter(event => event.type === "shot")
        .forEach(event => {

            // Convert saved coordinates to the current court view
            const position = courtToDisplay(
                Number(event.x),
                Number(event.y)
            );

            // Skip shots from the other half
            if (!position) return;

            const svgNS = "http://www.w3.org/2000/svg";

            if (event.made) {
                // MADE SHOT — SOLID GREEN CIRCLE
                const marker = document.createElementNS(
                    svgNS, "circle"
                );

                marker.setAttribute("cx", position.x);
                marker.setAttribute("cy", position.y);
                marker.setAttribute("r", "7");
                marker.setAttribute("fill", "#198754");
                marker.setAttribute("stroke", "none");

                markers.appendChild(marker);

            } else {
                // MISSED SHOT — RED X
                const marker = document.createElementNS(
                    svgNS, "path"
                );

                const x = position.x;
                const y = position.y;
                const size = 7;

                marker.setAttribute(
                    "d",
                    `M ${x-size} ${y-size} L ${x+size} ${y+size}
                     M ${x+size} ${y-size} L ${x-size} ${y+size}`
                );

                marker.setAttribute("stroke", "#DC2626");
                marker.setAttribute("stroke-width", "3.5");
                marker.setAttribute("stroke-linecap", "round");
                marker.setAttribute("fill", "none");

                markers.appendChild(marker);
            }
        });
}


function renderUnassigned() {
  const list = $("unassigned-list"); list.replaceChildren();
  const unassigned = state.events
    .filter(e => e.team === "us" && e.playerId == null)
    .reverse();
  $("tab-unassigned-count").textContent =
    unassigned.length > 0 ? `(${unassigned.length})` : "";
  if (!unassigned.length) { list.textContent = "All caught up."; return; }
  unassigned.forEach(event => {
    const row = document.createElement("div"); row.className = "unassigned-item";
    const label = document.createElement("span"); if (event.type === "turnover" && event.linkedEventId) {
    const opponent = currentGame?.opponent || "OPPONENT";

    label.textContent =
        `${periodName(event.period)} — ${opponent} Steal / Unassigned Turnover`;
} else {
    label.textContent =
        `${periodName(event.period)} — ${eventDescription(event)}`;
}
    const select = document.createElement("select");
    const placeholder = document.createElement("option"); placeholder.value = ""; placeholder.textContent = "Assign player";
    select.appendChild(placeholder);
    players.forEach(player => {
      const option = document.createElement("option"); option.value = String(player.id);
      option.textContent = playerName(player.id); select.appendChild(option);
    });
    
select.addEventListener("change", async () => {
    if (!select.value) return;

    if (
        pendingEventSyncs > 0 ||
        eventSyncHasFailed ||
        getEventRecoveryQueue().length > 0
    ) {
        alert("Please finish synchronizing before assigning a player.");
        return;
    }

    const expectedVersion = Number(event.version);

    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        alert("Event version unavailable. Refresh the game.");
        return;
    }

    event.playerId = select.value;

    save();
    render();

    const updatedEvent = {
        ...event,
        expectedVersion
    };

    // This requires the recovery dispatcher to support player updates.
    const success = await trackEventWrite(
        "player_update",
        [event.id],
        updatedEvent
    );

    if (!success) {
        const queued = getEventRecoveryQueue();

        console.warn(
            "Player assignment awaits synchronization:",
            event.id
        );

        alert(
            queued?.some(operation => operation.eventId === event.id)
                ? "Player assignment saved locally. It will retry automatically when Supabase is reachable."
                : "Player assignment was not confirmed. Check synchronization before changing it again."
        );
    }
});

row.appendChild(label);
row.appendChild(select);
list.appendChild(row);

  }); // End unassigned.forEach()
} // End renderUnassigned()

function renderQuarterBox() {
  const holder = $("quarter-box"); holder.replaceChildren();
  const table = document.createElement("table"); table.className = "quarter-table";
  const head = document.createElement("tr");
  ["TEAM", ...Array.from({length:state.period}, (_, i) => periodName(i + 1)), "TOTAL"].forEach(label => {
    const th = document.createElement("th"); th.textContent = label; head.appendChild(th);
  });
  table.appendChild(head);
  const total = scores();
  [[teamName,"us"],[currentGame?.opponent || "OPPONENT","opponent"]].forEach(([name, team]) => {
    const row = document.createElement("tr");
    [name, ...Array.from({length:state.period}, (_, i) => scores(state.events.filter(e => e.period === i + 1))[team]), total[team]].forEach(value => {
      const td = document.createElement("td"); td.textContent = value; row.appendChild(td);
    }); table.appendChild(row);
  });
  holder.appendChild(table);
}

function renderPlayerBox() {
  const body = $("player-box-body"); body.replaceChildren();
  if (selectedPlayerId === null) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 11;
    cell.textContent = "No player selected";
    cell.style.textAlign = "center";

    row.appendChild(cell);
    body.appendChild(row);

    $("box-period").textContent = "—";
    return;
}
  const filter = $("play-filter").value;
  const events = state.events.filter(e => e.team === "us" && (filter === "all" || e.period === Number(filter)));
  players
  .filter(player => String(player.id) === String(selectedPlayerId))
  .forEach(player => {
    const mine = events.filter(e => String(e.playerId) === String(player.id));
    const made = mine.filter(e => e.type === "shot" && e.made);
    const attempts = mine.filter(e => e.type === "shot");
    const threes = attempts.filter(e => e.points === 3);
    const ft = mine.filter(e => e.type === "free_throw");
    const count = type => mine.filter(e => e.type === type).length;
    const values = [playerName(player.id),
      made.reduce((sum,e) => sum + e.points,0) + ft.filter(e => e.made).length,
      `${made.length}/${attempts.length}`,
      `${threes.filter(e => e.made).length}/${threes.length}`,
      `${ft.filter(e => e.made).length}/${ft.length}`,
      count("defensive_rebound") + count("offensive_rebound"),count("assist"),count("steal"),count("block"),count("turnover"),count("foul")];
    const row = document.createElement("tr");
    values.forEach(v => { const td=document.createElement("td"); td.textContent=v; row.appendChild(td); });
    body.appendChild(row);
  });
  if (!players.length) { const row=document.createElement("tr"); const td=document.createElement("td"); td.colSpan=11; td.textContent="No players available yet.";row.appendChild(td);body.appendChild(row); }
  $("box-period").textContent = filter === "all" ? "ALL" : periodName(Number(filter));
}


function renderPlayByPlay() {
    const list = $("play-by-play");
    list.replaceChildren();

    const filter = $("play-filter").value;

    const matching = state.events
        .map((event, index) => ({ event, index }))
        .filter(({ event }) =>
            filter === "all" ||
            event.period === Number(filter)
        );

    if (!matching.length) {
        list.textContent = "No events yet.";
        return;
    }

    matching
        .filter(({ event }) => !event.linkedEventId)
        .reverse()
        .forEach(({ event, index }) => {
            const row = document.createElement("div");
            row.className = "play-row";

            const label = document.createElement("span");
            const total = totalAt(index);

            label.textContent =
                `${periodName(event.period)} · ` +
                `${eventDescription(event)} · ` +
                `${total.us}–${total.opponent}`;

            row.appendChild(label);

            if (state.status !== "final") {

                if (
                    event.type === "shot" ||
                    event.type === "free_throw"
                ) {
                    const edit = document.createElement("button");
                    edit.textContent = "MAKE ↔ MISS";

                    
edit.addEventListener("click", async () => {
    const eventId = event.id;

    // Prevent simultaneous edits to this event.
    if (!window.pendingShotEdits) {
        window.pendingShotEdits = new Set();
    }

    if (window.pendingShotEdits.has(eventId)) {
        return;
    }

    // Do not edit while this browser has unresolved changes.
    if (
        pendingEventSyncs > 0 ||
        eventSyncHasFailed ||
        getEventRecoveryQueue().length > 0
    ) {
        alert(
            "Please finish synchronizing pending changes " +
            "before editing this shot."
        );
        return;
    }

    const expectedVersion = Number(event.version);

    if (
        !Number.isInteger(expectedVersion) ||
        expectedVersion < 1
    ) {
        alert("Shot version unavailable. Refresh the game.");
        return;
    }

    window.pendingShotEdits.add(eventId);

    try {
        const previousMade = event.made;

        event.made = !previousMade;

        save();
        render();

        const updatedEvent = {
            ...event,
            expectedVersion
        };

        const success = await trackEventWrite(
            "upsert",
            [eventId],
            updatedEvent
        );

        if (!success) {
            console.warn(
                "Shot edit not confirmed:",
                eventId
            );

            // Do not immediately undo the change here.
            // It may need offline recovery or conflict resolution.
            alert(
                "The shot edit was not confirmed. " +
                "Check synchronization before making more changes."
            );

            return;
        }

        console.log(
            "Shot edit synchronized:",
            eventId
        );

    } finally {
        window.pendingShotEdits.delete(eventId);
        render();
    }
});


                    row.appendChild(edit);
                }

                const remove = document.createElement("button");
                remove.textContent = "DELETE";

                remove.addEventListener("click", () => {
                    if (!confirm(
                        "Delete this event? Scores and stats will be recalculated."
                    )) {
                        return;
                    }

                    const linkedIds = new Set([event.id]);

                    if (event.linkedEventId) {
                        linkedIds.add(event.linkedEventId);
                    }

                    state.events.forEach(e => {
                        if (e.linkedEventId === event.id) {
                            linkedIds.add(e.id);
                        }
                    });

                    state.events = state.events.filter(
                        e => !linkedIds.has(e.id)
                    );

                    save();
                    render();

                    const eventIds = [...linkedIds];

                    void trackEventWrite(
                        "delete",
                        eventIds
                    );
                });

                row.appendChild(remove);
            }

            list.appendChild(row);
        });
}

function render() {
  renderScoreboard();renderPlayers();renderCourt();renderUnassigned();renderQuarterBox();renderPlayerBox();renderPlayByPlay();
}

function renderPeriodOptions() {
  const select = $("play-filter"); const selected = select.value;
  select.replaceChildren();
  const all = document.createElement("option");all.value="all";all.textContent="FULL GAME";select.appendChild(all);
  for (let p=1;p<=state.period;p++) {
    const option=document.createElement("option");option.value=String(p);option.textContent=periodName(p);select.appendChild(option);
  }
  select.value = [...select.options].some(o => o.value === selected) ? selected : "all";
}


$("basketball-court").addEventListener("click", event => {
    if (state.status !== "live") return;

    const svg = $("basketball-court");

    // Get the actual location clicked on the SVG
    const displayPoint = new DOMPoint(
        event.clientX,
        event.clientY
    ).matrixTransform(
        svg.getScreenCTM().inverse()
    );

    // Check FIBA court boundaries
if (courtView === "full") {

    // Full court: 28m × 15m
    if (
        displayPoint.x < 10 ||
        displayPoint.x > 850 ||
        displayPoint.y < 10 ||
        displayPoint.y > 460
    ) return;

} else {

    // Half court: 15m × 14m
    if (
        displayPoint.x < 10 ||
        displayPoint.x > 460 ||
        displayPoint.y < 10 ||
        displayPoint.y > 430
    ) return;

}

    // Convert Half Court clicks into full-court coordinates
    const point = displayToCourt(
        displayPoint.x,
        displayPoint.y
    );

    // Determine 2PT or 3PT
    const shotInfo = detectShot(
        point.x,
        point.y,
        displayPoint.x,
        displayPoint.y
    );

    // KEEP YOUR EXISTING pendingShot CODE BELOW

  const shotDistance = calculateShotDistance(
    point.x,
    point.y
);

pendingShot = {
    x: point.x,
    y: point.y,
    points: shotInfo.points,
    team: shotInfo.team,
    distanceMeters: shotDistance.meters,
    distanceFeet: shotDistance.feet
};

console.log("Shot detected:", pendingShot);
  $("shot-dialog-label").textContent =
    `${pendingShot.points}-POINT ATTEMPT • ${Math.round(pendingShot.distanceFeet)} FT`;

const dialog = $("shot-dialog");
const courtRect = svg.getBoundingClientRect();

const clickX = event.clientX - courtRect.left;
const clickY = event.clientY - courtRect.top;

// Keep the popup inside the court's visible boundaries
const popupWidth = 220;
const popupHeight = 100;

const left = Math.max(
    popupWidth / 2,
    Math.min(clickX, courtRect.width - popupWidth / 2)
);

dialog.style.left = `${left}px`;

dialog.style.top =
    `${clickY < popupHeight + 15
        ? Math.min(clickY + 15, courtRect.height - popupHeight)
        : clickY - 8}px`;

dialog.style.transform =
    clickY < popupHeight + 15
        ? "translate(-50%, 0)"
        : "translate(-50%, -100%)";

dialog.hidden = false;
});
$("shot-made").addEventListener("click", () => finishShot(true));
$("shot-missed").addEventListener("click", () => finishShot(false));
$("shot-cancel").addEventListener("click", () => { pendingShot=null; $("shot-dialog").hidden=true; });
function finishShot(made) {
    if (!pendingShot) return;

    const isHome = currentGame?.location?.toLowerCase() !== "away";

    const scoringTeam =
        pendingShot.team === (isHome ? "home" : "away")
            ? "us"
            : "opponent";

    addEvent({
    type: "shot",
    x: pendingShot.x,
    y: pendingShot.y,
    points: pendingShot.points,
    team: scoringTeam,
    playerId: scoringTeam === "us" ? selectedPlayerId : null,
    made: made,
    distanceMeters: pendingShot.distanceMeters,
    distanceFeet: pendingShot.distanceFeet
});

    pendingShot = null;
    $("shot-dialog").hidden = true;
}

function recordFreeThrow(side, made) {
    // Determine whether our team is Home or Away
    const isHome = currentGame?.location?.toLowerCase() !== "away";

    // Convert Home/Away into our internal team names
    const team =
        side === (isHome ? "home" : "away")
            ? "us"
            : "opponent";

    addEvent({
        type: "free_throw",
        team: team,
        playerId: team === "us" ? selectedPlayerId : null,
        points: 1,
        made: made
    });
}

// Home free throws
$("home-ft-made").addEventListener("click", () => {
    recordFreeThrow("home", true);
});

$("home-ft-missed").addEventListener("click", () => {
    recordFreeThrow("home", false);
});

// Away free throws
$("away-ft-made").addEventListener("click", () => {
    recordFreeThrow("away", true);
});

$("away-ft-missed").addEventListener("click", () => {
    recordFreeThrow("away", false);
});

document.querySelectorAll("[data-opponent-points]").forEach(button => button.addEventListener("click", () => {
  addEvent({type:"opponent_score",team:"opponent",points:Number(button.dataset.opponentPoints)});
}));
document.querySelectorAll("[data-stat]").forEach(button => {
    button.addEventListener("click", () => {
        recordStat(button.dataset.stat, "us", selectedPlayerId);
    });
});

document.querySelectorAll("[data-opponent-stat]").forEach(button => {
    button.addEventListener("click", () => {
        recordStat(button.dataset.opponentStat, "opponent");
    });
});

$("start-game").addEventListener("click", async () => {
    if (state.status === "final" || !currentGame) return;

    if (eventSyncHasFailed || getEventRecoveryQueue()?.length) {
        alert("Resolve pending synchronization before starting/resuming the game.");
        return;
    }
    const total = scores();

    const { error } = await supabaseClient.rpc(
        "update_live_game",
        {
            p_game_id: gameId,
            p_status: "live",
            p_period: state.period,
            p_team_score: total.us,
            p_opponent_score: total.opponent
        }
    );

    if (error) {
        console.error("Could not start game:", error);
        alert("Could not update game status in Supabase.");
        return;
    }

    state.status = "live";
    save();
    render();

    console.log("Game status updated to LIVE");
});



$("end-quarter").addEventListener("click", async () => {
    if (state.status !== "live" || !currentGame) return;

    const total = scores();

    const shouldFinalize =
        state.period >= 4 && total.us !== total.opponent;

    const message = shouldFinalize
        ? `End ${periodName(state.period)} and finalize the game?`
        : `End ${periodName(state.period)} and start ${periodName(state.period + 1)}?`;

    if (!confirm(message)) return;

    // Prevent double-clicks while the update is running.
    const endButton = $("end-quarter");
    endButton.disabled = true;

    try {
        try { await eventSyncQueue; } catch (_) {}
        if (eventSyncHasFailed || getEventRecoveryQueue()?.length) {
            alert("Resolve pending event synchronization before ending the quarter.");
            return;
        }
        const nextStatus = shouldFinalize ? "completed" : "live";
        const nextPeriod = shouldFinalize
            ? state.period
            : state.period + 1;

        // STEP 1: Update the game's status, period and score.
        const { error } = await supabaseClient.rpc(
            "update_live_game",
            {
                p_game_id: gameId,
                p_status: nextStatus,
                p_period: nextPeriod,
                p_team_score: total.us,
                p_opponent_score: total.opponent
            }
        );

        if (error) {
            console.error("Could not end quarter:", error);
            alert("Could not update the game in Supabase.");
            return;
        }

        // STEP 2: Create the quarter-ending event.
        const periodEndEvent = {
            id: crypto.randomUUID(),
            type: "period_end",
            period: state.period,
            time: Date.now(),
            team: null,
            playerId: null
        };

        state.events.push(periodEndEvent);

        // STEP 3: Save the quarter-ending event to Supabase.
        void trackEventWrite("upsert", [periodEndEvent.id], {...periodEndEvent});

        if (shouldFinalize) {

            // STEP 4: Create the game-ending event.
            const gameEndEvent = {
                id: crypto.randomUUID(),
                type: "game_end",
                period: state.period,
                time: Date.now(),
                team: null,
                playerId: null
            };

            state.events.push(gameEndEvent);

            // Save the game-ending event to Supabase.
            void trackEventWrite("upsert", [gameEndEvent.id], {...gameEndEvent});

            state.status = "final";

        } else {
            // Move to the next quarter.
            state.period = nextPeriod;
        }

        // STEP 5: Save locally and refresh the interface.
        pendingShot = null;
        save();
        renderPeriodOptions();
        render();

        console.log(
            "Game updated in Supabase:",
            nextStatus,
            "Period:",
            nextPeriod
        );

    } finally {
        endButton.disabled = false;
    }
});



$("end-game").addEventListener("click", async () => {
    if (state.status !== "live" || !currentGame) return;

    if (!confirm("Finalize the game? This will end tracking.")) {
        return;
    }

    const endButton = $("end-game");
    endButton.disabled = true;

    try {
        // Ensure all previously recorded events have synced.
        await eventSyncQueue;

        if (eventSyncHasFailed || getEventRecoveryQueue()?.length) {
            alert("Some events failed to sync. Resolve the sync error before ending the game.");
            return;
        }

        const total = scores();

        // Update game status and final score in Supabase.
        const { error } = await supabaseClient.rpc(
            "update_live_game",
            {
                p_game_id: gameId,
                p_status: "completed",
                p_period: state.period,
                p_team_score: total.us,
                p_opponent_score: total.opponent
            }
        );

        if (error) {
            console.error("Could not finalize game:", error);
            alert("Game finalization failed. Please try again.");
            return;
        }

        // Create the final game event.
        const gameEndEvent = {
            id: crypto.randomUUID(),
            type: "game_end",
            period: state.period,
            time: Date.now(),
            team: null,
            playerId: null
        };

        state.events.push(gameEndEvent);
        save();
        const synced = await trackEventWrite("upsert", [gameEndEvent.id], {...gameEndEvent});

        if (!synced) {
            console.warn(
                "Game marked completed, but final event did not sync."
            );
        }

        state.status = "final";
        pendingShot = null;

        save();
        render();

        console.log(
            "Game finalized in Supabase:",
            gameId
        );

    } catch (error) {
        console.error("Game finalization error:", error);
        alert("Could not finish finalizing the game.");
    } finally {
        endButton.disabled = state.status === "final";
    }
});


async function updateShotInSupabase(event) {
    if (!gameId || !currentGame || !event?.id) {
        return false;
    }

    const expectedVersion = Number(event.expectedVersion);

    if (
        !Number.isInteger(expectedVersion) ||
        expectedVersion < 1
    ) {
        console.error(
            "Shot update rejected: invalid expected version.",
            event.id
        );
        return false;
    }

    const { data, error } = await supabaseClient.rpc(
        "update_game_event_made",
        {
            p_event_id: event.id,
            p_game_id: gameId,
            p_expected_version: expectedVersion,
            p_made: event.made
        }
    );

    if (error) {
        console.error("Failed to update shot:", error);
        return false;
    }

    if (!Array.isArray(data) || data.length !== 1) {
        console.warn(
            "Shot update rejected: version conflict or event unavailable.",
            event.id
        );
        return false;
    }

    const newVersion = Number(data[0].new_version);

    // Update the actual event stored in local state.
    const localEvent = state.events.find(
        item => item.id === event.id
    );

    if (localEvent) {
        // Only apply the version if this result is newer.
        localEvent.version = Math.max(
            Number(localEvent.version) || 0,
            newVersion
        );

        save();
    }

    console.log(
        "Shot updated in Supabase:",
        event.id,
        "Version:",
        newVersion
    );

    return true;
}

async function updatePlayerInSupabase(event) {
    if (!gameId || !currentGame || !event?.id) {
        return false;
    }

    const expectedVersion = Number(event.expectedVersion);

    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        console.error("Invalid player-assignment version:", event.id);
        return false;
    }

    const { data, error } = await supabaseClient.rpc(
        "update_game_event_player",
        {
            p_event_id: event.id,
            p_game_id: gameId,
            p_expected_version: expectedVersion,
            p_player_id: event.playerId ?? null
        }
    );

    if (error || !Array.isArray(data) || data.length !== 1) {
        console.error(
            "Player assignment failed or version conflict:",
            error ?? event.id
        );
        return false;
    }

    const localEvent = state.events.find(
        item => item.id === event.id
    );

    if (localEvent) {
        localEvent.version = Number(data[0].new_version);
        save();
    }

    console.log(
        "Player assignment synchronized:",
        event.id,
        "Version:",
        data[0].new_version
    );

    return true;
}

async function deleteEventsFromSupabase(eventIds) {
    if (!gameId || !currentGame || !eventIds?.length) return false;
    const {error} = await supabaseClient.from("game_events")
        .delete().eq("game_id", gameId).in("id", eventIds);
    if (error) { console.error("Failed to delete events:", error); return false; }
    const {data, error: verifyError} = await supabaseClient.from("game_events")
        .select("id").eq("game_id", gameId).in("id", eventIds);
    if (verifyError || !data || data.length) {
        console.error("Could not verify event deletion:", verifyError || data);
        return false;
    }
    const confirmed = getConfirmedEventIds();
    eventIds.forEach(id => confirmed.delete(id));
    saveConfirmedEventIds(confirmed);
    console.log("Event deletion verified in Supabase:", eventIds);
    return true;
}

$("undo-event").addEventListener("click", () => {
    if (state.status !== "live" || !state.events.length) return;

    const lastEvent = state.events.pop();

    if (lastEvent.linkedEventId) {
        state.events = state.events.filter(
            event => event.id !== lastEvent.linkedEventId
        );
    }

    const eventIds = [lastEvent.id];

    if (lastEvent.linkedEventId) {
        eventIds.push(lastEvent.linkedEventId);
    }

    // Keep local statistics updated.
    save();
    render();

    // Delete after earlier uploads finish. 

void trackEventWrite("delete", eventIds);

});


$("play-filter").addEventListener("change", render);



function canSafelyReconcileEvents() {
    if (pendingEventSyncs > 0) {
        console.log("Sync postponed: operations are pending.");
        return false;
    }

    if (eventSyncHasFailed || getEventRecoveryQueue()?.length || recoveryInProgress) {
        console.warn("Sync postponed: recovery operations exist or are running.");
        return false;
    }

    return true;
}

function hasPendingEventChanges(eventId) {
    return pendingEventIds.has(eventId);
}

function findRemoteDeletions(remoteEvents) {
    const confirmedIds = getConfirmedEventIds();
    const remoteIds = new Set(
        remoteEvents.map(event => event.id)
    );

    return state.events.filter(event =>
        confirmedIds.has(event.id) &&
        !remoteIds.has(event.id)
    );
}


async function loadGameEvents() {
    if (!gameId || !currentGame) return;

    const { data, error } = await supabaseClient
        .from("game_events")
        .select("*")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Failed to load game events:", error);
        return;
    }

    
const remoteEvents = data.map(event => ({
    id: event.id,
    playerId: event.player_id,
    team: event.team,
    type: event.type,
    period: event.period,

    // Track the Supabase event version.
    version: Number(event.version),

    x: event.x,
    y: event.y,
    points: event.points,
    made: event.made,
    distanceMeters: event.distance_meters,
    distanceFeet: event.distance_feet,
    linkedEventId: event.linked_event_id,
    time: new Date(event.created_at).getTime()
}));


    console.log("Supabase events loaded:", remoteEvents.length);

    // Avoid overwriting local events while uploads,
    // edits, or deletions are still pending.
    if (!canSafelyReconcileEvents()) {
        console.warn(
            "Reconciliation postponed. Keeping local events."
        );
        return;
    }

    const confirmedIds = getConfirmedEventIds();

    const remoteIds = new Set(
        remoteEvents.map(event => event.id)
    );

    // Remove local events previously confirmed in
    // Supabase that have since been deleted remotely.
    const remotelyDeleted = state.events.filter(event =>
        confirmedIds.has(event.id) &&
        !remoteIds.has(event.id)
    );

    if (remotelyDeleted.length > 0) {
        const deletedIds = new Set(
            remotelyDeleted.map(event => event.id)
        );

        state.events = state.events.filter(
            event => !deletedIds.has(event.id)
        );

        deletedIds.forEach(id => {
            confirmedIds.delete(id);
        });

        console.log(
            "Removed remotely deleted events:",
            deletedIds.size
        );
    }

    // Restore events that exist in Supabase but are
    // missing from this browser's local event history.
    const localIds = new Set(
        state.events.map(event => event.id)
    );

    const missingEvents = remoteEvents.filter(event =>
        !localIds.has(event.id)
    );

    if (missingEvents.length > 0) {
        state.events.push(...missingEvents);

        console.log(
            "Restored missing Supabase events:",
            missingEvents.length
        );
    }

    // Bring locally confirmed event fields up to date
    // with the latest Supabase versions.
    const remoteById = new Map(
        remoteEvents.map(event => [event.id, event])
    );

    state.events = state.events.map(event => {
        const remote = remoteById.get(event.id);

        if (!remote) {
            // Preserve local events that haven't been
            // confirmed in Supabase yet.
            return event;
        }

        return {
            ...event,
            ...remote
        };
    });

    // Record all events confirmed to exist remotely.
    remoteIds.forEach(id => {
        confirmedIds.add(id);
    });

    saveConfirmedEventIds(confirmedIds);

    // Keep events in chronological order.
    state.events.sort(
        (a, b) => (a.time || 0) - (b.time || 0)
    );

    // Restore the latest period represented by events.
    state.period = Math.max(
        1,
        state.period,
        ...state.events.map(
            event => Number(event.period) || 1
        )
    );

    // Save the reconciled state locally.
    save();

    // Refresh the tracker interface.
    renderPeriodOptions();
    render();

    console.log(
        "Game events synchronized:",
        state.events.length
    );
}

async function loadSelectedGame() {
  if (!gameId) { if ($("saving-note")) {
    $("saving-note").textContent = "DEMO — NO GAME SELECTED";
}render();return; }
  const {data:game,error} = await supabaseClient.from("games").select("*").eq("id",gameId).single();
  if (error || !game) { console.error("Game loading failed",error);if ($("saving-note")) {
    $("saving-note").textContent = "DEMO — NO GAME SELECTED";
}return; }
  currentGame=game;
  await loadGameRoster();
  const {data:team,error:teamError} = await supabaseClient.from("teams").select("mascot").eq("id",game.team_id).single();
  if (teamError) console.warn("Team name loading failed",teamError);
  teamName=team?.mascot || "OUR TEAM";
  await loadGameEvents();
  
  // Restore the shared game status from Supabase.
  if (game.status === "completed") {
    state.status = "final";
  } else if (game.status === "live") {
    state.status = "live";
  } else if (game.status === "paused") {
    state.status = "paused";
  } else {
    state.status = "not_started";
  }

  // Restore the current quarter from Supabase.
  state.period = Math.max(1, Number(game.current_period) || 1);

  // Save the restored game state locally.
  save();

  // Refresh the quarter selector.
  renderPeriodOptions();

  // Existing roster data stays local until roster Supabase integration is built.
  if (game.status === "completed" && !state.events.length) {
    if ($("saving-note")) {
    $("saving-note").textContent = "DEMO — NO GAME SELECTED";
}
  }
  syncStatisticsGame()
  render();
}

renderPeriodOptions();
render();

void loadSelectedGame()
    .then(() => {
        if (currentGame && gameId) {
            startGameTrackingRealtime();
            scheduleGameRecovery(800);
        }
    })
    .catch(error => {
        console.error("Game initialization failed:", error);
    }); 

const fullCourtBtn = document.getElementById("full-court-btn");
const halfCourtBtn = document.getElementById("half-court-btn");
const homeCourtBtn = document.getElementById("home-court-btn");
const awayCourtBtn = document.getElementById("away-court-btn");
const courtSideToggle = document.querySelector(".court-side-toggle");

const court = document.getElementById("basketball-court");


function updateCourtView() {
    const isHalf = courtView === "half";

    // Change the visible drawing area
    court.setAttribute(
        "viewBox",
        isHalf ? "0 0 470 440" : "0 0 860 470"
    );

    // Show only the selected drawing
    $("full-court-art").style.display =
        isHalf ? "none" : "inline";

    $("half-court-art").style.display =
        isHalf ? "inline" : "none";

    // Apply the correct CSS sizing
    court.classList.toggle("half-court-view", isHalf);

    // Update button appearances
    fullCourtBtn.classList.toggle("active", !isHalf);
    halfCourtBtn.classList.toggle("active", isHalf);

    homeCourtBtn.classList.toggle(
        "active", courtSide === "home"
    );

    awayCourtBtn.classList.toggle(
        "active", courtSide === "away"
    );

    // Home/Away buttons only appear in Half Court
    courtSideToggle.hidden = !isHalf;

    // Close any unfinished shot
    pendingShot = null;
    $("shot-dialog").hidden = true;

    // Refresh shot markers for selected view
    renderCourt();
}

fullCourtBtn.addEventListener("click", function() {
    courtView = "full";
    updateCourtView();
});

halfCourtBtn.addEventListener("click", function() {
    courtView = "half";
    updateCourtView();
});

homeCourtBtn.addEventListener("click", function() {
    courtSide = "home";
    updateCourtView();
});

awayCourtBtn.addEventListener("click", function() {
    courtSide = "away";
    updateCourtView();
});

updateCourtView();

// GAME INFORMATION TABS

const infoTabs = document.querySelectorAll("[data-info-tab]");
const infoPanels = document.querySelectorAll(".info-tab-content");

function switchInfoTab(selectedTab) {
    infoTabs.forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.infoTab === selectedTab
        );
    });

    infoPanels.forEach(panel => {
        panel.hidden = panel.id !== `info-${selectedTab}`;
    });
}

infoTabs.forEach(button => {
    button.addEventListener("click", () => {
        switchInfoTab(button.dataset.infoTab);
    });
});

// Show Box Score by default
switchInfoTab("box");


/* =========================================
   GAME TRACKING — SUPABASE REALTIME
   ========================================= */

let gameRealtimeChannel = null;
let gameRealtimeRefreshTimer = null;

function startGameTrackingRealtime() {

    if (!gameId || !currentGame) {
        console.warn("Realtime: No game selected.");
        return;
    }

    // Prevent duplicate subscriptions.
    if (gameRealtimeChannel) {
        void supabaseClient.removeChannel(gameRealtimeChannel);
        gameRealtimeChannel = null;
    }

    if (gameRealtimeRefreshTimer) {
        clearTimeout(gameRealtimeRefreshTimer);
        gameRealtimeRefreshTimer = null;
    }

    // Refresh the tracker after database changes.
    function refreshGameTracking() {

        clearTimeout(gameRealtimeRefreshTimer);

        gameRealtimeRefreshTimer = setTimeout(async () => {

            gameRealtimeRefreshTimer = null;

            // Do not reconcile while local uploads are pending.
            if (!canSafelyReconcileEvents()) {
                console.warn(
                    "Realtime refresh postponed: local changes pending."
                );
                return;
            }

            console.log("Realtime: Refreshing Game Tracking...");

            // Synchronize recorded events.
            await loadGameEvents();

            // Refresh the game status and period.
            const { data: game, error } = await supabaseClient
                .from("games")
                .select("status, current_period")
                .eq("id", gameId)
                .single();

            if (error) {
                console.error(
                    "Realtime game status refresh failed:",
                    error
                );
                return;
            }

            if (game) {

                state.status =
                    game.status === "completed"
                        ? "final"
                        : game.status === "live"
                            ? "live"
                            : game.status === "paused"
                                ? "paused"
                                : "not_started";

                state.period = Math.max(
                    1,
                    Number(game.current_period) || 1
                );

                // Preserve the synchronized game status locally.
                save();

                renderPeriodOptions();
                render();
            }

        }, 300);
    }

    gameRealtimeChannel = supabaseClient
        .channel(`game-tracking-${gameId}`)

        // Listen for new or updated events.
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "game_events"
            },
            payload => {

                const changedEvent = payload.new || payload.old;

                // Supabase DELETE notifications may only
                // contain the deleted event's ID.
                if (payload.eventType === "DELETE") {

                    console.log(
                        "Realtime: Event deletion detected."
                    );

                    refreshGameTracking();
                    return;
                }

                // Ignore events from other games.
                if (
                    String(changedEvent?.game_id) !== String(gameId)
                ) {
                    return;
                }

                console.log(
                    "Realtime game event:",
                    payload.eventType
                );

                refreshGameTracking();
            }
        )

        // Listen for changes to this game's status.
        .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "games",
                filter: `id=eq.${gameId}`
            },
            payload => {

                console.log(
                    "Realtime game status updated:",
                    payload.new?.status
                );

                refreshGameTracking();
            }
        )

        .subscribe(status => {

            console.log("Game Tracking Realtime:", status);

            if (status === "SUBSCRIBED") {
                console.log(
                    "Game Tracking Realtime connected."
                );

                // Catch changes made before subscribing.
                scheduleGameRecovery(500);
                refreshGameTracking();
            }

            if (
                status === "CHANNEL_ERROR" ||
                status === "TIMED_OUT"
            ) {
                console.warn(
                    "Game Tracking Realtime connection issue:",
                    status
                );
            }
        });
}


// Local-only recovery is not a substitute for database authorization or
// multi-tracker conflict resolution. Configure Supabase RLS before production.
