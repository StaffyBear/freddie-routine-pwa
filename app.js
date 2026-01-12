/* Freddie Routine PWA - app.js (FULL REPLACEMENT)
   - Fixes login/register IDs
   - Fixes buttons not working
   - Fixes blank Summary page
   - 24-hour time everywhere
   - Sleep sessions spanning midnight are clipped to the selected day
*/

"use strict";

// -------------------- SUPABASE SETUP --------------------
const SUPABASE_URL = "https://wkocfgfqxblidxddfgxa.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indrb2NmZ2ZxeGJsaWR4ZGRmZ3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU4NDM4NTIsImV4cCI6MjA1MTQxOTg1Mn0.OgA6GI9H90yHeScuTJ2DsVQUl34eL4sRIyI1EkMm5Yo";

if (!window.supabase) {
  alert(
    "Supabase library failed to load. On mobile this is often due to an old cached Service Worker.\n\nFix: Chrome Android > Settings > Site settings > Storage > taffybear.github.io > Clear.\nThen reload."
  );
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// -------------------- HELPERS --------------------
const $ = (id) => document.getElementById(id);

function show(el) {
  if (el) el.classList.remove("hidden");
}
function hide(el) {
  if (el) el.classList.add("hidden");
}
function setText(id, txt) {
  const el = $(id);
  if (el) el.textContent = txt;
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fromDateStr(s) {
  // s = YYYY-MM-DD
  const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d);
}

function addDays(dateStr, delta) {
  const d = fromDateStr(dateStr);
  d.setDate(d.getDate() + delta);
  return toDateStr(d);
}

function isToday(dateStr) {
  return dateStr === toDateStr(new Date());
}

function dayBounds(dateStr) {
  const d = fromDateStr(dateStr);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { start, end };
}

function fmtDateLong(dateStr) {
  const d = fromDateStr(dateStr);
  // Example: Mon, 05 Jan 2026 (24hr doesn't matter here)
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function hhmm(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function durationHM(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function viewFromHash() {
  const hash = window.location.hash || "#authView";
  // hash formats: #sleepView  OR  #sleepView?date=YYYY-MM-DD
  const [view, query] = hash.replace("#", "").split("?");
  const params = new URLSearchParams(query || "");
  return { view, params };
}

function goto(viewId, dateStr) {
  if (dateStr) {
    window.location.hash = `#${viewId}?date=${encodeURIComponent(dateStr)}`;
  } else {
    window.location.hash = `#${viewId}`;
  }
}

// -------------------- APP STATE --------------------
let selectedDateStr = toDateStr(new Date());
let childId = null;

const VIEWS = [
  "authView",
  "menuView",
  "adminView",
  "childAdminView",
  "medAdminView",
  "sleepView",
  "mealsView",
  "moodsView",
  "medView",
  "aiView",
  "summaryView",
];

// -------------------- AUTH --------------------
async function requireUser() {
  const { data, error } = await sb.auth.getUser();
  if (error) return null;
  return data?.user || null;
}

async function doLogin() {
  const email = ($("email")?.value || "").trim();
  const password = ($("password")?.value || "").trim();

  if (!email || !password) return alert("Enter email and password.");

  const res = await sb.auth.signInWithPassword({ email, password });
  if (res.error) return alert(res.error.message);

  await afterLogin();
}

async function doRegister() {
  const email = ($("email")?.value || "").trim();
  const password = ($("password")?.value || "").trim();
  const invite = ($("inviteCode")?.value || "").trim();

  if (!email || !password) return alert("Enter email and password.");
  if (invite !== "1006") return alert("Invite code is required to register (1006).");

  const res = await sb.auth.signUp({ email, password });
  if (res.error) return alert(res.error.message);

  alert("Registered. If email confirmation is enabled, check your inbox. Then login.");
}

async function doForgot() {
  const email = ($("email")?.value || "").trim();
  if (!email) return alert("Enter your email first.");
  const res = await sb.auth.resetPasswordForEmail(email);
  if (res.error) return alert(res.error.message);
  alert("Password reset email sent (if the account exists).");
}

async function doLogout() {
  await sb.auth.signOut();
  childId = null;
  goto("authView");
}

// -------------------- CHILDREN / MEDS --------------------
async function loadChildrenIntoSelect(selectId) {
  const sel = $(selectId);
  if (!sel) return;

  const res = await sb.from("children").select("id,name").order("name", { ascending: true });
  if (res.error) {
    console.error(res.error);
    sel.innerHTML = `<option value="">(error loading children)</option>`;
    return;
  }

  sel.innerHTML = "";
  (res.data || []).forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });

  // keep selection if possible
  if (!childId && res.data?.length) childId = res.data[0].id;
  if (childId) sel.value = childId;
}

async function loadMedicationNames(selectId) {
  const sel = $(selectId);
  if (!sel) return;

  const res = await sb.from("medications").select("id,name,unit").order("name", { ascending: true });
  if (res.error) {
    console.error(res.error);
    sel.innerHTML = `<option value="">(error loading meds)</option>`;
    return;
  }

  sel.innerHTML = `<option value="">Select medication</option>`;
  (res.data || []).forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.unit ? `${m.name} (${m.unit})` : m.name;
    sel.appendChild(opt);
  });
}

