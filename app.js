// ==============================
// Routine Tracker - app.js
// ==============================

// ✅ Your Supabase project values (unchanged)
const SUPABASE_URL = "https://vazbhxvjvjaznyruuchv.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhemJoeHZqdnZqYXpueXJ1dWNo" +
  "diIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzM1NjY0NTA3LCJleHAiOjIwNTA5NDA1MDd9." +
  "dQGCvnhqjQhYxUqfpxk8wX6Lq1x8w5zq4n9QhJbT5k0";

// ✅ Supabase client (UMD global is window.supabase)
const sb =
  window.supabase && window.supabase.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

function assertSupabase() {
  if (!sb) {
    alert(
      "Supabase library didn't load.\n\nFix:\n1) Hard refresh (Ctrl+F5)\n2) On mobile: clear site data / uninstall & reinstall the PWA\n3) Ensure index.html includes the Supabase script BEFORE app.js"
    );
    throw new Error("Supabase is not available (window.supabase is undefined).");
  }
}

// ---------- small helpers ----------
const $ = (id) => document.getElementById(id);

function pad2(n) {
  return String(n).padStart(2, "0");
}

function yyyy_mm_dd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseYmd(s) {
  // s: YYYY-MM-DD
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(ymd, delta) {
  const d = parseYmd(ymd);
  d.setDate(d.getDate() + delta);
  return yyyy_mm_dd(d);
}

function isToday(ymd) {
  return ymd === yyyy_mm_dd(new Date());
}

function toIsoRangeForDate(ymd) {
  const d = parseYmd(ymd);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString();
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
  return { start, end };
}

function hhmm(iso) {
  const d = new Date(iso);
  // ✅ force 24-hour everywhere
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function hoursMinutes(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${pad2(m)}m`;
}

// ---------- offline queue (simple) ----------
function getQueue() {
  try {
    return JSON.parse(localStorage.getItem("offlineQueue") || "[]");
  } catch {
    return [];
  }
}

function setQueue(q) {
  localStorage.setItem("offlineQueue", JSON.stringify(q));
}

function queueInsert(table, payload) {
  const q = getQueue();
  q.push({ kind: "insert", table, payload, ts: Date.now() });
  setQueue(q);
}

async function flushQueue() {
  if (!navigator.onLine) return;
  const q = getQueue();
  if (!q.length) return;

  const keep = [];
  for (const item of q) {
    try {
      if (item.kind === "insert") {
        const res = await sb.from(item.table).insert(item.payload);
        if (res.error) throw res.error;
      }
    } catch (e) {
      console.warn("Queue item failed, keeping:", item, e);
      keep.push(item);
    }
  }
  setQueue(keep);
}

// ---------- auth ----------
async function requireUser() {
  const { data, error } = await sb.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error("Not logged in.");
  return data.user;
}

async function signIn(email, password) {
  const res = await sb.auth.signInWithPassword({ email, password });
  if (res.error) throw res.error;
  return res.data.user;
}

async function signUp(email, password) {
  // invite code check (1006)
  const code = ($("inviteCode")?.value || "").trim();
  if (code !== "1006") {
    alert("Invite code is required to register.");
    return;
  }

  const res = await sb.auth.signUp({ email, password });
  if (res.error) throw res.error;
  alert("Registered. If email confirmation is enabled, check your inbox.");
}

async function forgotPassword(email) {
  const res = await sb.auth.resetPasswordForEmail(email);
  if (res.error) throw res.error;
  alert("Password reset email sent (if the email exists).");
}

async function logout() {
  await sb.auth.signOut();
  showView("authView");
}

// ---------- global state ----------
let selectedDateStr = yyyy_mm_dd(new Date());
let childId = null;

// ---------- views ----------
const VIEWS = [
  "authView",
  "menuView",
  "adminView",
  "sleepView",
  "mealsView",
  "moodsView",
  "medsView",
  "aiView",
  "summaryView"
];

function showView(id) {
  VIEWS.forEach((v) => {
    const el = $(v);
    if (!el) return;
    el.classList.toggle("hidden", v !== id);
  });

  // keep hash in sync
  location.hash = id;
}

function showFromHash() {
  const h = (location.hash || "").replace("#", "");
  if (VIEWS.includes(h)) showView(h);
}

// ---------- children / meds lists ----------
async function loadChildrenInto(selectIds) {
  const res = await sb.from("children").select("*").order("name", { ascending: true });
  if (res.error) {
    console.error(res.error);
    return;
  }

  const list = res.data || [];
  if (!list.length) return;

  // preserve current child if possible
  const current = childId || list[0].id;
  childId = current;

  selectIds.forEach((sid) => {
    const sel = $(sid);
    if (!sel) return;
    sel.innerHTML = "";
    list.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
    sel.value = current;
  });
}

async function loadMedicationsInto(selectId) {
  const res = await sb.from("medications").select("*").order("name", { ascending: true });
  if (res.error) {
    console.error(res.error);
    return;
  }

  const sel = $(selectId);
  if (!sel) return;

  sel.innerHTML = "";
  (res.data || []).forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = `${m.name} (${m.unit})`;
    sel.appendChild(opt);
  });

  // illness link dropdown uses same meds list but with a "None" already present
  const ill = $("illMedLink");
  if (ill) {
    // keep first "None"
    const none = ill.querySelector("option[value='']") || null;
    ill.innerHTML = "";
    if (none) ill.appendChild(none);
    (res.data || []).forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.name} (${m.unit})`;
      ill.appendChild(opt);
    });
  }
}

