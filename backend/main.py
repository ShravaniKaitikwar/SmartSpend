
import logging
from datetime import date
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from database import engine
from olap import roll_up, slice_data, dice_data, pivot_data

app = FastAPI(title="SmartSpend API")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://smart-spend-eewanovw0-shra6.vercel.app",
    "https://smart-spend-roan-five.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Demo fallback values, used only when a query fails.
DEMO_SUMMARY = {
    "transaction_count": 10,
    "total_spending": 6438.0,
    "average_spending": 643.8,
    "data_source": "demo_fallback",
}

DEMO_CATEGORIES = [
    {"category": "Shopping", "total": 1800.0},
    {"category": "Food", "total": 1200.0},
    {"category": "Travel", "total": 950.0},
    {"category": "Bills", "total": 900.0},
    {"category": "Education", "total": 800.0},
    {"category": "Healthcare", "total": 488.0},
    {"category": "Entertainment", "total": 300.0},
]

DEMO_ANOMALIES = {
    "transactions_analyzed": 10,
    "unusual_count": 2,
    "unusual_transactions": [
        {
            "transaction_id": 7,
            "date": "2026-10-02",
            "category": "Shopping",
            "amount": 1200.0,
            "reason": "Demo alert: unusual amount",
        },
        {
            "transaction_id": 4,
            "date": "2026-10-09",
            "category": "Shopping",
            "amount": 850.0,
            "reason": "Demo alert: unusual spending pattern",
        },
    ],
    "note": "DEMO DATA: These are examples, not live anomaly results.",
    "data_source": "demo_fallback",
}


@app.get("/")
def root():
    return {"app": "SmartSpend API", "status": "running"}


@app.get("/health")
def health():
    return {"status": "healthy", "app": "SmartSpend"}


@app.get("/api/summary")
def get_summary():
    try:
        query = text("""
            SELECT
                COUNT(*) AS transaction_count,
                COALESCE(SUM(amount), 0) AS total_spending,
                COALESCE(AVG(amount), 0) AS average_spending
            FROM fact_expenses
        """)

        with engine.connect() as connection:
            row = connection.execute(query).mappings().one()

        return {
            "transaction_count": int(row["transaction_count"]),
            "total_spending": float(row["total_spending"]),
            "average_spending": float(row["average_spending"]),
            "data_source": "database",
        }

    except Exception:
        logger.exception("Summary query failed; using demo fallback")
        return dict(DEMO_SUMMARY)


@app.get("/api/categories")
def get_categories():
    try:
        query = text("""
            SELECT
                c.category_name AS category,
                COALESCE(SUM(f.amount), 0) AS total
            FROM fact_expenses f
            JOIN dim_category c ON f.category_id = c.category_id
            GROUP BY c.category_name
            ORDER BY total DESC
        """)

        with engine.connect() as connection:
            rows = connection.execute(query).mappings().all()

        return [
            {
                "category": row["category"],
                "total": float(row["total"]),
                "data_source": "database",
            }
            for row in rows
        ]

    except Exception:
        logger.exception("Category query failed; using demo fallback")
        return [
            {**item, "data_source": "demo_fallback"}
            for item in DEMO_CATEGORIES
        ]


@app.get("/api/mining/anomalies")
def get_anomalies():
    try:
        from mining import detect_unusual_spending

        result = detect_unusual_spending()
        result["data_source"] = "database"
        return result

    except Exception:
        logger.exception("Anomaly detection failed; using demo fallback")
        return dict(DEMO_ANOMALIES)


# ---------------- OLAP OPERATIONS ----------------

@app.get("/api/olap/roll-up")
def olap_roll_up():
    try:
        return {
            "operation": "roll-up",
            "description": "Monthly spending summarized by year",
            "data": roll_up(),
        }
    except Exception:
        logger.exception("OLAP roll-up failed")
        raise HTTPException(
            status_code=500,
            detail="Could not perform roll-up analysis.",
        )


@app.get("/api/olap/slice")
def olap_slice(
    year: int = Query(default=2026, ge=2000, le=2100),
):
    try:
        return {
            "operation": "slice",
            "description": f"Category spending for {year}",
            "data": slice_data(year=year),
        }
    except Exception:
        logger.exception("OLAP slice failed")
        raise HTTPException(
            status_code=500,
            detail="Could not perform slice analysis.",
        )


@app.get("/api/olap/dice")
def olap_dice(
    categories: Optional[list[str]] = Query(default=None),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=400,
            detail="start_date must be before or equal to end_date.",
        )

    try:
        return {
            "operation": "dice",
            "description": "Spending filtered by categories and date range",
            "data": dice_data(
                categories=categories,
                start_date=start_date.isoformat() if start_date else None,
                end_date=end_date.isoformat() if end_date else None,
            ),
        }
    except Exception:
        logger.exception("OLAP dice failed")
        raise HTTPException(
            status_code=500,
            detail="Could not perform dice analysis.",
        )


@app.get("/api/olap/pivot")
def olap_pivot():
    try:
        return {
            "operation": "pivot",
            "description": "Monthly spending compared across categories",
            "data": pivot_data(),
        }
    except Exception:
        logger.exception("OLAP pivot failed")
        raise HTTPException(
            status_code=500,
            detail="Could not perform pivot analysis.",
        )
