/* ==========================================================================
   Sulehri Mobile — Admin / POS / Technician Panel (Phase 4)
   Clean modular vanilla JS. Sections:
     1. CONFIG          5. WRITE QUEUE       9.  INVENTORY     13. LEDGER
     2. LISTS / ROLES   6. AUTH / SHELL      10. PURCHASES     14. EXPENSES / P&L
     3. STATE           7. DASHBOARD         11. ORDERS/RMA    15. BANNERS/WARRANTY
     4. API + DEMO      8. POS BILLING       12. REPAIRS       16. SETTINGS/USERS
                        + INVOICES / WHATSAPP helpers, INIT at the end.
   Backend contract: Code.gs (Phase 2 + Phase 4 user addendum) ACTION
   REGISTRY — 47 actions. Transport is identical to the storefront:
   POST, Content-Type 'text/plain', body {action, token, ...fields},
   replies {ok:true,data} / {ok:false,error}. Field names verified
   against Code.gs handlers (never guessed):
     staffLogin {email,password} -> {token, user{Staff_ID,Name,Email,Role}}
     getProducts {search?,category?,lowStockOnly?} -> {products[]}
        (Cost_Price present ONLY for Owner/Manager/Account_Manager)
     addProduct/updateProduct: any Products field; update needs Product_ID
     deleteProduct {Product_ID} -> {archived:true} | {deleted:true}
     adjustStock {Product_ID, delta, reason?}
     getCustomers {search?,tier?} / saveCustomer {Customer_ID?, fields...,
        password?} / deleteCustomer {Customer_ID} (soft: Status=Inactive)
     createOrder {Sale_Channel:'Walk-in POS', Customer_ID (''=walk-in
        guest), Items:[{Product_ID,Qty}], Payment_Method,
        Payment_Due_Date?, Tracking_Notes?} -> {order, items, tier}
     getOrders {Order_Status?,Customer_ID?,Sale_Channel?} (staff view
        INCLUDES Total_Cost / Net_Profit — staff only, by design)
     updateOrderStatus {Order_ID, Order_Status, Tracking_Notes?}
     logPurchase {Supplier_Name, Supplier_Phone, Items:[{Product_ID?|new
        fields, Qty, Cost_Price}], Total_Bill?, Amount_Paid, Payment_Mode,
        Notes?} / logSupplierPayment {Party_ID?|Supplier_Name/Phone,
        Amount, Payment_Mode, Reference_Note?}
     processReturn {Original_Order_ID, Customer_ID, Product_ID,
        IMEI_Serial?, Reason, Action_Taken, Stock_Condition, Qty,
        Refund_Amount} / getReturns -> {returns[]}
     createRepairJob {Customer_Name, Customer_Phone, Customer_Email,
        Device_Brand_Model, IMEI_Serial, Repair_Type, Reported_Issue,
        Service_Charges, Advance_Paid, Assigned_Technician, Internal_Notes}
     getRepairs {search?,Current_Stage?} / updateRepair {Job_ID, fields}
        (Technician: Current_Stage, Customer_Comm_Status, Internal_Notes,
        Assigned_Technician only — enforced by the backend too)
     addRepairParts {Job_ID, Items:[{Product_ID,Qty}], Service_Charges?}
     recordRepairPayment {Job_ID, Amount, Payment_Mode?}
     getLedger {Party_Type, Party_ID} -> {entries[], balance}
     addLedgerEntry {Party_Type, Party_ID, Type, Payment_Mode, Amount,
        Due_Date?, Reference_Note?} -> {Entry_ID, Balance_After}
     addExpense {Category, Description, Amount, Payment_Mode, Date?}
     getExpenses {thisMonthOnly?} / getPnL|getDashboard ->
        {today:{...}, thisMonth:{...}, Total_Receivables, Total_Payables}
     saveBanner {Banner_ID?, fields} / deleteBanner {Banner_ID}
     getBanners -> ACTIVE banners only (public action, reused here)
     saveSetting {op:'add'|'rename'|'delete'|'reorder', Group, Value,
        NewValue?, NewGroup?, Values?} / getSettingsAll -> {settings:
        {Group:[{value,order,notes}]}}
     getWarrantyPending -> {products[]} / markWarrantyChecked {Product_ID}
     getInvoiceData {type:'order'|'repair', id} -> {type, shop, invoice}
     getUsers -> {users[]} / saveUser {Staff_ID?, Name, Email, Role,
        Active_Status, password?} / deleteUser {Staff_ID}  (Owner only,
        Phase 4 Code.gs addendum; Password_Hash is never returned)
   ========================================================================== */
'use strict';

/* ============================ 1. CONFIG ================================= */
const CONFIG = {
  /* >>> DAOOD: paste the SAME deployed Apps Script Web App URL (ends in
   *     /exec) that you put in the storefront app.js. Until then this
   *     panel runs in DEMO MODE with sample data and demo staff logins. */
  API_URL: 'https://script.google.com/macros/s/AKfycby87O67OYFsgwev_LSiKIVFn-Pra1eqbkeWEIHFAbb5ma805gELJdE_VKegVn1-pmAHWg/exec',
  SHOP_NAME: 'Sulehri Mobile',
  CURRENCY: 'PKR'
};
const DEMO_MODE = CONFIG.API_URL === 'PASTE_YOUR_WEB_APP_URL_HERE' ||
  CONFIG.API_URL.indexOf('script.google') === -1;

/* ======================= 2. LISTS / ROLE MAPS =========================== */
/* Fallback dropdown lists (mirror Setup.gs LISTS). At runtime the lists
 * are refreshed from getSettingsAll / getSettingsPublic, so values the
 * Owner adds in the Settings Manager appear here automatically. */
const FALLBACK_LISTS = {
  Main_Category: ['Phones', 'Parts', 'Accessories'],
  Sub_Category: ['Mobile Phones', 'Units', 'Sub-boards', 'Strips', 'OCA Glass', 'Glass Protectors', 'Back Covers', 'Chargers', 'Handsfree', 'Data Cables', 'Repair Services', 'Other'],
  Brand: ['Samsung', 'Apple', 'Infinix', 'Tecno', 'Xiaomi', 'Vivo', 'Oppo', 'Realme', 'Nokia', 'Other'],
  RAM: ['2GB', '3GB', '4GB', '6GB', '8GB', '12GB', '16GB', 'N/A'],
  Storage: ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB', 'N/A'],
  PTA_Status: ['PTA Approved', 'Non-PTA', 'CPID', 'Patch', 'N/A'],
  Network_Status: ['Unlocked', 'Locked', 'N/A'],
  Product_Badge: ['NEW', 'HOT SALE', 'LIMITED', 'BESTSELLER', 'NONE'],
  Check_Status: ['Pending', 'Checked'],
  Price_Tier: ['Guest', 'Retail', 'Wholesale', 'Business', 'Shopkeeper'],
  Customer_Status: ['Active', 'Inactive', 'Blocked'],
  Payment_Method: ['Cash', 'Bank', 'EasyPaisa-JazzCash', 'Credit'],
  Payment_Mode: ['Cash', 'Bank', 'Wallet'],
  Order_Status: ['Pending', 'Dispatched', 'Delivered', 'Returned', 'Cancelled'],
  Repair_Type: ['Software', 'Hardware', 'Both'],
  Repair_Stage: ['Received', 'Software File Downloading', 'Flashing in Progress', 'Hardware Diagnosis', 'Waiting for Parts', 'Testing', 'Phone OK / Ready for Pickup', 'Delivered', 'Unrepairable'],
  Customer_Comm_Status: ['Not Contacted', 'Called - Informed', 'Called - No Answer', 'Email/Notification Sent', 'Customer Contacted Us - Pending Pickup'],
  Party_Type: ['Customer', 'Supplier'],
  Ledger_Type: ['Debit', 'Credit'],
  Expense_Category: ['Rent', 'Electricity', 'Salary', 'Tea/Food', 'Courier', 'Misc'],
  RMA_Action: ['Refund', 'Replacement', 'Repair'],
  Stock_Condition: ['Resellable', 'Damaged'],
  Role: ['Owner', 'Manager', 'Account_Manager', 'Technician', 'Staff'],
  Section_Order: ['Hero Banners', 'Category Strip', 'Blessed Friday / Flash Sale', 'Mobile Phones', 'Mobile Parts & Units', 'Accessories', 'Repair Services'],
  Sale_Channel: ['Website', 'Walk-in POS']
};
const STAFF_ROLES = ['Owner', 'Manager', 'Account_Manager', 'Technician', 'Staff'];
const ALL_STAFF = STAFF_ROLES.slice();

/* Per-ACTION roles — copied from Code.gs HANDLERS_ (Phase 2 + Phase 4
 * addendum). The UI hides/blocks anything the backend would reject; the
 * backend re-checks every call, so this map is convenience, not security. */
const ACTION_ROLES = {
  getProducts: ['Owner', 'Manager', 'Staff', 'Account_Manager'],
  addProduct: ['Owner', 'Manager', 'Staff'],
  updateProduct: ['Owner', 'Manager', 'Staff'],
  deleteProduct: ['Owner', 'Manager'],
  adjustStock: ['Owner', 'Manager', 'Staff'],
  getCustomers: ['Owner', 'Manager', 'Account_Manager'],
  saveCustomer: ['Owner', 'Manager', 'Account_Manager'],
  deleteCustomer: ['Owner', 'Manager'],
  createOrder: ALL_STAFF, getOrders: ALL_STAFF, getInvoiceData: ALL_STAFF,
  updateOrderStatus: ['Owner', 'Manager', 'Staff'],
  logPurchase: ['Owner', 'Manager'],
  logSupplierPayment: ['Owner', 'Manager', 'Account_Manager'],
  processReturn: ['Owner', 'Manager'],
  getReturns: ['Owner', 'Manager', 'Account_Manager'],
  createRepairJob: ALL_STAFF, getRepairs: ALL_STAFF, updateRepair: ALL_STAFF,
  addRepairParts: ['Owner', 'Manager', 'Technician'],
  recordRepairPayment: ['Owner', 'Manager', 'Staff', 'Account_Manager'],
  getLedger: ['Owner', 'Manager', 'Staff', 'Account_Manager'],
  addLedgerEntry: ['Owner', 'Manager', 'Staff', 'Account_Manager'],
  addExpense: ['Owner', 'Account_Manager'],
  getExpenses: ['Owner', 'Account_Manager', 'Manager'],
  getPnL: ['Owner', 'Account_Manager'], getDashboard: ['Owner', 'Account_Manager'],
  saveBanner: ['Owner', 'Manager'], deleteBanner: ['Owner', 'Manager'],
  saveSetting: ['Owner', 'Manager'], getSettingsAll: ['Owner', 'Manager'],
  getWarrantyPending: ['Owner', 'Manager'], markWarrantyChecked: ['Owner', 'Manager'],
  getUsers: ['Owner'], saveUser: ['Owner'], deleteUser: ['Owner'],
  installTriggersApi: ['Owner']
};
/* Module visibility, derived from the actions each module needs. */
const MODULES = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊', roles: ACTION_ROLES.getDashboard },
  { id: 'pos', label: 'POS Billing', icon: '🧾', roles: ['Owner', 'Manager', 'Staff', 'Account_Manager'] },
  { id: 'inventory', label: 'Inventory', icon: '📦', roles: ACTION_ROLES.getProducts },
  { id: 'purchases', label: 'Purchases', icon: '📥', roles: ['Owner', 'Manager', 'Account_Manager'] },
  { id: 'orders', label: 'Orders', icon: '🛍️', roles: ['Owner', 'Manager', 'Staff'] },
  { id: 'returns', label: 'Returns / RMA', icon: '↩️', roles: ACTION_ROLES.getReturns },
  { id: 'repairs', label: 'Repairs', icon: '🔧', roles: ALL_STAFF },
  { id: 'customers', label: 'Registration System', icon: '📝', roles: ACTION_ROLES.getCustomers },
  { id: 'ledger', label: 'Ledger (Khata)', icon: '📒', roles: ACTION_ROLES.getLedger },
  { id: 'expenses', label: 'Expenses', icon: '💸', roles: ACTION_ROLES.getExpenses },
  { id: 'pnl', label: 'Profit & Loss', icon: '📈', roles: ACTION_ROLES.getPnL },
  { id: 'banners', label: 'Banners', icon: '🖼️', roles: ACTION_ROLES.saveBanner },
  { id: 'warranty', label: 'Warranty Checklist', icon: '🛡️', roles: ACTION_ROLES.getWarrantyPending },
  { id: 'settings', label: 'Settings & Layout', icon: '⚙️', roles: ACTION_ROLES.getSettingsAll },
  { id: 'users', label: 'Users & Roles', icon: '🔑', roles: ACTION_ROLES.getUsers }
];

/* ============================ 3. STATE ================================== */
const state = {
  token: '', user: null, module: 'dashboard',
  lists: JSON.parse(JSON.stringify(FALLBACK_LISTS)),
  settingsAll: {},            // {Group:[{value,order,notes}]} from getSettingsAll
  settingsGroup: '',          // (legacy — Settings Builder ab bState istemal karta hai)
  products: [], customers: [], orders: [], repairs: [], returns: [],
  expenses: [], banners: [], users: [], warranty: [], ledger: [],
  pnl: null,
  posLines: [],               // [{Product_ID, Qty}]
  posCustomerId: '',          // '' = walk-in guest
  repairJobId: '',            // job open in the drawer
  ledgerParty: null           // {type, id, name, phone}
};
try {
  state.token = localStorage.getItem('sm_admin_token') || '';
  state.user = JSON.parse(localStorage.getItem('sm_admin_user') || 'null');
} catch (e) { /* corrupted storage -> start logged out */ }

/* ============================ Utilities ================================= */
const $ = id => document.getElementById(id);
function esc(v) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
function money(v) { return 'PKR ' + Math.round(num(v)).toLocaleString('en-PK'); }
/* Sheet ki artefact (formula-only, khaali) rows ko products se hamesha
   bahar rakho — jin ke paas na Product_ID hai na Name, wo asal product
   nahi hain aur kahin nazar nahi aane chahiye (Inventory / POS / Low Stock). */
