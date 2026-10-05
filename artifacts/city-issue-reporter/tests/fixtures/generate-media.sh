#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Synthetic fixtures only: no resident media. Regeneration needs ffmpeg,
# but ordinary tests use the committed files and need no encoder.
audio=(-f lavfi -i "sine=frequency=440:sample_rate=48000" -t 2 -ac 1)
video=(-f lavfi -i "testsrc2=size=80x60:rate=15" -f lavfi -i "sine=frequency=440:sample_rate=48000" -t 2)
ffmpeg -y -loglevel error -f lavfi -i "color=c=blue:s=80x60" -frames:v 1 -threads 1 photo.png
ffmpeg -y -loglevel error "${audio[@]}" -c:a libopus audio.webm
ffmpeg -y -loglevel error "${audio[@]}" -c:a aac -movflags +faststart audio.m4a
ffmpeg -y -loglevel error "${audio[@]}" -c:a libopus audio.ogg
ffmpeg -y -loglevel error "${audio[@]}" -c:a libmp3lame audio.mp3
ffmpeg -y -loglevel error "${audio[@]}" -c:a pcm_s16le audio.wav
ffmpeg -y -loglevel error "${video[@]}" -c:v libvpx -b:v 100k -c:a libopus video.webm
ffmpeg -y -loglevel error "${video[@]}" -c:v libx264 -profile:v baseline -pix_fmt yuv420p -c:a aac -movflags +faststart video.mp4
ffmpeg -y -loglevel error "${video[@]}" -c:v libx264 -profile:v baseline -pix_fmt yuv420p -c:a aac -movflags +faststart video.mov
