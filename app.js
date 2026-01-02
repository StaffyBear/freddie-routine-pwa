/**************************************************
 * Freddie Routine – app.js
 * Version: 2026-01-02-debug
 **************************************************/

/* ===============================
   1) CONFIG — CHANGE THESE ONLY
   =============================== */
const SUPABASE_URL = "https://jjombeomtbtzchiult.supabase.co"; // your project URL
const SUPABASE_KEY = "sb_publishable_6Le75u-UJnbGCZMbLQ8kQQ_9cFOsfIl"; // publishable key ONLY

/* ===============================
   2) INIT
   =============================== */
console.log("APP LOADED ✅", new Date().toISOString());

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

let childId = null;

/* Catch silent JS failures */
window.addEventListener("error", (e) => {
  console.error("JS ERROR:", e.error || e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("PROMISE ERROR:", e.reason);
});

/* ===============================
   3) DATE HELPERS
   =============================== */
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

/* ===============================
   4) UI STATE
   =============================== */
function showAuth(msg = "") {
  $("auth").style.display = "block";
  $("app").style.display = "none";
  $("authMsg").textContent = msg;
}

async function showApp() {
  console.log("Showing app UI");
  $("auth").style.display = "none";
  $("app").style.display = "block";
  await loadOrCreateChildHint();
  await refreshAll();
}

/* ===============================
   5) AUTH (EMAIL + PASSWORD ONLY)
   =============================== */
async function doRegister() {
  console.log("Register clicked ✅");

  const email = $("email")?.value?.trim();
  const password = $("password")?.value;

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
    "Registered ✅ Now click Login (check email if confirmations are on).";
}

async function doLogin() {
  console.log("Login clicked ✅");

  const email = $("email")?.value?.trim();
  const password = $("password")?.value;

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

/* ===============================
   6) CHILD
   =============================== */
async function loadOrCreateChildHint() {
  const { data, error } = await sb
    .from("children")
    .select("id,name")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error("Load child error:", error);
    $("childInfo").textContent = "Error loading child";
    return;
  }

  if (data && data.length) {
    childId = data[0].id;
    $("childInfo").textContent = `Using child: ${data[0].name}`;
  } else {
    childId = null;
    $("childInfo").textContent = "No child yet. Create one above.";
  }
}

async function createChild() {
  console.log("Create child clicked");

  const name = $("childName").value.trim();
  if (!name) return alert("Enter a child name");

  const res = await sb.from("children").insert({ name }).select().single();
  console.log("Create child result:", res);

  if (res.error) {
    alert(res.error.message);
    return;
  }

  childId = res.data.id;
  $("childName").value = "";
  $("childInfo").textContent = `Using child: ${res.data.name}`;
  await refreshAll();
}

/* ===============================
   7) LOAD ALL DATA
   =============================== */
async function refreshAll() {
  if (!childId) return;
  await Promise.all([loadSleep(), loadMeals(), loadMoods()]);
}

/* ===============================
   8) SLEEP
   =============================== */
async function loadSleep() {
  const res = await sb
    .from("sleep_sessions")
    .select("*")
    .eq("child_id", childId)
    .gte("start_time", startOfToday())
    .lte("start_time", endOfToday())
    .order("start_time", { ascending: false });

  if (res.error) {
    console.error("Load sleep error:", res.error);
    return;
  }

  $("sleepList").innerHTML = "";
  let totalMs = 0;

  res.data.forEach((s) => {
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
  if (!childId) return alert("Create child first");
  const notes = $("sleepNote").value.trim() || null;

  const res = await sb.from("sleep_sessions").insert({
    child_id: childId,
    start_time: new Date().toISOString(),
    notes,
  });

  if (res.error) alert(res.error.message);
  $("sleepNote").value = "";
  await loadSleep();
}

async function sleepEnd() {
  const open = await sb
    .from("sleep_sessions")
    .select("id")
    .eq("child_id", childId)
    .is("end_time", null)
    .order("start_time", { ascending: false })
    .limit(1);

  if (!open.data || !open.data.length) {
    alert("No active sleep session");
    return;
  }

  const res = await sb
    .from("sleep_sessions")
    .update({ end_time: new Date().toISOString() })
    .eq("id", open.data[0].id);

  if (res.error) alert(res.error.message);
  await loadSleep();
}

/* ===============================
   9) MEALS
   =============================== */
async function addMeal() {
  if (!childId) return alert("Create child first");

  const res = await sb.from("meals").insert({
    child_id: childId,
    meal_type: $("mealType").value,
    percent_eaten: parseInt($("mealPercent").value, 10),
    food_text: $("mealFood").value.trim() || null,
    notes: $("mealNotes").value.trim() || null,
  });

  if (res.error) alert(res.error.message);

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

  if (res.error) {
    console.error("Load meals error:", res.error);
    return;
  }

  $("mealList").innerHTML = res.data
    .map(
      (m) =>
        `<li>${hhmm(m.time)} • ${m.meal_type} • ${m.percent_eaten}% • ${
          m.food_text || ""
        }</li>`
    )
    .join("");
}

/* ===============================
   10) MOODS
   =============================== */
async function saveMood() {
  if (!childId) return alert("Create child first");

  const res = await sb.from("moods").insert({
    child_id: childId,
    period: $("moodPeriod").value,
    mood: $("moodValue").value,
    notes: $("moodNotes").value.trim() || null,
  });

  if (res.error) alert(res.error.message);
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

  if (res.error) {
    console.error("Load moods error:", res.error);
    return;
  }

  $("moodList").innerHTML = res.data
    .map((m) => `<li>${hhmm(m.time)} • ${m.period}: ${m.mood}</li>`)
    .join("");
}

/* ===============================
   11) BUTTON WIRING
   =============================== */
$("btnRegister").onclick = doRegister;
$("btnLogin").onclick = doLogin;
$("btnCreateChild").onclick = createChild;
$("btnSleepStart").onclick = sleepStart;
$("btnSleepEnd").onclick = sleepEnd;
$("btnAddMeal").onclick = addMeal;
$("btnAddMood").onclick = saveMood;

$("btnLogout").onclick = async () => {
  await sb.auth.signOut();
  childId = null;
  showAuth("Logged out");
};

/* ===============================
   12) BOOT
   =============================== */
(async () => {
  const { data } = await sb.auth.getSession();
  console.log("Initial session:", data);

  if (data?.session) {
    await showApp();
  } else {
    showAuth("");
  }
})();
