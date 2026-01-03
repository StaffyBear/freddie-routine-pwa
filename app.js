/**************************************************
 * Freddie Routine – app.js
 * Version: 2026-01-03-accidents-illness-meds-menu
 **************************************************/

const SITE_URL = "https://staffybear.github.io/freddie-routine-pwa/";
const SUPABASE_URL = "https://jjjombeomtbztzchiult.supabase.co";
const SUPABASE_KEY = "sb_publishable_6Le75u-UJnbGCZMbLQ8kQQ_9cFOsfIl";

// Backdated entries (selected day != today) stored at 10:06
const BACKDATED_TIME = "10:06"; // HH:MM

console.log("APP LOADED ✅", new Date().toISOString());

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

let childId = null;
let selectedDateStr = null; // YYYY-MM-DD

window.addEventListener("error", (e) => console.error("JS ERROR:", e.error || e.message));
window.addEventListener("unhandledrejection", (e) => console.error("PROMISE ERROR:", e.reason));

/* ----------------- Helpers ----------------- */
function yyyyMmDd(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toIsoRangeForDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
  const end = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
  return { start, end };
}

function hhmm(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function combineDateAndTime(dateStr, timeStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

function nowTimeStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isTodaySelected(dateStr) {
  const ds = dateStr || selectedDateStr;
  return ds === yyyyMmDd(new Date());
}

function autoTimestampForSelectedDay(dateStr) {
  const ds = dateStr || selectedDateStr;
  return isTodaySelected(ds)
    ? new Date().toISOString()
    : combineDateAndTime(ds, BACKDATED_TIME);
}

/* ----------------- View switching ----------------- */
function hideAllViews() {
  ["authView", "resetView", "menuView", "trackerView", "previousView", "exportView", "accidentView"].forEach((id) => {
    const el = $(id);
    if (el) el.style.display = "none";
  });
}
function showView(id) {
  hideAllViews();
  $(id).style.display = "block";
}

/* ----------------- Auth helpers ----------------- */
async function requireUser() {
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error("Not logged in. Please login again.");
  return data.user;
}

/* ----------------- AUTH actions ----------------- */
async function doRegister() {
  const email = $("email").value.trim();
  const password = $("password").value;

  if (!email || !password) {
    $("authMsg").textContent = "Enter BOTH email and password.";
    return;
  }

  $("authMsg").textContent = "Registering…";
  const res = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: SITE_URL },
  });

  if (res.error) {
    $("authMsg").textContent = res.error.message;
    return;
  }
  $("authMsg").textContent = "Registered ✅ Now click Login (or confirm email if required).";
}

async function doLogin() {
  const email = $("email").value.trim();
  const password = $("password").value;

  if (!email || !password) {
    $("authMsg").textContent = "Enter BOTH email and password.";
    return;
  }

  $("authMsg").textContent = "Logging in…";
  const res = await sb.auth.signInWithPassword({ email, password });

  if (res.error) {
    $("authMsg").textContent = res.error.message;
    return;
  }

  $("authMsg").textContent = "";
  await goMenu();
}

async function doForgotPassword() {
  const email = $("email").value.trim();
  if (!email) {
    $("authMsg").textContent = "Enter your email first, then click Forgot password.";
    return;
  }

  $("authMsg").textContent = "Sending password reset email…";
  const res = await sb.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL });

  if (res.error) {
    $("authMsg").textContent = res.error.message;
    return;
  }

  $("authMsg").textContent = "Reset email sent ✅ Check your inbox/spam.";
}

function isRecoveryLink() {
  return (location.hash || "").includes("type=recovery");
}

async function setNewPassword() {
  const p1 = $("newPassword").value;
  const p2 = $("newPassword2").value;

  if (!p1 || p1.length < 6) {
    $("resetMsg").textContent = "Password must be at least 6 characters.";
    return;
  }
  if (p1 !== p2) {
    $("resetMsg").textContent = "Passwords do not match.";
    return;
  }

  $("resetMsg").textContent = "Updating password…";
  const res = await sb.auth.updateUser({ password: p1 });

  if (res.error) {
    $("resetMsg").textContent = res.error.message;
    return;
  }

  $("resetMsg").textContent = "Password updated ✅ Please login.";
  history.replaceState(null, "", location.pathname + location.search);
  await sb.auth.signOut();
  showView("authView");
}

