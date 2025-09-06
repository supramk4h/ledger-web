async function loadBalances() {
  let { data } = await supabaseClient.from("vouchers").select("account_id, amount, type");
  let balances = {};

  data.forEach(v => {
    if (!balances[v.account_id]) balances[v.account_id] = 0;
    balances[v.account_id] += (v.type === "debit" ? v.amount : -v.amount);
  });

  let { data: accounts } = await supabaseClient.from("accounts").select("*");

  let list = document.getElementById("balances-list");
  list.innerHTML = "";
  let chartData = [];

  accounts.forEach(acc => {
    let bal = balances[acc.id] || 0;
    let li = document.createElement("li");
    li.innerText = `${acc.name}: ${bal}`;
    list.appendChild(li);
    chartData.push({ name: acc.name, balance: bal });
  });

  renderChart(chartData);
}

// === PDF Export ===
function exportPDF() {
  const doc = new jspdf.jsPDF();
  doc.text("Trial Balance", 10, 10);
  let rows = [...document.querySelectorAll("#balances-list li")].map(li => [li.innerText]);
  doc.autoTable({ head: [["Account", "Balance"]], body: rows });
  doc.save("trial_balance.pdf");
}

// === Excel Export ===
function exportExcel() {
  let wb = XLSX.utils.book_new();
  let rows = [...document.querySelectorAll("#balances-list li")].map(li => [li.innerText]);
  let ws = XLSX.utils.aoa_to_sheet([["Account Balance"], ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, "Balances");
  XLSX.writeFile(wb, "trial_balance.xlsx");
}

// === Chart.js ===
function renderChart(data) {
  let ctx = document.getElementById("report-chart").getContext("2d");
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.map(d => d.name),
      datasets: [{ label: "Balance", data: data.map(d => d.balance) }]
    }
  });
}
