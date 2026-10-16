
import itertools
import math

import pandas as pd
from sqlalchemy import text
from sklearn.cluster import KMeans
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from database import engine


# ---------------------------------------------------------
# 1. ANOMALY DETECTION - ISOLATION FOREST
# ---------------------------------------------------------

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
            ON f.category_key = c.category_key
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
            "message": "No transactions available to analyze."
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
            "message": "No valid transactions available."
        }

    # Log transformation reduces the effect of very large amounts.
    df["log_amount"] = df["amount"].abs().apply(
        lambda amount: math.log1p(amount)
    )

    # Compare each transaction with its category's typical amount.
    category_median = df.groupby("category")["amount"].transform("median")
    df["amount_vs_category"] = (
        df["amount"] - category_median
    ).abs()

    # Transaction activity on the same calendar date.
    df["transactions_same_day"] = (
        df.groupby(df["date"].dt.date)["transaction_id"].transform("count")
    )

    features = df[
        [
            "log_amount",
            "amount_vs_category",
            "transactions_same_day"
        ]
    ].replace([float("inf"), -float("inf")], 0).fillna(0)

    # Fit the model on a reproducible sample if the dataset is very large.
    # The transparent high-amount rule is still applied to all transactions.
    max_model_rows = 100_000

    if len(df) >= 5:
        if len(df) > max_model_rows:
            sample_indices = features.sample(
                n=max_model_rows, random_state=42
            ).index
            model_features = features.loc[sample_indices]
        else:
            sample_indices = features.index
            model_features = features

        model = IsolationForest(
            n_estimators=100,
            contamination=0.05,
            random_state=42,
            n_jobs=-1
        )
        model.fit(model_features)

        df["model_anomaly"] = (
            model.predict(features) == -1
        )
        # Predictions for rows outside the training sample are valid:
        # Isolation Forest predicts on unseen rows after fitting.
    else:
        df["model_anomaly"] = False

    # Robust statistical rule: high compared with the overall median.
    median_amount = df["amount"].abs().median()
    absolute_deviations = (df["amount"].abs() - median_amount).abs()
    mad = absolute_deviations.median()

    if pd.notna(mad) and mad > 0:
        threshold = median_amount + 3 * 1.4826 * mad
    else:
        threshold = median_amount * 3

    df["high_amount"] = df["amount"].abs() > threshold

    # Repeated transaction amounts on the same date are review signals,
    # not proof of fraud.
    df["repeated_same_day"] = df.duplicated(
        subset=["date", "amount"],
        keep=False
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
            reasons.append("Unusually high amount")
        if row["model_anomaly"]:
            reasons.append("Isolation Forest anomaly")
        if row["repeated_same_day"]:
            reasons.append("Repeated amount on the same date")
        return "; ".join(reasons)

    unusual["reason"] = unusual.apply(explain, axis=1)
    unusual["date"] = unusual["date"].dt.strftime("%Y-%m-%d")
    unusual["amount"] = unusual["amount"].astype(float)

    # Avoid returning thousands of records to the web frontend.
    results = unusual.sort_values(
        by="amount", key=lambda values: values.abs(), ascending=False
    ).head(100)

    return {
        "technique": "Isolation Forest plus statistical rules",
        "transactions_analyzed": int(len(df)),
        "unusual_count": int(len(unusual)),
        "returned_count": int(len(results)),
        "unusual_transactions": results[
            ["transaction_id", "date", "category", "amount", "reason"]
        ].to_dict(orient="records"),
        "note": (
            "Alerts identify unusual patterns, not confirmed fraud. "
            "Repeated amounts can be legitimate."
        )
    }


# ---------------------------------------------------------
# 2. CLUSTERING - K-MEANS CUSTOMER SEGMENTATION
# ---------------------------------------------------------

def cluster_customers():
    query = text("""
        SELECT
            f.user_id,
            COUNT(*) AS transaction_count,
            AVG(ABS(f.amount)) AS average_amount,
            SUM(ABS(f.amount)) AS total_transaction_value,
            COUNT(DISTINCT f.category_key) AS category_count
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
            "message": "Not enough customer data to cluster."
        }

    feature_columns = [
        "transaction_count",
        "average_amount",
        "total_transaction_value",
        "category_count"
    ]

    df[feature_columns] = df[feature_columns].apply(
        pd.to_numeric, errors="coerce"
    )
    df = df.replace([float("inf"), -float("inf")], pd.NA)
    df = df.dropna(subset=feature_columns).copy()

    if len(df) < 3:
        return {
            "technique": "K-Means clustering",
            "customers_analyzed": int(len(df)),
            "clusters": [],
            "message": "At least 3 valid customers are required."
        }

    # Log transform skewed transaction features before scaling.
    for column in feature_columns:
        df[column] = df[column].clip(lower=0).apply(
            lambda value: math.log1p(value)
        )

    scaler = StandardScaler()
    scaled_features = scaler.fit_transform(df[feature_columns])

    number_of_clusters = min(3, len(df))

    model = KMeans(
        n_clusters=number_of_clusters,
        random_state=42,
        n_init=10
    )
    df["cluster"] = model.fit_predict(scaled_features)

    # Calculate interpretable summaries using original warehouse values.
    # Reloading original values avoids reporting log-transformed numbers.
    summary_query = text("""
        SELECT
            f.user_id,
            COUNT(*) AS transaction_count,
            AVG(ABS(f.amount)) AS average_amount,
            SUM(ABS(f.amount)) AS total_transaction_value,
            COUNT(DISTINCT f.category_key) AS category_count
        FROM fact_expenses f
        WHERE f.user_id IS NOT NULL
          AND f.amount IS NOT NULL
        GROUP BY f.user_id
        HAVING COUNT(*) >= 2
    """)

    with engine.connect() as connection:
        original = pd.read_sql(summary_query, connection)

    original = original.set_index("user_id")
    df["user_id"] = df["user_id"].astype(str)

    # Match the user IDs and report the original-value summaries.
    original.index = original.index.astype(str)
    df = df.join(
        original[[
            "transaction_count",
            "average_amount",
            "total_transaction_value",
            "category_count"
        ]].add_suffix("_original"),
        on="user_id"
    )

    clusters = []
    for cluster_id in sorted(df["cluster"].unique()):
        members = df[df["cluster"] == cluster_id]
        original_values = members[
            [
                "transaction_count_original",
                "average_amount_original",
                "total_transaction_value_original",
                "category_count_original"
            ]
        ]

        clusters.append({
            "cluster": int(cluster_id),
            "customer_count": int(len(members)),
            "average_transactions": round(
                float(original_values["transaction_count_original"].mean()), 2
            ),
            "average_transaction_amount": round(
                float(original_values["average_amount_original"].mean()), 2
            ),
            "average_total_transaction_value": round(
                float(original_values["total_transaction_value_original"].mean()), 2
            ),
            "average_distinct_categories": round(
                float(original_values["category_count_original"].mean()), 2
            )
        })

    return {
        "technique": "K-Means clustering",
        "customers_analyzed": int(len(df)),
        "number_of_clusters": int(number_of_clusters),
        "features": [
            "Transaction count",
            "Average transaction amount",
            "Total transaction value",
            "Distinct categories"
        ],
        "clusters": clusters,
        "note": (
            "Clusters describe transaction behaviour; they do not label "
            "customers as good, bad, or fraudulent."
        )
    }


# ---------------------------------------------------------
# 3. FREQUENT PATTERN MINING - CATEGORY CO-OCCURRENCE
# ---------------------------------------------------------

def frequent_patterns():
    # Each basket represents the distinct categories used by one customer
    # in one calendar month.
    query = text("""
        SELECT
            f.user_id,
            d.year,
            d.month,
            c.category_name AS category
        FROM fact_expenses f
        JOIN dim_date d
            ON f.date_key = d.date_key
        JOIN dim_category c
            ON f.category_key = c.category_key
        WHERE f.user_id IS NOT NULL
          AND c.category_name IS NOT NULL
        GROUP BY f.user_id, d.year, d.month, c.category_name
        ORDER BY f.user_id, d.year, d.month
    """)

    with engine.connect() as connection:
        df = pd.read_sql(query, connection)

    if df.empty:
        return {
            "technique": "Frequent pattern mining",
            "baskets_analyzed": 0,
            "patterns": [],
            "message": "No category data available."
        }

    df["basket_id"] = (
        df["user_id"].astype(str) + "_"
        + df["year"].astype(str) + "_"
        + df["month"].astype(str)
    )

    baskets = (
        df.groupby("basket_id")["category"]
        .apply(lambda categories: sorted(set(categories)))
        .tolist()
    )

    basket_count = len(baskets)

    if basket_count < 2:
        return {
            "technique": "Frequent pattern mining",
            "baskets_analyzed": int(basket_count),
            "patterns": [],
            "message": "Not enough customer-month baskets."
        }

    # Limit basket count to keep the hosted API responsive.
    # The sample is deterministic.
    max_baskets = 20_000
    if len(baskets) > max_baskets:
        step = len(baskets) / max_baskets
        baskets = [
            baskets[int(i * step)] for i in range(max_baskets)
        ]

    sampled_count = len(baskets)
    minimum_support = 0.02
    minimum_count = max(2, math.ceil(minimum_support * sampled_count))

    item_counts = {}
    pair_counts = {}
    triple_counts = {}

    for basket in baskets:
        unique_items = sorted(set(basket))

        for item in unique_items:
            item_counts[item] = item_counts.get(item, 0) + 1

        # Pair and triple patterns are calculated only within each basket.
        for pair in itertools.combinations(unique_items, 2):
            pair_counts[pair] = pair_counts.get(pair, 0) + 1

        for triple in itertools.combinations(unique_items, 3):
            triple_counts[triple] = triple_counts.get(triple, 0) + 1

    patterns = []

    for items, counts in [
        (pair_counts, 2),
        (triple_counts, 3)
    ]:
        for itemset, occurrence_count in items.items():
            if occurrence_count < minimum_count:
                continue

            patterns.append({
                "categories": list(itemset),
                "item_count": counts,
                "occurrences": int(occurrence_count),
                "support": round(occurrence_count / sampled_count, 4)
            })

    patterns.sort(
        key=lambda item: (
            item["support"],
            item["occurrences"],
            item["item_count"]
        ),
        reverse=True
    )

    return {
        "technique": "Frequent category pattern mining",
        "basket_definition": "Distinct categories per customer per month",
        "baskets_analyzed": int(sampled_count),
        "minimum_support": minimum_support,
        "minimum_occurrences": int(minimum_count),
        "pattern_count": int(len(patterns)),
        "patterns": patterns[:50],
        "note": (
            "Patterns show categories occurring together in a customer-month. "
            "They do not establish causation or prove fraud."
        )
    }
