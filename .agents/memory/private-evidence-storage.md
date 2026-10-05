---
name: Private evidence storage
description: Durable storage and access expectations for resident-uploaded photo, audio, and video evidence.
---

Resident evidence should remain in private managed object storage, with only a validated opaque object path and metadata kept in the report state.

**Why:** Browser storage disappears when residents change devices or clear site data, while storing media bytes in structured records creates unnecessary privacy and size risks.

**How to apply:** Validate the declared content type, size, and image signature or media container at the server boundary. Keep the object path capability-scoped and serve through a controlled API route. Resident previews use a signed, object-specific header capability; staff use an HttpOnly role session. Never accept the object path alone or put a preview capability in a URL.

Device recording is optional, resident-initiated evidence collection—not continuous accident detection. Residents review and explicitly attach a clip; recordings are not sent to text-analysis or translation services.

**Why:** The user requested microphone/camera permission and audio/video evidence in reports, not passive surveillance or automated accident detection. Permission to record is not permission to upload or process media with AI.

**How to apply:** Keep recording consent and attachment separate. Stop device access when capture ends or the page is left or hidden; discard late permission results. Any future automatic media analysis requires a separate scope and consent decision.