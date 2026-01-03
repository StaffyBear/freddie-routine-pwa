/**************************************************
 * Routine Tracker – app.js
 * Version: 2026-01-03-offline-queue-historic-ui
 **************************************************/

const SITE_URL = "https://staffybear.github.io/freddie-routine-pwa/";
const SUPABASE_URL = "https://jjjombeomtbztzchiult.supabase.co";
const SUPABASE_KEY = "sb_publishable_6Le75u-UJnbGCZMbLQ8kQQ_9cFOsfIl";

const BACKDATED_TIME = "10:06";
const QUEUE_KEY = "offlineQueue_v1";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

let childId = null;
let selectedDateStr = null;

// View stack for Android back
const viewStack = [];

window.addEventListener("error", (e) => console.error("JS ERROR:", e.error || e.message));
window.addEventListener("unhandledrejection", (e) => console.error("PROMISE ERROR:", e.reason));

/* ----------------- Helpers ----------------- */
function pad2(n) { return String(n).padStart(2, "0"); }
function yyyyMmDd(d = new Date()) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}
function addDays(dateStr, delta) {
  const dt = parseDateStr(dateStr);
  dt.setDate(dt.getDate() + delta);
  return yyyyMmDd(dt);
}
function toIsoRangeForDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
  const end = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
  return { start, end };
}
function hhmm(iso) { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function combineDateAndTime(dateStr, timeStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}
function nowTimeStr() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function isToday(dateStr) { return dateStr === yyyyMmDd(new Date()); }
function autoTimestampForSelectedDay(dateStr) {
  return isToday(dateStr)
    ? new Date().toISOString()
    : combineDateAndTime(dateStr, BACKDATED_TIME);
}
function formatDateNice(dateStr) {
  const d = parseDateStr(dateStr);
  return d.toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

/* ----------------- Offline queue ----------------- */
function loadQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); }
  catch { return []; }
}
function saveQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }

function queueInsert(table, payload) {
  const q = loadQueue();
  q.push({ op: "insert", table, payload, queued_at: new Date().toISOString() });
  saveQueue(q);
  showOfflineBanner();
}

async function flushQueue() {
  const q = loadQueue();
  if (!q.length) {
    if ($("syncMsg")) $("syncMsg").textContent = "Nothing to sync.";
    return;
  }
  if (!navigator.onLine) {
    if ($("syncMsg")) $("syncMsg").textContent = "You are offline. Will sync when internet returns.";
    return;
  }

  if ($("syncMsg")) $("syncMsg").textContent = `Syncing ${q.length} item(s)…`;

  const user = await requireUser().catch(() => null);
  if (!user) {
    if ($("syncMsg")) $("syncMsg").textContent = "Login needed to sync.";
    return;
  }

  const remaining = [];
  for (const item of q) {
    try {
      if (item.op === "insert") {
        const res = await sb.from(item.table).insert(item.payload);
        if (res.error) throw res.error;
      }
    } catch (err) {
      console.error("Sync failed for item:", item, err);
      remaining.push(item); // keep it for later
    }
  }

  saveQueue(remaining);
  showOfflineBanner();

  if ($("syncMsg")) {
    $("syncMsg").textContent = remaining.length
      ? `Synced with errors. Remaining queued: ${remaining.length}`
      : "Sync complete ✅";
  }

  // Refresh visible data after sync
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
    banner.textContent = `ONLINE: ${q.length} item(s) waiting to sync. Tap "Sync Now".`;
    return;
  }

  banner.classList.add("hidden");
}

/* ----------------- Views + Android back ----------------- */
function hideAllViews() {
  [
    "authView","resetView","menuView","addMedicationView","historicRoutineView",
    "historicAIView","trackerView","accidentView","exportView"
  ].forEach((id) => { const el = $(id); if (el) el.style.display = "none"; });
}

function getCurrentViewId() {
  const ids = [
    "authView","resetView","menuView","addMedicationView","historicRoutineView",
    "historicAIView","trackerView","accidentView","exportView"
  ];
  for (const id of ids) {
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
      history.pushState({ view: id }, "", "#view=" + id);
    }
  }
  hideAllViews();
  $(id).style.display = "block";
  applyHistoricUI(); // ensure UI matches date state
}

window.addEventListener("popstate", () => {
  const prev = viewStack.pop();
  if (prev) {
    hideAllViews();
    $(prev).style.display = "block";
    updateDateLabels();
    applyHistoricUI();
  }
});

