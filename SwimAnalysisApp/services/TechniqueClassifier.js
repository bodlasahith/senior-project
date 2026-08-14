/**
 * TechniqueClassifier — on-device swimming technique classification from a
 * still image, using the 3 point-of-view MobileNetV2 models (front / top / side).
 *
 * Each model was converted from Teachable Machine .h5 → .tflite:
 *   input:  [1, 224, 224, 3] float32, normalized to [-1, 1] (pixel / 127.5 - 1)
 *   output: [1, 3] float32 softmax over the technique classes below
 */

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';

const INPUT_SIZE = 224;

// Class order matches the models' *_POV_labels.txt (index 0..2).
export const TECHNIQUE_CLASSES = [
  'Satisfactory Technique',
  'Technique Needs Improvement',
  'Extraneous / Unidentifiable',
];

export const POV_KEYS = ['front', 'top', 'side'];

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decode a base64 string to a Uint8Array without relying on Buffer/atob. */
function base64ToBytes(base64) {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const bytes = new Uint8Array(Math.floor((len * 3) / 4));
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = B64.indexOf(clean[i]);
    const e2 = B64.indexOf(clean[i + 1]);
    const e3 = B64.indexOf(clean[i + 2]);
    const e4 = B64.indexOf(clean[i + 3]);
    bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (e3 !== -1) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (e4 !== -1) bytes[p++] = ((e3 & 3) << 6) | e4;
  }
  return bytes.subarray(0, p);
}

class TechniqueClassifier {
  constructor() {
    this.models = { front: null, top: null, side: null };
    this.isReady = false;
    this.usingMock = false;
    this.classes = TECHNIQUE_CLASSES;
  }

  /**
   * @param {{front:any, top:any, side:any}} modelSources - require(...) handles
   * for each POV .tflite. Any missing POV is skipped.
   */
  async initialize(modelSources = {}) {
    try {
      const { loadTensorflowModel } = await import('react-native-fast-tflite');
      for (const pov of POV_KEYS) {
        if (modelSources[pov]) {
          this.models[pov] = await loadTensorflowModel(modelSources[pov], 'default');
        }
      }
      const loaded = POV_KEYS.filter((p) => this.models[p]).length;
      if (loaded === 0) throw new Error('No POV models provided');
      console.log(`✅ TechniqueClassifier ready (${loaded}/3 POV models, 224×224×3)`);
      this.isReady = true;
      return true;
    } catch (error) {
      console.warn('⚠️ Technique TFLite unavailable, using mock mode:', error.message);
      for (const pov of POV_KEYS) this.models[pov] = this._createMockModel();
      this.usingMock = true;
      this.isReady = true;
      return true;
    }
  }

  _createMockModel() {
    return {
      run: () => {
        const probs = new Float32Array(3);
        const idx = Math.floor(Math.random() * 3);
        let sum = 0;
        for (let i = 0; i < 3; i++) {
          probs[i] = i === idx ? 0.55 + Math.random() * 0.4 : Math.random() * 0.2;
          sum += probs[i];
        }
        for (let i = 0; i < 3; i++) probs[i] /= sum; // keep it a softmax-like distribution
        return [probs];
      },
    };
  }

  /**
   * Resize a captured image to 224×224 and produce a normalized [-1,1] RGB
   * Float32Array of length 224*224*3, matching the model input.
   * @param {string} uri - local image URI from the camera
   * @returns {Promise<Float32Array>}
   */
  async imageToTensor(uri) {
    const resized = await manipulateAsync(
      uri,
      [{ resize: { width: INPUT_SIZE, height: INPUT_SIZE } }],
      { base64: true, compress: 1, format: SaveFormat.JPEG }
    );
    const bytes = base64ToBytes(resized.base64);
    const { data } = decodeJpeg(bytes, { useTArray: true }); // RGBA, length = 224*224*4

    const input = new Float32Array(INPUT_SIZE * INPUT_SIZE * 3);
    let j = 0;
    for (let i = 0; i < data.length; i += 4) {
      input[j++] = data[i] / 127.5 - 1; // R
      input[j++] = data[i + 1] / 127.5 - 1; // G
      input[j++] = data[i + 2] / 127.5 - 1; // B
    }
    return input;
  }

  /**
   * Classify a captured image for a given POV.
   * @param {'front'|'top'|'side'} pov
   * @param {string} uri - local image URI
   * @returns {Promise<{pov:string,label:string,confidence:number,classIndex:number,allPredictions:Object}|null>}
   */
  async classify(pov, uri) {
    if (!this.isReady) return null;
    const model = this.models[pov];
    if (!model) return null;

    try {
      const input = await this.imageToTensor(uri);
      const outputs = await model.run([input]);
      const probs = Array.from(outputs[0] || []);

      let maxConfidence = 0;
      let classIndex = 0;
      for (let i = 0; i < probs.length; i++) {
        if (probs[i] > maxConfidence) {
          maxConfidence = probs[i];
          classIndex = i;
        }
      }

      const allPredictions = {};
      this.classes.forEach((c, i) => {
        allPredictions[c] = probs[i] || 0;
      });

      return { pov, label: this.classes[classIndex], confidence: maxConfidence, classIndex, allPredictions };
    } catch (error) {
      console.error('Technique classification error:', error);
      return null;
    }
  }

  dispose() {
    for (const pov of POV_KEYS) {
      this.models[pov]?.dispose?.();
      this.models[pov] = null;
    }
    this.isReady = false;
  }
}

export default TechniqueClassifier;
