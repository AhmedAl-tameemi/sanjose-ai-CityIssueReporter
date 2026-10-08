---
name: Staff proxy trust
description: Limits of Replit ingress verification and safe client identification for PIN throttling.
---

Do not enable automatic broad proxy trust for staff PIN throttling. Opt in only
to explicitly verified ingress IPs/CIDRs; otherwise keep a shared peer budget.
Ignore X-Real-IP for this purpose.

**Why:** Live preview checks on 2026-10-08 replaced forged X-Forwarded-For chains
but retained forged X-Real-IP. The probes showed internal relays, not a verified
public client boundary. Replit docs confirm forwarding headers but do not
guarantee a stable trusted relay range or identical published ingress behavior.
The published app was password-protected and was not live-probed.

**How to apply:** Verify all ingress paths and origin isolation before enabling
an allowlist. Never infer trusted private networks or use a fixed hop count just
because preview works. A conservative shared budget is preferable to caller-
controlled guessing budgets when the boundary cannot be verified.
