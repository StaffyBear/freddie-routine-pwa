/**************************************************
 * Routine Tracker – app.js
 * Version: 2026-01-04-fixes-v2
 **************************************************/

const SITE_URL = "https://staffybear.github.io/freddie-routine-pwa/";
const SUPABASE_URL = "https://jjjombeomtbztzchiult.supabase.co";
const SUPABASE_KEY = "sb_publishable_6Le75u-UJnbGCZMbLQ8kQQ_9cFOsfIl";

const INVITE_CODE_REQUIRED = "1006";
const BACKDATED_TIME = "10:06";
const QUEUE_KEY = "offlineQueue_v1";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

let childId = null;
let selectedDateStr = null;

const viewStack = [];

window.addEventListener("error", (e) => console.error("JS ERROR:", e.error || e.message));
window.addEventListener("unhandledrejection", (e) => console.error("PROMISE ERROR:", e.reason));

/* ---------------- Helpers ---------------- */
function pad2(n) { return String(n).padStart(2, "0"); }
function yyyyMmDd(d = new Date()) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function parseDateStr(dateStr) { const [y,m,d] = dateStr.split("-").map(Number); return new Date(y, m-1, d, 12,0,0,0); }
function addDays(dateStr, delta) { const dt = parseDateStr(dateStr); dt.setDate(dt.getDate() + delta); return yyyyMmDd(dt); }
function isToday(dateStr) { return dateStr === yyyyMmDd(new Date()); }
function isFuture(dateStr) { return parseDateStr(dateStr).getTime() > parseDateStr(yyyyMmDd()).getTime(); }

function formatDateNice(dateStr) {
  const d = parseDateStr(dateStr);
  return d.toLocaleDateString([], { weekday:"short", day:"2-digit", month:"short", year:"numeric" });
}
function toIsoRangeForDate(dateStr) {
  const [y,m,d] = dateStr.split("-").map(Number);
  const start = new Date(y, m-1, d, 0,0,0,0).toISOString();
  const end   = new Date(y, m-1, d, 23,59,59,999).toISOString();
  return { start, end };
}
function hhmm(iso) { return new Date(iso).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }); }
function combineDateAndTime(dateStr, timeStr) {
  const [y,m,d] = dateStr.split("-").map(Number);
  const [hh,mm] = timeStr.split(":").map(Number);
  return new Date(y, m-1, d, hh, mm, 0, 0).toISOString();
}
function nowTimeStr() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function autoTimestampForSelectedDay(dateStr) {
  // Anything logged for a non-today date is stored at 10:06 so it's obvious it’s backdated.
  return isToday(dateStr) ? new Date().toISOString() : combineDateAndTime(dateStr, BACKDATED_TIME);
}

/* ---------------- Offline queue ---------------- */
function loadQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; } }
function saveQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }

function queueInsert(table, payload) {
  const q = loadQueue();
  q.push({ op:"insert", table, payload, queued_at:new Date().toISOString() });
  saveQueue(q);
  showOfflineBanner();
}

async function requireUser() {
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error("Not logged in.");
  return data.user;
}

async function flushQueue() {
  const q = loadQueue();
  if (!q.length) return;
  if (!navigator.onLine) return;

  const user = await requireUser().catch(() => null);
  if (!user) return;

  const remaining = [];
  for (const item of q) {
    try {
      if (item.op === "insert") {
        const res = await sb.from(item.table).insert(item.payload);
        if (res.error) throw res.error;
      }
    } catch (err) {
      console.error("Sync failed:", err);
      remaining.push(item);
    }
  }
  saveQueue(remaining);
  showOfflineBanner();
  await refreshVisible();
}

function showOfflineBanner() {
  const banner = $("offlineBanner");
  if (!banner) return;
  const q = loadQueue();

  if (!navigator.onLine) {
    banner.classList.remove("hidden");
    banner.textContent = `OFFLINE: Entries will be saved and synced later. Queued: ${q.length}`;
    return;
  }
  if (q.length) {
    banner.classList.remove("hidden");
    banner.textContent = `ONLINE: Syncing automatically when possible. Queued: ${q.length}`;
    return;
  }
  banner.classList.add("hidden");
}

window.addEventListener("online", () => { showOfflineBanner(); flushQueue(); });
window.addEventListener("offline", showOfflineBanner);

