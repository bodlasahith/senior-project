# Technique-model training data pipeline

A small, reproducible pipeline to turn swim videos into labeled 224×224 frames
for retraining the three point-of-view technique classifiers (front / top / side).

Frames are preprocessed **exactly like the app** (`TechniqueClassifier.imageToTensor`):
center-crop to a square, then resize to 224×224. Training on the same
preprocessing the app uses at inference time is what makes the model's on-device
behavior match what you trained.

> ⚠️ **Two things to know before you start**
> 1. **You must label the data.** The model predicts technique *quality*
>    (Satisfactory / Needs Improvement / Extraneous). Downloaded clips are
>    unlabeled — the labeling step below is manual and is the single biggest
>    determinant of model quality. There is no automating this part.
> 2. **Source responsibly.** Downloading from YouTube violates its Terms of
>    Service. Prefer clips you own, Creative-Commons / openly-licensed footage,
>    public datasets, or your own pool recordings. Only you can decide what's
>    appropriate to download; these scripts don't pick sources for you.

## Prerequisites

- `ffmpeg` — already installed on this machine (v8.x).
- `yt-dlp` — only needed if you download from URLs. Install with:
  ```bash
  python3 -m pip install --user yt-dlp
  # or: brew install yt-dlp
  ```
  (If you're supplying your own local video files, you can skip yt-dlp entirely
  and drop them straight into `videos/<pov>/`.)

## Layout

```
training-data/
  sources.example.txt   # copy to sources.txt and edit
  download.sh           # sources.txt  -> videos/<pov>/*.mp4
  extract_frames.sh     # videos/<pov>/ -> frames/<pov>/_unlabeled/*.jpg  (224×224)
  videos/               # (created) raw downloaded/added videos, per POV
  frames/               # (created) extracted frames, per POV
    front/
      _unlabeled/       # extract_frames.sh drops frames here
      satisfactory/     # <- you move frames into these three by hand
      needs_improvement/
      extraneous/
    top/  ...
    side/ ...
```

## Workflow

**1. Choose sources.** Copy the template and add clips per POV:
```bash
cd training-data
cp sources.example.txt sources.txt
# edit sources.txt — see its comments for the format
```
(Or skip download entirely and drop local video files into `videos/front/`, etc.)

**2. Download** (needs yt-dlp):
```bash
./download.sh            # reads sources.txt
```

**3. Extract frames** (needs ffmpeg) — one frame every 2 s by default, center-cropped to 224×224:
```bash
./extract_frames.sh              # every POV, 1 frame / 2 s
./extract_frames.sh front 1      # just 'front', 1 frame / 1 s
```
Frames land in `frames/<pov>/_unlabeled/`.

**4. Label (manual).** Sort each POV's `_unlabeled/` frames into the three class
folders (`satisfactory/`, `needs_improvement/`, `extraneous/`). Put clearly
non-swimmer / unusable frames in `extraneous/` — that's how you fix the current
model's biggest weakness (it confidently mislabels out-of-distribution images,
e.g. a photo of a kitchen → "Satisfactory 99%"). Aim for a **balanced** count
across the three classes, and ideally 100+ frames/class/POV to start.

**5. Retrain.** Two paths, both consuming the labeled `frames/<pov>/<class>/` folders:
- **Teachable Machine (fastest, matches the current models' origin):** create an
  Image Project with 3 classes per POV, drag in the class folders, train, export
  **TensorFlow → Keras (.h5)**.
- **Local Keras (more control):** MobileNetV2 transfer-learning, 224×224 input,
  normalize to [-1,1] (`pixel/127.5 - 1`) to match the app.

**6. Convert & drop in.** Convert each `.h5` → `.tflite` and replace the files in
`SwimAnalysisApp/assets/models/technique/{front,top,side}_pov.tflite`. Use the
same conversion recipe recorded from before: Python 3.11 venv, `tensorflow` +
`tf-keras`, `TF_USE_LEGACY_KERAS=1`, `Optimize.DEFAULT` (dynamic-range quant).
Keep the class order identical to `TECHNIQUE_CLASSES` in
`SwimAnalysisApp/services/TechniqueClassifier.js`
(Satisfactory / Needs Improvement / Extraneous).

## Validate the new models

Rebuild the standalone app and re-run the on-device check (real swim footage per
POV this time, plus a non-swimmer negative control which should now land in
"Extraneous"):
```bash
cd ../SwimAnalysisApp
npx expo run:ios --device "Sahiths iphone" --configuration Release
```