/* ----------------- Date labels + Historic UI rules ----------------- */
function updateDateLabels() {
  const nice = formatDateNice(selectedDateStr);
  const historic = !isToday(selectedDateStr);

  const t = $("trackerDateLabel");
  if (t) {
    t.textContent = nice;
    t.classList.toggle("historicDate", historic);
  }

  const a = $("aiDateLabel");
  if (a) {
    a.textContent = nice;
    a.classList.toggle("historicDate", historic);
  }
}

function setHistoricCards(isHistoric) {
  const ids = [
    "trackerTopCard","sleepCard","mealsCard","moodCard","medCard",
    "aiTopCard","accidentTab","illnessTab"
  ];
  for (const id of ids) {
    const el = $(id);
    if (el) el.classList.toggle("historicCard", isHistoric);
  }
}

function applyHistoricUI() {
  if (!selectedDateStr) return;
  const historic = !isToday(selectedDateStr);

  updateDateLabels();
  setHistoricCards(historic);

  // Remove time input options on historic dates
  const medWrap = $("medTimeWrap");
  const accWrap = $("accTimeWrap");
  const illWrap = $("illTimeWrap");

  if (medWrap) medWrap.style.display = historic ? "none" : "block";
  if (accWrap) accWrap.style.display = historic ? "none" : "block";
  if (illWrap) illWrap.style.display = historic ? "none" : "block";
}

async function setSelectedDate(dateStr, refresh = true) {
  selectedDateStr = dateStr;
  applyHistoricUI();
  if (refresh) await refreshVisible();
}

async function refreshVisible() {
  const current = getCurrentViewId();
  if (current === "trackerView") await refreshAll();
  if (current === "accidentView") await Promise.all([loadAccidents(), loadIllnesses()]);
}

/* ----------------- Auth helpers ----------------- */
async function requireUser() {
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error("Not logged in.");
  return data.user;
}

/* ----------------- AUTH ----------------- */
async function doRegister() {
  const email = $("email").value.trim();
  const password = $("password").value;
  if (!email || !password) return ($("authMsg").textContent = "Enter BOTH email and password.");

  $("authMsg").textContent = "Registering…";
  const res = await sb.auth.signUp({ email, password, options: { emailRedirectTo: SITE_URL } });
  if (res.error) return ($("authMsg").textContent = res.error.message);
  $("authMsg").textContent = "Registered ✅ Now click Login (or confirm email if required).";
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
}

async function doForgotPassword() {
  const email = $("email").value.trim();
  if (!email) return ($("authMsg").textContent = "Enter your email first, then click Forgot password.");

  $("authMsg").textContent = "Sending password reset email…";
  const res = await sb.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL });
  if (res.error) return ($("authMsg").textContent = res.error.message);

  $("authMsg").textContent = "Reset email sent ✅ Check your inbox/spam.";
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

/* ----------------- PWA install prompt ----------------- */
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
      "If you don’t see an install prompt: Chrome menu (⋮) → Install app / Add to Home screen.";
    return;
  }
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if ($("installMsg")) $("installMsg").textContent = outcome === "accepted" ? "Installed ✅" : "Install cancelled.";
  deferredPrompt = null;
  $("btnInstallApp").style.display = "none";
}

/* ----------------- MENU ----------------- */
async function goMenu() {
  showView("menuView");
  showOfflineBanner();
}

/* ----------------- Service Worker registration ----------------- */
async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    console.log("SW registered ✅");
  } catch (e) {
    console.warn("SW register failed:", e);
  }
}