/* ---------------- Views + Android back ---------------- */
const VIEW_IDS = [
  "authView","resetView","menuView","adminView",
  "sleepView","mealsView","moodsView","medicationView","aiView","exportView"
];

function hideAllViews() {
  VIEW_IDS.forEach((id) => { const el = $(id); if (el) el.style.display = "none"; });
}
function getCurrentViewId() {
  for (const id of VIEW_IDS) {
    const el = $(id);
    if (el && el.style.display !== "none") return id;
  }
  return null;
}
function showView(id, pushHistory = true) {
  if (pushHistory) {
    const current = getCurrentViewId();
    if (current && current !== id) {
      viewStack.push(current);
      history.pushState({ view:id }, "", "#view=" + id);
    }
  }
  hideAllViews();
  $(id).style.display = "block";
  applyHistoricUI();
}
window.addEventListener("popstate", () => {
  const prev = viewStack.pop();
  if (prev) {
    hideAllViews();
    $(prev).style.display = "block";
    applyHistoricUI();
  }
});

/* ---------------- Date + Historic styling ---------------- */
function setHistoricCards(isHistoric, ids) {
  ids.forEach((id) => {
    const el = $(id);
    if (el) el.classList.toggle("historicCard", isHistoric);
  });
}

function applyHistoricUI() {
  if (!selectedDateStr) return;

  const historic = !isToday(selectedDateStr);
  const nice = formatDateNice(selectedDateStr);

  const pairs = [
    ["sleepDateLabel","sleepTopCard","sleepCard"],
    ["mealsDateLabel","mealsTopCard","mealsCard"],
    ["moodsDateLabel","moodsTopCard","moodCard"],
    ["medDateLabel","medTopCard","medCard"],
    ["aiDateLabel","aiTopCard","accidentTab","illnessTab"]
  ];

  for (const p of pairs) {
    const label = $(p[0]);
    if (label) {
      label.textContent = nice;
      label.classList.toggle("historicDate", historic);
    }
    setHistoricCards(historic, p.slice(1));
  }

  // hide time inputs on historic day for medication + A&I
  const medTime = $("medTime");
  const accTime = $("accTime");
  const illTime = $("illTime");
  if (medTime) medTime.style.display = historic ? "none" : "block";
  if (accTime) accTime.style.display = historic ? "none" : "block";
  if (illTime) illTime.style.display = historic ? "none" : "block";
}

async function setSelectedDate(dateStr, refresh = true) {
  if (!dateStr) dateStr = yyyyMmDd();
  if (isFuture(dateStr)) dateStr = yyyyMmDd(); // hard block future

  selectedDateStr = dateStr;

  // set pickers (and max)
  const today = yyyyMmDd();
  [
    "sleepDatePick","mealsDatePick","moodsDatePick","medDatePick","aiDatePick"
  ].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.max = today;
    el.value = selectedDateStr;
  });

  applyHistoricUI();
  if (refresh) await refreshVisible();
}

async function refreshVisible() {
  const current = getCurrentViewId();
  if (!childId) return;

  if (current === "sleepView") await loadSleep();
  if (current === "mealsView") await loadMeals();
  if (current === "moodsView") await loadMoods();
  if (current === "medicationView") await loadMedsAndDoses();
  if (current === "aiView") await Promise.all([loadAccidents(), loadIllnesses()]);
}

/* ---------------- AUTH ---------------- */
async function doRegister() {
  const email = $("email").value.trim();
  const password = $("password").value;
  const invite = $("inviteCode").value.trim();

  if (!email || !password) return ($("authMsg").textContent = "Enter BOTH email and password.");
  if (invite !== INVITE_CODE_REQUIRED) {
    return ($("authMsg").textContent = "Invite Code required to register.");
  }

  $("authMsg").textContent = "Registering…";
  const res = await sb.auth.signUp({ email, password, options: { emailRedirectTo: SITE_URL } });
  if (res.error) return ($("authMsg").textContent = res.error.message);
  $("authMsg").textContent = "Registered ✅ Now click Login (and confirm email if required).";
}

async function doLogin() {
  const email = $("email").value.trim();
  const password = $("password").value;
  if (!email || !password) return ($("authMsg").textContent = "Enter BOTH email and password.");

  $("authMsg").textContent = "Logging in…";
  const res = await sb.auth.signInWithPassword({ email, password });
  if (res.error) return ($("authMsg").textContent = res.error.message);

  $("authMsg").textContent = "";
  await goMenu();
  if (navigator.onLine) setTimeout(flushQueue, 500);
}

