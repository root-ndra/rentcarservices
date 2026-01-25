let supabaseClient = null;
let currentUser = null;
let voituresCache = [];
let reservationsCache = [];

document.addEventListener('DOMContentLoaded', initAdminReservations);

/* ---------- INIT & AUTH ---------- */
async function initSupabase() {
  if (supabaseClient) return;
  const response = await fetch('supabase-config.json');
  if (!response.ok) throw new Error('supabase-config.json introuvable');
  const { supabaseUrl, supabaseKey } = await response.json();
  supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
}

async function initAdminReservations() {
  await initSupabase();
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = data.session.user;
  document.getElementById('user-email').textContent = currentUser.email;
  document.getElementById('user-role').textContent = (currentUser.user_metadata?.role || 'reservations').toUpperCase();
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
  });

  await Promise.all([loadVoitures(), loadReservations()]);
  document.getElementById('filter-status').addEventListener('change', renderReservations);
  document.getElementById('filter-voiture').addEventListener('change', renderReservations);
  document.getElementById('filter-date').addEventListener('change', renderReservations);
}

/* ---------- CHARGEMENT DONNÉES ---------- */
async function loadVoitures() {
  const { data, error } = await supabaseClient.from('voitures').select('id, nom, prix_base').order('nom');
  if (error) {
    alert(error.message);
    return;
  }

  voituresCache = data || [];
  const selectFilter = document.getElementById('filter-voiture');
  const selectNewResa = document.getElementById('new-resa-voiture');
  selectFilter.innerHTML = '<option value="">Toutes les voitures</option>';
  selectNewResa.innerHTML = '<option value="">-- Choisir une voiture --</option>';

  voituresCache.forEach(v => {
    selectFilter.innerHTML += `<option value="${v.id}">${v.nom}</option>`;
    selectNewResa.innerHTML += `<option value="${v.id}">${v.nom}</option>`;
  });
}

async function loadReservations() {
  const { data, error } = await supabaseClient
    .from('reservations')
    .select('*, voitures(nom)')
    .order('id', { ascending: false });

  if (error) {
    alert(error.message);
    return;
  }

  reservationsCache = data || [];
  renderReservationKPIs();
  renderReservations();
}

/* ---------- RENDERS ---------- */
function renderReservationKPIs() {
  const total = reservationsCache.length;
  const confirmed = reservationsCache.filter(r => r.statut === 'valide').length;
  const pending = reservationsCache.filter(r => r.statut === 'en_attente').length;

  document.getElementById('kpi-reservations').innerHTML = `
    <div class="card kpi-card"><h4>Total</h4><p>${total}</p></div>
    <div class="card kpi-card"><h4>Validées</h4><p>${confirmed}</p></div>
    <div class="card kpi-card"><h4>En attente</h4><p>${pending}</p></div>
  `;
}

