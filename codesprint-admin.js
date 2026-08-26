(function () {
    const API = window.BYTEFEST_CONFIG.API_URL;
    const token = localStorage.getItem("bytefest_competition_admin");
    const rows = document.getElementById("teamRows");
    const status = document.getElementById("adminStatus");
    const createStatus = document.getElementById("createTeamStatus");

    if (!token) { location.replace("admin-login.html"); return; }

    function esc(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[char]));
    }

    async function readJson(response) {
        const text = await response.text();
        try { return text ? JSON.parse(text) : {}; } catch { return {}; }
    }

    function authHeaders(extra = {}) {
        return { Authorization: `Bearer ${token}`, ...extra };
    }

    async function loadTeams() {
        status.textContent = "Loading...";
        try {
            const response = await fetch(`${API}/api/codesprint/admin/teams`, { headers: authHeaders() });
            const data = await readJson(response);
            if (response.status === 401) {
                localStorage.removeItem("bytefest_competition_admin");
                location.replace("admin-login.html");
                return;
            }
            if (!response.ok) throw new Error(data.message || "Unable to load teams");
            rows.innerHTML = data.map(team => `
                <tr>
                    <td><b>${esc(team.teamId)}</b></td>
                    <td>${esc(team.teamName)}</td>
                    <td><code>${esc(team.password)}</code></td>
                    <td>${esc((team.members || []).join(", "))}</td>
                    <td>${esc(team.currentRound)}</td>
                    <td>${esc(team.currentStage)}</td>
                    <td>${team.round1}</td>
                    <td>${team.round2}</td>
                    <td>${team.qualifier}</td>
                    <td><b>${team.totalScore}</b></td>
                    <td>${team.rank ? `#${team.rank}` : "-"}</td>
                    <td>${team.disqualified ? "DISQUALIFIED" : team.locked ? `LOCKED (${team.violations}/4)` : `${team.violations}/4`}</td>
                    <td><button class="cs-btn danger deleteTeam" data-team="${esc(team.teamId)}" type="button">DELETE</button></td>
                </tr>`).join("");
            status.className = "cs-status good";
            status.textContent = `${data.length} team(s) loaded.`;
        } catch (error) {
            status.className = "cs-status bad";
            status.textContent = error.message;
        }
    }

    document.getElementById("createTeamForm").addEventListener("submit", async event => {
        event.preventDefault();
        createStatus.className = "cs-status";
        createStatus.textContent = "Creating team...";
        try {
            const members = ["member1", "member2", "member3"]
                .map(id => document.getElementById(id).value.trim())
                .filter(Boolean);
            const response = await fetch(`${API}/api/codesprint/admin/teams`, {
                method: "POST",
                headers: authHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({
                    teamName: document.getElementById("newTeamName").value.trim(),
                    members
                })
            });
            const data = await readJson(response);
            if (!response.ok) throw new Error(data.message || "Unable to create team");
            createStatus.className = "cs-status good";
            createStatus.innerHTML = `Created <b>${esc(data.teamId)}</b> · Password: <b>${esc(data.password)}</b>`;
            event.target.reset();
            await loadTeams();
        } catch (error) {
            createStatus.className = "cs-status bad";
            createStatus.textContent = error.message;
        }
    });

    rows.addEventListener("click", async event => {
        const button = event.target.closest(".deleteTeam");
        if (!button) return;
        const teamId = button.dataset.team;
        if (!confirm(`Delete ${teamId}?`)) return;
        const response = await fetch(`${API}/api/codesprint/admin/teams/${encodeURIComponent(teamId)}`, {
            method: "DELETE",
            headers: authHeaders()
        });
        const data = await readJson(response);
        if (!response.ok) {
            alert(data.message || "Delete failed");
            return;
        }
        loadTeams();
    });

    document.getElementById("refreshTeams").addEventListener("click", loadTeams);
    document.getElementById("adminLogout").addEventListener("click", () => {
        localStorage.removeItem("bytefest_competition_admin");
        location.replace("admin-login.html");
    });

    loadTeams();
    setInterval(loadTeams, 10000);
}());
