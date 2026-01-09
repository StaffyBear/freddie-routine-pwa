/* =============================
   Routine Tracker - app.js
   FULL REPLACEMENT
   ============================= */

/* ---------- Supabase config ---------- */
const SITE_URL = "https://staffybear.github.io/freddie-routine-pwa/";
const SUPABASE_URL = "https://jjjombeomtbztzchiult.supabase.co";
const SUPABASE_KEY = "sb_publishable_6Le75u-UJnbGCZMbLQ8kQQ_9cFOsfIl";

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);

async function waitForSupabase(timeoutMs = 8000) {
  const start = Date.now();
  while (!window.supabase || !window.supabase.createClient) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 50));
  }
  return true;
}

let _sb = null;
function db() {
  if (_sb) return _sb;
  if (!window.supabase || !window.supabase.createClient) {
    throw new Error("Supabase library not loaded (window.supabase missing).");
  }
  _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return _sb;
}

function isToday(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

function ymd(d) {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

// 24-hour everywhere
function hhmm(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDayLabel(dateStr) {
  // Shown in UI as DD/MM/YYYY in picker
  const d = new Date(dateStr + "T00:00:00");
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function parsePickerValue(v) {
  // picker uses YYYY-MM-DD (input[type=date])
  return v;
}

function toIsoRangeForDate(dateStr) {
  const start = new Date(dateStr + "T00:00:00.000Z").toISOString();
  const end = new Date(dateStr + "T23:59:59.999Z").toISOString();
  return { start, end };
}

function showErr(err) {
  const msg = (err && err.message) ? err.message : String(err || "Unknown error");
  alert(msg);
}

/* ---------- global state ---------- */
let selectedDateStr = ymd(new Date());
let childId = null;

/* ---------- offline queue ---------- */
const QUEUE_KEY = "routine_offline_queue_v1";

function loadQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}
function queueInsert(table, payload) {
  const q = loadQueue();
  q.push({ op: "insert", table, payload, ts: Date.now() });
  saveQueue(q);
}

async function requireUser() {
  const { data, error } = await db().auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error("Not signed in.");
  return data.user;
}

async function flushQueue() {
  const q = loadQueue();
  if (!q.length) return;
  if (!navigator.onLine) return;

  let user = null;
  try {
    user = await requireUser();
  } catch {
    return;
  }

  const remaining = [];
  for (const item of q) {
    try {
      if (item.op === "insert") {
        const res = await db().from(item.table).insert(item.payload);
        if (res.error) throw res.error;
      }
    } catch (e) {
      console.warn("Offline queue item failed, keeping:", item, e);
      remaining.push(item);
    }
  }
  saveQueue(remaining);
}

/* ---------- view routing ---------- */
function hideAllViews() {
  document.querySelectorAll("[data-view]").forEach((el) => el.classList.add("hidden"));
}

function showView(viewId) {
  hideAllViews();
  const el = $(viewId);
  if (el) el.classList.remove("hidden");
  location.hash = viewId;
}

function currentHashView() {
  return (location.hash || "#authView").replace("#", "");
}

/* ---------- shared UI wiring ---------- */
function setDateControls(prefix) {
  const pick = $(`${prefix}Date`);
  if (pick) pick.value = selectedDateStr;
}

function bindDateControls(prefix, onChangeFn) {
  const prev = $(`${prefix}Prev`);
  const next = $(`${prefix}Next`);
  const pick = $(`${prefix}Date`);

  if (prev) {
    prev.onclick = async () => {
      const d = new Date(selectedDateStr + "T00:00:00");
      d.setDate(d.getDate() - 1);
      selectedDateStr = ymd(d);
      if (pick) pick.value = selectedDateStr;
      await onChangeFn();
    };
  }

  if (next) {
    next.onclick = async () => {
      const d = new Date(selectedDateStr + "T00:00:00");
      d.setDate(d.getDate() + 1);
      selectedDateStr = ymd(d);
      if (pick) pick.value = selectedDateStr;
      await onChangeFn();
    };
  }

  if (pick) {
    pick.onchange = async () => {
      selectedDateStr = parsePickerValue(pick.value);
      await onChangeFn();
    };
  }
}

async function fillChildSelect(selectId) {
  const sel = $(selectId);
  if (!sel) return;

  const res = await db().from("children").select("*").order("name");
  if (res.error) return showErr(res.error);

  sel.innerHTML = "";
  (res.data || []).forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });

  // keep existing child if possible
  if (!childId && res.data?.length) childId = res.data[0].id;
  if (childId) sel.value = childId;

  sel.onchange = async () => {
    childId = sel.value || null;
    // reload the current view
    await refreshCurrentView();
  };
}

async function refreshCurrentView() {
  const view = currentHashView();
  switch (view) {
    case "sleepView":
      await loadSleep();
      break;
    case "mealsView":
      await loadMeals();
      break;
    case "moodsView":
      await loadMoods();
      break;
    case "medView":
      await loadMedication();
      break;
    case "aiView":
      await loadAccidents();
      await loadIllnesses();
      break;
    case "summaryView":
      await loadSummary();
      break;
    default:
      break;
  }
}

/* ---------- AUTH ---------- */
async function doLogin() {
  try {
    const email = ($("loginEmail")?.value || "").trim();
    const password = $("loginPassword")?.value || "";
    if (!email || !password) return alert("Enter email and password.");

    const res = await db().auth.signInWithPassword({ email, password });
    if (res.error) return alert(res.error.message);

    showView("menuView");
  } catch (e) {
    showErr(e);
  }
}

async function doRegister() {
  try {
    const email = ($("loginEmail")?.value || "").trim();
    const password = $("loginPassword")?.value || "";
    const invite = ($("inviteCode")?.value || "").trim();

    if (invite !== "1006") return alert("Invite code is required to register.");
    if (!email || !password) return alert("Enter email and password.");

    const res = await db().auth.signUp({ email, password });
    if (res.error) return alert(res.error.message);

    alert("Registered. You can now log in.");
  } catch (e) {
    showErr(e);
  }
}

async function doForgot() {
  try {
    const email = ($("loginEmail")?.value || "").trim();
    if (!email) return alert("Enter your email first.");

    const res = await db().auth.resetPasswordForEmail(email);
    if (res.error) return alert(res.error.message);

    alert("Password reset email sent (if the email exists).");
  } catch (e) {
    showErr(e);
  }
}

async function doLogout() {
  try {
    await db().auth.signOut();
    showView("authView");
  } catch (e) {
    showErr(e);
  }
}

/* ---------- MENU NAV ---------- */
function wireMenuButtons() {
  $("btnSleep") && ($("btnSleep").onclick = async () => {
    showView("sleepView");
    await openSleep();
  });

  $("btnMeals") && ($("btnMeals").onclick = async () => {
    showView("mealsView");
    await openMeals();
  });

  $("btnMoods") && ($("btnMoods").onclick = async () => {
    showView("moodsView");
    await openMoods();
  });

  $("btnMedication") && ($("btnMedication").onclick = async () => {
    showView("medView");
    await openMedication();
  });

  $("btnAI") && ($("btnAI").onclick = async () => {
    showView("aiView");
    await openAI();
  });

  $("btnSummary") && ($("btnSummary").onclick = async () => {
    showView("summaryView");
    await openSummary();
  });

  $("btnAdmin") && ($("btnAdmin").onclick = async () => {
    showView("adminView");
    await openAdmin();
  });

  $("btnLogout") && ($("btnLogout").onclick = doLogout);
}

/* ---------- SUMMARY ---------- */
async function openSummary() {
  setDateControls("summary");
  await fillChildSelect("summaryChild");
  bindDateControls("summary", loadSummary);
  await loadSummary();
}

function makeSummaryCard(title, items, onClick) {
  const card = document.createElement("div");
  card.className = "card";
  card.style.cursor = onClick ? "pointer" : "default";

  const h = document.createElement("h3");
  h.style.marginBottom = "10px";
  h.textContent = title;
  card.appendChild(h);

  if (!items || !items.length) {
    const p = document.createElement("div");
    p.className = "muted";
    p.textContent = "No entries";
    card.appendChild(p);
  } else {
    const ul = document.createElement("ul");
    ul.className = "summaryUl";
    items.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });
    card.appendChild(ul);
  }

  if (onClick) card.onclick = onClick;
  return card;
}

