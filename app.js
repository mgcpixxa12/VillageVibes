import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  deleteUser
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

console.log("VILLAGE VIBES PHASE 1 VERSION: v51-click-loading-everywhere");
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


function getToolPrefs() {
  return readLocalJson(TOOL_PREFS_KEY, { order: [], bookmarks: [], hidden: [] });
}
function saveToolPrefs(prefs) { writeLocalJson(TOOL_PREFS_KEY, prefs); }
function isToolBookmarked(toolId) { return (getToolPrefs().bookmarks || []).includes(toolId); }
function isToolHidden(toolId) { return (getToolPrefs().hidden || []).includes(toolId); }
function getToolConfig(toolKey) { return state.appTools.find(t => t.key === toolKey) || {}; }
function getToolDisplay(tool) {
  const cfg = getToolConfig(tool.id);
  return { ...tool, title: cfg.name || tool.title, desc: cfg.description || tool.desc, imageData: cfg.imageData || "" };
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
      <button class="mini-icon-button" type="button" title="Bookmark" data-bookmark-tool="${t.id}">${bookmarked ? "★" : "☆"}</button>
      <button class="mini-icon-button" type="button" title="Hide" data-hide-tool="${t.id}">×</button>
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
  }
];

function getRolePermissionValue(role, toolKey, permissionKey) {
  return role?.permissions?.[toolKey]?.[permissionKey] || { enabled: false, positions: [] };
}

