const STORAGE_KEY = "finance_dashboard_transactions_v1";
const BUDGET_STORAGE_KEY = "finance_dashboard_budgets_v1";
const NOTIFICATIONS_STORAGE_KEY = "finance_dashboard_notifications_v1";
const CURRENCY_STORAGE_KEY = "finance_dashboard_currency_v1";

const DEFAULT_TRANSACTIONS = [
  {
    id: "t1",
    merchant: "Starbucks",
    category: "Food",
    amount: -18.5,
    currency: "USD",
    timestamp: new Date().toISOString()
  },
  {
    id: "t2",
    merchant: "Uber",
    category: "Transport",
    amount: -32.0,
    currency: "USD",
    timestamp: new Date().toISOString()
  }
];

let selectedCategory = null;
let showNotifications = false;
let showBudgetSettings = false;
let showCurrencySettings = false;
let showCalendar = false;
let selectedDay = null; // YYYY-MM-DD
let calendarOffset = 0; // months offset from current

const CURRENCIES = {
  USD: { symbol: "$", name: "US Dollar" },
  EUR: { symbol: "€", name: "Euro" },
  GBP: { symbol: "£", name: "British Pound" },
  ILS: { symbol: "₪", name: "Israeli Shekel" },
  JPY: { symbol: "¥", name: "Japanese Yen" },
  CAD: { symbol: "C$", name: "Canadian Dollar" },
  AUD: { symbol: "A$", name: "Australian Dollar" }
};

// In-memory caches populated from IndexedDB (if available)
let transactionsCache = null;
let budgetsCache = null;
let notificationsCache = null;
let currencyCache = null;

// Initialize IDB-backed caches and migrate existing localStorage data when available
async function initStorage() {
  if (!window.IDBStore) return;
  try {
    await IDBStore.migrateFromLocalStorage({
      transactions: STORAGE_KEY,
      budgets: BUDGET_STORAGE_KEY,
      notifications: NOTIFICATIONS_STORAGE_KEY,
      currency: CURRENCY_STORAGE_KEY
    });

    const txs = await IDBStore.getAll('transactions');
    if (Array.isArray(txs) && txs.length > 0) {
      transactionsCache = txs;
      // also keep localStorage in sync for apps that still rely on it
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(transactionsCache)); } catch (e) {}
    }

    const b = await IDBStore.get('budgets', 'budgets');
    if (b && b.value) {
      budgetsCache = b.value;
      try { localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(budgetsCache)); } catch (e) {}
    }

    const notifs = await IDBStore.getAll('notifications');
    if (Array.isArray(notifs) && notifs.length > 0) {
      notificationsCache = notifs;
      try { localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notificationsCache)); } catch (e) {}
    }

    const c = await IDBStore.get('settings', 'currency');
    if (c && c.value) {
      currencyCache = c.value;
      try { localStorage.setItem(CURRENCY_STORAGE_KEY, currencyCache); } catch (e) {}
    }
  } catch (e) {
    // ignore IDB errors and fall back to localStorage
  }
}

