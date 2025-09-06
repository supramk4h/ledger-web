// ========== Config ==========
// Use your Supabase project details here
const SUPABASE_URL = "https://mgxpxazqsxqsbzgjhboa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1neHB4YXpxc3hxc2J6Z2poYm9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxOTAzMzMsImV4cCI6MjA3Mjc2NjMzM30.6R4LY1GW55NmWwnheyCMBQxGe4bMF1rxWCvcsge7kNI";

// ========== Initialize Supabase ========== 
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========== Helpers ==========
function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const c of children) {
    e.append(c.nodeType ? c : document.createTextNode(c));
  }
  return e;
}

function clearApp() {
  document.getElementById("app").innerHTML = "";
}

function showError(err) {
  alert(err.message || err);
}

// ========== UI Screens ==========

async function showLogin() {
  clearApp();
  const container = el("div", { className: "section" },
    el("h1", {}, "Sign In"),
    el("input", { placeholder: "Email", id: "in_email" }),
    el("input", { type: "password", placeholder: "Password", id: "in_pass" }),
    el("button", { onclick: async () => {
      const email = document.getElementById("in_email").value;
      const password = document.getElementById("in_pass").value;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      error ? showError(error) : showDashboard();
    }}, "Sign In")
  );
  document.getElementById("app").append(container);
}

async function showDashboard() {
  clearApp();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return showLogin();

  const d = document.createElement("div");
  d.className = "section";
  d.append(
    el("h1", {}, `Welcome, ${user.email}`),
    el("button", { onclick: () => showAccounts() }, "Accounts"),
    el("button", { onclick: () => showNewVoucher() }, "New Voucher"),
    el("button", { onclick: () => showReports() }, "Reports"),
    el("button", { onclick: async () => {
      await supabase.auth.signOut(); showLogin();
    }}, "Sign Out")
  );
  document.getElementById("app").append(d);
}

// --- Accounts Screen ---
async function showAccounts() {
  clearApp();
  const { data: accounts, error } = await supabase.from("account").select("*");
  if (error) return showError(error);

  const section = el("div", { className: "section" }, el("h2", {}, "Your Accounts"));
  accounts.forEach(a => {
    section.append(el("div", {}, `${a.name} [${a.type}]`));
  });
  section.append(
    el("input", { placeholder: "Account Name", id: "acc_name" }),
    el("select", { id: "acc_type" },
      el("option", { value: "asset" }, "Asset"),
      el("option", { value: "liability" }, "Liability"),
      el("option", { value: "equity" }, "Equity"),
      el("option", { value: "income" }, "Income"),
      el("option", { value: "expense" }, "Expense")
    ),
    el("button", { onclick: async () => {
      const name = document.getElementById("acc_name").value;
      const type = document.getElementById("acc_type").value;
      const { error } = await supabase.from("account").insert({ name, type });
      error ? showError(error) : showAccounts();
    }}, "Add Account"),
    el("button", { onclick: showDashboard }, "Back")
  );
  document.getElementById("app").append(section);
}

// --- New Voucher Screen ---
async function showNewVoucher() {
  clearApp();
  const section = el("div", { className: "section" },
    el("h2", {}, "New Voucher"),
    el("input", { type: "date", id: "v_date" }),
    el("textarea", { placeholder: "Description", id: "v_desc" })
  );

  let lines = [];
  const linesContainer = el("div");
  function renderLines() {
    linesContainer.innerHTML = "";
    lines.forEach((ln, i) => {
      linesContainer.append(
        el("div", {},
          `Account ID: `,
          el("input", { value: ln.account_id || "", oninput(e) { ln.account_id = e.target.value; } }),
          ` Dr: `,
          el("input", { value: ln.dr || 0, type: "number", oninput(e) { ln.dr = e.target.value; } }),
          ` Cr: `,
          el("input", { value: ln.cr || 0, type: "number", oninput(e) { ln.cr = e.target.value; } }),
          el("button", { onclick: () => { lines.splice(i, 1); renderLines(); } }, "Remove")
        )
      );
    });
  }
  renderLines();
  section.append(linesContainer, el("button", { onclick: () => { lines.push({}); renderLines(); } }, "Add Line"));

  section.append(
    el("button", { onclick: async () => {
      const date = document.getElementById("v_date").value;
      const desc = document.getElementById("v_desc").value;
      const payload = {
        uid: (await supabase.auth.getUser()).data.user.id,
        vdate: date,
        vdesc: desc,
        lines: JSON.stringify(lines)
      };
      const { data, error } = await supabase.rpc("post_voucher", payload);
      error ? showError(error) : alert("Voucher saved: " + data);
      showDashboard();
    }}, "Save Voucher"),
    el("button", { onclick: showDashboard }, "Back")
  );
  document.getElementById("app").append(section);
}

// --- Reports Screen ---
async function showReports() {
  clearApp();
  const section = el("div", { className: "section" }, el("h2", {}, "Reports"));

  const { data: tb, error } = await supabase.from("v_trial_balance").select("*");
  if (error) return showError(error);

  section.append(el("h3", {}, "Trial Balance"));
  tb.forEach(r => {
    section.append(el("div", {}, `${r.name}: Dr ${r.total_dr || 0}, Cr ${r.total_cr || 0}`));
  });

  section.append(el("button", { onclick: showDashboard }, "Back"));
  document.getElementById("app").append(section);
}

// ========== Launch App ==========
supabase.auth.getSession().then(({ data }) => data.session ? showDashboard() : showLogin());
