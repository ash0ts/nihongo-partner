#!/bin/zsh
# Joins the recorded app chapters, the annotated Agent Lens stills, and the outro into one MP4.
#
#   out/walkthrough/walkthrough.mp4        app chapters + "Behind it" title card (record.py, demo/walkthrough.json)
#   out/forge-frames/0*.png           Agent Lens stills captured in a signed-in browser (see docs/forge-demo.md)
#   out/walkthrough-outro/walkthrough.mp4  outro card (record.py, demo/outro.json)
#   -> out/walkthrough/nihongo-sensei-walkthrough.mp4
#
# Each still becomes a HOLD-second clip with a slow push-in so the frame is not dead, plus a short fade.
# Usage: demo/assemble-forge.sh [hold_seconds]
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=out/walkthrough
HOLD=${1:-7.5}
FPS=25
W=1280
H=800
FRAMES=$(python3 -c "print(int($HOLD * $FPS))")

APP=$OUT/walkthrough.mp4
OUTRO=out/walkthrough-outro/walkthrough.mp4
[[ -f $APP ]] || { echo "missing $APP (run record.py with demo/walkthrough.json)" >&2; exit 1; }
[[ -f $OUTRO ]] || { echo "missing $OUTRO (run record.py with demo/outro.json --out out/walkthrough-outro)" >&2; exit 1; }

stills=(out/forge-frames/0*.png)
(( ${#stills} )) || { echo "no stills in out/forge-frames" >&2; exit 1; }

work=$OUT/_assemble
rm -rf "$work" && mkdir -p "$work"

# Normalise every piece to the same codec, size, fps and timebase so concat is a straight copy.
norm() { ffmpeg -y -loglevel error -i "$1" ${3:+-t} ${3:+$3} -vf "scale=${W}:${H}:flags=lanczos,fps=$FPS,format=yuv420p" -c:v libx264 -preset medium -crf 20 -an -video_track_timescale 90000 "$2"; }
# The recorder lingers on the app for a beat after the "Behind it" card; cut straight from the card to the frames.
APP_TRIM=${APP_TRIM:-2.0}
app_len=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$APP")
norm "$APP" "$work/00-app.mp4" "$(python3 -c "print(max(1.0, $app_len - $APP_TRIM))")"

i=0
for png in $stills; do
  i=$((i + 1))
  name=$(basename "$png" .png)
  # Up-sample to the working size first so zoompan has pixels to spare, then push in ~6% over the hold.
  ffmpeg -y -loglevel error -loop 1 -framerate $FPS -i "$png" -t "$HOLD" \
    -vf "scale=$((W * 2)):$((H * 2)):flags=lanczos,zoompan=z='min(1+0.06*on/$FRAMES,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=$FPS,fade=t=in:st=0:d=0.35,fade=t=out:st=$(python3 -c "print($HOLD-0.35)"):d=0.35,format=yuv420p" \
    -c:v libx264 -preset medium -crf 20 -an -video_track_timescale 90000 "$work/$(printf '%02d' $i)-$name.mp4"
done
norm "$OUTRO" "$work/99-outro.mp4"

ls "$work"/*.mp4 | sort | sed "s/^/file '/; s/$/'/" | sed "s|$work/||" > "$work/list.txt"
(cd "$work" && ffmpeg -y -loglevel error -f concat -safe 0 -i list.txt -c copy -movflags +faststart ../nihongo-sensei-walkthrough.mp4)
rm -rf "$work"

ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/nihongo-sensei-walkthrough.mp4" | xargs printf "wrote $OUT/nihongo-sensei-walkthrough.mp4 (%.1f s)\n"
