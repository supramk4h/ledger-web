/* app.js — Full merged logic
   - Uses your Supabase table: ledger(id text primary key, accounts jsonb, transactions jsonb, meta jsonb)
   - Assumes a single row with id = 'main'
   - Replace SUPABASE_URL / SUPABASE_KEY if you want different credentials
*/

/* ---------- Supabase config (your provided values) ---------- */
const SUPABASE_URL = "https://jdcmdcczdafledslofjr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkY21kY2N6ZGFmbGVkc2xvZmpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NjYyNjYsImV4cCI6MjA3MzQ0MjI2Nn0.35Wmrq5mlmoZWYhnoFH94vC3kfpDUUeSgPUDvCJ2A-o";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------- State ---------- */
let state = {
  accounts: [],        // array of account objects {id, serial, name, type, narration, openingBalance, closing}
  transactions: [],    // array of tx {id,voucherNo,date,narration,lines:[{id,accountId,narration,dr,cr}],posted,timestamp}
  meta: { nextAccountSerial: 1, nextVoucherNo: 1, lastPostedSnapshot: null },
  currentTxIndex: null,
  formMode: false,
  _formTx: null
};

/* ---------- Helpers ---------- */
function uid(prefix='id'){ return prefix + '_' + Math.random().toString(36).slice(2,9); }
function parseAmountInput(s){
  if(s===undefined||s===null) return 0;
  const t = String(s).replace(/,/g,'').trim();
  if(t==='') return 0;
  const n = Number(t);
  return isNaN(n)?0:n;
}
function money(x){
  const n = Number(x)||0;
  return n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
}
function plainMoney(x){ return (Number(x)||0).toFixed(2); }
function escapeHtml(s){ if(s===undefined||s===null) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function findAccount(id){ return state.accounts.find(a=>a.id===id) || null; }
function escapeRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* ---------- Persistence using Supabase (table: ledger) ---------- */
async function loadState(){
  try{
    const resp = await supabaseClient
      .from('ledger')
      .select('accounts,transactions,meta')
      .eq('id','main')
      .single();

    if(resp.error && resp.error.code && resp.error.code !== 'PGRST116'){
      throw resp.error;
    }
    const data = resp.data;
    if(data){
      state.accounts = data.accounts || [];
      state.transactions = data.transactions || [];
      state.meta = data.meta || state.meta;
    } else {
      // create default row if absent
      await supabaseClient.from('ledger').upsert({ id: 'main', accounts: [], transactions: [], meta: state.meta });
    }
    recomputeClosingBalances();
  } catch(e){
    console.error('Error loading from Supabase:', e && e.message ? e.message : e);
  }
}

async function saveState(){
  try{
    const resp = await supabaseClient.from('ledger').upsert({
      id: 'main',
      accounts: state.accounts,
      transactions: state.transactions,
      meta: state.meta
    });
    if(resp.error) throw resp.error;
  } catch(e){
    console.error('Error saving to Supabase:', e && e.message ? e.message : e);
  }
}

async function clearAllData(){
  if(!confirm('Clear ALL data? This will remove accounts and transactions from Supabase. Continue?')) return;
  try{
    await supabaseClient.from('ledger').delete().eq('id','main');
    state = { accounts: [], transactions: [], meta: { nextAccountSerial:1, nextVoucherNo:1, lastPostedSnapshot:null }, currentTxIndex:null, formMode:false, _formTx:null };
    await saveState();
    recomputeClosingBalances();
    renderAccounts();
    initialTransactionsView();
    renderDashboard();
    alert('All data cleared.');
  } catch(e){
    console.error('Error clearing data from Supabase:', e && e.message ? e.message : e);
    alert('Failed to clear data. See console for details.');
  }
}

/* ---------- Balances & snapshots ---------- */
function recomputeClosingBalances(){
  state.accounts.forEach(a => a.closing = Number(a.openingBalance || 0));
  const posted = state.transactions.filter(t=>t.posted).slice().sort((a,b)=>{
    const da=new Date(a.date).getTime(), db=new Date(b.date).getTime();
    if(da!==db) return da-db; return (a.voucherNo||0)-(b.voucherNo||0);
  });
  posted.forEach(t=>{
    t.lines.forEach(l=>{
      const acc = findAccount(l.accountId);
      if(!acc) return;
      acc.closing = Number(acc.closing) + Number(l.dr || 0) - Number(l.cr || 0);
    });
  });
}

function computePreviousTotalsBeforeLastPosted(){
  const posted = state.transactions.filter(t=>t.posted).slice().sort((a,b)=>{
    const da=new Date(a.date).getTime(), db=new Date(b.date).getTime();
    if(da!==db) return da-db; return (a.voucherNo||0)-(b.voucherNo||0);
  });
  if(posted.length===0){
    const bank = state.accounts.filter(a=> (a.type||'').toLowerCase().includes('bank')).reduce((s,a)=> s + Number(a.closing||0), 0);
    const cash = state.accounts.filter(a=> (a.type||'').toLowerCase().includes('cash')).reduce((s,a)=> s + Number(a.closing||0), 0);
    return { bank, cash };
  }
  const last = posted[posted.length-1];
  last.posted = false; recomputeClosingBalances();
  const bankBefore = state.accounts.filter(a=> (a.type||'').toLowerCase().includes('bank')).reduce((s,a)=> s + Number(a.closing||0), 0);
  const cashBefore = state.accounts.filter(a=> (a.type||'').toLowerCase().includes('cash')).reduce((s,a)=> s + Number(a.closing||0), 0);
  last.posted = true; recomputeClosingBalances();
  return { bank: bankBefore, cash: cashBefore };
}

/* ---------- UI wiring ---------- */
document.addEventListener('DOMContentLoaded', async ()=>{
  await loadState();
  wireTabs();
  prepareUI();
  switchTo('dashboard');
  renderAccounts();
  initialTransactionsView();
  renderDashboard();
});

/* Tabs */
function wireTabs(){
  document.querySelectorAll('.tab').forEach(btn=> btn.addEventListener('click', ()=> switchTo(btn.dataset.tab)));
}
function switchTo(view){
  document.querySelectorAll('[id$="View"]').forEach(el=> el.style.display='none');
  const el = document.getElementById(view+'View');
  if(el) el.style.display = 'block';
  document.querySelectorAll('.tab').forEach(t=> t.classList.toggle('active', t.dataset.tab === view));
  if(view==='dashboard') renderDashboard();
  if(view==='accounts') renderAccounts();
  if(view==='transactions') {
    initialTransactionsView();
    renderTransactionList();
  }
  if(view==='reports') prepareReportUI();
}

/* ---------- Prepare UI & events ---------- */
function prepareUI(){
  // Accounts
  document.getElementById('saveAccount').addEventListener('click', async ()=> {
    const name = document.getElementById('accName').value.trim();
    const type = document.getElementById('accType').value.trim();
    const narr = document.getElementById('accNarr').value.trim();
    const opening = parseAmountInput(document.getElementById('accOpening').value);
    if(!name) return alert('Account name required');
    // check duplicates
    if(state.accounts.some(a=>a.name.toLowerCase()===name.toLowerCase())) return alert('Account with this name already exists.');
    const acc = { id: uid('acc'), serial: state.meta.nextAccountSerial++, name, type, narration: narr, openingBalance: opening, closing: opening };
    state.accounts.push(acc);
    await saveState(); recomputeClosingBalances(); renderAccounts(); renderDashboard();
    resetAccountForm(); alert('Account created.');
  });
  document.getElementById('resetAccount').addEventListener('click', resetAccountForm);

  // clear/export/import
  document.getElementById('clearAll').addEventListener('click', ()=> clearAllData());
  document.getElementById('exportData').addEventListener('click', ()=> {
    const data = JSON.stringify({ accounts: state.accounts, transactions: state.transactions, meta: state.meta }, null, 2);
    const blob = new Blob([data], {type:'application/json'}); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'ledger_export.json'; a.click(); URL.revokeObjectURL(url);
  });
  document.getElementById('importDataBtn').addEventListener('click', ()=> document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', (ev)=> {
    const f = ev.target.files[0]; if(!f) return;
    const reader = new FileReader(); reader.onload = async e => {
      try {
        const parsed = JSON.parse(e.target.result);
        if(!confirm('Replace Supabase data with imported data?')) return;
        state.accounts = parsed.accounts || []; state.transactions = parsed.transactions || []; state.meta = parsed.meta || state.meta;
        await saveState(); recomputeClosingBalances(); renderAccounts(); initialTransactionsView(); renderDashboard(); alert('Import complete.');
      } catch(err){ alert('Import failed: ' + err.message); }
    };
    reader.readAsText(f);
  });

  // transactions
  document.getElementById('btnNewEntry').addEventListener('click', ()=> startNewEntry());
  document.getElementById('btnEdit').addEventListener('click', ()=> startEditCurrent());
  document.getElementById('btnDelete').addEventListener('click', ()=> deleteCurrentTransaction());
  document.getElementById('addLine').addEventListener('click', ()=> addLine());
  document.getElementById('removeLine').addEventListener('click', ()=> removeLastLine());
  document.getElementById('btnCancel').addEventListener('click', ()=> cancelForm());
  document.getElementById('btnPost').addEventListener('click', ()=> finishAndPost());

  // navs
  document.getElementById('firstTx').addEventListener('click', ()=> goToTx(0));
  document.getElementById('lastTx').addEventListener('click', ()=> goToTx(state.transactions.length-1));
  document.getElementById('prevTx').addEventListener('click', ()=> navigateTx(-1));
  document.getElementById('nextTx').addEventListener('click', ()=> navigateTx(1));

  // filters & search
  document.getElementById('transaction-search').addEventListener('input', ()=> renderTransactionList());
  document.getElementById('transaction-search-filter').addEventListener('change', ()=> renderTransactionList());
  document.getElementById('toggle-advanced').addEventListener('click', ()=> {
    const p = document.getElementById('advancedFiltersPanel');
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('clear-filters-btn').addEventListener('click', ()=> {
    ['filter-date-from','filter-date-to','filter-amount-min','filter-amount-max','filter-account','filter-description','filter-voucher']
      .forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    renderTransactionList();
  });

  // advanced filter inputs -> re-render
  ['filter-date-from','filter-date-to','filter-amount-min','filter-amount-max','filter-account','filter-description','filter-voucher']
    .forEach(id => {
      const el = document.getElementById(id);
      if(!el) return;
      el.addEventListener('input', ()=> renderTransactionList());
    });

  // autocomplete setup for filters
  setupAutocomplete("filter-account","suggest-account", () => state.accounts.map(a => a.name));
  setupAutocomplete("filter-description","suggest-description", () => state.transactions.map(t => t.narration || t.description || ''));
  setupAutocomplete("filter-voucher","suggest-voucher", () => state.transactions.map(t => String(t.voucherNo)));
  setupAutocomplete("filter-date-from","suggest-date-from", () => state.transactions.map(t => t.date));
  setupAutocomplete("filter-date-to","suggest-date-to", () => state.transactions.map(t => t.date));
  setupAutocomplete("filter-amount-min","suggest-amount-min", () => state.transactions.flatMap(t => t.lines.map(l => String(l.dr || l.cr || 0))));
  setupAutocomplete("filter-amount-max","suggest-amount-max", () => state.transactions.flatMap(t => t.lines.map(l => String(l.dr || l.cr || 0))));

  // reports
  document.getElementById('runReport').addEventListener('click', ()=> runReport());
  document.getElementById('refreshReport').addEventListener('click', ()=> prepareReportUI());

  // keyboard navigation (global, but ignore when typing)
  document.addEventListener('keydown', (e) => {
    if(document.activeElement && ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
    if(state.transactions.length === 0) return;
    let changed = false;
    if(e.key === "ArrowUp"){ if(state.currentTxIndex === null) state.currentTxIndex = 0; else if(state.currentTxIndex > 0) state.currentTxIndex--; changed = true; }
    if(e.key === "ArrowDown"){ if(state.currentTxIndex === null) state.currentTxIndex = 0; else if(state.currentTxIndex < state.transactions.length - 1) state.currentTxIndex++; changed = true; }
    if(e.key === "PageUp"){ if(state.currentTxIndex === null) state.currentTxIndex = 0; else state.currentTxIndex = Math.max(0, state.currentTxIndex - 5); changed = true; }
    if(e.key === "PageDown"){ if(state.currentTxIndex === null) state.currentTxIndex = 0; else state.currentTxIndex = Math.min(state.transactions.length - 1, state.currentTxIndex + 5); changed = true; }
    if(e.key === "Home"){ state.currentTxIndex = 0; changed = true; }
    if(e.key === "End"){ state.currentTxIndex = state.transactions.length - 1; changed = true; }
    if(changed){
      renderTransactionList();
      renderTxView();
      e.preventDefault();
    }
  });
}

/* ---------- Accounts ---------- */
function resetAccountForm(){ document.getElementById('accName').value=''; document.getElementById('accType').value=''; document.getElementById('accNarr').value=''; document.getElementById('accOpening').value='0'; }

function renderAccounts(){
  recomputeClosingBalances();
  const tbody = document.querySelector('#accountsTable tbody'); tbody.innerHTML = '';
  state.accounts.sort((a,b)=> a.serial - b.serial).forEach(a=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${a.serial}</td><td>${escapeHtml(a.name)}</td><td>${escapeHtml(a.type||'')}</td><td class="right">${money(a.openingBalance)}</td><td class="right">${money(a.closing||0)}</td>
      <td><button class="btn small" data-id="${a.id}" onclick="startEditAccount(event)">Edit</button>
      <button class="btn small" style="margin-left:6px" data-id="${a.id}" onclick="removeAccount(event)">Remove</button></td>`;
    tbody.appendChild(tr);
  });

  const sel = document.getElementById('reportAccount'); sel.innerHTML = '<option value="">-- All accounts --</option>';
  state.accounts.forEach(a => { const opt = document.createElement('option'); opt.value = a.id; opt.text = `${a.name} (S:${a.serial})`; sel.appendChild(opt); });
}

function removeAccount(ev){
  const id = ev.currentTarget.dataset.id;
  const used = state.transactions.some(tx => tx.lines.some(l => l.accountId === id));
  if(used) return alert('Cannot remove account: it is used in transactions.');
  if(!confirm('Delete account? This cannot be undone.')) return;
  const idx = state.accounts.findIndex(a => a.id === id); if(idx !== -1) state.accounts.splice(idx,1);
  saveState(); recomputeClosingBalances(); renderAccounts(); renderDashboard(); alert('Account removed.');
}

function startEditAccount(ev){
  const id = ev.currentTarget.dataset.id; const acc = findAccount(id); if(!acc) return alert('Account not found');
  document.getElementById('accName').value = acc.name; document.getElementById('accType').value = acc.type; document.getElementById('accNarr').value = acc.narration; document.getElementById('accOpening').value = acc.openingBalance;
  const saveBtn = document.getElementById('saveAccount'); const old = saveBtn.onclick;
  saveBtn.onclick = function(){ const name = document.getElementById('accName').value.trim(); if(!name) return alert('Account name required'); acc.name = name; acc.type = document.getElementById('accType').value.trim(); acc.narration = document.getElementById('accNarr').value.trim(); acc.openingBalance = parseAmountInput(document.getElementById('accOpening').value)||0; saveState(); recomputeClosingBalances(); renderAccounts(); renderDashboard(); resetAccountForm(); saveBtn.onclick = old; alert('Account updated.'); };
}

/* ---------- Transactions (view/form) ---------- */
function initialTransactionsView(){
  recomputeClosingBalances();
  if(state.transactions.length) state.currentTxIndex = state.transactions.length - 1; else state.currentTxIndex = null;
  state.formMode = false; state._formTx = null;
  renderTxView();
  renderTransactionList();
}

function renderTxView(){
  document.getElementById('txFormArea').style.display = 'none';
  document.getElementById('txViewArea').style.display = 'block';
  document.getElementById('btnNewEntry').disabled = false;
  document.getElementById('btnEdit').disabled = (state.currentTxIndex === null);
  document.getElementById('btnDelete').disabled = (state.currentTxIndex === null);
  const view = document.getElementById('txViewContent');
  if(state.currentTxIndex === null || !state.transactions[state.currentTxIndex]){
    document.getElementById('voucherNo').value = ''; document.getElementById('voucherDate').value = (new Date()).toISOString().slice(0,10);
    view.innerHTML = 'No transactions yet. Click New Entry to create.';
    return;
  }
  const tx = state.transactions[state.currentTxIndex];
  document.getElementById('voucherNo').value = tx.voucherNo; document.getElementById('voucherDate').value = tx.date;
  let html = `<div style="font-weight:600">Voucher ${tx.voucherNo} — Date: ${tx.date}${tx.posted? ' (Posted)' : ' (Draft)'}</div>`;
  html += `<div style="margin-top:8px;margin-bottom:8px">${escapeHtml(tx.narration||'')}</div>`;
  html += `<table><thead><tr><th>#</th><th>Account</th><th>Narration</th><th class="right">DR</th><th class="right">CR</th></tr></thead><tbody>`;
  tx.lines.forEach((l,i)=>{
    const acc = findAccount(l.accountId);
    html += `<tr><td>${i+1}</td><td>${escapeHtml(acc?acc.name:'(deleted)')}</td><td>${escapeHtml(l.narration||'')}</td><td class="right">${plainMoney(l.dr)}</td><td class="right">${plainMoney(l.cr)}</td></tr>`;
  });
  const drTotal = tx.lines.reduce((s,l)=> s + Number(l.dr||0),0); const crTotal = tx.lines.reduce((s,l)=> s + Number(l.cr||0),0);
  html += `</tbody><tfoot><tr><td colspan="3" class="right"><b>Totals</b></td><td class="right">${plainMoney(drTotal)}</td><td class="right">${plainMoney(crTotal)}</td></tr></tfoot></table>`;
  view.innerHTML = html;
}

/* Start new entry */
function startNewEntry(){
  if(state.accounts.length === 0) return alert('Create at least one account first.');
  state.formMode = true;
  state._formTx = { id: uid('tx'), voucherNo: state.meta.nextVoucherNo, date: (new Date()).toISOString().slice(0,10), narration: '', lines: [{id: uid('line'), accountId: state.accounts[0].id, narration:'', dr:0, cr:0}], posted:false };
  document.getElementById('voucherNo').value = state._formTx.voucherNo; document.getElementById('voucherDate').value = state._formTx.date;
  showFormArea();
}

/* Edit current */
function startEditCurrent(){
  if(state.currentTxIndex === null || !state.transactions[state.currentTxIndex]) return alert('No transaction selected to edit.');
  state.formMode = true; state._formTx = JSON.parse(JSON.stringify(state.transactions[state.currentTxIndex]));
  document.getElementById('voucherNo').value = state._formTx.voucherNo; document.getElementById('voucherDate').value = state._formTx.date;
  showFormArea();
}

/* Show form */
function showFormArea(){
  document.getElementById('txViewArea').style.display = 'none'; document.getElementById('txFormArea').style.display = 'block';
  populateTxLines(); document.getElementById('btnNewEntry').disabled = true; document.getElementById('btnEdit').disabled = true; document.getElementById('btnDelete').disabled = true;
}

/* Cancel */
function cancelForm(){
  if(!confirm('Cancel entry/edit? Unsaved changes will be lost.')) return;
  state.formMode = false; state._formTx = null; renderTxView(); renderTransactionList();
}

/* Populate lines UI (uses inline text input for account name) */
function populateTxLines(){
  const wrapper = document.getElementById('txLines'); wrapper.innerHTML = '';
  if(!state._formTx) return;
  state._formTx.lines.forEach((line, idx) => {
    const row = document.createElement('div'); row.className='rows'; row.style.marginTop='8px'; row.dataset.lineId = line.id;
    row.innerHTML = `
      <div class="indexCol">${idx+1}.</div>
      <div class="accountSelect"><input data-field="accountText" data-line="${line.id}" placeholder="Type account name..." value="${escapeHtml(findAccount(line.accountId)?.name || '')}" /></div>
      <div style="flex:1"><input data-field="narration" data-line="${line.id}" placeholder="Line narration" value="${escapeHtml(line.narration||'')}" /></div>
      <div class="amount"><input class="amount-input" data-field="dr" data-line="${line.id}" type="text" placeholder="DR" value="${line.dr?plainMoney(line.dr):''}" /></div>
      <div class="amount"><input class="amount-input" data-field="cr" data-line="${line.id}" type="text" placeholder="CR" value="${line.cr?plainMoney(line.cr):''}" /></div>
      <div style="width:80px;flex:0 0 80px"><button class="btn small" data-action="del" data-line="${line.id}">Remove</button></div>
    `;
    wrapper.appendChild(row);

    // wire up autocomplete for account text and bind events
    const accInput = row.querySelector('input[data-field="accountText"]');
    setupInlineAccountAutocomplete(accInput, line.id);

    // bind events for other inputs
    row.querySelectorAll('input, button').forEach(el => {
      el.addEventListener('input', onLineChange);
      el.addEventListener('change', onLineChange);
      el.addEventListener('click', (e)=> { if(e.target.dataset.action === 'del'){ removeLineById(e.target.dataset.line); } });
    });
  });
  updateTotals();
}

/* Inline account autocomplete for form lines */
function setupInlineAccountAutocomplete(inputEl, lineId){
  let container = inputEl.parentElement;
  let box = container.querySelector('.suggestions.inline');
  if(!box){
    box = document.createElement('div'); box.className='suggestions inline'; box.style.display='none'; container.appendChild(box);
  }
  inputEl.addEventListener('input', () => {
    const q = inputEl.value.trim().toLowerCase();
    box.innerHTML = '';
    if(!q){ box.style.display='none'; return; }
    const matches = state.accounts.filter(a => a.name.toLowerCase().includes(q)).slice(0,50);
    if(matches.length === 0){ box.style.display='none'; return; }
    matches.forEach(m => {
      const div = document.createElement('div'); div.className='suggestion-item'; div.textContent = m.name;
      div.onclick = () => {
        inputEl.value = m.name;
        const l = state._formTx.lines.find(x=>x.id===lineId);
        if(l) l.accountId = m.id;
        box.style.display='none';
      };
      box.appendChild(div);
    });
    box.style.display='block';
  });
  document.addEventListener('click', (e)=>{
    if(!container.contains(e.target) && e.target !== inputEl) box.style.display='none';
  });
}

/* Line change handler */
function onLineChange(e){
  const el = e.target; const field = el.dataset.field; const lid = el.dataset.line;
  if(!field || !lid || !state._formTx) return;
  const l = state._formTx.lines.find(x=>x.id===lid); if(!l) return;
  if(field === 'accountText'){
    const typed = el.value.trim();
    const match = state.accounts.find(a => a.name.toLowerCase() === typed.toLowerCase());
    if(match) l.accountId = match.id; else l.accountId = ''; // if exact match set id
  } else if(field === 'narration'){ l.narration = el.value; }
  else if(field === 'dr'){
    l.dr = parseAmountInput(el.value);
    if(l.dr > 0) l.cr = 0;
    const crInput = document.querySelector(`input[data-field="cr"][data-line="${lid}"]`);
    if(crInput) crInput.value = '';
    updateTotals();
  }
  else if(field === 'cr'){
    l.cr = parseAmountInput(el.value);
    if(l.cr > 0) l.dr = 0;
    const drInput = document.querySelector(`input[data-field="dr"][data-line="${lid}"]`);
    if(drInput) drInput.value = '';
    updateTotals();
  }
}

/* Add/remove lines */
function addLine(){ if(!state._formTx) return; state._formTx.lines.push({ id: uid('line'), accountId: state.accounts[0]?.id || '', narration:'', dr:0, cr:0 }); populateTxLines(); }
function removeLastLine(){ if(!state._formTx) return; if(state._formTx.lines.length <= 1) return alert('At least one line required'); state._formTx.lines.pop(); populateTxLines(); }
function removeLineById(lid){ if(!state._formTx) return; const idx = state._formTx.lines.findIndex(x=>x.id===lid); if(idx===-1) return; if(state._formTx.lines.length <= 1) return alert('At least one line required'); state._formTx.lines.splice(idx,1); populateTxLines(); }

/* Totals */
function updateTotals(){ if(!state._formTx) return; const crTotal = state._formTx.lines.reduce((s,l)=> s + Number(l.cr||0), 0); const drTotal = state._formTx.lines.reduce((s,l)=> s + Number(l.dr||0), 0); document.getElementById('crTotal').textContent = money(crTotal); document.getElementById('drTotal').textContent = money(drTotal); }

/* Finish & Post (validations: >=2 lines, DR=CR, each line either dr or cr, account present) */
async function finishAndPost(){
  if(!state._formTx) return alert('No entry to post.');
  state._formTx.date = document.getElementById('voucherDate').value || state._formTx.date;
  const validLines = state._formTx.lines.map(l=> ({ id: l.id, accountId: l.accountId, narration: l.narration || '', dr: Number(l.dr||0), cr: Number(l.cr||0) }))
    .filter(l => ( ((l.dr>0 && l.cr===0) || (l.cr>0 && l.dr===0)) && l.accountId ));
  if(validLines.length < 2) return alert('At least two valid lines are required.');
  const drTotal = validLines.reduce((s,l)=> s + Number(l.dr||0), 0);
  const crTotal = validLines.reduce((s,l)=> s + Number(l.cr||0), 0);
  if(Math.abs(drTotal - crTotal) > 0.0001) return alert('Debit and Credit totals must match before posting.');

  // Prevent posting if any line points to same account in contradictory way? (we allow multi-lines to same account)
  // create tx object
  const txObj = { id: state._formTx.id || uid('tx'), voucherNo: state._formTx.voucherNo || state.meta.nextVoucherNo, date: state._formTx.date, narration: state._formTx.narration || '', lines: validLines, posted: true, timestamp: Date.now() };

  // Save / replace
  const existingIndex = state.transactions.findIndex(t=>t.id === txObj.id);
  if(existingIndex !== -1){
    state.transactions[existingIndex] = txObj; state.currentTxIndex = existingIndex;
  } else {
    state.transactions.push(txObj); state.currentTxIndex = state.transactions.length - 1;
  }
  state.meta.nextVoucherNo = Math.max(state.meta.nextVoucherNo, Number(txObj.voucherNo) + 1);

  // snapshot prev totals before posting
  const idx = state.transactions.findIndex(t=>t.id === txObj.id);
  let prevSnap = null;
  if(idx !== -1){
    state.transactions[idx].posted = false; recomputeClosingBalances();
    const bankBefore = state.accounts.filter(a=> (a.type||'').toLowerCase().includes('bank')).reduce((s,a)=> s + Number(a.closing||0), 0);
    const cashBefore = state.accounts.filter(a=> (a.type||'').toLowerCase().includes('cash')).reduce((s,a)=> s + Number(a.closing||0), 0);
    prevSnap = { timestamp: Date.now(), bank: bankBefore, cash: cashBefore };
    state.transactions[idx].posted = true;
  } else {
    const bank = state.accounts.filter(a=> (a.type||'').toLowerCase().includes('bank')).reduce((s,a)=> s + Number(a.closing||0), 0);
    const cash = state.accounts.filter(a=> (a.type||'').toLowerCase().includes('cash')).reduce((s,a)=> s + Number(a.closing||0), 0);
    prevSnap = { timestamp: Date.now(), bank, cash };
  }
  state.meta.lastPostedSnapshot = prevSnap;

  recomputeClosingBalances(); await saveState();
  state.formMode = false; state._formTx = null;
  renderDashboard(); renderAccounts(); renderTxView(); renderTransactionList();
  alert('Transaction posted successfully.');
}

/* Delete transaction */
async function deleteCurrentTransaction(){
  if(state.currentTxIndex === null || !state.transactions[state.currentTxIndex]) return alert('No transaction selected.');
  const tx = state.transactions[state.currentTxIndex];
  if(!confirm(`Delete transaction voucher ${tx.voucherNo}? This cannot be undone.`)) return;
  state.transactions.splice(state.currentTxIndex,1);
  if(state.transactions.length === 0) state.currentTxIndex = null; else if(state.currentTxIndex >= state.transactions.length) state.currentTxIndex = state.transactions.length - 1;
  await saveState(); recomputeClosingBalances(); renderAccounts(); renderDashboard(); renderTxView(); renderTransactionList();
  alert('Transaction deleted.');
}

/* Navigation */
function navigateTx(dir){ if(state.transactions.length === 0) return; if(state.currentTxIndex === null) state.currentTxIndex = 0; state.currentTxIndex = Math.max(0, Math.min(state.transactions.length-1, state.currentTxIndex + dir)); state._formTx = null; state.formMode = false; renderTxView(); renderTransactionList(); }
function goToTx(idx){ if(state.transactions.length === 0) return; state.currentTxIndex = Math.max(0, Math.min(state.transactions.length-1, idx)); state._formTx = null; state.formMode = false; renderTxView(); renderTransactionList(); }

/* ---------- Reports ---------- */
function prepareReportUI(){
  const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth(), 1);
  document.getElementById('reportFrom').value = first.toISOString().slice(0,10);
  document.getElementById('reportTo').value = now.toISOString().slice(0,10);
  renderAccounts(); document.getElementById('reportResult').style.display = 'none';
}
function runReport(){
  const accId = document.getElementById('reportAccount').value;
  const from = document.getElementById('reportFrom').value;
  const to = document.getElementById('reportTo').value;
  const posted = state.transactions.filter(t=>t.posted).slice().sort((a,b)=>{
    const da=new Date(a.date).getTime(), db=new Date(b.date).getTime();
    if(da!==db) return da-db; return (a.voucherNo||0)-(b.voucherNo||0);
  });

  let openingBalance = 0;
  if(accId){
    const acc = findAccount(accId);
    openingBalance = Number(acc?.openingBalance || 0);
    posted.forEach(t => { if(from && new Date(t.date) >= new Date(from)) return; t.lines.forEach(l=>{ if(l.accountId === accId) openingBalance += Number(l.dr||0) - Number(l.cr||0); }); });
  }

  const rows = [];
  posted.forEach(t => {
    if(from && new Date(t.date) < new Date(from)) return;
    if(to && new Date(t.date) > new Date(to)) return;
    t.lines.forEach(l => { if(accId && l.accountId !== accId) return; rows.push({ voucher: t.voucherNo, date: t.date, narration: l.narration || '', dr: Number(l.dr||0), cr: Number(l.cr||0), accountId: l.accountId }); });
  });

  const tableBody = document.querySelector('#reportTable tbody'); tableBody.innerHTML = '';
  document.getElementById('reportMeta').textContent = `Account: ${accId ? (findAccount(accId)?.name || '—') : 'All accounts'}; Date: ${from||'start'} to ${to||'end'}`;
  if(accId){
    document.getElementById('reportOpening').textContent = `Opening Balance: ${money(openingBalance)}`;
    const trOpen = document.createElement('tr'); trOpen.innerHTML = `<td></td><td></td><td>Opening Balance</td><td class="right"></td><td class="right"></td><td class="right">${money(openingBalance)}</td>`; tableBody.appendChild(trOpen);
  } else {
    document.getElementById('reportOpening').textContent = '';
  }

  let running = openingBalance, drTot = 0, crTot = 0;
  rows.forEach(r => {
    const tr = document.createElement('tr');
    if(accId){
      running = running + r.dr - r.cr; drTot += r.dr; crTot += r.cr;
      tr.innerHTML = `<td>${r.voucher}</td><td>${r.date}</td><td>${escapeHtml(r.narration)}</td><td class="right">${money(r.dr)}</td><td class="right">${money(r.cr)}</td><td class="right">${money(running)}</td>`;
    } else {
      drTot += r.dr; crTot += r.cr;
      tr.innerHTML = `<td>${r.voucher}</td><td>${r.date}</td><td>${escapeHtml(r.narration)}</td><td class="right">${money(r.dr)}</td><td class="right">${money(r.cr)}</td><td class="right">—</td>`;
    }
    tableBody.appendChild(tr);
  });

  document.getElementById('reportDRTotal').textContent = money(drTot);
  document.getElementById('reportCRTotal').textContent = money(crTot);
  document.getElementById('reportFinalBal').textContent = accId ? money(running) : '—';
  document.getElementById('closingBalance').textContent = accId ? money(running) : '—';
  document.getElementById('carryForward').textContent = accId ? money(running) : '—';
  document.getElementById('reportResult').style.display = 'block';
}

/* ---------- Dashboard ---------- */
function renderDashboard(){
  recomputeClosingBalances();
  const bankTotal = state.accounts.filter(a=> (a.type||'').toLowerCase().includes('bank')).reduce((s,a)=> s + Number(a.closing||0), 0);
  const cashTotal = state.accounts.filter(a=> (a.type||'').toLowerCase().includes('cash')).reduce((s,a)=> s + Number(a.closing||0), 0);
  const currentTotal = bankTotal + cashTotal;
  document.getElementById('bankTotal').textContent = money(bankTotal);
  document.getElementById('cashTotal').textContent = money(cashTotal);
  document.getElementById('currentTotal').textContent = money(currentTotal);

  const prev = computePreviousTotalsBeforeLastPosted();
  document.getElementById('previousTotal').textContent = money(Number(prev.cash||0) + Number(prev.bank||0));
  document.getElementById('summaryText').textContent = `${state.accounts.length} accounts, ${state.transactions.filter(t=>t.posted).length} transactions posted`;
}

/* ---------- Transaction list, filters, highlighting & autocomplete ---------- */
function renderTransactionList(){
  const container = document.getElementById('transaction-list');
  container.innerHTML = '';

  const searchQuery = (document.getElementById('transaction-search').value || '').trim().toLowerCase();
  const field = (document.getElementById('transaction-search-filter').value || 'all');

  // advanced filters
  const dateFrom = document.getElementById('filter-date-from')?.value || '';
  const dateTo = document.getElementById('filter-date-to')?.value || '';
  const amountMin = parseFloat(document.getElementById('filter-amount-min')?.value) || null;
  const amountMax = parseFloat(document.getElementById('filter-amount-max')?.value) || null;
  const accountFilter = (document.getElementById('filter-account')?.value || '').toLowerCase();
  const descFilter = (document.getElementById('filter-description')?.value || '').toLowerCase();
  const voucherFilter = (document.getElementById('filter-voucher')?.value || '').toLowerCase();

  let matchedAny = false;
  state.transactions.forEach((tx, idx) => {
    // advanced filters
    if(dateFrom && tx.date < dateFrom) return;
    if(dateTo && tx.date > dateTo) return;
    const txTotal = tx.lines.reduce((s,l)=> s + Number(l.dr||0) + Number(l.cr||0), 0);
    if(amountMin !== null && !isNaN(amountMin) && txTotal < amountMin) return;
    if(amountMax !== null && !isNaN(amountMax) && txTotal > amountMax) return;
    if(accountFilter && !tx.lines.some(l => (findAccount(l.accountId)?.name || '').toLowerCase().includes(accountFilter))) return;
    if(descFilter && !((tx.narration||'') + (tx.description||'')).toLowerCase().includes(descFilter)) return;
    if(voucherFilter && !(String(tx.voucherNo).toLowerCase().includes(voucherFilter))) return;

    // searchable text by field
    const accountsText = tx.lines.map(l => `${findAccount(l.accountId)?.name || ''} ${l.dr||l.cr||0}`).join(' | ');
    let targetText = '';
    switch(field){
      case 'date': targetText = tx.date; break;
      case 'voucher': targetText = String(tx.voucherNo); break;
      case 'description': targetText = (tx.narration||'') + ' ' + (tx.description||''); break;
      case 'account': targetText = accountsText; break;
      case 'amount': targetText = tx.lines.map(l => String(l.dr||l.cr||0)).join(' | '); break;
      default: targetText = `${tx.date} | Voucher ${tx.voucherNo} | ${tx.narration || tx.description || ''} | ${accountsText}`;
    }
    if(searchQuery && !targetText.toLowerCase().includes(searchQuery)) return;

    // Highlight matching substring
    let displayText = `${tx.date} | Voucher ${tx.voucherNo} | ${tx.narration || tx.description || ''}`;
    if(searchQuery){
      const regex = new RegExp(`(${escapeRegex(searchQuery)})`, 'ig');
      displayText = targetText.replace(regex, '<mark>$1</mark>');
    }

    const row = document.createElement('div');
    row.className = 'tx-row';
    if(idx === state.currentTxIndex) row.classList.add('tx-active');
    row.innerHTML = `<div>${displayText}</div>`;
    row.addEventListener('click', ()=>{
      state.currentTxIndex = idx;
      renderTxView();
      renderTransactionList();
    });
    container.appendChild(row);
    matchedAny = true;
  });

  if(!matchedAny){
    container.innerHTML = '<div style="padding:12px;color:var(--muted)">No transactions match the filters/search.</div>';
  } else {
    const active = container.querySelector('.tx-active');
    if(active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/* Generic suggestions/autocomplete for advanced filters */
function setupAutocomplete(inputId, suggestId, getOptions){
  const input = document.getElementById(inputId);
  const box = document.getElementById(suggestId);
  if(!input || !box) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    box.innerHTML = '';
    if(!q){ box.style.display='none'; return; }
    const options = getOptions() || [];
    const matches = [...new Set(options)].filter(o => String(o).toLowerCase().includes(q)).slice(0,50);
    if(matches.length === 0){ box.style.display='none'; return; }
    matches.forEach(m=>{
      const div = document.createElement('div'); div.className='suggestion-item'; div.textContent = m;
      div.addEventListener('click', ()=>{
        input.value = m; box.style.display='none'; renderTransactionList();
      });
      box.appendChild(div);
    });
    box.style.display='block';
  });
  document.addEventListener('click', (e)=>{
    if(!box.contains(e.target) && e.target !== input) box.style.display='none';
  });
}

/* Expose a couple functions used by inline HTML handlers (edit/remove account) */
window.startEditAccount = startEditAccount;
window.removeAccount = removeAccount;

/* Expose render helpers for external dev debugging */
window.renderTransactionList = renderTransactionList;
window.renderTxView = renderTxView;

// Expose state for debugging in console
window.state = state;

/* End of file */
