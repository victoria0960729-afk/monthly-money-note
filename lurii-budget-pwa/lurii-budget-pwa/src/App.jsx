
import React, { useEffect, useMemo, useState } from "react";
import { auth, loginWithGoogle, loginAsGuest } from "./firebase/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, getDoc, getFirestore } from "firebase/firestore";

const db = getFirestore();
import { loadLocalState, saveLocalState } from "./utils/storage";

const TODAY = new Date().toISOString().slice(0, 10);

const COLORS = {
  cream: "#F8F1E7",
  card: "#FFF9F0",
  card2: "#FFFDF8",
  border: "#EAD7C8",
  red: "#8B3A4A",
  redDark: "#5C2A33",
  muted: "#7B5555",
  text: "#3A2020",
};

const themes = [
  { id: "cream-red", name: "奶油紅", colors: ["#8B3A4A", "#B56576", "#A26769", "#D8B4A0", "#5C2A33", "#EFE6DD"] },
  { id: "strawberry", name: "草莓牛奶", colors: ["#B85C70", "#CC7A8B", "#D9A5B3", "#EBD2D8", "#7A3E4A", "#F4E8EA"] },
  { id: "mocha", name: "摩卡奶茶", colors: ["#6A4E42", "#8B6B5C", "#A48776", "#D6C1B4", "#4A342B", "#F2E9E2"] },
  { id: "blue", name: "海鹽藍", colors: ["#486581", "#5F7D95", "#7C98B3", "#C9D7E3", "#334E68", "#EEF3F7"] },
  { id: "green", name: "薄荷綠", colors: ["#4F6F64", "#6B9080", "#84A59D", "#CFE3DC", "#354F46", "#EEF5F2"] },
  { id: "orange", name: "橘子汽水", colors: ["#A65A3A", "#C97B63", "#D9A38F", "#EFD4C8", "#6E3B28", "#F7EEE9"] },
  { id: "bw", name: "黑白極簡", colors: ["#2C2C2C", "#4B4B4B", "#707070", "#D6D6D6", "#1A1A1A", "#F4F4F4"] },
];

const defaultCategories = {
  expense: ["餐飲", "交通", "購物", "娛樂", "學校", "生活用品", "醫療", "自媒體", "其他"],
  income: ["零用錢", "打工", "合作收入", "獎學金", "家人給予", "二手出售", "其他"],
};

const defaultBudgets = Object.fromEntries(defaultCategories.expense.map((item) => [item, 0]));

const emptyState = {
  appName: "我的記帳本",
  records: [],
  categories: defaultCategories,
  budgets: defaultBudgets,
  themeId: "cream-red",
  account: { provider: "guest", email: "" },
  savingGoal: { name: "存錢目標", current: 0, target: 0, history: [] },
  investments: [],
  investmentRate: 25,
  reminders: { enabled: false, times: ["20:30"], message: "今天還沒有記帳喔，要不要補一下？" },
};

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value) {
  return `NT$ ${safeNumber(value).toLocaleString("zh-TW")}`;
}

function cleanNumberInput(value) {
  const raw = String(value ?? "").replace(/[^\d.]/g, "");
  const parts = raw.split(".");
  const integer = (parts[0] || "0").replace(/^0+(?=\d)/, "") || "0";
  return parts.length > 1 ? `${integer}.${parts[1].slice(0, 2)}` : integer;
}

function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function sumRecords(records, type) {
  return records.filter((r) => r.type === type).reduce((sum, r) => sum + safeNumber(r.amount), 0);
}

