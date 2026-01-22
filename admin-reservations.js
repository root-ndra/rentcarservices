const supabaseRes = supabase.createClient(
  'https://ctijwjcjmbfmfhzwbguk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk'
);

let currentResUser, reservationsCache = [], voituresCache = [], selectedReservation = null;

document.addEventListener('DOMContentLoaded', async () => {
  const { data } = await supabaseRes.auth.getSession();
  if (!data.session) { window.location='login.html'; return; }
  currentResUser = data.session.user;
  document.getElementById('user-email').textContent = currentResUser.email;
  document.getElementById('user-role').textContent = (currentResUser.user_metadata?.role || 'admin').toUpperCase();
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabaseRes.auth.signOut(); window.location='login.html';
  });

  await loadReservations();
  await loadVoitures();

  document.getElementById('filter-status').addEventListener('change', renderReservations);
  document.getElementById('filter-voiture').addEventListener('change', renderReservations);
  document.getElementById('filter-date').addEventListener('change', renderReservations);
});

async function loadReservations() {
  const { data, error } = await supabaseRes
    .from('reservations')
    .select('*, voitures(nom), partenaires(nom_complet)')
    .order('created_at', { ascending:false });
  if (error) { alert(error.message); return; }
  reservationsCache = data;
  renderReservations();
  renderReservationKPIs();
}

async function loadVoitures() {
  const { data } = await supabaseRes.from('voitures').select('id, nom, reservable');
  voituresCache = data || [];
  const select = document.getElementById('filter-voiture');
  voituresCache.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.nom;
    select.appendChild(opt);
  });
  renderFleetCards();
}

function renderReservations() {
  const status = document.getElementById('filter-status').value;
  const carId = document.getElementById('filter-voiture').value;
  const date = document.getElementById('filter-date').value;

  const filtered = reservationsCache.filter(r => {
    const matchStatus = !status || r.statut === status;
    const matchCar = !carId || r.voiture_id === carId;
    const matchDate = !date || r.date_depart === date || r.date_retour === date;
    return matchStatus && matchCar && matchDate;
  });

  const tbody = document.querySelector('#table-reservations tbody');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6">Aucune réservation</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(res => `
    <tr>
      <td>${res.nom_client} <br><small>${res.email_client}</small></td>
      <td>${res.voitures?.nom || '-'}</td>
      <td>${res.date_depart} → ${res.date_retour}</td>
      <td>${(res.montant_total || 0).toLocaleString('fr-FR')} Ar</td>
      <td>${res.statut}</td>
      <td><button class="btn-small btn-sec" onclick="openReservation('${res.id}')">Détails</button></td>
    </tr>
  `).join('');
}

function renderReservationKPIs() {
  const total = reservationsCache.length;
  const confirmées = reservationsCache.filter(r => r.statut === 'confirmed').length;
  const pending = reservationsCache.filter(r => r.statut === 'pending').length;
  const kpis = [
    { label:'Total', value:total, icon:'calendar' },
    { label:'Confirmées', value:confirmées, icon:'check' },
    { label:'En attente', value:pending, icon:'hourglass' }
  ];
  document.getElementById('kpi-reservations').innerHTML = kpis.map(k => `
    <article class="car-card">
      <h4><i class="fas fa-${k.icon}"></i> ${k.label}</h4>
      <p style="font-size:2rem; margin:0;">${k.value}</p>
    </article>
  `).join('');
}

function renderFleetCards() {
  document.getElementById('fleet-grid').innerHTML = (voituresCache || []).map(v => `
    <article class="car-card">
      <h4>${v.nom}</h4>
      <p>Statut: ${v.reservable === false ? 'Non réservable' : 'Disponible'}</p>
      <button class="btn-small" onclick="toggleReservable('${v.id}', ${v.reservable !== false})">
        ${v.reservable === false ? 'Activer' : 'Désactiver'}
      </button>
    </article>
  `).join('');
}

async function toggleReservable(id, currently) {
  await supabaseRes.from('voitures').update({ reservable: !currently }).eq('id', id);
  loadVoitures();
}

function openReservation(id) {
  selectedReservation = reservationsCache.find(r => r.id === id);
  if (!selectedReservation) return;
  document.getElementById('reservation-details').innerHTML = `
    <h3>Réservation ${selectedReservation.reference || selectedReservation.id}</h3>
    <p><strong>Client :</strong> ${selectedReservation.nom_client} (${selectedReservation.email_client})</p>
    <p><strong>Voiture :</strong> ${selectedReservation.voitures?.nom || '-'}</p>
    <p><strong>Dates :</strong> ${selectedReservation.date_depart} → ${selectedReservation.date_retour}</p>
    <p><strong>Montant :</strong> ${(selectedReservation.montant_total || 0).toLocaleString('fr-FR')} Ar</p>
    <p><strong>Statut :</strong> ${selectedReservation.statut}</p>
  `;
  document.getElementById('reservation-modal').style.display='flex';
}
function closeReservationModal() {
  document.getElementById('reservation-modal').style.display='none';
}

async function updateReservationStatus(status) {
  if (!selectedReservation) return;
  await supabaseRes.from('reservations').update({ statut: status }).eq('id', selectedReservation.id);
  closeReservationModal();
  loadReservations();
}

function exportReservations() {
  const rows = [['Client','Voiture','Départ','Retour','Montant','Statut']];
  reservationsCache.forEach(r => rows.push([
    r.nom_client,
    r.voitures?.nom || '',
    r.date_depart,
    r.date_retour,
    r.montant_total,
    r.statut
  ]));
  const csv = rows.map(row => row.map(val => `"${val ?? ''}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'reservations.csv'; a.click();
  URL.revokeObjectURL(url);
}

// expose functions
window.openReservation = openReservation;
window.closeReservationModal = closeReservationModal;
window.updateReservationStatus = updateReservationStatus;
window.toggleReservable = toggleReservable;
window.exportReservations = exportReservations;
