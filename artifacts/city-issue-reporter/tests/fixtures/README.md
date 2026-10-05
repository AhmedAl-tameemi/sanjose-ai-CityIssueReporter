# Portable saved-evidence playback

These committed fixtures are synthetic (a 440 Hz tone, animated test pattern,
and blue PNG), contain no resident data, and do not need microphone/camera access.
Run `bash tests/fixtures/generate-media.sh` from this app to regenerate with
ffmpeg. The normal browser tests only read the committed bytes.

| Container/MIME | Representative codecs |
| --- | --- |
| WebM audio | Opus |
| WebM video | VP8 + Opus |
| M4A (`audio/mp4`) | AAC-LC |
| MP4 video | H.264 baseline + AAC-LC |
| Ogg audio | Opus |
| MP3 (`audio/mpeg`) | MP3 |
| WAV | 16-bit PCM |
| MOV (`video/quicktime`) | H.264 baseline + AAC-LC |

All clips are two seconds. Video/PNG dimensions are 80 × 60.

## Run

Start the managed TrafficSignal workflow, then:

```sh
pnpm --filter @workspace/city-issue-reporter test:playback
```

To run one engine:

```sh
TEST_BROWSER=webkit pnpm --filter @workspace/city-issue-reporter exec node --test tests/report-recording.browser.test.mjs
TEST_BROWSER=firefox pnpm --filter @workspace/city-issue-reporter exec node --test tests/report-recording.browser.test.mjs
```

`TEST_APP_URL` can override the running app URL. All API requests are intercepted;
these tests never submit real reports or store media. Confirmation fetches must
carry the attachment's preview header capability. History uses the report's
indexed evidence endpoint. No capability is placed in a URL.

The tests verify real decoding, native controls, advancing playback time, and
decoded video dimensions in confirmation and history, including reloads. They
also cover five mixed attachments, legacy single attachments, and per-file
corrupt-byte/404/503 failures that must not break neighboring evidence.
Ogg has explicit failure coverage because its history player loads a seekable
blob rather than streaming the whole-file HTTP endpoint.

## Confirmation on 2026-10-05

- Chromium: all 26 original/matrix cases passed; the three additional Ogg
  failure cases and fixed Ogg playback passed in a focused follow-up.
- Firefox: all 21 saved-playback cases passed (five device-capture tests are
  intentionally Chromium-only); the additional Ogg failures and fixed playback
  passed in a focused follow-up.
- WebKit: 20 saved-playback cases initially passed; Ogg failed in history.
  After changing HTTP Ogg playback to a local seekable blob, Ogg playback and
  all three additional Ogg failure cases passed.
- Unit tests and the app's TypeScript check passed. Shared declarations must be
  built first (`pnpm run typecheck:libs`) if this workspace has stale outputs.

Playwright's Linux WebKit is Safari-engine regression coverage, not a test of
shipping macOS/iOS Safari. Container acceptance does not promise every possible
codec inside that container; HEVC and other device-specific codecs are not
certified by these fixtures. This suite checks saved-file playback, not native
Safari/Firefox device capture or the real storage/authentication backend.
