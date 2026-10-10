
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from database import engine
from mining import detect_unusual_spending

app = FastAPI(
    title="SmartSpend API",
    description="Personal Expense Analytics Dashboard API",
    version="1.0.0",
)

# Allow the React frontend to communicate with the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "message": "Welcome to SmartSpend API",
        "status": "running",
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/health/database")
def database_health():
    try:
        with engine.connect() as connection:
            database_name = connection.execute(
                text("SELECT current_database()")
            ).scalar()

        return {
            "status": "connected",
            "database": database_name,
        }
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail=f"Database connection failed: {str(error)}",
        )


@app.get("/api/summary")
def get_summary():
    query = text("""
        SELECT
            COUNT(*) AS transaction_count,
            COALESCE(SUM(amount), 0) AS total_spending,
            COALESCE(AVG(amount), 0) AS average_spending
        FROM fact_expenses
    """)

    try:
        with engine.connect() as connection:
            result = connection.execute(query).mappings().first()

        return {
            "transaction_count": result["transaction_count"],
            "total_spending": float(result["total_spending"]),
            "average_spending": float(result["average_spending"]),
        }
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail=f"Could not retrieve summary: {str(error)}",
        )


@app.get("/api/categories")
def get_categories():
    query = text("""
        SELECT
            c.category_name,
            COALESCE(SUM(f.amount), 0) AS total_spending
        FROM fact_expenses f
        JOIN dim_category c
            ON f.category_id = c.category_id
        GROUP BY c.category_name
        ORDER BY total_spending DESC
    """)

    try:
        with engine.connect() as connection:
            results = connection.execute(query).mappings().all()

        return [
            {
                "category": row["category_name"],
                "total": float(row["total_spending"]),
            }
            for row in results
        ]
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail=f"Could not retrieve categories: {str(error)}",
        )


@app.get("/api/mining/anomalies")
def get_anomalies():
    try:
        return detect_unusual_spending()
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail=f"Could not detect unusual spending: {str(error)}",
        )
