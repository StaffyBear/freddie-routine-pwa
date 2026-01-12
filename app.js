/* ==========================
   Routine Tracker - app.js
   Full replacement
   ========================== */

/* global supabase */

const SITE_URL = "https://staffybear.github.io/freddie-routine-pwa/";
const SUPABASE_URL = "https://jjjombeomtbztzchiult.supabase.co";
const SUPABASE_KEY = "sb_publishable_6Le75u-UJnbGCZMbLQ8kQQ_9cFOsfIl";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqam9tYmVvbXRienR6Y2hpdWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNzk5MTgsImV4cCI6MjA4Mjk1NTkxOH0.28ADFdTW2YKOMrp7klwbpRjKbSLIR7URaij_AmIqNOE";


const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const INVITE_CODE = "1006";

// Views in the app
const VIEWS = [
  "authView",
  "resetView",
  "menuView",
  "adminView",
  "adminChildView",
  "adminMedView",
  "sleepView",
  "mealsView",
  "moodsView",
  "medView",
  "aiView",
  "summaryView", // ✅ IMPORTANT
];

// App state
let childId = null;
let activeView = "authView";
let selectedDateStr = todayStr();

// ---------- helpers ----------
function $(id) {
  return document.getElementById(id);
}

function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isToday(dateStr) {
  return dateStr === todayStr();
}

function toIsoRangeForDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const start = new Date(d);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function hhmm(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

function formatPickerLabel(dateStr) {
  // For displaying weekday in UI if needed
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

// ---------- view navigation ----------
function hideAllViews() {
  VIEWS.forEach((v) => {
    const el = $(v);
    if (el) el.classList.add("hidden");
  });
}

function showView(viewId, pushState = true) {
  hideAllViews();
  const el = $(viewId);
  if (el) el.classList.remove("hidden");

  activeView = viewId;

  if (pushState) {
    history.pushState({ view: viewId }, "", `#${viewId}`);
  }
}

// Open a page from menu (always jump to today)
function openPage(viewId, after) {
  return async () => {
    setDate(todayStr()); // ✅ ALWAYS go to today when opening a page from menu
    showView(viewId);
    if (after) await after();
    await refreshVisible();
  };
}

// ---------- date bar wiring ----------
function wireDateBar(prefix) {
  const prev = $(`${prefix}Prev`);
  const next = $(`${prefix}Next`);
  const picker = $(`${prefix}DatePicker`);
  const dateText = $(`${prefix}DateText`);

  if (!prev || !next || !picker || !dateText) return;

  const update = () => {
    picker.value = selectedDateStr;
    // show weekday + date on the one line (if displayed)
    dateText.textContent = formatPickerLabel(selectedDateStr);
    dateText.classList.toggle("historicDate", !isToday(selectedDateStr));
  };

  prev.onclick = async () => {
    const d = new Date(selectedDateStr + "T00:00:00");
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().slice(0, 10));
    update();
    await refreshVisible();
  };

  next.onclick = async () => {
    const d = new Date(selectedDateStr + "T00:00:00");
    d.setDate(d.getDate() + 1);
    setDate(d.toISOString().slice(0, 10));
    update();
    await refreshVisible();
  };

  picker.onchange = async () => {
    if (!picker.value) return;
    setDate(picker.value);
    update();
    await refreshVisible();
  };

  update();
}

function setDate(dateStr) {
  selectedDateStr = dateStr;

  // Sync any visible date pickers
  const pickers = [
    $("sleepDatePicker"),
    $("mealsDatePicker"),
    $("moodsDatePicker"),
    $("medDatePicker"),
    $("aiDatePicker"),
    $("summaryDatePicker"),
  ].filter(Boolean);

  pickers.forEach((p) => (p.value = selectedDateStr));

  // Disable NEXT buttons if today
  const nextButtons = [
    $("sleepNext"),
    $("mealsNext"),
    $("moodsNext"),
    $("medNext"),
    $("aiNext"),
    $("summaryNext"),
  ].filter(Boolean);

  nextButtons.forEach((b) => (b.disabled = isToday(selectedDateStr)));
}

// ---------- auth helpers ----------
async function requireUser() {
  const { data, error } = await sb.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error("No user session.");
  return data.user;
}

function isRecoveryLink() {
  const h = location.hash || "";
  return h.includes("type=recovery");
}

async function doLogin() {
  const email = ($("email")?.value || "").trim();
  const password = ($("password")?.value || "").trim();

  if (!email || !password) return alert("Enter email and password.");

  try {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return alert(error.message);

    showView("menuView");
  } catch (e) {
    alert(e.message || "Login failed.");
  }
}

async function doRegister() {
  const email = ($("email")?.value || "").trim();
  const password = ($("password")?.value || "").trim();
  const invite = ($("invite")?.value || "").trim();

  if (!email || !password) return alert("Enter email and password.");
  if (invite !== INVITE_CODE) return alert("Invite code is required to register.");

  const { error } = await sb.auth.signUp({ email, password });
  if (error) return alert(error.message);
  alert("Registered. Please log in.");
}

async function doLogout() {
  await sb.auth.signOut();
  childId = null;
  showView("authView");
}

async function doForgot() {
  const email = ($("email")?.value || "").trim();
  if (!email) return alert("Enter email.");
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname + "#resetView",
  });
  if (error) return alert(error.message);
  alert("Password reset email sent.");
}