async function doForgotPassword() {
  const email = $("email").value.trim();
  if (!email) return ($("authMsg").textContent = "Enter your email first, then click Forgot password.");

  $("authMsg").textContent = "Sending password reset email…";
  const res = await sb.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL });
  if (res.error) return ($("authMsg").textContent = res.error.message);

  $("authMsg").textContent = "Reset email sent ✅ Check inbox/spam.";
}

function isRecoveryLink() { return (location.hash || "").includes("type=recovery"); }

async function setNewPassword() {
  const p1 = $("newPassword").value;
  const p2 = $("newPassword2").value;

  if (!p1 || p1.length < 6) return ($("resetMsg").textContent = "Password must be at least 6 characters.");
  if (p1 !== p2) return ($("resetMsg").textContent = "Passwords do not match.");

  $("resetMsg").textContent = "Updating password…";
  const res = await sb.auth.updateUser({ password: p1 });
  if (res.error) return ($("resetMsg").textContent = res.error.message);

  $("resetMsg").textContent = "Password updated ✅ Please login.";
  history.replaceState(null, "", location.pathname + location.search);
  await sb.auth.signOut();
  showView("authView", false);
}

/* ---------------- PWA install prompt ---------------- */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = $("btnInstallApp");
  if (btn) btn.style.display = "block";
});
async function promptInstall() {
  if (!deferredPrompt) {
    if ($("installMsg")) $("installMsg").textContent =
      "No install prompt available. Use Chrome menu (⋮) → Add to Home screen.";
    return;
  }
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if ($("installMsg")) $("installMsg").textContent = outcome === "accepted" ? "Installed ✅" : "Install cancelled.";
  deferredPrompt = null;
  $("btnInstallApp").style.display = "none";
}

/* ---------------- SW registration ---------------- */
async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    console.log("SW registered ✅");
  } catch (e) {
    console.warn("SW register failed:", e);
  }
}

/* ---------------- MENU + NAV ---------------- */
async function goMenu() {
  showView("menuView");
  showOfflineBanner();
}
function goAdmin() { showView("adminView"); }

/* ---------------- Children (shared dropdown) ---------------- */
async function loadChildrenIntoSelect(selectId) {
  const res = await sb.from("children").select("id,name").order("created_at", { ascending: true });
  const sel = $(selectId);
  if (!sel) return;

  if (res.error) {
    sel.innerHTML = `<option value="">Error loading children</option>`;
    return;
  }

  const children = res.data || [];
  sel.innerHTML = "";

  if (!children.length) {
    sel.innerHTML = `<option value="">No children yet (add in Admin)</option>`;
    childId = null;
    return;
  }

  const last = localStorage.getItem("activeChildId");
  const exists = children.find((c) => c.id === last);

  children.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });

  childId = exists ? exists.id : children[0].id;
  sel.value = childId;

  sel.onchange = async () => {
    childId = sel.value;
    localStorage.setItem("activeChildId", childId);
    await refreshVisible();
  };
}

async function addChildAdmin() {
  const name = $("childNameAdmin").value.trim();
  if (!name) return alert("Enter a child name.");
  const user = await requireUser();
  const payload = { name, user_id: user.id };

  if (!navigator.onLine) {
    queueInsert("children", payload);
    $("childNameAdmin").value = "";
    $("childAdminMsg").textContent = "Saved offline. Will sync when online.";
    return;
  }

  const res = await sb.from("children").insert(payload);
  if (res.error) return alert(res.error.message);

  $("childNameAdmin").value = "";
  $("childAdminMsg").textContent = "Child added ✅";
  await initAllChildDropdowns();
}

async function initAllChildDropdowns() {
  await Promise.all([
    loadChildrenIntoSelect("sleepChildSelect"),
    loadChildrenIntoSelect("mealsChildSelect"),
    loadChildrenIntoSelect("moodsChildSelect"),
    loadChildrenIntoSelect("medChildSelect"),
    loadChildrenIntoSelect("aiChildSelect")
  ]);
}

