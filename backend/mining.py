
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
        JOIN dim_category c ON f.category_key = c.category_key
        ORDER BY d.full_date
    """)

    with engine.connect() as connection:
        df = pd.read_sql(query, connection)

    if len(df) < 5:
        return {
            "transactions_analyzed": len(df),
            "unusual_transactions": [],
            "message": "At least 5 transactions are needed.",
        }

    model = IsolationForest(
        contamination=0.10,
        random_state=42,
    )

    df["anomaly"] = model.fit_predict(df[["amount"]])
    unusual = df[df["anomaly"] == -1]

    unusual["date"] = unusual["date"].astype(str)
    unusual["amount"] = unusual["amount"].astype(float)

    return {
        "transactions_analyzed": len(df),
        "unusual_count": len(unusual),
        "unusual_transactions": unusual.to_dict(orient="records"),
        "note": "Unusual amounts are not necessarily fraudulent.",
    }
