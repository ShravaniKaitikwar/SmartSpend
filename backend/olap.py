
from sqlalchemy import text

from database import engine


def run_query(query, params=None):
    with engine.connect() as connection:
        rows = connection.execute(
            text(query), params or {}
        ).mappings().all()

    return [dict(row) for row in rows]


# 1. ROLL-UP: summarize expenses by year and month
def roll_up():
    query = """
        SELECT
            d.year,
            d.month,
            SUM(f.amount) AS total_spending
        FROM fact_expenses f
        JOIN dim_date d ON f.date_key = d.date_key
        GROUP BY d.year, d.month
        ORDER BY d.year, d.month
    """
    return run_query(query)


# 2. SLICE: analyze expenses for one year
def slice_data(year=2026):
    query = """
        SELECT
            d.year,
            c.category_name AS category,
            SUM(f.amount) AS total_spending
        FROM fact_expenses f
        JOIN dim_date d ON f.date_key = d.date_key
        JOIN dim_category c ON f.category_id = c.category_id
        WHERE d.year = :year
        GROUP BY d.year, c.category_name
        ORDER BY total_spending DESC
    """
    return run_query(query, {"year": year})


# 3. DICE: filter by categories and date range
def dice_data(categories=None, start_date=None, end_date=None):
    query = """
        SELECT
            c.category_name AS category,
            d.year,
            d.month,
            SUM(f.amount) AS total_spending
        FROM fact_expenses f
        JOIN dim_date d ON f.date_key = d.date_key
        JOIN dim_category c ON f.category_id = c.category_id
        WHERE (
            CAST(:start_date AS DATE) IS NULL
            OR d.full_date >= CAST(:start_date AS DATE)
        )
        AND (
            CAST(:end_date AS DATE) IS NULL
            OR d.full_date <= CAST(:end_date AS DATE)
        )
        AND (
            CAST(:categories AS TEXT[]) IS NULL
            OR c.category_name = ANY(CAST(:categories AS TEXT[]))
        )
        GROUP BY c.category_name, d.year, d.month
        ORDER BY d.year, d.month, c.category_name
    """
    return run_query(
        query,
        {
            "categories": categories,
            "start_date": start_date,
            "end_date": end_date,
        },
    )


# 4. PIVOT: compare monthly spending across categories
def pivot_data():
    query = """
        SELECT
            c.category_name AS category,
            SUM(CASE WHEN d.month = 1
                THEN f.amount ELSE 0 END) AS january,
            SUM(CASE WHEN d.month = 2
                THEN f.amount ELSE 0 END) AS february,
            SUM(CASE WHEN d.month = 3
                THEN f.amount ELSE 0 END) AS march,
            SUM(CASE WHEN d.month = 4
                THEN f.amount ELSE 0 END) AS april,
            SUM(CASE WHEN d.month = 5
                THEN f.amount ELSE 0 END) AS may,
            SUM(CASE WHEN d.month = 6
                THEN f.amount ELSE 0 END) AS june,
            SUM(CASE WHEN d.month = 7
                THEN f.amount ELSE 0 END) AS july,
            SUM(CASE WHEN d.month = 8
                THEN f.amount ELSE 0 END) AS august,
            SUM(CASE WHEN d.month = 9
                THEN f.amount ELSE 0 END) AS september,
            SUM(CASE WHEN d.month = 10
                THEN f.amount ELSE 0 END) AS october,
            SUM(CASE WHEN d.month = 11
                THEN f.amount ELSE 0 END) AS november,
            SUM(CASE WHEN d.month = 12
                THEN f.amount ELSE 0 END) AS december
        FROM fact_expenses f
        JOIN dim_date d ON f.date_key = d.date_key
        JOIN dim_category c ON f.category_id = c.category_id
        GROUP BY c.category_name
        ORDER BY c.category_name
    """
    return run_query(query)