// -------------------- ROUTER / VIEW DISPLAY --------------------
function hideAllViews() {
  VIEWS.forEach((v) => hide($(v)));
}

async function afterLogin() {
  await loadChildrenIntoSelect("menuChildSelect"); // if present
  goto("menuView");
}

async function showView() {
  const { view, params } = viewFromHash();

  hideAllViews();

  // date param
  const d = params.get("date");
  if (d) selectedDateStr = d;

  // If logged in?
  const user = await requireUser();

  if (!user) {
    show($("authView"));
    bindAuthButtonsOnce();
    return;
  }

  // Logged in
  if (!VIEWS.includes(view)) {
    goto("menuView");
    return;
  }

  const active = $(view);
  show(active);

  // bind global shared elements for views
  await bindView(view);
}

// -------------------- BIND BUTTONS (ONE TIME) --------------------
let authBound = false;
function bindAuthButtonsOnce() {
  if (authBound) return;
  authBound = true;

  $("btnLogin")?.addEventListener("click", (e) => {
    e.preventDefault();
    doLogin();
  });
  $("btnRegister")?.addEventListener("click", (e) => {
    e.preventDefault();
    doRegister();
  });
  $("btnForgot")?.addEventListener("click", (e) => {
    e.preventDefault();
    doForgot();
  });
}