function groupByCategory(records, type) {
  const map = {};
  records.filter((r) => r.type === type).forEach((r) => {
    map[r.category] = (map[r.category] || 0) + safeNumber(r.amount);
  });
  return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function makePie(data, colors) {
  const total = data.reduce((sum, item) => sum + safeNumber(item.value), 0);
  if (!total) return { gradient: "conic-gradient(#eee 0 360deg)", total: 0 };
  let start = 0;
  const parts = data.map((item, index) => {
    const deg = (item.value / total) * 360;
    const part = `${colors[index % colors.length]} ${start}deg ${start + deg}deg`;
    start += deg;
    return part;
  });
  return { gradient: `conic-gradient(${parts.join(", ")})`, total };
}

function completedSavingEntries(records, history) {
  const now = new Date();
  const saved = new Set((history || []).map((h) => h.month));
  const months = [...new Set(records.map((r) => String(r.date).slice(0, 7)))];

  return months
    .filter((month) => {
      const [y, m] = month.split("-").map(Number);
      return y < now.getFullYear() || (y === now.getFullYear() && m - 1 < now.getMonth());
    })
    .filter((month) => !saved.has(month))
    .map((month) => {
      const rows = records.filter((r) => String(r.date).startsWith(month));
      const amount = sumRecords(rows, "income") - sumRecords(rows, "expense");
      return { month, amount, date: TODAY };
    })
    .filter((entry) => entry.amount > 0);
}

export default function App() {
  const [state, setState] = useState(() => loadLocalState(emptyState));
  const [page, setPage] = useState("home");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [summaryType, setSummaryType] = useState("all");
  const [summaryCategory, setSummaryCategory] = useState("全部");
  const [latestIncome, setLatestIncome] = useState(null);
  const [form, setForm] = useState({
    date: TODAY,
    type: "expense",
    category: state.categories.expense[0] || "餐飲",
    amount: "",
    note: "",
  });

  const theme = themes.find((item) => item.id === state.themeId) || themes[0];

  const chartColors = [theme.colors[0], theme.colors[1], theme.colors[2], theme.colors[4], theme.colors[3], theme.colors[5]];

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      setState((prev) => ({
        ...prev,
        account: {
          provider: user.isAnonymous ? "guest" : "gmail",
          email: user.email || "訪客"
        }
      }));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const saveCloud = async () => {
      if (!auth.currentUser) return;
      if (auth.currentUser.isAnonymous) return;

      try {
        await setDoc(doc(db, "users", auth.currentUser.uid), {
          appState: state
        });
      } catch (e) {
        console.log(e);
      }
    };

    const timeout = setTimeout(() => {
      saveCloud();
    }, 800);

    return () => clearTimeout(timeout);
  }, [state]);

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user || user.isAnonymous) return;

      try {
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data();
          if (data?.appState) {
            setState((prev) => ({
              ...prev,
              ...data.appState,
              account: {
                provider: "gmail",
                email: user.email || ""
              }
            }));
          }
        }
      } catch (e) {
        console.log(e);
      }
    });

    return () => unsub();
  }, []);



  useEffect(() => {
    const entries = completedSavingEntries(state.records, state.savingGoal.history);
    if (!entries.length) return;
    setState((prev) => ({
      ...prev,
      savingGoal: {
        ...prev.savingGoal,
        current: safeNumber(prev.savingGoal.current) + entries.reduce((sum, e) => sum + e.amount, 0),
        history: [...entries, ...(prev.savingGoal.history || [])],
      },
    }));
  }, [state.records]);

  useEffect(() => {
    saveLocalState(state);
  }, [state]);

  const month = monthKey(currentMonth);
  const monthRecords = state.records.filter((r) => String(r.date).startsWith(month));
  const income = sumRecords(monthRecords, "income");
  const expense = sumRecords(monthRecords, "expense");
  const balance = income - expense;
  const expenseGroups = groupByCategory(monthRecords, "expense");
  const incomeGroups = groupByCategory(monthRecords, "income");
  const totalBudget = Object.values(state.budgets).reduce((sum, v) => sum + safeNumber(v), 0);

  const budgetUsage = state.categories.expense.map((category) => {
    const used = safeNumber(expenseGroups.find((item) => item.name === category)?.value);
    const budget = safeNumber(state.budgets[category]);
    const usedPercent = budget > 0 ? Math.round((used / budget) * 100) : 0;
    return { category, used, budget, remain: budget - used, usedPercent };
  }).sort((a, b) => b.usedPercent - a.usedPercent);

  const overBudget = budgetUsage.filter((item) => item.budget > 0 && item.used > item.budget);

  const goalProgress = state.savingGoal.target > 0
    ? Math.min(100, Math.round((safeNumber(state.savingGoal.current) / safeNumber(state.savingGoal.target)) * 100))
    : 0;

  const filteredRecords = monthRecords.filter((record) => {
    const typeOK = summaryType === "all" ? true : record.type === summaryType;
    const categoryOK = summaryCategory === "全部" ? true : record.category === summaryCategory;
    return typeOK && categoryOK;
  });

  const availableYears = [...new Set([new Date().getFullYear(), ...state.records.map((r) => Number(String(r.date).slice(0, 4))).filter(Boolean)])].sort((a, b) => b - a);
  const [chartYear, setChartYear] = useState(new Date().getFullYear());
  const monthlySummary = Array.from({ length: 12 }, (_, i) => {
    const key = `${chartYear}-${String(i + 1).padStart(2, "0")}`;
    const rows = state.records.filter((r) => String(r.date).startsWith(key));
    const inc = sumRecords(rows, "income");
    const exp = sumRecords(rows, "expense");
    return { month: i + 1, income: inc, expense: exp, balance: inc - exp };
  });

  function updateState(patch) {
    setState((prev) => ({ ...prev, ...patch }));
  }

  function addRecord() {
    const amount = safeNumber(form.amount);
    if (!amount || !form.date) return;
    const record = { ...form, amount, id: Date.now() };
    setState((prev) => ({ ...prev, records: [record, ...prev.records] }));
    if (record.type === "income") setLatestIncome(record);
    setForm((prev) => ({ ...prev, amount: "", note: "" }));
  }

  function removeRecord(id) {
    setState((prev) => ({ ...prev, records: prev.records.filter((r) => r.id !== id) }));
  }

  function addInvestment() {
    if (!latestIncome) return;
    const amount = Math.floor((safeNumber(latestIncome.amount) * safeNumber(state.investmentRate)) / 100 / 100) * 100;
    if (amount <= 0) return;
    const record = { id: Date.now(), date: TODAY, type: "expense", category: "投資", amount, note: "依照本次收入計算的投資建議" };
    setState((prev) => ({
      ...prev,
      records: [record, ...prev.records],
      investments: [{ id: Date.now() + 1, date: TODAY, amount, note: record.note }, ...prev.investments],
      categories: prev.categories.expense.includes("投資") ? prev.categories : { ...prev.categories, expense: [...prev.categories.expense, "投資"] },
      budgets: prev.budgets.投資 === undefined ? { ...prev.budgets, 投資: 0 } : prev.budgets,
    }));
    setLatestIncome(null);
  }

  function addCategory(type, name) {
    const trimmed = name.trim();
    if (!trimmed || state.categories[type].includes(trimmed)) return;
    setState((prev) => ({
      ...prev,
      categories: { ...prev.categories, [type]: [...prev.categories[type], trimmed] },
      budgets: type === "expense" ? { ...prev.budgets, [trimmed]: 0 } : prev.budgets,
    }));
  }

  function deleteCategory(type, name) {
    if (state.categories[type].length <= 1) return;
    const fallback = state.categories[type].find((item) => item !== name) || "其他";
    setState((prev) => {
      const budgets = { ...prev.budgets };
      delete budgets[name];
      return {
        ...prev,
        categories: { ...prev.categories, [type]: prev.categories[type].filter((item) => item !== name) },
        budgets,
        records: prev.records.map((record) => record.type === type && record.category === name ? { ...record, category: fallback } : record),
      };
    });
  }

  function moveCategory(type, index, direction) {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= state.categories[type].length) return;
    const list = [...state.categories[type]];
    [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
    setState((prev) => ({ ...prev, categories: { ...prev.categories, [type]: list } }));
  }

  const isSetting = ["settings", "budgetSettings", "saving", "investments"].includes(page);

  return (
    <div className="app" style={{ "--main": theme.colors[0], "--sub": theme.colors[1], "--accent": theme.colors[2], "--soft": theme.colors[3], "--dark": theme.colors[4], "--bg": theme.colors[5] }}>
      <main className="shell">
        {!isSetting && (
          <>
            <header className="header">
              <div>
                <div className="badge">MONTHLY MONEY NOTE</div>
                <h1>{state.appName}</h1>
                
              </div>
              <div className="monthBox">
                <button onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>‹</button>
                <b>{currentMonth.getFullYear()} 年 {currentMonth.getMonth() + 1} 月</b>
                <button onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>›</button>
              </div>
            </header>

            <button className="floating" onClick={() => setSettingsOpen(!settingsOpen)}>⚙️</button>
            {settingsOpen && (
              <div className="settingsMenu">
                <button onClick={() => { setPage("settings"); setSettingsOpen(false); }}>🎨 個人化</button>
                <button onClick={() => { setPage("budgetSettings"); setSettingsOpen(false); }}>👛 預算設定</button>
                <button onClick={() => { setPage("saving"); setSettingsOpen(false); }}>🎯 存錢目標</button>
                <button onClick={() => { setPage("investments"); setSettingsOpen(false); }}>📈 投資</button>
                <button onClick={() => { setPage("home"); setSettingsOpen(false); }}>🏠 回首頁</button>
              </div>
            )}

            <nav className="nav">
              <button className={page === "home" ? "active" : ""} onClick={() => setPage("home")}>🏠 記帳</button>
              <button className={page === "records" ? "active" : ""} onClick={() => setPage("records")}>🧾 總表</button>
              <button className={page === "charts" ? "active" : ""} onClick={() => setPage("charts")}>📊 圖表</button>
              <button className={page === "budget" ? "active" : ""} onClick={() => setPage("budget")}>👛 預算</button>
            </nav>
          </>
        )}

        {page === "home" && (
          <>
            <SummaryGrid items={[
              ["本月收入", money(income), "↗"],
              ["本月支出", money(expense), "↘"],
              ["剩餘金額", money(balance), "👛", true],
              [state.savingGoal.name || "存錢目標", `${goalProgress}%`, "🎯"],
            ]} />

            <section className="grid two">
              <Card title="📅 新增一筆紀錄">
                <Label>日期</Label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />

                <Label>收入 / 支出</Label>
                <div className="switch">
                  <button className={form.type === "income" ? "active" : ""} onClick={() => setForm({ ...form, type: "income", category: state.categories.income[0] })}>收入</button>
                  <button className={form.type === "expense" ? "active" : ""} onClick={() => setForm({ ...form, type: "expense", category: state.categories.expense[0] })}>支出</button>
                </div>

                <Label>區塊分類</Label>
                <div className="pills">
                  {state.categories[form.type].map((cat) => (
                    <button key={cat} className={form.category === cat ? "selected" : ""} onClick={() => setForm({ ...form, category: cat })}>{cat}</button>
                  ))}
                </div>

                <Label>金額</Label>
                <input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: cleanNumberInput(e.target.value) })} placeholder="例如：70" />

                <Label>備註</Label>
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="例如：學餐午餐" />

                <button className="primary" onClick={addRecord}>＋ 新增紀錄</button>
              </Card>

              <Card title="📌 開銷比率">
                <BudgetUsage items={budgetUsage} compact />
              </Card>

              {latestIncome && (
                <div className="relative">
                  <button className="close" onClick={() => setLatestIncome(null)}>×</button>
                  <Card title="📈 投資建議通知">
                    <h2 className="big">{money(Math.floor((latestIncome.amount * state.investmentRate) / 100 / 100) * 100)}</h2>
                    <p>根據這筆收入與你設定的 {state.investmentRate}% 投資比例，建議可以投入這個金額。</p>
                    <button className="primary" onClick={addInvestment}>加入投資支出</button>
                  </Card>
                </div>
              )}

              <Card title="🔔 花費提醒">
                <p>{overBudget.length ? `有 ${overBudget.length} 個分類超出預算，建議先暫停非必要支出。` : "目前收支看起來穩定，繼續每天記錄會讓月底分析更準。"}</p>
              </Card>
            </section>
          </>
        )}

        {page === "records" && (
          <>
            <SummaryGrid items={[
              ["本月收入", money(income), "↗"],
              ["本月支出", money(expense), "↘"],
              ["剩餘金額", money(balance), "👛", true],
              ["存下比例", income ? `${Math.max(0, Math.round((balance / income) * 100))}%` : "0%", "🐷"],
            ]} />

            <Card title="🧾 本月總表">
              <div className="topSwitch">
                {["all", "expense", "income"].map((type) => (
                  <button key={type} className={summaryType === type ? "selected" : ""} onClick={() => { setSummaryType(type); setSummaryCategory("全部"); }}>
                    {type === "all" ? "全部" : type === "expense" ? "支出" : "收入"}
                  </button>
                ))}
              </div>

              {summaryType !== "all" && (
                <div className="pills light">
                  {["全部", ...(summaryType === "expense" ? state.categories.expense : state.categories.income)].map((cat) => (
                    <button key={cat} className={summaryCategory === cat ? "selected" : ""} onClick={() => setSummaryCategory(cat)}>{cat}</button>
                  ))}
                </div>
              )}

              <RecordTable records={filteredRecords} onDelete={removeRecord} />
            </Card>
          </>
        )}

        {page === "budget" && (
          <>
            <SummaryGrid items={[
              ["本月支出", money(expense), "↘"],
              ["總預算", money(totalBudget), "👛"],
              ["剩餘預算", money(totalBudget - expense), "📌", true],
              ["超支項目", `${overBudget.length} 項`, "⚠️"],
            ]} />
            <Card title="📌 開銷比率">
              <BudgetUsage items={budgetUsage} />
            </Card>
          </>
        )}

        {page === "charts" && (
          <>
            <section className="grid two">
              <Card title="🥧 全部支出分布"><Pie data={expenseGroups} colors={chartColors} /></Card>
              <Card title="🥧 全部收入分布"><Pie data={incomeGroups} colors={chartColors} /></Card>
            </section>
            <Card title="📈 每月趨勢">
              <div className="yearPicker">
                <span>年份</span>
                <select value={chartYear} onChange={(e) => setChartYear(safeNumber(e.target.value))}>
                  {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <LineChart data={monthlySummary} colors={chartColors} />
            </Card>
          </>
        )}

        {page === "settings" && (
          <Setting title="🎨 個人化" onDone={() => setPage("home")}>
            <section className="grid two">
              <Card title="🎨 個人化設定">
                <Label>記帳本名稱</Label>
                <input value={state.appName} onChange={(e) => updateState({ appName: e.target.value })} />
                <Label>快速配色</Label>
                <div className="themeGrid">
                  {themes.map((t) => (
                    <button key={t.id} className={state.themeId === t.id ? "theme activeTheme" : "theme"} onClick={() => updateState({ themeId: t.id })}>
                      <span>{t.name}</span>
                      <div>{t.colors.slice(0, 5).map((c) => <i key={c} style={{ background: c }} />)}</div>
                    </button>
                  ))}
                </div>
              </Card>

              <Card title="🔔 記帳提醒">
                <label className="row">
                  <span>提醒開關</span>
                  <input type="checkbox" checked={state.reminders.enabled} onChange={(e) => updateState({ reminders: { ...state.reminders, enabled: e.target.checked } })} />
                </label>
                <Label>提醒文字</Label>
                <input value={state.reminders.message} onChange={(e) => updateState({ reminders: { ...state.reminders, message: e.target.value } })} />
                <p className="muted">PWA 版本需開著或由系統允許背景通知才會提醒；正式 App 需接推播服務。</p>
              </Card>

              <Card title="📈 投資偏好">
                <Label>投資比例</Label>
                <input type="range" min="0" max="100" value={state.investmentRate} onChange={(e) => updateState({ investmentRate: safeNumber(e.target.value) })} />
                <h2 className="center">{state.investmentRate}%</h2>
              </Card>

              <Card title="☁️ 帳號與記憶">
                <div className="switch">
                  <button
                    className={state.account.provider === "gmail" ? "active" : ""}
                    onClick={async () => {
                      try {
                        const result = await loginWithGoogle();
                        updateState({
                          account: {
                            provider: "gmail",
                            email: result.user.email || ""
                          }
                        });
                      } catch (err) {
                        alert("Google 登入失敗");
                      }
                    }}
                  >
                    Gmail
                  </button>

                  <button
                    className={state.account.provider === "guest" ? "active" : ""}
                    onClick={async () => {
                      try {
                        await loginAsGuest();
                        updateState({
                          account: {
                            provider: "guest",
                            email: "訪客"
                          }
                        });
                      } catch (err) {
                        alert("訪客登入失敗");
                      }
                    }}
                  >
                    訪客
                  </button>
                </div>
                {state.account.provider !== "guest" && (
                  <>
                    <Label>帳號</Label>
                    <input value={state.account.email} onChange={(e) => updateState({ account: { ...state.account, email: e.target.value } })} placeholder="yourname@gmail.com" />
                  </>
                )}
                <p className="muted">目前先以本機記憶為主；接 Firebase 後才是真正雲端同步。</p>
              </Card>
            </section>

            <section className="grid two">
              <CategoryEditor title="支出區塊管理" type="expense" state={state} setState={setState} addCategory={addCategory} deleteCategory={deleteCategory} moveCategory={moveCategory} />
              <CategoryEditor title="收入區塊管理" type="income" state={state} setState={setState} addCategory={addCategory} deleteCategory={deleteCategory} moveCategory={moveCategory} />
            </section>
          </Setting>
        )}

        {page === "budgetSettings" && (
          <Setting title="👛 預算設定" onDone={() => setPage("home")}>
            <Card title="👛 每月各項開支預算設定">
              <div className="budgetList">
                {state.categories.expense.map((cat, index) => (
                  <div className="budgetRow" key={cat}>
                    <div className="move">
                      <button onClick={() => moveCategory("expense", index, "up")}>↑</button>
                      <button onClick={() => moveCategory("expense", index, "down")}>↓</button>
                    </div>
                    <b>{cat}</b>
                    <input inputMode="decimal" value={state.budgets[cat] || 0} onChange={(e) => updateState({ budgets: { ...state.budgets, [cat]: cleanNumberInput(e.target.value) } })} />
                    <button className="miniDelete" onClick={() => deleteCategory("expense", cat)}>×</button>
                  </div>
                ))}
              </div>
              <button className="primary" onClick={() => setPage("settings")}>新增預算項目</button>
            </Card>
          </Setting>
        )}

        {page === "saving" && (
          <Setting title="🎯 存錢目標" onDone={() => setPage("home")}>
            <SummaryGrid items={[
              ["目前已存", money(state.savingGoal.current), "💰"],
              ["目標金額", money(state.savingGoal.target), "🎯"],
              ["完成進度", `${goalProgress}%`, "📈", true],
              ["剩餘目標", money(Math.max(0, state.savingGoal.target - state.savingGoal.current)), "✨"],
            ]} />

            <section className="grid two">
              <Card title="🎯 存錢目標設定">
                <Label>目標名稱</Label>
                <input value={state.savingGoal.name} onChange={(e) => updateState({ savingGoal: { ...state.savingGoal, name: e.target.value } })} />
                <Label>目前已存</Label>
                <input inputMode="decimal" value={state.savingGoal.current} onChange={(e) => updateState({ savingGoal: { ...state.savingGoal, current: cleanNumberInput(e.target.value) } })} />
                <Label>目標金額</Label>
                <input inputMode="decimal" value={state.savingGoal.target} onChange={(e) => updateState({ savingGoal: { ...state.savingGoal, target: cleanNumberInput(e.target.value) } })} />
                <div className="progress"><span style={{ width: `${goalProgress}%` }} /></div>
              </Card>

              <Card title="📝 每月自動存錢紀錄">
                {state.savingGoal.history.length === 0 ? <p className="muted">目前還沒有存錢紀錄。</p> : state.savingGoal.history.map((item) => (
                  <div className="listItem" key={item.month}>
                    <b>{item.month}</b>
                    <span>{money(item.amount)}</span>
                  </div>
                ))}
              </Card>
            </section>
          </Setting>
        )}

        {page === "investments" && (
          <Setting title="📈 投資紀錄" onDone={() => setPage("home")}>
            <SummaryGrid items={[
              ["總投資金額", money(state.investments.reduce((sum, item) => sum + safeNumber(item.amount), 0)), "📈", true],
              ["投資筆數", `${state.investments.length} 筆`, "🧾"],
            ]} />
            <Card title="📋 投資明細">
              {state.investments.length === 0 ? <p className="muted">目前還沒有投資紀錄。</p> : state.investments.map((item) => (
                <div className="listItem" key={item.id}>
                  <b>{money(item.amount)}</b>
                  <span>{item.date}</span>
                </div>
              ))}
            </Card>
          </Setting>
        )}
      </main>
    </div>
  );
}