/* ---------------- Medication admin + dropdowns ---------------- */
async function addMedicationAdmin() {
  const name = $("newMedNameAdmin").value.trim();
  const default_unit = $("newMedUnitAdmin").value.trim() || null;
  if (!name) return alert("Enter medication name.");

  const user = await requireUser();
  const payload = { name, default_unit, user_id: user.id };

  if (!navigator.onLine) {
    queueInsert("medications", payload);
    $("newMedNameAdmin").value = "";
    $("newMedUnitAdmin").value = "";
    $("medAdminMsg").textContent = "Saved offline. Will sync when online.";
    return;
  }

  const res = await sb.from("medications").insert(payload);
  if (res.error) return alert(res.error.message);

  $("newMedNameAdmin").value = "";
  $("newMedUnitAdmin").value = "";
  $("medAdminMsg").textContent = "Medication added ✅";
  await loadMedicationDropdowns();
}

async function loadMedicationDropdowns() {
  const meds = await sb.from("medications").select("id,name,default_unit").order("name", { ascending: true });
  if (meds.error) return;

  const list = meds.data || [];

  const sel = $("medSelect");
  if (sel) {
    sel.innerHTML = "";
    list.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.default_unit ? `${m.name} (${m.default_unit})` : m.name;
      sel.appendChild(opt);
    });
  }

  const ill = $("illMedication");
  if (ill) {
    ill.innerHTML = `<option value="">None</option>`;
    list.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.default_unit ? `${m.name} (${m.default_unit})` : m.name;
      ill.appendChild(opt);
    });
  }
}

/* ---------------- Page openers ---------------- */
async function openSleep() {
  showView("sleepView");
  await setSelectedDate(selectedDateStr || yyyyMmDd());
  await initAllChildDropdowns();
  await loadSleep();
}
async function openMeals() {
  showView("mealsView");
  await setSelectedDate(selectedDateStr || yyyyMmDd());
  await initAllChildDropdowns();
  await loadMeals();
}
async function openMoods() {
  showView("moodsView");
  await setSelectedDate(selectedDateStr || yyyyMmDd());
  await initAllChildDropdowns();
  await loadMoods();
}
async function openMedication() {
  showView("medicationView");
  await setSelectedDate(selectedDateStr || yyyyMmDd());
  await initAllChildDropdowns();
  await loadMedicationDropdowns();
  if ($("medTime")) $("medTime").value = nowTimeStr();
  await loadMedsAndDoses();
}
async function openAI() {
  showView("aiView");
  await setSelectedDate(selectedDateStr || yyyyMmDd());
  await initAllChildDropdowns();
  await loadMedicationDropdowns();
  if ($("accTime")) $("accTime").value = nowTimeStr();
  if ($("illTime")) $("illTime").value = nowTimeStr();
  await Promise.all([loadAccidents(), loadIllnesses()]);
}

/* ---------------- Date controls (shared) ---------------- */
function wireDateControls(prefix, pickId) {
  const prev = $(`btn${prefix}PrevDay`);
  const next = $(`btn${prefix}NextDay`);
  const pick = $(pickId);

  if (pick) {
    pick.onchange = async () => {
      // ✅ "X" (clear) behaviour: if cleared, go to TODAY
      const v = pick.value;
      const today = yyyyMmDd();
      if (!v) {
        await setSelectedDate(today);
        return;
      }
      await setSelectedDate(isFuture(v) ? today : v);
    };
  }

  if (prev) prev.onclick = async () => { await setSelectedDate(addDays(selectedDateStr, -1)); };
  if (next) next.onclick = async () => {
    const candidate = addDays(selectedDateStr, +1);
    if (isFuture(candidate)) return; // block future
    await setSelectedDate(candidate);
  };
}

/* ---------------- Sleep ---------------- */
async function loadSleep() {
  if (!childId) return;
  const { start, end } = toIsoRangeForDate(selectedDateStr);

  const res = await sb.from("sleep_sessions")
    .select("*")
    .eq("child_id", childId)
    .gte("start_time", start)
    .lte("start_time", end)
    .order("start_time", { ascending: false });

  if (res.error) return;

  $("sleepList").innerHTML = "";
  let totalMs = 0;

  (res.data || []).forEach((s) => {
    const st = new Date(s.start_time);
    const et = s.end_time ? new Date(s.end_time) : null;
    if (et) totalMs += et - st;

    const li = document.createElement("li");
    li.textContent = `${hhmm(s.start_time)} → ${s.end_time ? hhmm(s.end_time) : "…"}${s.notes ? " • " + s.notes : ""}`;
    $("sleepList").appendChild(li);
  });

  $("sleepTotal").textContent = (totalMs / 3600000).toFixed(2) + "h";
}