let bound = false;
function bindGlobalButtonsOnce() {
  if (bound) return;
  bound = true;

  // Menu buttons
  $("btnMenuSleep")?.addEventListener("click", () => goto("sleepView", selectedDateStr));
  $("btnMenuMeals")?.addEventListener("click", () => goto("mealsView", selectedDateStr));
  $("btnMenuMoods")?.addEventListener("click", () => goto("moodsView", selectedDateStr));
  $("btnMenuMed")?.addEventListener("click", () => goto("medView", selectedDateStr));
  $("btnMenuAI")?.addEventListener("click", () => goto("aiView", selectedDateStr));
  $("btnMenuSummary")?.addEventListener("click", () => goto("summaryView", selectedDateStr));
  $("btnMenuExport")?.addEventListener("click", () => alert("Export will be added later."));
  $("btnMenuAdmin")?.addEventListener("click", () => goto("adminView"));
  $("btnLogout")?.addEventListener("click", () => doLogout());

  // Admin nav
  $("btnAdminChildren")?.addEventListener("click", () => goto("childAdminView"));
  $("btnAdminMeds")?.addEventListener("click", () => goto("medAdminView"));
  $("btnAdminBack")?.addEventListener("click", () => goto("menuView"));

  $("btnChildBack")?.addEventListener("click", () => goto("adminView"));
  $("btnMedAdminBack")?.addEventListener("click", () => goto("adminView"));

  // Back buttons on trackers
  $("sleepBack")?.addEventListener("click", () => goto("menuView"));
  $("mealsBack")?.addEventListener("click", () => goto("menuView"));
  $("moodsBack")?.addEventListener("click", () => goto("menuView"));
  $("medBack")?.addEventListener("click", () => goto("menuView"));
  $("aiBack")?.addEventListener("click", () => goto("menuView"));
  $("summaryBack")?.addEventListener("click", () => goto("menuView"));

  // Date nav
  // Sleep
  $("sleepPrev")?.addEventListener("click", () => goto("sleepView", addDays(selectedDateStr, -1)));
  $("sleepNext")?.addEventListener("click", () => goto("sleepView", addDays(selectedDateStr, +1)));
  $("sleepDate")?.addEventListener("change", (e) => goto("sleepView", e.target.value));

  // Meals
  $("mealsPrev")?.addEventListener("click", () => goto("mealsView", addDays(selectedDateStr, -1)));
  $("mealsNext")?.addEventListener("click", () => goto("mealsView", addDays(selectedDateStr, +1)));
  $("mealsDate")?.addEventListener("change", (e) => goto("mealsView", e.target.value));

  // Moods
  $("moodsPrev")?.addEventListener("click", () => goto("moodsView", addDays(selectedDateStr, -1)));
  $("moodsNext")?.addEventListener("click", () => goto("moodsView", addDays(selectedDateStr, +1)));
  $("moodsDate")?.addEventListener("change", (e) => goto("moodsView", e.target.value));

  // Med
  $("medPrev")?.addEventListener("click", () => goto("medView", addDays(selectedDateStr, -1)));
  $("medNext")?.addEventListener("click", () => goto("medView", addDays(selectedDateStr, +1)));
  $("medDate")?.addEventListener("change", (e) => goto("medView", e.target.value));

  // AI
  $("aiPrev")?.addEventListener("click", () => goto("aiView", addDays(selectedDateStr, -1)));
  $("aiNext")?.addEventListener("click", () => goto("aiView", addDays(selectedDateStr, +1)));
  $("aiDate")?.addEventListener("change", (e) => goto("aiView", e.target.value));

  // Summary
  $("summaryPrev")?.addEventListener("click", () => goto("summaryView", addDays(selectedDateStr, -1)));
  $("summaryNext")?.addEventListener("click", () => goto("summaryView", addDays(selectedDateStr, +1)));
  $("summaryDate")?.addEventListener("change", (e) => goto("summaryView", e.target.value));

  // Sleep actions
  $("sleepStartBtn")?.addEventListener("click", () => sleepStart());
  $("sleepEndBtn")?.addEventListener("click", () => sleepEnd());
  $("sleepSaveBtn")?.addEventListener("click", () => sleepManualSave());

  // Meals action
  $("mealSaveBtn")?.addEventListener("click", () => saveMeal());

  // Mood action
  $("moodSaveBtn")?.addEventListener("click", () => saveMood());

  // Medication action
  $("doseSaveBtn")?.addEventListener("click", () => saveDose());

  // AI pills
  $("tabAccident")?.addEventListener("click", () => setAITab("accident"));
  $("tabIllness")?.addEventListener("click", () => setAITab("illness"));

  // AI saves
  $("accSaveBtn")?.addEventListener("click", () => saveAccident());
  $("illSaveBtn")?.addEventListener("click", () => saveIllness());

  // Admin saves
  $("btnAddChild")?.addEventListener("click", () => addChild());
  $("btnSaveMedName")?.addEventListener("click", () => addMedicationName());
}

// -------------------- VIEW BIND / LOAD --------------------
async function bindView(view) {
  bindGlobalButtonsOnce();

  // put selected date into each date picker that exists
  const datePickers = ["sleepDate", "mealsDate", "moodsDate", "medDate", "aiDate", "summaryDate"];
  datePickers.forEach((id) => {
    const el = $(id);
    if (el) el.value = selectedDateStr;
  });

  // Child selects on each tracker
  const childSelectMap = {
    sleepView: "sleepChild",
    mealsView: "mealsChild",
    moodsView: "moodsChild",
    medView: "medChild",
    aiView: "aiChild",
    summaryView: "summaryChild",
  };

  const childSelectId = childSelectMap[view];
  if (childSelectId) {
    await loadChildrenIntoSelect(childSelectId);
    $(childSelectId)?.addEventListener("change", async (e) => {
      childId = e.target.value;
      await refreshView(view);
    });
  }

  // Special view loads
  await refreshView(view);
}

async function refreshView(view) {
  if (!childId) {
    // try load children
    const temp = await sb.from("children").select("id").limit(1);
    if (temp.data?.length) childId = temp.data[0].id;
  }

  if (view === "menuView") return;

  if (view === "childAdminView") return loadChildAdmin();
  if (view === "medAdminView") return loadMedAdmin();

  if (view === "sleepView") return loadSleep();
  if (view === "mealsView") return loadMeals();
  if (view === "moodsView") return loadMoods();
  if (view === "medView") return loadMed();
  if (view === "aiView") return loadAI();
  if (view === "summaryView") return loadSummary();
}

// -------------------- ADMIN --------------------
async function loadChildAdmin() {
  // simple list
  const list = $("childList");
  if (!list) return;

  const res = await sb.from("children").select("*").order("name", { ascending: true });
  if (res.error) return console.error(res.error);

  list.innerHTML = "";
  (res.data || []).forEach((c) => {
    const li = document.createElement("li");
    li.textContent = c.name;
    list.appendChild(li);
  });
}