async function doResetPassword() {
  const pass = ($("newPassword")?.value || "").trim();
  if (!pass) return alert("Enter a new password.");
  const { error } = await sb.auth.updateUser({ password: pass });
  if (error) return alert(error.message);
  alert("Password updated. Please log in.");
  showView("authView");
}

// ---------- common data ----------
async function fillChildSelect(selectId) {
  const sel = $(selectId);
  if (!sel) return;

  const res = await sb.from("children").select("*").order("name", { ascending: true });
  if (res.error) {
    console.error(res.error);
    return;
  }

  sel.innerHTML = "";
  (res.data || []).forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });

  if (!childId && res.data?.length) childId = res.data[0].id;
  sel.value = childId || "";

  sel.onchange = async () => {
    childId = sel.value || null;
    await refreshVisible();
  };
}

async function fillMedSelect(selectId) {
  const sel = $(selectId);
  if (!sel) return;

  const res = await sb.from("medications").select("*").order("name", { ascending: true });
  if (res.error) {
    console.error(res.error);
    return;
  }

  sel.innerHTML = "";
  (res.data || []).forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.name;
    opt.textContent = `${m.name}${m.unit ? ` (${m.unit})` : ""}`;
    sel.appendChild(opt);
  });
}

// ---------- sleep ----------
async function loadSleep() {
  if (!childId) return;

  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb
    .from("sleep_sessions")
    .select("*")
    .eq("child_id", childId)
    .gte("start_time", start)
    .lte("start_time", end)
    .order("start_time", { ascending: false });

  if (res.error) {
    console.error(res.error);
    return;
  }

  const list = $("sleepList");
  if (!list) return;

  list.innerHTML = "";
  let totalMs = 0;

  (res.data || []).forEach((s) => {
    const st = new Date(s.start_time);
    const et = s.end_time ? new Date(s.end_time) : null;
    if (et) totalMs += et - st;

    const li = document.createElement("li");
    li.textContent = `${hhmm(s.start_time)} → ${s.end_time ? hhmm(s.end_time) : "…"}${s.notes ? " • " + s.notes : ""}`;
    list.appendChild(li);
  });

  const totalEl = $("sleepTotal");
  if (totalEl) totalEl.textContent = msToHhMm(totalMs);
}

