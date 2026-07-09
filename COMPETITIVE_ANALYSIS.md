# Competitive Analysis & Research Sources

## Target Audience

| Segment | Needs | Pain Points |
|---|---|---|
| **Beginners** (largest market) | Learn proper form, build confidence, avoid injury | No coach, don't know what "good" looks like, overwhelmed by technique details |
| **Recreational swimmers** | Improve efficiency, track progress, stay motivated | Hit plateaus, no feedback on why they're slow, can't see themselves swim |
| **Competitive swimmers** | Marginal gains, fatigue management, race preparation | Need data their coach can act on, want stroke-by-stroke analysis |
| **Coaches** | Monitor multiple swimmers, quantify technique issues | Subjective eye-test, can't be everywhere, limited video time |

---

## Competitive Landscape

### Commercial Products

| Product | Price | Sensors | AI/ML | Efficiency Metric | CV/Technique | Our Advantage |
|---|---|---|---|---|---|---|
| **FORM Smart Goggles** | $250+ | IMU + optical HR | HeadCoach AI (post-swim text feedback) | No (shows pace, SWOLF) | Head pitch/roll only | We compute actual biomechanical efficiency %; we do multi-POV technique analysis |
| **MySwimEdge** | $200 sensor | Wrist IMU | Stroke recommendations | No | No | We're phone-based (no extra hardware to buy), plus vision models |
| **Swimio** | Free (Apple Watch) | Apple Watch sensors | AI workout generation | SWOLF only | No | We add HR-based metabolic efficiency + camera technique feedback |
| **Apple Watch native** | N/A | Accel + HR | None | SWOLF | No | We interpret the data into actionable feedback |
| **Garmin Swim 2** | $250 | IMU + HR | None | SWOLF | No | Same as above |

### Key Differentiators (What Nobody Else Does)

1. **Multi-modal fusion**: IMU (stroke type) + HR (metabolic cost) + CV (technique quality) → single efficiency %
2. **Phone-only MVP**: No $200+ dedicated hardware needed
3. **Biomechanical efficiency**: Actual work-output/work-input calculation, not just SWOLF
4. **Technique quality from vision**: 3 POV models classify form quality (existing products only track metrics, not technique)

---

## Research Papers — Useful Data & Methods

### 1. Propulsion Force & Drag Values

**Source**: Zhang et al. (2026) "Onshore human swimming motion measurement and dynamic analysis using wearable inertial sensors" — *Frontiers in Bioeng. & Biotech.*

**Useful data for our app:**
- Breaststroke propulsion force: 454–1903 N peak-to-peak depending on stroke frequency
- Freestyle propulsion force: 72–199 N peak-to-peak
- Butterfly propulsion force: 487–988 N peak-to-peak
- Swimming speeds: Breaststroke 0.40–0.64 m/s, Freestyle 0.61–1.02 m/s, Butterfly 0.65–0.98 m/s
- **Key insight**: Higher stroke frequency doesn't always mean faster swimming (freestyle at 100 SPM was slower than 80 SPM due to suboptimal arm motion). This could be a coaching insight our app surfaces.

**How to use**: Replace our static drag force constants (40-55 N) with dynamic force estimates based on stroke frequency. The paper's Newton-Euler model provides relationships between SF, speed, and force that we can approximate.

### 2. Swimming Efficiency Ranges (Ground Truth)

**Source**: Zamparo et al. (2012) "Mechanical and propelling efficiency in swimming derived from exercise using a laboratory-based whole-body swimming ergometer" — *J Applied Physiology*

**Useful data:**
- Drag efficiency (η_D): 0.03–0.09 (3–9%)
- Overall efficiency (η_O): 0.28 ± 0.01
- Propelling efficiency (η_P): 0.10–0.35
- **Our current scale (beginner <3%, intermediate 3-7%, pro >7%) aligns with published η_D values**

**How to use**: Validate our efficiency formula's output range against published literature. Consider computing propelling efficiency separately from drag efficiency.

### 3. HR-to-VO₂ Relationship Refinement

**Source**: "The energy cost of swimming and its determinants" — ResearchGate (2023)

**Key concept**: Energy cost (C) = metabolic power (Ė) / swimming speed
- More accurate than our linear HR model for trained swimmers
- Could add a calibration step: user swims a known distance, we measure HR response, and calibrate the formula to their fitness level

**How to use**: Add an optional "calibration swim" feature (e.g., 100m easy + 100m hard) to personalize the HR→VO₂ relationship per user.

### 4. IMU Accuracy for Swimming

**Source**: Guignard et al. (2021) "Validity, reliability and accuracy of IMUs to measure angles: application in swimming" — *Sports Biomechanics*

