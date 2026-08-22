(function () {
    const API = window.BYTEFEST_CONFIG.API_URL;
    const form = document.getElementById("adminLoginForm");
    const status = document.getElementById("adminLoginStatus");
    const button = document.getElementById("adminLoginButton");

    async function readJson(response) {
        const text = await response.text();
        try { return text ? JSON.parse(text) : {}; } catch { return {}; }
    }

    const existing = localStorage.getItem("bytefest_competition_admin");
    if (existing) {
        fetch(`${API}/api/admin/session`, { headers: { Authorization: `Bearer ${existing}` } })
            .then(response => {
                if (response.ok) location.replace("codesprint-admin.html");
                else localStorage.removeItem("bytefest_competition_admin");
            })
            .catch(() => {});
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();
        button.disabled = true;
        status.className = "cs-status";
        status.textContent = "Checking...";
        try {
            const response = await fetch(`${API}/api/admin/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: document.getElementById("adminPassword").value })
            });
            const data = await readJson(response);
            if (!response.ok) throw new Error(data.message || "Login failed");
            localStorage.setItem("bytefest_competition_admin", data.token);
            location.replace("codesprint-admin.html");
        } catch (error) {
            status.className = "cs-status bad";
            status.textContent = error.message;
            button.disabled = false;
        }
    });
}());
