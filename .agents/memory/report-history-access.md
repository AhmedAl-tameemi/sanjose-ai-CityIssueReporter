---
name: Report history access
description: Resident ownership and staff visibility expectations for persistent report history.
---

The user specified: "public users should be able to acess their own reports only while staff are able to see full reports."

**Why:** Reports contain original resident text, exact locations, contacts, and private evidence; a globally public history would expose these details.

**How to apply:** Enforce ownership in every report or evidence API query, not only in UI filtering. The account-free product currently uses a signed persistent browser session for resident ownership, not verified personal identity. Closing a tab preserves access; clearing cookies or switching browsers loses resident access but does not delete database records. Disclose that limit. Staff access requires the existing staff authentication. Any future cross-device recovery must verify identity rather than rely on confirmation numbers alone.