function realProducts_(arr) {
  return (arr || []).filter(p => p &&
    (String(p.Product_ID || '').trim() !== '' || String(p.Name || '').trim() !== ''));
}
function isTrue(v) { return v === true || v === 1 || String(v).toUpperCase() === 'TRUE' || String(v) === '1'; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysAgoISO(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? esc(v) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function toast(msg, kind) {
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.textContent = msg;
  $('toastWrap').appendChild(t);
  setTimeout(() => t.remove(), 4200);
}
function can(action) {
  const roles = ACTION_ROLES[action];
  return !roles || (state.user && roles.indexOf(state.user.Role) > -1);
}
function guard(action) {
  if (can(action)) return true;
  toast('Your role (' + (state.user ? state.user.Role : '?') + ') cannot use ' + action + '.', 'error');
  return false;
}
function fillSelect(el, values, selected, includeBlank) {
  if (!el) return;
  el.innerHTML = (includeBlank ? '<option value="">— Select —</option>' : '') +
    values.map(v => '<option value="' + esc(v) + '"' + (String(v) === String(selected) ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
}
/* Coded variants (Settings builder wale codes): option ke LABEL mein
   '<code> · <value>' nazar aata hai — sirf admin ki madad ke liye.
   Option ki VALUE hamesha raw value rehti hai, taake backend aur tamam
   .value parhne wala code bilkul waisa hi chale jaisa pehle chalta tha.
   Main/Sub ke codes hamesha FULL list ki position se bante hain (builder
   se match), baqi lists ke codes diye gaye array ki position se. */
function codedCodeFor_(group, value, fallbackIndex) {
  if (group === 'Main_Category' || group === 'Sub_Category') {
    const full = (state.lists && state.lists[group]) || [];
    const i = full.indexOf(value);
    return groupCode_(group) + ((i > -1 ? i : fallbackIndex) + 1);
  }
  return groupCode_(group) + (fallbackIndex + 1);
}
function fillSelectCoded(el, group, values, selected, includeBlank) {
  if (!el) return;
  el.innerHTML = (includeBlank ? '<option value="">— Select —</option>' : '') +
    values.map((v, i) => {
      const label = (v === '' || v === null || v === undefined) ? '' : codedCodeFor_(group, v, i) + ' · ' + v;
      return '<option value="' + esc(v) + '"' + (String(v) === String(selected) ? ' selected' : '') + codedTintStyle_(group, v) + '>' + esc(label) + '</option>';
    }).join('');
}
/* String-built selects (jo innerHTML se bante hain) ke liye coded options. */
function codedOptions_(group, values, selected) {
  return values.map((v, i) =>
    '<option value="' + esc(v) + '"' + (String(v) === String(selected) ? ' selected' : '') + codedTintStyle_(group, v) + '>' +
    esc((v === '' || v === null || v === undefined) ? '' : codedCodeFor_(group, v, i) + ' · ' + v) + '</option>').join('');
}
/* ---------- Code colors: har code letter ka apna rang (sirf admin panel) ----------
   GROUP_COLORS = strong rang (badges / dots ke liye), GROUP_TINTS = halka
   pastel rang (dropdown options ke background ke liye). Dono code ke pehle
   letter se bante hain, taake har list ka rang har jagah ek jaisa rahe. */
const GROUP_COLORS = {
  A: '#2563eb', B: '#7c3aed', C: '#db2777', D: '#059669', E: '#d97706', F: '#0891b2',
  G: '#4d7c0f', H: '#9333ea', I: '#0f766e', J: '#92400e', K: '#0369a1', L: '#be123c',
  M: '#15803d', N: '#a16207', O: '#1e40af', P: '#c2410c', Q: '#6d28d9', R: '#0e7490',
  S: '#b91c1c', T: '#475569', U: '#7e22ce', V: '#166534', W: '#9a3412', X: '#334155',
  Y: '#854d0e', Z: '#e11d48'
};
/* Dark theme: option backgrounds gehre (dark) tints hain taake safed text
   dark dropdown mein saaf parha jaye. */
const GROUP_TINTS = {
  A: '#1d3557', B: '#372a5e', C: '#571f42', D: '#17452e', E: '#57431a', F: '#174a57',
  G: '#39511a', H: '#47245e', I: '#174f4a', J: '#573a1a', K: '#1a3f57', L: '#571f2b',
  M: '#1e4d2a', N: '#57511a', O: '#1d3557', P: '#572f1a', Q: '#33245e', R: '#174a57',
  S: '#571f1f', T: '#333a45', U: '#3f1e57', V: '#1e4d33', W: '#572a1a', X: '#2e3440',
  Y: '#574a1a', Z: '#571f33'
};
function codeColor_(code) {
  const letter = String(code || '').charAt(0).toUpperCase();
  return GROUP_COLORS[letter] || '#B9F638';
}
function codeTint_(code) {
  const letter = String(code || '').charAt(0).toUpperCase();
  return GROUP_TINTS[letter] || '';
}
/* Ek coded <option> ke liye pastel background style (blank option bila rang). */
function codedTintStyle_(group, v) {
  if (v === '' || v === null || v === undefined) return '';
  const tint = codeTint_(groupCode_(group));
  return tint ? ' style="background:' + tint + '"' : '';
}
function productName(p) { return ((p.Brand || '') + ' ' + (p.Model || '')).trim() || p.Product_ID; }
function productById(id) { return state.products.find(p => String(p.Product_ID) === String(id)); }
function customerById(id) { return state.customers.find(c => String(c.Customer_ID) === String(id)); }
function waLink(phone, text) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(text);
}
function parseItems(json) {
  if (Array.isArray(json)) return json;
  try { const p = JSON.parse(json || '[]'); return Array.isArray(p) ? p : []; } catch (e) { return []; }
}

/* ============================ 4. API ==================================== */
async function api(action, payload) {
  if (DEMO_MODE) return demoApi(action, payload || {});
  const body = Object.assign({}, payload || {}, { action: action });
  if (state.token) body.token = state.token;
  let res;
  try {
    res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // Apps Script CORS-friendly
      body: JSON.stringify(body)
    });
  } catch (e) {
    throw new Error('Network problem — please check your internet and try again.');
  }
  let json;
  try { json = await res.json(); } catch (e) { throw new Error('Server returned an unreadable reply.'); }
  if (!json.ok) {
    if (/Login required|session expired/i.test(json.error || '')) doLogout(true);
    throw new Error(json.error || 'Something went wrong.');
  }
  return json.data;
}

/* ========================= 5. WRITE QUEUE ===============================
 * Every WRITE goes through this serial queue (prompt 4G): the pill shows
 * "Saving…" while anything is in flight, forms clear instantly for rapid
 * consecutive entries, a failed write is retried ONCE automatically, and
 * only then is the error shown. Reads never enter the queue. */
let writeChain = Promise.resolve();
let pendingWrites = 0;
function setWriteStatus(s) {
  const pill = $('writeStatus');
  if (!pill) return;
  pill.className = 'write-status ' + s;
  pill.textContent = s === 'saving' ? 'Saving…' : (s === 'error' ? 'Error — not saved' : 'Saved ✓');
}
function queueWrite(action, payload) {
  if (!guard(action)) return Promise.reject(new Error('Not allowed for your role.'));
  pendingWrites++;
  setWriteStatus('saving');
  const attempt = () => api(action, payload);
  const task = writeChain.then(attempt).catch(() => attempt()); // one retry
  writeChain = task.then(() => {}, () => {});
  return task.then(
    res => { pendingWrites--; if (pendingWrites === 0) setWriteStatus('saved'); return res; },
    err => {
      pendingWrites--;
      setWriteStatus('error');
      toast('Save failed (' + action + '): ' + err.message, 'error');
      throw err;
    }
  );
}

/* ==================== DEMO MODE (sample data only) ======================
 * Active while CONFIG.API_URL is the placeholder — exactly like Phase 3.
 * Everything below is in-memory: refresh and it resets. Demo staff:
 *   owner@sulehri.pk / manager@sulehri.pk / accounts@sulehri.pk /
 *   tech@sulehri.pk — password demo123 for all. */
let demoRole = '';
const DEMO_STAFF = [
  { Staff_ID: 'STF-1001', Name: 'Daood Ali', Email: 'owner@sulehri.pk', Role: 'Owner', Active_Status: true, _pass: 'demo123' },
  { Staff_ID: 'STF-1002', Name: 'Bilal Ahmed', Email: 'manager@sulehri.pk', Role: 'Manager', Active_Status: true, _pass: 'demo123' },
  { Staff_ID: 'STF-1003', Name: 'Usman Tariq', Email: 'accounts@sulehri.pk', Role: 'Account_Manager', Active_Status: true, _pass: 'demo123' },
  { Staff_ID: 'STF-1004', Name: 'Ahmed Raza', Email: 'tech@sulehri.pk', Role: 'Technician', Active_Status: true, _pass: 'demo123' },
  { Staff_ID: 'STF-1005', Name: 'Ali Hassan', Email: 'staff@sulehri.pk', Role: 'Staff', Active_Status: false, _pass: 'demo123' }
];
function demoProduct(id, main, sub, brand, model, imei, cost, stock, dmg, minAlert, guest, retail, badge, warrantyDays, check, addedDaysAgo) {
  return {
    Product_ID: id, Show_On_Website: true, Main_Category: main, Sub_Category: sub,
    Brand: brand, Model: model, RAM: 'N/A', Storage: 'N/A', PTA_Status: 'N/A',
    Network_Status: 'N/A', IMEI_Serial: imei || '', Cost_Price: cost, Stock_Qty: stock,
    Damaged_Qty: dmg || 0, Min_Stock_Alert: minAlert, Price_Guest: guest, Price_Retail: retail,
    Price_Wholesale: Math.round(retail * 0.94), Price_Business: Math.round(retail * 0.9),
    Product_Badge: badge, Image_1: 'https://picsum.photos/seed/' + id + '/600/600', Image_2: '',
    Has_Warranty: !!warrantyDays, Warranty_Days: warrantyDays || 0,
    Check_Status: check || 'Pending', Added_Date: daysAgoISO(addedDaysAgo || 40)
  };
}
const DB = {
  seq: { product: 1010, customer: 1005, order: 1004, repair: 1004, purchase: 1003, rma: 1002, ledger: 1006, expense: 1005, banner: 1005, staff: 1006 },
  products: [
    Object.assign(demoProduct('MOB-1001', 'Phones', 'Mobile Phones', 'Samsung', 'Galaxy A55 5G', '356789104512301', 108000, 6, 0, 2, 124999, 121999, 'NEW', 365, 'Pending', 12),
      { RAM: '8GB', Storage: '256GB', PTA_Status: 'PTA Approved', Network_Status: 'Unlocked' }),
    Object.assign(demoProduct('MOB-1002', 'Phones', 'Mobile Phones', 'Infinix', 'Hot 40 Pro', '356789104512302', 33500, 3, 0, 3, 39999, 38999, 'HOT SALE', 365, 'Pending', 25),
      { RAM: '8GB', Storage: '256GB', PTA_Status: 'PTA Approved', Network_Status: 'Unlocked' }),
    demoProduct('PRT-1001', 'Parts', 'Units', 'Samsung', 'Galaxy A10 LCD Unit', '', 4800, 9, 1, 3, 6500, 6200, 'BESTSELLER', 30, 'Pending', 26),
    demoProduct('PRT-1002', 'Parts', 'Units', 'Samsung', 'Galaxy A10s LCD Unit', '', 5000, 2, 0, 2, 6800, 6500, 'NONE', 30, 'Checked', 60),
    demoProduct('PRT-1003', 'Parts', 'OCA Glass', 'Samsung', 'Galaxy A10 OCA Glass', '', 260, 40, 0, 10, 450, 420, 'NONE', 0, 'Pending', 15),
    demoProduct('PRT-1004', 'Parts', 'Sub-boards', 'Xiaomi', 'Redmi Note 10 Charging Sub-board', '', 950, 5, 0, 2, 1450, 1380, 'NEW', 30, 'Pending', 28),
    demoProduct('ACC-1001', 'Accessories', 'Glass Protectors', 'Samsung', 'A10 Tempered Glass Protector', '', 120, 55, 0, 20, 350, 320, 'HOT SALE', 0, 'Pending', 9),
    demoProduct('ACC-1002', 'Accessories', 'Glass Protectors', 'Samsung', 'A10s Tempered Glass Protector', '', 120, 1, 0, 20, 350, 320, 'NONE', 0, 'Pending', 9),
    demoProduct('ACC-1003', 'Accessories', 'Chargers', 'Samsung', '25W Fast Charger', '', 750, 14, 0, 5, 1450, 1350, 'NEW', 0, 'Pending', 33),
    demoProduct('ACC-1004', 'Accessories', 'Back Covers', 'Infinix', 'Hot 40 Pro Back Cover', '', 220, 22, 0, 8, 600, 550, 'NONE', 0, 'Pending', 20)
  ],
  customers: [
    { Customer_ID: 'CUS-1001', Name: 'Muhammad Imran', Phone: '03001234567', Email: 'imran@example.com', Reference_By: 'Walk-in', Photo_Drive_URL: '', Price_Tier: 'Retail', Monthly_Target: 50000, Current_Month_Spend: 18500, Fallback_Tier: 'Guest', Credit_Limit: 20000, Current_Credit_Balance: 6000, Payment_Due_Date: daysAgoISO(-5), Status: 'Active' },
    { Customer_ID: 'CUS-1002', Name: 'Hassan Wholesale', Phone: '03219876543', Email: 'hassan@trade.pk', Reference_By: 'Market', Photo_Drive_URL: '', Price_Tier: 'Wholesale', Monthly_Target: 300000, Current_Month_Spend: 240000, Fallback_Tier: 'Retail', Credit_Limit: 150000, Current_Credit_Balance: 42000, Payment_Due_Date: daysAgoISO(-2), Status: 'Active' },
    { Customer_ID: 'CUS-1003', Name: 'Fatima Noor', Phone: '03335554433', Email: 'fatima@example.com', Reference_By: '', Photo_Drive_URL: '', Price_Tier: 'Retail', Monthly_Target: 0, Current_Month_Spend: 3200, Fallback_Tier: 'Guest', Credit_Limit: 0, Current_Credit_Balance: 0, Payment_Due_Date: '', Status: 'Active' },
    { Customer_ID: 'CUS-1004', Name: 'Old Customer', Phone: '03009998877', Email: 'old@example.com', Reference_By: '', Photo_Drive_URL: '', Price_Tier: 'Guest', Monthly_Target: 0, Current_Month_Spend: 0, Fallback_Tier: 'Guest', Credit_Limit: 0, Current_Credit_Balance: 0, Payment_Due_Date: '', Status: 'Inactive' }
  ],
  orders: [], repairs: [], purchases: [], returns: [], ledger: [], expenses: [],
  banners: [
    { Banner_ID: 'BAN-1001', Section_Title: 'Blessed Friday / Flash Sale', Target_Category: 'Accessories', Poster_Image_URL: 'https://picsum.photos/seed/ban1/1200/500', Badge_Text: 'UP TO 50% OFF', Active_Status: true, Display_Order: 1 },
    { Banner_ID: 'BAN-1002', Section_Title: 'Mobile Phones', Target_Category: 'Phones', Poster_Image_URL: 'https://picsum.photos/seed/ban2/1200/500', Badge_Text: 'NEW ARRIVALS', Active_Status: true, Display_Order: 2 },
    { Banner_ID: 'BAN-1003', Section_Title: 'Mobile Parts & Units', Target_Category: 'Parts', Poster_Image_URL: 'https://picsum.photos/seed/ban3/1200/500', Badge_Text: 'BEST PRICES', Active_Status: true, Display_Order: 3 },
    { Banner_ID: 'BAN-1004', Section_Title: 'Accessories', Target_Category: 'Accessories', Poster_Image_URL: 'https://picsum.photos/seed/ban4/1200/500', Badge_Text: 'HOT SALE', Active_Status: true, Display_Order: 4 }
  ],
  settings: {}
};
(function initDemo() {
  const t = todayISO();
  DB.orders = [
    { Order_ID: 'ORD-1001', Date: t, Sale_Channel: 'Walk-in POS', Customer_ID: 'CUS-1001', Items_JSON: JSON.stringify([{ Product_ID: 'ACC-1001', Brand: 'Samsung', Model: 'A10 Tempered Glass Protector', Qty: 2, Unit_Price: 320, Line_Total: 640 }, { Product_ID: 'ACC-1003', Brand: 'Samsung', Model: '25W Fast Charger', Qty: 1, Unit_Price: 1350, Line_Total: 1350 }]), Total_Cost: 990, Total_Amount: 1990, Net_Profit: 1000, Payment_Method: 'Cash', Order_Status: 'Delivered', Warranty_Expiry_Date: '', Tracking_Notes: '' },
    { Order_ID: 'ORD-1002', Date: t, Sale_Channel: 'Website', Customer_ID: 'CUS-1002', Items_JSON: JSON.stringify([{ Product_ID: 'PRT-1001', Brand: 'Samsung', Model: 'Galaxy A10 LCD Unit', Qty: 5, Unit_Price: 5900, Line_Total: 29500 }]), Total_Cost: 24000, Total_Amount: 29500, Net_Profit: 5500, Payment_Method: 'Credit', Order_Status: 'Dispatched', Warranty_Expiry_Date: daysAgoISO(-30), Tracking_Notes: 'TCS booked' },
    { Order_ID: 'ORD-1003', Date: daysAgoISO(9), Sale_Channel: 'Walk-in POS', Customer_ID: '', Items_JSON: JSON.stringify([{ Product_ID: 'MOB-1002', Brand: 'Infinix', Model: 'Hot 40 Pro', Qty: 1, Unit_Price: 39999, Line_Total: 39999 }]), Total_Cost: 33500, Total_Amount: 39999, Net_Profit: 6499, Payment_Method: 'EasyPaisa-JazzCash', Order_Status: 'Delivered', Warranty_Expiry_Date: daysAgoISO(-356), Tracking_Notes: '' }
  ];
  DB.repairs = [
    { Job_ID: 'REP-1001', Date_Received: daysAgoISO(2), Customer_Name: 'Muhammad Imran', Customer_Phone: '03001234567', Customer_Email: 'imran@example.com', Default_Portal_Pass: 'SM-482913', Device_Brand_Model: 'Samsung Galaxy A10', IMEI_Serial: '356789104500001', Repair_Type: 'Hardware', Reported_Issue: 'Broken LCD, no display', Parts_Used_JSON: JSON.stringify([{ Product_ID: 'PRT-1001', Model: 'Galaxy A10 LCD Unit', Qty: 1, Unit_Cost: 4800, Line_Cost: 4800 }]), Parts_Cost: 4800, Service_Charges: 1500, Total_Amount: 6300, Advance_Paid: 300, Balance_Due: 6000, Assigned_Technician: 'Ahmed Raza', Current_Stage: 'Testing', Customer_Comm_Status: 'Called - Informed', Internal_Notes: 'Check touch after 1 hour burn-in.', Last_Updated: daysAgoISO(0) },
    { Job_ID: 'REP-1002', Date_Received: daysAgoISO(1), Customer_Name: 'Fatima Noor', Customer_Phone: '03335554433', Customer_Email: 'fatima@example.com', Default_Portal_Pass: 'SM-731205', Device_Brand_Model: 'Xiaomi Redmi Note 10', IMEI_Serial: '', Repair_Type: 'Both', Reported_Issue: 'Charging port loose + software lag', Parts_Used_JSON: '[]', Parts_Cost: 0, Service_Charges: 2000, Total_Amount: 2000, Advance_Paid: 0, Balance_Due: 2000, Assigned_Technician: 'Ahmed Raza', Current_Stage: 'Hardware Diagnosis', Customer_Comm_Status: 'Not Contacted', Internal_Notes: '', Last_Updated: daysAgoISO(0) },
    { Job_ID: 'REP-1003', Date_Received: t, Customer_Name: 'Walk-in Customer', Customer_Phone: '03007776655', Customer_Email: '', Default_Portal_Pass: 'SM-109384', Device_Brand_Model: 'Infinix Hot 40', IMEI_Serial: '', Repair_Type: 'Software', Reported_Issue: 'Forgot pattern lock', Parts_Used_JSON: '[]', Parts_Cost: 0, Service_Charges: 1200, Total_Amount: 1200, Advance_Paid: 1200, Balance_Due: 0, Assigned_Technician: 'Ahmed Raza', Current_Stage: 'Phone OK / Ready for Pickup', Customer_Comm_Status: 'Email/Notification Sent', Internal_Notes: '', Last_Updated: t }
  ];
  DB.purchases = [
    { Purchase_ID: 'PUR-1001', Date: daysAgoISO(4), Supplier_Name: 'Karachi Mobile Wholesale', Supplier_Phone: '03005551122', Items_JSON: '[]', Total_Bill: 50000, Amount_Paid: 30000, Balance_Payable: 20000, Notes: '' },
    { Purchase_ID: 'PUR-1002', Date: daysAgoISO(11), Supplier_Name: 'Lahore Parts Hub', Supplier_Phone: '03214443322', Items_JSON: '[]', Total_Bill: 18000, Amount_Paid: 18000, Balance_Payable: 0, Notes: '' }
  ];
  DB.ledger = [
    { Entry_ID: 'LED-1001', Date: daysAgoISO(6), Party_Type: 'Customer', Party_ID: 'CUS-1002', Type: 'Credit', Payment_Mode: 'Bank', Amount: 20000, Balance_After: 62000, Due_Date: '', Reference_Note: 'Part payment received', Entered_By: 'accounts@sulehri.pk' },
    { Entry_ID: 'LED-1002', Date: daysAgoISO(3), Party_Type: 'Customer', Party_ID: 'CUS-1002', Type: 'Debit', Payment_Mode: 'Cash', Amount: 42000, Balance_After: 42000, Due_Date: daysAgoISO(-2), Reference_Note: 'Credit sale ORD-1002 balance', Entered_By: 'owner@sulehri.pk' },
    { Entry_ID: 'LED-1003', Date: daysAgoISO(2), Party_Type: 'Customer', Party_ID: 'CUS-1001', Type: 'Debit', Payment_Mode: 'Cash', Amount: 6000, Balance_After: 6000, Due_Date: daysAgoISO(-5), Reference_Note: 'Repair REP-1001 on credit', Entered_By: 'owner@sulehri.pk' },
    { Entry_ID: 'LED-1004', Date: daysAgoISO(4), Party_Type: 'Supplier', Party_ID: '03005551122', Type: 'Credit', Payment_Mode: 'Cash', Amount: 20000, Balance_After: 20000, Due_Date: '', Reference_Note: 'Purchase PUR-1001 (unpaid balance)', Entered_By: 'owner@sulehri.pk' }
  ];
  DB.expenses = [
    { Expense_ID: 'EXP-1001', Date: t, Category: 'Tea/Food', Description: 'Staff tea', Amount: 600, Payment_Mode: 'Cash', Entered_By: 'owner@sulehri.pk' },
    { Expense_ID: 'EXP-1002', Date: daysAgoISO(3), Category: 'Electricity', Description: 'Shop electricity bill', Amount: 8500, Payment_Mode: 'Bank', Entered_By: 'accounts@sulehri.pk' },
    { Expense_ID: 'EXP-1003', Date: daysAgoISO(6), Category: 'Rent', Description: 'Monthly shop rent', Amount: 35000, Payment_Mode: 'Bank', Entered_By: 'accounts@sulehri.pk' },
    { Expense_ID: 'EXP-1004', Date: daysAgoISO(8), Category: 'Courier', Description: 'TCS parcels', Amount: 1450, Payment_Mode: 'Wallet', Entered_By: 'owner@sulehri.pk' }
  ];
  Object.keys(FALLBACK_LISTS).forEach(g => {
    DB.settings[g] = FALLBACK_LISTS[g].map((v, i) => ({ value: v, order: i + 1, notes: '' }));
  });
  DB.settings.System = [{ value: 'Currency = PKR', order: 1, notes: '' }];
})();
function demoDelay(fn) {
  return new Promise((resolve, reject) => setTimeout(() => {
    try { resolve(fn()); } catch (e) { reject(e); }
  }, 60));
}
function demoStaffProduct(p) {
  const out = Object.assign({}, p);
  if (['Staff', 'Technician'].indexOf(demoRole) > -1) delete out.Cost_Price;
  return out;
}
function demoPartyBalance(type, id) {
  let bal = 0;
  DB.ledger.filter(e => e.Party_Type === type && String(e.Party_ID) === String(id)).forEach(e => { bal = num(e.Balance_After); });
  return bal;
}
function demoAddLedger(partyType, partyId, type, mode, amount, due, note) {
  const delta = partyType === 'Customer' ? (type === 'Debit' ? amount : -amount) : (type === 'Credit' ? amount : -amount);
  const bal = Math.round((demoPartyBalance(partyType, partyId) + delta) * 100) / 100;
  const entry = { Entry_ID: 'LED-' + (DB.seq.ledger++), Date: todayISO(), Party_Type: partyType, Party_ID: partyId, Type: type, Payment_Mode: mode || 'Cash', Amount: amount, Balance_After: bal, Due_Date: due || '', Reference_Note: note || '', Entered_By: 'demo' };
  DB.ledger.push(entry);
  if (partyType === 'Customer') {
    const c = DB.customers.find(x => x.Customer_ID === partyId);
    if (c) { c.Current_Credit_Balance = bal; if (due) c.Payment_Due_Date = due; }
  }
  return { Entry_ID: entry.Entry_ID, Balance_After: bal };
}
function demoPnL() {
  function calc(filterFn) {
    let sales = 0, profit = 0; const by = { Cash: 0, Bank: 0, Wallet: 0 };
    DB.orders.forEach(o => {
      if (!filterFn(o.Date) || o.Order_Status === 'Cancelled') return;
      sales += num(o.Total_Amount); profit += num(o.Net_Profit);
      if (o.Payment_Method === 'Cash') by.Cash += num(o.Total_Amount);
      else if (o.Payment_Method === 'Bank') by.Bank += num(o.Total_Amount);
      else if (o.Payment_Method === 'EasyPaisa-JazzCash') by.Wallet += num(o.Total_Amount);
    });
    let ri = 0, rpc = 0;
    DB.repairs.forEach(r => { if (filterFn(r.Date_Received) && r.Current_Stage !== 'Unrepairable') { ri += num(r.Total_Amount); rpc += num(r.Parts_Cost); } });
    let ex = 0;
    DB.expenses.forEach(x => { if (filterFn(x.Date)) ex += num(x.Amount); });
    return { Sales: sales, Order_Profit: profit, Repair_Income: ri, Repair_Profit: ri - rpc, Total_Expenses: ex, Net_Profit: profit + (ri - rpc) - ex, Cash: by.Cash, Bank: by.Bank, Wallet: by.Wallet };
  }
  const now = new Date();
  return {
    today: calc(d => String(d).slice(0, 10) === todayISO()),
    thisMonth: calc(d => { const x = new Date(d); return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth(); }),
    Total_Receivables: DB.customers.reduce((s, c) => s + Math.max(0, num(c.Current_Credit_Balance)), 0),
    Total_Payables: DB.purchases.reduce((s, p) => s + num(p.Balance_Payable), 0),
    currency: 'PKR'
  };
}

function demoApi(action, p) {
  return demoDelay(() => {
    const findP = id => DB.products.find(x => String(x.Product_ID) === String(id));
    const findC = id => DB.customers.find(x => String(x.Customer_ID) === String(id));
    const findR = id => DB.repairs.find(x => String(x.Job_ID) === String(id));
    switch (action) {
      case 'staffLogin': {
        const u = DEMO_STAFF.find(x => x.Email === String(p.email || '').toLowerCase());
        if (!u || !u.Active_Status || u._pass !== String(p.password || '')) throw new Error('Invalid email or password.');
        demoRole = u.Role;
        return { token: 'demo-token', user: { Staff_ID: u.Staff_ID, Name: u.Name, Email: u.Email, Role: u.Role } };
      }
      case 'logout': return { loggedOut: true };
      case 'getDashboard': case 'getPnL': return demoPnL();
      case 'getProducts': {
        let rows = DB.products.slice();
        if (p.category) rows = rows.filter(x => x.Main_Category === p.category);
        if (p.search) { const q = String(p.search).toLowerCase(); rows = rows.filter(x => (x.Product_ID + ' ' + x.Brand + ' ' + x.Model + ' ' + x.IMEI_Serial + ' ' + x.Sub_Category).toLowerCase().indexOf(q) > -1); }
        if (p.lowStockOnly) rows = rows.filter(x => num(x.Stock_Qty) <= num(x.Min_Stock_Alert));
        return { products: rows.map(demoStaffProduct) };
      }
      case 'addProduct': {
        const prefix = p.Main_Category === 'Phones' ? 'MOB-' : (p.Main_Category === 'Parts' ? 'PRT-' : 'ACC-');
        const prod = Object.assign({}, p, { Product_ID: prefix + (DB.seq.product++) });
        DB.products.push(prod);
        return { product: demoStaffProduct(prod) };
      }
      case 'updateProduct': {
        const prod = findP(p.Product_ID);
        if (!prod) throw new Error('Product not found: ' + p.Product_ID);
        Object.keys(p).forEach(k => { if (k !== 'Product_ID') prod[k] = p[k]; });
        return { product: demoStaffProduct(prod) };
      }
      case 'deleteProduct': {
        const prod = findP(p.Product_ID);
        if (!prod) throw new Error('Product not found: ' + p.Product_ID);
        const referenced = DB.orders.some(o => String(o.Items_JSON).indexOf(prod.Product_ID) > -1) ||
          DB.repairs.some(r => String(r.Parts_Used_JSON).indexOf(prod.Product_ID) > -1);
        if (referenced) { prod.Show_On_Website = false; prod.Stock_Qty = 0; return { Product_ID: prod.Product_ID, archived: true }; }
        DB.products = DB.products.filter(x => x !== prod);
        return { Product_ID: prod.Product_ID, deleted: true };
      }
      case 'adjustStock': {
        const prod = findP(p.Product_ID);
        if (!prod) throw new Error('Product not found: ' + p.Product_ID);
        prod.Stock_Qty = Math.max(0, num(prod.Stock_Qty) + num(p.delta));
        return { product: demoStaffProduct(prod) };
      }
      case 'getCustomers': {
        let rows = DB.customers.slice();
        if (p.search) { const q = String(p.search).toLowerCase(); rows = rows.filter(c => (c.Name + ' ' + c.Phone + ' ' + c.Email).toLowerCase().indexOf(q) > -1); }
        return { customers: rows.map(c => Object.assign({}, c)) };
      }
      case 'saveCustomer': {
        if (p.Customer_ID) {
          const c = findC(p.Customer_ID);
          if (!c) throw new Error('Customer not found.');
          Object.keys(p).forEach(k => { if (k !== 'password' && p[k] !== undefined) c[k] = p[k]; });
          return { customer: Object.assign({}, c) };
        }
        const dupP = DB.customers.find(x => p.Phone && x.Phone === p.Phone);
        if (dupP) throw new Error('Duplicate phone: this number is already registered for ' + dupP.Customer_ID + ' (' + dupP.Name + ').');
        if (p.Email) { const dupE = DB.customers.find(x => String(x.Email || '').toLowerCase() === String(p.Email).toLowerCase()); if (dupE) throw new Error('Duplicate email: this email is already registered for ' + dupE.Customer_ID + ' (' + dupE.Name + ').'); }
        const c = Object.assign({ Monthly_Target: 0, Current_Month_Spend: 0, Credit_Limit: 0, Current_Credit_Balance: 0, Status: 'Active', Price_Tier: 'Retail', Fallback_Tier: 'Guest', Reference_By: '', Photo_Drive_URL: '', Payment_Due_Date: '' }, p, { Customer_ID: 'CUS-' + (DB.seq.customer++) });
        delete c.password;
        DB.customers.push(c);
        return { customer: Object.assign({}, c) };
      }
      case 'deleteCustomer': {
        const c = findC(p.Customer_ID);
        if (!c) throw new Error('Customer not found.');
        c.Status = 'Inactive';
        return { Customer_ID: c.Customer_ID, Status: 'Inactive' };
      }
      case 'createOrder': {
        const items = p.Items || [];
        if (!items.length) throw new Error('Order needs at least one item.');
        if (!p.Customer_ID && p.Customer_Phone) {
          let gc = DB.customers.find(x => x.Phone === p.Customer_Phone);
          if (!gc) { gc = { Customer_ID: 'CUS-' + (DB.seq.customer++), Name: p.Customer_Name || 'Customer', Phone: p.Customer_Phone, Email: (p.Customer_Email || '').toLowerCase(), Reference_By: 'Auto (POS/Repair)', Photo_Drive_URL: '', Price_Tier: 'Retail', Monthly_Target: 0, Current_Month_Spend: 0, Fallback_Tier: 'Guest', Credit_Limit: 0, Current_Credit_Balance: 0, Payment_Due_Date: '', Status: 'Active' }; DB.customers.push(gc); }
          p.Customer_ID = gc.Customer_ID;
        }
        const cust = p.Customer_ID ? findC(p.Customer_ID) : null;
        const tier = cust ? cust.Price_Tier : 'Guest';
        let cost = 0, total = 0; const lines = [];
        items.forEach(it => {
          const prod = findP(it.Product_ID);
          if (!prod) throw new Error('Product not found: ' + it.Product_ID);
          if (num(prod.Stock_Qty) < num(it.Qty)) throw new Error('Not enough stock for ' + prod.Product_ID + '. Available: ' + prod.Stock_Qty);
          const unit = num(prod['Price_' + tier] !== undefined ? prod['Price_' + tier] : prod.Price_Guest);
          cost += num(prod.Cost_Price) * num(it.Qty); total += unit * num(it.Qty);
          lines.push({ Product_ID: prod.Product_ID, Brand: prod.Brand, Model: prod.Model, IMEI_Serial: prod.IMEI_Serial || '', Qty: num(it.Qty), Unit_Price: unit, Line_Total: unit * num(it.Qty) });
        });
        if (p.Payment_Method === 'Credit') {
          if (!cust) throw new Error('Credit orders need a registered customer account.');
          if (num(cust.Credit_Limit) <= 0 || num(cust.Current_Credit_Balance) + total > num(cust.Credit_Limit)) {
            throw new Error('Credit limit exceeded. Limit: ' + num(cust.Credit_Limit) + ', current balance: ' + num(cust.Current_Credit_Balance) + ', this order: ' + total + '.');
          }
        }
        lines.forEach(l => { findP(l.Product_ID).Stock_Qty -= l.Qty; });
        const order = { Order_ID: 'ORD-' + (DB.seq.order++), Date: todayISO(), Sale_Channel: p.Sale_Channel || 'Walk-in POS', Customer_ID: p.Customer_ID || '', Items_JSON: JSON.stringify(lines), Total_Cost: cost, Total_Amount: total, Net_Profit: total - cost, Payment_Method: p.Payment_Method || 'Cash', Order_Status: 'Pending', Warranty_Expiry_Date: '', Tracking_Notes: p.Tracking_Notes || '' };
        DB.orders.unshift(order);
        if (cust) {
          cust.Current_Month_Spend = num(cust.Current_Month_Spend) + total;
          if (p.Payment_Method === 'Credit') demoAddLedger('Customer', cust.Customer_ID, 'Debit', 'Cash', total, p.Payment_Due_Date || cust.Payment_Due_Date || '', 'Credit sale ' + order.Order_ID);
        }
        return { order: Object.assign({}, order), items: lines, tier: tier };
      }
      case 'getOrders': {
        let rows = DB.orders.slice();
        if (p.Order_Status) rows = rows.filter(o => o.Order_Status === p.Order_Status);
        if (p.Customer_ID) rows = rows.filter(o => o.Customer_ID === p.Customer_ID);
        return { orders: rows.map(o => Object.assign({}, o)) };
      }
      case 'updateOrderStatus': {
        const o = DB.orders.find(x => x.Order_ID === p.Order_ID);
        if (!o) throw new Error('Order not found: ' + p.Order_ID);
        if (p.Order_Status === 'Cancelled' && o.Order_Status !== 'Cancelled' && o.Order_Status !== 'Returned') {
          parseItems(o.Items_JSON).forEach(it => { const prod = findP(it.Product_ID); if (prod) prod.Stock_Qty += num(it.Qty); });
        }
        o.Order_Status = p.Order_Status;
        if (p.Tracking_Notes !== undefined) o.Tracking_Notes = p.Tracking_Notes;
        return { order: Object.assign({}, o) };
      }
      case 'logPurchase': {
        const items = p.Items || [];
        let computed = 0; const stored = [];
        items.forEach(raw => {
          const qty = Math.max(1, num(raw.Qty) || 1); const cost = num(raw.Cost_Price);
          computed += cost * qty;
          if (raw.Product_ID) {
            const prod = findP(raw.Product_ID);
            if (!prod) throw new Error('Product not found: ' + raw.Product_ID);
            prod.Stock_Qty += qty; if (raw.Cost_Price !== undefined) prod.Cost_Price = cost;
            stored.push({ Product_ID: prod.Product_ID, Brand: prod.Brand, Model: prod.Model, Qty: qty, Cost_Price: cost, Line_Total: cost * qty });
          } else {
            const prefix = raw.Main_Category === 'Phones' ? 'MOB-' : (raw.Main_Category === 'Accessories' ? 'ACC-' : 'PRT-');
            const prod = Object.assign(demoProduct(prefix + (DB.seq.product++), raw.Main_Category || 'Parts', raw.Sub_Category || 'Other', raw.Brand || '', raw.Model || 'Item', '', cost, qty, 0, 2, num(raw.Price_Guest) || cost, num(raw.Price_Retail) || cost, 'NONE', 0, 'Pending', 0), {});
            DB.products.push(prod);
            stored.push({ Product_ID: prod.Product_ID, Brand: prod.Brand, Model: prod.Model, Qty: qty, Cost_Price: cost, Line_Total: cost * qty });
          }
        });
        const totalBill = p.Total_Bill !== undefined ? num(p.Total_Bill) : computed;
        const paid = Math.min(num(p.Amount_Paid), totalBill);
        const purchase = { Purchase_ID: 'PUR-' + (DB.seq.purchase++), Date: todayISO(), Supplier_Name: p.Supplier_Name || '', Supplier_Phone: p.Supplier_Phone || '', Items_JSON: JSON.stringify(stored), Total_Bill: totalBill, Amount_Paid: paid, Balance_Payable: totalBill - paid, Notes: p.Notes || '' };
        DB.purchases.unshift(purchase);
        if (purchase.Balance_Payable > 0) demoAddLedger('Supplier', p.Supplier_Phone || p.Supplier_Name, 'Credit', p.Payment_Mode || 'Cash', purchase.Balance_Payable, '', 'Purchase ' + purchase.Purchase_ID + ' (unpaid balance)');
        return { purchase: Object.assign({}, purchase), items: stored };
      }
      case 'logSupplierPayment': {
        const key = p.Party_ID || p.Supplier_Phone || p.Supplier_Name;
        const ledger = demoAddLedger('Supplier', key, 'Debit', p.Payment_Mode || 'Cash', num(p.Amount), '', p.Reference_Note || 'Supplier payment');
        let remaining = num(p.Amount);
        DB.purchases.forEach(pu => {
          if (remaining <= 0) return;
          if ((pu.Supplier_Phone || pu.Supplier_Name) !== key) return;
          const applied = Math.min(num(pu.Balance_Payable), remaining);
          pu.Amount_Paid += applied; pu.Balance_Payable -= applied; remaining -= applied;
        });
        return { ledger: ledger, unapplied: remaining };
      }
      case 'processReturn': {
        const prod = findP(p.Product_ID);
        if (!prod) throw new Error('Product not found: ' + p.Product_ID);
        const qty = Math.max(1, num(p.Qty) || 1);
        const rma = { RMA_ID: 'RMA-' + (DB.seq.rma++), Date: todayISO(), Original_Order_ID: p.Original_Order_ID || '', Customer_ID: p.Customer_ID || '', Product_ID: prod.Product_ID, IMEI_Serial: p.IMEI_Serial || prod.IMEI_Serial || '', Reason: p.Reason || '', Action_Taken: p.Action_Taken || 'Refund', Stock_Condition: p.Stock_Condition || 'Resellable', Status: 'Completed' };
        DB.returns.unshift(rma);
        if (rma.Stock_Condition === 'Resellable') prod.Stock_Qty += qty; else prod.Damaged_Qty = num(prod.Damaged_Qty) + qty;
        let ledger = null;
        if (num(p.Refund_Amount) > 0 && p.Customer_ID) ledger = demoAddLedger('Customer', p.Customer_ID, 'Credit', p.Payment_Mode || 'Cash', num(p.Refund_Amount), '', 'Refund for return ' + rma.RMA_ID);
        return { rma: Object.assign({}, rma), ledger: ledger };
      }
      case 'getReturns': return { returns: DB.returns.map(r => Object.assign({}, r)) };
      case 'createRepairJob': {
        const job = { Job_ID: 'REP-' + (DB.seq.repair++), Date_Received: todayISO(), Customer_Name: p.Customer_Name || '', Customer_Phone: p.Customer_Phone || '', Customer_Email: (p.Customer_Email || '').toLowerCase(), Default_Portal_Pass: 'SM-' + Math.floor(100000 + Math.random() * 900000), Device_Brand_Model: p.Device_Brand_Model || '', IMEI_Serial: p.IMEI_Serial || '', Repair_Type: p.Repair_Type || 'Hardware', Reported_Issue: p.Reported_Issue || '', Parts_Used_JSON: '[]', Parts_Cost: 0, Service_Charges: num(p.Service_Charges), Total_Amount: num(p.Service_Charges), Advance_Paid: num(p.Advance_Paid), Balance_Due: num(p.Service_Charges) - num(p.Advance_Paid), Assigned_Technician: p.Assigned_Technician || '', Current_Stage: 'Received', Customer_Comm_Status: 'Not Contacted', Internal_Notes: p.Internal_Notes || '', Last_Updated: todayISO() };
        DB.repairs.unshift(job);
        if (job.Customer_Phone && !DB.customers.some(x => x.Phone === job.Customer_Phone)) {
          DB.customers.push({ Customer_ID: 'CUS-' + (DB.seq.customer++), Name: job.Customer_Name || 'Customer', Phone: job.Customer_Phone, Email: job.Customer_Email || '', Reference_By: 'Auto (POS/Repair)', Photo_Drive_URL: '', Price_Tier: 'Retail', Monthly_Target: 0, Current_Month_Spend: 0, Fallback_Tier: 'Guest', Credit_Limit: 0, Current_Credit_Balance: 0, Payment_Due_Date: '', Status: 'Active' });
        }
        return { repair: Object.assign({}, job) };
      }
      case 'getRepairs': {
        let rows = DB.repairs.slice();
        if (p.Current_Stage) rows = rows.filter(r => r.Current_Stage === p.Current_Stage);
        if (p.search) { const q = String(p.search).toLowerCase(); rows = rows.filter(r => (r.Job_ID + ' ' + r.Customer_Name + ' ' + r.Customer_Phone + ' ' + r.Device_Brand_Model).toLowerCase().indexOf(q) > -1); }
        return { repairs: rows.map(r => Object.assign({}, r)) };
      }
      case 'updateRepair': {
        const job = findR(p.Job_ID);
        if (!job) throw new Error('Repair job not found: ' + p.Job_ID);
        Object.keys(p).forEach(k => { if (k !== 'Job_ID') job[k] = p[k]; });
        job.Last_Updated = todayISO();
        const parts = parseItems(job.Parts_Used_JSON);
        job.Parts_Cost = parts.reduce((s, x) => s + num(x.Line_Cost), 0);
        job.Total_Amount = job.Parts_Cost + num(job.Service_Charges);
        job.Balance_Due = job.Total_Amount - num(job.Advance_Paid);
        return { repair: Object.assign({}, job) };
      }
      case 'addRepairParts': {
        const job = findR(p.Job_ID);
        if (!job) throw new Error('Repair job not found: ' + p.Job_ID);
        const parts = parseItems(job.Parts_Used_JSON);
        (p.Items || []).forEach(it => {
          const prod = findP(it.Product_ID);
          if (!prod) throw new Error('Product not found: ' + it.Product_ID);
          if (num(prod.Stock_Qty) < num(it.Qty)) throw new Error('Not enough stock for part ' + it.Product_ID + '. Available: ' + prod.Stock_Qty);
          prod.Stock_Qty -= num(it.Qty);
          const ex = parts.find(x => x.Product_ID === it.Product_ID);
          if (ex) { ex.Qty += num(it.Qty); ex.Unit_Cost = num(prod.Cost_Price); ex.Line_Cost = ex.Qty * ex.Unit_Cost; }
          else parts.push({ Product_ID: prod.Product_ID, Model: prod.Model, Qty: num(it.Qty), Unit_Cost: num(prod.Cost_Price), Line_Cost: num(it.Qty) * num(prod.Cost_Price) });
        });
        job.Parts_Used_JSON = JSON.stringify(parts);
        if (p.Service_Charges !== undefined) job.Service_Charges = num(p.Service_Charges);
        job.Parts_Cost = parts.reduce((s, x) => s + num(x.Line_Cost), 0);
        job.Total_Amount = job.Parts_Cost + num(job.Service_Charges);
        job.Balance_Due = job.Total_Amount - num(job.Advance_Paid);
        job.Last_Updated = todayISO();
        return { repair: Object.assign({}, job) };
      }
      case 'recordRepairPayment': {
        const job = findR(p.Job_ID);
        if (!job) throw new Error('Repair job not found: ' + p.Job_ID);
        job.Advance_Paid = num(job.Advance_Paid) + num(p.Amount);
        job.Balance_Due = num(job.Total_Amount) - num(job.Advance_Paid);
        job.Last_Updated = todayISO();
        return { repair: Object.assign({}, job) };
      }
      case 'getLedger': {
        let rows = DB.ledger.slice();
        if (p.Party_Type) rows = rows.filter(e => e.Party_Type === p.Party_Type);
        if (p.Party_ID) rows = rows.filter(e => String(e.Party_ID) === String(p.Party_ID));
        return { entries: rows.map(e => Object.assign({}, e)), balance: p.Party_ID ? demoPartyBalance(p.Party_Type || 'Customer', p.Party_ID) : null };
      }
      case 'addLedgerEntry': return demoAddLedger(p.Party_Type, p.Party_ID, p.Type, p.Payment_Mode, num(p.Amount), p.Due_Date || '', p.Reference_Note || '');
      case 'addExpense': {
        const x = { Expense_ID: 'EXP-' + (DB.seq.expense++), Date: p.Date || todayISO(), Category: p.Category || 'Misc', Description: p.Description || '', Amount: num(p.Amount), Payment_Mode: p.Payment_Mode || 'Cash', Entered_By: 'demo' };
        DB.expenses.unshift(x);
        return { expense: Object.assign({}, x) };
      }
      case 'getExpenses': {
        let rows = DB.expenses.slice();
        if (p.thisMonthOnly) { const n = new Date(); rows = rows.filter(x => { const d = new Date(x.Date); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth(); }); }
        return { expenses: rows.map(x => Object.assign({}, x)) };
      }
      case 'getBanners': return { banners: DB.banners.filter(b => isTrue(b.Active_Status)).slice().sort((a, b) => num(a.Display_Order) - num(b.Display_Order)).map(b => Object.assign({}, b)) };
      case 'saveBanner': {
        if (p.Banner_ID) {
          const b = DB.banners.find(x => x.Banner_ID === p.Banner_ID);
          if (!b) throw new Error('Banner not found: ' + p.Banner_ID);
          Object.keys(p).forEach(k => { b[k] = p[k]; });
          return { banner: Object.assign({}, b) };
        }
        const b = Object.assign({}, p, { Banner_ID: 'BAN-' + (DB.seq.banner++) });
        DB.banners.push(b);
        return { banner: Object.assign({}, b) };
      }
      case 'deleteBanner': {
        DB.banners = DB.banners.filter(b => b.Banner_ID !== p.Banner_ID);
        return { Banner_ID: p.Banner_ID, deleted: true };
      }
      case 'getSettingsAll': {
        const out = {};
        Object.keys(DB.settings).forEach(g => { out[g] = DB.settings[g].map(x => Object.assign({}, x)); });
        return { settings: out };
      }
      case 'getSettingsPublic': {
        const out = {};
        Object.keys(DB.settings).forEach(g => { if (g !== 'Drive_Folder' && g !== 'System') out[g] = DB.settings[g].map(x => x.value); });
        return { settings: out };
      }
      case 'saveSetting': {
        const rows = DB.settings[p.Group] || (DB.settings[p.Group] = []);
        if (p.op === 'add') {
          if (rows.some(r => r.value === p.Value)) throw new Error('That value already exists in ' + p.Group + '.');
          rows.push({ value: p.Value, order: p.Display_Order !== undefined ? num(p.Display_Order) : rows.length + 1, notes: p.Notes || '' });
          return { added: p.Value };
        }
        if (p.op === 'rename') {
          const r = rows.find(x => x.value === p.Value);
          if (!r) throw new Error('Setting value not found: ' + p.Value);
          if (p.NewGroup) { const target = DB.settings[p.NewGroup] || (DB.settings[p.NewGroup] = []); DB.settings[p.Group] = rows.filter(x => x !== r); r.order = target.length + 1; target.push(r); }
          else if (p.NewValue) r.value = p.NewValue;
          return { renamed: p.Value };
        }
        if (p.op === 'delete') { DB.settings[p.Group] = rows.filter(x => x.value !== p.Value); return { deleted: p.Value }; }
        if (p.op === 'reorder') { (p.Values || []).forEach((v, i) => { const r = rows.find(x => x.value === v); if (r) r.order = i + 1; }); rows.sort((a, b) => a.order - b.order); return { reordered: p.Group, count: (p.Values || []).length }; }
        throw new Error('Unknown saveSetting op: ' + p.op);
      }
      case 'getWarrantyPending': {
        const now = new Date();
        const list = DB.products.filter(prod => {
          if (!isTrue(prod.Has_Warranty) || (prod.Check_Status || 'Pending') !== 'Pending') return false;
          const added = new Date(prod.Added_Date);
          if (isNaN(added)) return false;
          const expiry = new Date(added.getTime() + (num(prod.Warranty_Days) || 30) * 86400000);
          return Math.round((expiry - now) / 86400000) <= 7;
        });
        return { products: list.map(prod => { const o = Object.assign({}, prod); delete o.Cost_Price; return o; }) };
      }
      case 'markWarrantyChecked': {
        const prod = findP(p.Product_ID);
        if (!prod) throw new Error('Product not found: ' + p.Product_ID);
        prod.Check_Status = 'Checked';
        return { Product_ID: prod.Product_ID, Check_Status: 'Checked' };
      }
      case 'getInvoiceData': {
        if (p.type === 'repair') {
          const job = findR(p.id);
          if (!job) throw new Error('Repair job not found: ' + p.id);
          return { type: 'repair', shop: { name: 'Sulehri Mobile', currency: 'PKR' }, invoice: { Job_ID: job.Job_ID, Date: job.Date_Received, Customer_Name: job.Customer_Name, Customer_Phone: job.Customer_Phone, Customer_Email: job.Customer_Email, Device: job.Device_Brand_Model, IMEI_Serial: job.IMEI_Serial, Issue: job.Reported_Issue, Parts: parseItems(job.Parts_Used_JSON), Parts_Cost: num(job.Parts_Cost), Service_Charges: num(job.Service_Charges), Total_Amount: num(job.Total_Amount), Advance_Paid: num(job.Advance_Paid), Balance_Due: num(job.Balance_Due), Current_Stage: job.Current_Stage } };
        }
        const o = DB.orders.find(x => x.Order_ID === p.id);
        if (!o) throw new Error('Order not found: ' + p.id);
        const cust = o.Customer_ID ? findC(o.Customer_ID) : null;
        return { type: 'order', shop: { name: 'Sulehri Mobile', currency: 'PKR' }, invoice: { Order_ID: o.Order_ID, Date: o.Date, Sale_Channel: o.Sale_Channel, Customer: cust ? { Customer_ID: cust.Customer_ID, Name: cust.Name, Phone: cust.Phone, Email: cust.Email } : null, Items: parseItems(o.Items_JSON), Total_Amount: num(o.Total_Amount), Payment_Method: o.Payment_Method, Order_Status: o.Order_Status, Warranty_Expiry_Date: o.Warranty_Expiry_Date, Tracking_Notes: o.Tracking_Notes } };
      }
      case 'getUsers': return { users: DEMO_STAFF.map(u => { const o = Object.assign({}, u); delete o._pass; return o; }) };
      case 'saveUser': {
        if (p.Staff_ID) {
          const u = DEMO_STAFF.find(x => x.Staff_ID === p.Staff_ID);
          if (!u) throw new Error('Staff account not found: ' + p.Staff_ID);
          const staysOwner = p.Role === 'Owner' && (p.Active_Status === undefined ? u.Active_Status : isTrue(p.Active_Status));
          if (u.Role === 'Owner' && u.Active_Status && !staysOwner && DEMO_STAFF.filter(x => x.Role === 'Owner' && x.Active_Status).length <= 1) throw new Error('Cannot change this account: it is the last active Owner.');
          u.Name = p.Name; u.Email = String(p.Email).toLowerCase(); u.Role = p.Role;
          if (p.Active_Status !== undefined) u.Active_Status = isTrue(p.Active_Status);
          if (p.password) u._pass = String(p.password);
          const o = Object.assign({}, u); delete o._pass;
          return { user: o };
        }
        if (!p.password || String(p.password).length < 8) throw new Error('New staff accounts need a password of at least 8 characters.');
        const u = { Staff_ID: 'STF-' + (DB.seq.staff++), Name: p.Name, Email: String(p.Email).toLowerCase(), Role: p.Role, Active_Status: p.Active_Status === undefined ? true : isTrue(p.Active_Status), _pass: String(p.password) };
        DEMO_STAFF.push(u);
        const o = Object.assign({}, u); delete o._pass;
        return { user: o };
      }
      case 'deleteUser': {
        const u = DEMO_STAFF.find(x => x.Staff_ID === p.Staff_ID);
        if (!u) throw new Error('Staff account not found: ' + p.Staff_ID);
        if (u.Role === 'Owner' && u.Active_Status && DEMO_STAFF.filter(x => x.Role === 'Owner' && x.Active_Status).length <= 1) throw new Error('Cannot deactivate the last active Owner.');
        u.Active_Status = false;
        return { Staff_ID: u.Staff_ID, Active_Status: false };
      }
      default: throw new Error('Unknown action in demo: ' + action);
    }
  });
}

/* ========================= 6. AUTH / SHELL ============================== */
function applyListsFromSettings(settings) {
  // getSettingsAll shape: {Group:[{value,order,notes}]}; public shape: {Group:[values]}
  const lists = JSON.parse(JSON.stringify(FALLBACK_LISTS));
  Object.keys(settings || {}).forEach(g => {
    const arr = settings[g];
    if (!Array.isArray(arr) || !arr.length) return;
    const values = arr.map(x => (x && typeof x === 'object') ? x.value : x);
    if (g === 'Repair_Stage') lists.Current_Stage = values;
    if (lists[g]) lists[g] = values;
    else lists[g] = values;
  });
  state.lists = lists;
  state.lists.Current_Stage = lists.Repair_Stage || lists.Current_Stage;
}
async function loadSettings() {
  try {
    if (can('getSettingsAll')) {
      const d = await api('getSettingsAll');
      state.settingsAll = d.settings || {};
      applyListsFromSettings(state.settingsAll);
    } else {
      const d = await api('getSettingsPublic');
      applyListsFromSettings(d.settings || {});
    }
  } catch (e) { /* fall back to built-in lists */ }
  fillStaticSelects();
}
function visibleModules() {
  if (!state.user) return [];
  return MODULES.filter(m => m.roles.indexOf(state.user.Role) > -1);
}
function buildNav() {
  const nav = $('navList');
  nav.innerHTML = visibleModules().map(m =>
    '<button type="button" class="nav-item' + (state.module === m.id ? ' active' : '') +
    '" data-module="' + m.id + '">' + m.icon + ' ' + esc(m.label) + '</button>').join('');
  nav.querySelectorAll('[data-module]').forEach(b =>
    b.addEventListener('click', () => { showModule(b.getAttribute('data-module')); closeSidebarMobile(); }));
}
function showModule(id) {
  const mod = MODULES.find(m => m.id === id);
  if (!mod || !state.user || mod.roles.indexOf(state.user.Role) === -1) {
    const first = visibleModules()[0];
    if (first && first.id !== id) { showModule(first.id); }
    return;
  }
  state.module = id;
  MODULES.forEach(m => { const el = $('mod-' + m.id); if (el) el.hidden = m.id !== id; });
  const knSec = $('module-khata-new');
  if (knSec) knSec.hidden = true;
  $('topbarTitle').textContent = mod.label;
  buildNav();
  const loaders = {
    dashboard: loadDashboard, pos: loadPOS, inventory: loadInventory,
    purchases: loadPurchases, orders: loadOrders, returns: loadReturns,
    repairs: loadRepairs, customers: loadCustomers, ledger: loadLedgerModule,
    expenses: loadExpenses, pnl: loadPnL, banners: loadBanners,
    warranty: loadWarranty, settings: loadSettingsModule, users: loadUsers
  };
  if (loaders[id]) loaders[id]();
}
function closeSidebarMobile() {
  $('sidebar').classList.remove('open');
  $('sidebarBackdrop').hidden = true;
}
async function enterPanel() {
  $('loginView').hidden = true;
  $('panelView').hidden = false;
  $('userChipName').textContent = state.user.Name || state.user.Email;
  $('userChipRole').textContent = state.user.Role;
  $('userAvatar').textContent = (state.user.Name || '?').trim().charAt(0).toUpperCase() || '?';
  $('demoBadgeSide').hidden = !DEMO_MODE;
  await loadSettings();
  const first = visibleModules()[0];
  showModule(state.user.Role === 'Technician' ? 'repairs' : (first ? first.id : 'dashboard'));
}
function doLogout(silent) {
  if (!silent && state.token) { api('logout').catch(() => {}); }
  state.token = ''; state.user = null;
  try { localStorage.removeItem('sm_admin_token'); localStorage.removeItem('sm_admin_user'); } catch (e) {}
  $('panelView').hidden = true;
  $('loginView').hidden = false;
}
async function handleLogin(ev) {
  ev.preventDefault();
  const errBox = $('loginError');
  errBox.hidden = true;
  try {
    const d = await api('staffLogin', { email: $('loginEmail').value.trim(), password: $('loginPassword').value });
    state.token = d.token;
    state.user = d.user;
    try {
      localStorage.setItem('sm_admin_token', d.token);
      localStorage.setItem('sm_admin_user', JSON.stringify(d.user));
    } catch (e) {}
    $('loginPassword').value = '';
    toast('Welcome, ' + (d.user.Name || '') + ' (' + d.user.Role + ')', 'success');
    enterPanel();
  } catch (e) {
    errBox.textContent = e.message;
    errBox.hidden = false;
  }
}

/* ========================== 7. DASHBOARD ================================ */
function statCard(label, value, cls) {
  return '<div class="stat-card' + (cls ? ' ' + cls : '') + '"><div class="stat-label">' +
    esc(label) + '</div><div class="stat-value">' + esc(value) + '</div></div>';
}
function pnlCards(p, prefix) {
  return statCard(prefix + ' Sales', money(p.Sales)) +
    statCard(prefix + ' Repair Income', money(p.Repair_Income)) +
    statCard(prefix + ' Expenses', money(p.Total_Expenses), 'warn') +
    statCard(prefix + ' Net Profit', money(p.Net_Profit), 'profit') +
    statCard(prefix + ' Cash in Hand', money(p.Cash)) +
    statCard(prefix + ' Bank', money(p.Bank)) +
    statCard(prefix + ' Wallet (EasyPaisa/JazzCash)', money(p.Wallet));
}
/* Dashboard ke do bare summary boxes: ek Aaj ka, ek Maah + Kul Jama ka.
   Har row: label bayein, value dayein, neeche divider line. */
function sumRow_(label, value, cls) {
  return '<div class="sum-row"><span class="sum-label">' + esc(label) +
    '</span><b class="sum-val' + (cls ? ' ' + cls : '') + '">' + esc(value) + '</b></div>';
}
function sumCard_(title, rowsHtml) {
  return '<div class="sum-card"><h3>' + esc(title) + '</h3>' + rowsHtml + '</div>';
}
async function loadDashboard() {
  if (!can('getDashboard')) return;
  try {
    const d = await api('getDashboard');
    state.pnl = d;
    const t = d.today || {}, m = d.thisMonth || {};
    const npCls = v => num(v) >= 0 ? 'lime' : 'red';
    $('dashCards').innerHTML =
      sumCard_('📅 Aaj ka Status — Today',
        sumRow_('Sales', money(t.Sales)) +
        sumRow_('Repair Income', money(t.Repair_Income)) +
        sumRow_('Expenses', money(t.Total_Expenses), 'red') +
        sumRow_('Net Profit', money(t.Net_Profit), npCls(t.Net_Profit)) +
        sumRow_('Cash in Hand', money(t.Cash)) +
        sumRow_('Bank', money(t.Bank)) +
        sumRow_('Wallet (EasyPaisa/JazzCash)', money(t.Wallet))) +
      sumCard_('🗓️ Is Maah — Month & Kul Jama',
        sumRow_('Month Sales', money(m.Sales)) +
        sumRow_('Repair Income', money(m.Repair_Income)) +
        sumRow_('Expenses', money(m.Total_Expenses), 'red') +
        sumRow_('Net Profit', money(m.Net_Profit), npCls(m.Net_Profit)) +
        sumRow_('Cash in Hand', money(m.Cash)) +
        sumRow_('Bank', money(m.Bank)) +
        sumRow_('Wallet (EasyPaisa/JazzCash)', money(m.Wallet)) +
        '<div class="sum-divider"></div>' +
        sumRow_('Total Receivables (customers owe us)', money(d.Total_Receivables), 'warn') +
        sumRow_('Total Payables (we owe suppliers)', money(d.Total_Payables), 'warn'));
  } catch (e) { toast(e.message, 'error'); }
  loadDashboardCharts();
  try {
    const pd = await api('getProducts', { lowStockOnly: true });
    const low = realProducts_(pd.products);
    state.products = state.products.length ? state.products : low;
    $('dashLowStock').innerHTML = low.length ? productTable(low, { compact: true }) :
      '<p class="empty-msg">🎉 Nothing is low on stock.</p>';
  } catch (e) { /* dashboard numbers already shown */ }
}
/* ================= DASHBOARD CHARTS (hand-made SVG) ================= */
let customerPhotoData = null;

function dayKey_(v) {
  if (v === null || v === undefined || v === '') return '';
  const d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d.getTime())) {
    const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[1] + '-' + m[2] + '-' + m[3] : '';
  }
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function lastDays_(n) {
  const out = []; const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push(dayKey_(d));
  }
  return out;
}
function shortMoney_(v) {
  v = num(v);
  if (Math.abs(v) >= 1000) return 'Rs ' + (v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1) + 'k';
  return 'Rs ' + Math.round(v);
}
function chartCard_(title, svg, legendHtml) {
  return '<div class="chart-card"><h3>' + title + '</h3>' + svg + (legendHtml || '') + '</div>';
}
function lineChartSVG_(labels, values, color) {
  const W = 560, H = 190, P = 34;
  const max = Math.max.apply(null, values.concat([1])) * 1.15;
  const stepX = (W - P * 2) / Math.max(1, values.length - 1);
  const y = v => H - P - (v / max) * (H - P * 2);
  const pts = values.map((v, i) => [P + i * stepX, y(v)]);
  const line = pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
  const area = 'M' + pts[0][0].toFixed(1) + ',' + (H - P) + ' L' +
    pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L') +
    ' L' + pts[pts.length - 1][0].toFixed(1) + ',' + (H - P) + ' Z';
  let dots = '', labs = '';
  pts.forEach((p, i) => {
    dots += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.5" fill="' + color + '"><title>' + labels[i] + ': ' + money(values[i]) + '</title></circle>';
    if (i % 2 === 0 || i === values.length - 1) labs += '<text x="' + p[0].toFixed(1) + '" y="' + (H - 8) + '" class="ch-axis">' + labels[i] + '</text>';
  });
  const maxI = values.indexOf(Math.max.apply(null, values));
  const peak = values[maxI] > 0 ? '<text x="' + pts[maxI][0].toFixed(1) + '" y="' + (pts[maxI][1] - 9).toFixed(1) + '" class="ch-val">' + shortMoney_(values[maxI]) + '</text>' : '';
  let grid = '';
  [0.25, 0.5, 0.75, 1].forEach(f => {
    const gy = (H - P - f * (H - P * 2)).toFixed(1);
    grid += '<line x1="' + P + '" y1="' + gy + '" x2="' + (W - P) + '" y2="' + gy + '" stroke="#262A30" stroke-width="1"/>';
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart-svg" role="img">' + grid + '<path d="' + area + '" fill="' + color + '" opacity="0.12"/><polyline points="' + line + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' + dots + peak + labs + '</svg>';
}
function candleChartSVG_(days) {
  const W = 560, H = 190, P = 34;
  let max = 0, min = Infinity;
  days.forEach(d => { max = Math.max(max, d.high); min = Math.min(min, d.low); });
  if (!isFinite(min)) min = 0;
  max = (max * 1.1) || 1; min = Math.min(0, min);
  const range = (max - min) || 1;
  const y = v => H - P - ((v - min) / range) * (H - P * 2);
  const stepX = (W - P * 2) / Math.max(1, days.length);
  const bw = Math.min(16, stepX * 0.5);
  let s = '';
  days.forEach((d, i) => {
    const cx = P + stepX * i + stepX / 2;
    const col = d.close >= d.open ? '#B9F638' : '#F87171';
    const top = y(Math.max(d.open, d.close)), bot = y(Math.min(d.open, d.close));
    s += '<line x1="' + cx.toFixed(1) + '" y1="' + y(d.high).toFixed(1) + '" x2="' + cx.toFixed(1) + '" y2="' + y(d.low).toFixed(1) + '" stroke="' + col + '" stroke-width="1.6"/>' +
      '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(2, bot - top).toFixed(1) + '" rx="2" fill="' + col + '"><title>' + d.label + ' — Sales ' + money(d.close) + ' (sab se bara order ' + money(d.high) + ')</title></rect>';
    if (i % 2 === 0) s += '<text x="' + cx.toFixed(1) + '" y="' + (H - 8) + '" class="ch-axis">' + d.label + '</text>';
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart-svg" role="img">' + s + '</svg>';
}
function donutSVG_(parts) {
  const total = parts.reduce((a, p) => a + Math.max(0, num(p.value)), 0);
  const R = 62, C = 2 * Math.PI * R;
  let off = 0, segs = '';
  if (total > 0) {
    parts.forEach(p => {
      const frac = Math.max(0, num(p.value)) / total;
      segs += '<circle cx="90" cy="90" r="' + R + '" fill="none" stroke="' + p.color + '" stroke-width="26" stroke-dasharray="' + (frac * C).toFixed(1) + ' ' + C.toFixed(1) + '" stroke-dashoffset="' + (-off * C).toFixed(1) + '" transform="rotate(-90 90 90)"><title>' + esc(p.label) + ': ' + money(p.value) + '</title></circle>';
      off += frac;
    });
  } else {
    segs = '<circle cx="90" cy="90" r="' + R + '" fill="none" stroke="#2A2E35" stroke-width="26"/>';
  }
  const legend = '<div class="ch-legend">' + parts.map(p =>
    '<div><span class="ch-dot" style="background:' + p.color + '"></span>' + esc(p.label) + ' — <b>' + money(p.value) + '</b></div>').join('') + '</div>';
  const svg = '<svg viewBox="0 0 180 180" class="chart-svg donut" role="img">' + segs +
    '<text x="90" y="86" class="ch-center">Total</text><text x="90" y="108" class="ch-center-val">' + shortMoney_(total) + '</text></svg>';
  return { svg: svg, legend: legend };
}
function barChartSVG_(labels, a, b) {
  const W = 560, H = 190, P = 34;
  const max = Math.max.apply(null, a.concat(b).concat([1])) * 1.15;
  const y = v => H - P - (v / max) * (H - P * 2);
  const stepX = (W - P * 2) / labels.length;
  const bw = Math.min(20, stepX * 0.28);
  let s = '';
  [0.25, 0.5, 0.75, 1].forEach(f => {
    const gy = (H - P - f * (H - P * 2)).toFixed(1);
    s += '<line x1="' + P + '" y1="' + gy + '" x2="' + (W - P) + '" y2="' + gy + '" stroke="#262A30" stroke-width="1"/>';
  });
  labels.forEach((lb, i) => {
    const cx = P + stepX * i + stepX / 2;
    s += '<rect x="' + (cx - bw - 2).toFixed(1) + '" y="' + y(a[i]).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (H - P - y(a[i])).toFixed(1) + '" rx="4" fill="#B9F638"><title>Income ' + lb + ': ' + money(a[i]) + '</title></rect>' +
      '<rect x="' + (cx + 2).toFixed(1) + '" y="' + y(b[i]).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (H - P - y(b[i])).toFixed(1) + '" rx="4" fill="#525866"><title>Expenses ' + lb + ': ' + money(b[i]) + '</title></rect>' +
      '<text x="' + cx.toFixed(1) + '" y="' + (H - 8) + '" class="ch-axis">' + lb + '</text>' +
      (a[i] > 0 ? '<text x="' + (cx - bw / 2 - 2).toFixed(1) + '" y="' + (y(a[i]) - 5).toFixed(1) + '" class="ch-val-sm">' + shortMoney_(a[i]) + '</text>' : '');
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart-svg" role="img">' + s + '</svg>';
}
let dashCache = null;
let dashPeriod = 'daily';
let dashPeriodWired = false;

async function loadDashboardCharts() {
  const wrap = $('dashCharts');
  if (!wrap) return;
  try {
    const results = await Promise.all([
      api('getOrders', {}).catch(() => ({ orders: [] })),
      api('getRepairs', {}).catch(() => ({ repairs: [] })),
      can('getExpenses') ? api('getExpenses', {}).catch(() => ({ expenses: [] })) : Promise.resolve({ expenses: [] })
    ]);
    dashCache = {
      orders: (results[0].orders || []).filter(o => String(o.Order_Status) !== 'Cancelled'),
      repairs: (results[1].repairs || []).filter(r => String(r.Current_Stage) !== 'Unrepairable'),
      expenses: results[2].expenses || []
    };
  } catch (e) { if (!dashCache) { wrap.innerHTML = ''; return; } }
  wireDashPeriod_();
  renderDashCharts(dashPeriod);
}
function wireDashPeriod_() {
  if (dashPeriodWired) return;
  const sw = $('dashPeriodSwitch');
  if (!sw) return;
  dashPeriodWired = true;
  sw.querySelectorAll('[data-period]').forEach(b => b.addEventListener('click', () => {
    dashPeriod = b.getAttribute('data-period');
    sw.querySelectorAll('[data-period]').forEach(x => x.classList.toggle('active', x === b));
    renderDashCharts(dashPeriod);
  }));
}
function fmtDay_(key) {
  const p = String(key).split('-');
  const d = new Date(num(p[0]), num(p[1]) - 1, num(p[2]));
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function monthName_(key) {
  const p = String(key).split('-');
  const d = new Date(num(p[0]), num(p[1]) - 1, 1);
  return d.toLocaleString('en', { month: 'short', year: 'numeric' });
}
function renderDashCharts(period) {
  const wrap = $('dashCharts');
  if (!wrap || !dashCache) return;
  const orders = dashCache.orders, repairs = dashCache.repairs, expenses = dashCache.expenses;
  const nowD = new Date();
  let buckets = [];
  if (period === 'monthly') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(nowD.getFullYear(), nowD.getMonth() - i, 1);
      buckets.push({ key: dayKey_(d).slice(0, 7), label: d.toLocaleString('en', { month: 'short' }) + ' ' + String(d.getFullYear()).slice(2) });
    }
  } else if (period === 'yearly') {
    const yrs = {};
    orders.forEach(o => { const y = dayKey_(o.Date).slice(0, 4); if (y) yrs[y] = 1; });
    repairs.forEach(r => { const y = dayKey_(r.Date_Received).slice(0, 4); if (y) yrs[y] = 1; });
    expenses.forEach(x => { const y = dayKey_(x.Date).slice(0, 4); if (y) yrs[y] = 1; });
    let keys = Object.keys(yrs).sort();
    if (!keys.length) keys = [String(nowD.getFullYear())];
    buckets = keys.map(y => ({ key: y, label: y }));
  } else {
    buckets = lastDays_(14).map(k => ({ key: k, label: k.slice(5) }));
  }
  const inBucket = (v, key) => {
    const dk = dayKey_(v); if (!dk) return false;
    if (period === 'daily') return dk === key;
    if (period === 'monthly') return dk.slice(0, 7) === key;
    return dk.slice(0, 4) === key;
  };
  const sales = [], largest = [], repInc = [], expVals = [];
  buckets.forEach(b => {
    let s = 0, lg = 0, rp = 0, ex = 0;
    orders.forEach(o => { if (inBucket(o.Date, b.key)) { const t = num(o.Total_Amount); s += t; lg = Math.max(lg, t); } });
    repairs.forEach(r => { if (inBucket(r.Date_Received, b.key)) rp += num(r.Total_Amount); });
    expenses.forEach(x => { if (inBucket(x.Date, b.key)) ex += num(x.Amount); });
    sales.push(s); largest.push(lg); repInc.push(rp); expVals.push(ex);
  });
  const labels = buckets.map(b => b.label);
  const candles = buckets.map((b, i) => {
    const close = sales[i];
    const open = i ? sales[i - 1] : close;
    return { label: b.label, open: open, close: close, high: Math.max(open, close, largest[i]), low: Math.min(open, close) };
  });
  const donut = donutSVG_([
    { label: 'Sales', value: sales.reduce((a, v) => a + v, 0), color: '#B9F638' },
    { label: 'Repair Income', value: repInc.reduce((a, v) => a + v, 0), color: '#E5E7EB' },
    { label: 'Expenses', value: expVals.reduce((a, v) => a + v, 0), color: '#F87171' }
  ]);
  const lineTitle = period === 'monthly' ? '📈 Sales — Mahana (Last 12 Months)' :
    period === 'yearly' ? '📈 Sales — Salana (Year Wise)' : '📈 Sales — Rozana (Last 14 Days)';
  wrap.innerHTML =
    chartCard_(lineTitle, lineChartSVG_(labels, sales, '#B9F638')) +
    chartCard_('🕯️ Sales Candles (wick = sab se bara order)', candleChartSVG_(candles)) +
    chartCard_('🍩 Kul Arsa — Paisa Kahan Se / Kahan Gaya', donut.svg, donut.legend) +
    chartCard_('📊 Income vs Expenses', barChartSVG_(labels, sales.map((s, i) => s + repInc[i]), expVals),
      '<div class="ch-legend"><div><span class="ch-dot" style="background:#B9F638"></span>Income</div><div><span class="ch-dot" style="background:#525866"></span>Expenses</div></div>');
  const note = $('dashPeriodNote');
  if (note && buckets.length) {
    if (period === 'daily') note.textContent = 'Report: ' + fmtDay_(buckets[0].key) + ' → ' + fmtDay_(buckets[buckets.length - 1].key);
    else if (period === 'monthly') note.textContent = 'Report: ' + monthName_(buckets[0].key) + ' → ' + monthName_(buckets[buckets.length - 1].key);
    else note.textContent = buckets.length > 1 ? 'Report: ' + buckets[0].key + ' → ' + buckets[buckets.length - 1].key : 'Report: ' + buckets[0].key;
  }
}

/* ---------- Customer photo helpers ---------- */
function driveThumb_(url) {
  url = String(url || '');
  if (!url) return '';
  const m = url.match(/\/d\/([A-Za-z0-9_-]+)/) || url.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w96';
  return url;
}
function custAvatar_(c) {
  const t = driveThumb_(c.Photo_Drive_URL);
  if (t) return '<img class="cust-avatar" src="' + esc(t) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
  return '<span class="cust-avatar cust-initial">' + esc((c.Name || '?').trim().charAt(0).toUpperCase() || '?') + '</span>';
}

function productTable(products, opts) {
  opts = opts || {};
  const showCost = products.some(p => p.Cost_Price !== undefined);
  let h = '<table><thead><tr><th>ID</th><th>Product</th><th>Category</th><th>Stock</th>' +
    (showCost ? '<th>Cost</th>' : '') + '<th>Guest</th><th>Retail</th><th>Wholesale</th><th>Business</th>' +
    (opts.compact ? '' : '<th>Website</th><th>Actions</th>') + '</tr></thead><tbody>';
  products.forEach(p => {
    const low = num(p.Stock_Qty) <= num(p.Min_Stock_Alert);
    h += '<tr' + (low ? ' class="low-stock"' : '') + '><td>' + esc(p.Product_ID) + '</td>' +
      '<td class="wrap"><b>' + esc(productName(p)) + '</b>' + (p.IMEI_Serial ? '<br><span class="small muted">IMEI: ' + esc(p.IMEI_Serial) + '</span>' : '') + '</td>' +
      '<td>' + esc(p.Main_Category) + ' / ' + esc(p.Sub_Category) + '</td>' +
      '<td>' + (low ? '⚠️ ' : '') + num(p.Stock_Qty) + ' <span class="muted">(min ' + num(p.Min_Stock_Alert) + ')</span></td>' +
      (showCost ? '<td>' + (p.Cost_Price !== undefined ? money(p.Cost_Price) : '—') + '</td>' : '') +
      '<td>' + money(p.Price_Guest) + '</td><td>' + money(p.Price_Retail) + '</td>' +
      '<td>' + money(p.Price_Wholesale) + '</td><td>' + money(p.Price_Business) + '</td>';
    if (!opts.compact) {
      h += '<td>' + (isTrue(p.Show_On_Website) ? '✅' : '—') + '</td><td><span class="btn-row">' +
        (can('adjustStock') ? '<button type="button" class="btn btn-ghost btn-sm" data-adj="' + esc(p.Product_ID) + '" data-delta="-1">−1</button><button type="button" class="btn btn-ghost btn-sm" data-adj="' + esc(p.Product_ID) + '" data-delta="1">+1</button>' : '') +
        (can('updateProduct') ? '<button type="button" class="btn btn-ghost btn-sm" data-edit-product="' + esc(p.Product_ID) + '">Edit</button>' : '') +
        (can('deleteProduct') ? '<button type="button" class="btn btn-danger btn-sm" data-del-product="' + esc(p.Product_ID) + '">Delete</button>' : '') +
        '</span></td>';
    }
    h += '</tr>';
  });
  return h + '</tbody></table>';
}

/* ========================== 8. POS BILLING ============================== */
let posLoaded = false;
async function loadPOS() {
  fillSelectCoded($('posPayment'), 'Payment_Method', state.lists.Payment_Method, 'Cash', false);
  try { const d = await api('getProducts'); state.products = realProducts_(d.products); } catch (e) { toast(e.message, 'error'); }
  if (can('getCustomers')) {
    try {
      const cd = await api('getCustomers');
      state.customers = cd.customers || [];
    } catch (e) { /* picker stays guest-only */ }
  }
  renderPosCustomerOptions();
  renderPosLines();
  posLoaded = true;
  setTimeout(() => { const s = $('posScan'); if (s) s.focus(); }, 60);
}
function renderPosCustomerOptions() {
  const sel = $('posCustomerSel');
  const canPick = can('getCustomers');
  sel.innerHTML = '<option value="">🚶 Walk-in Guest (Guest prices)</option>' +
    (canPick ? state.customers.filter(c => c.Status !== 'Inactive').map(c =>
      '<option value="' + esc(c.Customer_ID) + '"' + (state.posCustomerId === c.Customer_ID ? ' selected' : '') + '>' +
      esc(c.Name) + ' — ' + esc(c.Phone) + ' (' + esc(c.Price_Tier) + ')</option>').join('') : '');
  sel.disabled = false;
  updatePosCustomerInfo();
}
function posTier() {
  const c = customerById(state.posCustomerId);
  return c ? (c.Price_Tier || 'Guest') : 'Guest';
}
function posUnitPrice(p) {
  const tier = posTier();
  return num(p['Price_' + tier] !== undefined ? p['Price_' + tier] : p.Price_Guest);
}
function updatePosCustomerInfo() {
  const c = customerById(state.posCustomerId);
  const gf = $('posGuestFields');
  if (gf) gf.hidden = !!c;
  const info = $('posCustomerInfo');
  if (!c) { info.textContent = 'Walk-in guest: Guest prices apply. Credit is not available for guests.'; return; }
  info.textContent = 'Tier: ' + c.Price_Tier + ' • Credit limit ' + money(c.Credit_Limit) +
    ' • Balance owed ' + money(c.Current_Credit_Balance) + ' • Month spend ' + money(c.Current_Month_Spend) +
    (c.Monthly_Target ? ' / target ' + money(c.Monthly_Target) : '');
}
function posAddProduct(id, qty) {
  const p = productById(id);
  if (!p) { toast('Product not found: ' + id, 'error'); return; }
  if (num(p.Stock_Qty) <= 0) { toast('Out of stock: ' + productName(p), 'error'); return; }
  const line = state.posLines.find(l => l.Product_ID === p.Product_ID);
  if (line) line.Qty = Math.min(num(p.Stock_Qty), line.Qty + (qty || 1));
  else state.posLines.push({ Product_ID: p.Product_ID, Qty: qty || 1 });
  renderPosLines();
}
function renderPosLines() {
  const wrap = $('posLines');
  if (!state.posLines.length) {
    wrap.innerHTML = '<p class="empty-msg">Bill is empty — scan or search a product.</p>';
  } else {
    wrap.innerHTML = state.posLines.map((l, i) => {
      const p = productById(l.Product_ID) || {};
      const unit = posUnitPrice(p);
      return '<div class="pos-line"><span><b>' + esc(productName(p)) + '</b><br><span class="small muted">' +
        esc(l.Product_ID) + ' • ' + money(unit) + ' each • stock ' + num(p.Stock_Qty) + '</span></span>' +
        '<input class="qty-input" type="number" min="1" value="' + l.Qty + '" data-pos-qty="' + i + '" aria-label="Quantity">' +
        '<b>' + money(unit * l.Qty) + '</b>' +
        '<button type="button" class="btn btn-danger btn-sm" data-pos-remove="' + i + '" aria-label="Remove">✕</button></div>';
    }).join('');
    wrap.querySelectorAll('[data-pos-qty]').forEach(inp => inp.addEventListener('change', () => {
      const i = num(inp.getAttribute('data-pos-qty'));
      state.posLines[i].Qty = Math.max(1, parseInt(inp.value, 10) || 1);
      renderPosLines();
    }));
    wrap.querySelectorAll('[data-pos-remove]').forEach(b => b.addEventListener('click', () => {
      state.posLines.splice(num(b.getAttribute('data-pos-remove')), 1);
      renderPosLines();
    }));
  }
  const total = state.posLines.reduce((s, l) => {
    const p = productById(l.Product_ID);
    return s + (p ? posUnitPrice(p) * l.Qty : 0);
  }, 0);
  $('posTotal').textContent = money(total);
}
function handlePosScanInput() {
  const q = $('posScan').value.trim();
  const box = $('posSearchResults');
  if (!q) { box.innerHTML = ''; return; }
  const ql = q.toLowerCase();
  const matches = state.products.filter(p =>
    (p.Product_ID + ' ' + p.Brand + ' ' + p.Model + ' ' + p.IMEI_Serial + ' ' + p.Sub_Category).toLowerCase().indexOf(ql) > -1
  ).slice(0, 8);
  box.innerHTML = matches.map(p =>
    '<button type="button" class="search-result" data-pos-add="' + esc(p.Product_ID) + '"><span class="grow"><b>' +
    esc(productName(p)) + '</b><br><span class="small muted">' + esc(p.Product_ID) +
    (p.IMEI_Serial ? ' • IMEI ' + esc(p.IMEI_Serial) : '') + ' • stock ' + num(p.Stock_Qty) + '</span></span><b>' +
    money(posUnitPrice(p)) + '</b></button>').join('');
  box.querySelectorAll('[data-pos-add]').forEach(b => b.addEventListener('click', () => {
    posAddProduct(b.getAttribute('data-pos-add'), 1);
    $('posScan').value = ''; box.innerHTML = ''; $('posScan').focus();
  }));
}
function handlePosScanEnter(ev) {
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  const q = $('posScan').value.trim();
  if (!q) return;
  // Exact Product_ID or IMEI match = what a USB scanner sends.
  const exact = state.products.find(p =>
    String(p.Product_ID).toLowerCase() === q.toLowerCase() ||
    (p.IMEI_Serial && String(p.IMEI_Serial).toLowerCase() === q.toLowerCase()));
  if (exact) {
    posAddProduct(exact.Product_ID, 1);
    $('posScan').value = ''; $('posSearchResults').innerHTML = '';
  } else {
    const box = $('posSearchResults');
    const first = box.querySelector('[data-pos-add]');
    if (first) first.click();
    else toast('No product matches "' + q + '"', 'error');
  }
  $('posScan').focus();
}
let cameraStream = null, cameraTimer = null;
async function startCameraScan() {
  const msg = $('posCameraMsg');
  stopCameraScan();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    msg.textContent = 'Camera is not available on this device/browser — use the search box or a USB scanner.';
    return;
  }
  if (!('BarcodeDetector' in window)) {
    msg.textContent = 'This browser has no built-in barcode reader (BarcodeDetector). Camera scanning works in Chrome on Android — otherwise use the search box or a USB scanner.';
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = $('posVideo');
    video.srcObject = cameraStream;
    $('posCameraWrap').hidden = false;
    await video.play();
    const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'code_39'] });
    msg.textContent = 'Point the camera at the barcode / QR code…';
    cameraTimer = setInterval(async () => {
      try {
        const codes = await detector.detect(video);
        if (codes && codes.length) {
          const raw = codes[0].rawValue || '';
          stopCameraScan();
          $('posScan').value = raw;
          handlePosScanEnter({ key: 'Enter', preventDefault: () => {} });
        }
      } catch (e) { /* keep scanning */ }
    }, 450);
  } catch (e) {
    msg.textContent = 'Camera permission was not granted — use the search box or a USB scanner.';
  }
}
function stopCameraScan() {
  if (cameraTimer) { clearInterval(cameraTimer); cameraTimer = null; }
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  const wrap = $('posCameraWrap'); if (wrap) wrap.hidden = true;
}
async function posCheckout() {
  const errBox = $('posError');
  errBox.hidden = true;
  $('posSuccess').hidden = true;
  if (!state.posLines.length) { errBox.textContent = 'Add at least one product to the bill first.'; errBox.hidden = false; return; }
  const payload = {
    Sale_Channel: 'Walk-in POS',
    Customer_ID: state.posCustomerId || '',
    Items: state.posLines.map(l => ({ Product_ID: l.Product_ID, Qty: l.Qty })),
    Payment_Method: $('posPayment').value,
    Tracking_Notes: $('posNotes').value.trim()
  };
  if (payload.Payment_Method === 'Credit' && $('posDueDate').value) payload.Payment_Due_Date = $('posDueDate').value;
  if (!state.posCustomerId) {
    const gPhone = $('posGuestPhone').value.trim();
    if (gPhone) { payload.Customer_Phone = gPhone; payload.Customer_Name = $('posGuestName').value.trim(); }
  }
  // Form resets immediately for the next customer; the queue saves in order.
  const linesSnapshot = state.posLines.slice();
  state.posLines = [];
  renderPosLines();
  try {
    const d = await queueWrite('createOrder', payload);
    const order = d.order || {};
    const success = $('posSuccess');
    success.innerHTML = '✅ Sale complete — <b>' + esc(order.Order_ID || '') + '</b> • Total ' + money(order.Total_Amount) +
      ' • Tier ' + esc(d.tier || posTier()) + '<div class="btn-row" style="margin-top:.5rem">' +
      '<button type="button" class="btn btn-primary btn-sm" id="posPrintBtn">🖨️ Print Invoice</button>' +
      '<button type="button" class="btn btn-whatsapp btn-sm" id="posWaBtn">📱 WhatsApp Invoice</button></div>';
    success.hidden = false;
    const pb = document.getElementById('posPrintBtn');
    if (pb) pb.addEventListener('click', () => showInvoice('order', order.Order_ID));
    const wb = document.getElementById('posWaBtn');
    if (wb) wb.addEventListener('click', () => {
      const c = customerById(state.posCustomerId);
      const text = invoiceWaText('order', order, c);
      window.open(waLink(c ? c.Phone : '', text), '_blank');
    });
    // Guest auto-customer ban gaya ho to list refresh + fields saaf.
    if (payload.Customer_Phone) {
      $('posGuestName').value = ''; $('posGuestPhone').value = '';
      if (can('getCustomers')) {
        try { const cd = await api('getCustomers'); state.customers = cd.customers || []; renderPosCustomerOptions(); } catch (e) {}
      }
    }
    // Refresh stock quietly so the next bill sees fresh quantities.
    api('getProducts').then(pd => { state.products = pd.products ? realProducts_(pd.products) : state.products; }).catch(() => {});
    $('posScan').focus();
  } catch (e) {
    // Restore the bill so the sale can be fixed and retried.
    state.posLines = linesSnapshot;
    renderPosLines();
    errBox.textContent = e.message; // backend credit-limit text shows verbatim
    errBox.hidden = false;
  }
}

/* ========================== 9. INVENTORY ================================ */
async function loadInventory() {
  fillSelectCoded($('invCategory'), 'Main_Category', [''].concat(state.lists.Main_Category), $('invCategory').value || '', false);
  $('invCategory').options[0].textContent = 'All Categories';
  try {
    const d = await api('getProducts', {
      search: $('invSearch').value.trim(),
      category: $('invCategory').value,
      lowStockOnly: $('invLowOnly').checked
    });
    state.products = realProducts_(d.products);
    const wrap = $('invTableWrap');
    wrap.innerHTML = state.products.length ? productTable(state.products) : '<p class="empty-msg">No products found.</p>';
    bindProductTableActions(wrap);
  } catch (e) { toast(e.message, 'error'); }
}
function bindProductTableActions(scope) {
  scope.querySelectorAll('[data-adj]').forEach(b => b.addEventListener('click', async () => {
    const id = b.getAttribute('data-adj');
    try {
      await queueWrite('adjustStock', { Product_ID: id, delta: num(b.getAttribute('data-delta')), reason: 'Admin panel quick adjust' });
      toast('Stock updated for ' + id, 'success');
      if (state.module === 'inventory') loadInventory(); else loadDashboard();
    } catch (e) { /* queue already toasted */ }
  }));
  scope.querySelectorAll('[data-edit-product]').forEach(b => b.addEventListener('click', () =>
    openProductModal(productById(b.getAttribute('data-edit-product')))));
  scope.querySelectorAll('[data-del-product]').forEach(b => b.addEventListener('click', async () => {
    const id = b.getAttribute('data-del-product');
    if (!confirm('Delete ' + id + '?\n\nIf this product was never sold or used in a repair, its row is deleted. If it WAS sold/used, the backend ARCHIVES it instead (hidden from the website, stock set to 0) so history stays correct.')) return;
    try {
      const d = await queueWrite('deleteProduct', { Product_ID: id });
      toast(d.archived ? id + ' archived (it has sales/repair history).' : id + ' deleted.', 'success');
      loadInventory();
    } catch (e) { /* queue already toasted */ }
  }));
}
const PRODUCT_FIELDS = ['Show_On_Website', 'Main_Category', 'Sub_Category', 'Brand', 'Model', 'RAM', 'Storage',
  'PTA_Status', 'Network_Status', 'IMEI_Serial', 'Cost_Price', 'Stock_Qty', 'Damaged_Qty', 'Min_Stock_Alert',
  'Price_Guest', 'Price_Retail', 'Price_Wholesale', 'Price_Business', 'Product_Badge', 'Image_1', 'Image_2',
  'Has_Warranty', 'Warranty_Days', 'Check_Status', 'Added_Date'];
function fillProductFormSelects(p) {
  const L = state.lists;
  fillSelectCoded($('pf_Main_Category'), 'Main_Category', L.Main_Category, p ? p.Main_Category : 'Accessories', false);
  fillSelectCoded($('pf_Sub_Category'), 'Sub_Category', L.Sub_Category, p ? p.Sub_Category : 'Other', false);
  fillSelectCoded($('pf_Brand'), 'Brand', L.Brand, p ? p.Brand : 'Other', false);
  fillSelectCoded($('pf_RAM'), 'RAM', L.RAM, p ? p.RAM : 'N/A', false);
  fillSelectCoded($('pf_Storage'), 'Storage', L.Storage, p ? p.Storage : 'N/A', false);
  fillSelectCoded($('pf_PTA_Status'), 'PTA_Status', L.PTA_Status, p ? p.PTA_Status : 'N/A', false);
  fillSelectCoded($('pf_Network_Status'), 'Network_Status', L.Network_Status, p ? p.Network_Status : 'N/A', false);
  fillSelectCoded($('pf_Product_Badge'), 'Product_Badge', L.Product_Badge, p ? p.Product_Badge : 'NONE', false);
  fillSelectCoded($('pf_Check_Status'), 'Check_Status', L.Check_Status, p ? p.Check_Status : 'Pending', false);
}
function openProductModal(p) {
  fillProductFormSelects(p);
  $('productModalTitle').textContent = p ? 'Edit Product — ' + p.Product_ID : 'Add Product';
  $('pf_Product_ID').value = p ? p.Product_ID : '';
  PRODUCT_FIELDS.forEach(f => {
    const el = $('pf_' + f);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = p ? isTrue(p[f]) : (f === 'Show_On_Website');
    else el.value = p && p[f] !== undefined && p[f] !== null ? p[f] : (el.type === 'number' ? '' : '');
  });
  if (!p) { $('pf_Added_Date').value = todayISO(); $('pf_Warranty_Days').value = 30; $('pf_Min_Stock_Alert').value = 2; $('pf_Stock_Qty').value = 0; $('pf_Damaged_Qty').value = 0; }
  $('productError').hidden = true;
  $('productModal').hidden = false;
}
async function submitProductForm(ev) {
  ev.preventDefault();
  const errBox = $('productError');
  errBox.hidden = true;
  const payload = {};
  PRODUCT_FIELDS.forEach(f => {
    const el = $('pf_' + f);
    if (!el) return;
    payload[f] = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? num(el.value) : el.value.trim());
  });
  const id = $('pf_Product_ID').value;
  try {
    if (id) { payload.Product_ID = id; await queueWrite('updateProduct', payload); }
    else await queueWrite('addProduct', payload);
    $('productModal').hidden = true;
    toast('Product saved.', 'success');
    loadInventory();
  } catch (e) { errBox.textContent = e.message; errBox.hidden = false; }
}