async function sleepStart() {
  if (!childId) return alert("Select/add a child first.");
  if (!isToday(selectedDateStr)) return alert("Start/End buttons are for TODAY only.");
  if (!navigator.onLine) return alert("Sleep Start requires internet. Use manual entry while offline.");

  const user = await requireUser();
  const notes = $("sleepNote").value.trim() || null;

  const res = await sb.from("sleep_sessions").insert({
    child_id: childId,
    start_time: new Date().toISOString(),
    notes,
    user_id: user.id,
  });
  if (res.error) return alert(res.error.message);
  await loadSleep();
}

async function sleepEnd() {
  if (!childId) return alert("Select/add a child first.");
  if (!isToday(selectedDateStr)) return alert("Start/End buttons are for TODAY only.");
  if (!navigator.onLine) return alert("Sleep End requires internet. Use manual entry while offline.");

  const open = await sb.from("sleep_sessions")
    .select("id")
    .eq("child_id", childId)
    .is("end_time", null)
    .order("start_time", { ascending: false })
    .limit(1);

  if (open.error) return alert(open.error.message);
  if (!open.data?.length) return alert("No active sleep session found.");

  const res = await sb.from("sleep_sessions")
    .update({ end_time: new Date().toISOString() })
    .eq("id", open.data[0].id);

  if (res.error) return alert(res.error.message);
  await loadSleep();
}

async function addSleepManual() {
  if (!childId) return alert("Select/add a child first.");

  const startVal = $("sleepStartManual").value;
  const endVal = $("sleepEndManual").value;
  const notes = $("sleepNote").value.trim() || null;

  if (!startVal) return alert("Pick a manual sleep START time.");

  const startIso = new Date(startVal).toISOString();
  const endIso = endVal ? new Date(endVal).toISOString() : null;
  if (endIso && new Date(endIso) < new Date(startIso)) return alert("End time must be after start time.");

  const user = await requireUser();
  const payload = { child_id: childId, start_time: startIso, end_time: endIso, notes, user_id: user.id };

  if (!navigator.onLine) {
    queueInsert("sleep_sessions", payload);
    alert("Saved offline. Will sync when online.");
    $("sleepStartManual").value = "";
    $("sleepEndManual").value = "";
    return;
  }

  const res = await sb.from("sleep_sessions").insert(payload);
  if (res.error) return alert(res.error.message);

  $("sleepStartManual").value = "";
  $("sleepEndManual").value = "";
  await loadSleep();
}

/* ---------------- Meals ---------------- */
function getMealPercent(m) {
  // ✅ Fix "undefined%" – support different column names
  const pct = m.percent ?? m.percent_eaten ?? m.percentage ?? m.eaten_percent;
  if (pct === null || pct === undefined || pct === "") return null;
  const n = Number(pct);
  return Number.isFinite(n) ? n : null;
}

async function loadMeals() {
  if (!childId) return;
  const { start, end } = toIsoRangeForDate(selectedDateStr);

  const res = await sb.from("meals")
    .select("*")
    .eq("child_id", childId)
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: false });

  if (res.error) return;

  $("mealList").innerHTML = "";
  (res.data || []).forEach((m) => {
    const li = document.createElement("li");
    const pct = getMealPercent(m);
    const pctText = pct === null ? "" : ` • ${pct}%`;
    li.textContent = `${m.meal_type}${pctText} • ${m.food || ""}`.replace(/\s•\s$/, "").trim();
    $("mealList").appendChild(li);
  });
}

async function addMeal() {
  if (!childId) return alert("Select/add a child first.");
  const user = await requireUser();

  const meal_type = $("mealType").value;
  const percent = Number($("mealPercent").value || 0);
  const food = $("mealFood").value.trim() || null;
  const notes = $("mealNotes").value.trim() || null;

  // ✅ Important: items are stored under the SELECTED DAY (day it happened)
  const payload = {
    child_id: childId,
    user_id: user.id,
    meal_type,
    percent,
    food,
    notes,
    created_at: autoTimestampForSelectedDay(selectedDateStr),
  };

  if (!navigator.onLine) {
    queueInsert("meals", payload);
    alert("Saved offline. Will sync when online.");
    $("mealFood").value = "";
    $("mealNotes").value = "";
    return;
  }

  const res = await sb.from("meals").insert(payload);
  if (res.error) return alert(res.error.message);

  $("mealFood").value = "";
  $("mealNotes").value = "";
  await loadMeals();
}