async function loadSummary() {
  try {
    if (!childId) return;

    const container = $("summaryCards");
    if (!container) return; // prevents hard crash if HTML not added yet
    container.innerHTML = "";

    // ----- sleep -----
    const { start, end } = toIsoRangeForDate(selectedDateStr);
    const sleepRes = await db()
      .from("sleep_sessions")
      .select("*")
      .eq("child_id", childId)
      .gte("start_time", start)
      .lte("start_time", end)
      .order("start_time", { ascending: true });

    const sleepItems = [];
    if (!sleepRes.error && sleepRes.data) {
      sleepRes.data.forEach((s) => {
        sleepItems.push(`${hhmm(s.start_time)} → ${s.end_time ? hhmm(s.end_time) : "…"}${s.notes ? " • " + s.notes : ""}`);
      });
    }

    // ----- meals -----
    const mealRes = await db()
      .from("meals")
      .select("*")
      .eq("child_id", childId)
      .gte("meal_time", start)
      .lte("meal_time", end)
      .order("meal_time", { ascending: true });

    const mealItems = [];
    if (!mealRes.error && mealRes.data) {
      mealRes.data.forEach((m) => {
        const pct = (m.percent == null || m.percent === "") ? "" : ` • ${m.percent}%`;
        mealItems.push(`${m.meal_type || "Meal"}${pct}${m.what ? " • " + m.what : ""}`);
      });
    }

    // ----- moods -----
    const moodRes = await db()
      .from("moods")
      .select("*")
      .eq("child_id", childId)
      .gte("mood_time", start)
      .lte("mood_time", end)
      .order("mood_time", { ascending: true });

    const moodItems = [];
    if (!moodRes.error && moodRes.data) {
      moodRes.data.forEach((m) => {
        moodItems.push(`${m.period || "Mood"} • ${m.mood || ""}${m.notes ? " • " + m.notes : ""}`.trim());
      });
    }

    // ----- medication -----
    const medRes = await db()
      .from("medication_doses")
      .select("*, medications(name, unit)")
      .eq("child_id", childId)
      .gte("dose_time", start)
      .lte("dose_time", end)
      .order("dose_time", { ascending: true });

    const medItems = [];
    if (!medRes.error && medRes.data) {
      medRes.data.forEach((d) => {
        const medName = d.medications?.name || d.medication_name || "Medication";
        const unit = d.medications?.unit || "";
        medItems.push(`${hhmm(d.dose_time)} • ${medName} • ${d.dose}${unit ? " " + unit : ""}${d.notes ? " • " + d.notes : ""}`);
      });
    }

    // ----- accident -----
    const accRes = await db()
      .from("accidents")
      .select("*")
      .eq("child_id", childId)
      .gte("event_time", start)
      .lte("event_time", end)
      .order("event_time", { ascending: true });

    const accItems = [];
    if (!accRes.error && accRes.data) {
      accRes.data.forEach((a) => {
        accItems.push(`${hhmm(a.event_time)} • ${a.severity || ""}${a.body_area ? " • " + a.body_area : ""}${a.what ? " • " + a.what : ""}`.trim());
      });
    }

    // ----- illness -----
    const illRes = await db()
      .from("illnesses")
      .select("*")
      .eq("child_id", childId)
      .gte("event_time", start)
      .lte("event_time", end)
      .order("event_time", { ascending: true });

    const illItems = [];
    if (!illRes.error && illRes.data) {
      illRes.data.forEach((i) => {
        illItems.push(`${hhmm(i.event_time)} • ${i.symptom || ""}${i.temp ? " • " + i.temp + "°C" : ""}${i.notes ? " • " + i.notes : ""}`.trim());
      });
    }

    // Render cards (click goes to that page/date)
    container.appendChild(makeSummaryCard("Sleep", sleepItems, async () => {
      showView("sleepView");
      await openSleep();
    }));
    container.appendChild(makeSummaryCard("Meals", mealItems, async () => {
      showView("mealsView");
      await openMeals();
    }));
    container.appendChild(makeSummaryCard("Moods", moodItems, async () => {
      showView("moodsView");
      await openMoods();
    }));
    container.appendChild(makeSummaryCard("Medication", medItems, async () => {
      showView("medView");
      await openMedication();
    }));
    container.appendChild(makeSummaryCard("Accidents", accItems, async () => {
      showView("aiView");
      await openAI("accident");
    }));
    container.appendChild(makeSummaryCard("Illnesses", illItems, async () => {
      showView("aiView");
      await openAI("illness");
    }));
  } catch (e) {
    console.error(e);
    // do not hard-crash the view
  }
}

