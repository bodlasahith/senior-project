/**
 * RecommendationEngine — "One Thing to Fix" Post-Session Synthesis
 *
 * Analyzes all session data (efficiency, stroke rate, technique, HR) and
 * produces a single, prioritized, actionable recommendation.
 *
 * Priority system based on impact per research:
 * 1. Stroke rate issues (Zhang et al. 2026: higher SF ≠ faster)
 * 2. Stroke length deficiency (most fixable technique element)
 * 3. Body position / drag (fundamental efficiency limiter)
 * 4. Heart rate management (pacing problem)
 * 5. Consistency / endurance (for experienced swimmers)
 */

import { STROKE_PARAMETERS, EFFICIENCY_BENCHMARKS } from '@/constants/science';

const PRIORITY = {
  STROKE_RATE_TOO_HIGH: 100,
  STROKE_LENGTH_SHORT: 90,
  EFFICIENCY_VERY_LOW: 85,
  STROKE_RATE_TOO_LOW: 70,
  HR_TOO_HIGH_FOR_OUTPUT: 65,
  TECHNIQUE_QUALITY_LOW: 60,
  NO_HR_DATA: 50,
  SESSION_TOO_SHORT: 40,
  GOOD_SESSION: 0,
};

class RecommendationEngine {
  /**
   * Generate the single most impactful recommendation from session results.
   *
   * @param {Object} efficiencyResult - Output from EfficiencyCalculator.calculate()
   * @param {Object} sessionContext - Additional context
   * @param {number} sessionContext.durationSeconds - Total session time
   * @param {number} sessionContext.strokeCount - Total strokes
   * @param {number|null} sessionContext.heartRate - Average HR
   * @param {string} sessionContext.userLevel - 'beginner'|'recreational'|'competitive'|'elite'
   * @returns {Object} - { recommendation, category, priority, icon, detail }
   */
  generate(efficiencyResult, sessionContext = {}) {
    if (!efficiencyResult || efficiencyResult.level === 'error') {
      return this._fallback('Start a session to get your first recommendation.');
    }

    if (efficiencyResult.level === 'no_data') {
      return {
        recommendation: 'Connect a heart rate monitor for personalized feedback.',
        category: 'setup',
        priority: PRIORITY.NO_HR_DATA,
        icon: '⌚',
        detail: 'Heart rate data enables biomechanical efficiency analysis — the core metric that separates this app from simple stroke counters.',
      };
    }

    const candidates = [];
    const sfAnalysis = efficiencyResult.strokeFrequencyAnalysis;
    const details = efficiencyResult.details || {};
    const level = sessionContext.userLevel || details.level || 'recreational';
    const stroke = details.dominantStroke || 'Freestyle';

    // ─── Check 1: Stroke rate too high (biggest gains per research) ───
    if (sfAnalysis && !sfAnalysis.isOptimal && sfAnalysis.currentSF > (sfAnalysis.optimalSF || 60) * 1.2) {
      const overBy = sfAnalysis.currentSF - sfAnalysis.optimalSF;
      candidates.push({
        recommendation: `Slow your arms down by ~${Math.round(overBy)} strokes/min. Research shows your current rate (${sfAnalysis.currentSF} SPM) reduces speed for ${stroke}.`,
        category: 'stroke_rate',
        priority: PRIORITY.STROKE_RATE_TOO_HIGH,
        icon: '🐌',
        detail: `Zhang et al. found ${stroke.toLowerCase()} speed peaks around ${sfAnalysis.optimalSF} SPM — beyond that, turbulence from rushed recovery eats your glide. Try counting "1-2" during each arm entry.`,
      });
    }

    // ─── Check 2: Stroke length too short ───
    if (sfAnalysis && sfAnalysis.strokeLength > 0 && sfAnalysis.expectedStrokeLength > 0) {
      const slRatio = sfAnalysis.strokeLength / sfAnalysis.expectedStrokeLength;
      if (slRatio < 0.70) {
        const deficit = ((1 - slRatio) * 100).toFixed(0);
        candidates.push({
          recommendation: `Each stroke moves you ${deficit}% less distance than expected. Focus on reaching further forward before pulling.`,
          category: 'stroke_length',
          priority: PRIORITY.STROKE_LENGTH_SHORT,
          icon: '📏',
          detail: `Your distance per stroke is ${sfAnalysis.strokeLength}m vs. expected ${sfAnalysis.expectedStrokeLength}m for a ${level} ${stroke.toLowerCase()} swimmer. A longer "catch" phase — fingertips entering far ahead — is the fastest fix.`,
        });
      }
    }

    // ─── Check 3: Very low efficiency (body position / drag problem) ───
    const effDecimal = efficiencyResult.efficiency / 100;
    if (effDecimal < EFFICIENCY_BENCHMARKS.dragEfficiency.beginner.min) {
      candidates.push({
        recommendation: 'Keep your hips high and look straight down at the pool bottom — body position is your biggest efficiency limiter right now.',
        category: 'body_position',
        priority: PRIORITY.EFFICIENCY_VERY_LOW,
        icon: '🏊',
        detail: `Your efficiency (${efficiencyResult.efficiency.toFixed(2)}%) suggests high frontal drag. When hips sink, you push water forward instead of swimming through it. A pull buoy drill can teach the correct position.`,
      });
    }

    // ─── Check 4: Stroke rate too low ───
    if (sfAnalysis && !sfAnalysis.isOptimal && sfAnalysis.currentSF < (sfAnalysis.typicalRange?.[0] || 30)) {
      candidates.push({
        recommendation: `Your stroke rate (${sfAnalysis.currentSF} SPM) is below the effective range. A slightly faster turnover will maintain momentum between strokes.`,
        category: 'stroke_rate_low',
        priority: PRIORITY.STROKE_RATE_TOO_LOW,
        icon: '⚡',
        detail: `Below ${sfAnalysis.typicalRange?.[0] || 30} SPM, you lose speed during the glide phase. Try matching a metronome at ${Math.round((sfAnalysis.typicalRange?.[0] || 35) * 1.1)} SPM for a few laps.`,
      });
    }

    // ─── Check 5: High HR relative to output (pacing issue) ───
    if (details.heartRate && details.avgSpeed) {
      const hrPerSpeed = details.heartRate / (details.avgSpeed || 0.5);
      // Rough threshold: >200 bpm/(m/s) suggests working hard for little speed
      if (hrPerSpeed > 220 && details.heartRate > 150) {
        candidates.push({
          recommendation: `You're working hard (${details.heartRate} BPM) for your speed. Slow down to build an aerobic base — efficiency improves more at lower intensities.`,
          category: 'pacing',
          priority: PRIORITY.HR_TOO_HIGH_FOR_OUTPUT,
          icon: '❤️',
          detail: `At ${details.heartRate} BPM and ${details.avgSpeed?.toFixed(2)} m/s, you may be above your aerobic threshold. Try keeping HR below ${Math.round(details.heartRate * 0.85)} BPM next session — you'll swim almost as fast with much less fatigue.`,
        });
      }
    }

    // ─── Check 6: Technique quality proxy (low confidence = inconsistent form) ───
    if (details.techniqueQuality === 'needsImprovement') {
      candidates.push({
        recommendation: 'Your stroke pattern was inconsistent. Pick one stroke and swim it deliberately for 10+ minutes to build muscle memory.',
        category: 'consistency',
        priority: PRIORITY.TECHNIQUE_QUALITY_LOW,
        icon: '🎯',
        detail: 'The stroke classifier showed low confidence, meaning your motion pattern varied a lot. Consistent, repeatable strokes are more efficient than varied ones — even if the "perfect" form feels slower at first.',
      });
    }

    // ─── Check 7: Session too short for meaningful analysis ───
    const durationSec = sessionContext.durationSeconds || (details.durationMinutes || 0) * 60;
    if (durationSec < 120 && (sessionContext.strokeCount || details.strokeCount || 0) < 20) {
      candidates.push({
        recommendation: 'Swim for at least 5 minutes for reliable efficiency analysis. Short bursts don\'t reveal your true steady-state pattern.',
        category: 'duration',
        priority: PRIORITY.SESSION_TOO_SHORT,
        icon: '⏱️',
        detail: 'Efficiency calculations need enough strokes to average out individual variation. Aim for 5+ continuous minutes or 50+ strokes per session.',
      });
    }

    // ─── Select highest priority candidate ───
    if (candidates.length === 0) {
      return this._positiveReinforcement(efficiencyResult, sfAnalysis, level);
    }

    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0];
  }

  /**
   * When everything looks good, reinforce what's working.
   */
  _positiveReinforcement(result, sfAnalysis, level) {
    const efficiency = result.efficiency;
    let recommendation;
    let detail;

    if (efficiency > 6) {
      recommendation = 'Excellent session! Your efficiency is in the competitive range. Challenge yourself with longer sets to test consistency.';
      detail = `At ${efficiency.toFixed(2)}% you're swimming more efficiently than most recreational swimmers. The next frontier is maintaining this across 400m+ sets.`;
    } else if (efficiency > 4) {
      recommendation = 'Solid swim! Your technique and pacing are well-balanced. Keep this up and track your trend over the next few sessions.';
      detail = `${efficiency.toFixed(2)}% efficiency with good stroke rate placement. Consistency session-to-session matters more than a single breakthrough.`;
    } else {
      recommendation = 'Good work getting in the water! Each session builds your feel for the water. Aim for one more lap next time.';
      detail = 'Swimming efficiency improves fastest in the first few weeks of consistent practice. Two to three sessions per week is the sweet spot.';
    }

    return {
      recommendation,
      category: 'positive',
      priority: PRIORITY.GOOD_SESSION,
      icon: '✅',
      detail,
    };
  }

  _fallback(message) {
    return {
      recommendation: message,
      category: 'info',
      priority: 0,
      icon: 'ℹ️',
      detail: null,
    };
  }
}

export default RecommendationEngine;
