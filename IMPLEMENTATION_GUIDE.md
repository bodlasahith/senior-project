# Implementation Guide: Swimming Stroke Recognition Wearable App

## Quick Summary of Your Project

### What You Have

✅ **2,010 labeled samples** with IMU data from 10 sensors (accelerometer + gyroscope)
✅ **5 stroke types** (Freestyle, Backstroke, Breaststroke, Butterfly, Front Crawl)
✅ **3 pre-trained vision models** for technique assessment (front, top, side POV)
✅ **Head position tracking** data for visual analysis
✅ **Stroke probability scores** indicating confidence

### What You Need to Build

🔨 **Mobile app** to collect sensor data in real-time
🔨 **ML model** trained on your new dataset for stroke recognition
🔨 **REST API** for backend processing (optional but recommended)
🔨 **Dashboard/Analytics** to track progress and efficiency

---

## Phase 1: Data Preparation & Model Training (2-3 weeks)

### Step 1: Prepare Your Dataset

```bash
# Check if dataset is clean
python3 analyze_dataset.py

# You've already done this - dataset has:
# - 2,010 samples ✓
# - No missing values ✓
# - Balanced classes ✓
```

### Step 2: Train Your Stroke Classification Model

```bash
# Install dependencies
pip install tensorflow pandas scikit-learn matplotlib seaborn joblib

# Run the training script
python3 train_stroke_model.py
```

**This will generate:**

- `stroke_classification_model.h5` - Full Keras model
- `stroke_classification_model.tflite` - Mobile-optimized model (~2-3 MB)
- `scaler.pkl` - Data normalization object
- `label_encoder.pkl` - Stroke type encoding
- `training_history.png` - Performance visualization
- `confusion_matrix.png` - Per-class accuracy

### Step 3: Understand the Model Architecture

The training script provides 4 model options:

| Model              | Best For                 | Mobile Friendly | Latency   |
| ------------------ | ------------------------ | --------------- | --------- |
| Dense Network      | Quick baseline           | ✅              | <50ms     |
| LSTM               | Temporal patterns        | ⚠️              | 100-200ms |
| 1D CNN             | Local feature extraction | ✅              | 50-100ms  |
| Hybrid (CNN+Dense) | **Best overall**         | ✅              | 50-100ms  |

**Recommendation:** Use Hybrid model - best accuracy/speed tradeoff for wearables.

### Step 4: Convert for Mobile Deployment

The training script automatically converts to TensorFlow Lite format:

```python
# stroke_classification_model.tflite is ready for your app
# File size: ~1-3 MB (perfect for mobile)
# Inference time: 50-100ms per prediction
```

---

## Phase 2: Backend API Setup (1-2 weeks)

### Option A: Simple Local Processing (Recommended for MVP)

Process all data **on-device** in React Native:

- No server required
- Better privacy
- Offline capability
- Faster response

### Option B: Cloud Backend (For Production)

If you need:

- Historical data analytics
- Multi-user support
- Advanced coaching algorithms
- Leaderboards

**Tech Stack:**

```
Backend: FastAPI (Python) or Node.js/Express
Database: PostgreSQL (cloud) or MongoDB
Hosting: AWS Lambda, Google Cloud Run, or Heroku
```

**Basic API Endpoints:**

```
POST   /api/sessions          - Create new session
POST   /api/sessions/{id}/data - Add sensor reading
GET    /api/sessions/{id}     - Get session details
GET    /api/sessions          - List all sessions
POST   /api/predictions       - Get stroke prediction
GET    /api/analytics         - User statistics
```

---

## Phase 3: React Native Mobile App (3-4 weeks)

### Prerequisites

```bash
# Install Node.js 18+ and npm
node --version  # v18+
npm --version   # 9+

# Install Expo CLI
npm install -g expo-cli

# Create React Native project
npx create-expo-app SwimTrackerApp
cd SwimTrackerApp
```

### Step 1: Install Dependencies

