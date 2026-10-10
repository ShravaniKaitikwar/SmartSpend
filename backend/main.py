from backend.mining import detect_unusual_spending
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from backend.database import engine

app = FastAPI(
    title="SmartSpend API",
    description="Personal spending analytics and data mining API",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {"message": "Welcome to SmartSpend!", "status": "running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/health/database")
def database_health():
    try:
        with engine.connect() as connection:
            database_name = connection.execute(
                text("SELECT current_database()")
            ).scalar_one()
        return {"status": "connected", "database": database_name}
    except Exception:
        raise HTTPException(status_code=503, detail="Database connection failed")


@app.get("/api/summary")
def spending_summary():
    query = text("""
        SELECT
            COUNT(*) AS total_transactions,
            COALESCE(SUM(amount), 0) AS total_spending,
            COALESCE(AVG(amount), 0) AS average_transaction
        FROM fact_expenses
    """)

    try:
        with engine.connect() as connection:
            row = connection.execute(query).mappings().one()

        return {
            "total_transactions": row["total_transactions"],
            "total_spending": float(row["total_spending"]),
            "average_transaction": round(float(row["average_transaction"]), 2),
            "currency": "INR",
        }
    except Exception:
        raise HTTPException(status_code=503, detail="Could not load spending summary")


@app.get("/api/categories")
def category_spending():
    query = text("""
        SELECT
            c.category_name,
            COUNT(*) AS transactions,
            SUM(f.amount) AS total_spent
        FROM fact_expenses f
        JOIN dim_category c
            ON f.category_key = c.category_key
        GROUP BY c.category_name
        ORDER BY total_spent DESC
    """)

    try:
        with engine.connect() as connection:
            rows = connection.execute(query).mappings().all()

        return [
            {
                "category": row["category_name"],
                "transactions": row["transactions"],
                "total_spent": float(row["total_spent"]),
            }
            for row in rows
        ]
    except Exception:
        raise HTTPException(status_code=503, detail="Could not load categories")
@app.get("/api/mining/anomalies")
def spending_anomalies():
    try:
        return detect_unusual_spending()
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Could not analyze spending data: {str(e)}",
        )
