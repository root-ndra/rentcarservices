let supabaseAdmin = null;
let currentUser = null;
let partenairesCache = [];
let editingPartnerKey = null;

document.addEventListener('DOMContentLoaded', initAdmin);

/* --------------------------------------------------- */
/* --- 1. INITIALISATION ET AUTHENTIFICATION --- */
/* --------------------------------------------------- */

async function initSupabase() {
    if (supabaseAdmin) return;
    try {
        const response = await fetch('supabase-config.json');
        if (!response.ok) throw new Error('supabase-config.json introuvable');
        const { supabaseUrl, supabaseKey } = await response.json();
        supabaseAdmin = supabase.createClient(supabaseUrl, supabaseKey);
    } catch (error) {
        console.error("Erreur d'initialisation de Supabase:", error);
        document.body.innerHTML = "<h1>Erreur de configuration. Contactez le support.</h1>";
    }
}

async function initAdmin() {
    await initSupabase();
    if (!supabaseAdmin) return;

    const { data } = await supabaseAdmin.auth.getSession();
    if (!data.session) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = data.session.user;
    document.getElementById('user-email').textContent = currentUser.email;
    document.getElementById('user-role').textContent = (currentUser.user_metadata?.role || 'admin').toUpperCase();

    document.getElementById('btn-logout').addEventListener('click', async () => {
        await supabaseAdmin.auth.signOut();
        window.location.href = 'login.html';
    });

    document.getElementById('partner-form').addEventListener('submit', submitPartner);

    // Chargement des deux sections principales
    await Promise.all([
        loadCarDashboard(),
        loadPartenaires()
    ]);
}

/* --------------------------------------------------- */
/* --- 2. DASHBOARD VÉHICULES (Logique de admin1.html) --- */
/* --------------------------------------------------- */

async function loadCarDashboard() {
    const container = document.getElementById('grid-voitures');
    container.innerHTML = '<p>Analyse des données en cours...</p>';

    const [voituresRes, resasRes, maintsRes] = await Promise.all([
        supabaseAdmin.from('voitures').select('*').order('id'),
        supabaseAdmin.from('reservations').select('*'),
        supabaseAdmin.from('maintenances').select('*')
    ]);

    const voitures = voituresRes.data || [];
    const resas = resasRes.data || [];
    const maints = maintsRes.data || [];

    if (voitures.length === 0) {
        container.innerHTML = '<p>Aucun véhicule enregistré.</p>';
        return;
    }

    container.innerHTML = '';
    voitures.forEach(v => {
        const today = new Date().toISOString().split('T')[0];
        let statut = 'Dispo', badge = 'bg-green', border = 'status-dispo';
        
        const isMaint = maints.find(m => m.id_voiture === v.id && today >= m.date_debut && today <= m.date_fin);
        const isLoc = resas.find(r => r.id_voiture === v.id && today >= r.date_debut && today <= r.date_fin && r.statut === 'valide');
        
        if (isMaint) { statut = 'Maintenance'; badge = 'bg-orange'; border = 'status-maintenance'; }
        else if (isLoc) { statut = 'Louée'; badge = 'bg-red'; border = 'status-louee'; }

        // Calculs de revenus et taux d'occupation (sur le mois en cours)
        let revenus = 0, joursLoues = 0;
        const now = new Date();
        const debutPeriode = new Date(now.getFullYear(), now.getMonth(), 1);
        const resasPeriode = resas.filter(r => r.id_voiture === v.id && r.statut === 'valide' && new Date(r.date_debut) >= debutPeriode);
        
        resasPeriode.forEach(r => {
            revenus += r.montant_total || 0;
            const d1 = new Date(r.date_debut), d2 = new Date(r.date_fin);
            joursLoues += Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
        });
        
        const joursDansLeMois = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const tauxOccupation = Math.round((joursLoues / joursDansLeMois) * 100);

        // Calcul pour la jauge de vidange
        const kmActuel = v.kilometrage || 0;
        const kmDepuisVidange = kmActuel % 6000;
        const couleurJauge = kmDepuisVidange > 5500 ? '#e74c3c' : (kmDepuisVidange > 4500 ? '#f39c12' : '#2ecc71');
        const pourcentageVidange = (kmDepuisVidange / 6000) * 100;

        container.innerHTML += `
            <div class="car-card ${border}">
                <div class="card-header">
                    <strong>${v.nom}</strong>
                    <span class="badge ${badge}">${statut}</span>
                </div>
                <div class="card-body">
                    <div class="kpi-row">
                        <div class="kpi-item"><div class="kpi-val">${(revenus / 1000).toFixed(0)}k</div><div class="kpi-label">CA ce mois (Ar)</div></div>
                        <div class="kpi-item"><div class="kpi-val">${tauxOccupation}%</div><div class="kpi-label">Taux d'occupation</div></div>
                    </div>
                    <div class="km-box"><span>Kilométrage: <strong>${kmActuel.toLocaleString('fr-FR')} km</strong></span></div>
                    <div class="vidange-container">
                        <div class="vidange-text"><span>Cycle Vidange (6000km)</span><span>${6000 - kmDepuisVidange} km restants</span></div>
                        <div class="vidange-bar-bg"><div class="vidange-bar-fill" style="width: ${pourcentageVidange}%; background:${couleurJauge};"></div></div>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn-action-card btn-maint" onclick="openMaint(${v.id})">Maintenance</button>
                    <button class="btn-action-card btn-hist" onclick="voirHistorique(${v.id}, '${v.nom}')">Historique</button>
                    <button class="btn-action-card btn-km" onclick="openKm(${v.id}, ${v.kilometrage || 0})">MàJ Km</button>
                </div>
            </div>`;
    });
}

