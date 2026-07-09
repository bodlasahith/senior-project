"""
load_iswc_dataset.py

Loads the ISWC 2019 swimming dataset (40 swimmers, smartwatch IMU data at 30Hz)
and prepares it for model training/evaluation.

Dataset source: https://github.com/brunnergino/swimming-recognition-lap-counting
Paper: "Swimming Style Recognition and Lane Counting Using a Smartwatch" (ISWC 2019)

Usage:
    python load_iswc_dataset.py

This script will:
1. Load all 40 swimmers' CSV files
2. Print dataset statistics
3. Balance classes and create train/val/test splits
4. Export a combined CSV ready for model training
"""

import os
import pandas as pd
import numpy as np
from pathlib import Path

# ─── CONFIG ──────────────────────────────────────────────────────────────────────

DATA_DIR = Path(__file__).parent / "datasets" / "iswc-swimming-2019" / "data" / "processed_30hz_relabeled"
OUTPUT_DIR = Path(__file__).parent / "datasets" / "processed"

# Label mapping from the dataset
LABEL_MAP = {
    0: "Null",
    1: "Freestyle",
    2: "Breaststroke",
    3: "Backstroke",
    4: "Butterfly",
    5: "Turn",
}

# Columns we care about for stroke classification
SENSOR_COLS = ["ACC_0", "ACC_1", "ACC_2", "GYRO_0", "GYRO_1", "GYRO_2"]

# Window size for creating samples (number of frames per sample)
# At 30Hz, 100 frames = ~3.3 seconds of data (similar to your app's buffer)
WINDOW_SIZE = 100
WINDOW_STRIDE = 50  # 50% overlap


# ─── LOAD DATA ───────────────────────────────────────────────────────────────────

def load_all_swimmers(data_dir):
    """Load all swimmer CSV files into a single DataFrame."""
    all_data = []
    swimmer_dirs = sorted([d for d in os.listdir(data_dir) if os.path.isdir(os.path.join(data_dir, d))])

    print(f"Found {len(swimmer_dirs)} swimmers in {data_dir}")
    print("Loading data...")

    for swimmer_id in swimmer_dirs:
        swimmer_path = os.path.join(data_dir, swimmer_id)
        csv_files = [f for f in os.listdir(swimmer_path) if f.endswith('.csv')]

        for csv_file in csv_files:
            filepath = os.path.join(swimmer_path, csv_file)
            try:
                df = pd.read_csv(filepath)
                df['swimmer_id'] = int(swimmer_id)
                df['session'] = csv_file.replace('.csv', '')
                all_data.append(df)
            except Exception as e:
                print(f"  Warning: Could not load {filepath}: {e}")

    dataset = pd.concat(all_data, ignore_index=True)
    print(f"✅ Loaded {len(dataset):,} total rows from {len(all_data)} sessions")
    return dataset


# ─── STATISTICS ──────────────────────────────────────────────────────────────────

def print_statistics(dataset):
    """Print dataset statistics."""
    print("\n" + "=" * 60)
    print("DATASET STATISTICS")
    print("=" * 60)

    print(f"\nTotal rows: {len(dataset):,}")
    print(f"Swimmers: {dataset['swimmer_id'].nunique()}")
    print(f"Sessions: {dataset['session'].nunique()}")
    print(f"Sampling rate: 30 Hz")
    print(f"Duration: ~{len(dataset) / 30 / 60:.1f} minutes total")

    print("\n── Label Distribution ──")
    label_counts = dataset['label'].value_counts().sort_index()
    for label_id, count in label_counts.items():
        label_name = LABEL_MAP.get(int(label_id), f"Unknown({label_id})")
        pct = count / len(dataset) * 100
        print(f"  {label_id} ({label_name:12s}): {count:>8,} samples ({pct:.1f}%)")

    print("\n── Sensor Ranges ──")
    for col in SENSOR_COLS:
        if col in dataset.columns:
            print(f"  {col}: min={dataset[col].min():.2f}, max={dataset[col].max():.2f}, "
                  f"mean={dataset[col].mean():.4f}, std={dataset[col].std():.4f}")


# ─── WINDOWED SAMPLES ────────────────────────────────────────────────────────────