/* ---------------- Moods ---------------- */
async function loadMoods() {
  if (!childId) return;
  const { start, end } = toIsoRangeForDate(selectedDateStr);

  const res = await sb.from("moods")
    .select("*")
    .eq("child_id", childId)
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: false });

  if (res.error) return;

  $("moodList").innerHTML = "";
  (res.data || []).forEach((m) => {
    const li = document.createElement("li");
    li.textContent = `${m.period}: ${m.mood}${m.notes ? " • " + m.notes : ""}`;
    $("moodList").appendChild(li);
  });
}

async function addMood() {
  if (!childId) return alert("Select/add a child first.");
  const user = await requireUser();

  const period = $("moodPeriod").value;
  const mood = $("moodValue").value;
  const notes = $("moodNotes").value.trim() || null;

  // ✅ Stored under selected day
  const payload = {
    child_id: childId,
    user_id: user.id,
    period,
    mood,
    notes,
    created_at: autoTimestampForSelectedDay(selectedDateStr),
  };

  if (!navigator.onLine) {
    queueInsert("moods", payload);
    alert("Saved offline. Will sync when online.");
    $("moodNotes").value = "";
    return;
  }

  const res = await sb.from("moods").insert(payload);
  if (res.error) return alert(res.error.message);

  $("moodNotes").value = "";
  await loadMoods();
}

/* ---------------- Medication doses ---------------- */
async function loadMedsAndDoses() {
  if (!childId) return;
  await loadMedicationDropdowns();

  const { start, end } = toIsoRangeForDate(selectedDateStr);

  const res = await sb.from("medication_doses")
    .select("*, medications(name, default_unit)")
    .eq("child_id", childId)
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: false });

  if (res.error) return;

  $("medList").innerHTML = "";
  (res.data || []).forEach((d) => {
    const li = document.createElement("li");
    const name = d.medications?.name || "Medication";
    li.textContent = isToday(selectedDateStr)
      ? `${hhmm(d.created_at)} • ${name} • ${d.dose || ""}`.trim()
      : `${name} • ${d.dose || ""}`.trim();
    $("medList").appendChild(li);
  });
}

async function addDose() {
  if (!childId) return alert("Select/add a child first.");
  const user = await requireUser();

  const medication_id = $("medSelect").value || null;
  if (!medication_id) return alert("Select a medication.");
  const dose = $("medDose").value.trim() || null;
  const notes = $("medNotes").value.trim() || null;

  const created_at = isToday(selectedDateStr)
    ? combineDateAndTime(selectedDateStr, ($("medTime").value || nowTimeStr()))
    : autoTimestampForSelectedDay(selectedDateStr);

  const payload = {
    child_id: childId,
    user_id: user.id,
    medication_id,
    dose,
    notes,
    created_at
  };

  if (!navigator.onLine) {
    queueInsert("medication_doses", payload);
    alert("Saved offline. Will sync when online.");
    $("medDose").value = "";
    $("medNotes").value = "";
    return;
  }

  const res = await sb.from("medication_doses").insert(payload);
  if (res.error) return alert(res.error.message);

  $("medDose").value = "";
  $("medNotes").value = "";
  await loadMedsAndDoses();
}

/* ---------------- Accident & Illness ---------------- */
function toggleAccIll(tab) {
  const acc = $("accidentTab");
  const ill = $("illnessTab");
  const bAcc = $("tabAccident");
  const bIll = $("tabIllness");

  if (tab === "acc") {
    acc.classList.remove("hidden");
    ill.classList.add("hidden");
    bAcc.classList.add("active");
    bIll.classList.remove("active");
  } else {
    ill.classList.remove("hidden");
    acc.classList.add("hidden");
    bIll.classList.add("active");
    bAcc.classList.remove("active");
  }
}