// ---------- date pickers ----------
function setDatePick(id) {
  const el = $(id);
  if (!el) return;
  el.value = selectedDateStr;
}

function hookDatePick(id, onChange) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("change", () => {
    selectedDateStr = el.value || yyyy_mm_dd(new Date());
    onChange?.();
  });
}

// ---------- sleep ----------
async function loadSleep() {
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
  if (totalEl) totalEl.textContent = hoursMinutes(totalMs);
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
    user_id: user.id
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

  if (!startVal) return alert("Pick a manual sleep START time.");

  const startIso = new Date(startVal).toISOString();
  const endIso = endVal ? new Date(endVal).toISOString() : null;
  if (endIso && new Date(endIso) < new Date(startIso)) return alert("End must be after start.");

  const user = await requireUser();
  const payload = { child_id: childId, start_time: startIso, end_time: endIso, notes, user_id: user.id };

  if (!navigator.onLine) {
    queueInsert("sleep_sessions", payload);
    if ($("sleepStartManual")) $("sleepStartManual").value = "";
    if ($("sleepEndManual")) $("sleepEndManual").value = "";
    alert("Saved offline. Will sync when online.");
    return;
  }

  const res = await sb.from("sleep_sessions").insert(payload);
  if (res.error) return alert(res.error.message);

  if ($("sleepStartManual")) $("sleepStartManual").value = "";
  if ($("sleepEndManual")) $("sleepEndManual").value = "";
  await loadSleep();
}

// ---------- meals ----------
async function loadMeals() {
  const { start, end } = toIsoRangeForDate(selectedDateStr);

  const res = await sb
    .from("meals")
    .select("*")
    .eq("child_id", childId)
    .gte("event_time", start)
    .lte("event_time", end)
    .order("event_time", { ascending: false });

  if (res.error) {
    console.error(res.error);
    return;
  }

  const list = $("mealList");
  if (!list) return;

  list.innerHTML = "";
  (res.data || []).forEach((m) => {
    const li = document.createElement("li");
    const pct = (m.percent ?? 0) + "%";
    li.textContent = `${m.type} • ${pct}${m.what ? " • " + m.what : ""}${m.notes ? " • " + m.notes : ""}`;
    list.appendChild(li);
  });
}

async function addMeal() {
  const type = $("mealType")?.value;
  const percent = Number($("mealPercent")?.value || "0");
  const what = ($("mealWhat")?.value || "").trim() || null;
  const notes = ($("mealNotes")?.value || "").trim() || null;

  const user = await requireUser();

  const payload = {
    child_id: childId,
    type,
    percent,
    what,
    notes,
    event_time: new Date(`${selectedDateStr}T12:00:00`).toISOString(),
    user_id: user.id
  };

  if (!navigator.onLine) {
    queueInsert("meals", payload);
    alert("Saved offline. Will sync when online.");
    return;
  }

  const res = await sb.from("meals").insert(payload);
  if (res.error) return alert(res.error.message);

  if ($("mealWhat")) $("mealWhat").value = "";
  if ($("mealNotes")) $("mealNotes").value = "";
  await loadMeals();
}

