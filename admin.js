const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ROLE_SUPER_ADMIN = 'super_admin';
const RESTRICTED_TABS = ['partenaires', 'promos', 'pubs', 'media', 'config'];

let currentUser = null;
let currentUserRole = null;
let globalVoitures = [];
let periodeAnalyse = 'mois';

async function loginAdmin() {
  const email = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-pass').value.trim();
  const err = document.getElementById('login-error');
  err.style.display = 'none';

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    err.innerText = error.message;
    err.style.display = 'block';
  } else {
    verifierSession();
  }
}

async function logoutAdmin() {
  await sb.auth.signOut();
  window.location.reload();
}

async function verifierSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('admin-content').style.display = 'none';
    return;
  }

  currentUser = session.user;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-content').style.display = 'block';
  document.getElementById('header-user-name').innerText = currentUser.email;

  await chargerRoleUtilisateur(currentUser.id);
  appliquerInterfaceSelonRole();
  await chargerConfigAdmin();
  chargerDashboard();
}

async function chargerRoleUtilisateur(userId) {
  const { data, error } = await sb
    .from('partenaires')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('Impossible de charger le rôle', error);
    currentUserRole = 'partenaire';
  } else {
    currentUserRole = data?.role || 'partenaire';
  }
}

function appliquerInterfaceSelonRole() {
  const badge = document.getElementById('header-user-role');
  if (currentUserRole === ROLE_SUPER_ADMIN) {
    badge.innerText = 'SUPER ADMIN';
    badge.style.background = '#27ae60';
  } else {
    badge.innerText = 'PARTENAIRE';
    badge.style.background = '#7f8c8d';
    RESTRICTED_TABS.forEach((tab) => {
      const btn = document.getElementById(`btn-tab-${tab}`);
      if (btn) btn.classList.add('hidden');
    });
  }
}

function switchTab(tabName, evt) {
  const views = ['dashboard', 'reservations', 'maintenances', 'avis', 'pubs', 'media', 'promos', 'partenaires', 'config'];
  views.forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.style.display = (v === tabName) ? 'block' : 'none';
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));
  if (evt?.currentTarget) evt.currentTarget.classList.add('active');

  if (tabName === 'reservations') { chargerVoituresPourSelect(); chargerTableReservations(); }
  if (tabName === 'maintenances') chargerTableMaintenances();
  if (tabName === 'promos') chargerTablePromos();
  if (tabName === 'partenaires') chargerTablePartenaires();
  if (tabName === 'avis') chargerTableAvis();
  if (tabName === 'pubs') chargerTablePubs();
  if (tabName === 'media') chargerTableMedia();
  if (tabName === 'config') chargerConfigAdmin();
}

async function chargerConfigAdmin() {
  try {
    const response = await fetch('site_config.json');
    const config = await response.json();
    document.getElementById('admin-header-subtext').innerText = `Gestion ${config.header.siteName}`;
    document.title = `Admin - ${config.header.siteName}`;
  } catch (e) {
    console.warn('Config site', e);
  }

  const { data } = await sb.from('config_site').select('value').eq('key', 'calendar_visible').maybeSingle();
  const toggle = document.getElementById('toggle-calendar-global');
  const label = document.getElementById('status-calendar-text');
  const visible = data?.value === true || data?.value === 'true';
  toggle.checked = visible;
  label.innerText = visible ? 'VISIBLE' : 'MASQUÉ';
  label.style.color = visible ? '#27ae60' : '#e74c3c';
}

