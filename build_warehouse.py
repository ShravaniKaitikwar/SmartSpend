
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env.aiven")
DATABASE_URL = os.getenv("AIVEN_DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("AIVEN_DATABASE_URL is missing from .env.aiven")

DDL = """
CREATE TABLE IF NOT EXISTS dim_user (
    user_id SERIAL PRIMARY KEY,
    user_name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_date (
    date_key INTEGER PRIMARY KEY,
    full_date DATE UNIQUE NOT NULL,
    day INTEGER NOT NULL,
    month INTEGER NOT NULL,
    month_name TEXT NOT NULL,
    quarter INTEGER NOT NULL,
    year INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_category (
    category_id SERIAL PRIMARY KEY,
    category_name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_payment (
    payment_id SERIAL PRIMARY KEY,
    payment_method TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS fact_expenses (
    transaction_id TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES dim_user(user_id),
    date_key INTEGER REFERENCES dim_date(date_key),
    category_id INTEGER REFERENCES dim_category(category_id),
    payment_id INTEGER REFERENCES dim_payment(payment_id),
    amount NUMERIC(14, 2) NOT NULL,
    description TEXT,
    transaction_direction TEXT,
    transaction_status TEXT,
    is_fraud SMALLINT
);
"""

def main():
    print("Connecting to Aiven...")
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            print("Creating warehouse tables...")
            cur.execute(DDL)

            print("Loading users...")
            cur.execute("""
                INSERT INTO dim_user (user_name)
                SELECT DISTINCT customer_id
                FROM raw_banking_transactions
                WHERE customer_id IS NOT NULL
                ON CONFLICT (user_name) DO NOTHING
            """)

            print("Loading dates...")
            cur.execute("""
                INSERT INTO dim_date
                    (date_key, full_date, day, month, month_name, quarter, year)
                SELECT DISTINCT
                    TO_CHAR(transaction_date, 'YYYYMMDD')::INTEGER,
                    transaction_date,
                    EXTRACT(DAY FROM transaction_date)::INTEGER,
                    EXTRACT(MONTH FROM transaction_date)::INTEGER,
                    TO_CHAR(transaction_date, 'FMMonth'),
                    EXTRACT(QUARTER FROM transaction_date)::INTEGER,
                    EXTRACT(YEAR FROM transaction_date)::INTEGER
                FROM raw_banking_transactions
                WHERE transaction_date IS NOT NULL
                ON CONFLICT (date_key) DO NOTHING
            """)

            print("Loading categories...")
            cur.execute("""
                INSERT INTO dim_category (category_name)
                SELECT DISTINCT TRIM(merchant_category)
                FROM raw_banking_transactions
                WHERE merchant_category IS NOT NULL
                  AND TRIM(merchant_category) <> ''
                ON CONFLICT (category_name) DO NOTHING
            """)

            print("Loading payment methods...")
            cur.execute("""
                INSERT INTO dim_payment (payment_method)
                SELECT DISTINCT TRIM(transaction_type)
                FROM raw_banking_transactions
                WHERE transaction_type IS NOT NULL
                  AND TRIM(transaction_type) <> ''
                ON CONFLICT (payment_method) DO NOTHING
            """)

            print("Loading fact table...")
            cur.execute("""
                INSERT INTO fact_expenses (
                    transaction_id, user_id, date_key, category_id,
                    payment_id, amount, description,
                    transaction_direction, transaction_status, is_fraud
                )
                SELECT
                    r.transaction_id,
                    u.user_id,
                    TO_CHAR(r.transaction_date, 'YYYYMMDD')::INTEGER,
                    c.category_id,
                    p.payment_id,
                    r.transaction_amount,
                    CONCAT_WS(' | ', r.channel, r.account_type),
                    r.transaction_direction,
                    r.transaction_status,
                    r.is_fraud
                FROM raw_banking_transactions r
                JOIN dim_user u ON u.user_name = r.customer_id
                JOIN dim_date d ON d.full_date = r.transaction_date
                JOIN dim_category c
                  ON c.category_name = TRIM(r.merchant_category)
                JOIN dim_payment p
                  ON p.payment_method = TRIM(r.transaction_type)
                WHERE r.transaction_id IS NOT NULL
                  AND r.transaction_date IS NOT NULL
                  AND r.transaction_amount > 0
                ON CONFLICT (transaction_id) DO NOTHING
            """)

            for table in (
                "raw_banking_transactions",
                "dim_user",
                "dim_date",
                "dim_category",
                "dim_payment",
                "fact_expenses",
            ):
                cur.execute(f"SELECT COUNT(*) FROM {table}")
                print(f"{table}: {cur.fetchone()[0]} rows")

    print("Warehouse build complete!")

if __name__ == "__main__":
    main()
