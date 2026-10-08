---
name: Resident text translation
description: Provider and data-preservation rules for resident translations and concise AI report summaries.
---

Preserve resident-entered text exactly as submitted and store any English translation as a separate staff-facing value. Use the project owner’s `OPENAI_API_KEY` secret for free-form translation and report safety analysis; do not retry managed AI setup for these features.

**Why:** Managed AI provisioning required phone verification, and the project owner chose the user-supplied key path instead. Replacing source text would also remove the authoritative resident statement.

**How to apply:** Keep interface translations in the local catalog. Send only free-form report fields to the server translation route, fail without losing the report, and mark the English translation as pending when the secret or provider is unavailable. Safety analysis must be clearly unavailable on a provider failure, never replaced with invented AI output.

Each resident report should have a concise English AI summary of the whole submitted incident, around 2–5 sentences, including reports already on file.

**Why:** On 2026-10-08, the user explicitly requested this length and whole-report scope, rather than the former single-sentence triage summary.

**How to apply:** Summarize the available location, timing, frequency, circumstances, stated impacts, and attachment availability without inventing missing facts. Keep the resident's original statement authoritative and separate. Attachment metadata must never be represented as an AI review of the actual photo, audio, or video.