import json
import time
import base64
import os
from cryptography.hazmat.primitives.asymmetric import ed25519

def generateChallenge(difficulty=5):
    challenge_string = f"{os.urandom(16).hex()}"
    challengeId = f"{os.urandom(16).hex()}"
    return challenge_string, difficulty, challengeId

def createJwt(challengeString, nonce, hashOutput, privateKey, processing_time, hash_rate):
    payload = {
        "challenge": challengeString,
        "nonce": nonce,
        "response": hashOutput,
        "iat": int(time.time()),
        "nbf": int(time.time()) - 60,
        "exp": int(time.time()) + 300,
        "processing_time": processing_time,
        "hash_rate": hash_rate
    }
    
    header = {
        "alg": "Ed25519",
        "typ": "JWT"
    }
    
    token = json.dumps({
        "header": header,
        "payload": payload
    }).encode("utf-8")
    
    signature = privateKey.sign(token)
    
    token_base64 = base64.urlsafe_b64encode(token).decode("utf-8")
    signature_base64 = base64.urlsafe_b64encode(signature).decode("utf-8")

    jwt = f"{token_base64}.{signature_base64}"
    return jwt

def verifyJwt(jwt, public_key):
    token_base64, signature_base64 = jwt.split(".")
    
    token = base64.urlsafe_b64decode(token_base64)
    signature = base64.urlsafe_b64decode(signature_base64)
    
    try:
        public_key.verify(signature, token)
        print("JWT is valid!")
        return json.loads(token.decode("utf-8"))
    except Exception as e:
        print("Invalid JWT:", e)
        return None
    
def main():
    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()