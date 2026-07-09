/**
 * EfficiencyCalculator v2.0 — Research-Backed Swimming Efficiency
 *
 * Enhanced with data from:
 * - Zhang et al. (2026): Dynamic propulsion force model based on stroke frequency
 * - Zamparo et al. (2012): Efficiency benchmarks (η_D = 3-9%)
 * - Capelli et al. (1998): Energy cost coefficients by stroke
 * - Holmér (1974): Swimming-specific VO₂ model
 * - Frontiers Physiol. (2023): Stroke rate / physiological relationships
 *
 * Key improvements over v1.0:
 * 1. Dynamic drag force that varies with stroke frequency (not flat constants)
 * 2. Per-user HR→VO₂ calibration from a 2-point test swim
 * 3. Per-lap efficiency tracking for fatigue onset detection
 * 4. Stroke frequency optimization (detects diminishing returns)
 * 5. Multiple VO₂ estimation models with accuracy ratings
 */

import {
  PROPULSION_FORCE_MODEL,
  ENERGY_COST_COEFFICIENTS,
  HR_VO2_MODELS,
  EFFICIENCY_BENCHMARKS,
  STROKE_PARAMETERS,
  FATIGUE_MODEL,
  DISTANCE_PER_STROKE,
  METABOLIC,
} from "@/constants/science";

class EfficiencyCalculator {
  constructor() {
    this.userProfile = null;
    this.calibration = null; // personalized HR→VO₂ calibration
    this.lapHistory = []; // per-lap efficiency tracking
  }

  // ─── USER PROFILE ─────────────────────────────────────────────────────────────

  /**
   * Set user profile for personalized calculations
   * @param {Object} profile
   * @param {number} profile.mass - Body mass in kg
   * @param {number} profile.age - Age in years
   * @param {number} profile.restingHR - Resting heart rate (bpm)
   * @param {number} profile.maxHR - Maximum heart rate (bpm), estimated as 220-age if unknown
   * @param {string} profile.level - 'beginner' | 'recreational' | 'competitive' | 'elite'
   */
  setUserProfile(profile) {
    this.userProfile = {
      mass: profile.mass || 70,
      age: profile.age || 30,
      restingHR: profile.restingHR || 60,
      maxHR: profile.maxHR || (220 - (profile.age || 30)),
      level: profile.level || "recreational",
    };
  }

  // ─── HR-TO-VO2 CALIBRATION ────────────────────────────────────────────────────

  /**
   * Calibrate the HR→VO₂ relationship from a 2-point test swim.
   *
   * Protocol: Swimmer does two 100m sets:
   *   1) Easy pace — record avg HR and split time
   *   2) Hard pace — record avg HR and split time
   *
   * We estimate VO₂ from velocity (Holmér model), then fit a personal
   * HR→VO₂ line that's specific to this swimmer.
   *
   * @param {Object} easySet - { avgHR (bpm), time100m (seconds), stroke }
   * @param {Object} hardSet - { avgHR (bpm), time100m (seconds), stroke }
   * @returns {Object} - { slope, intercept, r2_estimate }
   */
  calibrate(easySet, hardSet) {
    const model = HR_VO2_MODELS.velocityBased;
    const mass = this.userProfile?.mass || 70;

    // Calculate velocities
    const v1 = 100 / easySet.time100m; // m/s
    const v2 = 100 / hardSet.time100m;

    // Estimate VO₂ from velocity (Holmér model)
    const strokeType = easySet.stroke || "Freestyle";
    const multiplier = model.strokeMultiplier[strokeType] || 1.0;

    const vo2_1 = (model.slope * v1 + model.intercept) * multiplier * mass; // mL/min
    const vo2_2 = (model.slope * v2 + model.intercept) * multiplier * mass;

    // Fit linear: VO₂ = slope * HR + intercept
    const hr1 = easySet.avgHR;
    const hr2 = hardSet.avgHR;

    if (hr2 === hr1) {
      console.warn("Calibration failed: same HR for both sets");
      return null;
    }

    const slope = (vo2_2 - vo2_1) / (hr2 - hr1);
    const intercept = vo2_1 - slope * hr1;

    this.calibration = { slope, intercept, strokeType, timestamp: Date.now() };

    return {
      slope: Math.round(slope * 100) / 100,
      intercept: Math.round(intercept),
      estimatedVO2Easy: Math.round(vo2_1),
      estimatedVO2Hard: Math.round(vo2_2),
      description: `VO₂ (mL/min) = ${slope.toFixed(2)} × HR + ${intercept.toFixed(0)}`,
    };
  }

