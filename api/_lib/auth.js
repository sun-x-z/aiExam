const crypto = require("crypto");

function getSecret() {
  return process.env.AUTH_SECRET || process.env.DATABASE_URL || "";
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodePayload(encoded) {
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
}

function createSessionToken(username) {
  const secret = getSecret();
  if (!secret) {
    throw new Error("AUTH_SECRET or DATABASE_URL must be configured.");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    exp: now + 60 * 60 * 8,
    iat: now,
    sub: username,
  };
  const encoded = encodePayload(payload);
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifySessionToken(token) {
  const secret = getSecret();
  if (!secret) {
    return null;
  }

  const [encoded, signature] = String(token || "").split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  if (signature.length !== expected.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    const payload = decodePayload(encoded);
    if (!payload.exp || Math.floor(Date.now() / 1000) > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

module.exports = {
  createSessionToken,
  verifySessionToken,
};