/* ========================== 10. PURCHASES =============================== */
function purchaseRowHtml() {
  const opts = state.products.map(p => '<option value="' + esc(p.Product_ID) + '">' + esc(p.Product_ID) + ' — ' + esc(productName(p)) + ' (stock ' + num(p.Stock_Qty) + ')</option>').join('');
  return '<div class="pur-row">' +
    '<label>Existing product<select class="pur-product"><option value="">➕ New product…</option>' + opts + '</select></label>' +
    '<label>Qty<input class="pur-qty" type="number" min="1" value="1"></label>' +
    '<label>Cost / unit<input class="pur-cost" type="number" min="0" step="any" value="0"></label>' +
    '<button type="button" class="btn btn-danger btn-sm pur-remove">✕</button>' +
    '<label class="pur-new-model">New Model / Name<input class="pur-model" type="text" placeholder="Only for new products"></label>' +
    '<label class="pur-new-brand">New Brand<input class="pur-brand" type="text" placeholder="e.g. Samsung"></label>' +
    '<label class="pur-new-cat">New Category<select class="pur-cat">' + codedOptions_('Main_Category', state.lists.Main_Category, state.lists.Main_Category[0]) + '</select></label>' +
    '<label class="pur-new-price">New Sale Price (Guest)<input class="pur-price" type="number" min="0" step="any" value="0"></label>' +
    '</div>';
}
function bindPurchaseRow(row) {
  const toggle = () => {
    const isNew = !row.querySelector('.pur-product').value;
    row.querySelectorAll('.pur-new-model,.pur-new-brand,.pur-new-cat,.pur-new-price').forEach(el => { el.style.display = isNew ? '' : 'none'; });
    updatePurchaseTotal();
  };
  row.querySelector('.pur-product').addEventListener('change', toggle);
  row.querySelector('.pur-remove').addEventListener('click', () => { row.remove(); updatePurchaseTotal(); });
  row.querySelectorAll('input').forEach(i => i.addEventListener('input', updatePurchaseTotal));
  toggle();
}
function addPurchaseRow() {
  const row = document.createElement('div');
  row.innerHTML = purchaseRowHtml();
  const node = row.firstElementChild;
  $('purItems').appendChild(node);
  bindPurchaseRow(node);
}
function updatePurchaseTotal() {
  let total = 0;
  document.querySelectorAll('.pur-row').forEach(r => {
    total += (num(r.querySelector('.pur-qty').value) || 0) * (num(r.querySelector('.pur-cost').value) || 0);
  });
  $('purTotal').textContent = money(total);
}
async function loadPurchases() {
  fillSelectCoded($('purPaymentMode'), 'Payment_Mode', state.lists.Payment_Mode, 'Cash', false);
  fillSelectCoded($('supPayMode'), 'Payment_Mode', state.lists.Payment_Mode, 'Cash', false);
  try { const d = await api('getProducts'); state.products = realProducts_(d.products); } catch (e) { /* rows still work for new products */ }
  if (!$('purItems').children.length) addPurchaseRow();
  updatePurchaseTotal();
}
async function submitPurchase() {
  const errBox = $('purError');
  errBox.hidden = true;
  $('purSuccess').hidden = true;
  const items = [];
  let valid = true;
  document.querySelectorAll('.pur-row').forEach(r => {
    const pid = r.querySelector('.pur-product').value;
    const qty = Math.max(1, parseInt(r.querySelector('.pur-qty').value, 10) || 1);
    const cost = num(r.querySelector('.pur-cost').value);
    if (pid) items.push({ Product_ID: pid, Qty: qty, Cost_Price: cost });
    else {
      const model = r.querySelector('.pur-model').value.trim();
      if (!model) { valid = false; return; }
      const price = num(r.querySelector('.pur-price').value);
      items.push({ Qty: qty, Cost_Price: cost, Model: model, Brand: r.querySelector('.pur-brand').value.trim() || 'Other', Main_Category: r.querySelector('.pur-cat').value, Sub_Category: 'Other', Price_Guest: price, Price_Retail: price, Price_Wholesale: price, Price_Business: price });
    }
  });
  if (!valid) { errBox.textContent = 'For a NEW product row, please type the Model / Name.'; errBox.hidden = false; return; }
  if (!items.length) { errBox.textContent = 'Add at least one item.'; errBox.hidden = false; return; }
  if (!$('purSupplierName').value.trim() && !$('purSupplierPhone').value.trim()) {
    errBox.textContent = 'Please provide the supplier name or phone.'; errBox.hidden = false; return;
  }
  const payload = {
    Supplier_Name: $('purSupplierName').value.trim(),
    Supplier_Phone: $('purSupplierPhone').value.trim(),
    Items: items,
    Amount_Paid: num($('purAmountPaid').value),
    Payment_Mode: $('purPaymentMode').value,
    Notes: $('purNotes').value.trim()
  };
  // Clear instantly for rapid entry; the queue saves in the background.
  $('purItems').innerHTML = ''; addPurchaseRow();
  $('purAmountPaid').value = 0; $('purNotes').value = '';
  try {
    const d = await queueWrite('logPurchase', payload);
    const s = $('purSuccess');
    s.textContent = '✅ Purchase ' + (d.purchase ? d.purchase.Purchase_ID : '') + ' saved — stock updated. Balance payable: ' + money(d.purchase ? d.purchase.Balance_Payable : 0);
    s.hidden = false;
  } catch (e) { errBox.textContent = e.message; errBox.hidden = false; }
}
async function submitSupplierPayment() {
  const msg = $('supPayMsg');
  msg.hidden = true;
  const amount = num($('supPayAmount').value);
  if (amount <= 0) { toast('Enter a payment amount first.', 'error'); return; }
  try {
    const d = await queueWrite('logSupplierPayment', {
      Supplier_Name: $('supPayName').value.trim(),
      Supplier_Phone: $('supPayPhone').value.trim(),
      Amount: amount, Payment_Mode: $('supPayMode').value,
      Reference_Note: 'Supplier payment from Admin Panel'
    });
    msg.textContent = '✅ Payment recorded. New supplier balance: ' + money(d.ledger ? d.ledger.Balance_After : 0) +
      (num(d.unapplied) > 0 ? ' (Unapplied extra: ' + money(d.unapplied) + ')' : '');
    msg.hidden = false;
    $('supPayAmount').value = '';
  } catch (e) { toast(e.message, 'error'); }
}

