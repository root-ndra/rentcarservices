const supabaseRes = supabase.createClient(
  'https://ctijwjcjmbfmfhzwbguk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk'
);

let currentUser = null;
let reservationsCache = [];
let voituresCache = [];
let selectedReservation = null;

document.addEventListener('DOMContentLoaded', async () => {
  const { data } = await supabaseRes.auth.getSession();
  if (!data.session) { window.location = 'login.html'; return; }
  currentUser = data.session.user;

  document.getElementById('user-email').textContent = currentUser.email;
  document.getElementById('user-role').textContent = (currentUser.user_metadata?.role || 'reservations').toUpperCase();
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabaseRes.auth.signOut();
    window.location = 'login.html';
  });

  await Promise.all([loadReservations(), loadVoitures()]);

  document.getElementById('filter-status').addEventListener('change', renderReservations);
  document.getElementById('filter-voiture').addEventListener('change', renderReservations);
  document.getElementById('filter-date').addEventListener('change', renderReservations);
});

async function loadReservations() {
  const { data, error } = await supabaseRes
    .from('reservations')
    .select('id, nom_client, email_client, telephone_client, voiture_id, date_depart, date_retour, montant_total, statut, created_at, voitures(nom)')
    .order('created_at', { ascending: false });

  if (error) { alert(error.message); return; }
  reservationsCache = data || [];
  renderReservations();
  renderReservationKPIs();
}

async function loadVoitures() {
  const { data } = await supabaseRes.from('voitures').select('id, nom, reservable');
  voituresCache = data || [];

  const select = document.getElementById('filter-voiture');
  voituresCache.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.nom;
    select.appendChild(opt);
  });

  renderFleetCards();
}

function renderReservations() {
  const status = document.getElementById('filter-status').value;
  const voitureId = document.getElementById('filter-voiture').value;
  const date = document.getElementById('filter-date').value;

  const filtered = reservationsCache.filter((r) => {
    const matchStatus = !status || r.statut === status;
    const matchCar = !voitureId || r.voiture_id === voitureId;
    const matchDate = !date || r.date_depart === date || r.date_retour === date;
    return matchStatus && matchCar && matchDate;
  });

  const tbody = document.querySelector('#table-reservations tbody');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6">Aucune réservation.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map((res) => `
    <tr>
      <td>${res.nom_client}<br><small>${res.email_client}</small></td>
      <td>${res.voitures?.nom || '—'}</td>
      <td>${res.date_depart} → ${res.date_retour}</td>
      <td>${(res.montant_total || 0).toLocaleString('fr-FR')} Ar</td>
      <td>${res.statut}</td>
      <td><button class="btn-small btn-sec" onclick="openReservation('${res.id}')">Détails</button></td>
    </tr>
  `).join('');
}

function renderReservationKPIs() {
  const total = reservationsCache.length;
  const confirmed = reservationsCache.filter((r) => r.statut === 'confirmed').length;
  const pending = reservationsCache.filter((r) => r.statut === 'pending').length;

  document.getElementById('kpi-reservations').innerHTML = `
    <article class="car-card"><h4><i class="fas fa-calendar"></i> Total</h4><p style="font-size:2rem">${total}</p></article>
    <article class="car-card"><h4><i class="fas fa-check"></i> Confirmées</h4><p style="font-size:2rem">${confirmed}</p></article>
    <article class="car-card"><h4><i class="fas fa-hourglass-half"></i> En attente</h4><p style="font-size:2rem">${pending}</p></article>
  `;
}

function renderFleetCards() {
  document.getElementById('fleet-grid').innerHTML = (voituresCache || []).map((v) => `
    <article class="car-card">
      <h4>${v.nom}</h4>
      <p>${v.reservable === false ? 'Non réservable' : 'Disponible'}</p>
      <button class="btn-small" onclick="toggleReservable('${v.id}', ${v.reservable !== false})">
        ${v.reservable === false ? 'Activer' : 'Suspendre'}
      </button>
    </article>
  `).join('');
}

async function toggleReservable(id, current) {
  await supabaseRes.from('voitures').update({ reservable: !current }).eq('id', id);
  await loadVoitures();
}

function openReservation(id) {
  selectedReservation = reservationsCache.find((r) => r.id === id);
  if (!selectedReservation) return;

  document.getElementById('reservation-details').innerHTML = `
    <h3>Réservation ${selectedReservation.id}</h3>
    <p><strong>Client :</strong> ${selectedReservation.nom_client} (${selectedReservation.email_client})</p>
    <p><strong>Voiture :</strong> ${selectedReservation.voitures?.nom || '-'}</p>
    <p><strong>Période :</strong> ${selectedReservation.date_depart} → ${selectedReservation.date_retour}</p>
    <p><strong>Montant :</strong> ${(selectedReservation.montant_total || 0).toLocaleString('fr-FR')} Ar</p>
    <p><strong>Statut :</strong> ${selectedReservation.statut}</p>
  `;
  document.getElementById('reservation-modal').style.display = 'flex';
}

function closeReservationModal() {
  document.getElementById('reservation-modal').style.display = 'none';
}

async function updateReservationStatus(status) {
  if (!selectedReservation) return;
  await supabaseRes.from('reservations').update({ statut: status }).eq('id', selectedReservation.id);
  closeReservationModal();
  await loadReservations();
}

function exportReservations() {
  const rows = [
    ['Client', 'Email', 'Téléphone', 'Voiture', 'Départ', 'Retour', 'Montant', 'Statut']
  ];
  reservationsCache.forEach((res) => {
    rows.push([
      res.nom_client,
      res.email_client,
      res.telephone_client || '',
      res.voitures?.nom || '',
      res.date_depart,
      res.date_retour,
      res.montant_total || 0,
      res.statut
    ]);
  });
  const csv = rows.map((row) => row.map((v) => `"${v ?? ''}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'reservations.csv'; a.click();
  URL.revokeObjectURL(url);
}

window.openReservation = openReservation;
window.closeReservationModal = closeReservationModal;
window.updateReservationStatus = updateReservationStatus;
window.toggleReservable = toggleReservable;
window.exportReservations = exportReservations;
