import type { Express } from "express";
import { isIP } from "node:net";

/** Opt in only to verified proxy addresses; never trust a fixed hop count. */
export function configureTrustedProxy(app: Express, configured = process.env.STAFF_LOGIN_TRUSTED_PROXY_CIDRS): void {
  const addresses = configured?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  for (const address of addresses) {
    const [ip, prefix, extra] = address.split("/");
    const version = isIP(ip);
    const bits = version === 4 ? 32 : 128;
    if (!version || extra !== undefined ||
      (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > bits))) {
      throw new Error("STAFF_LOGIN_TRUSTED_PROXY_CIDRS must contain explicit, non-global proxy IPs or CIDRs.");
    }
  }
  // Unconfigured origins remain safe: forwarding headers cannot rotate keys.
  // Express walks X-Forwarded-For from the socket toward the first untrusted
  // address, ignoring caller-supplied entries further to the left.
  app.set("trust proxy", addresses.length ? addresses : false);
}
