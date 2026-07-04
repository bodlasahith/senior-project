# Quick Reference: From Dataset to App

## Your Dataset Has Everything You Need ✅

```
stroke_dataset.csv (2010 samples)
├── 60 IMU features (10 sensors × 6 each)
│   ├── 30 accelerometer readings (3-axis × 10 sensors)
│   └── 30 gyroscope readings (3-axis × 10 sensors)
├── 2 visual features (head position)
├── 1 confidence score (stroke probability)
└── 1 target label (5 stroke types)
```

---

## The Path to a Working App (12 Weeks)

### Week 1: TRAIN YOUR MODEL ⚡

```bash
python3 train_stroke_model.py
```

**What happens:**

1. Loads 2010 samples from CSV
2. Normalizes sensor data
3. Trains neural network (hybrid CNN+Dense)
4. Tests accuracy on hold-out set
5. Converts to TensorFlow Lite format

**Output files:**

- `stroke_classification_model.tflite` ← **DEPLOY THIS TO APP**
- `scaler.pkl` ← Preprocessing for new data
- `label_encoder.pkl` ← Decode predictions

**Expected results:**

- Accuracy: 92-96%
- Inference time: ~80ms per prediction
- File size: 2.5 MB

---

### Weeks 2-3: SETUP REACT NATIVE 🚀

```bash
npm install -g expo-cli
npx create-expo-app SwimTrackerApp
cd SwimTrackerApp

npm install \
  expo-sensors \
  expo-file-system \
  react-navigation \
  react-native-sqlite-storage
```

---

### Weeks 4-6: BUILD CORE FEATURES 📱

#### Feature 1: Sensor Data Collection

```javascript
// Reads accelerometer & gyroscope at 10-100 Hz
// Stores in buffer, preprocesses when full
// Feeds to ML model for prediction
```

#### Feature 2: Stroke Classification

```javascript
// Load TensorFlow Lite model
// Run inference: 60 features → 5 stroke types + confidence
// Display current stroke + accuracy
```

#### Feature 3: Session Tracking

```javascript
// Log each stroke with timestamp
// Calculate total strokes, duration
// Save to local SQLite database
```

#### Feature 4: Efficiency Scoring

```javascript
// Use your biomechanical algorithm
// Calculate work input/output from sensor data
// Show feedback: Beginner → Professional
```

---

### Weeks 7-8: ADD VISION & POLISH 🎥

#### Video Analysis

```javascript
// Use phone camera to capture video
// Load pre-trained models (front/top/side POV)
// Classify technique: Satisfactory / Needs Improvement
```

#### Heart Rate Integration

```javascript
// Option A: Camera-based optical detection
// Option B: Bluetooth LE to HR monitor
// Track training zones during workout
```

---

### Weeks 9-12: TEST & LAUNCH 🎉

#### Testing

- Run on real device during actual swimming
- Validate accuracy with video comparison
- Check battery drain over 1-hour session
- Gather user feedback

#### Optimization

- Reduce sampling rate if battery is issue
- Cache precomputed normalization values
- Profile app memory usage

#### Publishing

- Build APK (Android)
- Build IPA (iOS)
- Create app store listings
- Launch!

---

## Key Files & What They Do

### Training Phase Files

| File                                 | Purpose                          |
| ------------------------------------ | -------------------------------- |
| `stroke_dataset.csv`                 | Input data (2010 samples)        |
| `train_stroke_model.py`              | Training script - RUN THIS FIRST |
| `stroke_classification_model.tflite` | Output model for app             |
| `scaler.pkl`                         | Feature normalization object     |
| `label_encoder.pkl`                  | Stroke type lookup table         |

### App Phase Files

| File                      | Purpose                         |
| ------------------------- | ------------------------------- |
| `app_starter_template.js` | Complete React Native template  |
| `IMPLEMENTATION_GUIDE.md` | Step-by-step dev instructions   |
| `PROJECT_SUMMARY.md`      | High-level overview (this doc)  |
| `WEARABLE_APP_DESIGN.md`  | Architecture & design decisions |

---

## The Data Flow

```
SWIMMER → SENSORS (Phone/Watch) → COLLECTION BUFFER
              ↓
         PREPROCESSING
         (normalize using scaler.pkl)
              ↓
         ML INFERENCE
         (60 features → stroke prediction)
              ↓
         DISPLAY RESULT
         (Show current stroke + confidence)
              ↓
         LOG & STORE
         (Save to local database)
              ↓
         ANALYTICS
         (Calculate efficiency, plot progress)
```

---

## What Each Stroke Type Represents

| Stroke           | IMU Signature                                           | Sample Count |
| ---------------- | ------------------------------------------------------- | ------------ |
| **Freestyle**    | Repetitive side-to-side arm rotation + forward momentum | 413          |
| **Backstroke**   | Reverse pattern of freestyle                            | 410          |
| **Breaststroke** | Distinct inward arm pull + leg kick synchronization     | 409          |
| **Butterfly**    | Simultaneous arm movement + dolphin kick pattern        | 409          |
| **Front Crawl**  | Similar to freestyle (alternate arm strokes)            | 369          |

Your model learns to recognize these unique accelerometer/gyroscope patterns!

---

## The 3 Vision Models You Have

From your old project - these classify stroke **technique quality**:

| Model              | View Angle     | Classification               |
| ------------------ | -------------- | ---------------------------- |
| front_POV_model.h5 | Facing swimmer | Technique quality (good/bad) |
| top_POV_model.h5   | Above water    | Technique quality (good/bad) |
| side_POV_model.h5  | Side view      | Technique quality (good/bad) |