async function chargerDashboard() {
  const container = document.getElementById('grid-voitures');
  container.innerHTML = '<p>Chargement…</p>';

  let query = sb.from('voitures').select('*').order('created_at', { ascending: false });
  if (currentUserRole !== ROLE_SUPER_ADMIN) query = query.eq('proprietaire_id', currentUser.id);

  const { data, error } = await query;
  if (error) {
    container.innerHTML = `<p>Erreur: ${error.message}</p>`;
    return;
  }
  globalVoitures = data || [];
  if (!globalVoitures.length) {
    container.innerHTML = '<p>Aucune voiture</p>';
    return;
  }

  container.innerHTML = '';
  globalVoitures.forEach((v) => {
    const isReservable = v.reservable !== false;
    const card = document.createElement('div');
    card.className = `car-card ${isReservable ? 'dispo' : 'indispo'}`;
    card.innerHTML = `
      <div class="top">
        <div>
          <strong style="font-size:1.1rem;">${v.nom}</strong><br/>
          <span style="color:#999;">Ref: ${v.ref_id || '-'}</span>
        </div>
        <span class="user-role-badge" style="background:${isReservable ? '#27ae60' : '#f39c12'};">${isReservable ? 'Réservable' : 'Contact'}</span>
      </div>
      <div class="meta">
        <span><i class="fas fa-gas-pump"></i> ${v.carburant || '-'}</span>
        <span><i class="fas fa-cogs"></i> ${v.transmission || '-'}</span>
        <span><i class="fas fa-user-friends"></i> ${v.places || '-'} places</span>
        <span><i class="fas fa-money-bill"></i> ${formatPrix(v.prix_base)} Ar/j</span>
      </div>
      <div class="description">${resumeDescription(v.description)}</div>
      <div class="stats">
        <span>Type: ${v.type || '-'}</span>
        <span>Vidange: ${v.prochaine_vidange || '-'}</span>
      </div>
      <div class="actions">
        <button class="btn-action btn-primary" onclick="toggleReservable('${v.id}', ${isReservable})">
          ${isReservable ? 'Désactiver' : 'Activer'}
        </button>
        <button class="btn-action btn-secondary" onclick="ouvrirModalVoiture('${v.id}')">Modifier</button>
      </div>`;
    container.appendChild(card);
  });
}

function resumeDescription(text) {
  if (!text) return '<em>Aucune description</em>';
  return text.length > 150 ? `${text.slice(0, 150)}…` : text;
}
function formatPrix(val) {
  if (val === null || val === undefined) return '0';
  return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

async function toggleReservable(id, currentVal) {
  const next = !currentVal;
  if (!confirm(`Passer ce véhicule en ${next ? 'réservable' : 'contact direct'} ?`)) return;
  const { error } = await sb.from('voitures').update({ reservable: next }).eq('id', id);
  if (error) alert(error.message);
  else chargerDashboard();
}

function ouvrirModalVoiture(id = null) {
  document.getElementById('modal-voiture').style.display = 'flex';
  document.getElementById('modal-voiture').dataset.editId = id || '';

  if (!id) {
    ['new-car-nom','new-car-prix','new-car-places','new-car-desc','new-car-img','new-car-ref'].forEach((f) => document.getElementById(f).value = '');
    document.getElementById('new-car-trans').value = 'Manuelle';
    document.getElementById('new-car-carburant').value = 'Essence';
    document.getElementById('new-car-type').value = 'Citadine';
    document.getElementById('new-car-reservable').value = 'true';
    return;
  }

  const voiture = globalVoitures.find((v) => v.id === id);
  if (!voiture) return;
  document.getElementById('new-car-nom').value = voiture.nom || '';
  document.getElementById('new-car-prix').value = voiture.prix_base || '';
  document.getElementById('new-car-places').value = voiture.places || '';
  document.getElementById('new-car-trans').value = voiture.transmission || 'Manuelle';
  document.getElementById('new-car-carburant').value = voiture.carburant || 'Essence';
  document.getElementById('new-car-type').value = voiture.type || 'Citadine';
  document.getElementById('new-car-desc').value = voiture.description || '';
  document.getElementById('new-car-img').value = voiture.image_url || '';
  document.getElementById('new-car-ref').value = voiture.ref_id || '';
  document.getElementById('new-car-reservable').value = voiture.reservable === false ? 'false' : 'true';
}

function fermerModal(id) {
  document.getElementById(id).style.display = 'none';
}

async function ajouterVoiture() {
  const editId = document.getElementById('modal-voiture').dataset.editId;
  const { data: { user } } = await sb.auth.getUser();
  const payload = {
    nom: document.getElementById('new-car-nom').value.trim(),
    prix_base: parseInt(document.getElementById('new-car-prix').value, 10) || 0,
    places: parseInt(document.getElementById('new-car-places').value, 10) || null,
    transmission: document.getElementById('new-car-trans').value,
    carburant: document.getElementById('new-car-carburant').value,
    type: document.getElementById('new-car-type').value,
    description: document.getElementById('new-car-desc').value,
    image_url: document.getElementById('new-car-img').value,
    ref_id: document.getElementById('new-car-ref').value,
    reservable: document.getElementById('new-car-reservable').value === 'true',
    proprietaire_id: user.id,
  };
  if (!payload.nom || !payload.prix_base) {
    alert('Nom et prix sont requis.');
    return;
  }

  let result;
  if (editId) result = await sb.from('voitures').update(payload).eq('id', editId);
  else result = await sb.from('voitures').insert([payload]);

  if (result.error) alert(result.error.message);
  else {
    fermerModal('modal-voiture');
    chargerDashboard();
  }
}

function setPeriode(p) {
  periodeAnalyse = p;
  document.getElementById('btn-periode-mois').classList.toggle('btn-primary', p === 'mois');
  document.getElementById('btn-periode-annee').classList.toggle('btn-primary', p === 'annee');
}

function toggleNewResaForm() {
  const form = document.getElementById('form-new-resa');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}
function calculerPrixAdmin() {
  const select = document.getElementById('new-resa-voiture');
  const prix = parseInt(select.options[select.selectedIndex]?.dataset.prix, 10) || 0;
  const d1 = document.getElementById('new-resa-debut').value;
  const d2 = document.getElementById('new-resa-fin').value;
  if (!d1 || !d2 || !prix) return;
  const diff = (new Date(d2) - new Date(d1)) / 86400000 + 1;
  const montant = diff * prix;
  document.getElementById('new-resa-montant').value = montant;
  updateResteAdmin();
}
function updateResteAdmin() {
  const total = parseInt(document.getElementById('new-resa-montant').value, 10) || 0;
  const paye = parseInt(document.getElementById('new-resa-paye').value, 10) || 0;
  document.getElementById('new-resa-reste').value = Math.max(total - paye, 0);
}

async function chargerVoituresPourSelect() {
  const select = document.getElementById('new-resa-voiture');
  select.innerHTML = '<option value="">--Sélection--</option>';

  let query = sb.from('voitures').select('id, nom, prix_base, proprietaire_id').order('nom', { ascending: true });
  if (currentUserRole !== ROLE_SUPER_ADMIN) query = query.eq('proprietaire_id', currentUser.id);

  const { data } = await query;
  (data || []).forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.text = `${v.nom} (${formatPrix(v.prix_base)} Ar)`;
    opt.dataset.prix = v.prix_base;
    opt.dataset.owner = v.proprietaire_id;
    select.appendChild(opt);
  });
}

