
from sqlalchemy import text, bindparam
from backend.database import engine


def run_query(sql, params=None, expanding=None):
    """Execute an analytics query and return dictionary rows."""
    statement = text(sql)

    if expanding:
        statement = statement.bindparams(
            *[bindparam(name, expanding=True) for name in expanding]
        )

    with engine.connect() as connection:
        result = connection.execute(statement, params or {})
        return [dict(row) for row in result.mappings().all()]


def roll_up():
    """Aggregate spending by year and month."""
    sql = """
        SELECT
            d.year AS year,
            d.month AS month,
            d.month_name AS month_name,
            COUNT(f.transaction_id) AS transaction_count,
            COALESCE(SUM(f.amount), 0) AS total_spending,
            COALESCE(AVG(f.amount), 0) AS average_spending
        FROM fact_expenses f
        JOIN dim_date d ON f.date_key = d.date_key
        GROUP BY d.year, d.month, d.month_name
        ORDER BY d.year, d.month
    """
    return run_query(sql)


def slice_data(year=2026):
    """Show category totals for one selected year."""
    sql = """
        SELECT
            d.year AS year,
            c.category_name AS category,
            COUNT(f.transaction_id) AS transaction_count,
            COALESCE(SUM(f.amount), 0) AS total_spending
        FROM fact_expenses f
        JOIN dim_date d ON f.date_key = d.date_key
        JOIN dim_category c ON f.category_id = c.category_id
        WHERE d.year = :year
        GROUP BY d.year, c.category_name
        ORDER BY total_spending DESC
    """
    return run_query(sql, {"year": year})


def dice_data(categories=None, start_date=None, end_date=None):
    """Filter spending by category and date range."""
    conditions = []
    params = {}
    expanding = []

    if categories:
        conditions.append("c.category_name IN :categories")
        params["categories"] = list(categories)
        expanding.append("categories")

    if start_date:
        conditions.append("d.full_date >= :start_date")
        params["start_date"] = start_date

    if end_date:
        conditions.append("d.full_date <= :end_date")
        params["end_date"] = end_date

    where_clause = (
        "WHERE " + " AND ".join(conditions)
        if conditions else ""
    )

    sql = f"""
        SELECT
            c.category_name AS category,
            COUNT(f.transaction_id) AS transaction_count,
            COALESCE(SUM(f.amount), 0) AS total_spending
        FROM fact_expenses f
        JOIN dim_date d ON f.date_key = d.date_key
        JOIN dim_category c ON f.category_id = c.category_id
        {where_clause}
        GROUP BY c.category_name
        ORDER BY total_spending DESC
    """

    return run_query(sql, params, expanding=expanding)



def pivot_data():
    """Compare category spending across months for each year."""
    sql = """
        SELECT
            d.year AS year,
            c.category_name AS category,
            COALESCE(SUM(CASE WHEN d.month = 1 THEN f.amount ELSE 0 END), 0) AS jan,
            COALESCE(SUM(CASE WHEN d.month = 2 THEN f.amount ELSE 0 END), 0) AS feb,
            COALESCE(SUM(CASE WHEN d.month = 3 THEN f.amount ELSE 0 END), 0) AS mar,
            COALESCE(SUM(CASE WHEN d.month = 4 THEN f.amount ELSE 0 END), 0) AS apr,
            COALESCE(SUM(CASE WHEN d.month = 5 THEN f.amount ELSE 0 END), 0) AS may,
            COALESCE(SUM(CASE WHEN d.month = 6 THEN f.amount ELSE 0 END), 0) AS jun,
            COALESCE(SUM(CASE WHEN d.month = 7 THEN f.amount ELSE 0 END), 0) AS jul,
            COALESCE(SUM(CASE WHEN d.month = 8 THEN f.amount ELSE 0 END), 0) AS aug,
            COALESCE(SUM(CASE WHEN d.month = 9 THEN f.amount ELSE 0 END), 0) AS sep,
            COALESCE(SUM(CASE WHEN d.month = 10 THEN f.amount ELSE 0 END), 0) AS oct,
            COALESCE(SUM(CASE WHEN d.month = 11 THEN f.amount ELSE 0 END), 0) AS nov,
            COALESCE(SUM(CASE WHEN d.month = 12 THEN f.amount ELSE 0 END), 0) AS dec,
            COALESCE(SUM(f.amount), 0) AS total_spending
        FROM fact_expenses f
        JOIN dim_date d ON f.date_key = d.date_key
        JOIN dim_category c ON f.category_id = c.category_id
        GROUP BY d.year, c.category_name
        ORDER BY d.year, total_spending DESC
    """
    return run_query(sql)