  // ─── MAIN EFFICIENCY CALCULATION ──────────────────────────────────────────────

  /**
   * Calculate biomechanical swimming efficiency using research-backed models.
   *
   * @param {Object} params
   * @param {number} params.heartRate - Average heart rate (bpm)
   * @param {number} params.durationSeconds - Session duration in seconds
   * @param {number} params.strokeCount - Total strokes detected
   * @param {string} params.dominantStroke - Primary stroke type
   * @param {number} params.strokeFrequency - Strokes per minute (calculated or measured)
   * @param {number|null} params.distance - Measured distance in meters (null = estimate)
   * @param {number|null} params.poolLength - Pool length for lap detection (25 or 50m)
   * @param {string} params.techniqueQuality - 'satisfactory' | 'needsImprovement' | 'unknown'
   * @returns {Object} - Complete efficiency analysis
   */
  calculate({
    heartRate,
    durationSeconds,
    strokeCount,
    dominantStroke = "Freestyle",
    strokeFrequency = null,
    distance = null,
    poolLength = null,
    techniqueQuality = "unknown",
  }) {
    const mass = this.userProfile?.mass || 70;
    const level = this.userProfile?.level || "recreational";
    const durationMinutes = durationSeconds / 60;

    // Validate inputs
    if (!heartRate || heartRate <= 0) {
      return this._errorResult("Heart rate required for efficiency calculation.");
    }
    if (durationSeconds <= 0) {
      return this._errorResult("Session duration must be > 0.");
    }

    // ─── Step 1: Calculate stroke frequency if not provided
    const sf = strokeFrequency || (strokeCount > 0 ? strokeCount / durationMinutes : 0);

    // ─── Step 2: Estimate distance
    const strokeLength = this._getStrokeLength(dominantStroke, level);
    const estimatedDistance = distance || (strokeCount * strokeLength);
    const avgSpeed = durationSeconds > 0 ? estimatedDistance / durationSeconds : 0;

    // ─── Step 3: Calculate WORK INPUT (metabolic energy)
    const vo2 = this._estimateVO2(heartRate, mass, avgSpeed, dominantStroke);
    // Convert mL O₂/min to Watts: (VO₂ in L/min) × 20.18 kJ/L × (1000/60) = W
    // Or total energy: VO₂ × time × caloric equivalent
    const workInput = (vo2 / 1000) * METABOLIC.O2_CALORIC_EQUIVALENT_KJ * 1000 * durationMinutes; // Joules

    // ─── Step 4: Calculate WORK OUTPUT (useful mechanical work)
    const propulsiveForce = this._estimatePropulsiveForce(dominantStroke, sf, avgSpeed, level);
    const techniqueModifier = this._getTechniqueModifier(techniqueQuality);
    const effectiveForce = propulsiveForce * techniqueModifier;
    const workOutput = effectiveForce * estimatedDistance; // Joules

    // ─── Step 5: Calculate efficiency
    const efficiency = workInput > 0 ? (workOutput / workInput) * 100 : 0;

    // ─── Step 6: Classify and generate feedback
    const classification = this._classifyEfficiency(efficiency, dominantStroke);
    const sfAnalysis = this._analyzeStrokeFrequency(sf, dominantStroke, level, avgSpeed);

    return {
      efficiency: Math.round(efficiency * 1000) / 1000,
      workInput: Math.round(workInput),
      workOutput: Math.round(workOutput),
      level: classification.level,
      feedback: classification.feedback,
      details: {
        heartRate,
        mass,
        durationMinutes: Math.round(durationMinutes * 10) / 10,
        estimatedDistance: Math.round(estimatedDistance),
        avgSpeed: Math.round(avgSpeed * 100) / 100,
        strokeCount,
        strokeFrequency: Math.round(sf * 10) / 10,
        strokeLength: Math.round(strokeLength * 100) / 100,
        dominantStroke,
        techniqueQuality,
        propulsiveForce: Math.round(effectiveForce * 10) / 10,
        vo2_mL_min: Math.round(vo2),
        model: this.calibration ? "calibrated" : "population",
      },
      strokeFrequencyAnalysis: sfAnalysis,
    };
  }

  // ─── PER-LAP EFFICIENCY (FATIGUE DETECTION) ────────────────────────────────

