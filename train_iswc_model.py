"""
train_iswc_model.py

Trains stroke classification models using the processed ISWC 2019 dataset
(output from load_iswc_dataset.py).

Two model options:
  1. Dense/Hybrid model on 60 statistical features (fast, TFLite-friendly)
  2. 1D CNN on raw 100×6 windows (higher accuracy, captures temporal patterns)

Usage:
    python train_iswc_model.py               # trains both models
    python train_iswc_model.py --model dense  # flat features only
    python train_iswc_model.py --model cnn    # raw windows only

Outputs:
    - iswc_stroke_model.h5             (Keras model)
    - iswc_stroke_model.tflite         (mobile-ready)
    - iswc_scaler.pkl                  (feature scaler for dense model)
    - iswc_label_encoder.pkl           (label decoder)
    - iswc_training_history.png        (loss/accuracy curves)
    - iswc_confusion_matrix.png        (per-class accuracy)
"""

import argparse
import numpy as np
from pathlib import Path
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
import matplotlib.pyplot as plt
import seaborn as sns
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, models
import joblib

# ─── PATHS ───────────────────────────────────────────────────────────────────────

PROJECT_DIR = Path(__file__).parent
PROCESSED_DIR = PROJECT_DIR / "datasets" / "processed"
RAW_WINDOWS_DIR = PROCESSED_DIR / "raw_windows"
OUTPUT_DIR = PROJECT_DIR  # save models to project root alongside existing ones

# Label mapping (ISWC dataset labels)
LABEL_NAMES = {1: "Freestyle", 2: "Breaststroke", 3: "Backstroke", 4: "Butterfly"}


# ─── DATA LOADING ────────────────────────────────────────────────────────────────

def load_flat_features():
    """Load the 60-feature statistical feature vectors."""
    print("Loading flat feature data...")
    X_train = np.load(PROCESSED_DIR / "X_train.npy")
    X_val = np.load(PROCESSED_DIR / "X_val.npy")
    X_test = np.load(PROCESSED_DIR / "X_test.npy")
    y_train = np.load(PROCESSED_DIR / "y_train.npy")
    y_val = np.load(PROCESSED_DIR / "y_val.npy")
    y_test = np.load(PROCESSED_DIR / "y_test.npy")

    print(f"  Train: {X_train.shape}, Val: {X_val.shape}, Test: {X_test.shape}")
    return X_train, X_val, X_test, y_train, y_val, y_test


def load_raw_windows():
    """Load the raw 100×6 windowed sensor data."""
    print("Loading raw window data...")
    X_train = np.load(RAW_WINDOWS_DIR / "X_train.npy")
    X_val = np.load(RAW_WINDOWS_DIR / "X_val.npy")
    X_test = np.load(RAW_WINDOWS_DIR / "X_test.npy")
    y_train = np.load(RAW_WINDOWS_DIR / "y_train.npy")
    y_val = np.load(RAW_WINDOWS_DIR / "y_val.npy")
    y_test = np.load(RAW_WINDOWS_DIR / "y_test.npy")

    print(f"  Train: {X_train.shape}, Val: {X_val.shape}, Test: {X_test.shape}")
    return X_train, X_val, X_test, y_train, y_val, y_test


def remap_labels(y_train, y_val, y_test):
    """
    Remap ISWC labels (1,2,3,4) to contiguous (0,1,2,3) for training.
    Returns remapped arrays and a LabelEncoder.
    """
    le = LabelEncoder()
    # Fit on all possible labels
    all_labels = np.array(list(LABEL_NAMES.keys()))
    le.fit(all_labels)

    # Override classes_ to use stroke names
    le.classes_ = np.array([LABEL_NAMES[l] for l in sorted(LABEL_NAMES.keys())])

    # Transform: 1→0, 2→1, 3→2, 4→3
    y_train_enc = y_train - 1
    y_val_enc = y_val - 1
    y_test_enc = y_test - 1

    return y_train_enc, y_val_enc, y_test_enc, le


# ─── MODEL ARCHITECTURES ────────────────────────────────────────────────────────

def build_dense_model(input_dim, num_classes):
    """Dense model for flat statistical features."""
    model = models.Sequential([
        layers.Input(shape=(input_dim,)),
        layers.Dense(256, activation='relu'),
        layers.BatchNormalization(),
        layers.Dropout(0.3),
        layers.Dense(128, activation='relu'),
        layers.BatchNormalization(),
        layers.Dropout(0.3),
        layers.Dense(64, activation='relu'),
        layers.BatchNormalization(),
        layers.Dropout(0.2),
        layers.Dense(32, activation='relu'),
        layers.Dense(num_classes, activation='softmax'),
    ])
    return model


