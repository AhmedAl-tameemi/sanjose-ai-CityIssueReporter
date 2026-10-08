import { Router, type IRouter, type Request, type Response } from "express";
import {
  clearStaffSessionCookie,
  createStaffSession,
  getStaffSession,
  isStaffAuthConfigured,
  setStaffSessionCookie,
  verifyStaffPin,
} from "../lib/staffAuth";
import { StaffLoginRateLimiter } from "../lib/staffLoginRateLimit";

const router: IRouter = Router();
const attempts = new StaffLoginRateLimiter();

function rejectLimitedLogin(res: Response, seconds: number): void {
  res.setHeader("Retry-After", String(seconds));
  res.status(429).json({ error: "Too many failed PIN attempts. Try again in 15 minutes." });
}

router.post("/staff/login", (req: Request, res: Response) => {
  if (!isStaffAuthConfigured()) {
    res.status(503).json({ error: "Staff access is not configured." });
    return;
  }

  // Use Express's peer address, not a caller-supplied forwarding header.
  const client = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const retryAfter = attempts.retryAfter(client);
  if (retryAfter) {
    rejectLimitedLogin(res, retryAfter);
    return;
  }
  const pin = typeof req.body?.pin === "string" ? req.body.pin : "";
  if (!/^[0-9]{4}$/.test(pin)) {
    res.status(400).json({ error: "A four-digit PIN is required." });
    return;
  }

  const staffId = verifyStaffPin(pin);
  if (!staffId) {
    const cooldown = attempts.failure(client);
    if (cooldown) rejectLimitedLogin(res, cooldown);
    else res.status(401).json({ error: "The staff PIN is not valid." });
    return;
  }

  attempts.success(client);
  setStaffSessionCookie(res, createStaffSession(staffId));
  res.json({
    authenticated: true,
    staffId,
    role: "city-evidence-reviewer",
  });
});

router.get("/staff/session", (req: Request, res: Response) => {
  const session = getStaffSession(req);
  if (!session) {
    res.status(401).json({ error: "Staff authentication is required." });
    return;
  }

  res.json({
    authenticated: true,
    staffId: session.staffId,
    role: session.role,
  });
});

router.post("/staff/logout", (_req: Request, res: Response) => {
  clearStaffSessionCookie(res);
  res.status(204).end();
});

export default router;