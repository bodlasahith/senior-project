/**
 * WearableService
 *
 * Provides heart rate data from wearable devices via two methods:
 * 1. Apple HealthKit (Apple Watch) — reads HR samples written by watchOS
 * 2. Bluetooth Low Energy (BLE) — connects to standard HR monitors
 *    using the Heart Rate Service (UUID 0x180D) and Heart Rate Measurement
 *    characteristic (UUID 0x2A37)
 *
 * Usage:
 *   const wearable = new WearableService();
 *   await wearable.initialize();
 *   wearable.onHeartRateUpdate = (bpm) => { ... };
 *   await wearable.startMonitoring();   // starts HealthKit or BLE
 *   ...
 *   wearable.stopMonitoring();
 *   const avg = wearable.getAverageHeartRate();
 */

import { Platform } from "react-native";

// HealthKit constants
const HR_QUANTITY_TYPE = "HKQuantityTypeIdentifierHeartRate";

// BLE Heart Rate Service UUIDs
const HR_SERVICE_UUID = "180D";
const HR_MEASUREMENT_CHAR_UUID = "2A37";

class WearableService {
  constructor() {
    this.source = null; // 'healthkit' | 'ble' | null
    this.isMonitoring = false;
    this.heartRateHistory = [];
    this.currentHeartRate = null;
    this.lastUpdated = null;

    // Callbacks
    this.onHeartRateUpdate = null;
    this.onConnectionChange = null;
    this.onError = null;

    // HealthKit
    this._healthKit = null;
    this._healthKitObserver = null;

    // BLE
    this._bleManager = null;
    this._connectedDevice = null;
    this._scanSubscription = null;
    this._notificationSubscription = null;
    this._discoveredDevices = [];
  }

  /**
   * Initialize the service — probes available APIs
   * @returns {Promise<Object>} - { healthKitAvailable, bleAvailable }
   */
  async initialize() {
    const capabilities = {
      healthKitAvailable: false,
      bleAvailable: false,
    };

    // Check HealthKit (iOS only)
    if (Platform.OS === "ios") {
      try {
        const ExpoHealth = await this._loadExpoHealth();
        if (ExpoHealth) {
          this._healthKit = ExpoHealth;
          capabilities.healthKitAvailable = true;
          console.log("✅ HealthKit available");
        }
      } catch (e) {
        console.warn("⚠️ HealthKit not available:", e.message);
      }
    }

    // Check BLE
    try {
      const BleManager = await this._loadBleManager();
      if (BleManager) {
        this._bleManager = BleManager;
        capabilities.bleAvailable = true;
        console.log("✅ BLE available");
      }
    } catch (e) {
      console.warn("⚠️ BLE not available:", e.message);
    }

    return capabilities;
  }

  // ─── HealthKit Methods ──────────────────────────────────────────────────────

  /**
   * Request HealthKit permissions for heart rate
   * @returns {Promise<boolean>} - True if granted
   */
  async requestHealthKitPermissions() {
    if (!this._healthKit) {
      throw new Error("HealthKit not available on this device.");
    }

    try {
      const { isAvailable, requestPermissionsAsync } = this._healthKit;

      if (!isAvailable()) {
        throw new Error("HealthKit is not available on this device.");
      }

      const result = await requestPermissionsAsync([HR_QUANTITY_TYPE]);

      // On iOS, HealthKit doesn't reveal if the user denied — it just returns
      // the status. We optimistically assume granted if no error was thrown.
      console.log("✅ HealthKit permissions requested");
      return true;
    } catch (error) {
      console.error("❌ HealthKit permission error:", error);
      if (this.onError) this.onError("healthkit_permission", error);
      return false;
    }
  }

  /**
   * Start reading heart rate from HealthKit (Apple Watch → phone)
   * Polls every 5 seconds for new samples.
   */
  async startHealthKitMonitoring() {
    if (!this._healthKit) {
      throw new Error("HealthKit not initialized.");
    }

    const granted = await this.requestHealthKitPermissions();
    if (!granted) return false;

    this.source = "healthkit";
    this.isMonitoring = true;
    this.heartRateHistory = [];

    // Poll for HR samples every 5 seconds
    this._healthKitObserver = setInterval(async () => {
      try {
        await this._fetchLatestHealthKitHR();
      } catch (e) {
        console.warn("HealthKit poll error:", e.message);
      }
    }, 5000);

    // Do an immediate fetch
    await this._fetchLatestHealthKitHR();

    console.log("✅ HealthKit HR monitoring started");
    if (this.onConnectionChange) this.onConnectionChange("connected", "healthkit");
    return true;
  }

