/* ==========================================================================
   Sulehri Mobile — Public Storefront (Phase 3)
   Clean modular vanilla JS. Sections:
     1. CONFIG        5. FILTERS          9.  AUTH
     2. STATE         6. RENDER           10. ORDERS / CHECKOUT
     3. API + DEMO    7. SEARCH (0ms)     11. REPAIR TRACKING
     4. CATALOG       8. CART             12. NAV / INIT
   Backend contract: Code.gs (Phase 2) ACTION REGISTRY. Every call is a POST
   with JSON body {action, token, ...fields} and Content-Type 'text/plain'
   (Apps Script CORS-friendly). Replies are {ok:true,data} / {ok:false,error}.
   Field names verified against Code.gs:
     getCatalog        -> data {tier, count, products[]}  (no Cost_Price, ever)
     getBanners        -> data {banners[]}
     getSettingsPublic -> data {settings:{Group:[values]}}
     customerLogin     -> payload {email,password} -> {token, customer, tierProgress}
     customerRegister  -> payload {name, phone, email, password, referenceBy,
                          photoBase64, photoContentType} -> same as login
     getMyProfile      -> {customer, tierProgress}
     createOrder       -> payload {Sale_Channel:'Website', Payment_Method,
                          Items:[{Product_ID,Qty}], Tracking_Notes}
                          -> {order, items, tier}
     getOrders         -> {orders[]} (customers: own only, cost fields removed)
     getInvoiceData    -> payload {type:'order'|'repair', id} -> {type, shop, invoice}
     trackRepair       -> payload {Job_ID, email|phone} OR {Job_ID, portalPass}
                          -> {repair:{...sanitised fields only}}
     recoverRepairPass -> payload {Job_ID, email|phone}
                          -> {sent, message} (portal password emailed to customer)
     logout            -> {loggedOut:true}
   ========================================================================== */
'use strict';

/* ============================ 1. CONFIG ================================= */
const CONFIG = {
  /* >>> DAOOD: paste your deployed Apps Script Web App URL (ends in /exec)
   *     between the quotes below, then re-upload this file. Until then the
   *     site runs in DEMO MODE with sample data so you can preview design. */
  API_URL: 'https://script.google.com/macros/s/AKfycby87O67OYFsgwev_LSiKIVFn-Pra1eqbkeWEIHFAbb5ma805gELJdE_VKegVn1-pmAHWg/exec',
  SHOP_NAME: 'Sulehri Mobile',
  WHATSAPP_NUMBER: '923000000000', // >>> replace with the shop WhatsApp number
  CURRENCY: 'PKR'
};
const DEMO_MODE = CONFIG.API_URL === 'PASTE_YOUR_WEB_APP_URL_HERE' ||
  CONFIG.API_URL.indexOf('script.google') === -1;

/* ============================ 2. STATE ================================== */
const state = {
  view: 'home',
  catalog: [],          // in-memory catalog (0ms search/filter source)
  banners: [],
  settings: {},         // {Group: [values]}
  tier: 'Guest',
  token: localStorage.getItem('sm_token') || '',
  customer: null,       // publicCustomer_ object (never has Password_Hash)
  tierProgress: null,   // {Price_Tier, Monthly_Target, Current_Month_Spend, Remaining, Percent}
  cart: [],             // [{Product_ID, Qty}]
  filters: {
    main: new Set(), sub: new Set(), brand: new Set(), ram: new Set(),
    storage: new Set(), pta: new Set(), network: new Set(),
    min: null, max: null, search: '', sort: 'featured'
  },
  quickViewId: null, quickQty: 1,
  demoOrders: []
};
try {
  state.customer = JSON.parse(localStorage.getItem('sm_customer') || 'null');
  state.tierProgress = JSON.parse(localStorage.getItem('sm_tierProgress') || 'null');
  state.cart = JSON.parse(localStorage.getItem('sm_cart') || '[]');
  if (state.customer) state.tier = state.customer.Price_Tier || 'Retail';
} catch (e) { /* corrupted storage -> start fresh */ }

/* ============================ 3. API + DEMO ============================= */
async function api(action, payload) {
  if (DEMO_MODE) return demoApi(action, payload || {});
  const body = Object.assign({}, payload || {}, { action: action });
  if (state.token) body.token = state.token;
  let res;
  try {
    res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // avoids CORS preflight on Apps Script
      body: JSON.stringify(body)
    });
  } catch (e) {
    throw new Error('Network problem — please check your internet and try again.');
  }
  let json;
  try { json = await res.json(); } catch (e) { throw new Error('Server returned an unreadable reply.'); }
  if (!json.ok) throw new Error(json.error || 'Something went wrong.');
  return json.data;
}