async function addChild() {
  const name = ($("newChildName")?.value || "").trim();
  if (!name) return alert("Enter a child name.");

  const user = await requireUser();
  if (!user) return alert("Not signed in.");

  const res = await sb.from("children").insert({ name, user_id: user.id });
  if (res.error) return alert(res.error.message);

  $("newChildName").value = "";
  await loadChildAdmin();
}

async function loadMedAdmin() {
  const list = $("medNameList");
  if (!list) return;

  const res = await sb.from("medications").select("*").order("name", { ascending: true });
  if (res.error) return console.error(res.error);

  list.innerHTML = "";
  (res.data || []).forEach((m) => {
    const li = document.createElement("li");
    li.textContent = m.unit ? `${m.name} (${m.unit})` : m.name;
    list.appendChild(li);
  });
}

async function addMedicationName() {
  const name = ($("newMedName")?.value || "").trim();
  const unit = ($("newMedUnit")?.value || "").trim() || null;
  if (!name) return alert("Enter a medication name.");

  const user = await requireUser();
  if (!user) return alert("Not signed in.");

  const res = await sb.from("medications").insert({ name, unit, user_id: user.id });
  if (res.error) return alert(res.error.message);

  $("newMedName").value = "";
  $("newMedUnit").value = "";
  await loadMedAdmin();
}

// -------------------- SLEEP --------------------
async function loadSleep() {
  setText("sleepTitleDate", fmtDateLong(selectedDateStr));

  const list = $("sleepList");
  const totalEl = $("sleepTotal");
  if (list) list.innerHTML = "";
  if (totalEl) totalEl.textContent = "0h 00m";

  if (!childId) return;

  const { start, end } = dayBounds(selectedDateStr);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // sessions that overlap day:
  // start_time < endOfDay AND (end_time is null OR end_time > startOfDay)
  const res = await sb
    .from("sleep_sessions")
    .select("*")
    .eq("child_id", childId)
    .lt("start_time", endIso)
    .or(`end_time.is.null,end_time.gt.${startIso}`)
    .order("start_time", { ascending: false });

  if (res.error) {
    console.error(res.error);
    return;
  }

  let totalMs = 0;
  const now = new Date();

  (res.data || []).forEach((s) => {
    const st = new Date(s.start_time);
    const rawEnd = s.end_time ? new Date(s.end_time) : null;

    // clip to selected day
    const clipStart = st < start ? start : st;

    let effectiveEnd = rawEnd;
    if (!effectiveEnd) {
      // open session:
      // if selected day is today, use now; otherwise clip to end of that day
      effectiveEnd = isToday(selectedDateStr) ? now : end;
    }
    const clipEnd = effectiveEnd > end ? end : effectiveEnd;

    // compute total only if clipEnd after clipStart
    if (clipEnd > clipStart) totalMs += clipEnd - clipStart;

    // display clipped times if crossing day
    const displayStart = hhmm(clipStart);
    const displayEnd = s.end_time ? hhmm(clipEnd) : "…";

    const li = document.createElement("li");
    li.textContent = `${displayStart} → ${displayEnd}${s.notes ? " • " + s.notes : ""}`;
    list?.appendChild(li);
  });

  if (totalEl) totalEl.textContent = durationHM(totalMs);
}

async function sleepStart() {
  if (!isToday(selectedDateStr)) return alert("Start/End buttons are for TODAY only.");
  const user = await requireUser();
  if (!user) return alert("Not signed in.");

  const notes = ($("sleepNotes")?.value || "").trim() || null;

  const res = await sb.from("sleep_sessions").insert({
    child_id: childId,
    start_time: new Date().toISOString(),
    end_time: null,
    notes,
    user_id: user.id,
  });

  if (res.error) return alert(res.error.message);
  await loadSleep();
}

async function sleepEnd() {
  if (!isToday(selectedDateStr)) return alert("Start/End buttons are for TODAY only.");
  const user = await requireUser();
  if (!user) return alert("Not signed in.");

  // find most recent open sleep
  const open = await sb
    .from("sleep_sessions")
    .select("id,start_time")
    .eq("child_id", childId)
    .is("end_time", null)
    .order("start_time", { ascending: false })
    .limit(1);

  if (open.error) return alert(open.error.message);
  if (!open.data?.length) return alert("No active sleep session found to end.");

  const res = await sb
    .from("sleep_sessions")
    .update({ end_time: new Date().toISOString() })
    .eq("id", open.data[0].id);

  if (res.error) return alert(res.error.message);
  await loadSleep();
}