/* ---------- SLEEP ---------- */
async function openSleep() {
  setDateControls("sleep");
  await fillChildSelect("sleepChild");
  bindDateControls("sleep", loadSleep);
  $("sleepBack") && ($("sleepBack").onclick = () => showView("menuView"));

  $("btnSleepStart") && ($("btnSleepStart").onclick = sleepStart);
  $("btnSleepEnd") && ($("btnSleepEnd").onclick = sleepEnd);
  $("btnSleepManual") && ($("btnSleepManual").onclick = addSleepManual);

  await loadSleep();
}

async function loadSleep() {
  try {
    if (!childId) return;
    const { start, end } = toIsoRangeForDate(selectedDateStr);

    const res = await db()
      .from("sleep_sessions")
      .select("*")
      .eq("child_id", childId)
      .gte("start_time", start)
      .lte("start_time", end)
      .order("start_time", { ascending: false });

    if (res.error) return console.error(res.error);

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
    if (totalEl) {
      const mins = Math.round(totalMs / 60000);
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      totalEl.textContent = `${h}h ${String(m).padStart(2, "0")}m`;
    }
  } catch (e) {
    console.error(e);
  }
}

async function sleepStart() {
  try {
    if (!isToday(selectedDateStr)) return alert("Start/End buttons are for TODAY only.");
    if (!navigator.onLine) return alert("Start requires internet. Use Manual entry while offline.");

    const user = await requireUser();
    const notes = ($("sleepNote")?.value || "").trim() || null;

    const res = await db().from("sleep_sessions").insert({
      child_id: childId,
      start_time: new Date().toISOString(),
      notes,
      user_id: user.id,
    });

    if (res.error) return alert(res.error.message);
    await loadSleep();
  } catch (e) {
    showErr(e);
  }
}

