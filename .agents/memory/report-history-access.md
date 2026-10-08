---
name: Report history access
description: Browser-scoped resident history and explicitly public City staff report access.
---

Default resident history should show reports submitted from the current browser only. The City staff view is public, with no PIN, email, or account required. Full submitted reports, contact details, and submitted attachments are publicly accessible.

**Why:** On 2026-10-08, the user asked to remove the PIN and explicitly selected public staff access after being warned that reports, contact details, and attachments would be accessible to anyone. This supersedes the shared-PIN and older individual-PIN decisions.

**How to apply:** Keep public staff reads distinct from ordinary owner-scoped resident history and private, capability-scoped upload previews. Public staff access applies only to saved reports and report-linked evidence, not arbitrary raw storage paths. Warn residents before submission that reports, contacts, and attached files will be public. Do not restore a login gate without a new user request. Browser identity remains account-free: clearing cookies or switching browsers loses access to the personal list but does not delete saved records.

The public Incident map should use official City-published historical collision data, not TrafficSignal resident submissions.

**Why:** The owner requested previous incidents reported by the City of San José, not a map of residents' private submissions.

**How to apply:** Keep City open data distinct from app submissions. A public community-report map layer still requires a separate scope decision.

Each resident submission should support a compiled report for City officials, available in the public staff view.

**Why:** The owner requested that important submitted accident/incident information be collected for City review, and later explicitly made the staff view public. Compiled copies remain resident statements rather than independently verified official accident records.

**How to apply:** Use the resident's captured details as the source of truth. Keep original statements and evidence distinct from translations and automated suggestions, and never infer missing injuries, vehicle details, or official findings.