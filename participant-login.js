(function () {
  const API = window.BYTEFEST_CONFIG.API_URL;

  history.replaceState({ locked: true }, "", location.href);
  history.pushState({ locked: true }, "", location.href);
  addEventListener("popstate", () => history.go(1));

  const form = document.getElementById("participantLoginForm");
  const status = document.getElementById("loginStatus");
  const button = document.getElementById("loginButton");

  const CS = {
    round1: "codesprint-round1.html",
    round2: "codesprint-round2.html",
    qualifier: "codesprint-qualifier.html",
    semifinal: "codesprint-semifinal.html",
    wildcard: "codesprint-wildcard.html",
    entry_final: "codesprint-entry-final.html",
    wildcard_final: "codesprint-wildcard-final.html",
    final: "codesprint-final.html",
    awaiting_ranking: "codesprint-waiting.html",
    semifinal_loser_wait: "codesprint-waiting.html",
    entry_final_wait: "codesprint-waiting.html",
    wildcard_final_wait: "codesprint-waiting.html",
    final_wait: "codesprint-waiting.html",
    eliminated: "codesprint-waiting.html",
    completed: "codesprint-waiting.html"
  };

  const BH = {
    waiting_start: "bughunt-waiting.html",
    round1: "bughunt-round1.html",
    round2: "bughunt-round2.html",
    round3: "bughunt-round3.html",
    surprise: "bughunt-surprise.html",
    final: "bughunt-final.html",
    awaiting_ranking: "bughunt-waiting.html",
    eliminated: "bughunt-waiting.html",
    completed: "bughunt-waiting.html"
  };

  async function read(response) {
    const text = await response.text();
    try { return text ? JSON.parse(text) : {}; } catch { return {}; }
  }

  form.addEventListener("submit", async eventObject => {
    eventObject.preventDefault();
    button.disabled = true;
    status.className = "status";
    status.textContent = "Verifying approved registration...";

    try {
      const event = document.getElementById("event").value;
      const response = await fetch(`${API}/api/participant/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event,
          registrationId: document.getElementById("registrationId").value.trim().toUpperCase(),
          password: document.getElementById("password").value
        })
      });

      const data = await read(response);
      if (!response.ok) throw new Error(data.message || "Login failed");

      const tokenKey =
        event === "Code Sprint" ? "bytefest_codesprint_token" :
        event === "Bug Hunt" ? "bytefest_bughunt_token" :
        "bytefest_checkmate_token";

      sessionStorage.setItem(tokenKey, data.token);
      status.className = "status good";
      status.textContent = `Welcome ${data.teamName || data.playerName || "Participant"}. Opening competition...`;

      if (event === "Checkmate") {
        const stateResponse = await fetch(`${API}/api/checkmate/state`, {
          headers: { Authorization: `Bearer ${data.token}` }
        });
        const state = await read(stateResponse);
        if (!stateResponse.ok) throw new Error(state.message || "Unable to load Checkmate state");
        location.replace(state.match ? "checkmate-match.html" : "checkmate-waiting.html");
        return;
      }

      const prefix = event === "Code Sprint" ? "codesprint" : "bughunt";
      const stateResponse = await fetch(`${API}/api/${prefix}/state`, {
        headers: { Authorization: `Bearer ${data.token}` }
      });
      const state = await read(stateResponse);
      if (!stateResponse.ok) throw new Error(state.message || "Unable to load competition state");

      location.replace(
        (event === "Code Sprint" ? CS : BH)[state.currentRound] ||
        (event === "Code Sprint" ? "codesprint-waiting.html" : "bughunt-waiting.html")
      );
    } catch (error) {
      status.className = "status bad";
      status.textContent = error.message;
      button.disabled = false;
    }
  });
})();
