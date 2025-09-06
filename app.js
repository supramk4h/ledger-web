// ======= CONFIG =======
const API_BASE = "https://script.google.com/macros/s/AKfycbxd3pMAsyN82-5xZyGjk0E_7W99idl5gXcCT181y7RPGJyLws0-FUMXG5trMYf_hLIj/exec"; // <-- paste your Apps Script Web App URL here
const API_KEY = "alrehmanaounpf2203351182296"; // <-- must match the token you set in Apps Script

// ======= NAVIGATION =======
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  if (id === 'accounts' || id === 'entry' || id === 'transfer') loadAccounts();
}

// ======= API CALL =======
async function api(path, method="GET", data=null) {
  let url = `${API_BASE}/${path}`;
  let opts = {
    method,
    headers: { 
      "Content-Type": "application/json",
      "x-api-key": API_KEY   // send key in header
    }
  };
  if (method !== "GET") {
    opts.body = JSON.stringify(data);
  } else {
    // append key for GET too
    url += `?x-api-key=${API_KEY}`;
  }
  let res = await fetch(url, opts);
  return res.json();
}

// ======= ACCOUNTS =======
async function addAccount(e) {
  e.preventDefault();
  let name = document.getElementById("accName").value;
  let opening = document.getElementById("accOpening").value;
  let id = "A-" + Date.now();

  try {
    let res = await api("accounts", "POST", { 
      accountId: id, 
      name, 
      openingBalance: opening 
    });
    console.log("API Response:", res);
    alert("Account added successfully!");
    loadAccounts();
  } catch (err) {
    console.error("Error adding account:", err);
    alert("Failed to add account. Check console (F12).");
  }
}


// ======= TRANSACTIONS =======
async function addTransaction(e) {
  e.preventDefault();
  let data = {
    date: document.getElementById("txnDate").value,
    accountId: document.getElementById("txnAccount").value,
    type: document.getElementById("txnType").value,
    amount: document.getElementById("txnAmount").value,
    category: document.getElementById("txnCategory").value,
    note: document.getElementById("txnNote").value
  };
  let res = await api("transactions", "POST", data);
  alert("Saved: " + res.voucher);
}

// ======= TRANSFER =======
async function doTransfer(e) {
  e.preventDefault();
  let data = {
    fromAccountId: document.getElementById("fromAcc").value,
    toAccountId: document.getElementById("toAcc").value,
    amount: document.getElementById("transferAmount").value,
    note: document.getElementById("transferNote").value
  };
  let res = await api("transfer", "POST", data);
  alert("Transfer done: " + res.vouchers.join(", "));
}

// ======= REPORT =======
async function loadReport(e) {
  e.preventDefault();
  let from = document.getElementById("reportFrom").value;
  let to = document.getElementById("reportTo").value;
  let url = `transactions?x-api-key=${API_KEY}&from=${from}&to=${to}`;
  let res = await fetch(`${API_BASE}/${url}`).then(r=>r.json());
  let tbody = document.querySelector("#reportTable tbody");
  tbody.innerHTML = res.map(t => `<tr>
    <td>${t.voucher}</td>
    <td>${t.date}</td>
    <td>${t.accountId}</td>
    <td>${t.type}</td>
    <td>${t.amount}</td>
    <td>${t.category}</td>
    <td>${t.note}</td>
  </tr>`).join("");
}