/* ---- Demo dataset (DEMO MODE ONLY — never mixed with live data) ------- */
const DEMO_SETTINGS = {
  Main_Category: ['Phones', 'Parts', 'Accessories'],
  Sub_Category: ['Mobile Phones', 'Units', 'Sub-boards', 'Strips', 'OCA Glass', 'Glass Protectors', 'Back Covers', 'Chargers', 'Handsfree', 'Data Cables', 'Repair Services', 'Other'],
  Brand: ['Samsung', 'Apple', 'Infinix', 'Tecno', 'Xiaomi', 'Vivo', 'Oppo', 'Realme', 'Nokia', 'Other'],
  RAM: ['2GB', '3GB', '4GB', '6GB', '8GB', '12GB', '16GB', 'N/A'],
  Storage: ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB', 'N/A'],
  PTA_Status: ['PTA Approved', 'Non-PTA', 'CPID', 'Patch', 'N/A'],
  Network_Status: ['Unlocked', 'Locked', 'N/A'],
  Repair_Stage: ['Received', 'Software File Downloading', 'Flashing in Progress', 'Hardware Diagnosis', 'Waiting for Parts', 'Testing', 'Phone OK / Ready for Pickup', 'Delivered', 'Unrepairable'],
  Product_Badge: ['NEW', 'HOT SALE', 'LIMITED', 'BESTSELLER', 'NONE'],
  Section_Order: ['Hero Banners', 'Category Strip', 'Blessed Friday / Flash Sale', 'Mobile Phones', 'Mobile Parts & Units', 'Accessories', 'Repair Services'],
  Payment_Method: ['Cash', 'Bank', 'EasyPaisa-JazzCash', 'Credit'],
  Order_Status: ['Pending', 'Dispatched', 'Delivered', 'Returned', 'Cancelled']
};
function demoProduct(id, main, sub, brand, model, ram, storage, pta, guest, retail, badge, seed, warrantyDays) {
  return {
    Product_ID: id, Main_Category: main, Sub_Category: sub, Brand: brand, Model: model,
    RAM: ram || 'N/A', Storage: storage || 'N/A', PTA_Status: pta || 'N/A',
    Network_Status: 'N/A', IMEI_Serial: '', Stock_Qty: 7,
    Price_Guest: guest, Price_Retail: retail, Price_Wholesale: Math.round(retail * 0.94),
    Price_Business: Math.round(retail * 0.9), Product_Badge: badge,
    Image_1: 'https://picsum.photos/seed/' + seed + '/600/600',
    Image_2: 'https://picsum.photos/seed/' + seed + 'b/600/600',
    Has_Warranty: !!warrantyDays, Warranty_Days: warrantyDays || 0,
    Added_Date: '2026-11-' + String(10 + (seed.length % 15))
  };
}
const DEMO_PRODUCTS = [
  demoProduct('MOB-1001', 'Phones', 'Mobile Phones', 'Samsung', 'Galaxy A55 5G', '8GB', '256GB', 'PTA Approved', 124999, 121999, 'NEW', 'smp1', 365),
  demoProduct('MOB-1002', 'Phones', 'Mobile Phones', 'Infinix', 'Hot 40 Pro', '8GB', '256GB', 'PTA Approved', 39999, 38999, 'HOT SALE', 'smp2', 365),
  demoProduct('MOB-1003', 'Phones', 'Mobile Phones', 'Xiaomi', 'Redmi Note 13', '8GB', '128GB', 'PTA Approved', 54999, 53499, 'BESTSELLER', 'smp3', 365),
  demoProduct('MOB-1004', 'Phones', 'Mobile Phones', 'Apple', 'iPhone 13', '4GB', '128GB', 'PTA Approved', 214999, 209999, 'LIMITED', 'smp4', 365),
  demoProduct('PRT-1001', 'Parts', 'Units', 'Samsung', 'Galaxy A10 LCD Unit', 'N/A', 'N/A', 'N/A', 6500, 6200, 'BESTSELLER', 'smp5', 30),
  demoProduct('PRT-1002', 'Parts', 'Units', 'Samsung', 'Galaxy A10s LCD Unit', 'N/A', 'N/A', 'N/A', 6800, 6500, 'NONE', 'smp6', 30),
  demoProduct('PRT-1003', 'Parts', 'OCA Glass', 'Samsung', 'Galaxy A10 OCA Glass', 'N/A', 'N/A', 'N/A', 450, 420, 'NONE', 'smp7', 0),
  demoProduct('PRT-1004', 'Parts', 'Sub-boards', 'Xiaomi', 'Redmi Note 10 Charging Sub-board', 'N/A', 'N/A', 'N/A', 1450, 1380, 'NEW', 'smp8', 30),
  demoProduct('ACC-1001', 'Accessories', 'Glass Protectors', 'Samsung', 'A10 Tempered Glass Protector', 'N/A', 'N/A', 'N/A', 350, 320, 'HOT SALE', 'smp9', 0),
  demoProduct('ACC-1002', 'Accessories', 'Glass Protectors', 'Samsung', 'A10s Tempered Glass Protector', 'N/A', 'N/A', 'N/A', 350, 320, 'NONE', 'smp10', 0),
  demoProduct('ACC-1003', 'Accessories', 'Glass Protectors', 'Samsung', 'A10/M10 Tempered Glass Protector', 'N/A', 'N/A', 'N/A', 380, 350, 'NONE', 'smp11', 0),
  demoProduct('ACC-1004', 'Accessories', 'Back Covers', 'Infinix', 'Hot 40 Pro Back Cover', 'N/A', 'N/A', 'N/A', 600, 550, 'NEW', 'smp12', 0),
  demoProduct('ACC-1005', 'Accessories', 'Chargers', 'Samsung', '25W Fast Charger', 'N/A', 'N/A', 'N/A', 2499, 2350, 'BESTSELLER', 'smp13', 90),
  demoProduct('ACC-1006', 'Accessories', 'Data Cables', 'Other', 'Type-C Braided Data Cable 1m', 'N/A', 'N/A', 'N/A', 499, 460, 'NONE', 'smp14', 0),
  demoProduct('ACC-1007', 'Accessories', 'Handsfree', 'Other', 'Stereo Handsfree 3.5mm', 'N/A', 'N/A', 'N/A', 799, 740, 'NONE', 'smp15', 0)
];
const DEMO_BANNERS = [
  { Banner_ID: 'BAN-1001', Section_Title: 'Blessed Friday / Flash Sale', Target_Category: 'Accessories', Poster_Image_URL: 'https://picsum.photos/seed/smb1/1200/500', Badge_Text: 'UP TO 50% OFF', Active_Status: true, Display_Order: 1 },
  { Banner_ID: 'BAN-1002', Section_Title: 'Mobile Phones', Target_Category: 'Phones', Poster_Image_URL: 'https://picsum.photos/seed/smb2/1200/500', Badge_Text: 'NEW ARRIVALS', Active_Status: true, Display_Order: 2 },
  { Banner_ID: 'BAN-1003', Section_Title: 'Mobile Parts & Units', Target_Category: 'Parts', Poster_Image_URL: 'https://picsum.photos/seed/smb3/1200/500', Badge_Text: 'BEST PRICES', Active_Status: true, Display_Order: 3 },
  { Banner_ID: 'BAN-1004', Section_Title: 'Accessories', Target_Category: 'Accessories', Poster_Image_URL: 'https://picsum.photos/seed/smb4/1200/500', Badge_Text: 'HOT SALE', Active_Status: true, Display_Order: 4 }
];
function demoPrice(p, tier) {
  const price = Number(p['Price_' + (tier || 'Guest')] || p.Price_Guest) || 0;
  const guest = Number(p.Price_Guest) || 0;
  return {
    Active_Price: price, Active_Tier: tier || 'Guest',
    Discount_Percent: guest > price && guest > 0 ? Math.round((guest - price) / guest * 100) : (p._demoBadgeDiscount || 0)
  };
}
function demoCatalog(tier) {
  return DEMO_PRODUCTS.map(p => Object.assign({}, p, demoPrice(p, tier)));
}
// Flash-sale demo items show a design-preview discount badge even for guests.
DEMO_PRODUCTS[1]._demoBadgeDiscount = 8; DEMO_PRODUCTS[8]._demoBadgeDiscount = 12;
const DEMO_CUSTOMER = {
  Customer_ID: 'CUS-1001', Name: 'Demo Customer', Phone: '0300-0000000',
  Email: 'demo@sulehri.pk', Reference_By: '', Photo_Drive_URL: '',
  Price_Tier: 'Retail', Monthly_Target: 50000, Current_Month_Spend: 18500,
  Fallback_Tier: 'Guest', Credit_Limit: 20000, Current_Credit_Balance: 0,
  Payment_Due_Date: '', Status: 'Active'
};
function demoTierProgress(c) {
  const target = Number(c.Monthly_Target) || 0, spend = Number(c.Current_Month_Spend) || 0;
  return {
    Price_Tier: c.Price_Tier, Fallback_Tier: c.Fallback_Tier, Monthly_Target: target,
    Current_Month_Spend: spend, Remaining: Math.max(0, target - spend),
    Percent: target > 0 ? Math.min(100, Math.round(spend / target * 100)) : 100
  };
}
async function demoApi(action, p) {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  await delay(120);
  switch (action) {
    case 'getCatalog': return { tier: state.tier, count: DEMO_PRODUCTS.length, products: demoCatalog(state.token ? state.tier : 'Guest') };
    case 'getBanners': return { banners: DEMO_BANNERS.slice() };
    case 'getSettingsPublic': return { settings: DEMO_SETTINGS };
    case 'customerLogin': {
      const c = Object.assign({}, DEMO_CUSTOMER, { Email: (p.email || DEMO_CUSTOMER.Email) });
      return { token: 'demo-token', customer: c, tierProgress: demoTierProgress(c) };
    }
    case 'customerRegister': {
      const c = Object.assign({}, DEMO_CUSTOMER, {
        Name: p.name || 'New Customer', Email: p.email || '', Phone: p.phone || '',
        Price_Tier: 'Retail', Monthly_Target: 0, Current_Month_Spend: 0, Credit_Limit: 0
      });
      return { token: 'demo-token', customer: c, tierProgress: demoTierProgress(c) };
    }
    case 'getMyProfile': return { customer: state.customer || DEMO_CUSTOMER, tierProgress: demoTierProgress(state.customer || DEMO_CUSTOMER) };
    case 'createOrder': {
      const items = (p.Items || []).map(it => {
        const prod = DEMO_PRODUCTS.find(x => x.Product_ID === it.Product_ID) || {};
        const price = Number(prod['Price_' + state.tier] || prod.Price_Guest || 0);
        return { Product_ID: it.Product_ID, Brand: prod.Brand || '', Model: prod.Model || '', Qty: it.Qty, Unit_Price: price, Line_Total: price * it.Qty };
      });
      const total = items.reduce((s, i) => s + i.Line_Total, 0);
      if (p.Payment_Method === 'Credit') {
        const limit = Number((state.customer || {}).Credit_Limit || 0);
        const bal = Number((state.customer || {}).Current_Credit_Balance || 0);
        if (limit <= 0 || bal + total > limit) {
          throw new Error('Credit limit exceeded. Limit: ' + limit + ', current balance: ' + bal + ', this order: ' + total + '.');
        }
      }
      const order = {
        Order_ID: 'ORD-' + (1000 + Math.floor(Math.random() * 9000)), Date: new Date().toISOString().slice(0, 10),
        Sale_Channel: 'Website', Customer_ID: (state.customer || {}).Customer_ID || 'CUS-1001',
        Items_JSON: JSON.stringify(items), Total_Amount: total,
        Payment_Method: p.Payment_Method || 'Cash', Order_Status: 'Pending',
        Warranty_Expiry_Date: '', Tracking_Notes: p.Tracking_Notes || ''
      };
      state.demoOrders.unshift(order);
      return { order: order, items: items, tier: state.tier };
    }
    case 'getOrders': {
      if (!state.demoOrders.length) {
        return { orders: [{
          Order_ID: 'ORD-1001', Date: '2026-11-20', Sale_Channel: 'Website', Customer_ID: 'CUS-1001',
          Items_JSON: JSON.stringify([{ Product_ID: 'ACC-1005', Brand: 'Samsung', Model: '25W Fast Charger', Qty: 1, Unit_Price: 2350, Line_Total: 2350 }]),
          Total_Amount: 2350, Payment_Method: 'Cash', Order_Status: 'Delivered', Warranty_Expiry_Date: '2027-02-18', Tracking_Notes: ''
        }] };
      }
      return { orders: state.demoOrders.slice() };
    }
    case 'getInvoiceData': {
      const o = state.demoOrders.find(x => x.Order_ID === p.id);
      if (!o) throw new Error('Order not found: ' + p.id);
      return { type: 'order', shop: { name: CONFIG.SHOP_NAME, currency: 'PKR' }, invoice: { Order_ID: o.Order_ID, Date: o.Date, Items: JSON.parse(o.Items_JSON), Total_Amount: o.Total_Amount, Payment_Method: o.Payment_Method, Order_Status: o.Order_Status } };
    }
    case 'trackRepair': {
      if (String(p.Job_ID || '').toUpperCase() !== 'REP-1001') throw new Error('Repair job not found. Please check the Job ID.');
      return { repair: {
        Job_ID: 'REP-1001', Date_Received: '2026-11-22', Customer_Name: 'Demo Customer',
        Device_Brand_Model: 'Samsung Galaxy A10', Repair_Type: 'Hardware',
        Reported_Issue: 'Cracked LCD', Current_Stage: 'Testing',
        Customer_Comm_Status: 'Called - Informed',
        Parts_Used: [{ Product_ID: 'PRT-1001', Model: 'Galaxy A10 LCD Unit', Qty: 1 }],
        Service_Charges: 1500, Total_Amount: 8000, Advance_Paid: 2000, Balance_Due: 6000,
        Last_Updated: '2026-11-25'
      } };
    }
    case 'logout': return { loggedOut: true };
    default: throw new Error('Action not available in DEMO mode: ' + action);
  }
}

/* ============================ 4. HELPERS ================================ */
const $ = id => document.getElementById(id);
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(n) { return CONFIG.CURRENCY + ' ' + (Number(n) || 0).toLocaleString('en-PK'); }
function toast(msg, kind) {
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.textContent = msg;
  $('toastWrap').appendChild(t);
  setTimeout(() => t.remove(), 3600);
}
function productTitle(p) { return ((p.Brand || '') + ' ' + (p.Model || '')).trim() || p.Product_ID; }
function productById(id) { return state.catalog.find(p => p.Product_ID === id); }
function saveSession() {
  if (state.token) localStorage.setItem('sm_token', state.token); else localStorage.removeItem('sm_token');
  if (state.customer) localStorage.setItem('sm_customer', JSON.stringify(state.customer)); else localStorage.removeItem('sm_customer');
  if (state.tierProgress) localStorage.setItem('sm_tierProgress', JSON.stringify(state.tierProgress)); else localStorage.removeItem('sm_tierProgress');
}
function saveCart() { localStorage.setItem('sm_cart', JSON.stringify(state.cart)); }

