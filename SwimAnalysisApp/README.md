# SwimAnalysisApp

An iOS app (Expo / React Native) that analyzes swims:

- **Session:** records phone accelerometer and gyroscope data and classifies
  strokes on device with a TFLite CNN (`assets/models/`).
- **Efficiency and "One Thing to Fix":** a research-based efficiency model
  (`services/EfficiencyCalculator.js`, `constants/science.js`) and a
  prioritized recommendation engine (`services/RecommendationEngine.js`).
- **Technique (beta):** front, top or side photos classified by on-device
  TFLite models.
- **History:** past sessions and a 30-day summary.

The backend (`backend/`, Express + MongoDB) is optional and used for accounts
and sync.

## Develop

```bash
npm install
npx expo run:ios                                   # simulator
npx expo run:ios --device --configuration Release  # physical iPhone (embeds the JS bundle)
```

Checks every change must pass:

```bash
npx tsc --noEmit
npm run lint
npx expo export --platform ios
```
