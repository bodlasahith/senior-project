#!/usr/bin/env bash
# Extract 224x224 frames from videos/<pov>/*  ->  frames/<pov>/_unlabeled/
#
# Preprocessing matches the app (TechniqueClassifier.imageToTensor):
# center-crop to a square, then scale to 224x224.
#
# Usage:
#   ./extract_frames.sh                 # all POVs, 1 frame / 2 s
#   ./extract_frames.sh front           # only 'front', 1 frame / 2 s
#   ./extract_frames.sh front 1         # only 'front', 1 frame / 1 s
#   ./extract_frames.sh all 0.5         # all POVs, 1 frame / 0.5 s (2 fps)
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found." >&2; exit 1
fi

POV_ARG="${1:-all}"
SECONDS_PER_FRAME="${2:-2}"        # one frame every N seconds
SIZE=224

if [[ "$POV_ARG" == "all" ]]; then
  POVS=(front top side)
else
  POVS=("$POV_ARG")
fi

# fps = 1 / secondsPerFrame  (ffmpeg accepts the expression directly)
FPS="1/${SECONDS_PER_FRAME}"
# center-crop to square, then scale to 224x224
VF="crop='min(iw,ih)':'min(iw,ih)',scale=${SIZE}:${SIZE},fps=${FPS}"

total=0
for pov in "${POVS[@]}"; do
  srcdir="videos/$pov"
  outdir="frames/$pov/_unlabeled"
  mkdir -p "$outdir" "frames/$pov/satisfactory" "frames/$pov/needs_improvement" "frames/$pov/extraneous"

  if [[ ! -d "$srcdir" ]] || [[ -z "$(ls -A "$srcdir" 2>/dev/null || true)" ]]; then
    echo "── [$pov] no videos in $srcdir — skipping"
    continue
  fi

  for video in "$srcdir"/*; do
    [[ -f "$video" ]] || continue
    base="$(basename "${video%.*}")"
    echo "── [$pov] $base"
    ffmpeg -nostdin -hide_banner -loglevel error \
      -i "$video" -vf "$VF" -q:v 3 \
      "$outdir/${base}_%04d.jpg"
    n="$(ls "$outdir/${base}"_*.jpg 2>/dev/null | wc -l | xargs)"
    echo "     -> $n frames"
    total=$((total + n))
  done
done

echo "Done. Extracted ~$total frame(s) into frames/<pov>/_unlabeled/."
echo "Next: sort them into satisfactory/ needs_improvement/ extraneous/ (see README)."