/* ========================== 11. ORDERS ================================== */
async function loadOrders() {
  fillSelectCoded($('ordStatusFilter'), 'Order_Status', [''].concat(state.lists.Order_Status), $('ordStatusFilter').value || '', false);
  $('ordStatusFilter').options[0].textContent = 'All Statuses';
  try {
    const d = await api('getOrders', { Order_Status: $('ordStatusFilter').value || undefined });
    state.orders = d.orders || [];
    const wrap = $('ordTableWrap');
    if (!state.orders.length) { wrap.innerHTML = '<p class="empty-msg">No orders found.</p>'; return; }
    wrap.innerHTML = '<table><thead><tr><th>Order</th><th>Date</th><th>Channel</th><th>Customer</th><th>Items</th><th>Total</th><th>Profit</th><th>Payment</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
      state.orders.map(o => {
        const items = parseItems(o.Items_JSON);
        const cust = customerById(o.Customer_ID);
        return '<tr><td><b>' + esc(o.Order_ID) + '</b></td><td>' + fmtDate(o.Date) + '</td><td>' + esc(o.Sale_Channel) + '</td>' +
          '<td>' + (cust ? esc(cust.Name) : (o.Customer_ID ? esc(o.Customer_ID) : 'Walk-in Guest')) + '</td>' +
          '<td class="wrap">' + items.map(i => esc((i.Brand || '') + ' ' + (i.Model || '')) + ' ×' + num(i.Qty)).join('<br>') + '</td>' +
          '<td>' + money(o.Total_Amount) + '</td>' +
          // Net_Profit / Total_Cost are staff-only fields returned to staff
          // sessions by the backend — never part of any customer view.
          '<td>' + (o.Net_Profit !== undefined ? money(o.Net_Profit) : '—') + '</td>' +
          '<td>' + esc(o.Payment_Method) + '</td>' +
          '<td><select data-order-status="' + esc(o.Order_ID) + '">' + codedOptions_('Order_Status', state.lists.Order_Status, o.Order_Status) + '</select></td>' +
          '<td><button type="button" class="btn btn-ghost btn-sm" data-order-invoice="' + esc(o.Order_ID) + '">🧾 Invoice</button></td></tr>';
      }).join('') + '</tbody></table>';
    wrap.querySelectorAll('[data-order-status]').forEach(sel => sel.addEventListener('change', async () => {
      try {
        await queueWrite('updateOrderStatus', { Order_ID: sel.getAttribute('data-order-status'), Order_Status: sel.value });
        toast('Order ' + sel.getAttribute('data-order-status') + ' → ' + sel.value, 'success');
        loadOrders();
      } catch (e) { loadOrders(); }
    }));
    wrap.querySelectorAll('[data-order-invoice]').forEach(b => b.addEventListener('click', () =>
      showInvoice('order', b.getAttribute('data-order-invoice'))));
  } catch (e) { toast(e.message, 'error'); }
}