// ---------- moods ----------
async function loadMoods() {
  const { start, end } = toIsoRangeForDate(selectedDateStr);

  const res = await sb
    .from("moods")
    .select("*")
    .eq("child_id", childId)
    .gte("event_time", start)
    .lte("event_time", end)
    .order("event_time", { ascending: false });

  if (res.error) {
    console.error(res.error);
    return;
  }

  const list = $("moodList");
  if (!list) return;

  list.innerHTML = "";
  (res.data || []).forEach((m) => {
    const li = document.createElement("li");
    li.textContent = `${m.period}: ${m.mood}${m.notes ? " • " + m.notes : ""}`;
    list.appendChild(li);
  });
}

async function saveMood() {
  const period = $("moodPeriod")?.value;
  const mood = $("moodValue")?.value;
  const notes = ($("moodNotes")?.value || "").trim() || null;

  const user = await requireUser();

  const payload = {
    child_id: childId,
    period,
    mood,
    notes,
    event_time: new Date(`${selectedDateStr}T12:00:00`).toISOString(),
    user_id: user.id
  };

  if (!navigator.onLine) {
    queueInsert("moods", payload);
    alert("Saved offline. Will sync when online.");
    return;
  }

  const res = await sb.from("moods").insert(payload);
  if (res.error) return alert(res.error.message);

  if ($("moodNotes")) $("moodNotes").value = "";
  await loadMoods();
}

// ---------- medication ----------
async function loadMeds() {
  const { start, end } = toIsoRangeForDate(selectedDateStr);

  const res = await sb
    .from("medication_doses")
    .select("*, medications(name, unit)")
    .eq("child_id", childId)
    .gte("event_time", start)
    .lte("event_time", end)
    .order("event_time", { ascending: false });

  if (res.error) {
    console.error(res.error);
    return;
  }

  const list = $("medList");
  if (!list) return;

  list.innerHTML = "";
  (res.data || []).forEach((d) => {
    const li = document.createElement("li");
    const med = d.medications ? `${d.medications.name}` : "Medication";
    const unit = d.medications ? d.medications.unit : "";
    li.textContent = `${hhmm(d.event_time)} • ${med} • ${d.dose}${unit ? " " + unit : ""}${d.notes ? " • " + d.notes : ""}`;
    list.appendChild(li);
  });
}

async function addDose() {
  const medId = $("medName")?.value;
  const dose = Number($("medDose")?.value || "0");
  const time = $("medTime")?.value || "12:00";
  const notes = ($("medNotes")?.value || "").trim() || null;

  if (!medId) return alert("Pick a medication.");
  if (!dose) return alert("Enter a dose.");

  const user = await requireUser();
  const event_time = new Date(`${selectedDateStr}T${time}:00`).toISOString();

  const payload = {
    child_id: childId,
    medication_id: medId,
    dose,
    notes,
    event_time,
    user_id: user.id
  };

  if (!navigator.onLine) {
    queueInsert("medication_doses", payload);
    alert("Saved offline. Will sync when online.");
    return;
  }

  const res = await sb.from("medication_doses").insert(payload);
  if (res.error) return alert(res.error.message);

  if ($("medDose")) $("medDose").value = "";
  if ($("medNotes")) $("medNotes").value = "";
  await loadMeds();
}

// ---------- accident & illness ----------
function setAIMode(mode) {
  const a = $("accidentForm");
  const i = $("illnessForm");
  const pa = $("pillAccident");
  const pi = $("pillIllness");
  if (!a || !i || !pa || !pi) return;

  const isAcc = mode === "accident";
  a.classList.toggle("hidden", !isAcc);
  i.classList.toggle("hidden", isAcc);
  pa.classList.toggle("active", isAcc);
  pi.classList.toggle("active", !isAcc);
}

