const pages = [
  ["dashboard", "Dashboard", "bi-grid-1x2"],
  ["users", "User Management", "bi-people"],
  ["medicines", "Medicine Management", "bi-capsule"],
  ["suppliers", "Supplier Management", "bi-truck"],
  ["purchases", "Purchase Management", "bi-bag-plus"],
  ["batches", "Batch Management", "bi-box-seam"],
  ["inventory", "Inventory / Stock", "bi-clipboard2-data"],
  ["issue", "Medicine Issue", "bi-box-arrow-up-right"],
  ["returns", "Medicine Return", "bi-arrow-return-left"],
  ["transactions", "Transactions", "bi-arrow-left-right"],
  ["expiry", "Expiry Tracking", "bi-calendar2-x"],
  ["low-stock", "Low Stock", "bi-exclamation-triangle"],
  ["reports", "Reports", "bi-file-earmark-bar-graph"],
];
const initial = {
  users: [],
  medicines: [],
  suppliers: [],
  purchases: [],
  issues: [],
  returns: [],
  transactions: [],
};
// Clear the old fictional demo records once, then preserve records created by the user.
const EMPTY_DATA_VERSION = "empty-tables-v1";
if (localStorage.getItem("meditrack_data_version") !== EMPTY_DATA_VERSION) {
  localStorage.removeItem("meditrack_db");
  localStorage.setItem("meditrack_data_version", EMPTY_DATA_VERSION);
}
let db;
try {
  const stored = JSON.parse(localStorage.getItem("meditrack_db"));
  db = stored
    ? { ...structuredClone(initial), ...stored }
    : structuredClone(initial);
} catch {
  db = structuredClone(initial);
}
for (const key of Object.keys(initial)) {
  if (!Array.isArray(db[key])) db[key] = [];
}
let activePage = "dashboard";
const BACKEND = (window.MEDITRACK_CONFIG?.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const API = `${BACKEND}/api`;
const ENDPOINTS = {
  medicines: "/medicines/",
  suppliers: "/suppliers/",
  purchases: "/batches/",
  issues: "/issues/",
  returns: "/returns/",
  users: "/users/",
};

// ---- login session + roles ----
let token =
  localStorage.getItem("meditrack_token") ||
  sessionStorage.getItem("meditrack_token");
let me = null; // the logged-in user: { id, username, full_name, role }
const ROLE_PAGES = {
  Admin: null, // null = every page
  Pharmacist: ["dashboard", "batches", "inventory", "issue", "returns", "transactions", "expiry", "low-stock", "reports"],
  "Inventory Staff": ["dashboard", "medicines", "suppliers", "purchases", "batches", "inventory", "transactions", "expiry", "low-stock", "reports"],
};
function canSee(id) {
  if (!me) return false;
  if (!(me.role in ROLE_PAGES)) return id === "dashboard";
  const allowed = ROLE_PAGES[me.role];
  return !allowed || allowed.includes(id);
}
let ownActionAt = 0; // used to tell my own changes from other people's
async function api(path, method = "GET", body) {
  if (method !== "GET") ownActionAt = Date.now();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (method !== "GET") ownActionAt = Date.now();
  if (res.status === 401 && path !== "/auth/login/") {
    clearSession();
    throw new Error("Session expired. Please log in again.");
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Object.values(data).flat().join(" ") || "Request failed";
    throw new Error(msg);
  }
  return data;
}
async function reload(...keys) {
  try {
    const wanted = keys.length ? keys : Object.keys(ENDPOINTS);
    const list = wanted.filter((k) => k !== "users" || me?.role === "Admin");
    const results = await Promise.all(list.map((k) => api(ENDPOINTS[k])));
    list.forEach((k, i) => (db[k] = results[i]));
  } catch (err) {
    console.error("Load failed:", err);
    toast("Could not load data: " + err.message);
  }
}
const $ = (s) => document.querySelector(s);
const safe = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const save = () => {
  const { medicines, suppliers, purchases, issues, returns, users, ...rest } = db;
  localStorage.setItem("meditrack_db", JSON.stringify(rest));
};
const today = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};
const fmtDate = (d) =>
  d && !Number.isNaN(new Date(d + "T00:00:00").getTime())
    ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