**Output:** 3 classes

- 0 = Satisfactory Technique ✅
- 1 = Technique Needs Improvement ⚠️
- 2 = Extraneous/Unidentifiable ❌

**In the app:** Combine these with sensor-based stroke detection for multi-modal feedback!

---

## Hardware Recommendations

### Minimum Viable Product (MVP)

- **Device:** iPhone 13+ or Samsung Galaxy S21+
- **Why:** Good accelerometer/gyroscope, waterproof option, processing power
- **Cost:** $300-700
- **Benefit:** Full ML inference on device, camera for technique

### Ideal Setup

- **Primary:** Waterproof phone + app
- **Secondary:** Apple Watch for notifications
- **Optional:** Bluetooth heart rate monitor
- **Cost:** $400-1000 total

### Research/Professional Setup

- **Add:** 10-sensor IMU array via Bluetooth
- **Add:** Underwater video (GoPro + synchronized app)
- **Use:** For data collection & validation

---

## Important Numbers to Remember

```
Dataset:           2,010 samples
IMU sensors:       10 (30 acc + 30 gyro features)
Visual features:   2 (head position)
Stroke classes:    5 types
Model input:       60 numbers
Model output:      5 class probabilities
Inference time:    ~50-100ms
Model size:        2-3 MB
Training time:     5-15 minutes (GPU)
Accuracy target:   92-96%
```

---

## Quick Troubleshooting

### Model Training Issues

**Problem:** Out of memory during training

```bash
# Solution: Reduce batch size in train_stroke_model.py
batch_size = 16  # was 32
```

**Problem:** Accuracy is too low (<80%)

```bash
# Solution: Check feature normalization
# Ensure scaler is fit on training data only
# Validate test set is not in training data
```

### Mobile App Issues

**Problem:** TensorFlow Lite model not found

```javascript
// Solution: Copy model to app resources folder
// android: src/main/assets/
// ios: Bundle Resources
```

**Problem:** Sensors not reading

```javascript
// Solution: Check permissions in app.json
"permissions": ["CAMERA", "MOTION"]
```

**Problem:** App crashes on sensor data

```javascript
// Solution: Validate feature shape before model input
// Model expects: [batch=1, features=60]
```

---

## Success Criteria Checklist

### Model Training ✅

- [ ] `train_stroke_model.py` runs without errors
- [ ] `stroke_classification_model.tflite` is created
- [ ] Test accuracy > 85%
- [ ] Scaler and label encoder saved

### Mobile App MVP ✅

- [ ] App launches on real device
- [ ] Sensors collect data at 10-100 Hz
- [ ] ML model inference works (< 200ms latency)
- [ ] Strokes logged to local database
- [ ] Session saved successfully

### Feature Complete ✅

- [ ] Efficiency score calculated
- [ ] Technique analysis integrated (optional)
- [ ] Heart rate monitoring working
- [ ] Beautiful UI that swimmers love

### Ready for Launch ✅

- [ ] Zero crash rate on test users
- [ ] Battery drain < 15% per hour
- [ ] Accuracy validated on real swimmers
- [ ] App store listings prepared

---

## Cost Breakdown

| Item                     | Cost                      | One-time?     |
| ------------------------ | ------------------------- | ------------- |
| Development time         | Your time                 | -             |
| App development tools    | Free (Expo, React Native) | ✅            |
| ML tools                 | Free (TensorFlow)         | ✅            |
| Test device              | $400-800                  | ✅            |
| Cloud hosting (optional) | $10-50/month              | -             |
| App store fees           | $99 (iOS), $25 (Android)  | ✅            |
| **Total**                | **~$500-900**             | Most one-time |

---

## Next Steps (Do This Now)

1. **Review the documents**
   - Read `WEARABLE_APP_DESIGN.md`
   - Skim `IMPLEMENTATION_GUIDE.md`

2. **Set up training environment**

   ```bash
   pip install tensorflow pandas scikit-learn matplotlib seaborn joblib
   ```

3. **Run model training**

   ```bash
   python3 train_stroke_model.py
   # This will take 5-15 minutes
   ```

4. **Validate output files exist**

   ```bash
   ls -lh *.tflite *.pkl
   ```

5. **Set up React Native**

   ```bash
   npm install -g expo-cli
   npx create-expo-app SwimTrackerApp
   ```

6. **Start coding!**
   - Reference `app_starter_template.js`
   - Follow `IMPLEMENTATION_GUIDE.md`

---

## Resources to Bookmark

- **TensorFlow Lite:** https://www.tensorflow.org/lite
- **React Native:** https://reactnative.dev
- **Expo Docs:** https://docs.expo.dev
- **Swimming Biomechanics:** ResearchGate papers
- **ML Deployment:** TF Lite performance guide

---

## Final Thoughts

You have:
✅ High-quality training data
✅ Clear problem to solve
✅ Proven ML architectures
✅ Existing trained vision models
✅ Open-source tools ready to use

**The hardest part is done.** Now it's execution.

**Estimated time to MVP:** 6-8 weeks
**Estimated time to feature-complete:** 10-12 weeks
**Estimated time to published app:** 12-16 weeks

**You've got this!** Start with the training script this week. By next week, you'll have your first model. The momentum from there will carry you to launch.

Questions? Review the detailed guides in this project directory.

🏊‍♂️ Good luck! 🏊‍♀️
