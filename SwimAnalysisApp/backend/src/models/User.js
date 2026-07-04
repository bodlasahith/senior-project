/**
 * User Model - MongoDB Schema
 */

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [30, "Username cannot exceed 30 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false, // Don't return password by default
    },
    profile: {
      firstName: {
        type: String,
        trim: true,
      },
      lastName: {
        type: String,
        trim: true,
      },
      age: {
        type: Number,
        min: [1, "Age must be positive"],
        max: [120, "Age must be realistic"],
      },
      weight: {
        type: Number,
        min: [1, "Weight must be positive"],
      },
      height: {
        type: Number,
        min: [1, "Height must be positive"],
      },
      experienceLevel: {
        type: String,
        enum: ["Beginner", "Intermediate", "Advanced", "Professional"],
        default: "Beginner",
      },
      avatar: {
        type: String, // URL to profile image
      },
    },
    goals: {
      targetDistance: Number, // meters
      targetTime: Number, // seconds
      preferredStroke: {
        type: String,
        enum: ["Freestyle", "Backstroke", "Breaststroke", "Butterfly", "Front Crawl"],
      },
    },
    statistics: {
      totalSessions: {
        type: Number,
        default: 0,
      },
      totalStrokes: {
        type: Number,
        default: 0,
      },
      totalDistance: {
        type: Number,
        default: 0,
      },
      averageEfficiency: {
        type: Number,
        default: 0,
      },
      bestEfficiency: {
        type: Number,
        default: 0,
      },
      favoriteStroke: String,
    },
    devices: [
      {
        deviceId: String,
        deviceName: String,
        lastSync: Date,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual for full name
userSchema.virtual("fullName").get(function () {
  if (this.profile.firstName && this.profile.lastName) {
    return `${this.profile.firstName} ${this.profile.lastName}`;
  }
  return this.username;
});

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to update statistics
userSchema.methods.updateStatistics = function (sessionData) {
  this.statistics.totalSessions += 1;
  this.statistics.totalStrokes += sessionData.totalStrokes || 0;
  this.statistics.totalDistance += sessionData.distance || 0;

  // Update average efficiency
  const totalEfficiency = this.statistics.averageEfficiency * (this.statistics.totalSessions - 1);
  this.statistics.averageEfficiency =
    (totalEfficiency + (sessionData.efficiency || 0)) / this.statistics.totalSessions;

  // Update best efficiency
  if (sessionData.efficiency > this.statistics.bestEfficiency) {
    this.statistics.bestEfficiency = sessionData.efficiency;
  }

  return this.save();
};

module.exports = mongoose.model("User", userSchema);
