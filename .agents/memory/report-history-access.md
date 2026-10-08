---
name: Report history access
description: Browser-scoped resident history and shared-PIN City staff access.
---

Default resident history should show reports submitted from the current browser only. City officials should use one shared four-digit PIN, with no email or individual staff account needed, to access full reports and submitted attachments.

**Why:** On 2026-10-08, the user explicitly requested a single shared PIN for all City officials. This supersedes both the temporary public staff view and the older separate-per-staff PIN decision.

**How to apply:** Enforce staff authentication on report-list and attachment APIs, not only in the UI. Keep ordinary resident history owner-scoped and raw upload previews capability-scoped. Shared staff access is not individually attributable; do not imply that it identifies each official. Store the PIN securely, preserve leading zeroes, and never supply a hardcoded fallback. Browser identity remains account-free: clearing cookies or switching browsers loses access to the personal list but does not delete saved City records.

The public Incident map should use official City-published historical collision data, not private TrafficSignal resident submissions.

**Why:** The owner requested previous incidents reported by the City of San José, not a map of residents' private submissions.

**How to apply:** Keep City open data distinct from app submissions. A public community-report map layer still requires a separate scope decision.

Each resident submission should support a compiled internal report for City officials.

**Why:** The owner requested that important submitted accident/incident information be collected for City review. Compiled copies belong in the protected staff view and remain resident statements rather than independently verified official accident records.

**How to apply:** Use the resident's captured details as the source of truth. Keep original statements and evidence distinct from translations and automated suggestions, and never infer missing injuries, vehicle details, or official findings.