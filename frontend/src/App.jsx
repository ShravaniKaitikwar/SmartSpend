
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  AreaChart,
  Area,
} from "recharts";
import "./App.css";

const API_BASE = "https://smartspend-backend-iu60.onrender.com";

const CHART_COLORS = [
  "#245b42",
  "#a8c95c",
  "#e1b86b",
  "#7395b5",
  "#c7867c",
  "#8c7ab8",
  "#55a6a0",
  "#d18b48",
];

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const number = (value) =>
  new Intl.NumberFormat("en-IN").format(Number(value) || 0);

async function api(path) {
  const response = await fetch(`${API_BASE}${path}`);
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      body.detail || body.message || `API request failed (${response.status})`
    );
  }

  return body;
}

function rowsFrom(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.categories)) return value.categories;
  if (Array.isArray(value?.anomalies)) return value.anomalies;
  if (Array.isArray(value?.unusual_transactions))
    return value.unusual_transactions;
  return [];
}

function categoryName(item) {
  return String(
    item.category_name ?? item.category ?? item.name ?? "Other"
  );
}

function categoryAmount(item) {
  return Number(
    item.total_spending ??
      item.total_amount ??
      item.amount ??
      item.total ??
      item.sum ??
      0
  );
}

function chartDateLabel(item) {
  return (
    item.month_name ??
    item.monthName ??
    item.month ??
    item.full_date ??
    item.date ??
    item.period ??
    item.label ??
    item.year_month ??
    null
  );
}

function chartValue(item) {
  return Number(
    item.total_spending ??
      item.total_amount ??
      item.monthly_spending ??
      item.total_expenses ??
      item.amount ??
      item.total ??
      item.sum ??
      0
  );
}

function StatCard({ title, value, caption, symbol }) {
  return (
    <article className="stat-card">
      <div className="stat-card-top">
        <span>{title}</span>
        <span className="stat-symbol">{symbol}</span>
      </div>
      <strong className="stat-value">{value}</strong>
      <span className="stat-caption">{caption}</span>
    </article>
  );
}

function PanelHeading({ eyebrow, title, extra }) {
  return (
    <div className="panel-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {extra}
    </div>
  );
}