/* ----------------- Children ----------------- */
async function loadChildrenDropdown() {
  const res = await sb.from("children").select("id,name").order("created_at", { ascending: true });
  if (res.error) {
    childId = null;
    return;
  }

  const children = res.data || [];
  const sel = $("childSelect");
  sel.innerHTML = "";

  if (!children.length) {
    sel.innerHTML = `<option value="">No children yet</option>`;
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

  sel.onchange = () => {
    childId = sel.value;
    localStorage.setItem("activeChildId", childId);
    refreshAll();
  };
}

async function addChild() {
  const name = $("childName").value.trim();
  if (!name) return alert("Enter a child name.");

  const user = await requireUser();
  const payload = { name, user_id: user.id };

  if (!navigator.onLine) {
    queueInsert("children", payload);
    $("childName").value = "";
    alert("Saved offline. It will sync when online.");
    return;
  }

  const res = await sb.from("children").insert(payload);
  if (res.error) return alert(res.error.message);

  $("childName").value = "";
  await loadChildrenDropdown();
  await refreshAll();
}

/* ----------------- New Medication page ----------------- */
async function goAddMedication() {
  showView("addMedicationView");
  $("medAdminMsg").textContent = "";
}

async function addMedicationFromPage() {
  const name = $("newMedNameMenu").value.trim();
  const default_unit = $("newMedUnitMenu").value.trim() || null;
  if (!name) return alert("Enter medication name.");

  const user = await requireUser();
  const payload = { name, default_unit, user_id: user.id };

  if (!navigator.onLine) {
    queueInsert("medications", payload);
    $("newMedNameMenu").value = "";
    $("newMedUnitMenu").value = "";
    $("medAdminMsg").textContent = "Saved offline. Will sync when online.";
    return;
  }

  const res = await sb.from("medications").insert(payload);
  if (res.error) return alert(res.error.message);

  $("newMedNameMenu").value = "";
  $("newMedUnitMenu").value = "";
  $("medAdminMsg").textContent = "Medication added ✅";

  await loadMedsAndDoses();
  await loadIllnessMedicationDropdown();
}

/* ----------------- Tracker ----------------- */
async function goTracker(dateStr) {
  showView("trackerView");
  await setSelectedDate(dateStr || yyyyMmDd(new Date()), false);
  $("medTime").value = nowTimeStr();

  $("sleepStartManual").value = "";
  $("sleepEndManual").value = "";

  await loadChildrenDropdown();
  await refreshAll();
}

async function refreshAll() {
  if (!childId) return;
  await Promise.all([loadSleep(), loadMeals(), loadMoods(), loadMedsAndDoses()]);
}

/* ----------------- Sleep ----------------- */
async function loadSleep() {
  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb
    .from("sleep_sessions")
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

  if (!navigator.onLine) {
    alert("Sleep Start requires internet (because it opens an active session). Use Manual sleep entry while offline.");
    return;
  }

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

  if (!navigator.onLine) {
    alert("Sleep End requires internet. Use Manual sleep entry while offline.");
    return;
  }

  const open = await sb
    .from("sleep_sessions")
    .select("id")
    .eq("child_id", childId)
    .is("end_time", null)
    .order("start_time", { ascending: false })
    .limit(1);

  if (open.error) return alert(open.error.message);
  if (!open.data?.length) return alert("No active sleep session found.");

  const res = await sb.from("sleep_sessions").update({ end_time: new Date().toISOString() }).eq("id", open.data[0].id);
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
    $("sleepStartManual").value = "";
    $("sleepEndManual").value = "";
    alert("Saved offline. Will sync when online.");
    return;
  }

  const res = await sb.from("sleep_sessions").insert(payload);
  if (res.error) return alert(res.error.message);

  $("sleepStartManual").value = "";
  $("sleepEndManual").value = "";
  await loadSleep();
}

/* ----------------- Meals ----------------- */
async function loadMeals() {
  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb
    .from("meals")
    .select("*")
    .eq("child_id", childId)
    .gte("time", start)
    .lte("time", end)
    .order("time", { ascending: false });

  if (res.error) return;

  $("mealList").innerHTML = (res.data || [])
    .map(m => `<li>${m.meal_type} • ${m.percent_eaten}% • ${m.food_text ?? ""}${m.notes ? " • " + m.notes : ""}</li>`)
    .join("");
}

async function addMeal() {
  if (!childId) return alert("Select/add a child first.");

  const user = await requireUser();
  const payload = {
    child_id: childId,
    meal_type: $("mealType").value,
    percent_eaten: parseInt($("mealPercent").value, 10),
    food_text: $("mealFood").value.trim() || null,
    notes: $("mealNotes").value.trim() || null,
    time: autoTimestampForSelectedDay(selectedDateStr),
    user_id: user.id,
  };

  if (!navigator.onLine) {
    queueInsert("meals", payload);
    $("mealFood").value = "";
    $("mealNotes").value = "";
    alert("Saved offline. Will sync when online.");
    return;
  }

  const res = await sb.from("meals").insert(payload);
  if (res.error) return alert(res.error.message);

  $("mealFood").value = "";
  $("mealNotes").value = "";
  await loadMeals();
}

