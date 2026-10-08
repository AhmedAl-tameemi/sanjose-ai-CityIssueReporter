---
name: Report history access
description: Browser-scoped resident history and the deliberately public City staff archive.
---

Default resident history should show reports submitted from the current browser only. The City staff view is deliberately public and shows full reports without a PIN, email, or staff identity.

**Why:** On 2026-10-08, the user explicitly chose "Make the view public" after being told that anyone with app access could see staff-only reports and private photos. This supersedes the former individually assigned staff PIN requirement, but does not require changing the ordinary browser-owned history view.

**How to apply:** Keep owner scoping on ordinary resident history and its evidence reads. Treat the explicitly selected staff archive as public, not as an authenticated identity, and disclose that descriptions, contacts, exact locations, and submitted attachments can be viewed by anyone with app access. Keep raw upload previews capability-scoped. Browser identity remains account-free: clearing cookies or switching browsers loses access to the personal list but does not delete records or remove them from the public archive.

The public Incident map should use official City-published historical collision data, not private TrafficSignal resident submissions.

**Why:** The owner requested previous incidents reported by the City of San José. Making the separate staff archive public does not authorize mixing resident submissions into the official City collision map.

**How to apply:** Keep City open data distinct from app submissions. A public community-report map layer still requires a separate scope decision.

Each resident submission should support a compiled internal report for City officials.

**Why:** The owner requested that important submitted accident/incident information be collected for City review. These compiled copies are now available in the public staff archive, but remain resident statements rather than independently verified official accident records.

**How to apply:** Use the resident's captured details as the source of truth. Keep original statements and evidence distinct from translations and automated suggestions, and never infer missing injuries, vehicle details, or official findings.