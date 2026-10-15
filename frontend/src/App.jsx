
import { useCallback, useEffect, useState } from "react";
import "./App.css";

const API_BASE = "https://smartspend-backend-iu60.onrender.com";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const number = (value) =>
  new Intl.NumberFormat("en-IN").format(Number(value) || 0);

function App() {
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [olapResults, setOlapResults] = useState([]);
  const [olapOperation, setOlapOperation] = useState("");
  const [olapLoading, setOlapLoading] = useState(false);
  const [olapError, setOlapError] = useState("");
  const [selectedYear, setSelectedYear] = useState("2026");

  const fetchJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }
    return response.json();
  };

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    const results = await Promise.allSettled([
      fetchJson(`${API_BASE}/api/summary`),
      fetchJson(`${API_BASE}/api/categories`),
      fetchJson(`${API_BASE}/api/mining/anomalies`),
    ]);

    if (results[0].status === "fulfilled") {
      setSummary(results[0].value);
    } else {
      setError("Could not load spending summary. Please refresh.");
    }

    if (results[1].status === "fulfilled") {
      const data = results[1].value;
      setCategories(
        Array.isArray(data)
          ? data
          : Array.isArray(data?.categories)
            ? data.categories
            : []
      );
    }

    if (results[2].status === "fulfilled") {
      const data = results[2].value;
      setAnomalies(
        Array.isArray(data)
          ? data
          : Array.isArray(data?.anomalies)
            ? data.anomalies
            : Array.isArray(data?.unusual_transactions)
              ? data.unusual_transactions
              : []
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  async function loadOlap(operation) {
    setOlapOperation(operation);
    setOlapLoading(true);
    setOlapError("");
    setOlapResults([]);

    try {
      let url = `${API_BASE}/api/olap/${operation}`;

      if (operation === "slice") {
        url += `?year=${encodeURIComponent(selectedYear)}`;
      }

      const response = await fetchJson(url);
      const rows = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : [];

      setOlapResults(rows);

      if (!Array.isArray(response) && !Array.isArray(response?.data)) {
        throw new Error("Unexpected response format from the OLAP API.");
      }
    } catch (err) {
      setOlapError(err.message || "Unable to load OLAP results.");
    } finally {
      setOlapLoading(false);
    }
  }

  const total = summary?.total_spending ?? summary?.total_expenses ?? 0;
  const transactions =
    summary?.transaction_count ?? summary?.total_transactions ?? 0;
  const average =
    summary?.average_spending ??
    (Number(transactions) ? Number(total) / Number(transactions) : 0);

  const categoryName = (item) =>
    item.category_name ?? item.category ?? item.name ?? "Other";

  const categoryAmount = (item) =>
    Number(
      item.total_spending ??
        item.total_amount ??
        item.amount ??
        item.total ??
        0
    );

  const categoryTotal = categories.reduce(
    (sum, item) => sum + categoryAmount(item),
    0
  );

  const maxCategory = Math.max(
    1,
    ...categories.map(categoryAmount)
  );

  const operationLabels = {
    "roll-up": "Roll-up · Monthly summary",
    slice: `Slice · ${selectedYear} analysis`,
    dice: "Dice · Filtered analysis",
    pivot: "Pivot · Category comparison",
  };

  const columns =
    olapResults.length > 0 ? Object.keys(olapResults[0]) : [];

  const formatCell = (key, value) => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "number" && /amount|spending|total|average/i.test(key)) {
      return money(value);
    }
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="spend-app">
      <header className="top-nav">
        <a className="top-brand" href="#home">
          <span className="brand-mark">S.</span>
          <span>smartspend<small>PERSONAL FINANCE LAB</small></span>
        </a>

        <nav className="top-links">
          <a className="top-link active" href="#home">Overview</a>
          <a className="top-link" href="#categories">Categories</a>
          <a className="top-link" href="#insights">Insights</a>
          <a className="top-link" href="#analytics">OLAP Lab</a>
        </nav>

        <button
          className="nav-refresh"
          onClick={loadDashboard}
          disabled={loading}
          type="button"
        >
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </header>

      <main className="spend-main" id="home">
        {error && <div className="alert-box">{error}</div>}

        <section className="welcome-banner">
          <div className="welcome-copy">
            <p className="overline">YOUR MONEY, IN PERSPECTIVE</p>
            <h1>Make every<br />rupee <em>count.</em></h1>
            <p className="welcome-description">
              A clearer view of your spending habits, category patterns,
              and historical financial activity.
            </p>
            <a href="#analytics" className="banner-link">
              Explore your data <span>↗</span>
            </a>
          </div>

          <div className="banner-visual" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit-center">
              <span>₹</span>
              <small>INR</small>
            </div>
            <span className="orbit-label label-top">TRACK</span>
            <span className="orbit-label label-right">LEARN</span>
            <span className="orbit-label label-bottom">GROW</span>
          </div>

          <div className="banner-index">
            <span>01 / OVERVIEW</span>
            <span>SMARTSPEND ANALYTICS</span>
          </div>
        </section>

        <section className="section-block" aria-label="Financial overview">
          <div className="section-intro">
            <div>
              <p className="overline">THE BIG PICTURE</p>
              <h2>Your numbers, at a glance.</h2>
            </div>
            <span className="data-chip">
              <span className="live-dot" /> LIVE DATA
            </span>
          </div>

          <div className="stat-grid">
            <article className="stat-card stat-featured">
              <div className="stat-top">
                <span>Total spending</span>
                <span className="stat-symbol">₹</span>
              </div>
              <h3>{loading && !summary ? "…" : money(total)}</h3>
              <div className="stat-bottom">
                <span>Recorded expenses</span>
                <span className="stat-arrow">↗</span>
              </div>
            </article>

            <article className="stat-card">
              <div className="stat-top">
                <span>Transactions</span>
                <span className="stat-symbol">#</span>
              </div>
              <h3>{loading && !summary ? "…" : number(transactions)}</h3>
              <div className="stat-bottom">
                <span>Recorded entries</span>
                <span className="stat-arrow">↗</span>
              </div>
            </article>

            <article className="stat-card">
              <div className="stat-top">
                <span>Average transaction</span>
                <span className="stat-symbol">≈</span>
              </div>
              <h3>{loading && !summary ? "…" : money(average)}</h3>
              <div className="stat-bottom">
                <span>Per recorded transaction</span>
                <span className="stat-arrow">↗</span>
              </div>
            </article>

            <article className="stat-card">
              <div className="stat-top">
                <span>Categories</span>
                <span className="stat-symbol">◫</span>
              </div>
              <h3>{number(categories.length)}</h3>
              <div className="stat-bottom">
                <span>Expense groups</span>
                <span className="stat-arrow">↗</span>
              </div>
            </article>
          </div>
        </section>

        <section className="analysis-layout" id="categories">
          <article className="content-card category-card">
            <div className="card-heading">
              <div>
                <p className="overline">WHERE IT GOES</p>
                <h2>Spending by category</h2>
                <p className="muted-copy">
                  Compare recorded totals across expense groups.
                </p>
              </div>
              <span className="round-decoration">↗</span>
            </div>

            {loading && categories.length === 0 ? (
              <p className="empty-copy">Loading category data…</p>
            ) : categories.length === 0 ? (
              <p className="empty-copy">No category records returned.</p>
            ) : (
              <div className="category-bars">
                {categories.map((item, index) => {
                  const amount = categoryAmount(item);
                  const percent = (amount / maxCategory) * 100;

                  return (
                    <div className="category-entry" key={`${categoryName(item)}-${index}`}>
                      <div className="category-entry-top">
                        <span className="category-number">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="category-entry-name">{categoryName(item)}</span>
                        <strong>{money(amount)}</strong>
                      </div>
                      <div className="bar-rail">
                        <div
                          className={`bar-fill bar-color-${index % 5}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="category-total">
              <span>Total of displayed categories</span>
              <strong>{money(categoryTotal)}</strong>
            </div>
          </article>

          <article className="content-card insight-card" id="insights">
            <div className="card-heading">
              <div>
                <p className="overline">PATTERN DETECTION</p>
                <h2>Spending signals</h2>
                <p className="muted-copy">
                  Results returned by the anomaly analysis API.
                </p>
              </div>
              <span className="signal-icon">⌁</span>
            </div>

            <div className="signal-count">
              <span className="signal-count-number">{number(anomalies.length)}</span>
              <span className="signal-count-label">
                unusual transaction{anomalies.length === 1 ? "" : "s"} returned
              </span>
            </div>

            {loading && anomalies.length === 0 ? (
              <p className="empty-copy">Checking spending signals…</p>
            ) : anomalies.length === 0 ? (
              <div className="no-signals">
                <span className="check-mark">✓</span>
                <div>
                  <strong>No unusual transactions returned</strong>
                  <p>The current analysis returned no anomaly records.</p>
                </div>
              </div>
            ) : (
              <div className="signal-list">
                {anomalies.slice(0, 8).map((item, index) => (
                  <div className="signal-row" key={index}>
                    <span className="signal-alert">!</span>
                    <div>
                      <strong>
                        {item.description ?? item.category_name ?? item.category ?? `Transaction ${index + 1}`}
                      </strong>
                      <span>
                        {item.full_date ?? item.date ?? item.transaction_date ?? "Date not provided"}
                      </span>
                    </div>
                    <b>{money(item.amount ?? item.total_spending ?? 0)}</b>
                  </div>
                ))}
              </div>
            )}

            <div className="insight-foot">
              <span>MINING OUTPUT</span>
              <span>SMARTSPEND / 01</span>
            </div>
          </article>
        </section>

        <section className="olap-section" id="analytics">
          <div className="olap-heading">
            <div>
              <p className="overline">MULTIDIMENSIONAL EXPLORATION</p>
              <h2>The OLAP laboratory.</h2>
              <p>
                Switch between aggregation, year filtering, dimensional
                filtering, and cross-category comparison.
              </p>
            </div>

            <div className="year-picker">
              <label htmlFor="slice-year">SLICE YEAR</label>
              <select
                id="slice-year"
                value={selectedYear}
                onChange={(event) => setSelectedYear(event.target.value)}
              >
                {Array.from({ length: 10 }, (_, index) =>
                  String(new Date().getFullYear() - index)
                ).map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="olap-options">
            <button
              className={`olap-option ${olapOperation === "roll-up" ? "chosen" : ""}`}
              onClick={() => loadOlap("roll-up")}
              disabled={olapLoading}
              type="button"
            >
              <span className="operation-index">01</span>
              <span className="operation-name">Roll-up</span>
              <span className="operation-description">Summarize by time levels</span>
              <span className="operation-arrow">↗</span>
            </button>

            <button
              className={`olap-option ${olapOperation === "slice" ? "chosen" : ""}`}
              onClick={() => loadOlap("slice")}
              disabled={olapLoading}
              type="button"
            >
              <span className="operation-index">02</span>
              <span className="operation-name">Slice</span>
              <span className="operation-description">Focus on one year</span>
              <span className="operation-arrow">↗</span>
            </button>

            <button
              className={`olap-option ${olapOperation === "dice" ? "chosen" : ""}`}
              onClick={() => loadOlap("dice")}
              disabled={olapLoading}
              type="button"
            >
              <span className="operation-index">03</span>
              <span className="operation-name">Dice</span>
              <span className="operation-description">Filter multiple dimensions</span>
              <span className="operation-arrow">↗</span>
            </button>

            <button
              className={`olap-option ${olapOperation === "pivot" ? "chosen" : ""}`}
              onClick={() => loadOlap("pivot")}
              disabled={olapLoading}
              type="button"
            >
              <span className="operation-index">04</span>
              <span className="operation-name">Pivot</span>
              <span className="operation-description">Compare category totals</span>
              <span className="operation-arrow">↗</span>
            </button>
          </div>

          {(olapOperation || olapLoading || olapError) && (
            <div className="olap-output">
              <div className="output-heading">
                <div>
                  <p className="overline">QUERY OUTPUT</p>
                  <h3>{operationLabels[olapOperation] || "Analysis results"}</h3>
                </div>
                <button
                  className="output-clear"
                  type="button"
                  onClick={() => {
                    setOlapOperation("");
                    setOlapResults([]);
                    setOlapError("");
                  }}
                >
                  Clear ×
                </button>
              </div>

              {olapLoading && <p className="empty-copy">Running analysis…</p>}
              {olapError && <div className="alert-box">{olapError}</div>}

              {!olapLoading && !olapError && olapResults.length === 0 && (
                <p className="empty-copy">No records returned for this operation.</p>
              )}

              {!olapLoading && !olapError && olapResults.length > 0 && (
                <>
                  <p className="result-count">
                    {number(olapResults.length)} ROWS RETURNED
                  </p>
                  <div className="responsive-table">
                    <table className="result-table">
                      <thead>
                        <tr>
                          {columns.map((key) => (
                            <th key={key}>
                              {key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase())}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {olapResults.map((row, index) => (
                          <tr key={index}>
                            {columns.map((key) => (
                              <td key={key}>{formatCell(key, row[key])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        <footer className="spend-footer">
          <a className="footer-brand" href="#home">smartspend.</a>
          <span>PERSONAL FINANCE ANALYTICS</span>
          <a href="#home">Back to top ↑</a>
        </footer>
      </main>
    </div>
  );
}

export default App;
