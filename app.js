/**************************************************
 * Freddie Routine – app.js
 * Version: 2026-01-02-domready
 **************************************************/

const SUPABASE_URL = "https://jjombeomtbtzchiult.supabase.co";
const SUPABASE_KEY = "sb_publishable_6Le75u-UJnbGCZMbLQ8kQQ_9cFOsfIl";

console.log("APP LOADED ✅", new Date().toISOString());

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

let childId = null;

// Catch silent failures
window.addEventListener("error", (e) => console.error("JS ERROR:", e.error || e.message));
window.addEventListener("unhandledrejection", (e) => console.error("PROMISE ERROR:", e.reason));

/* ---------- Date helpers ---------- */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}
function hhmm(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ---------- UI state ---------- */
function showAuth(msg = "") {
  $("auth").style.display = "block";
  $("app").style.display = "none";
  $("authMsg").textContent = msg;
}

async function showApp() {
  $("auth").style.display = "none";
  $("app").style.display = "block";
  $("statusMsg").textContent = "";
  await loadOrSetChild();
  await refreshAll();
}

/* ---------- AUTH ---------- */
async function doRegister() {
  console.log("Register clicked ✅");

  const email = $("email").value.trim();
  const password = $("password").value;

  if (!email || !password) {
    $("authMsg").textContent = "Enter BOTH email and password.";
    return;
  }

  $("authMsg").textContent = "Registering…";
  const res = await sb.auth.signUp({ email, password });
  console.log("Register result:", res);

  if (res.error) {
    $("authMsg").textContent = res.error.message;
    return;
  }

  $("authMsg").textContent =
    "Registered ✅ Now click Login (check email if confirmations are ON).";
}

async function doLogin() {
  console.log("Login clicked ✅");

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
  await showApp();
}

/* ---------- CHILD ---------- */
async function loadOrSetChild() {
  const res = await sb
    .from("children")
    .select("id,name")
    .order("created_at", { ascending: true })
    .limit(1);

  if (res.error) {
    console.error("Load child error:", res.error);
    $("childInfo").textContent = "Error loading child: " + res.error.message;
    childId = null;
    return;
  }

  if (res.data && res.data.length) {
    childId = res.data[0].id;
    $("childInfo").textContent = `Using child: ${res.data[0].name}`;
  } else {
    childId = null;
    $("childInfo").textContent = "No child yet. Create one above.";
  }
}

async function createChild() {
  console.log("Create child clicked ✅");

  const name = $("childName").value.trim();
  if (!name) return alert("Enter a child name.");

  const res = await sb.from("children").insert({ name }).select("id,name").single();
  console.log("Create child result:", res);

  if (res.error) return alert(res.error.message);

  childId = res.data.id;
  $("childName").value = "";
  $("childInfo").textContent = `Using child: ${res.data.name}`;
  await refreshAll();
}

/* ---------- REFRESH ALL ---------- */
async function refreshAll() {
  if (!childId) return;
  await Promise.all([loadSleep(), loadMeals(), loadMoods(), loadMedsAndDoses()]);
}

/* ---------- SLEEP ---------- */
async function loadSleep() {
  const res = await sb
    .from("sleep_sessions")
    .select("*")
    .eq("child_id", childId)
    .gte("start_time", startOfToday())
    .lte("start_time", endOfToday())
    .order("start_time", { ascending: false });

  if (res.error) return console.error("Load sleep error:", res.error);

  $("sleepList").innerHTML = "";
  let totalMs = 0;

  (res.data || []).forEach((s) => {
    const st = new Date(s.start_time);
    const et = s.end_time ? new Date(s.end_time) : null;
    if (et) totalMs += et - st;

    const li = document.createElement("li");
    li.textContent =
      `${hhmm(s.start_time)} → ${s.end_time ? hhmm(s.end_time) : "…"}`
      + (s.notes ? ` • ${s.notes}` : "");
    $("sleepList").appendChild(li);
  });

  $("sleepTotal").textContent = (totalMs / 3600000).toFixed(2) + "h";
}

async function sleepStart() {
  if (!childId) return alert("Create/set child first.");

  const notes = $("sleepNote").value.trim() || null;
  const res = await sb.from("sleep_sessions").insert({
    child_id: childId,
    start_time: new Date().toISOString(),
    notes
  });

  if (res.error) return alert(res.error.message);

  $("sleepNote").value = "";
  await loadSleep();
}

async function sleepEnd() {
  if (!childId) return alert("Create/set child first.");

  const open = await sb
    .from("sleep_sessions")
    .select("id,start_time")
    .eq("child_id", childId)
    .is("end_time", null)
    .order("start_time", { ascending: false })
    .limit(1);

  if (open.error) return alert(open.error.message);
  if (!open.data || !open.data.length) return alert("No active sleep session found.");

  const res = await sb
    .from("sleep_sessions")
    .update({ end_time: new Date().toISOString() })
    .eq("id", open.data[0].id);

  if (res.error) return alert(res.error.message);

  await loadSleep();
}

/* ---------- MEALS ---------- */
async function addMeal() {
  if (!childId) return alert("Create/set child first.");

  const res = await sb.from("meals").insert({
    child_id: childId,
    meal_type: $("mealType").value,
    percent_eaten: parseInt($("mealPercent").value, 10),
    food_text: $("mealFood").value.trim() || null,
    notes: $("mealNotes").value.trim() || null
  });

  if (res.error) return alert(res.error.message);

  $("mealFood").value = "";
  $("mealNotes").value = "";
  await loadMeals();
}

async function loadMeals() {
  const res = await sb
    .from("meals")
    .select("*")
    .eq("child_id", childId)
    .gte("time", startOfToday())
    .lte("time", endOfToday())
    .order("time", { ascending: false });

  if (res.error) return console.error("Load meals error:", res.error);

  $("mealList").innerHTML = (res.data || [])
    .map(m => `<li>${hhmm(m.time)} • ${m.meal_type} • ${m.percent_eaten}% • ${m.food_text ?? ""}${m.notes ? " • " + m.notes : ""}</li>`)
    .join("");
}

/* ---------- MOODS ---------- */
async function saveMood() {
  if (!childId) return alert("Create/set child first.");

  const res = await sb.from("moods").insert({
    child_id: childId,
    period: $("moodPeriod").value,
    mood: $("moodValue").value,
    notes: $("moodNotes").value.trim() || null
  });

  if (res.error) return alert(res.error.message);

  $("moodNotes").value = "";
  await loadMoods();
}

async function loadMoods() {
  const res = await sb
    .from("moods")
    .select("*")
    .eq("child_id", childId)
    .gte("time", startOfToday())
    .lte("time", endOfToday())
    .order("time", { ascending: false });

  if (res.error) return console.error("Load moods error:", res.error);

  $("moodList").innerHTML = (res.data || [])
    .map(m => `<li>${hhmm(m.time)} • ${m.period}: ${m.mood}${m.notes ? " • " + m.notes : ""}</li>`)
    .join("");
}

/* ---------- MEDICATION ---------- */
async function loadMedsAndDoses() {
  const meds = await sb.from("medications").select("id,name,default_unit").order("name");

  if (!meds.error) {
    const options = (meds.data || [])
      .map(m => `<option value="${m.id}">${m.name}${m.default_unit ? " (" + m.default_unit + ")" : ""}</option>`)
      .join("");
    $("medSelect").innerHTML = options || `<option value="">No meds yet</option>`;
  } else {
    console.error("Load meds error:", meds.error);
  }

  const doses = await sb
    .from("medication_doses")
    .select("given_at,dose,notes,medications(name)")
    .eq("child_id", childId)
    .gte("given_at", startOfToday())
    .lte("given_at", endOfToday())
    .order("given_at", { ascending: false });

  if (!doses.error) {
    $("medList").innerHTML = (doses.data || [])
      .map(d => `<li>${hhmm(d.given_at)} • ${d.medications?.name ?? "Medication"} • ${d.dose}${d.notes ? " • " + d.notes : ""}</li>`)
      .join("");
  } else {
    console.error("Load doses error:", doses.error);
  }
}

async function addMedication() {
  const name = $("newMedName").value.trim();
  const default_unit = $("newMedUnit").value.trim() || null;

  if (!name) return alert("Enter medication name.");

  const res = await sb.from("medications").insert({ name, default_unit });
  if (res.error) return alert(res.error.message);

  $("newMedName").value = "";
  $("newMedUnit").value = "";
  await loadMedsAndDoses();
}

async function addDose() {
  if (!childId) return alert("Create/set child first.");

  const medication_id = $("medSelect").value;
  const dose = $("medDose").value.trim();
  const notes = $("medNotes").value.trim() || null;

  if (!medication_id) return alert("Select (or add) a medication first.");
  if (!dose) return alert("Enter a dose.");

  const res = await sb.from("medication_doses").insert({
    child_id: childId,
    medication_id,
    dose,
    notes
  });

  if (res.error) return alert(res.error.message);

  $("medDose").value = "";
  $("medNotes").value = "";
  await loadMedsAndDoses();
}

/* ---------- DOM READY (WIRING + BOOT) ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOM READY ✅ wiring buttons...");

  // Check required elements exist
  const requiredIds = [
    "btnRegister","btnLogin","btnCreateChild","btnSleepStart","btnSleepEnd",
    "btnAddMeal","btnAddMood","btnAddMed","btnAddDose","btnLogout",
    "email","password","authMsg"
  ];
  const missing = requiredIds.filter(id => !document.getElementById(id));
  if (missing.length) {
    console.error("Missing elements in index.html:", missing);
    $("authMsg").textContent = "Page error: missing elements: " + missing.join(", ");
    return;
  }

  // Wire buttons
  $("btnRegister").onclick = doRegister;
  $("btnLogin").onclick = doLogin;
  $("btnCreateChild").onclick = createChild;

  $("btnSleepStart").onclick = sleepStart;
  $("btnSleepEnd").onclick = sleepEnd;

  $("btnAddMeal").onclick = addMeal;
  $("btnAddMood").onclick = saveMood;

  $("btnAddMed").onclick = addMedication;
  $("btnAddDose").onclick = addDose;

  $("btnLogout").onclick = async () => {
    await sb.auth.signOut();
    childId = null;
    showAuth("Logged out.");
  };

  // Boot
  const { data } = await sb.auth.getSession();
  console.log("Initial session:", data);

  if (data?.session) await showApp();
  else showAuth("");
});