```bash
npm install \
  expo-sensors \
  expo-file-system \
  @tensorflow/tfjs \
  @tensorflow-models/coco-ssd \
  react-native-svg \
  @react-navigation/native @react-navigation/bottom-tabs \
  react-native-screens react-native-safe-area-context \
  sqlite3 \
  axios

# For TensorFlow Lite support
npm install react-native-tflite-react-native
```

### Step 2: Project Structure

```
SwimTrackerApp/
├── src/
│   ├── screens/
│   │   ├── HomeScreen.js          # Main dashboard
│   │   ├── SessionScreen.js       # Active session
│   │   ├── HistoryScreen.js       # Past sessions
│   │   └── SettingsScreen.js      # App settings
│   ├── services/
│   │   ├── sensorService.js       # IMU data collection
│   │   ├── modelService.js        # TFLite inference
│   │   ├── storageService.js      # Local database
│   │   └── apiService.js          # Backend calls (optional)
│   ├── components/
│   │   ├── StrokeDetector.js      # Detection logic
│   │   ├── SessionStats.js        # UI components
│   │   └── Chart.js               # Visualization
│   ├── utils/
│   │   ├── constants.js           # Configuration
│   │   ├── featureExtraction.js   # Signal processing
│   │   └── efficiency.js          # Your algorithm
│   ├── models/
│   │   └── stroke_classification_model.tflite  # ML model
│   └── App.js                     # Root component
├── package.json
└── app.json
```

### Step 3: Core Implementation

#### A. Sensor Data Collection (`src/services/sensorService.js`)

```javascript
import { Accelerometer, Gyroscope } from "expo-sensors";

export const startSensorCollection = (callback) => {
  Accelerometer.setUpdateInterval(100); // 10 Hz
  Gyroscope.setUpdateInterval(100);

  Accelerometer.addListener((data) => {
    callback({
      type: "accelerometer",
      x: data.x,
      y: data.y,
      z: data.z,
      timestamp: Date.now(),
    });
  });

  Gyroscope.addListener((data) => {
    callback({
      type: "gyroscope",
      x: data.x,
      y: data.y,
      z: data.z,
      timestamp: Date.now(),
    });
  });
};
```

#### B. Model Inference (`src/services/modelService.js`)

```javascript
import Tflite from "react-native-tflite";

export class StrokeClassifier {
  async loadModel() {
    const modelPath = require("../models/stroke_classification_model.tflite");
    await Tflite.loadModel({
      model: modelPath,
      labels: ["Freestyle", "Backstroke", "Breaststroke", "Butterfly", "Front Crawl"],
    });
  }

  async predict(features) {
    // features is a normalized array of 60 values
    // (from 10 IMU sensors × 6 dimensions each)

    const result = await Tflite.runModelOnArray({
      input: [features],
      output_dtype: "UINT8",
    });

    return {
      stroke: result.predicted_class,
      confidence: result.confidence,
      allProbabilities: result.output,
    };
  }
}
```

#### C. Data Preprocessing (`src/utils/featureExtraction.js`)

```javascript
export const extractFeatures = (accBuffer, gyroBuffer) => {
  const features = [];

  // For each sensor, calculate 12 features (mean, std, min, max per axis)
  // This needs to match your model's input shape

  // Flatten 10 sensors × 6 features = 60 features
  for (let i = 0; i < accBuffer.length; i++) {
    features.push(accBuffer[i].x);
    features.push(accBuffer[i].y);
    features.push(accBuffer[i].z);
    features.push(gyroBuffer[i].x);
    features.push(gyroBuffer[i].y);
    features.push(gyroBuffer[i].z);
  }

  return normalizeFeatures(features);
};

export const normalizeFeatures = (features) => {
  // Load your scaler.pkl values and normalize
  // This ensures features match training distribution
  return features.map((f) => (f - mean) / std);
};
```

### Step 4: Session Management

```javascript
// src/services/storageService.js
import SQLite from "sqlite3";

const db = new SQLite.Database(":memory:");

export const saveSession = (sessionData) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO sessions (start_time, duration, strokes)
       VALUES (?, ?, ?)`,
      [sessionData.startTime, sessionData.duration, JSON.stringify(sessionData.strokes)],
      function (err) {
        if (err) reject(err);
        resolve(this.lastID);
      },
    );
  });
};

