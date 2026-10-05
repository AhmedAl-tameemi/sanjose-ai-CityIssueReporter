import { readFileSync } from 'node:fs';

// Containers and codecs representative of files produced on other devices.
export const portableMedia = [
  ['photo.png', 'image/png', 'PNG'],
  ['audio.webm', 'audio/webm', 'Opus'],
  ['video.webm', 'video/webm', 'VP8 + Opus'],
  ['audio.m4a', 'audio/mp4', 'AAC-LC'],
  ['video.mp4', 'video/mp4', 'H.264 baseline + AAC-LC'],
  ['audio.ogg', 'audio/ogg', 'Opus'],
  ['audio.mp3', 'audio/mpeg', 'MP3'],
  ['audio.wav', 'audio/wav', 'PCM 16-bit'],
  ['video.mov', 'video/quicktime', 'H.264 baseline + AAC-LC'],
].map(([name, type, codecs]) => ({
  name, type, codecs, bytes: readFileSync(new URL(name, import.meta.url)),
}));
