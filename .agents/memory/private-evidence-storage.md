---
name: Private evidence storage
description: Durable storage and access expectations for resident-uploaded photo, audio, and video evidence.
---

Resident evidence should remain in private managed object storage, with only a validated opaque object path and metadata kept in the report state.

**Why:** Browser storage disappears when residents change devices or clear site data, while storing media bytes in structured records creates unnecessary privacy and size risks.

**How to apply:** Validate the declared content type, size, and image signature or media container at the server boundary. Resident upload previews use a signed, object-specific header capability; never accept the object path alone or put a preview capability in a URL. Saved attachments require the submitting resident's browser identity or a valid shared-PIN staff session through a controlled report-scoped route. Raw storage paths and unsubmitted uploads are not public.

Device recording is optional, resident-initiated evidence collection—not continuous accident detection. Residents review and explicitly attach a clip; recordings are not sent to text-analysis or translation services.

**Why:** The user requested microphone/camera permission and audio/video evidence in reports, not passive surveillance or automated accident detection. Permission to record is not permission to upload or process media with AI.

**How to apply:** Keep recording consent and attachment separate. Stop device access when capture ends or the page is left or hidden; discard late permission results. Any future automatic media analysis requires a separate scope and consent decision.

Form dictation has a different purpose from recording evidence. Treat it as optional speech-to-editable-text assistance, not implicit consent to attach audio or submit a report.

**Why:** The user separately requested microphone input instead of typing or selecting form choices. Browser speech recognition can involve a browser-managed transcription provider, so do not describe dictation as guaranteed offline or entirely on-device.

**How to apply:** Keep the manual controls and review step available. Explain speech-provider processing before dictation; do not save dictation audio as evidence. Preserve the distinction between browser transcription for form entry and processing explicitly attached evidence.

For reports with multiple media files, cap each report at 5 attachments and 25 MiB combined, while retaining the per-file limits of 3 MiB for images, 10 MiB for audio, and 20 MiB for video. Check aggregate size against stored object metadata, not only client-declared sizes.

**Why:** A single-resident upload can stay within each media limit and still exceed a reasonable report-level storage budget when several files are combined.

**How to apply:** Keep the aggregate count and size limits aligned across the upload UI, API contract, and report-submission validation. Compare each submitted file's size and media type to its private object metadata before saving the report.