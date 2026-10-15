
import { useCallback, useEffect, useState } from "react";
import "./App.css";

const API_BASE = "https://smartspend-backend-iu60.onrender.com";

const formatMoney = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const getRows = (response) => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.categories)) return response.categories;
  if (Array.isArray(response?.anomalies)) return response.anomalies;
  if (Array.isArray(response?.unusual_transactions))
    return response.unusual_transactions;
  return [];
};

async function apiRequest(path) {
  const response = await fetch(`${API_BASE}${path}`);
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      body.detail || body.message || `Request failed (${response.status})`
    );
  }

  return body;
}

function MetricCard({ label, value, detail, icon }) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span className="metric-label">{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
    </article>
  );
}

function EmptyState({ children }) {
  return <div className="empty-state">{children}</div>;
}

function DataTable({ rows }) {
  if (!rows.length) {
    return <EmptyState>No records to display for this operation.</EmptyState>;
  }

  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  const displayValue = (key, value) => {
    if (value === null || value === undefined || value === "") return "—";
    if (
      typeof value === "number" &&
      /amount|spending|total|average|expense|sum/i.test(key)
    ) {
      return formatMoney(value);
    }
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column.replaceAll("_", " ")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.transaction_id ?? row.id ?? index}>
              {columns.map((column) => (
                <td key={column}>{displayValue(column, row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState([]);

  const [operation, setOperation] = useState("roll-up");
  const [year, setYear] = useState("2026");
  const [olapRows, setOlapRows] = useState([]);
  const [olapLoading, setOlapLoading] = useState(false);
  const [olapError, setOlapError] = useState("");
  const [olapMessage, setOlapMessage] = useState("");

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const results = await Promise.allSettled([
      apiRequest("/api/summary"),
      apiRequest("/api/categories"),
      apiRequest("/api/mining/anomalies"),
    ]);

    const nextErrors = [];

    if (results[0].status === "fulfilled") {
      setSummary(results[0].value);
    } else {
      nextErrors.push(`Summary: ${results[0].reason.message}`);
    }

    if (results[1].status === "fulfilled") {
      setCategories(getRows(results[1].value));
    } else {
      nextErrors.push(`Categories: ${results[1].reason.message}`);
    }

    if (results[2].status === "fulfilled") {
      setAnomalies(getRows(results[2].value));
    } else {
      nextErrors.push(`Insights: ${results[2].reason.message}`);
    }

    setErrors(nextErrors);
    setLoading(false);
    setRefreshing(false);
  }, []);

  const runOlap = useCallback(async () => {
    setOlapLoading(true);
    setOlapError("");
    setOlapMessage("");
    setOlapRows([]);

    try {
      let path = `/api/olap/${operation}`;

      if (operation === "slice") {
        path += `?year=${encodeURIComponent(year)}`;
      }

      const result = await apiRequest(path);
      const rows = getRows(result);

      setOlapRows(rows);
      setOlapMessage(
        result.description ||
          result.message ||
          `${operation.toUpperCase()} completed.`
      );

      if (!rows.length && !result.description && !result.message) {
        setOlapMessage(
          "The API responded, but returned no rows in a recognized data array."
        );
      }
    } catch (error) {
      setOlapError(
        `${error.message}. Check the API response and required parameters for this operation.`
      );
    } finally {
      setOlapLoading(false);
    }
  }, [operation, year]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const totalSpending = Number(
    summary?.total_spending ?? summary?.total_expenses ?? 0
  );

  const transactionCount = Number(
    summary?.transaction_count ?? summary?.total_transactions ?? 0
  );

  const averageSpending = Number(
    summary?.average_spending ??
      (transactionCount ? totalSpending / transactionCount : 0)
  );

  const categoryCount = categories.length;

  const getCategoryName = (item) =>
    item.category_name ?? item.category ?? item.name ?? "Other";

  const getCategoryAmount = (item) =>
    Number(
      item.total_spending ??
        item.total_amount ??
        item.amount ??
        item.total ??
        item.sum ??
        0
    );

  const categoryTotal = categories.reduce(
    (total, item) => total + getCategoryAmount(item),
    0
  );

  const getAnomalyDescription = (item) =>
    item.description ??
    item.reason ??
    item.transaction_description ??
    item.category_name ??
    item.category ??
    "Unusual transaction";

  const getAnomalyAmount = (item) =>
    item.amount ?? item.total_amount ?? item.spending;

  return (
    <div className="app-shell" id="dashboard">
      <header className="topbar">
        <a className="brand" href="#dashboard" aria-label="SmartSpend home">
          <span className="brand-mark">S</span>
          <span>
            <strong>smartspend</strong>
            <small>PERSONAL FINANCE LAB</small>
          </span>
        </a>

        <nav className="nav-links" aria-label="Main navigation">
          <a className="active" href="#overview">Overview</a>
          <a href="#categories">Categories</a>
          <a href="#insights">Insights</a>
          <a href="#olap">OLAP Lab</a>
        </nav>

        <button
          className="refresh-button"
          onClick={() => loadDashboard(true)}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing…" : "↻ Refresh"}
        </button>
      </header>

      <main>
        <section className="hero" id="overview">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="status-dot" />
              YOUR MONEY, IN PERSPECTIVE
            </div>
            <h1>
              Make every
              <br />
              rupee <span>count.</span>
            </h1>
            <p>
              A clearer view of your spending habits, category patterns,
              and historical financial activity.
            </p>
            <a className="hero-link" href="#categories">
              Explore your data <span>↗</span>
            </a>
          </div>

          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <div className="hero-coin">₹</div>
            <span className="art-label art-label-one">TRACK</span>
            <span className="art-label art-label-two">LEARN</span>
            <span className="art-label art-label-three">GROW</span>
            <div className="art-dot dot-one" />
            <div className="art-dot dot-two" />
            <div className="art-dot dot-three" />
          </div>

          <div className="hero-footer">
            <span>SMARTSPEND ANALYTICS</span>
            <span>01 / OVERVIEW</span>
          </div>
        </section>

        {errors.length > 0 && (
          <section className="notice error-notice" role="alert">
            <strong>Some dashboard data could not be loaded.</strong>
            {errors.map((error) => <p key={error}>{error}</p>)}
            <button onClick={() => loadDashboard(true)}>Try again</button>
          </section>
        )}

        <section className="section-block">
          <div className="section-heading">
            <div>
              <span className="section-kicker">THE BIG PICTURE</span>
              <h2>Your numbers, at a glance.</h2>
            </div>
            <span className="live-label">
              <span className="status-dot" /> LIVE DATA
            </span>
          </div>

          <div className="metrics-grid">
            <MetricCard
              label="Total spending"
              value={loading ? "Loading…" : formatMoney(totalSpending)}
              detail="Recorded expenses"
              icon="₹"
            />
            <MetricCard
              label="Transactions"
              value={loading ? "—" : transactionCount.toLocaleString("en-IN")}
              detail="Transactions recorded"
              icon="↗"
            />
            <MetricCard
              label="Average transaction"
              value={loading ? "—" : formatMoney(averageSpending)}
              detail="Average per transaction"
              icon="∅"
            />
            <MetricCard
              label="Categories"
              value={loading ? "—" : categoryCount}
              detail="Spending categories returned"
              icon="▦"
            />
          </div>
        </section>

        <section className="content-grid">
          <article className="panel category-panel" id="categories">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">WHERE IT GOES</span>
                <h2>Spending by category</h2>
              </div>
              <span className="panel-icon">↗</span>
            </div>

            {loading ? (
              <EmptyState>Loading category data…</EmptyState>
            ) : categories.length === 0 ? (
              <EmptyState>
                No category data returned. Refresh to try again.
              </EmptyState>
            ) : (
              <div className="category-list">
                {categories.map((item, index) => {
                  const amount = getCategoryAmount(item);
                  const percentage =
                    categoryTotal > 0 ? (amount / categoryTotal) * 100 : 0;

                  return (
                    <div
                      className="category-item"
                      key={`${getCategoryName(item)}-${index}`}
                    >
                      <div className="category-line">
                        <span className="category-name">
                          <span className={`category-dot color-${index % 5}`} />
                          {getCategoryName(item)}
                        </span>
                        <strong>{formatMoney(amount)}</strong>
                      </div>
                      <div
                        className="progress-track"
                        role="progressbar"
                        aria-label={`${getCategoryName(item)} share`}
                        aria-valuenow={Math.round(percentage)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className={`progress-fill fill-${index % 5}`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                      <div className="category-percent">
                        {percentage.toFixed(1)}% of returned category total
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </article>

          <article className="panel insights-panel" id="insights">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">PATTERN DETECTION</span>
                <h2>Unusual spending insights</h2>
              </div>
              <span className="panel-icon">⌁</span>
            </div>

            <div className="insight-summary">
              <span className="insight-check">✓</span>
              <div>
                <strong>
                  {loading ? "Checking transactions…" :
                    anomalies.length ? `${anomalies.length} flagged record(s)` :
                    "No unusual transactions returned"}
                </strong>
                <p>
                  {loading
                    ? "Waiting for the analysis service."
                    : anomalies.length
                      ? "Review the flagged records below."
                      : "The API returned no unusual transactions."}
                </p>
              </div>
            </div>

            {anomalies.length > 0 && (
              <div className="anomaly-list">
                {anomalies.slice(0, 6).map((item, index) => (
                  <div
                    className="anomaly-item"
                    key={item.transaction_id ?? item.id ?? index}
                  >
                    <span className="anomaly-symbol">!</span>
                    <div className="anomaly-copy">
                      <strong>{getAnomalyDescription(item)}</strong>
                      <small>
                        {item.full_date ?? item.date ?? item.transaction_date ?? "Date unavailable"}
                      </small>
                    </div>
                    <strong className="anomaly-amount">
                      {getAnomalyAmount(item) !== undefined
                        ? formatMoney(getAnomalyAmount(item))
                        : "Review"}
                    </strong>
                  </div>
                ))}
              </div>
            )}

            <div className="privacy-note">
              <span>✳</span>
              Insights depend on the records returned by your analysis API.
            </div>
          </article>
        </section>

        <section className="olap-section" id="olap">
          <div className="olap-heading">
            <div>
              <span className="section-kicker">DATA WAREHOUSE TOOLKIT</span>
              <h2>Explore your data.</h2>
              <p>
                Run OLAP operations to inspect your spending from different
                analytical perspectives.
              </p>
            </div>
            <div className="olap-stamp">DWM<br />LAB / 01</div>
          </div>

          <div className="olap-controls">
            {[
              { id: "roll-up", title: "Roll-up", subtitle: "Summarize data" },
              { id: "slice", title: "Slice", subtitle: "Filter by year" },
              { id: "dice", title: "Dice", subtitle: "Multidimensional view" },
              { id: "pivot", title: "Pivot", subtitle: "Reorient the data" },
            ].map((item, index) => (
              <button
                key={item.id}
                className={`olap-card ${operation === item.id ? "selected" : ""}`}
                onClick={() => {
                  setOperation(item.id);
                  setOlapRows([]);
                  setOlapError("");
                  setOlapMessage("");
                }}
                aria-pressed={operation === item.id}
              >
                <span className="olap-number">0{index + 1}</span>
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
                <span className="olap-arrow">↗</span>
              </button>
            ))}
          </div>

          {operation === "slice" && (
            <div className="year-control">
              <label htmlFor="slice-year">Filter year</label>
              <input
                id="slice-year"
                type="number"
                min="2000"
                max="2100"
                value={year}
                onChange={(event) => setYear(event.target.value)}
              />
            </div>
          )}

          <div className="run-row">
            <div>
              <strong>{operation.toUpperCase()} operation</strong>
              <p>
                {operation === "slice"
                  ? `Selected year: ${year}`
                  : "Execute the selected operation against the backend."}
              </p>
            </div>
            <button
              className="run-button"
              onClick={runOlap}
              disabled={olapLoading || (operation === "slice" && !year)}
            >
              {olapLoading ? "Running…" : "Run operation →"}
            </button>
          </div>

          {olapError && (
            <div className="notice error-notice" role="alert">
              {olapError}
            </div>
          )}

          {olapMessage && !olapError && (
            <div className="result-message">{olapMessage}</div>
          )}

          {olapRows.length > 0 && (
            <div className="results-panel">
              <div className="results-heading">
                <h3>Operation results</h3>
                <span>{olapRows.length} row(s)</span>
              </div>
              <DataTable rows={olapRows} />
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        <a className="footer-brand" href="#dashboard">smartspend<span>®</span></a>
        <span>Personal finance · Data warehouse · Analytics</span>
        <a href="#dashboard">Back to top ↑</a>
      </footer>
    </div>
  );
}