// --- Fonctions des modaux pour les voitures ---
function fermerModal(id) { document.getElementById(id).style.display = 'none'; }
function openMaint(id) { document.getElementById('maint-id-voiture').value = id; document.getElementById('modal-maint').style.display = 'flex'; }
function openKm(id, km) { document.getElementById('km-id-voiture').value = id; document.getElementById('km-valeur').value = km; document.getElementById('modal-km').style.display = 'flex'; }

async function sauvegarderKm() {
    const id = document.getElementById('km-id-voiture').value;
    const km = document.getElementById('km-valeur').value;
    await supabaseAdmin.from('voitures').update({ kilometrage: km }).eq('id', id);
    fermerModal('modal-km');
    loadCarDashboard();
}

async function sauvegarderMaintenance() {
    const kmEntretien = document.getElementById('maint-km').value;
    let details = document.getElementById('maint-details').value;
    if (kmEntretien) details = `(À ${kmEntretien} km) ` + details;

    const maint = {
        id_voiture: document.getElementById('maint-id-voiture').value,
        type_intervention: document.getElementById('maint-type').value,
        details: details,
        cout: document.getElementById('maint-cout').value,
        date_debut: document.getElementById('maint-debut').value || new Date().toISOString().split('T')[0],
        date_fin: document.getElementById('maint-fin').value || new Date().toISOString().split('T')[0]
    };

    await supabaseAdmin.from('maintenances').insert([maint]);
    fermerModal('modal-maint');
    loadCarDashboard();
}

async function voirHistorique(id, nom) {
    document.getElementById('hist-titre-voiture').innerText = nom;
    const ul = document.getElementById('historique-list');
    ul.innerHTML = '<li>Chargement...</li>';
    document.getElementById('modal-historique').style.display = 'flex';

    const { data } = await supabaseAdmin.from('maintenances').select('*').eq('id_voiture', id).order('date_debut', { ascending: false });
    
    ul.innerHTML = '';
    let total = 0;
    if (data && data.length > 0) {
        data.forEach(m => {
            const cout = m.cout || 0;
            total += cout;
            ul.innerHTML += `<li class="history-item">
                <div class="hist-date">${m.date_debut}</div>
                <div class="hist-details"><strong>${m.type_intervention}</strong><br><small>${m.details || ''}</small></div>
                <div class="hist-cout">${cout.toLocaleString('fr-FR')} Ar</div>
            </li>`;
        });
    } else {
        ul.innerHTML = '<li>Aucun historique de maintenance.</li>';
    }
    document.getElementById('hist-total').innerText = total.toLocaleString('fr-FR') + ' Ar';
}


/* --------------------------------------------------- */
/* --- 3. GESTION DES PARTENAIRES (Logique de admin.js) --- */
/* --------------------------------------------------- */

async function loadPartenaires() {
  const tbody = document.getElementById('partners-body');
  tbody.innerHTML = '<tr><td colspan="6">Chargement…</td></tr>';

  const { data, error } = await supabaseAdmin.from('partenaires').select('*').order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6">${error.message}</td></tr>`;
    return;
  }
  partenairesCache = data || [];
  renderPartnerTable(partenairesCache);
}