async function sleepManualSave() {
  // Allows:
  // - start only (creates open session)
  // - start + end (creates closed session)
  // - end only (ends latest open session)
  const startVal = $("sleepStartManual")?.value || "";
  const endVal = $("sleepEndManual")?.value || "";
  const notes = ($("sleepNotes")?.value || "").trim() || null;

  const user = await requireUser();
  if (!user) return alert("Not signed in.");

  // end-only => close open session
  if (!startVal && endVal) {
    const open = await sb
      .from("sleep_sessions")
      .select("id,start_time")
      .eq("child_id", childId)
      .is("end_time", null)
      .order("start_time", { ascending: false })
      .limit(1);

    if (open.error) return alert(open.error.message);
    if (!open.data?.length) return alert("No active sleep session found to set an end time.");

    const endIso = new Date(endVal).toISOString();
    const res = await sb
      .from("sleep_sessions")
      .update({ end_time: endIso, notes })
      .eq("id", open.data[0].id);

    if (res.error) return alert(res.error.message);

    $("sleepEndManual").value = "";
    await loadSleep();
    return;
  }

  if (!startVal) return alert("Pick a manual START time (or set an end time to close an open sleep).");

  const startIso = new Date(startVal).toISOString();
  const endIso = endVal ? new Date(endVal).toISOString() : null;

  if (endIso && new Date(endIso) < new Date(startIso)) return alert("End must be after Start.");

  const payload = {
    child_id: childId,
    start_time: startIso,
    end_time: endIso,
    notes,
    user_id: user.id,
  };

  const res = await sb.from("sleep_sessions").insert(payload);
  if (res.error) return alert(res.error.message);

  $("sleepStartManual").value = "";
  $("sleepEndManual").value = "";
  await loadSleep();
}

// -------------------- MEALS --------------------
async function loadMeals() {
  setText("mealsTitleDate", fmtDateLong(selectedDateStr));

  await loadChildrenIntoSelect("mealsChild");

  const list = $("mealList");
  if (list) list.innerHTML = "";

  if (!childId) return;

  const { start, end } = dayBounds(selectedDateStr);
  const res = await sb
    .from("meals")
    .select("*")
    .eq("child_id", childId)
    .gte("meal_time", start.toISOString())
    .lte("meal_time", end.toISOString())
    .order("meal_time", { ascending: false });

  if (res.error) {
    console.error(res.error);
    return;
  }

  (res.data || []).forEach((m) => {
    const li = document.createElement("li");
    const pct = (m.percent ?? m.amount_percent ?? m.percentage ?? null);
    const pctTxt = pct !== null && pct !== undefined ? `${pct}%` : "";
    li.textContent = `${hhmm(m.meal_time)} • ${m.meal_type || "Meal"} ${pctTxt} • ${m.food || ""}${m.notes ? " • " + m.notes : ""}`.trim();
    list?.appendChild(li);
  });
}

async function saveMeal() {
  const user = await requireUser();
  if (!user) return alert("Not signed in.");

  const mealType = ($("mealType")?.value || "").trim() || null;
  const pct = $("mealPercent")?.value || null;
  const food = ($("mealFood")?.value || "").trim() || null;
  const notes = ($("mealNotes")?.value || "").trim() || null;

  const timeStr = $("mealTime")?.value || ""; // datetime-local preferred
  const when = timeStr ? new Date(timeStr) : new Date(fromDateStr(selectedDateStr).getTime() + 12 * 3600000);
  const mealIso = when.toISOString();

  const res = await sb.from("meals").insert({
    child_id: childId,
    meal_time: mealIso,
    meal_type: mealType,
    percent: pct ? parseInt(pct, 10) : null,
    food,
    notes,
    user_id: user.id,
  });

  if (res.error) return alert(res.error.message);

  if ($("mealFood")) $("mealFood").value = "";
  if ($("mealNotes")) $("mealNotes").value = "";
  await loadMeals();
}