async function creerReservationAdmin() {
  const select = document.getElementById('new-resa-voiture');
  const idVoiture = select.value;
  if (!idVoiture) return alert('Choisissez une voiture.');

  const owner = select.options[select.selectedIndex].dataset.owner || currentUser.id;
  const payload = {
    id_voiture: idVoiture,
    partenaire_id: owner,
    nom: document.getElementById('new-resa-nom').value || 'Client comptoir',
    tel: document.getElementById('new-resa-tel').value || '',
    date_debut: document.getElementById('new-resa-debut').value,
    date_fin: document.getElementById('new-resa-fin').value,
    montant_total: parseInt(document.getElementById('new-resa-montant').value, 10) || 0,
    paiement_montant_declare: parseInt(document.getElementById('new-resa-paye').value, 10) || 0,
    statut: document.getElementById('new-resa-statut').value,
    lieu_livraison: document.getElementById('new-resa-liv-lieu').value,
    heure_livraison: document.getElementById('new-resa-liv-heure').value,
    lieu_recuperation: document.getElementById('new-resa-rec-lieu').value,
    heure_recuperation: document.getElementById('new-resa-rec-heure').value,
    trajet_details: document.getElementById('new-resa-trajet').value,
  };
  if (!payload.date_debut || !payload.date_fin) return alert('Dates requises.');

  const { error } = await sb.from('reservations').insert([payload]);
  if (error) alert(error.message);
  else {
    toggleNewResaForm();
    chargerTableReservations();
  }
}