function EmptyState({ children }) {
  return <div className="empty-state">{children}</div>;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip">
      {label && <strong>{label}</strong>}
      {payload.map((entry, index) => (
        <div key={`${entry.name}-${index}`}>
          <span
            className="tooltip-dot"
            style={{ background: entry.color || entry.fill }}
          />
          <span>{entry.name || "Spending"}: </span>
          <strong>{money(entry.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function ResultsTable({ rows }) {
  if (!rows.length) {
    return <EmptyState>No rows were returned for this operation.</EmptyState>;
  }

  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  return (
    <div className="table-scroll">
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
              {columns.map((column) => {
                const value = row[column];
                const isMoney =
                  typeof value === "number" &&
                  /amount|spending|expense|total|sum/i.test(column);

                return (
                  <td key={column}>
                    {value === null || value === undefined
                      ? "—"
                      : isMoney
                        ? money(value)
                        : typeof value === "object"
                          ? JSON.stringify(value)
                          : String(value)}
                  </td>
                );
              })}
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
  const [monthlyRows, setMonthlyRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState([]);

  const [operation, setOperation] = useState("roll-up");
  const [year, setYear] = useState("2026");
  const [olapRows, setOlapRows] = useState([]);
  const [olapLoading, setOlapLoading] = useState(false);
  const [olapError, setOlapError] = useState("");
  const [olapDescription, setOlapDescription] = useState("");

  const loadDashboard = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    const results = await Promise.allSettled([
      api("/api/summary"),
      api("/api/categories"),
      api("/api/mining/anomalies"),
      api("/api/olap/roll-up"),
    ]);

    const nextErrors = [];

    if (results[0].status === "fulfilled") {
      setSummary(results[0].value);
    } else {
      nextErrors.push(`Summary: ${results[0].reason.message}`);
    }

    if (results[1].status === "fulfilled") {
      setCategories(rowsFrom(results[1].value));
    } else {
      nextErrors.push(`Categories: ${results[1].reason.message}`);
    }

    if (results[2].status === "fulfilled") {
      setAnomalies(rowsFrom(results[2].value));
    } else {
      nextErrors.push(`Insights: ${results[2].reason.message}`);
    }

    if (results[3].status === "fulfilled") {
      setMonthlyRows(rowsFrom(results[3].value));
    } else {
      setMonthlyRows([]);
    }

    setErrors(nextErrors);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const categoryChart = useMemo(
    () =>
      categories
        .map((item) => ({
          name: categoryName(item),
          amount: categoryAmount(item),
        }))
        .filter((item) => Number.isFinite(item.amount) && item.amount >= 0)
        .sort((a, b) => b.amount - a.amount),
    [categories]
  );

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

  const categoryTotal = categoryChart.reduce(
    (total, item) => total + item.amount,
    0
  );

  const monthlyChart = useMemo(() => {
    const parsed = monthlyRows
      .map((item) => ({
        label: chartDateLabel(item),
        amount: chartValue(item),
      }))
      .filter(
        (item) =>
          item.label !== null &&
          item.label !== undefined &&
          String(item.label).trim() !== "" &&
          Number.isFinite(item.amount)
      );

    const looksMonthly = parsed.some((item) =>
      /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|month|202\d[-/]/i.test(
        String(item.label)
      )
    );

    return looksMonthly ? parsed : [];
  }, [monthlyRows]);

  const runOlap = useCallback(async () => {
    setOlapLoading(true);
    setOlapError("");
    setOlapDescription("");
    setOlapRows([]);

    try {
      let path = `/api/olap/${operation}`;

      if (operation === "slice") {
        path += `?year=${encodeURIComponent(year)}`;
      }

      const result = await api(path);
      setOlapRows(rowsFrom(result));
      setOlapDescription(
        result?.description ?? result?.message ?? `${operation} response received.`
      );
    } catch (error) {
      setOlapError(error.message);
    } finally {
      setOlapLoading(false);
    }
  }, [operation, year]);

  return (
    <div className="app-shell" id="top">
      <header className="topbar">
        <a className="brand" href="#top">
          <span className="brand-mark">S</span>
          <span>
            <strong>smartspend</strong>
            <small>PERSONAL FINANCE LAB</small>
          </span>
        </a>

        <nav className="nav-links" aria-label="Main navigation">
          <a href="#overview">Overview</a>
          <a href="#charts">Charts</a>
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
            <span className="hero-eyebrow">
              <span className="status-dot" />
              YOUR MONEY, IN PERSPECTIVE
            </span>
            <h1>
              Make every
              <br />
              rupee <span>count.</span>
            </h1>
            <p>
              Understand spending patterns, explore category distribution,
              and make better-informed financial decisions.
            </p>
            <a className="hero-link" href="#charts">
              Explore your data <span>↗</span>
            </a>
          </div>

          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <div className="hero-coin">₹</div>
            <span className="art-label label-one">TRACK</span>
            <span className="art-label label-two">LEARN</span>
            <span className="art-label label-three">GROW</span>
          </div>

          <div className="hero-footer">
            <span>SMARTSPEND ANALYTICS</span>
            <span>DATA WAREHOUSE PROJECT</span>
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
              <span className="eyebrow">THE BIG PICTURE</span>
              <h2>Your numbers, at a glance.</h2>
            </div>
            <span className="live-label">
              <span className="status-dot" /> LIVE API DATA
            </span>
          </div>

          <div className="stats-grid">
            <StatCard
              title="Total spending"
              value={loading ? "Loading…" : money(totalSpending)}
              caption="Recorded expenses"
              symbol="₹"
            />
            <StatCard
              title="Transactions"
              value={loading ? "—" : number(transactionCount)}
              caption="Recorded transactions"
              symbol="↗"
            />
            <StatCard
              title="Average transaction"
              value={loading ? "—" : money(averageSpending)}
              caption="Average per transaction"
              symbol="∅"
            />
            <StatCard
              title="Categories"
              value={loading ? "—" : number(categoryChart.length)}
              caption="Categories returned by API"
              symbol="▦"
            />
          </div>
        </section>

        <section className="charts-section" id="charts">
          <div className="section-heading">
            <div>
              <span className="eyebrow">VISUAL ANALYTICS</span>
              <h2>See where it goes.</h2>
            </div>
            <span className="section-note">Built from backend responses</span>
          </div>

          <div className="chart-grid">
            <article className="panel chart-panel">
              <PanelHeading
                eyebrow="CATEGORY DISTRIBUTION"
                title="Spending breakdown"
                extra={<span className="chart-badge">DONUT</span>}
              />

              {loading ? (
                <EmptyState>Loading category chart…</EmptyState>
              ) : categoryChart.length === 0 || categoryTotal === 0 ? (
                <EmptyState>
                  No non-zero category totals were returned by the API.
                </EmptyState>
              ) : (
                <>
                  <div className="donut-wrap">
                    <ResponsiveContainer width="100%" height={270}>
                      <PieChart>
                        <Pie
                          data={categoryChart}
                          dataKey="amount"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={105}
                          paddingAngle={3}
                          cornerRadius={4}
                        >
                          {categoryChart.map((entry, index) => (
                            <Cell
                              key={`${entry.name}-${index}`}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                              stroke="none"
                            />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                        <Legend
                          verticalAlign="bottom"
                          height={36}
                          formatter={(value) => (
                            <span className="legend-label">{value}</span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="donut-center" aria-hidden="true">
                      <span>CATEGORY TOTAL</span>
                      <strong>{money(categoryTotal)}</strong>
                    </div>
                  </div>
                  <div className="chart-footnote">
                    Sum of the category amounts returned by the API.
                  </div>
                </>
              )}
            </article>

            <article className="panel chart-panel">
              <PanelHeading
                eyebrow="CATEGORY COMPARISON"
                title="Spending by category"
                extra={<span className="chart-badge">BAR CHART</span>}
              />

              {loading ? (
                <EmptyState>Loading category chart…</EmptyState>
              ) : categoryChart.length === 0 ? (
                <EmptyState>No category data is available to plot.</EmptyState>
              ) : (
                <div className="bar-chart-wrap">
                  <ResponsiveContainer width="100%" height={310}>
                    <BarChart
                      data={categoryChart}
                      margin={{ top: 8, right: 8, left: 4, bottom: 48 }}
                    >
                      <CartesianGrid
                        stroke="#e9eee5"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        interval={0}
                        angle={-30}
                        textAnchor="end"
                        height={65}
                        tick={{ fill: "#758477", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        width={65}
                        tickFormatter={(value) => `₹${number(value)}`}
                        tick={{ fill: "#758477", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar
                        dataKey="amount"
                        name="Spending"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={48}
                      >
                        {categoryChart.map((entry, index) => (
                          <Cell
                            key={`${entry.name}-${index}`}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </article>
          </div>

          <article className="panel monthly-panel">
            <PanelHeading
              eyebrow="TIME-BASED ANALYSIS"
              title="Monthly spending trend"
              extra={<span className="chart-badge">AREA CHART</span>}
            />

            {loading ? (
              <EmptyState>Loading monthly data…</EmptyState>
            ) : monthlyChart.length === 0 ? (
              <EmptyState>
                The Roll-up endpoint did not return recognizable monthly
                totals. This chart needs monthly data from the backend; no
                values have been fabricated.
              </EmptyState>
            ) : (
              <ResponsiveContainer width="100%" height={290}>
                <AreaChart
                  data={monthlyChart}
                  margin={{ top: 12, right: 15, left: 8, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="spendingFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6e9b55" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6e9b55" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="#e9eee5"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#758477", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(value) => `₹${number(value)}`}
                    tick={{ fill: "#758477", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    name="Monthly spending"
                    stroke="#326847"
                    strokeWidth={3}
                    fill="url(#spendingFill)"
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </article>
        </section>

        <section className="content-grid">
          <article className="panel" id="insights">
            <PanelHeading
              eyebrow="PATTERN DETECTION"
              title="Unusual spending insights"
              extra={<span className="chart-badge">MINING</span>}
            />

            <div className="insight-summary">
              <span className="insight-check">✓</span>
              <div>
                <strong>
                  {loading
                    ? "Checking transactions…"
                    : anomalies.length
                      ? `${anomalies.length} flagged record(s)`
                      : "No unusual transactions returned"}
                </strong>
                <p>
                  {loading
                    ? "Waiting for the analysis service."
                    : anomalies.length
                      ? "Review the records flagged by the backend."
                      : "The anomaly endpoint returned no flagged records."}
                </p>
              </div>
            </div>

            {anomalies.length > 0 && (
              <div className="anomaly-list">
                {anomalies.slice(0, 8).map((item, index) => (
                  <div
                    className="anomaly-item"
                    key={item.transaction_id ?? item.id ?? index}
                  >
                    <span className="anomaly-symbol">!</span>
                    <div className="anomaly-copy">
                      <strong>
                        {item.description ??
                          item.reason ??
                          item.category_name ??
                          item.category ??
                          "Unusual transaction"}
                      </strong>
                      <small>
                        {item.full_date ??
                          item.date ??
                          item.transaction_date ??
                          "Date unavailable"}
                      </small>
                    </div>
                    <strong className="anomaly-amount">
                      {item.amount !== undefined ? money(item.amount) : "Review"}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="panel">
            <PanelHeading
              eyebrow="CATEGORY SUMMARY"
              title="Top spending categories"
              extra={<span className="chart-badge">{categoryChart.length} ITEMS</span>}
            />

            {loading ? (
              <EmptyState>Loading categories…</EmptyState>
            ) : categoryChart.length === 0 ? (
              <EmptyState>No category data returned.</EmptyState>
            ) : (
              <div className="category-list">
                {categoryChart.slice(0, 8).map((item, index) => {
                  const percentage =
                    categoryTotal > 0
                      ? (item.amount / categoryTotal) * 100
                      : 0;

                  return (
                    <div className="category-item" key={`${item.name}-${index}`}>
                      <div className="category-line">
                        <span>
                          <span
                            className="category-dot"
                            style={{
                              background:
                                CHART_COLORS[index % CHART_COLORS.length],
                            }}
                          />
                          {item.name}
                        </span>
                        <strong>{money(item.amount)}</strong>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${Math.min(percentage, 100)}%`,
                            background:
                              CHART_COLORS[index % CHART_COLORS.length],
                          }}
                        />
                      </div>
                      <small>{percentage.toFixed(1)}% of category total</small>
                    </div>
                  );
                })}
              </div>
            )}
          </article>
        </section>

        <section className="olap-section" id="olap">
          <div className="olap-heading">
            <div>
              <span className="eyebrow">DATA WAREHOUSE TOOLKIT</span>
              <h2>Explore your data.</h2>
              <p>
                Execute analytical operations against the existing backend.
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
                  setOlapDescription("");
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
                  : "Run the selected OLAP operation."}
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

          {olapDescription && !olapError && (
            <div className="result-message">{olapDescription}</div>
          )}

          {olapRows.length > 0 && (
            <div className="results-panel">
              <div className="results-heading">
                <h3>Operation results</h3>
                <span>{olapRows.length} row(s)</span>
              </div>
              <ResultsTable rows={olapRows} />
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        <a className="footer-brand" href="#top">smartspend<span>®</span></a>
        <span>Personal finance · Data warehouse · Analytics</span>
        <a href="#top">Back to top ↑</a>
      </footer>
    </div>
  );
}