/* ============================ 5. CATALOG ================================ */
async function loadCatalog() {
  const data = await api('getCatalog', {});
  state.catalog = data.products || [];
  if (data.tier) state.tier = data.tier;
}
async function loadBanners() {
  const data = await api('getBanners', {});
  state.banners = data.banners || [];
}
async function loadSettings() {
  const data = await api('getSettingsPublic', {});
  state.settings = data.settings || {};
}
function skeletonCards(n) {
  return Array.from({ length: n }, () => '<div class="skeleton"><div class="sk-img"></div><div class="sk-line"></div><div class="sk-line"></div></div>').join('');
}

/* ============================ 6. SEARCH (0ms, scoped) =================== */
function tokensOf(text) {
  return String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
function productTokens(p) {
  return tokensOf([p.Brand, p.Model, p.Sub_Category, p.Main_Category, p.Product_ID].join(' '));
}
/* Strict scoped match: EVERY query token must be a prefix of a product
   token, inside the currently filtered (category-scoped) set. So "A10"
   under Glass Protectors matches A10 / A10s / A10/M10 and nothing else. */
function matchesSearch(p, query) {
  const q = tokensOf(query);
  if (!q.length) return true;
  const pt = productTokens(p);
  return q.every(qt => pt.some(t => t === qt || t.indexOf(qt) === 0));
}

/* ============================ 7. FILTERS ================================ */
const FILTER_GROUPS = [
  { key: 'main', setting: 'Main_Category', el: 'filterMainCats' },
  { key: 'sub', setting: 'Sub_Category', el: 'filterSubCats' },
  { key: 'brand', setting: 'Brand', el: 'filterBrands' },
  { key: 'pta', setting: 'PTA_Status', el: 'filterPtas' },
  { key: 'network', setting: 'Network_Status', el: 'filterNetworks' }
];
const CHIP_GROUPS = [
  { key: 'ram', setting: 'RAM', el: 'filterRams', field: 'RAM' },
  { key: 'storage', setting: 'Storage', el: 'filterStorages', field: 'Storage' }
];
const FIELD_OF = { main: 'Main_Category', sub: 'Sub_Category', brand: 'Brand', ram: 'RAM', storage: 'Storage', pta: 'PTA_Status', network: 'Network_Status' };

function applyFilters(exceptKey) {
  const f = state.filters;
  return state.catalog.filter(p => {
    if (!matchesSearch(p, f.search)) return false;
    for (const key of Object.keys(FIELD_OF)) {
      if (key === exceptKey) continue;
      const set = f[key];
      if (set.size && !set.has(String(p[FIELD_OF[key]] || ''))) return false;
    }
    if (exceptKey !== 'price') {
      const price = Number(p.Active_Price) || 0;
      if (f.min != null && price < f.min) return false;
      if (f.max != null && price > f.max) return false;
    }
    return true;
  });
}
function sortedProducts(list) {
  const out = list.slice();
  switch (state.filters.sort) {
    case 'price-asc': out.sort((a, b) => (a.Active_Price || 0) - (b.Active_Price || 0)); break;
    case 'price-desc': out.sort((a, b) => (b.Active_Price || 0) - (a.Active_Price || 0)); break;
    case 'newest': out.sort((a, b) => String(b.Added_Date || '').localeCompare(String(a.Added_Date || ''))); break;
  }
  return out;
}
function renderFilters() {
  for (const g of FILTER_GROUPS) {
    const values = state.settings[g.setting] || [];
    const base = applyFilters(g.key);
    $(g.el).innerHTML = values.map(v => {
      const count = base.filter(p => String(p[FIELD_OF[g.key]]) === v).length;
      const checked = state.filters[g.key].has(v) ? ' checked' : '';
      return '<label class="check-row"><input type="checkbox" data-filter="' + g.key + '" value="' + esc(v) + '"' + checked + '> ' +
        esc(v) + ' <span class="count">(' + count + ')</span></label>';
    }).join('');
  }
  for (const g of CHIP_GROUPS) {
    const values = (state.settings[g.setting] || []).filter(v => v !== 'N/A');
    $(g.el).innerHTML = values.map(v =>
      '<button type="button" class="chip' + (state.filters[g.key].has(v) ? ' active' : '') +
      '" data-chip="' + g.key + '" data-value="' + esc(v) + '">' + esc(v) + '</button>').join('');
  }
  const chips = [];
  for (const key of Object.keys(FIELD_OF)) {
    state.filters[key].forEach(v => chips.push('<button type="button" class="chip active" data-remove-filter="' + key + '" data-value="' + esc(v) + '">' + esc(v) + ' ✕</button>'));
  }
  if (state.filters.min != null || state.filters.max != null) {
    chips.push('<button type="button" class="chip active" data-remove-price="1">' +
      money(state.filters.min || 0) + ' – ' + (state.filters.max != null ? money(state.filters.max) : '∞') + ' ✕</button>');
  }
  $('activeFilterChips').innerHTML = chips.join('');
  // Per-tab filters: RAM/Storage/PTA/Network sirf Phones tab mein dikhte hain.
  const showTech = state.filters.main.size === 0 || state.filters.main.has('Phones');
  document.querySelectorAll('[data-group="tech"]').forEach(el => { el.hidden = !showTech; });
  // Category page par Category wala filter group chhupa do — page hi us category ka hai.
  if (SM_PAGE.type === 'cat') {
    const mg = $('filterMainCats');
    if (mg && mg.closest('.filter-group')) mg.closest('.filter-group').hidden = true;
  }
}
function clearFilters() {
  const f = state.filters;
  Object.keys(FIELD_OF).forEach(k => f[k].clear());
  if (SM_PAGE.type === 'cat') f.main.add(SM_PAGE.main); // page ki category lock rehti hai
  f.min = null; f.max = null;
  $('priceMin').value = ''; $('priceMax').value = '';
  document.querySelectorAll('#priceQuick .chip').forEach(c => c.classList.remove('active'));
  if (SM_PAGE.type !== 'cat') document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  refreshShop();
}
function refreshShop() {
  renderFilters();
  const list = sortedProducts(applyFilters(null));
  $('resultCount').textContent = list.length + ' product' + (list.length === 1 ? '' : 's');
  $('shopGrid').innerHTML = list.map(productCard).join('');
  $('shopEmpty').hidden = list.length > 0;
}

/* ============================ 8. RENDER ================================= */
const BADGE_CLASS = { 'NEW': 'badge-NEW', 'HOT SALE': 'badge-HOT-SALE', 'LIMITED': 'badge-LIMITED', 'BESTSELLER': 'badge-BESTSELLER' };
function productCard(p) {
  const disc = Number(p.Discount_Percent) || 0;
  const badge = String(p.Product_Badge || 'NONE').toUpperCase();
  const specs = [p.RAM, p.Storage, p.PTA_Status].filter(v => v && v !== 'N/A')
    .map(v => '<span class="spec-pill">' + esc(v) + '</span>').join('');
  return '<article class="card">' +
    '<div class="card-frame" data-view="' + esc(p.Product_ID) + '">' +
      (disc > 0 ? '<span class="discount-pill">-' + disc + '%</span>' : '') +
      (BADGE_CLASS[badge] ? '<span class="status-badge ' + BADGE_CLASS[badge] + '">' + esc(badge) + '</span>' : '') +
      '<img loading="lazy" src="' + esc(p.Image_1 || '') + '" alt="' + esc(productTitle(p)) + '" onerror="this.style.opacity=0.15">' +
    '</div>' +
    '<div class="card-body">' +
      '<span class="brand-tag">' + esc(p.Brand || '') + '</span>' +
      '<div class="card-title" data-view="' + esc(p.Product_ID) + '">' + esc(productTitle(p)) + '</div>' +
      (specs ? '<div class="spec-pills">' + specs + '</div>' : '') +
      '<div class="price-row"><span class="price">' + money(p.Active_Price) + '</span>' +
      (disc > 0 ? '<span class="compare-price">' + money(p.Price_Guest) + '</span>' : '') + '</div>' +
      '<button type="button" class="btn btn-primary add-btn" data-add="' + esc(p.Product_ID) + '">🛒 Add to Cart</button>' +
    '</div></article>';
}
function renderHome() {
  const order = state.settings.Section_Order || [];
  const orderIdx = t => { const i = order.indexOf(t); return i === -1 ? 99 : i; };
  const banners = state.banners.slice().sort((a, b) =>
    (orderIdx(a.Section_Title) - orderIdx(b.Section_Title)) || ((a.Display_Order || 0) - (b.Display_Order || 0)));
  $('showcaseWrap').innerHTML = banners.map(b => {
    const rel = state.catalog.filter(p => String(p.Main_Category) === String(b.Target_Category)).slice(0, 4);
    return '<div class="showcase">' +
      '<div class="poster">' +
        (b.Poster_Image_URL ? '<img loading="lazy" src="' + esc(b.Poster_Image_URL) + '" alt="">' : '') +
        '<div class="poster-body">' +
          (b.Badge_Text ? '<span class="badge-text">' + esc(b.Badge_Text) + '</span>' : '') +
          '<h3>' + esc(b.Section_Title) + '</h3>' +
        '</div></div>' +
      (rel.length ? '<div class="product-grid showcase-products">' + rel.map(productCard).join('') + '</div>' : '') +
    '</div>';
  }).join('');
  $('homeGrid').innerHTML = state.catalog.slice(0, 8).map(productCard).join('');
  setTabThumbs(); renderHero(); renderHomeCats();
}
/* ===================== MAIN NAV + MEGA MENU ============================ */
const NAV_TABS = {
  phones: {
    main: 'Phones', headTitle: 'Mobile Sales & Purchase', icon: '📱', flyout: 'pta',
    tiles: [
      { sub: 'New Phones', icon: '✨' },
      { sub: 'Box Pack Phones', icon: '📦' },
      { sub: 'Used Phones', icon: '♻️' }
    ]
  },
  accessories: {
    main: 'Accessories', headTitle: 'Accessories', icon: '🎧', flyout: 'products',
    tiles: [
      { sub: 'Chargers', icon: '🔌' }, { sub: 'Handsfree', icon: '🎧' },
      { sub: 'Back Covers', icon: '📲' }, { sub: 'Glass Protectors', icon: '🛡️' },
      { sub: 'Data Cables', icon: '🔗' }
    ]
  },
  parts: {
    main: 'Parts', headTitle: 'Parts & Units', icon: '🧩', flyout: 'products',
    tiles: [
      { sub: 'Units', icon: '🖥️' }, { sub: 'Sub-boards', icon: '🧩' },
      { sub: 'Strips', icon: '🔩' }, { sub: 'OCA Glass', icon: '🔷' }
    ]
  }
};
/* ===================== PAGE MODE (alag-alag pages) ====================== */
const SM_PAGE = window.SM_PAGE || { type: 'home' };
const TAB_FILE = { home: 'index.html', phones: 'mobile.html', accessories: 'accessories.html', parts: 'parts.html', repair: 'repairing.html' };
const MAIN_FILE = { Phones: 'mobile.html', Accessories: 'accessories.html', Parts: 'parts.html' };
function fileOfMain(main) { return MAIN_FILE[main] || 'mobile.html'; }
function currentTabKey() {
  if (SM_PAGE.type === 'cat') return tabKeyOfMain(SM_PAGE.main);
  return SM_PAGE.type; // 'home' | 'repair'
}
let megaOpenTab = null, megaCloseTimer = null, flyFor = '';
function tileImage(main, sub) {
  const p = state.catalog.find(x => String(x.Main_Category) === main && String(x.Sub_Category) === sub && x.Image_1);
  return p ? String(p.Image_1) : '';
}
function tileCount(main, sub) {
  return state.catalog.filter(x => String(x.Main_Category) === main && String(x.Sub_Category) === sub).length;
}
function buildMega(tabKey) {
  const tab = NAV_TABS[tabKey];
  if (!tab) return '';
  const kids = tab.flyout === 'pta';
  const rows = tab.tiles.map(t => {
    const n = tileCount(tab.main, t.sub);
    return '<button type="button" class="mega-row' + (kids ? ' has-kids' : '') + '" data-row-main="' + esc(tab.main) +
      '" data-row-sub="' + esc(t.sub) + '">' +
      '<span class="mega-row-label">' + esc(t.sub) + '</span>' +
      '<span class="mega-row-count">' + n + ' product' + (n === 1 ? '' : 's') + '</span>' +
      (kids ? '<span class="mega-row-arrow">›</span>' : '') + '</button>';
  }).join('');
  return '<div class="mega-head"><strong>' + esc(tab.headTitle) + '</strong></div>' +
    '<div class="mega-list">' + rows + '</div>' +
    '<div class="mega-flyout" id="megaFlyout" hidden></div>' +
    '<button type="button" class="mega-viewall" data-mega-main="' + esc(tab.main) +
    '">View All ' + esc(tab.headTitle) + ' →</button>';
}
function renderFlyout(tabKey, row) {
  const tab = NAV_TABS[tabKey];
  const fly = $('megaFlyout');
  if (!tab || !fly) return;
  const main = tab.main, sub = row.dataset.rowSub;
  flyFor = main + '|' + sub;
  document.querySelectorAll('.mega-row').forEach(r => r.classList.toggle('active', r === row));
  const inSub = state.catalog.filter(p => String(p.Main_Category) === main && String(p.Sub_Category) === sub);
  const ptas = ['PTA Approved', 'Non-PTA', 'CPID'].filter(v => inSub.some(p => String(p.PTA_Status) === v));
  let html = '<div class="fly-head">' + esc(sub) + '</div>';
  if (ptas.length) {
    html += '<div class="fly-sub">PTA Status</div>' + ptas.map(v =>
      '<button type="button" class="fly-row" data-fly-main="' + esc(main) + '" data-fly-sub="' + esc(sub) +
      '" data-fly-pta="' + esc(v) + '"><span>' + esc(v) + '</span><span class="mega-row-count">' +
      inSub.filter(p => String(p.PTA_Status) === v).length + '</span></button>').join('');
  } else {
    html += '<p class="fly-empty">Is category ke saare phones ek hi list mein hain.</p>';
  }
  html += '<button type="button" class="fly-row fly-all" data-fly-main="' + esc(main) +
    '" data-fly-sub="' + esc(sub) + '">View all ' + esc(sub) + ' →</button>';
  fly.innerHTML = html;
  fly.hidden = false;
}
function hideFlyout() {
  const fly = $('megaFlyout');
  if (fly) fly.hidden = true;
  flyFor = '';
  document.querySelectorAll('.mega-row.active').forEach(r => r.classList.remove('active'));
}
function openMega(tabKey) {
  clearTimeout(megaCloseTimer);
  flyFor = '';
  const panel = $('megaPanel');
  panel.innerHTML = buildMega(tabKey);
  const tabEl = document.querySelector('.nav-tab[data-tab="' + tabKey + '"]');
  if (tabEl) {
    const maxLeft = Math.max(0, $('mainNav').clientWidth - 330);
    panel.style.left = Math.min(tabEl.offsetLeft, maxLeft) + 'px';
  }
  panel.hidden = false;
  megaOpenTab = tabKey;
  document.querySelectorAll('.nav-tab.has-menu').forEach(t =>
    t.setAttribute('aria-expanded', t.dataset.tab === tabKey ? 'true' : 'false'));
}
function closeMega() {
  $('megaPanel').hidden = true;
  megaOpenTab = null;
  document.querySelectorAll('.nav-tab.has-menu').forEach(t => t.setAttribute('aria-expanded', 'false'));
}
function scheduleCloseMega() { clearTimeout(megaCloseTimer); megaCloseTimer = setTimeout(closeMega, 250); }
function setCatHero(o) {
  $('catHero').hidden = false;
  $('catHeroImg').innerHTML = o.img ? '<img src="' + esc(o.img) + '" alt="">' : '<span>' + (o.icon || '🛍️') + '</span>';
  $('catHeroTitle').textContent = o.title;
  $('catHeroCrumb').textContent = o.crumb;
  $('catHeroCount').textContent = applyFilters(null).length + ' products';
}
function clearCatHero() { $('catHero').hidden = true; }
function tabKeyOfMain(mainCat) {
  return Object.keys(NAV_TABS).find(k => NAV_TABS[k].main === mainCat) || null;
}
function goTab(tabKey) {
  closeMega();
  if (tabKey === currentTabKey()) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  location.href = TAB_FILE[tabKey] || 'index.html';
}
function megaGo(mainCat, pairs) {
  closeMega();
  if (SM_PAGE.type === 'cat' && SM_PAGE.main === mainCat) {
    Object.keys(FIELD_OF).forEach(k => state.filters[k].clear());
    state.filters.main.add(mainCat);
    (pairs || []).forEach(pr => state.filters[pr[0]].add(pr[1]));
    const tk = tabKeyOfMain(mainCat);
    const tab = tk ? NAV_TABS[tk] : null;
    const subPair = (pairs || []).filter(pr => pr[0] === 'sub')[0];
    if (tab && subPair) {
      const tile = tab.tiles.filter(t => t.sub === subPair[1])[0] || {};
      setCatHero({ icon: tile.icon || tab.icon, img: tileImage(mainCat, subPair[1]), title: subPair[1], crumb: 'Home / ' + tab.headTitle + ' / ' + subPair[1] });
    } else if (tab) {
      setCatHero({ icon: tab.icon, title: tab.headTitle, crumb: 'Home / ' + tab.headTitle });
    }
    showView('shop');
    refreshShop();
    return;
  }
  const qs = (pairs || []).map(pr => pr[0] + '=' + encodeURIComponent(pr[1])).join('&');
  location.href = fileOfMain(mainCat) + (qs ? '?' + qs : '');
}

/* ============================ 9. CART =================================== */
function cartCount() { return state.cart.reduce((s, i) => s + i.Qty, 0); }
function cartTotal() {
  return state.cart.reduce((s, i) => {
    const p = productById(i.Product_ID);
    return s + (p ? (Number(p.Active_Price) || 0) * i.Qty : 0);
  }, 0);
}
function addToCart(id, qty) {
  const p = productById(id);
  if (!p) return;
  const line = state.cart.find(i => i.Product_ID === id);
  const inCart = line ? line.Qty : 0;
  if (inCart + qty > (Number(p.Stock_Qty) || 0)) { toast('Only ' + p.Stock_Qty + ' in stock.', 'error'); return; }
  if (line) line.Qty += qty; else state.cart.push({ Product_ID: id, Qty: qty });
  saveCart(); renderCart();
  toast('Added to cart ✅', 'success');
}
function renderCart() {
  const n = cartCount();
  $('cartBadge').hidden = n === 0; $('cartBadge').textContent = n;
  $('navCartBadge').hidden = n === 0; $('navCartBadge').textContent = n;
  $('cartItems').innerHTML = state.cart.length ? state.cart.map(i => {
    const p = productById(i.Product_ID);
    if (!p) return '';
    return '<div class="cart-item"><img src="' + esc(p.Image_1 || '') + '" alt="">' +
      '<div class="ci-body"><div class="ci-title">' + esc(productTitle(p)) + '</div>' +
      '<div class="muted">' + money(p.Active_Price) + '</div>' +
      '<div class="qty-stepper"><button type="button" data-dec="' + esc(i.Product_ID) + '">−</button><span>' + i.Qty + '</span>' +
      '<button type="button" data-inc="' + esc(i.Product_ID) + '">+</button></div></div>' +
      '<div><strong>' + money((Number(p.Active_Price) || 0) * i.Qty) + '</strong><br>' +
      '<button type="button" class="ci-remove" data-remove="' + esc(i.Product_ID) + '">Remove</button></div></div>';
  }).join('') : '<p class="muted">🛒 Your cart is empty.</p>';
  $('cartSubtotal').textContent = money(cartTotal());
  $('checkoutBtn').disabled = state.cart.length === 0;
}
function openCart() { renderCart(); $('cartDrawer').hidden = false; $('cartScrim').hidden = false; }
function closeCart() { $('cartDrawer').hidden = true; $('cartScrim').hidden = true; }

/* ============================ 10. AUTH ================================== */
function setSession(data) {
  state.token = data.token || '';
  state.customer = data.customer || null;
  state.tierProgress = data.tierProgress || null;
  if (state.customer) state.tier = state.customer.Price_Tier || 'Retail';
  saveSession();
  updateAuthUI(); renderTargetBar();
}
function clearSession() {
  state.token = ''; state.customer = null; state.tierProgress = null; state.tier = 'Guest';
  saveSession(); updateAuthUI(); renderTargetBar();
}
function updateAuthUI() {
  $('accountBtnLabel').textContent = state.customer ? (state.customer.Name || 'Account').split(' ')[0] : 'Login';
  $('demoHint').hidden = !DEMO_MODE;
}
function renderTargetBar() {
  const tp = state.tierProgress;
  if (!state.customer || !tp || !(Number(tp.Monthly_Target) > 0)) { $('targetBar').hidden = true; return; }
  $('targetBar').hidden = false;
  $('targetTierName').textContent = tp.Price_Tier || state.tier;
  $('targetSpent').textContent = money(tp.Current_Month_Spend);
  $('targetTarget').textContent = money(tp.Monthly_Target);
  $('targetRemaining').textContent = Number(tp.Remaining) > 0
    ? money(tp.Remaining) + ' more to keep your ' + (tp.Price_Tier || '') + ' prices'
    : 'Target complete — tier safe 🎉';
  $('targetPercent').textContent = (tp.Percent || 0) + '%';
  $('targetFill').style.width = (tp.Percent || 0) + '%';
}
async function afterLoginRefresh() {
  try { await loadCatalog(); } catch (e) { /* keep guest catalog */ }
  renderHome(); refreshShop(); renderCart();
}
function openAuth(tab) {
  $('authModal').hidden = false;
  switchAuthTab(tab || 'login');
}
function switchAuthTab(tab) {
  const login = tab === 'login';
  $('loginForm').hidden = !login;
  $('registerForm').hidden = login;
  $('tabLogin').classList.toggle('active', login);
  $('tabRegister').classList.toggle('active', !login);
}
/* Downscale a chosen photo to max 512px JPEG and return RAW base64
   (the backend field is `photoBase64`; it base64-decodes it directly). */
function fileToPhotoBase64(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 512 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve({ photoBase64: dataUrl.split(',')[1], photoContentType: 'image/jpeg' });
    };
    img.onerror = reject;
    img.src = url;
  });
}