async function sleepEnd() {
  try {
    if (!isToday(selectedDateStr)) return alert("Start/End buttons are for TODAY only.");
    if (!navigator.onLine) return alert("End requires internet. Use Manual entry while offline.");

    const open = await db()
      .from("sleep_sessions")
      .select("id")
      .eq("child_id", childId)
      .is("end_time", null)
      .order("start_time", { ascending: false })
      .limit(1);

    if (open.error) return alert(open.error.message);
    if (!open.data?.length) return alert("No active sleep session found.");

    const res = await db()
      .from("sleep_sessions")
      .update({ end_time: new Date().toISOString() })
      .eq("id", open.data[0].id);

    if (res.error) return alert(res.error.message);
    await loadSleep();
  } catch (e) {
    showErr(e);
  }
}

async function addSleepManual() {
  try {
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

    const res = await db().from("sleep_sessions").insert(payload);
    if (res.error) return alert(res.error.message);

    if ($("sleepStartManual")) $("sleepStartManual").value = "";
    if ($("sleepEndManual")) $("sleepEndManual").value = "";
    await loadSleep();
  } catch (e) {
    showErr(e);
  }
}

/* ---------- MEALS ---------- */
async function openMeals() {
  setDateControls("meals");
  await fillChildSelect("mealsChild");
  bindDateControls("meals", loadMeals);
  $("mealsBack") && ($("mealsBack").onclick = () => showView("menuView"));
  $("btnAddMeal") && ($("btnAddMeal").onclick = addMeal);
  await loadMeals();
}