def create_windowed_samples(dataset, window_size=WINDOW_SIZE, stride=WINDOW_STRIDE):
    """
    Create fixed-size windows from continuous sensor data.

    Each window becomes one training sample with shape (window_size, 6).
    The label is the majority vote within the window.

    Returns:
        X: numpy array of shape (n_samples, window_size, 6)
        y: numpy array of shape (n_samples,) with integer labels
        metadata: list of dicts with swimmer_id and session info
    """
    print(f"\nCreating windowed samples (window={window_size}, stride={stride})...")

    # Only keep stroke labels (1-4), exclude Null(0) and Turn(5)
    stroke_data = dataset[dataset['label'].isin([1, 2, 3, 4])].copy()
    print(f"  Stroke-only data: {len(stroke_data):,} rows")

    X_list = []
    y_list = []
    meta_list = []

    # Process per swimmer per session to avoid mixing
    groups = stroke_data.groupby(['swimmer_id', 'session'])

    for (swimmer_id, session), group in groups:
        sensor_values = group[SENSOR_COLS].values
        labels = group['label'].values

        n_windows = (len(sensor_values) - window_size) // stride + 1

        for i in range(n_windows):
            start = i * stride
            end = start + window_size

            window_data = sensor_values[start:end]
            window_labels = labels[start:end]

            # Majority vote for window label
            label_counts = np.bincount(window_labels.astype(int), minlength=6)
            majority_label = np.argmax(label_counts)

            # Only keep if majority label is a stroke (1-4) and >70% agreement
            if majority_label in [1, 2, 3, 4] and label_counts[majority_label] / window_size > 0.7:
                X_list.append(window_data)
                y_list.append(majority_label)
                meta_list.append({'swimmer_id': swimmer_id, 'session': session})

    X = np.array(X_list)
    y = np.array(y_list)

    print(f"  ✅ Created {len(X):,} windowed samples")
    print(f"  Shape: X={X.shape}, y={y.shape}")

    # Print class balance
    print("\n── Windowed Sample Distribution ──")
    for label_id in sorted(np.unique(y)):
        count = np.sum(y == label_id)
        print(f"  {LABEL_MAP[label_id]:12s}: {count:>6,} samples")

    return X, y, meta_list


# ─── FEATURE EXTRACTION (for flat model like your existing one) ──────────────────

def extract_statistical_features(X):
    """
    Extract statistical features from each window.
    Produces a flat feature vector per sample (similar to your existing 60-feature model).

    For each of the 6 sensor channels, computes:
    - mean, std, min, max, median, rms, zero_crossings, peak_frequency
    = 6 channels × 8 features = 48 features

    Plus inter-channel features:
    - magnitude of accel, magnitude of gyro, correlation
    = 12 more features

    Total: 60 features (matches your existing model input!)
    """
    print("\nExtracting statistical features...")
    n_samples = X.shape[0]
    features = []

    for i in range(n_samples):
        window = X[i]  # shape: (window_size, 6)
        sample_features = []

        for ch in range(6):
            signal = window[:, ch]
            sample_features.extend([
                np.mean(signal),
                np.std(signal),
                np.min(signal),
                np.max(signal),
                np.median(signal),
                np.sqrt(np.mean(signal ** 2)),  # RMS
                np.sum(np.diff(np.sign(signal)) != 0),  # zero crossings
                np.argmax(np.abs(np.fft.rfft(signal)[1:])) + 1,  # peak frequency bin
            ])

        # Inter-channel: acceleration magnitude stats
        acc_mag = np.sqrt(window[:, 0]**2 + window[:, 1]**2 + window[:, 2]**2)
        sample_features.extend([np.mean(acc_mag), np.std(acc_mag)])

        # Gyroscope magnitude stats
        gyro_mag = np.sqrt(window[:, 3]**2 + window[:, 4]**2 + window[:, 5]**2)
        sample_features.extend([np.mean(gyro_mag), np.std(gyro_mag)])

        # Correlations between axes
        sample_features.append(np.corrcoef(window[:, 0], window[:, 1])[0, 1])
        sample_features.append(np.corrcoef(window[:, 0], window[:, 2])[0, 1])
        sample_features.append(np.corrcoef(window[:, 1], window[:, 2])[0, 1])
        sample_features.append(np.corrcoef(window[:, 3], window[:, 4])[0, 1])
        sample_features.append(np.corrcoef(window[:, 3], window[:, 5])[0, 1])
        sample_features.append(np.corrcoef(window[:, 4], window[:, 5])[0, 1])

        # Jerk (derivative of acceleration)
        jerk = np.diff(window[:, :3], axis=0)
        sample_features.extend([np.mean(np.abs(jerk)), np.std(np.abs(jerk))])

        features.append(sample_features)

    X_features = np.array(features)

    # Handle NaN from correlations of constant signals
    X_features = np.nan_to_num(X_features, nan=0.0)

    print(f"  ✅ Feature matrix shape: {X_features.shape}")
    print(f"  Features per sample: {X_features.shape[1]}")

    return X_features


