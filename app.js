/**************************************************
 * Freddie Routine – app.js
 * Version: 2026-01-02-menu-date-reset-backdated-1006
 **************************************************/

const SITE_URL = "https://staffybear.github.io/freddie-routine-pwa/";
const SUPABASE_URL = "https://jjjombeomtbztzchiult.supabase.co";
const SUPABASE_KEY = "sb_publishable_6Le75u-UJnbGCZMbLQ8kQQ_9cFOsfIl";

// Backdated entries (non-today selected date) will be stored at this time:
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
  // Local day start/end, converted to ISO (UTC)
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
  const end = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
  return { start, end };
}

function hhmm(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function combineDateAndTime(dateStr, timeStr) {
  // timeStr "HH:MM"
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

function nowTimeStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isTodaySelected() {
  return selectedDateStr === yyyyMmDd(new Date());
}

function autoTimestampForSelectedDay() {
  // Today: actual current timestamp
  // Backdated: fixed 10:06 so it's clearly a backdated item
  return isTodaySelected()
    ? new Date().toISOString()
    : combineDateAndTime(selectedDateStr, BACKDATED_TIME);
}

/* ----------------- View switching ----------------- */
function hideAllViews() {
  ["authView", "resetView", "menuView", "trackerView", "previousView", "exportView"].forEach((id) => {
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

  console.log("Register result:", res);

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
  console.log("Login result:", res);

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
  console.log("Forgot password result:", res);

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
  console.log("Update password result:", res);

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
}

/* ----------------- Tracker init ----------------- */
async function goTracker(dateStr = null) {
  showView("trackerView");

  selectedDateStr = dateStr || yyyyMmDd(new Date());
  $("selectedDate").value = selectedDateStr;

  // Only meds keep a time picker:
  if ($("medTime")) $("medTime").value = nowTimeStr();

  // Sleep manual inputs
  if ($("sleepStartManual")) $("sleepStartManual").value = "";
  if ($("sleepEndManual")) $("sleepEndManual").value = "";

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
    li.textContent = `${hhmm(s.start_time)} → ${s.end_time ? hhmm(s.end_time) : "…"}${
      s.notes ? " • " + s.notes : ""
    }`;
    $("sleepList").appendChild(li);
  });

  $("sleepTotal").textContent = (totalMs / 3600000).toFixed(2) + "h";
}

async function sleepStart() {
  if (!childId) return alert("Select/add a child first.");
  if (!isTodaySelected()) {
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
  if (!isTodaySelected()) {
    alert("Start/End buttons are for TODAY only. For previous days, use Manual sleep entry.");
    return;
  }

  const open = await sb
    .from("sleep_sessions")
    .select("id,start_time")
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

  if (res.error) return console.error("Load meals error:", res.error);

  $("mealList").innerHTML = (res.data || [])
    .map(
      (m) =>
        `<li>${hhmm(m.time)} • ${m.meal_type} • ${m.percent_eaten}% • ${m.food_text ?? ""}${
          m.notes ? " • " + m.notes : ""
        }</li>`
    )
    .join("");
}

async function addMeal() {
  if (!childId) return alert("Select/add a child first.");

  const user = await requireUser();
  const timeIso = autoTimestampForSelectedDay();

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

  if (res.error) return console.error("Load moods error:", res.error);

  $("moodList").innerHTML = (res.data || [])
    .map(
      (m) =>
        `<li>${hhmm(m.time)} • ${m.period}: ${m.mood}${m.notes ? " • " + m.notes : ""}</li>`
    )
    .join("");
}

async function addMood() {
  if (!childId) return alert("Select/add a child first.");

  const user = await requireUser();
  const timeIso = autoTimestampForSelectedDay();

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

/* ----------------- Medication ----------------- */
async function loadMedsAndDoses() {
  // meds dropdown
  const meds = await sb.from("medications").select("id,name,default_unit").order("name");
  if (!meds.error) {
    $("medSelect").innerHTML =
      (meds.data || [])
        .map(
          (m) =>
            `<option value="${m.id}">${m.name}${
              m.default_unit ? " (" + m.default_unit + ")" : ""
            }</option>`
        )
        .join("") || `<option value="">No meds yet</option>`;
  }

  // doses list for selected day
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
      .map(
        (d) =>
          `<li>${hhmm(d.given_at)} • ${d.medications?.name ?? "Medication"} • ${d.dose}${
            d.notes ? " • " + d.notes : ""
          }</li>`
      )
      .join("");
  }
}

async function addMedication() {
  const name = $("newMedName").value.trim();
  const default_unit = $("newMedUnit").value.trim() || null;
  if (!name) return alert("Enter medication name.");

  const user = await requireUser();
  const res = await sb.from("medications").insert({ name, default_unit, user_id: user.id });
  if (res.error) return alert(res.error.message);

  $("newMedName").value = "";
  $("newMedUnit").value = "";
  await loadMedsAndDoses();
}

async function addDose() {
  if (!childId) return alert("Select/add a child first.");

  const medication_id = $("medSelect").value;
  const dose = $("medDose").value.trim();
  const notes = $("medNotes").value.trim() || null;

  if (!medication_id) return alert("Add/select a medication first.");
  if (!dose) return alert("Enter a dose.");

  const user = await requireUser();

  // Medication still uses a time picker, but if backdated, force 10:06
  const given_at = isTodaySelected()
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

/* ----------------- Navigation ----------------- */
function setupNav() {
  $("btnGoTracker").onclick = () => goTracker(selectedDateStr || yyyyMmDd(new Date()));
  $("btnGoPrevious").onclick = () => {
    showView("previousView");
    $("previousPick").value = selectedDateStr || yyyyMmDd(new Date());
  };
  $("btnGoExport").onclick = () => showView("exportView");

  $("btnBackToMenu").onclick = goMenu;
  $("btnPrevBackToMenu").onclick = goMenu;
  $("btnExportBackToMenu").onclick = goMenu;

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

  // Auth buttons
  $("btnRegister").onclick = doRegister;
  $("btnLogin").onclick = doLogin;
  $("btnForgotPassword").onclick = doForgotPassword;

  // Reset view
  $("btnSetNewPassword").onclick = setNewPassword;
  $("btnBackToLogin").onclick = () => showView("authView");

  // Menu + navigation
  setupNav();

  // Tracker wiring
  $("btnAddChild").onclick = addChild;

  $("selectedDate").onchange = async () => {
    selectedDateStr = $("selectedDate").value;
    // Only meds keep a time picker default:
    if ($("medTime")) $("medTime").value = nowTimeStr();
    await refreshAll();
  };

  // Sleep
  $("btnSleepStart").onclick = sleepStart;
  $("btnSleepEnd").onclick = sleepEnd;
  $("btnAddSleepManual").onclick = addSleepManual;

  // Meals + moods (no time inputs now)
  $("btnAddMeal").onclick = addMeal;
  $("btnAddMood").onclick = addMood;

  // Medication
  $("btnAddMed").onclick = addMedication;
  $("btnAddDose").onclick = addDose;

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
  console.log("Initial session:", data);

  if (data?.session) await goMenu();
  else showView("authView");
});
