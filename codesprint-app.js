(function () {
    const API = window.BYTEFEST_CONFIG.API_URL;
    const token = sessionStorage.getItem("bytefest_codesprint_token");
    const expectedRound = document.body.dataset.round;
    const secureGate = document.getElementById("secureGate");
    const enterSecureButton = document.getElementById("enterSecureButton");
    const lockOverlay = document.getElementById("securityLock");
    const unlockForm = document.getElementById("unlockForm");
    const unlockPassword = document.getElementById("unlockPassword");
    const unlockStatus = document.getElementById("unlockStatus");
    const dqButton = document.getElementById("disqualifyButton");
    const secureSessionKey = "bytefest_codesprint_secure_session";
    const mobileDevice = window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
    let state = null;
    let secureStarted = sessionStorage.getItem(secureSessionKey) === "1";
    let enforceFullscreenThisPage = false;
    let violationInFlight = false;
    let lastViolationAt = 0;

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

    if (!token) {
        location.replace("codesprint-login.html");
        return;
    }

    history.pushState(null, "", location.href);
    window.addEventListener("popstate", () => history.go(1));

    async function request(path, options = {}) {
        const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
        if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
        const response = await fetch(`${API}/api/codesprint${path}`, { ...options, headers });
        const text = await response.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch {}
        if (response.status === 401) {
            sessionStorage.removeItem("bytefest_codesprint_token");
            location.replace("codesprint-login.html");
            throw new Error("Session expired");
        }
        if (!response.ok) {
            const error = new Error(data.message || `Request failed (${response.status})`);
            error.status = response.status;
            error.data = data;
            throw error;
        }
        return data;
    }

    function roundLabel(key) {
        return ({
            round1: "ROUND 1", round2: "ROUND 2", qualifier: "QUALIFIER",
            semifinal: "SEMIFINAL", wildcard: "WILDCARD ENTRY", entry_final: "ENTRY FINAL",
            wildcard_final: "FINAL WILDCARD", final: "GRAND FINAL"
        })[key] || key.toUpperCase();
    }

    function fillState(data) {
        state = data;
        document.getElementById("teamLabel").textContent = data.teamId;
        document.getElementById("roundLabel").textContent = roundLabel(data.currentRound);
        document.getElementById("scoreValue").textContent = data.totalScore;
        document.getElementById("violationPill").textContent = `SECURITY ${data.security.violations}/${data.security.maxViolations}`;
        const opponent = document.getElementById("opponentPill");
        if (data.opponent) {
            opponent.hidden = false;
            opponent.textContent = `VS ${data.opponent.teamId}`;
        } else opponent.hidden = true;
        renderStages(data.currentStage, data.stageCount);
        if (data.security.locked) showLock(data);
    }

    function renderStages(active, count) {
        const box = document.getElementById("stageProgress");
        box.replaceChildren();
        for (let i = 1; i <= count; i += 1) {
            const node = document.createElement("span");
            node.className = `cs-stage ${i < active ? "done" : i === active ? "active" : ""}`;
            node.textContent = i < active ? `Stage ${i} ✓` : i === active ? `Stage ${i} ●` : `Stage ${i} 🔒`;
            box.appendChild(node);
        }
    }

    function renderHints(hints) {
        const box = document.getElementById("hintList");
        box.replaceChildren();
        if (!hints || !hints.length) {
            const empty = document.createElement("div");
            empty.className = "cs-hint";
            empty.textContent = "No hint available in this stage.";
            box.appendChild(empty);
            return;
        }
        hints.forEach(hint => {
            const card = document.createElement("div");
            card.className = "cs-hint";
            const button = document.createElement("button");
            button.type = "button";
            button.disabled = !hint.available;
            button.innerHTML = `<span>${hint.used ? `View Hint ${hint.number} Again` : hint.available ? `Use Hint ${hint.number}` : `🔒 Hint ${hint.number}`}</span><span class="penalty">${hint.used ? "USED" : `-${hint.penalty}`}</span>`;
            const text = document.createElement("div");
            text.className = "cs-hint-text";
            if (hint.used) text.textContent = hint.text;
            button.addEventListener("click", async () => {
                if (hint.used) {
                    card.classList.toggle("open");
                    return;
                }
                try {
                    const data = await request(`/hint/${hint.number}`, { method: "POST" });
                    text.textContent = data.text;
                    card.classList.add("open");
                    await loadQuestion();
                    await loadState(false);
                } catch (error) {
                    setStatus(error.message, true);
                }
            });
            card.append(button, text);
            box.appendChild(card);
        });
    }

    function setStatus(message, bad = false) {
        const box = document.getElementById("answerStatus");
        box.textContent = message;
        box.className = `cs-status${bad ? " bad" : " good"}`;
    }

    async function loadQuestion() {
        try {
            const data = await request("/question");
            document.getElementById("stageTitle").textContent = data.question.title;
            document.getElementById("questionPrompt").textContent = data.question.prompt;
            const input = document.getElementById("answerInput");
            input.value = "";
            input.placeholder = data.question.placeholder || "Enter answer";
            if (window.BytefestQuestionUI) {
                window.BytefestQuestionUI.render(data.question, { mount: document.querySelector(".cs-question"), input });
            }
            renderHints(data.question.hints);
            startClock(data);
        } catch (error) {
            if (error.status === 423) {
                await loadState(false);
                return;
            }
            setStatus(error.message, true);
        }
    }

    let clockTimer = null;
    function startClock(data) {
        clearInterval(clockTimer);
        const clock = document.getElementById("clockPill");
        const started = new Date(data.roundStartedAt).getTime();
        const limit = Number(data.timeLimitSeconds || 0) * 1000;
        if (!started || !limit) {
            clock.hidden = true;
            return;
        }
        clock.hidden = false;
        const tick = () => {
            const remaining = Math.max(0, limit - (Date.now() - started));
            const total = Math.floor(remaining / 1000);
            const m = String(Math.floor(total / 60)).padStart(2, "0");
            const s = String(total % 60).padStart(2, "0");
            clock.textContent = `TIME ${m}:${s}`;
        };
        tick();
        clockTimer = setInterval(tick, 1000);
    }

    async function submitAnswer(event) {
        event.preventDefault();
        const input = document.getElementById("answerInput");
        const button = document.getElementById("submitAnswerButton");
        button.disabled = true;
        setStatus("Checking answer...");
        try {
            const data = await request("/submit", {
                method: "POST",
                body: JSON.stringify({ answer: input.value })
            });
            if (!data.correct) {
                setStatus(data.message, true);
                button.disabled = false;
                return;
            }
            setStatus(data.message);
            await loadState(false);
            if (!data.completedRound) {
                setTimeout(() => loadQuestion(), 500);
                button.disabled = false;
                return;
            }
            setTimeout(() => routeToCurrent(), 650);
        } catch (error) {
            setStatus(error.message, true);
            button.disabled = false;
        }
    }

    async function loadState(checkRoute = true) {
        const data = await request("/state");
        fillState(data);
        if (checkRoute && data.currentRound !== expectedRound) {
            location.replace(PAGE_FOR[data.currentRound] || "codesprint-waiting.html");
        }
        return data;
    }

    async function routeToCurrent() {
        const data = await request("/state");
        location.replace(PAGE_FOR[data.currentRound] || "codesprint-waiting.html");
    }

    function beep() {
        try {
            const Context = window.AudioContext || window.webkitAudioContext;
            const ctx = new Context();
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            oscillator.type = "square";
            oscillator.frequency.value = 880;
            gain.gain.value = .14;
            oscillator.connect(gain);
            gain.connect(ctx.destination);
            oscillator.start();
            oscillator.stop(ctx.currentTime + .45);
        } catch {}
    }

    function showLock(data) {
        beep();
        document.getElementById("lockCount").textContent = `${data.security.violations}/${data.security.maxViolations}`;
        document.getElementById("lockReason").textContent = data.security.lockReason || "Prohibited window action detected.";
        const finalDecision = data.security.violations >= data.security.maxViolations;
        document.getElementById("lockDecisionText").textContent = finalDecision
            ? "Security limit reached. Coordinator must choose Resume or Disqualify."
            : "Call a coordinator. The challenge cannot continue until the coordinator password is entered.";
        dqButton.hidden = !finalDecision;
        lockOverlay.classList.add("active");
    }

    async function recordViolation(reason, detail = "") {
        if (!secureStarted || violationInFlight || state?.security?.locked || state?.security?.disqualified) return;
        const now = Date.now();
        if (now - lastViolationAt < 1800) return;
        lastViolationAt = now;
        violationInFlight = true;
        try {
            const data = await request("/security/violation", {
                method: "POST",
                body: JSON.stringify({ reason, detail })
            });
            await loadState(false);
            showLock({ ...state, security: { ...state.security, ...data, lockReason: reason } });
        } catch (error) {
            if (error.data?.disqualified) {
                location.replace("codesprint-waiting.html");
                return;
            }
            console.error(error);
        } finally {
            violationInFlight = false;
        }
    }

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) recordViolation("Competition page hidden / tab or application switch");
    });
    if (!mobileDevice) window.addEventListener("blur", () => recordViolation("Competition window lost focus"));
    document.addEventListener("fullscreenchange", () => {
        if (secureStarted && enforceFullscreenThisPage && !document.fullscreenElement && !state?.security?.locked) {
            recordViolation("Fullscreen exited");
        }
    });

    async function startSecureSession() {
        if (!mobileDevice && !secureStarted) {
            await document.documentElement.requestFullscreen();
            enforceFullscreenThisPage = true;
        }
        secureStarted = true;
        sessionStorage.setItem(secureSessionKey, "1");
        secureGate.style.display = "none";
        await loadState(false);
        await loadQuestion();
    }

    enterSecureButton.addEventListener("click", async () => {
        try {
            await startSecureSession();
        } catch {
            document.getElementById("secureStatus").textContent = mobileDevice
                ? "Tap START SECURE MODE again."
                : "Fullscreen permission is required only for the first desktop start.";
        }
    });

    unlockForm.addEventListener("submit", async event => {
        event.preventDefault();
        unlockStatus.textContent = "Checking coordinator password...";
        try {
            const data = await request("/security/unlock", {
                method: "POST",
                body: JSON.stringify({ password: unlockPassword.value, action: "resume" })
            });
            unlockPassword.value = "";
            unlockStatus.textContent = data.message;
            lockOverlay.classList.remove("active");
            if (!mobileDevice && document.fullscreenEnabled) {
                await document.documentElement.requestFullscreen().then(() => { enforceFullscreenThisPage = true; }).catch(() => {});
            }
            secureStarted = true;
            sessionStorage.setItem(secureSessionKey, "1");
            secureGate.style.display = "none";
            await loadState(false);
            await loadQuestion();
        } catch (error) {
            unlockStatus.textContent = error.message;
        }
    });

    dqButton.addEventListener("click", async () => {
        const password = unlockPassword.value;
        if (!password) { unlockStatus.textContent = "Coordinator password is required."; return; }
        if (!confirm("Disqualify this team?")) return;
        try {
            const data = await request("/security/unlock", {
                method: "POST",
                body: JSON.stringify({ password, action: "disqualify" })
            });
            unlockStatus.textContent = data.message;
            setTimeout(() => location.replace("codesprint-waiting.html"), 700);
        } catch (error) { unlockStatus.textContent = error.message; }
    });

    document.getElementById("answerForm").addEventListener("submit", submitAnswer);

    if (secureStarted) {
        secureGate.style.display = "none";
        loadState(true).then(() => loadQuestion()).catch(error => setStatus(error.message, true));
    } else {
        if (mobileDevice) {
            document.getElementById("secureTitle").textContent = "Ready on Team Device?";
            document.getElementById("secureText").textContent = "Phone/tablet mode does not require fullscreen. App switching or hiding the competition page still triggers security.";
            enterSecureButton.textContent = "START SECURE MODE";
        }
        loadState(true).catch(error => setStatus(error.message, true));
    }
}());
