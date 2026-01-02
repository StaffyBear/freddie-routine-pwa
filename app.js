// 1) PUT YOUR VALUES HERE (Project URL + anon public key)
const SUPABASE_URL = "https://jjombeomtbtzchiult.supabase.co"; // <-- replace if different
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqam9tYmVvbXRienR6Y2hpdWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNzk5MTgsImV4cCI6MjA4Mjk1NTkxOH0.28ADFdTW2YKOMrp7klwbpRjKbSLIR7URaij_AmIqNOE";        // <-- paste anon key

// 2) Create client
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

let childId = null;

// --- date helpers (today in local time) ---
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
function timeHHMM(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// --- UI state ---
async function showAuth(msg = "") {
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

// --- Load the first child for this user (simple: one child for now) ---
async function loadOrSetChild() {
  const { data, error } = await sb.from("children").select("id,name").order("created_at", { ascending: true }).limit(1);
  if (error) {
    $("childInfo").textContent = "Error loading child: " + error.message;
    return;
  }
  if (data && data.length) {
    childId = data[0].id;
    $("childInfo").textContent = `Using child: ${data[0].name}`;
  } else {
    childId = null;
    $("childInfo").textContent = "No child set yet. Create one above.";
  }
}

// --- Create child ---
async function createChild() {
  const name = $("childName").value.trim();
  if (!name) return alert("Enter a child name.");

  // user_id should auto-fill (default auth.uid()) OR you can explicitly include it.
  const { data: userData } = await sb.auth.getUser();
  if (!userData?.user) return alert("You must be logged in.");

  const { data, error } = await sb
    .from("children")
    .insert({ name }) // don't pass user_id; let default fill it
    .select("id,name")
    .single();

  if (error) return alert("Create child failed: " + error.message);

  childId = data.id;
  $("childName").value = "";
  $("childInfo").textContent = `Using child: ${data.name}`;
  await refreshAll();
}

// --- Refresh all panels ---
async function refreshAll() {
  if (!childId) return;
  await Promise.all([loadSleep(), loadMeals(), loadMoods(), loadMedsAndDoses()]);
}

// ======================= SLEEP =======================
async function loadSleep() {
  const { data, error } = await sb
    .from("sleep_sessions")
    .select("*")
    .eq("child_id", childId)
    .gte("start_time", startOfToday())
    .lte("start_time", endOfToday())
    .order("start_time", { ascending: false });

  if (error) return;

  $("sleepList").innerHTML = "";
  let totalMs = 0;

  (data || []).forEach((s) => {
    const st = new Date(s.start_time);
    const et = s.end_time ? new Date(s.end_time) : null;
    if (et) totalMs += (et - st);

    const li = document.createElement("li");
    li.textContent =
      `${timeHHMM(s.start_time)} → ${s.end_time ? timeHHMM(s.end_time) : "…"}`
      + (s.notes ? ` • ${s.notes}` : "");
    $("sleepList").appendChild(li);
  });

  $("sleepTotal").textContent = `${(totalMs / 3600000).toFixed(2)}h`;
}

async function sleepStart() {
  if (!childId) return alert("Create/set child first.");
  const notes = $("sleepNote").value.trim() || null;

  const { error } = await sb.from("sleep_sessions").insert({
    child_id: childId,
    start_time: new Date().toISOString(),
    notes
  });
  if (error) return alert("Sleep start failed: " + error.message);

  $("sleepNote").value = "";
  await loadSleep();
}

async function sleepEnd() {
  if (!childId) return alert("Create/set child first.");

  // End latest open session
  const open = await sb
    .from("sleep_sessions")
    .select("id, start_time, notes")
    .eq("child_id", childId)
    .is("end_time", null)
    .order("start_time", { ascending: false })
    .limit(1);

  if (open.error) return alert("Sleep end failed: " + open.error.message);
  if (!open.data || !open.data.length) return alert("No active sleep session found.");

  const extra = $("sleepNote").value.trim();
  const existingNotes = open.data[0].notes || "";
  const newNotes = extra ? (existingNotes ? `${existingNotes} | ${extra}` : extra) : (existingNotes || null);

  const { error } = await sb
    .from("sleep_sessions")
    .update({ end_time: new Date().toISOString(), notes: newNotes })
    .eq("id", open.data[0].id);

  if (error) return alert("Sleep end update failed: " + error.message);

  $("sleepNote").value = "";
  await loadSleep();
}

// ======================= MEALS =======================
async function addMeal() {
  if (!childId) return alert("Create/set child first.");

  const meal_type = $("mealType").value;
  const percent_eaten = parseInt($("mealPercent").value, 10);
  const food_text = $("mealFood").value.trim() || null;
  const notes = $("mealNotes").value.trim() || null;

  const { error } = await sb.from("meals").insert({
    child_id: childId,
    meal_type,
    percent_eaten,
    food_text,
    notes
  });

  if (error) return alert("Add meal failed: " + error.message);

  $("mealFood").value = "";
  $("mealNotes").value = "";
  await loadMeals();
}

async function loadMeals() {
  const { data, error } = await sb
    .from("meals")
    .select("*")
    .eq("child_id", childId)
    .gte("time", startOfToday())
    .lte("time", endOfToday())
    .order("time", { ascending: false });

  if (error) return;

  $("mealList").innerHTML = (data || []).map((m) => {
    return `<li>${timeHHMM(m.time)} • ${m.meal_type} • ${m.percent_eaten}% • ${m.food_text ?? ""}${m.notes ? " • " + m.notes : ""}</li>`;
  }).join("");
}

// ======================= MOODS =======================
async function saveMood() {
  if (!childId) return alert("Create/set child first.");

  const period = $("moodPeriod").value;
  const mood = $("moodValue").value;
  const notes = $("moodNotes").value.trim() || null;

  // Replace today's mood for that period (simple + clean)
  const existing = await sb
    .from("moods")
    .select("id")
    .eq("child_id", childId)
    .eq("period", period)
    .gte("time", startOfToday())
    .lte("time", endOfToday())
    .limit(1);

  if (!existing.error && existing.data && existing.data.length) {
    await sb.from("moods").delete().eq("id", existing.data[0].id);
  }

  const { error } = await sb.from("moods").insert({
    child_id: childId,
    period,
    mood,
    notes
  });

  if (error) return alert("Save mood failed: " + error.message);

  $("moodNotes").value = "";
  await loadMoods();
}

async function loadMoods() {
  const { data, error } = await sb
    .from("moods")
    .select("*")
    .eq("child_id", childId)
    .gte("time", startOfToday())
    .lte("time", endOfToday())
    .order("time", { ascending: false });

  if (error) return;

  $("moodList").innerHTML = (data || []).map((x) => {
    return `<li>${timeHHMM(x.time)} • ${x.period}: ${x.mood}${x.notes ? " • " + x.notes : ""}</li>`;
  }).join("");
}

// ======================= MEDICATION =======================
async function loadMedsAndDoses() {
  // load list for dropdown
  const meds = await sb.from("medications").select("id,name,default_unit").order("name");
  if (!meds.error) {
    const options = (meds.data || []).map(m =>
      `<option value="${m.id}">${m.name}${m.default_unit ? " (" + m.default_unit + ")" : ""}</option>`
    ).join("");
    $("medSelect").innerHTML = options || `<option value="">No meds yet</option>`;
  }

  // load today's doses
  const doses = await sb
    .from("medication_doses")
    .select("given_at,dose,notes,medications(name)")
    .eq("child_id", childId)
    .gte("given_at", startOfToday())
    .lte("given_at", endOfToday())
    .order("given_at", { ascending: false });

  if (!doses.error) {
    $("medList").innerHTML = (doses.data || []).map(d => {
      return `<li>${timeHHMM(d.given_at)} • ${d.medications?.name ?? "Medication"} • ${d.dose}${d.notes ? " • " + d.notes : ""}</li>`;
    }).join("");
  }
}

async function addMedication() {
  const name = $("newMedName").value.trim();
  const default_unit = $("newMedUnit").value.trim() || null;
  if (!name) return alert("Enter medication name.");

  const { error } = await sb.from("medications").insert({ name, default_unit });
  if (error) return alert("Add medication failed: " + error.message);

  $("newMedName").value = "";
  $("newMedUnit").value = "";
  await loadMedsAndDoses();
}

async function addDose() {
  if (!childId) return alert("Create/set child first.");

  const medication_id = $("medSelect").value;
  const dose = $("medDose").value.trim();
  const notes = $("medNotes").value.trim() || null;

  if (!medication_id) return alert("Select a medication (or add one).");
  if (!dose) return alert("Enter a dose.");

  const { error } = await sb.from("medication_doses").insert({
    child_id: childId,
    medication_id,
    dose,
    notes
  });

  if (error) return alert("Add dose failed: " + error.message);

  $("medDose").value = "";
  $("medNotes").value = "";
  await loadMedsAndDoses();
}

// ======================= AUTH =======================
async function doLogin() {
  const email = $("email").value.trim();
  const password = $("password").value;

  $("authMsg").textContent = "";

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    $("authMsg").textContent = error.message;
    return;
  }

  await showApp();
}

async function doRegister() {
  const email = $("email").value.trim();
  const password = $("password").value;

  $("authMsg").textContent = "";

  const { error } = await sb.auth.signUp({ email, password });
  if (error) {
    $("authMsg").textContent = error.message;
    return;
  }

  // If email confirmation is ON, user must confirm email first.
  $("authMsg").textContent = "Registered! If login fails, check your email to confirm, then login.";
}

// Buttons
$("btnLogin").onclick = doLogin;
$("btnRegister").onclick = doRegister;
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
  await showAuth("Logged out.");
};

// Boot
(async () => {
  // If you’re already logged in, go straight in.
  const { data } = await sb.auth.getSession();
  if (data?.session) await showApp();
  else await showAuth("");
})();