// Handle import via URL query params (used by Apple Shortcuts)
function handleImportFromURL(root) {
  try {
    const params = new URLSearchParams(window.location.search);
    // require at least `amount`
    if (!params.has('amount')) return false;

    const rawAmount = parseFloat(params.get('amount'));
    if (Number.isNaN(rawAmount)) return false;

    const amount = rawAmount > 0 ? -rawAmount : rawAmount; // treat positive as spending
    const merchant = params.get('merchant') || (params.get('name') || 'Imported');
    const category = params.get('category') || 'Other';
    const currency = params.get('currency') || loadCurrency();
    const timestamp = params.get('timestamp') || new Date().toISOString();

    const transaction = {
      id: `t_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      merchant,
      category,
      amount,
      currency,
      timestamp
    };

    const list = loadTransactions() || [];
    list.push(transaction);
    saveTransactions(list);
    addNotification(`Imported: ${merchant} ${formatCurrency(amount, currency)}`, 'info');

    // Remove query string so refresh won't re-import
    try {
      history.replaceState(null, '', window.location.pathname);
    } catch (e) {}

    // Re-render app if root provided
    if (root) renderApp(root, list);
    return true;
  } catch (e) {
    return false;
  }
}

function loadCurrency() {
  try {
    if (currencyCache !== null) return currencyCache;
    const raw = localStorage.getItem(CURRENCY_STORAGE_KEY);
    currencyCache = raw || "USD";
    return currencyCache;
  } catch (e) {
    return "USD";
  }
}

function saveCurrency(currency) {
  try {
    currencyCache = currency;
    localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
    if (window.IDBStore) {
      IDBStore.put('settings', { id: 'currency', value: currency }).catch(()=>{});
    }
  } catch (e) {}
}

const CATEGORY_COLORS = {
  Food: "#F59E0B",          // foodDining
  Transport: "#60A5FA",     // transportation
  Shopping: "#A855F7",      // shopping
  Subscriptions: "#EC4899", // entertainment/subscriptions
  Travel: "#38BDF8",        // travel
  Accommodation: "#60A5FA",
  Entertainment: "#EC4899",
  Health: "#F97316",        // healthFitness
  Bills: "#22C55E",         // billsUtilities
  Other: "#9CA3AF"
};

const CATEGORY_EMOJIS = {
  Food: "🍔",
  Transport: "🚗",
  Shopping: "🛍️",
  Subscriptions: "📱",
  Travel: "✈️",
  Accommodation: "🏨",
  Entertainment: "🎬",
  Health: "🏥",
  Bills: "📄",
  Other: "📦"
};

function getCategoryDisplay(category) {
  const emoji = CATEGORY_EMOJIS[category] || CATEGORY_EMOJIS.Other;
  return `${emoji} ${category}`;
}

function loadTransactions() {
  try {
    if (transactionsCache !== null) return transactionsCache;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      transactionsCache = DEFAULT_TRANSACTIONS.slice();
      return transactionsCache;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      transactionsCache = DEFAULT_TRANSACTIONS.slice();
      return transactionsCache;
    }
    transactionsCache = parsed;
    return transactionsCache;
  } catch (e) {
    transactionsCache = DEFAULT_TRANSACTIONS.slice();
    return transactionsCache;
  }
}

function saveTransactions(list) {
  try {
    transactionsCache = list;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    if (window.IDBStore) {
      // Sync to IDB: clear then re-add for simplicity
      IDBStore.clear('transactions').then(() => {
        return Promise.all((list || []).map((t) => IDBStore.put('transactions', t)));
      }).catch(()=>{});
    }
  } catch (e) {}
}

function loadBudgets() {
  try {
    if (budgetsCache !== null) return budgetsCache;
    const raw = localStorage.getItem(BUDGET_STORAGE_KEY);
    if (!raw) {
      budgetsCache = {};
      return budgetsCache;
    }
    budgetsCache = JSON.parse(raw);
    return budgetsCache;
  } catch (e) {
    budgetsCache = {};
    return budgetsCache;
  }
}

function saveBudgets(budgets) {
  try {
    budgetsCache = budgets;
    localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(budgets));
    if (window.IDBStore) {
      IDBStore.put('budgets', { id: 'budgets', value: budgets }).catch(()=>{});
    }
  } catch (e) {}
}

function loadNotifications() {
  try {
    if (notificationsCache !== null) return notificationsCache;
    const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (!raw) {
      notificationsCache = [];
      return notificationsCache;
    }
    notificationsCache = JSON.parse(raw);
    return notificationsCache;
  } catch (e) {
    notificationsCache = [];
    return notificationsCache;
  }
}

function saveNotifications(notifications) {
  try {
    notificationsCache = notifications;
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
    if (window.IDBStore) {
      IDBStore.clear('notifications').then(() => {
        return Promise.all((notifications || []).map((n) => IDBStore.put('notifications', n)));
      }).catch(()=>{});
    }
  } catch (e) {}
}

function addNotification(message, type = "info") {
  const notifications = loadNotifications();
  const newNotif = {
    id: `n_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    message,
    type,
    timestamp: new Date().toISOString(),
    read: false
  };
  notifications.unshift(newNotif);
  // Keep only last 50 notifications
  if (notifications.length > 50) {
    notifications.splice(50);
  }
  saveNotifications(notifications);
  return notifications;
}

function buildBudgetGraph(budgets, categorySpending, overallBudget, overallSpending, currency = "USD") {
  const curr = CURRENCIES[currency] || CURRENCIES.USD;
  const hasBudgets = overallBudget > 0 || Object.keys(budgets).some((k) => k !== "overall" && budgets[k] > 0);
  
  if (!hasBudgets) {
    return "";
  }

  let html = `<div class="budget-graph-container">
    <div class="budget-graph-title">Budget vs Spending</div>`;

  // Overall budget graph
  if (overallBudget > 0) {
    const percentage = Math.min((overallSpending / overallBudget) * 100, 100);
    const isOver = overallSpending > overallBudget;
    html += `
      <div class="budget-graph-item">
        <div class="budget-graph-label">
          <span>Overall Budget</span>
          <span class="budget-graph-status ${isOver ? "over" : ""}">${percentage.toFixed(0)}%</span>
        </div>
        <div class="budget-graph-bars">
          <div class="budget-bar budget-bar-budget" style="width: 100%; background: rgba(0, 122, 255, 0.2);">
            <span class="budget-bar-label">Budget: ${curr.symbol}${overallBudget.toFixed(2)}</span>
          </div>
          <div class="budget-bar budget-bar-spending" style="width: ${percentage}%; background: ${isOver ? "#ff3b30" : "#34c759"};">
            <span class="budget-bar-label">Spent: ${curr.symbol}${overallSpending.toFixed(2)}</span>
          </div>
        </div>
      </div>
    `;
  }

  // Category budgets graph
  Object.keys(budgets).forEach((category) => {
    if (category === "overall") return;
    const budget = budgets[category];
    if (!budget || budget <= 0) return;
    
    const spending = categorySpending[category] || 0;
    const percentage = Math.min((spending / budget) * 100, 100);
    const isOver = spending > budget;
    const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
    
    html += `
      <div class="budget-graph-item">
        <div class="budget-graph-label">
          <span>${getCategoryDisplay(category)}</span>
          <span class="budget-graph-status ${isOver ? "over" : ""}">${percentage.toFixed(0)}%</span>
        </div>
        <div class="budget-graph-bars">
          <div class="budget-bar budget-bar-budget" style="width: 100%; background: ${color}22;">
            <span class="budget-bar-label">Budget: ${curr.symbol}${budget.toFixed(2)}</span>
          </div>
          <div class="budget-bar budget-bar-spending" style="width: ${percentage}%; background: ${isOver ? "#ff3b30" : color};">
            <span class="budget-bar-label">Spent: ${curr.symbol}${spending.toFixed(2)}</span>
          </div>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  return html;
}

function checkBudgetStatus(transactions, budgets) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const monthlySpending = computeMonthlyTotal(transactions);
  const categoryTotals = computeCategoryTotals(
    transactions.filter((t) => {
      const dt = new Date(t.timestamp);
      return dt.getMonth() === month && dt.getFullYear() === year;
    })
  );

  const notifications = [];
  const overallBudget = budgets.overall;
  if (overallBudget && overallBudget > 0) {
    const spent = Math.abs(monthlySpending);
    const percentage = (spent / overallBudget) * 100;
    if (percentage >= 100) {
      notifications.push({
        message: `Budget exceeded! You've spent $${spent.toFixed(2)} of $${overallBudget.toFixed(2)}`,
        type: "warning"
      });
    } else if (percentage >= 80) {
      notifications.push({
        message: `Budget alert: ${percentage.toFixed(0)}% used ($${spent.toFixed(2)} / $${overallBudget.toFixed(2)})`,
        type: "info"
      });
    }
  }

  Object.keys(budgets).forEach((category) => {
    if (category === "overall") return;
    const budget = budgets[category];
    if (!budget || budget <= 0) return;
    const spent = categoryTotals[category] || 0;
    const percentage = (spent / budget) * 100;
    if (percentage >= 100) {
      notifications.push({
        message: `${category} budget exceeded! $${spent.toFixed(2)} / $${budget.toFixed(2)}`,
        type: "warning"
      });
    } else if (percentage >= 80) {
      notifications.push({
        message: `${category} budget: ${percentage.toFixed(0)}% used`,
        type: "info"
      });
    }
  });

  return notifications;
}

