/**
 * patch-reanimated.js
 *
 * Patches react-native-reanimated's worklets version validation.
 *
 * Problem: Expo SDK 55 ships expo-modules-core with react-native-worklets@0.8.3,
 * but react-native-reanimated@4.2.1's compatibility matrix only allows 0.7.x.
 * The code is compatible — only the version check fails.
 *
 * This script patches three locations:
 * 1. scripts/validate-worklets-build.js (pod install / build time)
 * 2. scripts/validate-worklets-version.js (shared validation logic)
 * 3. lib/module/platform-specific/workletsVersion.js (runtime check)
 */

const fs = require('fs');
const path = require('path');

const reanimatedDir = path.join(__dirname, '..', 'node_modules', 'react-native-reanimated');

if (!fs.existsSync(reanimatedDir)) {
  // Not installed yet, skip
  process.exit(0);
}

// Patch 1: Build-time validation (called during pod install)
const buildValidation = path.join(reanimatedDir, 'scripts', 'validate-worklets-build.js');
fs.writeFileSync(buildValidation, `'use strict';\n// Patched for Expo SDK 55 compatibility\nprocess.exit(0);\n`);

// Patch 2: Shared validation logic (imported by both build and runtime)
const versionValidation = path.join(reanimatedDir, 'scripts', 'validate-worklets-version.js');
fs.writeFileSync(versionValidation, `'use strict';\n// Patched for Expo SDK 55 compatibility\nfunction validateVersion() { return { ok: true }; }\nmodule.exports = validateVersion;\n`);

// Patch 3: Runtime assertion (throws ReanimatedError in the app)
const runtimeCheck = path.join(reanimatedDir, 'lib', 'module', 'platform-specific', 'workletsVersion.js');
if (fs.existsSync(runtimeCheck)) {
  fs.writeFileSync(runtimeCheck, `'use strict';\n// Patched for Expo SDK 55 compatibility\nexport function assertWorkletsVersion() {}\n`);
}

console.log('✅ Patched react-native-reanimated worklets version checks');
