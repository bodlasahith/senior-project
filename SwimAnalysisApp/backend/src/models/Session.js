/**
 * Session Model - Swimming workout session data
 */

const mongoose = require("mongoose");

const strokeSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["Freestyle", "Backstroke", "Breaststroke", "Butterfly", "Front Crawl"],
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    sensorData: {
      accelerometer: [[Number]], // Array of [x, y, z] readings
      gyroscope: [[Number]], // Array of [x, y, z] readings
    },
    features: [Number], // 60-dimensional feature vector
    allPredictions: {
      type: Map,
      of: Number, // Confidence scores for all stroke types
    },
    duration: Number, // milliseconds
    distance: Number, // estimated meters
  },
  { _id: true },
);

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    startTime: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endTime: {
      type: Date,
    },
    duration: {
      type: Number, // seconds
      required: true,
    },
    strokes: [strokeSchema],
    summary: {
      totalStrokes: {
        type: Number,
        default: 0,
      },
      strokeCounts: {
        Freestyle: { type: Number, default: 0 },
        Backstroke: { type: Number, default: 0 },
        Breaststroke: { type: Number, default: 0 },
        Butterfly: { type: Number, default: 0 },
        "Front Crawl": { type: Number, default: 0 },
      },
      averageConfidence: {
        type: Number,
        min: 0,
        max: 1,
      },
      dominantStroke: String,
      distance: Number, // meters
      avgPace: Number, // seconds per 100m
      calories: Number, // estimated calories burned
    },
    efficiency: {
      score: {
        type: Number,
        min: 0,
        max: 100,
      },
      workInput: Number,
      workOutput: Number,
      level: {
        type: String,
        enum: ["Beginner", "Intermediate", "Advanced"],
      },
      feedback: String,
    },
    technique: {
      frontPOV: {
        quality: {
          type: String,
          enum: ["Satisfactory", "Needs Improvement", "Unidentifiable"],
        },
        confidence: Number,
        timestamp: Date,
      },
      topPOV: {
        quality: String,
        confidence: Number,
        timestamp: Date,
      },
      sidePOV: {
        quality: String,
        confidence: Number,
        timestamp: Date,
      },
    },
    environment: {
      location: String,
      poolLength: Number, // meters
      waterTemperature: Number,
      weather: String,
    },
    device: {
      deviceId: String,
      deviceName: String,
      os: String,
      appVersion: String,
    },
    notes: String,
    tags: [String],
    isAnalyzed: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for better query performance
sessionSchema.index({ userId: 1, startTime: -1 });
sessionSchema.index({ "strokes.type": 1 });
sessionSchema.index({ "summary.dominantStroke": 1 });
sessionSchema.index({ createdAt: -1 });

// Calculate session summary before saving
sessionSchema.pre("save", function (next) {
  if (this.isModified("strokes") && this.strokes.length > 0) {
    // Calculate total strokes
    this.summary.totalStrokes = this.strokes.length;

    // Count each stroke type
    this.summary.strokeCounts = {
      Freestyle: 0,
      Backstroke: 0,
      Breaststroke: 0,
      Butterfly: 0,
      "Front Crawl": 0,
    };

    let totalConfidence = 0;
    this.strokes.forEach((stroke) => {
      this.summary.strokeCounts[stroke.type] += 1;
      totalConfidence += stroke.confidence;
    });

    // Calculate average confidence
    this.summary.averageConfidence = totalConfidence / this.strokes.length;

    // Find dominant stroke
    let maxCount = 0;
    Object.entries(this.summary.strokeCounts).forEach(([stroke, count]) => {
      if (count > maxCount) {
        maxCount = count;
        this.summary.dominantStroke = stroke;
      }
    });

    this.isAnalyzed = true;
  }

  next();
});

// Method to calculate efficiency
sessionSchema.methods.calculateEfficiency = function () {
  // Implementation of your original algorithm
  if (!this.strokes || this.strokes.length === 0) {
    return null;
  }

  let workInput = 0;
  let workOutput = 0;

  this.strokes.forEach((stroke) => {
    // Energy expenditure (simplified)
    if (stroke.sensorData && stroke.sensorData.accelerometer) {
      const acc = stroke.sensorData.accelerometer;
      workInput += acc.reduce((sum, reading) => {
        const magnitude = Math.sqrt(reading[0] ** 2 + reading[1] ** 2 + reading[2] ** 2);
        return sum + magnitude;
      }, 0);
    }

    // Useful work (simplified)
    if (stroke.sensorData && stroke.sensorData.gyroscope) {
      const gyro = stroke.sensorData.gyroscope;
      workOutput += gyro.reduce((sum, reading) => {
        return sum + Math.abs(reading[0]); // Forward rotation
      }, 0);
    }
  });

  const efficiency = workInput > 0 ? (workOutput / workInput) * 100 : 0;

  // Determine level and feedback
  let level, feedback;
  if (efficiency < 3) {
    level = "Beginner";
    feedback = "Don't worry! Most humans aren't optimized for swimming. Focus on form!";
  } else if (efficiency < 7) {
    level = "Intermediate";
    feedback = "Good progress! You're improving your technique.";
  } else {
    level = "Advanced";
    feedback = "Excellent! You're swimming with great efficiency!";
  }

  this.efficiency = {
    score: efficiency,
    workInput,
    workOutput,
    level,
    feedback,
  };

  return this.efficiency;
};

module.exports = mongoose.model("Session", sessionSchema);