function formatCurrency(amount, currency) {
  const sign = amount < 0 ? "-" : "+";
  const curr = CURRENCIES[currency] || CURRENCIES.USD;
  return `${sign}${curr.symbol}${Math.abs(amount).toFixed(2)}`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDateTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return iso;
  }
}

function computeMonthlyTotal(transactions) {
  const now = new Date();
  const m = now.getMonth();
  const y = now.getFullYear();
  return transactions
    .filter((t) => {
      const dt = new Date(t.timestamp);
      return dt.getMonth() === m && dt.getFullYear() === y;
    })
    .reduce((sum, t) => sum + t.amount, 0);
}

function computeCategoryTotals(transactions) {
  const totals = {};
  transactions.forEach((t) => {
    const cat = t.category || "Other";
    const value = Math.abs(t.amount);
    totals[cat] = (totals[cat] || 0) + value;
  });
  return totals;
}

// Attach pointer-based swipe-to-delete handlers to an element.
function attachSwipeToDelete(el, onDelete) {
  // wrap content in swipe-content if not present
  let content = el.querySelector('.swipe-content');
  if (!content) {
    content = document.createElement('div');
    while (el.firstChild) content.appendChild(el.firstChild);
    content.className = 'swipe-content';
    el.appendChild(content);
  }

  let startX = 0;
  let currentX = 0;
  let dragging = false;

  function setTranslate(x) {
    content.style.transform = `translateX(${x}px)`;
  }

  el.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    currentX = 0;
    dragging = true;
    el.setPointerCapture && el.setPointerCapture(e.pointerId);
    content.style.transition = 'none';
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (dx < 0) { // only allow left swipe
      currentX = dx;
      setTranslate(currentX);
    }
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    el.releasePointerCapture && el.releasePointerCapture(e.pointerId);
    content.style.transition = '';
    if (currentX < -80) {
      // consider this a delete
      setTranslate(-200);
      setTimeout(() => {
        try { onDelete(); } catch (err) {}
      }, 180);
    } else {
      setTranslate(0);
    }
    startX = 0; currentX = 0;
  }

  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
}