function renderPartnerTable(list) {
  const tbody = document.getElementById('partners-body');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6">Aucun partenaire pour le moment.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(p => `
    <tr>
      <td>${p.nom_complet || `${p.prenom || ''} ${p.nom || ''}`.trim() || '-'}</td>
      <td>${p.email}</td>
      <td>${p.telephone || '-'}</td>
      <td>${p.commission_taux || 0}%</td>
      <td>
        <label class="switch">
          <input type="checkbox" ${p.est_gele ? '' : 'checked'} onchange="togglePartner('${p.id}', this.checked)">
          <span class="slider"></span>
        </label>
      </td>
      <td>
        <button class="btn-small btn-sec" onclick="openPartnerModal('${p.id}')"><i class="fas fa-pen"></i></button>
      </td>
    </tr>
  `).join('');
}

function openPartnerModal(partnerId = null) {
  const modal = document.getElementById('partner-modal');
  const form = document.getElementById('partner-form');
  form.reset();

  editingPartnerKey = partnerId;
  document.getElementById('partner-id').value = partnerId || '';
  document.querySelectorAll('.auth-only').forEach(el => el.style.display = partnerId ? 'none' : 'block');
  
  if (partnerId) {
    const partner = partenairesCache.find(p => p.id === partnerId);
    document.getElementById('partner-modal-title').textContent = 'Modifier partenaire';
    document.getElementById('new-prenom').value = partner?.prenom || '';
    const nomComplet = partner?.nom_complet || '';
    document.getElementById('new-nom').value = nomComplet.replace(partner?.prenom, '').trim();
    document.getElementById('new-email').value = partner?.email || '';
    document.getElementById('new-tel').value = partner?.telephone || '';
    document.getElementById('new-commission').value = partner?.commission_taux || 15;
  } else {
    document.getElementById('partner-modal-title').textContent = 'Nouveau partenaire';
  }
  modal.style.display = 'flex';
}

function closePartnerModal() {
  document.getElementById('partner-modal').style.display = 'none';
  editingPartnerKey = null;
}

async function submitPartner(event) {
  event.preventDefault();
  const feedback = document.getElementById('partner-feedback');
  feedback.textContent = 'Traitement…';

  const prenom = document.getElementById('new-prenom').value.trim();
  const nom = document.getElementById('new-nom').value.trim();
  const payload = {
    prenom,
    nom_complet: `${prenom} ${nom}`.trim(),
    email: document.getElementById('new-email').value.trim(),
    telephone: document.getElementById('new-tel').value.trim(),
    commission_taux: parseInt(document.getElementById('new-commission').value, 10) || 15
  };

  if (editingPartnerKey) {
    const { error } = await supabaseAdmin.from('partenaires').update(payload).eq('id', editingPartnerKey);
    if (error) { feedback.textContent = error.message; return; }
    feedback.textContent = 'Partenaire mis à jour ✅';
  } else {
    const loginEmail = document.getElementById('new-login').value.trim();
    let password = document.getElementById('new-password').value.trim();
    if (!loginEmail) { feedback.textContent = 'Le login est obligatoire.'; return; }
    if (!password) password = `RCS-${Math.random().toString(36).slice(2, 8)}!`;
    
    const { data, error: authError } = await supabaseAdmin.auth.signUp({ email: loginEmail, password, options: { data: { role: 'partenaire' } } });
    if (authError) { feedback.textContent = authError.message; return; }
    
    payload.user_id = data.user.id;
    const { error: insertError } = await supabaseAdmin.from('partenaires').insert([payload]);
    if (insertError) { feedback.textContent = insertError.message; return; }
    feedback.textContent = 'Partenaire créé ✅';
  }
  await loadPartenaires();
  setTimeout(closePartnerModal, 1000);
}

async function togglePartner(partnerId, isActive) {
  await supabaseAdmin.from('partenaires').update({ est_gele: !isActive }).eq('id', partnerId);
  await loadPartenaires();
}

// Exposer les fonctions à l'objet window pour les `onclick`
window.openPartnerModal = openPartnerModal;
window.closePartnerModal = closePartnerModal;
window.togglePartner = togglePartner;
window.fermerModal = fermerModal;
window.openMaint = openMaint;
window.openKm = openKm;
window.sauvegarderKm = sauvegarderKm;
window.sauvegarderMaintenance = sauvegarderMaintenance;
window.voirHistorique = voirHistorique;
