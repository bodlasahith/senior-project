# Swimming Stroke Recognition App - Project Summary

## Your Current Assets

### Dataset 📊

- **2,010 labeled samples** from real swimming sessions
- **60 IMU features** from 10 sensors (each sensor: 3-axis accelerometer + 3-axis gyroscope)
- **5 stroke types**: Freestyle, Backstroke, Breaststroke, Butterfly, Front Crawl
- **Supporting data**: Head position tracking (x, y), stroke probability confidence
- **Quality**: Zero missing values, balanced class distribution ✅

### Pre-trained Models 🤖

- **3 CNN models** trained on video frames (Front POV, Top POV, Side POV)
- **Purpose**: Classify stroke technique as "Satisfactory", "Needs Improvement", or "Unidentifiable"
- **Format**: Keras H5 files (~2.3MB each)

### Your Original Algorithm 💡

- Efficiency calculation based on work input/output
- Performance feedback system (Beginner → Advanced)
- Already calculates biomechanical metrics

---

## What This Project Enables

### For the Swimmer

✅ Real-time stroke type detection (while swimming)
✅ Stroke count and session duration tracking
✅ Biomechanical efficiency scoring
✅ Technique quality assessment (via camera)
✅ Training zone monitoring (heart rate)
✅ Historical progress tracking

### For You (The Developer)

✅ Multi-modal ML system (sensor + vision fusion)
✅ Production-ready mobile app architecture
✅ Scalable backend for user management
✅ Research opportunities in biomechanics
✅ Potential commercialization path

---

## The 4-Step Implementation Path

### PHASE 1: Model Training (Weeks 1-2)

**Deliverables:**

- Train new stroke classification model on your dataset
- Convert to TensorFlow Lite format for mobile
- Validate accuracy on test set

**Files to use:**

- `train_stroke_model.py` - Run this to train your model
- Output: `stroke_classification_model.tflite` (2-3MB)

**Expected Results:**

- Accuracy: ~92-96% (based on data quality)
- Inference time: 50-100ms per prediction
- Model size: 2-3 MB (perfect for mobile)

---

### PHASE 2: Mobile App Development (Weeks 3-6)

**Technology:**

- React Native (JavaScript) - Works on iOS & Android
- Expo - Simplified development environment
- TensorFlow Lite - On-device ML inference

**What gets built:**

1. **Sensor Collection Module** - Reads accelerometer/gyroscope at 10-100Hz
2. **ML Inference** - Real-time stroke classification
3. **Session Management** - Track swim sessions and strokes
4. **UI/UX** - Beautiful, intuitive swimmer interface
5. **Data Persistence** - Local storage of sessions

**Files to reference:**

- `app_starter_template.js` - Complete React Native template
- Follow structure in `IMPLEMENTATION_GUIDE.md`

---

### PHASE 3: Advanced Features (Weeks 7-10)

**Optional additions:**

1. **Video Analysis** - Integrate your 3 pre-trained vision models for technique feedback
2. **Heart Rate Monitoring** - Camera-based or Bluetooth device
3. **Cloud Sync** - Firebase or AWS backend
4. **Social Features** - Share sessions, track friends
5. **AI Coaching** - Personalized recommendations

---

### PHASE 4: Launch & Optimization (Weeks 11-12)

**Final steps:**

1. Performance optimization (battery, memory)
2. User testing with real swimmers
3. App Store submission (iOS) & Play Store (Android)
4. Monitoring and iteration

---

## Your Hardware Options

### 🍎 Apple Watch (Easiest)

- Native IMU (accelerometer + gyroscope)
- Built-in heart rate monitor
- WatchOS 9+ has swimming mode
- Always with user
- **Limitation**: Single sensor only

### 📱 Waterproof Phone (Most Powerful)

- Phone's accelerometer/gyroscope
- Camera for technique analysis
- Can pair with Bluetooth HR monitor
- Best for multi-modal approach
- **Examples**: iPhone 14+, Samsung Galaxy S22+, Pixel 7 Pro

### ⌚ Smart Bracelet (Balanced)

- Multiple IMU sensors possible
- Heart rate monitor
- Swimming-proof design
- Lighter than phone
- Limited processing power

### 🔧 Research Setup (Most Accurate)

- Your full 10-sensor IMU array
- Bluetooth to smartphone
- Phone does processing
- Best for data collection & research

**Recommendation for MVP:** Use waterproof smartphone + React Native. Later expand to Apple Watch companion app.

---

## Key Numbers & Specifications

| Aspect                        | Specification                                |
| ----------------------------- | -------------------------------------------- |
| **Model Input Size**          | 60 features (from 10 sensors × 6 dimensions) |
| **Model Output**              | 5 stroke classes + confidence score          |
| **Sampling Rate**             | 10-100 Hz (configurable)                     |
| **Inference Latency**         | 50-100ms per prediction                      |
| **Model Size**                | 2-3 MB (TensorFlow Lite)                     |
| **Dataset Size**              | 2,010 samples                                |
| **Battery Impact**            | ~10% per 60-minute session                   |
| **Stroke Detection Accuracy** | ~92-96% (estimated)                          |
| **App Size**                  | ~40-50 MB                                    |

---

## Technology Stack Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    MOBILE APP (React Native)                │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────┐    │
│  │   Sensor   │→ │ Preprocess  │→ │  TFLite Inference│    │
│  │ Collection │  │  & Feature  │  │  (On-Device ML)  │    │
│  │            │  │ Extraction  │  │                  │    │
│  └────────────┘  └─────────────┘  └──────────────────┘    │
│       ↓                                      ↓              │
│   Accelerometer  ┌────────────────────┐  Current Stroke    │
│   Gyroscope      │    Local SQLite    │  Confidence        │
│   Heart Rate     │    Database        │  Session Data      │
│   Camera Feed    └────────────────────┘  Efficiency Score  │
└─────────────────────────────────────────────────────────────┘
                           ↓
                  (Optional: Cloud Sync)
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                 BACKEND (Optional - FastAPI)               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  PostgreSQL  │  │   Analytics  │  │  User Mgmt   │     │
│  │  Database    │  │  Engine      │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## File Manifest - What Gets Created

