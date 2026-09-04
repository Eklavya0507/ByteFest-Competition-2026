(function () {
  const API = window.BYTEFEST_CONFIG.API_URL;
  const token = localStorage.getItem("bytefest_competition_admin");
  if (!token) {
    location.replace("admin-login.html");
    return;
  }

  let eventName = "Bug Hunt";
  let loadBusy = false;

  const rows = document.getElementById("teamRows");
  const playerRows = document.getElementById("checkmatePlayerRows");
  const matchRows = document.getElementById("checkmateMatchRows");
  const status = document.getElementById("adminStatus");
  const phase = document.getElementById("eventPhase");
  const eventControlButton = document.getElementById("eventControlButton");
  const resetBugHuntButton = document.getElementById("resetBugHuntButton");
  const standardSection = document.getElementById("standardAdminSection");
  const checkmateSection = document.getElementById("checkmateAdminSection");
  const createMatchForm = document.getElementById("createMatchForm");
  const summary = document.getElementById("adminSummary");

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
      phase.textContent = eventName === "Bug Hunt" && control.competitionPhase
        ? `${phaseLabel(control.status || "not_started")} · ${phaseLabel(control.competitionPhase)}`
        : phaseLabel(control.status || "not_started");

      const upper = eventName.toUpperCase();
      const running = control.status === "running";
      const paused = control.status === "paused";
      eventControlButton.dataset.action = running ? "stop" : (paused ? "resume" : "start");
      eventControlButton.textContent = running ? `STOP ${upper}` : paused ? `RESUME ${upper}` : `START ${upper}`;
      eventControlButton.classList.toggle("danger", running);
      eventControlButton.classList.toggle("good", !running);
    } catch (error) {
      phase.textContent = error.message;
    }
  }

  function summaryCard(label, value) {
    return `<div class="admin-summary-card"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`;
  }

  function renderStandardSummary(data) {
    const entered = data.filter(team => team.loggedIn).length;
    const dq = data.filter(team => team.disqualified).length;
    const completed = data.filter(team => team.currentRound === "completed").length;
    const waitingRank = data.filter(team => /WAITING FOR (QUALIFICATION|RANKING)/.test(team.progressLabel || "")).length;
    const ranked = data.filter(team => team.rank).length;
    summary.innerHTML = [
      summaryCard("Approved", data.length),
      summaryCard("Entered", entered),
      summaryCard("Waiting Rank", waitingRank),
      summaryCard("Ranked", ranked),
      summaryCard("Completed", completed),
      summaryCard("DQ", dq)
    ].join("");
  }

  function progressAudit(team) {
    const details = team.progressDetails || [];
    if (!details.length) return "";
    return `<div class="progress-audit">${details.map(item => `
      <div class="progress-audit-row">
        <span>${esc(phaseLabel(item.key))} ${item.completed ? "✓" : item.started ? "•" : ""}</span>
        <b>${item.completedStages}/${item.totalStages} · ${item.score} pts</b>
      </div>
      ${(item.stages || []).map(stage => `<div class="progress-audit-row"><span>↳ ${esc(stage.title || `Stage ${stage.stage}`)}</span><b>${stage.completedAt ? `${stage.score} pts` : 'OPEN'} · Try ${stage.attempts || 0} · Hint ${stage.hintsUsed || 0}</b></div>`).join("")}
    `).join("")}</div>`;
  }

  function renderStandard(data) {
    renderStandardSummary(data);
    const sorted = [...data].sort((a, b) =>
      Number(a.finalPlace || 9999) - Number(b.finalPlace || 9999)
      || Number(a.rank || 9999) - Number(b.rank || 9999)
      || Number(a.liveRank || 9999) - Number(b.liveRank || 9999)
      || String(a.teamName || "").localeCompare(String(b.teamName || ""))
    );

    rows.innerHTML = sorted.map(team => {
      const detail = (team.progressDetails || []).find(item => item.key === team.currentRound);
      const stage = !team.loggedIn ? "-" : detail?.totalStages ? `${Math.min(Number(team.currentStage || 1), detail.totalStages)}/${detail.totalStages}` : team.currentStage || "-";
      const thirdScore = team.round3 || 0;
      const statusClass = team.disqualified || team.currentRound === "eliminated" ? "bad" : /COMPLETED|WAITING/.test(team.progressLabel || "") ? "live" : "";
      const official = team.finalPlace
        ? `FINAL #${team.finalPlace}`
        : team.rank
          ? `#${team.rank}`
          : "-";
      const officialSource = team.finalPlace ? (team.finalPlaceSource || "auto") : (team.rankSource || "auto");
      const source = (team.finalPlace || team.rank) ? `<small class="rank-source ${officialSource === "manual" ? "manual" : ""}">${esc(officialSource.toUpperCase())}</small>` : "";

      return `
        <tr>
          <td><b>${esc(team.registrationId)}</b></td>
          <td>${esc(team.teamName || "TEAM NAME NOT SET")}</td>
          <td><code>${esc(team.password)}</code></td>
          <td>${esc((team.members || []).join(", "))}</td>
          <td>
            <details class="progress-detail">
              <summary><span class="pill ${statusClass}">${esc(team.progressLabel || phaseLabel(team.currentRound))}</span></summary>
              ${progressAudit(team)}
            </details>
          </td>
          <td>${esc(stage)}</td>
          <td>${team.round1 || 0}</td>
          <td>${team.round2 || 0}</td>
          <td>${thirdScore}</td>
          <td>${team.surprise || 0}</td>
          <td><b>${team.qualificationScore || 0}</b></td>
          <td>${team.finalScore || 0}</td>
          <td>${team.hints || 0}<br><small>Wrong ${team.wrongSubmissions || 0}</small></td>
          <td>${team.liveRank ? `<span class="live-rank">#${team.liveRank}</span><br><small>PREVIEW</small>` : "-"}</td>
          <td><b>${official}</b>${source}</td>
          <td>${team.disqualified
            ? '<span class="pill bad">DISQUALIFIED</span>'
            : team.locked
              ? `<span class="pill bad">LOCKED · ${team.violations}/4</span>${team.lockReason ? `<br><small>${esc(team.lockReason)}</small>` : ""}`
              : `<span class="pill live">UNLOCKED · ${team.violations}/4</span>${team.lastSecurityEvent ? `<br><small>${esc(team.lastSecurityEvent.reason)}</small>` : ""}`
          }</td>
          <td>
            <div class="admin-actions">
              <button class="btn rank-team" data-id="${esc(team.registrationId)}" data-rank="${team.rank || ""}">SET QUAL RANK</button>
              <button class="btn final-place-team" data-id="${esc(team.registrationId)}" data-place="${team.finalPlace || ""}">SET FINAL</button>
              ${team.disqualified
                ? `<button class="btn good act" data-action="resume" data-id="${esc(team.registrationId)}">ONE MORE CHANCE</button>`
                : team.locked
                  ? `<button class="btn good act" data-action="unlock" data-id="${esc(team.registrationId)}">UNLOCK</button>`
                  : `<button class="btn act" data-action="lock" data-id="${esc(team.registrationId)}">LOCK</button>`}
              ${team.disqualified ? "" : `<button class="btn danger act" data-action="disqualify" data-id="${esc(team.registrationId)}">DQ</button>`}
              <button class="btn danger restart-team" data-id="${esc(team.registrationId)}">RESTART</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  function renderCheckmatePlayers(data) {
    const list = document.getElementById("checkmatePlayers");
    list.innerHTML = data.map(player => `<option value="${esc(player.registrationId)}">${esc(player.playerName)}</option>`).join("");

    playerRows.innerHTML = data.map(player => `
      <tr>
        <td>${player.finalPlace
          ? `<b>FINAL #${player.finalPlace}</b><small class="rank-source ${player.finalPlaceSource === "manual" ? "manual" : ""}">${esc((player.finalPlaceSource || "auto").toUpperCase())}</small><br><small>League #${player.rank || "-"}</small>`
          : player.rank
            ? `<b>#${player.rank}</b><small class="rank-source ${player.rankSource === "manual" ? "manual" : ""}">${esc((player.rankSource || "auto").toUpperCase())}</small>`
            : "-"}</td>
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
        <td><div class="admin-actions"><button class="btn cm-rank-player" data-id="${esc(player.registrationId)}" data-rank="${player.rank || ""}">SET RANK</button><button class="btn cm-final-player" data-id="${esc(player.registrationId)}" data-place="${player.finalPlace || ""}">SET FINAL</button></div></td>
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

  function renderCheckmateSummary(players, matches) {
    summary.innerHTML = [
      summaryCard("Players", players.length),
      summaryCard("Matches", matches.length),
      summaryCard("Running", matches.filter(match => match.status === "running").length),
      summaryCard("Waiting", matches.filter(match => match.status === "waiting").length),
      summaryCard("Completed", matches.filter(match => match.status === "completed").length),
      summaryCard("Ranked", players.filter(player => player.rank).length)
    ].join("");
  }

  async function loadCheckmate() {
    const [players, matches] = await Promise.all([
      req("/api/competition/admin/registrations?event=Checkmate"),
      req("/api/competition/admin/checkmate/matches")
    ]);

    renderCheckmatePlayers(players);
    renderCheckmateMatches(matches);
    renderCheckmateSummary(players, matches);
    status.className = "status good";
    status.textContent = `${players.length} approved Checkmate participant(s) · ${matches.length} match(es).`;
  }

  async function loadStandard() {
    const data = await req(`/api/competition/admin/registrations?event=${encodeURIComponent(eventName)}`);
    renderStandard(data);
    const entered = data.filter(team => team.loggedIn).length;
    status.className = "status good";
    status.textContent = `${data.length} approved ${eventName} registration(s) · ${entered} entered competition.`;
  }

  async function load() {
    if (loadBusy) return;
    loadBusy = true;
    status.className = "status";
    status.textContent = "Loading approved registrations...";
    standardSection.hidden = eventName === "Checkmate";
    checkmateSection.hidden = eventName !== "Checkmate";
    resetBugHuntButton.hidden = eventName !== "Bug Hunt";

    const r3Head = document.getElementById("r3Head");
    r3Head.textContent = "R3";
    r3Head.style.display = eventName === "Checkmate" ? "none" : "";
    document.getElementById("surpriseHead").style.display = eventName === "Checkmate" ? "none" : "";

    try {
      await Promise.all([
        eventName === "Checkmate" ? loadCheckmate() : loadStandard(),
        loadControl()
      ]);
    } catch (error) {
      status.className = "status bad";
      status.textContent = error.message;
    } finally {
      loadBusy = false;
    }
  }

  async function setManualRank(id, currentRank = "") {
    const entered = prompt(
      `MANUAL RANK FALLBACK · ${eventName}\n\nRegistration: ${id}\nCurrent rank: ${currentRank || "not locked"}\n\nEnter a rank number, or type AUTO to return this participant/team to automatic ranking:`,
      currentRank || ""
    );
    if (entered === null) return;
    const value = entered.trim();
    if (!value) return;
    const rank = value.toUpperCase() === "AUTO" ? "auto" : Number(value);
    if (rank !== "auto" && (!Number.isInteger(rank) || rank < 1)) {
      alert("Enter a positive whole-number rank, or AUTO.");
      return;
    }

    const result = await req(`/api/competition/admin/team/${encodeURIComponent(eventName)}/${encodeURIComponent(id)}/rank`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rank })
    });
    alert(result.message);
    await load();
  }

  async function setManualFinalPlace(id, currentPlace = "") {
    const entered = prompt(
      `MANUAL FINAL PLACE · ${eventName}\n\nRegistration: ${id}\nCurrent final place: ${currentPlace || "not locked"}\n\nEnter a final place number, or type AUTO to return it to automatic mode:`,
      currentPlace || ""
    );
    if (entered === null) return;
    const value = entered.trim();
    if (!value) return;
    const finalPlace = value.toUpperCase() === "AUTO" ? "auto" : Number(value);
    if (finalPlace !== "auto" && (!Number.isInteger(finalPlace) || finalPlace < 1)) {
      alert("Enter a positive whole-number final place, or AUTO.");
      return;
    }
    const result = await req(`/api/competition/admin/team/${encodeURIComponent(eventName)}/${encodeURIComponent(id)}/final-place`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finalPlace })
    });
    alert(result.message);
    await load();
  }

  document.querySelectorAll(".tab").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      eventName = button.dataset.event;
      document.getElementById("eventTitle").textContent = eventName;
      document.getElementById("projectorLink").href =
        eventName === "Checkmate" ? "admin-dashboard.html" : `projector.html?event=${encodeURIComponent(eventName)}`;
      document.getElementById("credentialsLink").href = `admin-participants-print.html?event=${encodeURIComponent(eventName)}`;
      load();
    });
  });

  rows.addEventListener("click", async eventObject => {
    const rankButton = eventObject.target.closest(".rank-team");
    if (rankButton) {
      try { await setManualRank(rankButton.dataset.id, rankButton.dataset.rank); }
      catch (error) { alert(error.message); }
      return;
    }

    const finalPlaceButton = eventObject.target.closest(".final-place-team");
    if (finalPlaceButton) {
      try { await setManualFinalPlace(finalPlaceButton.dataset.id, finalPlaceButton.dataset.place); }
      catch (error) { alert(error.message); }
      return;
    }

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

    if (button.dataset.action === "resume") {
      if (!confirm(`Give ONE MORE CHANCE to ${button.dataset.id}?\n\nThe DQ/lock will be removed and the team will rejoin the CURRENT official Bug Hunt phase. Existing score and completed progress will be kept.`)) return;
    }

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

  playerRows.addEventListener("click", async eventObject => {
    const rankButton = eventObject.target.closest(".cm-rank-player");
    if (rankButton) {
      try { await setManualRank(rankButton.dataset.id, rankButton.dataset.rank); }
      catch (error) { alert(error.message); }
      return;
    }
    const finalButton = eventObject.target.closest(".cm-final-player");
    if (finalButton) {
      try { await setManualFinalPlace(finalButton.dataset.id, finalButton.dataset.place); }
      catch (error) { alert(error.message); }
    }
  });

  eventControlButton.addEventListener("click", async () => {
    const action = eventControlButton.dataset.action || "start";
    const verb = action === "stop" ? "STOP" : action === "resume" ? "RESUME" : "START";
    if (!confirm(`${verb} ${eventName} now?`)) return;
    try {
      await req(`/api/competition/admin/control/${eventSlug(eventName)}/${action}`, { method: "POST" });
      load();
    } catch (error) { alert(error.message); }
  });

  resetBugHuntButton.addEventListener("click", async () => {
    const typed = prompt(
      "FRESH BUG HUNT RESET\n\nThis clears ONLY Bug Hunt competition test progress: scores, hints, DQ, ranks, results and old Bug Hunt team sessions. Approved registrations are NOT deleted.\n\nType RESET BUG HUNT to continue:"
    );
    if (typed !== "RESET BUG HUNT") return;

    try {
      const result = await req("/api/competition/admin/bughunt/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: typed })
      });
      alert(result.message + "\n\nNow press START BUG HUNT when the real event is ready. Participants should log in again.");
      load();
    } catch (error) {
      alert(error.message);
    }
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

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) load();
  });


  let knownSecurityAlerts = new Set();
  let securityPrimed = false;
  function adminAlertSound() {
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      const ctx = new C();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 1040;
      gain.gain.value = 0.16;
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.28);
    } catch {}
  }
  function formatAlertTime(value) {
    if (!value) return "--:--:--";
    try { return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
    catch { return "--:--:--"; }
  }
  async function loadSecurityAlerts() {
    try {
      const alerts = await req('/api/competition/admin/security-alerts');
      const list = document.getElementById('securityAlertList');
      const statusEl = document.getElementById('securityAlertStatus');
      const fresh = alerts.filter(a => !knownSecurityAlerts.has(a.id));
      if (securityPrimed && fresh.length) adminAlertSound();
      alerts.forEach(a => knownSecurityAlerts.add(a.id));
      securityPrimed = true;
      statusEl.textContent = alerts.length ? `${alerts.length} RECENT` : 'LISTENING';
      list.innerHTML = alerts.length ? alerts.slice(0,25).map(a => `
        <div class="security-alert-row ${fresh.some(f=>f.id===a.id)?'new':''}">
          <b>${esc(formatAlertTime(a.at))}</b>
          <span><b>${esc(a.registrationId)}</b><br><small>${esc(a.teamName || '')}</small></span>
          <span>${esc((a.members || []).join(', '))}</span>
          <span class="reason">${esc(a.reason)}${a.detail ? `<br><small>${esc(a.detail)}</small>` : ''}</span>
          <span>${a.disqualified ? 'DQ' : a.locked ? 'LOCKED' : `V${a.violations || 0}`}</span>
        </div>`).join('') : '<div class="status">No security alerts yet.</div>';
    } catch (error) {
      const statusEl = document.getElementById('securityAlertStatus');
      if (statusEl) statusEl.textContent = 'ALERT ERROR';
    }
  }
  document.getElementById('testSecuritySound')?.addEventListener('click', adminAlertSound);
  load();
  loadSecurityAlerts();
  setInterval(() => { if (!document.hidden) load(); }, 10000);
  setInterval(() => { if (!document.hidden) loadSecurityAlerts(); }, 3000);
})();