// -------------------- MOODS --------------------
async function loadMoods() {
  setText("moodsTitleDate", fmtDateLong(selectedDateStr));
  await loadChildrenIntoSelect("moodsChild");

  const list = $("moodList");
  if (list) list.innerHTML = "";

  if (!childId) return;

  const { start, end } = dayBounds(selectedDateStr);
  const res = await sb
    .from("mood_logs")
    .select("*")
    .eq("child_id", childId)
    .gte("logged_at", start.toISOString())
    .lte("logged_at", end.toISOString())
    .order("logged_at", { ascending: false });

  if (res.error) return console.error(res.error);

  (res.data || []).forEach((m) => {
    const li = document.createElement("li");
    li.textContent = `${hhmm(m.logged_at)} • ${m.period || ""} ${m.mood || ""}${m.notes ? " • " + m.notes : ""}`.trim();
    list?.appendChild(li);
  });
}

async function saveMood() {
  const user = await requireUser();
  if (!user) return alert("Not signed in.");

  const period = ($("moodPeriod")?.value || "").trim() || null;
  const mood = ($("moodValue")?.value || "").trim() || null;
  const notes = ($("moodNotes")?.value || "").trim() || null;

  const timeStr = $("moodTime")?.value || "";
  const when = timeStr ? new Date(timeStr) : new Date();
  const res = await sb.from("mood_logs").insert({
    child_id: childId,
    logged_at: when.toISOString(),
    period,
    mood,
    notes,
    user_id: user.id,
  });

  if (res.error) return alert(res.error.message);

  if ($("moodNotes")) $("moodNotes").value = "";
  await loadMoods();
}

// -------------------- MEDICATION DOSES --------------------
async function loadMed() {
  setText("medTitleDate", fmtDateLong(selectedDateStr));
  await loadChildrenIntoSelect("medChild");
  await loadMedicationNames("doseMed");

  const list = $("doseList");
  if (list) list.innerHTML = "";

  if (!childId) return;

  const { start, end } = dayBounds(selectedDateStr);
  const res = await sb
    .from("medication_doses")
    .select("*, medications(name,unit)")
    .eq("child_id", childId)
    .gte("taken_at", start.toISOString())
    .lte("taken_at", end.toISOString())
    .order("taken_at", { ascending: false });

  if (res.error) return console.error(res.error);

  (res.data || []).forEach((d) => {
    const li = document.createElement("li");
    const medName = d.medications?.name || "Medication";
    const unit = d.medications?.unit ? ` ${d.medications.unit}` : "";
    li.textContent = `${hhmm(d.taken_at)} • ${medName} • ${d.dose ?? ""}${unit}${d.notes ? " • " + d.notes : ""}`.trim();
    list?.appendChild(li);
  });
}

async function saveDose() {
  const user = await requireUser();
  if (!user) return alert("Not signed in.");

  const medId = $("doseMed")?.value || "";
  const dose = ($("doseAmount")?.value || "").trim();
  const notes = ($("doseNotes")?.value || "").trim() || null;

  if (!medId) return alert("Select a medication.");
  if (!dose) return alert("Enter a dose amount.");

  const timeStr = $("doseTime")?.value || "";
  const when = timeStr ? new Date(timeStr) : new Date();
  const res = await sb.from("medication_doses").insert({
    child_id: childId,
    medication_id: medId,
    taken_at: when.toISOString(),
    dose,
    notes,
    user_id: user.id,
  });

  if (res.error) return alert(res.error.message);

  if ($("doseAmount")) $("doseAmount").value = "";
  if ($("doseNotes")) $("doseNotes").value = "";
  await loadMed();
}

// -------------------- ACCIDENT & ILLNESS --------------------
let aiTab = "accident";
function setAITab(tab) {
  aiTab = tab;

  const a = $("tabAccident");
  const i = $("tabIllness");
  if (a && i) {
    a.classList.toggle("active", tab === "accident");
    i.classList.toggle("active", tab === "illness");
  }

  if ($("accidentPanel")) $("accidentPanel").classList.toggle("hidden", tab !== "accident");
  if ($("illnessPanel")) $("illnessPanel").classList.toggle("hidden", tab !== "illness");
}

async function loadAI() {
  setText("aiTitleDate", fmtDateLong(selectedDateStr));
  await loadChildrenIntoSelect("aiChild");
  setAITab(aiTab);

  await loadAccidents();
  await loadIllnesses();
}

