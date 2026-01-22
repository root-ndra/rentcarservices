const supabaseMaint = supabase.createClient(
  'https://ctijwjcjmbfmfhzwbguk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk'
);

let maintUser;
let interventions = [];
let voitures = [];
let voituresMap = {};
let editingId = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const { data } = await supabaseMaint.auth.getSession();
  if (!data.session) { window.location = 'login.html'; return; }
  maintUser = data.session.user;

  document.getElementById('user-email').textContent = maintUser.email;
  document.getElementById('user-role').textContent = (maintUser.user_metadata?.role || 'maintenance').toUpperCase();
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabaseMaint.auth.signOut();
    window.location = 'login.html';
  });

  await loadVoitures();
  await loadInterventions();

  document.getElementById('maintenance-status').addEventListener('change', renderInterventions);
  document.getElementById('maintenance-voiture').addEventListener('change', renderInterventions);
  document.getElementById('maintenance-form').addEventListener('submit', saveIntervention);
}

async function loadVoitures() {
  const { data } = await supabaseMaint.from('voitures').select('id, nom');
  voitures = data || [];
  voituresMap = Object.fromEntries(voitures.map((v) => [String(v.id), v]));

  const filterSelect = document.getElementById('maintenance-voiture');
  const formSelect = document.getElementById('maintenance-voiture-select');
  voitures.forEach((v) => {
    filterSelect.appendChild(new Option(v.nom, v.id));
    formSelect.appendChild(new Option(v.nom, v.id));
  });
}

async function loadInterventions() {
  const { data, error } = await supabaseMaint
    .from('maintenances')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    alert(error.message);
    return;
  }
  interventions = data || [];
  renderInterventions();
}

function renderInterventions() {
  const status = document.getElementById('maintenance-status').value;
  const carId = document.getElementById('maintenance-voiture').value;

  const filtered = interventions.filter((m) => {
    const matchStatus = !status || m.statut === status;
    const matchCar = !carId || String(m.id_voiture || m.voiture_id) === carId;
    return matchStatus && matchCar;
  });

  const body = document.getElementById('maintenance-body');
  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="6">Aucune intervention.</td></tr>';
    return;
  }

  body.innerHTML = filtered
    .map((m) => {
      const voiture = voituresMap[String(m.id_voiture || m.voiture_id)];
      return `
        <tr>
          <td>${voiture?.nom || '—'} (ID ${m.id_voiture || m.voiture_id || '—'})</td>
          <td>${m.type_intervention || '—'}</td>
          <td>${m.date_prevue || m.date_debut || '—'}</td>
          <td>${m.statut || 'planifiee'}</td>
          <td>${m.cout_estime || m.cout ? Number(m.cout_estime || m.cout).toLocaleString('fr-FR') + ' Ar' : '—'}</td>
          <td>
            <button class="btn-small btn-sec" onclick="editMaintenance('${m.id}')"><i class="fas fa-pen"></i></button>
            <button class="btn-small" style="background:#ef4444;color:white;" onclick="deleteMaintenance('${m.id}')"><i class="fas fa-trash"></i></button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function openMaintenanceModal() {
  editingId = null;
  document.getElementById('maintenance-form').reset();
  document.getElementById('maintenance-feedback').textContent = '';
  document.getElementById('maintenance-modal-title').textContent = 'Nouvelle intervention';
  document.getElementById('maintenance-modal').style.display = 'flex';
}

function closeMaintenanceModal() {
  document.getElementById('maintenance-modal').style.display = 'none';
}

function editMaintenance(id) {
  const record = interventions.find((m) => m.id === id);
  if (!record) return;
  editingId = id;

  document.getElementById('maintenance-modal-title').textContent = 'Modifier intervention';
  document.getElementById('maintenance-voiture-select').value = record.id_voiture || record.voiture_id || '';
  document.getElementById('maintenance-type').value = record.type_intervention || '';
  document.getElementById('maintenance-date').value = record.date_prevue || record.date_debut || '';
  document.getElementById('maintenance-notes').value = record.observations || record.details || '';
  document.getElementById('maintenance-cost').value = record.cout_estime || record.cout || '';
  document.getElementById('maintenance-state').value = record.statut || 'planifiee';

  document.getElementById('maintenance-modal').style.display = 'flex';
}

async function saveIntervention(event) {
  event.preventDefault();
  const feedback = document.getElementById('maintenance-feedback');
  feedback.textContent = 'Enregistrement…';
  feedback.style.color = '#2563eb';

  const payload = {
    id_voiture: parseInt(document.getElementById('maintenance-voiture-select').value, 10),
    type_intervention: document.getElementById('maintenance-type').value,
    date_prevue: document.getElementById('maintenance-date').value || null,
    observations: document.getElementById('maintenance-notes').value || null,
    cout_estime: document.getElementById('maintenance-cost').value
      ? parseInt(document.getElementById('maintenance-cost').value, 10)
      : null,
    statut: document.getElementById('maintenance-state').value
  };

  let result;
  if (editingId) {
    result = await supabaseMaint.from('maintenances').update(payload).eq('id', editingId);
  } else {
    result = await supabaseMaint.from('maintenances').insert([payload]);
  }

  if (result.error) {
    feedback.textContent = result.error.message;
    feedback.style.color = '#e74c3c';
    return;
  }

  feedback.textContent = 'Opération réussie ✅';
  feedback.style.color = '#16a34a';
  await loadInterventions();
  setTimeout(closeMaintenanceModal, 800);
}

async function deleteMaintenance(id) {
  if (!confirm('Supprimer cette intervention ?')) return;
  await supabaseMaint.from('maintenances').delete().eq('id', id);
  await loadInterventions();
}

window.openMaintenanceModal = openMaintenanceModal;
window.closeMaintenanceModal = closeMaintenanceModal;
window.editMaintenance = editMaintenance;
window.deleteMaintenance = deleteMaintenance;
