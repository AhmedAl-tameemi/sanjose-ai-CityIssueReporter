import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

const staffSessionCookie = "city_staff_session";
const residentOwnerCookie = "city_resident_owner";
const staffSessionTtlSeconds = 8 * 60 * 60;
const residentPreviewTtlSeconds = 24 * 60 * 60;
const residentOwnerTtlSeconds = 5 * 365 * 24 * 60 * 60;
const evidenceObjectPathPattern = /^\/objects\/evidence\/[a-f0-9-]{36}$/i;
const residentOwnerIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export type StaffRole = "city-evidence-reviewer" | "city-admin";

export type StaffSession = {
  staffId: string;
  role: StaffRole;
  exp: number;
};

type SignedTokenPayload = {
  aud: "city-staff-session" | "resident-evidence-preview" | "resident-report-owner";
  exp: number;
  staffId?: string;
  pinVersion?: string;
  role?: StaffRole;
  objectPath?: string;
  ownerId?: string;
};

function getSigningSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
  }
  return secret;
}

function encodePayload(payload: SignedTokenPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", getSigningSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function createToken(payload: SignedTokenPayload): string {
  const encodedPayload = encodePayload(payload);
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function readToken(token: string, audience: SignedTokenPayload["aud"]): SignedTokenPayload | null {
  const [encodedPayload, providedSignature, extraPart] = token.split(".");
  if (!encodedPayload || !providedSignature || extraPart) return null;

  let expectedSignature: string;
  try {
    expectedSignature = sign(encodedPayload);
  } catch {
    return null;
  }
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as SignedTokenPayload;
    if (payload.aud !== audience || !Number.isInteger(payload.exp)) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function isStaffAuthConfigured(): boolean {
  return Boolean(
    process.env.SESSION_SECRET &&
      process.env.SESSION_SECRET.length >= 32 &&
       getSharedStaffPin(),
  );
}

export function verifyStaffPin(pin: string): string | null {
  if (!isStaffAuthConfigured() || !/^[0-9]{4}$/.test(pin)) return null;
  const expectedPin = getSharedStaffPin();
  return expectedPin && safeEqual(pin, expectedPin) ? "city-officials" : null;
}

export function createStaffSession(staffId: string, role: StaffRole = "city-evidence-reviewer"): string {
  const pin = getSharedStaffPin();
  if (!pin || staffId !== "city-officials") throw new Error("Cannot create an unconfigured staff session.");
  return createToken({
    aud: "city-staff-session",
    staffId,
    pinVersion: sign(`staff-pin:${staffId}:${pin}`),
    role,
    exp: Math.floor(Date.now() / 1000) + staffSessionTtlSeconds,
  });
}

export function getStaffSession(req: Request): StaffSession | null {
  const cookieToken = getCookieToken(req);
  const bearerToken = getBearerToken(req);
  const token = cookieToken ?? bearerToken;
  if (!token) return null;

  const payload = readToken(token, "city-staff-session");
  if (
    !payload ||
    payload.staffId !== "city-officials" ||
    typeof payload.pinVersion !== "string" ||
    (payload.role !== "city-evidence-reviewer" && payload.role !== "city-admin")
  ) {
    return null;
  }
  const pin = getSharedStaffPin();
  if (!pin || !safeEqual(payload.pinVersion, sign(`staff-pin:${payload.staffId}:${pin}`))) {
    return null;
  }

  return {
    staffId: payload.staffId,
    role: payload.role,
    exp: payload.exp,
  };
}

export function canStaffReadEvidence(session: StaffSession | null): boolean {
  return (
    session?.role === "city-evidence-reviewer" ||
    session?.role === "city-admin"
  );
}

export function createResidentEvidencePreviewToken(objectPath: string): string {
  if (!evidenceObjectPathPattern.test(objectPath)) {
    throw new Error("Cannot create a preview token for an invalid evidence path.");
  }

  return createToken({
    aud: "resident-evidence-preview",
    objectPath,
    exp: Math.floor(Date.now() / 1000) + residentPreviewTtlSeconds,
  });
}

export function canResidentPreviewEvidence(
  req: Request,
  objectPath: string,
  explicitToken?: string,
): boolean {
  const token = explicitToken ?? req.header("x-resident-preview-token");
  if (!token) return false;

  const payload = readToken(token, "resident-evidence-preview");
  return payload?.objectPath === objectPath;
}

/**
 * Gives an anonymous resident a signed, long-lived browser identity so their
 * report history is private to this browser without requiring an account.
 */
export function getResidentOwnerId(req: Request, res: Response): string {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const existingToken = cookies?.[residentOwnerCookie];
  if (typeof existingToken === "string") {
    const payload = readToken(existingToken, "resident-report-owner");
    if (payload?.ownerId && residentOwnerIdPattern.test(payload.ownerId)) {
      return payload.ownerId;
    }
  }

  const ownerId = randomUUID();
  const token = createToken({
    aud: "resident-report-owner",
    ownerId,
    exp: Math.floor(Date.now() / 1000) + residentOwnerTtlSeconds,
  });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${residentOwnerCookie}=${token}; Max-Age=${residentOwnerTtlSeconds}; Path=/api; HttpOnly; SameSite=Strict${secure}`,
  );
  return ownerId;
}

export function setStaffSessionCookie(res: Response, token: string): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${staffSessionCookie}=${token}; Max-Age=${staffSessionTtlSeconds}; Path=/api; HttpOnly; SameSite=Lax${secure}`,
  );
}

export function clearStaffSessionCookie(res: Response): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${staffSessionCookie}=; Max-Age=0; Path=/api; HttpOnly; SameSite=Lax${secure}`,
  );
}

function getSharedStaffPin(): string | null {
  // Keep it a string so leading zeroes survive. Missing or malformed secrets
  // disable access; there is deliberately no hardcoded/default PIN.
  const pin = process.env.CITY_STAFF_PIN;
  return typeof pin === "string" && /^[0-9]{4}$/.test(pin) ? pin : null;
}

function getCookieToken(req: Request): string | null {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  return typeof cookies?.[staffSessionCookie] === "string"
    ? cookies[staffSessionCookie]
    : null;
}

function getBearerToken(req: Request): string | null {
  const authorization = req.header("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

function safeEqual(left: string, right: string): boolean {
  const leftDigest = createHmac("sha256", getSigningSecret()).update(left).digest();
  const rightDigest = createHmac("sha256", getSigningSecret()).update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}