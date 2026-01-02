const SUPABASE_URL = "https://jjjombeomtbztzchiult.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqam9tYmVvbXRienR6Y2hpdWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNzk5MTgsImV4cCI6MjA4Mjk1NTkxOH0.28ADFdTW2YKOMrp7klwbpRjKbSLIR7URaij_AmIqNOE";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

let childId = null;

function startOfToday() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.toISOString();
}
function endOfToday() {
  const d = new Date();
  d.setHours(23,59,59,999);
  return d.toISOString();
}

async function showApp() {
  $("auth").style.display = "none";
  $("app").style.display = "block";
  await loadOrSetChild();
  await refreshAll();
}

async function showAuth(msg="") {
  $("auth").style.display = "block";
  $("app").style.display = "none";
  $("authMsg").textContent = msg;
}

async function loadOrSetChild() {
  const { data, error } = await sb.from("children").select("id,name").limit(1);
  if (error) {
    $("childInfo").textContent = "Error loading child: " + error.message;
    return;
  }
  if (data?.length) {
    childId = data[0].id;
    $("childInfo").textContent = `Using child: ${data[0].name}`;
  } else {
    $("childInfo").textContent = "No child set yet. Create one above.";
  }
}

async function createChild() {
  const name = $("childName").value.trim();
  if (!name) return alert("Enter a child name");

  const { data, error } = await sb
    .from("children")
    .insert({ name })   // user_id should auto-fill via default auth.uid()
    .select("id,name,user_id")
    .single();

  if (error) return alert(error.message);

  childId = data.id;
  $("childInfo").textContent = `Using child: ${data.name}`;
  $("childName").value = "";
  await refreshAll();
}

async function refreshAll() {
  if (!childId) return;
  await Promise.all([loadSleep(), loadMeals(), loadMoods(), loadMedsAndDoses()]);
}

// --- Sleep ---
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

  data.forEach(s => {
    const st = new Date(s.start_time);
    const et = s.end_time ? new Date(s.end_time) : null;
    if (et) totalMs += (et - st);
    const li = document.createElement("li");
    li.textContent = `${st.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})} → ${et ? et.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) : "…"}${s.notes ? " • " + s.notes : ""}`;
    $("sleepList").appendChild(li);
  });

  $("sleepTotal").textContent = `${(totalMs/3600000).toFixed(2)}h`;
}

async function sleepStart() {
  const notes = $("sleepNote").value.trim() || null;
  const { error } = await sb.from("sleep_sessions").insert({
    child_id: childId,
    start_time: new Date().toISOString(),
    notes
  });
  if (error) return alert(error.message);
  $("sleepNote").value = "";
  await loadSleep();
}

async function sleepEnd() {
  const { data, error } = await sb
    .from("sleep_sessions")
    .select("id,notes,start_time")
    .eq("child_id", childId)
    .is("end_time", null)
    .order("start_time", { ascending: false })
    .limit(1);

  if (error) return alert(error.message);
  if (!data.length) return alert("No active sleep session found.");

  const extra = $("sleepNote").value.trim();
  const newNotes = extra ? (data[0].notes ? `${data[0].notes} | ${extra}` : extra) : data[0].notes;

  const { error: upErr } = await sb
    .from("sleep_sessions")
    .update({ end_time: new Date().toISOString(), notes: newNotes })
    .eq("id", data[0].id);

  if (upErr) return alert(upErr.message);
  $("sleepNote").value = "";
  await loadSleep();
}

// --- Meals ---
async function addMeal() {
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
  if (error) return alert(error.message);

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

  $("mealList").innerHTML = data.map(m => {
    const t = new Date(m.time).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    return `<li>${t} • ${m.meal_type} • ${m.percent_eaten}% • ${m.food_text ?? ""}${m.notes ? " • " + m.notes : ""}</li>`;
  }).join("");
}

// --- Moods ---
async function saveMood() {
  const period = $("moodPeriod").value;
  const mood = $("moodValue").value;
  const notes = $("moodNotes").value.trim() || null;

  // Replace today's existing mood for that period (simple approach)
  const existing = await sb
    .from("moods")
    .select("id")
    .eq("child_id", childId)
    .eq("period", period)
    .gte("time", startOfToday())
    .lte("time", endOfToday())
    .limit(1);

  if (!existing.error && existing.data?.length) {
    await sb.from("moods").delete().eq("id", existing.data[0].id);
  }

  const { error } = await sb.from("moods").insert({ child_id: childId, period, mood, notes });
  if (error) return alert(error.message);

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

  $("moodList").innerHTML = data.map(x => {
    const t = new Date(x.time).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    return `<li>${t} • ${x.period}: ${x.mood}${x.notes ? " • " + x.notes : ""}</li>`;
  }).join("");
}

// --- Meds ---
async function loadMedsAndDoses() {
  const meds = await sb.from("medications").select("id,name,default_unit").order("name");
  if (!meds.error) {
    $("medSelect").innerHTML = (meds.data || []).map(m =>
      `<option value="${m.id}">${m.name}${m.default_unit ? " ("+m.default_unit+")" : ""}</option>`
    ).join("");
  }

  const doses = await sb
    .from("medication_doses")
    .select("given_at,dose,notes,medications(name)")
    .eq("child_id", childId)
    .gte("given_at", startOfToday())
    .lte("given_at", endOfToday())
    .order("given_at", { ascending: false });

  if (!doses.error) {
    $("medList").innerHTML = (doses.data || []).map(d => {
      const t = new Date(d.given_at).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
      return `<li>${t} • ${d.medications?.name ?? "Medication"} • ${d.dose}${d.notes ? " • " + d.notes : ""}</li>`;
    }).join("");
  }
}

async function addMedication() {
  const name = $("newMedName").value.trim();
  const default_unit = $("newMedUnit").value.trim() || null;
  if (!name) return alert("Enter medication name");

  const { error } = await sb.from("medications").insert({ name, default_unit });
  if (error) return alert(error.message);

  $("newMedName").value = "";
  $("newMedUnit").value = "";
  await loadMedsAndDoses();
}

async function addDose() {
  const medication_id = $("medSelect").value;
  const dose = $("medDose").value.trim();
  const notes = $("medNotes").value.trim() || null;

  if (!medication_id) return alert("Add/select a medication first");
  if (!dose) return alert("Enter dose");

  const { error } = await sb.from("medication_doses").insert({
    child_id: childId,
    medication_id,
    dose,
    notes
  });
  if (error) return alert(error.message);

  $("medDose").value = "";
  $("medNotes").value = "";
  await loadMedsAndDoses();
}

// --- Buttons ---
$("btnLogin").onclick = async () => {
  const email = $("email").value.trim();
  const password = $("password").value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return $("authMsg").textContent = error.message;
  $("authMsg").textContent = "";
  await showApp();
};

$("btnRegister").onclick = async () => {
  const email = $("email").value.trim();
  const password = $("password").value;
  const { error } = await sb.auth.signUp({ email, password });
  if (error) return $("authMsg").textContent = error.message;
  $("authMsg").textContent = "Registered! Now press Login.";
};

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
(async () => {
  const { data } = await sb.auth.getSession();
  if (data.session) await showApp();
  else showAuth();
})();