async function loadAccidents() {
  const { start, end } = toIsoRangeForDate(selectedDateStr);

  const res = await sb
    .from("accidents")
    .select("*")
    .eq("child_id", childId)
    .gte("event_time", start)
    .lte("event_time", end)
    .order("event_time", { ascending: false });

  if (res.error) {
    console.error(res.error);
    return;
  }

  const list = $("accList");
  if (!list) return;
  list.innerHTML = "";

  (res.data || []).forEach((a) => {
    const li = document.createElement("li");
    li.textContent = `${hhmm(a.event_time)} • ${a.severity || ""} • ${a.body_area || ""}${a.notes ? " • " + a.notes : ""}`;
    list.appendChild(li);
  });
}

async function addAccident() {
  const what = ($("accWhat")?.value || "").trim() || null;
  const severity = $("accSeverity")?.value || null;
  const body_area = $("accBody")?.value || null;
  const where = ($("accWhere")?.value || "").trim() || null;
  const reported_by = $("accReportedBy")?.value || null;
  const time = $("accTime")?.value || "12:00";
  const action_taken = ($("accAction")?.value || "").trim() || null;
  const safeguarding = ($("accSafe")?.value || "").trim() || null;
  const notes = ($("accNotes")?.value || "").trim() || null;

  const user = await requireUser();
  const event_time = new Date(`${selectedDateStr}T${time}:00`).toISOString();

  const payload = {
    child_id: childId,
    what,
    severity,
    body_area,
    where,
    reported_by,
    action_taken,
    safeguarding,
    notes,
    event_time,
    user_id: user.id
  };

  if (!navigator.onLine) {
    queueInsert("accidents", payload);
    alert("Saved offline. Will sync when online.");
    return;
  }

  const res = await sb.from("accidents").insert(payload);
  if (res.error) return alert(res.error.message);

  if ($("accNotes")) $("accNotes").value = "";
  await loadAccidents();
}

async function loadIllnesses() {
  const { start, end } = toIsoRangeForDate(selectedDateStr);

  const res = await sb
    .from("illnesses")
    .select("*")
    .eq("child_id", childId)
    .gte("event_time", start)
    .lte("event_time", end)
    .order("event_time", { ascending: false });

  if (res.error) {
    console.error(res.error);
    return;
  }

  const list = $("illList");
  if (!list) return;
  list.innerHTML = "";

  (res.data || []).forEach((i) => {
    const li = document.createElement("li");
    li.textContent = `${hhmm(i.event_time)} • ${i.symptom || ""}${i.temperature ? " • " + i.temperature + "°C" : ""}${i.notes ? " • " + i.notes : ""}`;
    list.appendChild(li);
  });
}

async function addIllness() {
  const symptom = $("illSymptom")?.value || null;
  const temperature = $("illTemp")?.value ? Number($("illTemp").value) : null;
  const time = $("illTime")?.value || "12:00";
  const medication_link = $("illMedLink")?.value || null;
  const reported_by = $("illReportedBy")?.value || null;
  const notes = ($("illNotes")?.value || "").trim() || null;

  const user = await requireUser();
  const event_time = new Date(`${selectedDateStr}T${time}:00`).toISOString();

  const payload = {
    child_id: childId,
    symptom,
    temperature,
    medication_link,
    reported_by,
    notes,
    event_time,
    user_id: user.id
  };

  if (!navigator.onLine) {
    queueInsert("illnesses", payload);
    alert("Saved offline. Will sync when online.");
    return;
  }

  const res = await sb.from("illnesses").insert(payload);
  if (res.error) return alert(res.error.message);

  if ($("illNotes")) $("illNotes").value = "";
  await loadIllnesses();
}

// ---------- daily summary ----------
async function loadSummary() {
  // Ensure date pick & child are in sync
  setDatePick("sumDatePick");

  // Sleep
  await loadSleepSummary();
  // Meals
  await loadMealsSummary();
  // Moods
  await loadMoodsSummary();
  // Meds
  await loadMedsSummary();
  // Accidents / Illnesses
  await loadAccidentsSummary();
  await loadIllnessesSummary();
}

