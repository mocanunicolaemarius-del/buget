// ===== Helpers =====
function monthKeyNow() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function prevMonthKey(key) {
  const [yStr, mStr] = key.split("-");
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10);
  m -= 1;
  if (m === 0) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function daysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}

function dateFromMonthKeyAndDay(monthKey, day) {
  const [yStr, mStr] = monthKey.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const maxDay = daysInMonth(y, m);
  const d = Math.min(Math.max(1, day), maxDay);
  return `${monthKey}-${String(d).padStart(2, "0")}`;
}

// acceptă 100 / 100.5 / 100,5
function parseMoneyToCents(input) {
  if (!input) return null;
  const cleaned = String(input).trim().replace(/\s+/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const parts = cleaned.split(".");
  const lei = parseInt(parts[0], 10);
  const bani = parts[1] ? parseInt(parts[1].padEnd(2, "0").slice(0, 2), 10) : 0;
  return (lei * 100) + bani;
}

function centsToLei(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const lei = Math.floor(abs / 100);
  const bani = abs % 100;
  return `${sign}${lei},${String(bani).padStart(2, "0")} lei`;
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function calcBalance(monthData) {
  const inc = (monthData.incomes || []).reduce((s, x) => s + x.amountCents, 0);
  const exp = (monthData.expenses || []).reduce((s, x) => s + x.amountCents, 0);
  return inc - exp;
}

// ===== Storage =====
const monthKey = monthKeyNow();
const KEY = "budget_tracker_v2";            // date pe luni
const QUICK_KEY = "budget_quick_v1";        // butoane rapide

function loadAll() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveAll(obj) {
  localStorage.setItem(KEY, JSON.stringify(obj));
}

function loadMonth(mKey) {
  const all = loadAll();
  if (!all[mKey]) {
    all[mKey] = {
      incomes: [],
      expenses: [],
      investments: { investedCents: 0, totalCents: 0 },
      carryAppliedFrom: null
    };
    saveAll(all);
  }
  return all[mKey];
}

function saveMonth(mKey, monthData) {
  const all = loadAll();
  all[mKey] = monthData;
  saveAll(all);
}

// quick templates: [{id, name, amountCents, dayOfMonth}]
function loadQuick() {
  try {
    const raw = localStorage.getItem(QUICK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQuick(list) {
  localStorage.setItem(QUICK_KEY, JSON.stringify(list));
}

function upsertQuickTemplate(tpl) {
  const list = loadQuick();
  const idx = list.findIndex(x => x.id === tpl.id);
  if (idx >= 0) list[idx] = tpl;
  else list.push(tpl);
  saveQuick(list);
}

function removeQuickTemplate(id) {
  const list = loadQuick().filter(x => x.id !== id);
  saveQuick(list);
}

// ===== Carry-over (Leftovers) =====
function applyCarryOverIfNeeded(dataForMonth) {
  const prevKey = prevMonthKey(monthKey);
  if (dataForMonth.carryAppliedFrom === prevKey) return dataForMonth;

  const prevData = loadMonth(prevKey);
  const prevBalance = calcBalance(prevData);

  // Doar pozitiv
  if (prevBalance > 0) {
    dataForMonth.incomes.push({
      id: "carry_" + prevKey,
      name: "Sold luna trecută",
      amountCents: prevBalance,
      dateISO: `${monthKey}-01`,
      createdAt: Date.now()
    });
  }

  dataForMonth.carryAppliedFrom = prevKey;
  saveMonth(monthKey, dataForMonth);
  return dataForMonth;
}

// ===== UI refs =====
const monthLabel = document.getElementById("monthLabel");
monthLabel.textContent = monthKey;

const incomeForm = document.getElementById("incomeForm");
const expenseForm = document.getElementById("expenseForm");

const incomeName = document.getElementById("incomeName");
const incomeAmount = document.getElementById("incomeAmount");
const incomeDate = document.getElementById("incomeDate");

const expenseName = document.getElementById("expenseName");
const expenseAmount = document.getElementById("expenseAmount");
const expenseDate = document.getElementById("expenseDate");
const expenseQuick = document.getElementById("expenseQuick");

incomeDate.value = todayISO();
expenseDate.value = todayISO();

const incomeList = document.getElementById("incomeList");
const expenseList = document.getElementById("expenseList");

const totalIncomeEl = document.getElementById("totalIncome");
const totalExpenseEl = document.getElementById("totalExpense");
const balanceEl = document.getElementById("balance");
const balanceBox = document.getElementById("balanceBox");

const spentPercentEl = document.getElementById("spentPercent");
const legSpendEl = document.getElementById("legSpend");
const legLeftEl = document.getElementById("legLeft");

const pieCanvas = document.getElementById("pie");
const pieCtx = pieCanvas.getContext("2d");

const resetMonthBtn = document.getElementById("resetMonthBtn");

const invForm = document.getElementById("invForm");
const invInvested = document.getElementById("invInvested");
const invTotal = document.getElementById("invTotal");
const invInvestedLabel = document.getElementById("invInvestedLabel");
const invTotalLabel = document.getElementById("invTotalLabel");
const invProfitLabel = document.getElementById("invProfitLabel");

const quickBtnsEl = document.getElementById("quickBtns");

// ===== State =====
let data = loadMonth(monthKey);
data = applyCarryOverIfNeeded(data);

// ===== Render =====
function render() {
  const totalIncome = data.incomes.reduce((s, x) => s + x.amountCents, 0);
  const totalExpense = data.expenses.reduce((s, x) => s + x.amountCents, 0);
  const balance = totalIncome - totalExpense;
  const left = Math.max(balance, 0);

  totalIncomeEl.textContent = centsToLei(totalIncome);
  totalExpenseEl.textContent = centsToLei(totalExpense);
  balanceEl.textContent = centsToLei(balance);

  // sold verde/roșu
  balanceBox.classList.remove("kpiGood", "kpiBad");
  balanceBox.classList.add(balance < 0 ? "kpiBad" : "kpiGood");

  const percent = totalIncome <= 0 ? 0 : Math.floor((totalExpense / totalIncome) * 100);
  spentPercentEl.textContent = `${Math.max(0, percent)}%`;

  legSpendEl.textContent = centsToLei(totalExpense);
  legLeftEl.textContent = centsToLei(left);

  renderTable(incomeList, data.incomes, "income");
  renderTable(expenseList, data.expenses, "expense");

  renderInvestments();
  renderQuickButtons();
  drawPie(totalExpense, left);
}

function renderTable(container, items, kind) {
  container.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.style.padding = "12px";
    empty.style.color = "rgba(255,255,255,.75)";
    empty.textContent = "Nimic încă.";
    container.appendChild(empty);
    return;
  }

  const sorted = [...items].sort((a, b) => {
    if (a.dateISO === b.dateISO) return (b.createdAt || 0) - (a.createdAt || 0);
    return b.dateISO.localeCompare(a.dateISO);
  });

  for (const it of sorted) {
    const row = document.createElement("div");
    row.className = "tRow";

    const c1 = document.createElement("div");
    c1.textContent = it.name;

    const c2 = document.createElement("div");
    c2.textContent = centsToLei(it.amountCents);

    const c3 = document.createElement("div");
    c3.textContent = it.dateISO;

    const c4 = document.createElement("div");
    c4.className = "rowBtns";

    const editBtn = document.createElement("button");
    editBtn.className = "smallBtn";
    editBtn.textContent = "Edit";
    editBtn.onclick = () => editItem(kind, it.id);

    const delBtn = document.createElement("button");
    delBtn.className = "smallBtn danger";
    delBtn.textContent = "Șterge";
    delBtn.onclick = () => deleteItem(kind, it.id);

    c4.appendChild(editBtn);
    c4.appendChild(delBtn);

    row.appendChild(c1);
    row.appendChild(c2);
    row.appendChild(c3);
    row.appendChild(c4);

    container.appendChild(row);
  }
}

function renderInvestments() {
  const inv = data.investments || { investedCents: 0, totalCents: 0 };
  const profit = inv.totalCents - inv.investedCents;

  invInvestedLabel.textContent = centsToLei(inv.investedCents);
  invTotalLabel.textContent = centsToLei(inv.totalCents);
  invProfitLabel.textContent = centsToLei(profit);
}

function renderQuickButtons() {
  const list = loadQuick();
  quickBtnsEl.innerHTML = "";

  if (list.length === 0) {
    const t = document.createElement("div");
    t.style.color = "rgba(255,255,255,.75)";
    t.textContent = "Nu ai butoane rapide încă. Bifează „Salvează ca buton rapid” când adaugi o cheltuială.";
    quickBtnsEl.appendChild(t);
    return;
  }

  for (const q of list) {
    const wrap = document.createElement("div");
    wrap.className = "qBtn";

    const main = document.createElement("div");
    main.className = "qMain";
    main.style.cursor = "pointer";

    const top = document.createElement("div");
    top.textContent = q.name;

    const sub = document.createElement("div");
    sub.className = "qSub";
    sub.textContent = `${centsToLei(q.amountCents)} • ziua ${q.dayOfMonth}`;

    main.appendChild(top);
    main.appendChild(sub);

    main.onclick = () => {
      const dateISO = dateFromMonthKeyAndDay(monthKey, q.dayOfMonth);
      addItem("expense", q.name, q.amountCents, dateISO);
    };

    const x = document.createElement("button");
    x.className = "qX";
    x.textContent = "X";
    x.onclick = () => {
      if (!confirm("Ștergi acest buton rapid?")) return;
      removeQuickTemplate(q.id);
      renderQuickButtons();
    };

    wrap.appendChild(main);
    wrap.appendChild(x);

    quickBtnsEl.appendChild(wrap);
  }
}

function drawPie(spentCents, leftCents) {
  const w = pieCanvas.width;
  const h = pieCanvas.height;
  pieCtx.clearRect(0, 0, w, h);

  const total = Math.max(1, spentCents + leftCents);
  const spentAngle = (spentCents / total) * Math.PI * 2;

  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2 - 6;

  // outer ring
  pieCtx.beginPath();
  pieCtx.arc(cx, cy, r, 0, Math.PI * 2);
  pieCtx.strokeStyle = "rgba(255,255,255,0.25)";
  pieCtx.lineWidth = 2;
  pieCtx.stroke();

  // spent slice
  pieCtx.beginPath();
  pieCtx.moveTo(cx, cy);
  pieCtx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--spend").trim() || "#121212";
  pieCtx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + spentAngle);
  pieCtx.closePath();
  pieCtx.fill();

  // left slice
  pieCtx.beginPath();
  pieCtx.moveTo(cx, cy);
  pieCtx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--left").trim() || "#12a39a";
  pieCtx.arc(cx, cy, r, -Math.PI / 2 + spentAngle, -Math.PI / 2 + Math.PI * 2);
  pieCtx.closePath();
  pieCtx.fill();

  // donut hole
  pieCtx.beginPath();
  pieCtx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  pieCtx.fillStyle = "rgba(15,47,54,0.85)";
  pieCtx.fill();
}

// ===== Actions =====
function addItem(kind, name, amountCents, dateISO) {
  const obj = {
    id: uid(),
    name,
    amountCents,
    dateISO,
    createdAt: Date.now()
  };

  if (kind === "income") data.incomes.push(obj);
  else data.expenses.push(obj);

  saveMonth(monthKey, data);
  render();
}

function deleteItem(kind, id) {
  const ok = confirm("Sigur vrei să ștergi?");
  if (!ok) return;

  if (kind === "income") data.incomes = data.incomes.filter(x => x.id !== id);
  else data.expenses = data.expenses.filter(x => x.id !== id);

  saveMonth(monthKey, data);
  render();
}

function editItem(kind, id) {
  const arr = kind === "income" ? data.incomes : data.expenses;
  const it = arr.find(x => x.id === id);
  if (!it) return;

  const newName = prompt("Nume:", it.name);
  if (newName === null) return;

  const newAmount = prompt("Sumă (lei):", (it.amountCents / 100).toFixed(2).replace(".", ","));
  if (newAmount === null) return;

  const cents = parseMoneyToCents(newAmount);
  if (cents === null) {
    alert("Sumă invalidă. Exemplu: 2200 sau 2200,50");
    return;
  }

  const newDate = prompt("Data (YYYY-MM-DD):", it.dateISO);
  if (newDate === null) return;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    alert("Data invalidă. Exemplu: 2026-02-12");
    return;
  }

  it.name = String(newName).trim() || it.name;
  it.amountCents = cents;
  it.dateISO = newDate;

  saveMonth(monthKey, data);
  render();
}

// ===== Events =====
incomeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = incomeName.value.trim();
  const cents = parseMoneyToCents(incomeAmount.value);
  const date = incomeDate.value;

  if (!name) return alert("Scrie un nume.");
  if (cents === null) return alert("Sumă invalidă. Exemplu: 8500 sau 8500,50");
  if (!date) return alert("Alege data.");

  addItem("income", name, cents, date);

  incomeName.value = "";
  incomeAmount.value = "";
  incomeDate.value = todayISO();
});

expenseForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = expenseName.value.trim();
  const cents = parseMoneyToCents(expenseAmount.value);
  const date = expenseDate.value;

  if (!name) return alert("Scrie un nume.");
  if (cents === null) return alert("Sumă invalidă. Exemplu: 2200 sau 2200,50");
  if (!date) return alert("Alege data.");

  addItem("expense", name, cents, date);

  // salvează ca buton rapid dacă e bifat
  if (expenseQuick.checked) {
    const dayOfMonth = parseInt(date.split("-")[2], 10);
    upsertQuickTemplate({
      id: name.toLowerCase().trim(), // id stabil după nume
      name,
      amountCents: cents,
      dayOfMonth
    });
    expenseQuick.checked = false;
    renderQuickButtons();
  }

  expenseName.value = "";
  expenseAmount.value = "";
  expenseDate.value = todayISO();
});

invForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const investedCents = parseMoneyToCents(invInvested.value);
  const totalCents = parseMoneyToCents(invTotal.value);

  if (investedCents === null || totalCents === null) {
    alert("Sume invalide. Exemplu: 3000 sau 3255,50");
    return;
  }

  data.investments = { investedCents, totalCents };
  saveMonth(monthKey, data);

  invInvested.value = "";
  invTotal.value = "";
  render();
});

resetMonthBtn.addEventListener("click", () => {
  const ok = confirm("Resetează luna: șterge veniturile/cheltuielile și investițiile. Sigur?");
  if (!ok) return;

  data = {
    incomes: [],
    expenses: [],
    investments: { investedCents: 0, totalCents: 0 },
    carryAppliedFrom: null
  };

  // la reset, refacem carry-over (dacă există pozitiv din luna trecută)
  data = applyCarryOverIfNeeded(data);

  saveMonth(monthKey, data);
  render();
});

// start
render();
