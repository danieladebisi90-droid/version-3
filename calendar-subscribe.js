/* Shared subscription popup for gamehub.html and dashboard.html.
   Requires the existing browser-side supabaseClient. */
(() => {

  function makeModal() {
    let root = document.getElementById("sc-calendar-modal");
    if (root) return root;
    root = document.createElement("div");
    root.id = "sc-calendar-modal";
    root.hidden = true;
    root.innerHTML = `
      <div class="sc-calendar-backdrop" data-calendar-close></div>
      <section class="sc-calendar-panel" role="dialog" aria-modal="true" aria-labelledby="sc-calendar-title" tabindex="-1">
        <div class="sc-calendar-heading">
          <div>
            <h3 id="sc-calendar-title">Subscribe to Team Calendar</h3>
            <p class="sc-calendar-intro">Games, practices, meetings, and schedule changes.</p>
          </div>
          <button type="button" class="sc-calendar-close" aria-label="Close" data-calendar-close>✕</button>
        </div>
        <p id="sc-calendar-status" class="sc-calendar-status" role="status">Loading...</p>
        <div id="sc-calendar-actions" hidden>
          <div class="sc-calendar-section-title">LIVE SUBSCRIPTION <span>Updates automatically*</span></div>
          <div class="sc-calendar-providers">
            <a id="sc-calendar-apple" class="sc-provider-button" href="#">Apple Calendar</a>
            <button type="button" id="sc-calendar-google" class="sc-provider-button">Google Calendar</button>
            <button type="button" id="sc-calendar-outlook" class="sc-provider-button">Outlook Calendar</button>
          </div>
          <p id="sc-calendar-instructions" class="sc-calendar-instructions">Choose your calendar app to subscribe.</p>
          <button type="button" id="sc-calendar-copy" class="sc-calendar-copy">Copy live subscription URL</button>
          <div class="sc-calendar-divider"></div>
          <div class="sc-calendar-section-title">ONE-TIME COPY <span>Does not auto-update</span></div>
          <button type="button" id="sc-calendar-download" class="sc-calendar-download">Download calendar (.ics)</button>
          <p class="sc-calendar-footer">*Your calendar provider controls refresh timing. Anyone with the live link can view this schedule; share it only with people who need access.</p>
          <button type="button" id="sc-calendar-revoke" hidden>Revoke and replace subscription link</button>
        </div>
      </section>`;
    document.body.appendChild(root);
    root.querySelectorAll("[data-calendar-close]").forEach((node) => {
      node.addEventListener("click", () => root.hidden = true);
    });
    return root;
  }

  async function openSubscription() {
    const root = makeModal();
    root.hidden = false;
    root.querySelector(".sc-calendar-panel").focus();
    const status = root.querySelector("#sc-calendar-status");
    const actions = root.querySelector("#sc-calendar-actions");
    actions.hidden = true;
    status.textContent = "Loading subscription...";

    try {
      if (typeof supabaseClient === "undefined") throw new Error("Supabase is not ready.");
      const teamId = sessionStorage.getItem("selectedTeamId");
      const seasonId = sessionStorage.getItem("selectedSeasonId");
      if (!teamId || !seasonId) throw new Error("Select a team and season first.");
      const { data: auth, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !auth?.user) throw new Error("Sign in to access team calendar links.");
      const { data: membership, error: memberError } = await supabaseClient
        .from("team_members").select("role")
        .eq("team_id", teamId).eq("user_id", auth.user.id).maybeSingle();
      if (memberError) throw memberError;
      if (!membership) throw new Error("You must be a team member to access this calendar link.");

      async function getToken() {
        const { data, error } = await supabaseClient
          .from("calendar_subscriptions").select("token")
          .eq("team_id", teamId).eq("seasons_id", seasonId).maybeSingle();
        if (error) throw error;
        return data?.token ?? null;
      }
      let token = await getToken();
      if (!token && membership.role === "head_coach") {
        const { error } = await supabaseClient.from("calendar_subscriptions")
          .insert({ team_id: teamId, seasons_id: seasonId });
        if (error && error.code !== "23505") throw error;
        token = await getToken();
      }
      if (!token) {
        status.textContent = "Your head coach needs to enable the calendar subscription first.";
        return;
      }
      const base = String(supabaseClient.supabaseUrl || "").replace(/\/$/, "");
      if (!/^https:\/\//.test(base)) throw new Error("Supabase project URL unavailable.");
      let url = `${base}/functions/v1/team-calendar?token=${encodeURIComponent(token)}`;
      const apple = root.querySelector("#sc-calendar-apple");
      const copy = root.querySelector("#sc-calendar-copy");
      const download = root.querySelector("#sc-calendar-download");
      const revoke = root.querySelector("#sc-calendar-revoke");
      const google = root.querySelector("#sc-calendar-google");
      const outlook = root.querySelector("#sc-calendar-outlook");
      const instructions = root.querySelector("#sc-calendar-instructions");

      async function copyLiveUrl() {
        try {
          await navigator.clipboard.writeText(url);
          return true;
        } catch (_) {
          window.prompt("Copy the live subscription URL:", url);
          return false;
        }
      }

      function openProvider(target, message) {
        // Open synchronously from a click to avoid popup blockers.
        window.open(target, "_blank", "noopener,noreferrer");
        instructions.textContent = message;
        copyLiveUrl().then((copied) => {
          status.textContent = copied
            ? "Live URL copied — paste it into the calendar subscription field."
            : "Use the live URL in the calendar subscription field.";
        });
      }

      google.onclick = () => openProvider(
        "https://calendar.google.com/calendar/u/0/r/settings/addbyurl",
        "In Google Calendar: Add calendar → From URL → paste the copied link → Add calendar."
      );
      outlook.onclick = () => openProvider(
        "https://outlook.live.com/calendar/0/view/month",
        "In Outlook: Add calendar → Subscribe from web → paste the copied link → Import."
      );
      function syncLinks() { apple.href = url.replace(/^https:/, "webcal:"); }
      syncLinks();
      copy.onclick = async () => {
        const copied = await copyLiveUrl();
        status.textContent = copied
          ? "Live subscription URL copied."
          : "Copy the live URL from the prompt.";
      };
      download.onclick = async () => {
        try {
          status.textContent = "Preparing .ics download...";
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Calendar feed returned ${res.status}`);
          const blob = await res.blob();
          const downloadUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = downloadUrl;
          a.download = "scoridium-team-schedule.ics";
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
          status.textContent = "Calendar file downloaded. This copy won't auto-update.";
        } catch (error) { status.textContent = `Download failed: ${error.message}`; }
      };
      revoke.hidden = membership.role !== "head_coach";
      revoke.onclick = async () => {
        if (!confirm("This will stop old subscription links from working. Continue?")) return;
        const nextToken = crypto.randomUUID();
        const { data, error } = await supabaseClient.from("calendar_subscriptions")
          .update({ token: nextToken })
          .eq("team_id", teamId).eq("seasons_id", seasonId)
          .select("token").single();
        if (error) { status.textContent = `Could not revoke link: ${error.message}`; return; }
        url = `${base}/functions/v1/team-calendar?token=${encodeURIComponent(data.token)}`;
        syncLinks();
        instructions.textContent = "Use one of the calendar options above with the new link. Existing subscriptions will stop refreshing.";
        status.textContent = "Old link revoked. Subscribe again with the new URL.";
      };
      actions.hidden = false;
      status.textContent = "Live calendar link ready.";
    } catch (error) {
      status.textContent = error?.message || "Could not load the calendar subscription.";
    }
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest(".calendar-subscribe-btn")) openSubscription();
  });
})();
