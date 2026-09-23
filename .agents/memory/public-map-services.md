---
name: Public map services
description: Keyless location search and map-service tradeoff for the city report prototype.
---

The resident-facing location flow should remain keyless with OpenStreetMap tiles and Leaflet rather than Google Maps. Public Nominatim is appropriate only for low-volume, user-initiated address searches and reverse lookups.

**Why:** The user explicitly rejected Google Maps and an API key for this prototype. Public OSM services have usage policies and are not a guaranteed high-volume geocoding or tile backend.

**How to apply:** Keep map attribution visible, do not add autocomplete against public Nominatim, and pace requests to no more than one per second. If usage grows, move lookup and tiles to a suitable hosted or self-managed provider without silently reinstating a Google key.