  /**
   * Calculate efficiency for a single lap and track fatigue progression.
   *
   * @param {Object} lapData
   * @param {number} lapData.lapNumber - Sequential lap number
   * @param {number} lapData.heartRate - Average HR during this lap
   * @param {number} lapData.strokeCount - Strokes in this lap
   * @param {number} lapData.lapTime - Time for this lap in seconds
   * @param {number} lapData.distance - Lap distance (e.g., 25 or 50m)
   * @param {string} lapData.stroke - Stroke type for this lap
   * @returns {Object} - Lap efficiency + fatigue analysis
   */
  calculateLapEfficiency(lapData) {
    const lapResult = this.calculate({
      heartRate: lapData.heartRate,
      durationSeconds: lapData.lapTime,
      strokeCount: lapData.strokeCount,
      dominantStroke: lapData.stroke || "Freestyle",
      distance: lapData.distance,
    });

    const lapEntry = {
      lapNumber: lapData.lapNumber,
      efficiency: lapResult.efficiency,
      strokeFrequency: (lapData.strokeCount / lapData.lapTime) * 60,
      strokeLength: lapData.distance / lapData.strokeCount,
      heartRate: lapData.heartRate,
      speed: lapData.distance / lapData.lapTime,
      timestamp: Date.now(),
    };

    this.lapHistory.push(lapEntry);

    // Fatigue analysis
    const fatigueAnalysis = this._analyzeFatigue();

    return {
      ...lapResult,
      lapNumber: lapData.lapNumber,
      fatigue: fatigueAnalysis,
    };
  }

  /**
   * Get complete fatigue analysis across all recorded laps.
   * @returns {Object} - Fatigue indicators and recommendations
   */
  getFatigueReport() {
    return this._analyzeFatigue();
  }

  /**
   * Reset lap history (start new session)
   */
  resetLapHistory() {
    this.lapHistory = [];
  }

  // ─── STROKE FREQUENCY OPTIMIZATION ─────────────────────────────────────────

