
import { useCallback, useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import "./App.css";

const API_BASE = "https://smartspend-backend-iu60.onrender.com";

const COLORS = [
  "#2563eb", "#0d9488", "#f59e0b", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#64748b",
];

const currency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const number = (value) =>
  new Intl.NumberFormat("en-IN").format(Number(value) || 0);

const categoryName = (item) =>
  item.category_name ?? item.category ?? item.name ?? "Uncategorized";

const categoryAmount = (item) =>
  Number(
    item.total_spending ??
    item.total_amount ??
    item.amount ??
    item.total ??
    0
  );

function extractRows(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.categories)) return response.categories;
  if (Array.isArray(response?.unusual_transactions)) {
    return response.unusual_transactions;
  }
  if (Array.isArray(response?.anomalies)) return response.anomalies;
  return [];
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.json();
}

function App() {
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const [olapResults, setOlapResults] = useState([]);
  const [olapOperation, setOlapOperation] = useState("");
  const [olapLoading, setOlapLoading] = useState(false);
  const [olapError, setOlapError] = useState("");
  const [selectedYear, setSelectedYear] = useState(
    String(new Date().getFullYear())
  );

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError("");

    const results = await Promise.allSettled([
      fetchJson(`${API_BASE}/api/summary`),
      fetchJson(`${API_BASE}/api/categories`),
      fetchJson(`${API_BASE}/api/mining/anomalies`),
    ]);

    if (results[0].status === "fulfilled") {
      setSummary(results[0].value);
    } else {
      setDashboardError(
        `Could not load summary: ${results[0].reason?.message || "Unknown error"}`
      );
    }

    if (results[1].status === "fulfilled") {
      setCategories(extractRows(results[1].value));
    }

    if (results[2].status === "fulfilled") {
      setAnomalies(extractRows(results[2].value));
    }

    setDashboardLoading(false);
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");

    try {
      const response = await fetchJson(
        `${API_BASE}/api/olap/roll-up`
      );

      const rows = extractRows(response);

      const normalized = rows
        .map((row) => ({
          ...row,
          year: Number(row.year),
          month: Number(row.month),
          total_spending: Number(row.total_spending) || 0,
          average_spending: Number(row.average_spending) || 0,
          transaction_count: Number(row.transaction_count) || 0,
          period: `${row.month_name || row.month} ${row.year}`,
        }))
        .sort((a, b) => a.year - b.year || a.month - b.month);

      setHistory(normalized);
    } catch (error) {
      setHistoryError(error.message || "Could not load spending history.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    loadHistory();
  }, [loadDashboard, loadHistory]);

  async function loadOlap(operation) {
    setOlapOperation(operation);
    setOlapResults([]);
    setOlapError("");
    setOlapLoading(true);

    try {
      let url = `${API_BASE}/api/olap/${operation}`;

      if (operation === "slice") {
        url += `?year=${encodeURIComponent(selectedYear)}`;
      }

      const response = await fetchJson(url);
      const rows = extractRows(response);
      setOlapResults(rows);
    } catch (error) {
      setOlapError(error.message || "Could not load OLAP results.");
    } finally {
      setOlapLoading(false);
    }
  }

  const categoryData = categories
    .map((item) => ({
      category: categoryName(item),
      total: categoryAmount(item),
    }))
    .sort((a, b) => b.total - a.total);

  const categoryTotal = categoryData.reduce(
    (sum, item) => sum + item.total,
    0
  );

  const olapColumns =
    olapResults.length > 0 ? Object.keys(olapResults[0]) : [];

  const operationLabels = {
    "roll-up": "Roll-Up Analysis",
    slice: `Slice Analysis — ${selectedYear}`,
    dice: "Dice Analysis",
    pivot: "Pivot Analysis",
  };

  const formatCell = (key, value) => {
    if (value === null || value === undefined) return "—";

    if (
      typeof value === "number" &&
      /amount|spending|total|average|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i.test(key)
    ) {
      return currency(value);
    }

    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">S</div>
          <div>
            <h2>SmartSpend</h2>
            <span>Personal Finance Analytics</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <a href="#dashboard" className="nav-link active">▦ Dashboard</a>
          <a href="#categories" className="nav-link">◷ Categories</a>
          <a href="#history" className="nav-link">▥ Spending History</a>
          <a href="#olap" className="nav-link">▤ OLAP Analytics</a>
          <a href="#anomalies" className="nav-link">◇ Spending Insights</a>
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot" />
          Data Warehouse Analytics
        </div>
      </aside>

      <main className="main-content" id="dashboard">
        <header className="topbar">
          <div>
            <p className="eyebrow">PERSONAL FINANCE</p>
            <h1>Spending Dashboard</h1>
            <p className="subtitle">
              Track, understand, and analyze your spending patterns.
            </p>
          </div>

          <button
            className="refresh-button"
            onClick={() => {
              loadDashboard();
              loadHistory();
            }}
            disabled={dashboardLoading || historyLoading}
          >
            ↻ Refresh data
          </button>
        </header>

        {dashboardError && (
          <p className="error-message" role="alert">{dashboardError}</p>
        )}

        <section className="metrics-grid">
          <article className="metric-card">
            <span className="metric-label">Total Spending</span>
            <span className="metric-icon">₹</span>
            <h2>
              {summary
                ? currency(summary.total_spending)
                : dashboardLoading ? "Loading..." : "—"}
            </h2>
            <p>Recorded expenses</p>
          </article>

          <article className="metric-card">
            <span className="metric-label">Total Transactions</span>
            <span className="metric-icon">↗</span>
            <h2>
              {summary
                ? number(summary.transaction_count)
                : dashboardLoading ? "Loading..." : "—"}
            </h2>
            <p>Historical records</p>
          </article>

          <article className="metric-card">
            <span className="metric-label">Average Transaction</span>
            <span className="metric-icon">₹</span>
            <h2>
              {summary
                ? currency(summary.average_spending)
                : dashboardLoading ? "Loading..." : "—"}
            </h2>
            <p>Average amount spent</p>
          </article>

          <article className="metric-card">
            <span className="metric-label">Categories Tracked</span>
            <span className="metric-icon">▦</span>
            <h2>{number(categoryData.length)}</h2>
            <p>Spending categories</p>
          </article>

          <article className="metric-card">
            <span className="metric-label">Unusual Transactions</span>
            <span className="metric-icon">◇</span>
            <h2>{number(anomalies.length)}</h2>
            <p>Returned by mining API</p>
          </article>

          <article className="metric-card">
            <span className="metric-label">Data Source</span>
            <span className="metric-icon">▤</span>
            <h2 className="source-value">
              {summary?.data_source === "database"
                ? "Database"
                : summary?.data_source === "demo_fallback"
                  ? "Demo data"
                  : summary ? "API" : "—"}
            </h2>
            <p>Reported by backend</p>
          </article>
        </section>

        <section className="panel" id="categories">
          <div className="panel-heading">
            <div>
              <h3>Historical Spending by Category</h3>
              <p>Compare recorded spending for each category.</p>
            </div>
          </div>

          {dashboardLoading && categoryData.length === 0 ? (
            <p className="empty-state">Loading categories...</p>
          ) : categoryData.length === 0 ? (
            <p className="empty-state">No category records were returned.</p>
          ) : (
            <>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="total"
                      nameKey="category"
                      innerRadius={55}
                      outerRadius={100}
                      paddingAngle={2}
                    >
                      {categoryData.map((item, index) => (
                        <Cell
                          key={item.category}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => currency(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="category-list">
                {categoryData.map((item, index) => (
                  <div className="category-row" key={item.category}>
                    <div className="category-row-heading">
                      <span>{item.category}</span>
                      <strong>{currency(item.total)}</strong>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${categoryTotal > 0
                            ? (item.total / categoryTotal) * 100
                            : 0}%`,
                          background: COLORS[index % COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <p className="note">
                Total of displayed category values:{" "}
                <strong>{currency(categoryTotal)}</strong>
              </p>
            </>
          )}
        </section>

        <section className="panel" id="history">
          <div className="panel-heading">
            <div>
              <h3>Spending History</h3>
              <p>Monthly spending totals from your data warehouse.</p>
            </div>
            <button
              className="secondary-button"
              onClick={loadHistory}
              disabled={historyLoading}
            >
              Refresh history
            </button>
          </div>

          {historyLoading && history.length === 0 && (
            <p className="empty-state">Loading monthly history...</p>
          )}
          {historyError && (
            <p className="error-message">{historyError}</p>
          )}
          {!historyLoading && !historyError && history.length === 0 && (
            <p className="empty-state">No monthly history data was returned.</p>
          )}

          {history.length > 0 && (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={340}>
                <LineChart
                  data={history}
                  margin={{ top: 15, right: 20, left: 15, bottom: 35 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="period"
                    angle={-25}
                    textAnchor="end"
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={(value) => `₹${number(value)}`}
                  />
                  <Tooltip
                    formatter={(value) => currency(value)}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="total_spending"
                    name="Monthly spending"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {history.length > 0 && (
            <div className="chart-container">
              <h3>Monthly Spending Comparison</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis tickFormatter={(value) => `₹${number(value)}`} />
                  <Tooltip formatter={(value) => currency(value)} />
                  <Bar
                    dataKey="total_spending"
                    name="Monthly spending"
                    fill="#0d9488"
                    radius={[5, 5, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="panel" id="olap">
          <div className="panel-heading">
            <div>
              <h3>📊 OLAP Analytics</h3>
              <p>Explore historical spending using multidimensional analysis.</p>
            </div>
            <span className="section-badge">Data Warehouse</span>
          </div>

          <div className="olap-controls">
            <label htmlFor="slice-year">Year for Slice analysis</label>
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

          <div className="olap-grid">
            {[
              ["roll-up", "Roll-Up", "Summarize spending by year and month"],
              ["slice", "Slice", "Analyze category spending for one year"],
              ["dice", "Dice", "Filter spending across dimensions"],
              ["pivot", "Pivot", "Compare categories across calendar months"],
            ].map(([operation, title, description]) => (
              <button
                key={operation}
                type="button"
                className="olap-card"
                onClick={() => loadOlap(operation)}
                disabled={olapLoading}
              >
                <strong>{title}</strong>
                <span>{description}</span>
              </button>
            ))}
          </div>

          {(olapOperation || olapLoading || olapError) && (
            <div className="olap-results" aria-live="polite">
              <div className="panel-heading">
                <div>
                  <h3>{operationLabels[olapOperation] || "OLAP Results"}</h3>
                  <p>Results from your SmartSpend backend.</p>
                </div>
                <button
                  className="close-results"
                  onClick={() => {
                    setOlapOperation("");
                    setOlapResults([]);
                    setOlapError("");
                  }}
                >
                  Clear
                </button>
              </div>

              {olapLoading && (
                <p className="empty-state">Loading OLAP results...</p>
              )}
              {olapError && (
                <p className="error-message">{olapError}</p>
              )}
              {!olapLoading && !olapError && olapResults.length === 0 && (
                <p className="empty-state">No records returned for this operation.</p>
              )}

              {!olapLoading && !olapError && olapResults.length > 0 && (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        {olapColumns.map((column) => (
                          <th key={column}>
                            {column.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase())}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {olapResults.map((row, index) => (
                        <tr key={index}>
                          {olapColumns.map((column) => (
                            <td key={column}>
                              {formatCell(column, row[column])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {olapOperation === "roll-up" && olapResults.length > 0 && (
                <div className="chart-container">
                  <h3>Roll-Up Monthly Trend</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={olapResults}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month_name" />
                      <YAxis />
                      <Tooltip formatter={(value) => currency(value)} />
                      <Line
                        type="monotone"
                        dataKey="total_spending"
                        name="Monthly spending"
                        stroke="#2563eb"
                        strokeWidth={3}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {olapOperation === "pivot" && olapResults.length > 0 && (
                <div className="table-wrapper">
                  <p className="note">
                    Pivot compares category spending across calendar months.
                  </p>
                </div>
              )}
            </div>
          )}

          <p className="note">
            Select an operation to view its results inside the dashboard.
          </p>
        </section>

        <section className="panel" id="anomalies">
          <div className="panel-heading">
            <div>
              <h3>Unusual Spending Insights</h3>
              <p>Review unusual transactions returned by the mining API.</p>
            </div>
          </div>

          {dashboardLoading && anomalies.length === 0 ? (
            <p className="empty-state">Loading spending insights...</p>
          ) : anomalies.length === 0 ? (
            <p className="empty-state">
              No unusual transactions detected, or no anomaly records were returned.
            </p>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    {Object.keys(anomalies[0]).map((key) => (
                      <th key={key}>
                        {key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase())}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {anomalies.map((row, index) => (
                    <tr key={index}>
                      {Object.keys(anomalies[0]).map((key) => (
                        <td key={key}>{formatCell(key, row[key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="page-footer">
          SmartSpend · Historical Spending Analytics · Data Warehouse
        </footer>
      </main>
    </div>
  );
}

export default App;