/* ========================== 12. RETURNS / RMA =========================== */
async function loadReturns() {
  fillSelectCoded($('retAction'), 'RMA_Action', state.lists.RMA_Action, 'Refund', false);
  fillSelectCoded($('retCondition'), 'Stock_Condition', state.lists.Stock_Condition, 'Resellable', false);
  try {
    const pd = await api('getProducts'); state.products = realProducts_(pd.products);
    fillSelect($('retProductSel'), state.products.map(p => p.Product_ID), '', false);
    $('retProductSel').innerHTML = state.products.map(p =>
      '<option value="' + esc(p.Product_ID) + '">' + esc(p.Product_ID) + ' — ' + esc(productName(p)) + '</option>').join('');
  } catch (e) { /* form can still be used after a refresh */ }
  if (can('getCustomers')) {
    try {
      const cd = await api('getCustomers'); state.customers = cd.customers || [];
      $('retCustomerSel').innerHTML = '<option value="">— No customer (walk-in) —</option>' + state.customers.map(c =>
        '<option value="' + esc(c.Customer_ID) + '">' + esc(c.Name) + ' — ' + esc(c.Phone) + '</option>').join('');
    } catch (e) {}
  }
  if (can('getReturns')) {
    try {
      const d = await api('getReturns');
      state.returns = d.returns || [];
      $('retTableWrap').innerHTML = state.returns.length ?
        '<table><thead><tr><th>RMA</th><th>Date</th><th>Order</th><th>Product</th><th>Reason</th><th>Action</th><th>Condition</th><th>Status</th></tr></thead><tbody>' +
        state.returns.map(r => '<tr><td><b>' + esc(r.RMA_ID) + '</b></td><td>' + fmtDate(r.Date) + '</td><td>' + esc(r.Original_Order_ID || '—') + '</td><td>' + esc(r.Product_ID) + '</td><td class="wrap">' + esc(r.Reason) + '</td><td>' + esc(r.Action_Taken) + '</td><td>' + esc(r.Stock_Condition) + '</td><td>' + esc(r.Status) + '</td></tr>').join('') +
        '</tbody></table>' : '<p class="empty-msg">No returns yet.</p>';
    } catch (e) { toast(e.message, 'error'); }
  }
}
async function submitReturn() {
  const msg = $('retMsg');
  msg.hidden = true;
  const payload = {
    Original_Order_ID: $('retOrderId').value.trim(),
    Customer_ID: $('retCustomerSel').value,
    Product_ID: $('retProductSel').value,
    IMEI_Serial: $('retImei').value.trim(),
    Reason: $('retReason').value.trim(),
    Action_Taken: $('retAction').value,
    Stock_Condition: $('retCondition').value,
    Qty: Math.max(1, parseInt($('retQty').value, 10) || 1),
    Refund_Amount: num($('retRefund').value)
  };
  if (!payload.Product_ID) { toast('Choose a product first.', 'error'); return; }
  try {
    const d = await queueWrite('processReturn', payload);
    msg.textContent = '✅ Return ' + (d.rma ? d.rma.RMA_ID : '') + ' processed — stock updated' +
      (d.ledger ? ', customer balance reduced to ' + money(d.ledger.Balance_After) : '') + '.';
    msg.hidden = false;
    $('retReason').value = ''; $('retRefund').value = 0;
    loadReturns();
  } catch (e) { toast(e.message, 'error'); }
}

/* ========================== 13. REPAIRS ================================= */
async function loadRepairs() {
  fillSelectCoded($('repStageFilter'), 'Repair_Stage', [''].concat(state.lists.Current_Stage), $('repStageFilter').value || '', false);
  $('repStageFilter').options[0].textContent = 'All Stages';
  fillSelectCoded($('rc_Type'), 'Repair_Type', state.lists.Repair_Type, 'Hardware', false);
  try {
    const d = await api('getRepairs', { search: $('repSearch').value.trim(), Current_Stage: $('repStageFilter').value || undefined });
    state.repairs = d.repairs || [];
    const wrap = $('repTableWrap');
    if (!state.repairs.length) { wrap.innerHTML = '<p class="empty-msg">No repair jobs found.</p>'; return; }
    wrap.innerHTML = '<table><thead><tr><th>Job</th><th>Received</th><th>Customer</th><th>Device</th><th>Stage</th><th>Total</th><th>Balance Due</th><th>Technician</th><th></th></tr></thead><tbody>' +
      state.repairs.map(r => '<tr><td><b>' + esc(r.Job_ID) + '</b></td><td>' + fmtDate(r.Date_Received) + '</td>' +
        '<td class="wrap">' + esc(r.Customer_Name) + '<br><span class="small muted">' + esc(r.Customer_Phone) + '</span></td>' +
        '<td class="wrap">' + esc(r.Device_Brand_Model) + '</td>' +
        '<td><span class="pill ' + (r.Current_Stage === 'Phone OK / Ready for Pickup' ? 'green' : (r.Current_Stage === 'Unrepairable' ? 'red' : 'blue')) + '">' + esc(r.Current_Stage) + '</span></td>' +
        '<td>' + money(r.Total_Amount) + '</td><td>' + (num(r.Balance_Due) > 0 ? '<b>' + money(r.Balance_Due) + '</b>' : money(0)) + '</td>' +
        '<td>' + esc(r.Assigned_Technician || '—') + '</td>' +
        '<td><button type="button" class="btn btn-primary btn-sm" data-repair-open="' + esc(r.Job_ID) + '">Open</button></td></tr>').join('') +
      '</tbody></table>';
    wrap.querySelectorAll('[data-repair-open]').forEach(b => b.addEventListener('click', () =>
      openRepairDrawer(b.getAttribute('data-repair-open'))));
  } catch (e) { toast(e.message, 'error'); }
}
async function submitRepairJob() {
  const msg = $('rcMsg');
  msg.hidden = true;
  const payload = {
    Customer_Name: $('rc_Name').value.trim(), Customer_Phone: $('rc_Phone').value.trim(),
    Customer_Email: $('rc_Email').value.trim(), Device_Brand_Model: $('rc_Device').value.trim(),
    IMEI_Serial: $('rc_Imei').value.trim(), Repair_Type: $('rc_Type').value,
    Reported_Issue: $('rc_Issue').value.trim(), Service_Charges: num($('rc_ServiceCharges').value),
    Advance_Paid: num($('rc_Advance').value), Assigned_Technician: $('rc_Technician').value.trim(),
    Internal_Notes: $('rc_Notes').value.trim()
  };
  if (!payload.Customer_Name || !payload.Customer_Phone || !payload.Device_Brand_Model) {
    toast('Customer name, phone and device are required.', 'error'); return;
  }
  // Clear the form instantly for the next intake; queue saves in order.
  ['rc_Name', 'rc_Phone', 'rc_Email', 'rc_Device', 'rc_Imei', 'rc_Issue', 'rc_Notes'].forEach(id => { $(id).value = ''; });
  $('rc_ServiceCharges').value = 0; $('rc_Advance').value = 0;
  try {
    const d = await queueWrite('createRepairJob', payload);
    msg.textContent = '✅ Job ' + d.repair.Job_ID + ' created. Portal password: ' + d.repair.Default_Portal_Pass +
      ' (also emailed to the customer). Share it with the customer for live tracking.';
    msg.hidden = false;
    loadRepairs();
  } catch (e) { toast(e.message, 'error'); }
}
function repairById(id) { return state.repairs.find(r => String(r.Job_ID) === String(id)); }
async function openRepairDrawer(jobId) {
  state.repairJobId = jobId;
  if (!productById('__none__') && !state.products.length && can('getProducts')) {
    try { const d = await api('getProducts'); state.products = realProducts_(d.products); } catch (e) {}
  }
  renderRepairDrawer();
  $('repairDrawer').hidden = false;
  $('drawerBackdrop').hidden = false;
}
function closeRepairDrawer() {
  $('repairDrawer').hidden = true;
  $('drawerBackdrop').hidden = true;
  state.repairJobId = '';
}
function renderRepairDrawer() {
  const r = repairById(state.repairJobId);
  if (!r) { closeRepairDrawer(); return; }
  $('rdTitle').textContent = '🔧 ' + r.Job_ID + ' — ' + (r.Device_Brand_Model || '');
  const parts = parseItems(r.Parts_Used_JSON);
  const isTech = state.user && state.user.Role === 'Technician';
  const canParts = can('addRepairParts');
  const canPay = can('recordRepairPayment');
  let h = '<dl class="kv">' +
    '<dt>Customer</dt><dd>' + esc(r.Customer_Name) + ' • ' + esc(r.Customer_Phone) + '</dd>' +
    '<dt>Email</dt><dd>' + esc(r.Customer_Email || '—') + '</dd>' +
    '<dt>Device</dt><dd>' + esc(r.Device_Brand_Model) + (r.IMEI_Serial ? ' • IMEI ' + esc(r.IMEI_Serial) : '') + '</dd>' +
    '<dt>Issue</dt><dd>' + esc(r.Reported_Issue) + '</dd>' +
    '<dt>Received</dt><dd>' + fmtDate(r.Date_Received) + ' • Updated ' + fmtDate(r.Last_Updated) + '</dd>' +
    '<dt>Portal Pass</dt><dd>' + esc(r.Default_Portal_Pass) + '</dd></dl>';
  h += '<label>Current Stage <select id="rdStage">' + codedOptions_('Repair_Stage', state.lists.Current_Stage, r.Current_Stage) + '</select></label>';
  h += '<label>Customer Communication <select id="rdComm">' + codedOptions_('Customer_Comm_Status', state.lists.Customer_Comm_Status, r.Customer_Comm_Status) + '</select></label>';
  h += '<label>Internal Notes (staff only) <input id="rdNotes" type="text" value="' + esc(r.Internal_Notes || '') + '"></label>';
  if (!isTech) {
    h += '<div class="two-col"><label>Service Charges (PKR) <input id="rdService" type="number" min="0" step="any" value="' + num(r.Service_Charges) + '"></label>' +
      '<label>Assigned Technician <input id="rdTech" type="text" value="' + esc(r.Assigned_Technician || '') + '"></label></div>';
  }
  h += '<button type="button" class="btn btn-primary btn-block" id="rdSaveBtn">💾 Save Stage / Status</button>';
  h += '<h4>Parts Used</h4>';
  h += parts.length ? '<table><thead><tr><th>Part</th><th>Qty</th><th>Line Cost</th></tr></thead><tbody>' +
    parts.map(p => '<tr><td>' + esc(p.Product_ID) + ' — ' + esc(p.Model || '') + '</td><td>' + num(p.Qty) + '</td><td>' + money(p.Line_Cost) + '</td></tr>').join('') +
    '</tbody></table>' : '<p class="muted">No parts added yet.</p>';
  if (canParts) {
    h += '<div class="two-col"><label>Add Part <select id="rdPartSel">' + state.products.map(p =>
      '<option value="' + esc(p.Product_ID) + '">' + esc(p.Product_ID) + ' — ' + esc(productName(p)) + ' (stock ' + num(p.Stock_Qty) + ')</option>').join('') +
      '</select></label><label>Qty <input id="rdPartQty" type="number" min="1" value="1"></label></div>' +
      '<button type="button" class="btn btn-ghost btn-block" id="rdAddPartBtn">➕ Add Part (deducts stock)</button>';
  }
  h += '<div class="card" style="margin-top:.8rem"><div class="kv" style="margin:0">' +
    '<dt>Parts Cost</dt><dd>' + money(r.Parts_Cost) + '</dd>' +
    '<dt>Service Charges</dt><dd>' + money(r.Service_Charges) + '</dd>' +
    '<dt>Total</dt><dd>' + money(r.Total_Amount) + '</dd>' +
    '<dt>Paid</dt><dd>' + money(r.Advance_Paid) + '</dd>' +
    '<dt>Balance Due</dt><dd>' + money(r.Balance_Due) + '</dd></div></div>';
  if (canPay) {
    h += '<div class="two-col"><label>Payment Amount (PKR) <input id="rdPayAmount" type="number" min="0" step="any"></label>' +
      '<label>Payment Mode <select id="rdPayMode">' + codedOptions_('Payment_Mode', state.lists.Payment_Mode, state.lists.Payment_Mode[0]) + '</select></label></div>' +
      '<button type="button" class="btn btn-primary btn-block" id="rdPayBtn">💰 Record Payment</button>';
  }
  h += '<div class="btn-row" style="margin-top:.8rem">' +
    '<button type="button" class="btn btn-whatsapp" id="rdWaBtn">📱 WhatsApp Status</button>' +
    '<button type="button" class="btn btn-ghost" id="rdPrintBtn">🖨️ Print Repair Invoice</button></div>';
  $('rdBody').innerHTML = h;
  const body = $('rdBody');
  body.querySelector('#rdSaveBtn').addEventListener('click', async () => {
    const payload = {
      Job_ID: r.Job_ID,
      Current_Stage: body.querySelector('#rdStage').value,
      Customer_Comm_Status: body.querySelector('#rdComm').value,
      Internal_Notes: body.querySelector('#rdNotes').value.trim()
    };
    if (!isTech) {
      payload.Service_Charges = num(body.querySelector('#rdService').value);
      payload.Assigned_Technician = body.querySelector('#rdTech').value.trim();
    }
    try {
      const d = await queueWrite('updateRepair', payload);
      replaceRepair(d.repair);
      toast('Repair ' + r.Job_ID + ' updated' + (payload.Current_Stage === 'Phone OK / Ready for Pickup' ? ' — customer emailed.' : ''), 'success');
      renderRepairDrawer(); loadRepairs();
    } catch (e) { /* queue toasted */ }
  });
  const addBtn = body.querySelector('#rdAddPartBtn');
  if (addBtn) addBtn.addEventListener('click', async () => {
    const pid = body.querySelector('#rdPartSel').value;
    const qty = Math.max(1, parseInt(body.querySelector('#rdPartQty').value, 10) || 1);
    if (!pid) { toast('No part selected.', 'error'); return; }
    try {
      const d = await queueWrite('addRepairParts', { Job_ID: r.Job_ID, Items: [{ Product_ID: pid, Qty: qty }] });
      replaceRepair(d.repair);
      const pd = await api('getProducts').catch(() => null);
      if (pd) state.products = pd.products ? realProducts_(pd.products) : state.products;
      toast('Part added — totals recomputed. Balance due: ' + money(d.repair.Balance_Due), 'success');
      renderRepairDrawer(); loadRepairs();
    } catch (e) { /* queue toasted */ }
  });
  const payBtn = body.querySelector('#rdPayBtn');
  if (payBtn) payBtn.addEventListener('click', async () => {
    const amount = num(body.querySelector('#rdPayAmount').value);
    if (amount <= 0) { toast('Enter a payment amount.', 'error'); return; }
    try {
      const d = await queueWrite('recordRepairPayment', { Job_ID: r.Job_ID, Amount: amount, Payment_Mode: body.querySelector('#rdPayMode').value });
      replaceRepair(d.repair);
      toast('Payment recorded. Balance due: ' + money(d.repair.Balance_Due), 'success');
      renderRepairDrawer(); loadRepairs();
    } catch (e) { /* queue toasted */ }
  });
  body.querySelector('#rdWaBtn').addEventListener('click', () => {
    const text = 'Assalam-o-Alaikum ' + (r.Customer_Name || '') + ', your repair update from ' + CONFIG.SHOP_NAME + ':\n' +
      'Job ID: ' + r.Job_ID + '\nDevice: ' + (r.Device_Brand_Model || '') + '\nStatus: ' + r.Current_Stage +
      '\nTotal: ' + money(r.Total_Amount) + '\nPaid: ' + money(r.Advance_Paid) + '\nBalance due: ' + money(r.Balance_Due) +
      '\nThank you for choosing ' + CONFIG.SHOP_NAME + '.';
    window.open(waLink(r.Customer_Phone, text), '_blank');
  });
  body.querySelector('#rdPrintBtn').addEventListener('click', () => showInvoice('repair', r.Job_ID));
}
function replaceRepair(updated) {
  const i = state.repairs.findIndex(x => x.Job_ID === updated.Job_ID);
  if (i > -1) state.repairs[i] = updated;
}

