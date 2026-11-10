import { createClient } from "npm:@supabase/supabase-js@2";
import { DateTime } from "npm:luxon@3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

function response(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { ...cors, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function escapeIcs(value: unknown): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const count = encoder.encode(char).length;
    if (bytes + count > 73 && current) {
      lines.push(current);
      current = " ";
      bytes = 1;
    }
    current += char;
    bytes += count;
  }
  lines.push(current);
  return lines.join("\r\n");
}

function utcStamp(date: DateTime): string {
  return date.toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'");
}

function eventLines(input: {
  uid: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  timezone: string;
  title: string;
  location?: string | null;
  description?: string | null;
  updatedAt?: string | null;
  stamp: string;
}): string[] {
  const lines = ["BEGIN:VEVENT", `UID:${input.uid}`, `DTSTAMP:${input.stamp}`];
  const start = (input.startTime || "").slice(0, 8);
  if (start) {
    const startDate = DateTime.fromISO(`${input.date}T${start}`, { zone: input.timezone });
    if (!startDate.isValid) return [];
    lines.push(`DTSTART:${utcStamp(startDate)}`);
    if (input.endTime) {
      const endDate = DateTime.fromISO(`${input.date}T${input.endTime.slice(0, 8)}`, { zone: input.timezone });
      if (endDate.isValid && endDate > startDate) lines.push(`DTEND:${utcStamp(endDate)}`);
    }
  } else {
    lines.push(`DTSTART;VALUE=DATE:${input.date.replaceAll("-", "")}`);
  }
  if (input.updatedAt) {
    const modified = DateTime.fromISO(input.updatedAt);
    if (modified.isValid) lines.push(`LAST-MODIFIED:${utcStamp(modified)}`);
  }
  lines.push(`SUMMARY:${escapeIcs(input.title)}`);
  if (input.location) lines.push(`LOCATION:${escapeIcs(input.location)}`);
  if (input.description) lines.push(`DESCRIPTION:${escapeIcs(input.description)}`);
  lines.push("END:VEVENT");
  return lines;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return response("Method not allowed", 405);
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return response("Invalid calendar link", 404);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return response("Calendar feed not configured", 503);

  try {
    // Service role is used only in this server function, NEVER in browser JS.
    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: subscription, error: subscriptionError } = await db
      .from("calendar_subscriptions")
      .select("team_id, seasons_id, timezone")
      .eq("token", token)
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;
    if (!subscription) return response("Calendar link expired or revoked", 404);

    const timezone = subscription.timezone || "America/Edmonton";
    if (!DateTime.now().setZone(timezone).isValid) return response("Invalid calendar timezone", 500);

    // Supabase/PostgREST may cap rows per request; paginate to include the full season.
    async function allRows(table: "games" | "team_events", dateColumn: string) {
      const rows: Record<string, unknown>[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await db.from(table)
          .select("*")
          .eq("team_id", subscription.team_id)
          .eq("seasons_id", subscription.seasons_id)
          .order(dateColumn, { ascending: true })
          .range(offset, offset + 499);
        if (error) throw error;
        rows.push(...(data || []));
        if ((data || []).length < 500) break;
        if (offset >= 9500) throw new Error("Calendar is larger than feed limit");
      }
      return rows;
    }

    const [games, activities] = await Promise.all([
      allRows("games", "date"),
      allRows("team_events", "event_date"),
    ]);

    const now = utcStamp(DateTime.utc());
    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Scoridium//Team Schedule//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${escapeIcs("Scoridium Team Schedule")}`,
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
      "X-PUBLISHED-TTL:PT1H",
    ];

    for (const game of games) {
      if (["canceled", "cancelled"].includes(String(game.status || "").toLowerCase())) continue;
      lines.push(...eventLines({
        uid: `game-${game.id}@scoridium.app`,
        date: String(game.date).slice(0, 10),
        startTime: game.game_time as string | null,
        timezone,
        title: `Game vs ${String(game.opponent || "TBD")}`,
        location: [game.venue, game.location].filter(Boolean).join(" — "),
        updatedAt: game.updated_at as string | null,
        stamp: now,
      }));
    }
    for (const activity of activities) {
      const label: Record<string, string> = {
        practice: "Practice", meeting: "Team Meeting", training: "Training", other: "Team Event",
      };
      lines.push(...eventLines({
        uid: `event-${activity.id}@scoridium.app`,
        date: String(activity.event_date).slice(0, 10),
        startTime: activity.start_time as string | null,
        endTime: activity.end_time as string | null,
        timezone,
        title: String(activity.title || label[String(activity.event_type)] || "Team Event"),
        location: activity.location as string | null,
        description: activity.description as string | null,
        updatedAt: activity.updated_at as string | null,
        stamp: now,
      }));
    }

    lines.push("END:VCALENDAR");
    return new Response(lines.map(foldLine).join("\r\n") + "\r\n", {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "Content-Disposition": 'inline; filename="scoridium-team-schedule.ics"',
      },
    });
  } catch (error) {
    console.error("Calendar feed error:", error);
    return response("Unable to generate calendar feed", 500);
  }
});