**Useful data:**
- IMU angle measurement: Spearman correlation >0.75 with optical motion capture for most body segments
- Sampling rate of 60 Hz is sufficient for swimming analysis
- Single sacrum-mounted IMU can detect stroke phases and forward velocity
- **Our phone at 30 Hz is adequate for stroke classification (not joint angle measurement)**

**How to use**: Confirms our approach (stroke classification from IMU) is well-supported. We don't need joint angles — just stroke type and count.

### 5. Pose Estimation for Swimming

**Source**: "Swimming Stroke Analysis via Pose Estimation" — Vanderbilt (2025) + SwimmerNET (2023, Sensors)

**Key findings:**
- MediaPipe works for above-water pose estimation of swimmers
- Underwater pose estimation requires specialized models (SwimmerNET uses FCN)
- Joint angles from video can assess: elbow flexion, body roll, head position, kick amplitude

**How to use**: Replace our CNN classifiers (which output satisfactory/needsImprovement) with MediaPipe pose estimation → compute specific joint angles → give targeted feedback like "your elbow drops 15° below ideal during catch phase"

### 6. Stroke Rate Impact on Performance

**Source**: Zhang et al. (2026) + Bouvet et al. (2025)

**Key finding**: Optimal stroke frequency exists for each swimmer — going faster doesn't always help.
- Freestyle has diminishing returns above ~80 SPM for most swimmers
- Breaststroke and butterfly: more linear relationship between SF and speed

**How to use**: Track user's stroke rate over time. If rate increases but SWOLF/efficiency doesn't improve → recommend "swim longer, not faster" (increase distance per stroke rather than rate).

### 7. Real-Time Feedback Effectiveness

**Source**: Morais et al. (2022) "Wearables in swimming for real-time feedback: a systematic review" — *Sensors*

**Key findings:**
- Real-time feedback improves performance more than post-session analysis alone
- Haptic/vibration feedback is effective for tempo and timing cues
- Audio cues are impractical in water unless using bone conduction

**How to use**: Prioritize haptic feedback via Apple Watch (vibrate on stroke tempo) over visual feedback. Post-session video analysis is still valuable but less impactful than in-swim cues.

---

## Actionable Improvements to Our Efficiency Calculation

| Current Approach | Improvement | Source |
|---|---|---|
| Static drag force (40-55 N) | Dynamic force based on stroke frequency relationship | Zhang et al. 2026 |
| Linear HR→VO₂ (`HR * 2.67 + 65.45`) | Per-user calibration from a test swim | Energy cost literature |
| Distance = stroke_count × fixed m/stroke | Adaptive m/stroke that accounts for fatigue decay | Bouvet et al. 2025 |
| Technique = binary (good/bad from CNN) | Joint angle deviations from MediaPipe pose | Vanderbilt 2025 |
| Single session efficiency | Efficiency-per-lap to show fatigue onset | Zhang et al. 2026 |
| No stroke frequency analysis | Track SF, detect when higher SF ≠ better speed | Zhang et al. 2026 |

---

## Feature Prioritization (Based on Competitive Gaps)

### Must Have (no competitor does this well)
1. Biomechanical efficiency % with interpretation
2. "One thing to fix" post-session recommendation
3. Efficiency trend over time (weekly/monthly)

### Should Have (some competitors partially do this)
4. Stroke rate optimization detection
5. Fatigue onset detection (efficiency per lap)
6. Post-session video technique review with pose overlay

### Nice to Have (competitors are starting here)
7. Apple Watch haptic tempo guidance
8. Calibration swim for personalized HR→VO₂
9. Coach dashboard for multi-swimmer monitoring

---

## Papers to Cite in Documentation/Marketing

1. Zamparo et al. (2012) — validates our efficiency range (3-9%)
2. Zhang et al. (2026) — propulsion force data by stroke type
3. Guignard et al. (2021) — IMU validity for swimming measurement
4. Morais et al. (2022) — real-time feedback effectiveness
5. Bouvet et al. (2025) — IMU profiling of swim biomechanics

---

## Key Takeaway for Development

> Our unique value is the **fusion of three data streams** (IMU + HR + CV) into a **single actionable metric** (efficiency %) with **specific technique recommendations**. No commercial product or research prototype currently delivers all three in a consumer phone app. The closest competitor (FORM) requires $250 goggles and doesn't compute metabolic efficiency.

The biggest opportunity is **beginners** — they're the largest market, most underserved by current products, and most likely to benefit from clear, simple feedback ("Your efficiency improved 0.3% this week because your stroke count dropped").