/* ============================ 11. ORDERS / CHECKOUT ===================== */
function openCheckout() {
  if (!state.cart.length) return;
  if (!state.customer) {
    closeCart();
    toast('Please log in or create an account to place your order.', 'error');
    openAuth('login');
    return;
  }
  $('coCustomer').textContent = 'Ordering as ' + (state.customer.Name || '') + ' (' + (state.customer.Email || '') + ') — ' + state.tier + ' prices';
  $('coLines').innerHTML = state.cart.map(i => {
    const p = productById(i.Product_ID);
    return p ? '<div><span>' + esc(productTitle(p)) + ' × ' + i.Qty + '</span><span>' + money((Number(p.Active_Price) || 0) * i.Qty) + '</span></div>' : '';
  }).join('');
  $('coTotal').textContent = money(cartTotal());
  $('coError').hidden = true;
  $('coFormWrap').hidden = false;
  $('coSuccess').hidden = true;
  $('checkoutModal').hidden = false;
}
async function submitOrder() {
  const btn = $('coSubmit');
  btn.disabled = true; btn.textContent = 'Placing order…';
  try {
    const data = await api('createOrder', {
      Sale_Channel: 'Website',
      Payment_Method: $('coPayment').value,
      Items: state.cart.map(i => ({ Product_ID: i.Product_ID, Qty: i.Qty })),
      Tracking_Notes: $('coNotes').value.trim()
    });
    $('coOrderId').textContent = (data.order && data.order.Order_ID) || '';
    $('coFormWrap').hidden = true;
    $('coSuccess').hidden = false;
    state.cart = []; saveCart(); renderCart();
    try { await loadCatalog(); renderHome(); refreshShop(); } catch (e) {}
  } catch (e) {
    // e.g. the backend credit-limit message is shown exactly, in place.
    $('coError').textContent = e.message;
    $('coError').hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = 'Place Order';
  }
}
function parseItems(json) {
  try { const v = JSON.parse(json || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
async function renderAccount() {
  const logged = !!state.customer;
  $('accLoginPrompt').hidden = logged;
  $('accContent').hidden = !logged;
  if (!logged) return;
  const c = state.customer;
  $('accName').textContent = c.Name || '';
  $('accEmail').textContent = c.Email || '';
  $('accPhone').textContent = c.Phone || '';
  $('accTier').textContent = (c.Price_Tier || 'Guest') + ' customer';
  if (c.Photo_Drive_URL) { $('accPhoto').src = c.Photo_Drive_URL; $('accPhoto').hidden = false; } else { $('accPhoto').hidden = true; }
  const tp = state.tierProgress;
  if (tp && Number(tp.Monthly_Target) > 0) {
    $('accTargetFill').style.width = (tp.Percent || 0) + '%';
    $('accTargetText').textContent = 'Monthly target: ' + money(tp.Current_Month_Spend) + ' spent of ' + money(tp.Monthly_Target) +
      ' (' + (tp.Percent || 0) + '%). ' + (Number(tp.Remaining) > 0 ? money(tp.Remaining) + ' remaining to keep your tier.' : 'Target complete 🎉');
  } else {
    $('accTargetFill').style.width = '0%';
    $('accTargetText').textContent = 'No monthly target set for your account yet.';
  }
  $('accOrders').innerHTML = '<p class="muted">Loading orders…</p>';
  try {
    const data = await api('getOrders', {});
    const orders = data.orders || [];
    $('accOrders').innerHTML = orders.length ? orders.slice().reverse().map(o => {
      const items = parseItems(o.Items_JSON);
      return '<div class="order-card"><div class="oc-head"><strong>' + esc(o.Order_ID) + '</strong>' +
        '<span class="order-status">' + esc(o.Order_Status || '') + '</span></div>' +
        '<div class="muted">' + esc(o.Date || '') + ' · ' + esc(o.Payment_Method || '') + ' · <strong>' + money(o.Total_Amount) + '</strong></div>' +
        (items.length ? '<ul class="order-items">' + items.map(i => '<li>' + esc(((i.Brand || '') + ' ' + (i.Model || '')).trim() || i.Product_ID) + ' × ' + (i.Qty || 1) + ' — ' + money(i.Line_Total) + '</li>').join('') + '</ul>' : '') +
        '<button type="button" class="btn btn-ghost btn-sm" data-invoice="' + esc(o.Order_ID) + '">View invoice</button>' +
        '<div class="invoice-box" id="inv-' + esc(o.Order_ID) + '"></div></div>';
    }).join('') : '<p class="muted">No orders yet. Happy shopping! 🛍️</p>';
  } catch (e) {
    $('accOrders').innerHTML = '<p class="form-error">' + esc(e.message) + '</p>';
  }
}
async function showInvoice(orderId, box) {
  box.innerHTML = '<p class="muted">Loading invoice…</p>';
  try {
    const data = await api('getInvoiceData', { type: 'order', id: orderId });
    const inv = data.invoice || {};
    box.innerHTML = '<div class="track-meta" style="margin-top:.5rem"><table>' +
      '<tr><td>Invoice</td><td><strong>' + esc(inv.Order_ID || orderId) + '</strong></td></tr>' +
      '<tr><td>Date</td><td>' + esc(inv.Date || '') + '</td></tr>' +
      (inv.Items || []).map(i => '<tr><td>' + esc(((i.Brand || '') + ' ' + (i.Model || '')).trim() || i.Product_ID) + ' × ' + (i.Qty || 1) + '</td><td>' + money(i.Line_Total) + '</td></tr>').join('') +
      '<tr><td>Total</td><td><strong>' + money(inv.Total_Amount) + '</strong></td></tr>' +
      '<tr><td>Payment</td><td>' + esc(inv.Payment_Method || '') + '</td></tr></table></div>';
  } catch (e) { box.innerHTML = '<p class="form-error">' + esc(e.message) + '</p>'; }
}

/* ============================ 12. REPAIR TRACKING ======================= */
function repairStages() {
  return state.settings.Repair_Stage ||
    ['Received', 'Software File Downloading', 'Flashing in Progress', 'Hardware Diagnosis', 'Waiting for Parts', 'Testing', 'Phone OK / Ready for Pickup', 'Delivered', 'Unrepairable'];
}
async function trackRepairSubmit(ev) {
  ev.preventDefault();
  const jobId = $('trJobId').value.trim();
  const ident = $('trEmail').value.trim();
  const pass = $('trPass').value.trim();
  $('trError').hidden = true;
  if (!ident && !pass) {
    $('trError').textContent = 'Please enter your email / phone number OR your portal password.';
    $('trError').hidden = false; return;
  }
  const payload = { Job_ID: jobId };
  if (ident) { if (ident.indexOf('@') > -1) payload.email = ident; else payload.phone = ident; }
  if (pass) payload.portalPass = pass;
  $('trBtn').disabled = true;
  try {
    const data = await api('trackRepair', payload);
    renderRepair(data.repair);
  } catch (e) {
    $('trError').textContent = e.message;
    $('trError').hidden = false;
    $('trResult').hidden = true;
  } finally { $('trBtn').disabled = false; }
}
async function recoverSubmit(ev) {
  ev.preventDefault();
  const jobId = $('rcJobId').value.trim();
  const ident = $('rcId').value.trim();
  $('rcError').hidden = true; $('rcOk').hidden = true;
  if (!jobId || !ident) {
    $('rcError').textContent = 'Job ID aur email / phone number dono likhein.';
    $('rcError').hidden = false; return;
  }
  const payload = { Job_ID: jobId };
  if (ident.indexOf('@') > -1) payload.email = ident; else payload.phone = ident;
  $('rcBtn').disabled = true;
  try {
    const data = await api('recoverRepairPass', payload);
    $('rcOk').textContent = '✅ ' + (data.message || 'Password bhej diya gaya hai. Email check karein.');
    $('rcOk').hidden = false;
  } catch (e) {
    $('rcError').textContent = e.message;
    $('rcError').hidden = false;
  } finally { $('rcBtn').disabled = false; }
}
function renderRepair(r) {
  if (!r) return;
  const stages = repairStages().filter(s => s !== 'Unrepairable');
  const idx = stages.indexOf(r.Current_Stage);
  const unrepairable = r.Current_Stage === 'Unrepairable';
  let steps = stages.map((s, i) => {
    const cls = unrepairable ? (i === 0 ? 'done' : '') : (i < idx ? 'done' : (i === idx ? 'current' : ''));
    const dot = i < idx || (unrepairable && i === 0) ? '✓' : (i + 1);
    return '<div class="step ' + cls + '"><div class="step-dot">' + dot + '</div><div class="step-label">' + esc(s) + '</div></div>';
  }).join('');
  if (unrepairable) {
    steps += '<div class="step unrepairable"><div class="step-dot">✕</div><div class="step-label">Unrepairable — please contact the shop</div></div>';
  }
  $('trSteps').innerHTML = steps;
  const parts = (r.Parts_Used || []).map(p => esc(p.Model || p.Product_ID) + ' × ' + (p.Qty || 1)).join(', ') || '—';
  $('trMeta').innerHTML = '<table>' +
    '<tr><td>Job ID</td><td><strong>' + esc(r.Job_ID) + '</strong></td></tr>' +
    '<tr><td>Status</td><td><strong>' + esc(r.Current_Stage) + '</strong></td></tr>' +
    '<tr><td>Device</td><td>' + esc(r.Device_Brand_Model || '') + '</td></tr>' +
    '<tr><td>Issue</td><td>' + esc(r.Reported_Issue || '') + '</td></tr>' +
    '<tr><td>Parts used</td><td>' + parts + '</td></tr>' +
    '<tr><td>Total</td><td>' + money(r.Total_Amount) + '</td></tr>' +
    '<tr><td>Advance paid</td><td>' + money(r.Advance_Paid) + '</td></tr>' +
    '<tr><td>Balance due</td><td><strong>' + money(r.Balance_Due) + '</strong></td></tr>' +
    '<tr><td>Last updated</td><td>' + esc(r.Last_Updated || r.Date_Received || '') + '</td></tr>' +
    '</table>';
  $('trResult').hidden = false;
}

/* ============================ 13. QUICK VIEW ============================ */
function openQuickView(id) {
  const p = productById(id);
  if (!p) return;
  state.quickViewId = id; state.quickQty = 1;
  $('qvQty').textContent = '1';
  $('qvImg').src = p.Image_1 || '';
  $('qvImg').alt = productTitle(p);
  const imgs = [p.Image_1, p.Image_2].filter(Boolean);
  $('qvThumbs').innerHTML = imgs.map((src, i) =>
    '<button type="button" class="' + (i === 0 ? 'active' : '') + '" data-qv-thumb="' + esc(src) + '"><img src="' + esc(src) + '" alt=""></button>').join('');
  $('qvBrand').textContent = p.Brand || '';
  $('qvTitle').textContent = productTitle(p);
  $('qvSpecs').innerHTML = [p.Sub_Category, p.RAM, p.Storage, p.PTA_Status, p.Network_Status]
    .filter(v => v && v !== 'N/A').map(v => '<span class="spec-pill">' + esc(v) + '</span>').join('');
  const hasW = p.Has_Warranty === true || String(p.Has_Warranty).toUpperCase() === 'TRUE';
  $('qvWarranty').textContent = hasW ? '✅ Warranty: ' + (p.Warranty_Days || 30) + ' days' : '';
  $('qvStock').textContent = 'In stock: ' + (p.Stock_Qty || 0);
  const disc = Number(p.Discount_Percent) || 0;
  $('qvPrice').textContent = money(p.Active_Price);
  $('qvCompare').textContent = disc > 0 ? money(p.Price_Guest) : '';
  $('qvDiscount').hidden = disc <= 0;
  if (disc > 0) $('qvDiscount').textContent = '-' + disc + '%';
  $('quickViewModal').hidden = false;
}

/* ============================ 14. NAV / VIEWS =========================== */
function showView(name) {
  const wantTrack = name === 'track';
  if (wantTrack) name = 'repair'; // purana naam — Track Repair ab Repairing page par hai
  // Alag-alag pages: jo view is page par nahi, us ke page par bhejo.
  if (name === 'repair' && SM_PAGE.type !== 'repair') { location.href = 'repairing.html' + (wantTrack ? '#track' : ''); return; }
  if (name === 'account' && SM_PAGE.type !== 'home') { location.href = 'index.html#account'; return; }
  if (name === 'home' && SM_PAGE.type !== 'home') { location.href = 'index.html'; return; }
  if (name === 'shop' && SM_PAGE.type !== 'cat') {
    const mains = [...state.filters.main];
    const f = mains.length === 1 ? fileOfMain(mains[0]) : 'mobile.html';
    location.href = f + (state.filters.search ? '?q=' + encodeURIComponent(state.filters.search) : '');
    return;
  }
  state.view = name;
  $('viewHome').hidden = name !== 'home';
  $('viewShop').hidden = name !== 'shop';
  $('viewRepair').hidden = name !== 'repair';
  $('viewAccount').hidden = name !== 'account';
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active',
      (name === 'home' && b.dataset.nav === 'home') ||
      (name === 'shop' && (b.dataset.nav === 'categories')) ||
      (name === 'account' && b.dataset.nav === 'account'));
  });
  if (name === 'account') renderAccount();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (wantTrack) setTimeout(() => { const a = $('trackAnchor'); if (a) a.scrollIntoView({ behavior: 'smooth' }); }, 80);
}
function openFiltersDrawer() {
  if (window.innerWidth < 1024) { $('filterDrawer').classList.add('open'); $('filterScrim').hidden = false; }
}
function closeFiltersDrawer() { $('filterDrawer').classList.remove('open'); $('filterScrim').hidden = true; }