/* ----------------- Moods ----------------- */
async function loadMoods() {
  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb
    .from("moods")
    .select("*")
    .eq("child_id", childId)
    .gte("time", start)
    .lte("time", end)
    .order("time", { ascending: false });

  if (res.error) return;

  $("moodList").innerHTML = (res.data || [])
    .map(m => `<li>${m.period}: ${m.mood}${m.notes ? " • " + m.notes : ""}</li>`)
    .join("");
}

async function addMood() {
  if (!childId) return alert("Select/add a child first.");

  const user = await requireUser();
  const payload = {
    child_id: childId,
    period: $("moodPeriod").value,
    mood: $("moodValue").value,
    notes: $("moodNotes").value.trim() || null,
    time: autoTimestampForSelectedDay(selectedDateStr),
    user_id: user.id,
  };

  if (!navigator.onLine) {
    queueInsert("moods", payload);
    $("moodNotes").value = "";
    alert("Saved offline. Will sync when online.");
    return;
  }

  const res = await sb.from("moods").insert(payload);
  if (res.error) return alert(res.error.message);

  $("moodNotes").value = "";
  await loadMoods();
}

/* ----------------- Medication doses ----------------- */
async function loadMedsAndDoses() {
  const meds = await sb.from("medications").select("id,name,default_unit").order("name");
  if (!meds.error) {
    $("medSelect").innerHTML =
      (meds.data || [])
        .map(m => `<option value="${m.id}">${m.name}${m.default_unit ? " (" + m.default_unit + ")" : ""}</option>`)
        .join("") || `<option value="">No meds yet</option>`;
  }

  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const doses = await sb
    .from("medication_doses")
    .select("given_at,dose,notes,medications(name)")
    .eq("child_id", childId)
    .gte("given_at", start)
    .lte("given_at", end)
    .order("given_at", { ascending: false });

  if (!doses.error) {
    $("medList").innerHTML = (doses.data || [])
      .map(d => `<li>${hhmm(d.given_at)} • ${d.medications?.name ?? "Medication"} • ${d.dose}${d.notes ? " • " + d.notes : ""}</li>`)
      .join("");
  }
}

async function addDose() {
  if (!childId) return alert("Select/add a child first.");

  const medication_id = $("medSelect").value;
  const dose = $("medDose").value.trim();
  const notes = $("medNotes").value.trim() || null;
  if (!medication_id) return alert("Add/select a medication first.");
  if (!dose) return alert("Enter a dose.");

  const user = await requireUser();

  // Remove time option from historic dates: hide input; always use 10:06 for historic
  const given_at = isToday(selectedDateStr)
    ? combineDateAndTime(selectedDateStr, ($("medTime")?.value || nowTimeStr()))
    : combineDateAndTime(selectedDateStr, BACKDATED_TIME);

  const payload = { child_id: childId, medication_id, dose, notes, given_at, user_id: user.id };

  if (!navigator.onLine) {
    queueInsert("medication_doses", payload);
    $("medDose").value = "";
    $("medNotes").value = "";
    alert("Saved offline. Will sync when online.");
    return;
  }

  const res = await sb.from("medication_doses").insert(payload);
  if (res.error) return alert(res.error.message);

  $("medDose").value = "";
  $("medNotes").value = "";
  await loadMedsAndDoses();
}

/* ----------------- Accident & Illness ----------------- */
function setTab(which) {
  const accTabBtn = $("tabAccident");
  const illTabBtn = $("tabIllness");
  const accTab = $("accidentTab");
  const illTab = $("illnessTab");

  if (which === "accident") {
    accTabBtn.classList.add("active");
    illTabBtn.classList.remove("active");
    accTab.style.display = "block";
    illTab.style.display = "none";
  } else {
    illTabBtn.classList.add("active");
    accTabBtn.classList.remove("active");
    illTab.style.display = "block";
    accTab.style.display = "none";
  }
}

function toggleOther(selectId, inputId) {
  const sel = $(selectId);
  const inp = $(inputId);
  const isOther = sel.value === "Other";
  inp.classList.toggle("hidden", !isOther);
  if (!isOther) inp.value = "";
}

function updateBreathingFlag() {
  const isBreathing = $("illSymptom").value === "Breathing difficulties";
  $("illFlag").style.display = isBreathing ? "block" : "none";
}

