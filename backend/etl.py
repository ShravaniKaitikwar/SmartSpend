
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
INPUT_FILE = PROJECT_ROOT / "data" / "transactions.csv"
OUTPUT_FILE = PROJECT_ROOT / "data" / "transactions_clean.csv"


def extract_data(path: Path) -> pd.DataFrame:
    """Extract transaction data from CSV."""
    return pd.read_csv(path)


def transform_data(df: pd.DataFrame) -> pd.DataFrame:
    """Clean and validate transaction records."""
    df = df.copy()

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")

    df["category"] = df["category"].str.strip().str.title()
    df["payment_method"] = df["payment_method"].str.strip()

    df = df.dropna(
        subset=[
            "transaction_id",
            "date",
            "category",
            "payment_method",
            "amount",
        ]
    )

    df = df[df["amount"] > 0]
    df = df.drop_duplicates(subset=["transaction_id"])

    return df


def load_data(df: pd.DataFrame, path: Path) -> None:
    """Load cleaned data into a CSV output for inspection."""
    df.to_csv(path, index=False)


def main():
    raw_data = extract_data(INPUT_FILE)
    clean_data = transform_data(raw_data)
    load_data(clean_data, OUTPUT_FILE)

    print(f"Extracted records: {len(raw_data)}")
    print(f"Clean records: {len(clean_data)}")
    print(f"Total spending: ₹{clean_data['amount'].sum():.2f}")
    print(f"Cleaned data saved to: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