async function loadSleepSummary() {
  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb
    .from("sleep_sessions")
    .select("*")
    .eq("child_id", childId)
    .gte("start_time", start)
    .lte("start_time", end)
    .order("start_time", { ascending: false });

  const list = $("sumSleepList");
  const totalEl = $("sumSleepTotal");
  if (!list || !totalEl) return;

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

  totalEl.textContent = hoursMinutes(totalMs);
}

async function loadMealsSummary() {
  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb
    .from("meals")
    .select("*")
    .eq("child_id", childId)
    .gte("event_time", start)
    .lte("event_time", end)
    .order("event_time", { ascending: false });

  const list = $("sumMealList");
  if (!list) return;
  list.innerHTML = "";
  (res.data || []).forEach((m) => {
    const li = document.createElement("li");
    li.textContent = `${m.type} • ${(m.percent ?? 0)}%${m.what ? " • " + m.what : ""}`;
    list.appendChild(li);
  });
}

async function loadMoodsSummary() {
  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb
    .from("moods")
    .select("*")
    .eq("child_id", childId)
    .gte("event_time", start)
    .lte("event_time", end)
    .order("event_time", { ascending: false });

  const list = $("sumMoodList");
  if (!list) return;
  list.innerHTML = "";
  (res.data || []).forEach((m) => {
    const li = document.createElement("li");
    li.textContent = `${m.period}: ${m.mood}`;
    list.appendChild(li);
  });
}

async function loadMedsSummary() {
  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb
    .from("medication_doses")
    .select("*, medications(name, unit)")
    .eq("child_id", childId)
    .gte("event_time", start)
    .lte("event_time", end)
    .order("event_time", { ascending: false });

  const list = $("sumMedList");
  if (!list) return;
  list.innerHTML = "";
  (res.data || []).forEach((d) => {
    const li = document.createElement("li");
    const med = d.medications ? d.medications.name : "Medication";
    const unit = d.medications ? d.medications.unit : "";
    li.textContent = `${hhmm(d.event_time)} • ${med} • ${d.dose}${unit ? " " + unit : ""}`;
    list.appendChild(li);
  });
}

async function loadAccidentsSummary() {
  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb
    .from("accidents")
    .select("*")
    .eq("child_id", childId)
    .gte("event_time", start)
    .lte("event_time", end)
    .order("event_time", { ascending: false });

  const list = $("sumAccList");
  if (!list) return;
  list.innerHTML = "";
  (res.data || []).forEach((a) => {
    const li = document.createElement("li");
    li.textContent = `${hhmm(a.event_time)} • ${a.severity || ""} • ${a.body_area || ""}`;
    list.appendChild(li);
  });
}

async function loadIllnessesSummary() {
  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb
    .from("illnesses")
    .select("*")
    .eq("child_id", childId)
    .gte("event_time", start)
    .lte("event_time", end)
    .order("event_time", { ascending: false });

  const list = $("sumIllList");
  if (!list) return;
  list.innerHTML = "";
  (res.data || []).forEach((i) => {
    const li = document.createElement("li");
    li.textContent = `${hhmm(i.event_time)} • ${i.symptom || ""}${i.temperature ? " • " + i.temperature + "°C" : ""}`;
    list.appendChild(li);
  });
}

