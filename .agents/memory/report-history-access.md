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