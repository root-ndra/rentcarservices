// -----------------------------------------------------------------------------
// CONFIGURATION SUPABASE & CONSTANTES
// -----------------------------------------------------------------------------
const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ROLE_SUPER_ADMIN = 'super_admin';
const ROLE_PARTENAIRE = 'partenaire';
const restrictedTabs = ['partenaires','promos','pubs','media','config'];

let currentUser = null;
let currentUserRole = ROLE_PARTENAIRE;
let globalVoitures = [];
let periodeAnalyse = 'mois';

// -----------------------------------------------------------------------------
// AUTHENTIFICATION
// -----------------------------------------------------------------------------
async function loginAdmin() {
  const email = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-pass').value.trim();
  const errorMsg = document.getElementById('login-error');
  errorMsg.style.display = 'none';

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errorMsg.innerText = error.message;
    errorMsg.style.display = 'block';
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
  chargerConfigAdmin();
  chargerDashboard();
}

// -----------------------------------------------------------------------------
// RÔLES & INTERFACE
// -----------------------------------------------------------------------------
async function chargerRoleUtilisateur(userId) {
  const { data, error } = await sb.from('partenaires').select('role').eq('user_id', userId).maybeSingle();
  currentUserRole = error ? ROLE_PARTENAIRE : (data?.role || ROLE_PARTENAIRE);
}

function appliquerInterfaceSelonRole() {
  const badge = document.getElementById('header-user-role');
  badge.innerText = currentUserRole === ROLE_SUPER_ADMIN ? 'SUPER ADMIN' : 'PARTENAIRE';
  badge.style.background = currentUserRole === ROLE_SUPER_ADMIN ? '#27ae60' : '#7f8c8d';

  restrictedTabs.forEach((tab) => {
    const btn = document.getElementById(`btn-tab-${tab}`);
    if (btn) btn.style.display = currentUserRole === ROLE_SUPER_ADMIN ? 'flex' : 'none';
  });
}

function switchTab(tab, evt) {
  const views = ['dashboard','reservations','maintenances','avis','pubs','media','promos','partenaires','config'];
  views.forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.style.display = v === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));
  if (evt?.currentTarget) evt.currentTarget.classList.add('active');

  if (tab === 'reservations') { chargerVoituresPourSelect(); chargerTableReservations(); }
  if (tab === 'maintenances') chargerTableMaintenances();
  if (tab === 'promos') chargerTablePromos();
  if (tab === 'partenaires') chargerTablePartenaires();
  if (tab === 'avis') chargerTableAvis();
  if (tab === 'pubs') chargerTablePubs();
  if (tab === 'media') chargerTableMedia();
  if (tab === 'config') chargerConfigAdmin();
}
// -----------------------------------------------------------------------------
// CONFIGURATION ADMIN
// -----------------------------------------------------------------------------
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

async function toggleGlobalCalendar() {
  if (currentUserRole !== ROLE_SUPER_ADMIN) {
    alert('Action réservée au Super Admin.');
    document.getElementById('toggle-calendar-global').checked =
      !document.getElementById('toggle-calendar-global').checked;
    return;
  }
  const toggle = document.getElementById('toggle-calendar-global');
  const visible = toggle.checked;
  await sb.from('config_site').upsert({ key: 'calendar_visible', value: visible });
  const label = document.getElementById('status-calendar-text');
  label.innerText = visible ? 'VISIBLE' : 'MASQUÉ';
  label.style.color = visible ? '#27ae60' : '#e74c3c';
}