async function loadMeals() {
  try {
    if (!childId) return;
    const { start, end } = toIsoRangeForDate(selectedDateStr);

    const res = await db()
      .from("meals")
      .select("*")
      .eq("child_id", childId)
      .gte("meal_time", start)
      .lte("meal_time", end)
      .order("meal_time", { ascending: false });

    if (res.error) return console.error(res.error);

    const list = $("mealsList");
    if (!list) return;
    list.innerHTML = "";

    (res.data || []).forEach((m) => {
      const pct = (m.percent == null || m.percent === "") ? "" : `${m.percent}%`;
      const li = document.createElement("li");
      li.textContent = `${m.meal_type || "Meal"}${pct ? " • " + pct : ""}${m.what ? " • " + m.what : ""}${m.notes ? " • " + m.notes : ""}`;
      list.appendChild(li);
    });
  } catch (e) {
    console.error(e);
  }
}

async function addMeal() {
  try {
    const mealType = $("mealType")?.value || null;
    const percent = $("mealPercent")?.value || null;
    const what = ($("mealWhat")?.value || "").trim() || null;
    const notes = ($("mealNotes")?.value || "").trim() || null;

    const user = await requireUser();
    const payload = {
      child_id: childId,
      meal_type: mealType,
      percent: percent === "" ? null : Number(percent),
      what,
      notes,
      meal_time: new Date(selectedDateStr + "T12:00:00").toISOString(),
      user_id: user.id,
    };

    if (!navigator.onLine) {
      queueInsert("meals", payload);
      alert("Saved offline. Will sync when online.");
      await loadMeals();
      return;
    }

    const res = await db().from("meals").insert(payload);
    if (res.error) return alert(res.error.message);

    $("mealWhat") && ($("mealWhat").value = "");
    $("mealNotes") && ($("mealNotes").value = "");
    await loadMeals();
  } catch (e) {
    showErr(e);
  }
}

/* ---------- MOODS ---------- */
async function openMoods() {
  setDateControls("moods");
  await fillChildSelect("moodsChild");
  bindDateControls("moods", loadMoods);
  $("moodsBack") && ($("moodsBack").onclick = () => showView("menuView"));
  $("btnSaveMood") && ($("btnSaveMood").onclick = saveMood);
  await loadMoods();
}

async function loadMoods() {
  try {
    if (!childId) return;
    const { start, end } = toIsoRangeForDate(selectedDateStr);

    const res = await db()
      .from("moods")
      .select("*")
      .eq("child_id", childId)
      .gte("mood_time", start)
      .lte("mood_time", end)
      .order("mood_time", { ascending: false });

    if (res.error) return console.error(res.error);

    const list = $("moodsList");
    if (!list) return;
    list.innerHTML = "";

    (res.data || []).forEach((m) => {
      const li = document.createElement("li");
      li.textContent = `${m.period || "Mood"} • ${m.mood || ""}${m.notes ? " • " + m.notes : ""}`;
      list.appendChild(li);
    });
  } catch (e) {
    console.error(e);
  }
}

async function saveMood() {
  try {
    const period = $("moodPeriod")?.value || null;
    const mood = $("moodValue")?.value || null;
    const notes = ($("moodNotes")?.value || "").trim() || null;

    const user = await requireUser();
    const payload = {
      child_id: childId,
      period,
      mood,
      notes,
      mood_time: new Date(selectedDateStr + "T12:00:00").toISOString(),
      user_id: user.id,
    };

    if (!navigator.onLine) {
      queueInsert("moods", payload);
      alert("Saved offline. Will sync when online.");
      await loadMoods();
      return;
    }

    const res = await db().from("moods").insert(payload);
    if (res.error) return alert(res.error.message);

    $("moodNotes") && ($("moodNotes").value = "");
    await loadMoods();
  } catch (e) {
    showErr(e);
  }
}