/* ==================== 14. REGISTRATION SYSTEM (Customers) ================= */
let regFilter = 'all';
let regPeriod = 'all';
let customerGuarantorPhotoData = null;
let customerCnicFrontData = null;
let customerCnicBackData = null;
function personType_(c) { return c.Person_Type || (c.Price_Tier === 'Shopkeeper' ? 'Shopkeeper' : 'Customer'); }
function regFilterMatch_(c) {
  if (regFilter === 'all') return true;
  if (regFilter === 'Online' || regFilter === 'Offline') return (c.Channel || 'Offline') === regFilter;
  return personType_(c) === regFilter;
}
async function loadCustomers() {
  try {
    const d = await api('getCustomers', { search: $('cusSearch').value.trim() });
    state.customers = d.customers || [];
    renderCustomers();
    renderRegReport_();
  } catch (e) { toast(e.message, 'error'); }
}
function renderCustomers() {
  const wrap = $('cusTableWrap');
  const list = state.customers.filter(regFilterMatch_);
  if (!list.length) { wrap.innerHTML = '<p class="empty-msg">No customers found.</p>'; return; }
  wrap.innerHTML = '<table><thead><tr><th>ID</th><th>Customer</th><th>Tier</th><th>Target / Month Spend</th><th>Credit Limit</th><th>Balance Owed</th><th>Due Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
      list.map(c => '<tr><td>' + esc(c.Customer_ID) + '</td>' +
        '<td class="wrap"><span class="cust-cell">' + custAvatar_(c) + '<span><b>' + esc(c.Name) + '</b><br><span class="small muted">' + esc(c.Phone) + ' • ' + esc(c.Email) + '</span></span></span></td>' +
        '<td><span class="pill blue">' + esc(c.Price_Tier) + '</span><br><span class="small muted">fallback ' + esc(c.Fallback_Tier) + '</span></td>' +
        '<td>' + money(c.Monthly_Target) + ' / ' + money(c.Current_Month_Spend) + '</td>' +
        '<td>' + money(c.Credit_Limit) + '</td>' +
        '<td>' + (num(c.Current_Credit_Balance) > 0 ? '<b>' + money(c.Current_Credit_Balance) + '</b>' : money(0)) + '</td>' +
        '<td>' + fmtDate(c.Payment_Due_Date) + '</td>' +
        '<td><span class="pill ' + (c.Status === 'Active' ? 'green' : 'amber') + '">' + esc(c.Status) + '</span></td>' +
        '<td><span class="btn-row">' +
        (can('saveCustomer') ? '<button type="button" class="btn btn-ghost btn-sm" data-edit-customer="' + esc(c.Customer_ID) + '">Edit</button>' : '') +
        (can('deleteCustomer') ? '<button type="button" class="btn btn-danger btn-sm" data-del-customer="' + esc(c.Customer_ID) + '">Deactivate</button>' : '') +
        (c.Phone ? '<a class="btn btn-whatsapp btn-sm" target="_blank" rel="noopener" href="' + esc(waLink(c.Phone, ledgerReminderText(c))) + '">📱 Remind</a>' : '') +
        '</span></td></tr>').join('') + '</tbody></table>';
    wrap.querySelectorAll('[data-edit-customer]').forEach(b => b.addEventListener('click', () =>
      openCustomerModal(customerById(b.getAttribute('data-edit-customer')))));
    wrap.querySelectorAll('[data-del-customer]').forEach(b => b.addEventListener('click', async () => {
      const id = b.getAttribute('data-del-customer');
      if (!confirm('Deactivate customer ' + id + '? (Soft delete — the record stays, Status becomes Inactive.)')) return;
      try { await queueWrite('deleteCustomer', { Customer_ID: id }); toast('Customer deactivated.', 'success'); loadCustomers(); } catch (e) {}
    }));
}
function renderRegReport_() {
  const box = $('regReport');
  if (!box) return;
  const today = dayKey_(new Date());
  const monthKey = today.slice(0, 7);
  const weekStart = dayKey_(daysAgoISO(6));
  let noDate = 0;
  state.customers.forEach(c => { if (!dayKey_(c.Registered_Date)) noDate++; });
  const inPeriod = c => {
    const k = dayKey_(c.Registered_Date);
    if (!k) return regPeriod === 'all';
    if (regPeriod === 'today') return k === today;
    if (regPeriod === '7d') return k >= weekStart && k <= today;
    if (regPeriod === 'month') return k.slice(0, 7) === monthKey;
    return true;
  };
  const rows = state.customers.filter(inPeriod);
  const count = fn => rows.filter(fn).length;
  let h = '<div class="module-head"><h3>📊 Registration Report</h3>' +
    '<label class="inline-label">Period <select id="regPeriod">' +
    [['today', 'Aaj'], ['7d', 'Pichle 7 Din'], ['month', 'Is Maah'], ['all', 'All Time']].map(o =>
      '<option value="' + o[0] + '"' + (regPeriod === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') +
    '</select></label></div>';
  h += '<div class="reg-counts">' +
    statCard('Total', rows.length) +
    statCard('👤 Customers', count(c => personType_(c) === 'Customer')) +
    statCard('🏪 Shopkeepers', count(c => personType_(c) === 'Shopkeeper')) +
    statCard('🔧 Technicians', count(c => personType_(c) === 'Technician')) +
    statCard('👷 Workers', count(c => personType_(c) === 'Worker')) +
    statCard('🌐 Online', count(c => (c.Channel || 'Offline') === 'Online')) +
    statCard('🏪 Offline (Shop)', count(c => (c.Channel || 'Offline') === 'Offline')) + '</div>';
  if (noDate) h += '<p class="small muted">' + noDate + ' purane records ki registration date nahi hai — ye sirf <b>All Time</b> mein ginay jate hain.</p>';
  const days = lastDays_(14);
  const perDay = {};
  state.customers.forEach(c => { const k = dayKey_(c.Registered_Date); if (k) perDay[k] = (perDay[k] || 0) + 1; });
  h += '<h4>📈 Rozana Registrations — Pichle 14 Din</h4>' +
    lineChartSVG_(days.map(k => k.slice(5)), days.map(k => perDay[k] || 0), '#B9F638');
  box.innerHTML = h;
  const sel = $('regPeriod');
  if (sel) sel.addEventListener('change', () => { regPeriod = sel.value; renderRegReport_(); });
}
function ledgerReminderText(c) {
  return 'Assalam-o-Alaikum ' + (c.Name || '') + ', a friendly payment reminder from ' + CONFIG.SHOP_NAME + '.\n' +
    'Your current balance is ' + money(c.Current_Credit_Balance) +
    (c.Payment_Due_Date ? '\nDue date: ' + fmtDate(c.Payment_Due_Date) : '') +
    '\nPlease arrange payment soon. If you have already paid, please ignore this message.\n— ' + CONFIG.SHOP_NAME;
}
const CUSTOMER_FIELDS = ['Name', 'Phone', 'Email', 'Reference_By', 'Photo_Drive_URL', 'Price_Tier',
  'Fallback_Tier', 'Monthly_Target', 'Credit_Limit', 'Payment_Due_Date', 'Status'];
function openCustomerModal(c) {
  fillSelectCoded($('cf_Price_Tier'), 'Price_Tier', state.lists.Price_Tier, c ? c.Price_Tier : 'Retail', false);
  fillSelectCoded($('cf_Fallback_Tier'), 'Price_Tier', state.lists.Price_Tier, c ? c.Fallback_Tier : 'Guest', false);
  fillSelectCoded($('cf_Status'), 'Customer_Status', state.lists.Customer_Status, c ? c.Status : 'Active', false);
  $('customerModalTitle').textContent = c ? 'Edit Customer — ' + c.Customer_ID : 'Add Customer';
  $('cf_Customer_ID').value = c ? c.Customer_ID : '';
  $('cf_Password').value = '';
  CUSTOMER_FIELDS.forEach(f => {
    const el = $('cf_' + f);
    if (el) el.value = c && c[f] !== undefined && c[f] !== null ? c[f] : '';
  });
  customerPhotoData = null;
  const pf = $('cf_PhotoFile'); if (pf) pf.value = '';
  const pv = $('cf_PhotoPreview');
  if (pv) { const t = c ? driveThumb_(c.Photo_Drive_URL) : ''; pv.hidden = !t; if (t) pv.src = t; }
  // Registration type / channel / guarantor (v2.4)
  const typeSel = $('cf_Type');
  if (typeSel) typeSel.value = c ? (c.Person_Type || (c.Price_Tier === 'Shopkeeper' ? 'Shopkeeper' : 'Customer')) : 'Customer';
  const chSel = $('cf_Channel');
  if (chSel) chSel.value = (c && c.Channel) || 'Offline';
  const gName = $('cf_GName'); if (gName) gName.value = c ? (c.Guarantor_Name || '') : '';
  const gPhone = $('cf_GPhone'); if (gPhone) gPhone.value = c ? (c.Guarantor_Phone || '') : '';
  customerGuarantorPhotoData = null;
  const gf = $('cf_GPhotoFile'); if (gf) gf.value = '';
  const gp = $('cf_GPhotoPreview');
  if (gp) { const t = c ? driveThumb_(c.Guarantor_Photo_URL) : ''; gp.hidden = !t; if (t) gp.src = t; else gp.removeAttribute('src'); }
  // CNIC copies + maahana payment date (v2.5)
  const pdEl = $('cf_PaymentDay');
  if (pdEl) pdEl.value = c && c.Payment_Day ? c.Payment_Day : '';
  customerCnicFrontData = null;
  customerCnicBackData = null;
  const cff = $('cf_CnicFrontFile'); if (cff) cff.value = '';
  const cbf = $('cf_CnicBackFile'); if (cbf) cbf.value = '';
  const cfp = $('cf_CnicFrontPreview');
  if (cfp) { const t = c ? driveThumb_(c.CNIC_Front_URL) : ''; cfp.hidden = !t; if (t) cfp.src = t; else cfp.removeAttribute('src'); }
  const cbp = $('cf_CnicBackPreview');
  if (cbp) { const t = c ? driveThumb_(c.CNIC_Back_URL) : ''; cbp.hidden = !t; if (t) cbp.src = t; else cbp.removeAttribute('src'); }
  $('customerError').hidden = true;
  $('customerModal').hidden = false;
}
async function submitCustomerForm(ev) {
  ev.preventDefault();
  const errBox = $('customerError');
  errBox.hidden = true;
  const payload = {};
  CUSTOMER_FIELDS.forEach(f => {
    const el = $('cf_' + f);
    if (!el) return;
    payload[f] = el.type === 'number' ? num(el.value) : el.value.trim();
  });
  const id = $('cf_Customer_ID').value;
  if (id) payload.Customer_ID = id;
  const pw = $('cf_Password').value;
  if (pw) payload.password = pw;
  if (customerPhotoData) { payload.photoBase64 = customerPhotoData.base64; payload.photoContentType = customerPhotoData.type; }
  // Registration type / channel / guarantor (v2.4)
  if ($('cf_Type')) payload.Person_Type = $('cf_Type').value;
  if ($('cf_Channel')) payload.Channel = $('cf_Channel').value;
  if ($('cf_GName')) payload.Guarantor_Name = $('cf_GName').value.trim();
  if ($('cf_GPhone')) payload.Guarantor_Phone = $('cf_GPhone').value.trim();
  if (customerGuarantorPhotoData) {
    payload.guarantorPhotoBase64 = customerGuarantorPhotoData.base64;
    payload.guarantorPhotoContentType = customerGuarantorPhotoData.type;
  }
  // CNIC copies + maahana payment date (v2.5)
  const pdVal = $('cf_PaymentDay') ? num($('cf_PaymentDay').value) : 0;
  if (pdVal >= 1 && pdVal <= 31) payload.Payment_Day = pdVal;
  if (customerCnicFrontData) {
    payload.cnicFrontBase64 = customerCnicFrontData.base64;
    payload.cnicFrontContentType = customerCnicFrontData.type;
  }
  if (customerCnicBackData) {
    payload.cnicBackBase64 = customerCnicBackData.base64;
    payload.cnicBackContentType = customerCnicBackData.type;
  }
  try {
    await queueWrite('saveCustomer', payload);
    $('customerModal').hidden = true;
    toast('Customer saved.', 'success');
    loadCustomers();
    // Khata ke stats/boxes bhi foran refresh — follow-up / due date ki tabdeeli wahan bhi nazar aaye
    try {
      invalidateLedgerCache_();
      if (typeof renderLedgerOverview_ === 'function' && $('ledCustList')) renderLedgerOverview_();
    } catch (e) { /* best-effort refresh */ }
  } catch (e) { errBox.textContent = e.message; errBox.hidden = false; }
}

/* ========================== 15. LEDGER ================================== */
/* Saari ledger entries ka cache — stats, customer list aur reminders teeno
   ek hi fetch istemal karte hain (har module load par ek dafa). Koi nayi
   entry save ho to loadLedger() cache invalidate kar deta hai. */
let ledAllEntriesPromise = null;
let ledCustData = [];
/* Khata list ke filters: kind = all | customer | shopkeeper | supplier.
   Default mein sirf baqaya (balance > 0) wale khate nazar aate hain;
   clear khate ledShowClear toggle se dikhte hain. */
let ledFilterKind = 'all';
let ledShowClear = false;
function fetchAllLedger_() {
  if (!ledAllEntriesPromise) {
    ledAllEntriesPromise = api('getLedger', {}).then(d => d.entries || [])
      .catch(e => { ledAllEntriesPromise = null; throw e; });
  }
  return ledAllEntriesPromise;
}
function invalidateLedgerCache_() { ledAllEntriesPromise = null; }
/* Party ki asal due date: entries ki sab se bari Due_Date, aur customer ke
   liye us ki maahana Payment_Day wali date — jo PEHLE aaye wahi effective. */
function ledEffectiveDue_(cust, entryDueKey) {
  let due = entryDueKey || '';
  let monthly = false;
  const pd = cust ? num(cust.Payment_Day) : 0;
  if (pd >= 1 && pd <= 31) {
    const now = new Date();
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const mKey = dayKey_(new Date(now.getFullYear(), now.getMonth(), Math.min(pd, dim)));
    if (!due || mKey < due) { due = mKey; monthly = true; }
  }
  return { key: due, monthly: monthly };
}
async function loadLedgerModule() {
  fillSelectCoded($('ledPartyType'), 'Party_Type', state.lists.Party_Type, $('ledPartyType').value || 'Customer', false);
  fillSelectCoded($('ledType'), 'Ledger_Type', state.lists.Ledger_Type, 'Credit', false);
  fillSelectCoded($('ledMode'), 'Payment_Mode', state.lists.Payment_Mode, 'Cash', false);
  const hint = $('ledPermHint');
  if (hint) hint.hidden = ledPrivileged_();
  refreshLedgerPartyOptions();
  renderLedgerOverview_();
}
/* Paisay KAM karne wali entry (wasooli / supplier payment) sirf Owner ya
   Manager kar sakta hai — baqi roles sirf nayi (udhaar) entry add karenge. */
function ledPrivileged_() {
  const role = state.user ? state.user.Role : '';
  return role === 'Owner' || role === 'Manager';
}
function ledReduces_(partyType, entryType) {
  return (partyType === 'Customer' && entryType === 'Credit') ||
    (partyType === 'Supplier' && entryType === 'Debit');
}

/* ---------- Khata: stats + customer overview (sirf Customer parties) ----------
   Balance ke nishan Code.gs ke partyBalanceDelta_ se bilkul waisay hi:
   Customer ka 'Debit'  = udhaar diya  (balance upar),
   Customer ka 'Credit' = paisay wasool (balance neeche). */
async function renderLedgerOverview_() {
  const statsBox = $('ledStats');
  if (!statsBox) return;
  try {
    const entries = await fetchAllLedger_();
    if (!state.customers.length && can('getCustomers')) {
      try { const cd = await api('getCustomers'); state.customers = cd.customers || []; } catch (e) {}
    }
    const today = dayKey_(new Date());
    let udhaar = 0, wasool = 0, wasoolToday = 0;
    const byParty = {};
    entries.forEach(e => {
      if (String(e.Party_Type) !== 'Customer') return;
      const amt = num(e.Amount);
      if (e.Type === 'Debit') udhaar += amt;
      else if (e.Type === 'Credit') {
        wasool += amt;
        if (dayKey_(e.Date) === today) wasoolToday += amt;
      }
      const id = String(e.Party_ID);
      if (!byParty[id]) byParty[id] = { latest: null, latestKey: '', dueKey: '' };
      const g = byParty[id];
      const dk = dayKey_(e.Date);
      if (!g.latest || dk >= g.latestKey) { g.latest = e; g.latestKey = dk; }
      const due = dayKey_(e.Due_Date);
      if (due && due > g.dueKey) g.dueKey = due;
    });
    let baqaya = 0, overCount = 0, overSum = 0;
    Object.keys(byParty).forEach(id => {
      const g = byParty[id];
      const bal = g.latest ? num(g.latest.Balance_After) : 0;
      if (bal <= 0) return;
      baqaya += bal;
      const eff = ledEffectiveDue_(customerById(id), g.dueKey);
      if (eff.key && eff.key < today) { overCount++; overSum += bal; }
    });
    statsBox.innerHTML =
      statCard('💰 Kul Baqaya (Market Mein)', money(baqaya), 'warn') +
      statCard('📤 Kul Udhaar Diya', money(udhaar)) +
      statCard('📥 Kul Wasool Hua', money(wasool), 'profit') +
      statCard('🟢 Aaj ki Wasooli', money(wasoolToday), 'profit') +
      statCard('🔴 Overdue', overCount + ' parties — ' + money(overSum), 'warn');
    /* Saari parties (customers + suppliers) ke boxes ke liye data — har
       party ka latest balance, effective due date (customers ke liye
       Payment_Day wali maahana date bhi) aur time-rank. Sorting: overdue
       sab se pehle, phir aaj-due / jald-due, phir balance zyada se kam,
       aur zero-balance customers sab se aakhir mein. */
    const allParties = {};
    entries.forEach(e => {
      const key = String(e.Party_Type || '') + '|' + String(e.Party_ID || '');
      if (!allParties[key]) allParties[key] = { type: e.Party_Type, id: e.Party_ID, latest: null, latestKey: '', dueKey: '' };
      const g = allParties[key];
      const dk = dayKey_(e.Date);
      if (!g.latest || dk >= g.latestKey) { g.latest = e; g.latestKey = dk; }
      const due = dayKey_(e.Due_Date);
      if (due && due > g.dueKey) g.dueKey = due;
    });
    const todayMs = new Date(today + 'T00:00:00').getTime();
    function dueInfo_(type, cust, g) {
      const balance = g && g.latest ? num(g.latest.Balance_After) : 0;
      if (balance <= 0 || !g) return { rank: 4, label: '', due: '', monthly: false, diff: null };
      const eff = type === 'Customer' ? ledEffectiveDue_(cust, g.dueKey) : { key: g.dueKey || '', monthly: false };
      if (!eff.key) return { rank: 3, label: '', due: '', monthly: false, diff: null };
      const diff = Math.round((new Date(eff.key + 'T00:00:00').getTime() - todayMs) / 86400000);
      let rank, label;
      if (diff < 0) { rank = 0; label = '🔴 ' + Math.abs(diff) + ' din late'; }
      else if (diff === 0) { rank = 1; label = '🟠 Aaj last date'; }
      else { rank = 2; label = '🟡 ' + diff + ' din baqi'; }
      return { rank: rank, label: label, due: eff.key, monthly: eff.monthly, diff: diff };
    }
    const custRows = state.customers.map(c => {
      const g = allParties['Customer|' + String(c.Customer_ID)];
      const balance = g && g.latest ? num(g.latest.Balance_After) : 0;
      return Object.assign(
        { kind: 'Customer', cust: c, id: c.Customer_ID, name: c.Name || '', phone: c.Phone || '', balance: balance },
        dueInfo_('Customer', c, g));
    });
    const seenCust = {};
    state.customers.forEach(c => { seenCust[String(c.Customer_ID)] = 1; });
    const otherRows = [];
    Object.keys(allParties).forEach(key => {
      const g = allParties[key];
      if (g.type === 'Customer' && seenCust[String(g.id)]) return;
      const cust = g.type === 'Customer' ? customerById(g.id) : null;
      const balance = g.latest ? num(g.latest.Balance_After) : 0;
      otherRows.push(Object.assign(
        { kind: g.type, cust: cust, id: g.id, name: cust ? cust.Name : String(g.id), phone: cust ? (cust.Phone || '') : '', balance: balance },
        dueInfo_(g.type, cust, g)));
    });
    ledCustData = custRows.concat(otherRows).sort((a, b) =>
      (a.rank - b.rank) || (b.balance - a.balance));
    renderLedgerCustList_();
  } catch (e) { /* overview best-effort hai — module phir bhi chalta rahe */ }
}
/* ---------- Khata: table-style list (profile → reg no → baqaya → time → follow-up) ----------
   Upar .khead strip (column headings), neeche har party ek .krow: avatar,
   Registration No + naam, Baqaya block, time chip (due status), follow-up
   dropdown (sirf customers, balance > 0) aur 💵 / ➕ / 📒 / ✏️ buttons.
   Row par click → neeche usi party ka khata khulta hai. Default mein sirf
   baqaya wale khate nazar aate hain; clear khate toggle se dikhte hain. */
const LED_FU_OPTS = [['', '— Follow-up —'], ['Called', '📞 Call ki'], ['WhatsApp', '💬 WhatsApp message'],
  ['Talked', '🤝 Baat ho gayi'], ['No Response', '🚫 Response nahi mila']];
function followupSelectHtml_(cust) {
  const fs = cust.Followup_Status || '';
  return '<select class="rem-followup" data-followup="' + esc(cust.Customer_ID) + '">' +
    LED_FU_OPTS.map(o => '<option value="' + esc(o[0]) + '"' + (String(fs) === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') +
    '</select>' +
    (cust.Followup_Date ? '<span class="small muted kbox-fu-last">Last: ' + fmtDate(cust.Followup_Date) + '</span>' : '');
}
function bindFollowupSelects_(root) {
  if (!root) return;
  root.querySelectorAll('[data-followup]').forEach(sel => {
    sel.addEventListener('click', ev => ev.stopPropagation());
    sel.addEventListener('change', async ev => {
      ev.stopPropagation();
      const cid = sel.getAttribute('data-followup');
      const val = sel.value;
      const todayKey = dayKey_(new Date());
      try {
        await queueWrite('saveCustomer', { Customer_ID: cid, Followup_Status: val, Followup_Date: val ? todayKey : '' });
        const cust = customerById(cid);
        if (cust) { cust.Followup_Status = val; cust.Followup_Date = val ? todayKey : ''; }
        toast('Follow-up save ho gaya ✅', 'success');
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}
function ledKindOf_(r) {
  if (r.kind === 'Supplier') return 'supplier';
  if (r.kind === 'Customer') {
    const pt = r.cust ? personType_(r.cust) : 'Customer';
    return pt === 'Shopkeeper' ? 'shopkeeper' : 'customer';
  }
  return 'other';
}
/* Quick action: party ka khata kholo, Add Entry ka Type pehle se set karo
   (pay = balance kam karne wali, add = balance badhane wali), phir Add
   Entry card par scroll karke Amount par focus karo. */
function ledPresetEntry_(r, mode) {
  openReminderParty_(r.kind + '|' + r.id);
  const want = mode === 'pay'
    ? (r.kind === 'Supplier' ? 'Debit' : 'Credit')
    : (r.kind === 'Supplier' ? 'Credit' : 'Debit');
  const apply = () => {
    const sel = $('ledType');
    if (sel) sel.value = want;
    const card = $('ledAddCard');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const amt = $('ledAmount');
    if (amt) amt.focus({ preventScroll: true });
  };
  apply();
  setTimeout(apply, 400);
  setTimeout(apply, 1000);
}
function renderLedgerCustList_() {
  const box = $('ledCustList');
  if (!box) return;
  const qEl = $('ledSearch');
  const q = qEl ? qEl.value.trim().toLowerCase() : '';
  const qd = q.replace(/[^0-9]/g, '');
  const all = ledCustData || [];
  const clearCount = all.filter(r => !(r.balance > 0)).length;
  const tgl = $('ledToggleClear');
  if (tgl) {
    tgl.textContent = ledShowClear ? '🙈 Clear Chhupayein' : '✅ Clear Khate (' + clearCount + ')';
    tgl.classList.toggle('active', ledShowClear);
  }
  const rows = all.filter(r => {
    if (!ledShowClear && !(r.balance > 0)) return false;
    if (ledFilterKind !== 'all' && ledKindOf_(r) !== ledFilterKind) return false;
    if (!q) return true;
    if ((r.name || '').toLowerCase().indexOf(q) > -1) return true;
    if (String(r.id || '').toLowerCase().indexOf(q) > -1) return true;
    if (String(r.phone || '').toLowerCase().indexOf(q) > -1) return true;
    return qd !== '' && String(r.phone || '').replace(/[^0-9]/g, '').indexOf(qd) > -1;
  });
  if (!rows.length) {
    box.innerHTML = '<p class="empty-msg">' + (all.length && !ledShowClear
      ? 'Is filter mein koi baqaya wala khata nahi — ✅ Clear Khate button se clear khate dekhein.'
      : 'Koi customer nahi mila.') + '</p>';
    return;
  }
  const priv = ledPrivileged_();
  let h = '<div class="khead"><span>Customer</span><span>Baqaya</span><span>Time</span><span>Follow-up</span><span>Actions</span></div>';
  h += rows.map((r, i) => {
    const isCust = r.kind === 'Customer' && !!r.cust;
    const avatar = isCust ? custAvatar_(r.cust) :
      '<span class="cust-avatar cust-initial">' + (r.kind === 'Supplier' ? '🏭' : esc((r.name || '?').trim().charAt(0).toUpperCase() || '?')) + '</span>';
    let s = '<div class="krow" data-kbox="' + i + '">';
    s += '<span class="kcell-cust"><span class="kbox-avatar">' + avatar + '</span>';
    if (isCust) {
      s += '<span class="kbox-reg"><b>' + esc(r.cust.Customer_ID) + '</b>' +
        '<small>' + esc(r.name) + (r.phone ? ' • ' + esc(r.phone) : '') + '</small></span>';
    } else {
      s += '<span class="kbox-reg"><b>' + esc(r.name) + '</b>' +
        '<small>' + (r.kind === 'Supplier' ? 'Supplier' : esc(r.kind)) + (r.phone ? ' • ' + esc(r.phone) : '') + '</small></span>';
    }
    s += '</span>';
    s += '<span class="kbox-bal"><small>Baqaya</small>' +
      (r.balance > 0 ? '<b class="kbox-owe">' + money(r.balance) + '</b>' : '<b class="kbox-clear">Clear ✅</b>') + '</span>';
    if (r.balance > 0 && r.label) {
      const chipCls = r.rank === 0 ? 'kchip kchip-over' : (r.rank === 1 ? 'kchip kchip-today' : 'kchip kchip-soon');
      s += '<span class="kcell-time"><span class="' + chipCls + '">' + esc(r.label) +
        '<small>Due: ' + fmtDate(r.due) + (r.monthly ? ' (Maahana date)' : '') + '</small></span></span>';
    } else {
      s += '<span class="kcell-time muted">—</span>';
    }
    if (isCust && r.balance > 0) {
      s += '<span class="kbox-fu">' + followupSelectHtml_(r.cust) + '</span>';
    } else {
      s += '<span class="kbox-fu muted">—</span>';
    }
    s += '<span class="kbox-actions">' +
      '<button type="button" class="icon-btn" data-kpay="' + i + '" title="' +
        (priv ? 'Wasooli / Payment record karein' : '🔒 Paisay kam karna sirf Owner/Manager kar sakte hain') + '"' +
        (priv ? '' : ' disabled') + '>💵</button>' +
      '<button type="button" class="icon-btn" data-kadd="' + i + '" title="Nayi entry / Udhaar add karein">➕</button>' +
      '<button type="button" class="icon-btn" data-kbox-open="' + i + '" title="Khata kholein">📒</button>' +
      (isCust ? '<button type="button" class="icon-btn" data-kbox-edit="' + i + '" title="Poora form / Edit">✏️</button>' : '') +
      '</span>';
    return s + '</div>';
  }).join('');
  box.innerHTML = h;
  bindFollowupSelects_(box);
  box.querySelectorAll('[data-kpay]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    const r = rows[Number(b.getAttribute('data-kpay'))];
    if (r) ledPresetEntry_(r, 'pay');
  }));
  box.querySelectorAll('[data-kadd]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    const r = rows[Number(b.getAttribute('data-kadd'))];
    if (r) ledPresetEntry_(r, 'add');
  }));
  box.querySelectorAll('[data-kbox-open]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    const r = rows[Number(b.getAttribute('data-kbox-open'))];
    if (r) openReminderParty_(r.kind + '|' + r.id);
  }));
  box.querySelectorAll('[data-kbox-edit]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    const r = rows[Number(b.getAttribute('data-kbox-edit'))];
    if (r && r.cust) openCustomerModal(r.cust);
  }));
  box.querySelectorAll('[data-kbox]').forEach(el => el.addEventListener('click', () => {
    const r = rows[Number(el.getAttribute('data-kbox'))];
    if (r) openReminderParty_(r.kind + '|' + r.id);
  }));
}

async function openReminderParty_(key) {
  const parts = String(key || '').split('|');
  const type = parts[0], id = parts.slice(1).join('|');
  if (!id) return;
  $('ledPartyType').value = type;
  await refreshLedgerPartyOptions();
  const sel = $('ledPartySel');
  if (!Array.from(sel.options).some(o => String(o.value) === String(id))) {
    const opt = document.createElement('option');
    opt.value = id; opt.textContent = id;
    sel.appendChild(opt);
  }
  sel.value = id;
  loadLedger();
}

/* ---------- Khata: party card (customer + guarantor) ---------- */
function guarantorAvatar_(name, photoUrl) {
  const t = driveThumb_(photoUrl);
  if (t) return '<img class="cust-avatar" src="' + esc(t) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
  return '<span class="cust-avatar cust-initial">' + esc((name || '?').trim().charAt(0).toUpperCase() || '?') + '</span>';
}
function renderLedgerPartyCard_() {
  const box = $('ledPartyCard');
  if (!box) return;
  const p = state.ledgerParty;
  if (!p || !p.id) { box.innerHTML = ''; return; }
  const balance = num(p.balance);
  if (p.type === 'Customer') {
    const cust = customerById(p.id);
    if (!cust) { box.innerHTML = ''; return; }
    let h = '<div class="party-card"><div class="cust-cell">' + custAvatar_(cust) +
      '<span><b>' + esc(cust.Name) + '</b><br><span class="small muted">' + esc(cust.Phone) + '</span></span>' +
      '<span class="grow"></span><span class="pill blue">' + esc(cust.Price_Tier) + '</span></div>' +
      '<p class="pos-total-row">Balance <strong>' + money(balance) + '</strong></p>';
    if (cust.Guarantor_Name) {
      h += '<div class="cust-cell">' + guarantorAvatar_(cust.Guarantor_Name, cust.Guarantor_Photo_URL) +
        '<span>🛡️ <b>Guarantor:</b> ' + esc(cust.Guarantor_Name) + (cust.Guarantor_Phone ? ' — ' + esc(cust.Guarantor_Phone) : '') + '</span></div>';
    } else {
      h += '<p class="small muted">🛡️ Guarantor: koi nahi</p>';
    }
    if (can('saveCustomer')) h += '<button type="button" class="btn btn-ghost btn-sm" id="ledGuarantorEdit">✏️ Guarantor / Photo Edit</button>';
    box.innerHTML = h + '</div>';
    const eb = $('ledGuarantorEdit');
    if (eb) eb.addEventListener('click', () => openCustomerModal(customerById(p.id)));
  } else {
    box.innerHTML = '<div class="party-card"><b>🏭 Supplier: ' + esc(p.name || p.id) + '</b>' +
      '<p class="pos-total-row">Balance <strong>' + money(balance) + '</strong></p></div>';
  }
}

/* ---------- Khata: invoice auto-attach (ORD-/REP- number se detail) ---------- */
let ledInvoiceCache = null;
async function findInvoice_(no) {
  const q = String(no || '').trim().toUpperCase();
  if (!q) return null;
  if (!ledInvoiceCache) {
    const res = await Promise.all([
      api('getOrders', {}).catch(() => ({ orders: [] })),
      api('getRepairs', {}).catch(() => ({ repairs: [] }))
    ]);
    ledInvoiceCache = { orders: res[0].orders || [], repairs: res[1].repairs || [] };
  }
  const o = ledInvoiceCache.orders.find(x => String(x.Order_ID || '').toUpperCase() === q);
  if (o) {
    const cust = customerById(o.Customer_ID);
    return { kind: 'Order', id: o.Order_ID, name: o.Customer_Name || (cust ? cust.Name : ''), amount: num(o.Total_Amount), status: o.Order_Status || '', items: parseItems(o.Items_JSON) };
  }
  const r = ledInvoiceCache.repairs.find(x => String(x.Job_ID || '').toUpperCase() === q);
  if (r) return { kind: 'Repair', id: r.Job_ID, name: r.Customer_Name || '', amount: num(r.Total_Amount), status: r.Current_Stage || '', items: [] };
  return null;
}
async function showInvoiceDetail_(id) {
  const box = $('ledInvoiceDetail');
  if (!box) return;
  const inv = await findInvoice_(id);
  if (!inv) {
    box.innerHTML = '<div class="card party-card"><b>🔗 ' + esc(id) + '</b><p class="small muted">Invoice detail nahi mili.</p></div>';
    return;
  }
  let h = '<div class="card party-card"><div class="cust-cell"><b>🔗 ' + esc(inv.kind) + ' — ' + esc(inv.id) + '</b><span class="grow"></span>' +
    '<button type="button" class="btn btn-ghost btn-sm" id="ledInvClose">✕ Band Karein</button></div>' +
    '<p class="small">Customer: <b>' + esc(inv.name || '—') + '</b> • Amount: <b>' + money(inv.amount) + '</b> • Status: <b>' + esc(inv.status || '—') + '</b></p>';
  if (inv.kind === 'Order' && inv.items.length) {
    h += '<p class="small muted">Items:</p><ul class="small">' + inv.items.map(i =>
      '<li>' + esc(((i.Brand || '') + ' ' + (i.Model || '')).trim() || i.Product_ID || 'Item') + ' ×' + num(i.Qty) + '</li>').join('') + '</ul>';
  }
  box.innerHTML = h + '</div>';
  const cb = $('ledInvClose');
  if (cb) cb.addEventListener('click', () => { box.innerHTML = ''; });
}
async function refreshLedgerPartyOptions() {
  const type = $('ledPartyType').value;
  const sel = $('ledPartySel');
  if (type === 'Customer') {
    if (can('getCustomers')) {
      try { const d = await api('getCustomers'); state.customers = d.customers || []; } catch (e) {}
    }
    sel.innerHTML = state.customers.map(c => '<option value="' + esc(c.Customer_ID) + '">' + esc(c.Name) + ' — ' + esc(c.Phone) + ' (owes ' + money(c.Current_Credit_Balance) + ')</option>').join('');
  } else {
    // Suppliers are keyed by phone (or name) — collect them from purchases
    // history is not exposed by the API, so offer the customers of the
    // supplier ledger seen in this session + free entry via recent orders.
    const keys = new Set();
    state.ledger.forEach(e => { if (e.Party_Type === 'Supplier') keys.add(e.Party_ID); });
    sel.innerHTML = Array.from(keys).map(k => '<option value="' + esc(k) + '">' + esc(k) + '</option>').join('') ||
      '<option value="">— Load any ledger first, or use Purchases → Pay a Supplier —</option>';
  }
}
async function loadLedger() {
  const type = $('ledPartyType').value;
  const id = $('ledPartySel').value;
  if (!id) { toast('Choose a party first.', 'error'); return; }
  try {
    const d = await api('getLedger', { Party_Type: type, Party_ID: id });
    state.ledger = d.entries || [];
    state.ledgerParty = { type: type, id: id, balance: num(d.balance) };
    $('ledBalance').textContent = d.balance === null || d.balance === undefined ? '—' : money(d.balance);
    const cust = type === 'Customer' ? customerById(id) : null;
    state.ledgerParty.name = cust ? cust.Name : id;
    state.ledgerParty.phone = cust ? cust.Phone : '';
    $('ledWaBtn').hidden = !(cust && cust.Phone && num(d.balance) > 0);
    renderLedgerPartyCard_();
    const wrap = $('ledTableWrap');
    wrap.innerHTML = state.ledger.length ?
      '<table><thead><tr><th>Entry</th><th>Date</th><th>Type</th><th>Mode</th><th>Amount</th><th>Balance After</th><th>Due Date</th><th>Note</th><th>By</th></tr></thead><tbody>' +
      state.ledger.map(e => {
        const note = String(e.Reference_Note || '');
        const im = note.match(/^Invoice:\s*([A-Za-z0-9-]+)/);
        const noteHtml = im
          ? '<button type="button" class="chip-btn" data-inv="' + esc(im[1]) + '">🔗 ' + esc(im[1]) + '</button>' + esc(note.slice(im[0].length))
          : esc(note);
        return '<tr><td>' + esc(e.Entry_ID) + '</td><td>' + fmtDate(e.Date) + '</td>' +
          '<td><span class="pill ' + (e.Type === 'Debit' ? 'amber' : 'green') + '">' + esc(e.Type) + '</span></td>' +
          '<td>' + esc(e.Payment_Mode) + '</td><td>' + money(e.Amount) + '</td><td><b>' + money(e.Balance_After) + '</b></td>' +
          '<td>' + fmtDate(e.Due_Date) + '</td><td class="wrap">' + noteHtml + '</td><td>' + esc(e.Entered_By) + '</td></tr>';
      }).join('') +
      '</tbody></table>' : '<p class="empty-msg">No ledger entries for this party yet.</p>';
    wrap.querySelectorAll('[data-inv]').forEach(b => b.addEventListener('click', () =>
      showInvoiceDetail_(b.getAttribute('data-inv'))));
    invalidateLedgerCache_();
    renderLedgerOverview_();
  } catch (e) { toast(e.message, 'error'); }
}
async function submitLedgerEntry() {
  const msg = $('ledMsg');
  msg.hidden = true;
  const type = $('ledPartyType').value;
  const id = $('ledPartySel').value;
  const amount = num($('ledAmount').value);
  if (!id) { toast('Load a party ledger first.', 'error'); return; }
  if (amount <= 0) { toast('Enter an amount greater than 0.', 'error'); return; }
  if (ledReduces_(type, $('ledType').value) && !ledPrivileged_()) {
    toast('🔒 Paisay kam karne wali entry sirf Owner/Manager kar sakte hain', 'error');
    return;
  }
  let note = $('ledNote').value.trim();
  const invNo = $('ledInvoiceNo') ? $('ledInvoiceNo').value.trim() : '';
  if (invNo) {
    const inv = await findInvoice_(invNo);
    let ref = 'Invoice: ' + invNo.toUpperCase();
    if (inv) ref += ' | ' + inv.name + ' | ' + money(inv.amount);
    else toast('Invoice ' + invNo + ' nahi mila — sirf number save ho raha hai', 'error');
    note = ref + (note ? ' — ' + note : '');
  }
  const payload = {
    Party_Type: type, Party_ID: id, Type: $('ledType').value,
    Payment_Mode: $('ledMode').value, Amount: amount,
    Reference_Note: note
  };
  if ($('ledDue').value) payload.Due_Date = $('ledDue').value;
  $('ledAmount').value = ''; $('ledNote').value = '';
  if ($('ledInvoiceNo')) $('ledInvoiceNo').value = '';
  try {
    const d = await queueWrite('addLedgerEntry', payload);
    msg.textContent = '✅ Entry ' + d.Entry_ID + ' saved. New balance owed: ' + money(d.Balance_After);
    msg.hidden = false;
    loadLedger();
  } catch (e) { toast(e.message, 'error'); }
}
function ledgerWhatsApp() {
  const p = state.ledgerParty;
  if (!p || !p.phone) { toast('Load a customer ledger with a phone number first.', 'error'); return; }
  const cust = customerById(p.id) || { Name: p.name, Phone: p.phone, Current_Credit_Balance: 0, Payment_Due_Date: '' };
  window.open(waLink(p.phone, ledgerReminderText(cust)), '_blank');
}

/* ---------- Khata: Add New Khata / Customer (alag page) ---------- */
const knPhotos = { profile: null, cnicFront: null, cnicBack: null, guarantor: null };
function knWirePhoto_(inputEl, previewEl, key) {
  if (!inputEl) return;
  inputEl.addEventListener('change', () => {
    const f = inputEl.files && inputEl.files[0];
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) { toast('Photo 3MB se chhoti rakhein.', 'error'); inputEl.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      knPhotos[key] = { base64: dataUrl.split(',')[1] || '', type: f.type || 'image/jpeg' };
      if (previewEl) { previewEl.src = dataUrl; previewEl.hidden = false; }
      toast('📷 Photo tayyar hai — Save dabane par attach ho jayegi.', 'success');
    };
    reader.readAsDataURL(f);
  });
}
function resetKhataNewForm_() {
  ['kn_Name', 'kn_Phone', 'kn_Email', 'kn_ReferenceBy', 'kn_GName', 'kn_GPhone',
   'kn_PaymentDay', 'kn_DueDate'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  const lim = $('kn_CreditLimit'); if (lim) lim.value = '50000';
  const type = $('kn_Type'); if (type) type.value = 'Customer';
  const ch = $('kn_Channel'); if (ch) ch.value = 'Offline';
  ['kn_PhotoFile', 'kn_CnicFrontFile', 'kn_CnicBackFile', 'kn_GPhotoFile'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  ['kn_PhotoPreview', 'kn_CnicFrontPreview', 'kn_CnicBackPreview', 'kn_GPhotoPreview'].forEach(id => {
    const el = $(id); if (el) { el.hidden = true; el.removeAttribute('src'); }
  });
  knPhotos.profile = null; knPhotos.cnicFront = null; knPhotos.cnicBack = null; knPhotos.guarantor = null;
  const err = $('knError'); if (err) err.hidden = true;
}
function openKhataNew_() {
  if (!can('saveCustomer')) { toast('Your role cannot add customers.', 'error'); return; }
  MODULES.forEach(m => { const el = $('mod-' + m.id); if (el) el.hidden = true; });
  const sec = $('module-khata-new');
  if (sec) sec.hidden = false;
  $('topbarTitle').textContent = '➕ Add New Khata / Customer';
  resetKhataNewForm_();
  window.scrollTo(0, 0);
}
async function submitKhataNew_() {
  const errBox = $('knError');
  if (errBox) errBox.hidden = true;
  const name = $('kn_Name').value.trim();
  const phone = $('kn_Phone').value.trim();
  if (!name || !phone) {
    if (errBox) { errBox.textContent = 'Naam aur Mobile Number lazmi hain.'; errBox.hidden = false; }
    toast('Naam aur Mobile Number lazmi hain.', 'error');
    return;
  }
  const type = $('kn_Type').value;
  const payload = {
    Name: name, Phone: phone, Email: $('kn_Email').value.trim(),
    Person_Type: type, Channel: $('kn_Channel').value,
    Price_Tier: type === 'Shopkeeper' ? 'Shopkeeper' : 'Retail',
    Credit_Limit: num($('kn_CreditLimit').value),
    Reference_By: $('kn_ReferenceBy').value.trim(),
    Guarantor_Name: $('kn_GName').value.trim(),
    Guarantor_Phone: $('kn_GPhone').value.trim(),
    Status: 'Active'
  };
  const pd = num($('kn_PaymentDay').value);
  if (pd >= 1 && pd <= 31) payload.Payment_Day = pd;
  if ($('kn_DueDate').value) payload.Payment_Due_Date = $('kn_DueDate').value;
  if (knPhotos.profile) { payload.photoBase64 = knPhotos.profile.base64; payload.photoContentType = knPhotos.profile.type; }
  if (knPhotos.cnicFront) { payload.cnicFrontBase64 = knPhotos.cnicFront.base64; payload.cnicFrontContentType = knPhotos.cnicFront.type; }
  if (knPhotos.cnicBack) { payload.cnicBackBase64 = knPhotos.cnicBack.base64; payload.cnicBackContentType = knPhotos.cnicBack.type; }
  if (knPhotos.guarantor) { payload.guarantorPhotoBase64 = knPhotos.guarantor.base64; payload.guarantorPhotoContentType = knPhotos.guarantor.type; }
  try {
    await queueWrite('saveCustomer', payload);
    toast('✅ Naya khata ban gaya — ' + name, 'success');
    try { const cd = await api('getCustomers'); state.customers = cd.customers || []; } catch (e) {}
    showModule('ledger');
    const digits = s => String(s || '').replace(/[^0-9]/g, '');
    const nc = state.customers.find(c => digits(c.Phone) !== '' && digits(c.Phone) === digits(phone));
    if (nc) openReminderParty_('Customer|' + nc.Customer_ID);
  } catch (e) {
    if (errBox) { errBox.textContent = e.message; errBox.hidden = false; }
  }
}

/* ========================== 16. EXPENSES ================================ */
let expReceiptData = null;
function bankAccountValues_() {
  const rows = state.settingsAll.Bank_Account;
  if (Array.isArray(rows) && rows.length) return settingsRows('Bank_Account').map(r => r.value);
  return state.lists.Bank_Account || [];
}
function fillExpBank_(selected) {
  const el = $('expBank');
  if (!el) return;
  fillSelectCoded(el, 'Bank_Account', bankAccountValues_(), selected !== undefined ? selected : el.value, true);
  el.options[0].textContent = '— Bank account chunein —';
}
function syncExpBank_() {
  const wrap = $('expBankWrap');
  if (!wrap) return;
  const isBank = $('expMode').value === 'Bank';
  wrap.hidden = !isBank;
  if (isBank) fillExpBank_();
}
async function refreshSettingsLists_() {
  try {
    const d = await api('getSettingsAll');
    state.settingsAll = d.settings || {};
    applyListsFromSettings(state.settingsAll);
  } catch (e) { /* purani lists se kaam chala lein */ }
}
async function expAddSettingValue_(group, promptText, selEl) {
  const v = prompt(promptText);
  if (!v || !v.trim()) return;
  const value = v.trim();
  try {
    await queueWrite('saveSetting', { op: 'add', Group: group, Value: value });
    toast('Added "' + value + '".', 'success');
    await refreshSettingsLists_();
    const vals = (state.lists[group] || []).slice();
    if (vals.indexOf(value) === -1) vals.push(value);
    fillSelectCoded(selEl, group, vals, value, false);
    if (group === 'Payment_Mode') syncExpBank_();
  } catch (e) {}
}
async function expAddBank_() {
  const bank = prompt('Bank ka naam (e.g. Meezan Bank):');
  if (!bank || !bank.trim()) return;
  const title = prompt('Account Title (khata kis ke naam par hai):');
  if (title === null) return;
  const number = prompt('Account Number / IBAN:');
  if (number === null) return;
  const value = [bank.trim(), title.trim(), number.trim()].filter(Boolean).join(' — ');
  try {
    await queueWrite('saveSetting', { op: 'add', Group: 'Bank_Account', Value: value });
    toast('🏦 Bank account add ho gaya.', 'success');
    await refreshSettingsLists_();
    fillExpBank_(value);
  } catch (e) {}
}
function clearExpReceipt_() {
  expReceiptData = null;
  const f = $('expReceipt'); if (f) f.value = '';
  const pv = $('expReceiptPreview');
  if (pv) { pv.hidden = true; pv.removeAttribute('src'); }
}
async function loadExpenses() {
  fillSelectCoded($('expCategory'), 'Expense_Category', state.lists.Expense_Category, $('expCategory').value || 'Misc', false);
  fillSelectCoded($('expMode'), 'Payment_Mode', state.lists.Payment_Mode, 'Cash', false);
  syncExpBank_();
  if (!$('expDate').value) $('expDate').value = todayISO();
  try {
    const d = await api('getExpenses', { thisMonthOnly: true });
    state.expenses = d.expenses || [];
    $('expMonthTotal').textContent = money(state.expenses.reduce((s, x) => s + num(x.Amount), 0));
    $('expTableWrap').innerHTML = state.expenses.length ?
      '<table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Mode</th><th>By</th></tr></thead><tbody>' +
      state.expenses.map(x => '<tr><td>' + fmtDate(x.Date) + '</td><td>' + esc(x.Category) + '</td><td class="wrap">' + esc(x.Description) +
        (x.Bank_Detail ? '<br><span class="small muted">🏦 ' + esc(x.Bank_Detail) + '</span>' : '') +
        (x.Receipt_Photo_URL ? '<br><img class="cust-avatar" src="' + esc(driveThumb_(x.Receipt_Photo_URL)) + '" alt="🧾 Receipt" title="Receipt photo" loading="lazy" onerror="this.style.display=\'none\'">' : '') +
        '</td><td>' + money(x.Amount) + '</td><td>' + esc(x.Payment_Mode) + '</td><td>' + esc(x.Entered_By) + '</td></tr>').join('') +
      '</tbody></table>' : '<p class="empty-msg">No expenses this month.</p>';
  } catch (e) { toast(e.message, 'error'); }
}
async function submitExpense() {
  const msg = $('expMsg');
  msg.hidden = true;
  const amount = num($('expAmount').value);
  if (amount <= 0) { toast('Enter an expense amount.', 'error'); return; }
  if (!$('expDate').value) $('expDate').value = todayISO();
  const mode = $('expMode').value;
  const payload = {
    Category: $('expCategory').value, Date: $('expDate').value || undefined,
    Description: $('expDesc').value.trim(), Amount: amount, Payment_Mode: mode,
    Bank_Detail: mode === 'Bank' ? ($('expBank').value || '') : ''
  };
  if (expReceiptData) { payload.photoBase64 = expReceiptData.base64; payload.photoContentType = expReceiptData.type; }
  $('expDesc').value = ''; $('expAmount').value = '';
  try {
    await queueWrite('addExpense', payload);
    msg.textContent = '✅ Expense saved.';
    msg.hidden = false;
    clearExpReceipt_();
    loadExpenses();
  } catch (e) { toast(e.message, 'error'); }
}

/* ========================== 17. P&L ===================================== */
function pnlTable(title, p) {
  const rows = [
    ['Total Sales', money(p.Sales)], ['Order Profit (after cost)', money(p.Order_Profit)],
    ['Repair Income', money(p.Repair_Income)], ['Repair Profit (after parts cost)', money(p.Repair_Profit)],
    ['Total Expenses', money(p.Total_Expenses)], ['NET PROFIT', money(p.Net_Profit)],
    ['Cash received', money(p.Cash)], ['Bank received', money(p.Bank)], ['Wallet received', money(p.Wallet)]
  ];
  return '<div class="card"><h3>' + esc(title) + '</h3><table><tbody>' +
    rows.map(r => '<tr' + (r[0] === 'NET PROFIT' ? ' style="font-size:1.05rem"' : '') + '><td>' + esc(r[0]) + '</td><td><b>' + esc(r[1]) + '</b></td></tr>').join('') +
    '</tbody></table></div>';
}
async function loadPnL() {
  try {
    const d = await api('getPnL');
    state.pnl = d;
    const owing = state.customers.filter(c => num(c.Current_Credit_Balance) > 0);
    $('pnlBody').innerHTML = '<div class="pos-grid">' + pnlTable('📅 Today', d.today) + pnlTable('🗓️ This Month', d.thisMonth) + '</div>' +
      '<div class="cards-grid">' +
      statCard('Total Receivables — customers owe us', money(d.Total_Receivables), 'warn') +
      statCard('Total Payables — we owe suppliers', money(d.Total_Payables), 'warn') +
      statCard('Month Net Profit', money(d.thisMonth.Net_Profit), 'profit') + '</div>' +
      (owing.length ? '<div class="card"><h3>Customers with a balance (' + owing.length + ')</h3>' +
        owing.map(c => '<p>' + esc(c.Name) + ' — ' + esc(c.Phone) + ' — owes <b>' + money(c.Current_Credit_Balance) + '</b>' +
        (c.Payment_Due_Date ? ' • due ' + fmtDate(c.Payment_Due_Date) : '') +
        ' <a class="btn btn-whatsapp btn-sm" target="_blank" rel="noopener" href="' + esc(waLink(c.Phone, ledgerReminderText(c))) + '">📱 Remind</a></p>').join('') + '</div>' : '');
  } catch (e) { toast(e.message, 'error'); }
}

/* ========================== 18. BANNERS ================================= */
async function loadBanners() {
  try {
    const d = await api('getBanners');
    state.banners = d.banners || [];
    const wrap = $('banTableWrap');
    if (!state.banners.length) { wrap.innerHTML = '<p class="empty-msg">No active banners.</p>'; return; }
    wrap.innerHTML = '<table><thead><tr><th>ID</th><th>Section</th><th>Category</th><th>Poster</th><th>Badge</th><th>Order</th><th>Active</th><th>Actions</th></tr></thead><tbody>' +
      state.banners.map(b => '<tr><td>' + esc(b.Banner_ID) + '</td><td class="wrap"><b>' + esc(b.Section_Title) + '</b></td>' +
        '<td>' + esc(b.Target_Category) + '</td>' +
        '<td>' + (b.Poster_Image_URL ? '<a href="' + esc(b.Poster_Image_URL) + '" target="_blank" rel="noopener">View</a>' : '—') + '</td>' +
        '<td>' + esc(b.Badge_Text || '—') + '</td><td>' + num(b.Display_Order) + '</td>' +
        '<td>' + (isTrue(b.Active_Status) ? '✅' : '—') + '</td>' +
        '<td><span class="btn-row"><button type="button" class="btn btn-ghost btn-sm" data-edit-banner="' + esc(b.Banner_ID) + '">Edit</button>' +
        '<button type="button" class="btn btn-danger btn-sm" data-del-banner="' + esc(b.Banner_ID) + '">Delete</button></span></td></tr>').join('') +
      '</tbody></table>';
    wrap.querySelectorAll('[data-edit-banner]').forEach(x => x.addEventListener('click', () =>
      openBannerModal(state.banners.find(b => b.Banner_ID === x.getAttribute('data-edit-banner')))));
    wrap.querySelectorAll('[data-del-banner]').forEach(x => x.addEventListener('click', async () => {
      const id = x.getAttribute('data-del-banner');
      if (!confirm('Delete banner ' + id + '? This removes the row from the Banners sheet.')) return;
      try { await queueWrite('deleteBanner', { Banner_ID: id }); toast('Banner deleted.', 'success'); loadBanners(); } catch (e) {}
    }));
  } catch (e) { toast(e.message, 'error'); }
}
function openBannerModal(b) {
  fillSelectCoded($('bf_Target_Category'), 'Main_Category', state.lists.Main_Category, b ? b.Target_Category : 'Phones', false);
  $('bannerModalTitle').textContent = b ? 'Edit Banner — ' + b.Banner_ID : 'Add Banner';
  $('bf_Banner_ID').value = b ? b.Banner_ID : '';
  $('bf_Section_Title').value = b ? (b.Section_Title || '') : '';
  $('bf_Poster_Image_URL').value = b ? (b.Poster_Image_URL || '') : '';
  $('bf_Badge_Text').value = b ? (b.Badge_Text || '') : '';
  $('bf_Display_Order').value = b ? num(b.Display_Order) : state.banners.length + 1;
  $('bf_Active_Status').checked = b ? isTrue(b.Active_Status) : true;
  $('bannerError').hidden = true;
  $('bannerModal').hidden = false;
}
async function submitBannerForm(ev) {
  ev.preventDefault();
  const errBox = $('bannerError');
  errBox.hidden = true;
  const payload = {
    Section_Title: $('bf_Section_Title').value.trim(),
    Target_Category: $('bf_Target_Category').value,
    Poster_Image_URL: $('bf_Poster_Image_URL').value.trim(),
    Badge_Text: $('bf_Badge_Text').value.trim(),
    Display_Order: num($('bf_Display_Order').value),
    Active_Status: $('bf_Active_Status').checked
  };
  const id = $('bf_Banner_ID').value;
  if (id) payload.Banner_ID = id;
  try {
    await queueWrite('saveBanner', payload);
    $('bannerModal').hidden = true;
    toast('Banner saved.', 'success');
    loadBanners();
  } catch (e) { errBox.textContent = e.message; errBox.hidden = false; }
}

/* ========================== 19. WARRANTY ================================ */
async function loadWarranty() {
  try {
    const d = await api('getWarrantyPending');
    state.warranty = d.products || [];
    const wrap = $('warTableWrap');
    if (!state.warranty.length) { wrap.innerHTML = '<p class="empty-msg">🎉 No warranty checks pending.</p>'; return; }
    wrap.innerHTML = '<table><thead><tr><th>Product</th><th>IMEI</th><th>Added</th><th>Warranty Days</th><th>Expiry</th><th>Action</th></tr></thead><tbody>' +
      state.warranty.map(p => {
        const expiry = p.Added_Date ? new Date(new Date(p.Added_Date).getTime() + (num(p.Warranty_Days) || 30) * 86400000) : null;
        return '<tr><td class="wrap"><b>' + esc(p.Product_ID) + '</b> — ' + esc(productName(p)) + '</td>' +
          '<td>' + esc(p.IMEI_Serial || '—') + '</td><td>' + fmtDate(p.Added_Date) + '</td><td>' + num(p.Warranty_Days) + '</td>' +
          '<td>' + (expiry ? fmtDate(expiry) : '—') + '</td>' +
          '<td><button type="button" class="btn btn-primary btn-sm" data-war-check="' + esc(p.Product_ID) + '">✓ Mark Checked</button></td></tr>';
      }).join('') + '</tbody></table>';
    wrap.querySelectorAll('[data-war-check]').forEach(b => b.addEventListener('click', async () => {
      try {
        await queueWrite('markWarrantyChecked', { Product_ID: b.getAttribute('data-war-check') });
        toast('Marked as Checked — it will not appear in warranty reports again.', 'success');
        loadWarranty();
      } catch (e) {}
    }));
  } catch (e) { toast(e.message, 'error'); }
}

/* ==================== 20. SETTINGS & LAYOUT MANAGER ===================== */
const GROUP_LABELS = {
  Section_Order: '🏠 Homepage Section Order — use ↑ ↓ to change the order of sections on the website home page',
  Main_Category: 'Main Categories', Sub_Category: 'Sub Categories', Category_L3: 'Mazeed Categories (3rd Level)', Brand: 'Brands',
  RAM: 'RAM Options', Storage: 'Storage Options', PTA_Status: 'PTA Status Options',
  Network_Status: 'Network Status Options', Repair_Stage: 'Repair Stages',
  Customer_Comm_Status: 'Repair Communication Statuses', Product_Badge: 'Product Badges',
  Expense_Category: 'Expense Categories', Price_Tier: 'Price Tiers', Bank_Account: 'Bank Accounts',
  Payment_Method: 'Order Payment Methods', Payment_Mode: 'Ledger Payment Modes',
  Role: 'Staff Roles', Order_Status: 'Order Statuses', Sale_Channel: 'Sale Channels',
  Repair_Type: 'Repair Types', Party_Type: 'Ledger Party Types', Ledger_Type: 'Ledger Entry Types',
  Check_Status: 'Warranty Check Statuses', System: 'System (read-only here)',
  Drive_Folder: 'Drive Folders (system — do not edit)'
};
async function loadSettingsModule() {
  try {
    const d = await api('getSettingsAll');
    state.settingsAll = d.settings || {};
    applyListsFromSettings(state.settingsAll);
  } catch (e) { toast(e.message, 'error'); }
  const modeSel = $('bMode');
  if (modeSel && !modeSel.getAttribute('data-wired')) {
    modeSel.setAttribute('data-wired', '1');
    modeSel.addEventListener('change', () => { bState.mode = modeSel.value; renderBuilder(); });
  }
  const nlBtn = $('bNewListBtn');
  if (nlBtn && !nlBtn.getAttribute('data-wired')) {
    nlBtn.setAttribute('data-wired', '1');
    nlBtn.addEventListener('click', createSettingsList);
  }
  const codeGo = $('bCodeGo');
  if (codeGo && !codeGo.getAttribute('data-wired')) {
    codeGo.setAttribute('data-wired', '1');
    codeGo.addEventListener('click', () => { const inp = $('bCodeInput'); jumpToCode_(inp ? inp.value : ''); });
  }
  const codeIn = $('bCodeInput');
  if (codeIn && !codeIn.getAttribute('data-wired')) {
    codeIn.setAttribute('data-wired', '1');
    codeIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); jumpToCode_(codeIn.value); } });
  }
  const cols = $('bCols');
  if (cols && !cols.getAttribute('data-wired')) {
    cols.setAttribute('data-wired', '1');
    cols.addEventListener('click', builderClick_);
  }
  builderValidate_();
  renderBuilder();
}
function settingsRows(group) {
  return (state.settingsAll[group] || []).slice().sort((a, b) => num(a.order) - num(b.order));
}

