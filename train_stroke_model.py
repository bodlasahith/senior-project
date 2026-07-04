"""
Training script for swim stroke recognition using the Kaggle dataset.
Supports both IMU-based and multi-modal approaches.
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
import matplotlib.pyplot as plt
import seaborn as sns
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, models
import pickle
import joblib

# ============================================================================
# DATA LOADING & PREPROCESSING
# ============================================================================

def load_and_prepare_data(csv_path, test_size=0.15, val_size=0.15, random_state=42):
    """Load dataset and prepare train/val/test splits."""
    
    print("📚 Loading dataset...")
    df = pd.read_csv(csv_path)
    
    # Separate features and labels
    X = df.drop(['stroke_label', 'head_x', 'head_y', 'stroke_prob'], axis=1)
    y = df['stroke_label']
    
    print(f"   ✓ Loaded {len(df)} samples with {X.shape[1]} features")
    print(f"   ✓ Stroke distribution: {y.value_counts().to_dict()}")
    
    # Encode labels
    label_encoder = LabelEncoder()
    y_encoded = label_encoder.fit_transform(y)
    
    # Split data: 70% train, 15% val, 15% test
    X_temp, X_test, y_temp, y_test = train_test_split(
        X, y_encoded, test_size=test_size, random_state=random_state, stratify=y_encoded
    )
    
    val_size_adjusted = val_size / (1 - test_size)
    X_train, X_val, y_train, y_val = train_test_split(
        X_temp, y_temp, test_size=val_size_adjusted, random_state=random_state, stratify=y_temp
    )
    
    # Normalize features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_val_scaled = scaler.transform(X_val)
    X_test_scaled = scaler.transform(X_test)
    
    print(f"\n✓ Data split:")
    print(f"   Train: {len(X_train)} samples")
    print(f"   Validation: {len(X_val)} samples")
    print(f"   Test: {len(X_test)} samples")
    
    return (X_train_scaled, X_val_scaled, X_test_scaled,
            y_train, y_val, y_test,
            label_encoder, scaler)


# ============================================================================
# MODEL ARCHITECTURES
# ============================================================================

def build_dense_model(input_shape, num_classes):
    """
    Simple dense neural network for IMU data.
    Good baseline for tabular sensor data.
    """
    model = models.Sequential([
        layers.Input(shape=(input_shape,)),
        
        # Feature extraction
        layers.Dense(256, activation='relu'),
        layers.BatchNormalization(),
        layers.Dropout(0.3),
        
        layers.Dense(128, activation='relu'),
        layers.BatchNormalization(),
        layers.Dropout(0.3),
        
        layers.Dense(64, activation='relu'),
        layers.BatchNormalization(),
        layers.Dropout(0.2),
        
        # Classification
        layers.Dense(32, activation='relu'),
        layers.Dense(num_classes, activation='softmax')
    ])
    
    return model


def build_lstm_model(input_shape, num_classes, sequence_length=10):
    """
    LSTM model for sequential IMU data.
    Better captures temporal patterns in stroke movements.
    """
    # Reshape data for LSTM (add sequence dimension)
    model = models.Sequential([
        layers.Input(shape=(input_shape,)),
        layers.Reshape((sequence_length, input_shape // sequence_length)),
        
        # LSTM layers for temporal feature extraction
        layers.LSTM(128, activation='relu', return_sequences=True),
        layers.Dropout(0.3),
        
        layers.LSTM(64, activation='relu', return_sequences=False),
        layers.Dropout(0.3),
        
        # Dense classification head
        layers.Dense(32, activation='relu'),
        layers.Dropout(0.2),
        layers.Dense(num_classes, activation='softmax')
    ])
    
    return model


def build_cnn1d_model(input_shape, num_classes):
    """
    1D CNN model for IMU data.
    Excellent for extracting local patterns from sensor streams.
    """
    model = models.Sequential([
        layers.Input(shape=(input_shape, 1)),
        
        # Convolutional blocks
        layers.Conv1D(64, kernel_size=3, activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.MaxPooling1D(2),
        layers.Dropout(0.2),
        
        layers.Conv1D(128, kernel_size=3, activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.MaxPooling1D(2),
        layers.Dropout(0.2),
        
        layers.Conv1D(64, kernel_size=3, activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.MaxPooling1D(2),
        layers.Dropout(0.2),
        
        # Global pooling and dense layers
        layers.GlobalAveragePooling1D(),
        layers.Dense(128, activation='relu'),
        layers.Dropout(0.3),
        layers.Dense(64, activation='relu'),
        layers.Dense(num_classes, activation='softmax')
    ])
    
    return model


def build_hybrid_model(input_shape, num_classes):
    """
    Hybrid model combining CNN and Dense layers.
    Best overall performance for this type of data.
    """
    model = models.Sequential([
        layers.Input(shape=(input_shape, 1)),
        
        # CNN feature extraction
        layers.Conv1D(32, kernel_size=5, activation='relu', padding='same'),
        layers.Conv1D(64, kernel_size=5, activation='relu', padding='same'),
        layers.MaxPooling1D(2),
        layers.Dropout(0.2),
        
        # Flatten and dense layers
        layers.Flatten(),
        layers.Dense(256, activation='relu'),
        layers.BatchNormalization(),
        layers.Dropout(0.3),
        
        layers.Dense(128, activation='relu'),
        layers.BatchNormalization(),
        layers.Dropout(0.2),
        
        layers.Dense(64, activation='relu'),
        layers.Dense(num_classes, activation='softmax')
    ])
    
    return model


# ============================================================================
# TRAINING & EVALUATION
# ============================================================================

def train_model(model, X_train, X_val, y_train, y_val, epochs=100, batch_size=32):
    """Train the model with callbacks."""
    
    callbacks = [
        keras.callbacks.EarlyStopping(
            monitor='val_loss',
            patience=15,
            restore_best_weights=True,
            verbose=1
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=5,
            min_lr=1e-7,
            verbose=1
        ),
    ]
    
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=epochs,
        batch_size=batch_size,
        callbacks=callbacks,
        verbose=1
    )
    
    return history


def evaluate_model(model, X_test, y_test, label_encoder):
    """Evaluate model on test set."""
    
    y_pred = model.predict(X_test, verbose=0)
    y_pred_classes = np.argmax(y_pred, axis=1)
    
    accuracy = accuracy_score(y_test, y_pred_classes)
    
    print("\n" + "="*60)
    print("📊 TEST SET EVALUATION")
    print("="*60)
    print(f"\nOverall Accuracy: {accuracy:.4f}")
    
    print("\nClassification Report:")
    print(classification_report(
        y_test, y_pred_classes,
        target_names=label_encoder.classes_
    ))
    
    cm = confusion_matrix(y_test, y_pred_classes)
    
    # Plot confusion matrix
    plt.figure(figsize=(10, 8))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
                xticklabels=label_encoder.classes_,
                yticklabels=label_encoder.classes_)
    plt.title('Confusion Matrix - Stroke Classification')
    plt.ylabel('True Label')
    plt.xlabel('Predicted Label')
    plt.tight_layout()
    plt.savefig('confusion_matrix.png', dpi=300)
    print("\n✓ Confusion matrix saved as 'confusion_matrix.png'")
    
    return accuracy, y_pred


def plot_training_history(history):
    """Plot training and validation curves."""
    
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    
    # Loss
    axes[0].plot(history.history['loss'], label='Training Loss')
    axes[0].plot(history.history['val_loss'], label='Validation Loss')
    axes[0].set_xlabel('Epoch')
    axes[0].set_ylabel('Loss')
    axes[0].set_title('Model Loss Over Epochs')
    axes[0].legend()
    axes[0].grid(True)
    
    # Accuracy
    axes[1].plot(history.history['accuracy'], label='Training Accuracy')
    axes[1].plot(history.history['val_accuracy'], label='Validation Accuracy')
    axes[1].set_xlabel('Epoch')
    axes[1].set_ylabel('Accuracy')
    axes[1].set_title('Model Accuracy Over Epochs')
    axes[1].legend()
    axes[1].grid(True)
    
    plt.tight_layout()
    plt.savefig('training_history.png', dpi=300)
    print("✓ Training history saved as 'training_history.png'")


# ============================================================================
# MODEL CONVERSION FOR MOBILE
# ============================================================================

def convert_to_tflite(model, output_path='stroke_model.tflite'):
    """Convert Keras model to TensorFlow Lite for mobile deployment."""
    
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.target_spec.supported_ops = [
        tf.lite.OpsSet.TFLITE_BUILTINS,
        tf.lite.OpsSet.SELECT_TF_OPS
    ]
    
    tflite_model = converter.convert()
    
    with open(output_path, 'wb') as f:
        f.write(tflite_model)
    
    print(f"\n✓ TensorFlow Lite model saved: {output_path}")
    print(f"  File size: {len(tflite_model) / 1024 / 1024:.2f} MB")


# ============================================================================
# MAIN TRAINING PIPELINE
# ============================================================================

def main():
    """Main training pipeline."""
    
    # Load and prepare data
    (X_train, X_val, X_test, y_train, y_val, y_test,
     label_encoder, scaler) = load_and_prepare_data('stroke_dataset.csv')
    
    # Get number of classes
    num_classes = len(label_encoder.classes_)
    input_shape = X_train.shape[1]
    
    print(f"\n✓ Input shape: {input_shape}")
    print(f"✓ Number of classes: {num_classes}")
    print(f"✓ Classes: {list(label_encoder.classes_)}")
    
    # Build model
    print("\n🏗️  Building model...")
    model = build_hybrid_model(input_shape, num_classes)
    
    # Reshape data for CNN input if needed
    X_train_reshaped = X_train.reshape(*X_train.shape, 1)
    X_val_reshaped = X_val.reshape(*X_val.shape, 1)
    X_test_reshaped = X_test.reshape(*X_test.shape, 1)
    
    model.summary()
    
    # Compile model
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.001),
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy']
    )
    
    # Train model
    print("\n🚀 Training model...")
    history = train_model(
        model, 
        X_train_reshaped, X_val_reshaped, 
        y_train, y_val,
        epochs=150, 
        batch_size=32
    )
    
    # Plot training history
    plot_training_history(history)
    
    # Evaluate on test set
    accuracy, predictions = evaluate_model(model, X_test_reshaped, y_test, label_encoder)
    
    # Save model
    print("\n💾 Saving models...")
    model.save('stroke_classification_model.h5')
    print("✓ Keras model saved: stroke_classification_model.h5")
    
    # Save for mobile (TFLite)
    convert_to_tflite(model, 'stroke_classification_model.tflite')
    
    # Save preprocessing objects
    joblib.dump(scaler, 'scaler.pkl')
    joblib.dump(label_encoder, 'label_encoder.pkl')
    print("✓ Scaler and label encoder saved")
    
    print("\n" + "="*60)
    print("✅ TRAINING COMPLETE!")
    print("="*60)
    print(f"\nFinal Test Accuracy: {accuracy:.4f}")
    print("\nNext steps:")
    print("1. Deploy stroke_classification_model.tflite to your mobile app")
    print("2. Use scaler.pkl for preprocessing new sensor data")
    print("3. Use label_encoder.pkl to decode predictions")
    
    return model, history, scaler, label_encoder


if __name__ == "__main__":
    model, history, scaler, label_encoder = main()