/* ---------- MEDICATION ---------- */
async function openMedication() {
  setDateControls("med");
  await fillChildSelect("medChild");
  bindDateControls("med", loadMedication);
  $("medBack") && ($("medBack").onclick = () => showView("menuView"));
  $("btnAddDose") && ($("btnAddDose").onclick = addDose);
  await loadMedication();
}

async function loadMedication() {
  try {
    if (!childId) return;
    const { start, end } = toIsoRangeForDate(selectedDateStr);

    // doses joined with medication name/unit
    const res = await db()
      .from("medication_doses")
      .select("*, medications(name, unit)")
      .eq("child_id", childId)
      .gte("dose_time", start)
      .lte("dose_time", end)
      .order("dose_time", { ascending: false });

    if (res.error) return console.error(res.error);

    const list = $("medList");
    if (!list) return;
    list.innerHTML = "";

    (res.data || []).forEach((d) => {
      const medName = d.medications?.name || d.medication_name || "Medication";
      const unit = d.medications?.unit || "";
      const li = document.createElement("li");
      li.textContent = `${hhmm(d.dose_time)} • ${medName} • ${d.dose}${unit ? " " + unit : ""}${d.notes ? " • " + d.notes : ""}`;
      list.appendChild(li);
    });
  } catch (e) {
    console.error(e);
  }
}

async function addDose() {
  try {
    const medId = $("doseMedication")?.value || null;
    const dose = ($("doseAmount")?.value || "").trim();
    const notes = ($("doseNotes")?.value || "").trim() || null;

    if (!medId) return alert("Pick a medication.");
    if (!dose) return alert("Enter a dose.");

    const user = await requireUser();
    const payload = {
      child_id: childId,
      medication_id: medId,
      dose: Number(dose),
      notes,
      dose_time: new Date().toISOString(),
      user_id: user.id,
    };

    if (!navigator.onLine) {
      queueInsert("medication_doses", payload);
      alert("Saved offline. Will sync when online.");
      await loadMedication();
      return;
    }

    const res = await db().from("medication_doses").insert(payload);
    if (res.error) return alert(res.error.message);

    $("doseAmount") && ($("doseAmount").value = "");
    $("doseNotes") && ($("doseNotes").value = "");
    await loadMedication();
  } catch (e) {
    showErr(e);
  }
}

/* ---------- ACCIDENT & ILLNESS ---------- */
let aiTab = "accident"; // "accident" | "illness"

async function openAI(forcedTab) {
  if (forcedTab) aiTab = forcedTab;
  setDateControls("ai");
  await fillChildSelect("aiChild");
  bindDateControls("ai", async () => {
    await loadAccidents();
    await loadIllnesses();
  });

  $("aiBack") && ($("aiBack").onclick = () => showView("menuView"));

  $("pillAccident") && ($("pillAccident").onclick = () => setAITab("accident"));
  $("pillIllness") && ($("pillIllness").onclick = () => setAITab("illness"));

  $("btnAddAccident") && ($("btnAddAccident").onclick = addAccident);
  $("btnAddIllness") && ($("btnAddIllness").onclick = addIllness);

  setAITab(aiTab);
  await loadAccidents();
  await loadIllnesses();
}

function setAITab(tab) {
  aiTab = tab;
  const acc = $("accidentPanel");
  const ill = $("illnessPanel");
  const pA = $("pillAccident");
  const pI = $("pillIllness");

  if (acc) acc.classList.toggle("hidden", tab !== "accident");
  if (ill) ill.classList.toggle("hidden", tab !== "illness");

  if (pA) pA.classList.toggle("active", tab === "accident");
  if (pI) pI.classList.toggle("active", tab === "illness");
}

