/**************************************************
 * Routine Tracker – app.js (HTML-aligned)
 * Fixes:
 * - Forward arrows working
 * - Data loading (meals/moods/meds/etc)
 * - Historic highlighting (adds .historic to page card)
 * - Medication page works (medView id)
 * - Pills side-by-side (CSS handles; JS unchanged)
 * - Child select works on trackers
 **************************************************/

const SITE_URL = "https://staffybear.github.io/freddie-routine-pwa/";
const SUPABASE_URL = "https://jjjombeomtbztzchiult.supabase.co";
const SUPABASE_KEY = "sb_publishable_6Le75u-UJnbGCZMbLQ8kQQ_9cFOsfIl";

const INVITE_CODE_REQUIRED = "1006";
const BACKDATED_TIME = "10:06";
const QUEUE_KEY = "offlineQueue_v1";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

const VIEWS = [
  "authView","resetView","menuView",
  "adminView","adminChildrenView","adminMedsView",
  "sleepView","mealsView","moodsView","medView","aiView",
  "exportView"
];

let childId = null;
let selectedDateStr = yyyyMmDd(new Date());

// ---------- helpers ----------
function pad2(n){ return String(n).padStart(2,"0"); }
function yyyyMmDd(d=new Date()){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function todayStr(){ return yyyyMmDd(new Date()); }
function isToday(dateStr){ return dateStr === todayStr(); }

function parseDateStr(dateStr){
  const [y,m,d] = dateStr.split("-").map(Number);
  return new Date(y, m-1, d, 12, 0, 0, 0);
}
function addDays(dateStr, delta){
  const dt = parseDateStr(dateStr);
  dt.setDate(dt.getDate() + delta);
  return yyyyMmDd(dt);
}
function toIsoRangeForDate(dateStr){
  const [y,m,d] = dateStr.split("-").map(Number);
  const start = new Date(y, m-1, d, 0,0,0,0).toISOString();
  const end   = new Date(y, m-1, d, 23,59,59,999).toISOString();
  return { start, end };
}
function nowTimeStr(){
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function combineDateAndTime(dateStr, timeStr){
  const [y,m,d] = dateStr.split("-").map(Number);
  const [hh,mm] = timeStr.split(":").map(Number);
  return new Date(y, m-1, d, hh, mm, 0, 0).toISOString();
}
function autoTimestampForSelectedDay(dateStr){
  return isToday(dateStr) ? new Date().toISOString()
                          : combineDateAndTime(dateStr, BACKDATED_TIME);
}
function hhmm(iso){
  return new Date(iso).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
}

// ---------- offline queue ----------
function loadQueue(){
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); }
  catch { return []; }
}
function saveQueue(q){ localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
function queueInsert(table, payload){
  const q = loadQueue();
  q.push({ op:"insert", table, payload, queued_at: new Date().toISOString() });
  saveQueue(q);
}
async function requireUser(){
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error("Not logged in.");
  return data.user;
}
async function flushQueue(){
  const q = loadQueue();
  if (!q.length) return;
  if (!navigator.onLine) return;

  const user = await requireUser().catch(() => null);
  if (!user) return;

  const remaining = [];
  for (const item of q){
    try{
      if (item.op === "insert"){
        const res = await sb.from(item.table).insert(item.payload);
        if (res.error) throw res.error;
      }
    }catch(err){
      console.error("Sync failed:", item, err);
      remaining.push(item);
    }
  }
  saveQueue(remaining);
  await refreshVisible();
}
window.addEventListener("online", () => flushQueue());

// ---------- navigation / views ----------
function showView(id, push = true){
  for (const v of VIEWS){
    const el = $(v);
    if (el) el.classList.toggle("hidden", v !== id);
  }
  if (push) history.pushState({ view: id }, "", "#"+id);
}

window.addEventListener("popstate", (e) => {
  const view = e.state?.view || (location.hash ? location.hash.replace("#","") : "menuView");
  if (VIEWS.includes(view)) showView(view, false);
});

// Historic highlighting = add .historic to the page card (the <section>)
function applyHistoricToView(viewId){
  const el = $(viewId);
  if (!el) return;
  el.classList.toggle("historic", !isToday(selectedDateStr));
}

function applyAllHistorics(){
  applyHistoricToView("sleepView");
  applyHistoricToView("mealsView");
  applyHistoricToView("moodsView");
  applyHistoricToView("medView");
  applyHistoricToView("aiView");
}

// Prevent future dates + refresh
function setDate(newDate){
  if (newDate > todayStr()) newDate = todayStr();
  selectedDateStr = newDate;
  // keep picker values in sync + historic colour
  syncDatePickers();
  applyAllHistorics();
  refreshVisible();
}

function syncDatePickers(){
  const ids = ["sleepDatePicker","mealsDatePicker","moodsDatePicker","medDatePicker","aiDatePicker"];
  const t = todayStr();
  for (const id of ids){
    const p = $(id);
    if (!p) continue;
    p.max = t;
    p.value = selectedDateStr;
  }

  // disable next buttons on today
  const nextIds = ["sleepNext","mealsNext","moodsNext","medNext","aiNext"];
  for (const id of nextIds){
    const b = $(id);
    if (!b) continue;
    b.disabled = (selectedDateStr >= t);
  }
}

function wireDateBar(prefix){
  const prev = $(`${prefix}Prev`);
  const next = $(`${prefix}Next`);
  const picker = $(`${prefix}DatePicker`);

  if (prev) prev.onclick = () => setDate(addDays(selectedDateStr, -1));
  if (next) next.onclick = () => setDate(addDays(selectedDateStr, +1));
  if (picker) picker.onchange = (e) => setDate(e.target.value);
}

// ---------- children ----------
async function getChildren(){
  const res = await sb.from("children").select("id,name").order("created_at", { ascending:true });
  if (res.error) { console.error(res.error); return []; }
  return res.data || [];
}

async function fillChildSelect(selectId){
  const sel = $(selectId);
  if (!sel) return;

  const children = await getChildren();
  sel.innerHTML = "";

  if (!children.length){
    sel.innerHTML = `<option value="">No children yet</option>`;
    childId = null;
    return;
  }

  const last = localStorage.getItem("activeChildId");
  const exists = children.find(c => c.id === last);
  childId = exists ? exists.id : children[0].id;

  for (const c of children){
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  }
  sel.value = childId;

  sel.onchange = async () => {
    childId = sel.value;
    localStorage.setItem("activeChildId", childId);
    await refreshVisible();
  };
}

// ---------- admin: add child ----------
async function addChild(){
  const input = $("newChildNameMenu");
  const msg = $("adminChildrenMsg");
  if (!input) return;

  const name = input.value.trim();
  if (!name) return alert("Enter a child name.");

  const user = await requireUser();
  const payload = { name, user_id: user.id };

  if (!navigator.onLine){
    queueInsert("children", payload);
    input.value = "";
    if (msg) msg.textContent = "Saved offline. Will sync when online.";
    return;
  }

  const res = await sb.from("children").insert(payload);
  if (res.error) return alert(res.error.message);

  input.value = "";
  if (msg) msg.textContent = "Child added ✅";
}

// ---------- admin: add medication ----------
async function addMedicationFromAdmin(){
  const nameEl = $("newMedNameMenu");
  const unitEl = $("newMedUnitMenu");
  const msg = $("adminMedsMsg");
  if (!nameEl || !unitEl) return;

  const name = nameEl.value.trim();
  const default_unit = unitEl.value.trim() || null;
  if (!name) return alert("Enter medication name.");

  const user = await requireUser();
  const payload = { name, default_unit, user_id: user.id };

  if (!navigator.onLine){
    queueInsert("medications", payload);
    nameEl.value = "";
    unitEl.value = "";
    if (msg) msg.textContent = "Saved offline. Will sync when online.";
    return;
  }

  const res = await sb.from("medications").insert(payload);
  if (res.error) return alert(res.error.message);

  nameEl.value = "";
  unitEl.value = "";
  if (msg) msg.textContent = "Medication added ✅";
}

async function loadMedicationDropdowns(){
  const meds = await sb.from("medications").select("id,name,default_unit").order("name");
  const list = meds.error ? [] : (meds.data || []);

  const medSelect = $("medSelect");
  if (medSelect){
    medSelect.innerHTML = list.length
      ? list.map(m => `<option value="${m.id}">${m.name}${m.default_unit ? " ("+m.default_unit+")" : ""}</option>`).join("")
      : `<option value="">No meds yet</option>`;
  }

  const illMed = $("illMedication");
  if (illMed){
    illMed.innerHTML = `<option value="">None</option>` +
      list.map(m => `<option value="${m.id}">${m.name}</option>`).join("");
  }
}

// ---------- page refresh ----------
async function refreshVisible(){
  const activeView = VIEWS.find(v => $(v) && !$(v).classList.contains("hidden"));

  syncDatePickers();
  applyAllHistorics();

  if (!childId) return;

  if (activeView === "sleepView") await loadSleep();
  if (activeView === "mealsView") await loadMeals();
  if (activeView === "moodsView") await loadMoods();
  if (activeView === "medView")   { await loadMedicationDropdowns(); await loadDoses(); }
  if (activeView === "aiView")    { await loadMedicationDropdowns(); await loadAccidents(); await loadIllnesses(); }
}

// ---------- sleep ----------
async function loadSleep(){
  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb.from("sleep_sessions")
    .select("*")
    .eq("child_id", childId)
    .gte("start_time", start)
    .lte("start_time", end)
    .order("start_time", { ascending:false });

  if (res.error) { console.error(res.error); return; }

  const list = $("sleepList");
  if (!list) return;

  list.innerHTML = "";
  let totalMs = 0;

  (res.data || []).forEach(s => {
    const st = new Date(s.start_time);
    const et = s.end_time ? new Date(s.end_time) : null;
    if (et) totalMs += (et - st);

    const li = document.createElement("li");
    li.textContent = `${hhmm(s.start_time)} → ${s.end_time ? hhmm(s.end_time) : "…"}${s.notes ? " • " + s.notes : ""}`;
    list.appendChild(li);
  });

  const totalEl = $("sleepTotal");
  if (totalEl) totalEl.textContent = (totalMs / 3600000).toFixed(2) + "h";
}

async function sleepStart(){
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

async function sleepEnd(){
  if (!isToday(selectedDateStr)) return alert("Start/End buttons are for TODAY only.");
  if (!navigator.onLine) return alert("End requires internet. Use Manual entry while offline.");

  const open = await sb.from("sleep_sessions")
    .select("id")
    .eq("child_id", childId)
    .is("end_time", null)
    .order("start_time", { ascending:false })
    .limit(1);

  if (open.error) return alert(open.error.message);
  if (!open.data?.length) return alert("No active sleep session found.");

  const res = await sb.from("sleep_sessions")
    .update({ end_time: new Date().toISOString() })
    .eq("id", open.data[0].id);

  if (res.error) return alert(res.error.message);
  await loadSleep();
}

async function addSleepManual(){
  const startVal = $("sleepStartManual")?.value;
  const endVal = $("sleepEndManual")?.value;
  const notes = ($("sleepNote")?.value || "").trim() || null;

  if (!startVal) return alert("Pick a manual sleep START time.");

  const startIso = new Date(startVal).toISOString();
  const endIso = endVal ? new Date(endVal).toISOString() : null;
  if (endIso && new Date(endIso) < new Date(startIso)) return alert("End must be after start.");

  const user = await requireUser();
  const payload = { child_id: childId, start_time: startIso, end_time: endIso, notes, user_id: user.id };

  if (!navigator.onLine){
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
async function loadMeals(){
  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb.from("meals")
    .select("*")
    .eq("child_id", childId)
    .gte("time", start)
    .lte("time", end)
    .order("time", { ascending:false });

  if (res.error) { console.error(res.error); return; }

  const list = $("mealList");
  if (!list) return;

  list.innerHTML = (res.data || []).map(m => {
    const pct = (m.percent_eaten ?? 0);
    const food = (m.food_text ?? "").trim();
    const notes = m.notes ? ` • ${m.notes}` : "";
    return `<li>${m.meal_type} • ${pct}%${food ? " • " + food : ""}${notes}</li>`;
  }).join("");
}

async function addMeal(){
  const user = await requireUser();
  const payload = {
    user_id: user.id,
    child_id: childId,
    meal_type: $("mealType")?.value,
    percent_eaten: Number($("mealPercent")?.value ?? 0),
    food_text: ($("mealWhat")?.value || "").trim() || null,
    notes: ($("mealNotes")?.value || "").trim() || null,
    time: autoTimestampForSelectedDay(selectedDateStr),
  };

  if (!navigator.onLine){
    queueInsert("meals", payload);
    if ($("mealWhat")) $("mealWhat").value = "";
    if ($("mealNotes")) $("mealNotes").value = "";
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
async function loadMoods(){
  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb.from("moods")
    .select("*")
    .eq("child_id", childId)
    .gte("time", start)
    .lte("time", end)
    .order("time", { ascending:false });

  if (res.error) { console.error(res.error); return; }

  const list = $("moodList");
  if (!list) return;

  list.innerHTML = (res.data || [])
    .map(m => `<li>${m.period}: ${m.mood}${m.notes ? " • " + m.notes : ""}</li>`)
    .join("");
}

async function addMood(){
  const user = await requireUser();
  const payload = {
    user_id: user.id,
    child_id: childId,
    period: $("moodPeriod")?.value,
    mood: $("moodValue")?.value,
    notes: ($("moodNotes")?.value || "").trim() || null,
    time: autoTimestampForSelectedDay(selectedDateStr),
  };

  if (!navigator.onLine){
    queueInsert("moods", payload);
    if ($("moodNotes")) $("moodNotes").value = "";
    alert("Saved offline. Will sync when online.");
    return;
  }

  const res = await sb.from("moods").insert(payload);
  if (res.error) return alert(res.error.message);

  if ($("moodNotes")) $("moodNotes").value = "";
  await loadMoods();
}

// ---------- medication doses ----------
async function loadDoses(){
  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb.from("medication_doses")
    .select("given_at,dose,notes,medications(name)")
    .eq("child_id", childId)
    .gte("given_at", start)
    .lte("given_at", end)
    .order("given_at", { ascending:false });

  if (res.error) { console.error(res.error); return; }

  const list = $("medList");
  if (!list) return;

  list.innerHTML = (res.data || [])
    .map(d => `<li>${hhmm(d.given_at)} • ${d.medications?.name ?? "Medication"} • ${d.dose}${d.notes ? " • " + d.notes : ""}</li>`)
    .join("");
}

async function addDose(){
  const medication_id = $("medSelect")?.value;
  const dose = ($("medDose")?.value || "").trim();
  const notes = ($("medNotes")?.value || "").trim() || null;

  if (!medication_id) return alert("Select a medication first.");
  if (!dose) return alert("Enter a dose.");

  const user = await requireUser();

  const given_at = isToday(selectedDateStr)
    ? combineDateAndTime(selectedDateStr, ($("medTime")?.value || nowTimeStr()))
    : combineDateAndTime(selectedDateStr, BACKDATED_TIME);

  const payload = { user_id: user.id, child_id: childId, medication_id, dose, notes, given_at };

  if (!navigator.onLine){
    queueInsert("medication_doses", payload);
    if ($("medDose")) $("medDose").value = "";
    if ($("medNotes")) $("medNotes").value = "";
    alert("Saved offline. Will sync when online.");
    return;
  }

  const res = await sb.from("medication_doses").insert(payload);
  if (res.error) return alert(res.error.message);

  if ($("medDose")) $("medDose").value = "";
  if ($("medNotes")) $("medNotes").value = "";
  await loadDoses();
}

// ---------- Accident & Illness ----------
function setTab(which){
  const accBtn = $("tabAccident");
  const illBtn = $("tabIllness");
  const acc = $("accidentTab");
  const ill = $("illnessTab");

  if (!accBtn || !illBtn || !acc || !ill) return;

  if (which === "accident"){
    accBtn.classList.add("active");
    illBtn.classList.remove("active");
    acc.classList.remove("hidden");
    ill.classList.add("hidden");
  }else{
    illBtn.classList.add("active");
    accBtn.classList.remove("active");
    ill.classList.remove("hidden");
    acc.classList.add("hidden");
  }
}

async function loadAccidents(){
  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb.from("accidents")
    .select("*")
    .eq("child_id", childId)
    .gte("incident_time", start)
    .lte("incident_time", end)
    .order("incident_time", { ascending:false });

  if (res.error) { console.error(res.error); return; }

  const list = $("accidentList");
  if (!list) return;

  list.innerHTML = (res.data || []).map(a => {
    return `<li><b>${a.severity}</b> • ${a.body_area}${a.what_happened ? " • " + a.what_happened : ""}${a.notes ? " • " + a.notes : ""}</li>`;
  }).join("");
}

async function loadIllnesses(){
  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb.from("illnesses")
    .select("*")
    .eq("child_id", childId)
    .gte("event_time", start)
    .lte("event_time", end)
    .order("event_time", { ascending:false });

  if (res.error) { console.error(res.error); return; }

  const list = $("illnessList");
  if (!list) return;

  list.innerHTML = (res.data || []).map(i => {
    const t = i.temperature_c ? ` • ${i.temperature_c}°C` : "";
    const notes = i.notes ? ` • ${i.notes}` : "";
    return `<li>${i.symptom}${t}${notes}</li>`;
  }).join("");
}

async function addAccident(){
  const user = await requireUser();
  const what = ($("accWhat")?.value || "").trim();
  if (!what) return alert("Accident: 'What happened' is required.");

  const incident_time = isToday(selectedDateStr)
    ? combineDateAndTime(selectedDateStr, ($("accTime")?.value || nowTimeStr()))
    : combineDateAndTime(selectedDateStr, BACKDATED_TIME);

  const payload = {
    user_id: user.id,
    child_id: childId,
    incident_time,
    what_happened: what,
    severity: $("accSeverity")?.value || "Minor",
    body_area: $("accBodyArea")?.value || "Other",
    where_happened: ($("accWhere")?.value || "").trim() || null,
    reported_by: $("accReportedBy")?.value || "Mum",
    action_taken: ($("accAction")?.value || "").trim() || null,
    safeguarding: ($("accSafeguarding")?.value || "").trim() || null,
    notes: ($("accNotes")?.value || "").trim() || null
  };

  if (!navigator.onLine) queueInsert("accidents", payload);
  else {
    const res = await sb.from("accidents").insert(payload);
    if (res.error) return alert(res.error.message);
  }

  if ($("accWhat")) $("accWhat").value = "";
  if ($("accWhere")) $("accWhere").value = "";
  if ($("accAction")) $("accAction").value = "";
  if ($("accSafeguarding")) $("accSafeguarding").value = "";
  if ($("accNotes")) $("accNotes").value = "";

  await loadAccidents();
}

async function addIllness(){
  const user = await requireUser();

  const event_time = isToday(selectedDateStr)
    ? combineDateAndTime(selectedDateStr, ($("illTime")?.value || nowTimeStr()))
    : combineDateAndTime(selectedDateStr, BACKDATED_TIME);

  const payload = {
    user_id: user.id,
    child_id: childId,
    event_time,
    symptom: $("illSymptom")?.value || "Temperature",
    temperature_c: ($("illTemp")?.value || "").trim() ? Number(($("illTemp").value || "").trim()) : null,
    medication_id: $("illMedication")?.value || null,
    reported_by: $("illReportedBy")?.value || "Mum",
    notes: ($("illNotes")?.value || "").trim() || null
  };

  if (!navigator.onLine) queueInsert("illnesses", payload);
  else {
    const res = await sb.from("illnesses").insert(payload);
    if (res.error) return alert(res.error.message);
  }

  if ($("illTemp")) $("illTemp").value = "";
  if ($("illNotes")) $("illNotes").value = "";

  await loadIllnesses();
}

// ---------- auth ----------
async function doRegister(){
  const email = ($("email")?.value || "").trim();
  const password = $("password")?.value || "";
  const invite = ($("inviteCode")?.value || "").trim();

  if (!email || !password) return ($("authMsg").textContent = "Enter BOTH email and password.");
  if (invite !== INVITE_CODE_REQUIRED){
    return ($("authMsg").textContent = `Invite code required for registration.`);
  }

  $("authMsg").textContent = "Registering…";
  const res = await sb.auth.signUp({ email, password, options:{ emailRedirectTo: SITE_URL }});
  if (res.error) return ($("authMsg").textContent = res.error.message);
  $("authMsg").textContent = "Registered ✅ Confirm your email (if required), then Login.";
}

async function doLogin(){
  const email = ($("email")?.value || "").trim();
  const password = $("password")?.value || "";
  if (!email || !password) return ($("authMsg").textContent = "Enter BOTH email and password.");

  $("authMsg").textContent = "Logging in…";
  const res = await sb.auth.signInWithPassword({ email, password });
  if (res.error) return ($("authMsg").textContent = res.error.message);

  $("authMsg").textContent = "";
  showView("menuView");
  if (navigator.onLine) setTimeout(flushQueue, 500);
}

async function doForgotPassword(){
  const email = ($("email")?.value || "").trim();
  if (!email) return ($("authMsg").textContent = "Enter your email first.");
  $("authMsg").textContent = "Sending reset email…";
  const res = await sb.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL });
  if (res.error) return ($("authMsg").textContent = res.error.message);
  $("authMsg").textContent = "Reset email sent ✅ Check inbox/spam.";
}

function isRecoveryLink(){ return (location.hash || "").includes("type=recovery"); }

async function setNewPassword(){
  const p1 = $("newPassword")?.value || "";
  const p2 = $("newPassword2")?.value || "";
  if (!p1 || p1.length < 6) return ($("resetMsg").textContent = "Password must be at least 6 characters.");
  if (p1 !== p2) return ($("resetMsg").textContent = "Passwords do not match.");

  $("resetMsg").textContent = "Updating password…";
  const res = await sb.auth.updateUser({ password: p1 });
  if (res.error) return ($("resetMsg").textContent = res.error.message);

  $("resetMsg").textContent = "Password updated ✅ Please login.";
  history.replaceState(null, "", location.pathname + location.search);
  await sb.auth.signOut();
  showView("authView");
}

async function doLogout(){
  await sb.auth.signOut();
  childId = null;
  showView("authView");
}

// ---------- openers ----------
function openPage(viewId, after){
  return async () => {
    setDate(todayStr());     // always open on today
    showView(viewId);
    if (after) await after();
    await refreshVisible();
  };
}

// ---------- init ----------
(async function init(){
  if (isRecoveryLink()){
    showView("resetView", false);
  }else{
    const s = await sb.auth.getSession();
    showView(s.data?.session ? "menuView" : "authView", false);
  }

  // auth buttons
  $("btnLogin").onclick = doLogin;
  $("btnRegister").onclick = doRegister;
  $("btnForgot").onclick = doForgotPassword;
  $("btnSetNewPassword").onclick = setNewPassword;

  // menu
  $("goSleep").onclick = openPage("sleepView", async () => { await fillChildSelect("sleepChild"); });
  $("goMeals").onclick = openPage("mealsView", async () => { await fillChildSelect("mealsChild"); });
  $("goMoods").onclick = openPage("moodsView", async () => { await fillChildSelect("moodsChild"); });
  $("goMedication").onclick = openPage("medView", async () => {
    await fillChildSelect("medChild");
    await loadMedicationDropdowns();
    if ($("medTime")) $("medTime").value = nowTimeStr();
  });
  $("goAI").onclick = openPage("aiView", async () => {
    await fillChildSelect("aiChild");
    await loadMedicationDropdowns();
    if ($("accTime")) $("accTime").value = nowTimeStr();
    if ($("illTime")) $("illTime").value = nowTimeStr();
    setTab("accident");
  });

  $("goExport").onclick = () => showView("exportView");
  $("exportBack").onclick = () => showView("menuView");

  // admin navigation
  $("goAdmin").onclick = () => showView("adminView");
  $("adminBack").onclick = () => showView("menuView");
  $("goAdminChildren").onclick = () => showView("adminChildrenView");
  $("goAdminMeds").onclick = () => showView("adminMedsView");
  $("adminChildrenBack").onclick = () => showView("adminView");
  $("adminMedsBack").onclick = () => showView("adminView");

  // logout
  $("btnLogout").onclick = doLogout;

  // admin actions
  $("btnAddChild").onclick = addChild;
  $("btnAddMedAdmin").onclick = addMedicationFromAdmin;

  // back buttons
  $("sleepBack").onclick = () => showView("menuView");
  $("mealsBack").onclick = () => showView("menuView");
  $("moodsBack").onclick = () => showView("menuView");
  $("medBack").onclick = () => showView("menuView");
  $("aiBack").onclick = () => showView("menuView");

  // date bars
  wireDateBar("sleep");
  wireDateBar("meals");
  wireDateBar("moods");
  wireDateBar("med");
  wireDateBar("ai");

  // actions
  $("btnSleepStart").onclick = sleepStart;
  $("btnSleepEnd").onclick = sleepEnd;
  $("btnSleepManual").onclick = addSleepManual;

  $("btnAddMeal").onclick = addMeal;
  $("btnAddMood").onclick = addMood;
  $("btnAddDose").onclick = addDose;

  // tabs
  $("tabAccident").onclick = () => setTab("accident");
  $("tabIllness").onclick = () => setTab("illness");

  $("btnAddAccident").onclick = addAccident;
  $("btnAddIllness").onclick = addIllness;

  // start
  setDate(todayStr());
})();
