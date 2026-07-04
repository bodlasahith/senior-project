import pandas as pd
import numpy as np

# Load the dataset
df = pd.read_csv('stroke_dataset.csv')

print("=== DATASET OVERVIEW ===")
print(f"Total samples: {len(df)}")
print(f"Shape: {df.shape}")
print(f"\nColumns: 60 IMU features + 2 head position + 1 stroke prob + 1 stroke label")

print("\n=== STROKE TYPES ===")
print(df['stroke_label'].value_counts().sort_values(ascending=False))

print("\n=== KEY INSIGHTS ===")
print(f"✓ 10 IMU sensors with 6 features each (3-axis acc + 3-axis gyro)")
print(f"✓ 5 different stroke types: {sorted(df['stroke_label'].unique())}")
print(f"✓ Head position tracking (x, y coordinates)")
print(f"✓ Stroke detection probability (0-1 range)")

print("\n=== SAMPLE DATA ===")
print(df.head(2))

print("\n=== MISSING VALUES ===")
print(df.isnull().sum())