// -----------------------------------------------------------------------------
// DASHBOARD VOITURES
// -----------------------------------------------------------------------------
function formatPrix(val) {
  if (val === null || val === undefined) return '0';
  return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function resumeDescription(text) {
  if (!text) return '<em>Aucune description</em>';
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

async function chargerDashboard() {
  const grid = document.getElementById('grid-voitures');
  grid.innerHTML = '<p>Chargement…</p>';

  let query = sb.from('voitures').select('*').order('nom', { ascending: true });
  if (currentUserRole !== ROLE_SUPER_ADMIN) query = query.eq('proprietaire_id', currentUser.id);

  const { data, error } = await query;
  if (error) {
    grid.innerHTML = `<p>Erreur: ${error.message}</p>`;
    return;
  }
  globalVoitures = data || [];
  if (!globalVoitures.length) {
    grid.innerHTML = '<p>Aucune voiture.</p>';
    return;
  }

  grid.innerHTML = '';
  globalVoitures.forEach((voiture) => {
    const card = document.createElement('div');
    const isReservable = voiture.reservable !== false;
    card.className = `car-card ${isReservable ? 'dispo' : 'indispo'}`;
    card.innerHTML = `
      <div class="top">
        <div>
          <strong style="font-size:1.1rem;">${voiture.nom}</strong><br/>
          <span style="color:#999;">Ref: ${voiture.ref_id || '-'}</span>
        </div>
        <span class="user-role-badge" style="background:${isReservable ? '#27ae60' : '#f39c12'};">
          ${isReservable ? 'Réservable' : 'Contact'}
        </span>
      </div>
      <div class="meta">
        <span><i class="fas fa-gas-pump"></i> ${voiture.carburant || '-'}</span>
        <span><i class="fas fa-cogs"></i> ${voiture.transmission || '-'}</span>
        <span><i class="fas fa-user-friends"></i> ${voiture.places || '-'} places</span>
        <span><i class="fas fa-money-bill"></i> ${formatPrix(voiture.prix_base)} Ar/j</span>
      </div>
      <div class="description">${resumeDescription(voiture.description)}</div>
      <div class="actions">
        <button class="btn-action btn-primaire" onclick="toggleReservable('${voiture.id}', ${isReservable})">
          ${isReservable ? 'Désactiver' : 'Activer'}
        </button>
        <button class="btn-action btn-sec" onclick="ouvrirModalVoiture('${voiture.id}')">Modifier</button>
      </div>`;
    grid.appendChild(card);
  });
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
    ['new-car-nom','new-car-prix','new-car-places','new-car-desc','new-car-img','new-car-ref']
      .forEach((f) => document.getElementById(f).value = '');
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

// -----------------------------------------------------------------------------
// RÉSERVATIONS
// -----------------------------------------------------------------------------
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

  tbody.innerHTML = data.map((resa) => `
    <tr>
      <td>#${resa.id}<br><small>${new Date(resa.created_at).toLocaleDateString('fr-FR')}</small></td>
      <td>${resa.nom || '-'}<br><small>${resa.tel || ''}</small></td>
      <td>${resa.voitures?.nom || '-'}<br><small>${resa.date_debut} → ${resa.date_fin}</small></td>
      <td>
        Livraison : ${resa.lieu_livraison || 'Agence'} (${resa.heure_livraison || '-'})<br>
        Retour : ${resa.lieu_recuperation || 'Agence'} (${resa.heure_recuperation || '-'})
      </td>
      <td>
        Total : ${formatPrix(resa.montant_total)} Ar<br>
        Payé : ${formatPrix(resa.paiement_montant_declare || 0)} Ar
      </td>
      <td>${resa.code_otp ? `OTP ${resa.code_otp}` : (resa.statut || 'en_attente')}</td>
      <td>
        <button class="btn-small btn-primaire" onclick="assignerOTP(${resa.id})">OTP</button>
        <button class="btn-small btn-sec" onclick="changerStatutResa(${resa.id})">Statut</button>
      </td>
    </tr>`).join('');
}

async function assignerOTP(id) {
  const otp = prompt('Code OTP à appliquer (4 chiffres) ?');
  if (!otp) return;
  await sb.from('reservations').update({ code_otp: otp }).eq('id', id);
  chargerTableReservations();
}

async function changerStatutResa(id) {
  const statut = prompt('Nouveau statut (en_attente, valide, annule) :', 'valide');
  if (!statut) return;
  await sb.from('reservations').update({ statut }).eq('id', id);
  chargerTableReservations();
}
// -----------------------------------------------------------------------------
// AVIS
// -----------------------------------------------------------------------------
async function chargerTableAvis() {
  const tbody = document.getElementById('tbody-avis');
  tbody.innerHTML = '<tr><td colspan="6">Chargement…</td></tr>';

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
      <td><button class="btn-action btn-sec" onclick="toggleAvis(${a.id}, ${a.visible})">Basculer</button></td>
    </tr>`).join('');
}

async function toggleAvis(id, visible) {
  await sb.from('avis').update({ visible: !visible }).eq('id', id);
  chargerTableAvis();
}

// -----------------------------------------------------------------------------
// PARTENAIRES
// -----------------------------------------------------------------------------
function calculerFinContrat() {
  const duree = parseInt(document.getElementById('part-duree').value, 10) || 30;
  const fin = new Date();
  fin.setDate(fin.getDate() + duree);
  document.getElementById('part-fin').value = fin.toISOString().split('T')[0];
}

async function upsertPartenaire() {
  const email = document.getElementById('part-email').value.trim();
  if (!email) return alert("L'email Supabase Auth est requis.");

  const { data: partenaire } = await sb.from('partenaires').select('*').eq('email', email).maybeSingle();
  if (!partenaire) {
    alert('Crée d’abord l’utilisateur dans Supabase Auth puis associe-le ici.');
    return;
  }

  const payload = {
    nom_complet: `${document.getElementById('part-nom').value} ${document.getElementById('part-prenom').value}`.trim(),
    telephone: document.getElementById('part-tel').value,
    date_fin_contrat: document.getElementById('part-fin').value || null,
    commission_taux: parseInt(document.getElementById('part-royalties').value, 10) || 15,
  };

  const { error } = await sb.from('partenaires').update(payload).eq('email', email);
  if (error) alert(error.message);
  else {
    alert('Partenaire mis à jour.');
    chargerTablePartenaires();
  }
}

async function chargerTablePartenaires() {
  const tbody = document.getElementById('tbody-partenaires');
  tbody.innerHTML = '<tr><td colspan="6">Chargement…</td></tr>';

  const { data, error } = await sb.from('partenaires').select('*').order('created_at', { ascending: false });
  if (error) {
    tbody.innerHTML = `<tr><td colspan="6">Erreur: ${error.message}</td></tr>`;
    return;
  }

  tbody.innerHTML = (data || []).map((p) => `
    <tr>
      <td>${p.nom_complet || '-'}</td>
      <td>${p.email}<br><small>${p.telephone || ''}</small></td>
      <td>${p.date_fin_contrat ? new Date(p.date_fin_contrat).toLocaleDateString('fr-FR') : '-'}</td>
      <td>${p.commission_taux || 0}%</td>
      <td>${p.role}</td>
      <td>${p.est_gele ? 'Gelé' : 'Actif'}</td>
    </tr>`).join('');
}

// -----------------------------------------------------------------------------
// MAINTENANCES
// -----------------------------------------------------------------------------
async function chargerTableMaintenances() {
  const tbody = document.getElementById('tbody-maint-global');
  tbody.innerHTML = '<tr><td colspan="6">Chargement…</td></tr>';

  const { data, error } = await sb
    .from('maintenances')
    .select('*, voitures(nom)')
    .order('date_debut', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6">Erreur: ${error.message}</td></tr>`;
    return;
  }

  tbody.innerHTML = (data || []).map((m) => `
    <tr>
      <td>${new Date(m.date_debut).toLocaleDateString('fr-FR')} → ${new Date(m.date_fin).toLocaleDateString('fr-FR')}</td>
      <td>${m.voitures?.nom || '-'}</td>
      <td>${m.type_intervention || '-'}</td>
      <td>${m.details || '-'}</td>
      <td>${formatPrix(m.cout)} Ar</td>
      <td>-</td>
    </tr>`).join('');
}
// -----------------------------------------------------------------------------
// CODES PROMO
// -----------------------------------------------------------------------------
async function ajouterPromo() {
  const payload = {
    code: document.getElementById('promo-code').value.trim().toUpperCase(),
    reduction_pourcent: parseInt(document.getElementById('promo-pourcent').value, 10) || 0,
    min_jours: parseInt(document.getElementById('promo-jours').value, 10) || 1,
    date_debut: document.getElementById('promo-debut').value,
    date_fin: document.getElementById('promo-fin').value,
    actif: true,
  };
  if (!payload.code || !payload.date_debut || !payload.date_fin) {
    alert('Code et dates sont requis.');
    return;
  }
  const { error } = await sb.from('codes_promo').insert([payload]);
  if (error) alert(error.message);
  else {
    alert('Code promo ajouté.');
    chargerTablePromos();
  }
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
      <td>${p.date_debut} → ${p.date_fin}</td>
      <td>${p.min_jours} jour(s) min</td>
      <td>${p.actif ? 'Actif' : 'Inactif'}</td>
    </tr>`).join('');
}

// -----------------------------------------------------------------------------
// PUBLICITÉS
// -----------------------------------------------------------------------------
function calculerFinPub() {
  const debut = document.getElementById('pub-debut').value;
  if (!debut) return;
  const days = parseInt(document.getElementById('pub-duree').value, 10);
  const d = new Date(debut);
  d.setDate(d.getDate() + days);
  document.getElementById('pub-fin').value = d.toISOString().split('T')[0];
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
  tbody.innerHTML = '<tr><td colspan="6">Chargement…</td></tr>';

  const { data, error } = await sb.from('publicites').select('*').order('date_debut', { ascending: false });
  if (error) {
    tbody.innerHTML = `<tr><td colspan="6">Erreur: ${error.message}</td></tr>`;
    return;
  }
  tbody.innerHTML = (data || []).map((p) => `
    <tr>
      <td>${p.societe}</td>
      <td>${p.emplacement}</td>
      <td>${p.date_debut || '-'} → ${p.date_fin || '-'}</td>
      <td><img src="${p.image_url}" alt="${p.societe}" style="width:60px; height:50px; object-fit:cover;"></td>
      <td>${p.actif ? 'Actif' : 'Inactif'}</td>
      <td>-</td>
    </tr>`).join('');
}

// -----------------------------------------------------------------------------
// MÉDIAS
// -----------------------------------------------------------------------------
async function ajouterRadio() {
  const payload = {
    nom: document.getElementById('rad-nom').value,
    url_flux: document.getElementById('rad-url').value,
    image_url: document.getElementById('rad-logo').value,
    actif: true,
  };
  const { error } = await sb.from('radios').insert([payload]);
  if (error) alert(error.message);
  else chargerTableMedia();
}

async function ajouterPlaylist() {
  const payload = {
    titre: document.getElementById('play-titre').value,
    plateforme: document.getElementById('play-plateforme').value,
    url_embed: document.getElementById('play-url').value,
    actif: true,
  };
  const { error } = await sb.from('playlists').insert([payload]);
  if (error) alert(error.message);
  else chargerTableMedia();
}

async function chargerTableMedia() {
  const tbodyRadios = document.getElementById('tbody-radios');
  tbodyRadios.innerHTML = '<tr><td colspan="4">Chargement…</td></tr>';
  const radios = await sb.from('radios').select('*');
  tbodyRadios.innerHTML = (radios.data || []).map((r) => `
    <tr>
      <td><img src="${r.image_url}" style="width:40px;height:40px;object-fit:contain;"></td>
      <td>${r.nom}</td>
      <td>${r.url_flux}</td>
      <td>${r.actif ? 'Actif' : 'Inactif'}</td>
    </tr>`).join('');

  const tbodyPlay = document.getElementById('tbody-playlists');
  tbodyPlay.innerHTML = '<tr><td colspan="4">Chargement…</td></tr>';
  const playlists = await sb.from('playlists').select('*');
  tbodyPlay.innerHTML = (playlists.data || []).map((p) => `
    <tr>
      <td>${p.plateforme}</td>
      <td>${p.titre}</td>
      <td>${p.url_embed}</td>
      <td>${p.actif ? 'Actif' : 'Inactif'}</td>
    </tr>`).join('');
}

// -----------------------------------------------------------------------------
// DIVERS & INITIALISATION
// -----------------------------------------------------------------------------
function ouvrirModalProfil() {
  document.getElementById('modal-profil').style.display = 'flex';
}

function setPeriode(p) {
  periodeAnalyse = p;
  document.getElementById('btn-periode-mois').classList.toggle('btn-primaire', p === 'mois');
  document.getElementById('btn-periode-annee').classList.toggle('btn-primaire', p === 'annee');
}

function fermerModal(id) {
  document.getElementById(id).style.display = 'none';
}

verifierSession();