  /**
   * Analyze whether current stroke frequency is producing good results.
   * Based on Zhang et al. (2026) finding that freestyle speed peaked at 80 SPM.
   *
   * @param {number} sf - Current stroke frequency (strokes/min)
   * @param {string} stroke - Stroke type
   * @param {string} level - Swimmer level
   * @param {number} speed - Current swimming speed (m/s)
   * @returns {Object} - { isOptimal, recommendation, optimalRange }
   */
  _analyzeStrokeFrequency(sf, stroke, level, speed) {
    const params = STROKE_PARAMETERS[stroke];
    if (!params || sf <= 0) {
      return { isOptimal: null, recommendation: null };
    }

    const optimalSF = params.optimalSF?.[level] || params.optimalSF?.recreational || 60;
    const rateRange = params.strokeRate?.[level] || [40, 70];

    let recommendation = null;
    let isOptimal = true;

    if (sf > optimalSF * 1.2) {
      // Way above optimal — likely diminishing returns (Zhang et al. finding)
      isOptimal = false;
      recommendation =
        `Your stroke rate (${Math.round(sf)} SPM) is above the optimal range for ${stroke}. ` +
        `Research shows that increasing stroke rate beyond ~${optimalSF} SPM often reduces speed. ` +
        `Try swimming "longer" — reach further forward and glide more to increase distance per stroke.`;
    } else if (sf < rateRange[0]) {
      isOptimal = false;
      recommendation =
        `Your stroke rate (${Math.round(sf)} SPM) is below typical range (${rateRange[0]}-${rateRange[1]} SPM). ` +
        `A slightly faster turnover may help maintain momentum between strokes.`;
    }

    // Check if stroke length is suspiciously low (high rate but short strokes)
    const strokeLength = speed > 0 && sf > 0 ? (speed * 60) / sf : 0;
    const expectedSL = params.strokeLength?.[level] || 1.5;

    if (strokeLength > 0 && strokeLength < expectedSL * 0.7) {
      isOptimal = false;
      recommendation =
        `Your distance per stroke (${strokeLength.toFixed(2)}m) is short. ` +
        `Focus on a complete pull and good glide phase rather than increasing turnover.`;
    }

    return {
      isOptimal,
      recommendation,
      currentSF: Math.round(sf),
      optimalSF,
      typicalRange: rateRange,
      strokeLength: Math.round(strokeLength * 100) / 100,
      expectedStrokeLength: expectedSL,
    };
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────────────────────────

  /**
   * Estimate VO₂ using the best available model.
   * Priority: calibrated > velocity-based > population
   */
  _estimateVO2(heartRate, mass, speed, stroke) {
    // Use calibrated model if available
    if (this.calibration) {
      const vo2 = this.calibration.slope * heartRate + this.calibration.intercept;
      return Math.max(vo2, mass * METABOLIC.RESTING_VO2_ML_KG_MIN); // Floor at resting
    }

    // Use velocity model if speed is available
    if (speed > 0.1) {
      const model = HR_VO2_MODELS.velocityBased;
      const multiplier = model.strokeMultiplier[stroke] || 1.0;
      const vo2_per_kg = (model.slope * speed + model.intercept) * multiplier;
      return vo2_per_kg * mass;
    }

    // Fallback to population HR model (original algorithm)
    const model = HR_VO2_MODELS.population;
    return (heartRate * model.slope + model.intercept) * mass;
  }

  /**
   * Estimate propulsive force based on stroke frequency and type.
   * Uses linear interpolation from Zhang et al. (2026) data points.
   */
  _estimatePropulsiveForce(stroke, sf, speed, level) {
    const model = PROPULSION_FORCE_MODEL[stroke];
    if (!model || !model.dataPoints || sf <= 0) {
      // Fallback: use drag equation D = k * v²
      const k = model?.dragFactor?.[level] || 38;
      return k * speed * speed;
    }

    const points = model.dataPoints;

    // Find surrounding data points for interpolation
    if (sf <= points[0].sf) {
      return points[0].force;
    }
    if (sf >= points[points.length - 1].sf) {
      return points[points.length - 1].force;
    }

    // Linear interpolation between data points
    for (let i = 0; i < points.length - 1; i++) {
      if (sf >= points[i].sf && sf <= points[i + 1].sf) {
        const ratio = (sf - points[i].sf) / (points[i + 1].sf - points[i].sf);
        return points[i].force + ratio * (points[i + 1].force - points[i].force);
      }
    }

    return points[0].force;
  }

  /**
   * Get stroke length estimate based on stroke type and skill level.
   */
  _getStrokeLength(stroke, level) {
    const params = DISTANCE_PER_STROKE[stroke];
    if (!params) return 1.5;

    const levelMap = { beginner: "beginner", recreational: "intermediate", competitive: "advanced", elite: "advanced" };
    return params[levelMap[level]] || params.intermediate || 1.5;
  }

  /**
   * Get technique quality modifier.
   */
  _getTechniqueModifier(quality) {
    switch (quality) {
      case "satisfactory": return 1.0;
      case "needsImprovement": return 0.70;
      case "unknown": return 0.85;
      default: return 0.85;
    }
  }

  /**
   * Classify efficiency and generate feedback.
   */
  _classifyEfficiency(efficiency, stroke) {
    const benchmarks = EFFICIENCY_BENCHMARKS.dragEfficiency;
    const effDecimal = efficiency / 100;

    if (efficiency <= 0) {
      return { level: "error", feedback: "Unable to calculate. Check inputs." };
    }

    if (effDecimal < benchmarks.novice.max) {
      return {
        level: "novice",
        feedback:
          "Don't worry — even 0.5% improvement makes a huge difference in swimming! " +
          "Focus on body position: keep your hips high and look at the pool bottom.",
      };
    }

    if (effDecimal < benchmarks.beginner.max) {
      return {
        level: "beginner",
        feedback:
          "You're developing good habits! Focus on reaching further forward during " +
          "each stroke to increase your distance per stroke.",
      };
    }

    if (effDecimal < benchmarks.recreational.max) {
      return {
        level: "recreational",
        feedback:
          "Solid efficiency for a recreational swimmer. Work on your catch phase " +
          "and body rotation to find more speed with less effort.",
      };
    }

    if (effDecimal < benchmarks.competitive.max) {
      return {
        level: "competitive",
        feedback:
          "Excellent! You're swimming at a competitive level. Fine-tune stroke " +
          "timing and breathing pattern for marginal gains.",
      };
    }

    return {
      level: "elite",
      feedback:
        "Outstanding efficiency rivaling elite swimmers. Maintain consistency " +
        "across longer distances and varying intensities.",
    };
  }

  /**
   * Analyze fatigue from lap history.
   */
  _analyzeFatigue() {
    if (this.lapHistory.length < 3) {
      return { detected: false, message: "Need at least 3 laps for fatigue analysis." };
    }

    const first3 = this.lapHistory.slice(0, 3);
    const last3 = this.lapHistory.slice(-3);

    const avgEffFirst = first3.reduce((a, l) => a + l.efficiency, 0) / 3;
    const avgEffLast = last3.reduce((a, l) => a + l.efficiency, 0) / 3;
    const effDrop = avgEffFirst > 0 ? (avgEffFirst - avgEffLast) / avgEffFirst : 0;

    const avgSLFirst = first3.reduce((a, l) => a + l.strokeLength, 0) / 3;
    const avgSLLast = last3.reduce((a, l) => a + l.strokeLength, 0) / 3;
    const slDrop = avgSLFirst > 0 ? (avgSLFirst - avgSLLast) / avgSLFirst : 0;

    const avgSFFirst = first3.reduce((a, l) => a + l.strokeFrequency, 0) / 3;
    const avgSFLast = last3.reduce((a, l) => a + l.strokeFrequency, 0) / 3;
    const sfIncrease = avgSFFirst > 0 ? (avgSFLast - avgSFFirst) / avgSFFirst : 0;

    const thresholds = FATIGUE_MODEL.indicators;
    const fatigueDetected =
      effDrop > thresholds.efficiencyDrop ||
      slDrop > thresholds.strokeLengthDecline ||
      sfIncrease > thresholds.strokeRateIncrease;

    let message;
    if (fatigueDetected) {
      if (slDrop > thresholds.strokeLengthDecline) {
        message =
          `Your stroke length dropped ${(slDrop * 100).toFixed(0)}% since the start. ` +
          `Consider shorter intervals with rest to maintain technique quality.`;
      } else if (effDrop > thresholds.efficiencyDrop) {
        message =
          `Efficiency declined ${(effDrop * 100).toFixed(0)}% over the session. ` +
          `Your body is fatiguing — focus on form over speed for remaining laps.`;
      } else {
        message =
          `Stroke rate increased ${(sfIncrease * 100).toFixed(0)}% without speed gain. ` +
          `This spinning pattern indicates fatigue — take a rest interval.`;
      }
    } else {
      message = "Good pacing! Your technique is holding steady across laps.";
    }

    return {
      detected: fatigueDetected,
      message,
      metrics: {
        efficiencyDropPercent: Math.round(effDrop * 100),
        strokeLengthDropPercent: Math.round(slDrop * 100),
        strokeRateIncreasePercent: Math.round(sfIncrease * 100),
      },
      lapCount: this.lapHistory.length,
      onsetLap: fatigueDetected ? this._findFatigueOnsetLap() : null,
    };
  }

  /**
   * Find the lap where fatigue first became evident.
   */
  _findFatigueOnsetLap() {
    if (this.lapHistory.length < 3) return null;

    const baselineEff = this.lapHistory[0].efficiency;
    for (let i = 1; i < this.lapHistory.length; i++) {
      const dropFromBaseline = (baselineEff - this.lapHistory[i].efficiency) / baselineEff;
      if (dropFromBaseline > 0.10) { // 10% drop from baseline
        return i + 1; // 1-indexed lap number
      }
    }
    return null;
  }

  // ─── CONVENIENCE METHOD ───────────────────────────────────────────────────────

  /**
   * Calculate efficiency from a completed session object.
   * Convenience method that extracts values from session data.
   *
   * @param {Object} session - { duration (seconds), strokes: [...] }
   * @param {Object} biometrics - { heartRate, mass, distance? }
   * @returns {Object} - Efficiency result
   */
  calculateFromSession(session, biometrics) {
    if (!session || !biometrics) {
      return this._errorResult("Session and biometrics data required.");
    }

    const strokes = session.strokes || [];
    const strokeCount = strokes.length;
    const dominantStroke = this._getDominantStroke(strokes);
    const durationSeconds = session.duration || 0;
    const sf = durationSeconds > 0 ? (strokeCount / durationSeconds) * 60 : 0;

    // Infer technique quality from confidence
    const avgConfidence = this._getAverageConfidence(strokes);
    const techniqueQuality =
      avgConfidence >= 0.9 ? "satisfactory" :
      avgConfidence >= 0.7 ? "unknown" : "needsImprovement";

    return this.calculate({
      heartRate: biometrics.heartRate,
      durationSeconds,
      strokeCount,
      dominantStroke,
      strokeFrequency: sf,
      distance: biometrics.distance || null,
      techniqueQuality,
    });
  }

  _getDominantStroke(strokes) {
    if (!strokes || strokes.length === 0) return "Freestyle";
    const counts = {};
    strokes.forEach((s) => { counts[s.type] = (counts[s.type] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Freestyle";
  }

  _getAverageConfidence(strokes) {
    if (!strokes || strokes.length === 0) return 0;
    return strokes.reduce((sum, s) => sum + (s.confidence || 0), 0) / strokes.length;
  }

  _errorResult(message) {
    return {
      efficiency: 0, workInput: 0, workOutput: 0,
      level: "error", feedback: message, details: null,
      strokeFrequencyAnalysis: null,
    };
  }
}

export default EfficiencyCalculator;
