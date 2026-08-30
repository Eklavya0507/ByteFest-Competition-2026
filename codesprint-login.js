(function () {
    const form = document.getElementById("csLoginForm");
    const status = document.getElementById("loginStatus");
    const button = document.getElementById("loginButton");
    const API = window.BYTEFEST_CONFIG.API_URL;

    const PAGE_FOR = {
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

    async function json(response) {
        const text = await response.text();
        try { return text ? JSON.parse(text) : {}; } catch { return {}; }
    }

    async function redirectFromToken(token) {
        const response = await fetch(`${API}/api/codesprint/state`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await json(response);
        if (!response.ok) throw new Error(data.message || "Unable to open competition");
        location.replace(PAGE_FOR[data.currentRound] || "codesprint-waiting.html");
    }

    const existing = sessionStorage.getItem("bytefest_codesprint_token");
    if (existing) redirectFromToken(existing).catch(() => sessionStorage.removeItem("bytefest_codesprint_token"));

    form.addEventListener("submit", async event => {
        event.preventDefault();
        status.className = "cs-status";
        status.textContent = "Checking team access...";
        button.disabled = true;
        try {
            const response = await fetch(`${API}/api/codesprint/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    teamId: document.getElementById("teamId").value.trim(),
                    password: document.getElementById("teamPassword").value
                })
            });
            const data = await json(response);
            if (!response.ok) throw new Error(data.message || "Login failed");
            sessionStorage.setItem("bytefest_codesprint_token", data.token);
            sessionStorage.removeItem("bytefest_codesprint_secure_session");
            sessionStorage.setItem("bytefest_codesprint_team", data.teamId);
            status.className = "cs-status good";
            status.textContent = "Login successful.";
            await redirectFromToken(data.token);
        } catch (error) {
            status.className = "cs-status bad";
            status.textContent = error.message;
            button.disabled = false;
        }
    });
}());