// ---------- init + hooks ----------
document.addEventListener("DOMContentLoaded", async () => {
  assertSupabase();
  showFromHash();
  window.addEventListener("hashchange", showFromHash);
  window.addEventListener("online", flushQueue);

  // auth buttons
  $("btnLogin")?.addEventListener("click", async () => {
    try {
      const email = ($("authEmail")?.value || "").trim();
      const pass = ($("authPassword")?.value || "").trim();
      if (!email || !pass) return alert("Enter email and password.");
      await signIn(email, pass);
      await flushQueue();
      await afterLogin();
      showView("menuView");
    } catch (e) {
      console.error(e);
      alert(e?.message || "Login failed.");
    }
  });

  $("btnRegister")?.addEventListener("click", async () => {
    try {
      const email = ($("authEmail")?.value || "").trim();
      const pass = ($("authPassword")?.value || "").trim();
      if (!email || !pass) return alert("Enter email and password.");
      await signUp(email, pass);
    } catch (e) {
      console.error(e);
      alert(e?.message || "Register failed.");
    }
  });

  $("btnForgot")?.addEventListener("click", async () => {
    try {
      const email = ($("authEmail")?.value || "").trim();
      if (!email) return alert("Enter your email.");
      await forgotPassword(email);
    } catch (e) {
      console.error(e);
      alert(e?.message || "Request failed.");
    }
  });

  $("btnLogout")?.addEventListener("click", logout);

  // menu routing
  $("btnMenuSleep")?.addEventListener("click", async () => { showView("sleepView"); await refreshSleep(); });
  $("btnMenuMeals")?.addEventListener("click", async () => { showView("mealsView"); await refreshMeals(); });
  $("btnMenuMoods")?.addEventListener("click", async () => { showView("moodsView"); await refreshMoods(); });
  $("btnMenuMeds")?.addEventListener("click", async () => { showView("medsView"); await refreshMeds(); });
  $("btnMenuAI")?.addEventListener("click", async () => { showView("aiView"); await refreshAI(); });
  $("btnMenuSummary")?.addEventListener("click", async () => { showView("summaryView"); await refreshSummary(); });
  $("btnMenuAdmin")?.addEventListener("click", async () => { showView("adminView"); });

  // back buttons
  ["sleepBack","mealsBack","moodsBack","medsBack","aiBack","sumBack","adminBack"].forEach(id => {
    $(id)?.addEventListener("click", () => showView("menuView"));
  });

  // child selects
  ["sleepChild","mealsChild","moodsChild","medsChild","aiChild","sumChild"].forEach((id) => {
    $(id)?.addEventListener("change", async (e) => {
      childId = e.target.value;
      await refreshCurrentView();
    });
  });

  // date picker hooks
  hookDatePick("sleepDatePick", refreshSleep);
  hookDatePick("mealsDatePick", refreshMeals);
  hookDatePick("moodsDatePick", refreshMoods);
  hookDatePick("medsDatePick", refreshMeds);
  hookDatePick("aiDatePick", refreshAI);
  hookDatePick("sumDatePick", refreshSummary);

  // prev/next
  $("sleepPrev")?.addEventListener("click", () => { selectedDateStr = addDays(selectedDateStr, -1); refreshSleep(); });
  $("sleepNext")?.addEventListener("click", () => { selectedDateStr = addDays(selectedDateStr,  1); refreshSleep(); });
  $("mealsPrev")?.addEventListener("click", () => { selectedDateStr = addDays(selectedDateStr, -1); refreshMeals(); });
  $("mealsNext")?.addEventListener("click", () => { selectedDateStr = addDays(selectedDateStr,  1); refreshMeals(); });
  $("moodsPrev")?.addEventListener("click", () => { selectedDateStr = addDays(selectedDateStr, -1); refreshMoods(); });
  $("moodsNext")?.addEventListener("click", () => { selectedDateStr = addDays(selectedDateStr,  1); refreshMoods(); });
  $("medsPrev")?.addEventListener("click", () => { selectedDateStr = addDays(selectedDateStr, -1); refreshMeds(); });
  $("medsNext")?.addEventListener("click", () => { selectedDateStr = addDays(selectedDateStr,  1); refreshMeds(); });
  $("aiPrev")?.addEventListener("click", () => { selectedDateStr = addDays(selectedDateStr, -1); refreshAI(); });
  $("aiNext")?.addEventListener("click", () => { selectedDateStr = addDays(selectedDateStr,  1); refreshAI(); });
  $("sumPrev")?.addEventListener("click", () => { selectedDateStr = addDays(selectedDateStr, -1); refreshSummary(); });
  $("sumNext")?.addEventListener("click", () => { selectedDateStr = addDays(selectedDateStr,  1); refreshSummary(); });

  // sleep buttons
  $("btnSleepStart")?.addEventListener("click", () => sleepStart().catch(e => alert(e.message)));
  $("btnSleepEnd")?.addEventListener("click", () => sleepEnd().catch(e => alert(e.message)));
  $("btnSleepManual")?.addEventListener("click", () => addSleepManual().catch(e => alert(e.message)));

  // meals
  $("btnAddMeal")?.addEventListener("click", () => addMeal().catch(e => alert(e.message)));

  // moods
  $("btnSaveMood")?.addEventListener("click", () => saveMood().catch(e => alert(e.message)));

  // meds
  $("btnAddDose")?.addEventListener("click", () => addDose().catch(e => alert(e.message)));

  // AI pills + save
  $("pillAccident")?.addEventListener("click", () => setAIMode("accident"));
  $("pillIllness")?.addEventListener("click", () => setAIMode("illness"));
  $("btnAddAccident")?.addEventListener("click", () => addAccident().catch(e => alert(e.message)));
  $("btnAddIllness")?.addEventListener("click", () => addIllness().catch(e => alert(e.message)));

  // summary quick links
  $("goSleep")?.addEventListener("click", async () => { showView("sleepView"); await refreshSleep(); });
  $("goMeals")?.addEventListener("click", async () => { showView("mealsView"); await refreshMeals(); });
  $("goMoods")?.addEventListener("click", async () => { showView("moodsView"); await refreshMoods(); });
  $("goMeds")?.addEventListener("click", async () => { showView("medsView"); await refreshMeds(); });
  $("goAIa")?.addEventListener("click", async () => { showView("aiView"); setAIMode("accident"); await refreshAI(); });
  $("goAIb")?.addEventListener("click", async () => { showView("aiView"); setAIMode("illness"); await refreshAI(); });

  // admin
  $("btnAddChild")?.addEventListener("click", async () => {
    try {
      const name = ($("newChildName")?.value || "").trim();
      if (!name) return alert("Enter a child name.");
      const user = await requireUser();
      const res = await sb.from("children").insert({ name, user_id: user.id });
      if (res.error) return alert(res.error.message);
      $("newChildName").value = "";
      await afterLogin();
      alert("Child saved.");
    } catch (e) { alert(e.message); }
  });

  $("btnAddMed")?.addEventListener("click", async () => {
    try {
      const name = ($("newMedName")?.value || "").trim();
      const unit = ($("newMedUnit")?.value || "").trim();
      if (!name || !unit) return alert("Enter name + unit.");
      const user = await requireUser();
      const res = await sb.from("medications").insert({ name, unit, user_id: user.id });
      if (res.error) return alert(res.error.message);
      $("newMedName").value = "";
      $("newMedUnit").value = "";
      await loadMedicationsInto("medName");
      alert("Medication saved.");
    } catch (e) { alert(e.message); }
  });

  // decide initial view (already logged in?)
  try {
    const user = await requireUser();
    if (user) {
      await afterLogin();
      showView("menuView");
    }
  } catch {
    showView("authView");
  }
});

