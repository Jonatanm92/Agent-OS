import crypto from "node:crypto";

export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "form-action 'self' https://checkout.stripe.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ].join("; "),
  );
  next();
}

export function timingSafeEqualString(a, b) {
  const A = Buffer.from(String(a ?? ""));
  const B = Buffer.from(String(b ?? ""));
  if (A.length !== B.length || A.length === 0) return false;
  return crypto.timingSafeEqual(A, B);
}

export function isAdmin(req, adminToken) {
  if (!adminToken) return false;
  const header = req.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  return timingSafeEqualString(bearer || req.get("x-admin-token"), adminToken);
}

export function requireAdmin(adminToken) {
  return (req, res, next) => {
    if (!adminToken) return res.status(503).json({ error: "ADMIN_TOKEN är inte konfigurerad på servern." });
    if (!isAdmin(req, adminToken)) return res.status(401).json({ error: "Fel admin-nyckel." });
    next();
  };
}

export function hashIp(ip, salt = "anbudskollen") {
  return crypto.createHash("sha256").update(`${salt}:${ip ?? ""}`).digest("hex").slice(0, 16);
}

/** Fixed-window daily counters (UTC day) for cost control. */
export class DailyLimiter {
  constructor() {
    this.day = "";
    this.perKey = new Map();
    this.total = 0;
  }

  roll() {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.perKey.clear();
      this.total = 0;
    }
  }

  check(key, perKeyLimit, totalLimit) {
    this.roll();
    if (totalLimit > 0 && this.total >= totalLimit) return "total";
    if (perKeyLimit > 0 && (this.perKey.get(key) ?? 0) >= perKeyLimit) return "key";
    return null;
  }

  hit(key) {
    this.roll();
    this.total += 1;
    this.perKey.set(key, (this.perKey.get(key) ?? 0) + 1);
  }
}

/** Small burst limiter for cheap endpoints (lead forms, checkout creation). */
export function burstLimiter({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) return res.status(429).json({ error: "För många förfrågningar. Vänta en stund och försök igen." });
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear();
    next();
  };
}