/* ============================ 15. SEARCH UI ============================= */
function renderSuggestions() {
  const q = $('searchInput').value.trim();
  const box = $('searchSuggestions');
  if (!q) { box.hidden = true; box.innerHTML = ''; return; }
  const scoped = applyFilters(null).filter(p => matchesSearch(p, q)).slice(0, 8);
  box.innerHTML = scoped.length ? scoped.map(p =>
    '<button type="button" class="suggestion-item" data-view="' + esc(p.Product_ID) + '">' +
    '<img src="' + esc(p.Image_1 || '') + '" alt=""><span class="sg-title">' + esc(productTitle(p)) + '</span>' +
    '<span class="sg-price">' + money(p.Active_Price) + '</span></button>').join('')
    : '<div class="suggestion-item"><span class="sg-title muted">No matches in this category</span></div>';
  box.hidden = false;
}

/* ===================== 15B. THEMES, HERO, HOME CATS, REVEAL ============ */
function applyTheme(name) {
  document.documentElement.dataset.theme = name;
  try { localStorage.setItem('sm_theme', name); } catch (e) {}
  document.querySelectorAll('[data-theme-set]').forEach(b => b.classList.toggle('active', b.dataset.themeSet === name));
}
function setTabThumbs() {
  const pick = main => {
    const p = state.catalog.find(x => String(x.Main_Category) === main && x.Image_1);
    return p ? String(p.Image_1) : '';
  };
  const set = (id, src) => { const el = $(id); if (el && src) { el.src = src; el.hidden = false; } };
  set('thumbMobile', pick('Phones'));
  set('thumbAccessories', pick('Accessories'));
  set('thumbParts', pick('Parts'));
}
let heroIdx = 0, heroTimer = null, heroSlides = [];
function renderHero() {
  const slides = [];
  state.banners.filter(b => b.Poster_Image_URL).slice(0, 4).forEach(b => {
    slides.push({ img: String(b.Poster_Image_URL), title: b.Section_Title || 'Sulehri Mobile', badge: b.Badge_Text || '', main: String(b.Target_Category || '') });
  });
  slides.push({ img: 'images/repair-hero.jpg', title: 'Chip-Level Repair Lab', badge: 'CPU Drilling · JTAG · EMMC', repair: true });
  heroSlides = slides;
  $('heroTrack').innerHTML = slides.map(s =>
    '<div class="hero-slide" ' + (s.repair ? 'data-hero-repair="1"' : 'data-hero-main="' + esc(s.main) + '"') + '>' +
    '<img src="' + esc(s.img) + '" alt="">' +
    '<div class="hero-slide-shade"></div>' +
    '<div class="hero-slide-body">' + (s.badge ? '<span class="badge-text">' + esc(s.badge) + '</span>' : '') +
    '<h3>' + esc(s.title) + '</h3>' +
    '<span class="hero-cta">' + (s.repair ? 'Repairing dekhein →' : 'Shop now →') + '</span></div></div>').join('');
  $('heroDots').innerHTML = slides.map((_, i) =>
    '<button type="button" class="hero-dot' + (i === 0 ? ' active' : '') + '" data-hero-dot="' + i + '" aria-label="Slide ' + (i + 1) + '"></button>').join('');
  $('heroSlider').hidden = slides.length === 0;
  heroIdx = 0;
  heroGo(0);
  startHeroAuto();
}
function heroGo(i) {
  if (!heroSlides.length) return;
  heroIdx = (i + heroSlides.length) % heroSlides.length;
  $('heroTrack').style.transform = 'translateX(-' + (heroIdx * 100) + '%)';
  document.querySelectorAll('.hero-dot').forEach((d, j) => d.classList.toggle('active', j === heroIdx));
}
function startHeroAuto() {
  clearInterval(heroTimer);
  if (heroSlides.length > 1) {
    heroTimer = setInterval(() => { if (state.view === 'home' && !document.hidden) heroGo(heroIdx + 1); }, 4500);
  }
}
function renderHomeCats() {
  const tiles = [];
  Object.keys(NAV_TABS).forEach(k => {
    const tab = NAV_TABS[k];
    tab.tiles.forEach(t => tiles.push({ main: tab.main, sub: t.sub, icon: t.icon }));
  });
  $('homeCats').innerHTML = tiles.map(t => {
    const img = tileImage(t.main, t.sub);
    return '<button type="button" class="hc-tile" data-hc-main="' + esc(t.main) + '" data-hc-sub="' + esc(t.sub) + '">' +
      '<span class="tile-circle">' + (img ? '<img src="' + esc(img) + '" alt="" onerror="this.remove()">' : '') +
      '<span class="tile-emoji">' + t.icon + '</span></span>' +
      '<span class="hc-label">' + esc(t.sub) + '</span></button>';
  }).join('') +
  '<button type="button" class="hc-tile" data-hc-repair="1">' +
    '<span class="tile-circle"><img src="images/repair-hero.jpg" alt=""></span>' +
    '<span class="hc-label">Repairing</span></button>';
}
function initReveal() {
  const els = document.querySelectorAll('.reveal:not(.in)');
  if (!('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('in')); return; }
  const io = new IntersectionObserver(es => es.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }), { threshold: 0.06 });
  els.forEach(el => io.observe(el));
}

