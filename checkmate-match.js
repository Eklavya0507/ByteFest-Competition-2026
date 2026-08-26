(function () {
  const API = window.BYTEFEST_CONFIG.API_URL;
  const token = sessionStorage.getItem("bytefest_checkmate_token");
  if (!token) {
    location.replace("participant-login.html");
    return;
  }

  history.pushState(null, "", location.href);
  addEventListener("popstate", () => history.go(1));

  let state = null;
  let selectedPiece = "";
  let pollTimer = null;

  const pieceValues = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 };

  async function read(response) {
    const text = await response.text();
    try { return text ? JSON.parse(text) : {}; } catch { return {}; }
  }

  async function request(path, options = {}) {
    const response = await fetch(`${API}/api/checkmate${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });

    const data = await read(response);

    if (response.status === 401) {
      sessionStorage.removeItem("bytefest_checkmate_token");
      location.replace("participant-login.html");
      throw new Error("Session expired");
    }

    if (!response.ok) {
      const error = new Error(data.message || "Request failed");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function clock(ms) {
    const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function label(value) {
    return String(value || "").replaceAll("_", " ").toUpperCase();
  }

  function setMessage(message, bad = false) {
    const box = document.getElementById("matchMessage");
    box.className = `status ${bad ? "bad" : "good"}`;
    box.textContent = message || "";
  }

  function render(data) {
    state = data;

    if (!data.match) {
      location.replace("checkmate-waiting.html");
      return;
    }

    const match = data.match;
    document.getElementById("phasePill").textContent = label(match.phase);
    document.getElementById("boardPill").textContent = `BOARD ${match.boardNumber}`;
    document.getElementById("matchStatusPill").textContent = label(match.status);

    document.getElementById("whiteName").textContent = match.whiteName;
    document.getElementById("blackName").textContent = match.blackName;
    document.getElementById("whiteClock").textContent = clock(match.whiteTimeMs);
    document.getElementById("blackClock").textContent = clock(match.blackTimeMs);
    document.getElementById("whiteMaterial").textContent = match.whiteMaterial;
    document.getElementById("blackMaterial").textContent = match.blackMaterial;
    document.getElementById("whiteTournament").textContent = Number(match.whiteTournamentPoints || 0).toFixed(1);
    document.getElementById("blackTournament").textContent = Number(match.blackTournamentPoints || 0).toFixed(1);
    document.getElementById("whiteMoves").textContent = match.whiteMoves;
    document.getElementById("blackMoves").textContent = match.blackMoves;
    document.getElementById("fullMove").textContent = `${match.fullMoves} / 50`;

    const diff = Number(match.whiteMaterial) - Number(match.blackMaterial);
    document.getElementById("materialDiff").textContent =
      diff === 0 ? "EVEN" : diff > 0 ? `WHITE +${diff}` : `BLACK +${Math.abs(diff)}`;

    document.getElementById("whiteCard").classList.toggle("active", match.status === "running" && match.activeColor === "white");
    document.getElementById("blackCard").classList.toggle("active", match.status === "running" && match.activeColor === "black");

    document.getElementById("turnLabel").textContent =
      match.status === "completed"
        ? `RESULT · ${label(match.result)}`
        : match.status === "paused"
          ? "MATCH STOPPED"
          : match.status === "waiting"
            ? "WAITING FOR ADMIN START"
            : `${match.activeColor.toUpperCase()} TO MOVE`;

    const myColor = data.you.color;
    document.getElementById("youAre").textContent = `You are ${myColor.toUpperCase()} · ${data.player.playerName}`;

    const myTurn = match.status === "running" && match.activeColor === myColor && data.eventControl?.status === "running";
    document.getElementById("moveDoneButton").disabled = !myTurn;
    document.querySelectorAll(".cm-capture").forEach(button => button.disabled = !myTurn);
    document.getElementById("resignButton").disabled = match.status !== "running";

    if (match.status === "completed") {
      setMessage(`${label(match.result)} · ${match.resultReason || "Match completed"}`);
    } else if (data.eventControl?.status === "paused") {
      setMessage("Checkmate is stopped by the coordinator. Clocks are paused.", true);
    } else if (match.status === "paused") {
      setMessage("This match is paused by the coordinator.", true);
    } else if (match.status === "waiting") {
      setMessage("Board is created. Wait for the coordinator to start the match.");
    } else if (!myTurn) {
      setMessage("Opponent's turn. Your clock is stopped.");
    } else {
      setMessage("Your turn. Make the physical-board move, select any captured piece, then press MOVE DONE.");
    }
  }

  async function load() {
    try {
      const data = await request("/state");
      render(data);
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  document.getElementById("captureButtons").addEventListener("click", eventObject => {
    const button = eventObject.target.closest(".cm-capture");
    if (!button || button.disabled) return;
    selectedPiece = button.dataset.piece || "";
    document.querySelectorAll(".cm-capture").forEach(item => item.classList.toggle("selected", item === button));
    document.getElementById("captureSummary").textContent =
      selectedPiece ? `CAPTURE: ${selectedPiece.toUpperCase()} · ${pieceValues[selectedPiece]} PT` : "NO CAPTURE SELECTED";
  });

  document.getElementById("moveDoneButton").addEventListener("click", async () => {
    const button = document.getElementById("moveDoneButton");
    button.disabled = true;
    try {
      const data = await request("/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capturedPiece: selectedPiece || null })
      });
      selectedPiece = "";
      document.querySelectorAll(".cm-capture").forEach(item => item.classList.toggle("selected", item.dataset.piece === ""));
      document.getElementById("captureSummary").textContent = "NO CAPTURE SELECTED";
      setMessage(data.message || "Move recorded.");
      await load();
    } catch (error) {
      setMessage(error.message, true);
      button.disabled = false;
    }
  });

  document.getElementById("resignButton").addEventListener("click", async () => {
    if (!confirm("Resign this match? This immediately gives the opponent the win.")) return;
    try {
      await request("/resign", { method: "POST" });
      await load();
    } catch (error) {
      setMessage(error.message, true);
    }
  });

  document.getElementById("refreshMatch").addEventListener("click", load);

  load();
  pollTimer = setInterval(load, 1000);
})();