/* ---------- Settings helpers: sub-category parents + rename/delete ---------- */
const SUB_PARENT_DEFAULTS = {
  'New Phones': 'Phones', 'Box Pack Phones': 'Phones', 'Used Phones': 'Phones', 'Mobile Phones': 'Phones',
  'Units': 'Parts', 'Sub-boards': 'Parts', 'Strips': 'Parts', 'OCA Glass': 'Parts',
  'Glass Protectors': 'Accessories', 'Back Covers': 'Accessories', 'Chargers': 'Accessories',
  'Handsfree': 'Accessories', 'Data Cables': 'Accessories'
};
function subParent_(row, productMap, mainSet) {
  const notes = String(row.notes || '');
  let parent = '';
  if (notes.indexOf('Under: ') === 0) parent = notes.slice(7).trim();
  if (!parent && productMap[row.value]) parent = productMap[row.value];
  if (!parent && SUB_PARENT_DEFAULTS[row.value]) parent = SUB_PARENT_DEFAULTS[row.value];
  return (parent && mainSet[parent]) ? parent : '';
}
async function settingsRenamePrompt_(group, value) {
  const nv = prompt('Rename "' + value + '" to:', value);
  if (!nv || nv.trim() === value) return;
  try {
    await queueWrite('saveSetting', { op: 'rename', Group: group, Value: value, NewValue: nv.trim() });
    toast('Renamed.', 'success');
    loadSettingsModule();
  } catch (e) {}
}
async function settingsDeleteConfirm_(group, value) {
  if (!confirm('Delete "' + value + '" from ' + group + '?\n\nProducts/jobs that already use this value keep it in their history, but it will disappear from dropdowns.')) return;
  try {
    await queueWrite('saveSetting', { op: 'delete', Group: group, Value: value });
    toast('Deleted.', 'success');
    loadSettingsModule();
  } catch (e) {}
}

/* ==================== Step-by-step Settings Builder ======================
   STEP 1: Page / List select → STEP 2/3/4: teen columns ek line mein.
   Categories mode: Main Category → Sub Category → Mazeed (Category_L3).
   Page modes + Baqi Lists: pehle list chunein, phir us ki values.        */
let bState = { mode: 'categories', main: '', sub: '', group: '' };
const BUILDER_PAGE_LISTS = {
  'page-mobile': ['Sub_Category', 'Brand', 'RAM', 'Storage', 'PTA_Status', 'Network_Status'],
  'page-parts': ['Sub_Category', 'Brand'],
  'page-accessories': ['Sub_Category', 'Brand']
};
const BUILDER_PAGE_INFO = {
  'page-mobile': 'Mobile page ke filters aur product form mein.',
  'page-parts': 'Parts page ke filters aur product form mein.',
  'page-accessories': 'Accessories page ke filters aur product form mein.'
};
function groupLabel_(g) { return GROUP_LABELS[g] || String(g).replace(/_/g, ' '); }

/* ---------- Builder codes: har list ka unique code + shortcut nishan ---------- */
const GROUP_CODES = {
  Main_Category: 'A', Sub_Category: 'B', Category_L3: 'C', Brand: 'D', RAM: 'E', Storage: 'F',
  PTA_Status: 'G', Network_Status: 'H', Price_Tier: 'I', Payment_Method: 'J', Payment_Mode: 'K',
  Expense_Category: 'L', Bank_Account: 'M', Repair_Stage: 'N', Order_Status: 'O', Sale_Channel: 'P',
  Product_Badge: 'Q', Customer_Comm_Status: 'R', Repair_Type: 'S', Party_Type: 'T', Ledger_Type: 'U',
  Check_Status: 'V', Section_Order: 'W', Role: 'X', System: 'Y', Drive_Folder: 'Z'
};
function groupCode_(g) {
  if (GROUP_CODES[g]) return GROUP_CODES[g];
  const unreg = Object.keys(state.settingsAll).filter(x => !GROUP_CODES[x]);
  const i = unreg.indexOf(g);
  return 'Z' + (1 + (i < 0 ? unreg.length : i));
}
function codeBadge_(code) { return code ? '<span class="code-badge" style="background:' + codeColor_(code) + '">' + esc(code) + '</span> ' : ''; }
/* Builder column ke title ke aage us group ke rang ka chhota dot. */
function bTitle_(id, text, letter) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = (letter ? '<span class="b-dot" style="background:' + codeColor_(letter) + '"></span>' : '') + esc(text);
}
/* Code quick-jump: Step 1 mein code likho (D, A2, A2.1, B3, Z1…) aur
   builder seedha usi list / category par le jata hai. */