/* ============================ 16. EVENTS + INIT ========================= */
function bindEvents() {
  $('logoBtn').addEventListener('click', () => showView('home'));
  $('btnShopAll').addEventListener('click', () => { clearCatHero(); showView('shop'); refreshShop(); });
  $('trackBtnTop').addEventListener('click', () => {
    if (SM_PAGE.type !== 'repair') { location.href = 'repairing.html#track'; return; }
    const a = $('trackAnchor'); if (a) a.scrollIntoView({ behavior: 'smooth' });
  });
  $('repairTrackBtn').addEventListener('click', () => {
    const a = $('trackAnchor'); if (a) a.scrollIntoView({ behavior: 'smooth' });
  });

  // Main nav tabs + mega menu: desktop par hover, har jagah click/tap.
  const navEl = $('mainNav');
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const key = tab.dataset.tab;
      if (NAV_TABS[key]) {
        if (megaOpenTab === key) { closeMega(); goTab(key); }
        else openMega(key);
      } else goTab(key);
    });
    if (window.matchMedia('(hover: hover) and (min-width: 900px)').matches) {
      tab.addEventListener('mouseenter', () => { if (NAV_TABS[tab.dataset.tab]) openMega(tab.dataset.tab); });
    }
  });
  if (window.matchMedia('(hover: hover) and (min-width: 900px)').matches) {
    navEl.addEventListener('mouseleave', scheduleCloseMega);
    $('megaPanel').addEventListener('mouseenter', () => clearTimeout(megaCloseTimer));
  }
  $('megaPanel').addEventListener('click', e => {
    const fly = e.target.closest('[data-fly-main]');
    if (fly) {
      const pairs = [['sub', fly.dataset.flySub]];
      if (fly.dataset.flyPta) pairs.push(['pta', fly.dataset.flyPta]);
      megaGo(fly.dataset.flyMain, pairs);
      return;
    }
    const row = e.target.closest('[data-row-main]');
    if (row) {
      if (row.classList.contains('has-kids')) {
        if (flyFor === row.dataset.rowMain + '|' + row.dataset.rowSub && !$('megaFlyout').hidden) {
          megaGo(row.dataset.rowMain, [['sub', row.dataset.rowSub]]);
        } else renderFlyout(megaOpenTab, row);
      } else megaGo(row.dataset.rowMain, [['sub', row.dataset.rowSub]]);
      return;
    }
    const all = e.target.closest('[data-mega-main]');
    if (all) { megaGo(all.dataset.megaMain, []); return; }
  });
  $('megaPanel').addEventListener('mouseover', e => {
    const row = e.target.closest('[data-row-main]');
    if (!row || !megaOpenTab) return;
    if (row.classList.contains('has-kids')) {
      if (flyFor !== row.dataset.rowMain + '|' + row.dataset.rowSub) renderFlyout(megaOpenTab, row);
    } else if (flyFor) hideFlyout();
  });
  document.addEventListener('click', e => { if (!e.target.closest('#mainNav')) closeMega(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMega(); });

  // Theme picker.
  $('themeBtn').addEventListener('click', e => {
    e.stopPropagation();
    $('themePop').hidden = !$('themePop').hidden;
  });
  $('themePop').addEventListener('click', e => {
    const b = e.target.closest('[data-theme-set]');
    if (!b) return;
    applyTheme(b.dataset.themeSet);
    $('themePop').hidden = true;
    toast('Theme change ho gayi 🎨', 'success');
  });
  document.addEventListener('click', e => { if (!e.target.closest('.theme-wrap')) $('themePop').hidden = true; });

  // Hero slider arrows + pause on hover.
  $('heroPrev').addEventListener('click', () => { heroGo(heroIdx - 1); startHeroAuto(); });
  $('heroNext').addEventListener('click', () => { heroGo(heroIdx + 1); startHeroAuto(); });
  $('heroSlider').addEventListener('mouseenter', () => clearInterval(heroTimer));
  $('heroSlider').addEventListener('mouseleave', startHeroAuto);
  $('cartBtn').addEventListener('click', openCart);
  $('closeCartBtn').addEventListener('click', closeCart);
  $('cartScrim').addEventListener('click', closeCart);
  $('loginBtn').addEventListener('click', () => { if (state.customer) showView('account'); else openAuth('login'); });
  $('accLoginBtn').addEventListener('click', () => openAuth('login'));
  $('checkoutBtn').addEventListener('click', openCheckout);
  $('coClose').addEventListener('click', () => { $('checkoutModal').hidden = true; });
  $('coSubmit').addEventListener('click', submitOrder);
  $('coDoneBtn').addEventListener('click', () => { $('checkoutModal').hidden = true; showView('account'); });
  $('authClose').addEventListener('click', () => { $('authModal').hidden = true; });
  $('tabLogin').addEventListener('click', () => switchAuthTab('login'));
  $('tabRegister').addEventListener('click', () => switchAuthTab('register'));
  $('qvClose').addEventListener('click', () => { $('quickViewModal').hidden = true; });
  $('qvQtyMinus').addEventListener('click', () => { state.quickQty = Math.max(1, state.quickQty - 1); $('qvQty').textContent = state.quickQty; });
  $('qvQtyPlus').addEventListener('click', () => { state.quickQty += 1; $('qvQty').textContent = state.quickQty; });
  $('qvAddBtn').addEventListener('click', () => { if (state.quickViewId) { addToCart(state.quickViewId, state.quickQty); $('quickViewModal').hidden = true; } });
  $('openFiltersBtn').addEventListener('click', openFiltersDrawer);
  $('closeFiltersBtn').addEventListener('click', closeFiltersDrawer);
  $('applyFiltersBtn').addEventListener('click', closeFiltersDrawer);
  $('filterScrim').addEventListener('click', closeFiltersDrawer);
  $('clearFiltersBtn').addEventListener('click', clearFilters);
  $('emptyClearBtn').addEventListener('click', clearFilters);
  $('sortSelect').addEventListener('change', e => { state.filters.sort = e.target.value; refreshShop(); });
  $('trackForm').addEventListener('submit', trackRepairSubmit);
  $('trForgotLink').addEventListener('click', ev => {
    ev.preventDefault();
    const f = $('recoverForm');
    f.hidden = !f.hidden;
    if (!f.hidden) $('rcJobId').value = $('trJobId').value.trim();
  });
  $('recoverForm').addEventListener('submit', recoverSubmit);
  $('logoutBtn').addEventListener('click', async () => {
    try { await api('logout', {}); } catch (e) {}
    clearSession();
    try { await loadCatalog(); } catch (e) {}
    renderHome(); refreshShop(); showView('home');
    toast('Logged out. See you soon! 👋');
  });

  // Search: instant, scoped to the current category/filter selection.
  $('searchInput').addEventListener('input', () => {
    state.filters.search = $('searchInput').value;
    renderSuggestions();
    if (state.view === 'shop') refreshShop();
  });
  $('searchInput').addEventListener('focus', renderSuggestions);
  $('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('searchSuggestions').hidden = true; showView('shop'); refreshShop(); }
    if (e.key === 'Escape') { $('searchSuggestions').hidden = true; }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) $('searchSuggestions').hidden = true;
  });

  // Filters: checkboxes + chips + price.
  document.addEventListener('change', e => {
    const cb = e.target.closest('input[data-filter]');
    if (cb) {
      const set = state.filters[cb.dataset.filter];
      if (cb.checked) set.add(cb.value); else set.delete(cb.value);
      refreshShop();
    }
    if (e.target === $('priceMin') || e.target === $('priceMax')) { /* handled on input below */ }
  });
  const priceChanged = () => {
    const min = parseFloat($('priceMin').value), max = parseFloat($('priceMax').value);
    state.filters.min = isNaN(min) ? null : min;
    state.filters.max = isNaN(max) ? null : max;
    document.querySelectorAll('#priceQuick .chip').forEach(c => c.classList.remove('active'));
    refreshShop();
  };
  $('priceMin').addEventListener('input', priceChanged);
  $('priceMax').addEventListener('input', priceChanged);

  // Global click delegation: cards, cart, chips, strip, nav, invoices.
  document.addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add) { addToCart(add.dataset.add, 1); return; }
    const view = e.target.closest('[data-view]');
    if (view) { $('searchSuggestions').hidden = true; openQuickView(view.dataset.view); return; }
    const cat = e.target.closest('[data-cat]');
    if (cat) { return; } // purana category strip hata diya gaya — nav tabs istemal hote hain
    const hc = e.target.closest('[data-hc-main]');
    if (hc) { megaGo(hc.dataset.hcMain, [['sub', hc.dataset.hcSub]]); return; }
    if (e.target.closest('[data-hc-repair]')) { showView('repair'); return; }
    const hd = e.target.closest('[data-hero-dot]');
    if (hd) { heroGo(Number(hd.dataset.heroDot)); startHeroAuto(); return; }
    if (e.target.closest('[data-hero-repair]')) { showView('repair'); return; }
    const hm = e.target.closest('[data-hero-main]');
    if (hm && hm.dataset.heroMain) { megaGo(hm.dataset.heroMain, []); return; }
    const chip = e.target.closest('[data-chip]');
    if (chip) {
      const set = state.filters[chip.dataset.chip];
      if (set.has(chip.dataset.value)) set.delete(chip.dataset.value); else set.add(chip.dataset.value);
      refreshShop(); return;
    }
    const pq = e.target.closest('#priceQuick .chip');
    if (pq) {
      const parts = pq.dataset.price.split('-');
      $('priceMin').value = parts[0] || '';
      $('priceMax').value = parts[1] || '';
      document.querySelectorAll('#priceQuick .chip').forEach(c => c.classList.toggle('active', c === pq));
      priceChanged(); return;
    }
    const rmF = e.target.closest('[data-remove-filter]');
    if (rmF) { state.filters[rmF.dataset.removeFilter].delete(rmF.dataset.value); refreshShop(); return; }
    if (e.target.closest('[data-remove-price]')) {
      state.filters.min = null; state.filters.max = null;
      $('priceMin').value = ''; $('priceMax').value = ''; refreshShop(); return;
    }
    const inc = e.target.closest('[data-inc]');
    if (inc) { addToCartSilent(inc.dataset.inc, 1); return; }
    const dec = e.target.closest('[data-dec]');
    if (dec) { changeQty(dec.dataset.dec, -1); return; }
    const rem = e.target.closest('[data-remove]');
    if (rem) { state.cart = state.cart.filter(i => i.Product_ID !== rem.dataset.remove); saveCart(); renderCart(); return; }
    const thumb = e.target.closest('[data-qv-thumb]');
    if (thumb) {
      $('qvImg').src = thumb.dataset.qvThumb;
      document.querySelectorAll('[data-qv-thumb]').forEach(b => b.classList.toggle('active', b === thumb));
      return;
    }
    const inv = e.target.closest('[data-invoice]');
    if (inv) { showInvoice(inv.dataset.invoice, $('inv-' + inv.dataset.invoice)); return; }
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      const n = nav.dataset.nav;
      if (n === 'home') showView('home');
      if (n === 'categories') {
        if (SM_PAGE.type === 'cat') { showView('shop'); openFiltersDrawer(); }
        else if (SM_PAGE.type === 'home') { const hc = $('homeCats'); if (hc) hc.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        else location.href = 'index.html#cats';
      }
      if (n === 'search') {
        if (SM_PAGE.type === 'cat') showView('shop');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => $('searchInput').focus(), 350);
      }
      if (n === 'cart') openCart();
      if (n === 'account') showView('account');
      return;
    }
    // Click on modal backdrop closes it.
    if (e.target.classList && e.target.classList.contains('modal')) e.target.hidden = true;
  });

  // Auth forms.
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('liError').hidden = true;
    try {
      const data = await api('customerLogin', { email: $('liEmail').value.trim(), password: $('liPassword').value });
      setSession(data);
      $('authModal').hidden = true;
      toast('Welcome back, ' + ((data.customer || {}).Name || '') + '! 👋', 'success');
      await afterLoginRefresh();
    } catch (err) { $('liError').textContent = err.message; $('liError').hidden = false; }
  });
  $('registerForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('rgError').hidden = true;
    try {
      const payload = {
        name: $('rgName').value.trim(), email: $('rgEmail').value.trim(),
        password: $('rgPassword').value, phone: $('rgPhone').value.trim(),
        referenceBy: $('rgReference').value.trim()
      };
      const file = $('rgPhoto').files && $('rgPhoto').files[0];
      if (file) {
        const photo = await fileToPhotoBase64(file);
        payload.photoBase64 = photo.photoBase64;
        payload.photoContentType = photo.photoContentType;
      }
      const data = await api('customerRegister', payload);
      setSession(data);
      $('authModal').hidden = true;
      toast('Account created — welcome to Sulehri Mobile! 🎉', 'success');
      await afterLoginRefresh();
    } catch (err) { $('rgError').textContent = err.message; $('rgError').hidden = false; }
  });

  window.addEventListener('offline', () => toast('You are offline. Please check your internet connection.', 'error'));
  window.addEventListener('online', () => toast('Back online ✅', 'success'));
}