export const getSessions = () => {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM sessions ORDER BY start_time DESC", (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
};
```

---

## Phase 4: Integrating Your Pre-trained Vision Models

### Load the 3 POV Technique Models

```javascript
// src/services/techniqueService.js
import { Camera } from "expo-camera";
import Tflite from "react-native-tflite";

export class TechniqueAnalyzer {
  async loadModels() {
    // Load all 3 pre-trained models
    this.frontModel = await this.loadModel("front_POV_model.h5");
    this.topModel = await this.loadModel("top_POV_model.h5");
    this.sideModel = await this.loadModel("side_POV_model.h5");
  }

  async analyzeTechnique(frameData, viewPoint) {
    // viewPoint: 'front' | 'top' | 'side'

    const model = this[`${viewPoint}Model`];
    const result = await model.predict(frameData);

    return {
      viewPoint,
      quality: result.class, // 0=Satisfactory, 1=Needs Improvement, 2=Unidentifiable
      confidence: result.confidence,
    };
  }
}
```

### Video Integration in Session Screen

```javascript
// src/screens/SessionScreen.js
import { Camera } from "expo-camera";

export function SessionScreen() {
  const [cameraActive, setCameraActive] = useState(false);

  return (
    <View>
      {cameraActive && (
        <Camera
          style={{ flex: 1, height: 200 }}
          onFrameAvailable={(frame) => {
            // Analyze frame with technique model
            analyzeFrame(frame);
          }}
        />
      )}
      <TouchableOpacity onPress={() => setCameraActive(!cameraActive)}>
        <Text>{cameraActive ? "📹 Stop Camera" : "📹 Start Technique Analysis"}</Text>
      </TouchableOpacity>
    </View>
  );
}
```

---

## Phase 5: Efficiency Score Calculation

### Integrate Your Original Algorithm

```javascript
// src/utils/efficiency.js - Adapted from your old code

export const calculateEfficiency = (strokeData) => {
  // Your work input/output algorithm

  let workInput = 0; // Energy expended
  let workOutput = 0; // Useful swimming distance

  // Parse sensor data to calculate metrics
  for (const stroke of strokeData.strokes) {
    workInput += calculateEnergyExpenditure(stroke);
    workOutput += calculateUsefulWork(stroke);
  }

  const efficiency = (workOutput / workInput) * 100.0;

  // Provide feedback based on efficiency score
  if (efficiency < 3) {
    return {
      score: efficiency,
      feedback: "Don't worry! Most humans aren't optimized for swimming. Focus on form!",
      level: "Beginner",
    };
  } else if (efficiency < 7) {
    return {
      score: efficiency,
      feedback: "Good progress! You're improving your technique.",
      level: "Intermediate",
    };
  } else {
    return {
      score: efficiency,
      feedback: "Excellent! You're swimming with great efficiency!",
      level: "Advanced",
    };
  }
};

const calculateEnergyExpenditure = (stroke) => {
  // Use accelerometer magnitudes to estimate energy
  const acc = stroke.features;
  const magnitude = Math.sqrt(acc[0] ** 2 + acc[1] ** 2 + acc[2] ** 2);
  return magnitude; // Simplified
};

const calculateUsefulWork = (stroke) => {
  // Use gyroscope rotations + movement in forward direction
  return stroke.features[6]; // Gyro magnitude
};
```

---

## Testing & Validation

### Unit Tests

```bash
npm install --save-dev jest @testing-library/react-native

