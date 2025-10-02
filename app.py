from flask import Flask, request, jsonify, render_template
from challengeHandler import generateChallenge, createJwt, verifyJwt
import hashlib
from cryptography.hazmat.primitives.asymmetric import ed25519
import time
import threading

app = Flask(__name__)

private_key = ed25519.Ed25519PrivateKey.generate()
public_key = private_key.public_key()
valid_challenge_ids = {}

@app.route("/")
def index():
    jwt = request.cookies.get("Zephyr.PoW.JWT")
    if not jwt:
        return render_template("challenge.html")
    
    payload = verifyJwt(jwt, public_key)
    
    if payload:
        completion_time = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(payload["payload"]["iat"]))
        difficulty = len(payload["payload"]["response"]) - len(payload["payload"]["response"].lstrip("0"))
        processing_time = payload["payload"].get("processing_time", "N/A")
        hash_rate = payload["payload"].get("hash_rate", "N/A")

        return render_template("index.html",
                               completion_time=completion_time,
                               difficulty_level=difficulty,
                               processing_time=processing_time,
                               hash_rate=hash_rate)
    else:
        return render_template("challenge.html")

@app.route("/challenge")
def challenge():
    try:
        difficulty = int(request.args.get('difficulty', 5))
        if not 3 <= difficulty <= 7:
            difficulty = 5
    except (ValueError, TypeError):
        difficulty = 5
        
    challenge_string, difficulty, challengeId = generateChallenge(difficulty=difficulty)
    valid_challenge_ids[challengeId] = (challenge_string, time.time())
    return jsonify({"challenge": challenge_string, "difficulty": difficulty, "challengeId": challengeId})

@app.route("/verify", methods=["POST"])
def verify():
    data = request.get_json()
    challenge_string = data.get("challenge")
    nonce = data.get("nonce")
    difficulty = data.get("difficulty")
    processing_time = data.get("processing_time")
    hash_rate = data.get("hash_rate")
    challengeId = data.get("challengeId")
    
    if not all([challenge_string, nonce, difficulty, challengeId]):
        return jsonify({"status": "failure", "message": "Missing required data."}), 400

    if challengeId not in valid_challenge_ids:
        return jsonify({"status": "failure", "message": "Invalid or expired challengeId."}), 400

    original_challenge_string, _ = valid_challenge_ids[challengeId]
    if original_challenge_string != challenge_string:
        return jsonify({"status": "failure", "message": "Challenge string mismatch."}), 400
    
    try:
        difficulty = int(difficulty)
        if not 3 <= difficulty <= 7:
            return jsonify({"status": "failure", "message": "Invalid difficulty."}), 400
    except (ValueError, TypeError):
        return jsonify({"status": "failure", "message": "Invalid difficulty."}), 400

    target = "0" * difficulty
    hash_input = f"{challenge_string}{nonce}".encode("utf-8")
    hash_output = hashlib.sha256(hash_input).hexdigest()
    
    if hash_output.startswith(target):
        del valid_challenge_ids[challengeId]
        jwt = createJwt(challenge_string, nonce, hash_output, private_key, processing_time, hash_rate)
        return jsonify({"status": "success", "jwt": jwt})
    else:
        return jsonify({"status": "failure", "message": "Invalid PoW solution."}), 400

if __name__ == "__main__":
    def cleanup():
        while True:
            time.sleep(600)
            current_time = time.time()
            for challengeId, (challenge_string, timestamp) in list(valid_challenge_ids.items()):
                if current_time - timestamp > 3600:
                    del valid_challenge_ids[challengeId]

    cleanup_thread = threading.Thread(target=cleanup, daemon=True)
    cleanup_thread.start()
    app.run(debug=True)