
import pandas as pd
from sklearn.ensemble import IsolationForest
from sqlalchemy import text

from database import engine


def detect_unusual_spending():
    query = text("""
        SELECT
            f.transaction_id,
            d.full_date AS date,
            c.category_name AS category,
            f.amount
        FROM fact_expenses f
        JOIN dim_date d ON f.date_key = d.date_key
       JOIN dim_category c ON f.category_id = c.category_id
        ORDER BY d.full_date
    """)

    with engine.connect() as connection:
        df = pd.read_sql(query, connection)

    if df.empty:
        return {
            "transactions_analyzed": 0,
            "unusual_count": 0,
            "unusual_transactions": [],
            "message": "No transactions available to analyze.",
        }

    df["date"] = pd.to_datetime(df["date"])
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    df = df.dropna(subset=["date", "amount"]).copy()

    if df.empty:
        return {
            "transactions_analyzed": 0,
            "unusual_count": 0,
            "unusual_transactions": [],
            "message": "No valid transactions available.",
        }

    # Features for anomaly detection
    df["log_amount"] = df["amount"].clip(lower=0).apply(
        lambda x: __import__("math").log1p(x)
    )

    df["category_median"] = df.groupby("category")["amount"].transform(
        "median"
    )
    df["category_median"] = df["category_median"].fillna(
        df["amount"].median()
    )

    df["amount_vs_category"] = (
        df["amount"] - df["category_median"]
    ).abs()

    # Count transactions on the same date
    df["transactions_same_day"] = df.groupby("date")["transaction_id"].transform(
        "count"
    )

    # Isolation Forest needs enough rows to be meaningful
    if len(df) >= 5:
        features = df[
            ["log_amount", "amount_vs_category", "transactions_same_day"]
        ].fillna(0)

        model = IsolationForest(
            contamination=min(0.15, max(0.05, 2 / len(df))),
            random_state=42,
        )
        df["model_anomaly"] = model.fit_predict(features) == -1
    else:
        df["model_anomaly"] = False

    # Additional transparent rule: unusually high compared with overall spending
    median_amount = df["amount"].median()
    mad = (df["amount"] - median_amount).abs().median()

    if mad > 0:
        df["high_amount"] = (
            df["amount"] > median_amount + 3 * 1.4826 * mad
        )
    else:
        df["high_amount"] = df["amount"] > median_amount * 3

    df["repeated_same_day"] = df.duplicated(
        subset=["date", "amount"], keep=False
    )

    df["is_unusual"] = (
        df["model_anomaly"]
        | df["high_amount"]
        | df["repeated_same_day"]
    )

    unusual = df[df["is_unusual"]].copy()

    def explain(row):
        reasons = []
        if row["high_amount"]:
            reasons.append("Amount unusually high")
        if row["model_anomaly"]:
            reasons.append("Isolation Forest anomaly")
        if row["repeated_same_day"]:
            reasons.append("Same amount appears multiple times on this date")
        return "; ".join(reasons)

    unusual["reason"] = unusual.apply(explain, axis=1)
    unusual["date"] = unusual["date"].dt.strftime("%Y-%m-%d")
    unusual["amount"] = unusual["amount"].astype(float)

    return {
        "transactions_analyzed": len(df),
        "unusual_count": len(unusual),
        "unusual_transactions": unusual[
            ["transaction_id", "date", "category", "amount", "reason"]
        ].to_dict(orient="records"),
        "note": (
            "Alerts indicate unusual patterns, not confirmed fraud. "
            "Repeated amounts may be legitimate."
        ),
    }
