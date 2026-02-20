let supabaseAdmin = null;
let currentUser = null;
let partenairesCache = [];
let voituresCache = [];
let maintenanceConfig = [];

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

    await Promise.all([
        loadMaintenanceOptions(),
        loadCarDashboard(),
        loadPartenaires()
    ]);
}

/* --------------------------------------------------- */
/* --- 2. DASHBOARD VÉHICULES --- */
/* --------------------------------------------------- */

async function loadCarDashboard() {
    const container = document.getElementById('grid-voitures');
    container.innerHTML = '<p>Analyse des données en cours...</p>';

    // Récupération des données
    const [voituresRes, resasRes, maintsRes] = await Promise.all([
        supabaseAdmin.from('voitures').select('*').order('id'),
        supabaseAdmin.from('reservations').select('*'),
        supabaseAdmin.from('maintenances').select('*')
    ]);

    voituresCache = voituresRes.data || [];
    const resas = resasRes.data || [];
    const maints = maintsRes.data || [];

    if (voituresCache.length === 0) {
        container.innerHTML = '<p>Aucun véhicule enregistré.</p>';
        return;
    }

    container.innerHTML = '';
    voituresCache.forEach(v => {
        const today = new Date().toISOString().split('T')[0];
        let statut = 'Dispo', badgeClass = 'bg-green', borderClass = 'status-dispo';
        
        const isMaint = maints.find(m => m.id_voiture === v.id && today >= m.date_debut && today <= m.date_fin);
        const isLoc = resas.find(r => r.id_voiture === v.id && today >= r.date_debut && today <= r.date_fin && r.statut === 'valide');
        
        if (isMaint) { statut = 'Maintenance'; badgeClass = 'bg-orange'; borderClass = 'status-maintenance'; }
        else if (isLoc) { statut = 'Louée'; badgeClass = 'bg-red'; borderClass = 'status-louee'; }

        // Calcul des revenus du mois
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

        container.innerHTML += `
            <div class="car-card ${borderClass}">
                <div class="card-header">
                    <strong>${v.nom}</strong>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <label class="switch" title="Afficher/Masquer sur le site public">
                            <input type="checkbox" ${v.est_public !== false ? 'checked' : ''} onchange="toggleCarVisibility('${v.id}', this.checked)">
                            <span class="slider"></span>
                        </label>
                        <span class="badge ${badgeClass}">${statut}</span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="kpi-row">
                        <div class="kpi-item"><div class="kpi-val">${(revenus / 1000).toFixed(0)}k</div><div class="kpi-label">CA ce mois (Ar)</div></div>
                        <div class="kpi-item"><div class="kpi-val">${tauxOccupation}%</div><div class="kpi-label">Taux d'occupation</div></div>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn-action-card btn-edit-car" onclick="openCarModal(${v.id})">Modifier</button>
                    <button class="btn-action-card btn-maint" onclick="openMaint(${v.id})">Maintenance</button>
                    <button class="btn-action-card btn-hist" onclick="voirHistorique(${v.id}, '${v.nom}')">Historique</button>
                </div>
            </div>`;
    });
}

/**
 * Ouvre le modal de voiture (Ajout ou Modification)
 */
function openCarModal(carId = null) {
    const modal = document.getElementById('car-modal');
    const form = document.getElementById('car-form');
    form.reset();
    document.getElementById('car-feedback').textContent = '';
    document.getElementById('car-id').value = carId || '';

    if (carId) {
        const car = voituresCache.find(v => v.id === carId);
        if (car) {
            document.getElementById('car-modal-title').textContent = 'Modifier le véhicule';
            document.getElementById('car-nom').value = car.nom;
            document.getElementById('car-prix').value = car.prix_base;
            document.getElementById('car-type').value = car.type || "";
            document.getElementById('car-transmission').value = car.transmission || "Manuelle";
            document.getElementById('car-places').value = car.places || 5;
            document.getElementById('car-carburant').value = car.carburant || "";
            document.getElementById('car-image-url').value = car.image_url || "";
            document.getElementById('car-description').value = car.description || "";
            document.getElementById('car-reservable').checked = car.reservable !== false;
            
            // Intégration de l'option chauffeur
            const hasChauffeur = (car.chauffeur_option === true || car.chauffeur_option === "true");
            document.getElementById('car-chauffeur').checked = hasChauffeur;
        }
    } else {
        document.getElementById('car-modal-title').textContent = 'Ajouter un véhicule';
    }
    modal.style.display = 'flex';
}

