(function () {
  const API = window.BYTEFEST_CONFIG.API_URL;
  const token1 = sessionStorage.getItem("bytefest_checkmate_player1_token");
  const token2 = sessionStorage.getItem("bytefest_checkmate_player2_token");
  const storedName1 = sessionStorage.getItem("bytefest_checkmate_player1_name") || "Player 1";
  const storedName2 = sessionStorage.getItem("bytefest_checkmate_player2_name") || "Player 2";
  if (!token1 || !token2) { location.replace("participant-login.html"); return; }

  history.pushState(null, "", location.href);
  addEventListener("popstate", () => history.go(1));

  let busy = false;
  async function read(response) { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return {}; } }
  async function state(token) {
    const response = await fetch(`${API}/api/checkmate/state`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await read(response);
    if (response.status === 401) { sessionStorage.clear(); location.replace("participant-login.html"); throw new Error("Session expired"); }
    if (!response.ok) throw new Error(data.message || "Unable to load Checkmate state");
    return data;
  }

  async function load() {
    if (busy) return;
    busy = true;
    try {
      // While waiting, poll only Player 1. Player 2 is checked only once a match appears.
      // This cuts idle Checkmate state traffic roughly in half.
      const a = await state(token1);
      document.getElementById("playerLabel").textContent = `${a.player?.playerName || storedName1}  vs  ${storedName2}`;
      const control = a.eventControl?.status || "not_started";
      document.getElementById("eventStatus").textContent = String(control).replaceAll("_", " ").toUpperCase();
      document.getElementById("waitMessage").textContent = control === "not_started"
        ? "Both players are logged in. Wait for the coordinator to start Checkmate and assign this pairing."
        : control === "paused"
          ? "Checkmate is stopped by the coordinator."
          : "Both players are ready. Waiting for this match pairing.";

      if (a.match) {
        const b = await state(token2);
        if (!b.match || a.match.id !== b.match.id) {
          document.getElementById("waitStatus").className = "status bad";
          document.getElementById("waitStatus").textContent = "These two players are assigned to different matches. Ask the coordinator to correct the pairing.";
          return;
        }
        location.replace("checkmate-match.html");
      }
    } catch (error) {
      document.getElementById("waitStatus").className = "status bad";
      document.getElementById("waitStatus").textContent = error.message;
    } finally {
      busy = false;
    }
  }

  load();
  setInterval(() => { if (!document.hidden) load(); }, 4000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
})();