async function sleepStart() {
  if (!isToday(selectedDateStr)) return alert("Start/End buttons are for TODAY only.");
  if (!navigator.onLine) return alert("Start requires internet. Use Manual entry while offline.");

  const user = await requireUser();
  const notes = ($("sleepNote")?.value || "").trim() || null;

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
  if (!isToday(selectedDateStr)) return alert("Start/End buttons are for TODAY only.");
  if (!navigator.onLine) return alert("End requires internet. Use Manual entry while offline.");

  const open = await sb
    .from("sleep_sessions")
    .select("id")
    .eq("child_id", childId)
    .is("end_time", null)
    .order("start_time", { ascending: false })
    .limit(1);

  if (open.error) return alert(open.error.message);
  if (!open.data?.length) return alert("No active sleep session found.");

  const res = await sb
    .from("sleep_sessions")
    .update({ end_time: new Date().toISOString() })
    .eq("id", open.data[0].id);

  if (res.error) return alert(res.error.message);
  await loadSleep();
}

async function addSleepManual() {
  const startVal = $("sleepStartManual")?.value;
  const endVal = $("sleepEndManual")?.value;
  const notes = ($("sleepNote")?.value || "").trim() || null;

  if (!startVal && !endVal) return alert("Pick at least a START or END time.");

  // If only one side was provided, store the other as null.
  const startIso = startVal ? new Date(startVal).toISOString() : null;
  const endIso = endVal ? new Date(endVal).toISOString() : null;

  if (startIso && endIso && new Date(endIso) < new Date(startIso)) return alert("End must be after start.");

  const user = await requireUser();
  const payload = { child_id: childId, start_time: startIso || endIso, end_time: endIso, notes, user_id: user.id };

  const res = await sb.from("sleep_sessions").insert(payload);
  if (res.error) return alert(res.error.message);

  if ($("sleepStartManual")) $("sleepStartManual").value = "";
  if ($("sleepEndManual")) $("sleepEndManual").value = "";
  if ($("sleepNote")) $("sleepNote").value = "";

  await loadSleep();
}

// ---------- meals ----------
async function loadMeals() {
  if (!childId) return;

  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb
    .from("meals")
    .select("*")
    .eq("child_id", childId)
    .gte("time", start)
    .lte("time", end)
    .order("time", { ascending: false });

  if (res.error) {
    console.error(res.error);
    return;
  }

  const list = $("mealsList");
  if (!list) return;

  list.innerHTML = "";
  (res.data || []).forEach((m) => {
    const li = document.createElement("li");
    const pct = m.percent_eaten ?? m.percent ?? null;
    li.textContent =
      `${hhmm(m.time)} • ${m.meal_type || "Meal"}` +
      (pct === null || pct === undefined ? "" : ` • ${pct}%`) +
      (m.food_text ? ` • ${m.food_text}` : "") +
      (m.notes ? ` • ${m.notes}` : "");
    list.appendChild(li);
  });
}

async function addMeal() {
  if (!childId) return;

  const mealType = $("mealType")?.value || "Meal";
  const percent = $("mealPercent")?.value || "";
  const food = ($("mealFood")?.value || "").trim() || null;
  const notes = ($("mealNotes")?.value || "").trim() || null;

  const user = await requireUser();

  const res = await sb.from("meals").insert({
    child_id: childId,
    meal_type: mealType,
    percent_eaten: percent === "" ? null : Number(percent),
    food_text: food,
    notes,
    time: new Date(selectedDateStr + "T12:00:00").toISOString(), // default midday; UI is date-based
    user_id: user.id,
  });

  if (res.error) return alert(res.error.message);

  if ($("mealFood")) $("mealFood").value = "";
  if ($("mealNotes")) $("mealNotes").value = "";

  await loadMeals();
}

