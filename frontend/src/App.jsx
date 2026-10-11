
import { useEffect, useState } from "react";
import "./App.css";

const API_BASE = "https://smartspend-backend-iu60.onrender.com";

function App() {
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [anomalyMessage, setAnomalyMessage] = useState("");
  const [error, setError] = useState("");
  const [miningError, setMiningError] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [summaryResponse, categoryResponse] = await Promise.all([
          fetch(`${API_BASE}/api/summary`),
          fetch(`${API_BASE}/api/categories`),
        ]);

        if (!summaryResponse.ok || !categoryResponse.ok) {
          throw new Error("Failed to load spending data.");
        }

        const summaryData = await summaryResponse.json();
        const categoryData = await categoryResponse.json();

        setSummary(summaryData);
        setCategories(categoryData);
      } catch (err) {
        console.error("Dashboard data error:", err);
        setError(
          "Could not load spending data. Please check your API connection."
        );
      }

      try {
        const anomalyResponse = await fetch(
          `${API_BASE}/api/mining/anomalies`
        );

        if (!anomalyResponse.ok) {
          throw new Error("Mining API request failed.");
        }

        const anomalyData = await anomalyResponse.json();

        setAnomalies(
          Array.isArray(anomalyData)
            ? anomalyData
            : anomalyData.unusual_transactions || []
        );
        setAnomalyMessage(anomalyData.message || "");
      } catch (err) {
        console.error("Mining data error:", err);
        setMiningError(
          "Could not load data mining insights. Check the mining API."
        );
      }
    }

    loadDashboard();
  }, []);

  const money = (amount) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(Number(amount) || 0);

  const maxSpend = Math.max(
    1,
    ...categories.map((item) => Number(item.total ?? item.total_spent) || 0)
  );

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <h1>💰 SmartSpend</h1>
          <p>Personal finance intelligence</p>
        </div>
        <span className="tag">● Live analytics</span>
      </header>

      <section className="welcome">
        <p className="eyebrow">YOUR MONEY, MADE CLEARER</p>
        <h2>Understand your spending.</h2>
        <p>Discover where your money goes and make smarter decisions.</p>
      </section>

      {error && <div className="error">{error}</div>}

      <section className="stats">
        <article className="stat-card">
          <span>Total spending</span>
          <h3>{summary ? money(summary.total_spending) : "Loading..."}</h3>
          <p>Across recorded transactions</p>
        </article>

        <article className="stat-card">
          <span>Transactions</span>
          <h3>{summary ? summary.transaction_count : "Loading..."}</h3>
          <p>Recorded expenses</p>
        </article>

        <article className="stat-card">
          <span>Average expense</span>
          <h3>{summary ? money(summary.average_spending) : "Loading..."}</h3>
          <p>Per transaction</p>
        </article>
      </section>

      <section className="panel">
        <h2>Spending by category</h2>
        <p>Compare how much you spend in each category.</p>

        {categories.map((item) => {
          const total = Number(item.total ?? item.total_spent) || 0;

          return (
            <div className="category" key={item.category}>
              <div className="category-heading">
                <span>{item.category}</span>
                <strong>{money(total)}</strong>
              </div>

              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${(total / maxSpend) * 100}%` }}
                />
              </div>
            </div>
          );
        })}

        {categories.length === 0 && !error && (
          <p>No category data available.</p>
        )}
      </section>

      <section className="panel">
        <h2>🔎 Unusual Spending Insights</h2>
        <p>
          Transactions flagged by the Isolation Forest data mining model.
          Statistical outliers are not necessarily fraudulent.
        </p>

        {miningError && <div className="error">{miningError}</div>}

        {!miningError && anomalyMessage && <p>{anomalyMessage}</p>}

        {!miningError && !anomalyMessage && anomalies.length === 0 && (
          <p>No unusual transactions detected.</p>
        )}

        {anomalies.map((item, index) => (
          <div className="category" key={item.transaction_id ?? index}>
            <div className="category-heading">
              <span>{item.category}</span>
              <strong>{money(item.amount)}</strong>
            </div>
            <small>
              Transaction #{item.transaction_id} · {item.date}
            </small>
          </div>
        ))}
      </section>

      <footer>SmartSpend · Data Warehouse &amp; Data Mining Project</footer>
    </main>
  );
}

export default App;