async function afterLogin() {
  await loadChildrenInto(["sleepChild", "mealsChild", "moodsChild", "medsChild", "aiChild", "sumChild"]);
  await loadMedicationsInto("medName");

  // set initial date on all pickers
  ["sleepDatePick","mealsDatePick","moodsDatePick","medsDatePick","aiDatePick","sumDatePick"].forEach(setDatePick);
}

async function refreshCurrentView() {
  const current = (location.hash || "").replace("#", "");
  if (current === "sleepView") return refreshSleep();
  if (current === "mealsView") return refreshMeals();
  if (current === "moodsView") return refreshMoods();
  if (current === "medsView") return refreshMeds();
  if (current === "aiView") return refreshAI();
  if (current === "summaryView") return refreshSummary();
}

async function refreshSleep() {
  setDatePick("sleepDatePick");
  await loadSleep();
}

async function refreshMeals() {
  setDatePick("mealsDatePick");
  await loadMeals();
}

async function refreshMoods() {
  setDatePick("moodsDatePick");
  await loadMoods();
}

async function refreshMeds() {
  setDatePick("medsDatePick");
  await loadMeds();
}

async function refreshAI() {
  setDatePick("aiDatePick");
  await loadAccidents();
  await loadIllnesses();
}

async function refreshSummary() {
  setDatePick("sumDatePick");
  await loadSummary();
}