// ---------- moods ----------
async function loadMoods() {
  if (!childId) return;

  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb
    .from("moods")
    .select("*")
    .eq("child_id", childId)
    .gte("time", start)
    .lte("time", end)
    .order("time", { ascending: false });

  if (res.error) {
    console.error(res.error);
    return;
  }

  const list = $("moodsList");
  if (!list) return;

  list.innerHTML = "";
  (res.data || []).forEach((m) => {
    const li = document.createElement("li");
    li.textContent = `${hhmm(m.time)} • ${m.period || "Mood"} • ${m.mood || ""}${m.notes ? " • " + m.notes : ""}`;
    list.appendChild(li);
  });
}

async function saveMood() {
  if (!childId) return;

  const period = $("moodPeriod")?.value || "Morning";
  const mood = $("moodValue")?.value || "Calm";
  const notes = ($("moodNotes")?.value || "").trim() || null;

  const user = await requireUser();

  const res = await sb.from("moods").insert({
    child_id: childId,
    period,
    mood,
    notes,
    time: new Date(selectedDateStr + "T12:00:00").toISOString(),
    user_id: user.id,
  });

  if (res.error) return alert(res.error.message);

  if ($("moodNotes")) $("moodNotes").value = "";
  await loadMoods();
}

// ---------- medication ----------
async function loadMeds() {
  if (!childId) return;

  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb
    .from("med_doses")
    .select("*")
    .eq("child_id", childId)
    .gte("time", start)
    .lte("time", end)
    .order("time", { ascending: false });

  if (res.error) {
    console.error(res.error);
    return;
  }

  const list = $("medList");
  if (!list) return;

  list.innerHTML = "";
  (res.data || []).forEach((d) => {
    const li = document.createElement("li");
    li.textContent = `${hhmm(d.time)} • ${d.med_name || "Medication"} • ${d.dose ?? ""}${d.notes ? " • " + d.notes : ""}`;
    list.appendChild(li);
  });
}

async function addDose() {
  if (!childId) return;

  const med = $("medName")?.value || "";
  const dose = ($("medDose")?.value || "").trim();
  const timeVal = $("medTime")?.value; // "HH:MM"
  const notes = ($("medNotes")?.value || "").trim() || null;

  if (!med) return alert("Select a medication.");
  if (!dose) return alert("Enter a dose.");

  const user = await requireUser();
  const iso = timeVal ? new Date(`${selectedDateStr}T${timeVal}:00`).toISOString() : new Date().toISOString();

  const res = await sb.from("med_doses").insert({
    child_id: childId,
    med_name: med,
    dose,
    time: iso,
    notes,
    user_id: user.id,
  });

  if (res.error) return alert(res.error.message);

  if ($("medDose")) $("medDose").value = "";
  if ($("medNotes")) $("medNotes").value = "";

  await loadMeds();
}

// ---------- accident & illness ----------
async function loadAccidents() {
  if (!childId) return;

  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb
    .from("accidents")
    .select("*")
    .eq("child_id", childId)
    .gte("time", start)
    .lte("time", end)
    .order("time", { ascending: false });

  if (res.error) {
    console.error(res.error);
    return;
  }

  const list = $("accidentList");
  if (!list) return;

  list.innerHTML = "";
  (res.data || []).forEach((a) => {
    const li = document.createElement("li");
    li.textContent = `${hhmm(a.time)} • ${a.severity || "Accident"} • ${a.body_area || ""}${a.what_happened ? " • " + a.what_happened : ""}`;
    list.appendChild(li);
  });
}

async function loadIllness() {
  if (!childId) return;

  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb
    .from("illnesses")
    .select("*")
    .eq("child_id", childId)
    .gte("time", start)
    .lte("time", end)
    .order("time", { ascending: false });

  if (res.error) {
    console.error(res.error);
    return;
  }

  const list = $("illnessList");
  if (!list) return;

  list.innerHTML = "";
  (res.data || []).forEach((i) => {
    const li = document.createElement("li");
    li.textContent =
      `${hhmm(i.time)} • ${i.symptom || "Illness"}` +
      (i.temperature_c ? ` • ${i.temperature_c}°C` : "") +
      (i.notes ? ` • ${i.notes}` : "");
    list.appendChild(li);
  });
}

