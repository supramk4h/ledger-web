// -----------------------
// Supabase Initialization
// -----------------------
const SUPABASE_URL = 'https://ipwizsmijenwycudxfny.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlwd2l6c21pamVud3ljdWR4Zm55Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyMjQ3OTIsImV4cCI6MjA3MjgwMDc5Mn0.nkS0G4KiQum6IVEgZdQlPXoGrCY5n2JpZdsE-KFgr5U';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// -----------------------
// TAB SWITCHING
// -----------------------
const tabs = document.querySelectorAll(".tab");
const tabContents = document.querySelectorAll(".tab-content");

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

// Load accounts from Supabase
async function loadAccounts() {
  const { data, error } = await supabase.from("accounts").select("*").order("id");
  if (error) return console.error(error);

  accounts = data;
  renderAccounts();
  populateAccountsDropdown();
}

// Render accounts table
function renderAccounts() {
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

// Populate account dropdown in transactions form
function populateAccountsDropdown() {
  transAccountSelect.innerHTML = `<option value="">Select Account</option>`;
  accounts.forEach(acc => {
    const option = document.createElement("option");
    option.value = acc.id;
    option.textContent = `${acc.name} (${acc.type})`;
    transAccountSelect.appendChild(option);
  });
}

// Add new account
accountForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("account-name").value.trim();
  const type = document.getElementById("account-type").value;
  const balance = parseFloat(document.getElementById("account-amount").value) || 0;

  if (!name || !type) return alert("Enter account name and type.");

  const { error } = await supabase.from("accounts").insert([{ name, type, balance }]);
  if (error) return console.error(error);

  accountForm.reset();
  loadAccounts();
});

// Edit account
async function editAccount(id) {
  const acc = accounts.find(a => a.id === id);
  const newName = prompt("Edit Account Name:", acc.name);
  const newType = prompt("Edit Account Type (Asset/Liability/Income/Expense):", acc.type);
  if (newName && newType) {
    const { error } = await supabase.from("accounts").update({ name: newName, type: newType }).eq("id", id);
    if (error) return console.error(error);
    loadAccounts();
  }
}

// Delete account
async function deleteAccount(id) {
  if (confirm("Delete this account?")) {
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) return console.error(error);
    loadAccounts();
  }
}

// -----------------------
// TRANSACTIONS MANAGEMENT
// -----------------------
const transactionForm = document.getElementById("transaction-form");
const transactionsTableBody = document.querySelector("#transactions-table tbody");
const voucherInput = document.getElementById("voucher-no");

// Load transactions
async function loadTransactions() {
  const { data, error } = await supabase.from("transactions").select("*").order("id");
  if (error) return console.error(error);
  transactions = data;
  renderTransactions();
}

// Render transactions table
function renderTransactions() {
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

// Add transaction
transactionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const date = document.getElementById("trans-date").value;
  const accountId = parseInt(transAccountSelect.value);
  const narration = document.getElementById("trans-narration").value.trim();
  const credit = parseFloat(document.getElementById("trans-cr").value) || 0;
  const debit = parseFloat(document.getElementById("trans-dr").value) || 0;

  if (!date || !accountId) return alert("Select date and account.");

  const voucher = `VCH-${transactions.length + 1}`;
  voucherInput.value = voucher;

  // Insert transaction
  const { error } = await supabase.from("transactions").insert([{
    voucher, date, account_id: accountId, narration, credit, debit
  }]);
  if (error) return console.error(error);

  // Update account balance
  const acc = accounts.find(a => a.id === accountId);
  const newBalance = acc.balance + debit - credit;
  await supabase.from("accounts").update({ balance: newBalance }).eq("id", accountId);

  transactionForm.reset();
  voucherInput.value = "";
  loadAccounts();
  loadTransactions();
});

// Edit transaction
async function editTransaction(id) {
  const tr = transactions.find(t => t.id === id);
  const newCredit = parseFloat(prompt("Edit Credit Amount:", tr.credit)) || 0;
  const newDebit = parseFloat(prompt("Edit Debit Amount:", tr.debit)) || 0;

  const acc = accounts.find(a => a.id === tr.account_id);
  const oldBalance = acc.balance - (tr.debit - tr.credit);
  const newBalance = oldBalance + (newDebit - newCredit);

  // Update transaction
  const { error } = await supabase.from("transactions").update({ credit: newCredit, debit: newDebit }).eq("id", id);
  if (error) return console.error(error);

  // Update account balance
  await supabase.from("accounts").update({ balance: newBalance }).eq("id", acc.id);

  loadAccounts();
  loadTransactions();
}

// Delete transaction
async function deleteTransaction(id) {
  const tr = transactions.find(t => t.id === id);
  if (confirm("Delete this transaction?")) {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) return console.error(error);

    // Update account balance
    const acc = accounts.find(a => a.id === tr.account_id);
    const newBalance = acc.balance - (tr.debit - tr.credit);
    await supabase.from("accounts").update({ balance: newBalance }).eq("id", acc.id);

    loadAccounts();
    loadTransactions();
  }
}

// -----------------------
// REPORTS & CSV EXPORT
// -----------------------
async function exportAccountsCSV() {
  const { data: accountsData, error } = await supabase.from("accounts").select("*").order("id");
  if (error) return console.error(error);

  let csv = "id,name,type,balance,created_at\n";
  accountsData.forEach(acc => {
    csv += `${acc.id},"${acc.name}",${acc.type},${acc.balance},${acc.created_at}\n`;
  });
  downloadCSV("accounts_backup.csv", csv);
}

async function exportTransactionsCSV() {
  const { data: transactionsData, error } = await supabase.from("transactions").select("*").order("id");
  if (error) return console.error(error);

  let csv = "id,voucher,date,account_id,narration,credit,debit,created_at\n";
  transactionsData.forEach(tr => {
    csv += `${tr.id},${tr.voucher},${tr.date},${tr.account_id},"${tr.narration}",${tr.credit},${tr.debit},${tr.created_at}\n`;
  });
  downloadCSV("transactions_backup.csv", csv);
}

function downloadCSV(filename, csvContent) {
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Export button
document.getElementById("export-csv-btn").addEventListener("click", async () => {
  await exportAccountsCSV();
  await exportTransactionsCSV();
});

// -----------------------
// INITIAL LOAD
// -----------------------
window.addEventListener("load", async () => {
  await loadAccounts();
  await loadTransactions();
});