function renderReservations() {
  const status = document.getElementById('filter-status').value;
  const voitureId = document.getElementById('filter-voiture').value;
  const date = document.getElementById('filter-date').value;

  const filtered = reservationsCache.filter(r => {
    const matchStatus = !status || r.statut === status;
    const matchCar = !voitureId || r.id_voiture == voitureId;
    const matchDate = !date || (r.date_debut <= date && r.date_fin >= date);
    return matchStatus && matchCar && matchDate;
  });

  const tbody = document.querySelector('#table-reservations tbody');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7">Aucune réservation ne correspond.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(r => {
    const jours = calculJours(r.date_debut, r.date_fin);
    const paye = r.paiement_montant_declare || 0;
    const reste = (r.montant_total || 0) - paye;

    const statutHtml = r.statut === 'valide'
      ? '<span style="color:#2ecc71;">● Validée</span>'
      : r.statut === 'annulee'
        ? '<span style="color:#e74c3c;">● Annulée</span>'
        : '<span style="color:#f39c12;">● En attente</span>';

    const otpCell = r.statut === 'valide'
      ? `<strong style="color:green;">${r.code_otp || '-'}</strong>`
      : `<input type="text" id="otp-${r.id}" placeholder="OTP" style="width:80px;">`;

    const actionBtn = r.statut === 'valide'
      ? '<button class="btn-action-small" style="background:#95a5a6;">Validé</button>'
      : `<button class="btn-action-small btn-publish" onclick="validerResa(${r.id})"><i class="fas fa-check"></i> Valider</button>`;

    return `
      <tr>
        <td><strong>#${r.id}</strong><br>${statutHtml}</td>
        <td>${r.nom}<br><small>${r.tel || '-'}</small></td>
        <td>${r.voitures?.nom || '-'}<br>Du ${r.date_debut} au ${r.date_fin}<br><small>${jours} jour(s)</small></td>
        <td><span class="badge bg-blue">${r.paiement_methode || '-'}</span><br>${r.paiement_titulaire || '-'}</td>
        <td>Payé : <strong>${formatPrix(paye)}</strong><br>Reste : <strong style="color:${reste > 0 ? '#e74c3c' : '#2ecc71'};">${formatPrix(reste)}</strong><br><small>Total : ${formatPrix(r.montant_total)}</small></td>
        <td>${otpCell}</td>
        <td>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${actionBtn}
            <button class="btn-action-small btn-edit" onclick="ouvrirModifResa(${r.id})"><i class="fas fa-edit"></i></button>
            <button class="btn-action-small btn-delete" onclick="annulerResa(${r.id})"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function calculJours(debut, fin) {
  const d1 = new Date(debut);
  const d2 = new Date(fin);
  return Math.ceil((d2 - d1) / 86400000) + 1;
}

function formatPrix(val) {
  return (val || 0).toLocaleString('fr-FR') + ' Ar';
}

/* ---------- RÉSERVATIONS (CRUD) ---------- */
function toggleNewResaForm() {
  const form = document.getElementById('form-new-resa');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function calculerPrixAdmin() {
  const idVoiture = document.getElementById('new-resa-voiture').value;
  const debut = document.getElementById('new-resa-debut').value;
  const fin = document.getElementById('new-resa-fin').value;
  if (!idVoiture || !debut || !fin) return;

  const voiture = voituresCache.find(v => v.id == idVoiture);
  if (!voiture) return;

  const jours = calculJours(debut, fin);
  const total = voiture.prix_base * jours;
  document.getElementById('new-resa-montant').value = total;
  document.getElementById('new-resa-paye').value = total;
  updateResteAdmin();
}

function updateResteAdmin() {
  const total = parseFloat(document.getElementById('new-resa-montant').value) || 0;
  const paye = parseFloat(document.getElementById('new-resa-paye').value) || 0;
  document.getElementById('new-resa-reste').value = total - paye;
}

async function creerReservationAdmin() {
  const payload = {
    id_voiture: document.getElementById('new-resa-voiture').value,
    nom: document.getElementById('new-resa-nom').value.trim(),
    tel: document.getElementById('new-resa-tel').value.trim(),
    date_debut: document.getElementById('new-resa-debut').value,
    date_fin: document.getElementById('new-resa-fin').value,
    montant_total: parseFloat(document.getElementById('new-resa-montant').value) || 0,
    statut: document.getElementById('new-resa-statut').value,
    paiement_methode: 'espece',
    paiement_type_montant: '100',
    paiement_montant_declare: parseFloat(document.getElementById('new-resa-paye').value) || 0,
    paiement_titulaire: document.getElementById('new-resa-nom').value
  };

  if (!payload.id_voiture || !payload.nom || !payload.date_debut || !payload.date_fin) {
    alert('Champs obligatoires manquants.');
    return;
  }

  await sbClients(payload.nom, payload.tel);
  const { error } = await supabaseClient.from('reservations').insert([payload]);
  if (error) {
    alert(error.message);
    return;
  }
  toggleNewResaForm();
  await loadReservations();
}

async function sbClients(nom, tel) {
  if (!tel) return;
  await supabaseClient.from('clients').upsert({ nom, tel }, { onConflict: 'tel' });
}

async function ouvrirModifResa(id) {
  const resa = reservationsCache.find(r => r.id === id);
  if (!resa) return;
  document.getElementById('edit-resa-id').value = resa.id;
  document.getElementById('edit-resa-client').innerText = `${resa.nom} (${resa.tel || '-'})`;
  document.getElementById('edit-resa-debut').value = resa.date_debut;
  document.getElementById('edit-resa-fin').value = resa.date_fin;
  document.getElementById('edit-resa-montant').value = resa.montant_total || 0;
  document.getElementById('edit-resa-statut').value = resa.statut;
  document.getElementById('modal-edit-resa').style.display = 'flex';
}

async function sauvegarderModificationResa() {
  const id = document.getElementById('edit-resa-id').value;
  const payload = {
    date_debut: document.getElementById('edit-resa-debut').value,
    date_fin: document.getElementById('edit-resa-fin').value,
    montant_total: parseFloat(document.getElementById('edit-resa-montant').value) || 0,
    statut: document.getElementById('edit-resa-statut').value
  };
  const { error } = await supabaseClient.from('reservations').update(payload).eq('id', id);
  if (error) {
    alert(error.message);
    return;
  }
  closeModal('modal-edit-resa');
  await loadReservations();
}

async function validerResa(id) {
  const otp = document.getElementById(`otp-${id}`).value.trim();
  if (!otp) {
    alert('Renseignez le code OTP.');
    return;
  }
  const { error } = await supabaseClient.from('reservations').update({ statut: 'valide', code_otp: otp }).eq('id', id);
  if (error) {
    alert(error.message);
    return;
  }
  await loadReservations();
}

async function annulerResa(id) {
  if (!confirm('Supprimer définitivement cette réservation ?')) return;
  await supabaseClient.from('reservations').delete().eq('id', id);
  await loadReservations();
}

/* ---------- EXPORT CSV ---------- */
function exportReservations() {
  const rows = [
    ['ID', 'Client', 'Téléphone', 'Voiture', 'Début', 'Fin', 'Montant', 'Payé', 'Statut', 'OTP']
  ];
  reservationsCache.forEach(res => {
    rows.push([
      res.id,
      res.nom,
      res.tel || '',
      res.voitures?.nom || '',
      res.date_debut,
      res.date_fin,
      res.montant_total || 0,
      res.paiement_montant_declare || 0,
      res.statut,
      res.code_otp || ''
    ]);
  });
  const csv = rows.map(row => row.map(v => `"${v ?? ''}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reservations_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- UTILITAIRES ---------- */
function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

/* ---------- EXPORT GLOBAL ---------- */
window.toggleNewResaForm = toggleNewResaForm;
window.calculerPrixAdmin = calculerPrixAdmin;
window.updateResteAdmin = updateResteAdmin;
window.creerReservationAdmin = creerReservationAdmin;
window.ouvrirModifResa = ouvrirModifResa;
window.sauvegarderModificationResa = sauvegarderModificationResa;
window.validerResa = validerResa;
window.annulerResa = annulerResa;
window.closeModal = closeModal;
window.exportReservations = exportReservations;
