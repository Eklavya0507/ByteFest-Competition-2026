(function () {
  const API = window.BYTEFEST_CONFIG.API_URL;

  history.replaceState({ locked: true }, "", location.href);
  history.pushState({ locked: true }, "", location.href);
  addEventListener("popstate", () => history.go(1));

  const form = document.getElementById("participantLoginForm");
  const status = document.getElementById("loginStatus");
  const button = document.getElementById("loginButton");
  const eventSelect = document.getElementById("event");
  const secondPlayer = document.getElementById("checkmateSecondPlayer");
  const playerOneLabel = document.getElementById("playerOneLabel");
  const loginHelp = document.getElementById("loginHelp");
  const id2 = document.getElementById("registrationId2");
  const pass2 = document.getElementById("password2");

  const BH = {
    waiting_start: "bughunt-waiting.html", round1: "bughunt-round1.html", round2: "bughunt-round2.html",
    round3: "bughunt-round3.html", surprise: "bughunt-surprise.html", final: "bughunt-final.html",
    awaiting_ranking: "bughunt-waiting.html", eliminated: "bughunt-waiting.html", completed: "bughunt-waiting.html"
  };

  async function read(response) {
    const text = await response.text();
    try { return text ? JSON.parse(text) : {}; } catch { return {}; }
  }

  function updateMode() {
    const checkmate = eventSelect.value === "Checkmate";
    secondPlayer.hidden = !checkmate;
    playerOneLabel.hidden = !checkmate;
    id2.required = checkmate;
    pass2.required = checkmate;
    button.textContent = checkmate ? "LOGIN BOTH PLAYERS" : "ENTER COMPETITION";
    loginHelp.textContent = checkmate
      ? "Checkmate uses one computer per match. Enter both opponents' Registration IDs and passwords below."
      : "Select Bug Hunt and enter the team Registration ID and competition password.";
  }
  eventSelect.addEventListener("change", updateMode);
  updateMode();

  async function login(event, registrationId, password) {
    const response = await fetch(`${API}/api/participant/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, registrationId: registrationId.trim().toUpperCase(), password })
    });
    const data = await read(response);
    if (!response.ok) throw new Error(data.message || "Login failed");
    return data;
  }

  async function checkmateState(token) {
    const response = await fetch(`${API}/api/checkmate/state`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await read(response);
    if (!response.ok) throw new Error(data.message || "Unable to load Checkmate state");
    return data;
  }

  form.addEventListener("submit", async eventObject => {
    eventObject.preventDefault();
    button.disabled = true;
    status.className = "status";
    status.textContent = "Verifying approved registration...";

    try {
      const event = eventSelect.value;
      const registrationId = document.getElementById("registrationId").value;
      const password = document.getElementById("password").value;

      if (!event) throw new Error("Select an event");

      if (event === "Checkmate") {
        if (registrationId.trim().toUpperCase() === id2.value.trim().toUpperCase()) {
          throw new Error("Player 1 and Player 2 must be different registrations");
        }
        status.textContent = "Verifying both Checkmate players...";
        const [p1, p2] = await Promise.all([
          login("Checkmate", registrationId, password),
          login("Checkmate", id2.value, pass2.value)
        ]);

        const [s1, s2] = await Promise.all([checkmateState(p1.token), checkmateState(p2.token)]);
        sessionStorage.setItem("bytefest_checkmate_player1_token", p1.token);
        sessionStorage.setItem("bytefest_checkmate_player2_token", p2.token);
        sessionStorage.setItem("bytefest_checkmate_player1_name", p1.playerName || "Player 1");
        sessionStorage.setItem("bytefest_checkmate_player2_name", p2.playerName || "Player 2");
        sessionStorage.removeItem("bytefest_checkmate_token");
        sessionStorage.removeItem("bytefest_checkmate_coordinator_grant");

        status.className = "status good";
        status.textContent = `${p1.playerName} + ${p2.playerName} verified. Opening Checkmate station...`;

        const sameMatch = s1.match && s2.match && s1.match.id === s2.match.id;
        location.replace(sameMatch ? "checkmate-match.html" : "checkmate-waiting.html");
        return;
      }

      if (event !== "Bug Hunt") throw new Error("Unsupported event");
      const data = await login("Bug Hunt", registrationId, password);
      sessionStorage.setItem("bytefest_bughunt_token", data.token);
      sessionStorage.removeItem("bytefest_bughunt_secure_session");
      sessionStorage.removeItem("bytefest_bughunt_coordinator_grant");
      status.className = "status good";
      status.textContent = `Welcome ${data.teamName || "Participant"}. Opening Bug Hunt...`;

      const stateResponse = await fetch(`${API}/api/bughunt/state`, { headers: { Authorization: `Bearer ${data.token}` } });
      const state = await read(stateResponse);
      if (!stateResponse.ok) throw new Error(state.message || "Unable to load competition state");
      location.replace(BH[state.currentRound] || "bughunt-waiting.html");
    } catch (error) {
      status.className = "status bad";
      status.textContent = error.message;
      button.disabled = false;
    }
  });
})();