async function addAccident() {
  if (!childId) return;

  const what = ($("accWhat")?.value || "").trim();
  const severity = $("accSeverity")?.value || "Minor";
  const area = $("accArea")?.value || "";
  const where = ($("accWhere")?.value || "").trim() || null;
  const who = $("accReportedBy")?.value || "";
  const timeVal = $("accTime")?.value; // HH:MM
  const action = ($("accAction")?.value || "").trim() || null;
  const safe = ($("accSafeguard")?.value || "").trim() || null;
  const notes = ($("accNotes")?.value || "").trim() || null;

  const user = await requireUser();
  const iso = timeVal ? new Date(`${selectedDateStr}T${timeVal}:00`).toISOString() : new Date().toISOString();

  const res = await sb.from("accidents").insert({
    child_id: childId,
    what_happened: what || null,
    severity,
    body_area: area || null,
    where_happened: where,
    reported_by: who || null,
    action_taken: action,
    safeguarding: safe,
    notes,
    time: iso,
    user_id: user.id,
  });

  if (res.error) return alert(res.error.message);

  ["accWhat", "accWhere", "accAction", "accSafeguard", "accNotes"].forEach((id) => {
    const el = $(id);
    if (el) el.value = "";
  });

  await loadAccidents();
}

async function addIllness() {
  if (!childId) return;

  const symptom = $("illSymptom")?.value || "Temperature";
  const temp = ($("illTemp")?.value || "").trim();
  const medLink = $("illMed")?.value || "None";
  const who = $("illReportedBy")?.value || "";
  const timeVal = $("illTime")?.value; // HH:MM
  const notes = ($("illNotes")?.value || "").trim() || null;

  const user = await requireUser();
  const iso = timeVal ? new Date(`${selectedDateStr}T${timeVal}:00`).toISOString() : new Date().toISOString();

  const res = await sb.from("illnesses").insert({
    child_id: childId,
    symptom,
    temperature_c: temp ? Number(temp) : null,
    medication: medLink || null,
    reported_by: who || null,
    notes,
    time: iso,
    user_id: user.id,
  });

  if (res.error) return alert(res.error.message);

  ["illTemp", "illNotes"].forEach((id) => {
    const el = $(id);
    if (el) el.value = "";
  });

  await loadIllness();
}

