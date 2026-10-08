---
name: Report history access
description: Resident ownership and staff visibility expectations for persistent report history.
---

The user specified: "public users should be able to acess their own reports only while staff are able to see full reports."

**Why:** Reports contain original resident text, exact locations, contacts, and private evidence; a globally public history would expose these details.

**How to apply:** Enforce ownership in every report or evidence API query, not only in UI filtering. The account-free product currently uses a signed persistent browser session for resident ownership, not verified personal identity. Closing a tab preserves access; clearing cookies or switching browsers loses resident access but does not delete database records. Disclose that limit. Staff access requires the existing staff authentication. Any future cross-device recovery must verify identity rather than rely on confirmation numbers alone.

The public Incident map should use official City-published historical collision data, not private TrafficSignal resident submissions.

**Why:** The owner requested previous incidents reported by the City of San José. That request does not revoke the existing resident-report privacy requirement or establish consent to publish residents' incident locations.

**How to apply:** Keep City open data distinct from app submissions. Any future public community-report layer needs a separate scope and privacy/consent decision; do not expose it just because the app now has a public map.

Staff sign-in should use an individually assigned four-digit PIN, with no email field at login.

**Why:** The owner explicitly chose a separate PIN for each staff member rather than one shared PIN, so staff access remains individually attributable.

**How to apply:** Associate each administrator-issued PIN with a stable staff identifier. Keep report and evidence access enforced on the server; do not replace individual assignments with a shared code or allow residents to self-register staff PINs.

Each resident submission should support a compiled internal report for City officials.

**Why:** The owner requested that all important submitted accident/incident information be collected into a report for City review, not turned into a public or independently verified accident record.

**How to apply:** Use the resident's captured details as the source of truth. Keep original statements and evidence distinct from translations and automated suggestions, and never infer missing injuries, vehicle details, or official findings.