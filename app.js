import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  deleteUser,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const VV_APP_VERSION = "v186-refresh-home-after-persisted-login";
console.log("VILLAGE VIBES PHASE 1 VERSION:", VV_APP_VERSION);
const DEV_MODE = false;

// Firebase config is already filled in for this project.
// First system admin is created manually in Firebase Auth + Firestore.

const firebaseConfig = {
  apiKey: "AIzaSyB7GIoqjmbmUwHKJgQiKnXVBu7JzSgZ6cI",
  authDomain: "villagevibes-a5385.firebaseapp.com",
  projectId: "villagevibes-a5385",
  storageBucket: "villagevibes-a5385.firebasestorage.app",
  messagingSenderId: "262735062876",
  appId: "1:262735062876:web:69b3f88203420199d6c399"
};


const FIRST_SYSTEM_ADMIN_UID = ""; // Optional override. First-run setup also creates a systemAdmin user.
const DEFAULT_AUTH_PASSWORD = "P4ssw0rd";
const SYSTEM_EMAIL_DOMAIN = "villagevibes.com";

const SAVED_SCHOOL_KEY = "villageVibesLastSchoolId";
const RECENT_USERS_KEY = "villageVibesRecentLoginUsers";
const TOOL_PREFS_KEY = "villageVibesToolPrefs";
const THEME_PREF_KEY = "villageVibesTheme";
const STAY_LOGGED_IN_KEY = "villageVibesStayLoggedIn";
const VILLAGE_VOICE_SESSION_KEY = "villageVibesVillageVoiceUnsavedSession";
const VILLAGE_VOICE_LAYOUT_OVERRIDE_KEY = "villageVoiceExplicitSlotLayoutV97";
const LETTERLAND_SPRITE_LOCAL_PREFIX = "local:letterlandSprite:";
const LETTERLAND_SPRITE_FIRESTORE_PREFIX = "firestore:letterlandSprite:";
const LETTERLAND_SPRITE_LOCAL_INDEX_KEY = "villageVibesLetterlandSpriteIndex";
const LETTERLAND_FIRESTORE_SAFE_IMAGE_BYTES = 900000;
const LETTERLAND_FIRESTORE_CHUNK_BYTES = 650000;
const VILLAGE_VOICE_EMPTY_SLOT = "__voice_empty__";

function readLocalJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {}
}


function makeTinyHash(text = "") {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function pruneLetterlandSpriteLocalStorage(keepKey = "") {
  try {
    const index = readLocalJson(LETTERLAND_SPRITE_LOCAL_INDEX_KEY, []);
    index.forEach(item => { if (item?.key && item.key !== keepKey) localStorage.removeItem(item.key); });
    Object.keys(localStorage).forEach(key => { if (key.startsWith(LETTERLAND_SPRITE_LOCAL_PREFIX) && key !== keepKey) localStorage.removeItem(key); });
    writeLocalJson(LETTERLAND_SPRITE_LOCAL_INDEX_KEY, keepKey ? [{ key: keepKey, savedAt: new Date().toISOString() }] : []);
  } catch (err) {}
}

function storeLetterlandSpriteLocally(dataUrl = "") {
  if (!dataUrl) return "";
  const id = `${Date.now().toString(36)}_${makeTinyHash(dataUrl).slice(0, 8)}`;
  const key = `${LETTERLAND_SPRITE_LOCAL_PREFIX}${id}`;
  window.__vvLetterlandSpriteSheet = dataUrl;
  try { sessionStorage.setItem(key, dataUrl); } catch (err) {}
  try {
    pruneLetterlandSpriteLocalStorage();
    localStorage.setItem(key, dataUrl);
    writeLocalJson(LETTERLAND_SPRITE_LOCAL_INDEX_KEY, [{ key, savedAt: new Date().toISOString(), bytes: dataUrl.length }]);
    return key;
  } catch (err) {
    try {
      // One more pass: older saved drafts can hold big data URLs. Keep the current runtime sheet,
      // but clear old Letterland local copies so the latest sheet has the best chance to survive reloads.
      pruneLetterlandSpriteLocalStorage();
      localStorage.setItem(key, dataUrl);
      writeLocalJson(LETTERLAND_SPRITE_LOCAL_INDEX_KEY, [{ key, savedAt: new Date().toISOString(), bytes: dataUrl.length }]);
      return key;
    } catch (err2) {
      console.warn("Could not store Letterland sprite sheet locally.", err2);
      return "__LETTERLAND_RUNTIME_ONLY__";
    }
  }
}

function getLetterlandSpriteFirestoreId(ref = "") {
  const raw = String(ref || "");
  return raw.startsWith(LETTERLAND_SPRITE_FIRESTORE_PREFIX) ? raw.slice(LETTERLAND_SPRITE_FIRESTORE_PREFIX.length) : "";
}

function getLetterlandSpriteCacheKey(id = "current") {
  return `__vvLetterlandSpriteSheet_${id || "current"}`;
}

function resolveLetterlandSpriteSheet(value = "") {
  const raw = String(value || "");
  if (!raw) return "";
  if (raw === "__LETTERLAND_RUNTIME_ONLY__") return window.__vvLetterlandSpriteSheet || "";
  if (raw.startsWith(LETTERLAND_SPRITE_FIRESTORE_PREFIX)) {
    const id = getLetterlandSpriteFirestoreId(raw) || "current";
    return window[getLetterlandSpriteCacheKey(id)] || window.__vvLetterlandSpriteSheet || "";
  }
  if (raw.startsWith(LETTERLAND_SPRITE_LOCAL_PREFIX)) {
    try { return localStorage.getItem(raw) || sessionStorage.getItem(raw) || window.__vvLetterlandSpriteSheet || ""; } catch (err) { try { return sessionStorage.getItem(raw) || window.__vvLetterlandSpriteSheet || ""; } catch (_) { return window.__vvLetterlandSpriteSheet || ""; } }
  }
  return raw;
}

function getLetterlandSpriteSheetRefFromForm(form) {
  const realForm = form || getWeeklyThemesForm();
  const field = realForm?.querySelector('[name="letterlandSpriteSheet"]');
  return field?.value || "";
}

async function saveLetterlandSpriteSheetToFirestore(dataUrl = "", id = "current") {
  const safeId = id || "current";
  const text = String(dataUrl || "");
  if (!text) return "";
  const chunks = [];
  for (let i = 0; i < text.length; i += LETTERLAND_FIRESTORE_CHUNK_BYTES) chunks.push(text.slice(i, i + LETTERLAND_FIRESTORE_CHUNK_BYTES));
  const chunksRef = collection(db, "letterlandSpriteSheets", safeId, "chunks");
  try {
    const old = await getDocs(chunksRef);
    await Promise.all(old.docs.map(d => deleteDoc(doc(db, "letterlandSpriteSheets", safeId, "chunks", d.id))));
  } catch (err) {}
  await Promise.all(chunks.map((chunk, i) => setDoc(doc(db, "letterlandSpriteSheets", safeId, "chunks", String(i).padStart(4, "0")), { i, chunk })));
  await setDoc(doc(db, "letterlandSpriteSheets", safeId), {
    chunkCount: chunks.length,
    bytes: text.length,
    updatedAt: serverTimestamp(),
    updatedBy: state.session?.uid || ""
  }, { merge: true });
  window[getLetterlandSpriteCacheKey(safeId)] = text;
  window.__vvLetterlandSpriteSheet = text;
  return `${LETTERLAND_SPRITE_FIRESTORE_PREFIX}${safeId}`;
}

async function loadLetterlandSpriteSheetFromFirestore(ref = "") {
  const id = getLetterlandSpriteFirestoreId(ref);
  if (!id) return "";
  const cached = window[getLetterlandSpriteCacheKey(id)];
  if (cached) return cached;
  const snap = await getDocs(query(collection(db, "letterlandSpriteSheets", id, "chunks"), orderBy("i")));
  const dataUrl = snap.docs.map(d => d.data()?.chunk || "").join("");
  if (dataUrl) {
    window[getLetterlandSpriteCacheKey(id)] = dataUrl;
    window.__vvLetterlandSpriteSheet = dataUrl;
  }
  return dataUrl;
}

async function getLetterlandSpriteSheetRefForSave(form) {
  const realForm = form || getWeeklyThemesForm();
  const field = realForm?.querySelector('[name="letterlandSpriteSheet"]');
  const raw = field?.value || "";
  if (!raw) return "";
  if (raw.startsWith(LETTERLAND_SPRITE_FIRESTORE_PREFIX)) return raw;
  const resolved = resolveLetterlandSpriteSheet(raw) || raw;
  if (resolved && resolved.length > LETTERLAND_FIRESTORE_SAFE_IMAGE_BYTES) {
    const ref = await saveLetterlandSpriteSheetToFirestore(resolved, "current");
    if (field) field.value = ref;
    return ref;
  }
  return raw;
}

function getThemePreference() {
  try { return localStorage.getItem(THEME_PREF_KEY) || "light"; } catch (err) { return "light"; }
}

function applyThemePreference(theme) {
  const safeTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = safeTheme;
  try { localStorage.setItem(THEME_PREF_KEY, safeTheme); } catch (err) {}
}

function toggleThemePreference() {
  const nextTheme = getThemePreference() === "dark" ? "light" : "dark";
  applyThemePreference(nextTheme);
  return nextTheme;
}

function getStayLoggedInPreference() {
  try { return localStorage.getItem(STAY_LOGGED_IN_KEY) === "true"; } catch (err) { return false; }
}

function setStayLoggedInPreference(value) {
  try { localStorage.setItem(STAY_LOGGED_IN_KEY, value ? "true" : "false"); } catch (err) {}
}

async function applyLoginPersistence(stayLoggedIn) {
  await setPersistence(auth, stayLoggedIn ? browserLocalPersistence : browserSessionPersistence);
}

async function waitForFirebaseAuthReady() {
  if (auth.currentUser) return auth.currentUser;
  return await new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (user) => {
      off();
      resolve(user || null);
    }, () => {
      off();
      resolve(null);
    });
  });
}

async function restorePersistedSessionIfAvailable() {
  await applyLoginPersistence(getStayLoggedInPreference());
  const firebaseUser = await waitForFirebaseAuthReady();
  if (!firebaseUser?.uid) return false;
  const profile = await readUser(firebaseUser.uid);
  if (!profile || profile.active === false) {
    await signOut(auth).catch(() => {});
    return false;
  }
  state.session = profile;
  rememberPickedUser(profile);
  await refreshAdminData();
  return true;
}

function clearOldAppCachesInBackground() {
  try {
    const last = localStorage.getItem("villageVibesAppVersion");
    localStorage.setItem("villageVibesAppVersion", VV_APP_VERSION);
    if (last && last !== VV_APP_VERSION && window.caches?.keys) {
      caches.keys().then(keys => keys.forEach(key => caches.delete(key))).catch(() => {});
      navigator.serviceWorker?.getRegistrations?.().then(regs => regs.forEach(reg => reg.unregister())).catch(() => {});
    }
  } catch (err) {}
}


function getToolPrefs() {
  return readLocalJson(TOOL_PREFS_KEY, { order: [], bookmarks: [], hidden: [] });
}
function saveToolPrefs(prefs) { writeLocalJson(TOOL_PREFS_KEY, prefs); }
function getCampusCaresOpenPreference() { return getToolPrefs().campusCaresOpenMode || "submitPopup"; }
function setCampusCaresOpenPreference(mode) { const prefs=getToolPrefs(); prefs.campusCaresOpenMode=mode; saveToolPrefs(prefs); }
function isToolBookmarked(toolId) { return (getToolPrefs().bookmarks || []).includes(toolId); }
function isToolHidden(toolId) { return (getToolPrefs().hidden || []).includes(toolId); }
function getToolConfig(toolKey) { return state.appTools.find(t => t.key === toolKey) || {}; }
function getToolDisplay(tool) {
  const cfg = getToolConfig(tool.id);
  const safeName = tool.id === "villageVoice" && (!cfg.name || cfg.name === "Village Voice" || cfg.name === "The Village Voice") ? "Printables" : (cfg.name || tool.title);
  return { ...tool, title: safeName, desc: cfg.description || tool.desc, imageData: cfg.imageData || "" };
}
function orderToolsForHome(tools) {
  const prefs = getToolPrefs();
  const idx = new Map((prefs.order || []).map((id, i) => [id, i]));
  return [...tools].sort((a,b)=>(idx.has(a.id)?idx.get(a.id):999)-(idx.has(b.id)?idx.get(b.id):999) || String(a.title).localeCompare(String(b.title)));
}
function renderToolTile(tool, extraClass = "") {
  const t = getToolDisplay(tool);
  const bookmarked = isToolBookmarked(t.id);
  return `<div class="home-tool-wrap ${extraClass}" draggable="true" data-drag-tool="${t.id}" data-tool-card="${t.id}">
    <button class="tool-tile square-tool-tile" data-tool="${t.id}" type="button">
      ${t.imageData ? `<img class="tool-tile-image" src="${t.imageData}" alt="${t.title}" />` : `<div class="tool-icon">${t.icon}</div>`}
      <h3>${t.title}</h3>
    </button>
    <div class="tool-tile-controls">
      ${t.id === "campusCares" ? `<button class="mini-icon-button" type="button" title="Campus Cares open setting" data-campus-open-menu>⋯</button>` : ""}
      <button class="mini-icon-button" type="button" title="Bookmark" data-bookmark-tool="${t.id}">${bookmarked ? "★" : "☆"}</button>
      <button class="mini-icon-button" type="button" title="Hide" data-hide-tool="${t.id}">×</button>
      ${t.id === "campusCares" ? `<div class="tool-tile-menu" data-campus-open-menu-panel><strong>Open Campus Cares to:</strong><button type="button" data-campus-open-mode="submitPopup">Submit Request popup</button><button type="button" data-campus-open-mode="tool">Open the tool</button><button type="button" data-campus-open-mode="submitted">View Your Submissions</button></div>` : ""}
    </div>
  </div>`;
}
function getUnreadNotificationCount() { return state.notifications.filter(n => n.read !== true).length; }

function saveLastSelectedSchool(schoolId) {
  if (!schoolId) return;
  try { localStorage.setItem(SAVED_SCHOOL_KEY, schoolId); } catch (err) {}
}

function getSavedSchoolId() {
  try { return localStorage.getItem(SAVED_SCHOOL_KEY) || ""; } catch (err) { return ""; }
}

function isRecentlyPickableUser(user) {
  return getRosterGroup(user) === "staff";
}

function rememberPickedUser(user) {
  if (!user?.uid || !state.selectedSchoolId || !isRecentlyPickableUser(user)) return;
  const existing = readLocalJson(RECENT_USERS_KEY, []);
  const next = [
    { uid: user.uid, schoolId: state.selectedSchoolId, pickedAt: Date.now() },
    ...existing.filter(item => item.uid !== user.uid || item.schoolId !== state.selectedSchoolId)
  ].slice(0, 12);
  writeLocalJson(RECENT_USERS_KEY, next);
}

function getRecentRosterUsers() {
  const recent = readLocalJson(RECENT_USERS_KEY, []);
  return recent
    .filter(item => item.schoolId === state.selectedSchoolId)
    .map(item => state.roster.find(u => u.uid === item.uid))
    .filter(user => user && isRecentlyPickableUser(user))
    .sort(byName)
    .slice(0, 4);
}

function getUserRoleKeys(user) {
  const roles = Array.isArray(user?.roles) && user.roles.length ? user.roles : [getPrimaryRole(user)];
  return roles.map(normalizeRoleKey);
}

function getRosterGroup(user) {
  const roles = getUserRoleKeys(user);
  if (roles.some(r => ["owner", "admin", "systemadmin", "system-admin", "system_admin", "dev", "leader", "lead"].includes(r))) return "leaders";
  return "staff";
}

function renderRosterButton(user) {
  return `<button class="name-button slim-name-button" data-login-uid="${user.uid}" type="button">${user.firstName || ""} ${user.lastName || ""}</button>`;
}

function renderRosterSection(title, users, emptyText = "No users found.") {
  return `
    <div class="roster-section">
      <h3>${title}</h3>
      <div class="name-grid four">
        ${users.length ? users.map(renderRosterButton).join("") : `<div class="empty grid-empty">${emptyText}</div>`}
      </div>
    </div>
  `;
}

const PERMISSION_TOOLS = [
  {
    key: "moneyRequests",
    name: "Money Requests",
    permissions: [
      {
        key: "submit",
        label: "Money Request Form",
        description: "Can see and submit money requests."
      },
      {
        key: "approvePending",
        label: "Pending DOSO Approval",
        description: "Can view newly submitted requests and complete the first approval step. This can require a specific position like DOSO."
      },
      {
        key: "processApproved",
        label: "Owner Approval / Final Approved",
        description: "Can view DOSO-approved requests, complete the owner approval step, and view final approved requests."
      },
      {
        key: "addReceipts",
        label: "Approved Requests / Add Receipts",
        description: "Can see owner-approved requests and add receipt photos and receipt line details."
      }
    ]
  },
  {
    key: "campusCares",
    name: "Campus Cares",
    permissions: [
      { key: "submit", label: "Submit Campus Care Requests", description: "Can submit campus care tasks and see their own submitted tasks." },
      { key: "assigned", label: "Tasks Assigned To Me", description: "Can see tasks assigned directly to them." },
      { key: "viewAll", label: "All Tasks Read Only", description: "Can see all active tasks for their assigned school location(s), but cannot manage them." },
      { key: "manage", label: "Manage Campus Care Tasks", description: "Can see all tasks, update statuses, add leader notes, and assign tasks to leaders/owners." }
    ]
  },
  {
    key: "notifications",
    name: "Notifications",
    permissions: [
      { key: "campusOwnStatus", label: "Campus Cares: My Request Status Updates", description: "Can turn on alerts when status updates are added to their own submitted tasks." },
      { key: "campusAssigned", label: "Campus Cares: Tasks Assigned To Me", description: "Can turn on alerts when a Campus Cares task is assigned to them." },
      { key: "campusNotes", label: "Campus Cares: Notes On Visible Tasks", description: "Can turn on alerts when leader notes are added to tasks they can see." },
      { key: "campusSchoolSubmitted", label: "Campus Cares: New School Requests", description: "Can turn on alerts when any Campus Cares task is submitted for their assigned school location(s)." },
      { key: "moneyRequests", label: "Money Requests Notifications", description: "Can turn on alerts for Money Request activity they are allowed to see." }
    ]
  },
  {
    key: "coreChampion",
    name: "Core Count Champion",
    permissions: [
      { key: "vote", label: "Vote / Nominate", description: "Can nominate and vote for Core Counts Champion." },
      { key: "manage", label: "Manage Champion Voting", description: "Can open rounds, pick winners, and manage eligibility." }
    ]
  },
  {
    key: "villageVoice",
    name: "Printables",
    permissions: [
      {
        key: "editFlyer",
        label: "Edit Printables",
        description: "Can open Printables and edit printable items like Village Voice, Teacher Bio, Door Reminders, and Illness Notice."
      },
      {
        key: "arrangeFlyer",
        label: "Arrange Printable Layouts",
        description: "Can drag printable blocks into full-width or side-by-side layouts."
      }
    ]
  }
];

function getRolePermissionValue(role, toolKey, permissionKey) {
  return role?.permissions?.[toolKey]?.[permissionKey] || { enabled: false, positions: [] };
}

function collectRolePermissions(form) {
  const permissions = {};

  PERMISSION_TOOLS.forEach(tool => {
    permissions[tool.key] = {};
    (tool?.permissions || []).forEach(permission => {
      const enabledInput = form.querySelector(`[name="perm__${tool.key}__${permission.key}"]`);
      const positionInputs = Array.from(form.querySelectorAll(`[name="pos__${tool.key}__${permission.key}"]:checked`));

      permissions[tool.key][permission.key] = {
        enabled: !!enabledInput?.checked,
        positions: positionInputs.map(i => i.value)
      };
    });
  });

  return permissions;
}


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let state = {
  session: null,
  schools: [],
  roster: [],
  users: [],
  positions: [],
  roles: [],
  moneyRequestTypes: [],
  moneyRequests: [],
  campusCareLocations: [],
  campusCareStatuses: [],
  campusCareTasks: [],
  campusCareDiscussions: [],
  budgetCodes: [],
  importantDates: [],
  weeklyThemes: [],
  weeklyThemesDraftImages: {},
  weeklyThemesDraftTiles: {},
  certificates: [],
  appSettings: {},
  appTools: [],
  notifications: [],
  villageVoiceDraft: null,
  printableDrafts: {},
  illnessNoticeTemplates: [],
  printableTab: "villageVoice",
  villageVoiceSelectedMonth: String(new Date().getMonth() + 1).padStart(2, "0"),
  expandedVillageVoiceEditorId: "",
  editingImportantDateId: "",
  homeToolSearch: "",
  toolAdminTab: "moneyRequests",
  selectedMoneyApprovalIds: [],
  selectedSchoolId: "",
  adminTab: "schools",
  leadershipTab: "users",
  ownerTab: "budgetCodes",
  moneyRequestsTab: "submit",
  campusCaresTab: "submit",
  expandedCampusCareId: "",
  activeCampusDiscussionId: "",
  expandedMoneyRequestId: "",
  expandedPermissionToolKey: "moneyRequests",
  expandedHomeToolKey: "moneyRequests",
  notificationsOpen: false,
  modal: null,
  toast: "",
  currentView: "landing",
  adminLoginOpen: false,
  devViewRoleKey: "",
  devViewPosition: "",
  editMoneyRequestId: "",
  onboardingStep: 0,
  publicShareView: null,
  publicShareUsers: [],
  coreChampionRounds: [],
  photoPrint: { photos: [], texts: [], selectedId: "", selectedIds: [], selectedType: "", nextZ: 1, loaded: false, zoom: 0.75, contextMenu: null }
};

const $app = document.getElementById("app");

function safeLower(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function makeDisplayName(user) {
  return `${user.firstName || ""} ${(user.lastName || "").slice(0, 1)}.`.trim();
}


const WHAT_I_LIKE_SUGGESTIONS = {
  restaurants: ["McDonald's", "Chick-fil-A", "Starbucks", "Panera", "Chipotle", "Jersey Mike's", "Subway", "Taco Bell", "Wendy's", "Cook Out", "Dunkin'", "Bojangles"],
  drinks: ["Starbucks", "Dunkin'", "Sweet Tea", "Coffee", "Dr Pepper", "Diet Coke", "Coke Zero", "Sprite", "Lemonade", "Water", "Sparkling Water"],
  shops: ["Target", "Amazon", "Walmart", "TJ Maxx", "Marshalls", "Hobby Lobby", "Michael's", "Bath & Body Works", "HomeGoods", "Dollar Tree", "Five Below"],
  snacks: ["Chocolate", "Reese's", "M&M's", "Skittles", "Sour Patch Kids", "Goldfish", "Popcorn", "Pretzels", "Chips", "Trail Mix", "Fruit"],
  candle: ["Vanilla", "Lavender", "Fresh Linen", "Pumpkin Spice", "Cinnamon", "Eucalyptus", "Mahogany Teakwood", "Apple", "Coconut", "Coffee"],
  flower: ["Sunflowers", "Roses", "Tulips", "Daisies", "Lilies", "Peonies", "Hydrangeas", "Carnations"],
  color: ["Blue", "Green", "Pink", "Purple", "Yellow", "Red", "Orange", "Teal", "Black", "White", "Gold"],
  team: ["NC State", "UNC", "Duke", "Carolina Panthers", "Carolina Hurricanes", "Charlotte Hornets", "Atlanta Braves"],
  special: ["I love handwritten notes", "I collect mugs", "I love plants", "I enjoy reading", "I love cozy blankets", "I enjoy puzzles", "I love classroom supplies"],
  dietary: ["No allergies", "Gluten free", "Dairy free", "Nut allergy", "Vegetarian", "Vegan", "No pork", "No seafood", "Low sugar"]
};

function likeDatalistId(key) { return `likeSuggestions_${key}`; }
function renderLikeDatalist(key) {
  const items = WHAT_I_LIKE_SUGGESTIONS[key] || [];
  return `<datalist id="${likeDatalistId(key)}">${items.map(v => `<option value="${escapeHtml(v)}"></option>`).join("")}</datalist>`;
}

const WHAT_I_LIKE_FIELDS = [
  ["dietary", "Special Dietary Restrictions or Allergies"],
  ["restaurants", "Favorite Restaurants / Places to Eat"],
  ["drinks", "Favorite Drinks"],
  ["shops", "Favorite Places to Shop"],
  ["snacks", "Favorite Snacks / Candy / Treats"],
  ["candle", "Favorite Candle Smell"],
  ["flower", "Favorite Flower"],
  ["color", "Favorite Color"],
  ["team", "Favorite Team"],
  ["special", "Something Special About Me"]
];

function normalizeLikeList(value) {
  if (Array.isArray(value)) return value.map(v => String(v || "").trim()).filter(Boolean);
  return String(value || "").split(/\n|;/).map(v => v.trim()).filter(Boolean);
}

function getWhatILike(user = {}) {
  const v = user.whatILike || {};
  const out = {};
  WHAT_I_LIKE_FIELDS.forEach(([key]) => { out[key] = normalizeLikeList(key === "dietary" ? (v.dietary || v.allergies || "") : v[key]); });
  return out;
}

function collectLikeList(form, key) {
  const chips = Array.from(form.querySelectorAll(`[data-like-chip-value="${key}"]`)).map(i => i.value.trim()).filter(Boolean);
  const modern = Array.from(form.querySelectorAll(`[name="like_${key}"]`)).map(i => i.value.trim()).filter(Boolean);
  const combined = [...chips, ...modern];
  if (combined.length) return Array.from(new Set(combined));
  const legacyName = "like" + key.charAt(0).toUpperCase() + key.slice(1);
  return normalizeLikeList(form[legacyName]?.value || "");
}

function collectWhatILike(form) {
  const out = {};
  WHAT_I_LIKE_FIELDS.forEach(([key]) => { out[key] = collectLikeList(form, key); });
  return out;
}

function renderLikeChip(key, value) {
  return `<span class="like-chip" data-like-chip><input type="hidden" data-like-chip-value="${key}" value="${escapeHtml(value)}" /><span>${escapeHtml(value)}</span><button type="button" class="like-chip-remove" data-remove-like-chip aria-label="Remove ${escapeHtml(value)}">−</button></span>`;
}

function renderLikeRows(key, values = []) {
  const chips = (values || []).filter(Boolean).map(value => renderLikeChip(key, value)).join("");
  return `<div class="like-chip-list ${chips ? "" : "is-empty"}" data-like-chip-list="${key}">${chips || `<span class="like-empty-hint">No items yet.</span>`}</div>
  <div class="like-entry-row" data-like-row>
    <input name="like_${key}" value="" list="${likeDatalistId(key)}" placeholder="Type one favorite..." autocomplete="off" data-like-entry-input="${key}" />
    <button type="button" class="secondary small like-add-button hidden" data-add-like-row="${key}" title="Add item">+</button>
  </div>
  ${renderLikeDatalist(key)}`;
}

function renderWhatILikeFields(user = {}) {
  const v = getWhatILike(user);
  return `<div class="what-i-like-editor dynamic-likes-editor">
    <div class="likes-editor-intro">
      <h3>What I Like</h3>
      <p class="helper">Add one favorite at a time. Start typing and suggestions will appear, then press + or Enter to add it to the list.</p>
    </div>
    <div class="likes-editor-grid">
      ${WHAT_I_LIKE_FIELDS.map(([key, label]) => `<section class="like-editor-card" data-like-group="${key}">
        <div class="like-card-heading"><h4>${escapeHtml(label)}</h4><small>${(WHAT_I_LIKE_SUGGESTIONS[key] || []).slice(0,3).map(escapeHtml).join(" • ")}</small></div>
        <div data-like-rows="${key}">${renderLikeRows(key, v[key])}</div>
      </section>`).join("")}
    </div>
  </div>`;
}

function renderWhatILikeDisplay(user = {}, compact = false) {
  const v = getWhatILike(user);
  const items = WHAT_I_LIKE_FIELDS.map(([key, label]) => [label, v[key]]).filter(([, value]) => Array.isArray(value) && value.length);
  if (!items.length) return `<p class="helper">No favorites have been added yet.</p>`;
  return `<div class="likes-grid ${compact ? "compact-likes-grid" : ""}">${items.map(([label, values]) => `<div class="like-tile"><small>${escapeHtml(label)}</small><strong>${values.map(value => `<span>${escapeHtml(value)}</span>`).join("")}</strong></div>`).join("")}</div>`;
}

function getOnboardingMissingItems(user = {}) {
  const missing = [];
  if (!String(user.usedName || "").trim()) missing.push("Confirm or add your used name");
  if (!String(user.birthday || "").trim()) missing.push("Add your birthday");
  const educationItems = normalizeEducationList(user.educationList || user.education);
  if (!educationItems.length) missing.push("Add education");
  if (!String(user.whyEarlyEducation || "").trim()) missing.push("Fill out Why I Chose Early Education");
  const likes = getWhatILike(user);
  if (!Object.values(likes).some(v => Array.isArray(v) ? v.length : String(v || "").trim())) missing.push("Add at least one What I Like item");
  return missing;
}

function getOnboardingStatusHtml(user = {}) {
  const checks = [
    [!!String(user.usedName || "").trim(), "Profile details"],
    [!!String(user.birthday || "").trim(), "Birthday"],
    [normalizeEducationList(user.educationList || user.education).length > 0, "Education"],
    [!!String(user.whyEarlyEducation || "").trim(), "Why I chose education"],
    [Object.values(getWhatILike(user)).some(v => Array.isArray(v) ? v.length : String(v || "").trim()), "What I like"]
  ];
  return `<div class="onboarding-mini-checklist">${checks.map(([ok, label]) => `<span class="${ok ? "done" : "todo"}">${ok ? "✓" : "○"} ${escapeHtml(label)}</span>`).join("")}</div>`;
}

function isOnboardingRequired(user = {}) {
  return !!user && user.active !== false && (user.onboardingRequired === true || user.pinResetRequired === true);
}

function isOnboardingComplete(user = {}) {
  return getOnboardingMissingItems(user).length === 0;
}

function getResolvedRoleKeys(user) {
  const rawRoles = getUserRoleKeys(user);
  const resolved = new Set(rawRoles);

  // Users may store either the role key (ex: dev) or the role name
  // (ex: System Admin). Resolve both through the Roles collection.
  state.roles.forEach(role => {
    const key = normalizeRoleKey(role.key);
    const name = normalizeRoleKey(role.name);
    if ((key && rawRoles.includes(key)) || (name && rawRoles.includes(name))) {
      if (key) resolved.add(key);
      if (name) resolved.add(name);
    }
  });

  return Array.from(resolved);
}

function hasAnyRole(user, allowed) {
  const allowedKeys = allowed.map(normalizeRoleKey);
  return getResolvedRoleKeys(user).some(role => allowedKeys.includes(role));
}

function isSystemAdmin(user) {
  return user?.uid === FIRST_SYSTEM_ADMIN_UID || hasAnyRole(user, ["systemadmin", "system-admin", "system_admin", "system admin", "dev"]);
}

function isLeaderOrAdmin(user) {
  return isSystemAdmin(user) || hasAnyRole(user, ["lead", "leader", "owner", "admin"]);
}

function canUseLeadership(user) {
  return isSystemAdmin(user) || isLeaderOrAdmin(user);
}

function canUseSystemAdmin(user) {
  return isSystemAdmin(user);
}

function canUseOwnersPanel(user) {
  return isSystemAdmin(user) || hasAnyRole(user, ["owner"]);
}

function normalizeRoleKey(value) {
  return String(value || "").trim().toLowerCase();
}

function roleRequiresPassword(roleKey) {
  const key = normalizeRoleKey(roleKey);
  return ["lead", "leader", "owner", "admin", "systemadmin", "system-admin", "system_admin", "dev"].includes(key);
}

function getPrimaryRole(user) {
  if (user?.role) return user.role;
  if (Array.isArray(user?.roles) && user.roles.length) return user.roles[0];
  return "teacher";
}

function devPreviewActive() {
  return isSystemAdmin(state.session) && (!!state.devViewRoleKey || !!state.devViewPosition);
}

function hasFullDevAccess(user = state.session) {
  return isSystemAdmin(user) && !devPreviewActive();
}

function getPermissionUser(user = state.session) {
  if (!user) return user;
  if (!isSystemAdmin(user) || !devPreviewActive()) return user;
  return {
    ...user,
    role: state.devViewRoleKey || getPrimaryRole(user),
    roles: [state.devViewRoleKey || getPrimaryRole(user)].filter(Boolean),
    teamPosition: state.devViewPosition || user.teamPosition || user.position || "",
    position: state.devViewPosition || user.position || user.teamPosition || ""
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch] || ch));
}

function getUserUsedName(user) {
  return (user?.usedName || user?.displayName || `${user?.firstName || ""} ${user?.lastName || ""}`).trim();
}

function showToast(message) {
  state.toast = message;
  renderCurrentView();
  setTimeout(() => {
    state.toast = "";
    renderCurrentView();
  }, 3500);
}

function byName(a, b) {
  return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
}

async function loadSchools() {
  // Avoid composite indexes in Phase 1: read schools, then filter/sort in the browser.
  const snap = await getDocs(collection(db, "schools"));
  state.schools = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(s => s.active !== false)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  const savedSchoolId = getSavedSchoolId();
  if (!state.selectedSchoolId && savedSchoolId && state.schools.some(s => s.id === savedSchoolId)) {
    state.selectedSchoolId = savedSchoolId;
  }
  if (!state.selectedSchoolId && state.schools.length) state.selectedSchoolId = state.schools[0].id;
}

async function loadRoster() {
  if (!state.selectedSchoolId) {
    state.roster = [];
    return;
  }
  // Avoid composite indexes in Phase 1: query by school membership, then filter active in the browser.
  const snap = await getDocs(query(collection(db, "users"), where("schoolIds", "array-contains", state.selectedSchoolId)));
  state.roster = snap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .filter(u => u.active !== false)
    .sort(byName);
}

async function refreshLandingData() {
  await loadSchools();
  await loadAppSettings();
  await loadRoster();
}


async function loadAllUsers() {
  const snap = await getDocs(collection(db, "users"));
  state.users = snap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .filter(u => u.active !== false)
    .filter(u => userSchoolMatchesScope(u.schoolIds || (u.schoolId ? [u.schoolId] : []), state.session))
    .sort(byName);
}

async function refreshAdminData() {
  await loadSchools();
  await loadAllUsers();
  await loadPositions();
  await loadRoles();
  await loadCoreChampionRounds();
  await loadMoneyRequestTypes();
  await loadMoneyRequests();
  await loadCampusCaresAdmin();
  await loadCampusCareTasks();
  await loadCampusCareDiscussions();
  await loadBudgetCodes();
  await loadImportantDates();
  await loadWeeklyThemes();
  await loadCertificates();
  await loadAppSettings();
  await loadAppTools();
  await loadNotifications();
  await loadVillageVoiceDraft();
  await loadPrintableDrafts();
  await loadIllnessNoticeTemplates();
}

async function refreshMoneyRequestsData() {
  // Keep the Money Requests tool fast by loading only the collections it needs.
  // The full admin refresh was pulling every admin collection on every tool click.
  await Promise.all([
    loadMoneyRequestTypes(),
    loadMoneyRequests(),
    loadCampusCaresAdmin(),
    loadCampusCareTasks(),
    loadCampusCareDiscussions(),
    loadBudgetCodes(),
    loadNotifications()
  ]);
}

function showAppLoading(message = "Loading...") {
  hideAppLoading();
  const overlay = document.createElement("div");
  overlay.className = "app-loading-overlay";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.innerHTML = `<div class="app-loading-card"><div class="app-spinner"></div><strong>${message}</strong></div>`;
  document.body.appendChild(overlay);
}

function hideAppLoading() {
  document.querySelector(".app-loading-overlay")?.remove();
}

async function withAppLoading(message, task) {
  showAppLoading(message);
  const startedAt = Date.now();
  try {
    await new Promise(resolve => requestAnimationFrame(resolve));
    return await task();
  } finally {
    const elapsed = Date.now() - startedAt;
    if (elapsed < 175) await new Promise(resolve => setTimeout(resolve, 175 - elapsed));
    hideAppLoading();
  }
}


async function loadPositions() {
  const snap = await getDocs(collection(db, "positions"));
  state.positions = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.active !== false)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

async function loadRoles() {
  const snap = await getDocs(collection(db, "roles"));
  state.roles = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(r => r.active !== false)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}


async function loadMoneyRequestTypes() {
  const snap = await getDocs(collection(db, "moneyRequestTypes"));
  state.moneyRequestTypes = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(t => t.active !== false)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

async function loadMoneyRequests() {
  const snap = await getDocs(collection(db, "moneyRequests"));
  state.moneyRequests = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bt - at;
    });
}

async function loadCampusCaresAdmin() {
  const [locSnap, statusSnap] = await Promise.all([
    getDocs(collection(db, "campusCareLocations")),
    getDocs(collection(db, "campusCareStatuses"))
  ]);
  state.campusCareLocations = locSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.active !== false).sort((a,b)=>String(a.building||"").localeCompare(String(b.building||"")));
  state.campusCareStatuses = statusSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.active !== false).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0) || String(a.name||"").localeCompare(String(b.name||"")));
}

async function loadCampusCareTasks() {
  const snap = await getDocs(collection(db, "campusCareTasks"));
  state.campusCareTasks = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b)=>{
    const at = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0);
    const bt = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0);
    return bt-at;
  });
}

async function loadCampusCareDiscussions() {
  const snap = await getDocs(collection(db, "campusCareDiscussions"));
  state.campusCareDiscussions = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b)=>{
    const at = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0);
    const bt = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0);
    return bt-at;
  });
}

function getDefaultCampusCareStatus() {
  return { id: "", name: "", color: "" };
}
function getCampusStatus(id) { return state.campusCareStatuses.find(s => s.id === id) || getDefaultCampusCareStatus(); }
function isCampusCompleted(task) { return !!task.statusId && /completed|complete|done/i.test(getCampusStatus(task.statusId).name || task.statusName || ""); }
function campusTaskInUserScope(task, user = state.session) { return userSchoolMatchesScope(task.schoolIds || (task.schoolId ? [task.schoolId] : []), user); }
function campusDate(value) { try { const d=value?.toDate?value.toDate():new Date(value||Date.now()); return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${String(d.getFullYear()).slice(-2)}`; } catch(err){ return ""; } }
function campusTime(value) { try { const d=value?.toDate?value.toDate():new Date(value||Date.now()); return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch(err){ return ""; } }
function campusShortStamp(value) { try { const d=value?.toDate?value.toDate():new Date(value||Date.now()); return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).toLowerCase()}`; } catch(err){ return ""; } }
function campusDiscussionInUserScope(d, user = state.session) { return userSchoolMatchesScope(d.schoolIds || (d.schoolId ? [d.schoolId] : []), user); }
function activeCampusDiscussions() { return state.campusCareDiscussions.filter(d=>d.active!==false && !d.removedAt && campusDiscussionInUserScope(d)); }
function campusNoteList(list=[]) { return [...list].sort((a,b)=>new Date(a.at||0)-new Date(b.at||0)); }
function notificationSettingEnabled(user, key) { const settings=user?.notificationSettings||{}; return settings[key] === true; }
function notificationAllowedForUser(user, key) { return hasToolPermission(user, "notifications", key) || hasFullDevAccess(user); }
function usersAllowedForNotification(key, schoolIds=[]) { return state.users.filter(u => u.active !== false && notificationAllowedForUser(u, key) && notificationSettingEnabled(u, key) && userSchoolMatchesScope(schoolIds, u)); }
function campusTaskSchoolIds(taskOrFormLoc) { return taskOrFormLoc?.schoolIds || (taskOrFormLoc?.schoolId ? [taskOrFormLoc.schoolId] : getUserSchoolIds(state.session)); }
async function createNotificationsForUsers(users, payload) {
  const unique = [...new Map(users.filter(Boolean).map(u => [u.uid, u])).values()];
  await Promise.all(unique.map(u => createNotification({ ...payload, toUids: [u.uid] }).catch(()=>{})));
}
function campusLeaderUsers() { return state.users.filter(u => getRosterGroup(u) === "leaders" && u.active !== false && userSchoolMatchesScope(u.schoolIds || (u.schoolId ? [u.schoolId] : []), state.session)).sort(byName); }
async function refreshCampusCaresData() { await Promise.all([loadAllUsers(), loadCampusCaresAdmin(), loadCampusCareTasks(), loadCampusCareDiscussions()]); }


async function loadImportantDates() {
  try {
    const snap = await getDocs(collection(db, "importantDates"));
    state.importantDates = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  } catch (err) { state.importantDates = []; }
}

async function loadWeeklyThemes() {
  try {
    const snap = await getDocs(collection(db, "weeklyThemes"));
    state.weeklyThemes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const current = state.weeklyThemes.find(t => t.id === "current");
    const ref = current?.letterlandSpriteSheet || "";
    if (String(ref).startsWith(LETTERLAND_SPRITE_FIRESTORE_PREFIX)) {
      await loadLetterlandSpriteSheetFromFirestore(ref).catch(err => console.warn("Could not load shared Letterland sprite sheet.", err));
    }
  } catch (err) { state.weeklyThemes = []; }
}


async function loadCertificates() {
  try {
    const snap = await getDocs(collection(db, "certificates"));
    state.certificates = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => c.active !== false)
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  } catch (err) { state.certificates = []; }
}

function normalizeEducationList(value) {
  if (Array.isArray(value)) return value.map(item => ({ level: item.level || "", field: item.field || "", certificate: item.certificate || "" })).filter(item => item.level || item.field || item.certificate);
  if (typeof value === "string" && value.trim()) return [{ level: "", field: value.trim(), certificate: "" }];
  return [];
}

function educationDisplayText(item) {
  if (!item) return "";
  if (item.level === "Certificate") return item.certificate || item.field || "Certificate";
  if (item.level === "High School Diploma") return item.field ? `High School Diploma, Class of ${item.field}` : "High School Diploma";
  const level = item.level || "Education";
  const field = item.field || "";
  return field ? `${level} in ${field}` : level;
}

function collectEducationEntries(form) {
  return Array.from(form.querySelectorAll("[data-education-row]")).map(row => ({
    level: row.querySelector('[name="educationLevel"]')?.value || "",
    field: row.querySelector('[name="educationGradYear"]')?.value || row.querySelector('[name="educationField"]')?.value?.trim() || "",
    certificate: row.querySelector('[name="educationCertificate"]')?.value || ""
  })).filter(item => item.level || item.field || item.certificate);
}

function renderEducationBuilder(user = {}) {
  const items = normalizeEducationList(user.educationList || user.education);
  const rows = items.length ? items : [{ level: "", field: "", certificate: "" }];
  return `<div class="education-builder" data-education-builder>
    <label class="field-label">Education / Certificates</label>
    <div data-education-rows>${rows.map(renderEducationRow).join("")}</div>
    <button type="button" class="secondary small" data-add-education-row>+ Add another education item</button>
  </div>`;
}

function renderEducationRow(item = {}) {
  const levels = ["", "High School Diploma", "Certificate", "Associate Degree", "Bachelor's Degree", "Master's Degree", "Doctorate", "Other"];
  const certs = state.certificates || [];
  const isCert = item.level === "Certificate";
  const isHighSchool = item.level === "High School Diploma";
  const currentYear = new Date().getFullYear();
  const gradYears = Array.from({ length: currentYear - 1949 }, (_, i) => String(currentYear - i));
  return `<div class="education-row" data-education-row>
    <select name="educationLevel" data-education-level title="${escapeHtml(item.level || "Select level...")}">
      ${levels.map(l => `<option value="${escapeHtml(l)}" ${item.level === l ? "selected" : ""}>${l || "Select level..."}</option>`).join("")}
    </select>
    <span class="education-in ${isCert || isHighSchool ? "hidden" : ""}">in</span>
    <input name="educationField" class="${isCert || isHighSchool ? "hidden" : ""}" value="${escapeHtml(!isHighSchool ? (item.field || "") : "")}" placeholder="Early Childhood Education" />
    <select name="educationGradYear" data-education-grad-year class="${isHighSchool ? "" : "hidden"}" title="${escapeHtml(item.field || "Graduation year...")}">
      <option value="">Graduation year...</option>
      ${gradYears.map(y => `<option value="${escapeHtml(y)}" ${String(item.field || "") === y ? "selected" : ""}>${escapeHtml(y)}</option>`).join("")}
    </select>
    <select name="educationCertificate" data-education-certificate class="${isCert ? "" : "hidden"}" title="${escapeHtml(item.certificate || "Select certificate...")}">
      <option value="">Select certificate...</option>
      ${certs.map(c => `<option value="${escapeHtml(c.name || "")}" ${item.certificate === c.name ? "selected" : ""}>${escapeHtml(c.name || "")}</option>`).join("")}
    </select>
    <button type="button" class="secondary small education-remove-btn" data-remove-education-row>Remove</button>
  </div>`;
}

function refreshEducationCertificateOptions(scope = document) {
  const builder = scope.closest?.("[data-education-builder]") || scope.querySelector?.("[data-education-builder]") || document.querySelector("[data-education-builder]");
  if (!builder) return;
  const selects = Array.from(builder.querySelectorAll('[name="educationCertificate"]'));
  const selected = selects.map(sel => sel.value).filter(Boolean);
  selects.forEach(sel => {
    Array.from(sel.options).forEach(opt => {
      if (!opt.value) return;
      const usedElsewhere = selected.includes(opt.value) && sel.value !== opt.value;
      opt.disabled = usedElsewhere;
      opt.hidden = usedElsewhere;
      opt.style.display = usedElsewhere ? "none" : "";
    });
    sel.title = sel.value || "Select certificate...";
  });
  builder.querySelectorAll('[name="educationLevel"]').forEach(sel => { sel.title = sel.value || "Select level..."; });
}

function getWeeklyThemeSettings() {
  return state.weeklyThemes.find(t => t.id === "current") || { id: "current", startingDate: "", themes: {} };
}

function getWeeklyThemeField(settings, fieldName, week) {
  return ((settings && settings[fieldName]) || {})[String(week)] || "";
}

function setWeeklyThemeField(bucket, week, value) {
  bucket[String(week)] = String(value || "").trim();
}

function normalizeCurriculumImportPayload(payload) {
  const rawWeeks = Array.isArray(payload?.weeks) ? payload.weeks : Array.isArray(payload) ? payload : [];
  return rawWeeks.map((item, index) => {
    const weekNumber = Number(item.weekNumber || item.week || item.globalWeek || index + 1);
    return {
      weekNumber: Number.isFinite(weekNumber) && weekNumber > 0 ? weekNumber : index + 1,
      dateRange: item.dateRange || item.dates || "",
      month: item.month || "",
      monthNumber: item.monthNumber || "",
      weekOfMonth: item.weekOfMonth || "",
      label: item.label || item.monthWeek || "",
      theme: item.theme || "",
      letterland: item.letterland || item.letterlandConcentration || "",
      seedlingsValue: item.seedlingsValue || item.seedlingsValues || "",
      ideasEvents: item.ideasEvents || item.ideas || item.events || item.additionalEvents || ""
    };
  }).filter(item => item.weekNumber >= 1 && item.weekNumber <= 60);
}

function addDaysToIsoDate(dateText, days) {
  if (!dateText) return "";
  const d = new Date(`${dateText}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}

function formatShortDate(dateText) {
  if (!dateText) return "";
  const d = new Date(`${dateText}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateText;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dateIsInMonth(dateText, monthValue, endDateText = "") {
  if (!dateText) return false;
  const month = Number(monthValue || 1);
  const start = new Date(`${dateText}T12:00:00`);
  if (Number.isNaN(start.getTime())) return false;
  const end = endDateText ? new Date(`${endDateText}T12:00:00`) : start;
  const safeEnd = Number.isNaN(end.getTime()) ? start : end;
  const monthStart = new Date(start.getFullYear(), month - 1, 1, 12, 0, 0);
  const monthEnd = new Date(start.getFullYear(), month, 0, 12, 0, 0);
  if (start.getFullYear() !== monthStart.getFullYear() && safeEnd.getFullYear() !== monthStart.getFullYear()) return false;
  return start <= monthEnd && safeEnd >= monthStart;
}

function importantDateDisplayDate(item) {
  return item?.dateLabel || (item?.endDate ? `${formatShortDate(item.date)}-${formatShortDate(item.endDate)}` : formatShortDate(item?.date));
}

function birthdayDateForDisplay(birthday) {
  if (!birthday) return "";
  const parts = String(birthday).split("-");
  if (parts.length < 3) return "";
  const y = new Date().getFullYear();
  return `${y}-${parts[1]}-${parts[2]}`;
}

function renderBirthdayDropdowns(birthday = "") {
  const parts = String(birthday || "").split("-");
  const currentYear = new Date().getFullYear();
  const selectedYear = parts[0] || String(currentYear - 18);
  const selectedMonth = parts[1] || "";
  const selectedDay = parts[2] || "";
  const months = [
    ["01", "January"], ["02", "February"], ["03", "March"], ["04", "April"], ["05", "May"], ["06", "June"],
    ["07", "July"], ["08", "August"], ["09", "September"], ["10", "October"], ["11", "November"], ["12", "December"]
  ];
  const years = [];
  for (let y = currentYear - 14; y >= currentYear - 90; y--) years.push(String(y));
  if (selectedYear && !years.includes(selectedYear)) years.unshift(selectedYear);
  return `<div class="grid three birthday-dropdown-grid" data-birthday-dropdowns>
    <label>Birth Month<select name="birthdayMonth" required><option value="">Month...</option>${months.map(([value, label]) => `<option value="${value}" ${selectedMonth === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
    <label>Birth Day<select name="birthdayDay" required><option value="">Day...</option>${Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map(day => `<option value="${day}" ${selectedDay === day ? "selected" : ""}>${Number(day)}</option>`).join("")}</select></label>
    <label>Birth Year<select name="birthdayYear" required>${years.map(year => `<option value="${year}" ${selectedYear === year ? "selected" : ""}>${year}</option>`).join("")}</select></label>
  </div>`;
}

function collectBirthdayFromForm(form) {
  if (form.birthdayMonth || form.birthdayDay || form.birthdayYear) {
    const m = form.birthdayMonth?.value || "";
    const d = form.birthdayDay?.value || "";
    const y = form.birthdayYear?.value || "";
    return (m && d && y) ? `${y}-${m}-${d}` : "";
  }
  return form.birthday?.value || "";
}

function getAutoBirthdayImportantDates() {
  return (state.users || []).filter(u => u.birthday).map(u => ({
    id: `birthday_${u.uid}`,
    date: birthdayDateForDisplay(u.birthday),
    description: `${getUserUsedName(u)} Birthday`,
    autoBirthday: true
  })).filter(item => item.date);
}

function getAllImportantDateItems() {
  return [...(state.importantDates || []), ...getAutoBirthdayImportantDates()]
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
}

function renderImportantDatesLines(monthValue) {
  const items = getAllImportantDateItems().filter(item => dateIsInMonth(item.date, monthValue, item.endDate));
  return items.map(item => `${importantDateDisplayDate(item)} — ${item.description || ""}`.trim()).filter(Boolean);
}

function getVillageVoiceMonthWeeks(monthValue) {
  const settings = getWeeklyThemeSettings();
  const start = settings.startingDate || "";
  const weeks = [];
  for (let i = 1; i <= 52; i++) {
    const weekStart = addDaysToIsoDate(start, (i - 1) * 7);
    if (!weekStart || !dateIsInMonth(weekStart, monthValue)) continue;
    weeks.push({ week: i, date: weekStart });
  }
  return weeks;
}

function renderWeeklyThemeLines(monthValue) {
  const settings = getWeeklyThemeSettings();
  return getVillageVoiceMonthWeeks(monthValue).map(({ week, date }) => {
    const theme = getWeeklyThemeField(settings, "themes", week);
    const ideas = getWeeklyThemeField(settings, "ideasEvents", week);
    const label = getWeeklyThemeField(settings, "labels", week) || `Week ${week}`;
    return theme ? `${label} (${formatShortDate(date)}) — ${theme}${ideas ? `\n${ideas}` : ""}` : "";
  }).filter(Boolean);
}

function renderVillageVoiceMonthlyThemeLines(monthValue) {
  const settings = getWeeklyThemeSettings();
  return getVillageVoiceMonthWeeks(monthValue).map(({ week }) => {
    const theme = getWeeklyThemeField(settings, "themes", week);
    const weekOfMonth = getWeeklyThemeField(settings, "weekOfMonths", week);
    const displayWeek = weekOfMonth || week;
    return theme ? `Week ${displayWeek} – ${theme}` : "";
  }).filter(Boolean);
}

function getVillageVoiceLetterLandItems(monthValue) {
  const settings = getWeeklyThemeSettings();
  const images = settings.letterImages || {};
  const tiles = settings.letterlandSpriteTiles || {};
  const sheet = resolveLetterlandSpriteSheet(settings.letterlandSpriteSheet || "");
  const rows = settings.letterlandSpriteRows || 1;
  const cols = settings.letterlandSpriteCols || 1;
  return getVillageVoiceMonthWeeks(monthValue).slice(0, 5).map(({ week, date }) => ({
    week,
    date,
    weekOfMonth: getWeeklyThemeField(settings, "weekOfMonths", week) || "",
    letterland: getWeeklyThemeField(settings, "letterlands", week),
    image: images[String(week)] || "",
    spriteTile: tiles[String(week)] || "",
    spriteSheet: sheet,
    spriteRows: rows,
    spriteCols: cols,
    spriteWidth: settings.letterlandSpriteWidth || 0,
    spriteHeight: settings.letterlandSpriteHeight || 0,
    spriteMarginX: settings.letterlandSpriteMarginX || 0,
    spriteMarginY: settings.letterlandSpriteMarginY || 0,
    spriteGapX: settings.letterlandSpriteGapX || 0,
    spriteGapY: settings.letterlandSpriteGapY || 0,
    spriteCellW: settings.letterlandSpriteCellW || 0,
    spriteCellH: settings.letterlandSpriteCellH || 0
  })).filter(item => item.image || item.spriteTile || item.letterland);
}

function nextVillageVoiceMonthValue(monthValue) {
  const n = Math.max(1, Math.min(12, Number(monthValue || 1)));
  return String(n === 12 ? 1 : n + 1).padStart(2, "0");
}

function villageVoiceMonthName(monthValue) {
  return new Date(2026, Number(monthValue || 1) - 1, 1).toLocaleString("en-US", { month: "long" });
}

function renderVillageVoiceSaveDateLines(monthValue, includeNextMonth = false) {
  const lineForMonth = (m) => getAllImportantDateItems()
    .filter(item => item.includeInVillageVoice === true)
    .filter(item => dateIsInMonth(item.date, m))
    .map(item => `${importantDateDisplayDate(item)} — ${item.description || ""}`.trim())
    .filter(Boolean);
  const currentLines = lineForMonth(monthValue);
  if (!includeNextMonth) return currentLines;
  const nextMonth = nextVillageVoiceMonthValue(monthValue);
  const nextLines = lineForMonth(nextMonth);
  if (!nextLines.length) return currentLines;
  return [...currentLines, `${villageVoiceMonthName(nextMonth)} Dates`, ...nextLines];
}

async function loadAppSettings() {
  try {
    const snap = await getDoc(doc(db, "appSettings", "branding"));
    state.appSettings = snap.exists() ? { id: snap.id, ...snap.data() } : {};
  } catch (err) { state.appSettings = {}; }
}

async function saveBrandingSettings(form) {
  await setDoc(doc(db, "appSettings", "branding"), {
    ovaLogoData: form.ovaLogoData?.value || state.appSettings?.ovaLogoData || "",
    updatedAt: serverTimestamp(),
    updatedBy: state.session?.uid || ""
  }, { merge: true });
  showToast("Branding saved.");
}

async function loadAppTools() {
  try {
    const snap = await getDocs(collection(db, "appTools"));
    state.appTools = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { state.appTools = []; }
}

async function loadVillageVoiceDraft() {
  try {
    const snap = await getDoc(doc(db, "villageVoice", "current"));
    state.villageVoiceDraft = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    const sessionDraft = readLocalJson(VILLAGE_VOICE_SESSION_KEY, null);
    if (sessionDraft && sessionDraft.blocks && sessionDraft.layout) {
      state.villageVoiceDraft = { ...(state.villageVoiceDraft || {}), ...sessionDraft, restoredFromSession: true };
    }
    const explicitLayout = readLocalJson(VILLAGE_VOICE_LAYOUT_OVERRIDE_KEY, null);
    if (Array.isArray(explicitLayout) && explicitLayout.length) {
      state.villageVoiceDraft = { ...(state.villageVoiceDraft || {}), layout: explicitLayout, restoredExplicitLayout: true };
    }
  } catch (err) {
    console.warn("Village Voice draft load failed", err);
    state.villageVoiceDraft = readLocalJson(VILLAGE_VOICE_SESSION_KEY, null);
  }
}

function saveVillageVoiceSessionDraft(draft = state.villageVoiceDraft) {
  if (!draft) return;
  writeLocalJson(VILLAGE_VOICE_SESSION_KEY, { ...draft, sessionSavedAt: new Date().toISOString() });
}

function clearVillageVoiceSessionDraft() {
  try { localStorage.removeItem(VILLAGE_VOICE_SESSION_KEY); } catch (err) {}
}

async function loadPrintableDrafts() {
  try {
    const ids = ["teacherBio", "doorReminders", "illnessNotice"];
    const entries = await Promise.all(ids.map(async id => {
      const snap = await getDoc(doc(db, "printables", id));
      return [id, snap.exists() ? { id: snap.id, ...snap.data() } : null];
    }));
    state.printableDrafts = Object.fromEntries(entries);
  } catch (err) {
    console.warn("Printable drafts load failed", err);
    state.printableDrafts = {};
  }
}

async function loadIllnessNoticeTemplates() {
  try {
    const snap = await getDocs(collection(db, "illnessNoticeTemplates"));
    state.illnessNoticeTemplates = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b)=>String(a.title||"").localeCompare(String(b.title||"")));
  } catch (err) {
    state.illnessNoticeTemplates = [];
  }
}

function userSchoolMatchesScope(schoolIds = [], user = state.session) {
  const scopedIds = Array.isArray(schoolIds) ? schoolIds.filter(Boolean) : [];
  if (!scopedIds.length) return true;
  if (isSystemAdmin(user)) return true;
  const userIds = getUserSchoolIds(user);
  if (!userIds.length) return false;
  return scopedIds.some(id => userIds.includes(id));
}

function userMatchesNotification(n) {
  if (!state.session) return false;
  if (!userSchoolMatchesScope(n.schoolIds || (n.schoolId ? [n.schoolId] : []), state.session)) return false;
  if ((n.toUids || []).includes(state.session.uid)) return true;
  const roleKeys = getUserRoleKeys(state.session);
  const position = state.session.teamPosition || state.session.position || "";
  return (n.toRoles || []).some(r => roleKeys.includes(normalizeRoleKey(r))) || (position && (n.toPositions || []).includes(position));
}

async function loadNotifications() {
  try {
    const snap = await getDocs(collection(db, "notifications"));
    state.notifications = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(n => n.cleared !== true).filter(userMatchesNotification).sort((a,b)=>{
      const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bt-at;
    }).slice(0, 30);
  } catch (err) { state.notifications = []; }
}

async function createNotification(payload) {
  await setDoc(doc(collection(db, "notifications")), {
    read: false,
    createdAt: serverTimestamp(),
    ...payload
  });
}

async function loadBudgetCodes() {
  const snap = await getDocs(collection(db, "budgetCodes"));
  state.budgetCodes = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => c.active !== false)
    .sort((a,b)=>String(a.category||"").localeCompare(String(b.category||"")));
}

async function readUser(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { uid: snap.id, ...snap.data() };
}

async function createAudit(action, details = {}) {
  try {
    const id = crypto.randomUUID();
    await setDoc(doc(db, "auditLogs", id), {
      action,
      actorUid: state.session?.uid || null,
      details,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.warn("Audit log failed", err);
  }
}

function getSecondaryAuth() {
  const name = "SecondaryUserCreator";
  const secondaryApp = getApps().find(a => a.name === name) || initializeApp(firebaseConfig, name);
  return getAuth(secondaryApp);
}

async function createFirebaseUserWithoutSwitchingSession(email, password) {
  const secondaryAuth = getSecondaryAuth();
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  await signOut(secondaryAuth);
  return cred.user.uid;
}

function generateFakeEmail(firstName, lastName) {
  const base = `${safeLower(firstName)}${safeLower(lastName)}` || "user";
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${base}${suffix}@${SYSTEM_EMAIL_DOMAIN}`;
}

async function loginUser(user, credential, stayLoggedIn = false) {
  await applyLoginPersistence(stayLoggedIn);
  setStayLoggedInPreference(stayLoggedIn);
  if (user.passwordSet) {
    await signInWithEmailAndPassword(auth, user.fakeEmail, credential);
    const fresh = await readUser(user.uid);
    state.session = fresh;
    rememberPickedUser(fresh);
    state.modal = null;
    await refreshAdminData();
    renderHome();
    return;
  }

  if (String(user.pin) !== String(credential)) {
    throw new Error("Incorrect PIN.");
  }

  await applyLoginPersistence(stayLoggedIn);
  await signInWithEmailAndPassword(auth, user.fakeEmail, DEFAULT_AUTH_PASSWORD);
  const fresh = await readUser(user.uid);
  state.session = fresh;
  rememberPickedUser(fresh);
  await refreshAdminData();

  if (fresh.pinResetRequired || credential === "0000" || fresh.onboardingRequired === true) {
    state.modal = null;
    renderOnboardingPage();
    return;
  }

  if ((fresh.passwordRequired || roleRequiresPassword(getPrimaryRole(fresh))) && !fresh.passwordSet) {
    state.modal = { type: "forcePasswordSetup" };
    renderHome();
    return;
  }

  state.modal = null;
  renderHome();
}


async function logout() {
  await signOut(auth).catch(() => {});
  state.session = null;
  state.modal = null;
  await refreshLandingData();
  render();
}

async function saveNewPassword(password) {
  if (!auth.currentUser) throw new Error("No signed in Firebase user.");
  await updatePassword(auth.currentUser, password);
  await updateDoc(doc(db, "users", state.session.uid), {
    passwordRequired: true,
    passwordSet: true,
    updatedAt: serverTimestamp()
  });
  await createAudit("passwordSet", { uid: state.session.uid });
  state.session = await readUser(state.session.uid);
  state.modal = null;
  showToast("Password saved. Future logins will use password only.");
}

async function saveNewPin(pin) {
  if (!/^\d{4}$/.test(pin)) throw new Error("PIN must be exactly 4 digits.");
  const nextUser = { ...(state.session || {}), pin, pinResetRequired: false };
  await updateDoc(doc(db, "users", state.session.uid), {
    pin,
    pinResetRequired: false,
    onboardingRequired: !isOnboardingComplete(nextUser),
    updatedAt: serverTimestamp()
  });
  await createAudit("pinChanged", { uid: state.session.uid });
  state.session = await readUser(state.session.uid);
  state.modal = null;
  showToast("PIN updated.");
}


function getFormSchoolIds(form) {
  return Array.from(form.querySelectorAll('input[name="schoolIds"]:checked')).map(i => i.value);
}

function getFormRole(form) {
  return form.role?.value || "teacher";
}

function getFormRoles(form) {
  return [getFormRole(form)];
}

async function updateSchool(form) {
  const schoolId = state.modal.school.id;
  await updateDoc(doc(db, "schools", schoolId), {
    name: form.name.value.trim(),
    code: form.code.value.trim(),
    address: form.address.value.trim(),
    phone: form.phone.value.trim(),
    updatedAt: serverTimestamp()
  });
  state.modal = null;
  showToast("School updated.");
}

async function updateAppUser(form) {
  const uid = state.modal.user.uid;
  const firstName = form.firstName.value.trim();
  const lastName = form.lastName.value.trim();
  const usedName = form.usedName?.value?.trim() || `${firstName} ${lastName}`;
  const profileImageData = form.profileImageData?.value || state.modal.user.profileImageData || "";
  const role = getFormRole(form);
  const roles = [role];
  const teamPosition = form.teamPosition?.value?.trim() || "Unassigned";
  const schoolIds = getFormSchoolIds(form);
  /* Team position can remain Unassigned until onboarding is complete. */

  await updateDoc(doc(db, "users", uid), {
    firstName,
    lastName,
    displayName: `${firstName} ${lastName.slice(0, 1)}.`,
    usedName,
    profileImageData,
    educationList: collectEducationEntries(form),
    education: collectEducationEntries(form).map(educationDisplayText).join("; "),
    earlyEducationStart: form.earlyEducationStart?.value?.trim() || "",
    whyEarlyEducation: form.whyEarlyEducation?.value?.trim() || "",
    birthday: collectBirthdayFromForm(form),
    leaderSummary: form.leaderSummary?.value?.trim() || "",
    whatILike: collectWhatILike(form),
    pin: form.pin.value.trim(),
    pinResetRequired: form.pin.value.trim() === "0000",
    onboardingRequired: form.pin.value.trim() === "0000" ? true : (state.modal.user?.onboardingRequired || false),
    teamPosition,
    role,
    roles,
    schoolIds,
    defaultCampusCareBuildingId: form.defaultCampusCareBuildingId?.value || "",
    defaultCampusCareSublocation: form.defaultCampusCareSublocation?.value?.trim() || "",
    passwordRequired: roleRequiresPassword(role),
    updatedAt: serverTimestamp()
  });

  state.modal = null;
  showToast("User updated.");
}


function makeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function addPosition(form) {
  const house = form.house.value.trim();
  const classNumber = form.classNumber.value.trim();
  if (!house) throw new Error("House / position name is required.");

  const name = classNumber ? `${house} ${classNumber}` : house;

  await setDoc(doc(collection(db, "positions")), {
    name,
    house,
    classNumber,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  state.modal = null;
  showToast("Position added.");
}

async function updatePosition(form) {
  const positionId = state.modal.position.id;
  const house = form.house.value.trim();
  const classNumber = form.classNumber.value.trim();
  if (!house) throw new Error("House / position name is required.");

  const name = classNumber ? `${house} ${classNumber}` : house;

  await updateDoc(doc(db, "positions", positionId), {
    name,
    house,
    classNumber,
    updatedAt: serverTimestamp()
  });
  state.modal = null;
  showToast("Position updated.");
}

async function deletePosition(positionId) {
  await updateDoc(doc(db, "positions", positionId), {
    active: false,
    updatedAt: serverTimestamp()
  });
  showToast("Position hidden.");
}

async function addRole(form) {
  const name = form.name.value.trim();
  const key = makeSlug(form.key.value.trim() || name);
  if (!name || !key) throw new Error("Role name and key are required.");
  await setDoc(doc(collection(db, "roles")), {
    name,
    key,
    description: form.description.value.trim(),
    active: true,
    permissions: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  state.modal = null;
  showToast("Role added.");
}

async function updateRole(form) {
  const roleId = state.modal.role.id;
  await updateDoc(doc(db, "roles", roleId), {
    name: form.name.value.trim(),
    key: makeSlug(form.key.value.trim()),
    description: form.description.value.trim(),
    updatedAt: serverTimestamp()
  });
  state.modal = null;
  showToast("Role updated.");
}

async function savePermissionsMatrix(form) {
  // Only save the tool sections that are currently present in the form.
  // The permissions UI renders one tool accordion at a time, so rebuilding every
  // tool from the visible form would accidentally turn all hidden tools off.
  const touchedToolKeys = new Set();
  Array.from(form.querySelectorAll('[name^="roleperm__"], [name^="rolepos__"]')).forEach(input => {
    const parts = String(input.name || "").split("__");
    if (parts.length >= 4) touchedToolKeys.add(parts[2]);
  });
  if (state.expandedPermissionToolKey) touchedToolKeys.add(state.expandedPermissionToolKey);

  const toolsToSave = PERMISSION_TOOLS.filter(tool => touchedToolKeys.has(tool.key));

  const updates = state.roles.map(role => {
    const nextPermissions = { ...(role.permissions || {}) };

    toolsToSave.forEach(tool => {
      nextPermissions[tool.key] = { ...(nextPermissions[tool.key] || {}) };

      (tool?.permissions || []).forEach(permission => {
        const enabled = !!form.querySelector(`[name="roleperm__${role.id}__${tool.key}__${permission.key}"]`)?.checked;
        const positions = Array.from(form.querySelectorAll(`[name="rolepos__${role.id}__${tool.key}__${permission.key}"]:checked`)).map(input => input.value);

        nextPermissions[tool.key][permission.key] = {
          enabled,
          positions: positions.length ? positions : ["__any__"]
        };
      });
    });

    return updateDoc(doc(db, "roles", role.id), {
      permissions: nextPermissions,
      updatedAt: serverTimestamp()
    });
  });

  await Promise.all(updates);
  showToast("Permissions saved.");
}

async function deleteRole(roleId) {
  await updateDoc(doc(db, "roles", roleId), {
    active: false,
    updatedAt: serverTimestamp()
  });
  showToast("Role hidden.");
}



function collectMoneyRequestFields(form) {
  const rows = Array.from(form.querySelectorAll(".request-field-row"));
  return rows.map((row, index) => ({
    label: row.querySelector('[name="fieldLabel"]').value.trim(),
    type: row.querySelector('[name="fieldType"]').value,
    required: row.querySelector('[name="fieldRequired"]').checked,
    order: index + 1
  })).filter(f => f.label);
}



function hasToolPermission(user, toolKey, permissionKey) {
  if (isSystemAdmin(user) && !devPreviewActive()) return true;
  user = getPermissionUser(user);

  const roleKeys = [
    normalizeRoleKey(getPrimaryRole(user)),
    ...(Array.isArray(user?.roles) ? user.roles.map(normalizeRoleKey) : [])
  ].filter(Boolean);

  const role = state.roles.find(r => {
    const key = normalizeRoleKey(r.key);
    const name = normalizeRoleKey(r.name);
    return roleKeys.includes(key) || roleKeys.includes(name);
  });


  if (!role) return false;

  const permission = role.permissions?.[toolKey]?.[permissionKey];

  if (!permission?.enabled) return false;

  const requiredPositions = permission.positions || [];

  if (!requiredPositions.length || requiredPositions.includes("__any__")) {
    return true;
  }

  return requiredPositions.includes(user.teamPosition);
}

function getAvailableTools(user) {
  const tools = [];

  const canSubmitMoney = hasToolPermission(user, "moneyRequests", "submit");
  const canApproveMoney = hasToolPermission(user, "moneyRequests", "approvePending");
  const canProcessMoney = hasToolPermission(user, "moneyRequests", "processApproved");
  const canEditVillageVoice = hasToolPermission(user, "villageVoice", "editFlyer");
  const canUseCampusCares = hasToolPermission(user, "campusCares", "submit") || hasToolPermission(user, "campusCares", "assigned") || hasToolPermission(user, "campusCares", "viewAll") || hasToolPermission(user, "campusCares", "manage");
  const canUsePhotoPrint = hasFullDevAccess(user) || getUserRoleKeys(user).some(r => ["teacher", "mentor", "leader", "admin", "owner", "systemAdmin"].includes(r));

  if (canSubmitMoney || canApproveMoney || canProcessMoney || hasFullDevAccess(user)) {
    tools.push({
      id: "moneyRequests",
      title: "Money Requests",
      icon: "$",
      desc: "Submit, review, or process money requests based on your role permissions."
    });
  }

  if (canUseCampusCares || hasFullDevAccess(user)) {
    tools.push({ id: "campusCares", title: "Campus Cares", icon: "C", desc: "Submit, track, assign, and complete campus care tasks." });
  }

  if (canUsePhotoPrint) {
    tools.push({ id: "photoPrint", title: "Photo Print and Edit", icon: "📷", desc: "Arrange classroom photos on standard copy paper, then print or save as PDF." });
  }

  if (hasToolPermission(user, "coreChampion", "vote") || hasToolPermission(user, "coreChampion", "manage") || hasFullDevAccess(user) || getUserRoleKeys(user).includes("teacher") || getUserRoleKeys(user).includes("mentor")) {
    tools.push({ id: "coreChampion", title: "Core Count Champion", icon: "★", desc: "Nominate and vote for the monthly Core Counts Champion." });
  }

  if (canEditVillageVoice || hasFullDevAccess(user)) {
    tools.push({
      id: "villageVoice",
      title: "Printables",
      icon: "P",
      desc: "Create and export school printables like Village Voice, teacher bios, door reminders, and illness notices."
    });
  }

  return tools;
}

async function addBudgetCode(form) {
  const schoolIds = Array.from(form.querySelectorAll('[name="budgetSchoolIds"]:checked')).map(i => i.value);
  const allSchools = form.allSchools?.checked !== false;
  await setDoc(doc(collection(db, "budgetCodes")), {
    code: form.code.value.trim(),
    category: form.category.value.trim(),
    allSchools,
    schoolIds: allSchools ? [] : schoolIds,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  showToast("Budget code added.");
}

async function updateBudgetCode(form) {
  const schoolIds = Array.from(form.querySelectorAll('[name="budgetSchoolIds"]:checked')).map(i => i.value);
  const allSchools = form.allSchools?.checked !== false;
  await updateDoc(doc(db, "budgetCodes", state.modal.budgetCode.id), {
    code: form.code.value.trim(),
    category: form.category.value.trim(),
    allSchools,
    schoolIds: allSchools ? [] : schoolIds,
    updatedAt: serverTimestamp()
  });
  showToast("Budget code updated.");
}

async function hideBudgetCode(id) {
  await updateDoc(doc(db, "budgetCodes", id), {
    active: false,
    updatedAt: serverTimestamp()
  });

  showToast("Budget code hidden.");
}

async function addMoneyRequestType(form) {
  const name = form.name.value.trim();
  if (!name) throw new Error("Request type name is required.");

  await setDoc(doc(collection(db, "moneyRequestTypes")), {
    name,
    fields: collectMoneyRequestFields(form),
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  state.modal = null;
  showToast("Request type added.");
}

async function updateMoneyRequestType(form) {
  const requestTypeId = state.modal.requestType.id;

  await updateDoc(doc(db, "moneyRequestTypes", requestTypeId), {
    name: form.name.value.trim(),
    fields: collectMoneyRequestFields(form),
    updatedAt: serverTimestamp()
  });

  state.modal = null;
  showToast("Request type updated.");
}

async function hideMoneyRequestType(id) {
  await updateDoc(doc(db, "moneyRequestTypes", id), {
    active: false,
    updatedAt: serverTimestamp()
  });

  showToast("Request type hidden.");
}
async function addSchool(form) {
  const name = form.name.value.trim();
  const code = form.code.value.trim().toUpperCase();
  if (!name || !code) throw new Error("School name and code are required.");
  const id = crypto.randomUUID();
  await setDoc(doc(db, "schools", id), {
    name,
    code,
    address: form.address.value.trim(),
    phone: form.phone.value.trim(),
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await createAudit("schoolCreated", { schoolId: id, code });
  await loadSchools();
  state.modal = null;
  showToast("School added.");
}

async function verifyCurrentLeaderPasswordIfNeeded(form) {
  const makingLeader = !!form.isLeader?.checked;
  if (!makingLeader) return;
  const password = form.leaderPassword?.value || "";
  if (!password) throw new Error("Enter your password before creating a leader account.");
  if (!state.session?.fakeEmail) throw new Error("Your leader account does not have a login email saved, so password confirmation could not run.");
  await signInWithEmailAndPassword(auth, state.session.fakeEmail, password);
}

function selectedNewUserRole(form) {
  return form.isLeader?.checked ? "leader" : "teacher";
}

async function addUser(form) {
  const firstName = form.firstName.value.trim();
  const lastName = form.lastName.value.trim();
  const usedName = form.usedName?.value?.trim() || `${firstName} ${lastName}`;
  const selectedSchoolIds = getFormSchoolIds(form);
  const role = selectedNewUserRole(form);
  const roles = [role];
  const teamPosition = "Unassigned";
  const pin = "0000";

  if (!firstName || !lastName) throw new Error("First and last name are required.");
  if (!selectedSchoolIds.length) throw new Error("Select at least one school.");
  await verifyCurrentLeaderPasswordIfNeeded(form);

  const fakeEmail = generateFakeEmail(firstName, lastName);
  const uid = await createFirebaseUserWithoutSwitchingSession(fakeEmail, DEFAULT_AUTH_PASSWORD);

  await setDoc(doc(db, "users", uid), {
    firstName,
    lastName,
    displayName: `${firstName} ${lastName.slice(0, 1)}.`,
    usedName,
    profileImageData: "",
    educationList: [],
    education: "",
    earlyEducationStart: "",
    whyEarlyEducation: "",
    birthday: "",
    leaderSummary: "",
    whatILike: {},
    fakeEmail,
    pin,
    teamPosition,
    role,
    pinResetRequired: true,
    onboardingRequired: true,
    roles,
    schoolIds: selectedSchoolIds,
    defaultCampusCareBuildingId: "",
    defaultCampusCareSublocation: "",
    active: true,
    passwordRequired: roleRequiresPassword(role),
    passwordSet: false,
    homeLayout: [],
    hiddenToolIds: [],
    notificationSettings: { inApp: true, push: false },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await createAudit("userCreated", { uid, fakeEmail, schoolIds: selectedSchoolIds, role, defaultPosition: teamPosition });
  await loadRoster();
  state.modal = null;
  showToast(roleRequiresPassword(role) ? "Leader added. They will finish setup during onboarding." : "Teacher added. They will finish setup during onboarding.");
}

async function resetUserPin(uid) {
  await updateDoc(doc(db, "users", uid), {
    pin: "0000",
    pinResetRequired: true,
    onboardingRequired: true,
    updatedAt: serverTimestamp()
  });
  await createAudit("pinReset", { uid });
  await loadRoster();
  showToast("PIN reset to 0000.");
}

async function resetUserForOnboarding(uid) {
  const target = await readUser(uid);
  if (!target) throw new Error("User not found.");
  const resetPatch = {
    pin: "0000",
    pinResetRequired: true,
    onboardingRequired: true,
    birthday: "",
    educationList: [],
    education: "",
    earlyEducationStart: "",
    whyEarlyEducation: "",
    whatILike: {},
    teamPosition: "Unassigned",
    updatedAt: serverTimestamp()
  };
  await updateDoc(doc(db, "users", uid), resetPatch);
  await createAudit("userOnboardingReset", { uid, fakeEmail: target.fakeEmail || "" });
  await loadRoster();
  if (state.session?.uid === uid) {
    state.session = { ...state.session, ...resetPatch, updatedAt: new Date().toISOString() };
    state.onboardingStep = 0;
  }
  showToast("User reset. They can test onboarding again with PIN 0000.");
}

async function deleteAppUser(uid) {
  const target = await readUser(uid);
  if (!target) return;
  await deleteDoc(doc(db, "users", uid));
  await createAudit("userDeletedFromFirestore", { uid });
  // Client-side Firebase Auth can only delete the currently signed-in user.
  // True admin deletion from Auth should be added later with a Cloud Function.
  await loadRoster();
  showToast("User deleted from Firestore. Auth deletion needs a later admin backend/Cloud Function.");
}

function renderNotificationsPanel() {
  return `<div class="notification-panel card">
    <strong>Notifications</strong>
    ${state.notifications.length ? state.notifications.map(n => `
      <button type="button" class="notification-row ${n.read ? "" : "unread"}" data-open-notification="${n.id}">
        <b>${n.title || "Notification"}</b>
        <span>${n.body || ""}</span>
      </button>
    `).join("") : `<div class="empty">No notifications yet.</div>`}
    ${state.notifications.length ? `<button type="button" class="clear-notifications-link" data-clear-notifications>Clear Notifications</button>` : ""}
  </div>`;
}

function getNotificationTargetTab(n) {
  if (n?.targetTab) return n.targetTab;
  const title = String(n?.title || "").toLowerCase();
  const body = String(n?.body || "").toLowerCase();
  if (title.includes("denied") || body.includes("denied") || body.includes("needs changes")) return "myRequests";
  if (title.includes("owner approval")) return "pendingOwner";
  if (title.includes("new money request") || title.includes("resubmitted")) return "pendingDoso";
  if (title.includes("approved") || title.includes("receipt")) return "receipts";
  return "submit";
}

function renderDevPreviewControls() {
  if (!isSystemAdmin(state.session)) return "";
  const roleOptions = state.roles.map(r => `<option value="${r.key || r.name}" ${state.devViewRoleKey === (r.key || r.name) ? "selected" : ""}>${r.name}</option>`).join("");
  const positionOptions = state.positions.map(p => `<option value="${p.name}" ${state.devViewPosition === p.name ? "selected" : ""}>${p.name}</option>`).join("");
  return `<div class="dev-preview-controls">
    <span>Preview as</span>
    <select data-dev-view-role><option value="">Actual role / full dev</option>${roleOptions}</select>
    <select data-dev-view-position><option value="">Actual position</option>${positionOptions}</select>
    ${devPreviewActive() ? `<button class="secondary small" type="button" data-clear-dev-preview>Clear preview</button>` : ""}
  </div>`;
}


function getOvaLogoHtml(className = "logo", fallbackText = "VV") {
  const logo = state.appSettings?.ovaLogoData || "";
  return logo ? `<img class="${className} image-logo" src="${logo}" alt="OVA logo" />` : `<div class="${className}">${fallbackText}</div>`;
}

function pageShell(content) {
  return `
    <div class="topbar">
      <div class="topbar-inner">
        <div class="actions">
          ${getOvaLogoHtml("logo", "VV")}
          <strong>Village Vibes</strong>
        </div>
        <div class="actions">
          <button class="theme-toggle-button secondary small" type="button" data-toggle-theme>${getThemePreference() === "dark" ? "☀️ Light" : "🌙 Dark"}</button>
          <button class="notification-button" type="button" data-toggle-notifications>🔔${getUnreadNotificationCount() ? `<span>${getUnreadNotificationCount()}</span>` : ""}</button>
          <button class="secondary small" type="button" data-action="notificationSettings">Notifications</button>
          <button class="user-pill clickable-user-pill" type="button" data-open-self-profile>${makeDisplayName(state.session)} · ${getPrimaryRole(state.session)}</button>
          ${canUseLeadership(state.session) ? `<button class="secondary small" data-action="leadership">Leadership</button>` : ""}
          ${canUseOwnersPanel(state.session) ? `<button class="secondary small" data-action="ownersPanel">Owners</button>` : ""}
          ${canUseSystemAdmin(state.session) ? `<button class="secondary small" data-action="systemAdmin">System Admin</button>` : ""}
          <button class="small" data-action="home">Home</button>
          <button class="secondary small" data-action="logout">Logout</button>
        </div>
      </div>
      ${renderDevPreviewControls()}
      ${state.notificationsOpen ? renderNotificationsPanel() : ""}
    </div>
    <main class="shell">${content}</main>
  `;
}

function renderLanding() {
  state.currentView = "landing";
  const recentUsers = getRecentRosterUsers();
  const recentIds = new Set(recentUsers.map(u => u.uid));
  const leaders = state.roster
    .filter(u => getRosterGroup(u) === "leaders" && !recentIds.has(u.uid))
    .sort(byName);
  const staff = state.roster
    .filter(u => getRosterGroup(u) === "staff" && !recentIds.has(u.uid))
    .sort(byName);

  $app.innerHTML = `
    <main class="shell">
      <section class="hero card login-hero">
        <div class="logo-row">
          <div class="logo">VV</div>
          <div class="actions">
            <button class="theme-toggle-button secondary small" type="button" data-toggle-theme>${getThemePreference() === "dark" ? "☀️ Light" : "🌙 Dark"}</button>
          </div>
        </div>
        <div>
          <h1>Village Vibes</h1>
          <p class="helper">Choose your school, select your name, then log in.</p>
        </div>
        <label>School
          <select id="schoolSelect">
            ${state.schools.map(s => `<option value="${s.id}" ${s.id === state.selectedSchoolId ? "selected" : ""}>${s.name} (${s.code})</option>`).join("")}
          </select>
        </label>
        <div class="card roster-card" style="box-shadow:none;">
          ${recentUsers.length ? renderRosterSection("Recently Picked", recentUsers, "No recent users on this device yet.") : ""}
          ${renderRosterSection("Leaders & Owners", leaders, "No leaders or owners for this school yet.")}
          ${renderRosterSection("Mentors & Teachers", staff, "No mentors or teachers for this school yet.")}
        </div>
      </section>
    </main>
    ${state.modal ? renderModal() : ""}
    ${state.toast ? `<div class="toast">${state.toast}</div>` : ""}
  `;
}

function renderHome() {
  if (state.session && isOnboardingRequired(state.session)) { renderOnboardingPage(); return; }
  state.currentView = "home";
  if (state.modal && ["login", "adminPasswordLogin"].includes(state.modal.type)) state.modal = null;

  const allTools = orderToolsForHome(getAvailableTools(state.session).map(getToolDisplay));
  const prefs = getToolPrefs();
  const bookmarked = allTools.filter(t => (prefs.bookmarks || []).includes(t.id));
  const visibleTools = allTools.filter(t => !(prefs.hidden || []).includes(t.id));
  const hiddenTools = allTools.filter(t => (prefs.hidden || []).includes(t.id));
  const search = String(state.homeToolSearch || "").trim().toLowerCase();
  const searchedHidden = search ? hiddenTools.filter(t => `${t.title} ${t.desc}`.toLowerCase().includes(search)) : [];

  $app.innerHTML = pageShell(`
    <section class="grid">
      <div class="card home-welcome-card">
        <h2>Welcome, ${state.session.firstName}</h2>
        <p class="helper">Your tools are customized to this device. Drag tools to reorder, bookmark favorites, or hide tools you do not use.</p>
      </div>

      ${bookmarked.length ? `<div class="bookmark-bar card slim-card"><strong>Bookmarked</strong><div class="bookmark-tools">${bookmarked.map(t => `<button class="bookmark-chip" data-tool="${t.id}" type="button">${t.title}</button>`).join("")}</div></div>` : ""}

      <div class="tool-home-actions">
        <input placeholder="Search hidden tools..." data-home-tool-search value="${state.homeToolSearch || ""}" />
      </div>
      ${searchedHidden.length ? `<div class="card slim-card"><strong>Hidden tools</strong><div class="bookmark-tools">${searchedHidden.map(t => `<button class="secondary small" data-restore-tool="${t.id}" type="button">Restore ${t.title}</button>`).join("")}</div></div>` : ""}

      <div class="tool-grid square-grid" data-tool-drop-zone>
        ${visibleTools.length ? visibleTools.map(t => renderToolTile(t)).join("") : `<div class="empty grid-empty">No tools are enabled for your role yet. Ask a system admin to enable a tool permission for your role.</div>`}
      </div>
    </section>
    ${state.modal ? renderModal() : ""}
    ${renderPhotoContextMenu()}
    ${renderPhotoPrintDuplicatePrompt()}
    ${state.toast ? `<div class="toast">${state.toast}</div>` : ""}
  `);
}

function todayIso() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function moneyFieldInputType(type) {
  if (type === "money" || type === "number") return "number";
  if (type === "date") return "date";
  return "text";
}


function getUserSchoolIds(user = state.session) {
  return Array.isArray(user?.schoolIds) ? user.schoolIds : [];
}

function getSchoolNameById(id) {
  return state.schools.find(s => s.id === id)?.name || "Unknown School";
}

function getDefaultRequestSchoolId() {
  const ids = getUserSchoolIds();
  return ids[0] || state.selectedSchoolId || state.schools[0]?.id || "";
}

function budgetCodeAppliesToSchool(code, schoolId) {
  if (!schoolId) return true;
  if (code.allSchools !== false) return true;
  const ids = Array.isArray(code.schoolIds) ? code.schoolIds : [];
  return ids.includes(schoolId);
}

function getFilteredBudgetCodesForCurrentRequest() {
  const selected = document.querySelector('[name="requestSchoolId"]')?.value || getDefaultRequestSchoolId();
  return state.budgetCodes.filter(c => budgetCodeAppliesToSchool(c, selected));
}

function renderSchoolOptionsForUser(user = state.session, selected = "") {
  const ids = getUserSchoolIds(user);
  const options = (ids.length ? state.schools.filter(s => ids.includes(s.id)) : state.schools);
  const pick = selected || getDefaultRequestSchoolId();
  return options.map(s => `<option value="${s.id}" ${s.id === pick ? "selected" : ""}>${s.name}</option>`).join("");
}

function getRequestSchoolName(request) {
  return request.requestSchoolName || getSchoolNameById(request.requestSchoolId) || "No location";
}

function userCanSeeMoneyRequestForStage(request, stage, user = state.session) {
  if (isSystemAdmin(user)) return true;
  const schoolId = request.requestSchoolId;
  if (!schoolId) return true;
  // Location-scoped stages: DOSO approval and DOSO receipt follow-up should only
  // show requests for schools assigned to that user.
  if (stage === "pendingDoso" || stage === "receipts") {
    return userSchoolMatchesScope([schoolId], user);
  }
  // Owner queues are also location-aware. Owners with multiple schools will see
  // each assigned location grouped separately; owners with one school only see that school.
  if (stage === "pendingOwner" || stage === "finalApproved") {
    return userSchoolMatchesScope([schoolId], user);
  }
  return true;
}

function renderBudgetCategoryOptions(selected = "") {
  const codes = getFilteredBudgetCodesForCurrentRequest();
  return `<option value="">Choose category</option>${codes.map(c => `
    <option value="${c.category || ""}" data-code="${c.code || ""}" ${String(selected) === String(c.category || "") ? "selected" : ""}>${c.category || "Untitled"}</option>
  `).join("")}`;
}

function renderMoneyRequestCustomField(field, typeId, lineKey, fieldIndex) {
  const required = field.required ? "required" : "";
  const name = `custom__${typeId}__${lineKey}__${fieldIndex}`;
  const label = field.label || "Custom Field";
  if (field.type === "textarea" || field.type === "longText") {
    return `<label class="money-custom-field money-custom-wide">${label}${field.required ? " *" : ""}<textarea name="${name}" data-custom-field="${fieldIndex}" ${required}></textarea></label>`;
  }
  if (field.type === "money") {
    return `<label class="money-custom-field money-custom-money">${label}${field.required ? " *" : ""}<span class="money-input-wrap"><span class="money-symbol">$</span><input type="text" inputmode="decimal" placeholder="0.00" name="${name}" data-custom-field="${fieldIndex}" data-money-input ${required} /></span></label>`;
  }
  const step = field.type === "number" ? `step="any"` : "";
  return `<label class="money-custom-field">${label}${field.required ? " *" : ""}<input type="${moneyFieldInputType(field.type)}" name="${name}" data-custom-field="${fieldIndex}" ${step} ${required} /></label>`;
}

function renderMoneyRequestLine(typeId, lineKey) {
  const requestType = state.moneyRequestTypes.find(t => t.id === typeId);
  if (!requestType) return "";
  const fields = requestType.fields || [];
  return `
    <div class="money-request-line" data-request-type-id="${typeId}" data-line-key="${lineKey}">
      <strong class="money-line-kind">${requestType.name}</strong>
      <label class="money-budget-code">Budget Code
        <input class="budget-code-input" data-budget-code placeholder="Code" />
      </label>
      <label class="money-budget-category">Budget Category
        <select class="budget-category-select" data-budget-category>${renderBudgetCategoryOptions()}</select>
      </label>
      ${fields.map((field, index) => renderMoneyRequestCustomField(field, typeId, lineKey, index)).join("")}
      <button class="secondary small money-remove-line" type="button" data-remove-money-line>Remove</button>
      <button class="secondary small money-add-line is-hidden" type="button" data-add-money-line="${typeId}">+</button>
    </div>
  `;
}

function isMoneyRequestLineComplete(line) {
  const code = line.querySelector("[data-budget-code]")?.value.trim();
  const category = line.querySelector("[data-budget-category]")?.value.trim();
  if (!code || !category) return false;
  const requiredFields = Array.from(line.querySelectorAll("input[required], textarea[required], select[required]"));
  return requiredFields.every(input => String(input.value || "").trim());
}

function updateMoneyRequestAddButtons() {
  document.querySelectorAll(".money-request-line").forEach(line => {
    const button = line.querySelector("[data-add-money-line]");
    if (!button) return;
    const alreadyUsed = line.dataset.addLineUsed === "true";
    button.classList.toggle("is-hidden", alreadyUsed || !isMoneyRequestLineComplete(line));
  });
}

function formatMoneyInput(input) {
  const cleaned = String(input.value || "").replace(/[^0-9.]/g, "");
  if (!cleaned) {
    input.value = "";
    return;
  }
  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) return;
  input.value = amount.toFixed(2);
}

function syncBudgetFromCode(input) {
  const line = input.closest(".money-request-line");
  const select = line?.querySelector("[data-budget-category]");
  if (!line || !select) return;
  const match = getFilteredBudgetCodesForCurrentRequest().find(c => String(c.code || "").trim().toLowerCase() === input.value.trim().toLowerCase());
  if (match) select.value = match.category || "";
}

function syncBudgetFromCategory(select) {
  const line = select.closest(".money-request-line");
  const codeInput = line?.querySelector("[data-budget-code]");
  if (!line || !codeInput) return;
  const match = getFilteredBudgetCodesForCurrentRequest().find(c => String(c.category || "") === String(select.value || ""));
  if (match) codeInput.value = match.code || "";
}

function formatMoneyDate(value) {
  if (!value) return "No date";
  const [y, m, d] = String(value).split("-");
  if (!y || !m || !d) return value;
  return `${m}/${d}/${y}`;
}

function getMoneyRequestTotal(request) {
  return (request.items || []).reduce((total, item) => {
    return total + (item.customFields || []).reduce((lineTotal, field) => {
      const label = safeLower(field.label || "");
      const raw = String(field.value || "").replace(/[^0-9.-]/g, "");
      const amount = Number(raw);
      if (!Number.isFinite(amount)) return lineTotal;
      if (field.type === "money" || label.includes("amount") || label.includes("total") || label.includes("cost")) {
        return lineTotal + amount;
      }
      return lineTotal;
    }, 0);
  }, 0);
}

function formatMoneyAmount(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function passwordFieldHtml(name = "password", label = "Password", opts = {}) {
  const autocomplete = opts.autocomplete || "new-password";
  const minlength = opts.minlength ? ` minlength="${opts.minlength}"` : "";
  const inputmode = opts.inputmode ? ` inputmode="${opts.inputmode}"` : "";
  const maxlength = opts.maxlength ? ` maxlength="${opts.maxlength}"` : "";
  const pattern = opts.pattern ? ` pattern="${opts.pattern}"` : "";
  return `<label>${label}
    <div class="password-input-wrap">
      <input name="${name}" type="password" autocomplete="${autocomplete}"${minlength}${inputmode}${maxlength}${pattern} required />
      <button type="button" class="show-password-toggle" data-show-password aria-label="Show password">👁</button>
    </div>
  </label>`;
}

function modalErrorHtml() {
  return state.modal?.error ? `<div class="modal-error">${state.modal.error}</div>` : "";
}

function renderMoneyRequestDetails(request) {
  return `
    <div class="money-request-items">
      ${(request.items || []).map(item => `
        <div class="money-request-item">
          <strong>${item.requestTypeName || "Request"}</strong>
          <span>${item.budgetCode || "No code"}</span>
          <span>${item.budgetCategory || "No category"}</span>
          ${(item.customFields || []).map(f => `<span><b>${f.label || "Field"}:</b> ${f.value || "—"}</span>`).join("")}
        </div>
      `).join("")}
      ${request.denialNote ? `<div class="denial-note"><b>Denied:</b> ${request.denialNote}</div>` : ""}
      ${(request.receipts || []).length ? `<div class="receipt-summary"><b>Receipts:</b> ${(request.receipts || []).length} attached</div>` : ""}
    </div>
  `;
}


function moneyStatusLabel(status) {
  const s = normalizeMoneyRequestStatus(status);
  if (s === "pendingDoso") return "Pending DOSO Approval";
  if (s === "pendingOwner") return "Pending Owner Approval";
  if (s === "finalApproved") return "Approved";
  if (s === "deniedByDoso") return "Denied by DOSO";
  if (s === "deniedByOwner") return "Denied by Owner";
  if (s === "selfDosoPasswordNeeded") return "Waiting for your DOSO approval";
  return s;
}

function renderMyMoneyRequests() {
  const mine = state.moneyRequests
    .filter(r => r.submittedByUid === state.session?.uid)
    .sort((a,b)=>String(b.todayDate || "").localeCompare(String(a.todayDate || "")));
  if (!mine.length) return `<div class="empty">You have not submitted any money requests yet.</div>`;
  return `<div class="money-request-queue my-money-requests">
    ${mine.map(request => {
      const isOpen = state.expandedMoneyRequestId === request.id;
      const status = normalizeMoneyRequestStatus(request.status);
      const canEdit = status === "deniedByDoso" || status === "deniedByOwner";
      return `<div class="money-request-card ${isOpen ? "open" : ""} ${canEdit ? "denied" : ""}">
        <div class="money-summary-row">
          <button class="money-request-summary" type="button" data-expand-money-request="${request.id}">
            <strong>${moneyStatusLabel(status)}</strong>
            <span>${getRequestSchoolName(request)}</span>
            <span>Submitted: ${formatMoneyDate(request.todayDate)}</span>
            <span>Needed: ${formatMoneyDate(request.requestedByDate)}</span>
            <b>${formatMoneyAmount(getMoneyRequestTotal(request))}</b>
          </button>
          <div class="money-summary-actions">
            ${canEdit ? `<button class="small" type="button" data-edit-denied-money-request="${request.id}">Edit & Resubmit</button>` : ""}
          </div>
        </div>
        ${request.denialNote ? `<div class="denial-note"><b>Note:</b> ${request.denialNote}</div>` : ""}
        ${isOpen ? renderMoneyRequestDetails(request) : ""}
      </div>`;
    }).join("")}
  </div>`;
}

function renderEditDeniedMoneyRequestModal(request) {
  if (!request) return "";
  return `
    <div class="modal-backdrop"><form class="modal card wide-modal" id="editDeniedMoneyRequestForm" data-request-id="${request.id}">
      <h2>Edit & Resubmit</h2>
      <p class="helper">Update the request, then resubmit it for approval.</p>
      ${request.denialNote ? `<div class="denial-note"><b>Denial note:</b> ${request.denialNote}</div>` : ""}
      <div class="grid three compact-dates">
        <label>Location<select name="requestSchoolId" required>${renderSchoolOptionsForUser(state.session, request.requestSchoolId)}</select></label>
        <label>Today’s Date<input name="todayDate" type="date" value="${todayIso()}" readonly /></label>
        <label>Date Requested By<input name="requestedByDate" type="date" value="${request.requestedByDate || ""}" required /></label>
      </div>
      <div class="edit-money-items">
        ${(request.items || []).map((item, i) => `
          <div class="money-request-line edit-money-line" data-edit-item-index="${i}">
            <strong class="money-line-kind">${item.requestTypeName || "Request"}</strong>
            <label class="money-budget-code">Budget Code<input name="budgetCode_${i}" data-budget-code value="${item.budgetCode || ""}" required /></label>
            <label class="money-budget-category">Budget Category<select name="budgetCategory_${i}" data-budget-category required>${renderBudgetCategoryOptions(item.budgetCategory || "")}</select></label>
            ${(item.customFields || []).map((f, j) => {
              const name = `field_${i}_${j}`;
              const label = f.label || "Field";
              if (f.type === "money") return `<label class="money-custom-field money-custom-money">${label}<span class="money-input-wrap"><span class="money-symbol">$</span><input name="${name}" data-money-input inputmode="decimal" value="${f.value || ""}" /></span></label>`;
              if (f.type === "longText" || f.type === "textarea") return `<label class="money-custom-field money-custom-wide">${label}<textarea name="${name}">${f.value || ""}</textarea></label>`;
              return `<label class="money-custom-field">${label}<input name="${name}" value="${f.value || ""}" /></label>`;
            }).join("")}
          </div>
        `).join("")}
      </div>
      <div class="actions"><button>Resubmit Request</button><button type="button" class="secondary" data-close-modal>Cancel</button></div>
    </form></div>`;
}

async function saveEditedDeniedMoneyRequest(form) {
  const requestId = form.dataset.requestId;
  const request = state.moneyRequests.find(r => r.id === requestId);
  if (!request) throw new Error("Request not found.");
  const items = (request.items || []).map((item, i) => ({
    ...item,
    budgetCode: form[`budgetCode_${i}`]?.value?.trim() || "",
    budgetCategory: form[`budgetCategory_${i}`]?.value?.trim() || "",
    customFields: (item.customFields || []).map((f, j) => ({ ...f, value: form[`field_${i}_${j}`]?.value || "" }))
  }));
  const requestSchoolId = form.requestSchoolId.value;
  await updateDoc(doc(db, "moneyRequests", requestId), {
    status: "pendingDoso",
    requestSchoolId,
    requestSchoolName: getSchoolNameById(requestSchoolId),
    todayDate: form.todayDate.value,
    requestedByDate: form.requestedByDate.value,
    items,
    denialNote: "",
    deniedByUid: "",
    deniedByName: "",
    deniedAt: null,
    updatedAt: serverTimestamp()
  });
  await createNotification({ title: "Money request resubmitted", body: `${state.session?.firstName || "Someone"} resubmitted a money request for ${getSchoolNameById(requestSchoolId)}.`, toPositions: ["DOSO"], schoolIds: [requestSchoolId], toolKey: "moneyRequests", targetTab: "pendingDoso" });
  state.modal = null;
  await loadMoneyRequests();
  await loadNotifications();
  state.moneyRequestsTab = "myRequests";
  showToast("Request resubmitted.");
  renderMoneyRequestsTool();
}

async function denyMoneyRequest(requestId, stage, note) {
  const request = state.moneyRequests.find(r => r.id === requestId);
  if (!request) throw new Error("Request not found.");
  const isDoso = stage === "pendingDoso";
  await updateDoc(doc(db, "moneyRequests", requestId), {
    status: isDoso ? "deniedByDoso" : "deniedByOwner",
    denialNote: note,
    deniedByUid: state.session?.uid || null,
    deniedByName: `${state.session?.firstName || ""} ${state.session?.lastName || ""}`.trim(),
    deniedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await createNotification({ title: "Money request denied", body: note || "A money request needs changes before resubmitting.", toUids: [request.submittedByUid], schoolIds: [request.requestSchoolId].filter(Boolean), toolKey: "moneyRequests", targetTab: "myRequests" });
  state.modal = null;
  await loadMoneyRequests();
  await loadNotifications();
  state.moneyRequestsTab = stage;
  showToast("Request denied with note.");
  renderMoneyRequestsTool();
}

function renderReceiptLine(line = {}, index = 0) {
  return `
    <div class="receipt-line" data-receipt-line>
      <label>Description<input name="receiptDescription_${index}" value="${line.description || ""}" placeholder="Item / note" required /></label>
      <label>Amount<span class="money-input-wrap"><span class="money-symbol">$</span><input name="receiptAmount_${index}" data-money-input inputmode="decimal" value="${line.amount || ""}" placeholder="0.00" required /></span></label>
      <label>Budget Code<input name="receiptBudgetCode_${index}" data-budget-code placeholder="Code" required /></label>
      <label>Budget Category<select name="receiptBudgetCategory_${index}" data-budget-category required><option value="">Choose category</option>${state.budgetCodes.map(b => `<option value="${b.category || ""}">${b.code || ""} — ${b.category || ""}</option>`).join("")}</select></label>
      <button class="secondary small" type="button" data-remove-receipt-line>Remove</button>
    </div>
  `;
}

function renderReceiptCaptureForm(request) {
  if (!request) return `<div class="empty">Choose a request to add receipts.</div>`;
  return `
    <form id="receiptUploadForm" class="receipt-form" data-receipt-request-id="${request.id}">
      <div class="receipt-form-header">
        <div>
          <h3>Add Receipt</h3>
          <p class="helper">Attach/take a receipt photo, then enter each receipt item as its own line so every item can have its own budget code.</p>
        </div>
        <button class="secondary small" type="button" data-expand-money-request="${request.id}">View PO Details</button>
      </div>
      <div class="grid three">
        <label>Receipt Photo
          <input type="file" name="receiptImage" accept="image/*" capture="environment" />
        </label>
        <label>Vendor / Store
          <input name="receiptVendor" placeholder="Vendor name" />
        </label>
        <label>Receipt Date
          <input name="receiptDate" type="date" value="${todayIso()}" />
        </label>
      </div>
      <div class="receipt-lines" id="receiptLines">
        ${renderReceiptLine({}, 0)}
      </div>
      <div class="actions" style="justify-content:flex-start;">
        <button class="secondary small" type="button" data-add-receipt-line>Add receipt line</button>
        <button type="submit">Save Receipt</button>
      </div>
    </form>
  `;
}

function renderReceiptQueue(canAddReceipts) {
  const requests = state.moneyRequests
    .filter(r => normalizeMoneyRequestStatus(r.status) === "finalApproved")
    .filter(r => userCanSeeMoneyRequestForStage(r, "receipts"))
    .sort((a, b) => String(b.ownerApprovedAt?.seconds || b.todayDate || "").localeCompare(String(a.ownerApprovedAt?.seconds || a.todayDate || "")));
  if (!requests.length) return `<div class="empty">No owner-approved money requests are ready for receipts yet.</div>`;
  const activeId = state.activeReceiptRequestId || requests[0].id;
  const active = requests.find(r => r.id === activeId) || requests[0];
  state.activeReceiptRequestId = active.id;
  return `
    <div class="receipt-workspace">
      <div class="receipt-request-list">
        ${requests.map(request => `<button type="button" class="receipt-request-button ${request.id === active.id ? "active" : ""}" data-receipt-request="${request.id}">
          <strong>${request.submittedByName || "Unknown requester"}</strong>
          <span>${formatMoneyDate(request.requestedByDate)} • ${formatMoneyAmount(getMoneyRequestTotal(request))}</span>
          <small>${(request.receipts || []).length ? `${(request.receipts || []).length} receipt(s)` : "No receipts yet"}</small>
        </button>`).join("")}
      </div>
      <div class="receipt-request-detail">
        ${renderMoneyRequestDetails(active)}
        ${canAddReceipts ? renderReceiptCaptureForm(active) : ""}
      </div>
    </div>
  `;
}

async function resizeReceiptImage(file) {
  if (!file) return "";
  return resizeToolImage(file);
}

async function saveReceiptForMoneyRequest(form) {
  const requestId = form.dataset.receiptRequestId;
  const request = state.moneyRequests.find(r => r.id === requestId);
  if (!request) throw new Error("Could not find that money request.");
  const lineEls = Array.from(form.querySelectorAll("[data-receipt-line]"));
  const lines = lineEls.map((line, index) => ({
    description: line.querySelector(`[name="receiptDescription_${index}"]`)?.value.trim() || "",
    amount: line.querySelector(`[name="receiptAmount_${index}"]`)?.value.trim() || "",
    budgetCode: line.querySelector(`[name="receiptBudgetCode_${index}"]`)?.value.trim() || "",
    budgetCategory: line.querySelector(`[name="receiptBudgetCategory_${index}"]`)?.value.trim() || ""
  })).filter(line => line.description || line.amount || line.budgetCode || line.budgetCategory);
  if (!lines.length) throw new Error("Add at least one receipt line.");
  const imageData = await resizeReceiptImage(form.receiptImage?.files?.[0]);
  const receipt = {
    vendor: form.receiptVendor?.value.trim() || "",
    receiptDate: form.receiptDate?.value || todayIso(),
    imageData,
    lines,
    addedByUid: state.session?.uid || null,
    addedByName: `${state.session?.firstName || ""} ${state.session?.lastName || ""}`.trim(),
    addedAtMs: Date.now()
  };
  await updateDoc(doc(db, "moneyRequests", requestId), {
    receipts: [...(request.receipts || []), receipt],
    updatedAt: serverTimestamp()
  });
  await loadMoneyRequests();
  showToast("Receipt saved.");
  renderMoneyRequestsTool();
}

function normalizeMoneyRequestStatus(status) {
  const value = String(status || "pendingDoso");
  if (value === "pending") return "pendingDoso";
  if (value === "approved") return "pendingOwner";
  if (value === "selfDosoPasswordNeeded") return "selfDosoPasswordNeeded";
  return value;
}

function moneyQueueTitle(status) {
  if (status === "pendingDoso") return "Pending DOSO approval";
  if (status === "pendingOwner") return "Pending owner approval";
  if (status === "finalApproved") return "approved";
  return status;
}

function renderMoneyRequestQueue(status, canApproveDoso, canApproveOwner) {
  const requests = state.moneyRequests
    .filter(r => {
      const normalized = normalizeMoneyRequestStatus(r.status);
      if (status === "pendingDoso") return normalized === "pendingDoso";
      if (status === "pendingOwner") return normalized === "pendingOwner";
      if (status === "finalApproved") return normalized === "finalApproved";
      return normalized === status;
    })
    .filter(r => userCanSeeMoneyRequestForStage(r, status))
    .sort((a, b) => String(b.todayDate || "").localeCompare(String(a.todayDate || "")));
  if (!requests.length) return `<div class="empty">No ${moneyQueueTitle(status)} money requests yet.</div>`;
  const canBulk = requests.length > 1 && ((status === "pendingDoso" && canApproveDoso) || (status === "pendingOwner" && canApproveOwner));
  const selected = new Set(state.selectedMoneyApprovalIds || []);
  const approveLabel = status === "pendingDoso" ? "DOSO Approve" : "Owner Approve";
  const renderRequestCard = (request) => {
    const isOpen = state.expandedMoneyRequestId === request.id;
    const total = getMoneyRequestTotal(request);
    return `<div class="money-request-card ${isOpen ? "open" : ""}">
      <div class="money-summary-row">
        ${canBulk ? `<label class="bulk-check"><input type="checkbox" data-select-money-approval="${request.id}" ${selected.has(request.id) ? "checked" : ""} /> Select</label>` : ""}
        <button class="money-request-summary" type="button" data-expand-money-request="${request.id}">
          <strong>${request.submittedByName || "Unknown requester"}</strong>
          <span>${getRequestSchoolName(request)}</span>
          <span>Submitted: ${formatMoneyDate(request.todayDate)}</span>
          <span>Needed: ${formatMoneyDate(request.requestedByDate)}</span>
          <b>${formatMoneyAmount(total)}</b>
        </button>
        <div class="money-summary-actions">
          ${!canBulk && status === "pendingDoso" && canApproveDoso ? `<button class="small" type="button" data-doso-approve-money-request="${request.id}">DOSO Approve</button><button class="secondary small" type="button" data-deny-money-request="${request.id}" data-deny-stage="pendingDoso">Deny</button>` : ""}
          ${!canBulk && status === "pendingOwner" && canApproveOwner ? `<button class="small" type="button" data-owner-approve-money-request="${request.id}">Owner Approve</button><button class="secondary small" type="button" data-deny-money-request="${request.id}" data-deny-stage="pendingOwner">Deny</button>` : ""}
          ${status === "finalApproved" && canApproveOwner ? `<button class="secondary small" type="button" disabled>Final Approved</button>` : ""}
        </div>
      </div>
      ${isOpen ? renderMoneyRequestDetails(request) : ""}
    </div>`;
  };
  let body = "";
  if (status === "pendingOwner") {
    const groups = new Map();
    requests.forEach(r => {
      const name = getRequestSchoolName(r);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(r);
    });
    body = Array.from(groups.entries()).map(([name, list]) => `<div class="location-request-group"><h3>${name}</h3>${list.map(renderRequestCard).join("")}</div>`).join("");
  } else {
    body = requests.map(renderRequestCard).join("");
  }
  return `<div class="money-request-queue ${canBulk ? "bulk-mode" : ""}">${body}</div>${canBulk && selected.size ? `<button class="floating-approve-button" type="button" data-bulk-money-approve="${status}">${approveLabel} (${selected.size})</button>` : ""}`;
}

function openApprovalPasswordModal(ids, stage) {
  state.modal = { type: "approvalPassword", ids, stage, error: "" };
  renderCurrentView();
}

async function completeApprovalPassword(password) {
  if (!password) {
    state.modal = { ...state.modal, error: "Enter your password to approve." };
    renderCurrentView();
    return;
  }
  await signInWithEmailAndPassword(auth, state.session.fakeEmail, password);
  const ids = state.modal.ids || [];
  const stage = state.modal.stage;
  state.modal = null;
  await approveMoneyRequests(ids, stage, true);
}

async function completeNukeMoneyRequests(password) {
  if (!password) {
    state.modal = { ...state.modal, error: "Enter your password to delete money requests." };
    renderCurrentView();
    return;
  }
  await signInWithEmailAndPassword(auth, state.session.fakeEmail, password);
  const snap = await getDocs(collection(db, "moneyRequests"));
  await Promise.all(snap.docs.map(d => deleteDoc(doc(db, "moneyRequests", d.id))));
  state.moneyRequests = [];
  state.selectedMoneyApprovalIds = [];
  state.expandedMoneyRequestId = "";
  state.modal = null;
  await loadMoneyRequests();
  showToast(`Deleted ${snap.docs.length} money request${snap.docs.length === 1 ? "" : "s"}.`);
  renderSystemAdmin();
}

async function approveMoneyRequests(ids, stage, passwordVerified = false) {
  if (!passwordVerified) {
    openApprovalPasswordModal(ids, stage);
    return;
  }
  const isDoso = stage === "pendingDoso";
  for (const id of ids) {
    await updateDoc(doc(db, "moneyRequests", id), isDoso ? {
      status: "pendingOwner", dosoApprovedByUid: state.session?.uid || null,
      dosoApprovedByName: `${state.session?.firstName || ""} ${state.session?.lastName || ""}`.trim(),
      dosoApprovedAt: serverTimestamp(), updatedAt: serverTimestamp()
    } : {
      status: "finalApproved", ownerApprovedByUid: state.session?.uid || null,
      ownerApprovedByName: `${state.session?.firstName || ""} ${state.session?.lastName || ""}`.trim(),
      ownerApprovedAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
  }
  if (isDoso) {
    const approvedSchoolIds = Array.from(new Set(ids.map(id => state.moneyRequests.find(r => r.id === id)?.requestSchoolId).filter(Boolean)));
    await createNotification({ title: "PO ready for owner approval", body: `${ids.length} money request(s) approved by DOSO.`, toRoles: ["owner"], toPositions: ["CFO"], schoolIds: approvedSchoolIds, toolKey: "moneyRequests", targetTab: "pendingOwner" });
  }
  await loadMoneyRequests();
  await loadNotifications();
  state.selectedMoneyApprovalIds = [];
  state.moneyRequestsTab = isDoso ? "pendingOwner" : "finalApproved";
  state.expandedMoneyRequestId = ids[0] || "";
  showToast(isDoso ? "Money request sent to owner approval." : "Money request fully approved.");
  renderMoneyRequestsTool();
}

async function submitMoneyRequest(form) {
  const lines = Array.from(form.querySelectorAll(".money-request-line"));
  if (!lines.length) throw new Error("Choose at least one money request type.");

  const items = lines.map(line => {
    const typeId = line.dataset.requestTypeId;
    const requestType = state.moneyRequestTypes.find(t => t.id === typeId);
    const customFields = (requestType?.fields || []).map((field, index) => {
      const input = line.querySelector(`[data-custom-field="${index}"]`);
      return { label: field.label || "Custom Field", type: field.type || "text", required: !!field.required, value: input?.value || "" };
    });
    return {
      requestTypeId: typeId,
      requestTypeName: requestType?.name || "Money Request",
      budgetCode: line.querySelector("[data-budget-code]")?.value.trim() || "",
      budgetCategory: line.querySelector("[data-budget-category]")?.value.trim() || "",
      customFields
    };
  });

  const requestSchoolId = form.requestSchoolId?.value || getDefaultRequestSchoolId();
  const permissionUser = getPermissionUser(state.session);
  const canAutoApproveDoso = hasToolPermission(permissionUser, "moneyRequests", "approvePending") && userSchoolMatchesScope([requestSchoolId], state.session);
  const newRequestRef = doc(collection(db, "moneyRequests"));
  await setDoc(newRequestRef, {
    status: canAutoApproveDoso ? "selfDosoPasswordNeeded" : "pendingDoso",
    requestSchoolId,
    requestSchoolName: getSchoolNameById(requestSchoolId),
    todayDate: form.todayDate.value,
    requestedByDate: form.requestedByDate.value,
    submittedByUid: state.session?.uid || null,
    submittedByName: `${state.session?.firstName || ""} ${state.session?.lastName || ""}`.trim(),
    schoolIds: state.session?.schoolIds || [],
    items,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  if (canAutoApproveDoso) {
    state.modal = { type: "selfDosoApproval", ids: [newRequestRef.id], stage: "pendingDoso", error: "" };
  } else {
    await createNotification({ title: "New money request", body: `${state.session?.firstName || "Someone"} submitted a money request for ${getSchoolNameById(requestSchoolId)}.`, toPositions: ["DOSO"], schoolIds: [requestSchoolId], toolKey: "moneyRequests", targetTab: "pendingDoso" });
  }
  await loadMoneyRequests();
  await loadNotifications();
  state.moneyRequestsTab = canAutoApproveDoso ? "myRequests" : "pendingDoso";
  state.expandedMoneyRequestId = "";
  showToast("Money request submitted.");
  renderMoneyRequestsTool();
}

function renderMoneyRequestsTool() {
  state.currentView = "moneyRequests";

  const permissionUser = getPermissionUser(state.session);
  const canSubmit = hasToolPermission(permissionUser, "moneyRequests", "submit") || hasFullDevAccess(state.session);
  const canApproveDoso = hasToolPermission(permissionUser, "moneyRequests", "approvePending") || hasFullDevAccess(state.session);
  const canApproveOwner = hasToolPermission(permissionUser, "moneyRequests", "processApproved") || hasFullDevAccess(state.session);
  const canAddReceipts = hasToolPermission(permissionUser, "moneyRequests", "addReceipts") || hasFullDevAccess(state.session);
  const availableTabs = [
    ...(canSubmit ? ["submit", "myRequests"] : []),
    ...(canApproveDoso ? ["pendingDoso"] : []),
    ...(canApproveOwner ? ["pendingOwner", "finalApproved"] : []),
    ...(canAddReceipts ? ["receipts"] : [])
  ];
  if (!availableTabs.includes(state.moneyRequestsTab)) {
    state.moneyRequestsTab = availableTabs[0] || "submit";
  }
  const activeTab = state.moneyRequestsTab || "submit";

  $app.innerHTML = pageShell(`
    <section class="card">
      <div class="actions" style="justify-content:space-between;align-items:flex-start;">
        <div>
          <h2>Money Requests</h2>
          <p class="helper">Submit, review, and approve money requests.</p>
        </div>
        <button class="secondary small" data-action="home" type="button">Back Home</button>
      </div>

      <div class="tab-row money-workspace-tabs">
        ${canSubmit ? `<button class="${activeTab === "submit" ? "active" : ""}" data-money-queue-tab="submit" type="button">Money Requests</button><button class="${activeTab === "myRequests" ? "active" : ""}" data-money-queue-tab="myRequests" type="button">My Requests</button>` : ""}
        ${canApproveDoso ? `<button class="${activeTab === "pendingDoso" ? "active" : ""}" data-money-queue-tab="pendingDoso" type="button">Pending DOSO Approval</button>` : ""}
        ${canApproveOwner ? `<button class="${activeTab === "pendingOwner" ? "active" : ""}" data-money-queue-tab="pendingOwner" type="button">Pending Owner Approval</button>` : ""}
        ${canApproveOwner ? `<button class="${activeTab === "finalApproved" ? "active" : ""}" data-money-queue-tab="finalApproved" type="button">Approved</button>` : ""}
        ${canAddReceipts ? `<button class="${activeTab === "receipts" ? "active" : ""}" data-money-queue-tab="receipts" type="button">Approved Requests</button>` : ""}
      </div>

      ${activeTab === "submit" && canSubmit ? `
        <form id="moneyRequestSubmissionForm" class="money-request-form compact">
          <div class="grid three compact-dates">
            <label>Location
              <select name="requestSchoolId" required>${renderSchoolOptionsForUser(state.session)}</select>
            </label>
            <label>Today’s Date
              <input name="todayDate" type="date" value="${todayIso()}" readonly />
            </label>
            <label>Date Requested By
              <input name="requestedByDate" type="date" required />
            </label>
          </div>

          <div class="money-type-picker compact">
            <div class="actions" style="justify-content:flex-start;flex-wrap:wrap;">
              ${state.moneyRequestTypes.length ? state.moneyRequestTypes.map(t => `
                <button class="secondary money-type-button" type="button" data-money-request-toggle="${t.id}">${t.name}</button>
              `).join("") : `<div class="empty">No request types have been added yet.</div>`}
            </div>
          </div>

          <div id="moneyRequestLineSections" class="money-line-sections"></div>

          <div class="actions" style="justify-content:flex-end;">
            <button type="submit">Submit Money Request</button>
          </div>
        </form>
      ` : ""}

      ${activeTab === "myRequests" && canSubmit ? renderMyMoneyRequests() : ""}
      ${activeTab === "pendingDoso" ? renderMoneyRequestQueue("pendingDoso", canApproveDoso, canApproveOwner) : ""}
      ${activeTab === "pendingOwner" ? renderMoneyRequestQueue("pendingOwner", canApproveDoso, canApproveOwner) : ""}
      ${activeTab === "finalApproved" ? renderMoneyRequestQueue("finalApproved", canApproveDoso, canApproveOwner) : ""}
      ${activeTab === "receipts" && canAddReceipts ? renderReceiptQueue(canAddReceipts) : ""}
    </section>
    ${state.modal ? renderModal() : ""}
    ${renderPhotoContextMenu()}
    ${renderPhotoPrintDuplicatePrompt()}
    ${state.toast ? `<div class="toast">${state.toast}</div>` : ""}
  `);
}



function renderBudgetCodeSchoolSummary(code) {
  if (code.allSchools !== false) return "All schools";
  const ids = Array.isArray(code.schoolIds) ? code.schoolIds : [];
  return ids.length ? ids.map(getSchoolNameById).join(", ") : "No schools selected";
}

function renderBudgetCodesManager() {
  return `
    <div class="actions" style="justify-content:flex-start;">
      <button data-modal="addBudgetCode">Add Budget Code</button>
    </div>
    <div class="name-grid admin-name-grid">
      ${state.budgetCodes.length ? state.budgetCodes.map(c => `
        <button class="name-button" data-edit-budget-code="${c.id}" type="button">
          ${c.category}
          <span>${c.code} · ${renderBudgetCodeSchoolSummary(c)}</span>
        </button>
      `).join("") : `<div class="empty grid-empty">No budget codes yet.</div>`}
    </div>
  `;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function moneyAmountFromItem(item) {
  let total = 0;
  (item.customFields || []).forEach(f => {
    if (String(f.type || "").toLowerCase() === "money") total += Number(String(f.value || "").replace(/[^0-9.-]/g, "")) || 0;
  });
  return total;
}
function getRequestTotalNumber(request) {
  return (request.items || []).reduce((sum, item) => sum + moneyAmountFromItem(item), 0);
}

function renderBudgetAnalyticsPanel() {
  const final = state.moneyRequests.filter(r => normalizeMoneyRequestStatus(r.status) === "finalApproved");
  const bySchool = new Map();
  const byBudget = new Map();
  let grand = 0;
  final.forEach(req => {
    const school = getRequestSchoolName(req);
    const reqTotal = getRequestTotalNumber(req);
    grand += reqTotal;
    bySchool.set(school, (bySchool.get(school) || 0) + reqTotal);
    (req.items || []).forEach(item => {
      const key = `${item.budgetCode || "No Code"} — ${item.budgetCategory || "No Category"}`;
      byBudget.set(key, (byBudget.get(key) || 0) + moneyAmountFromItem(item));
    });
  });
  const schoolRows = Array.from(bySchool.entries()).sort((a,b)=>b[1]-a[1]);
  const budgetRows = Array.from(byBudget.entries()).sort((a,b)=>b[1]-a[1]);
  return `
    <div class="analytics-grid">
      <div class="metric-card"><strong>Total Approved Spending</strong><b>${formatCurrency(grand)}</b><span>${final.length} approved request(s)</span></div>
      <div class="metric-card"><strong>Locations</strong><b>${schoolRows.length}</b><span>with approved spending</span></div>
      <div class="metric-card"><strong>Budget Categories</strong><b>${budgetRows.length}</b><span>used by requests</span></div>
    </div>
    <div class="grid two">
      <div class="card subtle-card"><h3>Spending by Location</h3>${schoolRows.length ? schoolRows.map(([name,total]) => `<div class="analytics-row"><span>${name}</span><strong>${formatCurrency(total)}</strong></div>`).join("") : `<div class="empty">No approved spending yet.</div>`}</div>
      <div class="card subtle-card"><h3>Spending by Budget</h3>${budgetRows.length ? budgetRows.map(([name,total]) => `<div class="analytics-row"><span>${name}</span><strong>${formatCurrency(total)}</strong></div>`).join("") : `<div class="empty">No budget spending yet.</div>`}</div>
    </div>
    <p class="helper">Next step later: once older-year data exists, this panel can compare current year vs. last year and show over/under trends by location and budget.</p>
  `;
}

function renderOwnersPanel() {
  state.currentView = "ownersPanel";
  if (!canUseOwnersPanel(state.session)) { renderHome(); return; }
  $app.innerHTML = pageShell(`
    <section class="card">
      <h2>Owners Panel</h2>
      <p class="helper">Owner-level budget setup and budget analytics.</p>
      <div class="nav-tabs">
        <button class="${state.ownerTab === "budgetCodes" ? "active" : ""}" data-owner-tab="budgetCodes">Budget Codes</button>
        <button class="${state.ownerTab === "analytics" ? "active" : ""}" data-owner-tab="analytics">Budget Analytics</button>
      </div>
      ${state.ownerTab === "budgetCodes" ? renderBudgetCodesManager() : ""}
      ${state.ownerTab === "analytics" ? renderBudgetAnalyticsPanel() : ""}
    </section>
    ${state.modal ? renderModal() : ""}
    ${renderPhotoContextMenu()}
    ${renderPhotoPrintDuplicatePrompt()}
    ${state.toast ? `<div class="toast">${state.toast}</div>` : ""}
  `);
}


function coreChampionMonthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`; }
function coreChampionMonthLabel(key) { const [y,m]=String(key||coreChampionMonthKey()).split("-"); return new Date(Number(y), Number(m)-1, 1).toLocaleString("en-US", { month:"long", year:"numeric" }); }
async function loadCoreChampionRounds(){
  try { const snap = await getDocs(collection(db,"coreChampionRounds")); state.coreChampionRounds = snap.docs.map(d=>({ id:d.id, ...d.data() })).sort((a,b)=>String(b.monthKey||b.id).localeCompare(String(a.monthKey||a.id))); }
  catch(err){ state.coreChampionRounds = []; }
}
function getCoreRound(monthKey = coreChampionMonthKey()){ return state.coreChampionRounds.find(r => (r.monthKey || r.id) === monthKey) || null; }
function getCorePastWinnerIds(){ return new Set((state.coreChampionRounds||[]).map(r=>r.winnerUid).filter(Boolean)); }
function isCoreChampionManager(user=state.session){ return hasToolPermission(user,"coreChampion","manage") || hasFullDevAccess(user) || String(user?.teamPosition||"").toLowerCase().includes("doso"); }
function isCoreDefaultEligibleUser(user){
  const roles = getUserRoleKeys(user);
  const position = String(user?.teamPosition || user?.position || "").toLowerCase();
  if (roles.some(r => ["owner", "admin", "systemadmin", "system-admin", "system_admin", "dev", "leader", "lead"].includes(r))) return false;
  if (/owner|director|doso|leader|admin|campus cares/.test(position)) return false;
  if (roles.some(r => ["teacher", "mentor"].includes(r))) return true;
  if (/teacher|mentor/.test(position)) return true;
  return true;
}
function isCoreEffectivelyEligible(user){
  if (!user || user.active === false) return false;
  if (getCorePastWinnerIds().has(user.uid)) return false;
  if (typeof user.coreChampionIneligible === "boolean") return !user.coreChampionIneligible;
  return isCoreDefaultEligibleUser(user);
}
function isCoreEligibleUser(user){ return isCoreEffectivelyEligible(user); }
function getCoreEligibleUsers(){ return (state.users||[]).filter(isCoreEligibleUser).sort(byName); }
function getCoreNominationChoices(){
  const me = state.session?.uid || "";
  return getCoreEligibleUsers().filter(u => u.uid !== me);
}
function getCoreUser(uid){ return (state.users||[]).find(u=>u.uid===uid) || (state.roster||[]).find(u=>u.uid===uid) || null; }
function renderCorePersonFace(user, className="core-person-face"){
  const initial = escapeHtml((getUserUsedName(user) || "?").slice(0,1).toUpperCase());
  return user?.profileImageData ? `<img class="${className}" src="${user.profileImageData}" alt="" />` : `<span class="${className}">${initial}</span>`;
}
function renderCorePersonButton(user, attrs=""){
  return `<button class="core-person-choice" type="button" ${attrs}>${renderCorePersonFace(user)}<span><strong>${escapeHtml(getUserUsedName(user))}</strong><small>${escapeHtml(user.teamPosition||user.position||"")}</small></span></button>`;
}
function coreNominationFor(round, uid){ return (round?.nominations||[]).find(n=>n.candidateUid===uid); }
function coreVotesFor(round, uid){ return (round?.votes||[]).filter(v=>v.candidateUid===uid); }
function coreUniqueNominations(round){
  const seen = new Set();
  return (round?.nominations||[]).filter(n => {
    if (!n?.candidateUid || seen.has(n.candidateUid)) return false;
    seen.add(n.candidateUid);
    return true;
  });
}
function coreUserHasNominated(round, uid=state.session?.uid){
  if (!uid) return false;
  if ((round?.nominationLocks||[]).some(n=>n.nominatorUid===uid)) return true;
  return (round?.nominations||[]).some(n=>n.nominatorUid===uid);
}
function coreUserVotedFor(round, candidateUid, voterUid=state.session?.uid){ return (round?.votes||[]).some(v=>v.candidateUid===candidateUid && v.voterUid===voterUid); }

function coreAutoDueToday(settings = state.appSettings || {}, date = new Date()) {
  if (settings.coreChampionScheduleType === "day") return date.getDate() === Number(settings.coreChampionScheduleDay || 20);
  if (settings.coreChampionScheduleType === "weekday") {
    const map = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };
    const want = map[settings.coreChampionScheduleWeekday || "MO"];
    if (date.getDay() !== want) return false;
    const ordinal = settings.coreChampionScheduleOrdinal || "last";
    const day = date.getDate();
    if (ordinal === "first") return day <= 7;
    if (ordinal === "second") return day >= 8 && day <= 14;
    if (ordinal === "third") return day >= 15 && day <= 21;
    if (ordinal === "fourth") return day >= 22 && day <= 28;
    const nextWeek = new Date(date); nextWeek.setDate(day + 7);
    return nextWeek.getMonth() !== date.getMonth();
  }
  return false;
}
async function applyCoreChampionAutoOpenIfDue(){
  const monthKey = coreChampionMonthKey();
  if (!isCoreChampionManager(state.session)) return;
  if (getCoreRound(monthKey)) return;
  if (!coreAutoDueToday(state.appSettings || {})) return;
  await openCoreChampionRound(monthKey);
}

async function openCoreChampionRound(monthKey=coreChampionMonthKey()){
  const existing = getCoreRound(monthKey);
  await setDoc(doc(db,"coreChampionRounds",monthKey), {
    monthKey,
    status:"open",
    openedAt:serverTimestamp(),
    openedBy:state.session?.uid||"",
    resetAt: existing?.winnerUid ? serverTimestamp() : (existing?.resetAt || null),
    resetBy: existing?.winnerUid ? (state.session?.uid||"") : (existing?.resetBy || ""),
    nominations:[],
    nominationLocks:[],
    votes:[],
    updatedAt:serverTimestamp()
  });
  await loadCoreChampionRounds(); showToast(existing?.winnerUid ? "Month reset and voting reopened." : "Voting opened.");
}
async function closeCoreChampionRound(monthKey=coreChampionMonthKey()){
  await setDoc(doc(db,"coreChampionRounds",monthKey), { status:"closed", updatedAt:serverTimestamp() }, { merge:true });
  await loadCoreChampionRounds(); showToast("Voting closed.");
}
async function saveCoreChampionSettings(form){
  const type = form.scheduleType?.value || "manual";
  const settings = { ...(state.appSettings||{}), coreChampionScheduleType: type };
  if (type === "day") {
    settings.coreChampionScheduleDay = Math.max(1, Math.min(31, Number(form.scheduleDay?.value || 20)));
    delete settings.coreChampionScheduleWeekday;
    delete settings.coreChampionScheduleOrdinal;
  } else if (type === "weekday") {
    settings.coreChampionScheduleWeekday = form.scheduleWeekday?.value || "MO";
    settings.coreChampionScheduleOrdinal = form.scheduleOrdinal?.value || "last";
    delete settings.coreChampionScheduleDay;
  } else {
    delete settings.coreChampionScheduleDay;
    delete settings.coreChampionScheduleWeekday;
    delete settings.coreChampionScheduleOrdinal;
  }
  await setDoc(doc(db,"appSettings","main"), settings, { merge:true });
  state.appSettings = settings;
  showToast("Champion settings saved.");
  renderLeadership();
}
async function toggleCoreEligible(uid, checked){ await updateDoc(doc(db,"users",uid), { coreChampionIneligible: !checked, updatedAt:serverTimestamp() }); await refreshAdminData(); showToast("Eligibility updated."); renderLeadership(); }
async function setCoreWinner(monthKey, uid){ await setDoc(doc(db,"coreChampionRounds",monthKey), { winnerUid: uid, status:"closed", decidedAt:serverTimestamp(), decidedBy:state.session?.uid||"", updatedAt:serverTimestamp() }, { merge:true }); await loadCoreChampionRounds(); showToast("Winner saved."); renderLeadership(); }
async function submitCoreNomination(form){
  const monthKey = form.monthKey.value, candidateUid = form.candidateUid.value, reason = form.reason.value.trim();
  const round = getCoreRound(monthKey); if (!round || round.status !== "open") throw new Error("Voting is not open.");
  if (candidateUid === state.session?.uid) throw new Error("You cannot nominate yourself.");
  if (coreUserHasNominated(round)) throw new Error("You already nominated someone this month.");
  const createdAt = new Date().toISOString();
  const nomineeAlreadyExists = !!coreNominationFor(round, candidateUid);
  const nominations = nomineeAlreadyExists ? coreUniqueNominations(round) : [...coreUniqueNominations(round), { candidateUid, nominatorUid: state.session.uid, reason, createdAt }];
  const nominationLocks = [...(round.nominationLocks||[]), { candidateUid, nominatorUid: state.session.uid, reason, createdAt }];
  const votes = coreUserVotedFor(round, candidateUid) ? (round.votes||[]) : [...(round.votes||[]), { candidateUid, voterUid: state.session.uid, reason, createdAt, fromNomination:true }];
  await setDoc(doc(db,"coreChampionRounds",monthKey), { nominations, nominationLocks, votes, updatedAt:serverTimestamp() }, { merge:true }); await loadCoreChampionRounds(); state.modal={type:"coreVoteRound", monthKey}; showToast(nomineeAlreadyExists ? "This person was already nominated, so your nomination was added as your vote." : "Nomination locked in and counted as your vote."); renderCoreChampionTool();
}
async function submitCoreVote(form){
  const monthKey = form.monthKey.value, candidateUid = form.candidateUid.value, reason = form.reason.value.trim();
  const round = getCoreRound(monthKey); if (!round || round.status !== "open") throw new Error("Voting is not open.");
  if (coreUserVotedFor(round,candidateUid)) throw new Error("You already voted for this nominee.");
  const votes = [...(round.votes||[]), { candidateUid, voterUid: state.session.uid, reason, createdAt: new Date().toISOString() }];
  await setDoc(doc(db,"coreChampionRounds",monthKey), { votes, updatedAt:serverTimestamp() }, { merge:true }); await loadCoreChampionRounds(); state.modal=null; showToast("Vote saved."); renderCoreChampionTool();
}
function renderCoreChampionTool(){
  state.currentView="coreChampion";
  const months = Array.from({length:12},(_,i)=>`${new Date().getFullYear()}-${String(i+1).padStart(2,"0")}`);
  $app.innerHTML = pageShell(`<section class="card core-champion-hero"><p class="eyebrow">OVA CORE Counts</p><h2>Core Count Champion</h2><p class="helper">Celebrate team members who show kindness, teamwork, ownership, and commitment.</p></section>
  <section class="core-month-grid">${months.map(key=>{ const r=getCoreRound(key); const winner=getCoreUser(r?.winnerUid); const open=r?.status==="open"; const hasNominated=coreUserHasNominated(r); const manager=isCoreChampionManager(state.session); return `<div class="card core-month-card ${open?'is-open':''}"><h3>${coreChampionMonthLabel(key)}</h3>${winner?`<p class="core-winner">🏆 ${escapeHtml(getUserUsedName(winner))}</p>`:`<p class="helper">No winner yet.</p>`}${open?`<button type="button" data-core-open-vote="${key}">${hasNominated?'See Nominees!':'Nominate!'}</button>`:""}${r && manager?`<small>${(r.votes||[]).length} vote${(r.votes||[]).length===1?'':'s'}</small>`:""}</div>`}).join("")}</section>${state.modal?renderModal():""}${state.toast?`<div class="toast">${state.toast}</div>`:""}`);
}
function renderCoreVoteRoundModal(monthKey){
  const round = getCoreRound(monthKey);
  if (!round || round.status !== "open") return `<div class="modal-backdrop"><div class="modal card"><h2>Voting is closed</h2><button type="button" class="secondary" data-close-modal>Close</button></div></div>`;
  const nominations = coreUniqueNominations(round);
  const hasNominated = coreUserHasNominated(round);
  return `<div class="modal-backdrop"><div class="modal card wide-modal core-vote-modal"><div class="tool-heading-row"><div><p class="eyebrow">${escapeHtml(coreChampionMonthLabel(monthKey))}</p><h2>${hasNominated?'See Nominees':'Nominate Core Count Champion'}</h2></div><button type="button" class="secondary small" data-close-modal>Close</button></div>${!hasNominated?`<p class="helper">Choose one person to nominate. If they were already nominated, your nomination will be counted as your vote instead of creating a duplicate. You cannot nominate yourself.</p><div class="core-person-grid">${getCoreNominationChoices().map(u=>renderCorePersonButton(u,`data-core-nominate="${u.uid}" data-core-month="${monthKey}"`)).join("") || `<div class="empty">No eligible team members are available right now.</div>`}</div>`:`<p class="helper">Your nomination is in. You can support any additional nominee below.</p><div class="core-nominee-list core-nominee-grid">${nominations.map(n=>{ const u=getCoreUser(n.candidateUid); const voted=coreUserVotedFor(round,n.candidateUid); return `<div class="core-nominee-card core-nominee-person-card"><div class="core-nominee-head">${renderCorePersonFace(u)}<span><strong>${escapeHtml(getUserUsedName(u)||"Team Member")}</strong><small>${escapeHtml(u?.teamPosition||"")}</small></span></div>${voted?`<span class="pill">✓ Supported</span>`:`<button type="button" data-core-vote="${n.candidateUid}" data-core-month="${monthKey}">Support + Reason</button>`}</div>`}).join("") || `<div class="empty">No nominees yet.</div>`}</div>`}</div></div>`;
}
function renderCoreScheduleSettings(settings = {}) {
  const type = settings.coreChampionScheduleType || "manual";
  const ordinal = settings.coreChampionScheduleOrdinal || "last";
  const weekday = settings.coreChampionScheduleWeekday || "MO";
  const day = settings.coreChampionScheduleDay || 20;
  const option = (value, label, desc, inner = "") => `<label class="core-schedule-option ${type===value?'selected':''}"><span class="core-schedule-choice"><input type="radio" name="scheduleType" value="${value}" data-core-schedule-type ${type===value?'checked':''} /><span><strong>${label}</strong><small>${desc}</small></span></span>${type===value && inner ? `<div class="core-schedule-fields">${inner}</div>` : ""}</label>`;
  return `<div class="core-schedule-options">
    ${option("manual", "Manual only", "DOSO opens voting when ready.")}
    ${option("day", "Same date every month", "Example: the 20th of every month.", `<label>Day of month <input type="number" min="1" max="31" name="scheduleDay" value="${day}" /></label>`)}
    ${option("weekday", "Weekday pattern", "Example: last Monday of every month.", `<div class="grid two"><label>Which one <select name="scheduleOrdinal"><option value="first" ${ordinal==='first'?'selected':''}>First</option><option value="second" ${ordinal==='second'?'selected':''}>Second</option><option value="third" ${ordinal==='third'?'selected':''}>Third</option><option value="fourth" ${ordinal==='fourth'?'selected':''}>Fourth</option><option value="last" ${ordinal==='last'?'selected':''}>Last</option></select></label><label>Weekday <select name="scheduleWeekday"><option value="MO" ${weekday==='MO'?'selected':''}>Monday</option><option value="TU" ${weekday==='TU'?'selected':''}>Tuesday</option><option value="WE" ${weekday==='WE'?'selected':''}>Wednesday</option><option value="TH" ${weekday==='TH'?'selected':''}>Thursday</option><option value="FR" ${weekday==='FR'?'selected':''}>Friday</option></select></label></div>`)}
  </div>`;
}
function renderCoreChampionLeadershipTab(){
  const monthKey = coreChampionMonthKey(); const current=getCoreRound(monthKey); const settings=state.appSettings||{};
  return `<div class="core-admin-panel"><div class="card slim-card"><h3>Core Count Champion Controls</h3><p class="helper">Open monthly voting, choose winners, and mark people ineligible.</p></div>
  <form id="coreChampionSettingsForm" class="card core-settings-card"><h4>Auto preference</h4><p class="helper">Pick one auto-opening rule, or leave voting manual.</p>${renderCoreScheduleSettings(settings)}<div class="actions"><button>Save Preference</button><button type="button" data-core-open-round="${monthKey}">${current?.status==='open'?'Voting Open':current?.winnerUid?'Reset + Reopen Month':'Open This Month'}</button>${current?.status==='open'?`<button type="button" class="secondary" data-core-close-round="${monthKey}">Close Voting</button>`:""}</div></form>
  <div class="card"><h4>Current Month</h4>${current?renderCoreRoundAdmin(current):`<p class="helper">No round opened for ${coreChampionMonthLabel(monthKey)} yet.</p>`}</div>
  <div class="card"><h4>Eligibility</h4><p class="helper">Checked means eligible. Leaders and owners start unchecked by default; teachers and mentors start checked by default. Past winners stay locked out.</p><div class="name-grid admin-name-grid">${(state.users||[]).map(u=>{ const past=getCorePastWinnerIds().has(u.uid); const eligible=isCoreEffectivelyEligible(u); return `<label class="core-eligibility-row ${past?'is-disabled':''}"><input type="checkbox" data-core-eligible="${u.uid}" ${eligible?'checked':''} ${past?'disabled':''} /> <span><strong>${escapeHtml(getUserUsedName(u))}</strong><small>${escapeHtml(u.teamPosition||'No position')}${past?' · Past winner':''}</small></span></label>` }).join("")}</div></div></div>`;
}
function renderCoreRoundAdmin(round){
  const candidateIds = Array.from(new Set([...(round.nominations||[]).map(n=>n.candidateUid), ...(round.votes||[]).map(v=>v.candidateUid)]));
  return `<div class="core-nominee-list">${candidateIds.map(uid=>{ const u=getCoreUser(uid); const nom=coreNominationFor(round,uid); const votes=coreVotesFor(round,uid); return `<div class="core-nominee-card"><strong>${escapeHtml(getUserUsedName(u)||'Team Member')}</strong><p>${escapeHtml(nom?.reason||'')}</p><small>${votes.length} vote${votes.length===1?'':'s'}</small><button type="button" data-core-set-winner="${uid}" data-core-month="${round.monthKey}">${round.winnerUid===uid?'✓ Winner':'Set Winner'}</button></div>`}).join("") || `<div class="empty">No nominations yet.</div>`}</div>`;
}

function renderLeadership() {
  state.currentView = "leadership";
  if (!canUseLeadership(state.session)) {
    renderHome();
    return;
  }

  $app.innerHTML = pageShell(`
    <section class="card">
      <h2>Leadership Panel</h2>
      <p class="helper">School-level management tools for leaders.</p>

      <div class="nav-tabs">
        <button class="${state.leadershipTab === "users" ? "active" : ""}" data-leadership-tab="users">Users</button>
        <button class="${state.leadershipTab === "importantDates" ? "active" : ""}" data-leadership-tab="importantDates">Important Dates</button>
        <button class="${state.leadershipTab === "weeklyThemes" ? "active" : ""}" data-leadership-tab="weeklyThemes">Weekly Themes</button>
        <button class="${state.leadershipTab === "certificates" ? "active" : ""}" data-leadership-tab="certificates">Certificates</button>
        <button class="${state.leadershipTab === "shareableLinks" ? "active" : ""}" data-leadership-tab="shareableLinks">Shareable Links</button>
        <button class="${state.leadershipTab === "coreChampion" ? "active" : ""}" data-leadership-tab="coreChampion">Core Champion</button>
      </div>

      ${state.leadershipTab === "users" ? `
        <div class="actions" style="justify-content:flex-start;">
          <button data-modal="addUser">Add New Teacher/User</button>
        </div>
        <div class="name-grid admin-name-grid">
          ${state.users.length ? state.users.map(u => `
            <button class="name-button user-admin-button" data-edit-user="${u.uid}" type="button">
              ${u.profileImageData ? `<img src="${u.profileImageData}" alt="" />` : `<b>${(u.firstName || "?").slice(0,1)}</b>`}
              <span><strong>${u.firstName} ${u.lastName}</strong><small>${getUserUsedName(u)} · ${u.teamPosition || "No position"} · ${getPrimaryRole(u)}</small></span>
            </button>
          `).join("") : `<div class="empty grid-empty">No users yet.</div>`}
        </div>
      ` : ""}

      ${state.leadershipTab === "importantDates" ? renderImportantDatesLeadershipTab() : ""}
      ${state.leadershipTab === "weeklyThemes" ? renderWeeklyThemesLeadershipTab() : ""}
      ${state.leadershipTab === "certificates" ? renderCertificatesLeadershipTab() : ""}
      ${state.leadershipTab === "shareableLinks" ? renderShareableLinksLeadershipTab() : ""}
      ${state.leadershipTab === "coreChampion" ? renderCoreChampionLeadershipTab() : ""}
    </section>
    ${state.modal ? renderModal() : ""}
    ${renderPhotoContextMenu()}
    ${renderPhotoPrintDuplicatePrompt()}
    ${state.toast ? `<div class="toast">${state.toast}</div>` : ""}
  `);
}


function getShareablePositionsUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("share", "positions");
  if (state.selectedSchoolId) url.searchParams.set("school", state.selectedSchoolId);
  return url.toString();
}

function renderShareableLinksLeadershipTab() {
  const positionUrl = getShareablePositionsUrl();
  return `<div class="share-links-panel">
    <div class="card slim-card">
      <h3>Shareable Links</h3>
      <p class="helper">Links here are made for people outside of the tool. More link types can be added later for sign ups, feedback, and other forms.</p>
    </div>
    <div class="share-link-card card">
      <div><strong>Teacher Positions + What I Like Pages</strong><p class="helper">Parents can pick a classroom/position, choose a teacher, and see their What I Like page.</p></div>
      <input readonly value="${escapeHtml(positionUrl)}" onclick="this.select()" />
      <button type="button" data-copy-share-link="${escapeHtml(positionUrl)}">Copy Link</button>
    </div>
  </div>`;
}

async function renderPublicSharePage(view) {
  const params = new URLSearchParams(window.location.search);
  const schoolId = params.get("school") || state.selectedSchoolId || "";
  await loadSchools();
  await loadPositions();
  let users = [];
  try {
    const q = schoolId ? query(collection(db, "users"), where("schoolIds", "array-contains", schoolId)) : collection(db, "users");
    const snap = await getDocs(q);
    users = snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.active !== false).sort(byName);
  } catch (err) { users = []; }
  const school = state.schools.find(s => s.id === schoolId);
  state.publicShareUsers = users;
  const grouped = state.positions.map(pos => ({ position: pos.name, people: users.filter(u => u.teamPosition === pos.name) })).filter(g => g.people.length);
  const loose = users.filter(u => !u.teamPosition || !state.positions.some(p => p.name === u.teamPosition));
  if (loose.length) grouped.push({ position: "Other Team Members", people: loose });
  $app.innerHTML = `<main class="shell public-share-shell">
    <section class="card public-share-hero"><p class="eyebrow">Oak Village Academy</p><h1>Meet the OVA Team!</h1><p class="helper">${escapeHtml(school?.name || "Select a position to find a team member and see the things they like.")}</p></section>
    <section class="public-position-list">
      ${grouped.length ? grouped.map(g => `<details class="card public-position-card" data-public-position-card><summary><strong>${escapeHtml(g.position)}</strong><span>${g.people.length} team member${g.people.length === 1 ? "" : "s"}</span></summary><div class="public-teacher-list">${g.people.map(u => `<button type="button" class="public-teacher-card" data-public-person="${escapeHtml(u.uid)}">${u.profileImageData ? `<img src="${u.profileImageData}" alt="" />` : `<b>${escapeHtml((u.firstName || "?").slice(0,1))}</b>`}<span><strong>${escapeHtml(getUserUsedName(u))}</strong><small>${escapeHtml(u.teamPosition || "")}</small></span></button>`).join("")}</div></details>`).join("") : `<div class="card empty">No team information is available yet.</div>`}
    </section>
    ${state.modal ? renderModal() : ""}
  </main>`;
}

function importantDateMonthKey(item) {
  const d = new Date(`${item?.date || ""}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "undated";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function importantDateMonthLabel(key) {
  if (key === "undated") return "No Date";
  const [year, month] = key.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1, 12, 0, 0);
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function renderImportantDateEditForm(item) {
  const locked = !!item.autoBirthday;
  if (locked) return `<span class="helper">From profile</span>`;
  if (state.editingImportantDateId !== item.id) {
    return `<div class="row-actions"><button type="button" class="secondary small" data-edit-important-date="${item.id}">Edit</button><button type="button" class="secondary small" data-delete-important-date="${item.id}">Delete</button></div>`;
  }
  return `
    <form id="importantDateEditForm" class="important-date-edit-form" data-important-date-id="${item.id}">
      <label>Date<input type="date" name="date" value="${escapeHtml(item.date || "")}" required /></label>
      <label>End Date <small>(optional)</small><input type="date" name="endDate" value="${escapeHtml(item.endDate || "")}" /></label>
      <label>Display Date <small>(optional)</small><input name="dateLabel" value="${escapeHtml(item.dateLabel || "")}" placeholder="June 18th or Nov. 26–27" /></label>
      <label>Description<input name="description" value="${escapeHtml(item.description || "")}" required /></label>
      <label>Extra Info<textarea name="details" placeholder="Times, school-only notes, etc.">${escapeHtml(item.details || "")}</textarea></label>
      <label class="check-row"><input type="checkbox" name="includeInVillageVoice" ${item.includeInVillageVoice ? "checked" : ""} /> Include in Village Voice</label>
      <div class="row-actions"><button type="submit">Save</button><button type="button" class="secondary" data-cancel-important-date-edit>Cancel</button></div>
    </form>`;
}

function renderImportantDatesLeadershipTab() {
  const items = getAllImportantDateItems();
  const groups = items.reduce((acc, item) => {
    const key = importantDateMonthKey(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
  const sortedKeys = Object.keys(groups).sort();
  const currentKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  return `
    <div class="leadership-data-grid important-dates-layout">
      <form id="importantDateForm" class="mini-form card subtle-card important-date-add-card">
        <h3>Add Important Date</h3>
        <label>Date<input type="date" name="date" required /></label>
        <label>Description<input name="description" placeholder="Pajama Day, Closed for Holiday, Family Night..." required /></label>
        <label class="check-row"><input type="checkbox" name="includeInVillageVoice" /> Include in Village Voice</label>
        <button type="submit">Add Date</button>
        <div class="import-inside-card">
          <h4>Import Important Dates</h4>
          <p class="helper">Upload the converted family calendar JSON to import and save all dates automatically.</p>
          <label>Upload Family Calendar Import File<input type="file" accept="application/json,.json" data-important-dates-import /></label>
        </div>
      </form>
      <div class="card subtle-card important-date-groups-card">
        <h3>Saved Dates</h3>
        <p class="helper">Imported calendar dates can be edited here. Dates pulled from other parts of the tool, like profile birthdays, stay locked.</p>
        <div class="important-date-month-groups">
          ${sortedKeys.length ? sortedKeys.map(key => `
            <details class="important-date-month" ${key === currentKey ? "open" : ""}>
              <summary><strong>${escapeHtml(importantDateMonthLabel(key))}</strong><span>${groups[key].length} date${groups[key].length === 1 ? "" : "s"}</span></summary>
              <div class="simple-list">
                ${groups[key].map(item => `
                  <div class="simple-list-row important-date-row ${state.editingImportantDateId === item.id ? "editing" : ""}">
                    <span><strong>${escapeHtml(importantDateDisplayDate(item))}</strong><small>${escapeHtml(item.description || "")}${item.details ? ` · ${escapeHtml(item.details)}` : ""}${item.autoBirthday ? " · Auto birthday" : ""}${item.includeInVillageVoice ? " · Village Voice" : ""}${item.importedFrom ? ` · Imported` : ""}</small></span>
                    ${renderImportantDateEditForm(item)}
                  </div>
                `).join("")}
              </div>
            </details>
          `).join("") : `<div class="empty">No important dates added yet.</div>`}
        </div>
      </div>
    </div>`;
}



function renderLetterlandSpritePreview(sheet, rows, cols, tile, meta = getLetterlandSpriteMetaFromSettings()) {
  if (!sheet || !tile) return "";
  const r = Math.max(1, Number(rows) || 1);
  const c = Math.max(1, Number(cols) || 1);
  const crop = getLetterlandTileCrop(meta, r, c, tile);
  const ratio = Math.max(.2, Math.min(5, crop.sw / crop.sh));
  if (meta?.width && meta?.height) {
    return `<svg class="letterland-sprite-thumb" viewBox="${crop.sx} ${crop.sy} ${crop.sw} ${crop.sh}" style="aspect-ratio:${ratio};" aria-hidden="true"><image href="${escapeHtml(sheet)}" x="0" y="0" width="${crop.sheetW}" height="${crop.sheetH}" preserveAspectRatio="none"></image></svg>`;
  }
  const index = Math.max(0, Number(tile) - 1);
  const x = index % c;
  const y = Math.floor(index / c);
  return `<span class="letterland-sprite-thumb" style="background-image:url('${sheet}');background-size:${c * 100}% ${r * 100}%;background-position:${c === 1 ? 0 : (x * 100 / (c - 1))}% ${r === 1 ? 0 : (y * 100 / (r - 1))}%;"></span>`;
}

function renderLetterlandSpriteOptions(sheet, rows, cols, pickerWeek = "", meta = getLetterlandSpriteMetaFromSettings()) {
  const r = Math.max(1, Number(rows) || 1);
  const c = Math.max(1, Number(cols) || 1);
  const total = Math.min(160, r * c);
  if (!sheet) return `<p class="helper">Upload a sprite sheet first. Once loaded, click “Choose Letterland Image” on any week to pick a character visually.</p>`;
  return `<div class="letterland-sprite-palette ${pickerWeek ? "picker-mode" : ""}">${Array.from({length: total}, (_, idx) => {
    const tile = idx + 1;
    return `<button type="button" class="letterland-sprite-option" data-pick-letterland-tile="${tile}" ${pickerWeek ? `data-picker-week="${pickerWeek}"` : ""} title="Tile ${tile}">${renderLetterlandSpritePreview(sheet, r, c, tile, meta)}<small>${tile}</small></button>`;
  }).join("")}</div>`;
}

function renderLetterlandSpriteLoadedPanel(sheet, rows, cols) {
  const r = Math.max(1, Number(rows) || 1);
  const c = Math.max(1, Number(cols) || 1);
  if (!sheet) {
    return `<div class="letterland-sheet-status empty" data-letterland-sheet-status><strong>No sprite sheet loaded yet.</strong><span>Upload one sheet, then choose characters by clicking each week.</span></div>`;
  }
  return `<div class="letterland-sheet-status" data-letterland-sheet-status>
    <button type="button" class="letterland-sheet-thumb-button" data-open-letterland-sheet-preview title="Preview sprite sheet and cells"><img src="${sheet}" alt="Loaded Letterland sprite sheet" /></button>
    <div><strong>Sprite sheet loaded</strong><span>${c} columns × ${r} rows</span><small>${String(getLetterlandSpriteSheetRefFromForm()).startsWith(LETTERLAND_SPRITE_FIRESTORE_PREFIX) ? "Full-res sheet synced across computers." : (String(getLetterlandSpriteSheetRefFromForm()).startsWith(LETTERLAND_SPRITE_LOCAL_PREFIX) ? "Full-res sheet stored locally to avoid Firebase size limit." : "")}</small><button type="button" class="secondary small" data-open-letterland-sheet-preview>Preview / adjust cells</button> <button type="button" class="secondary small danger" data-remove-letterland-sheet>Remove sprite sheet</button></div>
  </div>`;
}

function getWeeklyThemesForm() {
  return document.querySelector("#weeklyThemesForm");
}

function getLetterlandSpriteSheetFromForm(form) {
  const ref = getLetterlandSpriteSheetRefFromForm(form);
  return resolveLetterlandSpriteSheet(ref) || window.__vvLetterlandSpriteSheet || "";
}

function setLetterlandSpriteSheetOnForm(form, value) {
  const realForm = form || getWeeklyThemesForm();
  const field = realForm?.querySelector('[name="letterlandSpriteSheet"]');
  const resolved = resolveLetterlandSpriteSheet(value) || value || "";
  const storedValue = value || "";
  if (field) field.value = storedValue || "";
  window.__vvLetterlandSpriteSheet = resolved || "";
}


function syncLetterlandSpriteSheetToState(form, clearWeekImages = false) {
  const realForm = form || getWeeklyThemesForm();
  const current = state.weeklyThemes.find(t => t.id === "current");
  if (!current || !realForm) return;
  current.letterlandSpriteSheet = getLetterlandSpriteSheetRefFromForm(realForm);
  current.letterlandSpriteRows = realForm.querySelector('[name="letterlandSpriteRows"]')?.value || current.letterlandSpriteRows || "5";
  current.letterlandSpriteCols = realForm.querySelector('[name="letterlandSpriteCols"]')?.value || current.letterlandSpriteCols || "6";
  current.letterlandSpriteWidth = realForm.querySelector('[name="letterlandSpriteWidth"]')?.value || current.letterlandSpriteWidth || "";
  current.letterlandSpriteHeight = realForm.querySelector('[name="letterlandSpriteHeight"]')?.value || current.letterlandSpriteHeight || "";
  current.letterlandSpriteMarginX = realForm.querySelector('[name="letterlandSpriteMarginX"]')?.value || current.letterlandSpriteMarginX || "0";
  current.letterlandSpriteMarginY = realForm.querySelector('[name="letterlandSpriteMarginY"]')?.value || current.letterlandSpriteMarginY || "0";
  current.letterlandSpriteGapX = realForm.querySelector('[name="letterlandSpriteGapX"]')?.value || current.letterlandSpriteGapX || "0";
  current.letterlandSpriteGapY = realForm.querySelector('[name="letterlandSpriteGapY"]')?.value || current.letterlandSpriteGapY || "0";
  current.letterlandSpriteCellW = realForm.querySelector('[name="letterlandSpriteCellW"]')?.value || current.letterlandSpriteCellW || "";
  current.letterlandSpriteCellH = realForm.querySelector('[name="letterlandSpriteCellH"]')?.value || current.letterlandSpriteCellH || "";
  if (clearWeekImages) {
    current.letterImages = {};
    current.letterlandSpriteTiles = {};
    state.weeklyThemesDraftImages = {};
    state.weeklyThemesDraftTiles = {};
    realForm.querySelectorAll('[name^="letterImage_"]').forEach(input => { input.value = ""; });
    realForm.querySelectorAll('[name^="letterlandSpriteTile_"]').forEach(input => { input.value = ""; });
  }
}

function clearLetterlandWeekImage(form, week) {
  const realForm = form || getWeeklyThemesForm();
  const weekKey = String(week || "");
  if (!weekKey) return;
  state.weeklyThemesDraftImages = state.weeklyThemesDraftImages || {};
  state.weeklyThemesDraftTiles = state.weeklyThemesDraftTiles || {};
  delete state.weeklyThemesDraftImages[weekKey];
  delete state.weeklyThemesDraftTiles[weekKey];
  const current = state.weeklyThemes.find(t => t.id === "current");
  if (current) {
    current.letterImages = { ...(current.letterImages || {}) };
    current.letterlandSpriteTiles = { ...(current.letterlandSpriteTiles || {}) };
    delete current.letterImages[weekKey];
    delete current.letterlandSpriteTiles[weekKey];
  }
  realForm?.querySelectorAll(`[name="letterImage_${weekKey}"]`).forEach(input => { input.value = ""; });
  realForm?.querySelectorAll(`[name="letterlandSpriteTile_${weekKey}"]`).forEach(input => { input.value = ""; });
}

function getLetterlandGridFromForm(form) {
  const realForm = form || getWeeklyThemesForm();
  const rows = realForm?.querySelector('[name="letterlandSpriteRows"]')?.value || 1;
  const cols = realForm?.querySelector('[name="letterlandSpriteCols"]')?.value || 1;
  return { rows, cols };
}

function refreshLetterlandSpriteSheetStatus(form) {
  const realForm = form || getWeeklyThemesForm();
  if (!realForm) return;
  const sheet = getLetterlandSpriteSheetFromForm(realForm);
  const { rows, cols } = getLetterlandGridFromForm(realForm);
  const status = realForm.querySelector("[data-letterland-sheet-status]");
  if (status) status.outerHTML = renderLetterlandSpriteLoadedPanel(sheet, rows, cols);
}

async function applyLetterlandSpriteTileToWeek(form, week, tile) {
  const realForm = form || getWeeklyThemesForm();
  const sheet = getLetterlandSpriteSheetFromForm(realForm);
  const { rows, cols } = getLetterlandGridFromForm(realForm);
  if (!week) return;
  if (!sheet) throw new Error("Upload a Letterland sprite sheet first.");
  const weekKey = String(week);
  const tileValue = String(tile || "");

  // v109: Do NOT crop/compress the tile into a tiny saved image.
  // Save the selected tile number only, then render the crop from the original sprite sheet.
  state.weeklyThemesDraftImages = state.weeklyThemesDraftImages || {};
  state.weeklyThemesDraftTiles = state.weeklyThemesDraftTiles || {};
  delete state.weeklyThemesDraftImages[weekKey];
  state.weeklyThemesDraftTiles[weekKey] = tileValue;

  const current = state.weeklyThemes.find(t => t.id === "current");
  if (current) {
    current.letterImages = { ...(current.letterImages || {}) };
    current.letterlandSpriteTiles = { ...(current.letterlandSpriteTiles || {}), [weekKey]: tileValue };
    delete current.letterImages[weekKey];
  }

  document.querySelectorAll(`#weeklyThemesForm [name="letterImage_${weekKey}"]`).forEach(input => { input.value = ""; });
  document.querySelectorAll(`#weeklyThemesForm [name="letterlandSpriteTile_${weekKey}"]`).forEach(input => { input.value = tileValue; });

  const card = document.querySelector(`#weeklyThemesForm [data-open-letterland-picker="${weekKey}"]`)?.closest(".weekly-theme-card");
  if (card) {
    const row = card.querySelector(".letterland-sprite-week-row");
    if (row) {
      row.querySelectorAll(".weekly-letter-preview,.letterland-sprite-thumb,.helper,[data-clear-letterland-image]").forEach(el => el.remove());
      const button = row.querySelector(`[data-open-letterland-picker="${weekKey}"]`);
      button?.insertAdjacentHTML("afterend", `${renderLetterlandSpritePreview(sheet, rows, cols, tileValue, getLetterlandSpriteMetaFromForm(realForm))}<button type="button" class="secondary small" data-clear-letterland-image="${weekKey}">Remove image</button>`);
    }
  }
  showWeeklyThemesFloatingSave(realForm);
}


function renderLetterlandSpriteForVoice(sheet, rows, cols, tile, altText = "Letterland image", meta = getLetterlandSpriteMetaFromSettings()) {
  if (!sheet || !tile) return "";
  const crop = getLetterlandTileCrop(meta, rows, cols, tile);
  const ratio = Math.max(.2, Math.min(5, crop.sw / crop.sh));
  if (meta?.width && meta?.height) {
    return `<svg class="voice-letterland-sprite" role="img" aria-label="${escapeHtml(altText)}" viewBox="${crop.sx} ${crop.sy} ${crop.sw} ${crop.sh}" style="aspect-ratio:${ratio};"><image href="${escapeHtml(sheet)}" x="0" y="0" width="${crop.sheetW}" height="${crop.sheetH}" preserveAspectRatio="none"></image></svg>`;
  }
  const r = Math.max(1, Number(rows) || 1);
  const c = Math.max(1, Number(cols) || 1);
  const index = Math.max(0, Number(tile) - 1);
  const x = index % c;
  const y = Math.floor(index / c);
  const posX = c === 1 ? 0 : (x * 100 / (c - 1));
  const posY = r === 1 ? 0 : (y * 100 / (r - 1));
  return `<span class="voice-letterland-sprite" role="img" aria-label="${escapeHtml(altText)}" style="background-image:url('${sheet}');background-size:${c * 100}% ${r * 100}%;background-position:${posX}% ${posY}%;"></span>`;
}

function cropLetterlandSpriteTile(sheetData, rows, cols, tile) {
  return new Promise((resolve, reject) => {
    if (!sheetData) return reject(new Error("Upload a Letterland sprite sheet first."));
    const img = new Image();
    img.onload = () => {
      const r = Math.max(1, Number(rows) || 1);
      const c = Math.max(1, Number(cols) || 1);
      const index = Math.max(0, Math.min((r * c) - 1, (Number(tile) || 1) - 1));
      const sx = Math.floor((index % c) * img.width / c);
      const sy = Math.floor(Math.floor(index / c) * img.height / r);
      const sw = Math.floor(img.width / c);
      const sh = Math.floor(img.height / r);
      const size = 360;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, size, size);
      const scale = Math.min(size / sw, size / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      ctx.drawImage(img, sx, sy, sw, sh, (size - dw) / 2, (size - dh) / 2, dw, dh);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("That sprite sheet could not be read."));
    img.src = sheetData;
  });
}

function renderWeeklyThemesLeadershipTab() {
  const settings = getWeeklyThemeSettings();
  const themes = settings.themes || {};
  const dateRanges = settings.dateRanges || {};
  const labels = settings.labels || {};
  const weekOfMonths = settings.weekOfMonths || {};
  const letterlands = settings.letterlands || {};
  const seedlingsValues = settings.seedlingsValues || {};
  const ideasEvents = settings.ideasEvents || {};
  const spriteSheetRef = settings.letterlandSpriteSheet || "";
  const spriteSheet = resolveLetterlandSpriteSheet(spriteSheetRef);
  const spriteRows = settings.letterlandSpriteRows || 5;
  const spriteCols = settings.letterlandSpriteCols || 6;
  const spriteTiles = settings.letterlandSpriteTiles || {};
  const spriteWidth = settings.letterlandSpriteWidth || "";
  const spriteHeight = settings.letterlandSpriteHeight || "";
  const spriteMarginX = settings.letterlandSpriteMarginX || "0";
  const spriteMarginY = settings.letterlandSpriteMarginY || "0";
  const spriteGapX = settings.letterlandSpriteGapX || "0";
  const spriteGapY = settings.letterlandSpriteGapY || "0";
  return `
    <form id="weeklyThemesForm" class="card subtle-card weekly-themes-form">
      <div class="section-head compact">
        <div><h3>Weekly Themes</h3><p class="helper">Upload the converted curriculum JSON to import and save the full year automatically, then add Letterland images as needed.</p></div>
        <button type="submit">Save Weekly Themes</button>
      </div>
      <div class="weekly-import-row">
        <label>Starting Date for Week 1<input type="date" name="startingDate" value="${escapeHtml(settings.startingDate || "")}" /></label>
        <label>Upload Curriculum Import File<input type="file" accept="application/json,.json" data-weekly-theme-import /></label>
      </div>
      <div class="letterland-sprite-card">
        <div>
          <h4>Letterland Sprite Sheet</h4>
          <p class="helper">Upload one sheet, confirm the row/column grid, then click “Choose Letterland Image” on each week.</p>
        </div>
        <input type="hidden" name="letterlandSpriteSheet" value="${escapeHtml(spriteSheetRef)}" />
        <div class="weekly-import-row compact">
          <label>Upload / Replace Sprite Sheet<input type="file" accept="image/*" data-letterland-sprite-sheet /></label>
          <label>Rows<input type="number" min="1" max="20" name="letterlandSpriteRows" value="${escapeHtml(spriteRows)}" data-letterland-grid-control /></label>
          <label>Columns<input type="number" min="1" max="20" name="letterlandSpriteCols" value="${escapeHtml(spriteCols)}" data-letterland-grid-control /></label>
          <input type="hidden" name="letterlandSpriteWidth" value="${escapeHtml(spriteWidth)}" />
          <input type="hidden" name="letterlandSpriteHeight" value="${escapeHtml(spriteHeight)}" />
          <input type="hidden" name="letterlandSpriteMarginX" value="${escapeHtml(spriteMarginX)}" />
          <input type="hidden" name="letterlandSpriteMarginY" value="${escapeHtml(spriteMarginY)}" />
          <input type="hidden" name="letterlandSpriteGapX" value="${escapeHtml(spriteGapX)}" />
          <input type="hidden" name="letterlandSpriteGapY" value="${escapeHtml(spriteGapY)}" />
          <input type="hidden" name="letterlandSpriteCellW" value="${escapeHtml(settings.letterlandSpriteCellW || "")}" />
          <input type="hidden" name="letterlandSpriteCellH" value="${escapeHtml(settings.letterlandSpriteCellH || "")}" />
        </div>
        <div class="letterland-bg-tools">
          <label>Remove background color<input type="color" value="#ffffff" data-letterland-bg-color /></label>
          <label>Tolerance<input type="range" min="0" max="90" value="28" data-letterland-bg-tolerance /></label>
          <button type="button" class="secondary small" data-letterland-remove-bg>Remove selected color</button>
        </div>
        ${renderLetterlandSpriteLoadedPanel(spriteSheet, spriteRows, spriteCols)}
      </div>
      <div class="weekly-theme-grid">
        ${Array.from({length:52},(_,idx)=>idx+1).map(week => {
          const date = addDaysToIsoDate(settings.startingDate || "", (week - 1) * 7);
          const letterImage = (state.weeklyThemesDraftImages || {})[String(week)] || (settings.letterImages || {})[String(week)] || "";
          const weekTitle = labels[String(week)] || `Week ${week}`;
          return `<div class="weekly-theme-card">
            <div class="weekly-theme-card-head"><strong>${escapeHtml(weekTitle)}</strong>${date ? `<small>${formatShortDate(date)}</small>` : ""}</div>
            <input type="hidden" name="label_${week}" value="${escapeHtml(labels[String(week)] || "")}" />
            <input type="hidden" name="weekOfMonth_${week}" value="${escapeHtml(weekOfMonths[String(week)] || "")}" />
            <label>Date range<input name="dateRange_${week}" value="${escapeHtml(dateRanges[String(week)] || "")}" placeholder="June 1st – June 5th" /></label>
            <label>Theme<input name="week_${week}" value="${escapeHtml(themes[String(week)] || "")}" placeholder="Theme for week ${week}" /></label>
            <label>Letterland<input name="letterland_${week}" value="${escapeHtml(letterlands[String(week)] || "")}" placeholder="Ww – Walter Walrus" /></label>
            <div class="letterland-sprite-week-row">
              <input type="hidden" name="letterlandSpriteTile_${week}" value="${escapeHtml((state.weeklyThemesDraftTiles || {})[String(week)] || spriteTiles[String(week)] || "")}" />
              <input type="hidden" name="letterImage_${week}" value="${letterImage}" />
              <button type="button" class="secondary small" data-open-letterland-picker="${week}">Choose Letterland Image</button>
              ${((state.weeklyThemesDraftTiles || {})[String(week)] || spriteTiles[String(week)]) ? renderLetterlandSpritePreview(spriteSheet, spriteRows, spriteCols, (state.weeklyThemesDraftTiles || {})[String(week)] || spriteTiles[String(week)] || "", { width: spriteWidth, height: spriteHeight, marginX: spriteMarginX, marginY: spriteMarginY, gapX: spriteGapX, gapY: spriteGapY }) : ""}
              ${letterImage ? `<img class="weekly-letter-preview" src="${letterImage}" alt="Letterland week ${week}" />` : (((state.weeklyThemesDraftTiles || {})[String(week)] || spriteTiles[String(week)]) ? "" : `<span class="helper">No image chosen yet.</span>`)}
              ${(letterImage || ((state.weeklyThemesDraftTiles || {})[String(week)] || spriteTiles[String(week)])) ? `<button type="button" class="secondary small" data-clear-letterland-image="${week}">Remove image</button>` : ""}
            </div>
            <label>Seedlings Value<input name="seedlingsValue_${week}" value="${escapeHtml(seedlingsValues[String(week)] || "")}" placeholder="Commitment" /></label>
            <label>Ideas / Events<textarea name="ideasEvents_${week}" rows="4" placeholder="Ideas, vocabulary, events...">${escapeHtml(ideasEvents[String(week)] || "")}</textarea></label>
          </div>`;
        }).join("")}
      </div>
    </form>`;
}

function renderCertificatesLeadershipTab() {
  return `
    <div class="leadership-data-grid">
      <form id="certificateForm" class="mini-form card subtle-card">
        <h3>Add Certificate</h3>
        <label>Certificate / Milestone Name<input name="name" placeholder="EDU 119, BSAC, SIDs, CPR..." required /></label>
        <button type="submit">Add Certificate</button>
      </form>
      <div class="card subtle-card">
        <h3>Saved Certificates</h3>
        <div class="simple-list">
          ${(state.certificates || []).length ? state.certificates.map(item => `
            <div class="simple-list-row">
              <span><strong>${escapeHtml(item.name || "")}</strong></span>
              <button type="button" class="secondary small" data-delete-certificate="${item.id}">Delete</button>
            </div>
          `).join("") : `<div class="empty">No certificates added yet.</div>`}
        </div>
      </div>
    </div>`;
}

function permissionToken(toolKey, permissionKey, roleId, kind, value = "") {
  return [toolKey, permissionKey, roleId, kind, encodeURIComponent(value)].join("||");
}

function parsePermissionToken(token) {
  const [toolKey, permissionKey, roleId, kind, value = ""] = String(token || "").split("||");
  return { toolKey, permissionKey, roleId, kind, value: decodeURIComponent(value) };
}

function permissionRoleOptions(toolKey, permissionKey) {
  return state.roles
    .filter(role => !getRolePermissionValue(role, toolKey, permissionKey).enabled)
    .map(role => `<option value="${role.id}">${role.name}</option>`)
    .join("");
}

function permissionPositionOptions(currentPositions) {
  const current = currentPositions || [];
  return state.positions
    .filter(position => !current.includes(position.name))
    .map(position => `<option value="${position.name}">${position.name}</option>`)
    .join("");
}

function renderPermissionsTab() {
  if (!state.roles.length) {
    return `<div class="empty">Add roles first, then come back here to assign tool permissions.</div>`;
  }

  return `
    <form id="permissionsForm" class="permissions-form">
      <div class="permission-editor permission-accordion-editor">
        <div class="permission-editor-head compact-permission-head">
          <div>
            <h3>Permissions</h3>
            <p class="helper">Open a tool, then add the roles or positions that should see each part.</p>
          </div>
          <button type="submit">Save Permissions</button>
        </div>

        ${PERMISSION_TOOLS.map(tool => {
          const isOpen = state.expandedPermissionToolKey === tool.key;
          return `
            <div class="permission-tool-accordion ${isOpen ? "open" : ""}">
              <button type="button" class="permission-tool-summary" data-permission-tool-toggle="${tool.key}">
                <span>
                  <strong>${tool.name}</strong>
                  <small>${tool.permissions.length} permission parts</small>
                </span>
                <b>${isOpen ? "−" : "+"}</b>
              </button>

              ${isOpen ? `
                <div class="permission-tool-body">
                  ${tool.permissions.map(permission => {
                    const allowedRoles = state.roles.filter(role => getRolePermissionValue(role, tool.key, permission.key).enabled);
                    const addRoleOptions = permissionRoleOptions(tool.key, permission.key);
                    return `
                      <div class="permission-part-row">
                        <div class="permission-part-title">
                          <strong>${permission.label}</strong>
                          <small>${permission.description}</small>
                        </div>

                        <div class="permission-chip-panel">
                          <div class="permission-chip-list">
                            ${allowedRoles.length ? allowedRoles.map(role => {
                              const current = getRolePermissionValue(role, tool.key, permission.key);
                              const positions = current.positions || ["__any__"];
                              const anyPosition = positions.includes("__any__") || !positions.length;
                              return `
                                <div class="permission-role-pill">
                                  <input type="checkbox" name="roleperm__${role.id}__${tool.key}__${permission.key}" checked hidden />
                                  <input type="checkbox" name="rolepos__${role.id}__${tool.key}__${permission.key}" value="__any__" ${anyPosition ? "checked" : ""} hidden />
                                  ${positions.filter(pos => pos !== "__any__").map(pos => `<input type="checkbox" name="rolepos__${role.id}__${tool.key}__${permission.key}" value="${pos}" checked hidden />`).join("")}

                                  <div class="role-pill-top">
                                    <span>${role.name}</span>
                                    <button type="button" class="mini-icon-button" data-remove-permission-role="${permissionToken(tool.key, permission.key, role.id, "role")}">×</button>
                                  </div>

                                  <div class="position-pill-row">
                                    ${anyPosition ? `<span class="position-pill any">Any position</span>` : positions.filter(pos => pos !== "__any__").map(pos => `
                                      <span class="position-pill">${pos}<button type="button" data-remove-permission-position="${permissionToken(tool.key, permission.key, role.id, "position", pos)}">×</button></span>
                                    `).join("")}
                                  </div>

                                  <div class="permission-inline-add">
                                    <select data-position-select="${permissionToken(tool.key, permission.key, role.id, "positionSelect")}">
                                      <option value="">Limit/add position...</option>
                                      <option value="__any__">Any position</option>
                                      ${permissionPositionOptions(anyPosition ? [] : positions)}
                                    </select>
                                    <button type="button" data-add-permission-position="${permissionToken(tool.key, permission.key, role.id, "position")}">Add</button>
                                  </div>
                                </div>
                              `;
                            }).join("") : `<span class="permission-empty-chip">No one assigned yet</span>`}
                          </div>

                          <div class="permission-inline-add add-role-line">
                            <select data-role-select="${tool.key}__${permission.key}" ${addRoleOptions ? "" : "disabled"}>
                              <option value="">Add role...</option>
                              ${addRoleOptions}
                            </select>
                            <button type="button" data-add-permission-role="${tool.key}__${permission.key}" ${addRoleOptions ? "" : "disabled"}>Add</button>
                          </div>
                        </div>
                      </div>
                    `;
                  }).join("")}
                </div>
              ` : ""}
            </div>
          `;
        }).join("")}
      </div>
    </form>
  `;
}

function renderToolsTab() {
  const tools = PERMISSION_TOOLS;
  return `<div class="tools-admin-wrap">
    ${tools.map(tool => {
      const isOpen = state.expandedPermissionToolKey === tool.key;
      const cfg = getToolConfig(tool.key);
      return `<div class="permission-tool-accordion ${isOpen ? "open" : ""}">
        <button type="button" class="permission-tool-summary" data-permission-tool-toggle="${tool.key}">
          <span><strong>${cfg.name || tool.name}</strong><small>${tool.permissions.length} permission parts · image + access settings</small></span><b>${isOpen ? "−" : "+"}</b>
        </button>
        ${isOpen ? `<form class="tool-config-form" data-tool-config-form="${tool.key}">
          <div class="tool-config-grid">
            <label>Tool Name<input name="toolName" value="${cfg.name || tool.name}" /></label>
            <label>Description<input name="toolDescription" value="${cfg.description || ""}" /></label>
            <label>Tool Image<input name="toolImage" type="file" accept="image/*" data-tool-image-input="${tool.key}" /></label>
            ${cfg.imageData ? `<img class="tool-config-preview" src="${cfg.imageData}" alt="Tool image" />` : `<div class="tool-config-preview empty">No image</div>`}
          </div>
          <button type="button" class="small" data-save-tool-config="${tool.key}">Save Tool Settings</button>
        </form>
        ${renderToolPermissionBody(tool)}` : ""}
      </div>`;
    }).join("")}
  </div>`;
}

function renderToolPermissionBody(tool) {
  if (!state.roles.length) return `<div class="empty">Add roles first, then come back here to assign tool permissions.</div>`;
  return `<form id="permissionsForm" class="permissions-form"><div class="permission-tool-body">${tool.permissions.map(permission => {
    const allowedRoles = state.roles.filter(role => getRolePermissionValue(role, tool.key, permission.key).enabled);
    const addRoleOptions = permissionRoleOptions(tool.key, permission.key);
    return `<div class="permission-part-row"><div class="permission-part-title"><strong>${permission.label}</strong><small>${permission.description}</small></div><div class="permission-chip-panel"><div class="permission-chip-list">${allowedRoles.length ? allowedRoles.map(role => {
      const current = getRolePermissionValue(role, tool.key, permission.key);
      const positions = current.positions || ["__any__"];
      const anyPosition = positions.includes("__any__") || !positions.length;
      return `<div class="permission-role-pill"><input type="checkbox" name="roleperm__${role.id}__${tool.key}__${permission.key}" checked hidden /><input type="checkbox" name="rolepos__${role.id}__${tool.key}__${permission.key}" value="__any__" ${anyPosition ? "checked" : ""} hidden />${positions.filter(pos => pos !== "__any__").map(pos => `<input type="checkbox" name="rolepos__${role.id}__${tool.key}__${permission.key}" value="${pos}" checked hidden />`).join("")}<div class="role-pill-top"><span>${role.name}</span><button type="button" class="mini-icon-button" data-remove-permission-role="${permissionToken(tool.key, permission.key, role.id, "role")}">×</button></div><div class="position-pill-row">${anyPosition ? `<span class="position-pill any">Any position</span>` : positions.filter(pos => pos !== "__any__").map(pos => `<span class="position-pill">${pos}<button type="button" data-remove-permission-position="${permissionToken(tool.key, permission.key, role.id, "position", pos)}">×</button></span>`).join("")}</div><div class="permission-inline-add"><select data-position-select="${permissionToken(tool.key, permission.key, role.id, "positionSelect")}"><option value="">Limit/add position...</option><option value="__any__">Any position</option>${permissionPositionOptions(anyPosition ? [] : positions)}</select><button type="button" data-add-permission-position="${permissionToken(tool.key, permission.key, role.id, "position")}">Add</button></div></div>`;
    }).join("") : `<span class="permission-empty-chip">No one assigned yet</span>`}</div><div class="permission-inline-add add-role-line"><select data-role-select="${tool.key}__${permission.key}" ${addRoleOptions ? "" : "disabled"}><option value="">Add role...</option>${addRoleOptions}</select><button type="button" data-add-permission-role="${tool.key}__${permission.key}" ${addRoleOptions ? "" : "disabled"}>Add</button></div></div></div>`;
  }).join("")}</div><div class="actions" style="justify-content:flex-end;"><button type="submit">Save Permissions</button></div></form>`;
}

async function saveToolConfig(toolKey) {
  const form = $app.querySelector(`[data-tool-config-form="${toolKey}"]`);
  const existing = getToolConfig(toolKey);
  await setDoc(doc(db, "appTools", toolKey), {
    key: toolKey,
    name: form?.toolName?.value?.trim() || PERMISSION_TOOLS.find(t=>t.key===toolKey)?.name || toolKey,
    description: form?.toolDescription?.value?.trim() || "",
    imageData: existing.imageData || "",
    updatedAt: serverTimestamp()
  }, { merge: true });
  await loadAppTools();
  showToast("Tool settings saved.");
}


function resizeToolImage(file, requestedMaxSize = 520, requestedQuality = 0.82, options = {}) {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file."));
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const maxSize = Math.max(64, Number(requestedMaxSize) || 520);
        const outputQuality = Math.max(0.35, Math.min(0.98, Number(requestedQuality) || 0.82));
        const maxBytes = Math.max(250000, Number(options.maxBytes) || 950000);
        const padToSquare = options.padToSquare !== false;
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const drawW = Math.max(1, Math.round(img.width * scale));
        const drawH = Math.max(1, Math.round(img.height * scale));
        canvas.width = padToSquare ? maxSize : drawW;
        canvas.height = padToSquare ? maxSize : drawH;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f7f2e8";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const drawX = padToSquare ? Math.round((maxSize - drawW) / 2) : 0;
        const drawY = padToSquare ? Math.round((maxSize - drawH) / 2) : 0;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        URL.revokeObjectURL(objectUrl);

        let quality = outputQuality;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        while (dataUrl.length > maxBytes * 0.9 && quality > 0.45) {
          quality -= 0.06;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        if (dataUrl.length > maxBytes) {
          reject(new Error("That image is still too large after compression. Please try a smaller/simpler image."));
          return;
        }
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("That image could not be read. Please try another image."));
    };
    img.src = objectUrl;
  });
}


function readRawImageData(file) {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("That image could not be read. Please try another image."));
    reader.readAsDataURL(file);
  });
}


function getImageDimensionsFromDataUrl(src) {
  return new Promise((resolve, reject) => {
    if (!src) return resolve({ width: 0, height: 0 });
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || img.width || 0, height: img.naturalHeight || img.height || 0 });
    img.onerror = () => reject(new Error("That image could not be measured."));
    img.src = src;
  });
}

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "").trim();
  if (clean.length !== 6) return null;
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return null;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function removeColorFromImageDataUrl(src, colorHex, tolerance = 28) {
  return new Promise((resolve, reject) => {
    const rgb = hexToRgb(colorHex);
    if (!src || !rgb) return reject(new Error("Choose a background color first."));
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const t = Math.max(0, Math.min(255, Number(tolerance) || 0));
        for (let i = 0; i < data.data.length; i += 4) {
          const dr = Math.abs(data.data[i] - rgb.r);
          const dg = Math.abs(data.data[i + 1] - rgb.g);
          const db = Math.abs(data.data[i + 2] - rgb.b);
          if (dr <= t && dg <= t && db <= t) data.data[i + 3] = 0;
        }
        ctx.putImageData(data, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (err) { reject(err); }
    };
    img.onerror = () => reject(new Error("That sprite sheet could not be processed."));
    img.src = src;
  });
}

function getLetterlandSpriteMetaFromSettings(settings = getWeeklyThemeSettings()) {
  return {
    width: Number(settings.letterlandSpriteWidth || 0) || 0,
    height: Number(settings.letterlandSpriteHeight || 0) || 0,
    marginX: Number(settings.letterlandSpriteMarginX || 0) || 0,
    marginY: Number(settings.letterlandSpriteMarginY || 0) || 0,
    gapX: Number(settings.letterlandSpriteGapX || 0) || 0,
    gapY: Number(settings.letterlandSpriteGapY || 0) || 0,
    cellW: Number(settings.letterlandSpriteCellW || 0) || 0,
    cellH: Number(settings.letterlandSpriteCellH || 0) || 0
  };
}

function getLetterlandSpriteMetaFromForm(form) {
  const realForm = form || getWeeklyThemesForm();
  const settings = getWeeklyThemeSettings();
  return {
    width: Number(realForm?.querySelector('[name="letterlandSpriteWidth"]')?.value || settings.letterlandSpriteWidth || 0) || 0,
    height: Number(realForm?.querySelector('[name="letterlandSpriteHeight"]')?.value || settings.letterlandSpriteHeight || 0) || 0,
    marginX: Number(realForm?.querySelector('[name="letterlandSpriteMarginX"]')?.value || settings.letterlandSpriteMarginX || 0) || 0,
    marginY: Number(realForm?.querySelector('[name="letterlandSpriteMarginY"]')?.value || settings.letterlandSpriteMarginY || 0) || 0,
    gapX: Number(realForm?.querySelector('[name="letterlandSpriteGapX"]')?.value || settings.letterlandSpriteGapX || 0) || 0,
    gapY: Number(realForm?.querySelector('[name="letterlandSpriteGapY"]')?.value || settings.letterlandSpriteGapY || 0) || 0,
    cellW: Number(realForm?.querySelector('[name="letterlandSpriteCellW"]')?.value || settings.letterlandSpriteCellW || 0) || 0,
    cellH: Number(realForm?.querySelector('[name="letterlandSpriteCellH"]')?.value || settings.letterlandSpriteCellH || 0) || 0
  };
}

function getLetterlandTileCrop(meta, rows, cols, tile) {
  const r = Math.max(1, Number(rows) || 1);
  const c = Math.max(1, Number(cols) || 1);
  const w = Math.max(1, Number(meta?.width || 0) || 1);
  const h = Math.max(1, Number(meta?.height || 0) || 1);
  const mx = Math.max(0, Number(meta?.marginX || 0) || 0);
  const my = Math.max(0, Number(meta?.marginY || 0) || 0);
  const gx = Math.max(0, Number(meta?.gapX || 0) || 0);
  const gy = Math.max(0, Number(meta?.gapY || 0) || 0);
  const usableW = Math.max(1, w - (mx * 2) - (gx * (c - 1)));
  const usableH = Math.max(1, h - (my * 2) - (gy * (r - 1)));
  const cellW = Math.max(1, Number(meta?.cellW || 0) || (usableW / c));
  const cellH = Math.max(1, Number(meta?.cellH || 0) || (usableH / r));
  const index = Math.max(0, Math.min((r * c) - 1, (Number(tile) || 1) - 1));
  const x = index % c;
  const y = Math.floor(index / c);
  return { sx: mx + x * (cellW + gx), sy: my + y * (cellH + gy), sw: cellW, sh: cellH, sheetW: w, sheetH: h };
}

function showWeeklyThemesFloatingSave(form) {
  document.querySelectorAll('[data-weekly-theme-floating-save]').forEach(el => el.remove());
  if (!form) return;
  document.body.insertAdjacentHTML('beforeend', `<div class="weekly-theme-floating-save" data-weekly-theme-floating-save><span>Weekly Theme image changed</span><button type="button" data-save-weekly-themes-now>Save Weekly Themes</button></div>`);
}

function cropProfileImageToSquare(src, zoom = 1, x = 50, y = 50) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 520;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f7f2e8";
        ctx.fillRect(0, 0, size, size);
        const baseScale = Math.max(size / img.width, size / img.height);
        const scale = baseScale * Math.max(1, Number(zoom) || 1);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const maxShiftX = Math.max(0, (drawW - size) / 2);
        const maxShiftY = Math.max(0, (drawH - size) / 2);
        const drawX = (size - drawW) / 2 - ((Number(x) || 50) - 50) / 50 * maxShiftX;
        const drawY = (size - drawH) / 2 - ((Number(y) || 50) - 50) / 50 * maxShiftY;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        let quality = 0.86;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        while (dataUrl.length > 850000 && quality > 0.45) {
          quality -= 0.08;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(dataUrl);
      } catch (err) { reject(err); }
    };
    img.onerror = () => reject(new Error("That image could not be cropped. Please try another image."));
    img.src = src;
  });
}

function getSeasonTheme(monthValue = state.villageVoiceSelectedMonth) {
  const month = Number(monthValue || 1);
  if ([12,1,2].includes(month)) return "winter";
  if ([3,4,5].includes(month)) return "spring";
  if ([6,7,8].includes(month)) return "summer";
  return "fall";
}

function villageVoiceBlockPresets() {
  return [
    { id: "message", label: "Opening Message", kind: "textarea", placeholder: "Write the opening family message here." },
    { id: "directorNote", label: "Director's Note", kind: "textarea", placeholder: "Add the director note here." },
    { id: "coreChampion", label: "CORE Counts Champion", kind: "champion", placeholder: "Add why this team member is being celebrated." },
    { id: "classroomSpotlight", label: "Classroom Spotlight", kind: "textarea", placeholder: "Add classroom or curriculum highlights here." },
    { id: "importantDates", label: "Important Dates", kind: "dates", placeholder: "Jan 8 - Pajama Day\nJan 15 - Closed for Holiday" }
  ];
}

function makeVillageVoiceBlockId() {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeVillageVoiceBlocks(draft = {}) {
  const legacy = {
    message: draft.message || "We are excited for another month of learning, growing, and celebrating around the Village.",
    directorNote: draft.directorNote || "Add the director note or monthly family message here.",
    coreChampion: draft.coreQuote || "This champion showed kindness, teamwork, and commitment to our CORE values.",
    classroomSpotlight: draft.classroomSpotlight || "Add classroom highlights, learning themes, or special moments here.",
    importantDates: draft.importantDates || ""
  };
  const presets = villageVoiceBlockPresets();
  const existing = Array.isArray(draft.blocks) ? draft.blocks : [];
  const presetBlocks = presets.map(preset => {
    const found = existing.find(b => b.id === preset.id) || {};
    return {
      ...preset,
      id: preset.id,
      kind: preset.kind || "textarea",
      title: found.title || preset.label,
      content: found.content ?? legacy[preset.id] ?? "",
      backgroundImageData: found.backgroundImageData || "",
      clipArtImageData: found.clipArtImageData || "",
      clipArtSize: found.clipArtSize || "small",
      clipArtPosition: found.clipArtPosition || "top-right",
      backgroundColor: found.backgroundColor || "#ffffff",
      textColor: found.textColor || "#1f2f2a",
      borderStyle: found.borderStyle || "none",
      borderColor: found.borderColor || "#2f6f63",
      columnMode: ["auto", "1", "2"].includes(String(found.columnMode || "auto")) ? String(found.columnMode || "auto") : "auto",
      functionType: found.functionType || ({ coreChampion: "coreChampion", monthlyThemes: "monthlyThemes", letterLand: "letterLand", saveTheDate: "saveTheDate" }[preset.id] || "manual"),
      textStyle: normalizeVillageVoiceTextStyle(found.textStyle)
    };
  });
  const customBlocks = existing
    .filter(b => b && b.id && !presets.some(p => p.id === b.id))
    .map(b => ({
      id: b.id,
      label: b.label || b.title || "New Block",
      kind: b.kind || "textarea",
      placeholder: b.placeholder || "Add content here.",
      title: b.title || b.label || "New Block",
      content: b.content || "",
      backgroundImageData: b.backgroundImageData || "",
      clipArtImageData: b.clipArtImageData || "",
      clipArtSize: b.clipArtSize || "small",
      clipArtPosition: b.clipArtPosition || "top-right",
      backgroundColor: b.backgroundColor || "#ffffff",
      textColor: b.textColor || "#1f2f2a",
      borderStyle: b.borderStyle || "none",
      borderColor: b.borderColor || "#2f6f63",
      columnMode: ["auto", "1", "2"].includes(String(b.columnMode || "auto")) ? String(b.columnMode || "auto") : "auto",
      functionType: b.functionType || "manual",
      textStyle: normalizeVillageVoiceTextStyle(b.textStyle)
    }));
  return [...presetBlocks, ...customBlocks];
}

function normalizeVillageVoiceLayout(draft = {}) {
  const blocks = normalizeVillageVoiceBlocks(draft);
  const ids = new Set(blocks.map(b => b.id));
  const defaultRows = [["coreChampion"], ["message"], ["directorNote"], ["classroomSpotlight"], ["importantDates"]];
  const rawRows = Array.isArray(draft.layout) ? draft.layout : [];
  const rawHasUsableBlock = rawRows.some(row => (Array.isArray(row) ? row : [row]).some(id => ids.has(id)));
  // IMPORTANT: do not throw away a valid saved layout just because it does not contain
  // older migration block ids. That was resetting every drag/drop back to one block per row.
  const rows = rawHasUsableBlock ? rawRows : defaultRows;
  const clean = [];
  const used = new Set();
  rows.forEach(row => {
    const source = (Array.isArray(row) ? row : [row]).slice(0, 2);
    const rowIds = source.map(id => id === VILLAGE_VOICE_EMPTY_SLOT ? VILLAGE_VOICE_EMPTY_SLOT : (ids.has(id) && !used.has(id) ? id : ""));
    const hasReal = rowIds.some(id => id && id !== VILLAGE_VOICE_EMPTY_SLOT);
    if (hasReal) {
      rowIds.forEach(id => { if (id && id !== VILLAGE_VOICE_EMPTY_SLOT) used.add(id); });
      clean.push(rowIds.length > 1 ? rowIds : rowIds.filter(Boolean));
    }
  });
  blocks.forEach(block => { if (!used.has(block.id)) clean.push([block.id]); });
  return clean;
}

function defaultVillageVoiceDraft() {
  const champion = getVillageVoiceChampionUsers()[0] || null;
  const base = {
    title: "The Village Voice",
    month: state.villageVoiceSelectedMonth,
    theme: getSeasonTheme(state.villageVoiceSelectedMonth),
    coreChampionUid: champion?.uid || "",
    headline: "Welcome Back, OVA Families!",
    editionLabel: `${new Date(2026, Number(state.villageVoiceSelectedMonth || 1)-1, 1).toLocaleString("en-US", { month: "long" })}, ${new Date().getFullYear()}`,
    footer: "Oak Village Academy",
    footerTagline: "Learning • Growing • Belonging",
    headerFontFamily: "serif",
    headerTitleSize: "large",
    headlineSize: "medium",
    footerFontFamily: "sans",
    footerSize: "medium"
  };
  base.blocks = normalizeVillageVoiceBlocks(base);
  base.layout = normalizeVillageVoiceLayout(base);
  return base;
}

function currentVillageVoiceDraft() {
  const draft = { ...defaultVillageVoiceDraft(), ...(state.villageVoiceDraft || {}) };
  draft.blocks = normalizeVillageVoiceBlocks(draft);
  const overrideRows = readLocalJson(VILLAGE_VOICE_LAYOUT_OVERRIDE_KEY, null);
  if (Array.isArray(overrideRows) && overrideRows.length) {
    draft.layout = overrideRows;
  }
  draft.layout = normalizeVillageVoiceLayout(draft);
  draft.theme = draft.theme || getSeasonTheme(draft.month);
  draft.editionLabel = draft.editionLabel || `${new Date(2026, Number(draft.month || 1)-1, 1).toLocaleString("en-US", { month: "long" })}, ${new Date().getFullYear()}`;
  draft.footerTagline = draft.footerTagline || "Learning • Growing • Belonging";
  draft.headerFontFamily = draft.headerFontFamily || "serif";
  draft.headerTitleSize = draft.headerTitleSize || "large";
  draft.headlineSize = draft.headlineSize || "medium";
  draft.footerFontFamily = draft.footerFontFamily || "sans";
  draft.footerSize = draft.footerSize || "medium";
  return draft;
}

function getVillageVoiceChampionUsers() {
  const seen = new Set();
  return [...(state.users || []), ...(state.roster || [])]
    .filter(u => u && u.uid && u.active !== false)
    .filter(u => {
      if (seen.has(u.uid)) return false;
      seen.add(u.uid);
      return true;
    })
    .sort(byName);
}

function villageVoiceChampionOptions(selectedUid) {
  const users = getVillageVoiceChampionUsers();
  return users.map(u => {
    const name = getUserUsedName(u) || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "Team Member";
    const details = [u.teamPosition || u.position || "", u.email || ""].filter(Boolean).join(" • ");
    return `<option value="${escapeHtml(u.uid)}" ${selectedUid === u.uid ? "selected" : ""}>${escapeHtml(name)}${details ? ` — ${escapeHtml(details)}` : ""}</option>`;
  }).join("");
}

function getVillageVoiceChampion(draft = currentVillageVoiceDraft()) {
  const monthKey = `${draft.year || new Date().getFullYear()}-${String(draft.month || state.villageVoiceSelectedMonth || "01").padStart(2,"0")}`;
  const round = getCoreRound(monthKey);
  const winner = round?.winnerUid ? getCoreUser(round.winnerUid) : null;
  if (winner) return winner;
  const users = getVillageVoiceChampionUsers();
  return users.find(u => u.uid === draft.coreChampionUid) || users[0] || null;
}

function splitVillageVoiceDates(text) {
  return String(text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function getVillageVoiceBlock(draft, blockId) {
  return (draft.blocks || []).find(b => b.id === blockId) || normalizeVillageVoiceBlocks(draft).find(b => b.id === blockId);
}

function getVillageVoiceFunctionLines(functionType, draft) {
  if (functionType === "importantDates") return renderImportantDatesLines(draft.month);
  if (functionType === "weeklyThemes") return renderWeeklyThemeLines(draft.month);
  if (functionType === "monthlyThemes") return renderVillageVoiceMonthlyThemeLines(draft.month);
  if (functionType === "saveTheDate") return renderVillageVoiceSaveDateLines(draft.month, !!draft.__activeBlockShowNextMonth);
  return [];
}

function defaultVillageVoiceTextStyle() {
  return { fontFamily: "serif", titleSize: "medium", bodySize: "medium", titleStyle: "uppercase", bodyStyle: "normal" };
}

function normalizeVillageVoiceTextStyle(style = {}) {
  return { ...defaultVillageVoiceTextStyle(), ...(style || {}) };
}

function villageVoiceFontCss(value) {
  const fonts = {
    serif: "Georgia, 'Times New Roman', serif",
    sans: "Arial, Helvetica, sans-serif",
    friendly: "'Trebuchet MS', Arial, sans-serif",
    formal: "'Palatino Linotype', Palatino, Georgia, serif",
    bold: "Impact, Arial Black, Arial, sans-serif"
  };
  return fonts[value] || fonts.serif;
}

function villageVoiceTitleSizeCss(value) {
  return ({ small: ".98rem", medium: "1.35rem", large: "1.75rem", xlarge: "2.15rem" })[value] || "1.35rem";
}

function villageVoiceBodySizeCss(value) {
  return ({ small: ".82rem", medium: ".96rem", large: "1.08rem", xlarge: "1.22rem" })[value] || ".96rem";
}

function villageVoiceStyleCss(value, target = "body") {
  if (value === "bold") return "font-weight:900;font-style:normal;text-transform:none;";
  if (value === "italic") return "font-weight:500;font-style:italic;text-transform:none;";
  if (value === "uppercase") return "font-weight:900;font-style:normal;text-transform:uppercase;";
  if (value === "soft") return "font-weight:500;font-style:normal;text-transform:none;letter-spacing:.01em;";
  return target === "title" ? "font-weight:900;font-style:normal;text-transform:none;" : "font-weight:500;font-style:normal;text-transform:none;";
}


function villageVoiceInlineTextStyle(style = {}, target = "body") {
  style = normalizeVillageVoiceTextStyle(style);
  const declarations = [
    `font-family:${villageVoiceFontCss(style.fontFamily)}`,
    `font-size:${target === "title" ? villageVoiceTitleSizeCss(style.titleSize) : villageVoiceBodySizeCss(style.bodySize)}`
  ];
  const extra = villageVoiceStyleCss(target === "title" ? style.titleStyle : style.bodyStyle, target).replace(/;$/,'');
  if (extra) declarations.push(extra);
  return ` style="${declarations.join(';')}"`;
}

function villageVoiceBlockStyleAttr(block = {}) {
  const style = normalizeVillageVoiceTextStyle(block.textStyle);
  const bgColor = block.backgroundColor || "#ffffff";
  const textColor = block.textColor || "#1f2f2a";
  const bgImage = block.backgroundImageData
    ? `linear-gradient(rgba(255,255,255,.76), rgba(255,255,255,.76)), url('${block.backgroundImageData}')`
    : "none";
  const borderStyle = block.borderStyle || "none";
  const borderColor = block.borderColor || "#2f6f63";
  const borderCss = ({ none: "0 solid transparent", solid: `3px solid ${borderColor}`, dashed: `3px dashed ${borderColor}`, dotted: `3px dotted ${borderColor}`, double: `5px double ${borderColor}`, leafy: `4px solid ${borderColor}` })[borderStyle] || "0 solid transparent";
  const parts = [
    `--voice-block-font:${villageVoiceFontCss(style.fontFamily)}`,
    `--voice-block-title-size:${villageVoiceTitleSizeCss(style.titleSize)}`,
    `--voice-block-body-size:${villageVoiceBodySizeCss(style.bodySize)}`,
    `--voice-block-bg:${bgColor}`,
    `--voice-block-bg-image:${bgImage}`,
    `--voice-block-color:${textColor}`,
    `--voice-block-border:${borderCss}`,
    `--voice-block-border-color:${borderColor}`,
    `background-color:${bgColor} !important`,
    `background-image:${bgImage} !important`,
    `color:${textColor} !important`,
    `background-size:cover !important`,
    `background-position:center !important`,
    `border:${borderCss} !important`
  ];
  return ` style="${parts.join(';')}"`;
}

function villageVoicePreviewStyleAttr(draft = {}) {
  const font = villageVoiceFontCss(draft.headerFontFamily || "serif");
  const footerFont = villageVoiceFontCss(draft.footerFontFamily || draft.headerFontFamily || "sans");
  const titleSize = ({ small: "3.2rem", medium: "4.2rem", large: "5.15rem", xlarge: "6rem" })[draft.headerTitleSize || "large"] || "5.15rem";
  const headlineSize = ({ small: ".86rem", medium: "1rem", large: "1.22rem", xlarge: "1.42rem" })[draft.headlineSize || "medium"] || "1rem";
  const footerSize = ({ small: ".78rem", medium: ".9rem", large: "1.05rem", xlarge: "1.2rem" })[draft.footerSize || "medium"] || ".9rem";
  return ` style="--voice-header-font:${font};--voice-header-title-size:${titleSize};--voice-headline-size:${headlineSize};--voice-footer-font:${footerFont};--voice-footer-size:${footerSize};"`;
}

function renderVillageVoiceFontControls(prefix, style = defaultVillageVoiceTextStyle()) {
  style = normalizeVillageVoiceTextStyle(style);
  return `
    <div class="voice-font-grid">
      <label>Font Type
        <select data-village-live data-${prefix}-font-family>
          ${[["serif","Classic Serif"],["sans","Clean Sans"],["friendly","Friendly"],["formal","Formal"],["bold","Bold Display"]].map(([v,l]) => `<option value="${v}" ${style.fontFamily === v ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </label>
      <label>Title Size
        <select data-village-live data-${prefix}-title-size>
          ${[["small","Small"],["medium","Medium"],["large","Large"],["xlarge","Extra Large"]].map(([v,l]) => `<option value="${v}" ${style.titleSize === v ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </label>
      <label>Content Size
        <select data-village-live data-${prefix}-body-size>
          ${[["small","Small"],["medium","Medium"],["large","Large"],["xlarge","Extra Large"]].map(([v,l]) => `<option value="${v}" ${style.bodySize === v ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </label>
      <label>Title Style
        <select data-village-live data-${prefix}-title-style>
          ${[["uppercase","Uppercase"],["normal","Normal"],["bold","Bold"],["italic","Italic"]].map(([v,l]) => `<option value="${v}" ${style.titleStyle === v ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </label>
      <label>Content Style
        <select data-village-live data-${prefix}-body-style>
          ${[["normal","Normal"],["bold","Bold"],["italic","Italic"],["soft","Soft"]].map(([v,l]) => `<option value="${v}" ${style.bodyStyle === v ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </label>
    </div>`;
}


function villageVoiceOvaColorPalette() {
  return [
    {
      group: "Leaf Greens",
      colors: [
        { name: "Deep Leaf", value: "#1f4d38" },
        { name: "OVA Green", value: "#2f7d45" },
        { name: "Watercolor Green", value: "#6dad5f" },
        { name: "Soft Leaf", value: "#8fca77" },
        { name: "Light Leaf", value: "#a8d88f" },
        { name: "Pale Leaf", value: "#d8efc8" }
      ]
    },
    {
      group: "Yellow / Cream",
      colors: [
        { name: "Yellow Leaf", value: "#d8e86d" },
        { name: "Soft Yellow", value: "#eef4a9" },
        { name: "Warm Cream", value: "#f6efd4" },
        { name: "Paper Cream", value: "#fbf7e8" }
      ]
    },
    {
      group: "Tree / Wood",
      colors: [
        { name: "Light Bark", value: "#f0c18e" },
        { name: "Tree Tan", value: "#d49a63" },
        { name: "Warm Brown", value: "#8b5b36" },
        { name: "Deep Bark", value: "#56371f" }
      ]
    },
    {
      group: "Logo Neutrals",
      colors: [
        { name: "White", value: "#ffffff" },
        { name: "Soft Gray", value: "#eef1ec" },
        { name: "Logo Charcoal", value: "#111512" },
        { name: "Almost Black", value: "#050706" }
      ]
    }
  ];
}

function renderVillageVoiceOvaColorSwatches(blockId) {
  return `<div class="ova-color-palette"><div class="ova-color-palette-title"><strong>OVA Background Colors</strong><small>Tap a swatch to set the block background.</small></div>${villageVoiceOvaColorPalette().map(group => `<div class="ova-color-group"><span>${escapeHtml(group.group)}</span><div class="ova-color-swatches">${group.colors.map(c => `<button type="button" class="ova-color-swatch" title="${escapeHtml(c.name)} ${c.value}" aria-label="Use ${escapeHtml(c.name)} as background" style="background:${c.value}" data-ova-block-color="${escapeHtml(blockId)}" data-ova-color="${c.value}"></button>`).join("")}</div></div>`).join("")}</div>`;
}

function renderVillageVoiceBackgroundPicker(block) {
  const id = escapeHtml(block.id);
  const color = escapeHtml(block.backgroundColor || "#ffffff");
  return `<div class="voice-bg-picker-wrap">
    <button type="button" class="secondary small voice-bg-open-btn" data-open-voice-bg-modal="${id}">Change Background</button>
    <span class="voice-bg-current-chip" style="background:${color}" title="Current background"></span>
    <input type="hidden" data-block-bg-color="${id}" value="${color}" />
  </div>`;
}

function renderVillageVoiceBgModal(block) {
  if (!block || state.villageVoiceBgPickerId !== block.id) return "";
  const id = escapeHtml(block.id);
  const color = escapeHtml(block.backgroundColor || "#ffffff");
  return `<div class="voice-bg-modal-backdrop" data-close-voice-bg-modal>
    <div class="voice-bg-modal" role="dialog" aria-modal="true" aria-label="Choose block background" data-stop-voice-bg-close>
      <div class="voice-bg-modal-head"><h3>Block Background</h3><button type="button" class="secondary small" data-close-voice-bg-modal>×</button></div>
      <p class="helper">Hover a color to preview it. Click to apply it.</p>
      ${renderVillageVoiceOvaColorSwatches(block.id)}
      <label class="voice-custom-color-row">Any Color<input type="color" data-voice-bg-modal-color="${id}" value="${color}" /></label>
      <div class="actions"><button type="button" class="secondary" data-close-voice-bg-modal>Cancel</button><button type="button" data-apply-voice-bg-color="${id}">Use This Color</button></div>
    </div>
  </div>`;
}


function renderVillageVoiceClipArt(block = {}) {
  if (!block.clipArtImageData) return "";
  const size = ["small", "medium", "large"].includes(block.clipArtSize) ? block.clipArtSize : "small";
  const pos = ["top-left", "top-right", "bottom-left", "bottom-right", "center"].includes(block.clipArtPosition) ? block.clipArtPosition : "top-right";
  return `<img class="voice-block-clip-art clip-${size} clip-${pos}" src="${block.clipArtImageData}" alt="Block clip art" />`;
}

function renderVillageVoiceBlockPreview(block, draft, rowIndex = 0, colIndex = 0) {
  if (!block) return "";
  const title = escapeHtml(block.title || block.label || "New Block");
  const blockStyle = villageVoiceBlockStyleAttr(block);
  const titleTextStyle = villageVoiceInlineTextStyle(block.textStyle, "title");
  const bodyTextStyle = villageVoiceInlineTextStyle(block.textStyle, "body");
  const functionType = block.functionType || (block.kind === "champion" ? "coreChampion" : "manual");
  const isSelected = state.expandedVillageVoiceEditorId === block.id || (state.villageVoiceRearrangeMode && state.villageVoicePickedBlock === block.id);
  const normalizedStyle = normalizeVillageVoiceTextStyle(block.textStyle);
  const commonClass = `voice-block voice-kind-${escapeHtml(block.kind || "textarea")} voice-title-size-${escapeHtml(normalizedStyle.titleSize)} voice-body-size-${escapeHtml(normalizedStyle.bodySize)} ${functionType === "coreChampion" ? "voice-champion-block" : ""} ${isSelected ? "voice-preview-selected" : ""}`;
  const clipArt = renderVillageVoiceClipArt(block);
  if (functionType === "coreChampion") {
    const champion = getVillageVoiceChampion(draft);
    return `
      <section class="${commonClass}" data-preview-block="${block.id}" draggable="false" data-voice-row="${rowIndex}" data-voice-col="${colIndex}"${blockStyle}>
        <div class="voice-ribbon">${title}</div>
        <div class="voice-champion-inner">
          <div class="voice-photo-ring"><div class="voice-photo">${champion?.profileImageData ? `<img src="${champion.profileImageData}" alt="${escapeHtml(getUserUsedName(champion))}" />` : `<span>No Photo</span>`}</div></div>
          <div class="voice-champion-copy">
            <h2${titleTextStyle}>${champion ? escapeHtml(getUserUsedName(champion)) : "Choose a staff member"}</h2>
            <p${bodyTextStyle}>${escapeHtml(block.content || block.placeholder || "").replace(/\n/g,"<br>")}</p>
          </div>
        </div>
        ${clipArt}
      ${clipArt}</section>`;
  }
  const functionLines = functionType === "saveTheDate"
    ? renderVillageVoiceSaveDateLines(draft.month, !!block.showNextMonthDates)
    : getVillageVoiceFunctionLines(functionType, draft);
  if (functionType === "letterLand") {
    const items = getVillageVoiceLetterLandItems(draft.month);
    return `<section class="${commonClass} voice-letterland-block" data-preview-block="${block.id}" draggable="false" data-voice-row="${rowIndex}" data-voice-col="${colIndex}"${blockStyle}><h2${titleTextStyle}>${title}</h2>${items.length ? `<div class="voice-letterland-grid">${items.map(item => {
      const visual = item.spriteTile && item.spriteSheet
        ? renderLetterlandSpriteForVoice(item.spriteSheet, item.spriteRows, item.spriteCols, item.spriteTile, `Letterland week ${item.week}`, { width: item.spriteWidth, height: item.spriteHeight, marginX: item.spriteMarginX, marginY: item.spriteMarginY, gapX: item.spriteGapX, gapY: item.spriteGapY, cellW: item.spriteCellW, cellH: item.spriteCellH })
        : item.image
          ? `<img src="${item.image}" alt="Letterland week ${item.week}" />`
          : `<div class="letterland-placeholder">${escapeHtml(item.letterland || "Letterland")}</div>`;
      return `<figure>${visual}<figcaption>Week ${escapeHtml(item.weekOfMonth || item.week)}${item.letterland ? `<br><small>${escapeHtml(item.letterland)}</small>` : ""}</figcaption></figure>`;
    }).join("")}</div>` : `<p>Add Letterland details in Leadership → Weekly Themes.</p>`}</section>`;
  }
  if (["importantDates", "weeklyThemes", "monthlyThemes", "saveTheDate"].includes(functionType)) {
    const emptyText = functionType === "saveTheDate" ? "No Village Voice dates marked for this month yet." : functionType === "monthlyThemes" ? "No monthly themes found for this month yet." : functionType === "importantDates" ? "No important dates found for this month yet." : "No weekly themes found for this month yet.";
    return `<section class="${commonClass} voice-dates-block ${functionType === "saveTheDate" ? "voice-save-date-block" : ""} ${functionType === "monthlyThemes" ? "voice-monthly-themes-block" : ""}" data-preview-block="${block.id}" draggable="false" data-voice-row="${rowIndex}" data-voice-col="${colIndex}"${blockStyle}><h2${titleTextStyle}>${title}</h2>${functionLines.length ? `<ul${bodyTextStyle}>${functionLines.map(d => `<li${bodyTextStyle}>${escapeHtml(d)}</li>`).join("")}</ul>` : `<p${bodyTextStyle}>${emptyText}</p>`}${clipArt}</section>`;
  }
  if (block.kind === "dates") {
    const dates = splitVillageVoiceDates(block.content);
    return `<section class="${commonClass} voice-dates-block" data-preview-block="${block.id}" draggable="false" data-voice-row="${rowIndex}" data-voice-col="${colIndex}"${blockStyle}><h2${titleTextStyle}>${title}</h2>${dates.length ? `<ul${bodyTextStyle}>${dates.map(d => `<li${bodyTextStyle}>${escapeHtml(d)}</li>`).join("")}</ul>` : `<p${bodyTextStyle}>Add dates and reminders here.</p>`}${clipArt}</section>`;
  }
  return `<section class="${commonClass}" data-preview-block="${block.id}" draggable="false" data-voice-row="${rowIndex}" data-voice-col="${colIndex}"${blockStyle}><h2${titleTextStyle}>${title}</h2><p${bodyTextStyle}>${escapeHtml(block.content || block.placeholder || "").replace(/\n/g,"<br>")}</p>${clipArt}</section>`;
}


function renderVillageVoicePreviewRow(row, draft, rowIndex) {
  const raw = (Array.isArray(row) ? row : [row]).slice(0, 2);
  const realCount = raw.filter(id => id && id !== VILLAGE_VOICE_EMPTY_SLOT).length;
  const hasTwo = raw.length > 1 || realCount > 1;
  const blockHtml = (hasTwo ? [raw[0] || VILLAGE_VOICE_EMPTY_SLOT, raw[1] || VILLAGE_VOICE_EMPTY_SLOT] : raw).map((id, colIndex) => {
    const realId = id && id !== VILLAGE_VOICE_EMPTY_SLOT ? id : "";
    const emptyFor = realId ? "" : (raw.find(x => x && x !== VILLAGE_VOICE_EMPTY_SLOT) || "");
    return `<div class="voice-layout-slot ${hasTwo ? "" : "slot-full"} ${realId ? "" : "voice-empty-side-slot voice-open-column-slot"}" data-voice-drop-slot data-voice-row="${rowIndex}" data-voice-col="${colIndex}" ${realId ? "" : `data-empty-column-row="${rowIndex}" data-empty-column-col="${colIndex}" data-empty-side-for="${escapeHtml(emptyFor)}"`}>
      ${realId ? renderVillageVoiceBlockPreview(getVillageVoiceBlock(draft, realId), draft, rowIndex, colIndex) : `<span>Drop here</span>`}
    </div>`;
  }).join("");
  const emptySlot = !hasTwo ? `<div class="voice-layout-slot voice-empty-side-slot" data-voice-drop-slot data-voice-row="${rowIndex}" data-voice-col="1" data-empty-side-for="${escapeHtml(raw[0] || "")}"><span>Drop here to make 2 columns</span></div>` : "";
  return `<div class="voice-preview-row ${hasTwo ? "two-col" : "full-col"}" data-voice-preview-row="${rowIndex}">${blockHtml}${emptySlot}</div>`;
}


function renderVillageVoicePreviewHtml(draft = currentVillageVoiceDraft()) {
  const theme = draft.theme || getSeasonTheme(draft.month);
  const monthName = new Date(2026, Number(draft.month || 1)-1, 1).toLocaleString("en-US", { month: "long" });
  const rows = normalizeVillageVoiceLayout(draft);
  return `
    <div class="voice-flyer-preview theme-${theme}"${villageVoicePreviewStyleAttr(draft)}>
      <div class="voice-snow voice-snow-a">✦</div><div class="voice-snow voice-snow-b">❄</div><div class="voice-snow voice-snow-c">✦</div>
      <header class="voice-cover-header ${state.expandedVillageVoiceEditorId === "flyerHeader" ? "voice-preview-selected" : ""}" data-preview-special="flyerHeader">
        ${state.appSettings?.ovaLogoData ? `<img class="voice-logo-mark voice-logo-img" src="${state.appSettings.ovaLogoData}" alt="OVA logo" />` : `<div class="voice-logo-mark">OVA</div>`}
        <div class="voice-title-stack"><span>${escapeHtml(`${monthName}, ${draft.year || new Date().getFullYear()}`)}</span><h1>${escapeHtml(draft.title || "The Village Voice")}</h1></div>
      </header>
      <main class="voice-dynamic-grid">
        ${renderVillageVoicePreviewRowsMasonry(rows, draft)}
      </main>
      <footer class="voice-footer ${state.expandedVillageVoiceEditorId === "flyerFooter" ? "voice-preview-selected" : ""}" data-preview-special="flyerFooter"><span>${escapeHtml(getVillageVoiceFooterLocations())}</span></footer>
    </div>`;
}


function getVillageVoiceFooterLocations() {
  const activeSchools = (state.schools || []).filter(s => s && s.active !== false);
  const lines = activeSchools.map(s => {
    const name = (s.name || s.code || "School").trim();
    const address = (s.address || "").trim();
    return address ? `${name}: ${address}` : name;
  }).filter(Boolean);
  return lines.length ? lines.join("  •  ") : "Oak Village Academy";
}

function renderVillageVoiceTopBar(draft) {
  const canArrange = hasToolPermission(state.session, "villageVoice", "arrangeFlyer") || hasFullDevAccess(state.session);
  return `
    <div class="voice-top-settings-bar rearrange-on voice-natural-editing">
      <label>Month
        <select name="month" data-village-live data-village-month>
          ${Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0")).map(m => `<option value="${m}" ${draft.month === m ? "selected" : ""}>${new Date(2026, Number(m)-1, 1).toLocaleString("en-US", { month: "long" })}</option>`).join("")}
        </select>
      </label>
      <label>Year<input name="year" data-village-live value="${escapeHtml(draft.year || new Date().getFullYear())}" /></label>
      <input type="hidden" name="theme" value="${escapeHtml(draft.theme || getSeasonTheme(draft.month))}" />
      <div class="voice-top-title-lock"><strong>The Village Voice</strong><span>Footer uses System Admin school locations</span></div>
      <input type="hidden" name="title" value="${escapeHtml(draft.title || "The Village Voice")}" />
      <input type="hidden" name="headline" value="" />
      <input type="hidden" name="footer" value="${escapeHtml(getVillageVoiceFooterLocations())}" />
      <input type="hidden" name="footerTagline" value="" />
    </div>`;
}

function renderVillageVoiceSelectedStyleToolbar(draft) {
  return "";
}

function renderVillageVoiceSelectedBlockEditor(draft) {
  const id = state.expandedVillageVoiceEditorId;
  if (id === "flyerHeader") {
    return `<div class="voice-left-block-editor" data-left-block-editor="flyerHeader">
      <div class="voice-left-block-editor-head"><div><h3>Edit Header Banner</h3><p class="helper">Top banner text and sizing.</p></div><button type="button" class="secondary small" data-close-voice-inline>×</button></div>
      <div class="voice-tab-panel">
        <label>Month<select name="month" data-village-live data-village-month>${Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0")).map(m => `<option value="${m}" ${draft.month === m ? "selected" : ""}>${new Date(2026, Number(m)-1, 1).toLocaleString("en-US", { month: "long" })}</option>`).join("")}</select></label>
        <label>Year<input name="year" data-village-live value="${escapeHtml(draft.year || new Date().getFullYear())}" /></label>
        <label>Banner Title<input name="title" data-village-live value="${escapeHtml(draft.title || "The Village Voice")}" /></label>
        <label>Header Font<select name="headerFontFamily" data-village-live>${[["serif","Classic Serif"],["sans","Clean Sans"],["friendly","Friendly"],["formal","Formal"],["bold","Bold Display"]].map(([v,l]) => `<option value="${v}" ${draft.headerFontFamily === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label>Title Size<select name="headerTitleSize" data-village-live>${[["small","Small"],["medium","Medium"],["large","Large"],["xlarge","Extra Large"]].map(([v,l]) => `<option value="${v}" ${draft.headerTitleSize === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
    </div>`;
  }
  if (id === "flyerFooter") {
    return `<div class="voice-left-block-editor" data-left-block-editor="flyerFooter"><div class="voice-left-block-editor-head"><div><h3>Edit Footer Banner</h3><p class="helper">Footer uses System Admin school locations.</p></div><button type="button" class="secondary small" data-close-voice-inline>×</button></div><label>Footer Font<select name="footerFontFamily" data-village-live>${[["serif","Classic Serif"],["sans","Clean Sans"],["friendly","Friendly"],["formal","Formal"],["bold","Bold Display"]].map(([v,l]) => `<option value="${v}" ${draft.footerFontFamily === v ? "selected" : ""}>${l}</option>`).join("")}</select></label><label>Footer Size<select name="footerSize" data-village-live>${[["small","Small"],["medium","Medium"],["large","Large"],["xlarge","Extra Large"]].map(([v,l]) => `<option value="${v}" ${draft.footerSize === v ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>`;
  }
  const block = getVillageVoiceBlock(draft, id);
  if (!block) return "";
  const activeTab = state.villageVoiceSelectedBlockTab === "style" ? "style" : "content";
  const isChampion = (block.functionType || (block.kind === "champion" ? "coreChampion" : "manual")) === "coreChampion";
  const hiddenStyleFields = `
    <input type="hidden" data-block-bg-color="${block.id}" value="${escapeHtml(block.backgroundColor || "#ffffff")}" />
    <input type="hidden" data-block-text-color="${block.id}" value="${escapeHtml(block.textColor || "#1f2f2a")}" />
    <input type="hidden" data-block-bg-data="${block.id}" value="${block.backgroundImageData || ""}" />
    <input type="hidden" data-block-border-style="${block.id}" value="${escapeHtml(block.borderStyle || "none")}" />
    <input type="hidden" data-block-border-color="${block.id}" value="${escapeHtml(block.borderColor || "#2f6f63")}" />
    <input type="hidden" data-block-clip-data="${block.id}" value="${block.clipArtImageData || ""}" />
    <input type="hidden" data-block-clip-size="${block.id}" value="${escapeHtml(block.clipArtSize || "small")}" />
    <input type="hidden" data-block-clip-position="${block.id}" value="${escapeHtml(block.clipArtPosition || "top-right")}" />`;
  const hiddenContentFields = `
    <input type="hidden" data-block-title="${block.id}" value="${escapeHtml(block.title || block.label || "New Block")}" />
    <input type="hidden" data-block-content="${block.id}" value="${escapeHtml(block.content || "")}" />
    <input type="hidden" data-block-function="${block.id}" value="${escapeHtml(block.functionType || "manual")}" />
    <input type="hidden" data-block-column-mode="${block.id}" value="${escapeHtml(block.columnMode || "auto")}" />
    <input type="hidden" data-block-show-next-month="${block.id}" value="${block.showNextMonthDates ? "1" : ""}" />`;
  return `
    <div class="voice-left-block-editor" data-left-block-editor="${block.id}">
      <div class="voice-left-block-editor-head">
        <div><h3>Edit Block</h3><p class="helper">Editing: ${escapeHtml(block.title || block.label || "Block")}</p></div>
        <button type="button" class="secondary small" data-close-voice-inline title="Close editor">×</button>
      </div>
      <div class="voice-editor-tabs" role="tablist" aria-label="Selected block options">
        <button type="button" class="${activeTab === "content" ? "active" : ""}" data-voice-block-tab="content">Content Options</button>
        <button type="button" class="${activeTab === "style" ? "active" : ""}" data-voice-block-tab="style">Background / Text</button>
      </div>
      ${activeTab === "content" ? `
        <div class="voice-tab-panel">
          <label>Block Title<input class="voice-block-title-input" data-village-live data-block-title="${block.id}" value="${escapeHtml(block.title || block.label || "New Block")}" /></label>
          <label>Function
            <select data-village-live data-block-function="${block.id}">
              <option value="manual" ${(block.functionType || "manual") === "manual" ? "selected" : ""}>Manual content</option>
              <option value="coreChampion" ${(block.functionType || "") === "coreChampion" ? "selected" : ""}>CORE Counts person picker</option>
              <option value="saveTheDate" ${(block.functionType || "") === "saveTheDate" ? "selected" : ""}>Save the Date</option>
              <option value="monthlyThemes" ${(block.functionType || "") === "monthlyThemes" ? "selected" : ""}>Monthly Themes</option>
              <option value="letterLand" ${(block.functionType || "") === "letterLand" ? "selected" : ""}>Letter Land images</option>
              <option value="importantDates" ${(block.functionType || "") === "importantDates" ? "selected" : ""}>Pull Important Dates for selected month</option>
              <option value="weeklyThemes" ${(block.functionType || "") === "weeklyThemes" ? "selected" : ""}>Pull Weekly Themes for selected month</option>
            </select>
          </label>
          <label>Column Lock
            <select data-village-live data-block-column-mode="${block.id}">
              ${[["auto","Auto"],["1","Stay 1 Column / Full Width"],["2","Stay in 2 Columns"]].map(([v,l]) => `<option value="${v}" ${(block.columnMode || "auto") === v ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </label>
          ${(block.functionType || "manual") === "saveTheDate" ? `<label class="voice-check-row"><input type="checkbox" data-village-live data-block-show-next-month="${block.id}" ${block.showNextMonthDates ? "checked" : ""} /> Show next month&apos;s dates also</label>` : `<input type="hidden" data-block-show-next-month="${block.id}" value="${block.showNextMonthDates ? "1" : ""}" />`}
          ${isChampion ? `<label>CORE Counts Champion
            <select name="coreChampionUid" data-village-live data-village-champion>
              <option value="">Choose a team member...</option>
              ${villageVoiceChampionOptions(currentVillageVoiceDraft().coreChampionUid)}
            </select>
          </label>` : ""}
          <label>${block.kind === "dates" ? "Dates / Lines" : "Content"}
            <textarea data-village-live data-block-content="${block.id}" rows="${block.kind === "dates" ? 6 : 5}" placeholder="${escapeHtml(block.placeholder || "")}">${escapeHtml(block.content || "")}</textarea>
          </label>
          <div class="voice-inline-style-grid voice-clipart-grid">
            <label>Clip Art / Small Image<input type="file" accept="image/*" data-village-block-clip="${block.id}" /></label>
            <label>Clip Art Size
              <select data-village-live data-block-clip-size="${block.id}">
                ${[["small","Small"],["medium","Medium"],["large","Large"]].map(([v,l]) => `<option value="${v}" ${(block.clipArtSize || "small") === v ? "selected" : ""}>${l}</option>`).join("")}
              </select>
            </label>
            <label>Clip Art Position
              <select data-village-live data-block-clip-position="${block.id}">
                ${[["top-right","Top Right"],["top-left","Top Left"],["bottom-right","Bottom Right"],["bottom-left","Bottom Left"],["center","Center"]].map(([v,l]) => `<option value="${v}" ${(block.clipArtPosition || "top-right") === v ? "selected" : ""}>${l}</option>`).join("")}
              </select>
            </label>
            ${block.clipArtImageData ? `<img class="voice-clipart-preview" src="${block.clipArtImageData}" alt="Clip art preview" /><button type="button" class="secondary small" data-clear-voice-clip="${block.id}">Remove Clip Art</button>` : ""}
          </div>
          ${hiddenStyleFields}
        </div>` : `
        <div class="voice-tab-panel">
          ${renderVillageVoiceFontControls(`block-${block.id}`, block.textStyle)}
          <div class="voice-inline-style-grid">
            ${renderVillageVoiceBackgroundPicker(block)}
            <label>Border Style<select data-village-live data-block-border-style="${block.id}">${[["none","No Border"],["solid","Solid"],["dashed","Dashed"],["dotted","Dotted"],["double","Double"],["leafy","Thick OVA"]].map(([v,l]) => `<option value="${v}" ${(block.borderStyle || "none") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
            <label>Border Color<input type="color" data-village-live data-block-border-color="${block.id}" value="${escapeHtml(block.borderColor || "#2f6f63")}" /></label>
            <label>Text Color<input type="color" data-village-live data-block-text-color="${block.id}" value="${escapeHtml(block.textColor || "#1f2f2a")}" /></label>
            <label>Background Image<input type="file" accept="image/*" data-village-block-bg="${block.id}" /></label>
            ${block.backgroundImageData ? `<button type="button" class="secondary small" data-clear-voice-bg="${block.id}">Remove Image</button>` : ""}
          </div>
          <input type="hidden" data-block-bg-data="${block.id}" value="${block.backgroundImageData || ""}" />
          ${renderVillageVoiceBgModal(block)}
          ${hiddenContentFields}
        </div>`}
      <p class="helper">Click × to return to the content block list.</p>
    </div>`;
}

function renderVillageVoiceControlsPanel(draft, canArrange) {
  const selectedStyleEditor = renderVillageVoiceSelectedBlockEditor(draft);
  if (selectedStyleEditor) return `
    <div class="card subtle-card voice-controls voice-controls-style-mode">
      ${selectedStyleEditor}
      <div class="voice-hidden-draft-fields" aria-hidden="true">
        ${normalizeVillageVoiceBlocks(draft).map(block => `
          <input type="hidden" data-block-title="${block.id}" value="${escapeHtml(block.title || block.label || "New Block")}" />
          <input type="hidden" data-block-content="${block.id}" value="${escapeHtml(block.content || "")}" />
          <input type="hidden" data-block-function="${block.id}" value="${escapeHtml(block.functionType || "manual")}" />
        `).join("")}
      </div>
      <div class="actions"><button type="button" class="secondary" data-reset-village-voice>Reset to Default</button><button type="button" class="secondary" data-export-village-pdf>Export PDF</button><button type="submit">Save Village Voice</button></div>
    </div>`;
  return `
    <div class="card subtle-card voice-controls voice-controls-clean-menu">
      <div class="voice-controls-head"><h3>Content Blocks</h3></div>
      <div class="voice-layout-hint voice-rearrange-hint">Drag blocks on the preview. Double-click a preview block to edit it.</div>
      ${!canArrange ? `<div class="voice-layout-hint muted">Layout arranging requires the Arrange Printable Layouts permission.</div>` : ""}
      <div class="voice-block-list voice-block-list-clean" data-voice-block-list>
        ${renderVillageVoiceEditorRows(draft, canArrange)}
      </div>
      <div class="actions"><button type="button" class="secondary" data-add-village-block>Add Content Block</button><button type="button" class="secondary" data-reset-village-voice>Reset to Default</button><button type="button" class="secondary" data-export-village-pdf>Export PDF</button><button type="submit">Save Village Voice</button></div>
    </div>`;
}

function renderVillageVoiceEditorBlock(block, canArrange) {
  const expanded = state.expandedVillageVoiceEditorId === block.id;
  return `
    <div class="voice-edit-block ${expanded ? "" : "collapsed"}" draggable="false" data-voice-block="${block.id}">
      <div class="voice-edit-block-head" data-voice-toggle="${block.id}">
        <span class="drag-handle" title="Drag to rearrange">${canArrange ? "☰" : "•"}</span>
        <input class="voice-block-title-input" data-village-live data-block-title="${block.id}" value="${escapeHtml(block.title || block.label)}" />
        <button type="button" class="secondary small" data-voice-collapse="${block.id}">${expanded ? "Collapse" : "Edit"}</button>
      </div>
      <div class="voice-edit-block-body">
        <label>Function
          <select data-village-live data-block-function="${block.id}">
            <option value="manual" ${(block.functionType || "manual") === "manual" ? "selected" : ""}>Manual content</option>
            <option value="coreChampion" ${(block.functionType || "") === "coreChampion" ? "selected" : ""}>CORE Counts person picker</option>
            <option value="saveTheDate" ${(block.functionType || "") === "saveTheDate" ? "selected" : ""}>Save the Date</option>
            <option value="monthlyThemes" ${(block.functionType || "") === "monthlyThemes" ? "selected" : ""}>Monthly Themes</option>
            <option value="letterLand" ${(block.functionType || "") === "letterLand" ? "selected" : ""}>Letter Land images</option>
            <option value="importantDates" ${(block.functionType || "") === "importantDates" ? "selected" : ""}>Pull Important Dates for selected month</option>
            <option value="weeklyThemes" ${(block.functionType || "") === "weeklyThemes" ? "selected" : ""}>Pull Weekly Themes for selected month</option>
          </select>
        </label>
        ${(block.functionType || (block.kind === "champion" ? "coreChampion" : "manual")) === "coreChampion" ? `
          <label>CORE Counts Champion
            <select name="coreChampionUid" data-village-live data-village-champion>
              <option value="">Choose a staff member...</option>
              ${villageVoiceChampionOptions(currentVillageVoiceDraft().coreChampionUid)}
            </select>
          </label>` : ""}
        <label>${block.kind === "dates" ? "Dates / Lines" : "Content"}
          <textarea data-village-live data-block-content="${block.id}" rows="${block.kind === "dates" ? 5 : 4}" placeholder="${escapeHtml(block.placeholder || "")}">${escapeHtml(block.content || "")}</textarea>
        </label>
        <input type="hidden" data-block-column-mode="${block.id}" value="${escapeHtml(block.columnMode || "auto")}" />
        <input type="hidden" data-block-bg-color="${block.id}" value="${escapeHtml(block.backgroundColor || "#ffffff")}" />
        <input type="hidden" data-block-text-color="${block.id}" value="${escapeHtml(block.textColor || "#1f2f2a")}" />
        <input type="hidden" data-block-bg-data="${block.id}" value="${block.backgroundImageData || ""}" />
        <input type="hidden" data-block-clip-data="${block.id}" value="${block.clipArtImageData || ""}" />
        <input type="hidden" data-block-clip-size="${block.id}" value="${escapeHtml(block.clipArtSize || "small")}" />
        <input type="hidden" data-block-clip-position="${block.id}" value="${escapeHtml(block.clipArtPosition || "top-right")}" />
        <p class="helper">Block font, colors, background image, and clip art are in the floating toolbar after you click this block in the preview.</p>
      </div>
    </div>`;
}

function renderVillageVoiceSettingsBlock(draft) {
  const expanded = state.expandedVillageVoiceEditorId === "flyerSettings";
  return `
    <div class="voice-edit-block voice-settings-block ${expanded ? "expanded" : "collapsed"}" data-voice-settings-block>
      <div class="voice-edit-block-head" data-voice-toggle="flyerSettings">
        <span class="drag-handle">⚙</span>
        <strong>Flyer Header + Footer</strong>
        <button type="button" class="secondary small" data-voice-collapse="flyerSettings">${expanded ? "Collapse" : "Edit"}</button>
      </div>
      <div class="voice-edit-block-body voice-settings-compact">
        <label>Month
          <select name="month" data-village-live data-village-month>
            ${Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0")).map(m => `<option value="${m}" ${draft.month === m ? "selected" : ""}>${new Date(2026, Number(m)-1, 1).toLocaleString("en-US", { month: "long" })}</option>`).join("")}
          </select>
        </label>
        <input type="hidden" name="theme" value="${escapeHtml(draft.theme || getSeasonTheme(draft.month))}" />
        <label>Year<input name="year" data-village-live value="${escapeHtml(draft.year || new Date().getFullYear())}" /></label>
        <label>Flyer Title<input name="title" data-village-live value="${escapeHtml(draft.title)}" /></label>
        <label>Main Headline<input name="headline" data-village-live value="${escapeHtml(draft.headline)}" /></label>
        <label>Footer<input name="footer" data-village-live value="${escapeHtml(draft.footer)}" /></label>
        <label>Footer Tagline<input name="footerTagline" data-village-live value="${escapeHtml(draft.footerTagline || "")}" /></label>
        <div class="voice-style-panel">
          <strong>Header Style</strong>
          <div class="voice-font-grid">
            <label>Header Font
              <select name="headerFontFamily" data-village-live>
                ${[["serif","Classic Serif"],["sans","Clean Sans"],["friendly","Friendly"],["formal","Formal"],["bold","Bold Display"]].map(([v,l]) => `<option value="${v}" ${draft.headerFontFamily === v ? "selected" : ""}>${l}</option>`).join("")}
              </select>
            </label>
            <label>Title Size
              <select name="headerTitleSize" data-village-live>
                ${[["small","Small"],["medium","Medium"],["large","Large"],["xlarge","Extra Large"]].map(([v,l]) => `<option value="${v}" ${draft.headerTitleSize === v ? "selected" : ""}>${l}</option>`).join("")}
              </select>
            </label>
            <label>Headline Size
              <select name="headlineSize" data-village-live>
                ${[["small","Small"],["medium","Medium"],["large","Large"],["xlarge","Extra Large"]].map(([v,l]) => `<option value="${v}" ${draft.headlineSize === v ? "selected" : ""}>${l}</option>`).join("")}
              </select>
            </label>
            <label>Footer Font
              <select name="footerFontFamily" data-village-live>
                ${[["serif","Classic Serif"],["sans","Clean Sans"],["friendly","Friendly"],["formal","Formal"],["bold","Bold Display"]].map(([v,l]) => `<option value="${v}" ${draft.footerFontFamily === v ? "selected" : ""}>${l}</option>`).join("")}
              </select>
            </label>
            <label>Footer Size
              <select name="footerSize" data-village-live>
                ${[["small","Small"],["medium","Medium"],["large","Large"],["xlarge","Extra Large"]].map(([v,l]) => `<option value="${v}" ${draft.footerSize === v ? "selected" : ""}>${l}</option>`).join("")}
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>`;
}

function renderVillageVoiceEditorRows(draft, canArrange) {
  const blocks = normalizeVillageVoiceBlocks(draft);
  if (!blocks.length) return `<div class="voice-clean-empty">No content blocks yet.</div>`;
  return blocks.map(block => renderVillageVoiceEditorBlockSummary(block)).join("");
}

function renderVillageVoiceEditorBlockSummary(block) {
  const functionType = block.functionType || (block.kind === "champion" ? "coreChampion" : "manual");
  const functionLabel = ({
    manual: "Manual",
    coreChampion: "CORE Counts",
    saveTheDate: "Save the Date",
    monthlyThemes: "Monthly Themes",
    letterLand: "Letter Land",
    importantDates: "Important Dates",
    weeklyThemes: "Weekly Themes"
  })[functionType] || "Manual";
  const title = block.title || block.label || "New Block";
  return `
    <div class="voice-clean-block-card" data-voice-menu-block="${escapeHtml(block.id)}">
      <div class="voice-clean-block-title">${escapeHtml(title)}</div>
      <div class="voice-clean-block-meta">${escapeHtml(functionLabel)}</div>
    </div>`;
}

function renderPrintablesTabs() {
  const tabs = [
    ["villageVoice", "Village Voice"],
    ["teacherBio", "Teacher Bio"],
    ["doorReminders", "Door Reminders"],
    ["illnessNotice", "Illness Notice"]
  ];
  return `<div class="nav-tabs printables-tabs">${tabs.map(([id, label]) => `<button type="button" class="${state.printableTab === id ? "active" : ""}" data-printable-tab="${id}">${label}</button>`).join("")}</div>`;
}

function printableKindLabel(kind) {
  return ({ teacherBio: "Teacher Bio", doorReminders: "Door Reminders", illnessNotice: "Illness Notice" })[kind] || "Printable";
}

function printableDocSize(kind) {
  return kind === "teacherBio" ? "4 × 6 in" : "Letter / copy paper";
}

function printablePageClass(kind) {
  return kind === "teacherBio" ? "printable-preview-card teacher-bio-size printable-content-page" : "printable-preview-card letter-size printable-content-page";
}

function makePrintableBlockId() {
  return `printable_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function defaultPrintableBlocks(kind) {
  if (kind === "teacherBio") return [
    { id: "teacher", label: "Teacher", title: "Meet The Teacher", kind: "champion", content: "Add a short welcome or teacher introduction here.", functionType: "coreChampion", textStyle: defaultVillageVoiceTextStyle() },
    { id: "about", label: "About Me", title: "About Me", kind: "textarea", content: "Add teacher bio details here.", functionType: "manual", textStyle: defaultVillageVoiceTextStyle() },
    { id: "favorites", label: "Favorite Things", title: "Favorite Things", kind: "textarea", content: "Favorite color, snack, book, or classroom activity.", functionType: "manual", textStyle: defaultVillageVoiceTextStyle() }
  ];
  if (kind === "illnessNotice") return [
    { id: "headline", label: "Notice", title: "Illness Notice", kind: "textarea", content: "We wanted to let families know that there has been a reported illness in the classroom.", functionType: "manual", textStyle: defaultVillageVoiceTextStyle() },
    { id: "details", label: "Details", title: "What To Watch For", kind: "textarea", content: "Please monitor your child for symptoms and contact the office with any questions.", functionType: "manual", textStyle: defaultVillageVoiceTextStyle() },
    { id: "return", label: "Return Reminder", title: "Return Reminder", kind: "textarea", content: "Children may return according to OVA health policies and licensing guidance.", functionType: "manual", textStyle: defaultVillageVoiceTextStyle() }
  ];
  return [];
}

function normalizePrintableBlocks(draft = {}, kind = "teacherBio") {
  const presets = defaultPrintableBlocks(kind);
  const existing = Array.isArray(draft.blocks) ? draft.blocks : [];
  const presetBlocks = presets.map(preset => {
    const found = existing.find(b => b.id === preset.id) || {};
    return {
      ...preset,
      title: found.title || preset.title || preset.label,
      content: found.content ?? preset.content ?? "",
      backgroundImageData: found.backgroundImageData || "",
      clipArtImageData: found.clipArtImageData || "",
      clipArtSize: found.clipArtSize || "small",
      clipArtPosition: found.clipArtPosition || "top-right",
      backgroundColor: found.backgroundColor || "#ffffff",
      textColor: found.textColor || "#1f2f2a",
      borderStyle: found.borderStyle || "none",
      borderColor: found.borderColor || "#2f6f63",
      functionType: found.functionType || preset.functionType || "manual",
      textStyle: normalizeVillageVoiceTextStyle(found.textStyle || preset.textStyle)
    };
  });
  const customBlocks = existing.filter(b => b && b.id && !presets.some(p => p.id === b.id)).map(b => ({
    id: b.id,
    label: b.label || b.title || "New Block",
    kind: b.kind || "textarea",
    placeholder: b.placeholder || "Add content here.",
    title: b.title || b.label || "New Block",
    content: b.content || "",
    backgroundImageData: b.backgroundImageData || "",
    functionType: b.functionType || "manual",
    textStyle: normalizeVillageVoiceTextStyle(b.textStyle)
  }));
  return [...presetBlocks, ...customBlocks];
}

function normalizePrintableLayout(draft = {}, kind = "teacherBio") {
  const blocks = normalizePrintableBlocks(draft, kind);
  const ids = new Set(blocks.map(b => b.id));
  const defaultRows = kind === "teacherBio" ? [["teacher"], ["about", "favorites"]] : [["headline"], ["details"], ["return"]];
  const rows = Array.isArray(draft.layout) ? draft.layout : defaultRows;
  const clean = [];
  const used = new Set();
  rows.forEach(row => {
    const rowIds = (Array.isArray(row) ? row : [row]).filter(id => ids.has(id) && !used.has(id)).slice(0, 2);
    if (rowIds.length) { rowIds.forEach(id => used.add(id)); clean.push(rowIds); }
  });
  blocks.forEach(block => { if (!used.has(block.id)) clean.push([block.id]); });
  return clean;
}

function defaultPrintableDraft(kind) {
  const champion = getVillageVoiceChampionUsers()[0] || null;
  const base = {
    kind,
    title: printableKindLabel(kind),
    subtitle: kind === "teacherBio" ? "Oak Village Academy" : "Oak Village Academy",
    classroom: "",
    noticeDate: todayIso(),
    month: state.villageVoiceSelectedMonth,
    theme: "spring",
    coreChampionUid: champion?.uid || "",
    footer: "Oak Village Academy",
    headerFontFamily: "serif",
    headerTitleSize: kind === "teacherBio" ? "medium" : "large",
    headlineSize: "medium",
    footerFontFamily: "sans",
    footerSize: "medium"
  };
  base.blocks = normalizePrintableBlocks(base, kind);
  base.layout = normalizePrintableLayout(base, kind);
  return base;
}

function currentPrintableDraft(kind) {
  const saved = state.printableDrafts?.[kind] || {};
  const draft = { ...defaultPrintableDraft(kind), ...saved, kind };
  draft.blocks = normalizePrintableBlocks(draft, kind);
  draft.layout = normalizePrintableLayout(draft, kind);
  return draft;
}

function getPrintableBlock(draft, kind, blockId) {
  return (draft.blocks || []).find(b => b.id === blockId) || normalizePrintableBlocks(draft, kind).find(b => b.id === blockId);
}

function renderPrintablePreviewHtml(kind, draft = currentPrintableDraft(kind)) {
  const rows = normalizePrintableLayout(draft, kind);
  return `<div class="${printablePageClass(kind)}"${villageVoicePreviewStyleAttr(draft)}>
    <div class="printable-preview-mark">OVA</div>
    <h1 style="font-family:${villageVoiceFontCss(draft.headerFontFamily || "serif")};font-size:${kind === "teacherBio" ? "30px" : "42px"};">${escapeHtml(draft.title || printableKindLabel(kind))}</h1>
    ${kind === "illnessNotice" ? `<div class="printable-meta-line"><strong>Classroom:</strong> ${escapeHtml(draft.classroom || "____________")} &nbsp; <strong>Date:</strong> ${escapeHtml(draft.noticeDate || todayIso())}</div>` : ""}
    ${draft.subtitle ? `<p class="printable-subtitle">${escapeHtml(draft.subtitle)}</p>` : ""}
    <div class="voice-dynamic-grid printable-block-grid">
      ${rows.map(row => `<div class="voice-preview-row ${row.length > 1 ? "two-col" : "full-col"}">${row.map(id => renderVillageVoiceBlockPreview(getPrintableBlock(draft, kind, id), draft)).join("")}</div>`).join("")}
    </div>
    <div class="printable-preview-footer">${escapeHtml(draft.footer || "Oak Village Academy")}</div>
  </div>`;
}

function renderPrintableSettingsBlock(kind, draft) {
  const expanded = state.expandedVillageVoiceEditorId === `${kind}Settings`;
  return `<div class="voice-edit-block voice-settings-block ${expanded ? "expanded" : "collapsed"}" data-voice-settings-block>
    <div class="voice-edit-block-head" data-voice-toggle="${kind}Settings"><span class="drag-handle">⚙</span><strong>${printableKindLabel(kind)} Settings</strong><button type="button" class="secondary small" data-voice-collapse="${kind}Settings">${expanded ? "Collapse" : "Edit"}</button></div>
    <div class="voice-edit-block-body">
      <label>Printable Title<input name="title" data-printable-live value="${escapeHtml(draft.title || printableKindLabel(kind))}" /></label>
      <label>Subtitle<input name="subtitle" data-printable-live value="${escapeHtml(draft.subtitle || "")}" /></label>
      ${kind === "illnessNotice" ? `<label>Classroom<input name="classroom" data-printable-live value="${escapeHtml(draft.classroom || "")}" placeholder="Infant 1, Toddler 2..." /></label><label>Date<input type="date" name="noticeDate" data-printable-live value="${escapeHtml(draft.noticeDate || todayIso())}" /></label>` : ""}
      <label>Month
        <select name="month" data-printable-live>${Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0")).map(m => `<option value="${m}" ${draft.month === m ? "selected" : ""}>${new Date(2026, Number(m)-1, 1).toLocaleString("en-US", { month: "long" })}</option>`).join("")}</select>
      </label>
      <label>Footer<input name="footer" data-printable-live value="${escapeHtml(draft.footer || "Oak Village Academy")}" /></label>
      <div class="voice-style-panel"><strong>Header / Footer Style</strong><div class="voice-font-grid">
        <label>Header Font<select name="headerFontFamily" data-printable-live>${[["serif","Classic Serif"],["sans","Clean Sans"],["friendly","Friendly"],["formal","Formal"],["bold","Bold Display"]].map(([v,l]) => `<option value="${v}" ${draft.headerFontFamily === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label>Title Size<select name="headerTitleSize" data-printable-live>${[["small","Small"],["medium","Medium"],["large","Large"],["xlarge","Extra Large"]].map(([v,l]) => `<option value="${v}" ${draft.headerTitleSize === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label>Footer Font<select name="footerFontFamily" data-printable-live>${[["serif","Classic Serif"],["sans","Clean Sans"],["friendly","Friendly"],["formal","Formal"],["bold","Bold Display"]].map(([v,l]) => `<option value="${v}" ${draft.footerFontFamily === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label>Footer Size<select name="footerSize" data-printable-live>${[["small","Small"],["medium","Medium"],["large","Large"],["xlarge","Extra Large"]].map(([v,l]) => `<option value="${v}" ${draft.footerSize === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div></div>
    </div>
  </div>`;
}

function renderPrintableEditorRows(kind, draft) {
  return normalizePrintableLayout(draft, kind).map(row => `<div class="voice-editor-row ${row.length > 1 ? "two-col" : "full-col"}">${row.map(id => renderVillageVoiceEditorBlock(getPrintableBlock(draft, kind, id), false)).join("")}</div>`).join("");
}

function renderGenericPrintableTab(kind) {
  const draft = currentPrintableDraft(kind);
  return `<form id="${kind}Form" class="village-voice-layout printable-builder-form" data-printable-kind="${kind}">
    <div class="card subtle-card voice-controls">
      <h3>${printableKindLabel(kind)} Editor</h3>
      <p class="helper">${printableDocSize(kind)}. Uses the same editable content block system as Village Voice.</p>
      ${kind === "illnessNotice" ? renderIllnessNoticeTemplatePanel() : ""}
      ${renderPrintableSettingsBlock(kind, draft)}
      <div class="voice-block-list" data-printable-block-list>${renderPrintableEditorRows(kind, draft)}</div>
      <div class="actions"><button type="button" class="secondary" data-add-printable-block="${kind}">Add Content Block</button>${kind === "illnessNotice" ? `<button type="button" class="secondary" data-save-illness-template>Save As Reusable Flyer</button>` : ""}<button type="button" class="secondary" data-export-printable-pdf="${kind}">Export PDF</button><button type="submit">Save ${printableKindLabel(kind)}</button></div>
    </div>
    <div class="voice-page-wrap" data-printable-preview>${renderPrintablePreviewHtml(kind, draft)}</div>
  </form>`;
}

function renderIllnessNoticeTemplatePanel() {
  return `<div class="card slim-card illness-template-panel"><strong>Saved Illness Flyers</strong><div class="helper">Reuse a saved notice, then change classroom and date.</div><div class="template-chip-row">${state.illnessNoticeTemplates.length ? state.illnessNoticeTemplates.map(t => `<button type="button" class="secondary small" data-load-illness-template="${t.id}">${escapeHtml(t.title || "Saved Flyer")}</button>`).join("") : `<span class="empty">No saved illness flyers yet.</span>`}</div></div>`;
}

function renderDoorRemindersPreview(draft = state.printableDrafts?.doorReminders || {}) {
  const month = draft.month || state.villageVoiceSelectedMonth;
  const dateLines = renderImportantDatesLines(month);
  const customLines = splitVillageVoiceDates(draft.customReminders || "");
  return `<div class="printable-preview-card letter-size printable-content-page"><div class="printable-preview-mark">OVA</div><h1>${escapeHtml(draft.title || "Door Reminders")}</h1><p class="printable-subtitle">${new Date(2026, Number(month)-1, 1).toLocaleString("en-US", { month: "long" })}</p><div class="door-reminder-list">${[...dateLines, ...customLines].length ? `<ul>${[...dateLines, ...customLines].map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : `<p>No important dates or custom reminders for this month yet.</p>`}</div><div class="printable-preview-footer">${escapeHtml(draft.footer || "Oak Village Academy")}</div></div>`;
}


function getSelectedTeacherBioUser(draft = currentPrintableDraft("teacherBio")) {
  return state.users.find(u => u.uid === (draft.teacherUid || state.session?.uid)) || state.users[0] || state.session || {};
}

function renderTeacherBioPreview(draft = currentPrintableDraft("teacherBio")) {
  const user = getSelectedTeacherBioUser(draft);
  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Employee Name";
  const position = user.teamPosition || user.position || "";
  return `<div class="printable-preview-card teacher-bio-size teacher-bio-printable">
    <div class="teacher-bio-topline">
      ${state.appSettings?.ovaLogoData ? `<img class="teacher-bio-logo teacher-bio-logo-img" src="${state.appSettings.ovaLogoData}" alt="OVA logo" />` : `<div class="teacher-bio-logo">OVA</div>`}
      <div class="teacher-bio-photo">${user.profileImageData ? `<img src="${user.profileImageData}" alt="${escapeHtml(name)}" />` : `<span>No Photo</span>`}</div>
    </div>
    <h1>Teacher Bio</h1>
    <div class="teacher-bio-lines">
      <p><strong>Employee Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Position:</strong> ${escapeHtml(position || "Not assigned")}</p>
      <p><strong>Education:</strong> ${escapeHtml(normalizeEducationList(user.educationList || user.education).map(educationDisplayText).filter(Boolean).join(", "))}</p>
      <p><strong>Started Working In Early Childhood Education:</strong> ${escapeHtml(user.earlyEducationStart || "")}</p>
    </div>
    <div class="teacher-bio-summary">
      <p>${escapeHtml(user.leaderSummary || "Leader summary has not been added yet.")}</p>
    </div>
  </div>`;
}

function renderTeacherBioTab() {
  const draft = currentPrintableDraft("teacherBio");
  const selectedUid = draft.teacherUid || state.session?.uid || state.users[0]?.uid || "";
  return `<form id="teacherBioForm" class="village-voice-layout printable-builder-form" data-printable-kind="teacherBio">
    <div class="card subtle-card voice-controls">
      <h3>Teacher Bio Printable</h3>
      <p class="helper">This printable is automatic. Pick a user and it pulls their profile picture, name, position, education, early childhood start date, and leader summary.</p>
      <label>Employee
        <select name="teacherUid" data-teacher-bio-live>
          ${state.users.map(u => `<option value="${u.uid}" ${selectedUid === u.uid ? "selected" : ""}>${escapeHtml(`${u.firstName || ""} ${u.lastName || ""}`.trim())}${u.usedName ? ` — ${escapeHtml(u.usedName)}` : ""}</option>`).join("")}
        </select>
      </label>
      <div class="card slim-card">
        <strong>Profile data used</strong>
        <p class="helper">Teachers update their own education, early childhood start date, and reason by clicking their name at the top. Leaders can add the printable summary from the user editor.</p>
      </div>
      <div class="actions"><button type="button" class="secondary" data-export-printable-pdf="teacherBio">Export PDF</button><button type="submit">Save Teacher Bio Selection</button></div>
    </div>
    <div class="voice-page-wrap" data-teacher-bio-preview>${renderTeacherBioPreview({ ...draft, teacherUid: selectedUid })}</div>
  </form>`;
}

function updateTeacherBioDraftFromForm(form) {
  const draft = { ...currentPrintableDraft("teacherBio"), teacherUid: form.teacherUid?.value || "" };
  state.printableDrafts = { ...(state.printableDrafts || {}), teacherBio: draft };
  return draft;
}

function renderTeacherBioPreviewOnly() {
  const form = document.getElementById("teacherBioForm");
  const preview = form?.querySelector("[data-teacher-bio-preview]");
  if (!form || !preview) return;
  const draft = updateTeacherBioDraftFromForm(form);
  preview.innerHTML = renderTeacherBioPreview(draft);
}

function renderDoorRemindersTab() {
  const draft = state.printableDrafts?.doorReminders || { customReminders: "", title: "Door Reminders", footer: "Oak Village Academy", month: state.villageVoiceSelectedMonth };
  const month = draft.month || state.villageVoiceSelectedMonth;
  const dateLines = renderImportantDatesLines(month);
  return `<form id="doorRemindersForm" class="village-voice-layout printable-builder-form">
    <div class="card subtle-card voice-controls"><h3>Door Reminders Editor</h3><p class="helper">Automatically pulls Important Dates for the selected month. Add custom reminders underneath.</p>
      <label>Title<input name="title" data-door-live value="${escapeHtml(draft.title || "Door Reminders")}" /></label>
      <label>Month<select name="month" data-door-live>${Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0")).map(m => `<option value="${m}" ${month === m ? "selected" : ""}>${new Date(2026, Number(m)-1, 1).toLocaleString("en-US", { month: "long" })}</option>`).join("")}</select></label>
      <div class="card slim-card"><strong>Auto Important Dates</strong><div class="simple-list">${dateLines.length ? dateLines.map(l => `<div class="simple-list-row"><span>${escapeHtml(l)}</span></div>`).join("") : `<div class="empty">No important dates found for this month.</div>`}</div></div>
      <label>Custom Reminders<textarea name="customReminders" data-door-live rows="8" placeholder="Add one reminder per line.">${escapeHtml(draft.customReminders || "")}</textarea></label>
      <label>Footer<input name="footer" data-door-live value="${escapeHtml(draft.footer || "Oak Village Academy")}" /></label>
      <div class="actions"><button type="button" class="secondary" data-export-door-pdf>Export PDF</button><button type="submit">Save Door Reminders</button></div>
    </div>
    <div class="voice-page-wrap" data-door-preview>${renderDoorRemindersPreview(draft)}</div>
  </form>`;
}
function renderSimplePrintableTab(kind) {
  if (kind === "doorReminders") return renderDoorRemindersTab();
  if (kind === "teacherBio") return renderTeacherBioTab();
  if (kind === "illnessNotice") return renderGenericPrintableTab(kind);
  return `<div class="empty">Printable tab coming soon.</div>`;
}

function renderVillageVoiceTool() {
  state.currentView = "villageVoice";
  if (!hasToolPermission(state.session, "villageVoice", "editFlyer") && !hasFullDevAccess(state.session)) { renderHome(); return; }
  const draft = currentVillageVoiceDraft();
  const canArrange = hasToolPermission(state.session, "villageVoice", "arrangeFlyer") || hasFullDevAccess(state.session);
  const active = state.printableTab || "villageVoice";
  const villageIsEditing = active === "villageVoice" && state.villageVoiceEditorOpen === true;
  state.villageVoiceRearrangeMode = false;
  const villageVoiceTabHtml = villageIsEditing ? `
        <form id="villageVoiceForm" class="village-voice-layout village-voice-focus-mode voice-natural-drag-enabled">
          <button type="button" class="voice-close-focus-editor" data-close-village-editor>Close editor</button>
          ${renderVillageVoiceTopBar(draft)}
          ${renderVillageVoiceControlsPanel(draft, canArrange)}
          <div class="voice-preview-side">
            <div class="voice-page-wrap" data-village-preview>${renderVillageVoicePreviewHtml(draft)}</div>
          </div>
        </form>` : `
        <div class="village-voice-start-screen">
          <div class="village-voice-start-actions">
            <div><h3>The Village Voice</h3><p class="helper">Open the focused editor when you are ready to make changes.</p></div>
            <button type="button" data-start-village-editor>Start editing</button>
          </div>
          <div class="voice-page-wrap village-voice-start-preview" data-village-preview>${renderVillageVoicePreviewHtml(draft)}</div>
        </div>`;
  $app.innerHTML = pageShell(`
    <section class="card village-voice-editor printables-editor ${villageIsEditing ? "voice-editor-fullscreen" : ""}">
      ${villageIsEditing ? "" : `<div class="section-head">
        <div><h2>Printables</h2><p class="helper">Create printable items used throughout the year.</p></div>
        <button type="button" class="secondary" data-action="home">Back Home</button>
      </div>
      ${renderPrintablesTabs()}`}
      ${active === "villageVoice" ? villageVoiceTabHtml : renderSimplePrintableTab(active)}
    </section>
    ${state.modal ? renderModal() : ""}
    ${renderPhotoContextMenu()}
    ${renderPhotoPrintDuplicatePrompt()}
    ${state.toast ? `<div class="toast">${state.toast}</div>` : ""}
  `);
}

function getLastFormFieldValue(form, selector, fallback = "") {
  const matches = Array.from(form?.querySelectorAll(selector) || []);
  if (!matches.length) return fallback;
  const live = matches.findLast ? matches.findLast(el => el.matches("[data-village-live], [data-printable-live]")) : matches.slice().reverse().find(el => el.matches("[data-village-live], [data-printable-live]"));
  const picked = live || matches[matches.length - 1];
  return picked?.value ?? fallback;
}

function updateVillageVoiceDraftFromForm(form) {
  if (!form) return currentVillageVoiceDraft();
  const draft = currentVillageVoiceDraft();
  draft.title = getLastFormFieldValue(form, `[name="title"]`, draft.title || "The Village Voice")?.trim() || "The Village Voice";
  draft.month = getLastFormFieldValue(form, `[name="month"]`, state.villageVoiceSelectedMonth) || state.villageVoiceSelectedMonth;
  draft.theme = getLastFormFieldValue(form, `[name="theme"]`, draft.theme || getSeasonTheme(draft.month)) || getSeasonTheme(draft.month);
  draft.coreChampionUid = form.coreChampionUid?.value || draft.coreChampionUid || "";
  draft.headline = getLastFormFieldValue(form, `[name="headline"]`, draft.headline || "")?.trim() || "";
  draft.year = getLastFormFieldValue(form, `[name="year"]`, draft.year || new Date().getFullYear())?.trim() || draft.year || new Date().getFullYear();
  draft.editionLabel = `${new Date(2026, Number(draft.month || 1)-1, 1).toLocaleString("en-US", { month: "long" })}, ${draft.year}`;
  draft.footer = getLastFormFieldValue(form, `[name="footer"]`, draft.footer || "Oak Village Academy")?.trim() || "Oak Village Academy";
  draft.footerTagline = getLastFormFieldValue(form, `[name="footerTagline"]`, draft.footerTagline || "Learning • Growing • Belonging")?.trim() || "Learning • Growing • Belonging";
  draft.headerFontFamily = getLastFormFieldValue(form, `[name="headerFontFamily"]`, draft.headerFontFamily || "serif") || "serif";
  draft.headerTitleSize = getLastFormFieldValue(form, `[name="headerTitleSize"]`, draft.headerTitleSize || "large") || "large";
  draft.headlineSize = getLastFormFieldValue(form, `[name="headlineSize"]`, draft.headlineSize || "medium") || "medium";
  draft.footerFontFamily = getLastFormFieldValue(form, `[name="footerFontFamily"]`, draft.footerFontFamily || "sans") || "sans";
  draft.footerSize = getLastFormFieldValue(form, `[name="footerSize"]`, draft.footerSize || "medium") || "medium";
  draft.blocks = normalizeVillageVoiceBlocks(draft).map(block => ({
    ...block,
    title: form.querySelector(`[data-block-title="${block.id}"]`)?.value?.trim() || block.title || block.label || "New Block",
    content: form.querySelector(`[data-block-content="${block.id}"]`)?.value ?? block.content ?? "",
    backgroundImageData: getLastFormFieldValue(form, `[data-block-bg-data="${block.id}"]`, block.backgroundImageData || ""),
    clipArtImageData: getLastFormFieldValue(form, `[data-block-clip-data="${block.id}"]`, block.clipArtImageData || ""),
    clipArtSize: getLastFormFieldValue(form, `[data-block-clip-size="${block.id}"]`, block.clipArtSize || "small"),
    clipArtPosition: getLastFormFieldValue(form, `[data-block-clip-position="${block.id}"]`, block.clipArtPosition || "top-right"),
    backgroundColor: getLastFormFieldValue(form, `[data-block-bg-color="${block.id}"]`, block.backgroundColor || "#ffffff"),
    textColor: getLastFormFieldValue(form, `[data-block-text-color="${block.id}"]`, block.textColor || "#1f2f2a"),
    borderStyle: getLastFormFieldValue(form, `[data-block-border-style="${block.id}"]`, block.borderStyle || "none"),
    borderColor: getLastFormFieldValue(form, `[data-block-border-color="${block.id}"]`, block.borderColor || "#2f6f63"),
    functionType: form.querySelector(`[data-block-function="${block.id}"]`)?.value || block.functionType || ({ coreChampion: "coreChampion", monthlyThemes: "monthlyThemes", letterLand: "letterLand", saveTheDate: "saveTheDate" }[block.id] || "manual"),
    showNextMonthDates: (() => { const el = form.querySelector(`[data-block-show-next-month="${block.id}"]`); return el ? (el.type === "checkbox" ? el.checked : el.value === "1") : !!block.showNextMonthDates; })(),
    textStyle: normalizeVillageVoiceTextStyle({
      fontFamily: form.querySelector(`[data-block-${block.id}-font-family]`)?.value || block.textStyle?.fontFamily,
      titleSize: form.querySelector(`[data-block-${block.id}-title-size]`)?.value || block.textStyle?.titleSize,
      bodySize: form.querySelector(`[data-block-${block.id}-body-size]`)?.value || block.textStyle?.bodySize,
      titleStyle: form.querySelector(`[data-block-${block.id}-title-style]`)?.value || block.textStyle?.titleStyle,
      bodyStyle: form.querySelector(`[data-block-${block.id}-body-style]`)?.value || block.textStyle?.bodyStyle
    })
  }));
  state.villageVoiceDraft = { ...(state.villageVoiceDraft || {}), ...draft };
  saveVillageVoiceSessionDraft(state.villageVoiceDraft);
  return draft;
}

function renderVillageVoicePreviewOnly() {
  const form = document.getElementById("villageVoiceForm");
  const preview = form?.querySelector("[data-village-preview]");
  if (!form || !preview) return;
  const draft = updateVillageVoiceDraftFromForm(form);
  preview.innerHTML = renderVillageVoicePreviewHtml(draft);
}


const VILLAGE_VOICE_DND_DEBUG_KEY = "villageVoiceDragDropDebug";
window.VillageVoiceDragDebug = window.VillageVoiceDragDebug || {
  enable() { localStorage.setItem(VILLAGE_VOICE_DND_DEBUG_KEY, "1"); window.VV_DND_DEBUG = true; console.info("[Village Voice DND] Debug ON - now click and drag a Village Voice block. You should see pointerdown/dragstart/dragover/drop logs."); },
  disable() { localStorage.removeItem(VILLAGE_VOICE_DND_DEBUG_KEY); window.VV_DND_DEBUG = false; console.info("[Village Voice DND] Debug OFF"); },
  status() { const on = localStorage.getItem(VILLAGE_VOICE_DND_DEBUG_KEY) === "1" || window.VV_DND_DEBUG === true; console.info("[Village Voice DND] Debug status:", on ? "ON" : "OFF"); return on; },
  test() { console.info("[Village Voice DND] Debug object is loaded. Current view:", state.currentView, "Village form exists:", !!document.getElementById("villageVoiceForm")); },
  dump() { const draft = currentVillageVoiceDraft(); const out = { currentView: state.currentView, expandedEditor: state.expandedVillageVoiceEditorId || "", layout: normalizeVillageVoiceLayout(draft), blocks: normalizeVillageVoiceBlocks(draft).map(b => ({ id: b.id, title: b.title || b.label || "" })), savedSession: readLocalJson(VILLAGE_VOICE_SESSION_KEY, null)?.layout || null, explicitOverride: readLocalJson(VILLAGE_VOICE_LAYOUT_OVERRIDE_KEY, null) || null }; console.table(out.layout.map((row, i) => ({ row: i, left: row[0] || "FULL WIDTH", right: row[1] || "", renders: row.length > 1 ? "2 columns" : "full width" }))); console.info("[Village Voice DND] dump", out); return out; }
};
console.info("[Village Voice DND] tracer loaded. Enable with VillageVoiceDragDebug.enable(); check with VillageVoiceDragDebug.test();");
function villageVoiceDndDebugOn() {
  return localStorage.getItem(VILLAGE_VOICE_DND_DEBUG_KEY) === "1" || window.VV_DND_DEBUG === true;
}
function villageVoiceDndLog(label, data = {}) {
  if (!villageVoiceDndDebugOn()) return;
  try {
    console.groupCollapsed(`[Village Voice DND] ${label}`);
    Object.entries(data).forEach(([k, v]) => console.log(k, v));
    console.groupEnd();
  } catch (_) {
    console.log(`[Village Voice DND] ${label}`, data);
  }
}
function villageVoiceLayoutSnapshot() {
  try { return JSON.parse(JSON.stringify(normalizeVillageVoiceLayout(currentVillageVoiceDraft()))); } catch (_) { return null; }
}

function scrollElementInsideContainer(el, container) {
  if (!el || !container) return;
  const elRect = el.getBoundingClientRect();
  const cRect = container.getBoundingClientRect();
  const delta = (elRect.top - cRect.top) - ((cRect.height - elRect.height) / 2);
  container.scrollTo({ top: container.scrollTop + delta, behavior: "smooth" });
}

function focusVillageVoiceEditingSection(id) {
  if (!id) return;
  requestAnimationFrame(() => {
    const safeId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : String(id).replace(/"/g, '\"');
    const editEl = document.querySelector(`[data-left-block-editor="${safeId}"], [data-voice-block="${safeId}"]`);
    const previewEl = id === "flyerHeader" ? document.querySelector(".voice-cover-header") : (id === "flyerFooter" ? document.querySelector(".voice-footer") : document.querySelector(`[data-preview-block="${safeId}"]`));
    const editScroller = editEl?.closest(".voice-controls");
    const previewScroller = previewEl?.closest(".voice-page-wrap");
    scrollElementInsideContainer(editEl, editScroller);
    // Keep the visible preview stable; only center it if the page wrap itself is scrollable.
    if (previewScroller && previewScroller.scrollHeight > previewScroller.clientHeight + 8) scrollElementInsideContainer(previewEl, previewScroller);
  });
}

function removeVoiceBlockFromLayout(layout, id) {
  return (layout || []).map(row => (Array.isArray(row) ? row : [row]).filter(x => x !== id)).filter(row => row.length);
}

function cleanVillageVoiceLayoutRows(rows) {
  const clean = [];
  const used = new Set();
  (rows || []).forEach(row => {
    const source = (Array.isArray(row) ? row : [row]).slice(0, 2);
    const nextRow = source.map(id => id === VILLAGE_VOICE_EMPTY_SLOT ? VILLAGE_VOICE_EMPTY_SLOT : (id && !used.has(id) ? id : ""));
    if (nextRow.some(id => id && id !== VILLAGE_VOICE_EMPTY_SLOT)) {
      nextRow.forEach(id => { if (id && id !== VILLAGE_VOICE_EMPTY_SLOT) used.add(id); });
      clean.push(nextRow.length > 1 ? nextRow : nextRow.filter(Boolean));
    }
  });
  return clean;
}


function applyVillageVoiceColumnLocks(draft) {
  const blocks = normalizeVillageVoiceBlocks(draft);
  const byId = new Map(blocks.map(b => [b.id, b]));
  let rows = normalizeVillageVoiceLayout(draft).map(row => [...row]);
  rows = rows.flatMap(row => {
    const real = row.filter(id => id && id !== VILLAGE_VOICE_EMPTY_SLOT);
    if (real.some(id => byId.get(id)?.columnMode === "1")) {
      const out = [];
      row.forEach(id => { if (id && id !== VILLAGE_VOICE_EMPTY_SLOT) out.push([id]); });
      return out;
    }
    if (row.length === 1 && byId.get(row[0])?.columnMode === "2") return [[row[0], VILLAGE_VOICE_EMPTY_SLOT]];
    return [row];
  });
  draft.layout = cleanVillageVoiceLayoutRows(rows);
  return draft;
}

function persistVillageVoiceExplicitLayout(cleanRows) {
  try { writeLocalJson(VILLAGE_VOICE_LAYOUT_OVERRIDE_KEY, cleanRows); } catch (err) { console.warn("Village Voice layout override save failed", err); }
  window.__villageVoiceLastExplicitLayout = cleanRows;
}

function setVillageVoiceLayoutAfterDrop(draft, rows) {
  const clean = cleanVillageVoiceLayoutRows(rows);
  persistVillageVoiceExplicitLayout(clean);
  const nextDraft = { ...(state.villageVoiceDraft || {}), ...draft, layout: clean };
  state.villageVoiceDraft = nextDraft;
  state.villageVoiceDraft.layout = clean;
  saveVillageVoiceSessionDraft(state.villageVoiceDraft);
  const sessionRows = readLocalJson(VILLAGE_VOICE_SESSION_KEY, null)?.layout || null;
  const overrideRows = readLocalJson(VILLAGE_VOICE_LAYOUT_OVERRIDE_KEY, null) || null;
  villageVoiceDndLog("save-layout", {
    requestedRows: rows,
    cleanedRows: clean,
    normalizedAfterSave: normalizeVillageVoiceLayout(state.villageVoiceDraft),
    savedSessionRows: sessionRows,
    explicitOverrideRows: overrideRows
  });
  console.info("[Village Voice DND] APPLIED LAYOUT", clean.map((row, i) => ({ row: i, left: row[0] || "", right: row[1] || "", renders: row.length > 1 ? "2 columns" : "full width" })));
  // v150: do not rebuild the whole app after a drop. Rebuilding $app caused
  // the browser to jump back to the top every time a block was moved.
  const form = document.getElementById("villageVoiceForm");
  const preview = form?.querySelector("[data-village-preview]");
  if (form && preview) {
    const draftNow = currentVillageVoiceDraft();
    preview.innerHTML = renderVillageVoicePreviewHtml(draftNow);
  } else {
    renderVillageVoiceTool();
  }
}

function computeVillageVoiceRowsForMove(dragId, targetId, placement) {
  if (!dragId || !targetId || dragId === targetId) return null;
  const draft = currentVillageVoiceDraft();
  const originalRows = normalizeVillageVoiceLayout(draft).map(row => [...row]);
  const rows = removeVoiceBlockFromLayout(originalRows, dragId).map(row => row.filter(Boolean));
  const targetRowIndex = rows.findIndex(row => row.includes(targetId));
  if (targetRowIndex < 0) return null;
  const targetRow = rows[targetRowIndex];

  const insertColumnRow = (index, side) => rows.splice(index, 0, side === "right" ? [VILLAGE_VOICE_EMPTY_SLOT, dragId] : [dragId, VILLAGE_VOICE_EMPTY_SLOT]);

  if (placement === "slotFullBefore") {
    rows.splice(targetRowIndex, 0, [dragId]);
  } else if (placement === "slotLeftBefore") {
    insertColumnRow(targetRowIndex, "left");
  } else if (placement === "slotRightBefore") {
    insertColumnRow(targetRowIndex, "right");
  } else if (placement === "slotFullAfter") {
    rows.splice(targetRowIndex + 1, 0, [dragId]);
  } else if (placement === "slotLeftAfter") {
    insertColumnRow(targetRowIndex + 1, "left");
  } else if (placement === "slotRightAfter") {
    insertColumnRow(targetRowIndex + 1, "right");
  } else if (placement === "left" || placement === "right") {
    const pairedRow = placement === "left" ? [dragId, targetId] : [targetId, dragId];
    const displaced = targetRow.filter(id => id !== targetId && id !== dragId);
    rows[targetRowIndex] = pairedRow;
    if (displaced.length) rows.splice(targetRowIndex + 1, 0, ...displaced.map(id => [id]));
  } else if (placement === "aboveFull") {
    rows.splice(targetRowIndex, 0, [dragId]);
  } else if (placement === "belowFull") {
    rows.splice(targetRowIndex + 1, 0, [dragId]);
  } else if (placement === "above") {
    const colIndex = targetRow.indexOf(targetId);
    if (targetRow.length > 1 && colIndex >= 0) rows.splice(targetRowIndex, 0, colIndex === 0 ? [dragId, VILLAGE_VOICE_EMPTY_SLOT] : [VILLAGE_VOICE_EMPTY_SLOT, dragId]);
    else rows.splice(targetRowIndex, 0, [dragId]);
  } else {
    const colIndex = targetRow.indexOf(targetId);
    if (targetRow.length > 1 && colIndex >= 0) rows.splice(targetRowIndex + 1, 0, colIndex === 0 ? [dragId, VILLAGE_VOICE_EMPTY_SLOT] : [VILLAGE_VOICE_EMPTY_SLOT, dragId]);
    else rows.splice(targetRowIndex + 1, 0, [dragId]);
  }
  return { draft, originalRows, rows: cleanVillageVoiceLayoutRows(rows) };
}


function findVillageVoiceBlockElementById(id) {
  if (!id) return null;
  return Array.from(document.querySelectorAll('[data-preview-block], [data-voice-block]')).find(el => (el.dataset.previewBlock || el.dataset.voiceBlock) === id) || null;
}

// v143: Natural Village Voice rearrange system ported from the standalone prototype.
// Uses frozen drop zones + live preview. No L/C/R dot anchors.
function villageVoiceRowsToNaturalSegments(rows) {
  const segs = [];
  const normalized = (rows || []).map(row => (Array.isArray(row) ? row : [row]).slice(0, 2));
  for (let i = 0; i < normalized.length; i++) {
    const row = normalized[i];
    const isColumn = row.length > 1 || row.includes(VILLAGE_VOICE_EMPTY_SLOT);
    if (!isColumn) {
      const id = row.find(x => x && x !== VILLAGE_VOICE_EMPTY_SLOT);
      if (id) segs.push({ type: "full", id });
      continue;
    }
    const seg = { type: "columns", left: [], right: [] };
    while (i < normalized.length) {
      const two = normalized[i];
      const twoCol = two.length > 1 || two.includes(VILLAGE_VOICE_EMPTY_SLOT);
      if (!twoCol) break;
      if (two[0] && two[0] !== VILLAGE_VOICE_EMPTY_SLOT) seg.left.push(two[0]);
      if (two[1] && two[1] !== VILLAGE_VOICE_EMPTY_SLOT) seg.right.push(two[1]);
      i++;
    }
    i--;
    if (seg.left.length || seg.right.length) segs.push(seg);
  }
  return segs;
}

function villageVoiceNaturalSegmentsToRows(segs) {
  const rows = [];
  (segs || []).forEach(seg => {
    if (!seg) return;
    if (seg.type === "full" && seg.id) rows.push([seg.id]);
    if (seg.type === "columns") {
      const max = Math.max(seg.left?.length || 0, seg.right?.length || 0);
      for (let i = 0; i < max; i++) {
        rows.push([seg.left?.[i] || VILLAGE_VOICE_EMPTY_SLOT, seg.right?.[i] || VILLAGE_VOICE_EMPTY_SLOT]);
      }
    }
  });
  return cleanVillageVoiceLayoutRows(rows);
}

function renderVillageVoicePreviewRowsMasonry(rows, draft) {
  const segments = villageVoiceRowsToNaturalSegments(rows);
  return segments.map((seg, segIndex) => {
    if (seg.type === "full") {
      return `<div class="voice-preview-row full-col voice-natural-full-row" data-voice-preview-row="${segIndex}" data-vv-natural-full-seg="${segIndex}"><div class="voice-layout-slot slot-full" data-voice-drop-slot>${renderVillageVoiceBlockPreview(getVillageVoiceBlock(draft, seg.id), draft, segIndex, 0)}</div></div>`;
    }
    const renderSide = (side, colIndex) => {
      const items = (seg[side] || []).map((id, index) => `<div class="voice-layout-slot voice-natural-slot" data-vv-natural-seg="${segIndex}" data-vv-natural-side="${side}" data-vv-natural-index="${index}" data-voice-drop-slot>${renderVillageVoiceBlockPreview(getVillageVoiceBlock(draft, id), draft, segIndex, colIndex)}</div>`).join("");
      return `<div class="voice-masonry-col voice-natural-stack" data-vv-natural-stack data-vv-natural-seg="${segIndex}" data-vv-natural-side="${side}">${items}</div>`;
    };
    return `<div class="voice-preview-row two-col voice-masonry-row voice-natural-column-row" data-voice-preview-row="${segIndex}" data-vv-natural-col-seg="${segIndex}">${renderSide("left", 0)}${renderSide("right", 1)}</div>`;
  }).join("");
}

function vvNaturalClone(obj) { return JSON.parse(JSON.stringify(obj)); }
function vvNaturalFindBlock(segs, id) {
  for (let si = 0; si < (segs || []).length; si++) {
    const s = segs[si];
    if (s?.type === "full" && s.id === id) return { kind: "full", seg: si };
    if (s?.type === "columns") {
      for (const side of ["left", "right"]) {
        const index = (s[side] || []).indexOf(id);
        if (index > -1) return { kind: "col", seg: si, side, index };
      }
    }
  }
  return null;
}
function vvNaturalRemoveBlock(segs, id) {
  const p = vvNaturalFindBlock(segs, id);
  if (!p) return null;
  if (p.kind === "full") segs.splice(p.seg, 1);
  else {
    segs[p.seg][p.side].splice(p.index, 1);
    if (!segs[p.seg].left.length && !segs[p.seg].right.length) segs.splice(p.seg, 1);
  }
  return p;
}
function vvNaturalEnsureColumnSeg(segs, segIndex) {
  if (!segs[segIndex] || segs[segIndex].type !== "columns") {
    segs.splice(Math.min(segIndex, segs.length), 0, { type: "columns", left: [], right: [] });
  }
  return segs[Math.min(segIndex, segs.length - 1)];
}
function vvNaturalAdjustedSegAfterRemove(target, source, segs) {
  let seg = Number(target.seg || 0);
  if (source?.kind === "full" && source.seg < seg) seg--;
  if (source?.kind === "col" && source.seg < seg && !segs[source.seg]) seg--;
  return Math.max(0, Math.min(seg, segs.length));
}
function vvNaturalInsertFullAtColumnRow(segs, id, target) {
  const seg = segs[target.seg];
  if (!seg || seg.type !== "columns") { segs.splice(Math.min(target.seg, segs.length), 0, { type: "full", id }); return segs; }
  const row = Math.max(0, Math.min(Number(target.index || 0), Math.max(seg.left.length, seg.right.length)));
  const above = { type: "columns", left: seg.left.slice(0, row), right: seg.right.slice(0, row) };
  const below = { type: "columns", left: seg.left.slice(row), right: seg.right.slice(row) };
  const repl = [];
  if (above.left.length || above.right.length) repl.push(above);
  repl.push({ type: "full", id });
  if (below.left.length || below.right.length) repl.push(below);
  segs.splice(target.seg, 1, ...repl);
  return segs;
}
function vvNaturalApplyMove(segsIn, id, target) {
  const segs = vvNaturalClone(segsIn || []);
  const source = vvNaturalFindBlock(segs, id);
  if (!source || !target) return segs;
  const sameFullTarget = target.kind === "fullRow" && source.kind === "full" && source.seg === target.seg;
  vvNaturalRemoveBlock(segs, id);
  if (target.kind === "end") { segs.push({ type: "full", id }); return segs; }
  if (target.kind === "fullRow") {
    const segIndex = sameFullTarget ? source.seg : vvNaturalAdjustedSegAfterRemove(target, source, segs);
    if (target.slot === "c") {
      const existing = segs[segIndex];
      if (existing?.type === "full") {
        const displaced = existing.id;
        existing.id = id;
        if (source.kind === "col") {
          const s = vvNaturalEnsureColumnSeg(segs, Math.min(source.seg, segs.length));
          s[source.side].splice(Math.min(source.index, s[source.side].length), 0, displaced);
        } else segs.splice(Math.min(source.seg, segs.length), 0, { type: "full", id: displaced });
      } else segs.splice(segIndex, 0, { type: "full", id });
      return segs;
    }
    const existing = sameFullTarget ? null : segs[segIndex];
    if (existing?.type === "full") {
      const other = existing.id;
      segs.splice(segIndex, 1, target.slot === "l" ? { type: "columns", left: [id], right: [other] } : { type: "columns", left: [other], right: [id] });
    } else {
      segs.splice(segIndex, 0, target.slot === "l" ? { type: "columns", left: [id], right: [] } : { type: "columns", left: [], right: [id] });
    }
    return segs;
  }
  if (target.slot === "c") {
    return vvNaturalInsertFullAtColumnRow(segs, id, { ...target, seg: vvNaturalAdjustedSegAfterRemove(target, source, segs) });
  }
  const targetSeg = vvNaturalAdjustedSegAfterRemove(target, source, segs);
  const seg = vvNaturalEnsureColumnSeg(segs, targetSeg);
  const side = target.slot === "l" ? "left" : "right";
  let idx = Math.min(Number(target.index || 0), seg[side].length);
  if (source.kind === "col" && source.seg === targetSeg && source.side === side && source.index < target.index) idx = Math.max(0, idx - 1);
  seg[side].splice(idx, 0, id);
  return segs;
}

function vvNaturalBaseSegments() {
  return villageVoiceRowsToNaturalSegments(normalizeVillageVoiceLayout(currentVillageVoiceDraft()));
}
function vvNaturalRowsAfterMove(dragId, target) {
  return villageVoiceNaturalSegmentsToRows(vvNaturalApplyMove(window.__vvNaturalBaseSegments || vvNaturalBaseSegments(), dragId, target));
}
function vvNaturalTargetKey(t) { return t ? `${t.kind}:${t.slot}:${t.seg}:${t.index}` : ""; }
function vvNaturalEncode(t) { try { return encodeURIComponent(JSON.stringify({ kind: t.kind, slot: t.slot, seg: t.seg, index: t.index })); } catch (_) { return ""; } }
function vvNaturalDecode(value) { try { return JSON.parse(decodeURIComponent(String(value || "").replace(/^natural:/, ""))); } catch (_) { return null; } }


// v146: compatibility helpers for the natural Village Voice rearrange system.
// These replace the old dot-anchor helpers that were removed during the merge.
function getVillageVoiceDraggedId(e) {
  return state.villageVoiceDraggedBlock || state.villageVoicePickedBlock || e?.dataTransfer?.getData?.("application/x-village-voice-block") || e?.dataTransfer?.getData?.("text/plain") || "";
}

function getVoiceDropTarget(e) {
  const form = document.getElementById("villageVoiceForm");
  if (!form || !e?.target || !form.contains(e.target)) return null;
  return e.target.closest?.("[data-preview-block], [data-voice-block], [data-voice-drop-slot]") || null;
}

function getVillageVoiceDndChoice(e) {
  const direct = e?.target?.closest?.("[data-voice-dnd-choice]");
  if (direct) return direct;
  if (!state.villageVoiceRearrangeMode) return null;
  if (!state.villageVoicePickedBlock && !state.villageVoiceDraggedBlock && !window.__vvPointerRearrange) return null;
  if (!Number.isFinite(e?.clientX) || !Number.isFinite(e?.clientY)) return null;
  return getVillageVoiceChoiceAtPoint(e.clientX, e.clientY);
}

function ensureVillageVoiceCursorRing() {
  let ring = document.querySelector("[data-voice-dnd-cursor-ring]");
  if (!ring) {
    ring = document.createElement("div");
    ring.className = "voice-dnd-cursor-ring";
    ring.dataset.voiceDndCursorRing = "1";
    ring.innerHTML = `<span></span>`;
    document.body.appendChild(ring);
  }
  return ring;
}

function updateVillageVoiceCursorRing(e) {
  if (!state.villageVoiceRearrangeMode) return;
  if (!state.villageVoicePickedBlock && !state.villageVoiceDraggedBlock && !window.__vvPointerRearrange) return;
  if (!e || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY) || (e.clientX === 0 && e.clientY === 0)) return;
  const ring = ensureVillageVoiceCursorRing();
  ring.style.left = `${Math.round(e.clientX)}px`;
  ring.style.top = `${Math.round(e.clientY)}px`;
  ring.classList.add("visible");
}

function hideVillageVoiceCursorRing() {
  document.querySelector("[data-voice-dnd-cursor-ring]")?.remove();
}

function selectVillageVoiceBlockForRearrange(blockId, pointerEvent = null) {
  if (!state.villageVoiceRearrangeMode || !blockId) return false;
  state.villageVoicePickedBlock = blockId;
  state.villageVoiceDraggedBlock = blockId;
  document.querySelectorAll("[data-preview-block]").forEach(el => {
    el.classList.toggle("voice-preview-selected", el.dataset.previewBlock === blockId);
    el.setAttribute("draggable", "false");
  });
  clearVillageVoiceDropMarkers(true);
  renderVillageVoiceDropChoices(null, blockId);
  if (pointerEvent) updateVillageVoiceCursorRing(pointerEvent);
  return true;
}

function clearVillageVoicePickedBlock() {
  state.villageVoiceRearrangeMode = false;
  state.villageVoicePickedBlock = "";
  state.villageVoiceDraggedBlock = "";
  window.__vvPointerRearrange = null;
  window.__vvNaturalTargets = [];
  window.__vvNaturalBaseSegments = null;
  document.querySelectorAll("[data-preview-block]").forEach(el => {
    el.classList.remove("voice-preview-selected", "voice-drop-preview-moving");
    el.setAttribute("draggable", "false");
  });
  hideVillageVoiceCursorRing();
  document.querySelector("[data-vv-natural-drop-hint]")?.remove();
  document.querySelector("[data-voice-dnd-choice-layer]")?.remove();
  try { vvNaturalRestoreCurrentPreview(); } catch (_) {}
  clearVillageVoiceDropMarkers();
}

function renderVillageVoiceDropChoices(target, draggedId) {
  if (!draggedId || !state.villageVoiceRearrangeMode) return;
  window.__vvNaturalBaseSegments = vvNaturalBaseSegments();
  window.__vvNaturalTargets = [];
  document.querySelector("[data-voice-dnd-choice-layer]")?.remove();
  vvNaturalEnsureDropHint();
  const preview = document.querySelector(".voice-flyer-preview");
  if (!preview) return;
  preview.querySelectorAll("[data-vv-natural-full-seg]").forEach(full => {
    const seg = Number(full.dataset.vvNaturalFullSeg);
    const r = full.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const gap = 12;
    const colW = (r.width - gap) / 2;
    const y = r.top + r.height / 2;
    window.__vvNaturalTargets.push({ kind: "fullRow", slot: "l", seg, index: 0, y, box: { left: r.left, top: r.top, width: colW, height: r.height } });
    window.__vvNaturalTargets.push({ kind: "fullRow", slot: "c", seg, index: 0, y, box: { left: r.left, top: r.top, width: r.width, height: r.height } });
    window.__vvNaturalTargets.push({ kind: "fullRow", slot: "r", seg, index: 0, y, box: { left: r.left + colW + gap, top: r.top, width: colW, height: r.height } });
  });
  preview.querySelectorAll("[data-vv-natural-col-seg]").forEach(col => {
    const seg = Number(col.dataset.vvNaturalColSeg);
    const baseSeg = (window.__vvNaturalBaseSegments || [])[seg] || { left: [], right: [] };
    const r = col.getBoundingClientRect();
    const leftStack = col.querySelector('[data-vv-natural-stack][data-vv-natural-side="left"]')?.getBoundingClientRect();
    const rightStack = col.querySelector('[data-vv-natural-stack][data-vv-natural-side="right"]')?.getBoundingClientRect();
    if (!leftStack || !rightStack || !r.width) return;
    const maxRows = Math.max(baseSeg.left?.length || 0, baseSeg.right?.length || 0);
    const rowBoundaryY = (i) => {
      const prev = Array.from(col.querySelectorAll(`[data-vv-natural-index="${i - 1}"]`)).map(el => el.getBoundingClientRect());
      const next = Array.from(col.querySelectorAll(`[data-vv-natural-index="${i}"]`)).map(el => el.getBoundingClientRect());
      if (prev.length && next.length) return (Math.max(...prev.map(x => x.bottom)) + Math.min(...next.map(x => x.top))) / 2;
      if (next.length) return Math.max(r.top + 18, Math.min(...next.map(x => x.top)) - 12);
      if (prev.length) return Math.min(r.bottom + 28, Math.max(...prev.map(x => x.bottom)) + 18);
      return r.top + 42;
    };
    for (let i = 0; i <= maxRows; i++) {
      const y = rowBoundaryY(i);
      window.__vvNaturalTargets.push({ kind: "columnRow", slot: "l", seg, index: i, y, box: { left: leftStack.left, top: y - 34, width: leftStack.width, height: 68 } });
      window.__vvNaturalTargets.push({ kind: "columnRow", slot: "c", seg, index: i, y, box: { left: leftStack.left, top: y - 28, width: rightStack.right - leftStack.left, height: 56 } });
      window.__vvNaturalTargets.push({ kind: "columnRow", slot: "r", seg, index: i, y, box: { left: rightStack.left, top: y - 34, width: rightStack.width, height: 68 } });
    }
  });
  const pr = preview.getBoundingClientRect();
  const last = Array.from(window.__vvNaturalTargets).sort((a, b) => (b.box?.top || 0) - (a.box?.top || 0))[0];
  const endTop = last ? Math.max(last.box.top + last.box.height + 12, pr.bottom - 32) : pr.top + 80;
  window.__vvNaturalTargets.push({ kind: "end", slot: "c", seg: (window.__vvNaturalBaseSegments || []).length, index: 0, y: endTop + 35, box: { left: pr.left + 18, top: endTop, width: Math.max(120, pr.width - 36), height: 70 } });
}

function vvNaturalChooseTarget(x, y) {
  const preview = document.querySelector(".voice-flyer-preview");
  const pr = preview?.getBoundingClientRect();
  if (!pr || x < pr.left || x > pr.right || y < pr.top || y > pr.bottom + 160) return null;
  const targets = window.__vvNaturalTargets || [];
  const rows = targets.filter(t => t.slot === "c").sort((a, b) => Math.abs(y - a.y) - Math.abs(y - b.y));
  const row = rows[0];
  if (!row || Math.abs(y - row.y) > 130) return null;
  const center = targets.find(t => t.kind === row.kind && t.seg === row.seg && t.index === row.index && t.slot === "c") || row;
  const rel = (x - center.box.left) / Math.max(center.box.width, 1);
  const slot = rel < 0.36 ? "l" : (rel > 0.64 ? "r" : "c");
  const picked = targets.find(t => t.kind === row.kind && t.seg === row.seg && t.index === row.index && t.slot === slot) || center;
  return picked;
}

function getVillageVoiceChoiceAtPoint(x, y) {
  const t = vvNaturalChooseTarget(x, y);
  vvNaturalShowDropHint(t);
  if (!t) return null;
  const placement = `natural:${vvNaturalEncode(t)}`;
  return { dataset: { targetId: "__natural", placement }, __vvNaturalTarget: t };
}

function makeVillageVoiceNaturalChoice(target) {
  if (!target) return null;
  return { dataset: { targetId: "__natural", placement: `natural:${vvNaturalEncode(target)}` }, __vvNaturalTarget: target };
}

function vvNaturalEnsureDropHint() {
  let hint = document.querySelector("[data-vv-natural-drop-hint]");
  if (!hint) {
    hint = document.createElement("div");
    hint.className = "vv-natural-drop-hint";
    hint.dataset.vvNaturalDropHint = "1";
    document.body.appendChild(hint);
  }
  return hint;
}
function vvNaturalShowDropHint(t) {
  // v155: natural dragging uses the live preview only; no extra visual drop indicators.
  document.querySelector("[data-vv-natural-drop-hint]")?.remove();
}
function vvNaturalRestoreCurrentPreview() {
  const grid = document.querySelector(".voice-dynamic-grid");
  if (!grid) return;
  const draft = currentVillageVoiceDraft();
  grid.classList.remove("vv-natural-previewing");
  grid.innerHTML = renderVillageVoicePreviewRowsMasonry(normalizeVillageVoiceLayout(draft), draft);
}

function previewVillageVoiceDropLayout(dragId, targetId, placement) {
  if (!dragId || !placement || !String(placement).startsWith("natural:")) return;
  const target = vvNaturalDecode(placement);
  if (!target) return;
  const grid = document.querySelector(".voice-dynamic-grid");
  if (!grid) return;
  const draft = currentVillageVoiceDraft();
  grid.classList.add("vv-natural-previewing");
  const rows = vvNaturalRowsAfterMove(dragId, target);
  grid.innerHTML = renderVillageVoicePreviewRowsMasonry(rows, draft);
  grid.querySelector(`[data-preview-block="${CSS.escape(dragId)}"]`)?.classList.add("voice-drop-preview-moving");
}

function restoreVillageVoicePreviewAfterDropHover() {
  document.querySelector("[data-vv-natural-drop-hint]")?.classList.remove("on", "left", "right", "center");
  if (window.__vvPointerRearrange || state.villageVoiceDraggedBlock) vvNaturalRestoreCurrentPreview();
  document.querySelectorAll(".voice-drop-preview-moving").forEach(el => el.classList.remove("voice-drop-preview-moving"));
}

function applyVillageVoiceChoiceDrop(choice, explicitDraggedId = "") {
  if (!choice || !state.villageVoiceRearrangeMode) return false;
  const draggedId = explicitDraggedId || state.villageVoicePickedBlock || state.villageVoiceDraggedBlock || "";
  const place = choice.dataset?.placement || "";
  const target = choice.__vvNaturalTarget || (place.startsWith("natural:") ? vvNaturalDecode(place) : null);
  if (!draggedId || !target) return false;
  let moved = false;
  try {
    const form = document.getElementById("villageVoiceForm");
    if (form) {
      try { updateVillageVoiceDraftFromForm(form); }
      catch (formErr) { console.warn("Village Voice form sync skipped during natural rearrange drop", formErr); }
    }
    const draft = currentVillageVoiceDraft();
    const before = normalizeVillageVoiceLayout(draft);
    const rows = vvNaturalRowsAfterMove(draggedId, target);
    moved = JSON.stringify(cleanVillageVoiceLayoutRows(before)) !== JSON.stringify(rows);
    if (moved) setVillageVoiceLayoutAfterDrop(draft, rows);
    else showToast("That block is already in that position.");
  } catch (err) {
    console.error("Village Voice natural rearrange drop failed", err, { draggedId, target });
    showToast("That drop did not work. Try again.");
  } finally {
    window.__vvPointerRearrange = null;
    window.__vvNaturalTargets = [];
    window.__vvNaturalBaseSegments = null;
    state.villageVoiceRearrangeMode = false;
    state.villageVoicePickedBlock = "";
    state.villageVoiceDraggedBlock = "";
    hideVillageVoiceCursorRing();
    document.querySelector("[data-vv-natural-drop-hint]")?.remove();
    document.querySelector("[data-voice-dnd-choice-layer]")?.remove();
  }
  return moved;
}

function clearVillageVoiceDropMarkers(removeChoices = true) {
  document.querySelectorAll(".voice-edit-block.drop-left,.voice-edit-block.drop-right,.voice-edit-block.drop-above,.voice-edit-block.drop-below,.voice-block.drop-left,.voice-block.drop-right,.voice-block.drop-above,.voice-block.drop-below,.voice-layout-slot.drop-left,.voice-layout-slot.drop-right,.voice-layout-slot.drop-above,.voice-layout-slot.drop-below,.voice-drop-preview-moving").forEach(el => el.classList.remove("drop-left", "drop-right", "drop-above", "drop-below", "voice-drop-preview-moving"));
  document.querySelector("[data-vv-natural-drop-hint]")?.remove();
  if (removeChoices) document.querySelector("[data-voice-dnd-choice-layer]")?.remove();
}

function getHomeDropCard(e) {
  const direct = e.target.closest("[data-tool-card]");
  if (direct) return direct;
  const zone = e.target.closest("[data-tool-drop-zone]");
  if (!zone) return null;
  const cards = Array.from(zone.querySelectorAll("[data-tool-card]")).filter(el => !el.classList.contains("dragging"));
  let best = null, bestDistance = Infinity;
  cards.forEach(el => {
    const r = el.getBoundingClientRect();
    const cx = Math.max(r.left, Math.min(e.clientX, r.right));
    const cy = Math.max(r.top, Math.min(e.clientY, r.bottom));
    const d = Math.hypot(e.clientX - cx, e.clientY - cy);
    if (d < bestDistance) { best = el; bestDistance = d; }
  });
  return bestDistance < 240 ? best : null;
}

async function saveVillageVoice(form) {
  const draft = updateVillageVoiceDraftFromForm(form);
  const byId = Object.fromEntries((draft.blocks || []).map(b => [b.id, b]));
  const payload = {
    title: draft.title,
    month: draft.month,
    theme: draft.theme || getSeasonTheme(draft.month),
    coreChampionUid: draft.coreChampionUid,
    headline: draft.headline,
    year: draft.year || new Date().getFullYear(),
    editionLabel: draft.editionLabel,
    footer: draft.footer,
    footerTagline: draft.footerTagline,
    headerFontFamily: draft.headerFontFamily,
    headerTitleSize: draft.headerTitleSize,
    headlineSize: draft.headlineSize,
    footerFontFamily: draft.footerFontFamily,
    footerSize: draft.footerSize,
    blocks: draft.blocks,
    layout: normalizeVillageVoiceLayout(draft),
    message: byId.message?.content || "",
    directorNote: byId.directorNote?.content || "",
    classroomSpotlight: byId.classroomSpotlight?.content || "",
    coreQuote: byId.coreChampion?.content || "",
    importantDates: byId.importantDates?.content || "",
    updatedAt: serverTimestamp(),
    updatedBy: state.session?.uid || ""
  };
  await setDoc(doc(db, "villageVoice", "current"), payload, { merge: true });
  state.villageVoiceDraft = { id: "current", ...payload };
  clearVillageVoiceSessionDraft();
  showToast("Village Voice saved.");
}

function addVillageVoiceBlock() {
  const form = document.getElementById("villageVoiceForm");
  const draft = form ? updateVillageVoiceDraftFromForm(form) : currentVillageVoiceDraft();
  const id = makeVillageVoiceBlockId();
  const block = { id, label: "New Block", title: "New Block", kind: "textarea", placeholder: "Add content here.", content: "", backgroundImageData: "", functionType: "manual", textStyle: defaultVillageVoiceTextStyle() };
  draft.blocks = [...normalizeVillageVoiceBlocks(draft), block];
  draft.layout = [...normalizeVillageVoiceLayout(draft), [id]];
  state.expandedVillageVoiceEditorId = id;
  state.villageVoiceDraft = { ...(state.villageVoiceDraft || {}), ...draft };
  saveVillageVoiceSessionDraft(state.villageVoiceDraft);
  renderVillageVoiceTool();
}

function resetVillageVoiceDraft() {
  if (!confirm("Reset Village Voice back to the default layout? This clears your current unsaved flyer changes.")) return;
  clearVillageVoiceSessionDraft();
  try { localStorage.removeItem(VILLAGE_VOICE_LAYOUT_OVERRIDE_KEY); } catch (err) {}
  const fresh = defaultVillageVoiceDraft();
  state.villageVoiceDraft = fresh;
  state.expandedVillageVoiceEditorId = "";
  saveVillageVoiceSessionDraft(fresh);
  renderVillageVoiceTool();
  showToast("Village Voice reset to the default layout.");
}

function exportVillageVoicePdf() {
  const form = document.getElementById("villageVoiceForm");
  const draft = form ? updateVillageVoiceDraftFromForm(form) : currentVillageVoiceDraft();
  const html = renderVillageVoicePreviewHtml(draft);
  const win = window.open("", "_blank");
  if (!win) { alert("Please allow pop-ups so the PDF export window can open."); return; }
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(node => node.outerHTML).join("\n");
  win.document.write(`<!doctype html><html><head><title>${escapeHtml(draft.title || "Village Voice")}</title>${styles}<style>
    @page { size: letter; margin: 0.25in; }
    body { margin: 0; background: white; }
    .voice-print-wrap { width: 100%; display: flex; justify-content: center; }
    .voice-flyer-preview { width: 7.9in !important; min-height: 10.3in !important; box-shadow: none !important; border-radius: 0 !important; }
    .voice-page-wrap { padding: 0 !important; overflow: visible !important; }
  </style></head><body><div class="voice-print-wrap">${html}</div><script>setTimeout(()=>{ window.print(); }, 500);<\/script></body></html>`);
  win.document.close();
}


function updatePrintableDraftFromForm(kind, form) {
  if (kind === "teacherBio") return updateTeacherBioDraftFromForm(form);
  const draft = currentPrintableDraft(kind);
  draft.title = form.title?.value?.trim() || printableKindLabel(kind);
  draft.subtitle = form.subtitle?.value?.trim() || "";
  draft.classroom = form.classroom?.value?.trim() || "";
  draft.noticeDate = form.noticeDate?.value || todayIso();
  draft.month = form.month?.value || state.villageVoiceSelectedMonth;
  draft.footer = form.footer?.value?.trim() || "Oak Village Academy";
  draft.headerFontFamily = form.headerFontFamily?.value || draft.headerFontFamily || "serif";
  draft.headerTitleSize = form.headerTitleSize?.value || draft.headerTitleSize || "large";
  draft.footerFontFamily = form.footerFontFamily?.value || draft.footerFontFamily || "sans";
  draft.footerSize = form.footerSize?.value || draft.footerSize || "medium";
  draft.blocks = normalizePrintableBlocks(draft, kind).map(block => ({
    ...block,
    title: form.querySelector(`[data-block-title="${block.id}"]`)?.value?.trim() || block.title || block.label || "New Block",
    content: form.querySelector(`[data-block-content="${block.id}"]`)?.value ?? block.content ?? "",
    backgroundImageData: getLastFormFieldValue(form, `[data-block-bg-data="${block.id}"]`, block.backgroundImageData || ""),
    clipArtImageData: getLastFormFieldValue(form, `[data-block-clip-data="${block.id}"]`, block.clipArtImageData || ""),
    clipArtSize: getLastFormFieldValue(form, `[data-block-clip-size="${block.id}"]`, block.clipArtSize || "small"),
    clipArtPosition: getLastFormFieldValue(form, `[data-block-clip-position="${block.id}"]`, block.clipArtPosition || "top-right"),
    backgroundColor: getLastFormFieldValue(form, `[data-block-bg-color="${block.id}"]`, block.backgroundColor || "#ffffff"),
    textColor: getLastFormFieldValue(form, `[data-block-text-color="${block.id}"]`, block.textColor || "#1f2f2a"),
    borderStyle: getLastFormFieldValue(form, `[data-block-border-style="${block.id}"]`, block.borderStyle || "none"),
    borderColor: getLastFormFieldValue(form, `[data-block-border-color="${block.id}"]`, block.borderColor || "#2f6f63"),
    columnMode: getLastFormFieldValue(form, `[data-block-column-mode="${block.id}"]`, block.columnMode || "auto") || "auto",
    functionType: form.querySelector(`[data-block-function="${block.id}"]`)?.value || block.functionType || "manual",
    textStyle: normalizeVillageVoiceTextStyle({
      fontFamily: form.querySelector(`[data-block-${block.id}-font-family]`)?.value || block.textStyle?.fontFamily,
      titleSize: form.querySelector(`[data-block-${block.id}-title-size]`)?.value || block.textStyle?.titleSize,
      bodySize: form.querySelector(`[data-block-${block.id}-body-size]`)?.value || block.textStyle?.bodySize,
      titleStyle: form.querySelector(`[data-block-${block.id}-title-style]`)?.value || block.textStyle?.titleStyle,
      bodyStyle: form.querySelector(`[data-block-${block.id}-body-style]`)?.value || block.textStyle?.bodyStyle
    })
  }));
  state.printableDrafts = { ...(state.printableDrafts || {}), [kind]: draft };
  return draft;
}

function renderPrintablePreviewOnly(kind) {
  if (kind === "teacherBio") return renderTeacherBioPreviewOnly();
  const form = document.querySelector(`form[data-printable-kind="${kind}"]`);
  const preview = form?.querySelector("[data-printable-preview]");
  if (!form || !preview) return;
  const draft = updatePrintableDraftFromForm(kind, form);
  preview.innerHTML = renderPrintablePreviewHtml(kind, draft);
}

function updateDoorDraftFromForm(form) {
  const draft = {
    ...(state.printableDrafts?.doorReminders || {}),
    title: form.title?.value?.trim() || "Door Reminders",
    month: form.month?.value || state.villageVoiceSelectedMonth,
    customReminders: form.customReminders?.value || "",
    footer: form.footer?.value?.trim() || "Oak Village Academy"
  };
  state.printableDrafts = { ...(state.printableDrafts || {}), doorReminders: draft };
  return draft;
}

function renderDoorPreviewOnly() {
  const form = document.getElementById("doorRemindersForm");
  const preview = form?.querySelector("[data-door-preview]");
  if (!form || !preview) return;
  const draft = updateDoorDraftFromForm(form);
  preview.innerHTML = renderDoorRemindersPreview(draft);
}

async function saveGenericPrintable(kind, form) {
  const draft = updatePrintableDraftFromForm(kind, form);
  await setDoc(doc(db, "printables", kind), { ...draft, updatedAt: serverTimestamp(), updatedBy: state.session?.uid || "" }, { merge: true });
  showToast(`${printableKindLabel(kind)} saved.`);
}

async function saveDoorReminders(form) {
  const draft = updateDoorDraftFromForm(form);
  await setDoc(doc(db, "printables", "doorReminders"), { ...draft, updatedAt: serverTimestamp(), updatedBy: state.session?.uid || "" }, { merge: true });
  showToast("Door Reminders saved.");
}


function addPrintableBlock(kind) {
  if (kind === "teacherBio") return;
  const form = document.querySelector(`form[data-printable-kind="${kind}"]`);
  const draft = form ? updatePrintableDraftFromForm(kind, form) : currentPrintableDraft(kind);
  const id = makePrintableBlockId();
  const block = { id, label: "New Block", title: "New Block", kind: "textarea", placeholder: "Add content here.", content: "", backgroundImageData: "", functionType: "manual", textStyle: defaultVillageVoiceTextStyle() };
  draft.blocks = [...normalizePrintableBlocks(draft, kind), block];
  draft.layout = [...normalizePrintableLayout(draft, kind), [id]];
  state.expandedVillageVoiceEditorId = id;
  state.printableDrafts = { ...(state.printableDrafts || {}), [kind]: draft };
  renderVillageVoiceTool();
}

function printableExportHtml(kind) {
  if (kind === "teacherBio") {
    const form = document.getElementById("teacherBioForm");
    const draft = form ? updateTeacherBioDraftFromForm(form) : currentPrintableDraft("teacherBio");
    return renderTeacherBioPreview(draft);
  }
  const form = document.querySelector(`form[data-printable-kind="${kind}"]`);
  const draft = form ? updatePrintableDraftFromForm(kind, form) : currentPrintableDraft(kind);
  return renderPrintablePreviewHtml(kind, draft);
}

function exportPrintablePdf(kind) {
  const html = printableExportHtml(kind);
  const win = window.open("", "_blank");
  if (!win) { alert("Please allow pop-ups so the PDF export window can open."); return; }
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(node => node.outerHTML).join("\n");
  const isBio = kind === "teacherBio";
  win.document.write(`<!doctype html><html><head><title>${escapeHtml(printableKindLabel(kind))}</title>${styles}<style>
    @page { size: ${isBio ? "4in 6in" : "letter"}; margin: 0.15in; }
    body { margin: 0; background: white; }
    .voice-print-wrap { width: 100%; display: flex; justify-content: center; }
    .printable-preview-card { box-shadow: none !important; }
  </style></head><body><div class="voice-print-wrap">${html}</div><script>setTimeout(()=>{ window.print(); }, 500);<\/script></body></html>`);
  win.document.close();
}

function exportDoorPdf() {
  const form = document.getElementById("doorRemindersForm");
  const draft = form ? updateDoorDraftFromForm(form) : (state.printableDrafts?.doorReminders || {});
  const html = renderDoorRemindersPreview(draft);
  const win = window.open("", "_blank");
  if (!win) { alert("Please allow pop-ups so the PDF export window can open."); return; }
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(node => node.outerHTML).join("\n");
  win.document.write(`<!doctype html><html><head><title>Door Reminders</title>${styles}<style>@page{size:letter;margin:.25in;}body{margin:0;background:white}.printable-preview-card{box-shadow:none!important;}</style></head><body><div class="voice-print-wrap">${html}</div><script>setTimeout(()=>{ window.print(); }, 500);<\/script></body></html>`);
  win.document.close();
}

async function saveIllnessTemplate() {
  const form = document.getElementById("illnessNoticeForm");
  if (!form) return;
  const draft = updatePrintableDraftFromForm("illnessNotice", form);
  await setDoc(doc(collection(db, "illnessNoticeTemplates")), { ...draft, createdAt: serverTimestamp(), createdBy: state.session?.uid || "" });
  await refreshAdminData();
  showToast("Reusable illness flyer saved.");
  renderVillageVoiceTool();
}

function loadIllnessTemplate(id) {
  const template = state.illnessNoticeTemplates.find(t => t.id === id);
  if (!template) return;
  state.printableDrafts = { ...(state.printableDrafts || {}), illnessNotice: { ...template, id: "illnessNotice" } };
  renderVillageVoiceTool();
}

async function addImportantDate(form) {
  const payload = {
    date: form.date.value,
    description: form.description.value.trim(),
    includeInVillageVoice: !!form.includeInVillageVoice?.checked,
    createdAt: serverTimestamp(),
    createdBy: state.session?.uid || ""
  };
  await setDoc(doc(collection(db, "importantDates")), payload);
  showToast("Important date added.");
}

async function updateImportantDate(form) {
  const id = form.dataset.importantDateId;
  const existing = (state.importantDates || []).find(item => item.id === id);
  if (!id || !existing || existing.autoBirthday) throw new Error("That date cannot be edited here.");
  const payload = {
    date: form.date.value,
    endDate: form.endDate.value || "",
    dateLabel: form.dateLabel.value.trim(),
    description: form.description.value.trim(),
    details: form.details.value.trim(),
    includeInVillageVoice: !!form.includeInVillageVoice?.checked,
    updatedAt: serverTimestamp(),
    updatedBy: state.session?.uid || ""
  };
  await setDoc(doc(db, "importantDates", id), payload, { merge: true });
  state.editingImportantDateId = "";
  showToast("Important date updated.");
}

async function deleteImportantDate(id) {
  if (!id) return;
  if (!confirm("Delete this important date?")) return;
  await deleteDoc(doc(db, "importantDates", id));
  showToast("Important date deleted.");
}

function normalizeImportantDatesImportPayload(payload) {
  const rawItems = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.dates) ? payload.dates : Array.isArray(payload) ? payload : [];
  return rawItems.map(item => ({
    date: item.date || item.startDate || "",
    endDate: item.endDate || "",
    dateLabel: item.dateLabel || item.label || "",
    description: item.description || [item.title, item.details || item.otherImportantInformation].filter(Boolean).join(" — "),
    title: item.title || "",
    details: item.details || item.otherImportantInformation || "",
    includeInVillageVoice: item.includeInVillageVoice !== false
  })).filter(item => item.date && item.description);
}

function importantDateImportId(item) {
  const slug = String(item.title || item.description || "important-date").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "important-date";
  return `calendar_${String(item.date).replace(/[^0-9]/g, "")}_${slug}`;
}

async function importImportantDatesFromPayload(payload) {
  const items = normalizeImportantDatesImportPayload(payload);
  if (!items.length) throw new Error("No important date rows were found in that file.");
  for (const item of items) {
    const id = importantDateImportId(item);
    await setDoc(doc(db, "importantDates", id), {
      date: item.date,
      endDate: item.endDate || "",
      dateLabel: item.dateLabel || "",
      description: item.description || "",
      title: item.title || "",
      details: item.details || "",
      includeInVillageVoice: item.includeInVillageVoice !== false,
      importedFrom: payload?.source || "Important dates import",
      updatedAt: serverTimestamp(),
      updatedBy: state.session?.uid || ""
    }, { merge: true });
  }
  showToast(`Imported ${items.length} important dates.`);
}
async function addCertificate(form) {
  const name = form.name.value.trim();
  if (!name) throw new Error("Certificate name is required.");
  await setDoc(doc(collection(db, "certificates")), { name, active: true, createdAt: serverTimestamp(), createdBy: state.session?.uid || "" });
  showToast("Certificate added.");
}

async function deleteCertificate(id) {
  if (!id) return;
  if (!confirm("Delete this certificate?")) return;
  await updateDoc(doc(db, "certificates", id), { active: false, updatedAt: serverTimestamp() });
  showToast("Certificate deleted.");
}

async function saveWeeklyThemes(form) {
  const themes = {};
  const letterImages = {};
  const dateRanges = {};
  const labels = {};
  const weekOfMonths = {};
  const letterlands = {};
  const seedlingsValues = {};
  const ideasEvents = {};
  const letterlandSpriteTiles = {};
  for (let i = 1; i <= 52; i++) {
    setWeeklyThemeField(themes, i, form.querySelector(`[name="week_${i}"]`)?.value || "");
    const selectedSpriteTile = (state.weeklyThemesDraftTiles || {})[String(i)] || form.querySelector(`[name="letterlandSpriteTile_${i}"]`)?.value || "";
    letterImages[String(i)] = selectedSpriteTile ? "" : ((state.weeklyThemesDraftImages || {})[String(i)] || form.querySelector(`[name="letterImage_${i}"]`)?.value || "");
    setWeeklyThemeField(dateRanges, i, form.querySelector(`[name="dateRange_${i}"]`)?.value || "");
    setWeeklyThemeField(labels, i, form.querySelector(`[name="label_${i}"]`)?.value || "");
    setWeeklyThemeField(weekOfMonths, i, form.querySelector(`[name="weekOfMonth_${i}"]`)?.value || "");
    setWeeklyThemeField(letterlands, i, form.querySelector(`[name="letterland_${i}"]`)?.value || "");
    setWeeklyThemeField(seedlingsValues, i, form.querySelector(`[name="seedlingsValue_${i}"]`)?.value || "");
    setWeeklyThemeField(ideasEvents, i, form.querySelector(`[name="ideasEvents_${i}"]`)?.value || "");
    setWeeklyThemeField(letterlandSpriteTiles, i, selectedSpriteTile);
  }
  await setDoc(doc(db, "weeklyThemes", "current"), {
    startingDate: form.startingDate.value || "",
    themes,
    letterImages,
    dateRanges,
    labels,
    weekOfMonths,
    letterlands,
    seedlingsValues,
    ideasEvents,
    letterlandSpriteSheet: await getLetterlandSpriteSheetRefForSave(form),
    letterlandSpriteRows: form.letterlandSpriteRows?.value || "5",
    letterlandSpriteCols: form.letterlandSpriteCols?.value || "6",
    letterlandSpriteWidth: form.letterlandSpriteWidth?.value || "",
    letterlandSpriteHeight: form.letterlandSpriteHeight?.value || "",
    letterlandSpriteMarginX: form.letterlandSpriteMarginX?.value || "0",
    letterlandSpriteMarginY: form.letterlandSpriteMarginY?.value || "0",
    letterlandSpriteGapX: form.letterlandSpriteGapX?.value || "0",
    letterlandSpriteGapY: form.letterlandSpriteGapY?.value || "0",
    letterlandSpriteCellW: form.letterlandSpriteCellW?.value || "",
    letterlandSpriteCellH: form.letterlandSpriteCellH?.value || "",
    letterlandSpriteTiles,
    updatedAt: serverTimestamp(),
    updatedBy: state.session?.uid || ""
  }, { merge: true });
  state.weeklyThemesDraftImages = {};
  state.weeklyThemesDraftTiles = {};
  showToast("Weekly themes saved.");
}

function applyWeeklyThemeImportToForm(form, payload) {
  const weeks = normalizeCurriculumImportPayload(payload);
  if (!weeks.length) throw new Error("No weekly theme rows were found in that file.");
  if (payload?.startingDate && form.startingDate) form.startingDate.value = payload.startingDate;
  weeks.forEach(item => {
    const i = item.weekNumber;
    if (form[`week_${i}`]) form[`week_${i}`].value = item.theme || "";
    if (form[`dateRange_${i}`]) form[`dateRange_${i}`].value = item.dateRange || "";
    if (form[`label_${i}`]) form[`label_${i}`].value = item.label || "";
    if (form[`weekOfMonth_${i}`]) form[`weekOfMonth_${i}`].value = item.weekOfMonth || "";
    if (form[`letterland_${i}`]) form[`letterland_${i}`].value = item.letterland || "";
    if (form[`seedlingsValue_${i}`]) form[`seedlingsValue_${i}`].value = item.seedlingsValue || "";
    if (form[`ideasEvents_${i}`]) form[`ideasEvents_${i}`].value = item.ideasEvents || "";
    const card = form[`week_${i}`]?.closest(".weekly-theme-card");
    const title = card?.querySelector(".weekly-theme-card-head strong");
    if (title && item.label) title.textContent = item.label;
  });
  showToast(`Imported ${weeks.length} weekly themes. Click Save Weekly Themes to publish.`);
}




async function updateSelfProfile(form) {
  if (!state.session?.uid) throw new Error("No user is logged in.");
  const section = form.dataset.profileSection || state.modal?.section || "details";
  const payload = { updatedAt: serverTimestamp() };
  if (section === "education") {
    const educationList = collectEducationEntries(form);
    payload.educationList = educationList;
    payload.education = educationList.map(educationDisplayText).join("; ");
  } else if (section === "story") {
    payload.whyEarlyEducation = form.whyEarlyEducation?.value?.trim() || "";
  } else if (section === "likes") {
    payload.whatILike = collectWhatILike(form);
  } else {
    payload.usedName = form.usedName?.value?.trim() || state.session.usedName || "";
    payload.profileImageData = form.profileImageData?.value || state.session.profileImageData || "";
    payload.earlyEducationStart = form.earlyEducationStart?.value?.trim() || "";
    payload.birthday = collectBirthdayFromForm(form);
  }
  const wasOnboarding = isOnboardingRequired(state.session);
  await updateDoc(doc(db, "users", state.session.uid), payload);
  state.session = await readUser(state.session.uid);
  state.users = state.users.map(u => u.uid === state.session.uid ? { ...u, ...state.session } : u);
  state.modal = null;
  if (wasOnboarding && isOnboardingComplete(state.session)) {
    await updateDoc(doc(db, "users", state.session.uid), { onboardingRequired: false, pinResetRequired: false, updatedAt: serverTimestamp() });
    state.session = await readUser(state.session.uid);
    state.users = state.users.map(u => u.uid === state.session.uid ? { ...u, ...state.session } : u);
    showToast("Onboarding complete.");
    renderHome();
    return;
  }
  showToast("Profile updated.");
  if (wasOnboarding) renderProfileHome(); else renderCurrentView();
}




function renderOnboardingPage() {
  state.currentView = "onboarding";
  const u = state.session || {};
  const step = Math.max(0, Math.min(Number(state.onboardingStep || 0), 3));
  const stepLabels = ["Confirm Info", "Birthday", "Education + Story", "What I Like"];
  const schools = (u.schoolIds || (u.schoolId ? [u.schoolId] : []));
  const schoolNames = schools.map(id => state.schools.find(s => s.id === id)?.name || id).filter(Boolean);
  let body = "";
  if (step === 0) {
    body = `<div class="grid two"><label>First Name<input name="firstName" required value="${escapeHtml(u.firstName || "")}"></label><label>Last Name<input name="lastName" required value="${escapeHtml(u.lastName || "")}"></label></div><label>Used Name<input name="usedName" required placeholder="What should people call you?" value="${escapeHtml(u.usedName || "")}"></label><div><strong>School / Location</strong><p class="helper">Current: ${escapeHtml(schoolNames.join(", ") || "Not set")}</p><div class="grid two" style="margin-top:.5rem;">${state.schools.map(school => `<label style="display:flex;align-items:center;gap:.5rem;"><input style="width:auto;" type="checkbox" name="schoolIds" value="${school.id}" ${schools.includes(school.id) ? "checked" : ""}> ${escapeHtml(school.name)} (${escapeHtml(school.code || "")})</label>`).join("")}</div></div>`;
  } else if (step === 1) {
    body = `<p class="helper">Choose your birthday from dropdowns. The year starts near age 18 so it is quicker to scroll.</p>${renderBirthdayDropdowns(u.birthday || "")}`;
  } else if (step === 2) {
    body = `${renderEducationBuilder(u)}<label>Why I Chose Childcare<textarea name="whyEarlyEducation" rows="5" placeholder="What made you choose childcare?">${escapeHtml(u.whyEarlyEducation || "")}</textarea></label>`;
  } else {
    body = `<p class="helper">Add the favorites families and leaders may need for your What I Like page.</p>${renderWhatILikeFields(u)}`;
  }
  const missing = getOnboardingMissingItems(u);
  $app.innerHTML = pageShell(`
    <section class="onboarding-page onboarding-slider-page">
      <div class="card onboarding-hero-card">
        <p class="eyebrow">Onboarding</p>
        <h1>Welcome to OVA!</h1>
        <p>Complete each step to finish setting up your profile.</p>
      </div>
      <div class="onboarding-slide-dots">${stepLabels.map((label, i) => `<button type="button" class="${i === step ? "active" : i < step ? "done" : ""}" data-onboarding-go-step="${i}">${i < step ? "✓" : i + 1} ${escapeHtml(label)}</button>`).join("")}</div>
      <form class="card onboarding-step-card onboarding-slide-card" id="onboardingStepForm" data-onboarding-step="${step}">
        <div class="onboarding-step-head"><span class="onboarding-check">${step + 1}</span><div><h2>${escapeHtml(stepLabels[step])}</h2><p class="helper">${step === 0 ? "Confirm this information or edit it before moving on." : "Save this step to continue."}</p></div></div>
        ${body}
        ${modalErrorHtml()}
        <div class="actions sticky-modal-actions">
          ${step > 0 ? `<button type="button" class="secondary" data-onboarding-prev>Back</button>` : ""}
          <button>${step === 3 ? "Finish Onboarding" : step === 0 ? "Confirm & Continue" : "Save & Continue"}</button>
        </div>
      </form>
      ${missing.length ? `<div class="card missing-box"><strong>Still needed:</strong><ul>${missing.map(m => `<li>${escapeHtml(m)}</li>`).join("")}</ul></div>` : ""}
    </section>
    ${state.modal ? renderModal() : ""}
    ${renderPhotoContextMenu()}
    ${renderPhotoPrintDuplicatePrompt()}
    ${state.toast ? `<div class="toast">${state.toast}</div>` : ""}
  `);
}

async function saveOnboardingStep(form) {
  if (!state.session?.uid) throw new Error("No user is logged in.");
  const step = Number(form.dataset.onboardingStep || 0);
  const payload = { updatedAt: serverTimestamp() };
  if (step === 0) {
    const firstName = form.firstName.value.trim();
    const lastName = form.lastName.value.trim();
    const usedName = form.usedName.value.trim();
    const schoolIds = getFormSchoolIds(form);
    if (!firstName || !lastName || !usedName) throw new Error("First name, last name, and used name are required.");
    if (!schoolIds.length) throw new Error("Select at least one location.");
    payload.firstName = firstName;
    payload.lastName = lastName;
    payload.displayName = `${firstName} ${lastName.slice(0, 1)}.`;
    payload.usedName = usedName;
    payload.schoolIds = schoolIds;
  } else if (step === 1) {
    const birthday = collectBirthdayFromForm(form);
    if (!birthday) throw new Error("Choose your full birthday.");
    payload.birthday = birthday;
  } else if (step === 2) {
    const educationList = collectEducationEntries(form);
    const why = form.whyEarlyEducation?.value?.trim() || "";
    if (!educationList.length) throw new Error("Add at least one education item.");
    if (!why) throw new Error("Add why you chose childcare.");
    payload.educationList = educationList;
    payload.education = educationList.map(educationDisplayText).join("; ");
    payload.whyEarlyEducation = why;
  } else {
    const likes = collectWhatILike(form);
    if (!Object.values(likes).some(v => Array.isArray(v) ? v.length : String(v || "").trim())) throw new Error("Add at least one What I Like item.");
    payload.whatILike = likes;
  }
  await updateDoc(doc(db, "users", state.session.uid), payload);
  state.session = await readUser(state.session.uid);
  state.users = state.users.map(u => u.uid === state.session.uid ? { ...u, ...state.session } : u);
  if (step < 3) {
    state.onboardingStep = step + 1;
    renderOnboardingPage();
    return;
  }
  if (isOnboardingComplete(state.session)) {
    await updateDoc(doc(db, "users", state.session.uid), { onboardingRequired: false, pinResetRequired: false, updatedAt: serverTimestamp() });
    state.session = await readUser(state.session.uid);
    showToast("Onboarding complete.");
    renderHome();
  } else {
    showToast("Saved. Finish the remaining items to complete onboarding.");
    renderOnboardingPage();
  }
}

async function completeOnboardingIfReady() {
  const fresh = await readUser(state.session.uid);
  state.session = fresh;
  if (!isOnboardingComplete(fresh)) {
    showToast("Finish the missing onboarding items first.");
    renderOnboardingPage();
    return;
  }
  await updateDoc(doc(db, "users", fresh.uid), { onboardingRequired: false, pinResetRequired: false, updatedAt: serverTimestamp() });
  state.session = await readUser(fresh.uid);
  showToast("Onboarding complete.");
  renderHome();
}

function renderProfileHome() {
  state.currentView = "profile";
  const u = state.session || {};
  const displayName = makeDisplayName(u);
  const schools = (u.schoolIds || (u.schoolId ? [u.schoolId] : []))
    .map(id => state.schools.find(s => s.id === id)?.name || state.schools.find(s => s.id === id)?.schoolName || id)
    .filter(Boolean);
  const education = normalizeEducationList(u.educationList || u.education);
  const eduHtml = education.length
    ? education.map(ed => `<div class="profile-mini-row"><strong>${escapeHtml(educationDisplayText(ed) || "Education")}</strong><span>${escapeHtml(ed.certificate || ed.field || "")}</span></div>`).join("")
    : `<p class="empty">No education added yet.</p>`;

  $app.innerHTML = pageShell(`
    <section class="profile-homepage">
      <div class="profile-hero-card card">
        <div class="profile-hero-photo">
          ${u.profileImageData ? `<img src="${u.profileImageData}" alt="${escapeHtml(displayName)}" />` : `<span>${escapeHtml((u.firstName || "?").slice(0,1))}</span>`}
        </div>
        <div class="profile-hero-copy">
          <p class="eyebrow">My Profile</p>
          <h2>${escapeHtml(displayName)}</h2>
          <p>${escapeHtml(u.teamPosition || getPrimaryRole(u) || "Village Vibes user")}</p>
          <div class="profile-chip-row">
            <span>${escapeHtml(getPrimaryRole(u))}</span>
            ${schools.map(school => `<span>${escapeHtml(school)}</span>`).join("")}
          </div>
        </div>
        <div class="profile-hero-actions">
          <button type="button" data-open-self-profile-editor data-profile-section="details">Update Profile</button>
          <button type="button" class="secondary" data-action="home">Back Home</button>
        </div>
      </div>

      ${isOnboardingRequired(u) ? `<div class="card onboarding-profile-progress"><div class="tool-heading-row"><div><p class="eyebrow">Onboarding</p><h2>Finish setting up your profile</h2><p class="helper">Update each section below. Checks update as soon as each section is saved.</p></div><button type="button" class="secondary small" data-action="onboarding">Back to Onboarding</button></div>${getOnboardingStatusHtml(u)}</div>` : ""}

      <div class="profile-card-grid">
        <article class="card profile-info-card">
          <div class="profile-card-title"><h3>Profile Details</h3><button type="button" class="secondary small" data-open-self-profile-editor data-profile-section="details">Edit</button></div>
          <div class="profile-detail-list">
            <div><small>Used Name</small><strong>${escapeHtml(u.usedName || "Not set")}</strong></div>
            <div><small>Birthday</small><strong>${escapeHtml(u.birthday || "Not set")}</strong></div>
            <div><small>Early Education Start</small><strong>${escapeHtml(u.earlyEducationStart || "Not set")}</strong></div>
          </div>
        </article>

        <article class="card profile-info-card">
          <div class="profile-card-title"><h3>Education</h3><button type="button" class="secondary small" data-open-self-profile-editor data-profile-section="education">Edit</button></div>
          <div class="profile-mini-list">${eduHtml}</div>
        </article>

        <article class="card profile-info-card wide-profile-card">
          <div class="profile-card-title"><h3>Why I Chose Early Education</h3><button type="button" class="secondary small" data-open-self-profile-editor data-profile-section="story">Edit</button></div>
          <p class="profile-long-text">${escapeHtml(u.whyEarlyEducation || "Add a short answer here so printables and leader tools can use it later.")}</p>
        </article>
        <article class="card profile-info-card wide-profile-card">
          <div class="profile-card-title"><h3>What I Like</h3><button type="button" class="secondary small" data-open-self-profile-editor data-profile-section="likes">Edit</button></div>
          ${renderWhatILikeDisplay(u)}
        </article>
      </div>
    </section>
    ${state.modal ? renderModal() : ""}
    ${renderPhotoContextMenu()}
    ${renderPhotoPrintDuplicatePrompt()}
    ${state.toast ? `<div class="toast">${state.toast}</div>` : ""}
  `);
}

function renderBrandingSettingsTab() {
  const logo = state.appSettings?.ovaLogoData || "";
  return `
    <form id="brandingSettingsForm" class="card subtle-card branding-settings-form">
      <h3>OVA Logo</h3>
      <p class="helper">This logo will replace the VV mark on the main page and printables like Village Voice and Teacher Bio.</p>
      <div class="branding-logo-row">
        ${logo ? `<img class="branding-logo-preview" src="${logo}" alt="OVA logo preview" />` : `<div class="branding-logo-preview empty">OVA</div>`}
        <label>Upload OVA Logo
          <input type="file" accept="image/*" data-branding-logo-input />
          <input type="hidden" name="ovaLogoData" value="${logo}" />
        </label>
      </div>
      <div class="actions"><button type="submit">Save Branding</button>${logo ? `<button type="button" class="secondary" data-clear-branding-logo>Remove Logo</button>` : ""}</div>
    </form>`;
}

async function saveCampusCareLocation(form) {
  const subs = String(form.sublocations.value || "").split(/\n|,/).map(x=>x.trim()).filter(Boolean);
  const id = form.locationId?.value || doc(collection(db, "campusCareLocations")).id;
  await setDoc(doc(db, "campusCareLocations", id), { building: form.building.value.trim(), sublocations: subs, active: true, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
  state.modal = null; await loadCampusCaresAdmin(); showToast("Campus Cares location saved.");
}
async function saveCampusCareStatus(form) {
  const id = form.statusId?.value || doc(collection(db, "campusCareStatuses")).id;
  await setDoc(doc(db, "campusCareStatuses", id), { name: form.name.value.trim(), color: form.color.value || "#fff7cc", sortOrder: Number(form.sortOrder?.value || 0), active: true, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
  state.modal = null; await loadCampusCaresAdmin(); showToast("Campus Cares status saved.");
}
async function hideCampusCareLocation(id){ await updateDoc(doc(db,"campusCareLocations",id), { active:false, updatedAt:serverTimestamp() }); await loadCampusCaresAdmin(); }
async function hideCampusCareStatus(id){ await updateDoc(doc(db,"campusCareStatuses",id), { active:false, updatedAt:serverTimestamp() }); await loadCampusCaresAdmin(); }
async function submitCampusCareRequest(form) {
  const loc = state.campusCareLocations.find(l=>l.id===form.buildingId.value);
  const schoolIds = getUserSchoolIds(state.session);
  const taskRef = doc(collection(db,"campusCareTasks"));
  const taskPayload = {
    usedName: form.usedName.value.trim(), submittedByUid: state.session.uid, submittedByName: getUserUsedName(state.session),
    schoolIds, buildingId: form.buildingId.value, buildingName: loc?.building || "", sublocation: form.sublocation.value,
    taskNeeded: form.taskNeeded.value.trim(), additionalInfo: form.additionalInfo.value.trim(),
    statusId: "", statusName: "", statusColor: "",
    assignedToUids: [], assignedToNames: [], leaderNotes: [], statusUpdates: [], active:true, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  };
  await setDoc(taskRef, taskPayload);
  await createNotificationsForUsers(usersAllowedForNotification("campusSchoolSubmitted", schoolIds).filter(u=>u.uid!==state.session.uid), {
    title: "New Campus Cares request",
    body: `${getUserUsedName(state.session)} submitted: ${taskPayload.taskNeeded}`,
    tool: "campusCares", targetTab: "all", schoolIds, taskId: taskRef.id
  });
  await loadCampusCareTasks(); state.modal=null; state.campusCaresTab = "submitted"; renderCampusCaresTool(); showToast("Campus Cares request submitted.");
}
async function updateCampusTaskStatus(taskId, statusId) {
  const task = state.campusCareTasks.find(t=>t.id===taskId);
  const s = getCampusStatus(statusId);
  await updateDoc(doc(db,"campusCareTasks",taskId), { statusId, statusName:s.name, statusColor:s.color, updatedAt: serverTimestamp() });
  if (task?.submittedByUid && task.submittedByUid !== state.session.uid) {
    const requester = state.users.find(u=>u.uid===task.submittedByUid);
    if (requester && notificationAllowedForUser(requester,"campusOwnStatus") && notificationSettingEnabled(requester,"campusOwnStatus")) {
      await createNotificationsForUsers([requester], { title:"Campus Cares status updated", body:`${task.taskNeeded || "Your request"}: ${s.name || "No status"}`, tool:"campusCares", targetTab:"submitted", schoolIds: campusTaskSchoolIds(task), taskId });
    }
  }
  await loadCampusCareTasks(); renderCampusCaresTool();
}
async function assignCampusTask(taskId, form) {
  const task = state.campusCareTasks.find(t=>t.id===taskId);
  const assignedToUids = Array.from(form.querySelectorAll('input[name="assignedToUids"]:checked')).map(i=>i.value);
  const names = assignedToUids.map(uid => getUserUsedName(state.users.find(u=>u.uid===uid))).filter(Boolean);
  await updateDoc(doc(db,"campusCareTasks",taskId), { assignedToUids, assignedToNames:names, updatedAt: serverTimestamp() });
  const previous = new Set(task?.assignedToUids || []);
  const newlyAssigned = assignedToUids.filter(uid => !previous.has(uid)).map(uid => state.users.find(u=>u.uid===uid));
  await createNotificationsForUsers(newlyAssigned.filter(u=>notificationAllowedForUser(u,"campusAssigned") && notificationSettingEnabled(u,"campusAssigned")), {
    title:"Campus Cares task assigned",
    body:`You were assigned: ${task?.taskNeeded || "Campus Cares task"}`,
    tool:"campusCares", targetTab:"assigned", schoolIds: campusTaskSchoolIds(task), taskId
  });
  state.modal=null; await loadCampusCareTasks(); renderCampusCaresTool(); showToast("Assignment saved.");
}
async function saveCampusTaskNote(form) {
  const task = state.campusCareTasks.find(t=>t.id===form.taskId.value); if (!task) return;
  const now = new Date().toISOString();
  const leaderNotes = [...(task.leaderNotes||[])];
  const statusUpdates = [...(task.statusUpdates||[])];
  const leaderText = form.leaderNote?.value?.trim() || "";
  const statusText = form.statusUpdate?.value?.trim() || "";
  if (leaderText) leaderNotes.push({ text: leaderText, byUid: state.session.uid, byName: getUserUsedName(state.session), at: now });
  const nextStatusUpdates = statusText ? [{ text: statusText, byUid: state.session.uid, byName: getUserUsedName(state.session), at: now }] : statusUpdates;
  await updateDoc(doc(db,"campusCareTasks",task.id), { leaderNotes, statusUpdates: nextStatusUpdates, updatedAt: serverTimestamp() });
  const schoolIds = campusTaskSchoolIds(task);
  if (statusText && task.submittedByUid !== state.session.uid) {
    const requester = state.users.find(u=>u.uid===task.submittedByUid);
    if (requester && notificationAllowedForUser(requester,"campusOwnStatus") && notificationSettingEnabled(requester,"campusOwnStatus")) {
      await createNotificationsForUsers([requester], { title:"Campus Cares status update", body:statusText.slice(0,120), tool:"campusCares", targetTab:"submitted", schoolIds, taskId:task.id });
    }
  }
  if (leaderText) {
    const watchers = usersAllowedForNotification("campusNotes", schoolIds).filter(u=>u.uid!==state.session.uid);
    await createNotificationsForUsers(watchers, { title:"Campus Cares note added", body:leaderText.slice(0,120), tool:"campusCares", targetTab:"all", schoolIds, taskId:task.id });
  }
  await loadCampusCareTasks();
  const updatedTask = state.campusCareTasks.find(t=>t.id===task.id);
  state.modal = { type:"campusCareNotes", task: updatedTask };
  renderCampusCaresTool();
  showToast(statusText ? "Status update saved." : "Leader note added.");
}

async function completeNukeCampusCareRequests(password) {
  if (!password) { state.modal = { ...state.modal, error: "Enter your password to delete Campus Cares requests." }; renderCurrentView(); return; }
  await signInWithEmailAndPassword(auth, state.session.fakeEmail, password);
  const snap = await getDocs(collection(db, "campusCareTasks"));
  await Promise.all(snap.docs.map(d => deleteDoc(doc(db, "campusCareTasks", d.id))));
  state.campusCareTasks = [];
  state.modal = null;
  await loadCampusCareTasks();
  showToast(`Deleted ${snap.docs.length} Campus Cares request${snap.docs.length === 1 ? "" : "s"}.`);
  renderSystemAdmin();
}

async function saveCampusDiscussion(form) {
  const schoolIds = getUserSchoolIds(state.session);
  const discussionRef = doc(collection(db,"campusCareDiscussions"));
  await setDoc(discussionRef, {
    title: form.title.value.trim(),
    description: form.description.value.trim(),
    schoolIds,
    createdByUid: state.session.uid,
    createdByName: getUserUsedName(state.session),
    notes: [], proposedSolution: "", approved:false, approvedByUid:"", approvedByName:"", approvedAt:"",
    active:true, createdAt:serverTimestamp(), updatedAt:serverTimestamp()
  });
  await loadCampusCareDiscussions();
  state.activeCampusDiscussionId = discussionRef.id;
  state.modal = null;
  state.campusCaresTab = "discussions";
  renderCampusCaresTool();
  showToast("Discussion added.");
}

async function saveCampusDiscussionNote(form) {
  const discussion = state.campusCareDiscussions.find(d=>d.id===form.discussionId.value); if(!discussion) return;
  const text = form.note.value.trim(); if(!text) return;
  const notes = [...(discussion.notes||[]), { text, byUid:state.session.uid, byName:getUserUsedName(state.session), at:new Date().toISOString() }];
  await updateDoc(doc(db,"campusCareDiscussions",discussion.id), { notes, updatedAt:serverTimestamp() });
  await loadCampusCareDiscussions();
  state.activeCampusDiscussionId = discussion.id;
  renderCampusCaresTool();
}

async function saveCampusDiscussionSolution(form) {
  const discussion = state.campusCareDiscussions.find(d=>d.id===form.discussionId.value); if(!discussion) return;
  await updateDoc(doc(db,"campusCareDiscussions",discussion.id), { proposedSolution: form.proposedSolution.value.trim(), updatedAt:serverTimestamp() });
  await loadCampusCareDiscussions();
  state.activeCampusDiscussionId = discussion.id;
  renderCampusCaresTool();
  showToast("Proposed solution saved.");
}

async function approveCampusDiscussion(id) {
  await updateDoc(doc(db,"campusCareDiscussions",id), { approved:true, approvedByUid:state.session.uid, approvedByName:getUserUsedName(state.session), approvedAt:new Date().toISOString(), updatedAt:serverTimestamp() });
  await loadCampusCareDiscussions(); state.activeCampusDiscussionId=id; renderCampusCaresTool(); showToast("Solution approved.");
}

async function removeCampusDiscussion(form) {
  const id = form.discussionId.value;
  await updateDoc(doc(db,"campusCareDiscussions",id), { active:false, removedAt:new Date().toISOString(), removedByUid:state.session.uid, removedByName:getUserUsedName(state.session), removalReason:form.reason.value.trim(), updatedAt:serverTimestamp() });
  state.modal=null; state.activeCampusDiscussionId=""; await loadCampusCareDiscussions(); renderCampusCaresTool(); showToast("Discussion removed.");
}

async function createCampusTaskFromDiscussion(form) {
  const discussion = state.campusCareDiscussions.find(d=>d.id===form.discussionId.value); if(!discussion) return;
  const loc = state.campusCareLocations.find(l=>l.id===form.buildingId.value);
  const taskRef = doc(collection(db,"campusCareTasks"));
  const leaderNotes = (discussion.notes||[]).map(n=>({ ...n, text:`Discussion note: ${n.text||""}` }));
  if (discussion.proposedSolution) leaderNotes.push({ text:`Proposed solution: ${discussion.proposedSolution}`, byUid:discussion.approvedByUid||state.session.uid, byName:discussion.approvedByName||getUserUsedName(state.session), at:new Date().toISOString() });
  await setDoc(taskRef, {
    usedName: discussion.createdByName || getUserUsedName(state.session), submittedByUid: discussion.createdByUid || state.session.uid, submittedByName: discussion.createdByName || getUserUsedName(state.session),
    schoolIds: discussion.schoolIds || getUserSchoolIds(state.session), buildingId: form.buildingId.value, buildingName: loc?.building || "", sublocation: form.sublocation.value,
    taskNeeded: form.taskNeeded.value.trim(), additionalInfo: form.additionalInfo.value.trim(), statusId:"", statusName:"", statusColor:"",
    assignedToUids: [], assignedToNames: [], leaderNotes, statusUpdates: [], sourceDiscussionId: discussion.id, active:true, createdAt:serverTimestamp(), updatedAt:serverTimestamp()
  });
  await updateDoc(doc(db,"campusCareDiscussions",discussion.id), { convertedToTaskId:taskRef.id, convertedAt:new Date().toISOString(), updatedAt:serverTimestamp() });
  state.modal=null; state.campusCaresTab="all"; await Promise.all([loadCampusCareTasks(), loadCampusCareDiscussions()]); renderCampusCaresTool(); showToast("Discussion converted to a Campus Cares task.");
}
function renderCampusCaresAdminTab(){
  return `<div class="grid two"><div class="card subtle-card"><h3>Locations</h3><button type="button" data-modal="addCampusCareLocation">Add Building / Sublocations</button><div class="admin-list">${state.campusCareLocations.map(l=>`<div class="admin-list-row"><span><strong>${escapeHtml(l.building)}</strong><small>${escapeHtml((l.sublocations||[]).join(", "))}</small></span><span><button type="button" class="small secondary" data-edit-campus-location="${l.id}">Edit</button><button type="button" class="small danger" data-delete-campus-location="${l.id}">Hide</button></span></div>`).join("") || `<div class="empty">No locations yet.</div>`}</div></div><div class="card subtle-card"><h3>Status List</h3><button type="button" data-modal="addCampusCareStatus">Add Status</button><div class="admin-list">${state.campusCareStatuses.map(st=>`<div class="admin-list-row" style="border-left:8px solid ${st.color||'#fff7cc'}"><span><strong>${escapeHtml(st.name)}</strong><small>${escapeHtml(st.color||"")}</small></span><span><button type="button" class="small secondary" data-edit-campus-status="${st.id}">Edit</button><button type="button" class="small danger" data-delete-campus-status="${st.id}">Hide</button></span></div>`).join("") || `<div class="empty">No statuses yet.</div>`}</div></div></div>`;
}
function renderCampusCaresTool(){
  state.currentView="campusCares";
  const canSubmit = hasToolPermission(state.session,"campusCares","submit") || hasFullDevAccess(state.session);
  const canAssigned = hasToolPermission(state.session,"campusCares","assigned") || hasToolPermission(state.session,"campusCares","manage") || hasFullDevAccess(state.session);
  const canViewAll = hasToolPermission(state.session,"campusCares","viewAll") || hasToolPermission(state.session,"campusCares","manage") || hasFullDevAccess(state.session);
  const canManage = hasToolPermission(state.session,"campusCares","manage") || hasFullDevAccess(state.session);
  const tabs=[];
  if(canSubmit) tabs.push(['submitted','Tasks I Have Submitted']);
  if(canAssigned) tabs.push(['assigned','Tasks Assigned To Me']);
  if(canViewAll) tabs.push(['all','All Tasks']);
  if(canViewAll || canManage || canSubmit) tabs.push(['discussions','Ongoing Discussions']);
  if(canManage) tabs.push(['completed','Completed Tasks']);
  if(!tabs.length) tabs.push(['submitted','Tasks I Have Submitted']);
  if(!tabs.some(t=>t[0]===state.campusCaresTab)) state.campusCaresTab=tabs[0][0];
  const submitButton = canSubmit ? `<button type="button" data-open-campus-submit>Submit a Request</button>` : "";
  $app.innerHTML=pageShell(`<section class="card"><div class="tool-heading-row"><h2>Campus Cares</h2>${submitButton}</div><div class="nav-tabs">${tabs.map(([k,l])=>`<button class="${state.campusCaresTab===k?'active':''}" data-campus-tab="${k}">${l}</button>`).join('')}</div>${state.campusCaresTab==='discussions'?renderCampusDiscussionsTab(canManage):renderCampusCareTable(state.campusCaresTab,canManage)}</section>${state.modal?renderModal():""}${state.toast?`<div class="toast">${state.toast}</div>`:""}`);
}
function renderCampusCareSubmitForm(){
  const u=state.session||{}; const defaultBuilding=u.defaultCampusCareBuildingId||""; const loc=state.campusCareLocations.find(l=>l.id===defaultBuilding)||state.campusCareLocations[0]; const defaultSub=u.defaultCampusCareSublocation||"";
  return `<form id="campusCareRequestForm" class="stack"><label>Used Name<input name="usedName" required value="${escapeHtml(getUserUsedName(u))}"></label><div class="grid two"><label>Building<select name="buildingId" data-campus-building required>${state.campusCareLocations.map(l=>`<option value="${l.id}" ${loc?.id===l.id?'selected':''}>${escapeHtml(l.building)}</option>`).join('')}</select></label><label>Sublocation<select name="sublocation" data-campus-sublocation required>${(loc?.sublocations||[]).map(sl=>`<option ${defaultSub===sl?'selected':''}>${escapeHtml(sl)}</option>`).join('')}</select></label></div><label>Task Needed<input name="taskNeeded" required maxlength="160" placeholder="What needs to be done?"></label><label>Additional Information <input name="additionalInfo" maxlength="240" placeholder="Optional details"></label><button>Submit Request</button></form>`;
}
function campusTasksForTab(tab){ let tasks=state.campusCareTasks.filter(t=>t.active!==false).filter(t=>campusTaskInUserScope(t)); if(tab==='submitted') tasks=tasks.filter(t=>t.submittedByUid===state.session.uid&&!isCampusCompleted(t)); if(tab==='assigned') tasks=tasks.filter(t=>(t.assignedToUids||[]).includes(state.session.uid)&&!isCampusCompleted(t)); if(tab==='all') tasks=tasks.filter(t=>!isCampusCompleted(t)); if(tab==='completed') tasks=tasks.filter(isCampusCompleted); return tasks; }
function campusStatusDisplay(t) { const updates = campusNoteList(t.statusUpdates||[]); if (!updates.length) return `<span class="muted">No status update yet.</span>`; const latest=updates[updates.length-1]; return `<div class="inline-status-update"><strong>${escapeHtml(latest.byName||'Status')}</strong> <small>${campusShortStamp(latest.at)}</small><p>${escapeHtml(latest.text||'')}</p></div>`; }
function renderCampusCareTable(tab,canManage){ const tasks=campusTasksForTab(tab); return `<div class="sheet-scroll"><table class="campus-sheet"><thead><tr><th>Status</th><th>Submitted</th><th>Submitted By</th><th>Location</th><th>Task Needed</th><th>Additional Info</th><th>Status Update</th><th>Assign Task</th></tr></thead><tbody>${tasks.map(t=>renderCampusCareRow(t,canManage)).join('') || `<tr><td colspan="8" class="empty">No tasks here yet.</td></tr>`}</tbody></table></div>`; }
function renderCampusCareRow(t,canManage){ const st=getCampusStatus(t.statusId); const statusCell = canManage ? `<select data-campus-status-change="${t.id}"><option value="" ${!t.statusId?'selected':''}>No status</option>${state.campusCareStatuses.map(s=>`<option value="${s.id}" ${s.id===t.statusId?'selected':''}>${escapeHtml(s.name)}</option>`).join('')}</select>` : escapeHtml(st.name || ""); const assignCell = canManage ? `<button type="button" class="small secondary" data-campus-assign="${t.id}">Assign (${(t.assignedToNames||[]).length})</button>` : escapeHtml((t.assignedToNames||[]).join(', ')); return `<tr style="background:${st.color||t.statusColor||''}"><td>${statusCell}</td><td>${campusDate(t.createdAt)}<br><small>${campusTime(t.createdAt)}</small></td><td>${escapeHtml(t.usedName||t.submittedByName||'')}</td><td>${escapeHtml(`${t.buildingName||''}, ${t.sublocation||''}`)}</td><td>${escapeHtml(t.taskNeeded||'')}</td><td>${escapeHtml(t.additionalInfo||'')}</td><td>${campusStatusDisplay(t)}${canManage?`<button type="button" class="small secondary" data-campus-notes="${t.id}">Notes / Status</button>`:''}</td><td>${assignCell}</td></tr>`; }

function renderCampusDiscussionsTab(canManage) {
  const discussions = activeCampusDiscussions();
  const active = discussions.find(d=>d.id===state.activeCampusDiscussionId) || discussions[0];
  const list = discussions.map(d=>`<button type="button" class="discussion-list-item ${active?.id===d.id?'active':''}" data-open-campus-discussion="${d.id}"><strong>${escapeHtml(d.title||'Discussion')}</strong><small>${escapeHtml(d.description||'')}</small>${d.approved?'<span class="pill good">Approved</span>':''}</button>`).join('') || '<div class="empty">No discussions yet.</div>';
  return `<div class="campus-discussions"><aside class="discussion-list"><div class="tool-heading-row"><h3>Ongoing Discussions</h3><button type="button" class="small" data-modal="addCampusDiscussion">Add Discussion</button></div>${list}</aside><main class="discussion-detail">${active?renderCampusDiscussionDetail(active,canManage):'<div class="empty">Add a discussion to start talking through ideas and possible solutions.</div>'}</main></div>`;
}
function renderCampusDiscussionDetail(d, canManage) {
  const notes = campusNoteList(d.notes||[]);
  const bubble = n => `<div class="chat-note ${n.byUid===state.session.uid?'mine':'theirs'}"><div class="chat-note-line"><strong>${escapeHtml(n.byName||'')}</strong><small>${campusShortStamp(n.at)}</small><span>${escapeHtml(n.text||'')}</span></div></div>`;
  return `<div class="discussion-panel"><div class="tool-heading-row"><div><h3>${escapeHtml(d.title||'Discussion')}</h3><p class="helper">${escapeHtml(d.description||'')}</p></div>${d.approved?`<span class="pill good">Approved by ${escapeHtml(d.approvedByName||'leader')}</span>`:''}</div><div class="chat-thread discussion-chat">${notes.map(bubble).join('')||'<p class="empty">No notes yet.</p>'}</div><form id="campusDiscussionNoteForm" class="chat-input-row"><input type="hidden" name="discussionId" value="${d.id}"><input name="note" placeholder="Add a note..." autocomplete="off" required><button>Add</button></form><form id="campusDiscussionSolutionForm" class="stack proposed-solution-box"><input type="hidden" name="discussionId" value="${d.id}"><label>Proposed Solution<textarea name="proposedSolution" rows="3">${escapeHtml(d.proposedSolution||'')}</textarea></label><div class="actions"><button type="submit">Save Proposed Solution</button>${canManage?`<button type="button" class="secondary" data-approve-campus-discussion="${d.id}">Approve</button><button type="button" class="secondary" data-convert-campus-discussion="${d.id}">Make Campus Cares Task</button><button type="button" class="danger" data-remove-campus-discussion="${d.id}">Remove</button>`:''}</div></form></div>`;
}

function renderSystemAdmin() {
  state.currentView = "systemAdmin";
  if (!canUseSystemAdmin(state.session)) {
    renderHome();
    return;
  }

  $app.innerHTML = pageShell(`
    <section class="card">
      <h2>System Admin Panel</h2>
      <p class="helper">Configure the app foundation that leaders use.</p>
      <div class="nav-tabs">
        <button class="${state.adminTab === "schools" ? "active" : ""}" data-tab="schools">Schools</button>
        <button class="${state.adminTab === "positions" ? "active" : ""}" data-tab="positions">Positions</button>
        <button class="${state.adminTab === "roles" ? "active" : ""}" data-tab="roles">Roles</button>
        <button class="${state.adminTab === "tools" ? "active" : ""}" data-tab="tools">Tools</button>
        <button class="${state.adminTab === "moneyRequests" ? "active" : ""}" data-tab="moneyRequests">Money Requests</button>
        <button class="${state.adminTab === "campusCares" ? "active" : ""}" data-tab="campusCares">Campus Cares</button>
        <button class="${state.adminTab === "notifications" ? "active" : ""}" data-tab="notifications">Notifications</button>
        <button class="${state.adminTab === "branding" ? "active" : ""}" data-tab="branding">Branding</button>
      </div>

      ${state.adminTab === "schools" ? `
        <div class="actions" style="justify-content:flex-start;">
          <button data-modal="addSchool">Add New School</button>
        </div>
        <div class="name-grid admin-name-grid">
          ${state.schools.length ? state.schools.map(s => `
            <button class="name-button" data-edit-school="${s.id}" type="button">
              ${s.name}
              <span>${s.code || ""}</span>
            </button>
          `).join("") : `<div class="empty grid-empty">No schools yet.</div>`}
        </div>
      ` : ""}

      ${state.adminTab === "positions" ? `
        <div class="actions" style="justify-content:flex-start;">
          <button data-modal="addPosition">Add New Position</button>
        </div>
        <div class="name-grid admin-name-grid">
          ${state.positions.length ? state.positions.map(p => `
            <button class="name-button" data-edit-position="${p.id}" type="button">
              ${p.name}
              <span>${p.classNumber ? `Class ${p.classNumber}` : "No class number"}</span>
            </button>
          `).join("") : `<div class="empty grid-empty">No positions yet.</div>`}
        </div>
      ` : ""}

      ${state.adminTab === "roles" ? `
        <div class="actions" style="justify-content:flex-start;">
          <button data-modal="addRole">Add New Role</button>
        </div>
        <div class="name-grid admin-name-grid">
          ${state.roles.length ? state.roles.map(r => `
            <button class="name-button" data-edit-role="${r.id}" type="button">
              ${r.name}
              <span>${r.key || ""}</span>
            </button>
          `).join("") : `<div class="empty grid-empty">No roles yet.</div>`}
        </div>
      ` : ""}

      ${state.adminTab === "tools" ? renderToolsTab() : ""}

      ${state.adminTab === "branding" ? renderBrandingSettingsTab() : ""}

      ${state.adminTab === "campusCares" ? `${isSystemAdmin(state.session) ? `<div class="card subtle-card danger-zone"><h3>Dev Testing Cleanup</h3><p class="helper">Deletes every Campus Cares request in Firestore. Use only for testing cleanup.</p><button class="danger" type="button" data-nuke-campus-care-requests>Nuke All Campus Cares Requests</button></div>` : ""}${renderCampusCaresAdminTab()}` : ""}

      ${state.adminTab === "moneyRequests" ? `
        ${isSystemAdmin(state.session) ? `<div class="card subtle-card danger-zone"><h3>Dev Testing Cleanup</h3><p class="helper">Deletes every money request in Firestore. Use only for testing cleanup.</p><button class="danger" type="button" data-nuke-money-requests>Nuke All Money Requests</button></div>` : ""}
        <div class="actions" style="justify-content:flex-start;">
          <button data-modal="addMoneyRequestType">Add Request Type</button>
        </div>

        <div class="name-grid admin-name-grid">
          ${state.moneyRequestTypes.length ? state.moneyRequestTypes.map(t => `
            <button class="name-button" data-edit-request-type="${t.id}" type="button">
              ${t.name}
              <span>${(t.fields || []).length} fields</span>
            </button>
          `).join("") : `<div class="empty grid-empty">No request types yet.</div>`}
        </div>
      ` : ""}


    </section>
    ${state.modal ? renderModal() : ""}
    ${renderPhotoContextMenu()}
    ${renderPhotoPrintDuplicatePrompt()}
    ${state.toast ? `<div class="toast">${state.toast}</div>` : ""}
  `);
}

function renderAdmin() {
  renderSystemAdmin();
}

function renderModal() {
  if (state.modal.type === "login") {
    const u = state.modal.user;
    return `
      <div class="modal-backdrop"><form class="modal card" id="loginForm" autocomplete="off">
        <h2>${u.firstName} ${u.lastName}</h2>
        <p class="helper">${u.passwordSet ? "Enter your password." : "Enter your 4-digit PIN."}</p>
        ${passwordFieldHtml("credential", u.passwordSet ? "Password" : "PIN", { autocomplete: u.passwordSet ? "new-password" : "one-time-code", inputmode: u.passwordSet ? "text" : "numeric", maxlength: u.passwordSet ? "99" : "4" })}
        <label class="stay-login-toggle">
          <input type="checkbox" name="stayLoggedIn" ${getStayLoggedInPreference() ? "checked" : ""} />
          <span class="stay-switch" aria-hidden="true"></span>
          <span class="stay-text">Stay logged in on this device</span>
        </label>
        ${modalErrorHtml()}
        <div class="actions"><button>Login</button><button type="button" class="secondary" data-close-modal>Cancel</button></div>
      </form></div>`;
  }

  if (state.modal.type === "adminPasswordLogin") {
    const u = state.modal.user;
    return `
      <div class="modal-backdrop"><form class="modal card" id="adminPasswordLoginForm" autocomplete="off">
        <h2>Admin / Leader Login</h2>
        <p class="helper">Logging in as <strong>${u.firstName} ${u.lastName}</strong>.</p>
        ${passwordFieldHtml("password", "Password", { autocomplete: "new-password" })}
        <label class="stay-login-toggle">
          <input type="checkbox" name="stayLoggedIn" ${getStayLoggedInPreference() ? "checked" : ""} />
          <span class="stay-switch" aria-hidden="true"></span>
          <span class="stay-text">Stay logged in on this device</span>
        </label>
        ${modalErrorHtml()}
        <div class="actions"><button>Log In</button><button type="button" class="secondary" data-close-modal>Cancel</button></div>
      </form></div>`;
  }

  if (state.modal.type === "approvalPassword") {
    const count = state.modal.ids?.length || 0;
    const label = state.modal.stage === "pendingDoso" ? "DOSO approval" : "Owner approval";
    return `
      <div class="modal-backdrop"><form class="modal card" id="approvalPasswordForm" autocomplete="off">
        <h2>Confirm ${label}</h2>
        <p class="helper">Enter your password once to approve ${count} request${count === 1 ? "" : "s"}.</p>
        ${passwordFieldHtml("password", "Password")}
        ${modalErrorHtml()}
        <div class="actions"><button>Approve ${count}</button><button type="button" class="secondary" data-close-modal>Cancel</button></div>
      </form></div>`;
  }

  if (state.modal.type === "selfDosoApproval") {
    const count = state.modal.ids?.length || 1;
    return `
      <div class="modal-backdrop"><form class="modal card" id="selfDosoApprovalForm" autocomplete="off">
        <h2>Approve your request?</h2>
        <p class="helper">As the DOSO of this school, you can automatically approve your own request. Please type in your password to approve this request.</p>
        ${passwordFieldHtml("password", "Password", { autocomplete: "new-password" })}
        ${modalErrorHtml()}
        <div class="actions"><button>Approve ${count}</button><button type="button" class="secondary" data-close-modal>Cancel</button></div>
      </form></div>`;
  }

  if (state.modal.type === "editDeniedMoneyRequest") {
    return renderEditDeniedMoneyRequestModal(state.modal.request);
  }

  if (state.modal.type === "denyMoneyRequest") {
    return `
      <div class="modal-backdrop"><form class="modal card" id="denyMoneyRequestForm">
        <h2>Deny request</h2>
        <p class="helper">Add a note so the leader knows what to change before resubmitting.</p>
        <label>Reason
          <textarea name="denialNote" required placeholder="What needs to be fixed?"></textarea>
        </label>
        ${modalErrorHtml()}
        <div class="actions"><button class="danger">Deny Request</button><button type="button" class="secondary" data-close-modal>Cancel</button></div>
      </form></div>`;
  }

  if (state.modal.type === "nukeMoneyRequests") {
    return `
      <div class="modal-backdrop"><form class="modal card" id="nukeMoneyRequestsForm" autocomplete="off">
        <h2>Nuke all money requests?</h2>
        <p class="helper">This will delete every money request. Enter your password to confirm.</p>
        ${passwordFieldHtml("password", "Password")}
        ${modalErrorHtml()}
        <div class="actions"><button class="danger">Delete All Money Requests</button><button type="button" class="secondary" data-close-modal>Cancel</button></div>
      </form></div>`;
  }

  if (state.modal.type === "forcePasswordSetup") {
    return `
      <div class="modal-backdrop"><form class="modal card" id="passwordSetupForm">
        <h2>Create your password</h2>
        <p class="helper">Your account now requires a password. You will use this for future logins.</p>
        ${passwordFieldHtml("password", "New password", { autocomplete: "new-password", minlength: 8 })}
        ${modalErrorHtml()}
        <div class="actions"><button>Save Password</button></div>
      </form></div>`;
  }

  if (state.modal.type === "forcePinChange") {
    return `
      <div class="modal-backdrop"><form class="modal card" id="pinChangeForm">
        <h2>Choose a new PIN</h2>
        <p class="helper">Your PIN was reset. Please choose a new 4-digit PIN.</p>
        ${passwordFieldHtml("pin", "New PIN", { autocomplete: "one-time-code", inputmode: "numeric", maxlength: 4, pattern: "[0-9]{4}" })}
        <div class="actions"><button>Save PIN</button></div>
      </form></div>`;
  }

  if (state.modal.type === "addSchool" || state.modal.type === "editSchool") {
    const s = state.modal.school || {};
    const isEdit = state.modal.type === "editSchool";
    return `
      <div class="modal-backdrop"><form class="modal card" id="${isEdit ? "editSchoolForm" : "schoolForm"}">
        <h2>${isEdit ? "Edit School" : "Add School"}</h2>
        <div class="grid two">
          <label>School Name <input name="name" required placeholder="Holly Springs" value="${s.name || ""}" /></label>
          <label>School Code <input name="code" required placeholder="OVAHS" value="${s.code || ""}" /></label>
        </div>
        <label>Address <input name="address" value="${s.address || ""}" /></label>
        <label>Phone <input name="phone" value="${s.phone || ""}" /></label>
        <div class="actions">
          <button>${isEdit ? "Save Changes" : "Save School"}</button>
          <button type="button" class="secondary" data-close-modal>Cancel</button>
        </div>
      </form></div>`;
  }

  if (state.modal.type === "addPosition" || state.modal.type === "editPosition") {
    const p = state.modal.position || {};
    const isEdit = state.modal.type === "editPosition";
    return `
      <div class="modal-backdrop"><form class="modal card" id="${isEdit ? "editPositionForm" : "positionForm"}">
        <h2>${isEdit ? "Edit Position" : "Add Position"}</h2>
        <div class="grid two">
          <label>House / Position Name <input name="house" required placeholder="Infant, Toddler, DOSO..." value="${p.house || p.name || ""}" /></label>
          <label>Class Number <input name="classNumber" placeholder="1, 2, 3..." value="${p.classNumber || ""}" /></label>
        </div>
        <p class="helper">Examples: House = Infant and Class Number = 1 becomes "Infant 1". House = DOSO with no class number stays "DOSO".</p>
        <div class="actions">
          <button>${isEdit ? "Save Changes" : "Save Position"}</button>
          ${isEdit ? `<button type="button" class="danger" data-delete-position="${p.id}">Hide</button>` : ""}
          <button type="button" class="secondary" data-close-modal>Cancel</button>
        </div>
      </form></div>`;
  }

  if (state.modal.type === "addRole" || state.modal.type === "editRole") {
    const r = state.modal.role || {};
    const isEdit = state.modal.type === "editRole";
    return `
      <div class="modal-backdrop"><form class="modal card wide-modal" id="${isEdit ? "editRoleForm" : "roleForm"}">
        <h2>${isEdit ? "Edit Role" : "Add Role"}</h2>
        <div class="grid two">
          <label>Role Name <input name="name" required placeholder="DOSO" value="${r.name || ""}" /></label>
          <label>Role Key <input name="key" required placeholder="doso" value="${r.key || ""}" /></label>
        </div>
        <label>Description <input name="description" value="${r.description || ""}" /></label>

        <p class="helper">Use the Permissions tab to assign tools and tool parts to this role.</p>

        <div class="actions">
          <button>${isEdit ? "Save Changes" : "Save Role"}</button>
          ${isEdit ? `<button type="button" class="danger" data-delete-role="${r.id}">Hide</button>` : ""}
          <button type="button" class="secondary" data-close-modal>Cancel</button>
        </div>
      </form></div>`;
  }

  
  

  if (state.modal.type === "addBudgetCode" || state.modal.type === "editBudgetCode") {
    const budgetCode = state.modal.budgetCode || {};
    const isEdit = state.modal.type === "editBudgetCode";

    return `
      <div class="modal-backdrop">
        <form class="modal card" id="${isEdit ? "editBudgetCodeForm" : "budgetCodeForm"}">
          <h2>${isEdit ? "Edit Budget Code" : "Add Budget Code"}</h2>

          <div class="grid two">
            <label>
              Code
              <input name="code" required value="${budgetCode.code || ""}" />
            </label>

            <label>
              Category
              <input name="category" required value="${budgetCode.category || ""}" />
            </label>
          </div>
          <div class="card subtle-card">
            <label class="check-row"><input type="checkbox" name="allSchools" ${(budgetCode.allSchools !== false) ? "checked" : ""} /> Applies to all schools</label>
            <p class="helper">Uncheck this only when a budget should be limited to specific locations.</p>
            <div class="checkbox-grid compact-school-grid">
              ${state.schools.map(s => `<label><input type="checkbox" name="budgetSchoolIds" value="${s.id}" ${(budgetCode.allSchools !== false || (budgetCode.schoolIds || []).includes(s.id)) ? "checked" : ""} /> ${s.name}</label>`).join("")}
            </div>
          </div>

          <div class="actions">
            <button>${isEdit ? "Save Changes" : "Create Budget Code"}</button>
            ${isEdit ? `<button type="button" class="danger" data-delete-budget-code="${budgetCode.id}">Hide</button>` : ""}
            <button type="button" class="secondary" data-close-modal>Cancel</button>
          </div>
        </form>
      </div>
    `;
  }

if (state.modal.type === "addMoneyRequestType" || state.modal.type === "editMoneyRequestType") {
    const requestType = state.modal.requestType || {};
    const isEdit = state.modal.type === "editMoneyRequestType";
    const fields = requestType.fields || [];

    return `
      <div class="modal-backdrop">
        <form class="modal card wide-modal" id="${isEdit ? "editMoneyRequestTypeForm" : "moneyRequestTypeForm"}">
          <h2>${isEdit ? "Edit Request Type" : "Add Request Type"}</h2>

          <label>
            Request Type Name
            <input name="name" required placeholder="Purchase Order" value="${requestType.name || ""}" />
          </label>

          <div class="request-builder">
            <div class="request-builder-header">
              <h3>Fields</h3>
              <button type="button" class="secondary small" data-add-request-field>Add Field</button>
            </div>

            <div id="requestFieldContainer">
              ${(fields.length ? fields : [{}]).map(field => `
                <div class="request-field-row">
                  <input name="fieldLabel" placeholder="Field Label" value="${field.label || ""}" />

                  <select name="fieldType">
                    <option value="text" ${(field.type || "text") === "text" ? "selected" : ""}>Text</option>
                    <option value="number" ${field.type === "number" ? "selected" : ""}>Number</option>
                    <option value="money" ${field.type === "money" ? "selected" : ""}>Money</option>
                    <option value="date" ${field.type === "date" ? "selected" : ""}>Date</option>
                    <option value="longText" ${field.type === "longText" ? "selected" : ""}>Long Text</option>
                    <option value="dropdown" ${field.type === "dropdown" ? "selected" : ""}>Dropdown</option>
                  </select>

                  <label class="checkbox-inline">
                    <input type="checkbox" name="fieldRequired" ${field.required ? "checked" : ""} />
                    Required
                  </label>

                  <button type="button" class="danger small" data-remove-request-field>Remove</button>
                </div>
              `).join("")}
            </div>
          </div>

          <div class="actions">
            <button>${isEdit ? "Save Changes" : "Create Request Type"}</button>
            ${isEdit ? `<button type="button" class="danger" data-delete-request-type="${requestType.id}">Hide</button>` : ""}
            <button type="button" class="secondary" data-close-modal>Cancel</button>
          </div>
        </form>
      </div>
    `;
  }



  if (state.modal.type === "campusCareSubmit") {
    return `<div class="modal-backdrop"><div class="modal card wide-modal"><div class="tool-heading-row"><h2>Submit a Campus Cares Request</h2><button type="button" class="secondary small" data-close-modal>Close</button></div>${renderCampusCareSubmitForm()}<p class="helper">This window only closes when you submit or click Close, so clicking outside will not erase your progress.</p></div></div>`;
  }
  if (["addCampusCareLocation","editCampusCareLocation"].includes(state.modal.type)) {
    const l = state.modal.location || {}; const isEdit=state.modal.type==="editCampusCareLocation";
    return `<div class="modal-backdrop"><form class="modal card" id="campusCareLocationForm"><h2>${isEdit?'Edit':'Add'} Campus Cares Location</h2><input type="hidden" name="locationId" value="${l.id||''}"><label>Building<input name="building" required value="${escapeHtml(l.building||'')}"></label><label>Sublocations<textarea name="sublocations" rows="6" placeholder="One per line">${escapeHtml((l.sublocations||[]).join('\n'))}</textarea></label><div class="actions"><button>Save Location</button><button type="button" class="secondary" data-close-modal>Cancel</button></div></form></div>`;
  }
  if (["addCampusCareStatus","editCampusCareStatus"].includes(state.modal.type)) {
    const st = state.modal.status || {}; const isEdit=state.modal.type==="editCampusCareStatus";
    return `<div class="modal-backdrop"><form class="modal card" id="campusCareStatusForm"><h2>${isEdit?'Edit':'Add'} Campus Cares Status</h2><input type="hidden" name="statusId" value="${st.id||''}"><label>Status Name<input name="name" required value="${escapeHtml(st.name||'')}"></label><label>Highlight Color<input type="color" name="color" value="${st.color||'#fff7cc'}"></label><label>Sort Order<input type="number" name="sortOrder" value="${st.sortOrder||0}"></label><div class="actions"><button>Save Status</button><button type="button" class="secondary" data-close-modal>Cancel</button></div></form></div>`;
  }
  if (state.modal.type === "campusCareNotes") {
    const t = state.modal.task || {}; const canManage=hasToolPermission(state.session,"campusCares","manage")||hasFullDevAccess(state.session);
    const statusNotes = campusNoteList(t.statusUpdates||[]);
    const leaderNotes = campusNoteList(t.leaderNotes||[]);
    const bubble = n => `<div class="chat-note ${n.byUid===state.session.uid?'mine':'theirs'}"><div class="chat-note-line"><strong>${escapeHtml(n.byName||'')}</strong><small>${campusShortStamp(n.at)}</small><span>${escapeHtml(n.text||'')}</span></div></div>`;
    return `<div class="modal-backdrop"><div class="modal card extra-wide-modal"><div class="tool-heading-row"><h2>${canManage?'Notes / Status':'Status Updates'}</h2><button type="button" class="secondary small" data-close-modal>Close</button></div><div class="campus-notes-layout"><section class="note-thread"><h3>Status Update</h3><div class="chat-thread">${statusNotes.map(bubble).join('')||'<p class="empty">No status update yet.</p>'}</div>${canManage?`<form id="campusCareNotesForm" class="chat-input-row"><input type="hidden" name="taskId" value="${t.id}"><input name="statusUpdate" placeholder="Replace teacher-visible status update..." autocomplete="off"><input type="hidden" name="leaderNote" value=""><button>Save</button></form>`:''}</section>${canManage?`<section class="note-thread leader-note-thread"><h3>Leader Notes</h3><div class="chat-thread">${leaderNotes.map(bubble).join('')||'<p class="empty">No leader notes yet.</p>'}</div><form id="campusCareLeaderNotesForm" class="chat-input-row"><input type="hidden" name="taskId" value="${t.id}"><input type="hidden" name="statusUpdate" value=""><input name="leaderNote" placeholder="Add leader note..." autocomplete="off"><button>Add</button></form></section>`:''}</div></div></div>`;
  }
  if (state.modal.type === "campusCareAssign") {
    const t = state.modal.task || {};
    return `<div class="modal-backdrop"><form class="modal card" data-campus-assign-form="${t.id}"><div class="tool-heading-row"><h2>Assign Task</h2><button type="button" class="secondary small" data-close-modal>Close</button></div><p class="helper">Choose who this task is assigned to. Only same-location leaders/owners are shown.</p><div class="assign-checklist">${campusLeaderUsers().map(u=>`<label><input type="checkbox" name="assignedToUids" value="${u.uid}" ${(t.assignedToUids||[]).includes(u.uid)?'checked':''}> ${escapeHtml(getUserUsedName(u))}</label>`).join('') || '<div class="empty">No assignable users found for this location.</div>'}</div><div class="actions"><button>Save Assignment</button><button type="button" class="secondary" data-close-modal>Cancel</button></div></form></div>`;
  }

  if (state.modal.type === "addCampusDiscussion") {
    return `<div class="modal-backdrop"><form class="modal card" id="campusDiscussionForm"><h2>Add Ongoing Discussion</h2><p class="helper">Use this for ongoing issues, recurring conversations, or recommendations that need discussion before becoming a task.</p><label>Short Description / Title<input name="title" required maxlength="120" placeholder="Example: Playground pickup flow"></label><label>Details<textarea name="description" rows="4" required placeholder="What should we talk through?"></textarea></label><div class="actions"><button>Add Discussion</button><button type="button" class="secondary" data-close-modal>Cancel</button></div></form></div>`;
  }
  if (state.modal.type === "removeCampusDiscussion") {
    const d = state.modal.discussion || {};
    return `<div class="modal-backdrop"><form class="modal card" id="removeCampusDiscussionForm"><h2>Remove discussion?</h2><p class="helper">By removing this discussion you are concluding that this discussion is not something that will be addressed right now. You may add a reason if you like.</p><input type="hidden" name="discussionId" value="${d.id||''}"><label>Reason <textarea name="reason" rows="3" placeholder="Optional"></textarea></label><div class="actions"><button class="danger">Remove Discussion</button><button type="button" class="secondary" data-close-modal>Cancel</button></div></form></div>`;
  }
  if (state.modal.type === "campusDiscussionToTask") {
    const d = state.modal.discussion || {}; const loc = state.campusCareLocations[0];
    return `<div class="modal-backdrop"><form class="modal card wide-modal" id="campusDiscussionToTaskForm"><h2>Make Campus Cares Task</h2><input type="hidden" name="discussionId" value="${d.id||''}"><label>Task Needed<input name="taskNeeded" required value="${escapeHtml(d.title||'')}"></label><label>Additional Info<textarea name="additionalInfo" rows="3">${escapeHtml((d.description||'') + (d.proposedSolution ? '\n\nProposed solution: ' + d.proposedSolution : ''))}</textarea></label><div class="grid two"><label>Building<select name="buildingId" data-campus-building required>${state.campusCareLocations.map(l=>`<option value="${l.id}" ${loc?.id===l.id?'selected':''}>${escapeHtml(l.building)}</option>`).join('')}</select></label><label>Sublocation<select name="sublocation" data-campus-sublocation required>${(loc?.sublocations||[]).map(sl=>`<option>${escapeHtml(sl)}</option>`).join('')}</select></label></div><div class="actions"><button>Create Task</button><button type="button" class="secondary" data-close-modal>Cancel</button></div></form></div>`;
  }
  if (state.modal.type === "nukeCampusCareRequests") {
    return `<div class="modal-backdrop"><form class="modal card" id="nukeCampusCareRequestsForm" autocomplete="off"><h2>Nuke all Campus Cares requests?</h2><p class="helper">This will delete every Campus Cares request. Enter your password to confirm.</p>${passwordFieldHtml("password", "Password")}${modalErrorHtml()}<div class="actions"><button class="danger">Delete All Campus Cares Requests</button><button type="button" class="secondary" data-close-modal>Cancel</button></div></form></div>`;
  }

if (state.modal.type === "publicWhatILike") {
    const u = state.modal.user || {};
    return `<div class="modal-backdrop"><div class="modal card profile-edit-modal public-likes-modal">
      <div class="tool-heading-row"><h2>${escapeHtml(getUserUsedName(u))}</h2><button type="button" class="secondary small" data-close-modal>Close</button></div>
      <p class="helper">${escapeHtml(u.teamPosition || "Oak Village Academy Team Member")}</p>
      ${renderWhatILikeDisplay(u, true)}
    </div></div>`;
  }

if (state.modal.type === "coreVoteRound") {
  return renderCoreVoteRoundModal(state.modal.monthKey);
}

if (state.modal.type === "coreNominate") {
  const u = getCoreUser(state.modal.uid);
  return `<div class="modal-backdrop"><form class="modal card wide-modal" id="coreNominationForm"><h2>Nominate ${escapeHtml(getUserUsedName(u)||"Team Member")}</h2><input type="hidden" name="monthKey" value="${escapeHtml(state.modal.monthKey)}" /><input type="hidden" name="candidateUid" value="${escapeHtml(state.modal.uid)}" /><label>Reason<textarea name="reason" required placeholder="Why should this person be Core Count Champion?"></textarea></label><div class="actions"><button>Lock In Nominee</button><button type="button" class="secondary" data-close-modal>Cancel</button></div></form></div>`;
}
if (state.modal.type === "coreVote") {
  const u = getCoreUser(state.modal.uid);
  return `<div class="modal-backdrop"><form class="modal card wide-modal" id="coreVoteForm"><h2>Vote for ${escapeHtml(getUserUsedName(u)||"Team Member")}</h2><input type="hidden" name="monthKey" value="${escapeHtml(state.modal.monthKey)}" /><input type="hidden" name="candidateUid" value="${escapeHtml(state.modal.uid)}" /><label>Reason<textarea name="reason" required placeholder="Add your reason for supporting this nominee."></textarea></label><div class="actions"><button>Save Vote</button><button type="button" class="secondary" data-close-modal>Cancel</button></div></form></div>`;
}

if (state.modal.type === "selfProfile") {
    const u = state.modal.user || state.session || {};
    const section = state.modal.section || "details";
    const title = section === "education" ? "Edit Education" : section === "story" ? "Edit Early Education Story" : section === "likes" ? "Edit What I Like" : "Edit Profile Details";
    let body = "";
    if (section === "education") {
      body = `${renderEducationBuilder(u)}`;
    } else if (section === "story") {
      body = `<label>Why I Chose Early Education <textarea name="whyEarlyEducation" rows="6">${escapeHtml(u.whyEarlyEducation || "")}</textarea></label>`;
    } else if (section === "likes") {
      body = renderWhatILikeFields(u);
    } else {
      body = `
        <div class="grid two">
          <label>Used Name <input name="usedName" placeholder="What should people call you?" value="${escapeHtml(u.usedName || "")}" /></label>
          <label>Profile Picture
            <input name="profilePicture" type="file" accept="image/*" data-user-profile-image-input />
            <input type="hidden" name="profileImageData" value="${u.profileImageData || ""}" />
          </label>
        </div>
        <div class="profile-preview-row">
          ${u.profileImageData ? `<img class="user-profile-preview" src="${u.profileImageData}" alt="Profile preview" />` : `<div class="user-profile-preview empty">No Photo</div>`}
        </div>
        ${u.rawProfileImageData ? `
          <div class="profile-crop-panel" data-profile-crop-panel>
            <div class="profile-crop-stage"><img src="${u.rawProfileImageData}" alt="Crop preview" data-profile-crop-img /><div class="profile-crop-circle"></div></div>
            <div class="grid three">
              <label>Zoom<input type="range" min="1" max="3" step="0.05" value="${u.cropZoom || 1.2}" data-profile-crop-zoom /></label>
              <label>Move Left/Right<input type="range" min="0" max="100" step="1" value="${u.cropX || 50}" data-profile-crop-x /></label>
              <label>Move Up/Down<input type="range" min="0" max="100" step="1" value="${u.cropY || 50}" data-profile-crop-y /></label>
            </div>
            <div class="actions"><button type="button" data-apply-profile-crop>Use This Crop</button><button type="button" class="secondary" data-cancel-profile-crop>Cancel Crop</button></div>
          </div>` : ""}
        <div class="grid two">
          <label>Started Working In Early Childhood Education <input name="earlyEducationStart" value="${escapeHtml(u.earlyEducationStart || "")}" placeholder="2018 / August 2018" /></label>
        </div>
        ${renderBirthdayDropdowns(u.birthday || "")}`;
    }
    return `
      <div class="modal-backdrop"><form class="modal card profile-edit-modal wide-profile-modal" id="selfProfileForm" data-profile-section="${escapeHtml(section)}">
        <h2>${title}</h2>
        <p class="helper">Update this section of your profile.</p>
        ${body}
        <div class="actions sticky-modal-actions"><button>Save Changes</button><button type="button" class="secondary" data-close-modal>Cancel</button></div>
      </form></div>`;
  }

if (state.modal.type === "addUser" || state.modal.type === "editUser") {
    const u = state.modal.user || { roles: ["teacher"], schoolIds: [] };
    const isEdit = state.modal.type === "editUser";
    const selectedSchools = u.schoolIds || [];
    const roleKey = getPrimaryRole(u);
    const isLeaderChecked = roleRequiresPassword(roleKey) || getRosterGroup(u) === "leaders";
    const positionOptions = ["Unassigned", ...state.positions.map(p => p.name).filter(Boolean).filter(name => name !== "Unassigned")];
    if (isEdit) {
      return `
      <div class="modal-backdrop"><form class="modal card profile-edit-modal" id="editUserForm">
        <h2>Edit User</h2>
        <div class="grid two">
          <label>First Name <input name="firstName" required value="${u.firstName || ""}" /></label>
          <label>Last Name <input name="lastName" required value="${u.lastName || ""}" /></label>
        </div>
        <label>Used Name <input name="usedName" placeholder="What should people call this person?" value="${u.usedName || ""}" /></label>
        <label>Team Position
          <select name="teamPosition" required>
            ${positionOptions.map(name => `<option value="${escapeHtml(name)}" ${(u.teamPosition || "Unassigned") === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}
            ${u.teamPosition && !positionOptions.includes(u.teamPosition) ? `<option value="${escapeHtml(u.teamPosition)}" selected>${escapeHtml(u.teamPosition)}</option>` : ""}
          </select>
        </label>
        <label>Role
          <select name="role" required>
            ${state.roles.length ? state.roles.map(r => `<option value="${r.key}" ${roleKey === r.key ? "selected" : ""}>${r.name}</option>`).join("") : `<option value="teacher">Teacher</option><option value="leader">Leader</option>`}
          </select>
        </label>
        <div>
          <strong>Locations</strong>
          <div class="grid two" style="margin-top:.5rem;">
            ${state.schools.map(school => `<label style="display:flex;align-items:center;gap:.5rem;"><input style="width:auto;" type="checkbox" name="schoolIds" value="${school.id}" ${selectedSchools.includes(school.id) ? "checked" : ""} /> ${school.name} (${school.code})</label>`).join("")}
          </div>
        </div>
        <input type="hidden" name="pin" value="${u.pin || "0000"}" />
        <div class="actions">
          <button>Save Changes</button>
          <button type="button" class="secondary" data-reset-pin="${u.uid}">Reset PIN</button>
          <button type="button" class="secondary" data-reset-user-onboarding="${u.uid}">Reset User</button>
          <button type="button" class="danger" data-delete-user="${u.uid}">Delete</button>
          <button type="button" class="secondary" data-close-modal>Cancel</button>
        </div>
      </form></div>`;
    }
    return `
      <div class="modal-backdrop"><form class="modal card profile-edit-modal" id="userForm" autocomplete="off">
        <h2>Add New Teacher</h2>
        <p class="helper">Only enter the basics here. The rest of the profile will be completed during onboarding.</p>
        <div class="grid two">
          <label>First Name <input name="firstName" required /></label>
          <label>Last Name <input name="lastName" required /></label>
        </div>
        <label>Used Name <input name="usedName" placeholder="What should people call this person?" /></label>
        <div>
          <strong>Locations</strong>
          <div class="grid two" style="margin-top:.5rem;">
            ${state.schools.map(school => `<label style="display:flex;align-items:center;gap:.5rem;"><input style="width:auto;" type="checkbox" name="schoolIds" value="${school.id}" /> ${school.name} (${school.code})</label>`).join("")}
          </div>
        </div>
        <label class="check-row"><input type="checkbox" name="isLeader" data-new-user-leader-checkbox /> Mark this person as a leader</label>
        <div class="leader-password-box" data-new-user-leader-password hidden>
          <p class="helper">Because this creates a leader account, please re-enter your password.</p>
          ${passwordFieldHtml("leaderPassword", "Your Password", { autocomplete: "new-password" })}
        </div>
        ${modalErrorHtml()}
        <div class="actions">
          <button>Save User</button>
          <button type="button" class="secondary" data-close-modal>Cancel</button>
        </div>
      </form></div>`;
  }

  return "";
}


async function adminLeaderLogin(user, password, stayLoggedIn = false) {
  if (!user?.fakeEmail) {
    throw new Error("This user does not have a fakeEmail saved in Firestore.");
  }

  await applyLoginPersistence(stayLoggedIn);
  setStayLoggedInPreference(stayLoggedIn);
  const cred = await signInWithEmailAndPassword(auth, user.fakeEmail, password);
  const snap = await getDoc(doc(db, "users", cred.user.uid));

  if (!snap.exists()) {
    await signOut(auth);
    throw new Error("This Firebase Auth account does not have a matching users document.");
  }

  const profile = { uid: cred.user.uid, ...snap.data() };

  if (profile.active === false) {
    await signOut(auth);
    throw new Error("This account is inactive.");
  }

  if (!isLeaderOrAdmin(profile)) {
    await signOut(auth);
    throw new Error("This login is only for leaders and system admins.");
  }

  state.session = profile;
  rememberPickedUser(profile);
  state.modal = null;
  state.adminLoginOpen = false;
  await refreshAdminData();
  showToast("Logged in.");
  renderHome();
}


function renderNotificationSettings(){
  state.currentView="notificationSettings";
  const tool = PERMISSION_TOOLS.find(t=>t.key==="notifications");
  const settings = state.session?.notificationSettings || {};
  const rows = (tool?.permissions || []).filter(p=>notificationAllowedForUser(state.session,p.key)).map(p=>`<label class="notification-setting-row"><input type="checkbox" name="${p.key}" ${settings[p.key]===true?'checked':''}> <span><strong>${escapeHtml(p.label)}</strong><small>${escapeHtml(p.description)}</small></span></label>`).join("");
  $app.innerHTML = pageShell(`<section class="card"><h2>Notifications</h2><p class="helper">Choose the alerts you want. System Admin controls which notification types each role/position is allowed to choose.</p><form id="notificationSettingsForm" class="stack">${rows || '<div class="empty">No notification options are currently available for your role.</div>'}<div class="actions"><button>Save Notifications</button><button type="button" class="secondary" data-action="home">Back Home</button></div></form></section>${state.toast?`<div class="toast">${state.toast}</div>`:""}`);
}
async function saveNotificationSettings(form){
  const tool = PERMISSION_TOOLS.find(t=>t.key==="notifications");
  const notificationSettings = { ...(state.session?.notificationSettings || {}) };
  (tool?.permissions || []).forEach(p=>{ if(notificationAllowedForUser(state.session,p.key)) notificationSettings[p.key] = !!form.querySelector(`[name="${p.key}"]`)?.checked; });
  await updateDoc(doc(db,"users",state.session.uid), { notificationSettings, updatedAt: serverTimestamp() });
  state.session = { ...state.session, notificationSettings };
  state.users = state.users.map(u=>u.uid===state.session.uid ? { ...u, notificationSettings } : u);
  showToast("Notification settings saved.");
  renderNotificationSettings();
}


// Photo Print and Edit — local-only workspace, no Firebase image storage.
const PHOTO_PRINT_DB_NAME = "ovaPhotoPrintEditLocal";
const PHOTO_PRINT_STORE = "workspace";
const PHOTO_PRINT_KEY = "current";
const PHOTO_PRINT_PAPER_PORTRAIT_W = 816;
const PHOTO_PRINT_PAPER_PORTRAIT_H = 1056;
function getPhotoPrintPaperW() { return state.photoPrint?.orientation === "landscape" ? PHOTO_PRINT_PAPER_PORTRAIT_H : PHOTO_PRINT_PAPER_PORTRAIT_W; }
function getPhotoPrintPaperH() { return state.photoPrint?.orientation === "landscape" ? PHOTO_PRINT_PAPER_PORTRAIT_W : PHOTO_PRINT_PAPER_PORTRAIT_H; }
const PHOTO_PRINT_DEFAULT_UPLOAD_W = 260;
const PHOTO_PRINT_DEFAULT_UPLOAD_H = 220;

function defaultPhotoPrintState() {
  return { photos: [], texts: [], selectedId: "", selectedIds: [], selectedType: "photo", nextZ: 1, loaded: false, zoom: 0.75, orientation: "portrait", guideRows: 1, guideCols: 1, snapGuides: true, textDefaults: { color: "#111111", size: 32, font: "Arial", align: "center", outlineColor: "#000000", outlineWidth: 0 }, textRibbonPos: { x: 330, y: 92 }, duplicatePrompt: null, snapHint: null, history: [], redo: [], clipboard: null };
}

function openPhotoPrintDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PHOTO_PRINT_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(PHOTO_PRINT_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePhotoPrintWorkspaceLocal() {
  try {
    const dbi = await openPhotoPrintDb();
    await new Promise((resolve, reject) => {
      const tx = dbi.transaction(PHOTO_PRINT_STORE, "readwrite");
      tx.objectStore(PHOTO_PRINT_STORE).put({ photos: state.photoPrint.photos || [], texts: state.photoPrint.texts || [], selectedType: state.photoPrint.selectedType || "photo", nextZ: state.photoPrint.nextZ || 1, zoom: Number(state.photoPrint.zoom || 0.75), orientation: state.photoPrint.orientation || "portrait", guideRows: Number(state.photoPrint.guideRows || 1), guideCols: Number(state.photoPrint.guideCols || 1), snapGuides: state.photoPrint.snapGuides !== false, textDefaults: state.photoPrint.textDefaults || {}, textRibbonPos: state.photoPrint.textRibbonPos || { x: 330, y: 92 }, savedAt: Date.now() }, PHOTO_PRINT_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    dbi.close();
  } catch (err) {
    console.warn("Photo Print local save skipped", err);
  }
}

async function loadPhotoPrintWorkspace() {
  if (state.photoPrint?.loaded) return;
  state.photoPrint = state.photoPrint || defaultPhotoPrintState();
  try {
    const dbi = await openPhotoPrintDb();
    const data = await new Promise((resolve, reject) => {
      const tx = dbi.transaction(PHOTO_PRINT_STORE, "readonly");
      const req = tx.objectStore(PHOTO_PRINT_STORE).get(PHOTO_PRINT_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    dbi.close();
    if (data?.photos) state.photoPrint = { photos: data.photos || [], texts: data.texts || [], selectedId: "", selectedIds: [], selectedType: "photo", nextZ: data.nextZ || (((data.photos || []).length + (data.texts || []).length || 0) + 1), loaded: true, zoom: Number(data.zoom || state.photoPrint.zoom || 0.75), orientation: data.orientation || "portrait", guideRows: Math.max(1, Math.min(8, Number(data.guideRows || 1))), guideCols: Math.max(1, Math.min(8, Number(data.guideCols || 1))), snapGuides: data.snapGuides !== false, textDefaults: data.textDefaults || { color: "#111111", size: 32, font: "Arial", align: "center", outlineColor: "#000000", outlineWidth: 0 }, textRibbonPos: data.textRibbonPos || { x: 330, y: 92 }, duplicatePrompt: null, snapHint: null, history: [], redo: [], clipboard: null };
    else state.photoPrint.loaded = true;
  } catch (err) {
    console.warn("Photo Print local load skipped", err);
    state.photoPrint.loaded = true;
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function getSelectedPhotoPrintItem() {
  return (state.photoPrint.photos || []).find(p => p.id === state.photoPrint.selectedId) || null;
}

function getSelectedPhotoPrintText() {
  return (state.photoPrint.texts || []).find(t => t.id === state.photoPrint.selectedId) || null;
}

function getSelectedPhotoPrintObject() {
  return getSelectedPhotoPrintItem() || getSelectedPhotoPrintText();
}

function getAllPhotoPrintObjects() {
  return [...(state.photoPrint.photos || []), ...(state.photoPrint.texts || [])];
}

function normalizePhotoPrintZLayers() {
  const ordered = getAllPhotoPrintObjects().sort((a,b)=>(a.z||0)-(b.z||0));
  ordered.forEach((item, i) => { item.z = i + 1; });
  state.photoPrint.nextZ = ordered.length + 1;
}

function addPhotoPrintTextBox() {
  const defaults = state.photoPrint.textDefaults || {};
  const id = crypto.randomUUID();
  const text = {
    id,
    text: "Double click to edit",
    x: 90,
    y: 90,
    w: 320,
    h: 90,
    z: ++state.photoPrint.nextZ,
    rotate: 0,
    font: defaults.font || "Arial",
    size: Number(defaults.size || 32),
    color: defaults.color || "#111111",
    background: "transparent",
    align: defaults.align || "center",
    bold: false,
    italic: false,
    underline: false,
    opacity: 1,
    lineHeight: 1.15,
    letterSpacing: 0,
    outlineColor: defaults.outlineColor || "#000000",
    outlineWidth: Number(defaults.outlineWidth || 0)
  };
  state.photoPrint.texts = state.photoPrint.texts || [];
  state.photoPrint.texts.push(text);
  setTimeout(() => { autoSizePhotoTextBox(text); savePhotoPrintWorkspaceLocal(); renderPhotoPrintTool(); }, 0);
  setPhotoPrintSelection([id], id);
  return text;
}

function renderPhotoTextStyle(t) {
  const fontFamily = String(t.font || "Arial").replace(/[^a-zA-Z0-9 ,'-]/g, "");
  return [
    `font-family:${fontFamily}, sans-serif`,
    `font-size:${Math.max(8, Number(t.size || 32))}px`,
    `color:${t.color || "#111111"}`,
    `background:${t.background || "transparent"}`,
    `text-align:${t.align || "center"}`,
    `font-weight:${t.bold ? 800 : 400}`,
    `font-style:${t.italic ? "italic" : "normal"}`,
    `text-decoration:${t.underline ? "underline" : "none"}`,
    `opacity:${Math.max(0.05, Math.min(1, Number(t.opacity || 1)))}`,
    `line-height:${Math.max(0.75, Number(t.lineHeight || 1.15))}`,
    `letter-spacing:${Number(t.letterSpacing || 0)}px`,
    `-webkit-text-stroke:${Math.max(0, Number(t.outlineWidth || 0))}px ${t.outlineColor || "#000000"}`,
    `text-shadow:${Number(t.outlineWidth || 0) > 0 ? `0 0 ${Math.max(1, Number(t.outlineWidth || 0))}px ${t.outlineColor || "#000000"}` : "none"}`
  ].join(";");
}

function renderPhotoTextToolbar(t) {
  if (!t) return "";
  return `<div class="photo-float-toolbar photo-text-mini-toolbar" style="left:8px;top:-44px;transform:none;">
    <button type="button" title="Bring forward" data-photo-text-layer="up">↑</button>
    <button type="button" title="Send backward" data-photo-text-layer="down">↓</button>
    <button type="button" title="Duplicate" data-photo-text-duplicate>⧉</button>
    <button type="button" title="Delete" data-photo-text-delete>×</button>
  </div>`;
}

function renderPhotoTextRibbon(t) {
  if (!t) return "";
  const fonts = ["Arial", "Georgia", "Times New Roman", "Verdana", "Trebuchet MS", "Comic Sans MS", "Courier New", "Impact"];
  const sizes = [8,10,12,14,16,18,20,24,28,32,36,44,52,64,72,96,120,160];
  const pos = state.photoPrint.textRibbonPos || { x: 330, y: 92 };
  return `<div class="photo-text-ribbon" data-photo-text-ribbon style="left:${Math.max(8, Number(pos.x || 330))}px;top:${Math.max(8, Number(pos.y || 92))}px;">
    <div class="photo-text-ribbon-drag" data-photo-text-ribbon-drag>Text Options <span>drag</span></div>
    <div class="photo-text-ribbon-row">
      <label class="photo-ribbon-text-field">Text <input type="text" value="${escapeHtml(t.text || "")}" data-photo-text-prop="text" /></label>
      <label>Font <select data-photo-text-prop="font">${fonts.map(f => `<option value="${escapeHtml(f)}" ${t.font===f?'selected':''}>${escapeHtml(f)}</option>`).join("")}</select></label>
      <label>Size <select data-photo-text-prop="size">${sizes.map(sz => `<option value="${sz}" ${Number(t.size||32)===sz?'selected':''}>${sz}</option>`).join("")}</select></label>
      <label class="photo-ribbon-color">Color <input type="color" value="${escapeHtml(t.color || '#111111')}" data-photo-text-prop="color"></label>
      <label class="photo-ribbon-color">Highlight <input type="color" value="${String(t.background || '').startsWith('#') ? escapeHtml(t.background) : '#ffffff'}" data-photo-text-prop="background"></label>
      <label class="photo-ribbon-color">Outline <input type="color" value="${escapeHtml(t.outlineColor || '#000000')}" data-photo-text-prop="outlineColor"></label>
      <label>Outline Size <input type="number" min="0" max="20" step="1" value="${Number(t.outlineWidth || 0)}" data-photo-text-prop="outlineWidth"></label>
      <button type="button" class="${t.bold ? 'primary' : 'secondary'} photo-ribbon-icon" title="Bold" data-photo-text-toggle="bold">B</button>
      <button type="button" class="${t.italic ? 'primary' : 'secondary'} photo-ribbon-icon italic" title="Italic" data-photo-text-toggle="italic">I</button>
      <button type="button" class="${t.underline ? 'primary' : 'secondary'} photo-ribbon-icon underline" title="Underline" data-photo-text-toggle="underline">U</button>
      <div class="photo-ribbon-align">
        <button type="button" class="${t.align==='left' ? 'primary' : 'secondary'}" title="Align left" data-photo-text-prop="align" value="left">☰</button>
        <button type="button" class="${t.align==='center' ? 'primary' : 'secondary'}" title="Align center" data-photo-text-prop="align" value="center">☷</button>
        <button type="button" class="${t.align==='right' ? 'primary' : 'secondary'}" title="Align right" data-photo-text-prop="align" value="right">☰</button>
      </div>
      <label>Opacity <input type="range" min="0.05" max="1" step="0.05" value="${Math.max(0.05, Math.min(1, Number(t.opacity || 1)))}" data-photo-text-prop="opacity"></label>
      <label>Line <input type="number" min="0.75" max="3" step="0.05" value="${Number(t.lineHeight || 1.15)}" data-photo-text-prop="lineHeight"></label>
      <label>Spacing <input type="number" min="-10" max="30" step="1" value="${Number(t.letterSpacing || 0)}" data-photo-text-prop="letterSpacing"></label>
      <button type="button" class="secondary" data-photo-text-clear-bg>No Fill</button>
      <button type="button" class="secondary" data-photo-text-duplicate>Duplicate</button>
      <button type="button" class="danger" data-photo-text-delete>Delete</button>
    </div>
  </div>`;
}

function renderPhotoTextEditor(t) {
  if (!t) return "";
  return `<div class="photo-text-settings">
    <label>Text<textarea data-photo-text-prop="text" rows="3">${escapeHtml(t.text || "")}</textarea></label>
    <div class="photo-text-grid">
      <label>Font<select data-photo-text-prop="font"><option ${t.font==='Arial'?'selected':''}>Arial</option><option ${t.font==='Georgia'?'selected':''}>Georgia</option><option ${t.font==='Times New Roman'?'selected':''}>Times New Roman</option><option ${t.font==='Verdana'?'selected':''}>Verdana</option><option ${t.font==='Trebuchet MS'?'selected':''}>Trebuchet MS</option><option ${t.font==='Comic Sans MS'?'selected':''}>Comic Sans MS</option></select></label>
      <label>Size<input type="number" min="8" max="180" step="1" value="${Number(t.size || 32)}" data-photo-text-prop="size"></label>
      <label>Color<input type="color" value="${escapeHtml(t.color || '#111111')}" data-photo-text-prop="color"></label>
      <label>Background<input type="color" value="${String(t.background || '').startsWith('#') ? escapeHtml(t.background) : '#ffffff'}" data-photo-text-prop="background"></label>
      <label>Opacity<input type="range" min="0.05" max="1" step="0.05" value="${Math.max(0.05, Math.min(1, Number(t.opacity || 1)))}" data-photo-text-prop="opacity"></label>
      <label>Align<select data-photo-text-prop="align"><option value="left" ${t.align==='left'?'selected':''}>Left</option><option value="center" ${t.align==='center'?'selected':''}>Center</option><option value="right" ${t.align==='right'?'selected':''}>Right</option></select></label>
      <label>Line Height<input type="number" min="0.75" max="3" step="0.05" value="${Number(t.lineHeight || 1.15)}" data-photo-text-prop="lineHeight"></label>
      <label>Spacing<input type="number" min="-10" max="30" step="1" value="${Number(t.letterSpacing || 0)}" data-photo-text-prop="letterSpacing"></label>
      <label>Outline<input type="color" value="${escapeHtml(t.outlineColor || '#000000')}" data-photo-text-prop="outlineColor"></label>
      <label>Outline Size<input type="number" min="0" max="20" step="1" value="${Number(t.outlineWidth || 0)}" data-photo-text-prop="outlineWidth"></label>
    </div>
    <div class="photo-text-button-row">
      <button type="button" class="${t.bold ? 'primary' : 'secondary'}" data-photo-text-toggle="bold">Bold</button>
      <button type="button" class="${t.italic ? 'primary' : 'secondary'}" data-photo-text-toggle="italic">Italic</button>
      <button type="button" class="${t.underline ? 'primary' : 'secondary'}" data-photo-text-toggle="underline">Underline</button>
      <button type="button" class="secondary" data-photo-text-clear-bg>No Background</button>
    </div>
  </div>`;
}

function movePhotoPrintAnyLayer(id, direction) {
  normalizePhotoPrintZLayers();
  const ordered = getAllPhotoPrintObjects().sort((a,b)=>(a.z||0)-(b.z||0));
  const idx = ordered.findIndex(x => x.id === id);
  if (idx < 0) return;
  const swapIdx = direction === "up" ? Math.min(ordered.length - 1, idx + 1) : Math.max(0, idx - 1);
  if (swapIdx === idx) return;
  const a = ordered[idx], b = ordered[swapIdx], z = a.z;
  a.z = b.z; b.z = z;
  normalizePhotoPrintZLayers();
}

function renderPhotoFilterEditor(p) {
  if (!p) return "";
  return `<div class="photo-filter-panel">
    <h4>Filters</h4>
    <p class="helper">Right-click this image in the image list for Add Filter, or use chroma key here.</p>
    <div class="photo-text-grid">
      <label>Key Color<input type="color" value="${escapeHtml(p.chromaKeyColor || '#00ff00')}" data-photo-filter-color></label>
      <label>Tolerance<input type="range" min="1" max="180" step="1" value="${Number(p.chromaKeyTolerance || 70)}" data-photo-filter-tolerance></label>
    </div>
    <div class="photo-text-button-row"><button type="button" data-photo-apply-chroma>Apply Chroma Key</button>${p.originalSrc ? `<button type="button" class="secondary" data-photo-reset-filter>Reset Filter</button>` : ""}</div>
  </div>`;
}

async function applyPhotoChromaKey(p, color = '#00ff00', tolerance = 70) {
  if (!p) return;
  const src = p.originalSrc || p.src;
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const hex = String(color || '#00ff00').replace('#','');
  const r = parseInt(hex.slice(0,2), 16), g = parseInt(hex.slice(2,4), 16), b = parseInt(hex.slice(4,6), 16);
  const tol = Number(tolerance || 70);
  for (let i = 0; i < data.data.length; i += 4) {
    const dr = data.data[i] - r, dg = data.data[i+1] - g, db = data.data[i+2] - b;
    if (Math.sqrt(dr*dr + dg*dg + db*db) <= tol) data.data[i+3] = 0;
  }
  ctx.putImageData(data, 0, 0);
  p.originalSrc = p.originalSrc || p.src;
  p.src = canvas.toDataURL('image/png');
  p.chromaKeyColor = color;
  p.chromaKeyTolerance = tol;
}

function normalizePhotoPrintLayers() {
  const ordered = [...(state.photoPrint.photos || [])].sort((a,b)=>(a.z||0)-(b.z||0));
  ordered.forEach((p, i) => { p.z = i + 1; });
  state.photoPrint.nextZ = ordered.length + 1;
}

function movePhotoPrintLayer(id, direction) {
  const photos = state.photoPrint.photos || [];
  normalizePhotoPrintLayers();
  const ordered = [...photos].sort((a,b)=>(a.z||0)-(b.z||0));
  const idx = ordered.findIndex(p => p.id === id);
  if (idx < 0) return;
  const swapIdx = direction === "up" ? Math.min(ordered.length - 1, idx + 1) : Math.max(0, idx - 1);
  if (swapIdx === idx) return;
  const a = ordered[idx];
  const b = ordered[swapIdx];
  const az = a.z;
  a.z = b.z;
  b.z = az;
  normalizePhotoPrintLayers();
}

function movePhotoPrintLayerTo(id, topIndex) {
  const photos = state.photoPrint.photos || [];
  normalizePhotoPrintLayers();
  const topOrdered = [...photos].sort((a,b)=>(b.z||0)-(a.z||0));
  const item = topOrdered.find(p => p.id === id);
  if (!item) return;
  const remaining = topOrdered.filter(p => p.id !== id);
  const idx = Math.max(0, Math.min(remaining.length, Number(topIndex || 0)));
  remaining.splice(idx, 0, item);
  remaining.slice().reverse().forEach((p, i) => { p.z = i + 1; });
  state.photoPrint.nextZ = photos.length + 1;
}

function getPhotoPrintBaseDims(p) {
  const nativeW = Number(p.nativeW || 0);
  const nativeH = Number(p.nativeH || 0);
  if (!nativeW || !nativeH) return { w: Number(p.w || 220), h: Number(p.h || 160) };
  const maxW = 260, maxH = 220;
  const scale = Math.min(maxW / nativeW, maxH / nativeH, 1);
  return { w: Math.max(40, Math.round(nativeW * scale)), h: Math.max(40, Math.round(nativeH * scale)) };
}

function photoPrintHasCrop(p) {
  return !!(Number(p.cropL || 0) || Number(p.cropT || 0) || Number(p.cropR || 0) || Number(p.cropB || 0));
}

function clampPhotoPrintNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function renderPhotoPrintResetButtons(p) {
  if (!p || state.photoPrint.cropMode) return "";
  const base = getPhotoPrintBaseDims(p);
  const buttons = [];
  if (photoPrintHasCrop(p)) buttons.push(`<button type="button" data-photo-reset="crop">Reset Crop</button>`);
  if (Math.abs(Number(p.rotate || 0)) % 360) buttons.push(`<button type="button" data-photo-reset="rotation">Reset Rotation</button>`);
  if (Math.abs(Number(p.w || 0) - base.w) > 1 || Math.abs(Number(p.h || 0) - base.h) > 1) buttons.push(`<button type="button" data-photo-reset="size">Reset Size</button>`);
  if (getPhotoPrintSelectedGuideCell(p)) {
    buttons.push(`<button type="button" data-photo-fit="width">Fit to Width</button>`);
    buttons.push(`<button type="button" data-photo-fit="height">Fit to Height</button>`);
  }
  if (!buttons.length) return "";
  const paperW = getPhotoPrintPaperW();
  const paperH = getPhotoPrintPaperH();
  const margin = 8;
  const estimatedW = 138;
  const estimatedH = Math.max(38, buttons.length * 40);
  let absLeft = Number(p.x || 0) + Number(p.w || 0) + 42;
  let absTop = Number(p.y || 0) + 32;
  absLeft = clampPhotoPrintNumber(absLeft, margin, paperW - estimatedW - margin);
  absTop = clampPhotoPrintNumber(absTop, margin, paperH - estimatedH - margin);
  const relLeft = Math.round(absLeft - Number(p.x || 0));
  const relTop = Math.round(absTop - Number(p.y || 0));
  return `<div class="photo-reset-float" style="left:${relLeft}px;top:${relTop}px;">${buttons.join("")}</div>`;
}

function renderPhotoPrintFloatToolbar(p) {
  if (!p) return "";
  const buttons = state.photoPrint.cropMode
    ? `<button type="button" data-photo-crop-toggle>Done</button>`
    : `<button type="button" data-photo-crop-toggle>Crop</button><button type="button" title="Bring forward" data-photo-layer="up">↑</button><button type="button" title="Send backward" data-photo-layer="down">↓</button><button type="button" title="Duplicate" data-photo-duplicate>⧉</button><button type="button" title="Delete" data-photo-delete>×</button>`;
  const paperW = getPhotoPrintPaperW();
  const margin = 8;
  const estimatedW = state.photoPrint.cropMode ? 76 : 224;
  let absLeft = Number(p.x || 0) + Number(p.w || 0) / 2 - estimatedW / 2;
  absLeft = clampPhotoPrintNumber(absLeft, margin, paperW - estimatedW - margin);
  const relLeft = Math.round(absLeft - Number(p.x || 0));
  const relTop = Number(p.y || 0) < 54 ? Math.round(Number(p.h || 0) + 10) : -44;
  return `<div class="photo-float-toolbar" style="left:${relLeft}px;top:${relTop}px;transform:none;">${buttons}</div>`;
}

function getPhotoPrintDisplayName(p, index = 0) {
  return `Image ${Number(index || 0) + 1}`;
}

function getPhotoPrintSelectedGuideCell(item) {
  if (!item) return null;
  const rows = Math.max(1, Math.min(8, Number(state.photoPrint.guideRows || 1)));
  const cols = Math.max(1, Math.min(8, Number(state.photoPrint.guideCols || 1)));
  if (rows <= 1 && cols <= 1) return null;
  const paperW = getPhotoPrintPaperW();
  const paperH = getPhotoPrintPaperH();
  const centerX = Number(item.x || 0) + Number(item.w || 0) / 2;
  const centerY = Number(item.y || 0) + Number(item.h || 0) / 2;
  if (centerX < 0 || centerY < 0 || centerX > paperW || centerY > paperH) return null;
  const cellW = paperW / cols;
  const cellH = paperH / rows;
  const col = Math.max(0, Math.min(cols - 1, Math.floor(centerX / cellW)));
  const row = Math.max(0, Math.min(rows - 1, Math.floor(centerY / cellH)));
  return { x: col * cellW, y: row * cellH, w: cellW, h: cellH, row, col };
}

function fitPhotoPrintSelectedToGuide(kind) {
  const item = getSelectedPhotoPrintItem();
  const cell = getPhotoPrintSelectedGuideCell(item);
  if (!item || !cell) return false;
  const ratio = Math.max(0.05, Number(item.h || 1) / Math.max(1, Number(item.w || 1)));
  if (kind === "width") {
    item.w = Math.max(30, cell.w);
    item.h = Math.max(30, item.w * ratio);
  } else {
    item.h = Math.max(30, cell.h);
    item.w = Math.max(30, item.h / ratio);
  }
  item.x = cell.x + (cell.w - item.w) / 2;
  item.y = cell.y + (cell.h - item.h) / 2;
  return true;
}

function getPhotoPrintCropBounds(p) {
  const l = Math.max(0, Math.min(90, Number(p.cropL || 0)));
  const t = Math.max(0, Math.min(90, Number(p.cropT || 0)));
  const r = Math.max(0, Math.min(90 - l, Number(p.cropR || 0)));
  const b = Math.max(0, Math.min(90 - t, Number(p.cropB || 0)));
  return { l, t, r, b, visibleW: Math.max(5, 100 - l - r), visibleH: Math.max(5, 100 - t - b) };
}

function getPhotoPrintImgStyle(p, showFull = false) {
  if (showFull) return `width:100%;height:100%;left:0;top:0;object-fit:fill;background:rgba(255,255,255,.68);opacity:.78;`;
  const { l, t, visibleW, visibleH } = getPhotoPrintCropBounds(p);
  if (l === 0 && t === 0 && Number(p.cropR || 0) === 0 && Number(p.cropB || 0) === 0) return `width:100%;height:100%;left:0;top:0;object-fit:fill;`;
  return `width:${10000 / visibleW}%;height:${10000 / visibleH}%;left:${-(l * 100 / visibleW)}%;top:${-(t * 100 / visibleH)}%;object-fit:fill;`;
}

function renderPhotoPrintCropBox(p) {
  const { l, t, visibleW, visibleH } = getPhotoPrintCropBounds(p);
  return `<div class="photo-crop-keep-box" data-photo-crop-box style="left:${l}%;top:${t}%;width:${visibleW}%;height:${visibleH}%;">
    <span class="photo-crop-handle crop-n" data-photo-crop-handle="n"></span><span class="photo-crop-handle crop-s" data-photo-crop-handle="s"></span><span class="photo-crop-handle crop-e" data-photo-crop-handle="e"></span><span class="photo-crop-handle crop-w" data-photo-crop-handle="w"></span><span class="photo-crop-handle crop-nw" data-photo-crop-handle="nw"></span><span class="photo-crop-handle crop-ne" data-photo-crop-handle="ne"></span><span class="photo-crop-handle crop-sw" data-photo-crop-handle="sw"></span><span class="photo-crop-handle crop-se" data-photo-crop-handle="se"></span>
  </div>`;
}

function renderPhotoPrintLayerList() {
  const photos = [...(state.photoPrint.photos || [])].sort((a,b)=>(b.z||0)-(a.z||0));
  if (!photos.length) return `<div class="empty small-empty">Upload photos to start.</div>`;
  return photos.map((p, i) => {
    const displayName = getPhotoPrintDisplayName(p, i);
    return `<div class="photo-layer-row ${p.id === state.photoPrint.selectedId ? "active" : ""}" data-photo-select="${p.id}" data-photo-context-filter="${p.id}" title="Right-click to add a filter">
      <img src="${p.src}" alt="" />
      ${p.originalSrc ? `<span class="photo-filter-badge" title="Filter applied">◐</span>` : ""}
      <button type="button" class="photo-layer-name" data-photo-select="${p.id}"><span>${escapeHtml(displayName)}</span><small>${p.originalSrc ? 'Filtered • ' : ''}Layer ${p.z || 1}</small></button>
    </div>`;
  }).join("");
}


function renderPhotoContextMenu() {
  const menu = state.photoPrint?.contextMenu;
  if (!menu || state.currentView !== "photoPrint") return "";
  const item = (state.photoPrint.photos || []).find(p => p.id === menu.id);
  return `<div class="photo-custom-context-menu" style="left:${Math.max(8, Number(menu.x || 8))}px;top:${Math.max(8, Number(menu.y || 8))}px;" data-photo-context-menu>
    <button type="button" class="photo-context-parent">Add filter <span>›</span></button>
    <div class="photo-context-submenu">
      <button type="button" data-photo-context-chroma="${escapeHtml(menu.id || "")}">Chroma key</button>
    </div>
    ${item?.originalSrc ? `<button type="button" data-photo-context-remove-filter="${escapeHtml(menu.id || "")}">Remove filter</button>` : ""}
  </div>`;
}

function renderPhotoPrintGuides() {
  const rows = Math.max(1, Math.min(8, Number(state.photoPrint.guideRows || 1)));
  const cols = Math.max(1, Math.min(8, Number(state.photoPrint.guideCols || 1)));
  const parts = [];
  for (let i = 1; i < cols; i++) parts.push(`<span class="photo-guide-line photo-guide-v" style="left:${(i / cols) * 100}%"></span>`);
  for (let i = 1; i < rows; i++) parts.push(`<span class="photo-guide-line photo-guide-h" style="top:${(i / rows) * 100}%"></span>`);
  return parts.length ? `<div class="photo-guide-layer" aria-hidden="true">${parts.join("")}</div>` : "";
}


function photoPrintSnapshot() {
  return JSON.stringify({ photos: state.photoPrint.photos || [], texts: state.photoPrint.texts || [], nextZ: state.photoPrint.nextZ || 1 });
}
function restorePhotoPrintSnapshot(raw) {
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    state.photoPrint.photos = data.photos || [];
    state.photoPrint.texts = data.texts || [];
    state.photoPrint.nextZ = data.nextZ || (((data.photos||[]).length + (data.texts||[]).length) + 1);
    setPhotoPrintSelection([]);
    state.photoPrint.snapHint = null;
    return true;
  } catch (err) { console.warn("Photo history restore failed", err); return false; }
}
function pushPhotoPrintHistory() {
  if (!state.photoPrint) return;
  const snap = photoPrintSnapshot();
  state.photoPrint.history = state.photoPrint.history || [];
  if (state.photoPrint.history.at(-1) !== snap) state.photoPrint.history.push(snap);
  if (state.photoPrint.history.length > 60) state.photoPrint.history.shift();
  state.photoPrint.redo = [];
}
function undoPhotoPrint() {
  const stack = state.photoPrint.history || [];
  if (!stack.length) return false;
  state.photoPrint.redo = state.photoPrint.redo || [];
  state.photoPrint.redo.push(photoPrintSnapshot());
  return restorePhotoPrintSnapshot(stack.pop());
}
function redoPhotoPrint() {
  const stack = state.photoPrint.redo || [];
  if (!stack.length) return false;
  state.photoPrint.history = state.photoPrint.history || [];
  state.photoPrint.history.push(photoPrintSnapshot());
  return restorePhotoPrintSnapshot(stack.pop());
}
function autoSizePhotoTextBox(t) {
  if (!t) return;
  const meas = document.createElement('div');
  meas.style.position = 'fixed';
  meas.style.left = '-10000px';
  meas.style.top = '-10000px';
  meas.style.visibility = 'hidden';
  meas.style.whiteSpace = 'pre';
  meas.style.wordBreak = 'normal';
  meas.style.boxSizing = 'border-box';
  meas.style.padding = '6px';
  meas.style.fontFamily = `${String(t.font || 'Arial').replace(/[^a-zA-Z0-9 ,'-]/g, '')}, sans-serif`;
  meas.style.fontSize = `${Math.max(8, Number(t.size || 32))}px`;
  meas.style.fontWeight = t.bold ? '800' : '400';
  meas.style.fontStyle = t.italic ? 'italic' : 'normal';
  meas.style.lineHeight = String(Math.max(0.75, Number(t.lineHeight || 1.15)));
  meas.style.letterSpacing = `${Number(t.letterSpacing || 0)}px`;
  meas.textContent = t.text || 'Text';
  document.body.appendChild(meas);
  const pad = Math.max(14, Math.ceil(Number(t.size || 32) * 0.35));
  t.w = Math.ceil(Math.max(28, Math.min(760, meas.scrollWidth + pad)));
  t.h = Math.ceil(Math.max(22, Math.min(760, meas.scrollHeight + 8)));
  meas.remove();
}
function deletePhotoPrintSelection() {
  const ids = new Set(getPhotoPrintSelectedIds());
  if (!ids.size) return false;
  pushPhotoPrintHistory();
  state.photoPrint.photos = (state.photoPrint.photos || []).filter(p => !ids.has(p.id));
  state.photoPrint.texts = (state.photoPrint.texts || []).filter(t => !ids.has(t.id));
  setPhotoPrintSelection([]);
  return true;
}
function copyPhotoPrintSelectionToClipboard(cut = false) {
  const items = getPhotoPrintSelectionItems();
  if (!items.length) return false;
  const bounds = getPhotoPrintSelectionBounds(items);
  state.photoPrint.clipboard = { items: items.map(({kind,item}) => ({ kind, item: JSON.parse(JSON.stringify(item)) })), bounds };
  if (cut) deletePhotoPrintSelection();
  return true;
}
function pastePhotoPrintClipboard() {
  const clip = state.photoPrint.clipboard;
  if (!clip?.items?.length) return false;
  pushPhotoPrintHistory();
  const newIds = [];
  clip.items.forEach(({kind,item}) => {
    const copy = { ...JSON.parse(JSON.stringify(item)), id: crypto.randomUUID(), x: Number(item.x||0) + 24, y: Number(item.y||0) + 24, z: ++state.photoPrint.nextZ, isEditing: false };
    if (kind === 'photo') { copy.name = `${getPhotoPrintDisplayName(item,0)} copy`; state.photoPrint.photos.push(copy); }
    else state.photoPrint.texts.push(copy);
    newIds.push(copy.id);
  });
  setPhotoPrintSelection(newIds);
  return true;
}
function getPhotoPrintObjectSnapTargets(skipIds = new Set()) {
  const xTargets = [], yTargets = [];
  [...(state.photoPrint.photos||[]), ...(state.photoPrint.texts||[])].forEach(item => {
    if (skipIds.has(item.id)) return;
    const x = Number(item.x||0), y = Number(item.y||0), w = Number(item.w||1), h = Number(item.h||1);
    xTargets.push(x, x + w/2, x + w);
    yTargets.push(y, y + h/2, y + h);
  });
  return { xTargets, yTargets };
}
function snapPhotoPrintAxisWithTargets(pos, size, targets, threshold = 14) {
  const anchors = [0, size/2, size];
  let best = { pos, d: Infinity, target: null, anchor: null };
  targets.forEach(target => anchors.forEach(anchor => {
    const candidate = target - anchor;
    const d = Math.abs(pos - candidate);
    if (d < best.d) best = { pos: candidate, d, target, anchor };
  }));
  return best.d <= threshold ? best : { pos, d: Infinity, target: null, anchor: null };
}

function getPhotoPrintSnapTargets(total, count) {
  count = Math.max(1, Math.min(8, Number(count || 1)));
  const targets = [0, total / 2, total];
  for (let i = 1; i < count; i++) targets.push(total * i / count);      // guide lines / cell edges
  for (let i = 0; i < count; i++) targets.push(total * (i + 0.5) / count); // cell centers
  return Array.from(new Set(targets.map(x => Math.round(x * 1000) / 1000)));
}

function snapPhotoPrintAxis(pos, size, total, count, threshold = 14) {
  const targets = getPhotoPrintSnapTargets(total, count);
  const anchors = [0, size / 2, size]; // left/center/right or top/center/bottom of the photo
  let best = { pos, d: Infinity };
  targets.forEach(target => {
    anchors.forEach(anchor => {
      const candidate = target - anchor;
      const d = Math.abs(pos - candidate);
      if (d < best.d) best = { pos: candidate, d };
    });
  });
  return best.d <= threshold ? best.pos : pos;
}

function snapPhotoPrintPosition(item, x, y) {
  if (state.photoPrint.snapGuides === false) { state.photoPrint.snapHint = null; return { x, y }; }
  const rows = Math.max(1, Math.min(8, Number(state.photoPrint.guideRows || 1)));
  const cols = Math.max(1, Math.min(8, Number(state.photoPrint.guideCols || 1)));
  const itemW = Number(item.w || 0);
  const itemH = Number(item.h || 0);
  const skip = new Set(getPhotoPrintSelectedIds());
  const obj = getPhotoPrintObjectSnapTargets(skip);
  const xTargets = [...getPhotoPrintSnapTargets(getPhotoPrintPaperW(), cols), ...obj.xTargets];
  const yTargets = [...getPhotoPrintSnapTargets(getPhotoPrintPaperH(), rows), ...obj.yTargets];
  const sx = snapPhotoPrintAxisWithTargets(x, itemW, xTargets);
  const sy = snapPhotoPrintAxisWithTargets(y, itemH, yTargets);
  state.photoPrint.snapHint = (sx.target !== null || sy.target !== null) ? {
    x: sx.target !== null ? sx.target : null,
    y: sy.target !== null ? sy.target : null,
    itemX: sx.pos,
    itemY: sy.pos
  } : null;
  return { x: sx.pos, y: sy.pos };
}


function getPhotoPrintSelectedIds() {
  const ids = Array.isArray(state.photoPrint.selectedIds) ? state.photoPrint.selectedIds.filter(Boolean) : [];
  if (!ids.length && state.photoPrint.selectedId) ids.push(state.photoPrint.selectedId);
  const valid = new Set([...(state.photoPrint.photos || []).map(p => p.id), ...(state.photoPrint.texts || []).map(t => t.id)]);
  return Array.from(new Set(ids.filter(id => valid.has(id))));
}
function setPhotoPrintSelection(ids, activeId = "") {
  const clean = Array.from(new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean)));
  state.photoPrint.selectedIds = clean;
  state.photoPrint.selectedId = activeId || clean.at(-1) || "";
  const active = getPhotoPrintAnyItem(state.photoPrint.selectedId);
  state.photoPrint.selectedType = active?.kind || "";
}
function getPhotoPrintAnyItem(id) {
  const photo = (state.photoPrint.photos || []).find(p => p.id === id);
  if (photo) return { kind: "photo", item: photo };
  const text = (state.photoPrint.texts || []).find(t => t.id === id);
  if (text) return { kind: "text", item: text };
  return null;
}
function getPhotoPrintSelectionItems() {
  return getPhotoPrintSelectedIds().map(id => getPhotoPrintAnyItem(id)).filter(Boolean);
}
function getPhotoPrintSelectionBounds(items = getPhotoPrintSelectionItems()) {
  if (!items.length) return null;
  const boxes = items.map(({ item }) => ({ x:Number(item.x||0), y:Number(item.y||0), w:Number(item.w||1), h:Number(item.h||1) }));
  const minX = Math.min(...boxes.map(b => b.x));
  const minY = Math.min(...boxes.map(b => b.y));
  const maxX = Math.max(...boxes.map(b => b.x + b.w));
  const maxY = Math.max(...boxes.map(b => b.y + b.h));
  return { x:minX, y:minY, w:Math.max(1, maxX-minX), h:Math.max(1, maxY-minY), cx:(minX+maxX)/2, cy:(minY+maxY)/2 };
}
function getPhotoPrintGridCells() {
  const rows = Math.max(1, Math.min(8, Number(state.photoPrint.guideRows || 1)));
  const cols = Math.max(1, Math.min(8, Number(state.photoPrint.guideCols || 1)));
  const w = getPhotoPrintPaperW() / cols;
  const h = getPhotoPrintPaperH() / rows;
  const cells = [];
  for (let r=0; r<rows; r++) for (let c=0; c<cols; c++) cells.push({ r, c, x:c*w, y:r*h, w, h, cx:c*w+w/2, cy:r*h+h/2 });
  return cells;
}
function photoPrintCellForPoint(x, y) {
  return getPhotoPrintGridCells().find(cell => x >= cell.x && x < cell.x + cell.w && y >= cell.y && y < cell.y + cell.h) || getPhotoPrintGridCells()[0];
}
function photoPrintCellHasItem(cell, ignoreIds = new Set()) {
  return [...(state.photoPrint.photos||[]), ...(state.photoPrint.texts||[])].some(item => {
    if (ignoreIds.has(item.id)) return false;
    const cx = Number(item.x||0) + Number(item.w||1)/2;
    const cy = Number(item.y||0) + Number(item.h||1)/2;
    return cx >= cell.x && cx < cell.x + cell.w && cy >= cell.y && cy < cell.y + cell.h;
  });
}
function copyPhotoPrintSelectionIntoCell(items, bounds, sourceCell, targetCell, suffix = "copy") {
  const margin = 10;
  const scale = Math.min((targetCell.w - margin*2) / Math.max(1, bounds.w), (targetCell.h - margin*2) / Math.max(1, bounds.h), 1);
  const groupW = bounds.w * scale;
  const groupH = bounds.h * scale;
  const baseX = targetCell.x + (targetCell.w - groupW) / 2;
  const baseY = targetCell.y + (targetCell.h - groupH) / 2;
  const newIds = [];
  items.forEach(({ kind, item }) => {
    const copy = { ...item, id: crypto.randomUUID(), x: baseX + (Number(item.x||0) - bounds.x) * scale, y: baseY + (Number(item.y||0) - bounds.y) * scale, w: Math.max(kind === "text" ? 30 : 40, Number(item.w||1) * scale), h: Math.max(kind === "text" ? 20 : 40, Number(item.h||1) * scale), z: ++state.photoPrint.nextZ };
    if (kind === "photo") { copy.name = `${getPhotoPrintDisplayName(item, 0)} ${suffix}`; state.photoPrint.photos.push(copy); }
    else { copy.isEditing = false; state.photoPrint.texts.push(copy); }
    newIds.push(copy.id);
  });
  return newIds;
}
function openPhotoPrintDuplicatePrompt() {
  const items = getPhotoPrintSelectionItems();
  if (!items.length) return;
  const rows = Math.max(1, Math.min(8, Number(state.photoPrint.guideRows || 1)));
  const cols = Math.max(1, Math.min(8, Number(state.photoPrint.guideCols || 1)));
  if (rows > 1 || cols > 1) {
    state.photoPrint.duplicatePrompt = { open: true };
    renderPhotoPrintTool();
  } else {
    duplicatePhotoPrintSelectionSmart('once');
  }
}
async function duplicatePhotoPrintSelectionSmart(mode = 'once') {
  const items = getPhotoPrintSelectionItems();
  if (!items.length) return;
  pushPhotoPrintHistory();
  const bounds = getPhotoPrintSelectionBounds(items);
  if (!bounds) return;
  const rows = Math.max(1, Math.min(8, Number(state.photoPrint.guideRows || 1)));
  const cols = Math.max(1, Math.min(8, Number(state.photoPrint.guideCols || 1)));
  const hasGrid = rows > 1 || cols > 1;
  let newIds = [];
  if (hasGrid) {
    const sourceCell = photoPrintCellForPoint(bounds.cx, bounds.cy);
    if (mode === 'fill') {
      const removeIds = new Set(items.map(x => x.item.id));
      state.photoPrint.photos = (state.photoPrint.photos || []).filter(p => !removeIds.has(p.id));
      state.photoPrint.texts = (state.photoPrint.texts || []).filter(t => !removeIds.has(t.id));
      getPhotoPrintGridCells().forEach((cell, i) => { newIds.push(...copyPhotoPrintSelectionIntoCell(items, bounds, sourceCell, cell, `copy ${i+1}`)); });
    } else {
      const ignore = new Set(items.map(x => x.item.id));
      const firstEmpty = getPhotoPrintGridCells().find(cell => !photoPrintCellHasItem(cell, ignore) && !(cell.r === sourceCell.r && cell.c === sourceCell.c));
      if (firstEmpty) newIds.push(...copyPhotoPrintSelectionIntoCell(items, bounds, sourceCell, firstEmpty, 'copy'));
    }
  }
  if (!newIds.length) {
    items.forEach(({ kind, item }) => {
      const copy = { ...JSON.parse(JSON.stringify(item)), id: crypto.randomUUID(), x: Number(item.x||0) + 24, y: Number(item.y||0) + 24, z: ++state.photoPrint.nextZ, isEditing: false };
      if (kind === 'photo') { copy.name = `${getPhotoPrintDisplayName(item, 0)} copy`; state.photoPrint.photos.push(copy); }
      else state.photoPrint.texts.push(copy);
      newIds.push(copy.id);
    });
  }
  state.photoPrint.duplicatePrompt = null;
  setPhotoPrintSelection(newIds);
  await savePhotoPrintWorkspaceLocal();
  renderPhotoPrintTool();
}
function renderPhotoPrintDuplicatePrompt() {
  if (!state.photoPrint?.duplicatePrompt) return '';
  return `<div class="modal-backdrop photo-duplicate-backdrop"><div class="modal card photo-duplicate-modal"><h2>Duplicate selected item${getPhotoPrintSelectedIds().length > 1 ? 's' : ''}</h2><p class="helper">Would you like to fill every grid section with this selection, or duplicate it once?</p><div class="actions"><button type="button" class="primary" data-photo-duplicate-choice="fill">Fill all sections</button><button type="button" class="secondary" data-photo-duplicate-choice="once">Duplicate once</button><button type="button" class="secondary" data-photo-duplicate-choice="cancel">Cancel</button></div></div></div>`;
}

function renderPhotoPrintSnapHint() {
  const hint = state.photoPrint?.snapHint;
  if (!hint) return '';
  return `${hint.x !== null ? `<div class="photo-snap-line vertical" style="left:${hint.x}px"></div>` : ''}${hint.y !== null ? `<div class="photo-snap-line horizontal" style="top:${hint.y}px"></div>` : ''}${hint.x !== null && hint.y !== null ? `<div class="photo-snap-dot" style="left:${hint.x}px;top:${hint.y}px"></div>` : ''}`;
}
function renderPhotoPrintTool() {
  state.currentView = "photoPrint";
  const selected = getSelectedPhotoPrintItem();
  const selectedText = getSelectedPhotoPrintText();
  const photos = [...(state.photoPrint.photos || [])].sort((a,b)=>(a.z||0)-(b.z||0));
  const texts = [...(state.photoPrint.texts || [])].sort((a,b)=>(a.z||0)-(b.z||0));
  const selectedIds = getPhotoPrintSelectedIds();
  $app.innerHTML = pageShell(`
    <section class="tool-page photo-print-page">
      <div class="tool-header">
        <button class="secondary" type="button" data-action="home">← Home</button>
        <div><h2>Photo Print and Edit</h2><p class="helper">Local-only photo workspace for 8.5×11 copy paper.</p></div>
      </div>
      <div class="photo-guide-controls card">
        <div class="photo-guide-group"><strong>Paper</strong><button type="button" class="${state.photoPrint.orientation !== "landscape" ? "primary" : "secondary"}" data-photo-orientation="portrait">Portrait</button><button type="button" class="${state.photoPrint.orientation === "landscape" ? "primary" : "secondary"}" data-photo-orientation="landscape">Landscape</button></div>
        <div class="photo-guide-group"><strong>Rows</strong><button type="button" data-photo-guide-step="rows:-1">−</button><span>${Math.max(1, Math.min(8, Number(state.photoPrint.guideRows || 1)))}</span><button type="button" data-photo-guide-step="rows:1">+</button></div>
        <div class="photo-guide-group"><strong>Columns</strong><button type="button" data-photo-guide-step="cols:-1">−</button><span>${Math.max(1, Math.min(8, Number(state.photoPrint.guideCols || 1)))}</span><button type="button" data-photo-guide-step="cols:1">+</button></div>
        <button type="button" class="${state.photoPrint.snapGuides === false ? "secondary" : "primary"}" data-photo-snap-toggle>${state.photoPrint.snapGuides === false ? "Snapping Off" : "Snapping On"}</button>
        <input type="file" accept="image/*" multiple data-photo-print-upload hidden />
        <button type="button" class="primary" data-photo-print-open-upload>Upload Images</button>
        <button type="button" class="secondary" data-photo-add-text>Add Text</button>
        <button type="button" class="secondary" data-photo-duplicate-selected>Duplicate Selected</button>
        <button type="button" data-photo-print-print>Print / Save PDF</button>
      </div>
      <div class="photo-print-layout">
        <aside class="card photo-print-leftbar">
          <div class="photo-print-actions">
            <button type="button" class="secondary" data-photo-zoom-reset>Reset View</button>
            <button type="button" class="secondary" data-photo-print-clear>Clear Page</button>
          </div>
          <div class="photo-editor-panel ${(selected || selectedText) ? "" : "muted"}">
            <h3>${selectedText ? "Selected Text" : "Selected Image"}</h3>
            ${selected ? `
              <div class="photo-selected-preview"><img src="${selected.src}" alt="${escapeHtml(getPhotoPrintDisplayName(selected, (state.photoPrint.photos || []).findIndex(x => x.id === selected.id)))}" /><span>${escapeHtml(getPhotoPrintDisplayName(selected, (state.photoPrint.photos || []).findIndex(x => x.id === selected.id)))}</span></div>
              <p class="helper">Drag corners to resize evenly. Hold Shift to stretch. Use the bottom-right rotate handle to rotate.</p>
              ${selected.originalSrc ? renderPhotoFilterEditor(selected) : `<p class="helper">Right-click this image in the image list to add a filter.</p>`}
            ` : selectedText ? `<p class="helper">Use the floating text bar above the page to change font, size, color, style, alignment, opacity, spacing, layer, duplicate, or delete.</p>` : `<p class="helper">Tap a photo, text box, or image list item to edit it.</p>`}
          </div>
        </aside>
        <main class="photo-print-stage-wrap" data-photo-print-stage>
          ${selectedText ? renderPhotoTextRibbon(selectedText) : ""}
          <div class="photo-print-zoom-surface" style="width:${Math.round(getPhotoPrintPaperW() * Number(state.photoPrint.zoom || 0.75))}px;height:${Math.round(getPhotoPrintPaperH() * Number(state.photoPrint.zoom || 0.75))}px;">
            <div class="photo-print-paper" id="photoPrintPaper" aria-label="8.5 by 11 inch print area" style="width:${getPhotoPrintPaperW()}px;height:${getPhotoPrintPaperH()}px;transform:scale(${Number(state.photoPrint.zoom || 0.75)});">
              ${renderPhotoPrintGuides()}
              ${renderPhotoPrintSnapHint()}
              ${photos.map(p => `<div class="photo-item ${((state.photoPrint.selectedIds || []).includes(p.id) || p.id === state.photoPrint.selectedId) ? "selected" : ""} ${p.id === state.photoPrint.selectedId && state.photoPrint.cropMode ? "crop-mode" : ""}" data-photo-id="${p.id}" style="left:${Number.isFinite(Number(p.x)) ? Number(p.x) : 40}px;top:${Number.isFinite(Number(p.y)) ? Number(p.y) : 40}px;width:${Number.isFinite(Number(p.w)) ? Number(p.w) : 220}px;height:${Number.isFinite(Number(p.h)) ? Number(p.h) : 160}px;transform:rotate(${Number(p.rotate || 0)}deg);z-index:${p.z || 1};">
                <div class="photo-image-clip"><img src="${p.src}" alt="${escapeHtml(getPhotoPrintDisplayName(p, photos.findIndex(x => x.id === p.id)))}" style="${getPhotoPrintImgStyle(p, p.id === state.photoPrint.selectedId && state.photoPrint.cropMode)}" draggable="false" /></div>
                ${p.id === state.photoPrint.selectedId ? `${renderPhotoPrintFloatToolbar(p)}
                ${state.photoPrint.cropMode ? renderPhotoPrintCropBox(p) : `<span class="photo-resize-handle photo-resize-nw" data-photo-resize="nw"></span>
                <span class="photo-resize-handle photo-resize-ne" data-photo-resize="ne"></span>
                <span class="photo-resize-handle photo-resize-sw" data-photo-resize="sw"></span>
                <span class="photo-resize-handle photo-resize-se" data-photo-resize="se"></span>
                <span class="photo-rotate-handle photo-rotate-se" data-photo-rotate="se">↻</span>`}
                ${renderPhotoPrintResetButtons(p)}` : ""}
              </div>`).join("")}
              ${texts.map(t => `<div class="photo-text-item ${((state.photoPrint.selectedIds || []).includes(t.id) || t.id === state.photoPrint.selectedId) ? "selected" : ""} ${t.isEditing ? "editing" : ""}" data-photo-text-id="${t.id}" title="Drag to move. Double-click to edit text." style="left:${Number.isFinite(Number(t.x)) ? Number(t.x) : 90}px;top:${Number.isFinite(Number(t.y)) ? Number(t.y) : 90}px;width:${Number.isFinite(Number(t.w)) ? Number(t.w) : 320}px;height:${Number.isFinite(Number(t.h)) ? Number(t.h) : 90}px;transform:rotate(${Number(t.rotate || 0)}deg);z-index:${t.z || 1};">
                <div class="photo-text-content" contenteditable="${t.isEditing ? "true" : "false"}" spellcheck="false" data-photo-text-content="${t.id}" style="${renderPhotoTextStyle(t)}">${escapeHtml(t.text || "Text")}</div>
                ${t.id === state.photoPrint.selectedId ? `${renderPhotoTextToolbar(t)}<span class="photo-resize-handle photo-resize-nw" data-photo-text-resize="nw"></span><span class="photo-resize-handle photo-resize-ne" data-photo-text-resize="ne"></span><span class="photo-resize-handle photo-resize-sw" data-photo-text-resize="sw"></span><span class="photo-resize-handle photo-resize-se" data-photo-text-resize="se"></span>` : ""}
              </div>`).join("")}
              <div class="photo-selection-box" data-photo-selection-box hidden></div>
              ${(photos.length || texts.length) ? "" : `<div class="photo-paper-empty">Upload photos or add text, then drag them anywhere on the page.</div>`}
            </div>
          </div>
        </main>
        <aside class="card photo-print-sidebar">
          <h3>Image List</h3>
          <div class="photo-layer-list">${renderPhotoPrintLayerList()}</div>
        </aside>
      </div>
    </section>
    ${renderPhotoContextMenu()}
    ${renderPhotoPrintDuplicatePrompt()}
    ${state.toast ? `<div class="toast">${state.toast}</div>` : ""}
  `);
}

function updatePhotoPrintSelected(updater, shouldRender = true) {
  const item = getSelectedPhotoPrintItem();
  if (!item) return;
  updater(item);
  savePhotoPrintWorkspaceLocal();
  if (shouldRender) renderPhotoPrintTool();
}

async function addPhotoPrintFiles(files) {
  const list = Array.from(files || []).filter(f => f.type?.startsWith("image/"));
  if (!list.length) return;
  const added = [];
  for (const file of list) {
    const src = await readFileAsDataUrl(file);
    let dims = { width: 240, height: 180 };
    try { dims = await getImageDimensionsFromDataUrl(src); } catch (err) { console.warn("Photo Print image dimensions unavailable", err); }
    const nativeW = Math.max(40, Math.round(Number(dims.width || 240)));
    const nativeH = Math.max(40, Math.round(Number(dims.height || 180)));
    const fit = Math.min(PHOTO_PRINT_DEFAULT_UPLOAD_W / nativeW, PHOTO_PRINT_DEFAULT_UPLOAD_H / nativeH, 1);
    const displayW = Math.max(60, Math.round(nativeW * fit));
    const displayH = Math.max(60, Math.round(nativeH * fit));
    const z = ++state.photoPrint.nextZ;
    added.push({ id: crypto.randomUUID(), name: `Image ${state.photoPrint.photos.length + added.length + 1}`, originalName: file.name, src, x: 50 + ((state.photoPrint.photos.length + added.length) % 6) * 24, y: 50 + ((state.photoPrint.photos.length + added.length) % 6) * 24, w: displayW, h: displayH, nativeW, nativeH, rotate: 0, z, cropZoom: 1, cropX: 50, cropY: 50, cropL: 0, cropT: 0, cropR: 0, cropB: 0 });
  }
  state.photoPrint.photos.push(...added);
  setPhotoPrintSelection([added.at(-1)?.id || ""], added.at(-1)?.id || "");
  await savePhotoPrintWorkspaceLocal();
  renderPhotoPrintTool();
}

function applyPhotoControl(control, value) {
  updatePhotoPrintSelected(item => {
    const n = Number(value);
    if (control === "size") { const ratio = (item.h || 160) / Math.max(1, item.w || 220); item.w = n; item.h = Math.max(40, Math.round(n * ratio)); }
    if (control === "rotate") item.rotate = n;
  }, true);
}

function printPhotoPrintPage() {
  const paper = document.getElementById("photoPrintPaper");
  if (!paper) return;
  const win = window.open("", "_blank");
  if (!win) { alert("Popup blocked. Allow popups to print or save as PDF."); return; }
  const clone = paper.cloneNode(true);
  clone.style.transform = "";
  clone.style.transformOrigin = "";
  clone.querySelectorAll(".photo-item[data-photo-id]").forEach(el => {
    const photo = (state.photoPrint.photos || []).find(p => p.id === el.dataset.photoId);
    const img = el.querySelector("img");
    if (photo && img) img.style.cssText = getPhotoPrintImgStyle(photo, false);
    el.classList.remove("selected", "crop-mode");
  });
  win.document.write(`<!doctype html><html><head><title>Photo Print</title><style>
    @page{size:${state.photoPrint.orientation === "landscape" ? "11in 8.5in" : "8.5in 11in"};margin:0;} html,body{margin:0;padding:0;background:white;} .photo-print-paper{width:${state.photoPrint.orientation === "landscape" ? "11in" : "8.5in"}!important;height:${state.photoPrint.orientation === "landscape" ? "8.5in" : "11in"}!important;position:relative;overflow:hidden;background:white;box-shadow:none!important;transform:none!important;} .photo-item{position:absolute;overflow:visible;box-sizing:border-box;} .photo-image-clip{position:absolute;inset:0;overflow:hidden;} .photo-image-clip img{position:absolute;object-fit:fill;max-width:none;user-select:none;} .photo-float-toolbar,.photo-reset-float,.photo-resize-handle,.photo-crop-handle,.photo-crop-keep-box,.photo-paper-empty{display:none!important;} .photo-text-item{position:absolute;box-sizing:border-box;overflow:visible;} .photo-text-content{width:100%;height:100%;white-space:pre-wrap;display:flex;align-items:center;justify-content:center;padding:6px;box-sizing:border-box;}
  </style></head><body>${clone.outerHTML}<script>window.onload=()=>{setTimeout(()=>{window.print();},150)}<\/script></body></html>`);
  win.document.close();
}

function setPhotoPrintZoom(nextZoom, anchorEvent = null) {
  const stage = document.querySelector("[data-photo-print-stage]");
  const oldZoom = Number(state.photoPrint.zoom || 0.75);
  const zoom = Math.max(0.25, Math.min(2.5, Number(nextZoom || oldZoom)));
  if (!Number.isFinite(zoom) || Math.abs(zoom - oldZoom) < 0.001) return;
  let anchorX = 0.5;
  let anchorY = 0.5;
  if (stage && anchorEvent) {
    const rect = stage.getBoundingClientRect();
    anchorX = (anchorEvent.clientX - rect.left + stage.scrollLeft) / Math.max(1, getPhotoPrintPaperW() * oldZoom);
    anchorY = (anchorEvent.clientY - rect.top + stage.scrollTop) / Math.max(1, getPhotoPrintPaperH() * oldZoom);
  }
  state.photoPrint.zoom = zoom;
  const surface = document.querySelector(".photo-print-zoom-surface");
  const paper = document.getElementById("photoPrintPaper");
  if (surface && paper) {
    surface.style.width = `${Math.round(getPhotoPrintPaperW() * zoom)}px`;
    surface.style.height = `${Math.round(getPhotoPrintPaperH() * zoom)}px`;
    paper.style.transform = `scale(${zoom})`;
    const zoomBtn = document.querySelector("[data-photo-zoom-reset]");
    if (zoomBtn) zoomBtn.textContent = `${Math.round(zoom * 100)}%`;
    if (stage) {
      stage.scrollLeft = Math.max(0, (getPhotoPrintPaperW() * zoom * anchorX) - (anchorEvent ? (anchorEvent.clientX - stage.getBoundingClientRect().left) : (stage.clientWidth / 2)));
      stage.scrollTop = Math.max(0, (getPhotoPrintPaperH() * zoom * anchorY) - (anchorEvent ? (anchorEvent.clientY - stage.getBoundingClientRect().top) : (stage.clientHeight / 2)));
    }
    savePhotoPrintWorkspaceLocal();
  } else {
    savePhotoPrintWorkspaceLocal();
    renderPhotoPrintTool();
  }
}

let photoPrintDrag = null;
let photoTextRibbonDrag = null;
function clampPhotoTextRibbonPosition(x, y) {
  const w = 760, h = 110;
  return { x: Math.max(8, Math.min(window.innerWidth - w - 8, Number(x || 0))), y: Math.max(8, Math.min(window.innerHeight - h - 8, Number(y || 0))) };
}
document.addEventListener("pointerdown", (e) => {
  const ribbonHandle = e.target.closest?.("[data-photo-text-ribbon-drag]");
  if (state.currentView === "photoPrint" && ribbonHandle) {
    const ribbon = ribbonHandle.closest("[data-photo-text-ribbon]");
    const rect = ribbon?.getBoundingClientRect();
    const pos = state.photoPrint.textRibbonPos || { x: rect?.left || 330, y: rect?.top || 92 };
    photoTextRibbonDrag = { startX: e.clientX, startY: e.clientY, x: Number(pos.x || rect?.left || 330), y: Number(pos.y || rect?.top || 92) };
    ribbonHandle.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    return;
  }
  if (state.currentView !== "photoPrint") return;
  // Let native dblclick enter edit mode instead of starting a second drag/render cycle.
  if (e.detail >= 2 && e.target.closest?.(".photo-text-item[data-photo-text-id]")) return;
  if (e.target.closest?.("[data-photo-text-ribbon]") || e.target.closest?.("[data-photo-context-menu]") || e.target.closest?.(".photo-float-toolbar") || e.target.closest?.(".photo-reset-float")) return;
  const textContentEl = e.target.closest?.("[data-photo-text-content]");
  const textEl = e.target.closest?.(".photo-text-item[data-photo-text-id]");
  const itemEl = e.target.closest?.(".photo-item[data-photo-id]");
  if (!itemEl && !textEl) {
    const paper = e.target.closest?.("#photoPrintPaper");
    if (paper) {
      const rect = paper.getBoundingClientRect();
      const zoom = Number(state.photoPrint.zoom || 1);
      state.photoPrint.cropMode = false;
      photoPrintDrag = { hadSelection: getPhotoPrintSelectedIds().length > 0, kind: "selectBox", startX: e.clientX, startY: e.clientY, zoom, paperLeft: rect.left, paperTop: rect.top, x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
      paper.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.target.closest?.("[data-photo-print-stage]")) {
      setPhotoPrintSelection([]);
      state.photoPrint.cropMode = false;
      renderPhotoPrintTool();
    }
    return;
  }
  if (textEl) {
    const id = textEl.dataset.photoTextId;
    const item = (state.photoPrint.texts || []).find(t => t.id === id);
    if (!item) return;
    if (e.ctrlKey || e.metaKey) {
      const ids = new Set(getPhotoPrintSelectedIds());
      ids.has(id) ? ids.delete(id) : ids.add(id);
      setPhotoPrintSelection([...ids], id);
    } else if (!getPhotoPrintSelectedIds().includes(id)) {
      setPhotoPrintSelection([id], id);
    } else {
      setPhotoPrintSelection(getPhotoPrintSelectedIds(), id);
    }
    if (e.target.closest("button") || e.target.closest("textarea,input,select")) return;
    if (item.isEditing && textContentEl) { textEl.classList.add("selected", "editing"); return; }
    const rect = textEl.getBoundingClientRect();
    const resizeDir = e.target.closest("[data-photo-text-resize]")?.dataset.photoTextResize || "";
    const groupItems = !resizeDir ? getPhotoPrintSelectionItems().map(({kind,item}) => ({ kind, id:item.id, x:Number(item.x||0), y:Number(item.y||0), w:Number(item.w||1), h:Number(item.h||1) })) : [];
    pushPhotoPrintHistory();
    photoPrintDrag = { id, kind: "text", resizeDir, groupItems, startX: e.clientX, startY: e.clientY, zoom: Number(state.photoPrint.zoom || 1), x: item.x || 0, y: item.y || 0, w: item.w || (rect.width / Number(state.photoPrint.zoom || 1)), h: item.h || (rect.height / Number(state.photoPrint.zoom || 1)) };
    textEl.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    return;
  }
  const id = itemEl.dataset.photoId;
  const item = (state.photoPrint.photos || []).find(p => p.id === id);
  if (!item) return;
  if (e.ctrlKey || e.metaKey) {
    const ids = new Set(getPhotoPrintSelectedIds());
    ids.has(id) ? ids.delete(id) : ids.add(id);
    setPhotoPrintSelection([...ids], id);
  } else if (!getPhotoPrintSelectedIds().includes(id)) {
    setPhotoPrintSelection([id], id);
  } else {
    setPhotoPrintSelection(getPhotoPrintSelectedIds(), id);
  }
  const rect = itemEl.getBoundingClientRect();
  const paperRect = document.getElementById("photoPrintPaper")?.getBoundingClientRect();
  if (e.target.closest("button")) return;
  const inCropMode = id === state.photoPrint.selectedId && !!state.photoPrint.cropMode;
  const resizeDir = inCropMode ? "" : (e.target.closest("[data-photo-resize]")?.dataset.photoResize || "");
  const rotateDir = inCropMode ? "" : (e.target.closest("[data-photo-rotate]")?.dataset.photoRotate || "");
  const cropDir = inCropMode ? (e.target.closest("[data-photo-crop-handle]")?.dataset.photoCropHandle || "") : "";
  const cropBoxMove = inCropMode && !cropDir && !!e.target.closest("[data-photo-crop-box]");
  if (inCropMode && !cropDir && !cropBoxMove && !e.target.closest("[data-photo-crop-toggle]")) return;
  const bounds = getPhotoPrintCropBounds(item);
  const centerX = (paperRect?.left || 0) + ((item.x || 0) + ((item.w || rect.width) / 2)) * Number(state.photoPrint.zoom || 1);
  const centerY = (paperRect?.top || 0) + ((item.y || 0) + ((item.h || rect.height) / 2)) * Number(state.photoPrint.zoom || 1);
  const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI;
  const groupItems = (!resizeDir && !rotateDir && !cropDir && !cropBoxMove) ? getPhotoPrintSelectionItems().map(({kind,item}) => ({ kind, id:item.id, x:Number(item.x||0), y:Number(item.y||0), w:Number(item.w||1), h:Number(item.h||1) })) : [];
  pushPhotoPrintHistory();
  photoPrintDrag = { id, resizeDir, rotateDir, cropDir, cropBoxMove, groupItems, startX: e.clientX, startY: e.clientY, zoom: Number(state.photoPrint.zoom || 1), paperLeft: paperRect?.left || 0, paperTop: paperRect?.top || 0, centerX, centerY, startAngle, rotate: Number(item.rotate || 0), x: item.x || 0, y: item.y || 0, w: item.w || (rect.width / Number(state.photoPrint.zoom || 1)), h: item.h || (rect.height / Number(state.photoPrint.zoom || 1)), cropL: Number(item.cropL || 0), cropT: Number(item.cropT || 0), cropR: Number(item.cropR || 0), cropB: Number(item.cropB || 0), cropVisibleW: bounds.visibleW, cropVisibleH: bounds.visibleH };
  itemEl.setPointerCapture?.(e.pointerId);
  document.querySelectorAll(".photo-item.selected").forEach(el => el.classList.remove("selected"));
  itemEl.classList.add("selected");
  e.preventDefault();
});

document.addEventListener("pointermove", (e) => {
  if (photoTextRibbonDrag && state.currentView === "photoPrint") {
    const next = clampPhotoTextRibbonPosition(photoTextRibbonDrag.x + (e.clientX - photoTextRibbonDrag.startX), photoTextRibbonDrag.y + (e.clientY - photoTextRibbonDrag.startY));
    state.photoPrint.textRibbonPos = next;
    const ribbon = document.querySelector("[data-photo-text-ribbon]");
    if (ribbon) { ribbon.style.left = `${next.x}px`; ribbon.style.top = `${next.y}px`; }
    return;
  }
  if (!photoPrintDrag || state.currentView !== "photoPrint") return;
  const dragZoom = Number(photoPrintDrag.zoom || state.photoPrint.zoom || 1);
  const dx = (e.clientX - photoPrintDrag.startX) / dragZoom;
  const dy = (e.clientY - photoPrintDrag.startY) / dragZoom;
  if (photoPrintDrag.kind === "selectBox") {
    const box = document.querySelector("[data-photo-selection-box]");
    if (box) {
      const x1 = photoPrintDrag.x, y1 = photoPrintDrag.y;
      const x2 = (e.clientX - photoPrintDrag.paperLeft) / dragZoom;
      const y2 = (e.clientY - photoPrintDrag.paperTop) / dragZoom;
      box.hidden = false;
      box.style.left = `${Math.min(x1,x2)}px`;
      box.style.top = `${Math.min(y1,y2)}px`;
      box.style.width = `${Math.abs(x2-x1)}px`;
      box.style.height = `${Math.abs(y2-y1)}px`;
    }
    return;
  }
  const item = photoPrintDrag.kind === "text" ? (state.photoPrint.texts || []).find(t => t.id === photoPrintDrag.id) : (state.photoPrint.photos || []).find(p => p.id === photoPrintDrag.id);
  if (!item) return;
  if (photoPrintDrag.kind === "text") {
    if (photoPrintDrag.resizeDir) {
      let newX = photoPrintDrag.x, newY = photoPrintDrag.y, newW = photoPrintDrag.w, newH = photoPrintDrag.h;
      if (photoPrintDrag.resizeDir.includes("e")) newW = photoPrintDrag.w + dx;
      if (photoPrintDrag.resizeDir.includes("s")) newH = photoPrintDrag.h + dy;
      if (photoPrintDrag.resizeDir.includes("w")) { newW = photoPrintDrag.w - dx; newX = photoPrintDrag.x + dx; }
      if (photoPrintDrag.resizeDir.includes("n")) { newH = photoPrintDrag.h - dy; newY = photoPrintDrag.y + dy; }
      item.w = Math.max(40, newW); item.h = Math.max(24, newH); item.x = newX; item.y = newY;
    } else if (Array.isArray(photoPrintDrag.groupItems) && photoPrintDrag.groupItems.length > 1) {
      const activeStart = photoPrintDrag.groupItems.find(g => g.id === item.id) || { x: photoPrintDrag.x, y: photoPrintDrag.y };
      const snapped = snapPhotoPrintPosition(item, activeStart.x + dx, activeStart.y + dy);
      const offX = snapped.x - activeStart.x;
      const offY = snapped.y - activeStart.y;
      photoPrintDrag.groupItems.forEach(g => {
        const found = g.kind === "text" ? (state.photoPrint.texts || []).find(t => t.id === g.id) : (state.photoPrint.photos || []).find(p => p.id === g.id);
        if (!found) return;
        found.x = g.x + offX; found.y = g.y + offY;
        const el = g.kind === "text" ? document.querySelector(`.photo-text-item[data-photo-text-id="${CSS.escape(g.id)}"]`) : document.querySelector(`.photo-item[data-photo-id="${CSS.escape(g.id)}"]`);
        if (el) { el.style.left = `${found.x}px`; el.style.top = `${found.y}px`; el.classList.add("selected"); }
      });
    } else {
      const snapped = snapPhotoPrintPosition(item, photoPrintDrag.x + dx, photoPrintDrag.y + dy);
      item.x = snapped.x; item.y = snapped.y;
    }
    const textEl = document.querySelector(`.photo-text-item[data-photo-text-id="${CSS.escape(item.id)}"]`);
    if (textEl) { textEl.style.left = `${item.x}px`; textEl.style.top = `${item.y}px`; textEl.style.width = `${item.w}px`; textEl.style.height = `${item.h}px`; textEl.classList.add("selected"); updatePhotoPrintSnapHintDom(); }
    return;
  }
  if (photoPrintDrag.rotateDir) {
    const ang = Math.atan2(e.clientY - photoPrintDrag.centerY, e.clientX - photoPrintDrag.centerX) * 180 / Math.PI;
    item.rotate = Math.round(photoPrintDrag.rotate + (ang - photoPrintDrag.startAngle));
  } else if (photoPrintDrag.cropDir) {
    const cx = dx / Math.max(1, photoPrintDrag.w) * 100;
    const cy = dy / Math.max(1, photoPrintDrag.h) * 100;
    if (photoPrintDrag.cropDir.includes("w")) item.cropL = Math.max(0, Math.min(95 - Number(item.cropR || 0), photoPrintDrag.cropL + cx));
    if (photoPrintDrag.cropDir.includes("e")) item.cropR = Math.max(0, Math.min(95 - Number(item.cropL || 0), photoPrintDrag.cropR - cx));
    if (photoPrintDrag.cropDir.includes("n")) item.cropT = Math.max(0, Math.min(95 - Number(item.cropB || 0), photoPrintDrag.cropT + cy));
    if (photoPrintDrag.cropDir.includes("s")) item.cropB = Math.max(0, Math.min(95 - Number(item.cropT || 0), photoPrintDrag.cropB - cy));
  } else if (photoPrintDrag.cropBoxMove) {
    const cx = dx / Math.max(1, photoPrintDrag.w) * 100;
    const cy = dy / Math.max(1, photoPrintDrag.h) * 100;
    const newL = Math.max(0, Math.min(100 - photoPrintDrag.cropVisibleW, photoPrintDrag.cropL + cx));
    const newT = Math.max(0, Math.min(100 - photoPrintDrag.cropVisibleH, photoPrintDrag.cropT + cy));
    item.cropL = newL;
    item.cropT = newT;
    item.cropR = Math.max(0, 100 - newL - photoPrintDrag.cropVisibleW);
    item.cropB = Math.max(0, 100 - newT - photoPrintDrag.cropVisibleH);
  } else if (photoPrintDrag.resizeDir) {
    let newX = photoPrintDrag.x;
    let newY = photoPrintDrag.y;
    let newW = photoPrintDrag.w;
    let newH = photoPrintDrag.h;
    if (photoPrintDrag.resizeDir.includes("e")) newW = photoPrintDrag.w + dx;
    if (photoPrintDrag.resizeDir.includes("s")) newH = photoPrintDrag.h + dy;
    if (photoPrintDrag.resizeDir.includes("w")) { newW = photoPrintDrag.w - dx; newX = photoPrintDrag.x + dx; }
    if (photoPrintDrag.resizeDir.includes("n")) { newH = photoPrintDrag.h - dy; newY = photoPrintDrag.y + dy; }
    if (!e.shiftKey) {
      const ratio = Math.max(0.05, photoPrintDrag.h / Math.max(1, photoPrintDrag.w));
      const scale = Math.max(40 / photoPrintDrag.w, 40 / photoPrintDrag.h, Math.max(newW / photoPrintDrag.w, newH / photoPrintDrag.h));
      newW = photoPrintDrag.w * scale;
      newH = photoPrintDrag.h * scale;
      if (photoPrintDrag.resizeDir.includes("w")) newX = photoPrintDrag.x + (photoPrintDrag.w - newW);
      if (photoPrintDrag.resizeDir.includes("n")) newY = photoPrintDrag.y + (photoPrintDrag.h - newH);
    }
    item.w = Math.max(40, newW);
    item.h = Math.max(40, newH);
    item.x = Math.max(-item.w + 20, Math.min(getPhotoPrintPaperW() - 20, newX));
    item.y = Math.max(-item.h + 20, Math.min(getPhotoPrintPaperH() - 20, newY));
  } else if (Array.isArray(photoPrintDrag.groupItems) && photoPrintDrag.groupItems.length > 1) {
    const activeStart = photoPrintDrag.groupItems.find(g => g.id === item.id) || { x: photoPrintDrag.x, y: photoPrintDrag.y };
    let nextX = Math.max(-item.w + 20, Math.min(getPhotoPrintPaperW() - 20, activeStart.x + dx));
    let nextY = Math.max(-item.h + 20, Math.min(getPhotoPrintPaperH() - 20, activeStart.y + dy));
    const snapped = snapPhotoPrintPosition(item, nextX, nextY);
    const offX = snapped.x - activeStart.x;
    const offY = snapped.y - activeStart.y;
    photoPrintDrag.groupItems.forEach(g => {
      const found = g.kind === "text" ? (state.photoPrint.texts || []).find(t => t.id === g.id) : (state.photoPrint.photos || []).find(p => p.id === g.id);
      if (!found) return;
      found.x = g.x + offX; found.y = g.y + offY;
      const el = g.kind === "text" ? document.querySelector(`.photo-text-item[data-photo-text-id="${CSS.escape(g.id)}"]`) : document.querySelector(`.photo-item[data-photo-id="${CSS.escape(g.id)}"]`);
      if (el) { el.style.left = `${found.x}px`; el.style.top = `${found.y}px`; el.classList.add("selected"); }
    });
  } else {
    let nextX = Math.max(-item.w + 20, Math.min(getPhotoPrintPaperW() - 20, photoPrintDrag.x + dx));
    let nextY = Math.max(-item.h + 20, Math.min(getPhotoPrintPaperH() - 20, photoPrintDrag.y + dy));
    const snapped = snapPhotoPrintPosition(item, nextX, nextY);
    item.x = Math.max(-item.w + 20, Math.min(getPhotoPrintPaperW() - 20, snapped.x));
    item.y = Math.max(-item.h + 20, Math.min(getPhotoPrintPaperH() - 20, snapped.y));
  }
  const el = document.querySelector(`.photo-item[data-photo-id="${CSS.escape(item.id)}"]`);
  if (el) {
    el.style.left = `${item.x}px`; el.style.top = `${item.y}px`; el.style.width = `${item.w}px`; el.style.height = `${item.h}px`; el.style.transform = `rotate(${item.rotate || 0}deg)`; el.classList.add("selected");
    const img = el.querySelector("img");
    if (img) img.style.cssText = getPhotoPrintImgStyle(item, item.id === state.photoPrint.selectedId && state.photoPrint.cropMode);
    updatePhotoPrintSnapHintDom();
    const cropBox = el.querySelector("[data-photo-crop-box]");
    if (cropBox) { const b = getPhotoPrintCropBounds(item); cropBox.style.left = `${b.l}%`; cropBox.style.top = `${b.t}%`; cropBox.style.width = `${b.visibleW}%`; cropBox.style.height = `${b.visibleH}%`; }
  }
});

function updatePhotoPrintSnapHintDom() {
  const paper = document.getElementById('photoPrintPaper');
  if (!paper) return;
  paper.querySelectorAll('.photo-snap-line,.photo-snap-dot').forEach(el => el.remove());
  const html = renderPhotoPrintSnapHint();
  if (html) paper.insertAdjacentHTML('beforeend', html);
}
async function finishPhotoPrintPointerDrag() {
  if (photoTextRibbonDrag) {
    photoTextRibbonDrag = null;
    await savePhotoPrintWorkspaceLocal();
    return;
  }
  if (!photoPrintDrag) return;
  if (photoPrintDrag.kind === "selectBox") {
    const box = document.querySelector("[data-photo-selection-box]");
    const rect = box?.getBoundingClientRect();
    const paperRect = document.getElementById("photoPrintPaper")?.getBoundingClientRect();
    const zoom = Number(photoPrintDrag.zoom || state.photoPrint.zoom || 1);
    if (rect && paperRect && rect.width > 4 && rect.height > 4) {
      const sel = { x:(rect.left-paperRect.left)/zoom, y:(rect.top-paperRect.top)/zoom, w:rect.width/zoom, h:rect.height/zoom };
      const hits = [...(state.photoPrint.photos||[]), ...(state.photoPrint.texts||[])].filter(item => {
        const b = { x:Number(item.x||0), y:Number(item.y||0), w:Number(item.w||1), h:Number(item.h||1) };
        return b.x < sel.x + sel.w && b.x + b.w > sel.x && b.y < sel.y + sel.h && b.y + b.h > sel.y;
      }).map(item => item.id);
      setPhotoPrintSelection(hits);
    } else {
      setPhotoPrintSelection([]);
    }
    photoPrintDrag = null;
    renderPhotoPrintTool();
    return;
  }
  state.photoPrint.snapHint = null;
  photoPrintDrag = null;
  await savePhotoPrintWorkspaceLocal();
  renderPhotoPrintTool();
}

document.addEventListener("pointerup", finishPhotoPrintPointerDrag);
document.addEventListener("pointercancel", finishPhotoPrintPointerDrag);
document.addEventListener("lostpointercapture", async () => {
  if (photoTextRibbonDrag) {
    photoTextRibbonDrag = null;
    await savePhotoPrintWorkspaceLocal();
  }
});




document.addEventListener("dblclick", async (e) => {
  if (state.currentView !== "photoPrint") return;
  const textEl = e.target.closest?.(".photo-text-item[data-photo-text-id]");
  if (!textEl) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  const id = textEl.dataset.photoTextId;
  const item = (state.photoPrint.texts || []).find(t => t.id === id);
  if (!item) return;

  // v180: enter edit mode immediately on the double-click and focus the actual
  // contenteditable node in-place. Re-rendering here caused Chrome to show the
  // text cursor mode but not place the caret until a third click.
  (state.photoPrint.texts || []).forEach(t => { t.isEditing = t.id === id; });
  state.photoPrint.selectedId = id;
  state.photoPrint.selectedType = "text";
  state.photoPrint.suppressTextBlurUntil = Date.now() + 900;

  document.querySelectorAll(".photo-text-item").forEach(el => {
    const active = el.dataset.photoTextId === id;
    el.classList.toggle("selected", active);
    el.classList.toggle("editing", active);
    const c = el.querySelector("[data-photo-text-content]");
    if (c) c.setAttribute("contenteditable", active ? "true" : "false");
  });

  const focusEditableText = () => {
    const content = document.querySelector(`.photo-text-item[data-photo-text-id="${CSS.escape(id)}"] [data-photo-text-content]`);
    if (!content) return false;
    content.setAttribute("contenteditable", "true");
    content.tabIndex = 0;
    content.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(content);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    return document.activeElement === content;
  };

  focusEditableText();
  requestAnimationFrame(() => {
    focusEditableText();
    setTimeout(focusEditableText, 25);
    setTimeout(focusEditableText, 75);
  });
});

document.addEventListener("focusout", async (e) => {
  if (state.currentView !== "photoPrint") return;
  const content = e.target.closest?.("[data-photo-text-content]");
  if (!content) return;
  if (Date.now() < Number(state.photoPrint.suppressTextBlurUntil || 0)) return;
  const related = e.relatedTarget;
  if (related?.closest?.("[data-photo-text-ribbon]")) return;
  const id = content.dataset.photoTextContent;
  const item = (state.photoPrint.texts || []).find(t => t.id === id);
  if (!item) return;
  item.text = content.innerText || "";
  item.isEditing = false;
  await savePhotoPrintWorkspaceLocal();
  renderPhotoPrintTool();
});

document.addEventListener("wheel", (e) => {
  if (state.currentView !== "photoPrint") return;
  const stage = e.target.closest?.("[data-photo-print-stage]");
  if (!stage) return;
  e.preventDefault();
  const current = Number(state.photoPrint.zoom || 0.75);
  const factor = e.deltaY < 0 ? 1.08 : 0.92;
  setPhotoPrintZoom(current * factor, e);
}, { passive: false });


document.addEventListener("dragstart", (e) => {
  if (state.currentView !== "photoPrint") return;
  const row = e.target.closest?.("[data-photo-layer-drag]");
  if (!row) return;
  state.photoPrint.layerDragId = row.dataset.photoLayerDrag || "";
  e.dataTransfer.effectAllowed = "move";
  try { e.dataTransfer.setData("text/plain", state.photoPrint.layerDragId); } catch (err) {}
});

document.addEventListener("dragover", (e) => {
  if (state.currentView !== "photoPrint") return;
  const row = e.target.closest?.("[data-photo-layer-drag]");
  if (!row || !state.photoPrint.layerDragId) return;
  e.preventDefault();
  row.classList.add("drag-over");
});

document.addEventListener("dragleave", (e) => {
  e.target.closest?.("[data-photo-layer-drag]")?.classList.remove("drag-over");
});

document.addEventListener("drop", async (e) => {
  if (state.currentView !== "photoPrint") return;
  const row = e.target.closest?.("[data-photo-layer-drag]");
  const dragId = state.photoPrint.layerDragId;
  if (!row || !dragId) return;
  e.preventDefault();
  document.querySelectorAll(".photo-layer-row.drag-over").forEach(el => el.classList.remove("drag-over"));
  const rows = Array.from(document.querySelectorAll("[data-photo-layer-drag]"));
  const targetIndex = Math.max(0, rows.indexOf(row));
  movePhotoPrintLayerTo(dragId, targetIndex);
  state.photoPrint.selectedId = dragId;
  state.photoPrint.layerDragId = "";
  await savePhotoPrintWorkspaceLocal();
  renderPhotoPrintTool();
});

document.addEventListener("dragend", () => {
  if (state.photoPrint) state.photoPrint.layerDragId = "";
  document.querySelectorAll(".photo-layer-row.drag-over").forEach(el => el.classList.remove("drag-over"));
});

document.addEventListener("contextmenu", async (e) => {
  if (state.currentView !== "photoPrint") return;
  const row = e.target.closest?.("[data-photo-context-filter]");
  if (!row) return;
  e.preventDefault();
  const id = row.dataset.photoContextFilter;
  const item = (state.photoPrint.photos || []).find(p => p.id === id);
  if (!item) return;
  state.photoPrint.selectedId = id;
  state.photoPrint.selectedType = "photo";
  const pad = 170;
  state.photoPrint.contextMenu = {
    id,
    x: Math.min(window.innerWidth - pad, Math.max(8, e.clientX)),
    y: Math.min(window.innerHeight - 90, Math.max(8, e.clientY))
  };
  renderPhotoPrintTool();
});

document.addEventListener("pointerdown", (e) => {
  if (state.currentView !== "photoPrint") return;
  if (!state.photoPrint?.contextMenu) return;
  if (e.target.closest?.("[data-photo-context-menu]") || e.target.closest?.("[data-photo-context-filter]")) return;
  state.photoPrint.contextMenu = null;
  renderPhotoPrintTool();
});

function renderCurrentView() {
  if (state.publicShareView) {
    renderPublicSharePage(state.publicShareView).catch(err => { console.error(err); renderLanding(); });
    return;
  }
  if (!state.session) {
    renderLanding();
    return;
  }

  if (isOnboardingRequired(state.session) && state.currentView !== "onboarding") {
    renderOnboardingPage();
    return;
  }

  if (state.currentView === "onboarding") {
    renderOnboardingPage();
    return;
  }

  if (state.currentView === "profile") {
    renderProfileHome();
    return;
  }

  if (state.currentView === "leadership") {
    renderLeadership();
    return;
  }

  if (state.currentView === "systemAdmin" || state.currentView === "admin") {
    renderSystemAdmin();
    return;
  }

  if (state.currentView === "ownersPanel") {
    renderOwnersPanel();
    return;
  }

  if (state.currentView === "moneyRequests") {
    renderMoneyRequestsTool();
    return;
  }
  if (state.currentView === "coreChampion") { renderCoreChampionTool(); return; }
  if (state.currentView === "campusCares") { renderCampusCaresTool(); return; }
  if (state.currentView === "photoPrint") { renderPhotoPrintTool(); return; }
  if (state.currentView === "notificationSettings") { renderNotificationSettings(); return; }

  if (state.currentView === "villageVoice") {
    renderVillageVoiceTool();
    return;
  }

  renderHome();
}

function render() {
  renderCurrentView();
}


$app.addEventListener("input", async (e) => {
  if (state.currentView !== "photoPrint") return;
  const editableTextId = e.target.closest?.("[data-photo-text-content]")?.dataset.photoTextContent;
  if (editableTextId) {
    const t = (state.photoPrint.texts || []).find(x => x.id === editableTextId);
    if (!t) return;
    state.photoPrint.selectedId = editableTextId;
    state.photoPrint.selectedType = "text";
    t.text = e.target.innerText || "";
    const ribbonInput = document.querySelector(`[data-photo-text-ribbon] [data-photo-text-prop="text"]`);
    if (ribbonInput && ribbonInput !== e.target) ribbonInput.value = t.text;
    clearTimeout(state.photoPrintTextSaveTimer);
    state.photoPrintTextSaveTimer = setTimeout(() => savePhotoPrintWorkspaceLocal(), 250);
    return;
  }
  if (!e.target.matches("[data-photo-text-prop]")) return;
  const t = getSelectedPhotoPrintText();
  const prop = e.target.dataset.photoTextProp;
  if (!t || !prop) return;
  const value = e.target.value;
  if (["size","opacity","lineHeight","letterSpacing","outlineWidth"].includes(prop)) t[prop] = Number(value); else t[prop] = value;
  const textEl = document.querySelector(`.photo-text-item[data-photo-text-id="${CSS.escape(t.id)}"] .photo-text-content`);
  if (textEl) {
    textEl.style.cssText = renderPhotoTextStyle(t);
    textEl.textContent = t.text || "";
  }
  clearTimeout(state.photoPrintTextSaveTimer);
  state.photoPrintTextSaveTimer = setTimeout(() => savePhotoPrintWorkspaceLocal(), 250);
});

$app.addEventListener("change", async (e) => {
  if (e.target.matches("[data-photo-print-upload]")) { await addPhotoPrintFiles(e.target.files); e.target.value = ""; return; }
  if (e.target.matches("[data-photo-text-prop]")) {
    const t = getSelectedPhotoPrintText();
    const prop = e.target.dataset.photoTextProp;
    if (t && prop) {
      const value = e.target.value;
      if (["size","opacity","lineHeight","letterSpacing","outlineWidth"].includes(prop)) t[prop] = Number(value); else t[prop] = value;
      state.photoPrint.textDefaults = { ...(state.photoPrint.textDefaults || {}), color: t.color, size: t.size, font: t.font, align: t.align, outlineColor: t.outlineColor, outlineWidth: t.outlineWidth };
      await savePhotoPrintWorkspaceLocal();
      renderPhotoPrintTool();
    }
    return;
  }
  if (e.target.matches("[data-education-level]")) {
    const row = e.target.closest("[data-education-row]");
    const isCert = e.target.value === "Certificate";
    const isHighSchool = e.target.value === "High School Diploma";
    row?.querySelector(".education-in")?.classList.toggle("hidden", isCert || isHighSchool);
    row?.querySelector('[name="educationField"]')?.classList.toggle("hidden", isCert || isHighSchool);
    row?.querySelector('[name="educationGradYear"]')?.classList.toggle("hidden", !isHighSchool);
    row?.querySelector('[name="educationCertificate"]')?.classList.toggle("hidden", !isCert);
    refreshEducationCertificateOptions(row?.closest("[data-education-builder]") || document);
    return;
  }
  if (e.target.matches("[data-education-certificate]")) {
    refreshEducationCertificateOptions(e.target.closest("[data-education-builder]") || document);
    return;
  }
  if (e.target.matches("[data-core-schedule-type]")) {
    state.appSettings = { ...(state.appSettings || {}), coreChampionScheduleType: e.target.value };
    renderLeadership();
    return;
  }
  if (e.target.matches("[data-core-eligible]")) { await toggleCoreEligible(e.target.dataset.coreEligible, e.target.checked); return; }
  if (e.target.matches("[data-dev-view-role]")) {
    state.devViewRoleKey = e.target.value;
    state.selectedMoneyApprovalIds = [];
    state.expandedMoneyRequestId = "";
    renderHome();
    return;
  }
  if (e.target.matches("[data-important-dates-import]")) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await importImportantDatesFromPayload(payload);
      await loadImportantDates();
      renderHome();
      showToast("Important dates import saved.");
    } catch (err) {
      alert(err.message || "That file could not be imported. Please use the converted family calendar JSON file.");
    }
    return;
  }

  if (e.target.matches("[data-weekly-theme-import]")) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const form = e.target.closest("form");
      applyWeeklyThemeImportToForm(form, payload);
      await saveWeeklyThemes(form);
      await loadWeeklyThemes();
      renderHome();
      showToast("Curriculum import saved to Weekly Themes.");
    } catch (err) {
      alert(err.message || "That file could not be imported. Please use the converted curriculum JSON file.");
    }
    return;
  }

  if (e.target.matches("[data-letterland-sprite-sheet]")) {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const originalImage = await readRawImageData(file);
        const dims = await getImageDimensionsFromDataUrl(originalImage);
        const form = e.target.closest("form") || getWeeklyThemesForm();
        setLetterlandSpriteSheetOnForm(form, originalImage);
        if (form?.letterlandSpriteWidth) form.letterlandSpriteWidth.value = String(dims.width || "");
        if (form?.letterlandSpriteHeight) form.letterlandSpriteHeight.value = String(dims.height || "");
        syncLetterlandSpriteSheetToState(form, false);
        refreshLetterlandSpriteSheetStatus(form);
        e.target.value = "";
        showToast("Sprite sheet replaced. Click Preview / adjust cells if needed, then choose images for each week.");
      } catch (err) {
        alert(err.message || "That sprite sheet could not be processed. Please try a smaller image.");
      }
    }
    return;
  }

  if (e.target.matches("[data-letterland-image-week]")) {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedImage = await resizeToolImage(file);
        const week = e.target.dataset.letterlandImageWeek;
        const form = e.target.closest("form");
        const hidden = form?.querySelector(`[name="letterImage_${week}"]`);
        if (hidden) hidden.value = compressedImage;
        const card = e.target.closest(".weekly-theme-card");
        card?.querySelector(".weekly-letter-preview")?.remove();
        card?.insertAdjacentHTML("beforeend", `<img class="weekly-letter-preview" src="${compressedImage}" alt="Letterland week ${week}" />`);
        showToast("Letterland image ready. Click Save Weekly Themes to publish it.");
      } catch (err) {
        alert(err.message || "That image could not be processed. Please try a smaller image.");
      }
    }
    return;
  }

  if (e.target.matches("[data-village-block-bg]")) {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedImage = await resizeToolImage(file);
        const blockId = e.target.dataset.villageBlockBg;
        const form = e.target.closest("form");
        form?.querySelectorAll(`[data-block-bg-data="${blockId}"]`).forEach(hidden => { hidden.value = compressedImage; });
        state.expandedVillageVoiceEditorId = blockId;
        const kind = form?.dataset?.printableKind;
        if (kind) updatePrintableDraftFromForm(kind, form); else updateVillageVoiceDraftFromForm(form);
        renderVillageVoiceTool();
        showToast("Block background image ready. Click Save to publish it.");
      } catch (err) {
        alert(err.message || "That image could not be processed. Please try a smaller image.");
      }
    }
    return;
  }

  if (e.target.matches("[data-village-block-clip]")) {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedImage = await resizeToolImage(file);
        const blockId = e.target.dataset.villageBlockClip;
        const form = e.target.closest("form");
        form?.querySelectorAll(`[data-block-clip-data="${blockId}"]`).forEach(hidden => { hidden.value = compressedImage; });
        state.expandedVillageVoiceEditorId = blockId;
        state.villageVoiceSelectedBlockTab = "content";
        const kind = form?.dataset?.printableKind;
        if (kind) updatePrintableDraftFromForm(kind, form); else updateVillageVoiceDraftFromForm(form);
        renderVillageVoiceTool();
        showToast("Clip art added to block. Click Save to publish it.");
      } catch (err) {
        alert(err.message || "That image could not be processed. Please try a smaller image.");
      }
    }
    return;
  }

  if (e.target.matches("[data-campus-building]")) {
    const loc = state.campusCareLocations.find(l => l.id === e.target.value);
    const sub = e.target.closest("form")?.querySelector("[data-campus-sublocation]");
    if (sub) sub.innerHTML = (loc?.sublocations || []).map(x => `<option>${escapeHtml(x)}</option>`).join("");
    return;
  }
  if (e.target.matches("[data-campus-status-change]")) { await updateCampusTaskStatus(e.target.dataset.campusStatusChange, e.target.value); return; }

  if (e.target.matches("[data-dev-view-position]")) {
    state.devViewPosition = e.target.value;
    state.selectedMoneyApprovalIds = [];
    state.expandedMoneyRequestId = "";
    renderHome();
    return;
  }
  if (e.target.matches('[name="requestSchoolId"]')) {
    document.querySelectorAll("[data-budget-category]").forEach(select => {
      select.innerHTML = renderBudgetCategoryOptions(select.value);
      syncBudgetFromCategory(select);
    });
    return;
  }
  if (e.target.matches("[data-select-money-approval]")) {
    const id = e.target.dataset.selectMoneyApproval;
    const set = new Set(state.selectedMoneyApprovalIds || []);
    e.target.checked ? set.add(id) : set.delete(id);
    state.selectedMoneyApprovalIds = Array.from(set);
    renderMoneyRequestsTool();
    return;
  }
  if (e.target.matches("[data-user-profile-image-input]")) {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const rawImage = await readRawImageData(file);
        const form = e.target.closest("form");
        state.modal.user = {
          ...(state.modal.user || { roles: ["teacher"], schoolIds: [] }),
          firstName: form.firstName?.value || state.modal.user?.firstName || "",
          lastName: form.lastName?.value || state.modal.user?.lastName || "",
          usedName: form.usedName?.value || "",
          birthday: form.birthday?.value || state.modal.user?.birthday || "",
          educationList: collectEducationEntries(form),
          earlyEducationStart: form.earlyEducationStart?.value || state.modal.user?.earlyEducationStart || "",
          whyEarlyEducation: form.whyEarlyEducation?.value || state.modal.user?.whyEarlyEducation || "",
          leaderSummary: form.leaderSummary?.value || state.modal.user?.leaderSummary || "",
          pin: form.pin?.value || "",
          teamPosition: form.teamPosition?.value || state.modal.user?.teamPosition || "",
          role: form.role?.value || state.modal.user?.role || "teacher",
          roles: [form.role?.value || state.modal.user?.role || "teacher"],
          schoolIds: getFormSchoolIds(form),
          profileImageData: form.profileImageData?.value || state.modal.user?.profileImageData || "",
          rawProfileImageData: rawImage,
          cropZoom: 1.2,
          cropX: 50,
          cropY: 50
        };
        renderCurrentView();
        showToast("Adjust the crop, then click Use This Crop.");
      } catch (err) {
        alert(err.message || "That image could not be processed. Please try a smaller image.");
      }
    }
    return;
  }
  if (e.target.matches("[data-branding-logo-input]")) {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedImage = await resizeToolImage(file);
        const form = e.target.closest("form");
        const hidden = form?.querySelector('[name="ovaLogoData"]');
        if (hidden) hidden.value = compressedImage;
        state.appSettings = { ...(state.appSettings || {}), ovaLogoData: compressedImage };
        showToast("Logo ready. Click Save Branding to publish it.");
        renderSystemAdmin();
      } catch (err) {
        alert(err.message || "That image could not be processed. Please try a smaller image.");
      }
    }
    return;
  }
  if (e.target.matches("[data-tool-image-input]")) {
    const file = e.target.files?.[0];
    const toolKey = e.target.dataset.toolImageInput;
    if (file && toolKey) {
      try {
        const compressedImage = await resizeToolImage(file);
        const cfg = getToolConfig(toolKey);
        const i = state.appTools.findIndex(t => t.key === toolKey);
        const next = { ...cfg, key: toolKey, imageData: compressedImage };
        if (i >= 0) state.appTools[i] = next; else state.appTools.push(next);
        showToast("Image ready. Click Save Tool Settings to publish it.");
        renderSystemAdmin();
      } catch (err) {
        alert(err.message || "That image could not be processed. Please try a smaller image.");
      }
    }
    return;
  }
  if (e.target.matches("[data-profile-crop-zoom], [data-profile-crop-x], [data-profile-crop-y]")) {
    const user = state.modal?.user || {};
    user.cropZoom = document.querySelector("[data-profile-crop-zoom]")?.value || user.cropZoom || 1.2;
    user.cropX = document.querySelector("[data-profile-crop-x]")?.value || user.cropX || 50;
    user.cropY = document.querySelector("[data-profile-crop-y]")?.value || user.cropY || 50;
    state.modal.user = user;
    const img = document.querySelector("[data-profile-crop-img]");
    if (img) {
      img.style.transformOrigin = `${user.cropX}% ${user.cropY}%`;
      img.style.transform = `scale(${user.cropZoom})`;
    }
    return;
  }
  if (e.target.matches("[data-village-month]")) {
    state.villageVoiceSelectedMonth = e.target.value;
    const form = e.target.closest("form");
    if (form?.theme) form.theme.value = getSeasonTheme(e.target.value);
    renderVillageVoicePreviewOnly();
    return;
  }
  if (e.target.matches("[data-village-live]")) {
    const form = e.target.closest("form");
    const kind = form?.dataset?.printableKind;
    if (e.target.matches("[data-block-function]")) {
      if (kind) updatePrintableDraftFromForm(kind, form); else updateVillageVoiceDraftFromForm(form);
      renderVillageVoiceTool();
    } else {
      if (kind) renderPrintablePreviewOnly(kind); else renderVillageVoicePreviewOnly();
    }
    return;
  }
  if (e.target.matches("[data-printable-live]")) {
    const kind = e.target.closest("form")?.dataset?.printableKind;
    if (kind) renderPrintablePreviewOnly(kind);
    return;
  }
  if (e.target.matches("[data-door-live]")) {
    renderDoorPreviewOnly();
    return;
  }
  if (e.target.matches("[data-teacher-bio-live]")) {
    renderTeacherBioPreviewOnly();
    return;
  }
  if (e.target.matches("[data-printable-live]")) {
    const kind = e.target.closest("form")?.dataset?.printableKind;
    if (kind) renderPrintablePreviewOnly(kind);
    return;
  }
  if (e.target.matches("[data-door-live]")) {
    renderDoorPreviewOnly();
    return;
  }
  if (e.target.matches("[data-budget-category]")) {
    syncBudgetFromCategory(e.target);
    updateMoneyRequestAddButtons();
    return;
  }

  if (e.target.id === "schoolSelect") {
    await withAppLoading("Loading school roster...", async () => {
      state.selectedSchoolId = e.target.value;
      saveLastSelectedSchool(state.selectedSchoolId);
      await loadRoster();
      renderLanding();
    });
  }
});

$app.addEventListener("click", async (e) => {
  const loginUid = e.target.closest("[data-login-uid]")?.dataset.loginUid;
  const modalType = e.target.closest("[data-modal]")?.dataset.modal;
  const tab = e.target.closest("[data-tab]")?.dataset.tab;
  const action = e.target.closest("[data-action]")?.dataset.action;
  const resetPin = e.target.closest("[data-reset-pin]")?.dataset.resetPin;
  const resetUserOnboarding = e.target.closest("[data-reset-user-onboarding]")?.dataset.resetUserOnboarding;
  const deleteUid = e.target.closest("[data-delete-user]")?.dataset.deleteUser;
  const deletePositionId = e.target.closest("[data-delete-position]")?.dataset.deletePosition;
  const deleteRoleId = e.target.closest("[data-delete-role]")?.dataset.deleteRole;
  const editSchoolId = e.target.closest("[data-edit-school]")?.dataset.editSchool;
  const editUserId = e.target.closest("[data-edit-user]")?.dataset.editUser;
  const editPositionId = e.target.closest("[data-edit-position]")?.dataset.editPosition;
  const editRoleId = e.target.closest("[data-edit-role]")?.dataset.editRole;
  const editRequestTypeId = e.target.closest("[data-edit-request-type]")?.dataset.editRequestType;
  const deleteRequestTypeId = e.target.closest("[data-delete-request-type]")?.dataset.deleteRequestType;
  const editBudgetCodeId = e.target.closest("[data-edit-budget-code]")?.dataset.editBudgetCode;
  const deleteBudgetCodeId = e.target.closest("[data-delete-budget-code]")?.dataset.deleteBudgetCode;
  const deleteImportantDateId = e.target.closest("[data-delete-important-date]")?.dataset.deleteImportantDate;
  const editImportantDateId = e.target.closest("[data-edit-important-date]")?.dataset.editImportantDate;
  const cancelImportantDateEdit = e.target.closest("[data-cancel-important-date-edit]");
  const deleteCertificateId = e.target.closest("[data-delete-certificate]")?.dataset.deleteCertificate;
  const printableTab = e.target.closest("[data-printable-tab]")?.dataset.printableTab;
  const clearBrandingLogo = e.target.closest("[data-clear-branding-logo]");
  const onboardingPrev = e.target.closest("[data-onboarding-prev]");
  const onboardingGoStep = e.target.closest("[data-onboarding-go-step]")?.dataset.onboardingGoStep;
  const leaderCheckbox = e.target.closest("[data-new-user-leader-checkbox]");
  if (leaderCheckbox) {
    const form = leaderCheckbox.closest("form");
    const box = form?.querySelector("[data-new-user-leader-password]");
    if (box) box.hidden = !leaderCheckbox.checked;
    return;
  }
  if (e.target.closest("[data-photo-print-open-upload]")) { document.querySelector("[data-photo-print-upload]")?.click(); return; }
  if (e.target.closest("[data-photo-zoom-reset]")) { setPhotoPrintZoom(1); return; }
  if (onboardingPrev) { state.onboardingStep = Math.max(0, Number(state.onboardingStep || 0) - 1); renderOnboardingPage(); return; }
  if (onboardingGoStep !== undefined) { state.onboardingStep = Math.max(0, Math.min(Number(onboardingGoStep || 0), 3)); renderOnboardingPage(); return; }
  if (modalType === "forcePinChange") { state.modal = { type: "forcePinChange" }; renderCurrentView(); return; }
  if (printableTab) {
    state.printableTab = printableTab;
    renderVillageVoiceTool();
    return;
  }

  const leadershipTab = e.target.closest("[data-leadership-tab]")?.dataset.leadershipTab;
  const ownerTab = e.target.closest("[data-owner-tab]")?.dataset.ownerTab;
  const toolId = e.target.closest("[data-tool]")?.dataset.tool;
  const moneyQueueTab = e.target.closest("[data-money-queue-tab]")?.dataset.moneyQueueTab;
  const dosoApproveMoneyRequestId = e.target.closest("[data-doso-approve-money-request]")?.dataset.dosoApproveMoneyRequest;
  const ownerApproveMoneyRequestId = e.target.closest("[data-owner-approve-money-request]")?.dataset.ownerApproveMoneyRequest;
  const bulkMoneyApprove = e.target.closest("[data-bulk-money-approve]")?.dataset.bulkMoneyApprove;
  const denyMoneyRequestId = e.target.closest("[data-deny-money-request]")?.dataset.denyMoneyRequest;
  const denyStage = e.target.closest("[data-deny-stage]")?.dataset.denyStage;
  const editDeniedMoneyRequestId = e.target.closest("[data-edit-denied-money-request]")?.dataset.editDeniedMoneyRequest;
  const bookmarkToolId = e.target.closest("[data-bookmark-tool]")?.dataset.bookmarkTool;
  const hideToolId = e.target.closest("[data-hide-tool]")?.dataset.hideTool;
  const restoreToolId = e.target.closest("[data-restore-tool]")?.dataset.restoreTool;
  const saveToolConfigKey = e.target.closest("[data-save-tool-config]")?.dataset.saveToolConfig;
  const nukeMoneyRequests = e.target.closest("[data-nuke-money-requests]");
  const nukeCampusCareRequests = e.target.closest("[data-nuke-campus-care-requests]");
  const clearDevPreview = e.target.closest("[data-clear-dev-preview]");
  const openSelfProfile = e.target.closest("[data-open-self-profile]");
  const permissionToolToggle = e.target.closest("[data-permission-tool-toggle]")?.dataset.permissionToolToggle;
  const addPermissionRole = e.target.closest("[data-add-permission-role]")?.dataset.addPermissionRole;
  const removePermissionRole = e.target.closest("[data-remove-permission-role]")?.dataset.removePermissionRole;
  const addPermissionPosition = e.target.closest("[data-add-permission-position]")?.dataset.addPermissionPosition;
  const removePermissionPosition = e.target.closest("[data-remove-permission-position]")?.dataset.removePermissionPosition;

  if (e.target.closest("[data-finish-onboarding]")) { await withAppLoading("Finishing onboarding...", completeOnboardingIfReady); return; }
  const onboardingProfileBtn = e.target.closest("[data-open-onboarding-profile]");
  if (onboardingProfileBtn) { state.modal = null; renderProfileHome(); return; }
  const copyShareLink = e.target.closest("[data-copy-share-link]")?.dataset.copyShareLink;
  if (copyShareLink) { try { await navigator.clipboard.writeText(copyShareLink); showToast("Link copied."); } catch (err) { showToast("Copy failed. Select and copy the link manually."); } renderLeadership(); return; }
  const publicPositionSummary = e.target.closest("[data-public-position-card] > summary");
  if (publicPositionSummary) {
    const card = publicPositionSummary.closest("[data-public-position-card]");
    document.querySelectorAll("[data-public-position-card][open]").forEach(other => { if (other !== card) other.removeAttribute("open"); });
  }
  const publicPersonId = e.target.closest("[data-public-person]")?.dataset.publicPerson;
  if (publicPersonId) {
    const u = (state.publicShareUsers || []).find(x => x.uid === publicPersonId);
    if (u) { state.modal = { type: "publicWhatILike", user: u }; renderCurrentView(); }
    return;
  }
  const addLikeRowKey = e.target.closest("[data-add-like-row]")?.dataset.addLikeRow;
  if (addLikeRowKey) {
    const wrap = e.target.closest(`[data-like-rows="${addLikeRowKey}"]`);
    const input = wrap?.querySelector(`[name="like_${addLikeRowKey}"]`);
    const value = String(input?.value || "").trim();
    if (wrap && input && value) {
      const list = wrap.querySelector(`[data-like-chip-list="${addLikeRowKey}"]`);
      list?.querySelector(".like-empty-hint")?.remove();
      list?.classList.remove("is-empty");
      const existing = Array.from(list?.querySelectorAll(`[data-like-chip-value="${addLikeRowKey}"]`) || []).map(x => String(x.value || "").toLowerCase());
      if (!existing.includes(value.toLowerCase())) list?.insertAdjacentHTML("beforeend", renderLikeChip(addLikeRowKey, value));
      input.value = "";
      wrap.querySelector("[data-add-like-row]")?.classList.add("hidden");
      input.focus();
    }
    return;
  }
  if (e.target.closest("[data-remove-like-chip]")) {
    const list = e.target.closest("[data-like-chip-list]");
    e.target.closest("[data-like-chip]")?.remove();
    if (list && !list.querySelector("[data-like-chip]")) {
      list.classList.add("is-empty");
      list.innerHTML = `<span class="like-empty-hint">No items yet.</span>`;
    }
    return;
  }
  if (e.target.closest("[data-remove-like-row]")) {
    e.target.closest("[data-like-row]")?.remove();
    return;
  }
  if (openSelfProfile) { renderProfileHome(); return; }
  const selfProfileEditorBtn = e.target.closest("[data-open-self-profile-editor]");
  if (selfProfileEditorBtn) {
    state.modal = { type: "selfProfile", section: selfProfileEditorBtn.dataset.profileSection || "details", user: { ...state.session } };
    renderCurrentView();
    return;
  }


  const duplicateChoice = e.target.closest("[data-photo-duplicate-choice]")?.dataset.photoDuplicateChoice;
  if (duplicateChoice) {
    if (duplicateChoice === "cancel") { state.photoPrint.duplicatePrompt = null; renderPhotoPrintTool(); return; }
    await duplicatePhotoPrintSelectionSmart(duplicateChoice === "fill" ? "fill" : "once");
    return;
  }
  const photoOrientation = e.target.closest("[data-photo-orientation]")?.dataset.photoOrientation;
  if (photoOrientation) { state.photoPrint.orientation = photoOrientation === "landscape" ? "landscape" : "portrait"; await savePhotoPrintWorkspaceLocal(); renderPhotoPrintTool(); return; }
  const photoGuideStep = e.target.closest("[data-photo-guide-step]")?.dataset.photoGuideStep;
  if (photoGuideStep) { const [kind, rawStep] = photoGuideStep.split(":"); const key = kind === "cols" ? "guideCols" : "guideRows"; state.photoPrint[key] = Math.max(1, Math.min(8, Number(state.photoPrint[key] || 1) + Number(rawStep || 0))); await savePhotoPrintWorkspaceLocal(); renderPhotoPrintTool(); return; }
  if (e.target.closest("[data-photo-snap-toggle]")) { state.photoPrint.snapGuides = state.photoPrint.snapGuides === false; await savePhotoPrintWorkspaceLocal(); renderPhotoPrintTool(); return; }
  if (e.target.closest("[data-photo-add-text]")) { pushPhotoPrintHistory(); addPhotoPrintTextBox(); await savePhotoPrintWorkspaceLocal(); renderPhotoPrintTool(); return; }

  const photoSelect = e.target.closest("[data-photo-select]")?.dataset.photoSelect;
  if (photoSelect) { setPhotoPrintSelection(e.ctrlKey || e.metaKey ? (getPhotoPrintSelectedIds().includes(photoSelect) ? getPhotoPrintSelectedIds().filter(id => id !== photoSelect) : [...getPhotoPrintSelectedIds(), photoSelect]) : [photoSelect], photoSelect); state.photoPrint.cropMode = false; renderPhotoPrintTool(); return; }
  if (e.target.closest("[data-photo-print-print]")) { printPhotoPrintPage(); return; }
  if (e.target.closest("[data-photo-print-clear]")) { if (confirm("Clear all photos from this local page?")) { state.photoPrint = { ...defaultPhotoPrintState(), loaded: true }; await savePhotoPrintWorkspaceLocal(); renderPhotoPrintTool(); } return; }
  if (e.target.closest("[data-photo-duplicate-selected]")) { openPhotoPrintDuplicatePrompt(); return; }
  const photoLayer = e.target.closest("[data-photo-layer]")?.dataset.photoLayer;
  if (photoLayer) { const id = state.photoPrint.selectedId; if (id) { movePhotoPrintAnyLayer(id, photoLayer); await savePhotoPrintWorkspaceLocal(); renderPhotoPrintTool(); } return; }
  const photoReset = e.target.closest("[data-photo-reset]")?.dataset.photoReset;
  if (photoReset) { const item = getSelectedPhotoPrintItem(); if (item) { if (photoReset === "crop") { item.cropL = 0; item.cropT = 0; item.cropR = 0; item.cropB = 0; } if (photoReset === "rotation") item.rotate = 0; if (photoReset === "size") { const b = getPhotoPrintBaseDims(item); item.w = b.w; item.h = b.h; } await savePhotoPrintWorkspaceLocal(); renderPhotoPrintTool(); } return; }
  const photoFit = e.target.closest("[data-photo-fit]")?.dataset.photoFit;
  if (photoFit) { if (fitPhotoPrintSelectedToGuide(photoFit)) { await savePhotoPrintWorkspaceLocal(); renderPhotoPrintTool(); } return; }
  if (e.target.closest("[data-photo-crop-toggle]")) {
    const item = getSelectedPhotoPrintItem();
    if (state.photoPrint.cropMode && item) {
      const b = getPhotoPrintCropBounds(item);
      item.x = (item.x || 0) + (item.w || 1) * b.l / 100;
      item.y = (item.y || 0) + (item.h || 1) * b.t / 100;
      item.w = Math.max(30, (item.w || 1) * b.visibleW / 100);
      item.h = Math.max(30, (item.h || 1) * b.visibleH / 100);
    }
    state.photoPrint.cropMode = !state.photoPrint.cropMode;
    await savePhotoPrintWorkspaceLocal();
    renderPhotoPrintTool();
    return;
  }
  if (e.target.closest("[data-photo-delete]")) { deletePhotoPrintSelection(); await savePhotoPrintWorkspaceLocal(); renderPhotoPrintTool(); return; }
  if (e.target.closest("[data-photo-duplicate]")) { openPhotoPrintDuplicatePrompt(); return; }

  const textPropEl = e.target.closest("[data-photo-text-prop]");
  const textProp = textPropEl?.dataset.photoTextProp;
  if (textProp && textPropEl.tagName === "BUTTON") {
    const t = getSelectedPhotoPrintText();
    if (t) {
      pushPhotoPrintHistory();
      const value = textPropEl.value || textPropEl.getAttribute("value") || "";
      if (["size","opacity","lineHeight","letterSpacing","outlineWidth"].includes(textProp)) t[textProp] = Number(value);
      else t[textProp] = value;
      state.photoPrint.textDefaults = { ...(state.photoPrint.textDefaults || {}), color: t.color, size: t.size, font: t.font, align: t.align, outlineColor: t.outlineColor, outlineWidth: t.outlineWidth };
      await savePhotoPrintWorkspaceLocal();
      renderPhotoPrintTool();
    }
    return;
  }
  const textToggle = e.target.closest("[data-photo-text-toggle]")?.dataset.photoTextToggle;
  if (textToggle) { const t = getSelectedPhotoPrintText(); if (t) { pushPhotoPrintHistory(); t[textToggle] = !t[textToggle]; autoSizePhotoTextBox(t); await savePhotoPrintWorkspaceLocal(); renderPhotoPrintTool(); } return; }
  if (e.target.closest("[data-photo-text-clear-bg]")) { const t = getSelectedPhotoPrintText(); if (t) { pushPhotoPrintHistory(); t.background = "transparent"; await savePhotoPrintWorkspaceLocal(); renderPhotoPrintTool(); } return; }
  const textLayer = e.target.closest("[data-photo-text-layer]")?.dataset.photoTextLayer;
  if (textLayer) { const id = state.photoPrint.selectedId; if (id) { movePhotoPrintAnyLayer(id, textLayer); await savePhotoPrintWorkspaceLocal(); renderPhotoPrintTool(); } return; }
  if (e.target.closest("[data-photo-text-delete]")) { deletePhotoPrintSelection(); await savePhotoPrintWorkspaceLocal(); renderPhotoPrintTool(); return; }
  if (e.target.closest("[data-photo-text-duplicate]")) { openPhotoPrintDuplicatePrompt(); return; }
  const chromaContextId = e.target.closest("[data-photo-context-chroma]")?.dataset.photoContextChroma;
  if (chromaContextId) { const item = (state.photoPrint.photos || []).find(p => p.id === chromaContextId); if (item) { setPhotoPrintSelection([item.id], item.id); state.photoPrint.contextMenu = null; await applyPhotoChromaKey(item, item.chromaKeyColor || "#00ff00", item.chromaKeyTolerance || 70); await savePhotoPrintWorkspaceLocal(); renderPhotoPrintTool(); } return; }
  const removeFilterId = e.target.closest("[data-photo-context-remove-filter]")?.dataset.photoContextRemoveFilter;
  if (removeFilterId) { const item = (state.photoPrint.photos || []).find(p => p.id === removeFilterId); if (item?.originalSrc) { item.src = item.originalSrc; delete item.originalSrc; delete item.chromaKeyColor; delete item.chromaKeyTolerance; setPhotoPrintSelection([item.id], item.id); state.photoPrint.contextMenu = null; await savePhotoPrintWorkspaceLocal(); renderPhotoPrintTool(); } return; }
  if (e.target.closest("[data-photo-apply-chroma]")) { const item = getSelectedPhotoPrintItem(); if (item) { const color = document.querySelector("[data-photo-filter-color]")?.value || item.chromaKeyColor || "#00ff00"; const tolerance = Number(document.querySelector("[data-photo-filter-tolerance]")?.value || item.chromaKeyTolerance || 70); await applyPhotoChromaKey(item, color, tolerance); await savePhotoPrintWorkspaceLocal(); renderPhotoPrintTool(); } return; }
  if (e.target.closest("[data-photo-reset-filter]")) { const item = getSelectedPhotoPrintItem(); if (item?.originalSrc) { item.src = item.originalSrc; delete item.originalSrc; delete item.chromaKeyColor; delete item.chromaKeyTolerance; await savePhotoPrintWorkspaceLocal(); renderPhotoPrintTool(); } return; }

  if (clearDevPreview) { await withAppLoading("Updating view...", async () => { state.devViewRoleKey = ""; state.devViewPosition = ""; renderHome(); }); return; }
  if (editImportantDateId) { state.editingImportantDateId = editImportantDateId; renderLeadership(); return; }
  if (cancelImportantDateEdit) { state.editingImportantDateId = ""; renderLeadership(); return; }
  if (deleteImportantDateId) { await withAppLoading("Deleting date...", async () => { await deleteImportantDate(deleteImportantDateId); await refreshAdminData(); renderLeadership(); }); return; }
  if (deleteCertificateId) { await withAppLoading("Deleting certificate...", async () => { await deleteCertificate(deleteCertificateId); await refreshAdminData(); renderLeadership(); }); return; }
  if (e.target.closest("[data-add-education-row]")) { const builder = e.target.closest("[data-education-builder]"); const wrap = builder?.querySelector("[data-education-rows]"); if (wrap) { wrap.insertAdjacentHTML("beforeend", renderEducationRow({})); refreshEducationCertificateOptions(builder); } return; }
  if (e.target.closest("[data-remove-education-row]")) { const builder = e.target.closest("[data-education-builder]"); const rows = builder?.querySelector("[data-education-rows]"); e.target.closest("[data-education-row]")?.remove(); if (rows && !rows.querySelector("[data-education-row]")) rows.insertAdjacentHTML("beforeend", renderEducationRow({})); refreshEducationCertificateOptions(builder || document); return; }
  if (e.target.closest("[data-add-village-block]")) { addVillageVoiceBlock(); return; }
  if (e.target.closest("[data-reset-village-voice]")) { resetVillageVoiceDraft(); return; }
  if (e.target.closest("[data-export-village-pdf]")) { exportVillageVoicePdf(); return; }
  const addPrintableKind = e.target.closest("[data-add-printable-block]")?.dataset.addPrintableBlock;
  if (addPrintableKind) { addPrintableBlock(addPrintableKind); return; }
  const exportPrintableKind = e.target.closest("[data-export-printable-pdf]")?.dataset.exportPrintablePdf;
  if (exportPrintableKind) { exportPrintablePdf(exportPrintableKind); return; }
  if (e.target.closest("[data-export-door-pdf]")) { exportDoorPdf(); return; }
  if (e.target.closest("[data-save-illness-template]")) { await saveIllnessTemplate(); return; }
  const illnessTemplateId = e.target.closest("[data-load-illness-template]")?.dataset.loadIllnessTemplate;
  if (illnessTemplateId) { loadIllnessTemplate(illnessTemplateId); return; }
  if (nukeMoneyRequests) { await withAppLoading("Opening confirmation...", async () => { state.modal = { type: "nukeMoneyRequests", error: "" }; renderSystemAdmin(); }); return; }
  if (nukeCampusCareRequests) { await withAppLoading("Opening confirmation...", async () => { state.modal = { type: "nukeCampusCareRequests", error: "" }; renderSystemAdmin(); }); return; }

  const collapseVoiceBlock = e.target.closest("[data-voice-collapse]")?.dataset.voiceCollapse;
  if (collapseVoiceBlock) {
    const block = e.target.closest(".voice-edit-block");
    block?.classList.toggle("collapsed");
    e.target.textContent = block?.classList.contains("collapsed") ? "Expand" : "Collapse";
    return;
  }

  if (e.target.closest("[data-show-password]")) {
    const wrap = e.target.closest(".password-input-wrap");
    const input = wrap?.querySelector("input");
    if (input) {
      input.type = input.type === "password" ? "text" : "password";
      e.target.classList.toggle("active", input.type === "text");
      e.target.setAttribute("aria-label", input.type === "text" ? "Hide password" : "Show password");
    }
    return;
  }
  if (e.target.closest("[data-toggle-theme]")) { await withAppLoading("Switching theme...", async () => { toggleThemePreference(); renderCurrentView(); }); return; }
  if (e.target.closest("[data-toggle-notifications]")) { await withAppLoading("Opening notifications...", async () => { state.notificationsOpen = !state.notificationsOpen; renderCurrentView(); }); return; }
  if (e.target.closest("[data-clear-notifications]")) { await withAppLoading("Clearing notifications...", async () => { await Promise.all(state.notifications.map(n => updateDoc(doc(db, "notifications", n.id), { read: true, cleared: true }))); state.notificationsOpen = false; await loadNotifications(); renderCurrentView(); }); return; }
  const openNotificationId = e.target.closest("[data-open-notification]")?.dataset.openNotification;
  if (openNotificationId) {
    await updateDoc(doc(db, "notifications", openNotificationId), { read: true });
    const n = state.notifications.find(x => x.id === openNotificationId);
    state.notificationsOpen = false;
    await loadNotifications();
    if (n?.toolKey === "moneyRequests") { state.moneyRequestsTab = getNotificationTargetTab(n); renderMoneyRequestsTool(); } else renderCurrentView();
    return;
  }
  if (saveToolConfigKey) { await withAppLoading("Saving tool settings...", async () => { await saveToolConfig(saveToolConfigKey); renderSystemAdmin(); }); return; }
  if (e.target.closest("[data-campus-open-menu]")) { e.target.closest(".home-tool-wrap")?.classList.toggle("menu-open"); return; }
  const campusOpenMode = e.target.closest("[data-campus-open-mode]")?.dataset.campusOpenMode;
  if (campusOpenMode) { setCampusCaresOpenPreference(campusOpenMode); renderHome(); showToast("Campus Cares opening preference saved."); return; }
  if (bookmarkToolId) { await withAppLoading("Updating bookmarks...", async () => { const prefs=getToolPrefs(); prefs.bookmarks = prefs.bookmarks || []; prefs.bookmarks = prefs.bookmarks.includes(bookmarkToolId) ? prefs.bookmarks.filter(id=>id!==bookmarkToolId) : [...prefs.bookmarks, bookmarkToolId]; saveToolPrefs(prefs); renderHome(); }); return; }
  if (hideToolId) { await withAppLoading("Hiding tool...", async () => { const prefs=getToolPrefs(); prefs.hidden = Array.from(new Set([...(prefs.hidden || []), hideToolId])); prefs.bookmarks=(prefs.bookmarks||[]).filter(id=>id!==hideToolId); saveToolPrefs(prefs); renderHome(); }); return; }
  if (restoreToolId) { await withAppLoading("Restoring tool...", async () => { const prefs=getToolPrefs(); prefs.hidden=(prefs.hidden||[]).filter(id=>id!==restoreToolId); saveToolPrefs(prefs); renderHome(); }); return; }

  if (permissionToolToggle) {
    state.expandedPermissionToolKey = state.expandedPermissionToolKey === permissionToolToggle ? "" : permissionToolToggle;
    renderSystemAdmin();
    return;
  }

  if (addPermissionRole) {
    const [toolKey, permissionKey] = addPermissionRole.split("__");
    const roleId = $app.querySelector(`[data-role-select="${addPermissionRole}"]`)?.value;
    const role = state.roles.find(r => r.id === roleId);
    if (role) {
      role.permissions = role.permissions || {};
      role.permissions[toolKey] = role.permissions[toolKey] || {};
      role.permissions[toolKey][permissionKey] = { enabled: true, positions: ["__any__"] };
      renderSystemAdmin();
    }
    return;
  }

  if (removePermissionRole) {
    const { toolKey, permissionKey, roleId } = parsePermissionToken(removePermissionRole);
    const role = state.roles.find(r => r.id === roleId);
    if (role?.permissions?.[toolKey]?.[permissionKey]) {
      role.permissions[toolKey][permissionKey] = { enabled: false, positions: ["__any__"] };
      renderSystemAdmin();
    }
    return;
  }

  if (addPermissionPosition) {
    const { toolKey, permissionKey, roleId } = parsePermissionToken(addPermissionPosition);
    const select = $app.querySelector(`[data-position-select="${addPermissionPosition.replace('position', 'positionSelect')}"]`);
    const value = select?.value;
    const role = state.roles.find(r => r.id === roleId);
    if (role && value) {
      role.permissions = role.permissions || {};
      role.permissions[toolKey] = role.permissions[toolKey] || {};
      const current = role.permissions[toolKey][permissionKey] || { enabled: true, positions: ["__any__"] };
      let nextPositions = current.positions || ["__any__"];
      nextPositions = value === "__any__" ? ["__any__"] : nextPositions.filter(p => p !== "__any__");
      if (value !== "__any__" && !nextPositions.includes(value)) nextPositions.push(value);
      role.permissions[toolKey][permissionKey] = { enabled: true, positions: nextPositions.length ? nextPositions : ["__any__"] };
      renderSystemAdmin();
    }
    return;
  }

  if (removePermissionPosition) {
    const { toolKey, permissionKey, roleId, value } = parsePermissionToken(removePermissionPosition);
    const role = state.roles.find(r => r.id === roleId);
    const current = role?.permissions?.[toolKey]?.[permissionKey];
    if (current) {
      const nextPositions = (current.positions || []).filter(p => p !== value);
      role.permissions[toolKey][permissionKey] = { enabled: true, positions: nextPositions.length ? nextPositions : ["__any__"] };
      renderSystemAdmin();
    }
    return;
  }

  if (moneyQueueTab) {
    await withAppLoading("Opening tab...", async () => {
      state.moneyRequestsTab = moneyQueueTab;
      state.expandedMoneyRequestId = "";
      renderMoneyRequestsTool();
    });
    return;
  }

  const campusTab = e.target.closest("[data-campus-tab]")?.dataset.campusTab;
  if (campusTab) { state.campusCaresTab = campusTab; renderCampusCaresTool(); return; }
  if (e.target.closest("[data-open-campus-submit]")) { state.modal = { type:"campusCareSubmit" }; renderCampusCaresTool(); return; }
  const campusNotes = e.target.closest("[data-campus-notes]")?.dataset.campusNotes;
  if (campusNotes) { state.modal = { type:"campusCareNotes", task: state.campusCareTasks.find(t=>t.id===campusNotes) }; renderCampusCaresTool(); return; }
  const campusAssign = e.target.closest("[data-campus-assign]")?.dataset.campusAssign;
  if (campusAssign) { state.modal = { type:"campusCareAssign", task: state.campusCareTasks.find(t=>t.id===campusAssign) }; renderCampusCaresTool(); return; }
  const editCampusLocation = e.target.closest("[data-edit-campus-location]")?.dataset.editCampusLocation;
  if (editCampusLocation) { state.modal={type:"editCampusCareLocation", location: state.campusCareLocations.find(l=>l.id===editCampusLocation)}; renderSystemAdmin(); return; }
  const editCampusStatus = e.target.closest("[data-edit-campus-status]")?.dataset.editCampusStatus;
  if (editCampusStatus) { state.modal={type:"editCampusCareStatus", status: state.campusCareStatuses.find(s=>s.id===editCampusStatus)}; renderSystemAdmin(); return; }
  const delCampusLocation = e.target.closest("[data-delete-campus-location]")?.dataset.deleteCampusLocation;
  if (delCampusLocation) { if(confirm("Hide this location?")) await hideCampusCareLocation(delCampusLocation); renderSystemAdmin(); return; }
  const delCampusStatus = e.target.closest("[data-delete-campus-status]")?.dataset.deleteCampusStatus;
  if (delCampusStatus) { if(confirm("Hide this status?")) await hideCampusCareStatus(delCampusStatus); renderSystemAdmin(); return; }
  const openCampusDiscussion = e.target.closest("[data-open-campus-discussion]")?.dataset.openCampusDiscussion;
  if (openCampusDiscussion) { state.activeCampusDiscussionId = openCampusDiscussion; renderCampusCaresTool(); return; }
  const approveCampusDiscussionId = e.target.closest("[data-approve-campus-discussion]")?.dataset.approveCampusDiscussion;
  if (approveCampusDiscussionId) { await approveCampusDiscussion(approveCampusDiscussionId); return; }
  const removeCampusDiscussionId = e.target.closest("[data-remove-campus-discussion]")?.dataset.removeCampusDiscussion;
  if (removeCampusDiscussionId) { state.modal={type:"removeCampusDiscussion", discussion: state.campusCareDiscussions.find(d=>d.id===removeCampusDiscussionId)}; renderCampusCaresTool(); return; }
  const convertCampusDiscussionId = e.target.closest("[data-convert-campus-discussion]")?.dataset.convertCampusDiscussion;
  if (convertCampusDiscussionId) { state.modal={type:"campusDiscussionToTask", discussion: state.campusCareDiscussions.find(d=>d.id===convertCampusDiscussionId)}; renderCampusCaresTool(); return; }

  const receiptRequestId = e.target.closest("[data-receipt-request]")?.dataset.receiptRequest;
  if (receiptRequestId) {
    await withAppLoading("Opening receipt form...", async () => {
      state.activeReceiptRequestId = receiptRequestId;
      renderMoneyRequestsTool();
    });
    return;
  }

  if (e.target.closest("[data-add-receipt-line]")) {
    const lines = document.querySelector("#receiptLines");
    const index = lines?.querySelectorAll("[data-receipt-line]").length || 0;
    lines?.insertAdjacentHTML("beforeend", renderReceiptLine({}, index));
    return;
  }

  if (e.target.closest("[data-remove-receipt-line]")) {
    const all = Array.from(document.querySelectorAll("[data-receipt-line]"));
    if (all.length > 1) e.target.closest("[data-receipt-line]")?.remove();
    return;
  }

  const expandMoneyRequestId = e.target.closest("[data-expand-money-request]")?.dataset.expandMoneyRequest;
  if (expandMoneyRequestId) {
    await withAppLoading("Loading request details...", async () => {
      state.expandedMoneyRequestId = state.expandedMoneyRequestId === expandMoneyRequestId ? "" : expandMoneyRequestId;
      renderMoneyRequestsTool();
    });
    return;
  }

  if (denyMoneyRequestId) {
    state.modal = { type: "denyMoneyRequest", requestId: denyMoneyRequestId, stage: denyStage || "pendingDoso", error: "" };
    renderMoneyRequestsTool();
    return;
  }

  if (editDeniedMoneyRequestId) {
    const request = state.moneyRequests.find(r => r.id === editDeniedMoneyRequestId);
    state.modal = { type: "editDeniedMoneyRequest", request, error: "" };
    renderMoneyRequestsTool();
    return;
  }

  if (dosoApproveMoneyRequestId) { await withAppLoading("Opening approval...", async () => { await approveMoneyRequests([dosoApproveMoneyRequestId], "pendingDoso"); }); return; }

  if (ownerApproveMoneyRequestId) { await withAppLoading("Opening approval...", async () => { await approveMoneyRequests([ownerApproveMoneyRequestId], "pendingOwner"); }); return; }

  if (bulkMoneyApprove) { await withAppLoading("Opening bulk approval...", async () => { await approveMoneyRequests(state.selectedMoneyApprovalIds || [], bulkMoneyApprove); }); return; }

  const moneyToggle = e.target.closest("[data-money-request-toggle]")?.dataset.moneyRequestToggle;
  if (moneyToggle) {
    const sections = document.querySelector("#moneyRequestLineSections");
    const button = e.target.closest("[data-money-request-toggle]");
    const existing = sections?.querySelector(`[data-money-request-section="${moneyToggle}"]`);
    if (existing) {
      existing.remove();
      button?.classList.remove("active");
    } else if (sections) {
      const requestType = state.moneyRequestTypes.find(t => t.id === moneyToggle);
      const lineKey = crypto.randomUUID();
      sections.insertAdjacentHTML("beforeend", `
        <div class="money-request-section" data-money-request-section="${moneyToggle}">
          ${renderMoneyRequestLine(moneyToggle, lineKey)}
        </div>
      `);
      button?.classList.add("active");
      updateMoneyRequestAddButtons();
    }
    return;
  }

  const addMoneyLineTypeId = e.target.closest("[data-add-money-line]")?.dataset.addMoneyLine;
  if (addMoneyLineTypeId) {
    const clickedButton = e.target.closest("[data-add-money-line]");
    const currentLine = clickedButton?.closest(".money-request-line");
    const section = e.target.closest("[data-money-request-section]");
    const lineKey = crypto.randomUUID();
    if (currentLine) currentLine.dataset.addLineUsed = "true";
    clickedButton?.classList.add("is-hidden");
    section?.insertAdjacentHTML("beforeend", renderMoneyRequestLine(addMoneyLineTypeId, lineKey));
    updateMoneyRequestAddButtons();
    return;
  }

  if (e.target.closest("[data-remove-money-line]")) {
    const line = e.target.closest(".money-request-line");
    const section = e.target.closest("[data-money-request-section]");
    const previousLine = line?.previousElementSibling?.classList?.contains("money-request-line") ? line.previousElementSibling : null;
    line?.remove();
    if (previousLine && !previousLine.nextElementSibling) {
      previousLine.dataset.addLineUsed = "false";
    }
    if (section && !section.querySelector(".money-request-line")) {
      const typeId = section.dataset.moneyRequestSection;
      section.remove();
      document.querySelector(`[data-money-request-toggle="${typeId}"]`)?.classList.remove("active");
    }
    updateMoneyRequestAddButtons();
    return;
  }

  if (e.target.closest("[data-add-request-field]")) {
    const container = document.querySelector("#requestFieldContainer");
    if (container) {
      container.insertAdjacentHTML("beforeend", `
        <div class="request-field-row">
          <input name="fieldLabel" placeholder="Field label" />
          <select name="fieldType">
            <option value="text">Text</option>
            <option value="textarea">Long Text</option>
            <option value="number">Number</option>
            <option value="money">Money</option>
            <option value="date">Date</option>
          </select>
          <label class="check-row">
            <input type="checkbox" name="fieldRequired" />
            Required
          </label>
          <button type="button" class="danger small" data-remove-request-field>Remove</button>
        </div>
      `);
    }
    return;
  }

  if (e.target.closest("[data-remove-request-field]")) {
    e.target.closest(".request-field-row")?.remove();
    return;
  }

  if (toolId === "campusCares") { await withAppLoading("Opening Campus Cares...", async () => { await refreshCampusCaresData(); const mode=getCampusCaresOpenPreference(); if (mode === "submitted") state.campusCaresTab = "submitted"; renderCampusCaresTool(); if (mode === "submitPopup") { state.modal = { type:"campusCareSubmit" }; renderCampusCaresTool(); } }); return; }
  if (toolId === "photoPrint") { await withAppLoading("Opening Photo Print and Edit...", async () => { await loadPhotoPrintWorkspace(); renderPhotoPrintTool(); }); return; }
  if (toolId === "villageVoice") { await withAppLoading("Opening Printables...", async () => { await refreshAdminData(); state.printableTab = state.printableTab || "villageVoice"; renderVillageVoiceTool(); }); return; }
  if (toolId === "moneyRequests") {
    await withAppLoading("Opening Money Requests...", async () => {
      await refreshMoneyRequestsData();
      renderMoneyRequestsTool();
    });
    return;
  }
  if (toolId === "coreChampion") { await withAppLoading("Opening Core Count Champion...", async () => { await refreshAdminData(); renderCoreChampionTool(); }); return; }

  const coreOpenRound = e.target.closest("[data-core-open-round]")?.dataset.coreOpenRound;
  const coreCloseRound = e.target.closest("[data-core-close-round]")?.dataset.coreCloseRound;
  const coreNominate = e.target.closest("[data-core-nominate]");
  const coreVote = e.target.closest("[data-core-vote]");
  const coreSetWinner = e.target.closest("[data-core-set-winner]");
  const coreOpenVote = e.target.closest("[data-core-open-vote]")?.dataset.coreOpenVote;
  if (coreOpenRound) { await openCoreChampionRound(coreOpenRound); renderLeadership(); return; }
  if (coreCloseRound) { await closeCoreChampionRound(coreCloseRound); renderLeadership(); return; }
  if (coreOpenVote) { await loadCoreChampionRounds(); state.modal={type:"coreVoteRound", monthKey:coreOpenVote}; renderCoreChampionTool(); return; }
  if (coreNominate) { state.modal={type:"coreNominate", uid:coreNominate.dataset.coreNominate, monthKey:coreNominate.dataset.coreMonth}; renderCoreChampionTool(); return; }
  if (coreVote) { state.modal={type:"coreVote", uid:coreVote.dataset.coreVote, monthKey:coreVote.dataset.coreMonth}; renderCoreChampionTool(); return; }
  if (coreSetWinner) { await setCoreWinner(coreSetWinner.dataset.coreMonth, coreSetWinner.dataset.coreSetWinner); return; }

  if (toolId) {
    await withAppLoading("Opening tool...", async () => renderHome());
    return;
  }

  if (leadershipTab) {
    await withAppLoading("Loading Leadership tab...", async () => {
      state.leadershipTab = leadershipTab;
      await refreshAdminData();
      await applyCoreChampionAutoOpenIfDue();
      renderLeadership();
    });
    return;
  }
  if (ownerTab) {
    await withAppLoading("Loading Owners tab...", async () => {
      state.ownerTab = ownerTab;
      await refreshAdminData();
      renderOwnersPanel();
    });
    return;
  }

  if (editPositionId) {
    await withAppLoading("Opening position...", async () => {
      const position = state.positions.find(p => p.id === editPositionId);
      state.modal = { type: "editPosition", position };
      renderSystemAdmin();
    });
    return;
  }

  
  if (editRequestTypeId) {
    await withAppLoading("Opening request type...", async () => {
      const requestType = state.moneyRequestTypes.find(t => t.id === editRequestTypeId);
      state.modal = { type: "editMoneyRequestType", requestType };
      renderSystemAdmin();
    });
    return;
  }

  
  if (editBudgetCodeId) {
    await withAppLoading("Opening budget code...", async () => {
      const budgetCode = state.budgetCodes.find(c => c.id === editBudgetCodeId);
      state.modal = { type: "editBudgetCode", budgetCode };
      state.currentView === "ownersPanel" ? renderOwnersPanel() : renderSystemAdmin();
    });
    return;
  }

  if (deleteBudgetCodeId) {
    if (confirm("Hide this budget code?")) {
      await hideBudgetCode(deleteBudgetCodeId);
      state.modal = null;
      await refreshAdminData();
      state.currentView === "ownersPanel" ? renderOwnersPanel() : renderSystemAdmin();
    }
    return;
  }

if (deleteRequestTypeId) {
    if (confirm("Hide this request type?")) {
      await hideMoneyRequestType(deleteRequestTypeId);
      state.modal = null;
      await refreshAdminData();
      renderSystemAdmin();
    }
    return;
  }

if (editRoleId) {
    await withAppLoading("Opening role...", async () => {
      const role = state.roles.find(r => r.id === editRoleId);
      state.modal = { type: "editRole", role };
      renderSystemAdmin();
    });
    return;
  }

  if (editSchoolId) {
    await withAppLoading("Opening school...", async () => {
      const school = state.schools.find(s => s.id === editSchoolId);
      state.modal = { type: "editSchool", school };
      renderSystemAdmin();
    });
    return;
  }

  if (editUserId) {
    await withAppLoading("Opening user...", async () => {
      const user = state.users.find(u => u.uid === editUserId) || await readUser(editUserId);
      state.modal = { type: "editUser", user };
      renderLeadership();
    });
    return;
  }

  const adminLoginUid = e.target.closest("[data-admin-login-uid]")?.dataset.adminLoginUid;

  if (adminLoginUid) {
    await withAppLoading("Opening login...", async () => {
      const user = state.roster.find(u => u.uid === adminLoginUid) || await readUser(adminLoginUid);
      state.modal = { type: "adminPasswordLogin", user };
      renderLanding();
    });
    return;
  }

  const adminLoginToggle = e.target.closest("#adminLoginToggle");

  if (adminLoginToggle) {
    state.adminLoginOpen = !state.adminLoginOpen;
    renderLanding();
    return;
  }


  if (clearBrandingLogo) {
    const form = clearBrandingLogo.closest("form");
    const hidden = form?.querySelector('[name="ovaLogoData"]');
    if (hidden) hidden.value = "";
    state.appSettings = { ...(state.appSettings || {}), ovaLogoData: "" };
    renderSystemAdmin();
    return;
  }

  if (loginUid) {
    await withAppLoading("Opening login...", async () => {
      const user = state.roster.find(u => u.uid === loginUid) || await readUser(loginUid);
      rememberPickedUser(user);
      state.modal = { type: "login", user };
      renderLanding();
    });
    return;
  }
  if (modalType) {
    await withAppLoading("Opening form...", async () => {
      await refreshAdminData();
      state.modal = { type: modalType };
      if (modalType === "addBudgetCode" && state.currentView === "ownersPanel") renderOwnersPanel();
      else if (["addSchool", "addPosition", "addRole", "addMoneyRequestType", "addBudgetCode", "addCampusCareLocation", "addCampusCareStatus"].includes(modalType)) renderSystemAdmin();
      else if (["addCampusDiscussion"].includes(modalType)) renderCampusCaresTool();
      else renderLeadership();
    });
    return;
  }
  if (tab) {
    await withAppLoading("Loading System Admin tab...", async () => {
      state.adminTab = tab;
      await refreshAdminData();
      renderSystemAdmin();
    });
    return;
  }
  if (action === "logout") { await withAppLoading("Logging out...", async () => { await logout(); }); return; }
  if (action === "home") { await withAppLoading("Loading home...", async () => renderHome()); return; }
  if (action === "onboarding") { await withAppLoading("Loading onboarding...", async () => renderOnboardingPage()); return; }
  if (action === "leadership") { await withAppLoading("Opening Leadership Panel...", async () => { await refreshAdminData(); await applyCoreChampionAutoOpenIfDue(); renderLeadership(); }); return; }
  if (action === "ownersPanel") { await withAppLoading("Opening Owners Panel...", async () => { await refreshAdminData(); renderOwnersPanel(); }); return; }
  if (action === "home") { await withAppLoading("Opening Home...", async () => { renderHome(); }); return; }
  if (action === "systemAdmin") { await withAppLoading("Opening System Admin...", async () => { await refreshAdminData(); renderSystemAdmin(); }); return; }
  if (action === "notificationSettings") { await withAppLoading("Opening notifications...", async () => { renderNotificationSettings(); }); return; }
  if (action === "admin") { await withAppLoading("Opening System Admin...", async () => { await refreshAdminData(); renderSystemAdmin(); }); return; }
  const voiceBlockTab = e.target.closest("[data-voice-block-tab]");
  if (voiceBlockTab) {
    const form = document.getElementById("villageVoiceForm");
    if (form) updateVillageVoiceDraftFromForm(form);
    const keepFocusId = state.expandedVillageVoiceEditorId;
    state.villageVoiceSelectedBlockTab = voiceBlockTab.dataset.voiceBlockTab || "content";
    renderVillageVoiceTool();
    focusVillageVoiceEditingSection(keepFocusId);
    return;
  }

  const openBgModal = e.target.closest("[data-open-voice-bg-modal]");
  if (openBgModal) {
    const form = document.getElementById("villageVoiceForm");
    if (form) updateVillageVoiceDraftFromForm(form);
    state.villageVoiceBgPickerId = openBgModal.dataset.openVoiceBgModal;
    state.villageVoiceSelectedBlockTab = "style";
    renderVillageVoiceTool();
    focusVillageVoiceEditingSection(state.expandedVillageVoiceEditorId);
    return;
  }
  if (e.target.closest("[data-stop-voice-bg-close]")) {
    // keep clicks inside the modal from falling through to the preview selector
  }
  const closeBgModal = e.target.matches("[data-close-voice-bg-modal]") || e.target.closest("button[data-close-voice-bg-modal]");
  if (closeBgModal) {
    state.villageVoiceBgPickerId = "";
    renderVillageVoiceTool();
    focusVillageVoiceEditingSection(state.expandedVillageVoiceEditorId);
    return;
  }
  const modalColorBtn = e.target.closest("[data-apply-voice-bg-color]");
  if (modalColorBtn) {
    const id = modalColorBtn.dataset.applyVoiceBgColor;
    const form = document.getElementById("villageVoiceForm") || modalColorBtn.closest("form");
    const color = form?.querySelector(`[data-voice-bg-modal-color="${id}"]`)?.value || "#ffffff";
    form?.querySelectorAll(`[data-block-bg-color="${id}"]`).forEach(input => { input.value = color; });
    updateVillageVoiceDraftFromForm(form);
    state.villageVoiceBgPickerId = "";
    renderVillageVoiceTool();
    focusVillageVoiceEditingSection(id);
    return;
  }

  const closeVoiceInline = e.target.closest("[data-close-voice-inline]");
  if (closeVoiceInline) {
    const form = document.getElementById("villageVoiceForm");
    if (form) updateVillageVoiceDraftFromForm(form);
    state.expandedVillageVoiceEditorId = "";
    renderVillageVoiceTool();
    return;
  }
  if (e.target.closest(".voice-inline-editor, .voice-left-block-editor")) return;
  const previewBlock = e.target.closest("[data-preview-block]");
  const previewSpecial = e.target.closest("[data-preview-special]");
  // v149: preview blocks no longer open on single click. Double-click handler below owns editing.
  if (previewBlock || previewSpecial) {
    return;
  }

  const voiceToggle = e.target.closest("[data-voice-toggle]");
  const voiceCollapse = e.target.closest("[data-voice-collapse]");
  if (voiceToggle || voiceCollapse) {
    const id = (voiceCollapse || voiceToggle).dataset.voiceCollapse || (voiceCollapse || voiceToggle).dataset.voiceToggle;
    if (e.target.matches("input, textarea, select, option")) return;
    const wasOpen = state.expandedVillageVoiceEditorId === id;
    state.expandedVillageVoiceEditorId = wasOpen ? "" : id;
    if (!wasOpen) state.villageVoiceSelectedBlockTab = "content";
    const form = document.getElementById("villageVoiceForm") || document.querySelector(".printable-builder-form");
    if (form?.dataset?.printableKind) updatePrintableDraftFromForm(form.dataset.printableKind, form);
    else if (form?.id === "doorRemindersForm") updateDoorRemindersDraftFromForm(form);
    else if (form) updateVillageVoiceDraftFromForm(form);
    renderVillageVoiceTool();
    focusVillageVoiceEditingSection(state.expandedVillageVoiceEditorId);
    return;
  }
  const clearVoiceBg = e.target.closest("[data-clear-voice-bg]");
  if (clearVoiceBg) {
    const form = clearVoiceBg.closest("form");
    const id = clearVoiceBg.dataset.clearVoiceBg;
    form?.querySelectorAll(`[data-block-bg-data="${id}"]`).forEach(input => { input.value = ""; });
    const keepFocusId = state.expandedVillageVoiceEditorId || id;
    state.villageVoiceBgPickerId = "";
    if (form?.dataset?.printableKind) updatePrintableDraftFromForm(form.dataset.printableKind, form);
    else updateVillageVoiceDraftFromForm(form);
    renderVillageVoiceTool();
    focusVillageVoiceEditingSection(keepFocusId);
    return;
  }

  const clearVoiceClip = e.target.closest("[data-clear-voice-clip]");
  if (clearVoiceClip) {
    const form = clearVoiceClip.closest("form");
    const id = clearVoiceClip.dataset.clearVoiceClip;
    form?.querySelectorAll(`[data-block-clip-data="${id}"]`).forEach(input => { input.value = ""; });
    if (form?.dataset?.printableKind) updatePrintableDraftFromForm(form.dataset.printableKind, form);
    else updateVillageVoiceDraftFromForm(form);
    renderVillageVoiceTool();
    return;
  }

  const ovaColor = e.target.closest("[data-ova-block-color]");
  if (ovaColor) {
    e.preventDefault();
    e.stopPropagation();
    const form = document.getElementById("villageVoiceForm") || ovaColor.closest("form");
    const id = ovaColor.dataset.ovaBlockColor;
    const color = ovaColor.dataset.ovaColor;
    form?.querySelectorAll(`[data-block-bg-color="${id}"]`).forEach(input => { input.value = color; input.setAttribute("value", color); });
    const custom = form?.querySelector(`[data-voice-bg-modal-color="${id}"]`);
    if (custom) custom.value = color;
    const draft = updateVillageVoiceDraftFromForm(form);
    const block = (draft.blocks || []).find(b => b.id === id);
    if (block) block.backgroundColor = color;
    state.villageVoiceDraft = { ...(state.villageVoiceDraft || {}), ...draft, blocks: draft.blocks };
    saveVillageVoiceSessionDraft(state.villageVoiceDraft);
    state.villageVoiceBgPickerId = "";
    state.expandedVillageVoiceEditorId = id;
    state.villageVoiceSelectedBlockTab = "style";
    renderVillageVoiceTool();
    focusVillageVoiceEditingSection(id);
    return;
  }


  const startVillageEditor = e.target.closest("[data-start-village-editor]");
  if (startVillageEditor) {
    state.villageVoiceEditorOpen = true;
    renderVillageVoiceTool();
    return;
  }
  const closeVillageEditor = e.target.closest("[data-close-village-editor]");
  if (closeVillageEditor) {
    const form = document.getElementById("villageVoiceForm");
    if (form) updateVillageVoiceDraftFromForm(form);
    state.villageVoiceEditorOpen = false;
    state.expandedVillageVoiceEditorId = "";
    state.villageVoiceBgPickerId = "";
    state.villageVoiceRearrangeMode = false;
    renderVillageVoiceTool();
    return;
  }

  const removeLetterlandSheet = e.target.closest("[data-remove-letterland-sheet]");
  if (removeLetterlandSheet) {
    const form = removeLetterlandSheet.closest("form") || getWeeklyThemesForm();
    setLetterlandSpriteSheetOnForm(form, "");
    window.__vvLetterlandSpriteSheet = "";
    syncLetterlandSpriteSheetToState(form, true);
    refreshLetterlandSpriteSheetStatus(form);
    await saveWeeklyThemes(form);
    await refreshAdminData();
    renderLeadership();
    showToast("Letterland sprite sheet and selected week images removed.");
    return;
  }

  const openSheetPreview = e.target.closest("[data-open-letterland-sheet-preview]");
  if (openSheetPreview) {
    openLetterlandSpritePicker("", openSheetPreview.closest("form") || document.querySelector("#weeklyThemesForm"));
    return;
  }

  const openLetterlandPicker = e.target.closest("[data-open-letterland-picker]");
  if (openLetterlandPicker) {
    openLetterlandSpritePicker(openLetterlandPicker.dataset.openLetterlandPicker, openLetterlandPicker.closest("form"));
    return;
  }

  const closeLetterlandPicker = e.target.closest("[data-close-letterland-picker]");
  if (closeLetterlandPicker || e.target.matches("[data-letterland-picker-modal]")) {
    document.querySelectorAll("[data-letterland-picker-modal]").forEach(el => el.remove());
    return;
  }

  const pickedLetterlandTile = e.target.closest("[data-pick-letterland-tile]");
  if (pickedLetterlandTile) {
    const week = pickedLetterlandTile.dataset.pickerWeek || "";
    if (!week) return;
    const form = getWeeklyThemesForm();
    try {
      await applyLetterlandSpriteTileToWeek(form, week, pickedLetterlandTile.dataset.pickLetterlandTile);
      document.querySelectorAll("[data-letterland-picker-modal]").forEach(el => el.remove());
      showToast("Letterland image selected. Use the floating Save button to publish it.");
    } catch (err) {
      alert(err.message || "That sprite tile could not be applied.");
    }
    return;
  }


  const clearLetterlandImage = e.target.closest("[data-clear-letterland-image]");
  if (clearLetterlandImage) {
    const week = clearLetterlandImage.dataset.clearLetterlandImage;
    const form = clearLetterlandImage.closest("form") || getWeeklyThemesForm();
    clearLetterlandWeekImage(form, week);
    await saveWeeklyThemes(form);
    await refreshAdminData();
    renderLeadership();
    showToast("Letterland week image removed.");
    return;
  }

  const applyProfileCrop = e.target.closest("[data-apply-profile-crop]");
  if (applyProfileCrop) {
    const form = applyProfileCrop.closest("form");
    const user = state.modal?.user || {};
    try {
      const cropped = await cropProfileImageToSquare(user.rawProfileImageData, user.cropZoom || 1.2, user.cropX || 50, user.cropY || 50);
      state.modal.user = { ...user, profileImageData: cropped, rawProfileImageData: "" };
      renderCurrentView();
      showToast("Profile crop ready. Click Save User to publish it.");
    } catch (err) {
      alert(err.message || "That crop could not be applied.");
    }
    return;
  }
  const cancelProfileCrop = e.target.closest("[data-cancel-profile-crop]");
  if (cancelProfileCrop) {
    state.modal.user = { ...(state.modal.user || {}), rawProfileImageData: "" };
    renderCurrentView();
    return;
  }

  if (e.target.closest("[data-close-modal]")) {
    state.modal = null;
    renderCurrentView();
    return;
  }
  if (resetPin) {
    if (confirm("Reset this user's PIN to 0000?")) await resetUserPin(resetPin);
    await refreshAdminData();
    const user = state.users.find(u => u.uid === resetPin) || await readUser(resetPin);
    state.modal = { type: "editUser", user };
    renderLeadership();
    return;
  }
  if (resetUserOnboarding) {
    const warning = "Reset this user for onboarding testing? This will set their PIN back to 0000, send them through onboarding again, clear birthday, education, why childcare, What I Like, and move their position back to Unassigned. It will not delete their name, login, role, or locations.";
    if (confirm(warning)) await resetUserForOnboarding(resetUserOnboarding);
    await refreshAdminData();
    const user = state.users.find(u => u.uid === resetUserOnboarding) || await readUser(resetUserOnboarding);
    state.modal = { type: "editUser", user };
    renderLeadership();
    return;
  }
  if (deletePositionId) {
    if (confirm("Hide this position?")) await deletePosition(deletePositionId);
    state.modal = null;
    await refreshAdminData();
    renderSystemAdmin();
    return;
  }

  if (deleteRoleId) {
    if (confirm("Hide this role?")) await deleteRole(deleteRoleId);
    state.modal = null;
    await refreshAdminData();
    renderSystemAdmin();
    return;
  }

  if (deleteUid) {
    if (confirm("Delete this user from Firestore? Firebase Auth deletion needs a later Cloud Function.")) await deleteAppUser(deleteUid);
    state.modal = null;
    await refreshAdminData();
    renderLeadership();
  }
});

$app.addEventListener("input", (e) => {
  const photoTextPropEl = e.target.closest?.("[data-photo-text-prop]");
  if (state.currentView === "photoPrint" && photoTextPropEl && photoTextPropEl.tagName !== "BUTTON") {
    const t = getSelectedPhotoPrintText();
    if (t) {
      const prop = photoTextPropEl.dataset.photoTextProp;
      const value = photoTextPropEl.value;
      if (!["text"].includes(prop) && !(photoTextPropEl.type === "range")) pushPhotoPrintHistory();
      if (["size","opacity","lineHeight","letterSpacing","outlineWidth"].includes(prop)) t[prop] = Number(value); else t[prop] = value;
      if (["text","font","size","bold","italic","lineHeight","letterSpacing","outlineWidth"].includes(prop)) autoSizePhotoTextBox(t);
      state.photoPrint.textDefaults = { ...(state.photoPrint.textDefaults || {}), color: t.color, size: t.size, font: t.font, align: t.align, outlineColor: t.outlineColor, outlineWidth: t.outlineWidth };
      renderPhotoPrintTool();
      clearTimeout(state.photoPrintTextSaveTimer);
      state.photoPrintTextSaveTimer = setTimeout(() => savePhotoPrintWorkspaceLocal(), 200);
    }
    return;
  }
  const photoControl = e.target.closest("[data-photo-control]")?.dataset.photoControl;
  if (photoControl) { applyPhotoControl(photoControl, e.target.value); return; }

  if (e.target.matches("[data-home-tool-search]")) { state.homeToolSearch = e.target.value; renderHome(); return; }
  if (e.target.matches("[data-money-input]")) {
    e.target.value = String(e.target.value || "").replace(/[^0-9.]/g, "");
  }
  if (e.target.matches("[data-budget-code]")) {
    syncBudgetFromCode(e.target);
  }
  if (e.target.matches("[data-profile-crop-zoom], [data-profile-crop-x], [data-profile-crop-y]")) {
    const user = state.modal?.user || {};
    user.cropZoom = document.querySelector("[data-profile-crop-zoom]")?.value || user.cropZoom || 1.2;
    user.cropX = document.querySelector("[data-profile-crop-x]")?.value || user.cropX || 50;
    user.cropY = document.querySelector("[data-profile-crop-y]")?.value || user.cropY || 50;
    state.modal.user = user;
    const img = document.querySelector("[data-profile-crop-img]");
    if (img) {
      img.style.transformOrigin = `${user.cropX}% ${user.cropY}%`;
      img.style.transform = `scale(${user.cropZoom})`;
    }
    return;
  }
  if (e.target.matches("[data-village-month]")) {
    state.villageVoiceSelectedMonth = e.target.value;
    const form = e.target.closest("form");
    if (form?.theme) form.theme.value = getSeasonTheme(e.target.value);
    renderVillageVoicePreviewOnly();
    return;
  }
  if (e.target.matches("[data-village-live]")) {
    const form = e.target.closest("form");
    const kind = form?.dataset?.printableKind;
    if (e.target.matches("[data-block-function]")) {
      if (kind) updatePrintableDraftFromForm(kind, form); else updateVillageVoiceDraftFromForm(form);
      renderVillageVoiceTool();
    } else {
      if (kind) renderPrintablePreviewOnly(kind); else renderVillageVoicePreviewOnly();
    }
    return;
  }
  if (e.target.matches("[data-budget-category]")) {
    syncBudgetFromCategory(e.target);
  }
  const likeInput = e.target.closest?.("[data-like-entry-input]");
  if (likeInput) {
    const row = likeInput.closest("[data-like-row]");
    const btn = row?.querySelector("[data-add-like-row]");
    btn?.classList.toggle("hidden", !String(likeInput.value || "").trim());
    return;
  }
  if (e.target.closest(".money-request-line")) {
    updateMoneyRequestAddButtons();
  }
});

function previewVillageVoiceBlockBgColor(blockId, color) {
  const block = document.querySelector(`[data-preview-block="${blockId}"]`);
  if (!block || !color) return;
  block.style.setProperty("--voice-block-bg", color);
  block.style.setProperty("background-color", color, "important");
}
function restoreVillageVoiceBlockBgColor(blockId) {
  const form = document.getElementById("villageVoiceForm");
  const color = form?.querySelector(`[data-block-bg-color="${blockId}"]`)?.value || "#ffffff";
  previewVillageVoiceBlockBgColor(blockId, color);
}
$app.addEventListener("mouseover", (e) => {
  const swatch = e.target.closest?.("[data-ova-block-color]");
  if (!swatch) return;
  previewVillageVoiceBlockBgColor(swatch.dataset.ovaBlockColor, swatch.dataset.ovaColor);
}, true);
$app.addEventListener("mouseout", (e) => {
  const swatch = e.target.closest?.("[data-ova-block-color]");
  if (!swatch) return;
  const to = e.relatedTarget;
  if (to && swatch.contains(to)) return;
  restoreVillageVoiceBlockBgColor(swatch.dataset.ovaBlockColor);
}, true);
$app.addEventListener("input", (e) => {
  if (e.target.matches?.("[data-voice-bg-modal-color]")) {
    previewVillageVoiceBlockBgColor(e.target.dataset.voiceBgModalColor, e.target.value);
    return;
  }
}, true);
async function awaitMaybeSavePhotoPrint() { await savePhotoPrintWorkspaceLocal(); renderPhotoPrintTool(); }
$app.addEventListener("keydown", (e) => {
  if (state.currentView === "photoPrint") {
    const editing = e.target.closest?.('input,textarea,select,[contenteditable="true"]');
    if (e.key === "Escape") { setPhotoPrintSelection([]); state.photoPrint.cropMode = false; renderPhotoPrintTool(); return; }
    if (!editing && (e.key === "Delete" || e.key === "Backspace")) { if (deletePhotoPrintSelection()) { e.preventDefault(); awaitMaybeSavePhotoPrint(); } return; }
    if ((e.ctrlKey || e.metaKey) && !editing) {
      const k = e.key.toLowerCase();
      if (k === 'c') { copyPhotoPrintSelectionToClipboard(false); e.preventDefault(); return; }
      if (k === 'x') { if (copyPhotoPrintSelectionToClipboard(true)) { e.preventDefault(); awaitMaybeSavePhotoPrint(); } return; }
      if (k === 'v') { if (pastePhotoPrintClipboard()) { e.preventDefault(); awaitMaybeSavePhotoPrint(); } return; }
      if (k === 'z') { if (undoPhotoPrint()) { e.preventDefault(); awaitMaybeSavePhotoPrint(); } return; }
      if (k === 'y') { if (redoPhotoPrint()) { e.preventDefault(); awaitMaybeSavePhotoPrint(); } return; }
    }
  }
  const likeInput = e.target.closest?.("[data-like-entry-input]");
  if (likeInput && e.key === "Enter") {
    e.preventDefault();
    const key = likeInput.dataset.likeEntryInput;
    likeInput.closest("[data-like-rows]")?.querySelector(`[data-add-like-row="${key}"]`)?.click();
  }
}, true);

document.addEventListener("keydown", (e) => {
  if (state.currentView !== "photoPrint") return;
  const editing = e.target.closest?.('input,textarea,select,[contenteditable="true"]');
  if (editing) return;
  const key = String(e.key || "").toLowerCase();
  if (key === "delete" || key === "backspace") {
    if (deletePhotoPrintSelection()) {
      e.preventDefault();
      awaitMaybeSavePhotoPrint();
    }
    return;
  }
  if (!(e.ctrlKey || e.metaKey)) return;
  if (key === "c") { if (copyPhotoPrintSelectionToClipboard(false)) e.preventDefault(); return; }
  if (key === "x") { if (copyPhotoPrintSelectionToClipboard(true)) { e.preventDefault(); awaitMaybeSavePhotoPrint(); } return; }
  if (key === "v") { if (pastePhotoPrintClipboard()) { e.preventDefault(); awaitMaybeSavePhotoPrint(); } return; }
  if (key === "z") { if (undoPhotoPrint()) { e.preventDefault(); awaitMaybeSavePhotoPrint(); } return; }
  if (key === "y") { if (redoPhotoPrint()) { e.preventDefault(); awaitMaybeSavePhotoPrint(); } return; }
}, true);

$app.addEventListener("blur", (e) => {
  if (e.target.matches("[data-home-tool-search]")) { state.homeToolSearch = e.target.value; renderHome(); return; }
  if (e.target.matches("[data-money-input]")) {
    formatMoneyInput(e.target);
    updateMoneyRequestAddButtons();
  }
}, true);

function villageVoiceDescribeElement(el) {
  if (!el) return null;
  const block = el.closest?.(".voice-edit-block, [data-preview-block]");
  const form = document.getElementById("villageVoiceForm");
  return {
    tag: el.tagName,
    className: el.className,
    text: (el.textContent || "").trim().slice(0, 80),
    inVillageForm: !!(form && form.contains(el)),
    closestBlockId: block?.dataset?.voiceBlock || block?.dataset?.previewBlock || "",
    closestBlockClass: block?.className || "",
    closestBlockDraggable: block?.getAttribute?.("draggable") || ""
  };
}
["pointerdown", "mousedown", "dragstart", "dragenter", "dragover", "drop", "dragend"].forEach(type => {
  $app.addEventListener(type, (e) => {
    if (!villageVoiceDndDebugOn()) return;
    const form = document.getElementById("villageVoiceForm");
    const nearVoiceBlock = e.target.closest?.(".voice-edit-block, [data-preview-block]");
    const inVoiceForm = !!(form && form.contains(e.target));
    if (!nearVoiceBlock && !inVoiceForm) return;
    const dtTypes = e.dataTransfer ? Array.from(e.dataTransfer.types || []) : [];
    villageVoiceDndLog(`event:${type}`, {
      clientX: e.clientX,
      clientY: e.clientY,
      button: e.button,
      defaultPrevented: e.defaultPrevented,
      dataTransferTypes: dtTypes,
      stateDraggedBlock: state.villageVoiceDraggedBlock || "",
      target: villageVoiceDescribeElement(e.target),
      nearestDropTarget: (() => {
        try {
          const t = getVoiceDropTarget(e);
          return t ? { id: t.dataset.voiceBlock || t.dataset.previewBlock || "", className: t.className } : null;
        } catch (err) {
          return { error: String(err) };
        }
      })()
    });
  }, true);
});

// v142: duplicate Village Voice rearrange listeners removed; pointer-only handler lives below.

$app.addEventListener("dragstart", (e) => {
  const tool = e.target.closest("[data-drag-tool]");
  if (!tool) return;
  e.dataTransfer.setData("text/plain", tool.dataset.dragTool);
  tool.classList.add("dragging");
});
$app.addEventListener("dragend", (e) => { e.target.closest("[data-drag-tool]")?.classList.remove("dragging"); });
$app.addEventListener("dragover", (e) => {
  const zone = e.target.closest("[data-tool-drop-zone]");
  const over = getHomeDropCard(e);
  if (!zone || !over) return;
  e.preventDefault();
  document.querySelectorAll(".drop-before,.drop-after").forEach(el => el.classList.remove("drop-before","drop-after"));
  const rect = over.getBoundingClientRect();
  over.classList.add(e.clientX < rect.left + rect.width / 2 ? "drop-before" : "drop-after");
});
$app.addEventListener("drop", (e) => {
  const zone = e.target.closest("[data-tool-drop-zone]");
  const over = getHomeDropCard(e);
  if (!zone || !over) return;
  e.preventDefault();
  const draggedId = e.dataTransfer.getData("text/plain");
  const targetId = over.dataset.toolCard;
  const prefs = getToolPrefs();
  let order = orderToolsForHome(getAvailableTools(state.session)).map(t => t.id).filter(id => id !== draggedId);
  const targetIndex = order.indexOf(targetId);
  const rect = over.getBoundingClientRect();
  order.splice(e.clientX < rect.left + rect.width / 2 ? targetIndex : targetIndex + 1, 0, draggedId);
  prefs.order = order;
  saveToolPrefs(prefs);
  renderHome();
});


$app.addEventListener("click", (e) => {
  if (!state.villageVoiceRearrangeMode) return;
  if (window.__vvSuppressNextVoiceClick) return;
  const choice = getVillageVoiceDndChoice(e);
  if (!choice) return;
  e.preventDefault();
  e.stopPropagation();
  applyVillageVoiceChoiceDrop(choice);
}, true);

$app.addEventListener("pointerover", (e) => {
  if (!state.villageVoiceRearrangeMode || window.__vvPointerRearrange) return;
  const choice = getVillageVoiceDndChoice(e);
  if (!choice) return;
  const draggedId = state.villageVoicePickedBlock || state.villageVoiceDraggedBlock || "";
  const targetId = choice.dataset.targetId || "";
  const place = choice.dataset.placement || "";
  if (!draggedId || !targetId || !place || draggedId === targetId) return;
  document.querySelectorAll("[data-voice-dnd-choice]").forEach(el => el.classList.toggle("active", el === choice));
  previewVillageVoiceDropLayout(draggedId, targetId, place);
}, true);

$app.addEventListener("pointermove", (e) => {
  if (!state.villageVoiceRearrangeMode || window.__vvPointerRearrange) return;
  if (state.villageVoicePickedBlock || state.villageVoiceDraggedBlock) updateVillageVoiceCursorRing(e);
}, true);

$app.addEventListener("click", (e) => {
  // v148: single-click no longer selects/edits blocks; double-click opens editing.
  return;
}, true);

$app.addEventListener("dragstart", (e) => {
  if (!state.villageVoiceRearrangeMode) return;
  const block = e.target.closest?.("[data-preview-block]");
  if (!block || !document.getElementById("villageVoiceForm")?.contains(block)) return;
  // v140: rearrange now uses pointer events only. Cancel native HTML5 drag/drop
  // so the browser does not fire a second drop after the pointer drop.
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}, true);

$app.addEventListener("dragend", (e) => {
  e.target.closest(".voice-edit-block, [data-preview-block]")?.classList.remove("dragging");
  state.villageVoiceDraggedBlock = "";
  hideVillageVoiceCursorRing();
  restoreVillageVoicePreviewAfterDropHover();
  clearVillageVoiceDropMarkers();
}, true);

$app.addEventListener("dragover", (e) => {
  if (!state.villageVoiceRearrangeMode) return;
  // v141: native HTML5 drag/drop is intentionally disabled for Village Voice.
  // The rearrange UI now uses pointerdown/move/up only. Letting native drop run
  // after pointerup caused duplicate moves/crashes in Chrome on the dot anchors.
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}, true);

$app.addEventListener("drop", (e) => {
  if (!state.villageVoiceRearrangeMode) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  villageVoiceDndLog("native-drop-suppressed", { picked: state.villageVoicePickedBlock, dragged: state.villageVoiceDraggedBlock });
}, true);

document.addEventListener("dragenter", (e) => {
  if (!state.villageVoiceRearrangeMode || window.__vvPointerRearrange) return;
  const draggedId = getVillageVoiceDraggedId(e);
  const choice = getVillageVoiceDndChoice(e);
  if (!draggedId || !choice) return;
  const targetId = choice.dataset.targetId || "";
  const place = choice.dataset.placement || "";
  if (!targetId || !place || targetId === draggedId) return;
  e.preventDefault();
  document.querySelectorAll("[data-voice-dnd-choice]").forEach(el => el.classList.toggle("active", el === choice));
  previewVillageVoiceDropLayout(draggedId, targetId, place);
}, true);



// v152: robust preview edit targeting + console debugging for double-click edit.
function villageVoiceEditDebug(...args) {
  try { console.info("[Village Voice Edit]", ...args); } catch (_) {}
}
function findVillageVoiceEditableAtEvent(e) {
  const form = document.getElementById("villageVoiceForm");
  if (!form) return { id: "", block: null, special: null, source: "no-form" };
  const directTarget = e?.target || null;
  const directInside = !!(directTarget && form.contains(directTarget));
  let block = directInside ? directTarget.closest?.("[data-preview-block]") : null;
  let special = directInside ? directTarget.closest?.("[data-preview-special]") : null;
  let source = "target";
  if ((!block && !special) && typeof document.elementsFromPoint === "function" && Number.isFinite(e?.clientX) && Number.isFinite(e?.clientY)) {
    const stack = document.elementsFromPoint(e.clientX, e.clientY) || [];
    for (const el of stack) {
      if (!el || !form.contains(el)) continue;
      block = el.closest?.("[data-preview-block]");
      special = el.closest?.("[data-preview-special]");
      if (block || special) { source = "elementsFromPoint"; break; }
    }
  }
  const id = block?.dataset?.previewBlock || special?.dataset?.previewSpecial || "";
  return { id, block, special, source, directInside, targetTag: directTarget?.tagName || "", targetClass: directTarget?.className || "" };
}
// v150: shared opener so native dblclick and quick pointer double-click both open the editor.
function openVillageVoicePreviewEditor(editId) {
  const form = document.getElementById("villageVoiceForm");
  villageVoiceEditDebug("open request", { editId, hasForm: !!form, currentExpanded: state.expandedVillageVoiceEditorId || "" });
  if (!form || !editId) return false;
  window.__vvPointerPendingRearrange = null;
  window.__vvPointerRearrange = null;
  window.__vvSuppressNextVoiceClick = false;
  state.villageVoicePickedBlock = "";
  state.villageVoiceDraggedBlock = "";
  state.villageVoiceRearrangeMode = false;
  state.villageVoiceEditorOpen = true;
  try { hideVillageVoiceCursorRing(); } catch (_) {}
  document.querySelector("[data-vv-natural-drop-hint]")?.remove();
  document.querySelector("[data-voice-dnd-choice-layer]")?.remove();
  try { updateVillageVoiceDraftFromForm(form); } catch (err) { console.warn("[Village Voice Edit] form sync skipped before opening editor", err); }
  state.expandedVillageVoiceEditorId = editId;
  state.villageVoiceSelectedBlockTab = "content";
  const keepX = window.scrollX;
  const keepY = window.scrollY;
  renderVillageVoiceTool();
  requestAnimationFrame(() => {
    window.scrollTo(keepX, keepY);
    focusVillageVoiceEditingSection(editId);
    const opened = document.querySelector(`[data-left-block-editor="${CSS.escape(editId)}"], [data-left-block-editor="flyerHeader"], [data-left-block-editor="flyerFooter"]`);
    villageVoiceEditDebug("after render", { editId, opened: !!opened, expanded: state.expandedVillageVoiceEditorId || "" });
    if (!opened) showToast("Edit panel did not open. Check console for Village Voice Edit logs.");
  });
  return true;
}

// v148: always-on natural drag; edit opens on double-click only.
function canUseVillageVoiceNaturalRearrange() {
  const form = document.getElementById("villageVoiceForm");
  if (!form) return false;
  return hasToolPermission(state.session, "villageVoice", "arrangeFlyer") || hasFullDevAccess(state.session);
}

function beginVillageVoicePointerRearrange(e, block, pending = null) {
  const id = block?.dataset?.previewBlock || pending?.id || "";
  if (!id || !canUseVillageVoiceNaturalRearrange()) return false;
  window.__vvPointerRearrange = { id, startX: pending?.startX ?? e.clientX, startY: pending?.startY ?? e.clientY, moved: true };
  window.__vvPointerPendingRearrange = null;
  state.villageVoiceRearrangeMode = true;
  state.villageVoicePickedBlock = id;
  state.villageVoiceDraggedBlock = id;
  clearVillageVoiceDropMarkers(true);
  document.querySelectorAll("[data-preview-block]").forEach(el => {
    el.classList.toggle("voice-preview-selected", el.dataset.previewBlock === id);
    el.setAttribute("draggable", "false");
  });
  renderVillageVoiceDropChoices(null, id);
  updateVillageVoiceCursorRing(e);
  villageVoiceDndLog("pointer-rearrange-start", { id, x: e.clientX, y: e.clientY });
  return true;
}

document.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const form = document.getElementById("villageVoiceForm");
  if (!form || !form.contains(e.target)) return;
  if (e.target.closest?.("[data-voice-dnd-choice], .voice-close-focus-editor, input, textarea, select, button, label, .voice-left-block-editor, .voice-inline-editor")) return;
  const found = findVillageVoiceEditableAtEvent(e);
  const block = found.block;
  const editId = found.id || "";
  if (editId && e.detail >= 2) {
    villageVoiceEditDebug("pointerdown double", found);
    window.__vvPointerPendingRearrange = null;
    window.__vvPointerRearrange = null;
    if (openVillageVoicePreviewEditor(editId)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
    return;
  }
  if (!canUseVillageVoiceNaturalRearrange()) return;
  if (!block) return;
  window.__vvPointerPendingRearrange = { id: block.dataset.previewBlock || "", block, startX: e.clientX, startY: e.clientY };
}, true);

document.addEventListener("pointermove", (e) => {
  const pending = window.__vvPointerPendingRearrange;
  if (pending && !window.__vvPointerRearrange) {
    if (Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY) <= 6) return;
    if (!beginVillageVoicePointerRearrange(e, pending.block, pending)) return;
  }
  const drag = window.__vvPointerRearrange;
  if (!drag || !canUseVillageVoiceNaturalRearrange()) return;
  drag.moved = true;
  updateVillageVoiceCursorRing(e);
  const choice = getVillageVoiceChoiceAtPoint(e.clientX, e.clientY);
  const target = choice?.__vvNaturalTarget || null;
  const choiceKey = target ? vvNaturalTargetKey(target) : "";
  if (drag.lastChoiceKey !== choiceKey) {
    drag.lastChoiceKey = choiceKey;
    drag.choiceTarget = target;
    drag.choicePlacement = choice?.dataset?.placement || "";
    if (choice) previewVillageVoiceDropLayout(drag.id, "__natural", drag.choicePlacement);
    else restoreVillageVoicePreviewAfterDropHover();
  }
  e.preventDefault();
  e.stopPropagation();
}, true);

document.addEventListener("pointerup", (e) => {
  if (window.__vvPointerPendingRearrange && !window.__vvPointerRearrange) {
    const pending = window.__vvPointerPendingRearrange;
    window.__vvPointerPendingRearrange = null;
    const now = Date.now();
    const last = window.__vvLastPreviewClick || null;
    const sameBlock = last && last.id === pending.id;
    const closeEnough = last && Math.hypot((e.clientX || 0) - (last.x || 0), (e.clientY || 0) - (last.y || 0)) < 12;
    if (sameBlock && closeEnough && now - last.time < 420) {
      window.__vvLastPreviewClick = null;
      if (openVillageVoicePreviewEditor(pending.id)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
      return;
    }
    window.__vvLastPreviewClick = { id: pending.id, x: e.clientX || pending.startX, y: e.clientY || pending.startY, time: now };
    return;
  }
  const drag = window.__vvPointerRearrange;
  if (!drag || !canUseVillageVoiceNaturalRearrange()) return;
  try {
    const finalTarget = drag.choiceTarget || getVillageVoiceChoiceAtPoint(e.clientX, e.clientY)?.__vvNaturalTarget || null;
    const choice = makeVillageVoiceNaturalChoice(finalTarget);
    if (choice) applyVillageVoiceChoiceDrop(choice, drag.id);
    else if (drag.moved) clearVillageVoicePickedBlock();
  } catch (err) {
    console.error("Village Voice pointer drop crashed", err);
    showToast("That drop did not work. Try again.");
    clearVillageVoicePickedBlock();
  } finally {
    window.__vvPointerRearrange = null;
    window.__vvPointerPendingRearrange = null;
    window.__vvSuppressNextVoiceClick = true;
    setTimeout(() => { window.__vvSuppressNextVoiceClick = false; }, 160);
  }
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}, true);

document.addEventListener("pointercancel", (e) => {
  window.__vvPointerPendingRearrange = null;
  if (!window.__vvPointerRearrange) return;
  window.__vvPointerRearrange = null;
  state.villageVoiceRearrangeMode = false;
  clearVillageVoicePickedBlock();
}, true);

document.addEventListener("click", (e) => {
  if (!window.__vvSuppressNextVoiceClick) return;
  if (!document.getElementById("villageVoiceForm")?.contains(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}, true);

document.addEventListener("click", (e) => {
  if ((e.detail || 0) < 2) return;
  const form = document.getElementById("villageVoiceForm");
  if (!form) return;
  if (e.target.closest?.("input, textarea, select, button, label, .voice-left-block-editor, .voice-inline-editor")) return;
  const found = findVillageVoiceEditableAtEvent(e);
  const editId = found.id || "";
  villageVoiceEditDebug("click detail>=2", found);
  if (!editId) return;
  window.__vvPointerPendingRearrange = null;
  window.__vvPointerRearrange = null;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  openVillageVoicePreviewEditor(editId);
}, true);

document.addEventListener("dblclick", (e) => {
  const form = document.getElementById("villageVoiceForm");
  if (!form) return;
  if (e.target.closest?.("input, textarea, select, button, label, .voice-left-block-editor, .voice-inline-editor")) return;
  const found = findVillageVoiceEditableAtEvent(e);
  const editId = found.id || "";
  villageVoiceEditDebug("native dblclick", found);
  if (!editId) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  openVillageVoicePreviewEditor(editId);
}, true);

$app.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  showAppLoading(form.id === "loginForm" ? "Logging in..." : "Saving...");
  try {
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (form.dataset.campusAssignForm) { await assignCampusTask(form.dataset.campusAssignForm, form); hideAppLoading(); return; }
    if (form.id === "campusCareRequestForm") { await submitCampusCareRequest(form); hideAppLoading(); return; }
    if (form.id === "campusCareLocationForm") { await saveCampusCareLocation(form); await refreshAdminData(); renderSystemAdmin(); hideAppLoading(); return; }
    if (form.id === "campusCareStatusForm") { await saveCampusCareStatus(form); await refreshAdminData(); renderSystemAdmin(); hideAppLoading(); return; }
    if (form.id === "campusCareNotesForm" || form.id === "campusCareLeaderNotesForm") { await saveCampusTaskNote(form); hideAppLoading(); return; }
    if (form.id === "campusDiscussionForm") { await saveCampusDiscussion(form); hideAppLoading(); return; }
    if (form.id === "campusDiscussionNoteForm") { await saveCampusDiscussionNote(form); hideAppLoading(); return; }
    if (form.id === "campusDiscussionSolutionForm") { await saveCampusDiscussionSolution(form); hideAppLoading(); return; }
    if (form.id === "removeCampusDiscussionForm") { await removeCampusDiscussion(form); hideAppLoading(); return; }
    if (form.id === "campusDiscussionToTaskForm") { await createCampusTaskFromDiscussion(form); hideAppLoading(); return; }
    if (form.id === "notificationSettingsForm") { await saveNotificationSettings(form); hideAppLoading(); return; }
    if (form.id === "coreChampionSettingsForm") { await saveCoreChampionSettings(form); hideAppLoading(); return; }
    if (form.id === "coreNominationForm") { await submitCoreNomination(form); hideAppLoading(); return; }
    if (form.id === "coreVoteForm") { await submitCoreVote(form); hideAppLoading(); return; }
    if (form.id === "adminPasswordLoginForm") { await adminLeaderLogin(state.modal.user, form.password.value, !!form.stayLoggedIn?.checked); hideAppLoading(); return; }
    if (form.id === "approvalPasswordForm" || form.id === "selfDosoApprovalForm") { await completeApprovalPassword(form.password.value); hideAppLoading(); return; }
    if (form.id === "nukeMoneyRequestsForm") { await completeNukeMoneyRequests(form.password.value); hideAppLoading(); return; }
    if (form.id === "nukeCampusCareRequestsForm") { await completeNukeCampusCareRequests(form.password.value); hideAppLoading(); return; }
    if (form.id === "denyMoneyRequestForm") { await denyMoneyRequest(state.modal.requestId, state.modal.stage, form.denialNote.value.trim()); hideAppLoading(); return; }
    if (form.id === "editDeniedMoneyRequestForm") { await saveEditedDeniedMoneyRequest(form); hideAppLoading(); return; }
    if (form.id === "loginForm") await loginUser(state.modal.user, form.credential.value.trim(), !!form.stayLoggedIn?.checked);
    if (form.id === "passwordSetupForm") await saveNewPassword(form.password.value);
    if (form.id === "pinChangeForm") { await saveNewPin(form.pin.value.trim()); renderCurrentView(); hideAppLoading(); return; }
    if (form.id === "selfProfileForm") { await updateSelfProfile(form); hideAppLoading(); return; }
    if (form.id === "onboardingStepForm") { await saveOnboardingStep(form); hideAppLoading(); return; }
    if (form.id === "schoolForm") { await addSchool(form); await refreshAdminData(); renderSystemAdmin(); }
    if (form.id === "editSchoolForm") { await updateSchool(form); await refreshAdminData(); renderSystemAdmin(); }
    if (form.id === "positionForm") { await addPosition(form); await refreshAdminData(); renderSystemAdmin(); }
    if (form.id === "editPositionForm") { await updatePosition(form); await refreshAdminData(); renderSystemAdmin(); }
    if (form.id === "roleForm") { await addRole(form); await refreshAdminData(); renderSystemAdmin(); }
    if (form.id === "moneyRequestTypeForm") { await addMoneyRequestType(form); await refreshAdminData(); renderSystemAdmin(); }
    if (form.id === "editMoneyRequestTypeForm") { await updateMoneyRequestType(form); await refreshAdminData(); renderSystemAdmin(); }
    if (form.id === "budgetCodeForm") { await addBudgetCode(form); await refreshAdminData(); state.modal = null; state.currentView === "ownersPanel" ? renderOwnersPanel() : renderSystemAdmin(); }
    if (form.id === "editBudgetCodeForm") { await updateBudgetCode(form); await refreshAdminData(); state.modal = null; state.currentView === "ownersPanel" ? renderOwnersPanel() : renderSystemAdmin(); }
    if (form.id === "moneyRequestSubmissionForm") { await submitMoneyRequest(form); hideAppLoading(); return; }
    if (form.id === "receiptUploadForm") { await saveReceiptForMoneyRequest(form); hideAppLoading(); return; }
    if (form.id === "editRoleForm") { await updateRole(form); await refreshAdminData(); renderSystemAdmin(); }
    if (form.id === "permissionsForm") { await savePermissionsMatrix(form); await refreshAdminData(); renderSystemAdmin(); }
    if (form.id === "villageVoiceForm") { await saveVillageVoice(form); hideAppLoading(); return; }
    if (form.id === "teacherBioForm") { await saveGenericPrintable("teacherBio", form); hideAppLoading(); return; }
    if (form.id === "illnessNoticeForm") { await saveGenericPrintable("illnessNotice", form); hideAppLoading(); return; }
    if (form.id === "doorRemindersForm") { await saveDoorReminders(form); hideAppLoading(); return; }
    if (form.id === "importantDateEditForm") { await updateImportantDate(form); await refreshAdminData(); renderLeadership(); hideAppLoading(); return; }
    if (form.id === "importantDateForm") { await addImportantDate(form); await refreshAdminData(); renderLeadership(); hideAppLoading(); return; }
    if (form.id === "weeklyThemesForm") { await saveWeeklyThemes(form); await refreshAdminData(); renderLeadership(); hideAppLoading(); return; }
    if (form.id === "certificateForm") { await addCertificate(form); await refreshAdminData(); renderLeadership(); hideAppLoading(); return; }
    if (form.id === "brandingSettingsForm") { await saveBrandingSettings(form); await refreshAdminData(); renderSystemAdmin(); hideAppLoading(); return; }
    if (form.id === "userForm") { await addUser(form); await refreshAdminData(); renderLeadership(); }
    if (form.id === "editUserForm") { await updateAppUser(form); await refreshAdminData(); renderLeadership(); }
    hideAppLoading();
  } catch (err) {
    hideAppLoading();
    console.error(err);
    const isPasswordForm = ["loginForm", "adminPasswordLoginForm", "approvalPasswordForm", "selfDosoApprovalForm", "nukeMoneyRequestsForm", "nukeCampusCareRequestsForm", "passwordSetupForm"].includes(form.id);
    const code = err?.code || "";
    if (isPasswordForm && (code.includes("wrong-password") || code.includes("invalid-credential") || code.includes("invalid-login-credentials") || code.includes("too-many-requests"))) {
      state.modal = { ...state.modal, error: code.includes("too-many-requests") ? "Too many attempts. Please wait a minute and try again." : "Incorrect password." };
      renderCurrentView();
      return;
    }
    if (form.id === "loginForm" && String(err.message || "").toLowerCase().includes("pin")) {
      state.modal = { ...state.modal, error: "Incorrect PIN." };
      renderCurrentView();
      return;
    }
    showToast(err.message || "Something went wrong.");
  }
});


/* v104 Letterland modal picker hardening
   - Modal now owns its form reference so picking works even if the click target is outside the form.
   - Preview modal includes live row/column controls and a full-sheet preview.
   - Capture-phase click handler handles picker/close before other app click logic can swallow it. */
window.__vvLetterlandActiveForm = null;


function renderLetterlandFullSheetPreview(sheet, rows, cols, meta = getLetterlandSpriteMetaFromSettings()) {
  const r = Math.max(1, Number(rows) || 1);
  const c = Math.max(1, Number(cols) || 1);
  if (!sheet) return `<div class="empty">Upload a sprite sheet first.</div>`;
  const w = Number(meta.width || 0) || 1;
  const h = Number(meta.height || 0) || 1;
  return `<div class="letterland-full-sheet-wrap" style="--ll-sheet-w:${w};--ll-sheet-h:${h};">
    <img src="${sheet}" alt="Letterland sprite sheet preview" />
    <svg class="letterland-full-grid-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      ${Array.from({length:r*c},(_,idx)=>{ const crop=getLetterlandTileCrop(meta,r,c,idx+1); return `<g><rect x="${crop.sx}" y="${crop.sy}" width="${crop.sw}" height="${crop.sh}"></rect><text x="${crop.sx+5}" y="${crop.sy+15}">${idx+1}</text></g>`; }).join("")}
    </svg>
  </div>`;
}

function renderLetterlandSpritePickerModal(week, sheet, rows, cols) {
  const r = Math.max(1, Number(rows) || 1);
  const c = Math.max(1, Number(cols) || 1);
  const form = window.__vvLetterlandActiveForm || getWeeklyThemesForm();
  const meta = getLetterlandSpriteMetaFromForm(form);
  const isWeekPicker = !!week;
  const title = isWeekPicker ? `Choose Letterland image for Week ${week}` : "Preview / adjust Letterland Sprite Sheet";
  return `<div class="letterland-picker-backdrop" data-letterland-picker-modal data-picker-week="${escapeHtml(week || "")}">
    <div class="letterland-picker-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="letterland-picker-head">
        <div><h3>${escapeHtml(title)}</h3><p class="helper">${isWeekPicker ? "Click a tile to use it for this week." : "Adjust rows, columns, margins, and gaps until the indicator lines match each cell."}</p></div>
        <button type="button" class="secondary small" data-close-letterland-picker>Close</button>
      </div>
      ${isWeekPicker ? "" : `<div class="letterland-modal-grid-controls">
        <label>Rows<input type="number" min="1" max="20" value="${r}" data-letterland-modal-rows /></label>
        <label>Columns<input type="number" min="1" max="20" value="${c}" data-letterland-modal-cols /></label>
        <label>Left/Right margin<input type="number" min="0" max="1000" value="${escapeHtml(meta.marginX)}" data-letterland-modal-margin-x /></label>
        <label>Top/Bottom margin<input type="number" min="0" max="1000" value="${escapeHtml(meta.marginY)}" data-letterland-modal-margin-y /></label>
        <label>Column gap<input type="number" min="0" max="1000" value="${escapeHtml(meta.gapX)}" data-letterland-modal-gap-x /></label>
        <label>Row gap<input type="number" min="0" max="1000" value="${escapeHtml(meta.gapY)}" data-letterland-modal-gap-y /></label>
        <label>Cell width<input type="number" min="0" max="2000" value="${escapeHtml(meta.cellW || "")}" placeholder="auto" data-letterland-modal-cell-w /></label>
        <label>Cell height<input type="number" min="0" max="2000" value="${escapeHtml(meta.cellH || "")}" placeholder="auto" data-letterland-modal-cell-h /></label>
        <button type="button" class="secondary small" data-letterland-refresh-grid-preview>Refresh lines</button>
        <button type="button" class="secondary small" data-letterland-apply-grid>Apply + save grid</button>
      </div>
      ${renderLetterlandFullSheetPreview(sheet, r, c, meta)}`}
      <h4 class="letterland-picker-subtitle">${isWeekPicker ? "Pick a tile" : "Tile preview"}</h4>
      ${sheet ? renderLetterlandSpriteOptions(sheet, r, c, week || "", meta) : `<div class="empty">Upload a sprite sheet first.</div>`}
    </div>
  </div>`;
}

function openLetterlandSpritePicker(week, form) {
  document.querySelectorAll("[data-letterland-picker-modal]").forEach(el => el.remove());
  const realForm = form || getWeeklyThemesForm();
  window.__vvLetterlandActiveForm = realForm;
  const sheet = getLetterlandSpriteSheetFromForm(realForm);
  const { rows, cols } = getLetterlandGridFromForm(realForm);
  document.body.insertAdjacentHTML("beforeend", renderLetterlandSpritePickerModal(week || "", sheet, rows, cols));
}

async function applyLetterlandModalGrid() {
  const modal = document.querySelector("[data-letterland-picker-modal]");
  const form = window.__vvLetterlandActiveForm || getWeeklyThemesForm();
  if (!modal || !form) return;
  const rows = Math.max(1, Math.min(20, Number(modal.querySelector("[data-letterland-modal-rows]")?.value || 1)));
  const cols = Math.max(1, Math.min(20, Number(modal.querySelector("[data-letterland-modal-cols]")?.value || 1)));
  const rowField = form.querySelector('[name="letterlandSpriteRows"]');
  const colField = form.querySelector('[name="letterlandSpriteCols"]');
  if (rowField) rowField.value = String(rows);
  if (colField) colField.value = String(cols);
  const marginX = Math.max(0, Number(modal.querySelector("[data-letterland-modal-margin-x]")?.value || 0));
  const marginY = Math.max(0, Number(modal.querySelector("[data-letterland-modal-margin-y]")?.value || 0));
  const gapX = Math.max(0, Number(modal.querySelector("[data-letterland-modal-gap-x]")?.value || 0));
  const gapY = Math.max(0, Number(modal.querySelector("[data-letterland-modal-gap-y]")?.value || 0));
  if (form.letterlandSpriteMarginX) form.letterlandSpriteMarginX.value = String(marginX);
  if (form.letterlandSpriteMarginY) form.letterlandSpriteMarginY.value = String(marginY);
  if (form.letterlandSpriteGapX) form.letterlandSpriteGapX.value = String(gapX);
  if (form.letterlandSpriteGapY) form.letterlandSpriteGapY.value = String(gapY);
  const cellW = Math.max(0, Number(modal.querySelector("[data-letterland-modal-cell-w]")?.value || 0));
  const cellH = Math.max(0, Number(modal.querySelector("[data-letterland-modal-cell-h]")?.value || 0));
  if (form.letterlandSpriteCellW) form.letterlandSpriteCellW.value = cellW ? String(cellW) : "";
  if (form.letterlandSpriteCellH) form.letterlandSpriteCellH.value = cellH ? String(cellH) : "";

  // Persist the grid immediately so a later week picker does not rebuild using the old saved row/column count.
  syncLetterlandSpriteSheetToState(form, false);
  const current = state.weeklyThemes.find(t => t.id === "current");
  if (current) {
    current.letterlandSpriteRows = String(rows);
    current.letterlandSpriteCols = String(cols);
    current.letterlandSpriteMarginX = String(marginX);
    current.letterlandSpriteMarginY = String(marginY);
    current.letterlandSpriteGapX = String(gapX);
    current.letterlandSpriteGapY = String(gapY);
    current.letterlandSpriteCellW = cellW ? String(cellW) : "";
    current.letterlandSpriteCellH = cellH ? String(cellH) : "";
  }
  try {
    await saveWeeklyThemes(form);
    await refreshAdminData();
  } catch (err) {
    console.warn("Could not immediately save Letterland grid.", err);
    showToast("Grid applied locally, but it could not be saved yet.");
  }

  const week = modal.dataset.pickerWeek || "";
  const sheet = getLetterlandSpriteSheetFromForm(form);
  const freshForm = getWeeklyThemesForm() || form;
  window.__vvLetterlandActiveForm = freshForm;
  refreshLetterlandSpriteSheetStatus(freshForm);
  document.querySelectorAll("[data-letterland-picker-modal]").forEach(el => el.remove());
  document.body.insertAdjacentHTML("beforeend", renderLetterlandSpritePickerModal(week, sheet, rows, cols));
  showToast("Letterland grid saved.");
}

document.addEventListener("click", async function vvLetterlandModalCapture(e) {
  const closeBtn = e.target.closest?.("[data-close-letterland-picker]");
  if (closeBtn) {
    e.preventDefault();
    e.stopPropagation();
    document.querySelectorAll("[data-letterland-picker-modal]").forEach(el => el.remove());
    return;
  }

  const backdrop = e.target.matches?.("[data-letterland-picker-modal]") ? e.target : null;
  if (backdrop) {
    e.preventDefault();
    e.stopPropagation();
    document.querySelectorAll("[data-letterland-picker-modal]").forEach(el => el.remove());
    return;
  }

  const refreshGrid = e.target.closest?.("[data-letterland-refresh-grid-preview]");
  if (refreshGrid) {
    e.preventDefault();
    e.stopPropagation();
    const modal = refreshGrid.closest("[data-letterland-picker-modal]");
    const form = window.__vvLetterlandActiveForm || getWeeklyThemesForm();
    const rows = Math.max(1, Math.min(20, Number(modal.querySelector("[data-letterland-modal-rows]")?.value || 1)));
    const cols = Math.max(1, Math.min(20, Number(modal.querySelector("[data-letterland-modal-cols]")?.value || 1)));
    const meta = getLetterlandSpriteMetaFromForm(form);
    meta.marginX = Number(modal.querySelector("[data-letterland-modal-margin-x]")?.value || 0);
    meta.marginY = Number(modal.querySelector("[data-letterland-modal-margin-y]")?.value || 0);
    meta.gapX = Number(modal.querySelector("[data-letterland-modal-gap-x]")?.value || 0);
    meta.gapY = Number(modal.querySelector("[data-letterland-modal-gap-y]")?.value || 0);
    meta.cellW = Number(modal.querySelector("[data-letterland-modal-cell-w]")?.value || 0);
    meta.cellH = Number(modal.querySelector("[data-letterland-modal-cell-h]")?.value || 0);
    const sheet = getLetterlandSpriteSheetFromForm(form);
    const wrap = modal.querySelector(".letterland-full-sheet-wrap");
    if (wrap) wrap.outerHTML = renderLetterlandFullSheetPreview(sheet, rows, cols, meta);
    const palette = modal.querySelector(".letterland-sprite-palette");
    if (palette) palette.outerHTML = renderLetterlandSpriteOptions(sheet, rows, cols, modal.dataset.pickerWeek || "", meta);
    return;
  }

  const applyGrid = e.target.closest?.("[data-letterland-apply-grid]");
  if (applyGrid) {
    e.preventDefault();
    e.stopPropagation();
    await applyLetterlandModalGrid();
    return;
  }

  const picked = e.target.closest?.("[data-pick-letterland-tile]");
  if (picked) {
    const modal = picked.closest("[data-letterland-picker-modal]");
    const week = picked.dataset.pickerWeek || modal?.dataset.pickerWeek || "";
    if (!week) return;
    e.preventDefault();
    e.stopPropagation();
    const form = window.__vvLetterlandActiveForm || getWeeklyThemesForm();
    try {
      await applyLetterlandSpriteTileToWeek(form, week, picked.dataset.pickLetterlandTile);
      document.querySelectorAll("[data-letterland-picker-modal]").forEach(el => el.remove());
      showToast("Letterland image selected. Use the floating Save button to publish it.");
    } catch (err) {
      alert(err.message || "That sprite tile could not be applied.");
    }
  }
}, true);


document.addEventListener("click", async function vvLetterlandExtraActions(e) {
  const saveNow = e.target.closest?.("[data-save-weekly-themes-now]");
  if (saveNow) {
    e.preventDefault();
    const form = getWeeklyThemesForm();
    if (!form) return;
    try {
      await saveWeeklyThemes(form);
      await refreshAdminData();
      document.querySelectorAll('[data-weekly-theme-floating-save]').forEach(el => el.remove());
      showToast("Weekly themes saved.");
    } catch (err) { alert(err.message || "Weekly themes could not be saved."); }
    return;
  }

  const removeBg = e.target.closest?.("[data-letterland-remove-bg]");
  if (removeBg) {
    e.preventDefault();
    const form = removeBg.closest("form") || getWeeklyThemesForm();
    const sheet = getLetterlandSpriteSheetFromForm(form);
    if (!sheet) { alert("Upload a sprite sheet first."); return; }
    try {
      const color = form.querySelector("[data-letterland-bg-color]")?.value || "#ffffff";
      const tolerance = form.querySelector("[data-letterland-bg-tolerance]")?.value || 28;
      const cleaned = await removeColorFromImageDataUrl(sheet, color, tolerance);
      const dims = await getImageDimensionsFromDataUrl(cleaned);
      setLetterlandSpriteSheetOnForm(form, cleaned);
      if (form.letterlandSpriteWidth) form.letterlandSpriteWidth.value = String(dims.width || "");
      if (form.letterlandSpriteHeight) form.letterlandSpriteHeight.value = String(dims.height || "");
      syncLetterlandSpriteSheetToState(form, false);
      refreshLetterlandSpriteSheetStatus(form);
      showWeeklyThemesFloatingSave(form);
      showToast("Background color removed. Save Weekly Themes when ready.");
    } catch (err) { alert(err.message || "Could not remove that background color."); }
  }
});

(async function start() {
  applyThemePreference(getThemePreference());
  showAppLoading("Loading OVA tools...");
  try {
    clearOldAppCachesInBackground();
    const shareParam = new URLSearchParams(window.location.search).get("share");
    if (shareParam) state.publicShareView = shareParam;
    try {
      await refreshLandingData();
      if (!shareParam) {
        const restored = await restorePersistedSessionIfAvailable();
        if (restored) {
          renderHome();
          return;
        }
      }
    } catch (err) {
      console.warn("Initial load failed. This is expected until Firebase config/rules are set.", err);
    }
    render();
  } finally {
    hideAppLoading();
  }
})();


