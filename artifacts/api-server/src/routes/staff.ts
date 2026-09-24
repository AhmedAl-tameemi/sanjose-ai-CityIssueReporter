import { Router, type IRouter, type Request, type Response } from "express";
import {
  clearStaffSessionCookie,
  createStaffSession,
  getStaffSession,
  isStaffAuthConfigured,
  setStaffSessionCookie,
  verifyStaffCredentials,
} from "../lib/staffAuth";

const router: IRouter = Router();

router.post("/staff/login", (req: Request, res: Response) => {
  if (!isStaffAuthConfigured()) {
    res.status(503).json({ error: "Staff access is not configured." });
    return;
  }

  const email = typeof req.body?.email === "string" ? req.body.email : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email.trim() || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  if (!verifyStaffCredentials(email, password)) {
    res.status(401).json({ error: "The staff credentials are not valid." });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  setStaffSessionCookie(res, createStaffSession(normalizedEmail));
  res.json({
    authenticated: true,
    email: normalizedEmail,
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
    email: session.email,
    role: session.role,
  });
});

router.post("/staff/logout", (_req: Request, res: Response) => {
  clearStaffSessionCookie(res);
  res.status(204).end();
});

export default router;