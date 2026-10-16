
import logging
import math

import pandas as pd
from sqlalchemy import text
from sklearn.cluster import KMeans
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from database import engine

logger = logging.getLogger(__name__)


# =========================================================
# 1. ANOMALY DETECTION - ISOLATION FOREST
# =========================================================

def detect_unusual_spending():
    query = text("""
        SELECT
            f.transaction_id,
            d.full_date AS date,
            c.category_name AS category,
            f.amount
        FROM fact_expenses f
        JOIN dim_date d
            ON f.date_key = d.date_key
        JOIN dim_category c
            ON f.category_id = c.category_id
        WHERE f.amount IS NOT NULL
        ORDER BY d.full_date
    """)

    with engine.connect() as connection:
        df = pd.read_sql(query, connection)

    if df.empty:
        return {
            "technique": "Isolation Forest",
            "transactions_analyzed": 0,
            "unusual_count": 0,
            "unusual_transactions": [],
            "message": "No transactions available to analyze.",
        }

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    df = df.dropna(subset=["date", "amount"]).copy()

    if df.empty:
        return {
            "technique": "Isolation Forest",
            "transactions_analyzed": 0,
            "unusual_count": 0,
            "unusual_transactions": [],
            "message": "No valid transactions available.",
        }

    # Feature 1: Log-transformed transaction amount.
    df["log_amount"] = df["amount"].abs().map(math.log1p)

    # Feature 2: Deviation from the category's typical amount.
    category_median = df.groupby("category")["amount"].transform(
        lambda values: values.abs().median()
    )
    df["amount_vs_category"] = (
        df["amount"].abs() - category_median
    ).abs()

    # Feature 3: Number of transactions on the same date.
    df["transactions_same_day"] = (
        df.groupby(df["date"].dt.date)["transaction_id"]
        .transform("count")
    )

    feature_columns = [
        "log_amount",
        "amount_vs_category",
        "transactions_same_day",
    ]

    features = (
        df[feature_columns]
        .replace([float("inf"), -float("inf")], 0)
        .fillna(0)
    )

    # Fit Isolation Forest on a sample to control memory usage.
    max_training_rows = 100_000

    if len(df) >= 5:
        if len(df) > max_training_rows:
            training_features = features.sample(
                n=max_training_rows,
                random_state=42,
            )
        else:
            training_features = features

        model = IsolationForest(
            n_estimators=100,
            contamination=0.05,
            random_state=42,
            n_jobs=-1,
        )

        model.fit(training_features)
        df["model_anomaly"] = model.predict(features) == -1
    else:
        df["model_anomaly"] = False

    # Robust statistical threshold for unusually large amounts.
    absolute_amount = df["amount"].abs()
    median_amount = absolute_amount.median()
    mad = (absolute_amount - median_amount).abs().median()

    if pd.notna(mad) and mad > 0:
        threshold = median_amount + 3 * 1.4826 * mad
    else:
        threshold = median_amount * 3

    df["high_amount"] = absolute_amount > threshold

    # Repeated amounts are review signals, not proof of fraud.
    df["repeated_same_day"] = df.duplicated(
        subset=["date", "amount"],
        keep=False,
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
            reasons.append("Unusually high transaction amount")

        if row["model_anomaly"]:
            reasons.append("Isolation Forest anomaly")

        if row["repeated_same_day"]:
            reasons.append("Repeated amount on the same date")

        return "; ".join(reasons)

    unusual["reason"] = unusual.apply(explain, axis=1)
    unusual["date"] = unusual["date"].dt.strftime("%Y-%m-%d")
    unusual["amount"] = unusual["amount"].astype(float)

    # Return the largest unusual amounts first, capped at 100 results.
    unusual = unusual.assign(
        _absolute_amount=unusual["amount"].abs()
    )
    results = unusual.nlargest(100, "_absolute_amount")
    results = results.drop(columns=["_absolute_amount"])

    return {
        "technique": "Isolation Forest with statistical rules",
        "transactions_analyzed": int(len(df)),
        "unusual_count": int(len(unusual)),
        "returned_count": int(len(results)),
        "unusual_transactions": results[
            ["transaction_id", "date", "category", "amount", "reason"]
        ].to_dict(orient="records"),
        "note": (
            "Unusual patterns are not confirmed fraud. "
            "Repeated amounts may be legitimate."
        ),
    }


# =========================================================
# 2. CLUSTERING - K-MEANS CUSTOMER SEGMENTATION
# =========================================================

def cluster_customers():
    query = text("""
        SELECT
            f.user_id,
            COUNT(*) AS transaction_count,
            AVG(ABS(f.amount)) AS average_amount,
            SUM(ABS(f.amount)) AS total_transaction_value,
            COUNT(DISTINCT f.category_id) AS category_count
        FROM fact_expenses f
        WHERE f.user_id IS NOT NULL
          AND f.amount IS NOT NULL
        GROUP BY f.user_id
        HAVING COUNT(*) >= 2
    """)

    with engine.connect() as connection:
        df = pd.read_sql(query, connection)

    if df.empty:
        return {
            "technique": "K-Means clustering",
            "customers_analyzed": 0,
            "clusters": [],
            "message": "No customer data available for clustering.",
        }

    feature_columns = [
        "transaction_count",
        "average_amount",
        "total_transaction_value",
        "category_count",
    ]

    df[feature_columns] = df[feature_columns].apply(
        pd.to_numeric,
        errors="coerce",
    )

    df = (
        df.replace([float("inf"), -float("inf")], float("nan"))
        .dropna(subset=feature_columns)
        .copy()
    )

    if len(df) < 3:
        return {
            "technique": "K-Means clustering",
            "customers_analyzed": int(len(df)),
            "clusters": [],
            "message": "At least 3 valid customers are required.",
        }

    original = df[feature_columns].copy()

    # Transform skewed data, then standardize the features.
    transformed = df[feature_columns].clip(lower=0).apply(
        lambda column: column.map(math.log1p)
    )

    scaler = StandardScaler()
    scaled_features = scaler.fit_transform(transformed)

    number_of_clusters = min(3, len(df))

    model = KMeans(
        n_clusters=number_of_clusters,
        random_state=42,
        n_init=10,
    )

    df["cluster"] = model.fit_predict(scaled_features)

    clusters = []

    for cluster_id in sorted(df["cluster"].unique()):
        positions = df.index[df["cluster"] == cluster_id]
        members = original.loc[positions]

        clusters.append({
            "cluster": int(cluster_id),
            "customer_count": int(len(members)),
            "average_transactions": round(
                float(members["transaction_count"].mean()), 2
            ),
            "average_transaction_amount": round(
                float(members["average_amount"].mean()), 2
            ),
            "average_total_transaction_value": round(
                float(members["total_transaction_value"].mean()), 2
            ),
            "average_distinct_categories": round(
                float(members["category_count"].mean()), 2
            ),
        })

    return {
        "technique": "K-Means clustering",
        "customers_analyzed": int(len(df)),
        "number_of_clusters": int(number_of_clusters),
        "features": feature_columns,
        "clusters": clusters,
        "note": (
            "Clusters represent transaction behaviour, not customer "
            "quality or confirmed fraud."
        ),
    }


# =========================================================
# 3. FREQUENT PATTERN MINING - FP-GROWTH
# =========================================================

def frequent_patterns():
    query = text("""
        SELECT DISTINCT
            f.user_id,
            d.year,
            d.month,
            c.category_name AS category
        FROM fact_expenses f
        JOIN dim_date d
            ON f.date_key = d.date_key
        JOIN dim_category c
            ON f.category_id = c.category_id
        WHERE f.user_id IS NOT NULL
          AND c.category_name IS NOT NULL
        ORDER BY f.user_id, d.year, d.month
    """)

    with engine.connect() as connection:
        df = pd.read_sql(query, connection)

    if df.empty:
        return {
            "technique": "FP-Growth",
            "baskets_analyzed": 0,
            "patterns": [],
            "message": "No category data available.",
        }

    # One basket = distinct categories used by one customer in one month.
    df["basket_id"] = (
        df["user_id"].astype(str)
        + "_"
        + df["year"].astype(str)
        + "_"
        + df["month"].astype(str)
    )

    baskets = (
        df.groupby("basket_id")["category"]
        .apply(lambda values: sorted(set(values)))
        .tolist()
    )

    if len(baskets) < 2:
        return {
            "technique": "FP-Growth",
            "baskets_analyzed": int(len(baskets)),
            "patterns": [],
            "message": "Not enough customer-month baskets.",
        }

    # Sample deterministically if there are too many baskets.
    max_baskets = 20_000

    if len(baskets) > max_baskets:
        step = len(baskets) / max_baskets
        baskets = [
            baskets[int(i * step)]
            for i in range(max_baskets)
        ]

    try:
        from mlxtend.frequent_patterns import fpgrowth
        from mlxtend.preprocessing import TransactionEncoder
    except ImportError as exc:
        logger.exception("FP-Growth dependency is missing")
        raise RuntimeError(
            "FP-Growth requires mlxtend. Add mlxtend to requirements.txt."
        ) from exc

    encoder = TransactionEncoder()
    encoded_array = encoder.fit(baskets).transform(baskets)

    basket_df = pd.DataFrame(
        encoded_array,
        columns=encoder.columns_,
    )

    minimum_support = 0.02

    itemsets = fpgrowth(
        basket_df,
        min_support=minimum_support,
        use_colnames=True,
        max_len=3,
    )

    patterns = []

    for _, row in itemsets.iterrows():
        categories = sorted(list(row["itemsets"]))

        # Report combinations of two or three categories.
        if len(categories) < 2:
            continue

        support = float(row["support"])

        patterns.append({
            "categories": categories,
            "item_count": len(categories),
            "support": round(support, 4),
            "occurrences": int(round(support * len(baskets))),
        })

    patterns.sort(
        key=lambda item: (
            item["support"],
            item["occurrences"],
        ),
        reverse=True,
    )

    return {
        "technique": "FP-Growth",
        "basket_definition": (
            "Distinct categories per customer per month"
        ),
        "baskets_analyzed": int(len(baskets)),
        "minimum_support": minimum_support,
        "pattern_count": int(len(patterns)),
        "patterns": patterns[:50],
        "note": (
            "Support shows how often categories occur together in the "
            "defined baskets. It does not prove causation or fraud."
        ),
    }