async function loadAccidents() {
  const list = $("accList");
  if (list) list.innerHTML = "";
  if (!childId) return;

  const { start, end } = dayBounds(selectedDateStr);
  const res = await sb
    .from("accidents")
    .select("*")
    .eq("child_id", childId)
    .gte("incident_time", start.toISOString())
    .lte("incident_time", end.toISOString())
    .order("incident_time", { ascending: false });

  if (res.error) return console.error(res.error);

  (res.data || []).forEach((a) => {
    const li = document.createElement("li");
    li.textContent = `${hhmm(a.incident_time)} • ${a.severity || ""} • ${a.body_area || ""}${a.notes ? " • " + a.notes : ""}`.trim();
    list?.appendChild(li);
  });
}

async function loadIllnesses() {
  const list = $("illList");
  if (list) list.innerHTML = "";
  if (!childId) return;

  const { start, end } = dayBounds(selectedDateStr);
  const res = await sb
    .from("illnesses")
    .select("*")
    .eq("child_id", childId)
    .gte("event_time", start.toISOString())
    .lte("event_time", end.toISOString())
    .order("event_time", { ascending: false });

  if (res.error) return console.error(res.error);

  (res.data || []).forEach((i) => {
    const li = document.createElement("li");
    li.textContent = `${hhmm(i.event_time)} • ${i.symptom || ""}${i.notes ? " • " + i.notes : ""}`.trim();
    list?.appendChild(li);
  });
}

async function saveAccident() {
  const user = await requireUser();
  if (!user) return alert("Not signed in.");

  const happened = ($("accWhat")?.value || "").trim() || null;
  const severity = ($("accSeverity")?.value || "").trim() || null;
  const area = ($("accArea")?.value || "").trim() || null;
  const where = ($("accWhere")?.value || "").trim() || null;
  const reported = ($("accReportedBy")?.value || "").trim() || null;
  const action = ($("accAction")?.value || "").trim() || null;
  const safe = ($("accSafeguard")?.value || "").trim() || null;
  const notes = ($("accNotes")?.value || "").trim() || null;

  const timeStr = $("accTime")?.value || "";
  const when = timeStr ? new Date(timeStr) : new Date();
  const res = await sb.from("accidents").insert({
    child_id: childId,
    incident_time: when.toISOString(),
    happened,
    severity,
    body_area: area,
    location: where,
    reported_by: reported,
    action_taken: action,
    safeguarding: safe,
    notes,
    user_id: user.id,
  });

  if (res.error) return alert(res.error.message);

  if ($("accNotes")) $("accNotes").value = "";
  await loadAccidents();
}

async function saveIllness() {
  const user = await requireUser();
  if (!user) return alert("Not signed in.");

  const symptom = ($("illSymptom")?.value || "").trim() || null;
  const temp = ($("illTemp")?.value || "").trim() || null;
  const medLink = ($("illMedLink")?.value || "").trim() || null;
  const reported = ($("illReportedBy")?.value || "").trim() || null;
  const notes = ($("illNotes")?.value || "").trim() || null;

  const timeStr = $("illTime")?.value || "";
  const when = timeStr ? new Date(timeStr) : new Date();
  const res = await sb.from("illnesses").insert({
    child_id: childId,
    event_time: when.toISOString(),
    symptom,
    temperature_c: temp,
    medication_link: medLink,
    reported_by: reported,
    notes,
    user_id: user.id,
  });

  if (res.error) return alert(res.error.message);

  if ($("illNotes")) $("illNotes").value = "";
  await loadIllnesses();
}

// -------------------- SUMMARY --------------------
async function loadSummary() {
  setText("summaryTitleDate", fmtDateLong(selectedDateStr));
  await loadChildrenIntoSelect("summaryChild");

  const wrap = $("summaryCards");
  if (!wrap) return;
  wrap.innerHTML = "";

  if (!childId) {
    wrap.innerHTML = `<div class="muted">No child selected.</div>`;
    return;
  }

  // Build summary cards
  const cards = [];

  // Sleep
  const sleepTotal = await getSleepTotalForDay();
  cards.push(makeSummaryCard("Sleep", sleepTotal || "0h 00m", "sleepView"));

  // Meals count
  const mealsCount = await countTableForDay("meals", "meal_time");
  cards.push(makeSummaryCard("Meals", `${mealsCount} entries`, "mealsView"));

  // Moods count
  const moodCount = await countTableForDay("mood_logs", "logged_at");
  cards.push(makeSummaryCard("Moods", `${moodCount} entries`, "moodsView"));

  // Med doses count
  const medCount = await countTableForDay("medication_doses", "taken_at");
  cards.push(makeSummaryCard("Medication", `${medCount} entries`, "medView"));

  // AI count
  const accCount = await countTableForDay("accidents", "incident_time");
  const illCount = await countTableForDay("illnesses", "event_time");
  cards.push(makeSummaryCard("Accidents & Illness", `${accCount} accidents • ${illCount} illnesses`, "aiView"));

  cards.forEach((c) => wrap.appendChild(c));

  // Also: list of clickable events
  const events = await buildEventLinksForDay();
  if (events.length) {
    const card = document.createElement("div");
    card.className = "card stack";
    const h = document.createElement("h2");
    h.textContent = "Events";
    card.appendChild(h);

    const ul = document.createElement("ul");
    events.forEach((e) => {
      const li = document.createElement("li");
      const a = document.createElement("button");
      a.className = "secondary miniBtn";
      a.style.width = "100%";
      a.textContent = `${e.label}`;
      a.addEventListener("click", () => goto(e.view, e.date));
      li.appendChild(a);
      ul.appendChild(li);
    });
    card.appendChild(ul);
    wrap.appendChild(card);
  }
}

