---
name: Spoken date interpretation
description: Calendar and year-guessing risks when converting resident speech to incident dates.
---

Incident dates use the Gregorian calendar. Do not assume that localized month names from Intl correspond to Gregorian month numbers.

**Why:** During locale checks, fa-IR formatted a Gregorian date using Persian-calendar month names and a different day. Mapping those names to Gregorian month positions would silently change the incident date.

**How to apply:** When extending speech date formats, use an explicit Gregorian calendar for Gregorian month dictionaries. Persian or other calendar dates need explicit conversion, not just digit normalization; unsupported phrases should receive date-format guidance.

Do not silently move a future month/day into the previous year to make it valid.

**Why:** Guessing the year changes the reported incident chronology without the resident's confirmation.

**How to apply:** Keep the last confirmed date when speech is invalid or future-dated and ask the resident to correct it. Keep the calendar available for review and correction.