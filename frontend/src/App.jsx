
import { useEffect, useState } from "react";
import "./App.css";

const API = "http://127.0.0.1:8000";

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
          fetch(`${API}/api/summary`),
          fetch(`${API}/api/categories`),
        ]);

        if (!summaryResponse.ok || !categoryResponse.ok) {
          throw new Error("Failed to load spending data.");
        }

        const summaryData = await summaryResponse.json();
        const categoryData = await categoryResponse.json();

        setSummary(summaryData);
        setCategories(categoryData);
      } catch (err) {
        setError(
          "Could not load spending data. Check that your backend is running."
        );
      }

      try {
        const anomalyResponse = await fetch(
          `${API}/api/mining/anomalies`
        );

        if (!anomalyResponse.ok) {
          throw new Error("Mining API request failed.");
        }

        const anomalyData = await anomalyResponse.json();

        setAnomalies(anomalyData.unusual_transactions || []);
        setAnomalyMessage(anomalyData.message || "");
      } catch {
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
    ...categories.map((item) => Number(item.total_spent) || 0)
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
        <p>
          Discover where your money goes and make smarter decisions.
        </p>
      </section>

      {error && <div className="error">{error}</div>}

      <section className="stats">
        <article className="stat-card">
          <span>Total spending</span>
          <h3>
            {summary ? money(summary.total_spending) : "Loading..."}
          </h3>
          <p>Across recorded transactions</p>
        </article>

        <article className="stat-card">
          <span>Transactions</span>
          <h3>
            {summary ? summary.total_transactions : "Loading..."}
          </h3>
          <p>Recorded expenses</p>
        </article>

        <article className="stat-card">
          <span>Average expense</span>
          <h3>
            {summary ? money(summary.average_transaction) : "Loading..."}
          </h3>
          <p>Per transaction</p>
        </article>
      </section>

      <section className="panel">
        <h2>Spending by category</h2>
        <p>Compare how much you spend in each category.</p>

        {categories.map((item) => (
          <div className="category" key={item.category}>
            <div className="category-heading">
              <span>{item.category}</span>
              <strong>{money(item.total_spent)}</strong>
            </div>

            <div className="bar-track">
              <div
                className="bar-fill"
                style={{
                  width: `${
                    ((Number(item.total_spent) || 0) / maxSpend) * 100
                  }%`,
                }}
              />
            </div>

            <small>{item.transactions} transactions</small>
          </div>
        ))}

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

        {!miningError && anomalyMessage && (
          <p>{anomalyMessage}</p>
        )}

        {!miningError &&
          !anomalyMessage &&
          anomalies.length === 0 && (
            <p>No unusual transactions detected.</p>
          )}

        {anomalies.map((item) => (
          <div
            className="category"
            key={item.transaction_id}
          >
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

      <footer>
        SmartSpend · Data Warehouse &amp; Data Mining Project
      </footer>
    </main>
  );
}

export default App;