async function loadAccidents() {
  if (!childId) return;
  const { start, end } = toIsoRangeForDate(selectedDateStr);

  const res = await sb.from("accidents")
    .select("*")
    .eq("child_id", childId)
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: false });

  if (res.error) return;

  $("accidentList").innerHTML = "";
  (res.data || []).forEach((a) => {
    const li = document.createElement("li");
    li.textContent = `${a.injury_severity || ""} • ${a.body_area || ""} • ${a.where_happened || ""}`.trim();
    $("accidentList").appendChild(li);
  });
}

async function addAccident() {
  if (!childId) return alert("Select/add a child first.");
  const user = await requireUser();

  const what_happened = $("accWhat").value.trim();
  const injury_severity = $("accSeverity").value;
  const body_area = $("accBodyArea").value;
  const body_area_other = $("accBodyOther").value.trim() || null;
  const where_happened = $("accWhere").value.trim() || null;
  const reported_by = $("accReportedBy").value;
  const reported_by_other = $("accReportedOther").value.trim() || null;
  const action_taken = $("accAction").value.trim() || null;
  const safeguarding = $("accSafeguarding").value.trim() || null;
  const notes = $("accNotes").value.trim() || null;

  // ✅ IMPORTANT:
  // This ensures it shows under the day you SELECT (the day it happened),
  // not the day you happened to type it in.
  let time_of_incident = null;
  if (isToday(selectedDateStr)) time_of_incident = $("accTime").value || nowTimeStr();

  if (!what_happened) return alert("Please describe what happened.");
  if (body_area === "Other" && !body_area_other) return alert("Please fill 'Other body area'.");
  if (reported_by === "Other" && !reported_by_other) return alert("Please fill 'Reported by (other)'.");

  const payload = {
    child_id: childId,
    user_id: user.id,
    what_happened,
    injury_severity,
    body_area,
    body_area_other,
    where_happened,
    reported_by,
    reported_by_other,
    time_of_incident,
    action_taken,
    safeguarding,
    notes,
    created_at: autoTimestampForSelectedDay(selectedDateStr),
  };

  if (!navigator.onLine) {
    queueInsert("accidents", payload);
    alert("Saved offline. Will sync when online.");
    $("accWhat").value = "";
    $("accNotes").value = "";
    return;
  }

  const res = await sb.from("accidents").insert(payload);
  if (res.error) return alert(res.error.message);

  $("accWhat").value = "";
  $("accNotes").value = "";
  await loadAccidents();
}

async function loadIllnesses() {
  if (!childId) return;
  const { start, end } = toIsoRangeForDate(selectedDateStr);

  const res = await sb.from("illnesses")
    .select("*, medications(name)")
    .eq("child_id", childId)
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: false });

  if (res.error) return;

  $("illnessList").innerHTML = "";
  (res.data || []).forEach((i) => {
    const li = document.createElement("li");
    const med = i.medications?.name ? ` • ${i.medications.name}` : "";
    li.textContent = `${i.symptom}${i.temperature_c ? " • " + i.temperature_c + "°C" : ""}${med}`.trim();
    $("illnessList").appendChild(li);
  });
}

async function addIllness() {
  if (!childId) return alert("Select/add a child first.");
  const user = await requireUser();

  const symptom = $("illSymptom").value;
  const symptom_other = $("illSymptomOther").value.trim() || null;
  const temperature_c = $("illTemp").value.trim() ? Number($("illTemp").value.trim()) : null;
  const medication_id = $("illMedication").value || null;
  const reported_by = $("illReportedBy").value;
  const reported_by_other = $("illReportedOther").value.trim() || null;
  const notes = $("illNotes").value.trim() || null;

  // ✅ Stored under selected day
  let time_of_event = null;
  if (isToday(selectedDateStr)) time_of_event = $("illTime").value || nowTimeStr();

  if (symptom === "Other" && !symptom_other) return alert("Please fill 'Other symptom'.");
  if (reported_by === "Other" && !reported_by_other) return alert("Please fill 'Reported by (other)'.");

  const flag = $("illFlag");
  if (flag) flag.classList.toggle("hidden", symptom !== "Breathing difficulties");

  const payload = {
    child_id: childId,
    user_id: user.id,
    symptom,
    symptom_other,
    temperature_c,
    medication_id,
    reported_by,
    reported_by_other,
    time_of_event,
    notes,
    created_at: autoTimestampForSelectedDay(selectedDateStr),
  };

  if (!navigator.onLine) {
    queueInsert("illnesses", payload);
    alert("Saved offline. Will sync when online.");
    $("illNotes").value = "";
    return;
  }

  const res = await sb.from("illnesses").insert(payload);
  if (res.error) return alert(res.error.message);

  $("illNotes").value = "";
  await loadIllnesses();
}

