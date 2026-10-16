
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env.aiven")

DATABASE_URL = os.getenv("AIVEN_DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("AIVEN_DATABASE_URL is missing from .env.aiven")

connection = psycopg2.connect(DATABASE_URL)

with connection.cursor() as cursor:
    cursor.execute("SELECT current_database(), version();")
    result = cursor.fetchone()
    print("Connected to database:", result[0])
    print("PostgreSQL version:", result[1])

connection.close()