/**
 * Enregistre ou modifie le véhicule dans Supabase
 */
async function submitCar(event) {
    event.preventDefault();
    const feedback = document.getElementById('car-feedback');
    feedback.textContent = 'Enregistrement...';

    const carId = document.getElementById('car-id').value;
    const payload = {
        nom: document.getElementById('car-nom').value,
        prix_base: parseInt(document.getElementById('car-prix').value, 10),
        type: document.getElementById('car-type').value,
        transmission: document.getElementById('car-transmission').value,
        places: parseInt(document.getElementById('car-places').value, 10),
        carburant: document.getElementById('car-carburant').value,
        image_url: document.getElementById('car-image-url').value,
        description: document.getElementById('car-description').value,
        // On convertit le booléen en chaîne de caractères pour s'aligner sur la BDD
        reservable: document.getElementById('car-reservable').checked ? 'true' : 'false', 
        // Si la case est cochée, on envoie le texte 'option', sinon on envoie 'non' (ou null selon ce que vous préférez)
        chauffeur_option: document.getElementById('car-chauffeur').checked ? 'option' : 'non'
    };

    let error;
    if (carId) {
        ({ error } = await supabaseAdmin.from('voitures').update(payload).eq('id', carId));
    } else {
        ({ error } = await supabaseAdmin.from('voitures').insert([payload]));
    }

    if (error) {
        feedback.textContent = `Erreur: ${error.message}`;
        feedback.style.color = 'red';
    } else {
        feedback.textContent = 'Succès !';
        feedback.style.color = 'green';
        await loadCarDashboard();
        setTimeout(() => closeModal('car-modal'), 1000);
    }
}

async function toggleCarVisibility(carId, isVisible) {
    const { error } = await supabaseAdmin.from('voitures').update({ est_public: isVisible }).eq('id', carId);
    if (error) {
        alert(`Erreur: ${error.message}`);
        await loadCarDashboard();
    }
}

/* --------------------------------------------------- */
/* --- 3. GESTION DES PARTENAIRES --- */
/* --------------------------------------------------- */

async function loadPartenaires() {
  const tbody = document.getElementById('partners-body');
  tbody.innerHTML = '<tr><td colspan="6">Chargement…</td></tr>';
  const { data, error } = await supabaseAdmin.from('partenaires').select('*').order('created_at', { ascending: false });

  if (error) { tbody.innerHTML = `<tr><td colspan="6">${error.message}</td></tr>`; return; }
  partenairesCache = data || [];
  renderPartnerTable(partenairesCache);
}

function renderPartnerTable(list) {
  const tbody = document.getElementById('partners-body');
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="6">Aucun partenaire.</td></tr>'; return; }
  tbody.innerHTML = list.map(p => `
    <tr>
      <td>${p.nom_complet || `${p.prenom || ''} ${p.nom || ''}`.trim() || '-'}</td>
      <td>${p.email}</td>
      <td>${p.telephone || '-'}</td>
      <td>${p.commission_taux || 0}%</td>
      <td>
        <label class="switch">
          <input type="checkbox" ${p.est_gele ? '' : 'checked'} onchange="togglePartner('${p.user_id}', this.checked)">
          <span class="slider"></span>
        </label>
      </td>
      <td><button class="btn-small btn-sec" onclick="openPartnerModal('${p.user_id}')"><i class="fas fa-pen"></i></button></td>
    </tr>
  `).join('');
}