function collectRolePermissions(form) {
  const permissions = {};

  PERMISSION_TOOLS.forEach(tool => {
    permissions[tool.key] = {};
    tool.permissions.forEach(permission => {
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
  budgetCodes: [],
  appTools: [],
  notifications: [],
  homeToolSearch: "",
  toolAdminTab: "moneyRequests",
  selectedMoneyApprovalIds: [],
  selectedSchoolId: "",
  adminTab: "schools",
  leadershipTab: "users",
  ownerTab: "budgetCodes",
  moneyRequestsTab: "submit",
  expandedMoneyRequestId: "",
  expandedPermissionToolKey: "moneyRequests",
  expandedHomeToolKey: "moneyRequests",
  notificationsOpen: false,
  modal: null,
  toast: "",
  currentView: "landing",
  adminLoginOpen: false,
  devViewRoleKey: "",
  devViewPosition: ""
};

const $app = document.getElementById("app");

function safeLower(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function makeDisplayName(user) {
  return `${user.firstName || ""} ${(user.lastName || "").slice(0, 1)}.`.trim();
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
  await loadRoster();
}


async function loadAllUsers() {
  const snap = await getDocs(collection(db, "users"));
  state.users = snap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .filter(u => u.active !== false)
    .sort(byName);
}

async function refreshAdminData() {
  await loadSchools();
  await loadAllUsers();
  await loadPositions();
  await loadRoles();
  await loadMoneyRequestTypes();
  await loadMoneyRequests();
  await loadBudgetCodes();
  await loadAppTools();
  await loadNotifications();
}

async function refreshMoneyRequestsData() {
  // Keep the Money Requests tool fast by loading only the collections it needs.
  // The full admin refresh was pulling every admin collection on every tool click.
  await Promise.all([
    loadMoneyRequestTypes(),
    loadMoneyRequests(),
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

async function loadAppTools() {
  try {
    const snap = await getDocs(collection(db, "appTools"));
    state.appTools = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { state.appTools = []; }
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
    state.notifications = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(userMatchesNotification).sort((a,b)=>{
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

async function loginUser(user, credential) {
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

  await signInWithEmailAndPassword(auth, user.fakeEmail, DEFAULT_AUTH_PASSWORD);
  const fresh = await readUser(user.uid);
  state.session = fresh;
  rememberPickedUser(fresh);
  await refreshAdminData();

  if (fresh.pinResetRequired || credential === "0000") {
    state.modal = { type: "forcePinChange" };
    renderHome();
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
  await updateDoc(doc(db, "users", state.session.uid), {
    pin,
    pinResetRequired: false,
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
  const role = getFormRole(form);
  const roles = [role];
  const teamPosition = form.teamPosition.value.trim();
  const schoolIds = getFormSchoolIds(form);
  if (!teamPosition) throw new Error("Team position is required.");

  await updateDoc(doc(db, "users", uid), {
    firstName,
    lastName,
    displayName: `${firstName} ${lastName.slice(0, 1)}.`,
    pin: form.pin.value.trim(),
    teamPosition,
    role,
    roles,
    schoolIds,
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
  const updates = state.roles.map(role => {
    const nextPermissions = { ...(role.permissions || {}) };

    PERMISSION_TOOLS.forEach(tool => {
      nextPermissions[tool.key] = { ...(nextPermissions[tool.key] || {}) };

      tool.permissions.forEach(permission => {
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

  if (canSubmitMoney || canApproveMoney || canProcessMoney || hasFullDevAccess(user)) {
    tools.push({
      id: "moneyRequests",
      title: "Money Requests",
      icon: "$",
      desc: "Submit, review, or process money requests based on your role permissions."
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

async function addUser(form) {
  const firstName = form.firstName.value.trim();
  const lastName = form.lastName.value.trim();
  const pin = form.pin.value.trim();
  const selectedSchoolIds = getFormSchoolIds(form);
  const role = getFormRole(form);
  const roles = [role];
  const teamPosition = form.teamPosition.value.trim();

  if (!firstName || !lastName) throw new Error("First and last name are required.");
  if (!/^\d{4}$/.test(pin)) throw new Error("PIN must be exactly 4 digits.");
  if (!selectedSchoolIds.length) throw new Error("Select at least one school.");
  if (!teamPosition) throw new Error("Team position is required.");

  const fakeEmail = generateFakeEmail(firstName, lastName);
  const uid = await createFirebaseUserWithoutSwitchingSession(fakeEmail, DEFAULT_AUTH_PASSWORD);

  await setDoc(doc(db, "users", uid), {
    firstName,
    lastName,
    displayName: `${firstName} ${lastName.slice(0, 1)}.`,
    fakeEmail,
    pin,
    teamPosition,
    role,
    pinResetRequired: false,
    roles: roles.length ? roles : ["teacher"],
    schoolIds: selectedSchoolIds,
    active: true,
    passwordRequired: false,
    passwordSet: false,
    homeLayout: [],
    hiddenToolIds: [],
    notificationSettings: { inApp: true, push: false },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await createAudit("userCreated", { uid, fakeEmail, schoolIds: selectedSchoolIds });
  await loadRoster();
  state.modal = null;
  showToast("User added.");
}

async function resetUserPin(uid) {
  await updateDoc(doc(db, "users", uid), {
    pin: "0000",
    pinResetRequired: true,
    updatedAt: serverTimestamp()
  });
  await createAudit("pinReset", { uid });
  await loadRoster();
  showToast("PIN reset to 0000.");
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
  </div>`;
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

function pageShell(content) {
  return `
    <div class="topbar">
      <div class="topbar-inner">
        <div class="actions">
          <div class="logo">VV</div>
          <strong>Village Vibes</strong>
        </div>
        <div class="actions">
          <button class="theme-toggle-button secondary small" type="button" data-toggle-theme>${getThemePreference() === "dark" ? "☀️ Light" : "🌙 Dark"}</button>
          <button class="notification-button" type="button" data-toggle-notifications>🔔${getUnreadNotificationCount() ? `<span>${getUnreadNotificationCount()}</span>` : ""}</button>
          <div class="user-pill">${makeDisplayName(state.session)} · ${getPrimaryRole(state.session)}</div>
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
  const autocomplete = opts.autocomplete || "current-password";
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
      ${(request.receipts || []).length ? `<div class="receipt-summary"><b>Receipts:</b> ${(request.receipts || []).length} attached</div>` : ""}
    </div>
  `;
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
          ${!canBulk && status === "pendingDoso" && canApproveDoso ? `<button class="small" type="button" data-doso-approve-money-request="${request.id}">DOSO Approve</button>` : ""}
          ${!canBulk && status === "pendingOwner" && canApproveOwner ? `<button class="small" type="button" data-owner-approve-money-request="${request.id}">Owner Approve</button>` : ""}
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
    await createNotification({ title: "PO ready for owner approval", body: `${ids.length} money request(s) approved by DOSO.`, toRoles: ["owner"], toPositions: ["CFO"], schoolIds: approvedSchoolIds, toolKey: "moneyRequests" });
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
  await setDoc(doc(collection(db, "moneyRequests")), {
    status: "pendingDoso",
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

  await createNotification({ title: "New money request", body: `${state.session?.firstName || "Someone"} submitted a money request for ${getSchoolNameById(requestSchoolId)}.`, toPositions: ["DOSO"], schoolIds: [requestSchoolId], toolKey: "moneyRequests" });
  await loadMoneyRequests();
  await loadNotifications();
  state.moneyRequestsTab = "pendingDoso";
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
    ...(canSubmit ? ["submit"] : []),
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
        ${canSubmit ? `<button class="${activeTab === "submit" ? "active" : ""}" data-money-queue-tab="submit" type="button">Money Requests</button>` : ""}
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

      ${activeTab === "pendingDoso" ? renderMoneyRequestQueue("pendingDoso", canApproveDoso, canApproveOwner) : ""}
      ${activeTab === "pendingOwner" ? renderMoneyRequestQueue("pendingOwner", canApproveDoso, canApproveOwner) : ""}
      ${activeTab === "finalApproved" ? renderMoneyRequestQueue("finalApproved", canApproveDoso, canApproveOwner) : ""}
      ${activeTab === "receipts" && canAddReceipts ? renderReceiptQueue(canAddReceipts) : ""}
    </section>
    ${state.modal ? renderModal() : ""}
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
    ${state.toast ? `<div class="toast">${state.toast}</div>` : ""}
  `);
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
      </div>

      ${state.leadershipTab === "users" ? `
        <div class="actions" style="justify-content:flex-start;">
          <button data-modal="addUser">Add New Teacher/User</button>
        </div>
        <div class="name-grid admin-name-grid">
          ${state.users.length ? state.users.map(u => `
            <button class="name-button" data-edit-user="${u.uid}" type="button">
              ${u.firstName} ${u.lastName}
              <span>${u.teamPosition || "No position"} · ${getPrimaryRole(u)}</span>
            </button>
          `).join("") : `<div class="empty grid-empty">No users yet.</div>`}
        </div>
      ` : ""}
    </section>
    ${state.modal ? renderModal() : ""}
    ${state.toast ? `<div class="toast">${state.toast}</div>` : ""}
  `);
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


function resizeToolImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file."));
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const maxSize = 520;
        const canvas = document.createElement("canvas");
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f7f2e8";
        ctx.fillRect(0, 0, maxSize, maxSize);
        const scale = Math.min(maxSize / img.width, maxSize / img.height);
        const drawW = Math.round(img.width * scale);
        const drawH = Math.round(img.height * scale);
        const drawX = Math.round((maxSize - drawW) / 2);
        const drawY = Math.round((maxSize - drawH) / 2);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        URL.revokeObjectURL(objectUrl);

        let quality = 0.82;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        while (dataUrl.length > 850000 && quality > 0.45) {
          quality -= 0.08;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        if (dataUrl.length > 950000) {
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
      <div class="modal-backdrop"><form class="modal card" id="loginForm">
        <h2>${u.firstName} ${u.lastName}</h2>
        <p class="helper">${u.passwordSet ? "Enter your password." : "Enter your 4-digit PIN."}</p>
        ${passwordFieldHtml("credential", u.passwordSet ? "Password" : "PIN", { autocomplete: u.passwordSet ? "current-password" : "one-time-code", inputmode: u.passwordSet ? "text" : "numeric", maxlength: u.passwordSet ? "99" : "4" })}
        ${modalErrorHtml()}
        <div class="actions"><button>Login</button><button type="button" class="secondary" data-close-modal>Cancel</button></div>
      </form></div>`;
  }

  if (state.modal.type === "adminPasswordLogin") {
    const u = state.modal.user;
    return `
      <div class="modal-backdrop"><form class="modal card" id="adminPasswordLoginForm">
        <h2>Admin / Leader Login</h2>
        <p class="helper">Logging in as <strong>${u.firstName} ${u.lastName}</strong>.</p>
        ${passwordFieldHtml("password", "Password")}
        ${modalErrorHtml()}
        <div class="actions"><button>Log In</button><button type="button" class="secondary" data-close-modal>Cancel</button></div>
      </form></div>`;
  }

  if (state.modal.type === "approvalPassword") {
    const count = state.modal.ids?.length || 0;
    const label = state.modal.stage === "pendingDoso" ? "DOSO approval" : "Owner approval";
    return `
      <div class="modal-backdrop"><form class="modal card" id="approvalPasswordForm">
        <h2>Confirm ${label}</h2>
        <p class="helper">Enter your password once to approve ${count} request${count === 1 ? "" : "s"}.</p>
        ${passwordFieldHtml("password", "Password")}
        ${modalErrorHtml()}
        <div class="actions"><button>Approve ${count}</button><button type="button" class="secondary" data-close-modal>Cancel</button></div>
      </form></div>`;
  }

  if (state.modal.type === "nukeMoneyRequests") {
    return `
      <div class="modal-backdrop"><form class="modal card" id="nukeMoneyRequestsForm">
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

if (state.modal.type === "addUser" || state.modal.type === "editUser") {
    const u = state.modal.user || { roles: ["teacher"], schoolIds: [] };
    const isEdit = state.modal.type === "editUser";
    const roleText = (u.roles || ["teacher"]).join(", ");
    const selectedSchools = u.schoolIds || [];
    return `
      <div class="modal-backdrop"><form class="modal card" id="${isEdit ? "editUserForm" : "userForm"}">
        <h2>${isEdit ? "Edit User" : "Add User"}</h2>
        <div class="grid two">
          <label>First Name <input name="firstName" required value="${u.firstName || ""}" /></label>
          <label>Last Name <input name="lastName" required value="${u.lastName || ""}" /></label>
        </div>
        <div class="grid two">
          <label>4-Digit PIN <input name="pin" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required value="${u.pin || ""}" /></label>
          <label>Team Position
            <select name="teamPosition" required>
              <option value="">Select position...</option>
              ${state.positions.map(p => `<option value="${p.name}" ${u.teamPosition === p.name ? "selected" : ""}>${p.name}</option>`).join("")}
            </select>
          </label>
        </div>
        <label>Role
          <select name="role" required>
            ${state.roles.length ? state.roles.map(r => `<option value="${r.key}" ${getPrimaryRole(u) === r.key ? "selected" : ""}>${r.name}</option>`).join("") : `<option value="teacher">Teacher</option>`}
          </select>
        </label>
        <div>
          <strong>Schools</strong>
          <div class="grid two" style="margin-top:.5rem;">
            ${state.schools.map(s => `<label style="display:flex;align-items:center;gap:.5rem;"><input style="width:auto;" type="checkbox" name="schoolIds" value="${s.id}" ${selectedSchools.includes(s.id) ? "checked" : ""} /> ${s.name} (${s.code})</label>`).join("")}
          </div>
        </div>
        <p class="helper">${isEdit ? "Reset PIN sets this user to 0000 and forces them to choose a new PIN next login." : "This uses a secondary Firebase app instance so the admin stays logged in while the new Auth account is created."}</p>
        <div class="actions">
          <button>${isEdit ? "Save Changes" : "Save User"}</button>
          ${isEdit ? `<button type="button" class="secondary" data-reset-pin="${u.uid}">Reset PIN</button><button type="button" class="danger" data-delete-user="${u.uid}">Delete</button>` : ""}
          <button type="button" class="secondary" data-close-modal>Cancel</button>
        </div>
      </form></div>`;
  }

  return "";
}


async function adminLeaderLogin(user, password) {
  if (!user?.fakeEmail) {
    throw new Error("This user does not have a fakeEmail saved in Firestore.");
  }

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


function renderCurrentView() {
  if (!state.session) {
    renderLanding();
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

  renderHome();
}

function render() {
  renderCurrentView();
}

$app.addEventListener("change", async (e) => {
  if (e.target.matches("[data-dev-view-role]")) {
    state.devViewRoleKey = e.target.value;
    state.selectedMoneyApprovalIds = [];
    state.expandedMoneyRequestId = "";
    renderHome();
    return;
  }
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
  const leadershipTab = e.target.closest("[data-leadership-tab]")?.dataset.leadershipTab;
  const ownerTab = e.target.closest("[data-owner-tab]")?.dataset.ownerTab;
  const toolId = e.target.closest("[data-tool]")?.dataset.tool;
  const moneyQueueTab = e.target.closest("[data-money-queue-tab]")?.dataset.moneyQueueTab;
  const dosoApproveMoneyRequestId = e.target.closest("[data-doso-approve-money-request]")?.dataset.dosoApproveMoneyRequest;
  const ownerApproveMoneyRequestId = e.target.closest("[data-owner-approve-money-request]")?.dataset.ownerApproveMoneyRequest;
  const bulkMoneyApprove = e.target.closest("[data-bulk-money-approve]")?.dataset.bulkMoneyApprove;
  const bookmarkToolId = e.target.closest("[data-bookmark-tool]")?.dataset.bookmarkTool;
  const hideToolId = e.target.closest("[data-hide-tool]")?.dataset.hideTool;
  const restoreToolId = e.target.closest("[data-restore-tool]")?.dataset.restoreTool;
  const saveToolConfigKey = e.target.closest("[data-save-tool-config]")?.dataset.saveToolConfig;
  const nukeMoneyRequests = e.target.closest("[data-nuke-money-requests]");
  const clearDevPreview = e.target.closest("[data-clear-dev-preview]");

  const permissionToolToggle = e.target.closest("[data-permission-tool-toggle]")?.dataset.permissionToolToggle;
  const addPermissionRole = e.target.closest("[data-add-permission-role]")?.dataset.addPermissionRole;
  const removePermissionRole = e.target.closest("[data-remove-permission-role]")?.dataset.removePermissionRole;
  const addPermissionPosition = e.target.closest("[data-add-permission-position]")?.dataset.addPermissionPosition;
  const removePermissionPosition = e.target.closest("[data-remove-permission-position]")?.dataset.removePermissionPosition;

  if (clearDevPreview) { await withAppLoading("Updating view...", async () => { state.devViewRoleKey = ""; state.devViewPosition = ""; renderHome(); }); return; }
  if (nukeMoneyRequests) { await withAppLoading("Opening confirmation...", async () => { state.modal = { type: "nukeMoneyRequests", error: "" }; renderSystemAdmin(); }); return; }

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
  const openNotificationId = e.target.closest("[data-open-notification]")?.dataset.openNotification;
  if (openNotificationId) {
    await updateDoc(doc(db, "notifications", openNotificationId), { read: true });
    await loadNotifications();
    const n = state.notifications.find(x => x.id === openNotificationId);
    if (n?.toolKey === "moneyRequests") renderMoneyRequestsTool(); else renderCurrentView();
    return;
  }
  if (saveToolConfigKey) { await withAppLoading("Saving tool settings...", async () => { await saveToolConfig(saveToolConfigKey); renderSystemAdmin(); }); return; }
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
    line?.remove();
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

  if (toolId === "moneyRequests") {
    await withAppLoading("Opening Money Requests...", async () => {
      await refreshMoneyRequestsData();
      renderMoneyRequestsTool();
    });
    return;
  }

  if (toolId) {
    await withAppLoading("Opening tool...", async () => renderHome());
    return;
  }

  if (leadershipTab) {
    await withAppLoading("Loading Leadership tab...", async () => {
      state.leadershipTab = leadershipTab;
      await refreshAdminData();
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
      else if (["addSchool", "addPosition", "addRole", "addMoneyRequestType", "addBudgetCode"].includes(modalType)) renderSystemAdmin();
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
  if (action === "leadership") { await withAppLoading("Opening Leadership Panel...", async () => { await refreshAdminData(); renderLeadership(); }); return; }
  if (action === "ownersPanel") { await withAppLoading("Opening Owners Panel...", async () => { await refreshAdminData(); renderOwnersPanel(); }); return; }
  if (action === "systemAdmin") { await withAppLoading("Opening System Admin...", async () => { await refreshAdminData(); renderSystemAdmin(); }); return; }
  if (action === "admin") { await withAppLoading("Opening System Admin...", async () => { await refreshAdminData(); renderSystemAdmin(); }); return; }
  if (e.target.closest("[data-close-modal]")) {
    state.modal = null;
    renderCurrentView();
  }
  if (resetPin) {
    if (confirm("Reset this user's PIN to 0000?")) await resetUserPin(resetPin);
    await refreshAdminData();
    const user = state.users.find(u => u.uid === resetPin) || await readUser(resetPin);
    state.modal = { type: "editUser", user };
    renderLeadership();
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
  if (e.target.matches("[data-home-tool-search]")) { state.homeToolSearch = e.target.value; renderHome(); return; }
  if (e.target.matches("[data-money-input]")) {
    e.target.value = String(e.target.value || "").replace(/[^0-9.]/g, "");
  }
  if (e.target.matches("[data-budget-code]")) {
    syncBudgetFromCode(e.target);
  }
  if (e.target.matches("[data-budget-category]")) {
    syncBudgetFromCategory(e.target);
  }
  if (e.target.closest(".money-request-line")) {
    updateMoneyRequestAddButtons();
  }
});

$app.addEventListener("blur", (e) => {
  if (e.target.matches("[data-home-tool-search]")) { state.homeToolSearch = e.target.value; renderHome(); return; }
  if (e.target.matches("[data-money-input]")) {
    formatMoneyInput(e.target);
    updateMoneyRequestAddButtons();
  }
}, true);

$app.addEventListener("dragstart", (e) => {
  const tool = e.target.closest("[data-drag-tool]");
  if (!tool) return;
  e.dataTransfer.setData("text/plain", tool.dataset.dragTool);
  tool.classList.add("dragging");
});
$app.addEventListener("dragend", (e) => { e.target.closest("[data-drag-tool]")?.classList.remove("dragging"); });
$app.addEventListener("dragover", (e) => {
  const zone = e.target.closest("[data-tool-drop-zone]");
  const over = e.target.closest("[data-tool-card]");
  if (!zone || !over) return;
  e.preventDefault();
  document.querySelectorAll(".drop-before,.drop-after").forEach(el => el.classList.remove("drop-before","drop-after"));
  const rect = over.getBoundingClientRect();
  over.classList.add(e.clientX < rect.left + rect.width / 2 ? "drop-before" : "drop-after");
});
$app.addEventListener("drop", (e) => {
  const zone = e.target.closest("[data-tool-drop-zone]");
  const over = e.target.closest("[data-tool-card]");
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

$app.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  showAppLoading(form.id === "loginForm" ? "Logging in..." : "Saving...");
  try {
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (form.id === "adminPasswordLoginForm") { await adminLeaderLogin(state.modal.user, form.password.value); hideAppLoading(); return; }
    if (form.id === "approvalPasswordForm") { await completeApprovalPassword(form.password.value); hideAppLoading(); return; }
    if (form.id === "nukeMoneyRequestsForm") { await completeNukeMoneyRequests(form.password.value); hideAppLoading(); return; }
    if (form.id === "loginForm") await loginUser(state.modal.user, form.credential.value.trim());
    if (form.id === "passwordSetupForm") await saveNewPassword(form.password.value);
    if (form.id === "pinChangeForm") await saveNewPin(form.pin.value.trim());
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
    if (form.id === "userForm") { await addUser(form); await refreshAdminData(); renderLeadership(); }
    if (form.id === "editUserForm") { await updateAppUser(form); await refreshAdminData(); renderLeadership(); }
    hideAppLoading();
  } catch (err) {
    hideAppLoading();
    console.error(err);
    const isPasswordForm = ["loginForm", "adminPasswordLoginForm", "approvalPasswordForm", "nukeMoneyRequestsForm", "passwordSetupForm"].includes(form.id);
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

(async function start() {
  applyThemePreference(getThemePreference());
  try {
    await refreshLandingData();
  } catch (err) {
    console.warn("Initial load failed. This is expected until Firebase config/rules are set.", err);
  }
  render();
})();