function renderApp(root, transactions, skipBudgetCheck = false) {
  root.innerHTML = "";

  const budgets = loadBudgets();
  const notifications = loadNotifications();
  const currentCurrency = loadCurrency();
  
  // Only check budget status if not skipping (to prevent re-adding notifications when marking as read)
  if (!skipBudgetCheck) {
    const budgetAlerts = checkBudgetStatus(transactions, budgets);
    // Add new budget alerts as notifications if they don't exist
    budgetAlerts.forEach((alert) => {
      const exists = notifications.some((n) => n.message === alert.message && !n.read);
      if (!exists) {
        addNotification(alert.message, alert.type);
      }
    });
  }

  const activeCategory = selectedCategory;
  let listTransactions = activeCategory
    ? transactions.filter((t) => (t.category || "Other") === activeCategory)
    : transactions.slice();
  if (selectedDay) {
    listTransactions = listTransactions.filter((t) => (t.timestamp || '').slice(0,10) === selectedDay);
  }

  const app = document.createElement("div");
  app.className = "app";

  // Notification bell button
  const notificationButton = document.createElement("button");
  notificationButton.className = "notification-button";
  notificationButton.innerHTML = `🔔${notifications.filter((n) => !n.read).length > 0 ? `<span class="notification-badge">${notifications.filter((n) => !n.read).length}</span>` : ""}`;
  notificationButton.addEventListener("click", () => {
    showNotifications = !showNotifications;
    renderApp(root, transactions);
  });

  // Header
  const header = document.createElement("div");
  header.className = "app-header";
  if (activeCategory) {
    header.innerHTML = `
      <div>
        <button class="back-button" id="back-button">← All</button>
        <div class="app-title">${getCategoryDisplay(activeCategory)}</div>
        <div class="app-subtitle">Category history</div>
      </div>
    `;
  } else {
    const headerLeft = document.createElement("div");
    headerLeft.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="app-logo" aria-hidden="true"> 
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="4" width="22" height="14" rx="2" stroke="currentColor" stroke-width="1.2" fill="none" />
            <path d="M3 8h18" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
            <circle cx="18" cy="11" r="1.6" fill="currentColor" />
          </svg>
        </div>
        <div>
          <div class="app-title">Wallet Buddy</div>
          <div class="app-subtitle">Local-only personal dashboard</div>
        </div>
      </div>
    `;
    header.appendChild(headerLeft);
    header.appendChild(notificationButton);
  }

  // Budget status card
  const budgetsData = loadBudgets();
  const monthlySpending = computeMonthlyTotal(transactions);
  const overallBudget = budgetsData.overall || 0;
  const budgetPercentage = overallBudget > 0 ? (Math.abs(monthlySpending) / overallBudget) * 100 : 0;
  
  // Calculate current month spending by category for graph
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthlyTransactions = transactions.filter((t) => {
    const dt = new Date(t.timestamp);
    return dt.getMonth() === currentMonth && dt.getFullYear() === currentYear;
  });
  const categorySpending = computeCategoryTotals(monthlyTransactions);

  // Summary
  const total = computeMonthlyTotal(listTransactions);
  let budgetStatusHtml = "";
  if (overallBudget > 0 && !activeCategory) {
    const remaining = overallBudget - Math.abs(monthlySpending);
    budgetStatusHtml = `
      <div class="budget-status">
        <div class="budget-progress-bar">
          <div class="budget-progress-fill" style="width: ${Math.min(budgetPercentage, 100)}%; background: ${budgetPercentage >= 100 ? '#ff3b30' : budgetPercentage >= 80 ? '#ff9500' : '#34c759'}"></div>
        </div>
        <div class="budget-info">
          <span>Budget: ${formatCurrency(remaining, currentCurrency)} remaining</span>
          <span>${budgetPercentage.toFixed(0)}% used</span>
        </div>
      </div>
    `;
  }
  const summaryHtml = `
    <div class="summary-label">${activeCategory ? "This month in category" : "This month"}</div>
    <div class="summary-value">${formatCurrency(total, currentCurrency)}</div>
    <div class="summary-caption">
      ${activeCategory ? `Filtered by ${getCategoryDisplay(activeCategory)}` : "All transactions in local storage"}
    </div>
    ${budgetStatusHtml}
  `;
  const summaryCard = ui.Card(summaryHtml);
  summaryCard.classList.add('summary-card');

  // Form
  const formHtml = `
    <div class="form-row">
      <div class="field">
        <div class="field-label">Amount (${currentCurrency})</div>
        <input type="number" step="0.01" id="amount-input" class="field-input" placeholder="-25.00" />
      </div>
      <div class="field">
        <div class="field-label">Category</div>
        <select id="category-select" class="field-select">
          <option value="Food">${getCategoryDisplay("Food")}</option>
          <option value="Transport">${getCategoryDisplay("Transport")}</option>
          <option value="Shopping">${getCategoryDisplay("Shopping")}</option>
          <option value="Subscriptions">${getCategoryDisplay("Subscriptions")}</option>
          <option value="Travel">${getCategoryDisplay("Travel")}</option>
          <option value="Accommodation">${getCategoryDisplay("Accommodation")}</option>
          <option value="Entertainment">${getCategoryDisplay("Entertainment")}</option>
          <option value="Health">${getCategoryDisplay("Health")}</option>
          <option value="Bills">${getCategoryDisplay("Bills")}</option>
          <option value="Other">${getCategoryDisplay("Other")}</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="field">
        <div class="field-label">Merchant / note</div>
        <input type="text" id="merchant-input" class="field-input" placeholder="Where did you spend?" />
      </div>
      <button id="add-button" class="primary-button">Add</button>
    </div>
  `;
  const formCard = ui.Card(formHtml);
  formCard.classList.add('form-card');

  const listTitle = document.createElement("div");
  listTitle.className = "transactions-section-title";
  listTitle.textContent = activeCategory ? `History: ${getCategoryDisplay(activeCategory)}` : "Recent activity";

  const ul = document.createElement("ul");
  ul.className = "transaction-list";

  listTransactions
    .slice()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .forEach((t) => {
      const li = document.createElement("li");
      li.className = "transaction-item";

      const main = document.createElement("div");
      main.className = "transaction-main";
      main.innerHTML = `
        <div class="transaction-merchant">${t.merchant || "Unknown"}</div>
        <div class="transaction-category-chip">${getCategoryDisplay(t.category || "Other")}</div>
      `;

      const meta = document.createElement("div");
      meta.className = "transaction-meta";
      meta.innerHTML = `
        <div class="transaction-amount">${formatCurrency(t.amount, currentCurrency)}</div>
        <div class="transaction-date">${formatDateTime(t.timestamp)}</div>
      `;

      const del = document.createElement("button");
      del.className = "delete-button";
      del.textContent = "×";
      del.title = "Delete";
      del.addEventListener("click", () => {
        const updated = transactions.filter((x) => x.id !== t.id);
        saveTransactions(updated);
        renderApp(root, updated);
      });

      meta.appendChild(del);
      li.appendChild(main);
      li.appendChild(meta);
      ul.appendChild(li);

      // Attach swipe-to-delete for transactions
      attachSwipeToDelete(li, () => {
        const updated = transactions.filter((x) => x.id !== t.id);
        saveTransactions(updated);
        renderApp(root, updated);
      });

      const chip = li.querySelector(".transaction-category-chip");
      if (chip) {
        const cat = t.category || "Other";
        const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other;
        chip.style.setProperty('--cat-color', color);
        chip.style.cursor = "pointer";
        chip.addEventListener("click", () => {
          selectedCategory = cat;
          renderApp(root, transactions);
        });
      }
    });

  // Category chart
  const chartTitle = document.createElement("div");
  chartTitle.className = "chart-title";
  chartTitle.textContent = "Spending by category";
  const chartContainer = document.createElement("div");
  const chartCard = ui.Card([chartTitle, chartContainer]);
  chartCard.classList.add('chart-card');

  const totals = computeCategoryTotals(transactions);
  const entries = Object.entries(totals);
  if (entries.length === 0) {
    chartContainer.textContent = "No data yet.";
  } else {
    const max = Math.max(...entries.map(([, v]) => v));
    entries.forEach(([category, total]) => {
      const row = document.createElement("div");
      row.className = "category-row";

      const label = document.createElement("div");
      label.className = "category-label";
      label.textContent = getCategoryDisplay(category);

      const track = document.createElement("div");
      track.className = "category-bar-track";

      const fill = document.createElement("div");
      fill.className = "category-bar-fill";
      fill.style.width = max === 0 ? "0%" : `${(total / max) * 100}%`;
      const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
      fill.style.backgroundImage = `linear-gradient(90deg, ${color}, ${color})`;

      track.appendChild(fill);

      const amount = document.createElement("div");
      amount.className = "category-amount";
      const curr = CURRENCIES[currentCurrency] || CURRENCIES.USD;
      amount.textContent = `${curr.symbol}${total.toFixed(2)}`;

      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(amount);
      chartContainer.appendChild(row);

      row.style.cursor = "pointer";
      row.addEventListener("click", () => {
        selectedCategory = category;
        renderApp(root, transactions);
      });
    });
  }

  // Layout: title + grid (bars left, pie right) + legend
  chartCard.appendChild(chartTitle);
  const chartGrid = document.createElement('div');
  chartGrid.style.display = 'flex';
  chartGrid.style.alignItems = 'flex-start';
  chartGrid.style.gap = '18px';
  chartGrid.appendChild(chartContainer);
  chartContainer.style.flex = '1';

  // Donut chart (stroke-based segments) with center label
  const pieWrapper = document.createElement("div");
  pieWrapper.className = "pie-container";
  const pieSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  pieSvg.setAttribute("width", "220");
  pieSvg.setAttribute("height", "220");
  pieSvg.setAttribute("viewBox", "0 0 32 32");

  if (entries.length > 0) {
    const totalSum = entries.reduce((sum, [, v]) => sum + v, 0);
    const radius = 12; // in viewBox units
    const circumference = 2 * Math.PI * radius;
    // Safer stroke width & gap to create a large inner hole (~70% inner radius)
    const strokeWidth = 4.5; // thinner ring for larger inner hole
    const gap = Math.max(1, circumference * 0.04); // increased gap for visible separation
    let cumulative = 0;

    entries.forEach(([category, value]) => {
      const fraction = value / totalSum;
      let dash = Math.max((fraction * circumference) - gap, 0.0001);
      const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '16');
      circle.setAttribute('cy', '16');
      circle.setAttribute('r', String(radius));
      circle.setAttribute('fill', 'none');
      circle.setAttribute('class', 'segment');
      circle.setAttribute('stroke', color);
      circle.setAttribute('stroke-width', String(strokeWidth));
      circle.setAttribute('stroke-dasharray', `${dash} ${circumference}`);
      circle.setAttribute('stroke-dashoffset', String(-cumulative));
      circle.setAttribute('stroke-linecap', 'round');
      circle.setAttribute('transform', 'rotate(-90 16 16)');
      pieSvg.appendChild(circle);

      cumulative += dash + gap;
    });

    // center overlay
    const totalLabel = document.createElement('div');
    totalLabel.className = 'donut-center';
    const currSym = (CURRENCIES[currentCurrency] || CURRENCIES.USD).symbol;
    const totalText = `${currSym}${totalSum.toFixed(2)}`;
    totalLabel.innerHTML = `<div class="donut-label">Total</div><div class="donut-value">${totalText}</div>`;
    pieWrapper.appendChild(totalLabel);
  }

  pieWrapper.appendChild(pieSvg);
  chartGrid.appendChild(pieWrapper);
  chartCard.appendChild(chartGrid);

  // Legend
  const legend = document.createElement("div");
  legend.className = "pie-legend";
  entries.forEach(([category]) => {
    const item = document.createElement("div");
    item.className = "pie-legend-item";
    const swatch = document.createElement("div");
    swatch.className = "pie-legend-swatch";
    swatch.style.backgroundColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
    const label = document.createElement("span");
    label.textContent = getCategoryDisplay(category);
    item.appendChild(swatch);
    item.appendChild(label);
    legend.appendChild(item);
  });

  chartCard.appendChild(legend);

  // Budget graph card for home screen
  const budgetGraphCard = ui.Card('');
  budgetGraphCard.classList.add('budget-graph-card');
  if (!activeCategory && (overallBudget > 0 || Object.keys(budgetsData).some((k) => k !== "overall" && budgetsData[k] > 0))) {
    const budgetGraphHtml = buildBudgetGraph(budgetsData, categorySpending, overallBudget, Math.abs(monthlySpending), currentCurrency);
    budgetGraphCard.innerHTML = `
      <div class="budget-graph-card-title">Budget Overview</div>
      ${budgetGraphHtml}
    `;
  }

  // Budget settings button
  const curr = CURRENCIES[currentCurrency] || CURRENCIES.USD;
  const budgetButton = ui.Button(overallBudget > 0 ? `Budget: ${curr.symbol}${overallBudget.toFixed(2)}` : "Set Budget", {
    onClick: () => {
      showBudgetSettings = !showBudgetSettings;
      renderApp(root, transactions);
    }
  });
  budgetButton.classList.add('budget-button');

  // Currency button
  const currencyButton = ui.Button(currentCurrency, {
    onClick: () => {
      showCurrencySettings = !showCurrencySettings;
      renderApp(root, transactions);
    },
    variant: 'ghost'
  });
  currencyButton.classList.add('currency-button');

  // Notification center
  const notificationCenter = document.createElement("div");
  notificationCenter.className = `notification-center ${showNotifications ? "visible" : ""}`;
  const notificationHeader = document.createElement("div");
  notificationHeader.className = "notification-header";
  notificationHeader.innerHTML = `
    <div class="notification-title">Notifications</div>
    <div class="notification-header-actions">
      <button class="mark-all-read-button" id="mark-all-read">Mark All Read</button>
      <button class="notification-close" id="close-notifications">✕</button>
    </div>
  `;
  const notificationList = document.createElement("div");
  notificationList.className = "notification-list";
  const allNotifications = loadNotifications();
  if (allNotifications.length === 0) {
    notificationList.innerHTML = `<div class="notification-empty">No notifications</div>`;
  } else {
    allNotifications.forEach((notif) => {
      const notifItem = document.createElement("div");
      notifItem.className = `notification-item ${notif.read ? "read" : ""} ${notif.type}`;
      notifItem.innerHTML = `
        <div class="notification-content">${notif.message}</div>
        <div class="notification-time">${formatDate(notif.timestamp)}</div>
      `;
      notifItem.addEventListener("click", () => {
        const updated = allNotifications.filter((n) => n.id !== notif.id);
        saveNotifications(updated);
        renderApp(root, transactions, true); // Skip budget check to prevent re-adding notifications
      });
      notificationList.appendChild(notifItem);
      // Attach swipe-to-delete for notifications
      attachSwipeToDelete(notifItem, () => {
        const updated = allNotifications.filter((n) => n.id !== notif.id);
        saveNotifications(updated);
        renderApp(root, transactions, true);
      });
    });
  }
  notificationCenter.appendChild(notificationHeader);
  notificationCenter.appendChild(notificationList);

  // Budget settings panel
  const budgetPanel = document.createElement("div");
  budgetPanel.className = `budget-panel ${showBudgetSettings ? "visible" : ""}`;
  
  // Build budget graph HTML
  const budgetGraphHtml = buildBudgetGraph(budgetsData, categorySpending, overallBudget, Math.abs(monthlySpending), currentCurrency);
  
  budgetPanel.innerHTML = `
    <div class="budget-panel-header">
      <div class="budget-panel-title">Set Budget</div>
      <button class="budget-panel-close" id="close-budget">✕</button>
    </div>
    <div class="budget-panel-content">
      <div class="budget-field">
        <label>Overall Monthly Budget (${currentCurrency})</label>
        <input type="number" step="0.01" id="overall-budget-input" value="${overallBudget || ""}" placeholder="0.00" />
      </div>
      ${budgetGraphHtml}
      <div class="budget-categories">
        <div class="budget-categories-title">Category Budgets</div>
        ${Object.keys(CATEGORY_COLORS).map((cat) => {
          const catBudget = budgetsData[cat] || 0;
          return `
            <div class="budget-category-row">
              <label>${getCategoryDisplay(cat)}</label>
              <input type="number" step="0.01" data-category="${cat}" class="category-budget-input" value="${catBudget || ""}" placeholder="0.00" />
            </div>
          `;
        }).join("")}
      </div>
      <button class="save-budget-button" id="save-budget">Save Budget</button>
    </div>
  `;

  // Compose sections to match approved visual spec
  const headerSection = document.createElement('div');
  headerSection.className = 'section';
  headerSection.appendChild(header);

  const summarySection = document.createElement('div');
  summarySection.className = 'section';
  summarySection.appendChild(summaryCard);

  app.appendChild(headerSection);
  app.appendChild(summarySection);

  if (!activeCategory) {
    // Cards grid: budget + charts
    const cardsSection = document.createElement('div');
    cardsSection.className = 'section cards-grid';
    if (budgetGraphCard.innerHTML.trim()) {
      cardsSection.appendChild(budgetGraphCard);
    }
    cardsSection.appendChild(chartCard);
    app.appendChild(cardsSection);

    const controlsSection = document.createElement('div');
    controlsSection.className = 'section';
    // Calendar toggle button
    const calendarButton = ui.Button('Calendar', {
      onClick: () => { showCalendar = !showCalendar; renderApp(root, transactions); }
    });
    calendarButton.classList.add('calendar-button');
    controlsSection.appendChild(calendarButton);
    controlsSection.appendChild(budgetButton);
    controlsSection.appendChild(currencyButton);
    app.appendChild(controlsSection);
  }

  const transactionsSection = document.createElement('div');
  transactionsSection.className = 'section';
  transactionsSection.appendChild(formCard);

  // Single card container for recent transactions
  const transactionsCard = ui.Card('');
  transactionsCard.classList.add('transactions-card');
  const tcHeader = document.createElement('div');
  tcHeader.className = 'transactions-card-header';
  tcHeader.innerHTML = `<div class="transactions-card-title">${activeCategory ? `History: ${getCategoryDisplay(activeCategory)}` : 'Recent activity'}</div>`;
  transactionsCard.appendChild(tcHeader);
  // append the list into the card
  transactionsCard.appendChild(ul);

  transactionsSection.appendChild(transactionsCard);
  app.appendChild(transactionsSection);
  // Currency settings panel
  const currencyPanel = document.createElement("div");
  currencyPanel.className = `budget-panel currency-panel ${showCurrencySettings ? "visible" : ""}`;
  currencyPanel.innerHTML = `
    <div class="budget-panel-header">
      <div class="budget-panel-title">Select Currency</div>
      <button class="budget-panel-close" id="close-currency">✕</button>
    </div>
    <div class="budget-panel-content">
      ${Object.keys(CURRENCIES).map((code) => {
        const curr = CURRENCIES[code];
        const isSelected = code === currentCurrency;
        return `
          <div class="currency-option ${isSelected ? "selected" : ""}" data-currency="${code}">
            <div>
              <div class="currency-code">${code}</div>
              <div class="currency-name">${curr.name}</div>
            </div>
            <div class="currency-symbol">${curr.symbol}</div>
            ${isSelected ? '<div class="currency-check">✓</div>' : ''}
          </div>
        `;
      }).join("")}
    </div>
  `;

  app.appendChild(notificationCenter);
  app.appendChild(budgetPanel);
  app.appendChild(currencyPanel);

  // Calendar panel
  const transactionsByDate = {};
  transactions.forEach((t) => {
    const d = (t.timestamp || '').slice(0,10);
    if (!d) return;
    transactionsByDate[d] = transactionsByDate[d] || [];
    transactionsByDate[d].push(t);
  });

  const calendarPanel = document.createElement('div');
  calendarPanel.className = `calendar-panel ${showCalendar ? 'visible' : ''}`;

  const calNow = new Date();
  const displayed = new Date(calNow.getFullYear(), calNow.getMonth() + calendarOffset, 1);
  const monthName = displayed.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  const calHeader = document.createElement('div');
  calHeader.className = 'calendar-header';
  calHeader.innerHTML = `
    <button id="cal-prev" class="cal-nav">‹</button>
    <div class="calendar-title">${monthName}</div>
    <button id="cal-next" class="cal-nav">›</button>
  `;

  const calGrid = document.createElement('div');
  calGrid.className = 'calendar-grid';

  // Weekday labels
  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach((w) => {
    const el = document.createElement('div'); el.className = 'calendar-weekday'; el.textContent = w; calGrid.appendChild(el);
  });

  const firstDay = new Date(displayed.getFullYear(), displayed.getMonth(), 1).getDay();
  const daysInMonth = new Date(displayed.getFullYear(), displayed.getMonth()+1, 0).getDate();

  // blank cells
  for (let i=0;i<firstDay;i++) {
    const empty = document.createElement('div'); empty.className = 'calendar-day empty'; calGrid.appendChild(empty);
  }

  for (let d=1; d<=daysInMonth; d++) {
    const dateStr = new Date(displayed.getFullYear(), displayed.getMonth(), d).toISOString().slice(0,10);
    const day = document.createElement('button');
    day.className = 'calendar-day';
    if (selectedDay === dateStr) day.classList.add('selected');
    const badge = transactionsByDate[dateStr] ? `<span class="cal-count">${transactionsByDate[dateStr].length}</span>` : '';
    day.innerHTML = `<div class="cal-num">${d}</div>${badge}`;
    day.addEventListener('click', () => {
      selectedDay = dateStr === selectedDay ? null : dateStr;
      renderApp(root, transactions);
    });
    calGrid.appendChild(day);
  }

  const calFooter = document.createElement('div');
  calFooter.className = 'calendar-footer';
  const clearBtn = document.createElement('button'); clearBtn.textContent = 'Clear date'; clearBtn.className = 'cal-clear';
  clearBtn.addEventListener('click', () => { selectedDay = null; showCalendar = false; renderApp(root, transactions); });
  calFooter.appendChild(clearBtn);

  calendarPanel.appendChild(calHeader);
  calendarPanel.appendChild(calGrid);
  calendarPanel.appendChild(calFooter);

  app.appendChild(calendarPanel);

  // If calendar should pop up, position it next to the calendar button
  if (showCalendar) {
    // find the calendar button rendered in controls
    const calBtnEl = app.querySelector('.calendar-button');
    if (calBtnEl) {
      try {
        const btnRect = calBtnEl.getBoundingClientRect();
        const appRect = app.getBoundingClientRect();
        // position relative to app container
        calendarPanel.style.left = Math.max(8, (btnRect.left - appRect.left)) + 'px';
        calendarPanel.style.top = (btnRect.bottom - appRect.top + 8) + 'px';
      } catch (e) {
        // fallback: leave default CSS positioning
      }
    }
  }

  root.appendChild(app);

  // Wire up form events after DOM nodes exist
  const backButton = document.getElementById("back-button");
  const addButton = document.getElementById("add-button");
  const amountInput = document.getElementById("amount-input");
  const categorySelect = document.getElementById("category-select");
  const merchantInput = document.getElementById("merchant-input");
  const closeNotifications = document.getElementById("close-notifications");
  const markAllReadBtn = document.getElementById("mark-all-read");
  const closeBudget = document.getElementById("close-budget");
  const closeCurrency = document.getElementById("close-currency");
  const saveBudgetBtn = document.getElementById("save-budget");

  if (backButton) {
    backButton.addEventListener("click", () => {
      selectedCategory = null;
      renderApp(root, transactions);
    });
  }

  if (closeNotifications) {
    closeNotifications.addEventListener("click", () => {
      showNotifications = false;
      renderApp(root, transactions);
    });
  }

  if (markAllReadBtn) {
    markAllReadBtn.addEventListener("click", () => {
      const allNotifications = loadNotifications();
      const updated = allNotifications.map((n) => ({ ...n, read: true }));
      saveNotifications(updated);
      renderApp(root, transactions, true);
    });
  }

  if (closeBudget) {
    closeBudget.addEventListener("click", () => {
      showBudgetSettings = false;
      renderApp(root, transactions);
    });
  }

  if (closeCurrency) {
    closeCurrency.addEventListener("click", () => {
      showCurrencySettings = false;
      renderApp(root, transactions);
    });
  }

  // Calendar prev/next navigation
  const calPrev = document.getElementById('cal-prev');
  const calNext = document.getElementById('cal-next');
  if (calPrev) {
    calPrev.addEventListener('click', () => {
      calendarOffset -= 1;
      renderApp(root, transactions);
    });
  }
  if (calNext) {
    calNext.addEventListener('click', () => {
      calendarOffset += 1;
      renderApp(root, transactions);
    });
  }

  // Currency selection
  document.querySelectorAll(".currency-option").forEach((option) => {
    option.addEventListener("click", () => {
      const currency = option.getAttribute("data-currency");
      saveCurrency(currency);
      showCurrencySettings = false;
      renderApp(root, transactions);
    });
  });

  if (saveBudgetBtn) {
    saveBudgetBtn.addEventListener("click", () => {
      const overallInput = document.getElementById("overall-budget-input");
      const overall = parseFloat(overallInput.value) || 0;
      const newBudgets = { overall };
      
      document.querySelectorAll(".category-budget-input").forEach((input) => {
        const category = input.getAttribute("data-category");
        const value = parseFloat(input.value) || 0;
        if (value > 0) {
          newBudgets[category] = value;
        }
      });

      saveBudgets(newBudgets);
      showBudgetSettings = false;
      renderApp(root, transactions);
    });
  }

  if (addButton && amountInput && categorySelect && merchantInput) {
    addButton.addEventListener("click", () => {
      const rawAmount = parseFloat(amountInput.value);
      if (Number.isNaN(rawAmount) || rawAmount === 0) {
        return;
      }
      const amount = rawAmount > 0 ? -rawAmount : rawAmount; // treat as spending
      const category = categorySelect.value || "Other";
      const merchant = merchantInput.value.trim();

      const next = [
        ...transactions,
        {
          id: `t_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          merchant,
          category,
          amount,
          currency: "USD",
          timestamp: new Date().toISOString()
        }
      ];

      saveTransactions(next);
      renderApp(root, next);
    });
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  const root = document.getElementById("root");
  if (!root) return;
  try {
    await initStorage();
  } catch (e) {
    // ignore init errors and continue with localStorage fallback
  }
  const transactions = loadTransactions();
  // If URL contains import params, handle them (useful for Apple Shortcuts)
  const didImport = handleImportFromURL(root);
  if (!didImport) {
    renderApp(root, transactions);
  }
});