async function syncAIChildSelect() {
  const res = await sb.from("children").select("id,name").order("created_at", { ascending: true });
  if (res.error) return alert("Error loading children: " + res.error.message);

  const children = res.data || [];
  const sel = $("aiChildSelect");
  sel.innerHTML = "";

  if (!children.length) {
    sel.innerHTML = `<option value="">No children yet</option>`;
    return;
  }

  children.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });

  sel.value = childId || children[0].id;
  childId = sel.value;

  sel.onchange = async () => {
    childId = sel.value;
    localStorage.setItem("activeChildId", childId);
    await Promise.all([loadAccidents(), loadIllnesses()]);
  };
}

async function loadAccidents() {
  if (!childId) return;

  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb
    .from("accidents")
    .select("*")
    .eq("child_id", childId)
    .gte("incident_time", start)
    .lte("incident_time", end)
    .order("incident_time", { ascending: false });

  if (res.error) return;

  $("accidentList").innerHTML = (res.data || [])
    .map(a => {
      const body = a.body_area === "Other" ? `Other: ${a.body_area_other}` : a.body_area;
      const rep = a.reported_by === "Other" ? `Other: ${a.reported_by_other}` : a.reported_by;
      return `<li><b>${a.severity}</b> • ${body} • ${a.what_happened}${a.where_happened ? " • " + a.where_happened : ""} • Reported: ${rep}${a.notes ? " • " + a.notes : ""}</li>`;
    })
    .join("");
}

async function addAccident() {
  if (!childId) return alert("Select a child first.");
  const user = await requireUser();

  const what = $("accWhat").value.trim();
  if (!what) return alert("Accident: 'What happened' is required.");

  const bodyArea = $("accBodyArea").value;
  const bodyOther = $("accBodyOther").value.trim();
  if (bodyArea === "Other" && !bodyOther) return alert("Accident: Body area 'Other' must be filled in.");

  const repBy = $("accReportedBy").value;
  const repOther = $("accReportedOther").value.trim();
  if (repBy === "Other" && !repOther) return alert("Accident: Reported by 'Other' must be filled in.");

  // Historic dates: no time option, always 10:06
  const incident_time = isToday(selectedDateStr)
    ? combineDateAndTime(selectedDateStr, ($("accTime")?.value || nowTimeStr()))
    : combineDateAndTime(selectedDateStr, BACKDATED_TIME);

  const payload = {
    user_id: user.id,
    child_id: childId,
    incident_time,
    what_happened: what,
    severity: $("accSeverity").value,
    body_area: bodyArea,
    body_area_other: bodyArea === "Other" ? bodyOther : null,
    where_happened: $("accWhere").value.trim() || null,
    reported_by: repBy,
    reported_by_other: repBy === "Other" ? repOther : null,
    action_taken: $("accAction").value.trim() || null,
    safeguarding: $("accSafeguarding").value.trim() || null,
    notes: $("accNotes").value.trim() || null
  };

  if (!navigator.onLine) {
    queueInsert("accidents", payload);
    alert("Saved offline. Will sync when online.");
    // clear form
  } else {
    const res = await sb.from("accidents").insert(payload);
    if (res.error) return alert(res.error.message);
  }

  $("accWhat").value = "";
  $("accWhere").value = "";
  $("accAction").value = "";
  $("accSafeguarding").value = "";
  $("accNotes").value = "";
  if ($("accTime")) $("accTime").value = nowTimeStr();
  $("accBodyArea").value = "Head";
  $("accReportedBy").value = "Mum";
  toggleOther("accBodyArea", "accBodyOther");
  toggleOther("accReportedBy", "accReportedOther");

  await loadAccidents();
}

async function loadIllnessMedicationDropdown() {
  const meds = await sb.from("medications").select("id,name,default_unit").order("name");
  if (meds.error) {
    $("illMedication").innerHTML = `<option value="">(error loading meds)</option>`;
    return;
  }

  const options = [`<option value="">None</option>`].concat(
    (meds.data || []).map(m => `<option value="${m.id}">${m.name}${m.default_unit ? " (" + m.default_unit + ")" : ""}</option>`)
  );
  $("illMedication").innerHTML = options.join("");
}

