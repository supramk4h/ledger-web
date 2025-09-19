/* app.js - complete accounting logic */

(function () {
  'use strict';

  // ---------- Constants & State ----------
  const DB_KEY = 'acct_full_db_v2';
  let db = { accounts: [], vouchers: [] };
  let currentVoucherIndex = null;
  const ASSET_LIKE = new Set(['cash', 'bank', 'expense', 'personal']);

  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const fmt = (n) => Number(n || 0).toFixed(2);
  const uid = (prefix = '') => (prefix ? prefix + '_' : '') + Math.random().toString(36).slice(2, 9);
  const safeText = (s) => (s == null ? '' : String(s));
  const escapeHtml = (str) => safeText(str).replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m]));

  // ---------- Persistence ----------
  function saveDB() {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    renderAll();
  }
  function loadDB() {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        db = {
          accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
          vouchers: Array.isArray(parsed.vouchers) ? parsed.vouchers : [],
        };
      } catch {
        seedSample(); saveDB();
      }
    } else { seedSample(); saveDB(); }
  }
  function seedSample() {
    db.accounts = [
      makeAccountObj('Cash', 'cash', 1000),
      makeAccountObj('Bank A', 'bank', 2000),
      makeAccountObj('Owner Capital', 'personal', 0),
    ];
    db.vouchers = [];
  }
  function resetData() {
    if (!confirm('Reset all data?')) return;
    localStorage.removeItem(DB_KEY);
    seedSample(); saveDB();
  }

  // ---------- Accounts ----------
  function makeAccountObj(name, category, opening = 0) {
    return {
      id: generateAccountNumber(category),
      name: safeText(name).trim(),
      category: safeText(category),
      balance: Number(opening) || 0,
      createdAt: new Date().toISOString(),
    };
  }
  function generateAccountNumber(cat) {
    const map = { cash:'C', bank:'B', expense:'E', personal:'P' };
    const prefix = map[cat] || 'X';
    const seq = (db.accounts.filter(a=>a.category===cat).length+1).toString().padStart(3,'0');
    return prefix+seq;
  }
  function addAccount(name, cat, opening) {
    if (!name || !cat) return alert('Name & category required');
    db.accounts.push(makeAccountObj(name,cat,opening));
    saveDB();
  }
  function updateAccount(id, patch) {
    const a = db.accounts.find(x=>x.id===id); if (!a) return;
    if (patch.name!=null) a.name = safeText(patch.name);
    if (patch.category!=null) a.category = safeText(patch.category);
    if (patch.balance!=null) a.balance = Number(patch.balance);
    saveDB();
  }
  function deleteAccount(id) {
    if (!confirm('Delete account?')) return;
    db.accounts = db.accounts.filter(a=>a.id!==id);
    saveDB();
  }

  // ---------- Vouchers ----------
  function makeLine(acc, amt, type) {
    return { account:acc, amount:Number(amt)||0, type:type==='cr'?'cr':'dr' };
  }
  function validateLines(lines) {
    const entries=(lines||[]).filter(l=>l.account&&l.amount>0);
    const dr=entries.filter(e=>e.type==='dr').reduce((s,x)=>s+x.amount,0);
    const cr=entries.filter(e=>e.type==='cr').reduce((s,x)=>s+x.amount,0);
    return {ok:Math.abs(dr-cr)<0.0001,dr,cr,entries};
  }
  function applyVoucherPosting(v,factor=1) {
    v.lines.forEach(l=>{
      const acc=db.accounts.find(a=>a.id===l.account); if(!acc)return;
      const amt=l.amount;
      if(l.type==='dr') { if(ASSET_LIKE.has(acc.category)) acc.balance+=factor*amt; else acc.balance-=factor*amt; }
      else { if(ASSET_LIKE.has(acc.category)) acc.balance-=factor*amt; else acc.balance+=factor*amt; }
    });
  }
  function createVoucher({date,narration,lines}) {
    const chk=validateLines(lines); if(!chk.ok) return alert('Dr/Cr mismatch');
    const v={id:uid('v'),date,narration,lines:chk.entries,totalDr:chk.dr,totalCr:chk.cr,createdAt:new Date().toISOString()};
    db.vouchers.push(v); applyVoucherPosting(v,1); saveDB();
  }
  function editVoucher(index,{date,narration,lines}) {
    const old=db.vouchers[index]; if(!old)return;
    applyVoucherPosting(old,-1);
    const chk=validateLines(lines); if(!chk.ok){applyVoucherPosting(old,1); return alert('Dr/Cr mismatch');}
    old.date=date; old.narration=narration; old.lines=chk.entries; old.totalDr=chk.dr; old.totalCr=chk.cr;
    applyVoucherPosting(old,1); saveDB();
  }
  function removeVoucher(index) {
    if(!confirm('Delete voucher?')) return;
    const v=db.vouchers[index]; applyVoucherPosting(v,-1);
    db.vouchers.splice(index,1); saveDB();
  }

  // ---------- Reports ----------
  function generateReport(accId='',from='',to='') {
    const rows=[]; db.vouchers.forEach(v=>{
      if(from&&v.date<from)return; if(to&&v.date>to)return;
      v.lines.forEach(l=>{ if(!accId||l.account===accId) rows.push({...l,date:v.date,narration:v.narration}); });
    }); return rows;
  }
  function exportSummaryToPDF() {
    if(!window.jspdf) return alert('jsPDF missing');
    const doc=new window.jspdf.jsPDF(); let y=20;
    db.accounts.forEach(a=>{doc.text(`${a.id} | ${a.name} | ${a.category} | ${fmt(a.balance)}`,10,y); y+=6;});
    doc.save('summary.pdf');
  }
  function exportReportToPDF(acc,from,to) {
    if(!window.jspdf) return alert('jsPDF missing');
    const rows=generateReport(acc,from,to); const doc=new window.jspdf.jsPDF(); let y=20;
    rows.forEach(r=>{doc.text(`${r.date} | ${r.narration} | ${r.account} | ${r.type.toUpperCase()} ${fmt(r.amount)}`,10,y); y+=6; if(y>280){doc.addPage();y=20;}});
    doc.save('report.pdf');
  }

  // ---------- Rendering ----------
  function renderAll() {
    renderDashboard(); renderAccounts(); renderVouchers(); renderReportOptions(); renderRecent();
    updateVoucherPosition();
  }
  function renderDashboard() {
    const c=$('#cards'); if(!c)return; c.innerHTML='';
    const totals=db.accounts.reduce((t,a)=>{t.total+=a.balance;if(a.category==='cash')t.cash+=a.balance;if(a.category==='bank')t.bank+=a.balance;return t;},{total:0,cash:0,bank:0});
    const defs=[{label:'Total',value:totals.total},{label:'Cash',value:totals.cash},{label:'Bank',value:totals.bank},{label:'Accounts',value:db.accounts.length},{label:'Vouchers',value:db.vouchers.length}];
    defs.forEach(d=>{const el=document.createElement('div');el.className='card';el.innerHTML=`<div>${d.label}</div><div>${fmt(d.value)}</div>`;c.appendChild(el);});
  }
  function renderAccounts() {
    const tb=$('#tblAccounts tbody'); if(!tb)return; tb.innerHTML='';
    db.accounts.forEach(a=>{const tr=document.createElement('tr');
      tr.innerHTML=`<td>${a.id}</td><td>${escapeHtml(a.name)}</td><td>${a.category}</td><td>${fmt(a.balance)}</td>
      <td><button data-act="edit" data-id="${a.id}">Edit</button><button data-act="del" data-id="${a.id}">Del</button></td>`; tb.appendChild(tr);});
  }
  function renderVouchers() {
    const tb=$('#tblVouchers tbody'); if(!tb)return; tb.innerHTML='';
    db.vouchers.forEach((v,i)=>{const tr=document.createElement('tr');
      tr.innerHTML=`<td>${v.date}</td><td>${escapeHtml(v.narration)}</td><td>${fmt(v.totalDr)}</td><td>${fmt(v.totalCr)}</td>
      <td><button data-act="open" data-idx="${i}">Open</button><button data-act="edit" data-idx="${i}">Edit</button><button data-act="del" data-idx="${i}">Del</button></td>`; tb.appendChild(tr);});
  }
  function renderReportOptions() {
    const sel=$('#reportAccount'); if(!sel)return; sel.innerHTML='<option value="">-- All --</option>';
    db.accounts.forEach(a=>{const o=document.createElement('option');o.value=a.id;o.textContent=`${a.id}-${a.name}`;sel.appendChild(o);});
  }
  function renderRecent() {
    const c=$('#recentVouchers'); if(!c)return; c.innerHTML='';
    db.vouchers.slice(-5).reverse().forEach(v=>{const el=document.createElement('div');el.className='card';el.textContent=`${v.date} | ${v.narration}`;c.appendChild(el);});
  }
  function updateVoucherPosition() {
    const el=$('#currentVoucherPos'); if(el) el.textContent=currentVoucherIndex==null?'-':`${currentVoucherIndex+1}/${db.vouchers.length}`;
  }

  // ---------- Voucher Editor ----------
  function clearVoucherEditor() {
    $('#vDate').value=''; $('#vNarr').value=''; $('#voucherEntries').innerHTML='';
    addVoucherRow(); addVoucherRow(); currentVoucherIndex=null; updateVoucherPosition(); updateVoucherTotals();
  }
  function addVoucherRow(line) {
    const wrap=document.createElement('div'); wrap.className='voucher-row';
    const sel=document.createElement('select'); sel.innerHTML='<option value="">--acc--</option>';
    db.accounts.forEach(a=>{const o=document.createElement('option');o.value=a.id;o.textContent=`${a.id}-${a.name}`;sel.appendChild(o);});
    if(line) sel.value=line.account;
    const amt=document.createElement('input'); amt.type='number'; amt.step='0.01'; amt.value=line?line.amount:0;
    const type=document.createElement('select'); type.innerHTML='<option value="dr">Dr</option><option value="cr">Cr</option>'; if(line) type.value=line.type;
    const del=document.createElement('button'); del.textContent='x'; del.type='button'; del.onclick=()=>{wrap.remove(); updateVoucherTotals();};
    [sel,amt,type].forEach(el=>el.oninput=updateVoucherTotals);
    wrap.append(sel,amt,type,del); $('#voucherEntries').appendChild(wrap);
  }
  function getVoucherLines() {
    return $$('#voucherEntries .voucher-row').map(r=>{
      const s=r.querySelector('select'); const i=r.querySelector('input'); const t=r.querySelectorAll('select')[1];
      return {account:s.value,amount:Number(i.value)||0,type:t.value};
    });
  }
  function updateVoucherTotals() {
    const lines=getVoucherLines();
    const dr=lines.filter(l=>l.type==='dr').reduce((s,x)=>s+x.amount,0);
    const cr=lines.filter(l=>l.type==='cr').reduce((s,x)=>s+x.amount,0);
    $('#voucherTotals').textContent=`Dr:${fmt(dr)} | Cr:${fmt(cr)}`;
  }
  function openVoucher(i) {
    const v=db.vouchers[i]; if(!v)return;
    currentVoucherIndex=i; $('#vDate').value=v.date; $('#vNarr').value=v.narration;
    $('#voucherEntries').innerHTML=''; v.lines.forEach(l=>addVoucherRow(l));
    updateVoucherTotals(); updateVoucherPosition(); document.querySelector('[data-section="vouchers"]').click();
  }

  // ---------- UI Wiring ----------
  function wireUI() {
    // nav
    $$('.nav-btn').forEach(btn=>btn.onclick=()=>{ $$('.nav-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
      $$('.page').forEach(p=>p.classList.add('hidden')); $('#'+btn.dataset.section).classList.remove('hidden'); renderAll(); });
    // accounts form
    $('#formAddAccount')?.addEventListener('submit',e=>{e.preventDefault(); addAccount($('#accName').value,$('#accCategory').value,$('#accOpening').value); e.target.reset();});
    $('#tblAccounts tbody')?.addEventListener('click',e=>{const b=e.target.closest('button'); if(!b)return; if(b.dataset.act==='del') deleteAccount(b.dataset.id); else if(b.dataset.act==='edit'){const a=db.accounts.find(x=>x.id===b.dataset.id); const nm=prompt('Name',a.name); if(nm)updateAccount(a.id,{name:nm});}});
    // voucher editor
    $('#addVoucherLine').onclick=()=>addVoucherRow();
    $('#clearVoucherBtn').onclick=()=>clearVoucherEditor();
    $('#saveVoucherBtn').onclick=()=>{const d=$('#vDate').value; const n=$('#vNarr').value; const lines=getVoucherLines();
      if(currentVoucherIndex==null) createVoucher({date:d,narration:n,lines}); else editVoucher(currentVoucherIndex,{date:d,narration:n,lines});
      clearVoucherEditor();};
    $('#tblVouchers tbody')?.addEventListener('click',e=>{const b=e.target.closest('button'); if(!b)return; const idx=+b.dataset.idx;
      if(b.dataset.act==='del') removeVoucher(idx); else if(b.dataset.act==='open') openVoucher(idx); else if(b.dataset.act==='edit') openVoucher(idx);});
    $('#prevV').onclick=()=>{if(db.vouchers.length) openVoucher(Math.max(0,(currentVoucherIndex??db.vouchers.length)-1));};
    $('#nextV').onclick=()=>{if(db.vouchers.length) openVoucher(Math.min(db.vouchers.length-1,(currentVoucherIndex??-1)+1));};
    // reports
    $('#runReport').onclick=()=>{const rows=generateReport($('#reportAccount').value,$('#reportFrom').value,$('#reportTo').value);
      $('#reportResult').innerHTML='<table><tr><th>Date</th><th>Narr</th><th>Dr</th><th>Cr</th></tr>'+
      rows.map(r=>`<tr><td>${r.date}</td><td>${escapeHtml(r.narration)}</td><td>${r.type==='dr'?fmt(r.amount):''}</td><td>${r.type==='cr'?fmt(r.amount):''}</td></tr>`).join('')+'</table>';};
    $('#exportSummary').onclick=exportSummaryToPDF;
    $('#exportReport').onclick=()=>exportReportToPDF($('#reportAccount').value,$('#reportFrom').value,$('#reportTo').value);
    $('#btnReset').onclick=resetData;
    $('#newVoucher').onclick=()=>{document.querySelector('[data-section="vouchers"]').click(); clearVoucherEditor();};
    $('#openAddAccount').onclick=()=>{document.querySelector('[data-section="accounts"]').click(); $('#accName').focus();};
  }

  // ---------- Init ----------
  loadDB(); wireUI(); clearVoucherEditor(); renderAll();

})();