async function loadAccidents() {
  try {
    if (!childId) return;
    const { start, end } = toIsoRangeForDate(selectedDateStr);

    const res = await db()
      .from("accidents")
      .select("*")
      .eq("child_id", childId)
      .gte("event_time", start)
      .lte("event_time", end)
      .order("event_time", { ascending: false });

    if (res.error) return console.error(res.error);

    const list = $("accList");
    if (!list) return;
    list.innerHTML = "";

    (res.data || []).forEach((a) => {
      const li = document.createElement("li");
      li.textContent = `${hhmm(a.event_time)} • ${a.severity || ""}${a.body_area ? " • " + a.body_area : ""}${a.what ? " • " + a.what : ""}`;
      list.appendChild(li);
    });
  } catch (e) {
    console.error(e);
  }
}

async function loadIllnesses() {
  try {
    if (!childId) return;
    const { start, end } = toIsoRangeForDate(selectedDateStr);

    const res = await db()
      .from("illnesses")
      .select("*")
      .eq("child_id", childId)
      .gte("event_time", start)
      .lte("event_time", end)
      .order("event_time", { ascending: false });

    if (res.error) return console.error(res.error);

    const list = $("illList");
    if (!list) return;
    list.innerHTML = "";

    (res.data || []).forEach((i) => {
      const li = document.createElement("li");
      li.textContent = `${hhmm(i.event_time)} • ${i.symptom || ""}${i.temp ? " • " + i.temp + "°C" : ""}${i.notes ? " • " + i.notes : ""}`;
      list.appendChild(li);
    });
  } catch (e) {
    console.error(e);
  }
}

async function addAccident() {
  try {
    const what = ($("accWhat")?.value || "").trim();
    const severity = $("accSeverity")?.value || null;
    const body = $("accBody")?.value || null;
    const where = ($("accWhere")?.value || "").trim() || null;
    const reported = $("accReported")?.value || null;
    const time = $("accTime")?.value || null;
    const action = ($("accAction")?.value || "").trim() || null;
    const safeguard = ($("accSafeguard")?.value || "").trim() || null;
    const notes = ($("accNotes")?.value || "").trim() || null;

    if (!what) return alert("Describe what happened.");

    const user = await requireUser();
    const eventTime = time
      ? new Date(`${selectedDateStr}T${time}:00`).toISOString()
      : new Date(`${selectedDateStr}T12:00:00`).toISOString();

    const payload = {
      child_id: childId,
      what,
      severity,
      body_area: body,
      where_happened: where,
      reported_by: reported,
      action_taken: action,
      safeguarding: safeguard,
      notes,
      event_time: eventTime,
      user_id: user.id,
    };

    if (!navigator.onLine) {
      queueInsert("accidents", payload);
      alert("Saved offline. Will sync when online.");
      await loadAccidents();
      return;
    }

    const res = await db().from("accidents").insert(payload);
    if (res.error) return alert(res.error.message);

    ["accWhat","accWhere","accAction","accSafeguard","accNotes"].forEach((id)=>{ if($(id)) $(id).value=""; });
    await loadAccidents();
  } catch (e) {
    showErr(e);
  }
}

async function addIllness() {
  try {
    const symptom = $("illSymptom")?.value || null;
    const temp = ($("illTemp")?.value || "").trim() || null;
    const medLink = $("illMed")?.value || null;
    const reported = $("illReported")?.value || null;
    const time = $("illTime")?.value || null;
    const notes = ($("illNotes")?.value || "").trim() || null;

    const user = await requireUser();
    const eventTime = time
      ? new Date(`${selectedDateStr}T${time}:00`).toISOString()
      : new Date(`${selectedDateStr}T12:00:00`).toISOString();

    const payload = {
      child_id: childId,
      symptom,
      temp: temp ? Number(temp) : null,
      medication_id: medLink && medLink !== "none" ? medLink : null,
      reported_by: reported,
      notes,
      event_time: eventTime,
      user_id: user.id,
    };

    if (!navigator.onLine) {
      queueInsert("illnesses", payload);
      alert("Saved offline. Will sync when online.");
      await loadIllnesses();
      return;
    }

    const res = await db().from("illnesses").insert(payload);
    if (res.error) return alert(res.error.message);

    ["illTemp","illNotes"].forEach((id)=>{ if($(id)) $(id).value=""; });
    await loadIllnesses();
  } catch (e) {
    showErr(e);
  }
}