async function init() {
  $('demoBanner').hidden = !DEMO_MODE;
  $('demoHint').hidden = !DEMO_MODE;
  $('waLink').href = 'https://wa.me/' + CONFIG.WHATSAPP_NUMBER + '?text=' +
    encodeURIComponent('Assalam-o-Alaikum! I have a question about a product at Sulehri Mobile.');
  $('repairWaBtn').href = 'https://wa.me/' + CONFIG.WHATSAPP_NUMBER + '?text=' +
    encodeURIComponent('Assalam-o-Alaikum! Mujhe apna mobile repair karwana hai. Model aur masla ye hai: ');
  document.querySelectorAll('[data-wa-service]').forEach(a => {
    a.href = 'https://wa.me/' + CONFIG.WHATSAPP_NUMBER + '?text=' +
      encodeURIComponent('Assalam-o-Alaikum! Mujhe ' + a.dataset.waService + ' ki service chahiye. Mera phone/model: ');
  });
  const partReqBtn = $('partReqBtn');
  if (partReqBtn) {
    partReqBtn.addEventListener('click', () => {
      const partName = (($('partReqInput') || {}).value || '').trim();
      const text = partName
        ? 'Assalam-o-Alaikum! Mujhe ye part chahiye: ' + partName
        : 'Assalam-o-Alaikum! Mujhe ek part chahiye. Tafseel ye hai: ';
      window.open('https://wa.me/' + CONFIG.WHATSAPP_NUMBER + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
    });
  }
  applyTheme(document.documentElement.dataset.theme || 'ocean');
  updateAuthUI(); renderTargetBar(); renderCart();
  $('homeGrid').innerHTML = skeletonCards(4);
  $('shopGrid').innerHTML = skeletonCards(4);
  bindEvents();
  try {
    await Promise.all([loadSettings(), loadBanners(), loadCatalog()]);
    if (state.token && state.customer && !DEMO_MODE) {
      try {
        const prof = await api('getMyProfile', {});
        state.customer = prof.customer; state.tierProgress = prof.tierProgress;
        saveSession(); updateAuthUI(); renderTargetBar();
        await loadCatalog(); // tier prices
      } catch (e) { clearSession(); }
    }
    renderHome();
    refreshShop();
    renderCart();
    // Page mode: har page apni jagah se shuru hota hai.
    if (SM_PAGE.type === 'cat') {
      const tk = tabKeyOfMain(SM_PAGE.main);
      const tab = tk ? NAV_TABS[tk] : null;
      state.filters.main.add(SM_PAGE.main);
      const qp = new URLSearchParams(location.search);
      ['sub', 'brand', 'ram', 'storage', 'pta', 'network'].forEach(k => { const v = qp.get(k); if (v) state.filters[k].add(v); });
      if (qp.get('q')) { state.filters.search = qp.get('q'); $('searchInput').value = qp.get('q'); }
      const subV = qp.get('sub');
      if (tab && subV) {
        const tile = tab.tiles.filter(t => t.sub === subV)[0] || {};
        setCatHero({ icon: tile.icon || tab.icon, img: tileImage(SM_PAGE.main, subV), title: subV, crumb: 'Home / ' + tab.headTitle + ' / ' + subV });
      } else if (tab) {
        setCatHero({ icon: tab.icon, title: tab.headTitle, crumb: 'Home / ' + tab.headTitle });
      }
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tk));
      showView('shop');
      refreshShop();
    } else if (SM_PAGE.type === 'repair') {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'repair'));
      showView('repair');
      if (location.hash === '#track') setTimeout(() => { const a = $('trackAnchor'); if (a) a.scrollIntoView({ behavior: 'smooth' }); }, 350);
    } else {
      if (location.hash === '#account') showView('account');
      if (location.hash === '#cats') setTimeout(() => { const hc = $('homeCats'); if (hc) hc.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 350);
    }
  } catch (e) {
    toast(e.message, 'error');
    $('homeGrid').innerHTML = '';
    $('shopGrid').innerHTML = '';
  }
  initReveal();
  // PWA: register the service worker only on http(s) (not file:// previews).
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
document.addEventListener('DOMContentLoaded', init);

/* Cart helpers that do not toast (used by the qty steppers). */
function addToCartSilent(id, delta) {
  const p = productById(id);
  const line = state.cart.find(i => i.Product_ID === id);
  if (!p || !line) return;
  if (line.Qty + delta > (Number(p.Stock_Qty) || 0)) { toast('Only ' + p.Stock_Qty + ' in stock.', 'error'); return; }
  line.Qty += delta;
  saveCart(); renderCart();
}
function changeQty(id, delta) {
  const line = state.cart.find(i => i.Product_ID === id);
  if (!line) return;
  line.Qty += delta;
  if (line.Qty <= 0) state.cart = state.cart.filter(i => i.Product_ID !== id);
  saveCart(); renderCart();
}
