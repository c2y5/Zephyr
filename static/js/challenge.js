async function solveChallenge() {
    const difficulty = document.querySelector('input[name="difficulty"]:checked').value;
    const response = await fetch(`/challenge?difficulty=${difficulty}`);
    const { challenge, challengeId } = await response.json();

    document.getElementById("difficulty").textContent = difficulty;

    const target = "0".repeat(difficulty);
    let nonce = 0;
    let hashes = 0;
    const startTime = Date.now();

    console.log(`Challenge: ${challenge}, Difficulty: ${difficulty}`);

    const hpsElement = document.getElementById("hps");
    const estTimeElement = document.getElementById("est-time");
    const elapsedTimeElement = document.getElementById("elapsed-time");

    function updateUI(difficulty) {
        const elapsedTime = (Date.now() - startTime) / 1000;
        if (elapsedTime === 0) return;
        const hps = hashes / elapsedTime;
        hpsElement.textContent = (hps / 1000).toFixed(2) + " kH/s";

        const totalHashes = Math.pow(16, difficulty);
        const estimatedTime = totalHashes / hps;

        if (estimatedTime < 60) {
            estTimeElement.textContent = estimatedTime.toFixed(1) + "s";
        } else {
            estTimeElement.textContent = (estimatedTime / 60).toFixed(1) + "m";
        }

        if (elapsedTime < 60) {
            elapsedTimeElement.textContent = elapsedTime.toFixed(2) + "s";
        } else {
            const minutes = Math.floor(elapsedTime / 60);
            const seconds = (elapsedTime % 60).toFixed(2);
            elapsedTimeElement.textContent = `${minutes}m ${seconds}s`;
        }
    }

    const interval = setInterval(() => updateUI(difficulty), 100);

    return new Promise((resolve) => {
        function hashLoop() {
            for (let i = 0; i < 10000; i++) {
                const attempt = challenge + nonce;
                const hashHex = CryptoJS.SHA256(attempt).toString();
                hashes++;

                if (hashHex.startsWith(target)) {
                    console.log(`Solved with nonce: ${nonce}, hash: ${hashHex}`);
                    clearInterval(interval);
                    updateUI(difficulty);
                    const elapsedTime = (Date.now() - startTime) / 1000;
                    const hps = hashes / elapsedTime;
                    resolve({ 
                        challenge, 
                        nonce,
                        difficulty,
                        challengeId,
                        processing_time: elapsedTime.toFixed(2) + "s", 
                        hash_rate: (hps / 1000).toFixed(2) + " kH/s" 
                    });
                    return;
                }
                nonce++;
            }
            setTimeout(hashLoop, 0);
        }
        hashLoop();
    });
}

async function verifySolution() {
    const solution = await solveChallenge();
    
    const response = await fetch("/verify", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(solution)
    });

    const result = await response.json();

    if (result.status === "success" && result.jwt) {
        document.cookie = "Zephyr.PoW.JWT=" + result.jwt + ";path=/;max-age=300";
        window.location.href = "/";
    } else {
        console.error("Verification failed:", result.message);
        alert("Could not verify your browser. Please try again.");
    }
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

async function checkCookieAndLoadPage() {
    const jwt = getCookie("Zephyr.PoW.JWT");
    if (jwt) {
        try {
            const response = await fetch('/');
            if (response.ok) {
                const html = await response.text();
                if (html.includes("<title>Access Granted</title>")) {
                    document.documentElement.innerHTML = html;
                    return true;
                }
            }
        } catch (error) {
            console.error("Error validating existing cookie:", error);
        }
    }
    return false;
}

function estimateHashrate() {
    return new Promise(resolve => {
        const startTime = Date.now();
        let hashes = 0;
        let nonce = 0;
        const challenge = "benchmark";

        function benchmarkLoop() {
            const now = Date.now();
            if (now - startTime > 200) {
                const elapsedTime = (now - startTime) / 1000;
                const hps = hashes / elapsedTime;
                resolve(hps);
                return;
            }

            for (let i = 0; i < 1000; i++) {
                const attempt = challenge + nonce;
                CryptoJS.SHA256(attempt);
                hashes++;
                nonce++;
            }
            setTimeout(benchmarkLoop, 0);
        }
        benchmarkLoop();
    });
}

function formatTime(seconds) {
    if (seconds < 1) {
        return "<1s";
    }
    if (seconds < 60) {
        return `~${Math.round(seconds)}s`;
    }
    return `~${Math.round(seconds / 60)}m`;
}

function updateEstimatedTimes(hps) {
    const difficulties = document.querySelectorAll('input[name="difficulty"]');
    difficulties.forEach(input => {
        const difficulty = parseInt(input.value, 10);
        const totalHashes = Math.pow(16, difficulty);
        const estimatedTime = totalHashes / hps;
        
        const timeString = formatTime(estimatedTime);
        
        const previewElement = document.getElementById(`est-time-preview-${difficulty}`);
        if (previewElement) {
            previewElement.innerHTML = timeString;
        }
    });
}

async function main() {
    const challengeSkipped = await checkCookieAndLoadPage();
    if (!challengeSkipped) {
        document.querySelectorAll('.est-time-preview').forEach(el => el.innerHTML = '...');
        
        const hps = await estimateHashrate();
        updateEstimatedTimes(hps);

        document.getElementById('start-button').addEventListener('click', () => {
            document.getElementById('pre-challenge-ui').classList.add('hidden');
            document.getElementById('challenge-ui').classList.remove('hidden');
            verifySolution();
        });
    }
}

main();