async function loadIllnesses() {
  if (!childId) return;

  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb
    .from("illnesses")
    .select("*, medications(name)")
    .eq("child_id", childId)
    .gte("event_time", start)
    .lte("event_time", end)
    .order("event_time", { ascending: false });

  if (res.error) return;

  $("illnessList").innerHTML = (res.data || [])
    .map(i => {
      const symptom = i.symptom === "Other" ? `Other: ${i.symptom_other}` : i.symptom;
      const rep = i.reported_by === "Other" ? `Other: ${i.reported_by_other}` : i.reported_by;
      const temp = (i.temperature_c !== null && i.temperature_c !== undefined) ? ` • ${i.temperature_c}°C` : "";
      const med = i.medications?.name ? ` • Med: ${i.medications.name}` : "";
      return `<li>${symptom}${temp}${med} • Reported: ${rep}${i.notes ? " • " + i.notes : ""}</li>`;
    })
    .join("");
}

async function addIllness() {
  if (!childId) return alert("Select a child first.");
  const user = await requireUser();

  const symptom = $("illSymptom").value;
  const symptomOther = $("illSymptomOther").value.trim();
  if (symptom === "Other" && !symptomOther) return alert("Illness: Symptom 'Other' must be filled in.");

  const repBy = $("illReportedBy").value;
  const repOther = $("illReportedOther").value.trim();
  if (repBy === "Other" && !repOther) return alert("Illness: Reported by 'Other' must be filled in.");

  // Historic dates: no time option, always 10:06
  const event_time = isToday(selectedDateStr)
    ? combineDateAndTime(selectedDateStr, ($("illTime")?.value || nowTimeStr()))
    : combineDateAndTime(selectedDateStr, BACKDATED_TIME);

  const tRaw = $("illTemp").value.trim();
  let temperature_c = null;
  if (tRaw) {
    const t = Number(tRaw);
    if (Number.isNaN(t)) return alert("Illness: Temperature must be a number (e.g. 38.2).");
    temperature_c = t;
  }

  const medication_id = $("illMedication").value || null;

  const payload = {
    user_id: user.id,
    child_id: childId,
    event_time,
    symptom,
    symptom_other: symptom === "Other" ? symptomOther : null,
    temperature_c,
    medication_id,
    reported_by: repBy,
    reported_by_other: repBy === "Other" ? repOther : null,
    notes: $("illNotes").value.trim() || null
  };

  if (!navigator.onLine) {
    queueInsert("illnesses", payload);
    alert("Saved offline. Will sync when online.");
  } else {
    const res = await sb.from("illnesses").insert(payload);
    if (res.error) return alert(res.error.message);
  }

  $("illNotes").value = "";
  $("illTemp").value = "";
  if ($("illTime")) $("illTime").value = nowTimeStr();
  $("illMedication").value = "";
  $("illSymptom").value = "Temperature";
  $("illReportedBy").value = "Mum";
  toggleOther("illSymptom", "illSymptomOther");
  toggleOther("illReportedBy", "illReportedOther");
  updateBreathingFlag();

  await loadIllnesses();
}

