
import { useEffect, useState } from "react";
import "./App.css";

const API_BASE = "https://smartspend-backend-iu60.onrender.com";

function App() {
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        setError("");

        const endpoints = [
          `${API_BASE}/api/summary`,
          `${API_BASE}/api/categories`,
          `${API_BASE}/api/mining/anomalies`,
        ];

        const responses = await Promise.all(
          endpoints.map(async (url) => {
            let lastError;

            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                const response = await fetch(url);
                if (!response.ok) {
                  throw new Error(`Request failed: ${response.status}`);
                }
                return await response.json();
              } catch (err) {
                lastError = err;
                if (attempt < 2) {
                  await new Promise((resolve) =>
                    setTimeout(resolve, 1500 * (attempt + 1))
                  );
                }
              }
            }

            throw lastError;
          })
        );

        if (cancelled) return;

        setSummary(responses[0]);
        setCategories(
          Array.isArray(responses[1])
            ? responses[1]
            : responses[1].categories || []
        );

        const anomalyData = responses[2];
        setAnomalies(
          Array.isArray(anomalyData)
            ? anomalyData
            : anomalyData.unusual_transactions || []
        );
      } catch (err) {
        if (!cancelled) {
          setError(
            "Unable to load historical data. Check your connection and retry."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  const money = (value) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);

  const transactionCount =
    summary?.transaction_count ?? summary?.total_transactions ?? 0;
  const totalSpending =
    summary?.total_spending ?? summary?.total_expenses ?? 0;
  const averageSpending =
    summary?.average_spending ??
    (transactionCount ? totalSpending / transactionCount : 0);

  const categoryRows = categories.map((item) => ({
    name: item.category_name ?? item.category ?? item.name ?? "Other",
    amount: Number(
      item.total_spending ?? item.total_amount ?? item.amount ?? item.total ?? 0
    ),
  }));

  const maxCategory = Math.max(
    1,
    ...categoryRows.map((item) => item.amount)
  );

  const maxAnomalyAmount = Math.max(
    1,
    ...anomalies.map((item) => Number(item.amount) || 0)
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">₹</span>
          <div>
            <h2>SmartSpend</h2>
            <p>FINANCIAL INTELLIGENCE</p>
          </div>
        </div>

        <p className="nav-heading">WORKSPACE</p>
        <a className="nav-link active" href="#overview">▦ Dashboard</a>
        <a className="nav-link" href="#categories">◉ Categories</a>
        <a className="nav-link" href="#trends">↗ Spending Trends</a>
        <a className="nav-link" href="#transactions">▤ Transactions</a>
        <a className="nav-link" href="#olap">▥ OLAP Analytics</a>
        <a className="nav-link" href="#mining">⌁ Data Mining</a>

        <div className="sidebar-footer">
          <span className="status-dot" />
          Historical Analytics
          <p>Personal Finance Data Warehouse</p>
        </div>
      </aside>

      <main className="dashboard">
        <header className="page-header" id="overview">
          <div>
            <p className="eyebrow">FINANCIAL INTELLIGENCE</p>
            <h1>Historical Spending Dashboard</h1>
            <p className="subtitle">
              Understand spending history, financial patterns and unusual
              transactions.
            </p>
          </div>
          <span className="history-badge">
            <span className="status-dot" />
            Historical Data
          </span>
        </header>

        {error && (
          <div className="error-banner">
            {error}{" "}
            <button onClick={() => window.location.reload()}>Retry</button>
          </div>
        )}

        {loading && (
          <div className="loading-banner">
            Connecting to your historical spending database...
          </div>
        )}

        <section className="metric-grid">
          <article className="metric-card">
            <p>Total Spending</p>
            <h2>{loading ? "—" : money(totalSpending)}</h2>
            <span>Recorded expenses</span>
          </article>
          <article className="metric-card">
            <p>Total Transactions</p>
            <h2>{loading ? "—" : Number(transactionCount).toLocaleString("en-IN")}</h2>
            <span>Historical records</span>
          </article>
          <article className="metric-card">
            <p>Average Transaction</p>
            <h2>{loading ? "—" : money(averageSpending)}</h2>
            <span>Average amount spent</span>
          </article>
          <article className="metric-card">
            <p>Categories Tracked</p>
            <h2>{loading ? "—" : categoryRows.length}</h2>
            <span>Spending categories</span>
          </article>
          <article className="metric-card">
            <p>Unusual Transactions</p>
            <h2>{loading ? "—" : anomalies.length}</h2>
            <span>Flagged for review</span>
          </article>
          <article className="metric-card">
            <p>Data Source</p>
            <h2 className="source-value">
              {loading ? "—" : summary?.data_source === "demo_fallback"
                ? "Demo Data"
                : "Database"}
            </h2>
            <span>Reported by backend</span>
          </article>
        </section>

        <section className="chart-grid">
          <article className="panel" id="categories">
            <div className="panel-heading">
              <div>
                <h3>Historical Spending by Category</h3>
                <p>Distribution across recorded categories</p>
              </div>
            </div>

            {categoryRows.length ? (
              <div className="category-list">
                {categoryRows
                  .slice()
                  .sort((a, b) => b.amount - a.amount)
                  .map((item, index) => (
                    <div className="category-row" key={`${item.name}-${index}`}>
                      <div className="category-label">
                        <span>{item.name}</span>
                        <strong>{money(item.amount)}</strong>
                      </div>
                      <div className="bar-track">
                        <div
                          className={`category-bar color-${index % 6}`}
                          style={{
                            width: `${Math.max(2, (item.amount / maxCategory) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="empty-state">
                {loading ? "Loading categories..." : "No category data available."}
              </p>
            )}
          </article>

          <article className="panel" id="trends">
            <div className="panel-heading">
              <div>
                <h3>Spending History</h3>
                <p>Historical monthly and yearly comparisons</p>
              </div>
            </div>
            <div className="chart-placeholder">
              <div className="chart-symbol">↗</div>
              <h4>Spending Trend Analysis</h4>
              <p>
                We’ll connect monthly and yearly charts to the date dimension
                in your data warehouse in the next step.
              </p>
            </div>
          </article>
        </section>

        <section className="panel olap-panel" id="olap">
          <div className="panel-heading">
            <div>
              <h3>📊 OLAP Analytics</h3>
              <p>
                Explore historical spending using multidimensional analysis.
              </p>
            </div>
            <span className="section-badge">Data Warehouse</span>
          </div>

          <div className="olap-grid">
            <a href={`${API_BASE}/api/olap/roll-up`} target="_blank" rel="noreferrer">
              <strong>Roll-Up</strong>
              <span>Summarize spending</span>
            </a>
            <a href={`${API_BASE}/api/olap/slice`} target="_blank" rel="noreferrer">
              <strong>Slice</strong>
              <span>Analyze one dimension</span>
            </a>
            <a href={`${API_BASE}/api/olap/dice`} target="_blank" rel="noreferrer">
              <strong>Dice</strong>
              <span>Filter multiple dimensions</span>
            </a>
            <a href={`${API_BASE}/api/olap/pivot`} target="_blank" rel="noreferrer">
              <strong>Pivot</strong>
              <span>Compare categories</span>
            </a>
          </div>
          <p className="note">
            OLAP results depend on the corresponding API endpoints being
            available and working in the backend.
          </p>
        </section>

        <section className="panel" id="mining">
          <div className="panel-heading">
            <div>
              <h3>🚨 Unusual Spending Detection</h3>
              <p>Transactions flagged by your data mining API</p>
            </div>
            <span className="section-badge warning">
              {anomalies.length} flagged
            </span>
          </div>

          {anomalies.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalies.map((item, index) => (
                    <tr key={item.transaction_id ?? item.id ?? index}>
                      <td>
                        {item.transaction_id ?? item.id ?? `Record ${index + 1}`}
                      </td>
                      <td>{item.category ?? item.category_name ?? "Review"}</td>
                      <td>{money(item.amount)}</td>
                      <td>
                        {item.reason ?? item.reasons?.join(", ") ?? "Flagged for review"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">
              {loading ? "Analyzing transactions..." : "No unusual transactions returned by the API."}
            </p>
          )}
          <p className="note">
            A flagged transaction is a review suggestion, not proof of fraud.
          </p>
        </section>

        <section className="panel" id="transactions">
          <div className="panel-heading">
            <div>
              <h3>Transaction History</h3>
              <p>Your historical transaction records</p>
            </div>
          </div>
          <p className="empty-state">
            Transaction table and filters will be connected in the next step.
          </p>
        </section>

        <footer className="dashboard-footer">
          SmartSpend · Historical Financial Analytics
        </footer>
      </main>
    </div>
  );
}

export default App;