  /**
   * Fetch the latest heart rate sample from HealthKit
   * @private
   */
  async _fetchLatestHealthKitHR() {
    if (!this._healthKit || !this.isMonitoring) return;

    try {
      const { queryQuantitySamplesAsync } = this._healthKit;

      // Query the last 30 seconds of HR data
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30000);

      const samples = await queryQuantitySamplesAsync({
        quantityType: HR_QUANTITY_TYPE,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 5,
        ascending: false,
      });

      if (samples && samples.length > 0) {
        // Take the most recent sample
        const latestSample = samples[0];
        const bpm = Math.round(latestSample.quantity || latestSample.value);

        if (bpm > 0 && bpm < 250) {
          this._recordHeartRate(bpm);
        }
      }
    } catch (error) {
      console.warn("HealthKit HR query error:", error.message);
    }
  }

  // ─── Bluetooth LE Methods ────────────────────────────────────────────────────

  /**
   * Scan for Bluetooth HR monitor devices
   * @param {number} timeoutMs - Scan duration (default 10s)
   * @returns {Promise<Array>} - Discovered devices with HR service
   */
  async scanForDevices(timeoutMs = 10000) {
    if (!this._bleManager) {
      throw new Error("BLE not available on this device.");
    }

    this._discoveredDevices = [];

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._bleManager.stopDeviceScan();
        resolve(this._discoveredDevices);
      }, timeoutMs);

      try {
        this._bleManager.startDeviceScan(
          [HR_SERVICE_UUID], // Filter to HR service
          { allowDuplicates: false },
          (error, device) => {
            if (error) {
              clearTimeout(timeout);
              reject(error);
              return;
            }

            if (device && device.name) {
              const exists = this._discoveredDevices.find((d) => d.id === device.id);
              if (!exists) {
                this._discoveredDevices.push({
                  id: device.id,
                  name: device.name || "Unknown HR Monitor",
                  rssi: device.rssi,
                });
                console.log(`Found HR device: ${device.name} (${device.id})`);
              }
            }
          }
        );
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Connect to a specific BLE HR monitor and start receiving data
   * @param {string} deviceId - Device ID from scanForDevices()
   * @returns {Promise<boolean>}
   */
  async connectToDevice(deviceId) {
    if (!this._bleManager) {
      throw new Error("BLE not available.");
    }

    try {
      // Connect
      const device = await this._bleManager.connectToDevice(deviceId);
      await device.discoverAllServicesAndCharacteristics();

      this._connectedDevice = device;
      this.source = "ble";

      // Subscribe to HR measurement notifications
      this._notificationSubscription = device.monitorCharacteristicForService(
        HR_SERVICE_UUID,
        HR_MEASUREMENT_CHAR_UUID,
        (error, characteristic) => {
          if (error) {
            console.error("BLE notification error:", error);
            if (this.onError) this.onError("ble_notification", error);
            return;
          }

          if (characteristic?.value) {
            const bpm = this._parseHeartRateMeasurement(characteristic.value);
            if (bpm > 0 && bpm < 250) {
              this._recordHeartRate(bpm);
            }
          }
        }
      );

      this.isMonitoring = true;
      this.heartRateHistory = [];

      console.log(`✅ Connected to BLE device: ${device.name}`);
      if (this.onConnectionChange) this.onConnectionChange("connected", "ble");
      return true;
    } catch (error) {
      console.error("❌ BLE connection error:", error);
      if (this.onError) this.onError("ble_connection", error);
      return false;
    }
  }

  /**
   * Parse the BLE Heart Rate Measurement characteristic value
   * Per Bluetooth SIG specification: first byte is flags, HR follows
   * @param {string} base64Value - Base64 encoded characteristic data
   * @returns {number} - Heart rate in BPM
   * @private
   */
  _parseHeartRateMeasurement(base64Value) {
    try {
      // Decode base64 to bytes
      const bytes = this._base64ToBytes(base64Value);
      if (bytes.length < 2) return 0;

      const flags = bytes[0];
      const is16Bit = flags & 0x01;

      if (is16Bit) {
        // HR is in 2 bytes (uint16) at offset 1
        return bytes[1] | (bytes[2] << 8);
      } else {
        // HR is in 1 byte (uint8) at offset 1
        return bytes[1];
      }
    } catch (e) {
      return 0;
    }
  }

  /**
   * Decode base64 string to byte array
   * @private
   */
  _base64ToBytes(base64) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const bytes = [];
    let buffer = 0;
    let bits = 0;

    for (let i = 0; i < base64.length; i++) {
      const c = base64[i];
      if (c === "=") break;
      const index = chars.indexOf(c);
      if (index < 0) continue;
      buffer = (buffer << 6) | index;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >> bits) & 0xff);
      }
    }

    return bytes;
  }

  // ─── Common Methods ─────────────────────────────────────────────────────────

  /**
   * Start monitoring using the best available source
   * Prefers HealthKit (Apple Watch), falls back to BLE scan
   * @returns {Promise<boolean>}
   */
  async startMonitoring() {
    if (this._healthKit && Platform.OS === "ios") {
      return this.startHealthKitMonitoring();
    }

    if (this._bleManager) {
      // If no device connected yet, caller should scanForDevices() + connectToDevice() first
      console.warn("BLE: call scanForDevices() and connectToDevice() to start HR monitoring.");
      return false;
    }

    console.error("No wearable source available.");
    return false;
  }

  /**
   * Stop all monitoring
   */
  stopMonitoring() {
    this.isMonitoring = false;

    // Stop HealthKit polling
    if (this._healthKitObserver) {
      clearInterval(this._healthKitObserver);
      this._healthKitObserver = null;
    }

    // Stop BLE notifications
    if (this._notificationSubscription) {
      this._notificationSubscription.remove();
      this._notificationSubscription = null;
    }

    if (this.onConnectionChange) this.onConnectionChange("disconnected", this.source);
    console.log("✅ Wearable monitoring stopped");
  }

  /**
   * Disconnect BLE device
   */
  async disconnectBLE() {
    this.stopMonitoring();

    if (this._connectedDevice) {
      try {
        await this._connectedDevice.cancelConnection();
      } catch (e) {
        // Already disconnected
      }
      this._connectedDevice = null;
    }
  }

  /**
   * Record a heart rate reading
   * @param {number} bpm - Heart rate value
   * @private
   */
  _recordHeartRate(bpm) {
    this.currentHeartRate = bpm;
    this.lastUpdated = Date.now();

    this.heartRateHistory.push({
      bpm,
      timestamp: this.lastUpdated,
    });

    if (this.onHeartRateUpdate) {
      this.onHeartRateUpdate(bpm, this.lastUpdated);
    }
  }

  /**
   * Get the average heart rate from the monitoring session
   * @returns {number} - Average BPM, or 0 if no data
   */
  getAverageHeartRate() {
    if (this.heartRateHistory.length === 0) return 0;
    const sum = this.heartRateHistory.reduce((acc, entry) => acc + entry.bpm, 0);
    return Math.round(sum / this.heartRateHistory.length);
  }

  /**
   * Get the current (latest) heart rate
   * @returns {number|null}
   */
  getCurrentHeartRate() {
    return this.currentHeartRate;
  }

  /**
   * Get full heart rate history
   * @returns {Array<{bpm: number, timestamp: number}>}
   */
  getHeartRateHistory() {
    return [...this.heartRateHistory];
  }

  /**
   * Get min/max/avg summary
   * @returns {Object} - { min, max, avg, count }
   */
  getHeartRateSummary() {
    if (this.heartRateHistory.length === 0) {
      return { min: 0, max: 0, avg: 0, count: 0 };
    }

    const values = this.heartRateHistory.map((h) => h.bpm);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      count: values.length,
    };
  }

  /**
   * Check if we have recent HR data (within last 15 seconds)
   * @returns {boolean}
   */
  hasRecentData() {
    if (!this.lastUpdated) return false;
    return Date.now() - this.lastUpdated < 15000;
  }

  // ─── Dynamic Imports (avoid crash if packages not installed) ──────────────

  /**
   * @private
   */
  async _loadExpoHealth() {
    try {
      // expo-apple-healthkit or react-native-health
      const module = await import("expo-apple-healthkit");
      return module.default || module;
    } catch (e) {
      try {
        // Fallback: react-native-health
        const module = await import("react-native-health");
        return module.default || module;
      } catch (e2) {
        return null;
      }
    }
  }

  /**
   * @private
   */
  async _loadBleManager() {
    try {
      const { BleManager } = await import("react-native-ble-plx");
      return new BleManager();
    } catch (e) {
      return null;
    }
  }

  /**
   * Clean up all resources
   */
  dispose() {
    this.stopMonitoring();

    if (this._connectedDevice) {
      this._connectedDevice.cancelConnection().catch(() => {});
      this._connectedDevice = null;
    }

    if (this._bleManager) {
      this._bleManager.destroy();
      this._bleManager = null;
    }

    this._healthKit = null;
  }
}

export default WearableService;
