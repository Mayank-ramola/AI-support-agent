import crypto from "node:crypto";
import jwt from "jsonwebtoken";

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();

// Constant-time comparison so response time does not reveal how much of a credential matched.
export const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

export function requireAdmin(secret) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Please log in." });
    try {
      const payload = jwt.verify(token, secret);
      if (payload.role !== "admin") throw new Error("not admin");
      next();
    } catch {
      res.status(401).json({ message: "Your session expired. Please log in again." });
    }
  };
}
