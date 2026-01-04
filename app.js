/**************************************************
 * Routine Tracker – app.js
 * Fix pack: Android nav + historic highlight + meds
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
  "sleepView","mealsView","moodsView","medsView","aiView",
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
function formatDateNice(dateStr){
  const d = parseDateStr(dateStr);
  return d.toLocaleDateString([], { weekday:"short", day:"2-digit", month:"short", year:"numeric" });
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
  showOfflineBanner();
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
  showOfflineBanner();
  await refreshVisible();
}
function showOfflineBanner(){
  const banner = $("offlineBanner");
  if (!banner) return;

  const q = loadQueue();
  if (!navigator.onLine){
    banner.classList.remove("hidden");
    banner.textContent = `OFFLINE: entries will sync automatically when online. Queued: ${q.length}`;
    return;
  }
  if (q.length){
    banner.classList.remove("hidden");
    banner.textContent = `ONLINE: syncing queued entries… Remaining: ${q.length}`;
    return;
  }
  banner.classList.add("hidden");
}
window.addEventListener("online", () => flushQueue());
window.addEventListener("offline", () => showOfflineBanner());

// ---------- navigation / views ----------
function showView(id, push = true){
  for (const v of VIEWS){
    const el = $(v);
    if (el) el.classList.toggle("hidden", v !== id);
  }
  if (push) history.pushState({ view: id }, "", "#"+id);
  showOfflineBanner();
}

window.addEventListener("popstate", (e) => {
  const view = e.state?.view || (location.hash ? location.hash.replace("#","") : "menuView");
  if (VIEWS.includes(view)) showView(view, false);
});

function applyHistoric(cardId){
  const el = $(cardId);
  if (!el) return;
  el.classList.toggle("historic", !isToday(selectedDateStr));
}

function applyDateUI(prefix, cardId){
  const label = $(`${prefix}DateLabel`);
  if (label) label.textContent = formatDateNice(selectedDateStr);

  const picker = $(`${prefix}DatePicker`);
  if (picker){
    picker.max = todayStr();
    picker.value = selectedDateStr;
  }

  const nextBtn = $(`${prefix}Next`);
  if (nextBtn) nextBtn.disabled = (selectedDateStr >= todayStr());

  applyHistoric(cardId);
}

function applyAllDateBars(){
  applyDateUI("sleep","sleepCard");
  applyDateUI("meals","mealsCard");
  applyDateUI("moods","moodsCard");
  applyDateUI("med","medCard");
  applyDateUI("ai","accidentTab");
  applyHistoric("illnessTab");
}

function setDate(newDate){
  if (newDate > todayStr()) newDate = todayStr();
  selectedDateStr = newDate;
  applyAllDateBars();
  refreshVisible();
}

function wireDateBar(prefix){
  $(`${prefix}Prev`).onclick = () => setDate(addDays(selectedDateStr, -1));
  $(`${prefix}Today`).onclick = () => setDate(todayStr());
  $(`${prefix}Next`).onclick = () => setDate(addDays(selectedDateStr, +1));
  $(`${prefix}DatePicker`).onchange = (e) => setDate(e.target.value);
}

// ---------- children ----------
async function getChildren(){
  const res = await sb.from("children").select("id,name").order("created_at", { ascending:true });
  if (res.error) { console.error(res.error); return []; }
  return res.data || [];
}

async function fillChildSelect(selectId){
  const sel = $(selectId);
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

async function addChild(){
  const name = $("childName").value.trim();
  if (!name) return alert("Enter a child name.");
  const user = await requireUser();
  const payload = { name, user_id: user.id };

  if (!navigator.onLine){
    queueInsert("children", payload);
    $("childName").value = "";
    $("childAdminMsg").textContent = "Saved offline. Will sync when online.";
    return;
  }

  const res = await sb.from("children").insert(payload);
  if (res.error) return alert(res.error.message);

  $("childName").value = "";
  $("childAdminMsg").textContent = "Child added ✅";
}

// ---------- medication admin + dropdowns ----------
async function addMedicationFromAdmin(){
  const name = $("newMedNameMenu").value.trim();
  const default_unit = $("newMedUnitMenu").value.trim() || null;
  if (!name) return alert("Enter medication name.");

  const user = await requireUser();
  const payload = { name, default_unit, user_id: user.id };

  if (!navigator.onLine){
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
  applyAllDateBars();

  if (!childId) return;

  if (activeView === "sleepView") await loadSleep();
  if (activeView === "mealsView") await loadMeals();
  if (activeView === "moodsView") await loadMoods();
  if (activeView === "medsView")  { await loadMedicationDropdowns(); await loadDoses(); }
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

  $("sleepList").innerHTML = "";
  let totalMs = 0;

  (res.data || []).forEach(s => {
    const st = new Date(s.start_time);
    const et = s.end_time ? new Date(s.end_time) : null;
    if (et) totalMs += (et - st);

    const li = document.createElement("li");
    li.textContent = `${hhmm(s.start_time)} → ${s.end_time ? hhmm(s.end_time) : "…"}${s.notes ? " • " + s.notes : ""}`;
    $("sleepList").appendChild(li);
  });

  $("sleepTotal").textContent = (totalMs / 3600000).toFixed(2) + "h";
}

async function sleepStart(){
  if (!isToday(selectedDateStr)) return alert("Start/End buttons are for TODAY only.");
  if (!navigator.onLine) return alert("Start requires internet. Use Manual entry while offline.");

  const user = await requireUser();
  const notes = $("sleepNote").value.trim() || null;
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
  const startVal = $("sleepStartManual").value;
  const endVal = $("sleepEndManual").value;
  const notes = $("sleepNote").value.trim() || null;
  if (!startVal) return alert("Pick a manual sleep START time.");

  const startIso = new Date(startVal).toISOString();
  const endIso = endVal ? new Date(endVal).toISOString() : null;
  if (endIso && new Date(endIso) < new Date(startIso)) return alert("End must be after start.");

  const user = await requireUser();
  const payload = { child_id: childId, start_time: startIso, end_time: endIso, notes, user_id: user.id };

  if (!navigator.onLine){
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

  $("mealList").innerHTML = (res.data || []).map(m => {
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
    meal_type: $("mealType").value,
    percent_eaten: Number($("mealPercent").value),
    food_text: $("mealFood").value.trim() || null,
    notes: $("mealNotes").value.trim() || null,
    time: autoTimestampForSelectedDay(selectedDateStr),
  };

  if (!navigator.onLine){
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

  $("moodList").innerHTML = (res.data || [])
    .map(m => `<li>${m.period}: ${m.mood}${m.notes ? " • " + m.notes : ""}</li>`)
    .join("");
}

async function addMood(){
  const user = await requireUser();
  const payload = {
    user_id: user.id,
    child_id: childId,
    period: $("moodPeriod").value,
    mood: $("moodValue").value,
    notes: $("moodNotes").value.trim() || null,
    time: autoTimestampForSelectedDay(selectedDateStr),
  };

  if (!navigator.onLine){
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

  $("medList").innerHTML = (res.data || [])
    .map(d => `<li>${hhmm(d.given_at)} • ${d.medications?.name ?? "Medication"} • ${d.dose}${d.notes ? " • " + d.notes : ""}</li>`)
    .join("");
}

async function addDose(){
  const medication_id = $("medSelect").value;
  const dose = $("medDose").value.trim();
  const notes = $("medNotes").value.trim() || null;

  if (!medication_id) return alert("Select a medication first.");
  if (!dose) return alert("Enter a dose.");

  const user = await requireUser();

  const given_at = isToday(selectedDateStr)
    ? combineDateAndTime(selectedDateStr, ($("medTime").value || nowTimeStr()))
    : combineDateAndTime(selectedDateStr, BACKDATED_TIME);

  const payload = { user_id: user.id, child_id: childId, medication_id, dose, notes, given_at };

  if (!navigator.onLine){
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
  await loadDoses();
}

// ---------- Accident & Illness ----------
function setTab(which){
  const accBtn = $("tabAccident");
  const illBtn = $("tabIllness");
  const acc = $("accidentTab");
  const ill = $("illnessTab");

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

function toggleOther(selectId, wrapId, inputId){
  const sel = $(selectId);
  const wrap = $(wrapId);
  const inp = $(inputId);
  if (!sel || !wrap || !inp) return;
  const isOther = sel.value === "Other";
  wrap.classList.toggle("hidden", !isOther);
  if (!isOther) inp.value = "";
}

function updateBreathingFlag(){
  const isBreathing = $("illSymptom").value === "Breathing difficulties";
  $("illFlag").classList.toggle("hidden", !isBreathing);
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

  $("accidentList").innerHTML = (res.data || []).map(a => {
    const body = a.body_area === "Other" ? `Other: ${a.body_area_other}` : a.body_area;
    const rep  = a.reported_by === "Other" ? `Other: ${a.reported_by_other}` : a.reported_by;
    return `<li><b>${a.severity}</b> • ${body} • ${a.what_happened}${a.where_happened ? " • " + a.where_happened : ""} • Reported: ${rep}${a.notes ? " • " + a.notes : ""}</li>`;
  }).join("");
}

async function addAccident(){
  const user = await requireUser();
  const what = $("accWhat").value.trim();
  if (!what) return alert("Accident: 'What happened' is required.");

  const bodyArea = $("accBodyArea").value;
  const bodyOther = $("accBodyOther").value.trim();
  if (bodyArea === "Other" && !bodyOther) return alert("Accident: Body area 'Other' must be filled.");

  const repBy = $("accReportedBy").value;
  const repOther = $("accReportedOther").value.trim();
  if (repBy === "Other" && !repOther) return alert("Accident: Reported by 'Other' must be filled.");

  const incident_time = isToday(selectedDateStr)
    ? combineDateAndTime(selectedDateStr, ($("accTime").value || nowTimeStr()))
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

  if (!navigator.onLine) queueInsert("accidents", payload);
  else {
    const res = await sb.from("accidents").insert(payload);
    if (res.error) return alert(res.error.message);
  }

  $("accWhat").value = "";
  $("accWhere").value = "";
  $("accAction").value = "";
  $("accSafeguarding").value = "";
  $("accNotes").value = "";
  $("accTime").value = nowTimeStr();

  toggleOther("accBodyArea","accBodyOtherWrap","accBodyOther");
  toggleOther("accReportedBy","accReportedOtherWrap","accReportedOther");

  await loadAccidents();
}

async function loadIllnesses(){
  const { start, end } = toIsoRangeForDate(selectedDateStr);
  const res = await sb.from("illnesses")
    .select("event_time,symptom,symptom_other,temperature_c,notes,reported_by,reported_by_other,medications(name)")
    .eq("child_id", childId)
    .gte("event_time", start)
    .lte("event_time", end)
    .order("event_time", { ascending:false });

  if (res.error) { console.error(res.error); return; }

  $("illnessList").innerHTML = (res.data || []).map(i => {
    const s = i.symptom === "Other" ? `Other: ${i.symptom_other}` : i.symptom;
    const rep = i.reported_by === "Other" ? `Other: ${i.reported_by_other}` : i.reported_by;
    const t = i.temperature_c ? ` • ${i.temperature_c}°C` : "";
    const med = i.medications?.name ? ` • ${i.medications.name}` : "";
    const notes = i.notes ? ` • ${i.notes}` : "";
    return `<li>${s}${t}${med} • Reported: ${rep}${notes}</li>`;
  }).join("");
}

async function addIllness(){
  const user = await requireUser();

  const symptom = $("illSymptom").value;
  const symptom_other = $("illOther").value.trim();
  if (symptom === "Other" && !symptom_other) return alert("Illness: Symptom 'Other' must be filled.");

  const repBy = $("illReportedBy").value;
  const repOther = $("illReportedOther").value.trim();
  if (repBy === "Other" && !repOther) return alert("Illness: Reported by 'Other' must be filled.");

  const event_time = isToday(selectedDateStr)
    ? combineDateAndTime(selectedDateStr, ($("illTime").value || nowTimeStr()))
    : combineDateAndTime(selectedDateStr, BACKDATED_TIME);

  const medication_id = $("illMedication").value || null;

  const payload = {
    user_id: user.id,
    child_id: childId,
    event_time,
    symptom,
    symptom_other: symptom === "Other" ? symptom_other : null,
    temperature_c: $("illTemp").value.trim() ? Number($("illTemp").value.trim()) : null,
    medication_id,
    reported_by: repBy,
    reported_by_other: repBy === "Other" ? repOther : null,
    notes: $("illNotes").value.trim() || null
  };

  if (!navigator.onLine) queueInsert("illnesses", payload);
  else {
    const res = await sb.from("illnesses").insert(payload);
    if (res.error) return alert(res.error.message);
  }

  $("illTemp").value = "";
  $("illNotes").value = "";
  $("illTime").value = nowTimeStr();

  toggleOther("illSymptom","illOtherWrap","illOther");
  toggleOther("illReportedBy","illReportedOtherWrap","illReportedOther");
  updateBreathingFlag();

  await loadIllnesses();
}

// ---------- auth ----------
async function doRegister(){
  const email = $("email").value.trim();
  const password = $("password").value;
  const invite = $("inviteCode").value.trim();

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
  const email = $("email").value.trim();
  const password = $("password").value;
  if (!email || !password) return ($("authMsg").textContent = "Enter BOTH email and password.");

  $("authMsg").textContent = "Logging in…";
  const res = await sb.auth.signInWithPassword({ email, password });
  if (res.error) return ($("authMsg").textContent = res.error.message);

  $("authMsg").textContent = "";
  openMenu();
  if (navigator.onLine) setTimeout(flushQueue, 500);
}

async function doForgotPassword(){
  const email = $("email").value.trim();
  if (!email) return ($("authMsg").textContent = "Enter your email first.");
  $("authMsg").textContent = "Sending reset email…";
  const res = await sb.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL });
  if (res.error) return ($("authMsg").textContent = res.error.message);
  $("authMsg").textContent = "Reset email sent ✅ Check inbox/spam.";
}

function isRecoveryLink(){ return (location.hash || "").includes("type=recovery"); }

async function setNewPassword(){
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
  showView("authView");
}

async function doLogout(){
  await sb.auth.signOut();
  childId = null;
  showView("authView");
}

// ---------- openers ----------
function openMenu(){
  showView("menuView");
}

function openPage(viewId, after){
  return async () => {
    setDate(todayStr());        // ✅ ALWAYS go to today when opening a page from menu
    showView(viewId);
    if (after) await after();
    await refreshVisible();
  };
}

// ---------- init ----------
(async function init(){
  // Auth state
  if (isRecoveryLink()){
    showView("resetView", false);
  }else{
    const s = await sb.auth.getSession();
    showView(s.data?.session ? "menuView" : "authView", false);
  }

  // wire auth
  $("btnLogin").onclick = doLogin;
  $("btnRegister").onclick = doRegister;
  $("btnForgot").onclick = doForgotPassword;
  $("btnSetNewPassword").onclick = setNewPassword;

  // menu -> pages
  $("goSleep").onclick = openPage("sleepView", async () => {
    await fillChildSelect("sleepChildSelect");
  });

  $("goMeals").onclick = openPage("mealsView", async () => {
    await fillChildSelect("mealsChildSelect");
  });

  $("goMoods").onclick = openPage("moodsView", async () => {
    await fillChildSelect("moodsChildSelect");
  });

  $("goMedication").onclick = openPage("medsView", async () => {
    await fillChildSelect("medChildSelect");
    await loadMedicationDropdowns();
    $("medTime").value = nowTimeStr();
  });

  $("goAI").onclick = openPage("aiView", async () => {
    await fillChildSelect("aiChildSelect");
    await loadMedicationDropdowns();
    $("accTime").value = nowTimeStr();
    $("illTime").value = nowTimeStr();
    setTab("accident");
    updateBreathingFlag();
  });

  $("goExport").onclick = () => showView("exportView");
  $("exportBack").onclick = () => openMenu();

  // admin
  $("goAdmin").onclick = () => showView("adminView");
  $("adminBack").onclick = () => openMenu();
  $("goAdminChildren").onclick = () => showView("adminChildrenView");
  $("goAdminMeds").onclick = () => showView("adminMedsView");
  $("adminChildrenBack").onclick = () => showView("adminView");
  $("adminMedsBack").onclick = () => showView("adminView");

  // logout next to admin
  $("btnLogout").onclick = doLogout;

  // admin actions
  $("btnAddChild").onclick = addChild;
  $("btnAddMedAdmin").onclick = addMedicationFromAdmin;

  // back buttons
  $("sleepBack").onclick = () => openMenu();
  $("mealsBack").onclick = () => openMenu();
  $("moodsBack").onclick = () => openMenu();
  $("medBack").onclick = () => openMenu();
  $("aiBack").onclick = () => openMenu();

  // date bars
  wireDateBar("sleep");
  wireDateBar("meals");
  wireDateBar("moods");
  wireDateBar("med");
  wireDateBar("ai");

  // tracker actions
  $("btnSleepStart").onclick = sleepStart;
  $("btnSleepEnd").onclick = sleepEnd;
  $("btnSleepManual").onclick = addSleepManual;

  $("btnAddMeal").onclick = addMeal;
  $("btnAddMood").onclick = addMood;

  $("btnAddDose").onclick = addDose;

  // tabs
  $("tabAccident").onclick = () => setTab("accident");
  $("tabIllness").onclick = () => setTab("illness");

  // A&I actions
  $("btnAddAccident").onclick = addAccident;
  $("btnAddIllness").onclick = addIllness;

  // other fields toggles
  $("accBodyArea").onchange = () => toggleOther("accBodyArea","accBodyOtherWrap","accBodyOther");
  $("accReportedBy").onchange = () => toggleOther("accReportedBy","accReportedOtherWrap","accReportedOther");
  $("illSymptom").onchange = () => { toggleOther("illSymptom","illOtherWrap","illOther"); updateBreathingFlag(); };
  $("illReportedBy").onchange = () => toggleOther("illReportedBy","illReportedOtherWrap","illReportedOther");

  // start on today
  setDate(todayStr());
  showOfflineBanner();
})();
