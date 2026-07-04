# Swimming Stroke Recognition App - Wearable Device Implementation

## Dataset Analysis

### Data Overview

- **2,010 samples** from real swimming sessions
- **60 IMU (Inertial Measurement Unit) features** - 10 sensors × 6 readings each
  - 3-axis accelerometer (acc_x, acc_y, acc_z) per sensor
  - 3-axis gyroscope (gyro_x, gyro_y, gyro_z) per sensor
- **2 visual features** - Head position tracking (head_x, head_y)
- **1 confidence score** - stroke_prob (0-1 range indicating stroke detection confidence)
- **1 target label** - Stroke type classification

### Stroke Types Supported

1. **Freestyle** (413 samples) - Most common
2. **Backstroke** (410 samples)
3. **Breaststroke** (409 samples)
4. **Butterfly** (409 samples)
5. **Front Crawl** (369 samples)

### Data Quality

- ✅ **Zero missing values** - Complete dataset
- ✅ **Balanced distribution** - Fairly even across all stroke types
- ✅ **Real-world data** - From actual swimming sessions

### Pre-trained Models Available

Three trained CNN models for **visual-based stroke technique classification**:

- **Side POV (Point of View)** - 2.3M parameters
- **Front POV** - 2.3M parameters
- **Top POV** - 2.3M parameters

Each model classifies technique as:

- 0: Satisfactory Technique
- 1: Technique Needs Improvement
- 2: Extraneous/Unidentifiable

---

## Wearable Device App Architecture

### Hardware Requirements

#### Option 1: **Apple Watch** (Recommended for Simplicity)

**Advantages:**

- Native accelerometer & gyroscope (6-axis IMU)
- Built-in swimming metrics (WatchOS detects pool/open water)
- Heart rate monitor (HealthKit integration)
- GPS (for open water swimming)
- Always with user
- Easy app distribution via App Store

**Limitations:**

