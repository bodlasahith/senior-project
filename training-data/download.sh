#!/usr/bin/env bash
# Download the clips listed in sources.txt into videos/<pov>/.
# Format of sources.txt (see sources.example.txt):  <pov> <url>
set -euo pipefail

cd "$(dirname "$0")"

SOURCES="${1:-sources.txt}"

if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "yt-dlp not found. Install it first:" >&2
  echo "  python3 -m pip install --user yt-dlp   (or: brew install yt-dlp)" >&2
  exit 1
fi

if [[ ! -f "$SOURCES" ]]; then
  echo "No '$SOURCES'. Copy the template and edit it:" >&2
  echo "  cp sources.example.txt sources.txt" >&2
  exit 1
fi

count=0
while IFS= read -r line || [[ -n "$line" ]]; do
  # strip comments / blank lines
  line="${line%%#*}"
  line="$(echo "$line" | xargs || true)"
  [[ -z "$line" ]] && continue

  pov="$(echo "$line" | awk '{print $1}')"
  url="$(echo "$line" | awk '{print $2}')"

  case "$pov" in
    front|top|side) ;;
    *) echo "Skipping line (pov must be front|top|side): $line" >&2; continue ;;
  esac
  [[ -z "$url" ]] && { echo "Skipping line (no url): $line" >&2; continue; }

  mkdir -p "videos/$pov"
  echo "── [$pov] $url"
  # -N 4 : parallel fragments; cap height to keep files sane for frame extraction
  yt-dlp -N 4 -f "bestvideo[height<=720]+bestaudio/best[height<=720]/best" \
         -o "videos/$pov/%(title).80s-%(id)s.%(ext)s" \
         --merge-output-format mp4 \
         "$url" || echo "  ! failed: $url" >&2
  count=$((count+1))
done < "$SOURCES"

echo "Done. Processed $count source line(s). Videos are under videos/<pov>/."
echo "Next: ./extract_frames.sh"