def build_cnn_model(window_size, n_channels, num_classes):
    """1D CNN for raw sensor windows — captures temporal stroke patterns."""
    model = models.Sequential([
        layers.Input(shape=(window_size, n_channels)),

        # Block 1
        layers.Conv1D(64, kernel_size=7, activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.MaxPooling1D(2),
        layers.Dropout(0.2),

        # Block 2
        layers.Conv1D(128, kernel_size=5, activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.MaxPooling1D(2),
        layers.Dropout(0.2),

        # Block 3
        layers.Conv1D(128, kernel_size=3, activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.MaxPooling1D(2),
        layers.Dropout(0.2),

        # Block 4
        layers.Conv1D(64, kernel_size=3, activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.GlobalAveragePooling1D(),

        # Classifier
        layers.Dense(128, activation='relu'),
        layers.Dropout(0.3),
        layers.Dense(64, activation='relu'),
        layers.Dense(num_classes, activation='softmax'),
    ])
    return model


def build_hybrid_cnn_model(input_dim, num_classes):
    """Hybrid CNN+Dense for flat features (matches existing train_stroke_model.py)."""
    model = models.Sequential([
        layers.Input(shape=(input_dim, 1)),
        layers.Conv1D(32, kernel_size=5, activation='relu', padding='same'),
        layers.Conv1D(64, kernel_size=5, activation='relu', padding='same'),
        layers.MaxPooling1D(2),
        layers.Dropout(0.2),
        layers.Flatten(),
        layers.Dense(256, activation='relu'),
        layers.BatchNormalization(),
        layers.Dropout(0.3),
        layers.Dense(128, activation='relu'),
        layers.BatchNormalization(),
        layers.Dropout(0.2),
        layers.Dense(64, activation='relu'),
        layers.Dense(num_classes, activation='softmax'),
    ])
    return model


# ─── TRAINING ────────────────────────────────────────────────────────────────────

def train(model, X_train, X_val, y_train, y_val, epochs=100, batch_size=64):
    """Train with early stopping and LR reduction."""
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.001),
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy'],
    )

    callbacks = [
        keras.callbacks.EarlyStopping(
            monitor='val_loss', patience=15, restore_best_weights=True, verbose=1
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss', factor=0.5, patience=5, min_lr=1e-6, verbose=1
        ),
    ]

    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=epochs,
        batch_size=batch_size,
        callbacks=callbacks,
        verbose=1,
    )
    return history


# ─── EVALUATION ──────────────────────────────────────────────────────────────────

def evaluate(model, X_test, y_test, label_encoder, prefix="iswc"):
    """Evaluate and save confusion matrix."""
    y_pred = np.argmax(model.predict(X_test, verbose=0), axis=1)
    accuracy = accuracy_score(y_test, y_pred)

    print("\n" + "=" * 60)
    print(f"TEST SET RESULTS — Accuracy: {accuracy:.4f} ({accuracy*100:.1f}%)")
    print("=" * 60)
    print(classification_report(y_test, y_pred, target_names=label_encoder.classes_))

    # Confusion matrix
    cm = confusion_matrix(y_test, y_pred)
    plt.figure(figsize=(8, 6))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
                xticklabels=label_encoder.classes_,
                yticklabels=label_encoder.classes_)
    plt.title(f'Confusion Matrix — ISWC Model ({accuracy*100:.1f}% accuracy)')
    plt.ylabel('True Label')
    plt.xlabel('Predicted Label')
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / f'{prefix}_confusion_matrix.png', dpi=150)
    plt.close()
    print(f"✅ Saved {prefix}_confusion_matrix.png")

    return accuracy


def plot_history(history, prefix="iswc"):
    """Plot training curves."""
    fig, axes = plt.subplots(1, 2, figsize=(12, 4))

    axes[0].plot(history.history['loss'], label='Train')
    axes[0].plot(history.history['val_loss'], label='Validation')
    axes[0].set_title('Loss')
    axes[0].set_xlabel('Epoch')
    axes[0].legend()
    axes[0].grid(True)

    axes[1].plot(history.history['accuracy'], label='Train')
    axes[1].plot(history.history['val_accuracy'], label='Validation')
    axes[1].set_title('Accuracy')
    axes[1].set_xlabel('Epoch')
    axes[1].legend()
    axes[1].grid(True)

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / f'{prefix}_training_history.png', dpi=150)
    plt.close()
    print(f"✅ Saved {prefix}_training_history.png")


# ─── TFLITE CONVERSION ───────────────────────────────────────────────────────────

def convert_to_tflite(model, output_path):
    """Convert model to TFLite with quantization."""
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.target_spec.supported_ops = [
        tf.lite.OpsSet.TFLITE_BUILTINS,
        tf.lite.OpsSet.SELECT_TF_OPS,
    ]
    tflite_model = converter.convert()

    with open(output_path, 'wb') as f:
        f.write(tflite_model)

    size_mb = len(tflite_model) / 1024 / 1024
    print(f"✅ TFLite model saved: {output_path} ({size_mb:.2f} MB)")


# ─── MAIN ────────────────────────────────────────────────────────────────────────

