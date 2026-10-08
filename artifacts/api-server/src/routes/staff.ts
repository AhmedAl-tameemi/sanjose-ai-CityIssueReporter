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
import { PostgresStaffAttemptStore } from "../lib/staffAttemptStore";

function rejectLimitedLogin(res: Response, seconds: number): void {
  const minutes = Math.ceil(seconds / 60);
  res.setHeader("Retry-After", String(seconds));
  res.status(429).json({ error: `Too many failed PIN attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` });
}

export function createStaffRouter(attempts: StaffLoginRateLimiter): IRouter {
  const router: IRouter = Router();

  router.post("/staff/login", async (req: Request, res: Response) => {
    if (!isStaffAuthConfigured()) {
      res.status(503).json({ error: "Staff access is not configured." });
      return;
    }

    // Express honors forwarding only across the explicitly configured trust boundary.
    const client = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const pin = typeof req.body?.pin === "string" ? req.body.pin : "";
    if (!/^[0-9]{4}$/.test(pin)) {
      res.status(400).json({ error: "A four-digit PIN is required." });
      return;
    }

    let decision;
    try {
      decision = await attempts.attempt(client, () => verifyStaffPin(pin));
    } catch {
      // A database outage must not turn into unlimited PIN guesses.
      req.log?.error("Staff login attempt store unavailable");
      res.status(503).json({ error: "Staff sign-in is temporarily unavailable. Please try again shortly." });
      return;
    }
    if (decision.retryAfter) {
      rejectLimitedLogin(res, decision.retryAfter);
      return;
    }
    const staffId = decision.staffId;
    if (!staffId) {
      res.status(401).json({ error: "The staff PIN is not valid." });
      return;
    }

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

  return router;
}

export default createStaffRouter(new StaffLoginRateLimiter(new PostgresStaffAttemptStore()));