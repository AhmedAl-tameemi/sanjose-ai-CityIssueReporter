# Staff PIN guessing protection

The login remains PIN-only with individual staff identities. PostgreSQL holds
the shared failure count and expiry under a hashed, canonical client address.
Each check holds a row lock through verification and commit. The fifth failure
starts a 15-minute cooldown; blocked requests do not extend it or verify PINs.
Success before the limit clears the count. Database failures reject sign-in with
503 rather than falling back to process memory. No PIN or staff ID is stored in
the limiter table. Expired counters are pruned in bounded hourly batches.

Apply the additive `staff_login_attempts` schema through the existing Drizzle
development push / managed Publish schema flow before starting the new server.
Missing schema fails closed with 503.

## Client identification and proxies

`STAFF_LOGIN_TRUSTED_PROXY_CIDRS` is an optional comma-separated list of **verified
proxy IPs or CIDRs**, not a hop count. With no setting, Express trusts no
forwarding headers and the socket peer is the rate-limit key. This is safe but
may group staff when an origin is reached through a shared relay.

Only configure this after confirming the ingress topology and restricting
origin access to the listed proxies. Include every actual trusted relay, but
do not include client networks or use a global range. Express scans
`X-Forwarded-For` from right to left and stops at the first untrusted address.
Caller-provided entries to its left cannot select a different budget.
`X-Real-IP` and `Forwarded` are not used. A direct request from an untrusted
peer cannot affect its key through any forwarding header.

Do not guess fixed Replit relay IPs, broadly trust private networks, or enable
`trust proxy: true` / numeric hop counts. Preview and published ingress can
differ, and variable path lengths defeat hop-count trust.

### Verification performed

- Live preview probes through the development HTTPS proxy, with no forwarded
  headers and with spoofed single/multi-address chains, produced the same
  proxy-generated `X-Forwarded-For` chain. The immediate peer was loopback;
  the forwarded chain contained internal relay addresses for these probes.
- The preview retained a caller-supplied `X-Real-IP`, so that header is unsuitable.
- Official Replit networking documentation confirms `X-Forwarded-For` is
  supplied, but does not establish fixed trusted CIDRs or sanitization guarantees
  for every deployment. The current published app is password-protected;
  no live production probe or deployment was performed.
- Real PostgreSQL HTTP tests exercise untrusted origins, explicit one/multiple
  trusted relays, forged leftmost entries, and short ingress paths. They also
  exercise separate Node processes, process replacement, concurrent guesses,
  expiry, remaining-time messages, and fail-closed store errors.

Before opting into forwarded client identification on a published origin,
confirm the peer/relay allowlist and repeat header-injection checks through
every reachable ingress path. If a reliable boundary is unavailable, keep the
safe peer-key fallback; do not silently assume forwarding headers are authentic.