// ---------- daily summary ----------
async function loadSummary() {
  if (!childId) return;
  const content = $("summaryContent");
  if (!content) return;

  const { start, end } = toIsoRangeForDate(selectedDateStr);

  const [sleepRes, mealsRes, moodsRes, medsRes, accRes, illRes] = await Promise.all([
    sb.from("sleep_sessions").select("*").eq("child_id", childId).gte("start_time", start).lte("start_time", end).order("start_time", { ascending: false }),
    sb.from("meals").select("*").eq("child_id", childId).gte("time", start).lte("time", end).order("time", { ascending: false }),
    sb.from("moods").select("*").eq("child_id", childId).gte("time", start).lte("time", end).order("time", { ascending: false }),
    sb.from("med_doses").select("*").eq("child_id", childId).gte("time", start).lte("time", end).order("time", { ascending: false }),
    sb.from("accidents").select("*").eq("child_id", childId).gte("time", start).lte("time", end).order("time", { ascending: false }),
    sb.from("illnesses").select("*").eq("child_id", childId).gte("time", start).lte("time", end).order("time", { ascending: false }),
  ]);

  const errs = [sleepRes, mealsRes, moodsRes, medsRes, accRes, illRes].map((r) => r.error).filter(Boolean);
  if (errs.length) {
    console.error(errs[0]);
    content.innerHTML = `<div class="muted">Could not load summary. Check console.</div>`;
    return;
  }

  // total sleep
  let totalSleepMs = 0;
  (sleepRes.data || []).forEach((s) => {
    if (!s.end_time) return;
    totalSleepMs += Math.max(0, new Date(s.end_time) - new Date(s.start_time));
  });

  const section = (title, rowsHtml, emptyText) => {
    const body = rowsHtml && rowsHtml.trim().length ? rowsHtml : `<div class="muted">${emptyText}</div>`;
    return `
      <div class="card today">
        <h2 style="margin-bottom: var(--space);">${title}</h2>
        ${body}
      </div>
    `;
  };

  const list = (items) => `<ul class="summaryList">${items.join("")}</ul>`;

  const sleepItems = (sleepRes.data || []).map((s) => {
    const label = `${hhmm(s.start_time)} → ${s.end_time ? hhmm(s.end_time) : "…"}${s.notes ? " • " + escapeHtml(s.notes) : ""}`;
    return `<li><button class="linkBtn" data-goto="sleepView">${label}</button></li>`;
  });

  const mealsItems = (mealsRes.data || []).map((m) => {
    const pct = m.percent_eaten ?? m.percent ?? null;
    const pctText = pct === null || pct === undefined ? "" : ` • ${pct}%`;
    const label =
      `${hhmm(m.time)} • ${escapeHtml(m.meal_type || "Meal")}${pctText}` +
      (m.food_text ? ` • ${escapeHtml(m.food_text)}` : "") +
      (m.notes ? ` • ${escapeHtml(m.notes)}` : "");
    return `<li><button class="linkBtn" data-goto="mealsView">${label}</button></li>`;
  });

  const moodItems = (moodsRes.data || []).map((m) => {
    const label = `${hhmm(m.time)} • ${escapeHtml(m.period || "Mood")} • ${escapeHtml(m.mood || "")}${m.notes ? " • " + escapeHtml(m.notes) : ""}`;
    return `<li><button class="linkBtn" data-goto="moodsView">${label}</button></li>`;
  });

  const medItems = (medsRes.data || []).map((d) => {
    const label = `${hhmm(d.time)} • ${escapeHtml(d.med_name || "Medication")} • ${escapeHtml(String(d.dose ?? ""))}${d.notes ? " • " + escapeHtml(d.notes) : ""}`;
    return `<li><button class="linkBtn" data-goto="medView">${label}</button></li>`;
  });

  const accItems = (accRes.data || []).map((a) => {
    const label = `${hhmm(a.time)} • ${escapeHtml(a.severity || "Accident")} • ${escapeHtml(a.body_area || "")}${a.what_happened ? " • " + escapeHtml(a.what_happened) : ""}`;
    return `<li><button class="linkBtn" data-goto="aiView">${label}</button></li>`;
  });

  const illItems = (illRes.data || []).map((i) => {
    const label =
      `${hhmm(i.time)} • ${escapeHtml(i.symptom || "Illness")}` +
      (i.temperature_c ? ` • ${escapeHtml(String(i.temperature_c))}°C` : "") +
      (i.notes ? ` • ${escapeHtml(i.notes)}` : "");
    return `<li><button class="linkBtn" data-goto="aiView">${label}</button></li>`;
  });

  content.innerHTML = `
    <div class="muted" style="margin-bottom: var(--space);">Total sleep: <strong>${msToHhMm(totalSleepMs)}</strong></div>
    ${section("Sleep", list(sleepItems), "No sleep logged for this day.")}
    ${section("Meals", list(mealsItems), "No meals logged for this day.")}
    ${section("Mood", list(moodItems), "No mood logged for this day.")}
    ${section("Medication", list(medItems), "No medication logged for this day.")}
    ${section("Accidents", list(accItems), "No accidents logged for this day.")}
    ${section("Illnesses", list(illItems), "No illnesses logged for this day.")}
  `;

  content.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.getAttribute("data-goto")));
  });
}