const money = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
function nav() {
  const links = pages
    .filter(([id]) => canSee(id))
    .map(
      ([id, label, icon]) =>
        `<a href="#${id}" data-page="${id}" class="${activePage === id ? "active" : ""}" title="${label}">
          <i class="bi ${icon}"></i>
          <span>${label}</span>
        </a>`,
    )
    .join("");
  const account = "";
  $("#navigation").innerHTML = `<div class="nav-links">${links}</div>
     <div class="nav-account-links">${account}</div>`;
  $("#navigation")
    .querySelectorAll("a")
    .forEach(
      (a) =>
        (a.onclick = (e) => {
          e.preventDefault();
          showPage(a.dataset.page);
        }),
    );
}
function heading(title, desc, button = "") {
  return `
    <div class="page-heading">
      <div>
        <div class="eyebrow">MEDICINE OPERATIONS</div>
        <h1>${title}</h1>
        <p>${desc}</p>
      </div>
      ${button}
    </div>`;
}
function stat(label, value, icon, tone, note = "Updated just now") {
  return `
    <div class="col-6 col-xl-4 col-xxl-2">
      <div class="stat-card">
        <div class="stat-top">
          <span>${label}</span>
          <span class="stat-icon ${tone}"><i class="bi ${icon}"></i></span>
        </div>
        <div class="stat-value">${value}</div>
        <div class="stat-note">${note}</div>
      </div>
    </div>`;
}
function panel(title, sub, body, extra = "") {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">${title}</h2>
          ${sub ? `<div class="panel-subtitle">${sub}</div>` : ""}
        </div>
        ${extra}
      </div>
      ${body}
    </section>`;
}
function status(text, type = "gray") {
  return `<span class="status status-${type}">${text}</span>`;
}
function table(headers, rows) {
  const headerCells = headers.map((header) => `<th>${header}</th>`).join("");
  const tableRows =
    rows ||
    `<tr>
      <td colspan="${headers.length}">
        <div class="empty-state">
          <i class="bi bi-inbox"></i>
          No records found
        </div>
      </td>
    </tr>`;
  return `
    <div class="table-responsive">
      <table class="table table-hover">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
}
function searchToolbar(placeholder = "Search records...", filters = "") {
  return `
    <div class="toolbar">
      <div class="search-box">
        <i class="bi bi-search"></i>
        <input class="form-control" id="tableSearch" placeholder="${placeholder}">
      </div>
      ${filters}
    </div>`;
}
function actionButtons(type, id) {
  return `
    <div class="d-flex gap-1">
      <button class="action-btn" title="Edit" onclick="editRecord('${type}',${id})">
        <i class="bi bi-pencil"></i>
      </button>
      <button class="action-btn" title="Delete" onclick="deleteRecord('${type}',${id})">
        <i class="bi bi-trash3"></i>
      </button>
    </div>`;
}
function purchaseActionButtons(id) {
  return `
    <div class="d-flex gap-1">
      <button class="action-btn" title="Edit" onclick="editPurchase(${id})">
        <i class="bi bi-pencil"></i>
      </button>
      <button class="action-btn" title="Delete" onclick="deleteRecord('purchases', ${id})">
        <i class="bi bi-trash3"></i>
      </button>
    </div>`;
}
function renderDashboard() {
  const medicines = db.medicines.length;
  const batches = db.purchases;
  const activeBatches = batches.filter((batch) => daysLeft(batch.expiry_date) >= 0);
  const qty = activeBatches.reduce(
    (total, batch) => total + Number(batch.quantity || 0),
    0,
  );
  const low = activeBatches.filter(
    (b) =>
      Number(b.quantity) <=
      Number(
        (db.medicines.find((m) => m.name === b.medicine) || {}).reorder_level ||
          0,
      ),
  );
  const expired = batches.filter((b) => daysLeft(b.expiry_date) < 0);
  const near = activeBatches.filter(
    (b) => daysLeft(b.expiry_date) <= 30,
  );
  const recent = makeTransactions().slice(-5).reverse();
  const shortcuts = [
    [
      "medicines",
      "bi-capsule",
      "Add medicine",
      "Create a medicine master record",
      "tone-blue",
    ],
    [
      "purchases",
      "bi-bag-plus",
      "Record purchase",
      "Add a batch and increase stock",
      "tone-green",
    ],
    [
      "suppliers",
      "bi-truck",
      "Add supplier",
      "Save supplier contact details",
      "tone-purple",
    ],
    [
      "reports",
      "bi-file-earmark-bar-graph",
      "View reports",
      "Review inventory summaries",
      "tone-orange",
    ],
  ];
  const stats = [
    stat(
      "Total medicines",
      medicines,
      "bi-capsule",
      "tone-blue",
      "Medicine records",
    ),
    stat(
      "Active batches",
      batches.length,
      "bi-box-seam",
      "tone-purple",
      "Purchase batches",
    ),
    stat(
      "Total stock",
      qty.toLocaleString(),
      "bi-stack",
      "tone-green",
      "Units in stock",
    ),
    stat(
      "Low stock",
      low.length,
      "bi-exclamation-circle",
      "tone-orange",
      "Needs attention",
    ),
    stat(
      "Near expiry",
      near.length,
      "bi-calendar2-week",
      "tone-cyan",
      "Next 30 days",
    ),
    stat(
      "Expired batches",
      expired.length,
      "bi-calendar2-x",
      "tone-red",
      "Past expiry date",
    ),
  ].join("");
  const shortcutCards = shortcuts
    .map(
      ([page, icon, title, desc, tone]) => `
        <div class="col-sm-6 col-xl-3">
          <button class="quick-action-card" onclick="showPage('${page}')">
            <span class="quick-action-icon ${tone}">
              <i class="bi ${icon}"></i>
            </span>
            <span class="quick-action-title">${title}</span>
            <span class="quick-action-desc">${desc}</span>
            <i class="bi bi-arrow-up-right quick-action-arrow"></i>
          </button>
        </div>`,
    )
    .join("");
  const recentRows = recent
    .map(
      (transaction) => `
        <tr>
          <td class="medicine-name">${safe(transaction.medicine)}</td>
          <td>${safe(transaction.batch)}</td>
          <td>${status(
            transaction.type,
            transaction.type === "ISSUE"
              ? "orange"
              : transaction.type === "PURCHASE"
                ? "blue"
                : "green",
          )}</td>
          <td class="fw-bold">${transaction.type === "ISSUE" ? "-" : "+"}${transaction.quantity}</td>
          <td>${fmtDate(transaction.date)}</td>
        </tr>`,
    )
    .join("");
  const recentEmptyState = recent.length
    ? ""
    : `
      <div class="dashboard-empty-note">
        <i class="bi bi-inbox"></i>
        <div>
          <strong>No transactions yet</strong>
          <p>Record a purchase or medicine issue to see activity here.</p>
          <button class="btn btn-sm btn-primary" onclick="showPage('purchases')">
            Record first purchase
          </button>
        </div>
      </div>`;
  const alertRows = [
    ...low.slice(0, 3).map(
      (batch) => `
        <div class="alert-row alert-danger-soft">
          <i class="bi bi-exclamation-triangle"></i>
          <div>
            <strong>${safe(batch.medicine)} · ${safe(batch.batch_number)}</strong>
            <p>${batch.quantity} units remaining</p>
          </div>
        </div>`,
    ),
    ...near.slice(0, 3).map(
      (batch) => `
        <div class="alert-row alert-warning-soft">
          <i class="bi bi-calendar-event"></i>
          <div>
            <strong>${safe(batch.medicine)} nearing expiry</strong>
            <p>${Math.max(0, daysLeft(batch.expiry_date))} days remaining · ${safe(batch.batch_number)}</p>
          </div>
        </div>`,
    ),
    ...expired.slice(0, 3).map(
      (batch) => `
        <div class="alert-row alert-danger-soft">
          <i class="bi bi-calendar2-x"></i>
          <div>
            <strong>${safe(batch.medicine)} expired</strong>
            <p>${safe(batch.batch_number)} · Review this batch</p>
          </div>
        </div>`,
    ),
  ].join("");
  const alertsContent =
    alertRows ||
    `
      <div class="dashboard-empty-note compact">
        <i class="bi bi-check2-circle"></i>
        <div>
          <strong>You're ready to begin</strong>
          <p>Alerts will appear here after you add medicine batches.</p>
        </div>
      </div>`;

  return `
    <section class="dashboard-hero">
      <div class="hero-copy">
        <div class="hero-eyebrow">
          <i class="bi bi-shield-check me-1"></i>
          MEDICINE INVENTORY WORKSPACE
        </div>
        <h1>Welcome to <span>MediTrack</span></h1>
        <p>Keep medicines organised, monitor stock levels, and track batch expiry dates from one simple workspace.</p>
        <div class="hero-actions">
          <button class="btn btn-light" onclick="showPage('medicines')">
            <i class="bi bi-plus-lg me-2"></i>Add medicine
          </button>
          <button class="btn btn-outline-light" onclick="showPage('inventory')">
            View inventory <i class="bi bi-arrow-right ms-1"></i>
          </button>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="hero-orbit orbit-one"></div>
        <div class="hero-orbit orbit-two"></div>
        <div class="hero-capsule"><i class="bi bi-capsule-pill"></i></div>
        <div class="hero-plus plus-one">+</div>
        <div class="hero-plus plus-two">+</div>
      </div>
    </section>

    <div class="dashboard-section-heading">
      <div>
        <h2>Inventory overview</h2>
        <p>Live totals based on the records you enter.</p>
      </div>
      <span class="live-label"><i></i> Current records</span>
    </div>
    <div class="row g-3 mb-4">${stats}</div>

    <div class="dashboard-section-heading">
      <div>
        <h2>Quick actions</h2>
        <p>Get started with common inventory tasks.</p>
      </div>
    </div>
    <div class="row g-3 mb-4">${shortcutCards}</div>

    <div class="row g-3">
      <div class="col-xl-7">
        ${panel(
          "Recent transactions",
          "Latest purchases, issues and returns",
          table(["Medicine", "Batch", "Type", "Quantity", "Date"], recentRows) +
            recentEmptyState,
        )}
      </div>
      <div class="col-xl-5">
        ${panel(
          "Stock & expiry alerts",
          "Items that may need your attention",
          `${alertsContent}
            <button class="btn btn-light w-100 mt-2" onclick="showPage('expiry')">
              Open expiry tracking <i class="bi bi-arrow-right ms-1"></i>
            </button>`,
        )}
      </div>
    </div>`;
}
function daysLeft(d) {
  return Math.ceil(
    (new Date(d + "T00:00:00") - new Date(today() + "T00:00:00")) / 86400000,
  );
}
function makeTransactions() {
  let t = [];
  db.purchases.forEach((p) =>
    t.push({
      id: p.id,
      medicine: p.medicine,
      batch: p.batch_number,
      type: "PURCHASE",
      quantity: Number(p.quantity),
      date: p.purchase_date || today(),
    }),
  );
  db.issues.forEach((p) =>
    t.push({
      id: p.id,
      medicine: p.medicine,
      batch: p.batch_number,
      type: "ISSUE",
      quantity: Number(p.quantity),
      date: p.date || today(),
    }),
  );
  db.returns.forEach((p) =>
    t.push({
      id: p.id,
      medicine: p.medicine,
      batch: p.batch_number,
      type: "RETURN",
      quantity: Number(p.quantity),
      date: p.date || today(),
    }),
  );
  return t.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
const configs = {
  users: {
    title: "User Management",
    desc: "Manage system users and their access roles.",
    type: "Users",
    fields: [
      ["full_name", "Full Name", "text"],
      ["username", "Username", "text"],
      ["email", "Email", "email"],
      ["phone", "Phone", "tel"],
      ["role", "Role", "select", ["Inventory Staff", "Pharmacist", "Admin"]],
      ["status", "Status", "select", ["Active", "Pending approval"]],
      ["password", "Password (leave blank to keep current)", "password"],
    ],
    cols: [
      ["ID", "id"],
      ["Full Name", "full_name"],
      ["Username", "username"],
      ["Email", "email"],
      ["Phone", "phone"],
      ["Role", "role"],
      ["Status", "status"],
    ],
  },
  medicines: {
    title: "Medicine Management",
    desc: "Maintain medicine master records. Batch and expiry details are tracked separately.",
    type: "Medicine",
    fields: [
      ["name", "Medicine Name", "text"],
      ["generic_name", "Generic Name", "text"],
      ["category", "Category", "text"],
      ["manufacturer", "Manufacturer", "text"],
      [
        "dosage_form",
        "Dosage Form",
        "select",
        ["Tablet", "Capsule", "Syrup", "Injection", "Cream", "Drops", "Other"],
      ],
      ["strength", "Strength", "text"],
      ["reorder_level", "Reorder Level", "number"],
      ["description", "Description", "textarea"],
    ],
    cols: [
      ["ID", "id"],
      ["Medicine", "name"],
      ["Category", "category"],
      ["Manufacturer", "manufacturer"],
      ["Strength", "strength"],
    ],
  },
  suppliers: {
    title: "Supplier Management",
    desc: "Keep supplier contact and registration details up to date.",
    type: "Supplier",
    fields: [
      ["supplier_name", "Supplier Name", "text"],
      ["contact_person", "Contact Person", "text"],
      ["phone", "Phone", "tel"],
      ["email", "Email", "email"],
      ["address", "Address", "textarea"],
      ["gst_number", "GST Number", "text"],
    ],
    cols: [
      ["ID", "id"],
      ["Supplier", "supplier_name"],
      ["Contact", "contact_person"],
      ["Phone", "phone"],
      ["Email", "email"],
    ],
  },
};
function genericPage(key) {
  let c = configs[key],
    items = db[key];
  const form = fieldMarkup(c.fields);
  return (
    heading(
      c.title,
      c.desc,
      `<button class="btn btn-primary" onclick="document.getElementById('recordForm').scrollIntoView({ behavior: 'smooth' })">
        <i class="bi bi-plus-lg me-1"></i> Add ${c.type}
      </button>`,
    ) +
    `
      <div class="row g-3">
        <div class="col-xl-4">
          ${panel(
            `${c.type} details`,
            "Enter the information below",
            `
              <form id="recordForm" onsubmit="submitRecord(event, '${key}')">
                <input type="hidden" name="id">
                <div class="form-grid">${form}</div>
                <div class="form-actions">
                  <button type="reset" class="btn btn-light">Clear</button>
                  <button class="btn btn-primary" type="submit">Save ${c.type}</button>
                </div>
              </form>`,
          )}
        </div>
        <div class="col-xl-8">
          ${panel(
            `All ${c.type.toLowerCase()} records`,
            `${items.length} record(s)`,
            searchToolbar(`Search ${c.type.toLowerCase()}...`) +
              renderGenericTable(key, items),
          )}
        </div>
      </div>`
  );
}
function fieldMarkup(fields) {
  return fields
    .map(([name, label, type, opts]) => {
      const wrapperClass = type === "textarea" ? "field-full" : "";
      const field =
        type === "select"
          ? `
              <select class="form-select" name="${name}" required>
                ${opts.map((option) => `<option>${option}</option>`).join("")}
              </select>`
          : type === "textarea"
            ? `<textarea class="form-control" name="${name}" rows="2"></textarea>`
            : `
              <input
                class="form-control"
                name="${name}"
                type="${type}"
                ${type === "number" ? 'min="0"' : ""}
                ${
                  [
                    "full_name",
                    "username",
                    "email",
                    "name",
                    "supplier_name",
                    "batch_number",
                    "purchase_date",
                    "expiry_date",
                    "quantity",
                    "purchase_price",
                    "selling_price",
                  ].includes(name)
                    ? "required"
                    : ""
                }
              >`;
      const control =
        type === "password"
          ? `<div class="password-wrap">${field}<button type="button" class="eye-btn" tabindex="-1" aria-label="Show password" onclick="togglePassword(this)"><i class="bi bi-eye"></i></button></div>`
          : field;
      return `
        <div class="${wrapperClass}">
          <label class="form-label">${label}</label>
          ${control}
        </div>`;
    })
    .join("");
}
function renderGenericTable(key, items) {
  const c = configs[key];
  return table(
    [...c.cols.map(([label]) => label), "Actions"],
    items
      .map((item) => {
        const cells = c.cols
          .map(([, field]) => {
            const value =
              field === "id"
                ? `<span class="text-secondary">#${item[field]}</span>`
                : ["name", "supplier_name", "full_name"].includes(field)
                  ? `<span class="medicine-name">${safe(item[field])}</span>`
                  : field === "role"
                    ? status(
                        safe(item[field]),
                        item[field] === "Admin" ? "blue" : "gray",
                      )
                    : safe(item[field]);
            return `<td>${value}</td>`;
          })
          .join("");
        return `
          <tr>
            ${cells}
            <td>${actionButtons(key, item.id)}</td>
          </tr>`;
      })
      .join(""),
  );
}
function selectOptions(vals, first = "Select option") {
  return (
    `<option value="">${first}</option>` +
    vals.map((v) => `<option value="${safe(v)}">${safe(v)}</option>`).join("")
  );
}
async function submitRecord(e, key) {
  e.preventDefault();
  let f = e.target,
    d = Object.fromEntries(new FormData(f).entries()),
    id = Number(d.id);
  delete d.id;

  if (ENDPOINTS[key]) {
    // medicines and suppliers are saved on the Django server
    if (key === "medicines") d.reorder_level = Number(d.reorder_level || 0);
    try {
      if (id) await api(`${ENDPOINTS[key]}${id}/`, "PUT", d);
      else await api(ENDPOINTS[key], "POST", d);
      await reload(key);
      toast(`${configs[key].type} saved successfully.`);
      showPage(key);
    } catch (err) {
      toast(err.message);
    }
    return;
  }

  // users still use localStorage for now
  if (db.users.some((x) => x.username === d.username && x.id !== id))
    return toast("That username already exists.");
  if (id) {
    let ix = db[key].findIndex((x) => x.id === id);
    if (ix >= 0) db[key][ix] = { ...db[key][ix], ...d };
  } else
    db[key].push({ id: Math.max(0, ...db[key].map((x) => x.id)) + 1, ...d });
  save();
  toast(`${configs[key].type} saved successfully.`);
  showPage(key);
}
function editRecord(key, id) {
  if (!configs[key]) return;
  let item = db[key].find((x) => x.id === id);
  if (!item) return;
  showPage(key);
  setTimeout(() => {
    let f = $("#recordForm");
    if (!f) return;
    Object.entries(item).forEach(([k, v]) => {
      if (f.elements[k]) f.elements[k].value = v;
    });
    f.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 30);
}
async function deleteRecord(key, id) {
  if (!db[key] || !confirm("Delete this record? This cannot be undone."))
    return;
  if (ENDPOINTS[key]) {
    try {
      await api(`${ENDPOINTS[key]}${id}/`, "DELETE");
      await reload(key);
      toast("Record deleted.");
      showPage(key);
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  db[key] = db[key].filter((x) => x.id !== id);
  save();
  toast("Record deleted.");
  showPage(key);
}
function purchasePage() {
  let rows = db.purchases
    .map(
      (p) =>
        `
          <tr>
            <td>#${p.id}</td>
            <td>${safe(p.supplier)}</td>
            <td class="medicine-name">${safe(p.medicine)}</td>
            <td>${safe(p.batch_number)}</td>
            <td>${p.quantity}</td>
            <td>${money(p.purchase_price)}</td>
            <td>${fmtDate(p.purchase_date)}</td>
            <td>${purchaseActionButtons(p.id)}</td>
          </tr>`,
    )
    .join("");
  return (
    heading(
      "Purchase Management",
      "Record medicine purchases. Each purchase creates a batch and adds to available stock.",
      `<button class="btn btn-primary" onclick="$('#purchaseForm').scrollIntoView({ behavior: 'smooth' })">
        <i class="bi bi-plus-lg me-1"></i> Add purchase
      </button>`,
    ) +
    `
      <div class="row g-3">
        <div class="col-xl-4">
          ${panel(
            "Purchase form",
            "Batch and pricing information",
            `
              <form id="purchaseForm" onsubmit="addPurchase(event)">
                <input type="hidden" name="id">
                <div class="form-grid">
                  ${fieldMarkup([
                    [
                      "supplier",
                      "Supplier",
                      "select",
                      db.suppliers.map((supplier) => supplier.supplier_name),
                    ],
                    [
                      "medicine",
                      "Medicine",
                      "select",
                      db.medicines.map((medicine) => medicine.name),
                    ],
                    ["batch_number", "Batch Number", "text"],
                    ["purchase_date", "Purchase Date", "date"],
                    ["manufacturing_date", "Manufacturing Date", "date"],
                    ["expiry_date", "Expiry Date", "date"],
                    ["quantity", "Quantity", "number"],
                    ["purchase_price", "Purchase Price (₹)", "number"],
                    ["selling_price", "Selling Price (₹)", "number"],
                    ["remarks", "Remarks", "textarea"],
                  ])}
                </div>
                <div class="form-actions">
                  <button type="reset" class="btn btn-light">Clear</button>
                  <button class="btn btn-primary" id="purchaseSubmitButton">
                    Add Purchase
                  </button>
                </div>
              </form>`,
          )}
        </div>
        <div class="col-xl-8">
          ${panel(
            "Purchase history",
            `${db.purchases.length} purchase(s)`,
            searchToolbar("Search purchases...") +
              table(
                [
                  "ID",
                  "Supplier",
                  "Medicine",
                  "Batch",
                  "Quantity",
                  "Buy price",
                  "Date",
                  "Actions",
                ],
                rows,
              ),
          )}
        </div>
      </div>`
  );
}
function editPurchase(id) {
  const purchase = db.purchases.find((item) => item.id === id);
  const form = $("#purchaseForm");
  if (!purchase || !form) return;

  Object.entries(purchase).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value;
  });
  $("#purchaseSubmitButton").textContent = "Save Changes";
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}
async function addPurchase(e) {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target).entries());
  const id = Number(d.id);
  delete d.id;
  if (!d.supplier || !d.medicine)
    return toast("Add a supplier and medicine first.");
  if (
    !d.batch_number.trim() ||
    !d.purchase_date ||
    !d.expiry_date ||
    !Number.isFinite(Number(d.quantity)) ||
    Number(d.quantity) <= 0 ||
    !Number.isFinite(Number(d.purchase_price)) ||
    Number(d.purchase_price) < 0 ||
    !Number.isFinite(Number(d.selling_price)) ||
    Number(d.selling_price) < 0
  )
    return toast("Enter valid batch, date, quantity, and price details.");
  if (d.manufacturing_date && d.expiry_date < d.manufacturing_date)
    return toast("Expiry date must be after manufacturing date.");
  if (!id && d.expiry_date < today())
    return toast("This batch is already expired.");
  if (Number(d.selling_price) < Number(d.purchase_price))
    return toast("Selling price is lower than purchase price. Please confirm.");

  d.batch_number = d.batch_number.trim();
  d.quantity = Number(d.quantity);
  d.purchase_price = Number(d.purchase_price);
  d.selling_price = Number(d.selling_price);
  if (!d.manufacturing_date) d.manufacturing_date = null;

  try {
    if (id) await api(`/batches/${id}/`, "PUT", d);
    else await api("/batches/", "POST", d);
    await reload("purchases");
    toast(id ? "Purchase updated successfully." : "Purchase saved and stock increased.");
    showPage("purchases");
  } catch (err) {
    toast(err.message);
  }
}
function medicineFilterSelect() {
  const names = [...new Set(db.medicines.map((m) => m.name))].sort();
  return `
    <select id="medicineFilter" class="form-select filter-select">
      <option value="all">All medicines</option>
      ${names.map((n) => `<option value="${safe(n)}">${safe(n)}</option>`).join("")}
    </select>`;
}
function batchRows() {
  return db.purchases
    .map((p) => {
      let days = daysLeft(p.expiry_date),
        st =
          days < 0
            ? status("EXPIRED", "red")
            : days <= 30
              ? status("NEAR EXPIRY", "orange")
              : status("NORMAL", "green");
      return `
        <tr>
          <td>#${p.id}</td>
          <td class="medicine-name">${safe(p.medicine)}</td>
          <td>${safe(p.batch_number)}</td>
          <td>${fmtDate(p.manufacturing_date)}</td>
          <td>${fmtDate(p.expiry_date)}</td>
          <td>${p.quantity}</td>
          <td>${st}</td>
        </tr>`;
    })
    .join("");
}
function stockRows(mode = "inventory") {
  const rows = db.purchases.filter((p) => {
    const m = db.medicines.find((x) => x.name === p.medicine) || {};
    const low = Number(p.quantity) <= Number(m.reorder_level || 0);
    const days = daysLeft(p.expiry_date);
    if (mode === "low-stock") return low;
    if (mode === "expiry") return days <= 30;
    return true;
  });
  return rows
    .map((p) => {
      const m = db.medicines.find((x) => x.name === p.medicine) || {};
      const low = Number(p.quantity) <= Number(m.reorder_level || 0);
      const days = daysLeft(p.expiry_date);
      const medicineCell = `<td class="medicine-name">${safe(p.medicine)}<span class="subtext">${safe(m.category || "")}</span></td>`;
      if (mode === "expiry") {
        const st =
          days < 0 ? status("EXPIRED", "red") : status("NEAR EXPIRY", "orange");
        return `
        <tr>
          ${medicineCell}
          <td>${safe(p.batch_number)}</td>
          <td>${fmtDate(p.expiry_date)}</td>
          <td>${days < 0 ? "Expired" : `${days} days`}</td>
          <td>${st}</td>
        </tr>`;
      }
      const st =
        mode === "low-stock"
          ? status("LOW STOCK", "orange")
          : days < 0
            ? status("EXPIRED", "red")
            : low
              ? status("LOW STOCK", "orange")
              : status("IN STOCK", "green");
      return `
        <tr>
          ${medicineCell}
          <td>${safe(p.batch_number)}</td>
          <td>${p.quantity}</td>
          <td>${m.reorder_level || 0}</td>
          <td>${st}</td>
        </tr>`;
    })
    .join("");
}
function batchPage() {
  return (
    heading(
      "Batch Management",
      "Track each medicine batch independently, including manufacturing and expiry dates.",
    ) +
    panel(
      "All batches",
      `${db.purchases.length} batch record(s)`,
      searchToolbar("Search batch or medicine...") +
        `
          <div class="toolbar">
            ${medicineFilterSelect()}
            <select class="form-select filter-select" id="expiryFilter">
              <option value="all">All expiry statuses</option>
              <option value="expired">Expired</option>
              <option value="near">Near expiry</option>
              <option value="normal">Normal</option>
            </select>
          </div>` +
        table(
          [
            "ID",
            "Medicine",
            "Batch",
            "Mfg Date",
            "Expiry Date",
            "Quantity",
            "Status",
          ],
          batchRows(),
        ),
    )
  );
}
function stockPage(mode) {
  const expiry = mode === "expiry",
    low = mode === "low-stock";
  const title = expiry
    ? "Expiry Tracking"
    : low
      ? "Low Stock"
      : "Inventory / Stock";
  const desc = expiry
    ? "Monitor expiry dates and identify batches requiring action."
    : low
      ? "Batches at or below their medicine reorder level."
      : "Review available stock by medicine and batch.";
  const headers = expiry
    ? ["Medicine", "Batch", "Expiry Date", "Remaining Days", "Status"]
    : low
      ? ["Medicine", "Batch", "Current Qty", "Reorder Level", "Status"]
      : ["Medicine", "Batch", "Quantity", "Reorder Level", "Status"];
  const statusOptions = expiry
    ? `<option value="NEAR EXPIRY">Near expiry</option>
       <option value="EXPIRED">Expired</option>`
    : low
      ? `<option value="LOW STOCK">Low stock</option>`
      : `<option value="LOW STOCK">Low stock</option>
         <option value="IN STOCK">In stock</option>`;
  const categorySelect = `
    <select id="categoryFilter" class="form-select filter-select">
      <option value="all">All categories</option>
      ${[...new Set(db.medicines.map((medicine) => medicine.category))]
        .filter(Boolean)
        .map((category) => `<option>${safe(category)}</option>`)
        .join("")}
    </select>`;
  const statusSelect = `
    <select id="statusFilter" class="form-select filter-select">
      <option value="all">All statuses</option>
      ${statusOptions}
    </select>`;
  return (
    heading(title, desc) +
    panel(
      expiry ? "Expiry register" : low ? "Low-stock register" : "Stock by batch",
      "Use search and filters to narrow the records",
      searchToolbar("Search medicine or batch...") +
        `<div class="toolbar">${
          expiry
            ? statusSelect + medicineFilterSelect()
            : categorySelect + statusSelect
        }</div>` +
        table(headers, stockRows(mode)),
    )
  );
}
function issuePage(isReturn = false) {
  let key = isReturn ? "returns" : "issues",
    title = isReturn ? "Medicine Return" : "Medicine Issue",
    desc = isReturn
      ? "Record returned medicines and update batch stock."
      : "Issue stock to a customer after validating the available quantity.";
  const formFields = `
    <div>
      <label class="form-label">Medicine</label>
      <select
        class="form-select"
        name="medicine"
        id="movementMedicine"
        required
        onchange="updateBatchOptions()"
      >
        ${selectOptions(
          db.medicines.map((medicine) => medicine.name),
          "Select medicine",
        )}
      </select>
    </div>
    <div>
      <label class="form-label">Batch</label>
      <select
        class="form-select"
        name="batch_number"
        id="movementBatch"
        required
        onchange="updateAvailable()"
      >
        ${selectOptions(
          db.purchases.map((purchase) => purchase.batch_number),
          "Select batch",
        )}
      </select>
    </div>
    <div>
      <label class="form-label">Available Quantity</label>
      <input class="form-control" id="availableQty" value="0" readonly>
    </div>
    <div>
      <label class="form-label">${isReturn ? "Return" : "Issue"} Quantity</label>
      <input class="form-control" type="number" name="quantity" min="1" required>
    </div>
    <div>
      <label class="form-label">Customer Name</label>
      <input class="form-control" name="customer_name">
    </div>
    <div>
      <label class="form-label">${isReturn ? "Return" : "Issue"} Date</label>
      <input class="form-control" type="date" name="date" value="${today()}" required>
    </div>
    ${
      isReturn
        ? `
          <div>
            <label class="form-label">Reason</label>
            <input class="form-control" name="reason" required>
          </div>`
        : ""
    }
    <div class="field-full">
      <label class="form-label">Remarks</label>
      <textarea class="form-control" name="remarks" rows="2"></textarea>
    </div>`;
  let records = db[key];
  const recordRows = records
    .map(
      (record) => `
        <tr>
          <td>#${record.id}</td>
          <td class="medicine-name">${safe(record.medicine)}</td>
          <td>${safe(record.batch_number)}</td>
          <td>${record.quantity}</td>
          <td>${safe(record.customer_name || "—")}</td>
          <td>${fmtDate(record.date)}</td>
        </tr>`,
    )
    .join("");
  return (
    heading(title, desc) +
    `
      <div class="row g-3">
        <div class="col-xl-4">
          ${panel(
            isReturn ? "Return form" : "Issue form",
            "Stock is adjusted when the record is saved",
            `
              <form id="movementForm" onsubmit="saveMovement(event, ${isReturn})">
                <div class="form-grid">${formFields}</div>
                <div class="form-actions">
                  <button class="btn btn-primary">
                    ${isReturn ? "Return Medicine" : "Issue Medicine"}
                  </button>
                </div>
              </form>`,
          )}
        </div>
        <div class="col-xl-8">
          ${panel(
            isReturn ? "Return history" : "Recent issues",
            `${records.length} record(s)`,
            searchToolbar("Search records...") +
              table(
                ["ID", "Medicine", "Batch", "Quantity", "Customer", "Date"],
                recordRows,
              ),
          )}
        </div>
      </div>`
  );
}
function updateBatchOptions() {
  let med = $("#movementMedicine")?.value,
    opts = db.purchases.filter((p) => p.medicine === med);
  $("#movementBatch").innerHTML = selectOptions(
    opts.map((p) => p.batch_number),
    "Select batch",
  );
  updateAvailable();
}
function updateAvailable() {
  let b = db.purchases.find(
    (p) => p.batch_number === $("#movementBatch")?.value,
  );
  if ($("#availableQty")) $("#availableQty").value = b?.quantity ?? 0;
}
async function saveMovement(e, isReturn) {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target).entries());
  d.quantity = Number(d.quantity);
  if (!d.batch_number) return toast("Choose a valid medicine batch.");
  if (!(d.quantity > 0)) return toast("Quantity must be greater than zero.");
  try {
    await api(isReturn ? "/returns/" : "/issues/", "POST", d);
    await reload("purchases", isReturn ? "returns" : "issues");
    toast(
      isReturn
        ? "Return saved and stock increased."
        : "Issue saved and stock decreased.",
    );
    showPage(isReturn ? "returns" : "issue");
  } catch (err) {
    toast(err.message);
  }
}
function transactionPage() {
  let t = makeTransactions().reverse();
  const rows = t
    .map(
      (transaction) => `
        <tr>
          <td>#${transaction.id}</td>
          <td class="medicine-name">${safe(transaction.medicine)}</td>
          <td>${safe(transaction.batch)}</td>
          <td>${status(
            transaction.type,
            transaction.type === "ISSUE"
              ? "orange"
              : transaction.type === "PURCHASE"
                ? "blue"
                : "green",
          )}</td>
          <td class="fw-bold">${transaction.type === "ISSUE" ? "-" : "+"}${transaction.quantity}</td>
          <td>${fmtDate(transaction.date)}</td>
        </tr>`,
    )
    .join("");
  return (
    heading(
      "Transactions",
      "Audit trail for purchase, issue and return stock movements.",
    ) +
    panel(
      "Transaction history",
      `${t.length} movement(s)`,
      searchToolbar("Search transactions...") +
        `
          <div class="toolbar">
            <select id="typeFilter" class="form-select filter-select">
              <option value="all">All transaction types</option>
              <option>PURCHASE</option>
              <option>ISSUE</option>
              <option>RETURN</option>
            </select>
            <input
              type="date"
              class="form-control"
              id="dateFilter"
              style="max-width: 170px"
            >
            ${medicineFilterSelect()}
          </div>` +
        table(["ID", "Medicine", "Batch", "Type", "Quantity", "Date"], rows),
    )
  );
}
function reportsPage() {
  const reportTypes = [
    ["stock", "Stock report"],
    ["expiry", "Expiry report"],
    ["transactions", "Transaction report"],
    ["purchases", "Purchase report"],
  ]
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
  const medicines = db.medicines
    .map((medicine) => `<option>${safe(medicine.name)}</option>`)
    .join("");
  const initialRows =
    stockRows("inventory").split("</tr>").slice(0, 5).join("</tr>") + "</tr>";
  return (
    heading(
      "Reports",
      "Generate a filtered inventory snapshot for review or export.",
    ) +
    `
      <div class="row g-3">
        <div class="col-lg-4">
          ${panel(
            "Report filters",
            "Choose the records to include",
            `
              <form id="reportForm" onsubmit="generateReport(event)">
                <div class="mb-3">
                  <label class="form-label">Report Type</label>
                  <select class="form-select" name="report_type">
                    ${reportTypes}
                  </select>
                </div>
                <div class="mb-3">
                  <label class="form-label">From Date</label>
                  <input type="date" class="form-control" name="from_date">
                </div>
                <div class="mb-3">
                  <label class="form-label">To Date</label>
                  <input type="date" class="form-control" name="to_date">
                </div>
                <div class="mb-3">
                  <label class="form-label">Medicine</label>
                  <select class="form-select" name="medicine">
                    <option value="all">All medicines</option>
                    ${medicines}
                  </select>
                </div>
                <button class="btn btn-primary w-100">Generate Report</button>
              </form>`,
          )}
        </div>
        <div class="col-lg-8">
          ${panel(
            "Report result",
            "Preview and export your current inventory",
            `
              <div id="reportResult">
                ${table(
                  ["Medicine", "Batch", "Quantity", "Status"],
                  initialRows,
                )}
              </div>
              <div class="d-flex gap-2 mt-3">
                <button class="btn btn-light" onclick="exportCSV()">
                  <i class="bi bi-filetype-csv me-1"></i>Export CSV
                </button>
                <button class="btn btn-light" onclick="window.print()">
                  <i class="bi bi-printer me-1"></i>Print / Save PDF
                </button>
              </div>`,
          )}
        </div>
      </div>`
  );
}
function generateReport(e) {
  e.preventDefault();
  let d = Object.fromEntries(new FormData(e.target).entries()),
    rows;
  if (d.report_type === "transactions") {
    rows = makeTransactions()
      .filter(
        (r) =>
          (d.medicine === "all" || r.medicine === d.medicine) &&
          (!d.from_date || r.date >= d.from_date) &&
          (!d.to_date || r.date <= d.to_date),
      )
      .map(
        (transaction) => `
          <tr>
            <td>${safe(transaction.medicine)}</td>
            <td>${safe(transaction.batch)}</td>
            <td>${transaction.type === "ISSUE" ? "-" : "+"}${transaction.quantity}</td>
            <td>${status(
              transaction.type,
              transaction.type === "ISSUE" ? "orange" : "blue",
            )}</td>
          </tr>`,
      );
  } else {
    rows = db.purchases
      .filter(
        (p) =>
          (d.medicine === "all" || p.medicine === d.medicine) &&
          (!d.from_date || p.purchase_date >= d.from_date) &&
          (!d.to_date || p.purchase_date <= d.to_date),
      )
      .map((p) => {
        let days = daysLeft(p.expiry_date),
          m = db.medicines.find((m) => m.name === p.medicine) || {},
          st =
            d.report_type === "expiry"
              ? days < 0
                ? status("EXPIRED", "red")
                : days <= 30
                  ? status("NEAR EXPIRY", "orange")
                  : status("NORMAL", "green")
              : p.quantity <= m.reorder_level
                ? status("LOW STOCK", "orange")
                : status("IN STOCK", "green");
        return `<tr><td>${safe(p.medicine)}</td><td>${safe(p.batch_number)}</td><td>${p.quantity}</td><td>${st}</td></tr>`;
      });
  }
  $("#reportResult").innerHTML = table(
    ["Medicine", "Batch", "Quantity", "Status"],
    rows.join(""),
  );
  toast("Report generated.");
}
function exportCSV() {
  let rows = [
    ["Medicine", "Batch", "Quantity", "Expiry Date", "Purchase Date", "Status"],
    ...db.purchases.map((p) => {
      let m = db.medicines.find((m) => m.name === p.medicine) || {};
      return [
        p.medicine,
        p.batch_number,
        p.quantity,
        p.expiry_date,
        p.purchase_date,
        daysLeft(p.expiry_date) < 0
          ? "EXPIRED"
          : p.quantity <= (m.reorder_level || 0)
            ? "LOW STOCK"
            : "IN STOCK",
      ];
    }),
  ];
  let csv = rows
      .map((r) =>
        r.map((v) => '"' + String(v ?? "").replace(/"/g, '""') + '"').join(","),
      )
      .join("\r\n"),
    url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = "medicine-inventory-report.csv";
  a.click();
  URL.revokeObjectURL(url);
}
function authPage(view) {
  if (view === "forgot")
    return `
    <div class="auth-wrap">
      ${heading("Forgot password", "Help with your MediTrack account")}
      <div class="panel">
        <div class="auth-brand">
          <div class="brand-icon"><i class="bi bi-key"></i></div>
          <h2>Reset your password</h2>
          <p>Passwords are reset by an administrator.</p>
        </div>
        <ol class="ps-3">
          <li>Contact your MediTrack administrator and tell them your username.</li>
          <li>They set a new password for you in User Management.</li>
          <li>Sign in with the new password.</li>
        </ol>
        <button class="btn btn-primary w-100 mt-3" onclick="showPage('login')">Back to login</button>
      </div>
    </div>`;
  if (view === "register")
    return `
    <div class="auth-wrap">
      ${heading("Register", "Request access to MediTrack")}
      <div class="panel">
        <div class="auth-brand">
          <div class="brand-icon"><i class="bi bi-person-plus"></i></div>
          <h2>Register</h2>
          <p>An administrator must approve your account before you can sign in.</p>
        </div>
        <form onsubmit="doRegister(event)">
          <div class="form-grid">
            ${fieldMarkup([
              ["full_name", "Full Name", "text"],
              ["username", "Username", "text"],
              ["email", "Email", "email"],
              ["phone", "Phone", "tel"],
              ["role", "Role", "select", ["Inventory Staff", "Pharmacist"]],
              ["password", "Password", "password"],
              ["confirm_password", "Confirm Password", "password"],
            ])}
          </div>
          <p class="form-text mt-2">Password: at least 8 characters, not only numbers. An administrator confirms your role.</p>
          <button class="btn btn-primary w-100 mt-2">Register</button>
        </form>
        <p class="form-text mt-3 text-center">
          Already registered?
          <a href="#login" onclick="event.preventDefault();showPage('login')">Login</a>
        </p>
      </div>
    </div>`;
  return `
    <div class="auth-wrap">
      ${heading("Welcome back", "Real-Time Medicine Inventory System")}
      <div class="panel">
        <div class="auth-brand">
          <div class="brand-icon"><i class="bi bi-capsule-pill"></i></div>
          <h2>Sign in to MediTrack</h2>
          <p>Manage stock, batches and expiry in one place.</p>
        </div>
        <form onsubmit="doLogin(event)">
          <div class="form-grid">
            ${fieldMarkup([
              ["username", "Username", "text"],
              ["password", "Password", "password"],
            ])}
          </div>
          <div class="form-check mt-3">
            <input class="form-check-input" type="checkbox" name="remember" id="remember">
            <label class="form-check-label" for="remember">Remember me</label>
          </div>
          <button class="btn btn-primary w-100 mt-3">Login</button>
          <p class="form-text mt-3 text-center">
            <a href="#forgot" onclick="event.preventDefault();showPage('forgot')">Forgot password?</a>
          </p>
        </form>
        <p class="form-text mt-3 text-center">
          New here?
          <a href="#register" onclick="event.preventDefault();showPage('register')">Create an account</a>
        </p>
      </div>
    </div>`;
}
function showPage(id, keepScroll = false) {
  if (!me) id = ["register", "forgot"].includes(id) ? id : "login";
  else if (["login", "register", "forgot"].includes(id) || !canSee(id)) id = "dashboard";
  activePage = id;
  nav();
  $("#crumb").textContent =
    pages.find((p) => p[0] === id)?.[1] ||
    ({ login: "Login", register: "Registration", forgot: "Forgot Password" }[id] || "Login");
  let html;
  if (id === "dashboard") html = renderDashboard();
  else if (configs[id]) html = genericPage(id);
  else if (id === "purchases") html = purchasePage();
  else if (id === "batches") html = batchPage();
  else if (["inventory", "expiry", "low-stock"].includes(id))
    html = stockPage(id);
  else if (id === "issue") html = issuePage(false);
  else if (id === "returns") html = issuePage(true);
  else if (id === "transactions") html = transactionPage();
  else if (id === "reports") html = reportsPage();
  else if (["login", "register", "forgot"].includes(id)) html = authPage(id);
  else html = renderDashboard();
  $("#pageContent").innerHTML = html;
  wireSearch();
  if (!keepScroll) window.scrollTo({ top: 0, behavior: "smooth" });
  if (["issue", "returns"].includes(id)) updateBatchOptions();
}
function wireSearch() {
  let s = $("#tableSearch");
  if (s)
    s.addEventListener("input", () => {
      let q = s.value.toLowerCase();
      $("#pageContent")
        .querySelectorAll("tbody tr")
        .forEach(
          (r) =>
            (r.style.display = r.innerText.toLowerCase().includes(q)
              ? ""
              : "none"),
        );
    });
  [
    "typeFilter",
    "dateFilter",
    "statusFilter",
    "categoryFilter",
    "expiryFilter",
    "medicineFilter",
  ].forEach((id) => {
    let el = $("#" + id);
    if (el) el.addEventListener("change", applyFilters);
  });
}
function applyFilters() {
  let type = $("#typeFilter")?.value,
    date = $("#dateFilter")?.value,
    st = $("#statusFilter")?.value,
    cat = $("#categoryFilter")?.value,
    exp = $("#expiryFilter")?.value,
    med = $("#medicineFilter")?.value;
  $("#pageContent")
    .querySelectorAll("tbody tr")
    .forEach((r) => {
      let txt = r.innerText,
        ok = true;
      if (type && type !== "all") ok = ok && txt.includes(type);
      if (date) ok = ok && txt.includes(fmtDate(date));
      if (st && st !== "all") ok = ok && txt.includes(st);
      if (cat && cat !== "all") ok = ok && txt.includes(cat);
      if (med && med !== "all") {
        const cell = r.querySelector(".medicine-name");
        const name = (cell?.childNodes[0]?.textContent || "").trim();
        ok = ok && name === med;
      }
      if (exp && exp !== "all") {
        let state = txt.includes("EXPIRED")
          ? "expired"
          : txt.includes("NEAR EXPIRY")
            ? "near"
            : "normal";
        ok = ok && state === exp;
      }
      r.style.display = ok ? "" : "none";
    });
}
function toast(msg) {
  $("#toastMessage").textContent = msg;
  bootstrap.Toast.getOrCreateInstance($("#liveToast"), { delay: 2800 }).show();
}
$("#today").textContent = new Date().toLocaleDateString("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
window.showPage = showPage;
window.editRecord = editRecord;
window.deleteRecord = deleteRecord;
window.submitRecord = submitRecord;
window.addPurchase = addPurchase;
window.updateBatchOptions = updateBatchOptions;
window.updateAvailable = updateAvailable;
window.saveMovement = saveMovement;
window.generateReport = generateReport;
window.exportCSV = exportCSV;
window.toast = toast;
// ---------------- Notifications (bell) ----------------
const NOTIF_KEY = "meditrack_notifs";
let notifs = [];
try {
  notifs = JSON.parse(localStorage.getItem(NOTIF_KEY)) || [];
} catch {
  notifs = [];
}
function saveNotifs() {
  try {
    localStorage.setItem(NOTIF_KEY, JSON.stringify(notifs.slice(0, 30)));
  } catch {}
}
function addNotification(message) {
  if (!message) return;
  notifs.unshift({ id: Date.now() + Math.random(), message, time: Date.now(), read: false });
  notifs = notifs.slice(0, 30);
  saveNotifs();
  renderNotifications();
}
function renderNotifications() {
  const dot = $("#notifDot");
  const box = $("#notifDropdown");
  if (!dot || !box) return;
  const unread = notifs.filter((n) => !n.read).length;
  dot.classList.toggle("show", unread > 0); // red dot only when something is unread
  dot.textContent = "";
  const items = notifs.length
    ? notifs
        .map(
          (n) => `<div class="notif-item ${n.read ? "" : "unread"}">${safe(n.message)}
            <small>${new Date(n.time).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small></div>`,
        )
        .join("")
    : '<div class="notif-empty">No notifications yet</div>';
  box.innerHTML = `<div class="notif-head"><span>Notifications</span>
      <button type="button" onclick="clearNotifications()">Clear all</button></div>
    ${items}
    <a class="notif-foot" href="#expiry" onclick="event.preventDefault();closeNotifications();showPage('expiry')">View expiry tracking</a>`;
}
function closeNotifications() {
  $("#notifDropdown")?.classList.remove("open");
}
function toggleNotifications(e) {
  e?.stopPropagation();
  const box = $("#notifDropdown");
  const opening = !box.classList.contains("open");
  box.classList.toggle("open", opening);
  if (opening) {
    // opening the list marks everything as read -> the red dot disappears
    notifs.forEach((n) => (n.read = true));
    saveNotifs();
    const dot = $("#notifDot");
    dot.classList.remove("show");
    // keep the "unread" highlight visible for this view only
  }
}
function clearNotifications() {
  notifs = [];
  saveNotifs();
  renderNotifications();
}
document.addEventListener("click", (e) => {
  if (!e.target.closest(".notif-wrap")) closeNotifications();
});
window.toggleNotifications = toggleNotifications;
window.closeNotifications = closeNotifications;
window.clearNotifications = clearNotifications;
renderNotifications();

// Daily summary: expired, expiring soon and low-stock batches (once per day per browser)
function checkStockAlerts() {
  const day = today();
  try {
    if (localStorage.getItem("meditrack_alert_day") === day) return;
  } catch {}
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "es"}`;
  const active = db.purchases.filter((b) => daysLeft(b.expiry_date) >= 0);
  const expired = db.purchases.filter((b) => daysLeft(b.expiry_date) < 0);
  const near = active.filter((b) => daysLeft(b.expiry_date) <= 30);
  const low = active.filter(
    (b) =>
      Number(b.quantity) <=
      Number((db.medicines.find((m) => m.name === b.medicine) || {}).reorder_level || 0),
  );
  if (expired.length) addNotification(`Expired: ${plural(expired.length, "batch")} need attention`);
  if (near.length) addNotification(`Expiring soon: ${plural(near.length, "batch")} within 30 days`);
  if (low.length) addNotification(`Low stock: ${plural(low.length, "batch")} at or below reorder level`);
  try {
    localStorage.setItem("meditrack_alert_day", day);
  } catch {}
}

// ---------------- Password show / hide ----------------
function togglePassword(btn) {
  const input = btn.parentElement.querySelector("input");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  btn.innerHTML = `<i class="bi ${show ? "bi-eye-slash" : "bi-eye"}"></i>`;
  btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
}
window.togglePassword = togglePassword;

// ---------------- Real-time updates (WebSocket) ----------------
const WS_URL = `${BACKEND.replace(/^http/, "ws")}/ws/inventory/`; // http -> ws, https -> wss
let socket,
  reconnectTimer,
  wasOffline = false;

function setLive(on) {
  let badge = $("#liveBadge");
  if (!badge) {
    $("#today").insertAdjacentHTML(
      "afterend",
      '<span id="liveBadge" class="badge ms-2"></span>',
    );
    badge = $("#liveBadge");
  }
  badge.className = "badge ms-2 " + (on ? "text-bg-success" : "text-bg-secondary");
  badge.textContent = on ? "● Live" : "● Offline";
}

// true if the user has started typing in a form (we must not wipe it)
function formIsDirty() {
  const form = $("#pageContent form");
  if (!form) return false;
  return [...form.elements].some((el) => {
    if (["hidden", "submit", "reset", "button"].includes(el.type)) return false;
    if (el.tagName === "SELECT") return el.selectedIndex > 0;
    return el.value !== el.defaultValue;
  });
}

// redraw the current page but keep scroll position and search text
function refreshPage() {
  if (["login", "register"].includes(activePage)) return;
  const search = $("#tableSearch")?.value || "";
  const y = window.scrollY;
  showPage(activePage, true);
  const box = $("#tableSearch");
  if (search && box) {
    box.value = search;
    box.dispatchEvent(new Event("input"));
  }
  window.scrollTo(0, y);
}

function connectSocket() {
  if (!token) return;
  socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
  socket.onopen = () => {
    setLive(true);
    if (wasOffline) reload().then(refreshPage); // catch up after a disconnect
    wasOffline = false;
  };
  socket.onclose = () => {
    setLive(false);
    if (!token) return; // logged out: do not reconnect
    wasOffline = true;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectSocket, 3000);
  };
  socket.onmessage = async (event) => {
    const msg = JSON.parse(event.data);
    if (msg.notify !== false)
      addNotification(msg.message || `${msg.resource || "Data"} updated`);
    await reload(msg.resource);
    const mine = Date.now() - ownActionAt < 2000;
    if (formIsDirty()) {
      if (!mine) toast("Data was updated by someone else. Finish your form to see it.");
      return;
    }
    refreshPage();
    if (!mine) toast(msg.message);
  };
}

function setUserBox() {
  const box = document.querySelector(".top-user");
  if (!box) return;
  box.style.display = me ? "" : "none";
  if (!me) return;
  const name = me.full_name || me.username;
  box.querySelector(".avatar").textContent = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  box.querySelector("strong").textContent = name;
  box.querySelector("small").textContent = me.role;
  box.querySelector("button").onclick = () => logout();
}

function clearSession() {
  token = null;
  me = null;
  localStorage.removeItem("meditrack_token");
  sessionStorage.removeItem("meditrack_token");
  clearTimeout(reconnectTimer);
  if (socket) {
    socket.onclose = null;
    socket.close();
  }
  $("#liveBadge")?.remove();
  notifs = [];
  renderNotifications();
  for (const k of Object.keys(ENDPOINTS)) db[k] = [];
  setUserBox();
  showPage("login");
}

async function logout() {
  try {
    await api("/auth/logout/", "POST");
  } catch {}
  clearSession();
}

async function startApp() {
  await reload();
  setUserBox();
  checkStockAlerts();
  showPage(location.hash.slice(1) || "dashboard");
  setLive(false);
  connectSocket();
}

async function doLogin(e) {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target).entries());
  const remember = !!d.remember; // checked = stay signed in after closing the browser
  delete d.remember;
  try {
    const res = await api("/auth/login/", "POST", d);
    token = res.token;
    me = res.user;
    localStorage.removeItem("meditrack_token");
    sessionStorage.removeItem("meditrack_token");
    (remember ? localStorage : sessionStorage).setItem("meditrack_token", token);
    await startApp();
    toast(`Welcome, ${me.full_name || me.username}.`);
  } catch (err) {
    toast(err.message);
  }
}
async function doRegister(e) {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target).entries());
  d.full_name = d.full_name.trim();
  d.username = d.username.trim();
  d.email = d.email.trim();
  d.phone = d.phone.trim();
  if (!d.full_name) return toast("Please enter your full name.");
  if (!/^[A-Za-z0-9_.@+-]{3,30}$/.test(d.username))
    return toast("Username: 3 to 30 letters, numbers or . _ @ + -");
  if (!/^\S+@\S+\.\S+$/.test(d.email))
    return toast("Please enter a valid email address.");
  if (!/^\d{10,15}$/.test(d.phone.replace(/[\s+-]/g, "")))
    return toast("Please enter a valid phone number (10 to 15 digits).");
  if (d.password.length < 8)
    return toast("Password must be at least 8 characters.");
  if (d.password !== d.confirm_password)
    return toast("Passwords do not match.");
  try {
    const res = await api("/auth/register/", "POST", d);
    toast(res.detail);
    showPage("login");
  } catch (err) {
    toast(err.message);
  }
}
window.doRegister = doRegister;
window.doLogin = doLogin;
window.logout = logout;

(async function init() {
  setUserBox();
  if (token) {
    try {
      me = await api("/auth/me/");
      await startApp();
      return;
    } catch (err) {
      me = null;
      toast(err.message);
    }
  }
  showPage(location.hash.slice(1) === "register" ? "register" : "login");
})();
window.addEventListener("hashchange", () => {
  let id = location.hash.slice(1);
  if (id) showPage(id);
});
