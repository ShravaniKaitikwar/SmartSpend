
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env.aiven")
DATABASE_URL = os.getenv("AIVEN_DATABASE_URL")

with psycopg2.connect(DATABASE_URL) as conn:
    with conn.cursor() as cur:
        queries = {
            "Total transactions": """
                SELECT COUNT(*) FROM fact_expenses
            """,
            "Total spending": """
                SELECT COALESCE(SUM(amount), 0)
                FROM fact_expenses
            """,
            "Spending by category": """
                SELECT c.category_name, SUM(f.amount) AS total
                FROM fact_expenses f
                JOIN dim_category c
                  ON f.category_id = c.category_id
                GROUP BY c.category_name
                ORDER BY total DESC
                LIMIT 5
            """,
            "Spending by year": """
                SELECT d.year, SUM(f.amount) AS total
                FROM fact_expenses f
                JOIN dim_date d ON f.date_key = d.date_key
                GROUP BY d.year
                ORDER BY d.year
            """
        }

        for title, sql in queries.items():
            print(f"\n--- {title} ---")
            cur.execute(sql)
            for row in cur.fetchall():
                print(row)