function makeSummaryCard(title, subtitle, view) {
  const card = document.createElement("div");
  card.className = "card stack";
  const h = document.createElement("h2");
  h.textContent = title;

  const p = document.createElement("div");
  p.className = "muted";
  p.textContent = subtitle;

  const btn = document.createElement("button");
  btn.textContent = "Open";
  btn.addEventListener("click", () => goto(view, selectedDateStr));

  card.appendChild(h);
  card.appendChild(p);
  card.appendChild(btn);
  return card;
}

async function countTableForDay(table, timeCol) {
  const { start, end } = dayBounds(selectedDateStr);
  const res = await sb
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("child_id", childId)
    .gte(timeCol, start.toISOString())
    .lte(timeCol, end.toISOString());

  if (res.error) {
    console.error(res.error);
    return 0;
  }
  return res.count || 0;
}

async function getSleepTotalForDay() {
  const { start, end } = dayBounds(selectedDateStr);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const res = await sb
    .from("sleep_sessions")
    .select("*")
    .eq("child_id", childId)
    .lt("start_time", endIso)
    .or(`end_time.is.null,end_time.gt.${startIso}`)
    .order("start_time", { ascending: false });

  if (res.error) {
    console.error(res.error);
    return "0h 00m";
  }

  const now = new Date();
  let totalMs = 0;

  (res.data || []).forEach((s) => {
    const st = new Date(s.start_time);
    const rawEnd = s.end_time ? new Date(s.end_time) : null;

    const clipStart = st < start ? start : st;
    let effectiveEnd = rawEnd;
    if (!effectiveEnd) effectiveEnd = isToday(selectedDateStr) ? now : end;
    const clipEnd = effectiveEnd > end ? end : effectiveEnd;

    if (clipEnd > clipStart) totalMs += clipEnd - clipStart;
  });

  return durationHM(totalMs);
}

async function buildEventLinksForDay() {
  const events = [];
  const { start, end } = dayBounds(selectedDateStr);

  // Accidents
  const acc = await sb
    .from("accidents")
    .select("incident_time,severity,body_area")
    .eq("child_id", childId)
    .gte("incident_time", start.toISOString())
    .lte("incident_time", end.toISOString())
    .order("incident_time", { ascending: false });

  if (!acc.error) {
    (acc.data || []).forEach((a) => {
      events.push({
        view: "aiView",
        date: selectedDateStr,
        label: `Accident • ${hhmm(a.incident_time)} • ${a.severity || ""} ${a.body_area || ""}`.trim(),
      });
    });
  }

  // Illness
  const ill = await sb
    .from("illnesses")
    .select("event_time,symptom")
    .eq("child_id", childId)
    .gte("event_time", start.toISOString())
    .lte("event_time", end.toISOString())
    .order("event_time", { ascending: false });

  if (!ill.error) {
    (ill.data || []).forEach((i) => {
      events.push({
        view: "aiView",
        date: selectedDateStr,
        label: `Illness • ${hhmm(i.event_time)} • ${i.symptom || ""}`.trim(),
      });
    });
  }

  return events;
}

// -------------------- STARTUP --------------------
window.addEventListener("hashchange", showView);

(async function init() {
  // default route if none
  if (!window.location.hash) window.location.hash = "#authView";

  // try session
  const user = await requireUser();
  if (user) {
    // if already logged in, go menu unless specific view
    const { view } = viewFromHash();
    if (view === "authView") goto("menuView");
  }

  await showView();
})();