### Training Phase

```
stroke_classification_model.h5       ← Full Keras model
stroke_classification_model.tflite   ← Mobile-optimized (USE THIS IN APP)
scaler.pkl                           ← Data normalization for new data
label_encoder.pkl                    ← Stroke type encoding
training_history.png                 ← Performance visualization
confusion_matrix.png                 ← Per-class accuracy breakdown
```

### App Phase

```
SwimTrackerApp/
├── stroke_classification_model.tflite
├── front_POV_model.tflite (converted from .h5)
├── top_POV_model.tflite   (converted from .h5)
├── side_POV_model.tflite  (converted from .h5)
├── src/
│   ├── services/modelService.js (loads & runs TFLite)
│   ├── services/sensorService.js (collects IMU data)
│   ├── services/storageService.js (saves sessions)
│   ├── screens/SessionScreen.js (main UI)
│   ├── utils/featureExtraction.js (preprocessing)
│   └── utils/efficiency.js (your algorithm)
└── package.json
```

---

## Development Timeline

| Week  | Phase         | Tasks                                        | Deliverable               |
| ----- | ------------- | -------------------------------------------- | ------------------------- |
| 1-2   | Training      | Prepare data, train model, validate accuracy | `.tflite` model file      |
| 3     | Foundation    | Set up React Native, integrate TFLite        | Sensor → Model pipeline   |
| 4     | Core Features | Session management, real-time tracking       | Live stroke detection     |
| 5     | Enhancement   | Efficiency scoring, data persistence         | Complete session tracking |
| 6     | Polish        | UI/UX, settings, history                     | MVP ready                 |
| 7-8   | Advanced      | Camera integration, heart rate, cloud sync   | Feature-complete app      |
| 9-10  | Testing       | User validation, bug fixes, optimization     | Production-ready          |
| 11-12 | Launch        | App Store submission, marketing              | Published app             |

---

## Risk Mitigation

### Data Quality ✅ (MANAGED)

- Your dataset is clean and balanced
- Pre-split into train/val/test to avoid leakage

### Model Accuracy (MANAGEABLE)

- Can improve with more data collection
- Ensemble approach with vision models
- Continuous retraining on user feedback

### Device Constraints (PLANNED)

- TensorFlow Lite designed for mobile
- Model size is small (~3MB)
- Can reduce sampling rate if battery drain is high

### User Privacy (IMPORTANT)

- All processing happens on-device
- Optional cloud sync with user consent
- Comply with GDPR/CCPA if needed

---

## Success Metrics

When your app is live, measure:

| Metric                       | Target             | How to Measure                         |
| ---------------------------- | ------------------ | -------------------------------------- |
| Stroke Detection Accuracy    | >90%               | Compare with video ground truth        |
| User Session Count           | 10+ per user/month | Analytics dashboard                    |
| Average Session Duration     | 20+ minutes        | App telemetry                          |
| Battery Drain                | <10% per hour      | Device metrics                         |
| App Crash Rate               | <0.1%              | Firebase Crashlytics                   |
| User Retention               | >60% at 30 days    | Firebase Analytics                     |
| Efficiency Score Correlation | r > 0.8            | Validate against biomechanics research |

---

## What You'll Learn

✅ Production ML system design
✅ Mobile app development (React Native)
✅ Sensor data processing & signal analysis
✅ Real-time ML inference optimization
✅ iOS/Android app submission
✅ Wearable device integration
✅ Business aspects (monetization, user retention)

---

## Potential Extensions (Future)

1. **Apple Watch App** - Companion with wrist notifications
2. **AI Coach** - Personalized feedback based on technique
3. **Team Features** - Group training sessions
4. **Wearable SDK** - For other smart devices
5. **Research Dataset** - Anonymized data for swimming science
6. **Professional Integration** - Coaching tools for trainers
7. **Virtual Competitions** - Social multiplayer racing

---

## Files You Should Review Now

1. **WEARABLE_APP_DESIGN.md** - High-level strategy (you are here)
2. **IMPLEMENTATION_GUIDE.md** - Detailed development walkthrough
3. **train_stroke_model.py** - Model training code (ready to run)
4. **app_starter_template.js** - React Native boilerplate
5. **analyze_dataset.py** - Dataset exploration

---

## Quick Start Commands

```bash
# Prepare training environment
pip install tensorflow pandas scikit-learn matplotlib seaborn joblib

# Train the model
python3 train_stroke_model.py
# → generates stroke_classification_model.tflite

# Set up React Native environment
npm install -g expo-cli
npx create-expo-app SwimTrackerApp
cd SwimTrackerApp
npm install expo-sensors expo-file-system axios

# Start development
expo start
# → Scan QR code with Expo Go app to test on phone
```

---

## Final Thoughts

Your project is well-positioned for success:

- ✅ Quality dataset collected and clean
- ✅ Clear business case (help swimmers improve)
- ✅ Existing models for technique analysis
- ✅ Technology stack mature and proven

The key now is execution. Start with Phase 1 (training) this week, and you'll have a working prototype in 6-8 weeks.

**You've got this! 🏊‍♂️**

---

## Contact & Support

For TensorFlow/ML questions: https://stackoverflow.com/questions/tagged/tensorflow
For React Native: https://reactnative.dev/docs/getting-started
For Expo: https://docs.expo.dev/

Questions about this project structure? Review the other markdown files in this directory.