function openPartnerModal(userId = null) {
  const modal = document.getElementById('partner-modal');
  const form = document.getElementById('partner-form');
  form.reset();
  document.getElementById('partner-feedback').textContent = '';
  document.getElementById('partner-user-id').value = userId || '';
  document.querySelectorAll('.auth-only').forEach(el => el.style.display = userId ? 'none' : 'block');
  
  if (userId) {
    const partner = partenairesCache.find(p => p.user_id === userId);
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

async function submitPartner(event) {
  event.preventDefault();
  const feedback = document.getElementById('partner-feedback');
  feedback.textContent = 'Traitement…';
  const userId = document.getElementById('partner-user-id').value;
  const prenom = document.getElementById('new-prenom').value.trim();
  const nom = document.getElementById('new-nom').value.trim();
  const payload = {
    prenom,
    nom_complet: `${prenom} ${nom}`.trim(),
    email: document.getElementById('new-email').value.trim(),
    telephone: document.getElementById('new-tel').value.trim(),
    commission_taux: parseInt(document.getElementById('new-commission').value, 10) || 15
  };

  if (userId) {
    const { error } = await supabaseAdmin.from('partenaires').update(payload).eq('user_id', userId);
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
  setTimeout(() => closeModal('partner-modal'), 1000);
}

async function togglePartner(userId, isActive) {
  const { error } = await supabaseAdmin.from('partenaires').update({ est_gele: !isActive }).eq('user_id', userId);
  if (error) alert(`Erreur: ${error.message}`);
  await loadPartenaires();
}

/* --------------------------------------------------- */
/* --- 4. GESTION DE LA MAINTENANCE --- */
/* --------------------------------------------------- */

async function loadMaintenanceOptions() {
    try {
        const response = await fetch('maintenances.json');
        const data = await response.json();
        maintenanceConfig = data.maintenanceCategories;
        const categorieSelect = document.getElementById('maint-categorie');
        categorieSelect.innerHTML = maintenanceConfig.map(cat => `<option value="${cat.label}">${cat.label}</option>`).join('');
        updateMotifs();
    } catch (error) {
        console.error("Erreur chargement maintenances.json:", error);
    }
}

function updateMotifs() {
    const categorieSelect = document.getElementById('maint-categorie');
    const motifSelect = document.getElementById('maint-motif');
    const selectedCategory = maintenanceConfig.find(cat => cat.label === categorieSelect.value);
    motifSelect.innerHTML = '';
    if (selectedCategory) {
        selectedCategory.subcategories.forEach(sub => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = sub.label;
            sub.motifs.forEach(motif => {
                const option = document.createElement('option');
                option.value = motif;
                option.textContent = motif;
                optgroup.appendChild(option);
            });
            motifSelect.appendChild(optgroup);
        });
    }
}

function openMaint(id) { 
    document.getElementById('maint-id-voiture').value = id; 
    document.getElementById('modal-maint').style.display = 'flex'; 
}

async function sauvegarderMaintenance() {
    const typeIntervention = `${document.getElementById('maint-categorie').value} - ${document.getElementById('maint-motif').value}`;
    const maint = {
        id_voiture: document.getElementById('maint-id-voiture').value,
        type_intervention: typeIntervention,
        details: document.getElementById('maint-details').value,
        cout: document.getElementById('maint-cout').value,
        date_debut: document.getElementById('maint-debut').value || new Date().toISOString().split('T')[0],
        date_fin: document.getElementById('maint-fin').value || new Date().toISOString().split('T')[0]
    };
    await supabaseAdmin.from('maintenances').insert([maint]);
    closeModal('modal-maint');
    await loadCarDashboard();
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
                <div class="hist-details">${m.type_intervention}</div>
                <div class="hist-cout">${cout.toLocaleString('fr-FR')} Ar</div>
            </li>`;
        });
    } else { ul.innerHTML = '<li>Aucun historique.</li>'; }
    document.getElementById('hist-total').innerText = total.toLocaleString('fr-FR') + ' Ar';
}

/* --------------------------------------------------- */
/* --- 5. UTILITAIRES --- */
/* --------------------------------------------------- */

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// Exposer les fonctions à l'objet window pour les appels HTML
window.closeModal = closeModal;
window.openPartnerModal = openPartnerModal;
window.submitPartner = submitPartner;
window.togglePartner = togglePartner;
window.openCarModal = openCarModal;
window.submitCar = submitCar;
window.toggleCarVisibility = toggleCarVisibility;
window.updateMotifs = updateMotifs;
window.openMaint = openMaint;
window.sauvegarderMaintenance = sauvegarderMaintenance;
window.voirHistorique = voirHistorique;