# ─── TRAIN/VAL/TEST SPLIT ────────────────────────────────────────────────────────

def split_by_swimmer(X, y, metadata, train_ratio=0.7, val_ratio=0.15):
    """
    Split data by swimmer (not by sample) to avoid data leakage.
    Swimmers in train set never appear in val/test.
    """
    print("\nSplitting by swimmer (no data leakage)...")

    swimmer_ids = sorted(set(m['swimmer_id'] for m in metadata))
    np.random.seed(42)
    np.random.shuffle(swimmer_ids)

    n_train = int(len(swimmer_ids) * train_ratio)
    n_val = int(len(swimmer_ids) * val_ratio)

    train_swimmers = set(swimmer_ids[:n_train])
    val_swimmers = set(swimmer_ids[n_train:n_train + n_val])
    test_swimmers = set(swimmer_ids[n_train + n_val:])

    train_idx = [i for i, m in enumerate(metadata) if m['swimmer_id'] in train_swimmers]
    val_idx = [i for i, m in enumerate(metadata) if m['swimmer_id'] in val_swimmers]
    test_idx = [i for i, m in enumerate(metadata) if m['swimmer_id'] in test_swimmers]

    print(f"  Train: {len(train_idx):,} samples ({len(train_swimmers)} swimmers)")
    print(f"  Val:   {len(val_idx):,} samples ({len(val_swimmers)} swimmers)")
    print(f"  Test:  {len(test_idx):,} samples ({len(test_swimmers)} swimmers)")

    return {
        'X_train': X[train_idx], 'y_train': y[train_idx],
        'X_val': X[val_idx], 'y_val': y[val_idx],
        'X_test': X[test_idx], 'y_test': y[test_idx],
    }


# ─── EXPORT ──────────────────────────────────────────────────────────────────────

def export_dataset(splits, output_dir):
    """Save processed splits as numpy files."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    for key, data in splits.items():
        filepath = output_dir / f"{key}.npy"
        np.save(filepath, data)
        print(f"  Saved {filepath} ({data.shape})")

    print(f"\n✅ All splits saved to {output_dir}/")


# ─── MAIN ────────────────────────────────────────────────────────────────────────

def main():
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║  ISWC 2019 Swimming Dataset Loader                         ║")
    print("║  40 swimmers · smartwatch IMU · 30Hz · 4 stroke types      ║")
    print("╚══════════════════════════════════════════════════════════════╝")

    if not DATA_DIR.exists():
        print(f"\n❌ Dataset not found at: {DATA_DIR}")
        print("   Run this to download:")
        print("   git clone https://github.com/brunnergino/swimming-recognition-lap-counting.git datasets/iswc-swimming-2019")
        return

    # Step 1: Load raw data
    dataset = load_all_swimmers(DATA_DIR)
    print_statistics(dataset)

    # Step 2: Create windowed samples
    X_windows, y_windows, metadata = create_windowed_samples(dataset)

    # Step 3: Extract flat features (60-dim, compatible with your existing model)
    X_features = extract_statistical_features(X_windows)

    # Step 4: Split by swimmer
    splits = split_by_swimmer(X_features, y_windows, metadata)

    # Step 5: Export
    export_dataset(splits, OUTPUT_DIR)

    # Step 6: Also save the raw windows for CNN/LSTM training
    raw_output = OUTPUT_DIR / "raw_windows"
    raw_output.mkdir(parents=True, exist_ok=True)
    raw_splits = split_by_swimmer(X_windows, y_windows, metadata)
    for key, data in raw_splits.items():
        np.save(raw_output / f"{key}.npy", data)

    print(f"\n✅ Raw windowed data saved to {raw_output}/")
    print(f"   Shape: (n_samples, {WINDOW_SIZE}, 6) — ready for CNN/LSTM models")

    print("\n" + "=" * 60)
    print("NEXT STEPS")
    print("=" * 60)
    print("""
1. Train with flat features (compatible with your current model):
   from sklearn.ensemble import RandomForestClassifier
   X_train = np.load('datasets/processed/X_train.npy')
   y_train = np.load('datasets/processed/y_train.npy')
   clf = RandomForestClassifier(n_estimators=100)
   clf.fit(X_train, y_train)

2. Train with raw windows (CNN/LSTM for better accuracy):
   X_train = np.load('datasets/processed/raw_windows/X_train.npy')
   # Shape: (n_samples, 100, 6) — perfect for 1D CNN or LSTM

3. Label mapping:
   1=Freestyle, 2=Breaststroke, 3=Backstroke, 4=Butterfly
   (Note: different from your current model which uses alphabetical order)
""")


if __name__ == "__main__":
    main()