// helpers for summary / sleep totals
function msToHhMm(ms) {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// ---------- refresh current view ----------
async function refreshVisible() {
  // Always sync date bars
  ["sleep", "meals", "moods", "med", "ai", "summary"].forEach(wireDateBar);

  // Child selects
  const childSelectMap = {
    sleepView: "sleepChild",
    mealsView: "mealsChild",
    moodsView: "moodsChild",
    medView: "medChild",
    aiView: "aiChild",
    summaryView: "summaryChild",
  };
  if (childSelectMap[activeView]) await fillChildSelect(childSelectMap[activeView]);

  if (activeView === "sleepView") await loadSleep();
  if (activeView === "mealsView") await loadMeals();
  if (activeView === "moodsView") await loadMoods();
  if (activeView === "medView") await loadMeds();
  if (activeView === "aiView") {
    await loadAccidents();
    await loadIllness();
  }
  if (activeView === "summaryView") await loadSummary();
}

// ---------- init ----------
(async function init() {
  // Route on load
  const initial = (location.hash || "#authView").replace("#", "");
  if (VIEWS.includes(initial)) showView(initial, false);

  // Wire auth buttons
  if ($("btnLogin")) $("btnLogin").onclick = doLogin;
  if ($("btnRegister")) $("btnRegister").onclick = doRegister;
  if ($("btnForgot")) $("btnForgot").onclick = doForgot;
  if ($("btnReset")) $("btnReset").onclick = doResetPassword;

  // Wire logout/admin/menu
  if ($("btnLogout")) $("btnLogout").onclick = doLogout;

  // Menu navigation (use openPage so it loads + jumps to today)
  if ($("goSleep")) $("goSleep").onclick = openPage("sleepView", async () => await fillChildSelect("sleepChild"));
  if ($("goMeals")) $("goMeals").onclick = openPage("mealsView", async () => await fillChildSelect("mealsChild"));
  if ($("goMoods")) $("goMoods").onclick = openPage("moodsView", async () => await fillChildSelect("moodsChild"));
  if ($("goMed")) $("goMed").onclick = openPage("medView", async () => await fillChildSelect("medChild"));
  if ($("goAI")) $("goAI").onclick = openPage("aiView", async () => await fillChildSelect("aiChild"));
  if ($("goSummary")) $("goSummary").onclick = openPage("summaryView", async () => await fillChildSelect("summaryChild"));

  // Back buttons
  if ($("sleepBack")) $("sleepBack").onclick = () => showView("menuView");
  if ($("mealsBack")) $("mealsBack").onclick = () => showView("menuView");
  if ($("moodsBack")) $("moodsBack").onclick = () => showView("menuView");
  if ($("medBack")) $("medBack").onclick = () => showView("menuView");
  if ($("aiBack")) $("aiBack").onclick = () => showView("menuView");
  if ($("summaryBack")) $("summaryBack").onclick = () => showView("menuView");

  // Sleep buttons
  if ($("sleepStart")) $("sleepStart").onclick = sleepStart;
  if ($("sleepEnd")) $("sleepEnd").onclick = sleepEnd;
  if ($("sleepAddManual")) $("sleepAddManual").onclick = addSleepManual;

  // Meals
  if ($("mealAdd")) $("mealAdd").onclick = addMeal;

  // Mood
  if ($("moodSave")) $("moodSave").onclick = saveMood;

  // Medication
  if ($("doseAdd")) $("doseAdd").onclick = addDose;
  await fillMedSelect("medName");

  // Accident & illness
  if ($("accAdd")) $("accAdd").onclick = addAccident;
  if ($("illAdd")) $("illAdd").onclick = addIllness;

  // Date bars
  wireDateBar("sleep");
  wireDateBar("meals");
  wireDateBar("moods");
  wireDateBar("med");
  wireDateBar("ai");
  wireDateBar("summary");

  // Start on auth or menu depending on session
  const sess = await sb.auth.getSession();
  if (sess?.data?.session) {
    showView("menuView", false);
  } else {
    showView("authView", false);
  }

  setDate(todayStr());
})();
