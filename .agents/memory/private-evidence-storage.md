---
name: Private evidence storage
description: Durable storage and access expectations for resident-uploaded photo evidence.
---

Resident evidence should remain in private managed object storage, with only a validated opaque object path and metadata kept in the report state.

**Why:** Browser storage disappears when residents change devices or clear site data, while storing image bytes in structured records creates unnecessary privacy and size risks.

**How to apply:** Validate the declared content type, size, and image signature at the server boundary. Keep the object path capability-scoped and serve through a controlled API route. Resident previews use a signed, object-specific header capability; staff use an HttpOnly role session. Never accept the object path alone or put a preview capability in a URL.