async function chargerTableReservations() {
  const tbody = document.getElementById('tbody-resa-full');
  tbody.innerHTML = '<tr><td colspan="7">Chargement…</td></tr>';

  let query = sb.from('reservations').select('*, voitures(nom)').order('created_at', { ascending: false });
  if (currentUserRole !== ROLE_SUPER_ADMIN) query = query.eq('partenaire_id', currentUser.id);

  const { data, error } = await query;
  if (error) {
    tbody.innerHTML = `<tr><td colspan="7">Erreur: ${error.message}</td></tr>`;
    return;
  }
  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="7">Aucune réservation.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  data.forEach((resa) => {
    const reste = (resa.montant_total || 0) - (resa.paiement_montant_declare || 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${resa.id}</td>
      <td>${resa.nom || '-'}<br><small>${resa.tel || ''}</small></td>
      <td>${resa.voitures?.nom || '-'}<br><small>${resa.date_debut} → ${resa.date_fin}</small></td>
      <td>
        Livraison: ${resa.lieu_livraison || '-'} (${resa.heure_livraison || '-'})<br>
        Retour: ${resa.lieu_recuperation || '-'} (${resa.heure_recuperation || '-'})<br>
        Trajet: ${resa.trajet_details || '-'}
      </td>
      <td>
        ${resa.paiement_methode || '-'}<br>
        Payé: ${formatPrix(resa.paiement_montant_declare || 0)} Ar<br>
        <strong style="color:${reste > 0 ? '#e74c3c' : '#27ae60'};">Reste: ${formatPrix(reste)} Ar</strong>
      </td>
      <td>
        OTP: <strong>${resa.code_otp || '-'}</strong><br>
        <select onchange="updateStatutResa('${resa.id}', this.value)">
          <option value="en_attente" ${resa.statut === 'en_attente' ? 'selected' : ''}>En attente</option>
          <option value="valide" ${resa.statut === 'valide' ? 'selected' : ''}>Validé</option>
          <option value="annulee" ${resa.statut === 'annulee' ? 'selected' : ''}>Annulé</option>
        </select>
      </td>
      <td><button class="btn-small" style="background:#8e44ad;" onclick="genererOTP('${resa.id}')">OTP</button></td>`;
    tbody.appendChild(tr);
  });
}

async function updateStatutResa(id, statut) {
  await sb.from('reservations').update({ statut }).eq('id', id);
}

async function genererOTP(id) {
  const code = Math.floor(1000 + Math.random() * 9000);
  const { error } = await sb.from('reservations').update({ code_otp: code, statut: 'valide' }).eq('id', id);
  if (error) alert(error.message);
  else {
    alert(`OTP ${code} généré`);
    chargerTableReservations();
  }
}

async function chargerTableMaintenances() {
  const tbody = document.getElementById('tbody-maint-global');
  tbody.innerHTML = '<tr><td colspan="6">Chargement…</td></tr>';

  let query = sb.from('maintenances').select('*, voitures!inner(nom, proprietaire_id)').order('date_debut', { ascending: false });
  if (currentUserRole !== ROLE_SUPER_ADMIN) query = query.eq('voitures.proprietaire_id', currentUser.id);

  const { data, error } = await query;
  if (error) {
    tbody.innerHTML = `<tr><td colspan="6">Erreur: ${error.message}</td></tr>`;
    return;
  }
  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="6">Aucune maintenance.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map((m) => `
    <tr>
      <td>${m.date_debut || '-'}</td>
      <td>${m.voitures?.nom || '-'}</td>
      <td>${m.type_intervention || '-'}</td>
      <td>${m.details || '-'}</td>
      <td>${formatPrix(m.cout || 0)} Ar</td>
      <td>-</td>
    </tr>`).join('');
}

async function chargerTablePartenaires() {
  if (currentUserRole !== ROLE_SUPER_ADMIN) {
    document.getElementById('tbody-partenaires').innerHTML = '<tr><td colspan="6">Section réservée.</td></tr>';
    return;
  }
  const tbody = document.getElementById('tbody-partenaires');
  tbody.innerHTML = '<tr><td colspan="6">Chargement…</td></tr>';

  const { data, error } = await sb.from('partenaires').select('*').order('created_at', { ascending: false });
  if (error) {
    tbody.innerHTML = `<tr><td colspan="6">Erreur: ${error.message}</td></tr>`;
    return;
  }
  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="6">Aucun partenaire.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map((p) => `
    <tr>
      <td>${p.nom_complet}</td>
      <td>${p.email}<br>${p.telephone || '-'}</td>
      <td>${p.date_fin_contrat || '-'}</td>
      <td>${p.commission_taux || 0}%</td>
      <td>${p.est_gele ? 'Gelé' : 'Actif'}</td>
      <td>-</td>
    </tr>`).join('');
}

function calculerFinContrat() {
  const days = parseInt(document.getElementById('part-duree').value, 10);
  const date = new Date();
  date.setDate(date.getDate() + days);
  document.getElementById('part-fin').value = date.toISOString().split('T')[0];
}

async function upsertPartenaire() {
  if (currentUserRole !== ROLE_SUPER_ADMIN) return;
  const payload = {
    email: document.getElementById('part-email').value,
    nom_complet: `${document.getElementById('part-nom').value} ${document.getElementById('part-prenom').value}`.trim(),
    telephone: document.getElementById('part-tel').value,
    date_fin_contrat: document.getElementById('part-fin').value,
    commission_taux: document.getElementById('part-royalties').value,
    role: 'partenaire',
  };
  if (!payload.email) return alert('Email requis');
  const { error } = await sb.from('partenaires').insert([payload]);
  if (error) alert(error.message);
  else chargerTablePartenaires();
}

async function ajouterPromo() {
  const payload = {
    code: document.getElementById('promo-code').value.toUpperCase(),
    reduction_pourcent: parseInt(document.getElementById('promo-pourcent').value, 10) || 0,
    min_jours: parseInt(document.getElementById('promo-jours').value, 10) || 1,
    date_debut: document.getElementById('promo-debut').value,
    date_fin: document.getElementById('promo-fin').value,
    actif: true,
  };
  if (!payload.code) return alert('Code requis');
  const { error } = await sb.from('codes_promo').insert([payload]);
  if (error) alert(error.message);
  else chargerTablePromos();
}

async function chargerTablePromos() {
  const tbody = document.getElementById('tbody-promos');
  tbody.innerHTML = '<tr><td colspan="5">Chargement…</td></tr>';
  const { data, error } = await sb.from('codes_promo').select('*').order('date_debut', { ascending: true });
  if (error) {
    tbody.innerHTML = `<tr><td colspan="5">Erreur: ${error.message}</td></tr>`;
    return;
  }
  tbody.innerHTML = (data || []).map((p) => `
    <tr>
      <td>${p.code}</td>
      <td>${p.reduction_pourcent}%</td>
      <td>${p.date_debut || '-'} ➜ ${p.date_fin || '-'}</td>
      <td>${p.min_jours || 1} jours min.</td>
      <td>${p.actif ? 'Actif' : 'Inactif'}</td>
    </tr>`).join('');
}

async function chargerTableAvis() {
  const tbody = document.getElementById('tbody-avis');
  const { data, error } = await sb.from('avis').select('*').order('created_at', { ascending: false });
  if (error) {
    tbody.innerHTML = `<tr><td colspan="6">Erreur: ${error.message}</td></tr>`;
    return;
  }
  tbody.innerHTML = (data || []).map((a) => `
    <tr>
      <td>${new Date(a.created_at).toLocaleDateString('fr-FR')}</td>
      <td>${a.nom}</td>
      <td>${a.note}/5</td>
      <td>${a.commentaire}</td>
      <td>${a.visible ? 'Visible' : 'Masqué'}</td>
      <td><button class="btn-small" style="background:#3498db;" onclick="toggleAvis(${a.id}, ${a.visible})">Basculer</button></td>
    </tr>`).join('');
}
async function toggleAvis(id, visible) {
  await sb.from('avis').update({ visible: !visible }).eq('id', id);
  chargerTableAvis();
}

async function ajouterPub() {
  const payload = {
    societe: document.getElementById('pub-societe').value,
    contact: document.getElementById('pub-contact').value,
    emplacement: document.getElementById('pub-emplacement').value,
    image_url: document.getElementById('pub-image').value,
    lien_redirection: document.getElementById('pub-lien').value,
    date_debut: document.getElementById('pub-debut').value,
    date_fin: document.getElementById('pub-fin').value,
    actif: true,
  };
  const { error } = await sb.from('publicites').insert([payload]);
  if (error) alert(error.message);
  else chargerTablePubs();
}
async function chargerTablePubs() {
  const tbody = document.getElementById('tbody-pubs');
  tbody.innerHTML = '<tr><td colspan="5">Chargement…</td></tr>';
  const { data, error } = await sb.from('publicites').select('*').order('date_debut', { ascending: false });
  if (error) {
    tbody.innerHTML = `<tr><td colspan="5">Erreur: ${error.message}</td></tr>`;
    return;
  }
  tbody.innerHTML = (data || []).map((p) => `
    <tr>
      <td>${p.societe}</td>
      <td>${p.emplacement}</td>
      <td>${p.date_debut || '-'} ➜ ${p.date_fin || '-'}</td>
      <td><img src="${p.image_url}" alt="${p.societe}" style="width:60px;"></td>
      <td>${p.actif ? 'Actif' : 'Inactif'}</td>
    </tr>`).join('');
}

function calculerFinPub() {
  const debut = document.getElement
