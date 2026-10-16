
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent
CSV_FILE = PROJECT_ROOT / "data" / "indian_banking_transactions.csv"

load_dotenv(PROJECT_ROOT / ".env.aiven")
DATABASE_URL = os.getenv("AIVEN_DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("AIVEN_DATABASE_URL is missing from .env.aiven")

if not CSV_FILE.exists():
    raise FileNotFoundError(f"CSV file not found: {CSV_FILE}")

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS raw_banking_transactions (
    transaction_id TEXT,
    customer_id TEXT,
    transaction_date DATE,
    transaction_time TIME,
    account_type TEXT,
    transaction_type TEXT,
    transaction_amount NUMERIC(14, 2),
    transaction_direction TEXT,
    account_balance NUMERIC(16, 2),
    merchant_category TEXT,
    state TEXT,
    credit_score INTEGER,
    has_loan SMALLINT,
    loan_type TEXT,
    emi_amount NUMERIC(14, 2),
    transaction_status TEXT,
    channel TEXT,
    kyc_status TEXT,
    is_fraud SMALLINT,
    transaction_hour SMALLINT
);
"""

COPY_SQL = """
COPY raw_banking_transactions (
    transaction_id, customer_id, transaction_date, transaction_time,
    account_type, transaction_type, transaction_amount,
    transaction_direction, account_balance, merchant_category, state,
    credit_score, has_loan, loan_type, emi_amount, transaction_status,
    channel, kyc_status, is_fraud, transaction_hour
)
FROM STDIN WITH (FORMAT CSV, HEADER TRUE, NULL '');
"""

def main():
    print("Connecting to Aiven...")

    with psycopg2.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(CREATE_TABLE_SQL)

            # Clear only this raw staging table before a fresh import.
            cursor.execute("TRUNCATE TABLE raw_banking_transactions")

            print("Uploading CSV. Please wait...")
            with CSV_FILE.open("r", encoding="utf-8-sig", newline="") as csv_file:
                cursor.copy_expert(COPY_SQL, csv_file)

            cursor.execute("""
                SELECT COUNT(*), MIN(transaction_date), MAX(transaction_date)
                FROM raw_banking_transactions
            """)
            count, first_date, last_date = cursor.fetchone()

    print("Import successful!")
    print("Rows imported:", count)
    print("First transaction date:", first_date)
    print("Last transaction date:", last_date)
    print("Table: raw_banking_transactions")

if __name__ == "__main__":
    main()
