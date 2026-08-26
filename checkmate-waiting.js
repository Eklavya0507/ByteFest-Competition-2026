(function () {
  const API = window.BYTEFEST_CONFIG.API_URL;
  const token = sessionStorage.getItem("bytefest_checkmate_token");
  if (!token) {
    location.replace("participant-login.html");
    return;
  }

  history.pushState(null, "", location.href);
  addEventListener("popstate", () => history.go(1));

  async function read(response) {
    const text = await response.text();
    try { return text ? JSON.parse(text) : {}; } catch { return {}; }
  }

  async function load() {
    try {
      const response = await fetch(`${API}/api/checkmate/state`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await read(response);

      if (response.status === 401) {
        sessionStorage.removeItem("bytefest_checkmate_token");
        location.replace("participant-login.html");
        return;
      }
      if (!response.ok) throw new Error(data.message || "Unable to load Checkmate state");

      document.getElementById("playerLabel").textContent =
        `${data.player.playerName} · ${data.player.registrationId} · ${Number(data.player.tournamentPoints || 0).toFixed(1)} tournament point(s)`;

      document.getElementById("eventStatus").textContent =
        String(data.eventControl?.status || "not_started").replaceAll("_", " ").toUpperCase();

      document.getElementById("waitMessage").textContent =
        data.eventControl?.status === "not_started"
          ? "Checkmate has not started yet. Stay on this screen."
          : data.eventControl?.status === "paused"
            ? "Checkmate is temporarily stopped by the coordinator."
            : "Waiting for your board pairing. The match screen opens automatically.";

      if (data.match) location.replace("checkmate-match.html");
    } catch (error) {
      document.getElementById("waitStatus").className = "status bad";
      document.getElementById("waitStatus").textContent = error.message;
    }
  }

  load();
  setInterval(load, 2000);
})();
