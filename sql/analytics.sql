
-- SmartSpend: Data Warehouse Analytics
-- 1. Total spending by category
SELECT
    c.category_name,
    COUNT(*) AS transactions,
    SUM(f.amount) AS total_spent
FROM fact_expenses f
JOIN dim_category c
    ON f.category_key = c.category_key
GROUP BY c.category_name
ORDER BY total_spent DESC;

-- 2. Spending by payment method
SELECT
    p.payment_method,
    COUNT(*) AS transactions,
    SUM(f.amount) AS total_spent
FROM fact_expenses f
JOIN dim_payment p
    ON f.payment_key = p.payment_key
GROUP BY p.payment_method
ORDER BY total_spent DESC;

-- 3. Daily spending
SELECT
    d.full_date,
    SUM(f.amount) AS daily_spending
FROM fact_expenses f
JOIN dim_date d
    ON f.date_key = d.date_key
GROUP BY d.full_date
ORDER BY d.full_date;