/* ---------------- Bootstrap ---------------- */
function wireButtons() {
  // Auth
  $("btnLogin").onclick = doLogin;
  $("btnRegister").onclick = doRegister;
  $("btnForgotPassword").onclick = doForgotPassword;
  $("btnSetNewPassword").onclick = setNewPassword;
  $("btnBackToLogin").onclick = () => showView("authView", false);

  // Menu
  $("btnGoSleep").onclick = openSleep;
  $("btnGoMeals").onclick = openMeals;
  $("btnGoMoods").onclick = openMoods;
  $("btnGoMedication").onclick = openMedication;
  $("btnGoAI").onclick = openAI;
  $("btnGoExport").onclick = () => showView("exportView");
  $("btnExportBackToMenu").onclick = goMenu;
  $("btnGoAdmin").onclick = goAdmin;

  $("btnLogout").onclick = async () => {
    await sb.auth.signOut();
    showView("authView", false);
  };

  // Install
  const btnInstall = $("btnInstallApp");
  if (btnInstall) btnInstall.onclick = promptInstall;

  // Admin
  $("btnAdminBackToMenu").onclick = goMenu;
  $("btnAddChildAdmin").onclick = addChildAdmin;
  $("btnAddMedAdmin").onclick = addMedicationAdmin;

  // Back buttons
  $("btnSleepBackToMenu").onclick = goMenu;
  $("btnMealsBackToMenu").onclick = goMenu;
  $("btnMoodsBackToMenu").onclick = goMenu;
  $("btnMedBackToMenu").onclick = goMenu;
  $("btnAIBackToMenu").onclick = goMenu;

  // Sleep actions
  $("btnSleepStart").onclick = sleepStart;
  $("btnSleepEnd").onclick = sleepEnd;
  $("btnAddSleepManual").onclick = addSleepManual;

  // Meals/Moods/Med actions
  $("btnAddMeal").onclick = addMeal;
  $("btnAddMood").onclick = addMood;
  $("btnAddDose").onclick = addDose;

  // A&I
  $("tabAccident").onclick = () => toggleAccIll("acc");
  $("tabIllness").onclick = () => toggleAccIll("ill");
  $("btnAddAccident").onclick = addAccident;
  $("btnAddIllness").onclick = addIllness;

  // dynamic other fields
  $("accBodyArea").onchange = () => {
    const show = $("accBodyArea").value === "Other";
    $("accBodyOther").classList.toggle("hidden", !show);
  };
  $("accReportedBy").onchange = () => {
    const show = $("accReportedBy").value === "Other";
    $("accReportedOther").classList.toggle("hidden", !show);
  };
  $("illSymptom").onchange = () => {
    const show = $("illSymptom").value === "Other";
    $("illSymptomOther").classList.toggle("hidden", !show);
    const flag = $("illFlag");
    if (flag) flag.classList.toggle("hidden", $("illSymptom").value !== "Breathing difficulties");
  };
  $("illReportedBy").onchange = () => {
    const show = $("illReportedBy").value === "Other";
    $("illReportedOther").classList.toggle("hidden", !show);
  };

  // Date controls
  wireDateControls("Sleep","sleepDatePick");
  wireDateControls("Meals","mealsDatePick");
  wireDateControls("Moods","moodsDatePick");
  wireDateControls("Med","medDatePick");
  wireDateControls("AI","aiDatePick");
}

async function init() {
  await registerSW();
  wireButtons();

  selectedDateStr = yyyyMmDd();
  await setSelectedDate(selectedDateStr, false);

  if (isRecoveryLink()) {
    showView("resetView", false);
    return;
  }

  const { data } = await sb.auth.getSession();
  if (data?.session) {
    showView("menuView", false);
    showOfflineBanner();
    await initAllChildDropdowns();
    await loadMedicationDropdowns();
    if (navigator.onLine) setTimeout(flushQueue, 500);
  } else {
    showView("authView", false);
  }
}

init();
