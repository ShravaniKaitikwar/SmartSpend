
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env.aiven")
DATABASE_URL = os.getenv("AIVEN_DATABASE_URL")

with psycopg2.connect(DATABASE_URL) as connection:
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT
                COUNT(*),
                MIN(transaction_date),
                MAX(transaction_date),
                SUM(transaction_amount)
            FROM raw_banking_transactions
        """)
        count, first_date, last_date, total = cursor.fetchone()

        print("Total records:", count)
        print("First date:", first_date)
        print("Last date:", last_date)
        print("Total transaction amount:", total)