/* ----------------- MENU ----------------- */
async function goMenu() {
  showView("menuView");
  $("menuMsg").textContent = "Choose what you want to do.";
  $("medAdminMsg").textContent = "";
}

/* ----------------- Tracker init ----------------- */
async function goTracker(dateStr = null) {
  showView("trackerView");

  selectedDateStr = dateStr || yyyyMmDd(new Date());
  $("selectedDate").value = selectedDateStr;

  // med time picker default only for today
  $("medTime").value = nowTimeStr();

  // Sleep manual inputs
  $("sleepStartManual").value = "";
  $("sleepEndManual").value = "";

  await loadChildrenDropdown();
  await refreshAll();
}

/* ----------------- Children dropdown ----------------- */
async function loadChildrenDropdown() {
  const res = await sb.from("children").select("id,name").order("created_at", { ascending: true });
  if (res.error) {
    $("childInfo").textContent = "Error loading children: " + res.error.message;
    childId = null;
    return;
  }

  const children = res.data || [];
  const sel = $("childSelect");
  sel.innerHTML = "";

  if (!children.length) {
    sel.innerHTML = `<option value="">No children yet</option>`;
    $("childInfo").textContent = "No child yet. Add one below.";
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

  const active = children.find((c) => c.id === childId);
  $("childInfo").textContent = `Using child: ${active?.name ?? ""}`;

  sel.onchange = () => {
    childId = sel.value;
    localStorage.setItem("activeChildId", childId);
    const chosen = children.find((c) => c.id === childId);
    $("childInfo").textContent = `Using child: ${chosen?.name ?? ""}`;
    refreshAll();
  };
}

async function addChild() {
  const name = $("childName").value.trim();
  if (!name) return alert("Enter a child name.");

  const user = await requireUser();
  const res = await sb.from("children").insert({ name, user_id: user.id });
  if (res.error) return alert(res.error.message);

  $("childName").value = "";
  await loadChildrenDropdown();
  await refreshAll();
}

/* ----------------- Medications admin (moved to menu) ----------------- */
async function addMedicationFromMenu() {
  const name = $("newMedNameMenu").value.trim();
  const default_unit = $("newMedUnitMenu").value.trim() || null;
  if (!name) return alert("Enter medication name.");

  const user = await requireUser();
  const res = await sb.from("medications").insert({ name, default_unit, user_id: user.id });
  if (res.error) return alert(res.error.message);

  $("newMedNameMenu").value = "";
  $("newMedUnitMenu").value = "";
  $("medAdminMsg").textContent = "Medication added ✅";

  // refresh tracker dropdown + illness dropdown if open
  await loadMedsAndDoses();
  await loadIllnessMedicationDropdown();
}

/* ----------------- Data refresh ----------------- */
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

  if (res.error) return console.error("Load sleep error:", res.error);

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
  if (!isTodaySelected(selectedDateStr)) {
    alert("Start/End buttons are for TODAY only. For previous days, use Manual sleep entry.");
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
  if (!isTodaySelected(selectedDateStr)) {
    alert("Start/End buttons are for TODAY only. For previous days, use Manual sleep entry.");
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

  const res = await sb
    .from("sleep_sessions")
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

  if (endIso && new Date(endIso) < new Date(startIso)) {
    return alert("End time must be after start time.");
  }

  const user = await requireUser();
  const res = await sb.from("sleep_sessions").insert({
    child_id: childId,
    start_time: startIso,
    end_time: endIso,
    notes,
    user_id: user.id,
  });

  if (res.error) return alert(res.error.message);

  $("sleepStartManual").value = "";
  $("sleepEndManual").value = "";
  await loadSleep();
}

/* ----------------- Meals (NO TIME SHOWN) ----------------- */
async function loadMeals() {
  const { start, end } = toIsoRangeForDate(selectedDateStr);

  const res = await sb
    .from("meals")
    .select("*")
    .eq("child_id", childId)
    .gte("time", start)
    .lte("time", end)
    .order("time", { ascending: false });

  if (res.error) return console.error("Load meals error:", res.error);

  $("mealList").innerHTML = (res.data || [])
    .map(m => `<li>${m.meal_type} • ${m.percent_eaten}% • ${m.food_text ?? ""}${m.notes ? " • " + m.notes : ""}</li>`)
    .join("");
}

async function addMeal() {
  if (!childId) return alert("Select/add a child first.");

  const user = await requireUser();
  const timeIso = autoTimestampForSelectedDay(selectedDateStr);

  const res = await sb.from("meals").insert({
    child_id: childId,
    meal_type: $("mealType").value,
    percent_eaten: parseInt($("mealPercent").value, 10),
    food_text: $("mealFood").value.trim() || null,
    notes: $("mealNotes").value.trim() || null,
    time: timeIso,
    user_id: user.id,
  });

  if (res.error) return alert(res.error.message);

  $("mealFood").value = "";
  $("mealNotes").value = "";
  await loadMeals();
}

/* ----------------- Moods (NO TIME SHOWN) ----------------- */
async function loadMoods() {
  const { start, end } = toIsoRangeForDate(selectedDateStr);

  const res = await sb
    .from("moods")
    .select("*")
    .eq("child_id", childId)
    .gte("time", start)
    .lte("time", end)
    .order("time", { ascending: false });

  if (res.error) return console.error("Load moods error:", res.error);

  $("moodList").innerHTML = (res.data || [])
    .map(m => `<li>${m.period}: ${m.mood}${m.notes ? " • " + m.notes : ""}</li>`)
    .join("");
}

async function addMood() {
  if (!childId) return alert("Select/add a child first.");

  const user = await requireUser();
  const timeIso = autoTimestampForSelectedDay(selectedDateStr);

  const res = await sb.from("moods").insert({
    child_id: childId,
    period: $("moodPeriod").value,
    mood: $("moodValue").value,
    notes: $("moodNotes").value.trim() || null,
    time: timeIso,
    user_id: user.id,
  });

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

  const given_at = isTodaySelected(selectedDateStr)
    ? combineDateAndTime(selectedDateStr, ($("medTime").value || nowTimeStr()))
    : combineDateAndTime(selectedDateStr, BACKDATED_TIME);

  const res = await sb.from("medication_doses").insert({
    child_id: childId,
    medication_id,
    dose,
    notes,
    given_at,
    user_id: user.id,
  });

  if (res.error) return alert(res.error.message);

  $("medDose").value = "";
  $("medNotes").value = "";
  await loadMedsAndDoses();
}

/* ----------------- Accident & Illness view ----------------- */
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

async function syncAIChildrenAndDate() {
  // date
  $("aiDate").value = selectedDateStr || yyyyMmDd(new Date());

  // children dropdown (reuse children list)
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

  // keep current child if possible
  sel.value = childId || children[0].id;
  childId = sel.value;

  sel.onchange = () => {
    childId = sel.value;
    localStorage.setItem("activeChildId", childId);
    loadAccidents();
    loadIllnesses();
  };

  $("aiDate").onchange = () => {
    selectedDateStr = $("aiDate").value;
    loadAccidents();
    loadIllnesses();
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

  if (res.error) return console.error("Load accidents error:", res.error);

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
  const dateStr = $("aiDate").value;
  selectedDateStr = dateStr;

  // Required fields
  const what = $("accWhat").value.trim();
  if (!what) return alert("Accident: 'What happened' is required.");

  const bodyArea = $("accBodyArea").value;
  const bodyOther = $("accBodyOther").value.trim();
  if (bodyArea === "Other" && !bodyOther) return alert("Accident: Body area 'Other' must be filled in.");

  const repBy = $("accReportedBy").value;
  const repOther = $("accReportedOther").value.trim();
  if (repBy === "Other" && !repOther) return alert("Accident: Reported by 'Other' must be filled in.");

  const incident_time = isTodaySelected(dateStr)
    ? combineDateAndTime(dateStr, ($("accTime").value || nowTimeStr()))
    : combineDateAndTime(dateStr, BACKDATED_TIME);

  const res = await sb.from("accidents").insert({
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
  });

  if (res.error) return alert(res.error.message);

  // Clear
  $("accWhat").value = "";
  $("accWhere").value = "";
  $("accAction").value = "";
  $("accSafeguarding").value = "";
  $("accNotes").value = "";
  $("accTime").value = nowTimeStr();
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

  if (res.error) return console.error("Load illnesses error:", res.error);

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
  const dateStr = $("aiDate").value;
  selectedDateStr = dateStr;

  const symptom = $("illSymptom").value;
  const symptomOther = $("illSymptomOther").value.trim();
  if (symptom === "Other" && !symptomOther) return alert("Illness: Symptom 'Other' must be filled in.");

  const repBy = $("illReportedBy").value;
  const repOther = $("illReportedOther").value.trim();
  if (repBy === "Other" && !repOther) return alert("Illness: Reported by 'Other' must be filled in.");

  const event_time = isTodaySelected(dateStr)
    ? combineDateAndTime(dateStr, ($("illTime").value || nowTimeStr()))
    : combineDateAndTime(dateStr, BACKDATED_TIME);

  // temp validation (optional but helpful)
  const tRaw = $("illTemp").value.trim();
  let temperature_c = null;
  if (tRaw) {
    const t = Number(tRaw);
    if (Number.isNaN(t)) return alert("Illness: Temperature must be a number (e.g. 38.2).");
    temperature_c = t;
  }

  const medication_id = $("illMedication").value || null;

  const res = await sb.from("illnesses").insert({
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
  });

  if (res.error) return alert(res.error.message);

  // Clear
  $("illNotes").value = "";
  $("illTemp").value = "";
  $("illTime").value = nowTimeStr();
  $("illMedication").value = "";
  $("illSymptom").value = "Temperature";
  $("illReportedBy").value = "Mum";
  toggleOther("illSymptom", "illSymptomOther");
  toggleOther("illReportedBy", "illReportedOther");
  updateBreathingFlag();

  await loadIllnesses();
}

function updateBreathingFlag() {
  const isBreathing = $("illSymptom").value === "Breathing difficulties";
  $("illFlag").style.display = isBreathing ? "block" : "none";
}

/* ----------------- Navigation ----------------- */
function setupNav() {
  $("btnGoTracker").onclick = () => goTracker(selectedDateStr || yyyyMmDd(new Date()));

  $("btnGoPrevious").onclick = () => {
    showView("previousView");
    $("previousPick").value = selectedDateStr || yyyyMmDd(new Date());
  };

  $("btnGoExport").onclick = () => showView("exportView");

  $("btnGoAccident").onclick = async () => {
    showView("accidentView");

    // sync shared date/child
    if (!selectedDateStr) selectedDateStr = yyyyMmDd(new Date());
    await syncAIChildrenAndDate();

    // defaults
    $("accTime").value = nowTimeStr();
    $("illTime").value = nowTimeStr();

    // tab + other inputs
    setTab("accident");
    toggleOther("accBodyArea", "accBodyOther");
    toggleOther("accReportedBy", "accReportedOther");
    toggleOther("illSymptom", "illSymptomOther");
    toggleOther("illReportedBy", "illReportedOther");
    updateBreathingFlag();

    await loadIllnessMedicationDropdown();
    await Promise.all([loadAccidents(), loadIllnesses()]);
  };

  $("btnBackToMenu").onclick = goMenu;
  $("btnPrevBackToMenu").onclick = goMenu;
  $("btnExportBackToMenu").onclick = goMenu;
  $("btnAIBackToMenu").onclick = goMenu;

  $("btnOpenPrevious").onclick = () => {
    const d = $("previousPick").value;
    if (!d) return alert("Pick a date.");
    goTracker(d);
  };
}

/* ----------------- DOM READY ----------------- */
document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOM READY ✅ wiring...");

  selectedDateStr = yyyyMmDd(new Date());

  // Auth
  $("btnRegister").onclick = doRegister;
  $("btnLogin").onclick = doLogin;
  $("btnForgotPassword").onclick = doForgotPassword;

  // Reset view
  $("btnSetNewPassword").onclick = setNewPassword;
  $("btnBackToLogin").onclick = () => showView("authView");

  // Menu admin
  $("btnAddMedMenu").onclick = addMedicationFromMenu;

  // Navigation
  setupNav();

  // Tracker
  $("btnAddChild").onclick = addChild;
  $("selectedDate").onchange = async () => {
    selectedDateStr = $("selectedDate").value;
    $("medTime").value = nowTimeStr();
    await refreshAll();
  };

  $("btnSleepStart").onclick = sleepStart;
  $("btnSleepEnd").onclick = sleepEnd;
  $("btnAddSleepManual").onclick = addSleepManual;

  $("btnAddMeal").onclick = addMeal;
  $("btnAddMood").onclick = addMood;

  $("btnAddDose").onclick = addDose;

  // Accident/Illness UI wiring
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
    showView("authView");
  };

  // Boot
  if (isRecoveryLink()) {
    showView("resetView");
    $("resetMsg").textContent = "";
    return;
  }

  const { data } = await sb.auth.getSession();
  if (data?.session) await goMenu();
  else showView("authView");
});