- Single sensor (can't capture full 10-sensor setup)
- Would need multiple watches to replicate full system

#### Option 2: **Smart Bracelet** (e.g., Xiaomi Mi Band)

**Advantages:**

- Multiple IMU sensors possible
- Heart rate monitor
- Swimming-proof design
- Lightweight

**Limitations:**

- Limited processing power
- App ecosystem more restricted

#### Option 3: **Waterproof Mobile Phone** (Best Multi-Modal Approach)

**Advantages:**

- Can use:
  - Phone accelerometer/gyroscope
  - Phone camera (for technique classification via pre-trained models)
  - Heart rate via camera (photoplethysmography)
  - GPS/mapping for swimming location
  - Touchscreen for interface
- Most processing power
- Can pair with Bluetooth wearables for additional sensors

**Limitations:**

- Bulkier for swimming
- Water resistance varies by model

---

## Recommended Implementation Strategy

### Phase 1: Mobile App MVP (6-8 weeks)

**Platform:** React Native or Flutter for cross-platform compatibility

**Features:**

1. **Sensor Data Collection**
   - Read accelerometer/gyroscope from phone
   - Collect at ~50-100Hz (typical sampling rate)
   - Segment into swimming sessions (detect water entry)

2. **Stroke Recognition Model**
   - Convert dataset to TensorFlow Lite or ONNX format
   - Deploy lightweight neural network on device
   - Real-time prediction (< 100ms latency)

3. **Basic UI**
   - Live session timer
   - Current stroke type display
   - Stroke count per session
   - Efficiency metrics (from your old algorithm)

4. **Data Storage**
   - Local database (SQLite/Realm)
   - Cloud sync optional (Firebase/AWS)

### Phase 2: Enhanced Features (8-12 weeks)

1. **Heart Rate Integration**
   - Read from phone's camera (optical method)
   - Or Bluetooth connection to HR monitor
   - Calculate training zones

2. **Technique Analysis**
   - Integrate pre-trained vision models
   - Use phone camera for video capture
   - Real-time technique feedback (satisfactory/needs improvement)

3. **Biomechanical Metrics**
   - Distance estimation (GPS + stroke count)
   - Pace calculation
   - Energy expenditure estimation
   - Efficiency score from your algorithm

4. **Social Features**
   - Session sharing
   - Friends comparison
   - Progress tracking

### Phase 3: Advanced (Optional)

1. **Wearable Integration**
   - Apple Watch app with Bluetooth pairing
   - Real-time wrist notifications
   - Offload heavy processing to phone

2. **AI Coaching**
   - Personalized technique recommendations
   - Workout plans based on performance

3. **External Sensor Support**
   - Connect to full 10-sensor IMU setup (Bluetooth)
   - Research-grade data collection

---

## Technical Stack Recommendation

### Backend

- **Framework:** FastAPI (Python) or Node.js/Express
- **ML Model Serving:** TensorFlow Lite, ONNX Runtime
- **Database:** PostgreSQL (cloud) + local SQLite
- **Cloud Hosting:** AWS Lambda, Google Cloud Run, or Azure Functions

### Mobile Frontend

- **Framework:** React Native (JavaScript/TypeScript)
  - Works on iOS & Android
  - Good ML ecosystem (TensorFlow.js, ONNX.js)
- **State Management:** Redux or Zustand
- **UI Framework:** React Native Paper or Expo
- **Local ML:** TensorFlow Lite for React Native

### Data Processing Pipeline

```
Sensor Data → Preprocessing → Segmentation → Model Inference → Output
    ↓            ↓               ↓              ↓               ↓
 Collect    Normalize      Extract         Classify        Display
 Raw IMU    + Smooth      Features       Stroke Type      Results
```

---

## Model Retraining with New Dataset

### Steps to Train Your Models

1. **Data Preparation**

   ```
   - Split: 70% train, 15% validation, 15% test
   - Normalize IMU features (standardization)
   - Create sequences (sliding window approach)
   - Address class imbalance if needed
   ```

2. **Model Architecture Recommendations**
   - **For IMU data:** 1D CNN + LSTM (capture temporal patterns)
   - **For image data:** Continue using your existing pre-trained models
   - **Hybrid approach:** Ensemble both sensor + vision models

3. **Training Parameters**
   - Batch size: 32-64
   - Learning rate: 0.001
   - Epochs: 50-100
   - Loss: Cross-entropy for multi-class classification

4. **Evaluation Metrics**
   - Accuracy, Precision, Recall, F1-score per stroke class
   - Confusion matrix
   - ROC-AUC curves

---

## Data Extraction from App

### What Your App Can Collect

| Data Type                   | Source                     | Frequency | Use Case                 |
| --------------------------- | -------------------------- | --------- | ------------------------ |
| Acceleration                | Phone IMU                  | 50-100Hz  | Stroke phase detection   |
| Rotation (Angular Velocity) | Phone Gyro                 | 50-100Hz  | Rotation analysis        |
| Heart Rate                  | Phone camera or HR monitor | 1-2Hz     | Training zone            |
| Video frames                | Phone camera               | 30fps     | Technique classification |
| GPS coordinates             | Phone GPS                  | 1Hz       | Distance, route mapping  |
| Timestamp                   | System clock               | Real-time | Session logging          |

### Sensor Calibration

- IMU readings typically range: ±2g to ±16g (accelerometer), ±250 to ±2000 °/s (gyroscope)
- Requires calibration for underwater use (water refraction affects some sensors)

---

## MVP Timeline & Roadmap

### Week 1-2: Foundation

- [ ] Set up React Native project
- [ ] Integrate TensorFlow Lite for stroke recognition
- [ ] Create sensor data collection module
- [ ] Build basic UI skeleton

### Week 3-4: Core Features

- [ ] Train your model on new dataset
- [ ] Implement real-time stroke classification
- [ ] Add session storage
- [ ] Session start/stop functionality

### Week 5-6: Data Processing

- [ ] Implement data normalization
- [ ] Add statistics calculation (stroke count, duration)
- [ ] Integration with efficiency algorithm

### Week 7-8: Polish & Testing

- [ ] User testing with swimmers
- [ ] Performance optimization
- [ ] App Store submission prep
- [ ] Documentation

---

## Key Advantages of This Approach

✅ **Wearable-friendly** - Low power consumption on mobile devices
✅ **Privacy-first** - On-device processing, minimal cloud dependency
✅ **Real-time feedback** - Instant stroke recognition and feedback
✅ **Expandable** - Can add more sensors or features later
✅ **Data-driven** - Use your 2,010 samples for training
✅ **Proven models** - Leverage your existing pre-trained vision models
✅ **Multi-modal** - Combines sensor + vision for robust predictions

---

## Next Steps

1. **Retrain your models** on the new dataset with improved architecture
2. **Create a training script** that converts models to mobile-friendly format
3. **Build the React Native app skeleton** with TensorFlow Lite integration
4. **Prototype sensor data collection** on a test device
5. **Validate real-world performance** with actual swimmers

Would you like me to start implementing any of these components?