function Card({ title, children }) {
  return <section className="card"><h2>{title}</h2>{children}</section>;
}

function Label({ children }) {
  return <label className="label">{children}</label>;
}

function Setting({ title, children, onDone }) {
  return (
    <section className="setting">
      <div className="settingHeader">
        <div>
          <div className="badge">SETTING</div>
          <h1>{title}</h1>
        </div>
        <button className="primary done" onClick={onDone}>完成</button>
      </div>
      {children}
    </section>
  );
}

function SummaryGrid({ items }) {
  return (
    <section className="summaryGrid">
      {items.map(([label, value, icon, dark]) => (
        <div className={dark ? "summary dark" : "summary"} key={label}>
          <div>
            <p>{label}</p>
            <b>{value}</b>
          </div>
          <span>{icon}</span>
        </div>
      ))}
    </section>
  );
}

function RecordTable({ records, onDelete }) {
  return (
    <div className="tableWrap">
      <table>
        <thead><tr><th>日期</th><th>類型</th><th>區塊</th><th>備註</th><th>金額</th><th>刪除</th></tr></thead>
        <tbody>
          {records.length === 0 ? <tr><td colSpan="6">這個月份還沒有紀錄。</td></tr> : records.map((r) => (
            <tr key={r.id}>
              <td>{r.date}</td><td>{r.type === "income" ? "收入" : "支出"}</td><td>{r.category}</td><td>{r.note || "—"}</td><td>{money(r.amount)}</td>
              <td><button className="delete" onClick={() => onDelete(r.id)}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BudgetUsage({ items, compact = false }) {
  const shown = compact ? items.slice(0, 5) : items;
  return (
    <div className="usageList">
      {shown.map((item) => {
        const over = item.budget > 0 && item.used > item.budget;
        return (
          <div className={over ? "usage over" : "usage"} key={item.category}>
            <div className="usageTop"><b>{item.category}</b><span>已用 {item.usedPercent}%｜剩餘 {money(item.remain)}</span></div>
            <div className="bar"><span style={{ width: `${Math.min(100, item.usedPercent)}%` }} /></div>
            <p>預算 {money(item.budget)}｜已花 {money(item.used)}</p>
          </div>
        );
      })}
      {compact && items.length > 5 && <p className="muted">到「預算」分頁可以看全部分類。</p>}
    </div>
  );
}

function Pie({ data, colors }) {
  const pie = makePie(data, colors);
  if (!pie.total) return <p className="muted center">還沒有資料。</p>;
  return (
    <div className="pieGrid">
      <div className="pie" style={{ background: pie.gradient }}><div>{money(pie.total)}</div></div>
      <div className="legendList">
        {data.map((item, i) => <div key={item.name}><i style={{ background: colors[i % colors.length] }} /> <b>{item.name}</b><span>{money(item.value)}</span></div>)}
      </div>
    </div>
  );
}

function LineChart({ data, colors }) {
  const max = Math.max(1, ...data.map((item) => Math.max(item.income, item.expense, Math.abs(item.balance))));
  const series = [
    ["income", "收入", colors[0]],
    ["expense", "支出", colors[1]],
    ["balance", "餘額", colors[3]],
  ];

  function point(item, index, key) {
    const x = 6 + (index / 11) * 88;
    const value = key === "balance" ? Math.abs(item.balance) : item[key];
    const y = 88 - (safeNumber(value) / max) * 76;
    return { x, y };
  }

  function points(key) {
    return data.map((item, index) => {
      const p = point(item, index, key);
      return `${p.x},${p.y}`;
    }).join(" ");
  }

  return (
    <div className="lineWrap">
      <div className="yAxis">
        {[max, max * 0.75, max * 0.5, max * 0.25, 0].map((v, i) => <span key={i}>{money(Math.round(v))}</span>)}
      </div>
      <div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="lineChart">
          {[12, 31, 50, 69, 88].map((y) => <line key={y} x1="6" y1={y} x2="94" y2={y} stroke="rgba(58,32,32,.12)" strokeWidth="2" />)}
          {series.map(([key, label, color]) => (
            <polyline key={key} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" points={points(key)} />
          ))}
          {series.flatMap(([key, label, color]) => data.map((item, index) => {
            const p = point(item, index, key);
            return <circle key={`${key}-${item.month}`} cx={p.x} cy={p.y} r="0.1" fill={color} />;
          }))}
        </svg>
        <div className="months">{data.map((item) => <span key={item.month}>{item.month}</span>)}</div>
      </div>
      <div className="chartLegend">
        {series.map(([key, label, color]) => <span key={key}><i style={{ background: color }} />{label}</span>)}
      </div>
    </div>
  );
}

function CategoryEditor({ title, type, state, setState, addCategory, deleteCategory, moveCategory }) {
  const [name, setName] = useState("");
  function rename(oldName, newName) {
    const next = newName.trim();
    if (!next || next === oldName || state.categories[type].includes(next)) return;
    setState((prev) => ({
      ...prev,
      categories: { ...prev.categories, [type]: prev.categories[type].map((item) => item === oldName ? next : item) },
      records: prev.records.map((r) => r.type === type && r.category === oldName ? { ...r, category: next } : r),
      budgets: type === "expense" ? Object.fromEntries(Object.entries(prev.budgets).map(([k, v]) => [k === oldName ? next : k, v])) : prev.budgets,
    }));
  }

  return (
    <Card title={`✏️ ${title}`}>
      <div className="categoryList">
        {state.categories[type].map((cat, index) => (
          <div className="categoryRow" key={cat}>
            <div className="move"><button onClick={() => moveCategory(type, index, "up")}>↑</button><button onClick={() => moveCategory(type, index, "down")}>↓</button></div>
            <input defaultValue={cat} onBlur={(e) => rename(cat, e.target.value)} />
            <button className="delete" onClick={() => deleteCategory(type, cat)}>×</button>
          </div>
        ))}
      </div>
      <div className="addRow">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="新增區塊名稱" />
        <button className="primary" onClick={() => { addCategory(type, name); setName(""); }}>新增</button>
      </div>
    </Card>
  );
}
