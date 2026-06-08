(() => {
    const pageWindow = window;
    if (pageWindow.__agentBrowserControllerContentInstalled) {
        return;
    }
    pageWindow.__agentBrowserControllerContentInstalled = true;
    const FIXED_STEP_SECONDS = 1 / 240;
    const DEFAULT_FRAME_SECONDS = 1 / 60;
    const SCOOT_THRESHOLD_PX = 196;
    const ARRIVAL_DISTANCE_PX = 0.85;
    const ARRIVAL_VELOCITY_PX = 12;
    const SETTLED_EPSILON = 0.001 * 60;
    const NEUTRAL_ROTATION_DEGREES = 0;
    const FLOURISH_AMPLITUDE_DEGREES = 3;
    const FLOURISH_DURATION_SECONDS = 0.72;
    const FLOURISH_PERIOD_SECONDS = 0.66;
    const POSITION_SPRING = { dampingFraction: 0.9, response: 0.19 };
    const VISIBILITY_SPRING = { dampingFraction: 0.86, response: 0.42 };
    const STRETCH_SPRING = { dampingFraction: 0.85, response: 0.2 };
    const ROTATION_SPRING = { dampingFraction: 0.9, response: 0.12 };
    const SCOOT_PROGRESS_SPRING = { dampingFraction: 0.94, response: 0.19 };
    const ARC_PROGRESS_SPRING = { dampingFraction: 0.9, response: 0.42 };
    const SCOOT_ROTATION_SPRING = { dampingFraction: 0.82, response: 0.055 };
    const SCOOT_STRETCH_SPRING = { dampingFraction: 0.86, response: 0.12 };
    const root = document.createElement("div");
    root.id = "agent-browser-controller-overlay-root";
    root.style.all = "initial";
    root.style.position = "fixed";
    root.style.inset = "0";
    root.style.overflow = "hidden";
    root.style.pointerEvents = "none";
    root.style.zIndex = "2147483647";
    const cursor = document.createElement("div");
    cursor.id = "agent-browser-controller-cursor";
    cursor.style.all = "initial";
    cursor.style.position = "fixed";
    cursor.style.left = "0";
    cursor.style.top = "0";
    cursor.style.height = "28px";
    cursor.style.opacity = "0";
    cursor.style.pointerEvents = "none";
    cursor.style.transform = "translate3d(-9999px, -9999px, 0)";
    cursor.style.transformOrigin = "7.2px 3.3px";
    cursor.style.width = "28px";
    cursor.style.willChange = "opacity, filter, transform";
    const cursorImage = document.createElement("img");
    cursorImage.alt = "";
    cursorImage.draggable = false;
    cursorImage.src = chrome.runtime.getURL("images/agent-cursor.png");
    cursorImage.style.all = "initial";
    cursorImage.style.display = "block";
    cursorImage.style.filter =
        "drop-shadow(0 0 7px rgba(16, 185, 129, 0.82)) drop-shadow(0 0 18px rgba(16, 185, 129, 0.42))";
    cursorImage.style.height = "28px";
    cursorImage.style.pointerEvents = "none";
    cursorImage.style.userSelect = "none";
    cursorImage.style.width = "28px";
    const label = document.createElement("div");
    label.id = "agent-browser-controller-label";
    label.style.all = "initial";
    label.style.position = "fixed";
    label.style.left = "0";
    label.style.top = "0";
    label.style.padding = "4px 8px";
    label.style.border = "1px solid rgba(255, 255, 255, 0.72)";
    label.style.borderRadius = "9999px";
    label.style.background = "rgba(15, 23, 42, 0.88)";
    label.style.boxShadow = "0 8px 24px rgba(15, 23, 42, 0.22)";
    label.style.color = "white";
    label.style.font =
        "500 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    label.style.opacity = "0";
    label.style.pointerEvents = "none";
    label.style.transform = "translate3d(-9999px, -9999px, 0)";
    label.style.transition = "opacity 120ms ease";
    label.style.whiteSpace = "nowrap";
    label.style.willChange = "opacity, transform";
    label.textContent = "Agent";
    const highlight = document.createElement("div");
    highlight.id = "agent-browser-controller-highlight";
    highlight.style.all = "initial";
    highlight.style.position = "fixed";
    highlight.style.left = "0";
    highlight.style.top = "0";
    highlight.style.border = "3px solid rgba(16, 185, 129, 0.96)";
    highlight.style.borderRadius = "10px";
    highlight.style.boxShadow =
        "0 0 0 9999px rgba(15, 23, 42, 0.08), 0 0 0 4px rgba(16, 185, 129, 0.22), 0 14px 34px rgba(15, 23, 42, 0.24)";
    highlight.style.display = "none";
    highlight.style.opacity = "0";
    highlight.style.pointerEvents = "none";
    highlight.style.transition = "opacity 90ms ease";
    highlight.style.transform = "translate3d(-9999px, -9999px, 0)";
    highlight.style.willChange = "opacity, transform, width, height";
    root.appendChild(highlight);
    cursor.appendChild(cursorImage);
    root.appendChild(cursor);
    root.appendChild(label);
    let current = {
        x: Math.round(window.innerWidth * 0.58),
        y: Math.round(window.innerHeight * 0.55)
    };
    let lastFramePoint = { ...current };
    let motion = null;
    let positionXSpring = createSpring(current.x, current.x, POSITION_SPRING);
    let positionYSpring = createSpring(current.y, current.y, POSITION_SPRING);
    let rotationSpring = createSpring(0, 0, ROTATION_SPRING);
    let scootAxisSpring = createSpring(0, 0, ROTATION_SPRING);
    let scootRotationSpring = createSpring(0, 0, SCOOT_ROTATION_SPRING);
    let scootStretchSpring = createSpring(1, 1, SCOOT_STRETCH_SPRING);
    let stretchSpring = createSpring(1, 1, STRETCH_SPRING);
    let visibilitySpring = createSpring(0, 0, VISIBILITY_SPRING);
    let target = { ...current };
    let velocity = { x: 0, y: 0 };
    let visible = false;
    let phase = "idle";
    let hasEverShownCursor = false;
    let thinkStartedAt = null;
    let pendingArrival = null;
    let rafId = null;
    let lastFrameAt = 0;
    let highlightHideTimer = null;
    const faviconBadgeId = "agent-browser-controller-favicon-badge";
    function mount() {
        const parent = document.documentElement || document.body;
        if (!parent) {
            requestAnimationFrame(mount);
            return;
        }
        if (!root.isConnected) {
            parent.appendChild(root);
        }
    }
    function clampPoint(point) {
        return {
            x: Math.max(0, Math.min(window.innerWidth, point.x)),
            y: Math.max(0, Math.min(window.innerHeight, point.y))
        };
    }
    function updateCursorTransform() {
        const visibility = clamp(visibilitySpring.value, 0, 1);
        const visibilityScale = lerp(0.4, 1, visibility);
        const opacity = visibility;
        const blur = lerp(5, 0, visibility);
        const scootStretch = clamp(scootStretchSpring.value, 0.15, 1);
        const rotation = flourishRotation(rotationSpring.value, performance.now());
        cursor.style.opacity = `${opacity}`;
        cursor.style.filter = `blur(${blur.toFixed(2)}px)`;
        cursor.style.transform = [
            `translate3d(${(current.x - 7.2).toFixed(2)}px, ${(current.y - 3.3).toFixed(2)}px, 0)`,
            `rotate(${scootAxisSpring.value.toFixed(2)}deg)`,
            `scale(1, ${scootStretch.toFixed(3)})`,
            `rotate(${(-scootAxisSpring.value).toFixed(2)}deg)`,
            `rotate(${(rotation + scootRotationSpring.value).toFixed(2)}deg)`,
            `scale(${(stretchSpring.value * visibilityScale).toFixed(3)}, ${visibilityScale.toFixed(3)})`
        ].join(" ");
        label.style.opacity = "0";
        label.style.transform = `translate3d(${(current.x + 14).toFixed(2)}px, ${(current.y + 14).toFixed(2)}px, 0)`;
    }
    function applyPhase(nextPhase) {
        phase = normalizePhase(nextPhase);
        if (phase === "idle" || (!visible && !isPersistentPageStatus(phase))) {
            removeFaviconBadge();
            return;
        }
        if (phase === "thinking") {
            cursorImage.style.filter =
                "drop-shadow(0 0 8px rgba(59, 130, 246, 0.82)) drop-shadow(0 0 24px rgba(16, 185, 129, 0.38))";
        }
        else if (phase === "taken_over") {
            cursorImage.style.filter =
                "drop-shadow(0 0 8px rgba(239, 68, 68, 0.82)) drop-shadow(0 0 24px rgba(245, 158, 11, 0.38))";
        }
        else if (phase === "stopped") {
            cursorImage.style.filter =
                "drop-shadow(0 0 8px rgba(100, 116, 139, 0.74)) drop-shadow(0 0 18px rgba(51, 65, 85, 0.34))";
        }
        else {
            cursorImage.style.filter =
                "drop-shadow(0 0 7px rgba(16, 185, 129, 0.82)) drop-shadow(0 0 18px rgba(16, 185, 129, 0.42))";
        }
        try {
            updateFaviconBadge(phase);
        }
        catch {
            // Favicon badges are best-effort; cursor rendering should never fail because of page head/CSP quirks.
        }
    }
    function normalizePhase(value) {
        return value === "active" ||
            value === "thinking" ||
            value === "idle" ||
            value === "handoff" ||
            value === "deliverable" ||
            value === "stopped" ||
            value === "taken_over"
            ? value
            : "active";
    }
    function isPersistentPageStatus(value) {
        return value === "handoff" ||
            value === "deliverable" ||
            value === "stopped" ||
            value === "taken_over";
    }
    function updateFaviconBadge(nextPhase) {
        if (!document.head) {
            return;
        }
        const color = nextPhase === "thinking" ? "#3b82f6" :
            nextPhase === "handoff" ? "#facc15" :
                nextPhase === "deliverable" ? "#22c55e" :
                    nextPhase === "taken_over" ? "#ef4444" :
                        nextPhase === "stopped" ? "#64748b" :
                            "#10b981";
        const indicator = nextPhase === "handoff" || nextPhase === "deliverable" || nextPhase === "stopped"
            ? `<circle cx="24" cy="24" r="7" fill="${color}" stroke="white" stroke-width="2"/>`
            : `<circle cx="22" cy="10" r="6" fill="${color}" stroke="white" stroke-width="2"/>`;
        const svg = [
            '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">',
            '<rect width="32" height="32" rx="7" fill="#0f172a"/>',
            indicator,
            '<path d="M8 22V8l10 10h-6l-4 4z" fill="white"/>',
            "</svg>"
        ].join("");
        const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        let link = document.getElementById(faviconBadgeId);
        if (!link) {
            link = document.createElement("link");
            link.id = faviconBadgeId;
            link.rel = "icon";
            document.head.appendChild(link);
        }
        link.href = href;
    }
    function removeFaviconBadge() {
        document.getElementById(faviconBadgeId)?.remove();
    }
    function sendCursorArrived() {
        const arrival = pendingArrival;
        if (!arrival) {
            return;
        }
        pendingArrival = null;
        chrome.runtime
            .sendMessage({
            type: "AGENT_CURSOR_ARRIVED",
            moveSequence: arrival.moveSequence,
            sessionId: arrival.sessionId,
            turnId: arrival.turnId
        })
            .catch(() => {
            // Visual acknowledgement is best effort.
        });
    }
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    function distanceBetween(a, b) {
        return Math.hypot(b.x - a.x, b.y - a.y);
    }
    function lerp(a, b, progress) {
        return a + (b - a) * progress;
    }
    function lerpPoint(a, b, progress) {
        return {
            x: lerp(a.x, b.x, progress),
            y: lerp(a.y, b.y, progress)
        };
    }
    function normalizeVector(point) {
        const length = Math.hypot(point.x, point.y);
        if (length < 0.001) {
            return { x: 1, y: 0 };
        }
        return {
            x: point.x / length,
            y: point.y / length
        };
    }
    function cubicPoint(start, control1, control2, end, progress) {
        const t = clamp(progress, 0, 1);
        const inv = 1 - t;
        return {
            x: inv * inv * inv * start.x +
                3 * inv * inv * t * control1.x +
                3 * inv * t * t * control2.x +
                t * t * t * end.x,
            y: inv * inv * inv * start.y +
                3 * inv * inv * t * control1.y +
                3 * inv * t * t * control2.y +
                t * t * t * end.y
        };
    }
    function cubicTangent(start, control1, control2, end, progress) {
        const t = clamp(progress, 0, 1);
        const inv = 1 - t;
        return {
            x: 3 * inv * inv * (control1.x - start.x) +
                6 * inv * t * (control2.x - control1.x) +
                3 * t * t * (end.x - control2.x),
            y: 3 * inv * inv * (control1.y - start.y) +
                6 * inv * t * (control2.y - control1.y) +
                3 * t * t * (end.y - control2.y)
        };
    }
    function scoreArcPath(start, control1, control2, end, directDistance) {
        let score = 0;
        let previous = start;
        let pathLength = 0;
        for (let index = 1; index <= 10; index += 1) {
            const point = cubicPoint(start, control1, control2, end, index / 10);
            pathLength += distanceBetween(previous, point);
            previous = point;
            const edgeDistance = Math.min(point.x, point.y, window.innerWidth - point.x, window.innerHeight - point.y);
            if (edgeDistance < 0) {
                score += 10000;
            }
            else if (edgeDistance < 24) {
                score += (24 - edgeDistance) * 18;
            }
        }
        const idealLength = directDistance * 1.08;
        score += Math.abs(pathLength - idealLength) * 0.42;
        score += distanceBetween(start, control1) * 0.015;
        score += distanceBetween(control2, end) * 0.015;
        return score;
    }
    function tangentRotation(tangent) {
        if (Math.hypot(tangent.x, tangent.y) < 0.001) {
            return 0;
        }
        const degrees = Math.atan2(tangent.y, tangent.x) * (180 / Math.PI);
        return normalizeDegrees(degrees + 90);
    }
    function tangentForRotation(degrees) {
        const radians = (degrees - 90) * (Math.PI / 180);
        return {
            x: Math.cos(radians),
            y: Math.sin(radians)
        };
    }
    function normalizeDegrees(degrees) {
        let normalized = degrees % 360;
        if (normalized < 0) {
            normalized += 360;
        }
        return normalized;
    }
    function shortestAngleDelta(from, to) {
        let delta = to - from;
        while (delta > 180) {
            delta -= 360;
        }
        while (delta < -180) {
            delta += 360;
        }
        return delta;
    }
    function setRotationTarget(spring, degrees) {
        spring.target = spring.value + shortestAngleDelta(spring.value, degrees);
    }
    function createSpring(value, target, config) {
        return {
            dampingFraction: config.dampingFraction,
            force: 0,
            response: config.response,
            simulationTime: 0,
            scriptTime: 0,
            target,
            value,
            velocity: 0
        };
    }
    function resetSpring(spring, value) {
        spring.force = 0;
        spring.simulationTime = 0;
        spring.scriptTime = 0;
        spring.target = value;
        spring.value = value;
        spring.velocity = 0;
    }
    function stepSpring(spring, seconds) {
        const response = Math.max(0.001, spring.response);
        const maxAngularFrequency = 1 / (2 * FIXED_STEP_SECONDS ** 2);
        const stiffness = Math.min((Math.PI * 2) ** 2 / response ** 2, maxAngularFrequency);
        const damping = Math.sqrt(stiffness) * 2 * spring.dampingFraction;
        spring.scriptTime += Math.max(0, seconds);
        if (spring.scriptTime - spring.simulationTime > 1) {
            spring.simulationTime = spring.scriptTime - DEFAULT_FRAME_SECONDS;
        }
        while (spring.simulationTime < spring.scriptTime) {
            integrateSpring(spring, stiffness, damping);
            spring.simulationTime += FIXED_STEP_SECONDS;
        }
        if (isSpringSettled(spring)) {
            spring.value = spring.target;
            spring.velocity = 0;
            spring.force = 0;
        }
    }
    function integrateSpring(spring, stiffness, damping) {
        const halfStep = FIXED_STEP_SECONDS / 2;
        const velocity = spring.velocity + spring.force * halfStep;
        spring.value += velocity * FIXED_STEP_SECONDS;
        spring.force = velocity * -damping + (spring.target - spring.value) * stiffness;
        spring.velocity = velocity + spring.force * halfStep;
    }
    function isSpringSettled(spring) {
        if (Math.max(spring.velocity * spring.velocity, spring.force * spring.force) > SETTLED_EPSILON ** 2) {
            return false;
        }
        const tolerance = spring.target * 0.01;
        const delta = spring.target - spring.value;
        return tolerance === 0 || delta * delta <= tolerance * tolerance;
    }
    function flourishRotation(baseRotation, now) {
        if (thinkStartedAt == null) {
            return baseRotation;
        }
        const elapsed = (now - thinkStartedAt) / 1000;
        const duration = FLOURISH_DURATION_SECONDS;
        const fade = Math.min(1, elapsed / duration);
        if (fade >= 1) {
            thinkStartedAt = null;
            return baseRotation;
        }
        return (baseRotation +
            Math.sin(elapsed / FLOURISH_PERIOD_SECONDS * Math.PI * 2) *
                Math.sin(fade * Math.PI) *
                FLOURISH_AMPLITUDE_DEGREES);
    }
    function buildCursorMotion(start, end) {
        const distance = distanceBetween(start, end);
        if (distance < 2) {
            return null;
        }
        const vector = {
            x: end.x - start.x,
            y: end.y - start.y
        };
        const direction = normalizeVector(vector);
        if (distance <= SCOOT_THRESHOLD_PX) {
            return {
                axisDegrees: Math.atan2(direction.y, direction.x) * (180 / Math.PI),
                end,
                mode: "scoot",
                progressSpring: createSpring(0, 1, SCOOT_PROGRESS_SPRING),
                rotationPeak: clamp((direction.x * 0.75 - direction.y * 0.62) * 70, -70, 70),
                start
            };
        }
        const normal = {
            x: -direction.y,
            y: direction.x
        };
        const preferredSide = vector.x * -0.35 + vector.y * 0.65 >= 0 ? 1 : -1;
        const endpointTangent = tangentForRotation(NEUTRAL_ROTATION_DEGREES);
        let best = null;
        for (let index = 0; index < 20; index += 1) {
            const side = index % 2 === 0 ? preferredSide : -preferredSide;
            const handleJitter = ((index * 7) % 11) / 10;
            const arcJitter = ((index * 5 + 3) % 13) / 12;
            const handle = clamp(distance * (0.24 + handleJitter * 0.16), 68, 300);
            const endpointHandle = clamp(distance * (0.13 + handleJitter * 0.07), 48, 240);
            const arc = clamp(distance * (0.12 + arcJitter * 0.16), 36, 230) * side;
            const control1 = {
                x: start.x + direction.x * handle + normal.x * arc * (0.18 + arcJitter * 0.16),
                y: start.y + direction.y * handle + normal.y * arc * (0.18 + arcJitter * 0.16)
            };
            const control2 = {
                x: end.x - endpointTangent.x * endpointHandle,
                y: end.y - endpointTangent.y * endpointHandle
            };
            const candidate = {
                control1,
                control2,
                score: scoreArcPath(start, control1, control2, end, distance)
            };
            if (!best || candidate.score < best.score) {
                best = candidate;
            }
        }
        const control1 = best
            ? best.control1
            : {
                x: start.x + direction.x * clamp(distance * 0.32, 72, 280),
                y: start.y + direction.y * clamp(distance * 0.32, 72, 280)
            };
        const control2 = best
            ? best.control2
            : {
                x: end.x - endpointTangent.x * clamp(distance * 0.15, 48, 240),
                y: end.y - endpointTangent.y * clamp(distance * 0.15, 48, 240)
            };
        return {
            control1: {
                x: clamp(control1.x, 16, window.innerWidth - 16),
                y: clamp(control1.y, 16, window.innerHeight - 16)
            },
            control2: {
                x: clamp(control2.x, 16, window.innerWidth - 16),
                y: clamp(control2.y, 16, window.innerHeight - 16)
            },
            end,
            mode: "arc",
            progressSpring: createSpring(0, 1, ARC_PROGRESS_SPRING),
            start
        };
    }
    function resetScootPose() {
        resetSpring(scootAxisSpring, 0);
        resetSpring(scootRotationSpring, 0);
        resetSpring(scootStretchSpring, 1);
        resetSpring(stretchSpring, 1);
    }
    function resetMotionPose() {
        resetSpring(rotationSpring, 0);
        resetScootPose();
    }
    function animate(frameAt) {
        const dt = Math.max(1 / 240, Math.min(1 / 30, (frameAt - lastFrameAt) / 1000 || 1 / 60));
        lastFrameAt = frameAt;
        const activeMotion = motion;
        if (activeMotion) {
            thinkStartedAt = null;
            stepSpring(activeMotion.progressSpring, dt);
            const progress = clamp(activeMotion.progressSpring.value, 0, 1);
            if (activeMotion.mode === "scoot") {
                const shape = Math.sin(progress * Math.PI);
                positionXSpring.target = activeMotion.end.x;
                positionYSpring.target = activeMotion.end.y;
                setRotationTarget(rotationSpring, 0);
                setRotationTarget(scootAxisSpring, activeMotion.axisDegrees);
                scootRotationSpring.target = activeMotion.rotationPeak * shape;
                scootStretchSpring.target = lerp(1, 0.85, shape);
                stretchSpring.target = 1;
            }
            else {
                const pathPoint = cubicPoint(activeMotion.start, activeMotion.control1, activeMotion.control2, activeMotion.end, progress);
                const tangent = cubicTangent(activeMotion.start, activeMotion.control1, activeMotion.control2, activeMotion.end, progress);
                positionXSpring.target = pathPoint.x;
                positionYSpring.target = pathPoint.y;
                setRotationTarget(rotationSpring, tangentRotation(tangent));
                setRotationTarget(scootAxisSpring, 0);
                scootRotationSpring.target = 0;
                scootStretchSpring.target = 1;
                stretchSpring.target = clamp(1 - Math.hypot(velocity.x, velocity.y) / 9000, 0.93, 1);
            }
        }
        else {
            positionXSpring.target = target.x;
            positionYSpring.target = target.y;
            scootRotationSpring.target = 0;
            scootStretchSpring.target = 1;
            stretchSpring.target = 1;
        }
        stepSpring(positionXSpring, dt);
        stepSpring(positionYSpring, dt);
        stepSpring(rotationSpring, dt);
        stepSpring(scootAxisSpring, dt);
        stepSpring(scootRotationSpring, dt);
        stepSpring(scootStretchSpring, dt);
        stepSpring(stretchSpring, dt);
        stepSpring(visibilitySpring, dt);
        current = {
            x: positionXSpring.value,
            y: positionYSpring.value
        };
        velocity = {
            x: positionXSpring.velocity,
            y: positionYSpring.velocity
        };
        lastFramePoint = { ...current };
        updateCursorTransform();
        const arrived = activeMotion &&
            activeMotion.progressSpring.value >= 0.999 &&
            Math.abs(activeMotion.progressSpring.velocity) < 0.01 &&
            distanceBetween(current, target) <= ARRIVAL_DISTANCE_PX &&
            Math.abs(positionXSpring.velocity) <= ARRIVAL_VELOCITY_PX &&
            Math.abs(positionYSpring.velocity) <= ARRIVAL_VELOCITY_PX;
        if (arrived) {
            current = { ...target };
            resetSpring(positionXSpring, target.x);
            resetSpring(positionYSpring, target.y);
            velocity = { x: 0, y: 0 };
            lastFramePoint = { ...current };
            if (activeMotion.mode === "arc") {
                const finalTangent = cubicTangent(activeMotion.start, activeMotion.control1, activeMotion.control2, activeMotion.end, 1);
                resetSpring(rotationSpring, tangentRotation(finalTangent));
            }
            else {
                resetSpring(rotationSpring, 0);
            }
            motion = null;
            resetScootPose();
            thinkStartedAt = frameAt;
            updateCursorTransform();
            sendCursorArrived();
        }
        if (shouldContinueAnimating()) {
            rafId = requestAnimationFrame(animate);
        }
        else {
            rafId = null;
        }
    }
    function ensureAnimation() {
        if (rafId != null)
            return;
        lastFrameAt = performance.now();
        lastFramePoint = { ...current };
        rafId = requestAnimationFrame(animate);
    }
    function shouldContinueAnimating() {
        return (motion != null ||
            !isSpringSettled(positionXSpring) ||
            !isSpringSettled(positionYSpring) ||
            !isSpringSettled(rotationSpring) ||
            !isSpringSettled(scootAxisSpring) ||
            !isSpringSettled(scootRotationSpring) ||
            !isSpringSettled(scootStretchSpring) ||
            !isSpringSettled(stretchSpring) ||
            !isSpringSettled(visibilitySpring) ||
            thinkStartedAt != null);
    }
    function snapTo(point) {
        target = point;
        current = point;
        lastFramePoint = point;
        motion = null;
        thinkStartedAt = null;
        resetSpring(positionXSpring, point.x);
        resetSpring(positionYSpring, point.y);
        resetSpring(rotationSpring, 0);
        resetSpring(scootAxisSpring, 0);
        resetSpring(scootRotationSpring, 0);
        resetSpring(scootStretchSpring, 1);
        resetSpring(stretchSpring, 1);
        velocity = { x: 0, y: 0 };
        updateCursorTransform();
    }
    function setCursor(point, options = {}) {
        const next = clampPoint(point);
        const shouldAnimate = options.animate !== false;
        const wasEffectivelyHidden = visibilitySpring.value <= 0.001 || !hasEverShownCursor;
        visible = options.visible !== false;
        visibilitySpring.target = visible ? 1 : 0;
        pendingArrival = options.arrival ?? null;
        applyPhase(options.phase ?? phase);
        if (!visible) {
            target = next;
            motion = null;
            thinkStartedAt = null;
            resetMotionPose();
            ensureAnimation();
            sendCursorArrived();
            return;
        }
        hasEverShownCursor = true;
        if (!shouldAnimate || wasEffectivelyHidden) {
            snapTo(next);
            visibilitySpring.target = visible ? 1 : 0;
            ensureAnimation();
            sendCursorArrived();
            return;
        }
        const distance = Math.hypot(next.x - current.x, next.y - current.y);
        target = next;
        if (distance < 0.5) {
            snapTo(next);
            visibilitySpring.target = visible ? 1 : 0;
            ensureAnimation();
            sendCursorArrived();
            return;
        }
        motion = buildCursorMotion(current, next);
        thinkStartedAt = null;
        lastFrameAt = performance.now();
        lastFramePoint = { ...current };
        updateCursorTransform();
        ensureAnimation();
    }
    function showClickRipple(point) {
        const ripple = document.createElement("div");
        ripple.style.all = "initial";
        ripple.style.position = "fixed";
        ripple.style.left = `${point.x - 16}px`;
        ripple.style.top = `${point.y - 16}px`;
        ripple.style.width = "32px";
        ripple.style.height = "32px";
        ripple.style.border = "2px solid rgba(16, 185, 129, 0.95)";
        ripple.style.borderRadius = "9999px";
        ripple.style.boxShadow = "0 0 0 6px rgba(16, 185, 129, 0.14)";
        ripple.style.opacity = "0.95";
        ripple.style.pointerEvents = "none";
        ripple.style.transform = "scale(0.45)";
        ripple.style.transition =
            "opacity 360ms ease-out, transform 360ms cubic-bezier(.2,.8,.2,1)";
        ripple.style.willChange = "opacity, transform";
        root.appendChild(ripple);
        requestAnimationFrame(() => {
            ripple.style.opacity = "0";
            ripple.style.transform = "scale(1.75)";
        });
        window.setTimeout(() => {
            ripple.remove();
        }, 420);
    }
    function showHighlightRect(rect, options = {}) {
        if (!rect || typeof rect !== "object") {
            return { ok: false, error: "Invalid highlight rect" };
        }
        const source = rect;
        const x = Number(source.x);
        const y = Number(source.y);
        const width = Number(source.width);
        const height = Number(source.height);
        if (!Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(width) ||
            !Number.isFinite(height) ||
            width <= 0 ||
            height <= 0) {
            return { ok: false, error: "Invalid highlight rectangle dimensions" };
        }
        if (highlightHideTimer != null) {
            window.clearTimeout(highlightHideTimer);
            highlightHideTimer = null;
        }
        const color = typeof options.color === "string" && options.color.trim()
            ? options.color.trim()
            : "rgba(16, 185, 129, 0.96)";
        const durationMs = Math.max(120, Math.min(Number(options.durationMs) || 900, 5000));
        highlight.style.borderColor = color;
        highlight.style.display = "block";
        highlight.style.height = `${height}px`;
        highlight.style.opacity = "1";
        highlight.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        highlight.style.width = `${width}px`;
        highlightHideTimer = window.setTimeout(() => {
            highlight.style.opacity = "0";
            highlightHideTimer = window.setTimeout(() => {
                highlight.style.display = "none";
                highlightHideTimer = null;
            }, 140);
        }, durationMs);
        return { ok: true };
    }
    mount();
    setCursor(current, { animate: false, visible: false });
    restoreCursorState();
    function restoreCursorState() {
        chrome.runtime
            .sendMessage({
            type: "GET_AGENT_CURSOR_STATE"
        })
            .then((response) => {
            const state = response?.state;
            if (!response?.ok ||
                !state ||
                !Number.isFinite(state.x) ||
                !Number.isFinite(state.y)) {
                return;
            }
            setCursor({
                x: Number(state.x),
                y: Number(state.y)
            }, {
                animate: false,
                phase: state.phase,
                visible: state.visible !== false
            });
        })
            .catch(() => {
            // The background may not be ready on restricted pages.
        });
    }
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (!message || typeof message !== "object") {
            return;
        }
        if (message.type === "CONTENT_PING") {
            sendResponse({ ok: true });
            return true;
        }
        if (message.type === "AGENT_PAGE_STATUS") {
            applyPhase(message.phase);
            sendResponse({ ok: true });
            return true;
        }
        if (message.type === "AGENT_CURSOR") {
            const x = Number(message.x);
            const y = Number(message.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                sendResponse({ ok: false, error: "Invalid cursor coordinates" });
                return;
            }
            setCursor({ x, y }, {
                animate: message.animate !== false,
                arrival: Number.isFinite(Number(message.moveSequence))
                    ? {
                        moveSequence: Number(message.moveSequence),
                        sessionId: typeof message.sessionId === "string" ? message.sessionId : null,
                        turnId: typeof message.turnId === "string" ? message.turnId : null
                    }
                    : null,
                phase: message.phase,
                visible: message.visible !== false
            });
            sendResponse({ ok: true });
            return true;
        }
        if (message.type === "AGENT_CURSOR_CLICK") {
            const x = Number(message.x);
            const y = Number(message.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                sendResponse({ ok: false, error: "Invalid click coordinates" });
                return;
            }
            setCursor({ x, y }, { animate: true, phase: "active", visible: true });
            showClickRipple({ x, y });
            sendResponse({ ok: true });
            return true;
        }
        if (message.type === "AGENT_HIGHLIGHT_RECT") {
            sendResponse(showHighlightRect(message.rect, {
                color: message.color,
                durationMs: message.durationMs
            }));
            return true;
        }
    });
})();