def train_dense_model():
    """Train on flat 60-feature vectors."""
    print("\n" + "═" * 60)
    print("  TRAINING: Dense Model (60 statistical features)")
    print("═" * 60)

    X_train, X_val, X_test, y_train, y_val, y_test = load_flat_features()
    y_train, y_val, y_test, le = remap_labels(y_train, y_val, y_test)

    # Normalize
    scaler = StandardScaler()
    X_train = scaler.fit_transform(X_train)
    X_val = scaler.transform(X_val)
    X_test = scaler.transform(X_test)

    num_classes = len(le.classes_)
    input_dim = X_train.shape[1]
    print(f"\n  Input: {input_dim} features → {num_classes} classes")
    print(f"  Classes: {list(le.classes_)}")

    # Build & train
    model = build_hybrid_cnn_model(input_dim, num_classes)
    model.summary()

    # Reshape for CNN: (n, features, 1)
    X_train_r = X_train.reshape(*X_train.shape, 1)
    X_val_r = X_val.reshape(*X_val.shape, 1)
    X_test_r = X_test.reshape(*X_test.shape, 1)

    history = train(model, X_train_r, X_val_r, y_train, y_val, epochs=100, batch_size=64)
    plot_history(history, prefix="iswc_dense")
    accuracy = evaluate(model, X_test_r, y_test, le, prefix="iswc_dense")

    # Save
    model.save(OUTPUT_DIR / 'iswc_stroke_model_dense.h5')
    convert_to_tflite(model, OUTPUT_DIR / 'iswc_stroke_model_dense.tflite')
    joblib.dump(scaler, OUTPUT_DIR / 'iswc_scaler.pkl')
    joblib.dump(le, OUTPUT_DIR / 'iswc_label_encoder.pkl')
    print("✅ Saved scaler and label encoder")

    return model, accuracy


def train_cnn_model():
    """Train on raw 100×6 sensor windows."""
    print("\n" + "═" * 60)
    print("  TRAINING: 1D CNN Model (raw 100×6 windows)")
    print("═" * 60)

    X_train, X_val, X_test, y_train, y_val, y_test = load_raw_windows()
    y_train, y_val, y_test, le = remap_labels(y_train, y_val, y_test)

    # Normalize per-channel (across all samples)
    n_channels = X_train.shape[2]
    for ch in range(n_channels):
        mean = X_train[:, :, ch].mean()
        std = X_train[:, :, ch].std()
        X_train[:, :, ch] = (X_train[:, :, ch] - mean) / (std + 1e-7)
        X_val[:, :, ch] = (X_val[:, :, ch] - mean) / (std + 1e-7)
        X_test[:, :, ch] = (X_test[:, :, ch] - mean) / (std + 1e-7)

    window_size = X_train.shape[1]
    num_classes = len(le.classes_)
    print(f"\n  Input: ({window_size}, {n_channels}) → {num_classes} classes")
    print(f"  Classes: {list(le.classes_)}")

    # Build & train
    model = build_cnn_model(window_size, n_channels, num_classes)
    model.summary()

    history = train(model, X_train, X_val, y_train, y_val, epochs=100, batch_size=64)
    plot_history(history, prefix="iswc_cnn")
    accuracy = evaluate(model, X_test, y_test, le, prefix="iswc_cnn")

    # Save
    model.save(OUTPUT_DIR / 'iswc_stroke_model_cnn.h5')
    convert_to_tflite(model, OUTPUT_DIR / 'iswc_stroke_model_cnn.tflite')
    print("✅ CNN model saved")

    return model, accuracy


def main():
    parser = argparse.ArgumentParser(description="Train ISWC swimming stroke model")
    parser.add_argument('--model', choices=['dense', 'cnn', 'both'], default='both',
                        help="Which model to train (default: both)")
    args = parser.parse_args()

    print("╔══════════════════════════════════════════════════════════════╗")
    print("║  ISWC Swimming Stroke Model Training                       ║")
    print("║  Dataset: 40 swimmers · 30Hz smartwatch · 4 stroke types   ║")
    print("╚══════════════════════════════════════════════════════════════╝")

    # Check data exists
    if not PROCESSED_DIR.exists():
        print(f"\n❌ Processed data not found at: {PROCESSED_DIR}")
        print("   Run load_iswc_dataset.py first!")
        return

    results = {}

    if args.model in ('dense', 'both'):
        _, acc = train_dense_model()
        results['dense'] = acc

    if args.model in ('cnn', 'both'):
        _, acc = train_cnn_model()
        results['cnn'] = acc

    # Summary
    print("\n" + "═" * 60)
    print("  SUMMARY")
    print("═" * 60)
    for name, acc in results.items():
        print(f"  {name:8s}: {acc*100:.1f}% test accuracy")

    print(f"""
Next steps:
  1. Copy the best .tflite model to SwimAnalysisApp/assets/models/
  2. Update StrokeClassifier.js label order to match:
     ['Freestyle', 'Breaststroke', 'Backstroke', 'Butterfly']
  3. Update scaler parameters from iswc_scaler.pkl

To extract new scaler values for the app:
  python -c "import joblib; s=joblib.load('iswc_scaler.pkl'); print('mean:', s.mean_.tolist()); print('scale:', s.scale_.tolist())"
""")


if __name__ == "__main__":
    main()
