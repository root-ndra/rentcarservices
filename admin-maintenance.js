const supabaseMaint = supabase.createClient(
  'https://ctijwjcjmbfmfhzwbguk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk'
);

let maintUser, interventions = [], fleetOptions = [];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const { data } = await supabaseMaint.auth.getSession();
  if (!data.session) { window.location='login.html'; return; }
  maintUser = data.session.user;
  document.getElementById('user-email').textContent = maintUser.email;
  document.getElementById('user-role').textContent = (maintUser.user_metadata?.role || 'maintenance').toUpperCase();
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabaseMaint.auth.signOut(); window.location='login.html';
  });

  await loadFleet();
  await loadInterventions();

  document.getElementById('maintenance-status').addEventListener('change', renderInterventions);
  document.getElementById('maintenance-voiture').addEventListener('change', renderInterventions);
  document.getElementById('maintenance-form').addEventListener('submit', saveIntervention);
}

async function loadFleet() {
  const { data } = await supabaseMaint.from('voitures').select('id, nom');
  fleetOptions = data || [];
  const selectFilter = document.getElementById('maintenance-voiture');
  const selectModal = document.getElementById('maintenance-voiture-select');
  fleetOptions.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id; opt.textContent = v.nom;
    selectFilter.appendChild(opt.cloneNode(true));
    selectModal.appendChild(opt);
  });
}

async function loadInterventions() {
  const { data, error } = await supabaseMaint
    .from('maintenances')
    .select('*, voitures(nom)')
    .order('date_intervention', { ascending:false });

  if (error) { alert(error.message); return; }
  interventions = data || [];
  renderInterventions();
}

function renderInterventions() {
  const status = document.getElementById('maintenance-status').value;
  const carId = document.getElementById('maintenance-voiture').value;
  const list = interventions.filter(m =>
    (!status || m.statut === status) &&
    (!carId || m.voiture_id === carId)
  );

  const body = document.getElementById('maintenance-body');
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="6">Aucune intervention</td></tr>';
    return;
  }
  body.innerHTML = list.map(m => `
    <tr>
      <td>${m.voitures?.nom || '-'}</td>
      <td>${m.type_intervention || '-'}</td>
      <td>${m.date_intervention || '-'}</td>
      <td>${m.statut}</td>
      <td>${(m.cout_estime || 0).toLocaleString('fr-FR')} Ar</td>
      <td>
        <button class="btn-small btn-sec" onclick="editMaintenance('${m.id}')"><i class="fas fa-pen"></i></button>
        <button class="btn-small" style="background:#ef4444;color:white;" onclick="deleteMaintenance('${m.id}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

function openMaintenanceModal() {
  document.getElementById('maintenance-modal-title').textContent = 'Nouvelle intervention';
  document.getElementById('maintenance-form').reset();
  document.getElementById('maintenance-id').value = '';
  document.getElementById('maintenance-modal').style.display = 'flex';
}

function closeMaintenanceModal() {
  document.getElementById('maintenance-modal').style.display = 'none';
}

function editMaintenance(id) {
  const record = interventions.find(m => m.id === id);
  if (!record) return;
  document.getElementById('maintenance-modal-title').textContent = 'Modifier intervention';
  document.getElementById('maintenance-id').value = record.id;
  document.getElementById('maintenance-voiture-select').value = record.voiture_id;
  document.getElementById('maintenance-type').value = record.type_intervention || '';
  document.getElementById('maintenance-date').value = record.date_intervention || '';
  document.getElementById('maintenance-notes').value = record.observations || '';
  document.getElementById('maintenance-cost').value = record.cout_estime || '';
  document.getElementById('maintenance-state').value = record.statut || 'planifiee';
  document.getElementById('maintenance-modal').style.display = 'flex';
}

async function saveIntervention(e) {
  e.preventDefault();
  const feedback = document.getElementById('maintenance-feedback');
  feedback.textContent = 'Enregistrement…';

  const payload = {
    voiture_id: document.getElementById('maintenance-voiture-select').value,
    type_intervention: document.getElementById('maintenance-type').value,
    date_intervention: document.getElementById('maintenance-date').value,
    observations: document.getElementById('maintenance-notes').value,
    cout_estime: parseInt(document.getElementById('maintenance-cost').value, 10) || null,
    statut: document.getElementById('maintenance-state').value
  };
  const id = document.getElementById('maintenance-id').value;

  const { error } = id
    ? await supabaseMaint.from('maintenances').update(payload).eq('id', id)
    : await supabaseMaint.from('maintenances').insert([payload]);

  if (error) {
    feedback.textContent = error.message;
    feedback.style.color = '#e74c3c';
    return;
  }
  feedback.textContent = 'Opération réussie';
  feedback.style.color = '#22c55e';
  await loadInterventions();
  setTimeout(closeMaintenanceModal, 800);
}

async function deleteMaintenance(id) {
  if (!confirm('Supprimer cette intervention ?')) return;
  await supabaseMaint.from('maintenances').delete().eq('id', id);
  loadInterventions();
}

// expose
window.openMaintenanceModal = openMaintenanceModal;
window.closeMaintenanceModal = closeMaintenanceModal;
window.editMaintenance = editMaintenance;
window.deleteMaintenance = deleteMaintenance;