/* ---------- ADMIN ---------- */
async function openAdmin() {
  $("adminBack") && ($("adminBack").onclick = () => showView("menuView"));
  $("btnAddChild") && ($("btnAddChild").onclick = addChild);
  $("btnAddMedication") && ($("btnAddMedication").onclick = addMedication);
  await loadAdminLists();
}

async function loadAdminLists() {
  try {
    // children list
    const cRes = await db().from("children").select("*").order("name");
    if (!cRes.error) {
      const ul = $("adminChildrenList");
      if (ul) {
        ul.innerHTML = "";
        (cRes.data || []).forEach((c) => {
          const li = document.createElement("li");
          li.textContent = c.name;
          ul.appendChild(li);
        });
      }
    }

    // meds list
    const mRes = await db().from("medications").select("*").order("name");
    if (!mRes.error) {
      const ul = $("adminMedsList");
      if (ul) {
        ul.innerHTML = "";
        (mRes.data || []).forEach((m) => {
          const li = document.createElement("li");
          li.textContent = `${m.name}${m.unit ? " (" + m.unit + ")" : ""}`;
          ul.appendChild(li);
        });
      }
    }

    // refresh medication selector on dose page if present
    const doseSel = $("doseMedication");
    if (doseSel && mRes.data) {
      doseSel.innerHTML = "";
      mRes.data.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.name;
        doseSel.appendChild(opt);
      });
    }
  } catch (e) {
    console.error(e);
  }
}

async function addChild() {
  try {
    const name = ($("newChildName")?.value || "").trim();
    if (!name) return alert("Enter a child name.");
    const res = await db().from("children").insert({ name });
    if (res.error) return alert(res.error.message);
    $("newChildName") && ($("newChildName").value = "");
    await loadAdminLists();
  } catch (e) {
    showErr(e);
  }
}

async function addMedication() {
  try {
    const name = ($("newMedName")?.value || "").trim();
    const unit = ($("newMedUnit")?.value || "").trim() || null;
    if (!name) return alert("Enter a medication name.");
    const res = await db().from("medications").insert({ name, unit });
    if (res.error) return alert(res.error.message);
    $("newMedName") && ($("newMedName").value = "");
    $("newMedUnit") && ($("newMedUnit").value = "");
    await loadAdminLists();
  } catch (e) {
    showErr(e);
  }
}

/* ---------- INIT ---------- */
async function init() {
  const ok = await waitForSupabase();
  if (!ok) {
    console.error("Supabase failed to load. Check index.html includes supabase-js script and service worker cache.");
    alert("Supabase failed to load. Please refresh (or clear site data) and try again.");
    return;
  }

  // try queue flush when online
  window.addEventListener("online", () => flushQueue().catch(() => {}));

  // wire auth buttons
  $("btnLogin") && ($("btnLogin").onclick = doLogin);
  $("btnRegister") && ($("btnRegister").onclick = doRegister);
  $("btnForgot") && ($("btnForgot").onclick = doForgot);

  wireMenuButtons();

  // restore session
  try {
    const ses = await db().auth.getSession();
    if (ses.data?.session) {
      showView("menuView");
      await flushQueue().catch(() => {});
    } else {
      showView("authView");
    }
  } catch (e) {
    console.error(e);
    showView("authView");
  }

  // hash navigation (if user refreshes while on a view)
  window.addEventListener("hashchange", async () => {
    const v = currentHashView();
    if ($(v)) {
      showView(v);
      await refreshCurrentView();
    }
  });

  // If page loaded directly on a view
  const v = currentHashView();
  if ($(v) && v !== "authView" && v !== "menuView") {
    showView(v);
    await refreshCurrentView();
  }
}

// run
init().catch((e) => console.error(e));
