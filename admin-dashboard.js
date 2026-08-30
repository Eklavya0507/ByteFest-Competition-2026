(function () {
  const API = window.BYTEFEST_CONFIG.API_URL;
  const token = localStorage.getItem("bytefest_competition_admin");
  if (!token) {
    location.replace("admin-login.html");
    return;
  }

  let eventName = "Code Sprint";

  const rows = document.getElementById("teamRows");
  const playerRows = document.getElementById("checkmatePlayerRows");
  const matchRows = document.getElementById("checkmateMatchRows");
  const status = document.getElementById("adminStatus");
  const phase = document.getElementById("eventPhase");
  const eventControlButton = document.getElementById("eventControlButton");
  const standardSection = document.getElementById("standardAdminSection");
  const checkmateSection = document.getElementById("checkmateAdminSection");
  const createMatchForm = document.getElementById("createMatchForm");

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function eventSlug(name) {
    return encodeURIComponent(name);
  }

  function formatClock(ms) {
    const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function phaseLabel(value) {
    return String(value || "").replaceAll("_", " ").toUpperCase();
  }

  async function req(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });

    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {}

    if (response.status === 401) {
      localStorage.removeItem("bytefest_competition_admin");
      location.replace("admin-login.html");
      throw new Error("Session expired");
    }

    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
  }

  async function loadControl() {
    try {
      const control = await req(`/api/competition/admin/control/${eventSlug(eventName)}`);
      phase.textContent = phaseLabel(control.status || "not_started");

      const upper = eventName.toUpperCase();
      const running = control.status === "running";
      eventControlButton.dataset.action = running ? "stop" : (control.status === "paused" ? "resume" : "start");
      eventControlButton.textContent = running ? `STOP ${upper}` : `START ${upper}`;
      eventControlButton.classList.toggle("danger", running);
      eventControlButton.classList.toggle("good", !running);
    } catch (error) {
      phase.textContent = error.message;
    }
  }

  function renderStandard(data) {
    rows.innerHTML = data.map(team => `
      <tr>
        <td><b>${esc(team.registrationId)}</b></td>
        <td>${esc(team.teamName || "TEAM NAME NOT SET")}</td>
        <td><code>${esc(team.password)}</code></td>
        <td>${esc((team.members || []).join(", "))}</td>
        <td>${esc(team.currentRound)}</td>
        <td>${team.currentStage || "-"}</td>
        <td>${team.round1 || 0}</td>
        <td>${team.round2 || 0}</td>
        <td>${eventName === "Bug Hunt" ? (team.round3 || 0) : "-"}</td>
        <td>${eventName === "Bug Hunt" ? (team.surprise || 0) : "-"}</td>
        <td><b>${team.totalScore || 0}</b>${eventName === "Bug Hunt" && team.finalScore ? `<br><small>Final ${team.finalScore}</small>` : ""}</td>
        <td>${team.hints || 0}</td>
        <td>${team.finalPlace ? `FINAL #${team.finalPlace}` : team.rank ? `#${team.rank}` : "-"}</td>
        <td>${team.disqualified
          ? '<span class="pill bad">DISQUALIFIED</span>'
          : team.locked
            ? `<span class="pill bad">LOCKED · ${team.violations}/4</span>`
            : `<span class="pill live">UNLOCKED · ${team.violations}/4</span>`
        }</td>
        <td>
          <div class="admin-actions">
            ${team.locked
              ? `<button class="btn good act" data-action="unlock" data-id="${esc(team.registrationId)}">UNLOCK</button>`
              : `<button class="btn act" data-action="lock" data-id="${esc(team.registrationId)}">LOCK</button>`}
            <button class="btn danger act" data-action="disqualify" data-id="${esc(team.registrationId)}">DQ</button>
            <button class="btn danger restart-team" data-id="${esc(team.registrationId)}">RESTART</button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  function renderCheckmatePlayers(data) {
    const list = document.getElementById("checkmatePlayers");
    list.innerHTML = data.map(player => `<option value="${esc(player.registrationId)}">${esc(player.playerName)}</option>`).join("");

    playerRows.innerHTML = data.map(player => `
      <tr>
        <td>${player.rank ? `#${player.rank}` : "-"}</td>
        <td><b>${esc(player.registrationId)}</b></td>
        <td>${esc(player.playerName)}</td>
        <td><code>${esc(player.password)}</code></td>
        <td><b>${Number(player.tournamentPoints || 0).toFixed(1)}</b></td>
        <td>${player.wins || 0} / ${player.draws || 0} / ${player.losses || 0}</td>
        <td>${player.capturePoints || 0}</td>
        <td>${player.materialDifferential > 0 ? "+" : ""}${player.materialDifferential || 0}</td>
        <td>${player.currentMatch ? `${player.currentMatch.color === "white" ? "W" : "B"} ${player.currentMaterial}` : "-"}</td>
        <td>${player.currentMatch ? player.moves : player.totalMoves || 0}</td>
        <td>${player.currentMatch ? `Board ${player.currentMatch.boardNumber} · ${phaseLabel(player.currentMatch.phase)} · ${phaseLabel(player.currentMatch.status)}` : "WAITING"}</td>
      </tr>
    `).join("");
  }

  function renderCheckmateMatches(matches) {
    matchRows.innerHTML = matches.map(match => {
      const whiteCapture = 39 - Number(match.blackMaterial || 39);
      const blackCapture = 39 - Number(match.whiteMaterial || 39);
      const actions = [];

      if (match.status === "waiting") actions.push(`<button class="btn good cm-match-action" data-action="start" data-id="${match.id}">START</button>`);
      if (match.status === "running") actions.push(`<button class="btn danger cm-match-action" data-action="stop" data-id="${match.id}">STOP</button>`);
      if (match.status === "paused" && !match.security?.locked) actions.push(`<button class="btn good cm-match-action" data-action="resume" data-id="${match.id}">RESUME</button>`);

      if (match.status !== "completed") {
        actions.push(match.security?.locked
          ? `<button class="btn good cm-match-action" data-action="security-unlock" data-id="${match.id}">UNLOCK</button>`
          : `<button class="btn cm-match-action" data-action="security-lock" data-id="${match.id}">LOCK</button>`);
      }

      if (match.status !== "completed") {
        actions.push(`<button class="btn cm-match-action" data-action="white_win" data-id="${match.id}">WHITE WIN</button>`);
        actions.push(`<button class="btn cm-match-action" data-action="draw" data-id="${match.id}">DRAW</button>`);
        actions.push(`<button class="btn cm-match-action" data-action="black_win" data-id="${match.id}">BLACK WIN</button>`);
      }

      return `
        <tr>
          <td><b>${match.boardNumber}</b></td>
          <td>${phaseLabel(match.phase)}</td>
          <td>${esc(match.whiteName)}<br><small>${esc(match.whiteRegistrationId)}</small></td>
          <td>${esc(match.blackName)}<br><small>${esc(match.blackRegistrationId)}</small></td>
          <td>${phaseLabel(match.status)}${match.activeColor ? `<br><small>TURN: ${match.activeColor.toUpperCase()}</small>` : ""}
          <br><small>SECURITY: ${match.security?.locked ? `LOCKED ${match.security.violations}/4` : `UNLOCKED ${match.security?.violations || 0}/4`}</small></td>
          <td>8+3<br>W ${formatClock(match.whiteTimeMs)}<br>B ${formatClock(match.blackTimeMs)}</td>
          <td>W ${match.whiteMaterial} · B ${match.blackMaterial}</td>
          <td>W +${whiteCapture} · B +${blackCapture}</td>
          <td>W ${match.whiteMoves} · B ${match.blackMoves}<br><small>Full ${match.fullMoves}</small></td>
          <td>${match.result ? `${phaseLabel(match.result)}<br><small>${esc(match.resultReason || "")}</small>` : "-"}</td>
          <td><div class="admin-actions">${actions.join("")}</div></td>
        </tr>
      `;
    }).join("");
  }

  async function loadCheckmate() {
    const [players, matches] = await Promise.all([
      req("/api/competition/admin/registrations?event=Checkmate"),
      req("/api/competition/admin/checkmate/matches")
    ]);

    renderCheckmatePlayers(players);
    renderCheckmateMatches(matches);
    status.className = "status good";
    status.textContent = `${players.length} approved Checkmate participant(s) · ${matches.length} match(es).`;
  }

  async function loadStandard() {
    const data = await req(`/api/competition/admin/registrations?event=${encodeURIComponent(eventName)}`);
    renderStandard(data);
    status.className = "status good";
    status.textContent = `${data.length} approved ${eventName} registration(s).`;
  }

  async function load() {
    status.className = "status";
    status.textContent = "Loading approved registrations...";
    standardSection.hidden = eventName === "Checkmate";
    checkmateSection.hidden = eventName !== "Checkmate";

    document.getElementById("r3Head").style.display = eventName === "Bug Hunt" ? "" : "none";
    document.getElementById("surpriseHead").style.display = eventName === "Bug Hunt" ? "" : "none";

    try {
      if (eventName === "Checkmate") await loadCheckmate();
      else await loadStandard();
    } catch (error) {
      status.className = "status bad";
      status.textContent = error.message;
    }

    await loadControl();
  }

  document.querySelectorAll(".tab").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      eventName = button.dataset.event;
      document.getElementById("eventTitle").textContent = eventName;
      document.getElementById("projectorLink").href =
        eventName === "Checkmate" ? "admin-dashboard.html" : `projector.html?event=${encodeURIComponent(eventName)}`;
      load();
    });
  });

  rows.addEventListener("click", async eventObject => {
    const restartButton = eventObject.target.closest(".restart-team");
    if (restartButton) {
      const id = restartButton.dataset.id;
      if (!confirm(`RESTART ${eventName} for ${id}?\n\nScores, submissions, hints, rank and security progress will be cleared. Registration ID, team name and password stay the same.`)) return;
      try {
        const result = await req(`/api/competition/admin/team/${encodeURIComponent(eventName)}/${encodeURIComponent(id)}/restart`, { method: "POST" });
        alert(result.message);
        load();
      } catch (error) { alert(error.message); }
      return;
    }

    const button = eventObject.target.closest(".act");
    if (!button) return;

    try {
      await req(`/api/competition/admin/team/${encodeURIComponent(eventName)}/${encodeURIComponent(button.dataset.id)}/security`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: button.dataset.action })
      });
      load();
    } catch (error) {
      alert(error.message);
    }
  });

  eventControlButton.addEventListener("click", async () => {
    const action = eventControlButton.dataset.action || "start";
    const verb = action === "stop" ? "STOP" : "START";
    if (!confirm(`${verb} ${eventName} now?`)) return;
    try {
      await req(`/api/competition/admin/control/${eventSlug(eventName)}/${action}`, { method: "POST" });
      load();
    } catch (error) { alert(error.message); }
  });

  createMatchForm.addEventListener("submit", async eventObject => {
    eventObject.preventDefault();
    try {
      await req("/api/competition/admin/checkmate/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: document.getElementById("matchPhase").value,
          whiteRegistrationId: document.getElementById("whiteId").value.trim().toUpperCase(),
          blackRegistrationId: document.getElementById("blackId").value.trim().toUpperCase(),
          boardNumber: Number(document.getElementById("boardNumber").value),
          clockMinutes: 8,
          incrementSeconds: 3
        })
      });
      document.getElementById("whiteId").value = "";
      document.getElementById("blackId").value = "";
      load();
    } catch (error) { alert(error.message); }
  });

  matchRows.addEventListener("click", async eventObject => {
    const button = eventObject.target.closest(".cm-match-action");
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;

    try {
      if (["white_win", "black_win", "draw"].includes(action)) {
        const reason = prompt("Result reason: checkmate, resignation, stalemate, agreement, material, coordinator decision", "coordinator decision") || "coordinator decision";
        await req(`/api/competition/admin/checkmate/match/${id}/end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ result: action, reason })
        });
      } else if (action === "security-lock" || action === "security-unlock") {
        await req(`/api/competition/admin/checkmate/match/${id}/security`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: action === "security-lock" ? "lock" : "unlock" })
        });
      } else {
        await req(`/api/competition/admin/checkmate/match/${id}/${action}`, { method: "POST" });
      }
      load();
    } catch (error) { alert(error.message); }
  });

  document.getElementById("exportExcelButton").addEventListener("click", async () => {
    const button = document.getElementById("exportExcelButton");
    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = "BUILDING EXCEL...";
    try {
      const response = await fetch(`${API}/api/competition/admin/report/${encodeURIComponent(eventName)}.xlsx`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) {
        localStorage.removeItem("bytefest_competition_admin");
        location.replace("admin-login.html");
        return;
      }
      if (!response.ok) {
        let message = "Could not create Excel report";
        try { message = (await response.json()).message || message; } catch {}
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BYTEFEST_2026_${eventName.replaceAll(" ", "_")}_Official_Report.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (error) {
      alert(error.message);
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  });

  document.getElementById("refreshButton").addEventListener("click", load);
  document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem("bytefest_competition_admin");
    location.replace("admin-login.html");
  });

  load();
  setInterval(load, 5000);
})();
