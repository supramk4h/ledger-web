// Supabase keys
const SUPABASE_URL = "https://mgxpxazqsxqsbzgjhboa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1neHB4YXpxc3hxc2J6Z2poYm9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxOTAzMzMsImV4cCI6MjA3Mjc2NjMzM30.6R4LY1GW55NmWwnheyCMBQxGe4bMF1rxWCvcsge7kNI"; // replace with your anon key
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// === AUTH ===
async function signup() {
  let email = document.getElementById("email").value;
  let password = document.getElementById("password").value;
  let { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) alert(error.message);
  else alert("Signup success! Check your email.");
}

async function login() {
  let email = document.getElementById("email").value;
  let password = document.getElementById("password").value;
  let { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return alert(error.message);
  document.getElementById("auth-section").style.display = "none";
  document.getElementById("app-section").style.display = "block";
  loadAccounts();
  loadVouchers();
}

async function logout() {
  await supabaseClient.auth.signOut();
  document.getElementById("auth-section").style.display = "block";
  document.getElementById("app-section").style.display = "none";
}

// === ACCOUNTS ===
async function createAccount() {
  let name = document.getElementById("account-name").value;
  let { error } = await supabaseClient.from("accounts").insert([{ name }]);
  if (error) alert(error.message);
  else loadAccounts();
}

async function loadAccounts() {
  let { data, error } = await supabaseClient.from("accounts").select("*");
  if (error) return alert(error.message);

  let list = document.getElementById("accounts-list");
  let select = document.getElementById("voucher-account");
  list.innerHTML = "";
  select.innerHTML = "";

  data.forEach(acc => {
    let li = document.createElement("li");
    li.innerHTML = `${acc.name} <button onclick="deleteAccount(${acc.id})">❌</button>`;
    list.appendChild(li);

    let opt = document.createElement("option");
    opt.value = acc.id;
    opt.innerText = acc.name;
    select.appendChild(opt);
  });
}

async function deleteAccount(id) {
  await supabaseClient.from("accounts").delete().eq("id", id);
  loadAccounts();
}

// === VOUCHERS ===
async function createVoucher() {
  let amount = parseFloat(document.getElementById("voucher-amount").value);
  let type = document.getElementById("voucher-type").value;
  let account_id = document.getElementById("voucher-account").value;

  await supabaseClient.from("vouchers").insert([{ account_id, amount, type }]);
  loadVouchers();
}

async function loadVouchers() {
  let { data } = await supabaseClient.from("vouchers").select("*, accounts(name)");
  let list = document.getElementById("vouchers-list");
  list.innerHTML = "";
  data.forEach(v => {
    let li = document.createElement("li");
    li.innerHTML = `${v.accounts.name} - ${v.type} ${v.amount} 
      <button onclick="deleteVoucher(${v.id})">❌</button>`;
    list.appendChild(li);
  });
}

async function deleteVoucher(id) {
  await supabaseClient.from("vouchers").delete().eq("id", id);
  loadVouchers();
}