function jumpToCode_(raw) {
  const code = String(raw || '').trim().toUpperCase();
  const m = code.match(/^([A-Z])(\d+)?(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!m) { toast('Code samajh nahi aaya — e.g. D, A2, A2.1 likhein', 'error'); return; }
  const letter = m[1];
  const n1 = m[2] ? parseInt(m[2], 10) : 0;
  const n2 = m[3] ? parseInt(m[3], 10) : 0;
  // Letter → group. Z-codes pehle check karein: 'Z1', 'Z2'… builder ki
  // unregistered (khud banayi hui) lists hain; sirf 'Z' = Drive_Folder.
  let group = '';
  if (letter === 'Z' && n1 >= 1) {
    const unreg = Object.keys(state.settingsAll).filter(x => !GROUP_CODES[x]);
    if (unreg[n1 - 1]) group = unreg[n1 - 1];
  }
  if (!group) group = Object.keys(GROUP_CODES).find(g => GROUP_CODES[g] === letter) || '';
  if (!group) { toast('Code "' + code + '" ki koi list nahi mili.', 'error'); return; }
  if (group === 'Category_L3') {
    toast('Mazeed Categories kisi Sub ke neeche hoti hain — pehle Categories mein wo Sub chunein', 'error');
    return;
  }
  if (group === 'Main_Category') {
    bState.mode = 'categories';
    if (n1 >= 1) {
      const mains = settingsRows('Main_Category');
      if (mains[n1 - 1]) {
        bState.main = mains[n1 - 1].value;
        bState.sub = '';
        if (n2 >= 1) {
          const subs = builderSubItems_(bState.main);
          if (subs[n2 - 1]) bState.sub = subs[n2 - 1].row.value;
        }
      } else { toast('Main Category #' + n1 + ' mojood nahi.', 'error'); return; }
    }
  } else if (group === 'Sub_Category') {
    bState.mode = 'categories';
    if (n1 >= 1) {
      const subs = settingsRows('Sub_Category');
      const row = subs[n1 - 1];
      if (!row) { toast('Sub Category #' + n1 + ' mojood nahi.', 'error'); return; }
      const parent = subParent_(row, builderProductMap_(), builderMainSet_());
      bState.main = parent || '__none__';
      bState.sub = row.value;
    }
  } else {
    bState.mode = 'all';
    bState.group = group;
  }
  const modeSel = $('bMode');
  if (modeSel) modeSel.value = bState.mode;
  renderBuilder();
  toast('Code ' + code + ' par aa gaye ✅');
}
function bHomeNoteHtml_(group) {
  const code = groupCode_(group);
  const style = ' style="border-left:5px solid ' + codeColor_(code) + '"';
  if (bState.mode === 'categories') {
    return '<div class="b-home-note"' + style + '>✅ Ye Asli Sub Categories hain (Code ' + code + ') — nayi sub category yahin add karein.</div>';
  }
  if (BUILDER_PAGE_LISTS[bState.mode]) {
    const jump = group === 'Sub_Category' ? 'categories' : 'all';
    return '<div class="b-home-note"' + style + '>🔗 Ye Shortcut hai — yahan se add/edit ki hui har cheez ASLI list (Code ' + code + ') mein hi save hoti hai — data kahin miss nahi hota. ' +
      '<button type="button" class="btn btn-ghost btn-sm" data-b-jump="' + jump + '">➡️ Asli List Par Jayein</button></div>';
  }
  return '<div class="b-home-note"' + style + '>✅ Ye Asli List hai (Code ' + code + ') — nayi entries yahin add karein.</div>';
}
function builderMainSet_() {
  const s = {};
  settingsRows('Main_Category').forEach(m => { s[m.value] = 1; });
  return s;
}
function builderProductMap_() {
  const map = {};
  (state.products || []).forEach(p => {
    if (p && p.Sub_Category && p.Main_Category && !map[p.Sub_Category]) map[p.Sub_Category] = p.Main_Category;
  });
  return map;
}
function builderSubItems_(main) {
  // main === '__none__' → wo subs jin ki koi Main Category nahi (unassigned)
  const subs = settingsRows('Sub_Category');
  const ms = builderMainSet_();
  const pm = builderProductMap_();
  const out = [];
  subs.forEach((r, gi) => {
    const p = subParent_(r, pm, ms);
    if (main === '__none__' ? !p : p === main) out.push({ row: r, gi: gi });
  });
  return out;
}
function builderValidate_() {
  const mains = settingsRows('Main_Category');
  if (bState.main && bState.main !== '__none__' && !mains.some(m => m.value === bState.main)) { bState.main = ''; bState.sub = ''; }
  if (bState.main && bState.sub) {
    if (!builderSubItems_(bState.main).some(it => it.row.value === bState.sub)) bState.sub = '';
  }
  if (!bState.main) bState.sub = '';
  if (bState.group && !state.settingsAll[bState.group]) bState.group = '';
}
function bActionBtns_(group, item, items, li, canEdit) {
  if (!canEdit) return '';
  const upG = li > 0 ? items[li - 1].gi : -1;
  const dnG = li < items.length - 1 ? items[li + 1].gi : -1;
  return '<button type="button" class="btn btn-ghost btn-sm" data-b-swap="' + item.gi + ',' + upG + '" data-b-group="' + esc(group) + '" ' + (li === 0 ? 'disabled' : '') + '>↑</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" data-b-swap="' + item.gi + ',' + dnG + '" data-b-group="' + esc(group) + '" ' + (li === items.length - 1 ? 'disabled' : '') + '>↓</button>' +
    '<button type="button" class="btn btn-ghost btn-sm icon-btn" title="Rename" aria-label="Rename" data-b-rename="' + esc(item.row.value) + '" data-b-group="' + esc(group) + '">✏️</button>' +
    '<button type="button" class="btn btn-danger btn-sm icon-btn" title="Delete" aria-label="Delete" data-b-del="' + esc(item.row.value) + '" data-b-group="' + esc(group) + '">🗑</button>';
}
function bValueRowsHtml_(group, items, canEdit, hideNotes, codeFn, rowPrefix) {
  return items.map((item, li) =>
    '<div class="b-row"><span class="grow">' + (rowPrefix || '') + codeBadge_(codeFn ? codeFn(item, li) : '') + esc(item.row.value) +
    (!hideNotes && item.row.notes ? ' <span class="muted small">— ' + esc(item.row.notes) + '</span>' : '') + '</span>' +
    bActionBtns_(group, item, items, li, canEdit) + '</div>').join('');
}
function bSelRow_(kind, group, item, items, li, selected, canEdit, extraLabel, code) {
  return '<div class="b-row b-sel' + (selected ? ' selected' : '') + '" data-b-sel="' + kind + '" data-b-value="' + esc(item.row.value) + '">' +
    '<span class="grow">' + codeBadge_(code) + esc(item.row.value) + (extraLabel || '') + '</span>' +
    bActionBtns_(group, item, items, li, canEdit) + '</div>';
}
function bAddHtml_(group, placeholder, notes) {
  return '<div class="b-add"><input type="text" placeholder="' + esc(placeholder) + '">' +
    '<button type="button" class="btn btn-primary btn-sm" data-b-add="' + esc(group) + '"' +
    (notes ? ' data-b-notes="' + esc(notes) + '"' : '') + '>➕ Add</button></div>';
}
async function builderReorder_(group, arr) {
  try {
    await queueWrite('saveSetting', { op: 'reorder', Group: group, Values: arr.map(r => r.value) });
    state.settingsAll[group] = arr.map((r, i) => Object.assign({}, r, { order: i + 1 }));
    applyListsFromSettings(state.settingsAll);
    toast('Order saved.', 'success');
    renderBuilder();
  } catch (e) { /* queue toasted */ }
}
function builderSwap_(group, gi, gj) {
  if (gj < 0 || gi === gj) return;
  const arr = settingsRows(group);
  if (!arr[gi] || !arr[gj]) return;
  const tmp = arr[gi]; arr[gi] = arr[gj]; arr[gj] = tmp;
  builderReorder_(group, arr);
}
async function builderAdd_(btn) {
  const input = btn.parentElement ? btn.parentElement.querySelector('input') : null;
  const v = input ? input.value.trim() : '';
  if (!v) { toast('Pehle value likhein.', 'error'); return; }
  const payload = { op: 'add', Group: btn.getAttribute('data-b-add'), Value: v };
  const notes = btn.getAttribute('data-b-notes');
  if (notes) payload.Notes = notes;
  try {
    await queueWrite('saveSetting', payload);
    if (BUILDER_PAGE_LISTS[bState.mode]) {
      toast('✅ Asli list mein save ho gaya (Code ' + groupCode_(payload.Group) + ')', 'success');
    } else {
      toast('Added "' + v + '".', 'success');
    }
    loadSettingsModule();
  } catch (e) {}
}
function builderClick_(e) {
  const t = e.target;
  if (!t || !t.closest) return;
  const swap = t.closest('[data-b-swap]');
  if (swap) {
    const p = String(swap.getAttribute('data-b-swap')).split(',');
    builderSwap_(swap.getAttribute('data-b-group'), num(p[0]), num(p[1]));
    return;
  }
  const ren = t.closest('[data-b-rename]');
  if (ren) { settingsRenamePrompt_(ren.getAttribute('data-b-group'), ren.getAttribute('data-b-rename')); return; }
  const del = t.closest('[data-b-del]');
  if (del) { settingsDeleteConfirm_(del.getAttribute('data-b-group'), del.getAttribute('data-b-del')); return; }
  const add = t.closest('[data-b-add]');
  if (add) { builderAdd_(add); return; }
  const jump = t.closest('[data-b-jump]');
  if (jump) {
    if (jump.getAttribute('data-b-jump') === 'categories') {
      bState.mode = 'categories';
      const mains = settingsRows('Main_Category');
      bState.main = mains.some(m => m.value === 'Phones') ? 'Phones' : (mains.length ? mains[0].value : '');
      bState.sub = '';
    } else {
      bState.mode = 'all'; // bState.group pehle se wahi group hai — asli list wahan khul jayegi
    }
    renderBuilder();
    return;
  }
  const sel = t.closest('[data-b-sel]');
  if (sel) {
    const kind = sel.getAttribute('data-b-sel');
    const val = sel.getAttribute('data-b-value');
    if (kind === 'main') { bState.main = val; bState.sub = ''; }
    else if (kind === 'sub') { bState.sub = val; }
    else if (kind === 'group') { bState.group = val; }
    renderBuilder();
  }
}
function renderBuilder() {
  const c1 = $('bCol1'), c2 = $('bCol2'), c3 = $('bCol3');
  if (!c1 || !c2 || !c3) return;
  const modeSel = $('bMode');
  if (modeSel && modeSel.value !== bState.mode) modeSel.value = bState.mode;
  if (bState.mode === 'categories') renderBuilderCategories_(c1, c2, c3);
  else if (BUILDER_PAGE_LISTS[bState.mode]) renderBuilderPage_(c1, c2, c3);
  else renderBuilderAll_(c1, c2, c3);
}
function renderBuilderCategories_(c1, c2, c3) {
  const canEdit = can('saveSetting');
  const mains = settingsRows('Main_Category');
  const mainItems = mains.map((r, i) => ({ row: r, gi: i }));
  bTitle_('bCol1Title', 'STEP 2 — Main Category', 'A');
  const mainLetter = groupCode_('Main_Category');
  const mainPos = mainItems.findIndex(it => it.row.value === bState.main);
  const mainCode = bState.main === '__none__' ? '' : (mainPos > -1 ? mainLetter + (mainPos + 1) : '');
  let h = mainItems.map((item, li) =>
    bSelRow_('main', 'Main_Category', item, mainItems, li, bState.main === item.row.value, canEdit,
      ' <span class="muted small">(' + builderSubItems_(item.row.value).length + ' subs)</span>',
      mainLetter + (li + 1))).join('');
  const unassigned = builderSubItems_('__none__');
  if (unassigned.length) {
    h += '<div class="b-row b-sel' + (bState.main === '__none__' ? ' selected' : '') + '" data-b-sel="main" data-b-value="__none__">' +
      '<span class="grow">📌 General / Unassigned <span class="muted small">(' + unassigned.length + ' subs)</span></span></div>';
  }
  if (!mainItems.length && !unassigned.length) h = '<p class="b-hint">Abhi koi Main Category nahi — neeche se add karein.</p>';
  if (canEdit) h += bAddHtml_('Main_Category', 'Nayi Main Category likhein…', '');
  c1.innerHTML = h;

  bTitle_('bCol2Title', 'STEP 3 — Sub Categories' +
    (bState.main === '__none__' ? ' (General)' : (bState.main ? ' of ' + bState.main : '')), 'B');
  if (!bState.main) {
    c2.innerHTML = '<p class="b-hint">👈 Pehle Step 2 se ek Main Category chunein</p>';
  } else {
    const items = builderSubItems_(bState.main);
    const subCodeAt = li => bState.main === '__none__' ? groupCode_('Sub_Category') + (li + 1) : mainCode + '.' + (li + 1);
    let h2 = bHomeNoteHtml_('Sub_Category') + items.map((item, li) =>
      bSelRow_('sub', 'Sub_Category', item, items, li, bState.sub === item.row.value, canEdit, '', subCodeAt(li))).join('');
    if (!items.length) h2 += '<p class="b-hint">Abhi is Main Category mein koi Sub Category nahi — neeche se add karein.</p>';
    if (canEdit) h2 += bAddHtml_('Sub_Category', 'Nayi Sub Category likhein…', bState.main === '__none__' ? '' : 'Under: ' + bState.main);
    c2.innerHTML = h2;
  }

  bTitle_('bCol3Title', 'STEP 4 — Mazeed Categories' + (bState.sub ? ' of ' + bState.sub : ''), 'C');
  if (!bState.sub) {
    c3.innerHTML = '<p class="b-hint">👈 Pehle Step 3 se ek Sub Category chunein</p>';
    return;
  }
  const items = [];
  settingsRows('Category_L3').forEach((r, gi) => {
    if (String(r.notes || '') === 'Under: ' + bState.sub) items.push({ row: r, gi: gi });
  });
  const subItemsForCode = builderSubItems_(bState.main);
  const subPosForCode = subItemsForCode.findIndex(it => it.row.value === bState.sub);
  const selSubCode = bState.main === '__none__'
    ? groupCode_('Sub_Category') + (subPosForCode + 1)
    : mainCode + '.' + (subPosForCode + 1);
  let h3 = bValueRowsHtml_('Category_L3', items, canEdit, true, (item, li) => selSubCode + '.' + (li + 1));
  if (!items.length) h3 = '<p class="b-hint">Abhi koi mazeed category nahi — neeche se add karein.</p>';
  if (canEdit) h3 += bAddHtml_('Category_L3', 'Mazeed category likhein…', 'Under: ' + bState.sub);
  c3.innerHTML = h3;
}
function renderBuilderGroupCol_(c2, c3, infoText) {
  const group = bState.group;
  const isPageMode = !!BUILDER_PAGE_LISTS[bState.mode];
  bTitle_('bCol3Title', 'STEP 4 — Maloomat', group ? groupCode_(group) : '');
  let info = '<div class="b-info"><p>👀 <b>Ye list website par kahan nazar aati hai</b></p>' +
    '<p class="small">' + esc(infoText || '') + '</p>';
  if (group === 'Sub_Category' && isPageMode) {
    info += '<p class="small">Is page par sirf is page ki categories ke products nazar aate hain.</p>';
  }
  c3.innerHTML = info + '</div>';
  if (!group) {
    bTitle_('bCol2Title', 'STEP 3 — List ki Values', '');
    c2.innerHTML = '<p class="b-hint">👈 Pehle Step 2 se ek list chunein</p>';
    return;
  }
  const readOnly = group === 'Drive_Folder' || group === 'System';
  const canEdit = can('saveSetting') && !readOnly;
  bTitle_('bCol2Title', 'STEP 3 — ' + groupLabel_(group), groupCode_(group));
  const rows = settingsRows(group);
  const items = rows.map((r, i) => ({ row: r, gi: i }));
  const rowPrefix = isPageMode ? '<span class="shortcut-badge" title="Shortcut">🔗</span> ' : '';
  let h = bHomeNoteHtml_(group) + bValueRowsHtml_(group, items, canEdit, false, (item, li) => groupCode_(group) + (li + 1), rowPrefix);
  if (!rows.length) h += '<p class="b-hint">Ye list abhi khaali hai — neeche se pehli value add karein.</p>';
  if (group === 'Sub_Category') h += '<p class="small muted b-note">Note: Sub Categories ki Main Category ke saath jod 🏷️ Categories wale Step 1 se hoti hai.</p>';
  if (readOnly) h += '<p class="small muted b-note">Ye list system chalata hai (Setup.gs / triggers) — sirf dekhne ke liye hai.</p>';
  if (canEdit) h += bAddHtml_(group, isPageMode
    ? 'Yahan add karein — asli list (Code ' + groupCode_(group) + ') mein save hoga…'
    : 'Add a new value to ' + groupLabel_(group) + '…', '');
  c2.innerHTML = h;
}
function renderBuilderPage_(c1, c2, c3) {
  const groups = BUILDER_PAGE_LISTS[bState.mode] || [];
  if (bState.group && groups.indexOf(bState.group) === -1) bState.group = '';
  $('bCol1Title').textContent = 'STEP 2 — Is Page ke Dropdowns';
  let h = groups.map(g =>
    '<div class="b-row b-sel' + (bState.group === g ? ' selected' : '') + '" data-b-sel="group" data-b-value="' + esc(g) + '">' +
    '<span class="grow">' + codeBadge_(groupCode_(g)) + esc(groupLabel_(g)) + ' <span class="muted small">(' + (state.settingsAll[g] || []).length + ')</span> <span class="shortcut-badge">🔗 Shortcut</span></span></div>').join('');
  h += '<p class="small muted b-note">Nayi list banani ho to upar ➕ Nayi List Banayein dabayein — wo 📋 Baqi Saari Lists mein milegi.</p>';
  c1.innerHTML = h;
  renderBuilderGroupCol_(c2, c3, BUILDER_PAGE_INFO[bState.mode]);
}
function renderBuilderAll_(c1, c2, c3) {
  const skip = { Main_Category: 1, Sub_Category: 1, Category_L3: 1 };
  const groups = Object.keys(state.settingsAll).filter(g => !skip[g]);
  if (bState.group && (skip[bState.group] || groups.indexOf(bState.group) === -1)) bState.group = '';
  $('bCol1Title').textContent = 'STEP 2 — Saari Lists';
  let h = groups.map(g =>
    '<div class="b-row b-sel' + (bState.group === g ? ' selected' : '') + '" data-b-sel="group" data-b-value="' + esc(g) + '">' +
    '<span class="grow">' + codeBadge_(groupCode_(g)) + esc(groupLabel_(g)) + ' <span class="muted small">(' + (state.settingsAll[g] || []).length + ')</span></span></div>').join('');
  if (!groups.length) h = '<p class="b-hint">Abhi koi list nahi.</p>';
  c1.innerHTML = h;
  renderBuilderGroupCol_(c2, c3, 'Ye list system ke mukhtalif hisson mein dropdown ke tor par istemal hoti hai.');
}
async function createSettingsList() {
  const name = prompt('Nayi dropdown list ka naam likhein (e.g. Phone Condition):');
  if (!name || !name.trim()) return;
  const key = name.trim().replace(/\s+/g, '_');
  if (state.settingsAll[key]) { toast('"' + key.replace(/_/g, ' ') + '" list pehle se mojood hai.', 'error'); return; }
  const value = prompt('Is list ki pehli value likhein:');
  if (!value || !value.trim()) return;
  try {
    await queueWrite('saveSetting', { op: 'add', Group: key, Value: value.trim() });
    toast('Nayi list "' + key.replace(/_/g, ' ') + '" ban gayi.', 'success');
    bState.mode = 'all';
    bState.group = key;
    loadSettingsModule();
  } catch (e) {}
}

/* ========================== 21. USERS & ROLES =========================== */
async function loadUsers() {
  try {
    const d = await api('getUsers');
    state.users = d.users || [];
    const wrap = $('usrTableWrap');
    if (!state.users.length) { wrap.innerHTML = '<p class="empty-msg">No staff accounts.</p>'; return; }
    wrap.innerHTML = '<table><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Actions</th></tr></thead><tbody>' +
      state.users.map(u => '<tr><td>' + esc(u.Staff_ID) + '</td><td class="wrap"><b>' + esc(u.Name) + '</b></td>' +
        '<td>' + esc(u.Email) + '</td>' +
        '<td><span class="pill ' + (u.Role === 'Owner' ? 'red' : 'blue') + '">' + esc(u.Role) + '</span></td>' +
        '<td>' + (isTrue(u.Active_Status) ? '✅ Active' : '🚫 Inactive') + '</td>' +
        '<td><span class="btn-row"><button type="button" class="btn btn-ghost btn-sm" data-edit-user="' + esc(u.Staff_ID) + '">Edit</button>' +
        (isTrue(u.Active_Status) ? '<button type="button" class="btn btn-danger btn-sm" data-del-user="' + esc(u.Staff_ID) + '">Deactivate</button>' : '') +
        '</span></td></tr>').join('') + '</tbody></table>';
    wrap.querySelectorAll('[data-edit-user]').forEach(b => b.addEventListener('click', () =>
      openUserModal(state.users.find(u => u.Staff_ID === b.getAttribute('data-edit-user')))));
    wrap.querySelectorAll('[data-del-user]').forEach(b => b.addEventListener('click', async () => {
      const id = b.getAttribute('data-del-user');
      if (!confirm('Deactivate staff account ' + id + '?\n\nSoft delete: the person can no longer log in, but the record stays. The backend refuses to deactivate the last active Owner.')) return;
      try { await queueWrite('deleteUser', { Staff_ID: id }); toast('Account deactivated.', 'success'); loadUsers(); } catch (e) {}
    }));
  } catch (e) { toast(e.message, 'error'); }
}
function openUserModal(u) {
  fillSelect($('uf_Role'), STAFF_ROLES, u ? u.Role : 'Staff', false);
  $('userModalTitle').textContent = u ? 'Edit Staff — ' + u.Staff_ID : 'Add Staff';
  $('uf_Staff_ID').value = u ? u.Staff_ID : '';
  $('uf_Name').value = u ? (u.Name || '') : '';
  $('uf_Email').value = u ? (u.Email || '') : '';
  $('uf_Password').value = '';
  $('uf_Password').placeholder = u ? 'Leave blank to keep the current password' : 'Required for new staff (min 8 characters)';
  $('uf_Active_Status').checked = u ? isTrue(u.Active_Status) : true;
  $('userError').hidden = true;
  $('userModal').hidden = false;
}
async function submitUserForm(ev) {
  ev.preventDefault();
  const errBox = $('userError');
  errBox.hidden = true;
  const payload = {
    Name: $('uf_Name').value.trim(), Email: $('uf_Email').value.trim(),
    Role: $('uf_Role').value, Active_Status: $('uf_Active_Status').checked
  };
  const id = $('uf_Staff_ID').value;
  if (id) payload.Staff_ID = id;
  const pw = $('uf_Password').value;
  if (pw) payload.password = pw;
  try {
    await queueWrite('saveUser', payload);
    $('userModal').hidden = true;
    toast('Staff account saved.', 'success');
    loadUsers();
  } catch (e) { errBox.textContent = e.message; errBox.hidden = false; }
}

/* ==================== 22. INVOICES + WHATSAPP =========================== */
function invoiceWaText(type, inv, customer) {
  if (type === 'repair') {
    return 'Assalam-o-Alaikum, your repair invoice from ' + CONFIG.SHOP_NAME + ':\nJob ID: ' + inv.Job_ID +
      '\nDevice: ' + (inv.Device || '') + '\nTotal: ' + money(inv.Total_Amount) + '\nPaid: ' + money(inv.Advance_Paid) +
      '\nBalance due: ' + money(inv.Balance_Due) + '\nStatus: ' + (inv.Current_Stage || '') + '\nThank you!';
  }
  const items = (inv.Items || []).map(i => '• ' + (i.Brand || '') + ' ' + (i.Model || '') + ' ×' + num(i.Qty) + ' — ' + money(i.Line_Total)).join('\n');
  return 'Assalam-o-Alaikum, your invoice from ' + CONFIG.SHOP_NAME + ':\nOrder: ' + inv.Order_ID + '\n' + items +
    '\nTotal: ' + money(inv.Total_Amount) + '\nPayment: ' + (inv.Payment_Method || '') + '\nThank you for shopping with us!' +
    (customer && customer.Name ? '\n(' + customer.Name + ')' : '');
}
async function showInvoice(type, id) {
  try {
    const d = await api('getInvoiceData', { type: type, id: id });
    const inv = d.invoice || {};
    const shop = (d.shop && d.shop.name) || CONFIG.SHOP_NAME;
    const qrId = type === 'repair' ? inv.Job_ID : inv.Order_ID;
    let h = '<div class="inv-head"><div><h2>' + esc(shop) + '</h2>' +
      '<p class="muted" style="margin:.2rem 0">Sales &amp; Repair Services</p></div>' +
      '<div class="inv-qr"><img alt="QR code for ' + esc(qrId) + '" src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' +
      encodeURIComponent(qrId) + '"><div class="small"><b>' + esc(qrId) + '</b></div></div></div>';
    if (type === 'repair') {
      h += '<p><b>Customer:</b> ' + esc(inv.Customer_Name) + ' • ' + esc(inv.Customer_Phone) + '<br>' +
        '<b>Device:</b> ' + esc(inv.Device) + (inv.IMEI_Serial ? ' • IMEI ' + esc(inv.IMEI_Serial) : '') + '<br>' +
        '<b>Issue:</b> ' + esc(inv.Issue) + '<br><b>Date:</b> ' + fmtDate(inv.Date) + ' • <b>Stage:</b> ' + esc(inv.Current_Stage) + '</p>';
      const parts = inv.Parts || [];
      if (parts.length) {
        h += '<table><thead><tr><th>Part</th><th>Qty</th><th>Amount</th></tr></thead><tbody>' +
          parts.map(p => '<tr><td>' + esc(p.Product_ID) + ' — ' + esc(p.Model || '') + '</td><td>' + num(p.Qty) + '</td><td>' + money(p.Line_Cost) + '</td></tr>').join('') + '</tbody></table>';
      }
      h += '<table><tbody>' +
        '<tr><td>Parts Cost</td><td>' + money(inv.Parts_Cost) + '</td></tr>' +
        '<tr><td>Service Charges</td><td>' + money(inv.Service_Charges) + '</td></tr>' +
        '<tr class="inv-total"><td>Total</td><td>' + money(inv.Total_Amount) + '</td></tr>' +
        '<tr><td>Paid</td><td>' + money(inv.Advance_Paid) + '</td></tr>' +
        '<tr class="inv-total"><td>Balance Due</td><td>' + money(inv.Balance_Due) + '</td></tr></tbody></table>';
    } else {
      const cust = inv.Customer;
      h += '<p><b>Customer:</b> ' + (cust ? esc(cust.Name) + ' • ' + esc(cust.Phone) : 'Walk-in Guest') + '<br>' +
        '<b>Date:</b> ' + fmtDate(inv.Date) + ' • <b>Channel:</b> ' + esc(inv.Sale_Channel) +
        ' • <b>Payment:</b> ' + esc(inv.Payment_Method) + ' • <b>Status:</b> ' + esc(inv.Order_Status) +
        (inv.Warranty_Expiry_Date ? '<br><b>Warranty Expiry:</b> ' + fmtDate(inv.Warranty_Expiry_Date) : '') + '</p>';
      h += '<table><thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead><tbody>' +
        (inv.Items || []).map(i => '<tr><td>' + esc((i.Brand || '') + ' ' + (i.Model || '')) + (i.IMEI_Serial ? '<br><span class="small muted">IMEI ' + esc(i.IMEI_Serial) + '</span>' : '') + '</td><td>' + num(i.Qty) + '</td><td>' + money(i.Unit_Price) + '</td><td>' + money(i.Line_Total) + '</td></tr>').join('') +
        '</tbody></table>' +
        '<table><tbody><tr class="inv-total"><td>Total</td><td>' + money(inv.Total_Amount) + '</td></tr></tbody></table>' +
        (inv.Tracking_Notes ? '<p class="muted">Notes: ' + esc(inv.Tracking_Notes) + '</p>' : '');
    }
    h += '<p class="thanks">Thank you for choosing ' + esc(shop) + '! 🙏<br>Please keep this invoice for warranty claims.</p>';
    $('invoiceSheet').innerHTML = h;
    $('invoiceModal').hidden = false;
  } catch (e) { toast(e.message, 'error'); }
}

/* ==================== Static selects + INIT ============================= */
function fillStaticSelects() {
  // Re-fill the small static selects from the (possibly refreshed) lists.
  fillSelectCoded($('posPayment'), 'Payment_Method', state.lists.Payment_Method, $('posPayment').value || 'Cash', false);
  fillSelectCoded($('purPaymentMode'), 'Payment_Mode', state.lists.Payment_Mode, $('purPaymentMode').value || 'Cash', false);
  fillSelectCoded($('supPayMode'), 'Payment_Mode', state.lists.Payment_Mode, $('supPayMode').value || 'Cash', false);
  fillSelectCoded($('rc_Type'), 'Repair_Type', state.lists.Repair_Type, $('rc_Type').value || 'Hardware', false);
  fillSelectCoded($('ledPartyType'), 'Party_Type', state.lists.Party_Type, $('ledPartyType').value || 'Customer', false);
  fillSelectCoded($('ledType'), 'Ledger_Type', state.lists.Ledger_Type, $('ledType').value || 'Credit', false);
  fillSelectCoded($('ledMode'), 'Payment_Mode', state.lists.Payment_Mode, $('ledMode').value || 'Cash', false);
  fillSelectCoded($('expCategory'), 'Expense_Category', state.lists.Expense_Category, $('expCategory').value || 'Misc', false);
  fillSelectCoded($('expMode'), 'Payment_Mode', state.lists.Payment_Mode, $('expMode').value || 'Cash', false);
  fillSelectCoded($('retAction'), 'RMA_Action', state.lists.RMA_Action, $('retAction').value || 'Refund', false);
  fillSelectCoded($('retCondition'), 'Stock_Condition', state.lists.Stock_Condition, $('retCondition').value || 'Resellable', false);
}
function bindEvents() {
  $('loginForm').addEventListener('submit', handleLogin);
  $('logoutBtn').addEventListener('click', () => doLogout(false));
  $('menuBtn').addEventListener('click', () => {
    $('sidebar').classList.add('open');
    $('sidebarBackdrop').hidden = false;
  });
  $('sidebarBackdrop').addEventListener('click', closeSidebarMobile);
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
    const m = document.getElementById(b.getAttribute('data-close'));
    if (m) m.hidden = true;
  }));
  $('dashRefresh').addEventListener('click', loadDashboard);
  $('pnlRefresh').addEventListener('click', loadPnL);
  $('warRefresh').addEventListener('click', loadWarranty);
  $('ordRefresh').addEventListener('click', loadOrders);
  // POS
  $('posScan').addEventListener('input', handlePosScanInput);
  $('posScan').addEventListener('keydown', handlePosScanEnter);
  $('posCameraBtn').addEventListener('click', startCameraScan);
  $('posCameraStop').addEventListener('click', stopCameraScan);
  $('posCustomerSel').addEventListener('change', () => {
    state.posCustomerId = $('posCustomerSel').value;
    updatePosCustomerInfo(); renderPosLines();
  });
  $('posPayment').addEventListener('change', () => {
    $('posDueDateWrap').hidden = $('posPayment').value !== 'Credit';
  });
  $('posCheckoutBtn').addEventListener('click', posCheckout);
  // Inventory
  $('invSearch').addEventListener('input', () => loadInventory());
  $('invCategory').addEventListener('change', loadInventory);
  $('invLowOnly').addEventListener('change', loadInventory);
  $('invAddBtn').addEventListener('click', () => { if (guard('addProduct')) openProductModal(null); });
  $('productForm').addEventListener('submit', submitProductForm);
  // Purchases
  $('purAddItemBtn').addEventListener('click', addPurchaseRow);
  $('purSubmit').addEventListener('click', submitPurchase);
  $('supPayBtn').addEventListener('click', submitSupplierPayment);
  // Orders
  $('ordStatusFilter').addEventListener('change', loadOrders);
  // Returns
  $('retSubmit').addEventListener('click', submitReturn);
  // Repairs
  $('repSearch').addEventListener('input', loadRepairs);
  $('repStageFilter').addEventListener('change', loadRepairs);
  $('repNewBtn').addEventListener('click', () => { $('repCreateWrap').hidden = !$('repCreateWrap').hidden; });
  $('rcSubmit').addEventListener('click', submitRepairJob);
  $('rdClose').addEventListener('click', closeRepairDrawer);
  $('drawerBackdrop').addEventListener('click', closeRepairDrawer);
  // Customers
  $('cusSearch').addEventListener('input', loadCustomers);
  $('cusAddBtn').addEventListener('click', () => { if (guard('saveCustomer')) openCustomerModal(null); });
  $('customerForm').addEventListener('submit', submitCustomerForm);
  const photoFileEl = $('cf_PhotoFile');
  if (photoFileEl) photoFileEl.addEventListener('change', () => {
    const f = photoFileEl.files && photoFileEl.files[0];
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) { toast('Photo 3MB se chhoti rakhein.', 'error'); photoFileEl.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      customerPhotoData = { base64: dataUrl.split(',')[1] || '', type: f.type || 'image/jpeg' };
      const pv = $('cf_PhotoPreview');
      if (pv) { pv.src = dataUrl; pv.hidden = false; }
      toast('📷 Photo tayyar hai — Save dabane par profile mein lag jayegi.', 'success');
    };
    reader.readAsDataURL(f);
  });
  const gPhotoFileEl = $('cf_GPhotoFile');
  if (gPhotoFileEl) gPhotoFileEl.addEventListener('change', () => {
    const f = gPhotoFileEl.files && gPhotoFileEl.files[0];
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) { toast('Photo 3MB se chhoti rakhein.', 'error'); gPhotoFileEl.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      customerGuarantorPhotoData = { base64: dataUrl.split(',')[1] || '', type: f.type || 'image/jpeg' };
      const pv = $('cf_GPhotoPreview');
      if (pv) { pv.src = dataUrl; pv.hidden = false; }
      toast('📷 Guarantor ki photo tayyar hai — Save dabane par lag jayegi.', 'success');
    };
    reader.readAsDataURL(f);
  });
  const cnicFrontFileEl = $('cf_CnicFrontFile');
  if (cnicFrontFileEl) cnicFrontFileEl.addEventListener('change', () => {
    const f = cnicFrontFileEl.files && cnicFrontFileEl.files[0];
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) { toast('Photo 3MB se chhoti rakhein.', 'error'); cnicFrontFileEl.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      customerCnicFrontData = { base64: dataUrl.split(',')[1] || '', type: f.type || 'image/jpeg' };
      const pv = $('cf_CnicFrontPreview');
      if (pv) { pv.src = dataUrl; pv.hidden = false; }
      toast('🪪 CNIC front ki photo tayyar hai — Save dabane par lag jayegi.', 'success');
    };
    reader.readAsDataURL(f);
  });
  const cnicBackFileEl = $('cf_CnicBackFile');
  if (cnicBackFileEl) cnicBackFileEl.addEventListener('change', () => {
    const f = cnicBackFileEl.files && cnicBackFileEl.files[0];
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) { toast('Photo 3MB se chhoti rakhein.', 'error'); cnicBackFileEl.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      customerCnicBackData = { base64: dataUrl.split(',')[1] || '', type: f.type || 'image/jpeg' };
      const pv = $('cf_CnicBackPreview');
      if (pv) { pv.src = dataUrl; pv.hidden = false; }
      toast('🪪 CNIC back ki photo tayyar hai — Save dabane par lag jayegi.', 'success');
    };
    reader.readAsDataURL(f);
  });
  // Registration System filters
  document.querySelectorAll('#regChips [data-reg-filter]').forEach(b => b.addEventListener('click', () => {
    regFilter = b.getAttribute('data-reg-filter');
    document.querySelectorAll('#regChips [data-reg-filter]').forEach(x => x.classList.toggle('active', x === b));
    renderCustomers();
  }));
  // Ledger
  $('ledPartyType').addEventListener('change', refreshLedgerPartyOptions);
  $('ledLoadBtn').addEventListener('click', loadLedger);
  $('ledAddBtn').addEventListener('click', submitLedgerEntry);
  $('ledWaBtn').addEventListener('click', ledgerWhatsApp);
  $('ledAddKhata').addEventListener('click', openKhataNew_);
  $('ledSearch').addEventListener('input', renderLedgerCustList_);
  document.querySelectorAll('#ledFilters [data-led-filter]').forEach(b => b.addEventListener('click', () => {
    ledFilterKind = b.getAttribute('data-led-filter');
    document.querySelectorAll('#ledFilters [data-led-filter]').forEach(x => x.classList.toggle('active', x === b));
    renderLedgerCustList_();
  }));
  const ledTgl = $('ledToggleClear');
  if (ledTgl) ledTgl.addEventListener('click', () => { ledShowClear = !ledShowClear; renderLedgerCustList_(); });
  $('knBack').addEventListener('click', () => showModule('ledger'));
  $('knSave').addEventListener('click', submitKhataNew_);
  knWirePhoto_($('kn_PhotoFile'), $('kn_PhotoPreview'), 'profile');
  knWirePhoto_($('kn_CnicFrontFile'), $('kn_CnicFrontPreview'), 'cnicFront');
  knWirePhoto_($('kn_CnicBackFile'), $('kn_CnicBackPreview'), 'cnicBack');
  knWirePhoto_($('kn_GPhotoFile'), $('kn_GPhotoPreview'), 'guarantor');
  // Expenses
  $('expAddBtn').addEventListener('click', submitExpense);
  $('expMode').addEventListener('change', syncExpBank_);
  $('expCatAdd').addEventListener('click', () => expAddSettingValue_('Expense_Category', 'Nayi expense category likhein:', $('expCategory')));
  $('expModeAdd').addEventListener('click', () => expAddSettingValue_('Payment_Mode', 'Naya payment mode likhein:', $('expMode')));
  $('expBankAdd').addEventListener('click', expAddBank_);
  const expReceiptEl = $('expReceipt');
  if (expReceiptEl) expReceiptEl.addEventListener('change', () => {
    const f = expReceiptEl.files && expReceiptEl.files[0];
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) { toast('Photo 3MB se chhoti rakhein.', 'error'); expReceiptEl.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      expReceiptData = { base64: dataUrl.split(',')[1] || '', type: f.type || 'image/jpeg' };
      const pv = $('expReceiptPreview');
      if (pv) { pv.src = dataUrl; pv.hidden = false; }
      toast('🧾 Receipt photo tayyar hai — Save dabane par attach ho jayegi.', 'success');
    };
    reader.readAsDataURL(f);
  });
  // Banners / Users
  $('banAddBtn').addEventListener('click', () => { if (guard('saveBanner')) openBannerModal(null); });
  $('bannerForm').addEventListener('submit', submitBannerForm);
  $('bannerModalTitle').textContent = 'Add Banner';
  $('usrAddBtn').addEventListener('click', () => { if (guard('saveUser')) openUserModal(null); });
  $('userForm').addEventListener('submit', submitUserForm);
  $('userModalTitle').textContent = 'Add Staff';
  // Invoice
  $('invoicePrintBtn').addEventListener('click', () => window.print());
}
function init() {
  if (DEMO_MODE) {
    $('demoBadgeLogin').hidden = false;
    $('demoLoginHint').hidden = false;
  }
  fillStaticSelects();
  bindEvents();
  if (state.token && state.user) {
    enterPanel();
  }
}
document.addEventListener('DOMContentLoaded', init);
