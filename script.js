// -----------------------
// Supabase Initialization
// -----------------------
const SUPABASE_URL = 'https://ipwizsmijenwycudxfny.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlwd2l6c21pamVud3ljdWR4Zm55Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyMjQ3OTIsImV4cCI6MjA3MjgwMDc5Mn0.nkS0G4KiQum6IVEgZdQlPXoGrCY5n2JpZdsE-KFgr5U';

let supabase;
try {
  supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (err) {
  console.error("Supabase library not loaded. Make sure you included it in HTML.", err);
}

// -----------------------
// TAB SWITCHING
// -----------------------
const tabs = document.querySelectorAll(".tab");
const tabContents = document.querySelectorAll(".tab-content");

if (tabs.length && tabContents.length) {
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      const target = tab.dataset.tab;
      tabContents.forEach(tc => {
        tc.classList.remove("active");
        if (tc.id === target) tc.classList.add("active");
      });
    });
  });
}

// -----------------------
// GLOBAL ARRAYS
// -----------------------
let accounts = [];
let transactions = [];

// -----------------------
// ACCOUNTS MANAGEMENT
// -----------------------
const accountForm = document.getElementById("account-form");
const accountsTableBody = document.querySelector("#accounts-table tbody");
const transAccountSelect = document.getElementById("trans-account");

async function loadAccounts() {
  if (!supabase) return;
  const { data, error } = await supabase.from("accounts").select("*").order("id");
  if (error) return console.error("Error loading accounts:", error);

  accounts = data;
  renderAccounts();
  populateAccountsDropdown();
}

function renderAccounts() {
  if (!accountsTableBody) return;
  accountsTableBody.innerHTML = "";
  accounts.forEach(acc => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${acc.name}</td>
      <td>${acc.type}</td>
      <td>${acc.balance.toFixed(2)}</td>
      <td>
        <button class="action-btn edit" onclick="editAccount(${acc.id})">Edit</button>
        <button class="action-btn remove" onclick="deleteAccount(${acc.id})">Delete</button>
      </td>
    `;
    accountsTableBody.appendChild(row);
  });
}

function populateAccountsDropdown() {
  if (!transAccountSelect) return;
  transAccountSelect.innerHTML = `<option value="">Select Account</option>`;
  accounts.forEach(acc => {
    const option = document.createElement("option");
    option.value = acc.id;
    option.textContent = `${acc.name} (${acc.type})`;
    transAccountSelect.appendChild(option);
  });
}

if (accountForm) {
  accountForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("account-name");
    const typeInput = document.getElementById("account-type");
    const balanceInput = document.getElementById("account-amount");

    const name = nameInput.value.trim();
    const type = typeInput.value;
    const balance = parseFloat(balanceInput.value) || 0;

    if (!name || !type) return alert("Enter account name and type.");
    const { error } = await supabase.from("accounts").insert([{ name, type, balance }]);
    if (error) return console.error("Error adding account:", error);

    accountForm.reset();
    loadAccounts();
  });
}

// -----------------------
// TRANSACTIONS MANAGEMENT
// -----------------------
const transactionForm = document.getElementById("transaction-form");
const transactionsTableBody = document.querySelector("#transactions-table tbody");
const voucherInput = document.getElementById("voucher-no");

async function loadTransactions() {
  if (!supabase) return;
  const { data, error } = await supabase.from("transactions").select("*").order("id");
  if (error) return console.error("Error loading transactions:", error);

  transactions = data;
  renderTransactions();
}

function renderTransactions() {
  if (!transactionsTableBody) return;
  transactionsTableBody.innerHTML = "";
  transactions.forEach(tr => {
    const acc = accounts.find(a => a.id === tr.account_id);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${tr.voucher}</td>
      <td>${tr.date}</td>
      <td>${acc ? acc.name : "Deleted"}</td>
      <td>${tr.narration}</td>
      <td>${tr.credit.toFixed(2)}</td>
      <td>${tr.debit.toFixed(2)}</td>
      <td>
        <button class="action-btn edit" onclick="editTransaction(${tr.id})">Edit</button>
        <button class="action-btn remove" onclick="deleteTransaction(${tr.id})">Delete</button>
      </td>
    `;
    transactionsTableBody.appendChild(row);
  });
}

if (transactionForm) {
  transactionForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const date = document.getElementById("trans-date").value;
    const accountId = parseInt(transAccountSelect.value);
    const narration = document.getElementById("trans-narration").value.trim();
    const credit = parseFloat(document.getElementById("trans-cr").value) || 0;
    const debit = parseFloat(document.getElementById("trans-dr").value) || 0;

    if (!date || !accountId) return alert("Select date and account.");

    const voucher = `VCH-${transactions.length + 1}`;
    if (voucherInput) voucherInput.value = voucher;

    const { error } = await supabase.from("transactions").insert([{
      voucher, date, account_id: accountId, narration, credit, debit
    }]);
    if (error) return console.error("Error adding transaction:", error);

    const acc = accounts.find(a => a.id === accountId);
    const newBalance = acc.balance + debit - credit;
    await supabase.from("accounts").update({ balance: newBalance }).eq("id", accountId);

    transactionForm.reset();
    if (voucherInput) voucherInput.value = "";
    loadAccounts();
    loadTransactions();
  });
}

// -----------------------
// REPORTS / CSV BACKUP (optional)
// -----------------------
function downloadCSV(filename, csvContent) {
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const exportBtn = document.getElementById("export-csv-btn");
if (exportBtn) {
  exportBtn.addEventListener("click", async () => {
    if (!supabase) return;

    const { data: accountsData } = await supabase.from("accounts").select("*").order("id");
    let csvAccounts = "id,name,type,balance,created_at\n";
    accountsData.forEach(acc => {
      csvAccounts += `${acc.id},"${acc.name}",${acc.type},${acc.balance},${acc.created_at}\n`;
    });
    downloadCSV("accounts_backup.csv", csvAccounts);

    const { data: transactionsData } = await supabase.from("transactions").select("*").order("id");
    let csvTrans = "id,voucher,date,account_id,narration,credit,debit,created_at\n";
    transactionsData.forEach(tr => {
      csvTrans += `${tr.id},${tr.voucher},${tr.date},${tr.account_id},"${tr.narration}",${tr.credit},${tr.debit},${tr.created_at}\n`;
    });
    downloadCSV("transactions_backup.csv", csvTrans);
  });
}

// -----------------------
// INITIAL LOAD
// -----------------------
window.addEventListener("load", async () => {
  if (!supabase) return;
  await loadAccounts();
  await loadTransactions();
});
