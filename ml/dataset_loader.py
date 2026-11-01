"""
MongoTrace Dataset Loader & Statistical Validator
Loads, validates, and provides clean feature matrices for model training and evaluation.
"""

import os
import json
from typing import Tuple, Dict, Any
import numpy as np
import pandas as pd

from .feature_extractor import FEATURE_NAMES

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

def load_train_data() -> Tuple[pd.DataFrame, np.ndarray, np.ndarray]:
    """
    Load training dataset.
    Returns:
        df: Full training DataFrame
        X: Feature matrix of shape (N, 9)
        y: Ground truth labels (0=Normal, 1=Anomaly)
    """
    csv_path = os.path.join(DATA_DIR, "cybersecurity_telemetry_train.csv")
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Training CSV not found at {csv_path}. Run prepare_dataset.py first.")

    df = pd.read_csv(csv_path)
    # Validate no missing values
    if df[FEATURE_NAMES].isnull().any().any():
        df[FEATURE_NAMES] = df[FEATURE_NAMES].fillna(0.0)

    X = df[FEATURE_NAMES].values
    y = df["label"].values.astype(int)
    return df, X, y

def load_validation_data() -> Tuple[pd.DataFrame, np.ndarray, np.ndarray]:
    """
    Load validation/test dataset.
    Returns:
        df: Full validation DataFrame
        X: Feature matrix of shape (M, 9)
        y: Ground truth labels (0=Normal, 1=Anomaly)
    """
    csv_path = os.path.join(DATA_DIR, "cybersecurity_telemetry_val.csv")
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Validation CSV not found at {csv_path}. Run prepare_dataset.py first.")

    df = pd.read_csv(csv_path)
    if df[FEATURE_NAMES].isnull().any().any():
        df[FEATURE_NAMES] = df[FEATURE_NAMES].fillna(0.0)

    X = df[FEATURE_NAMES].values
    y = df["label"].values.astype(int)
    return df, X, y

def get_dataset_metadata() -> Dict[str, Any]:
    """Load dataset documentation and provenance metadata."""
    meta_path = os.path.join(DATA_DIR, "dataset_metadata.json")
    if os.path.exists(meta_path):
        with open(meta_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def print_dataset_summary():
    """Print statistical breakdown of features and anomaly distribution."""
    train_df, X_train, y_train = load_train_data()
    val_df, X_val, y_val = load_validation_data()

    print("=================================================================")
    print(" MongoTrace Dataset Summary & Statistical Breakdown")
    print("=================================================================")
    print(f"Features ({len(FEATURE_NAMES)}): {', '.join(FEATURE_NAMES)}")
    print(f"Train Records:      {len(train_df):,} | Normal: {(y_train == 0).sum():,} | Anomaly: {(y_train == 1).sum():,} ({y_train.mean():.2%})")
    print(f"Validation Records: {len(val_df):,} | Normal: {(y_val == 0).sum():,} | Anomaly: {(y_val == 1).sum():,} ({y_val.mean():.2%})\n")

    print("--- Train Feature Statistics (Mean +/- Std) ---")
    for feat in FEATURE_NAMES:
        mean_val = train_df[feat].mean()
        std_val = train_df[feat].std()
        min_val = train_df[feat].min()
        max_val = train_df[feat].max()
        print(f"  * {feat:<16}: {mean_val:>10.2f} +/- {std_val:<10.2f} (min: {min_val:>8.2f}, max: {max_val:>10.2f})")

    print("\n--- Attack Category Breakdown (Train) ---")
    cat_counts = train_df["attack_category"].value_counts()
    for cat, count in cat_counts.items():
        print(f"  * {cat:<24}: {count:>5} records ({count / len(train_df):.2%})")
    print("=================================================================\n")

if __name__ == "__main__":
    print_dataset_summary()