/* ----------------- Navigation setup ----------------- */
function setupNav() {
  // Menu
  $("btnGoTracker").onclick = () => goTracker(yyyyMmDd(new Date()));

  $("btnGoAccident").onclick = async () => {
    showView("accidentView");
    await setSelectedDate(yyyyMmDd(new Date()), false);

    await syncAIChildSelect();
    if ($("accTime")) $("accTime").value = nowTimeStr();
    if ($("illTime")) $("illTime").value = nowTimeStr();

    setTab("accident");
    toggleOther("accBodyArea", "accBodyOther");
    toggleOther("accReportedBy", "accReportedOther");
    toggleOther("illSymptom", "illSymptomOther");
    toggleOther("illReportedBy", "illReportedOther");
    updateBreathingFlag();

    await loadIllnessMedicationDropdown();
    await Promise.all([loadAccidents(), loadIllnesses()]);
  };

  $("btnGoAddMedication").onclick = goAddMedication;
  $("btnAddMedBackToMenu").onclick = goMenu;

  $("btnGoHistoricTracker").onclick = () => {
    showView("historicRoutineView");
    $("historicRoutinePick").value = selectedDateStr || yyyyMmDd(new Date());
  };

  $("btnGoHistoricAccident").onclick = () => {
    showView("historicAIView");
    $("historicAIPick").value = selectedDateStr || yyyyMmDd(new Date());
  };

  $("btnOpenHistoricRoutine").onclick = () => {
    const d = $("historicRoutinePick").value;
    if (!d) return alert("Pick a date.");
    goTracker(d);
  };

  $("btnOpenHistoricAI").onclick = async () => {
    const d = $("historicAIPick").value;
    if (!d) return alert("Pick a date.");

    showView("accidentView");
    await setSelectedDate(d, false);

    await syncAIChildSelect();
    if ($("accTime")) $("accTime").value = nowTimeStr();
    if ($("illTime")) $("illTime").value = nowTimeStr();

    setTab("accident");
    toggleOther("accBodyArea", "accBodyOther");
    toggleOther("accReportedBy", "accReportedOther");
    toggleOther("illSymptom", "illSymptomOther");
    toggleOther("illReportedBy", "illReportedOther");
    updateBreathingFlag();

    await loadIllnessMedicationDropdown();
    await Promise.all([loadAccidents(), loadIllnesses()]);
  };

  $("btnHistoricRoutineBackToMenu").onclick = goMenu;
  $("btnHistoricAIBackToMenu").onclick = goMenu;

  $("btnGoExport").onclick = () => showView("exportView");
  $("btnExportBackToMenu").onclick = goMenu;

  $("btnBackToMenu").onclick = goMenu;
  $("btnAIBackToMenu").onclick = goMenu;

  // Day nav
  $("btnTrackerPrevDay").onclick = () => setSelectedDate(addDays(selectedDateStr, -1), true);
  $("btnTrackerNextDay").onclick = () => setSelectedDate(addDays(selectedDateStr,  1), true);
  $("btnAIPrevDay").onclick = () => setSelectedDate(addDays(selectedDateStr, -1), true);
  $("btnAINextDay").onclick = () => setSelectedDate(addDays(selectedDateStr,  1), true);

  // Install
  $("btnInstallApp").onclick = promptInstall;

  // Sync
  $("btnSyncNow").onclick = flushQueue;
}

/* ----------------- DOM READY ----------------- */
document.addEventListener("DOMContentLoaded", async () => {
  // SW for offline shell
  await registerSW();

  // online/offline events
  window.addEventListener("online", async () => {
    showOfflineBanner();
    await flushQueue();
  });
  window.addEventListener("offline", () => showOfflineBanner());

  selectedDateStr = yyyyMmDd(new Date());
  applyHistoricUI();

  // Auth
  $("btnRegister").onclick = doRegister;
  $("btnLogin").onclick = doLogin;
  $("btnForgotPassword").onclick = doForgotPassword;

  // Reset
  $("btnSetNewPassword").onclick = setNewPassword;
  $("btnBackToLogin").onclick = () => showView("authView", false);

  // New medication page
  $("btnAddMedMenu").onclick = addMedicationFromPage;

  // Tracker actions
  $("btnAddChild").onclick = addChild;
  $("btnSleepStart").onclick = sleepStart;
  $("btnSleepEnd").onclick = sleepEnd;
  $("btnAddSleepManual").onclick = addSleepManual;
  $("btnAddMeal").onclick = addMeal;
  $("btnAddMood").onclick = addMood;
  $("btnAddDose").onclick = addDose;

  // A&I wiring
  $("tabAccident").onclick = () => setTab("accident");
  $("tabIllness").onclick = () => setTab("illness");
  $("accBodyArea").onchange = () => toggleOther("accBodyArea", "accBodyOther");
  $("accReportedBy").onchange = () => toggleOther("accReportedBy", "accReportedOther");
  $("illSymptom").onchange = () => { toggleOther("illSymptom", "illSymptomOther"); updateBreathingFlag(); };
  $("illReportedBy").onchange = () => toggleOther("illReportedBy", "illReportedOther");
  $("btnAddAccident").onclick = addAccident;
  $("btnAddIllness").onclick = addIllness;

  // Logout
  $("btnLogout").onclick = async () => {
    await sb.auth.signOut();
    childId = null;
    showView("authView", false);
  };

  // Nav
  setupNav();

  // Boot
  if (isRecoveryLink()) {
    showView("resetView", false);
    $("resetMsg").textContent = "";
    return;
  }

  const { data } = await sb.auth.getSession();
  if (data?.session) await goMenu();
  else showView("authView", false);

  showOfflineBanner();
});
