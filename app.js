'''javascript
const SUPABASE_URL = "https://jrgpflnuxtlaimavboya.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyZ3BmbG51eHRsYWltYXZib3lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3NDU5NzUsImV4cCI6MjA3NTMyMTk3NX0.hWuihEzoHMjM2mSpN0IxVhduVO4JVzTXhThdmFjN7Hs";
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Utility: Calculate and display live totals
document.getElementById('salesForm').addEventListener('input', updateCalculations);
async function updateCalculations() {
  const crate = parseFloat(document.getElementById('crateNo').value) || 0;
  const birds = parseFloat(document.getElementById('totalBirds').value) || 0;
  const kanta = parseFloat(document.getElementById('kantaWeight').value) || 0;
  const katotiMode = document.getElementById('katotiMode').value;
  const manualKatoti = parseFloat(document.getElementById('manualKatoti').value) || 0;
  const rate = parseFloat(document.getElementById('rate').value) || 0;

  let katoti = 0;
  if (katotiMode === 'manual') katoti = manualKatoti;
  else katoti = crate * parseFloat(katotiMode);

  const net = kanta - katoti;
  const avg = birds > 0 ? kanta / birds : 0;
  const total = rate * net;

  document.getElementById('katotiVal').textContent = katoti.toFixed(2);
  document.getElementById('netWeightVal').textContent = net.toFixed(2);
  document.getElementById('avgWeightVal').textContent = avg.toFixed(2);
  document.getElementById('totalVal').textContent = total.toFixed(2);
}

// Submit form & save to Supabase
document.getElementById('salesForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const record = {
    date: document.getElementById('date').value,
    farm_name: document.getElementById('farmName').value,
    vehicle_no: document.getElementById('vehicleNo').value,
    crate_no: parseFloat(document.getElementById('crateNo').value),
    birds: parseFloat(document.getElementById('totalBirds').value),
    kanta_weight: parseFloat(document.getElementById('kantaWeight').value),
    katoti: parseFloat(document.getElementById('katotiVal').textContent),
    net_weight: parseFloat(document.getElementById('netWeightVal').textContent),
    avg_weight: parseFloat(document.getElementById('avgWeightVal').textContent),
    rate: parseFloat(document.getElementById('rate').value),
    total: parseFloat(document.getElementById('totalVal').textContent)
  };

  const { error } = await supabase.from('sales').insert([record]);
  if (error) alert('Error saving: ' + error.message);
  else alert('Sale saved successfully');
});

// Export Backup
const exportBackupBtn = document.getElementById('exportBackupBtn');
exportBackupBtn.addEventListener('click', async () => {
  const { data } = await supabase.from('sales').select('*');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'farm_backup.json';
  a.click();
});