# Run tests
npm test
```

### Integration Testing

```javascript
// __tests__/modelService.test.js
describe("StrokeClassifier", () => {
  it("should classify freestyle stroke", async () => {
    const classifier = new StrokeClassifier();
    await classifier.loadModel();

    const features = generateMockFreestyleData();
    const result = await classifier.predict(features);

    expect(result.stroke).toBe("Freestyle");
    expect(result.confidence).toBeGreaterThan(0.7);
  });
});
```

### Real-World Testing

```
1. Test with actual swimmers in pool
2. Collect feedback on accuracy
3. Validate efficiency scores against known metrics
4. Test battery drain over 1-hour session
5. Verify data persistence and sync
```

---

## Deployment Checklist

### Android

- [ ] Build APK: `eas build --platform android`
- [ ] Test on physical device
- [ ] Publish to Google Play Store

### iOS

- [ ] Build IPA: `eas build --platform ios`
- [ ] Test on physical device
- [ ] Submit to Apple App Store

### Pre-Release

- [ ] Battery optimization (sensor sampling rates)
- [ ] Memory profiling
- [ ] Offline functionality
- [ ] Data encryption for privacy
- [ ] HIPAA compliance if needed (health data)

---

## Performance Targets

| Metric        | Target        | Current Status               |
| ------------- | ------------- | ---------------------------- |
| Model latency | <100ms        | Pending (after training)     |
| Sampling rate | 10-100 Hz     | Configurable                 |
| Battery drain | <10% per hour | Pending (after optimization) |
| Accuracy      | >90%          | Pending (after training)     |
| App size      | <50 MB        | Pending (after build)        |

---

## File Structure After Implementation

```
SwimTrackerApp/
├── src/
│   ├── screens/
│   │   ├── HomeScreen.js .............. ✅ Dashboard with stats
│   │   ├── SessionScreen.js ........... ✅ Live tracking UI
│   │   ├── HistoryScreen.js ........... ✅ Past sessions
│   │   └── SettingsScreen.js .......... ✅ User preferences
│   ├── services/
│   │   ├── sensorService.js ........... ✅ IMU data collection
│   │   ├── modelService.js ............ ✅ TFLite inference
│   │   ├── storageService.js .......... ✅ Local database
│   │   ├── techniqueService.js ........ ✅ Vision models
│   │   └── apiService.js ............. ⏳ Backend integration
│   ├── components/
│   │   ├── StrokeDetector.js .......... ✅ Detection logic
│   │   ├── SessionStats.js ............ ✅ UI components
│   │   └── Chart.js ................... ✅ Graphs
│   ├── utils/
│   │   ├── featureExtraction.js ....... ✅ Signal processing
│   │   ├── efficiency.js .............. ✅ Your algorithm
│   │   └── constants.js ............... ✅ Config
│   ├── models/
│   │   ├── stroke_classification_model.tflite ✅ Main model
│   │   ├── front_POV_model.tflite ..... ⏳ Convert from H5
│   │   ├── top_POV_model.tflite ....... ⏳ Convert from H5
│   │   └── side_POV_model.tflite ...... ⏳ Convert from H5
│   └── App.js .......................... ✅ Root
├── backend/
│   ├── app.py .......................... ⏳ FastAPI server
│   ├── models.py ....................... ⏳ Database models
│   └── routes.py ....................... ⏳ API endpoints
├── README.md ............................ ✅ Documentation
└── package.json ......................... ✅ Dependencies
```

---

## Next Steps

1. **This Week:** Run training script, validate model accuracy
2. **Next Week:** Set up React Native project, implement sensor collection
3. **Week 3:** Connect model to app, test real-time predictions
4. **Week 4:** Add history, analytics, and efficiency scoring
5. **Week 5-6:** Integrate vision models and camera
6. **Week 7-8:** Polish UI/UX, prepare for launch

---

## Support Resources

- **TensorFlow Lite Docs:** https://www.tensorflow.org/lite/guide
- **React Native Sensors:** https://docs.expo.dev/versions/latest/sdk/sensors/
- **Expo Guide:** https://docs.expo.dev/
- **Swimming Biomechanics:** Research papers on stroke kinematics

---

## Questions?

This guide should cover 90% of your implementation. Key areas to customize:

- Feature extraction (match your model's input shape)
- Efficiency score algorithm (adapt your original code)
- UI/UX design (make it engaging for swimmers)
- Backend choice (local-only vs cloud)

Good luck with your swimming app! 🏊‍♂️
