let supabaseClient = null;
let currentUser = null;
let reservationsCache = [];
let voituresCache = [];

document.addEventListener('DOMContentLoaded', initAdminReservations);

/* --------------------------------------------------- */
/* --- 1. INITIALISATION ET AUTHENTIFICATION --- */
/* --------------------------------------------------- */

async function initSupabase() {
    if (supabaseClient) return;
    try {
        const response = await fetch('supabase-config.json');
        if (!response.ok) throw new Error('supabase-config.json introuvable');
        const { supabaseUrl, supabaseKey } = await response.json();
        supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
    } catch (error) {
        console.error("Erreur d'initialisation de Supabase:", error);
        document.body.innerHTML = "<h1>Erreur de configuration. Contactez le support.</h1>";
    }
}

async function initAdminReservations() {
    await initSupabase();
    if (!supabaseClient) return;

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

/* --------------------------------------------------- */
/* --- 2. CHARGEMENT ET AFFICHAGE DES DONNÉES --- */
/* --------------------------------------------------- */

async function loadVoitures() {
    const { data, error } = await supabaseClient.from('voitures').select('id, nom, prix_base');
    if (error) { console.error("Erreur chargement voitures:", error); return; }

    voituresCache = data || [];
    const selectFilter = document.getElementById('filter-voiture');
    const selectNewResa = document.getElementById('new-resa-voiture');
    selectFilter.innerHTML = '<option value="">Toutes les voitures</option>';
    selectNewResa.innerHTML = '<option value="">-- Choisir une voiture --</option>';

    voituresCache.forEach((v) => {
        selectFilter.innerHTML += `<option value="${v.id}">${v.nom}</option>`;
        selectNewResa.innerHTML += `<option value="${v.id}">${v.nom}</option>`;
    });
}

async function loadReservations() {
    const { data, error } = await supabaseClient
        .from('reservations')
        .select('*, voitures(nom)')
        .order('created_at', { ascending: false });

    if (error) { alert(error.message); return; }
    reservationsCache = data || [];
    renderReservations();
}

function renderReservations() {
    const status = document.getElementById('filter-status').value;
    const voitureId = document.getElementById('filter-voiture').value;
    const date = document.getElementById('filter-date').value;

    const filtered = reservationsCache.filter((r) => {
        const matchStatus = !status || r.statut === status;
        const matchCar = !voitureId || r.id_voiture == voitureId;
        const matchDate = !date || (r.date_debut <= date && r.date_fin >= date);
        return matchStatus && matchCar && matchDate;
    });

    const tbody = document.querySelector('#table-reservations tbody');
    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7">Aucune réservation ne correspond à vos filtres.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map((r) => {
        const jours = Math.ceil(Math.abs(new Date(r.date_fin) - new Date(r.date_debut)) / 86400000) + 1;
        const paye = r.paiement_montant_declare || 0;
        const reste = (r.montant_total || 0) - paye;

        let statutHtml;
        switch (r.statut) {
            case 'valide': statutHtml = '<span style="color:green;">● Validé</span>'; break;
            case 'annulee': statutHtml = '<span style="color:red;">● Annulé</span>'; break;
            default: statutHtml = '<span style="color:orange;">● En attente</span>'; break;
        }

        const otpDisplay = r.statut === 'valide' ? `<strong style="color:green; font-size:1.1rem;">${r.code_otp || '-'}</strong>` : `<input type="text" id="otp-${r.id}" placeholder="Code" style="width:70px; padding:5px; text-align:center;">`;
        const btnAction = r.statut === 'valide' ? `<button class="btn-action-small" style="background:#ccc; cursor:not-allowed;">Validé</button>` : `<button class="btn-action-small btn-publish" onclick="validerResa(${r.id})"><i class="fas fa-check"></i> Valider</button>`;

        return `
            <tr>
                <td><strong>#${r.id}</strong><br>${statutHtml}</td>
                <td><strong>${r.nom}</strong><br><small>${r.tel || 'N/A'}</small></td>
                <td><strong>${r.voitures?.nom || 'Inconnue'}</strong><br>Du ${r.date_debut} au ${r.date_fin}<br><small>(${jours} jours)</small></td>
                <td><span class="badge" style="background-color: #3498db;">${r.paiement_methode || 'N/A'}</span><br><strong>${r.paiement_titulaire || 'Non précisé'}</strong></td>
                <td>Payé: <strong style="color:green;">${paye.toLocaleString()}</strong><br>Reste: <strong style="color:${reste > 0 ? 'red' : 'green'};">${reste.toLocaleString()}</strong><br><small>Total: ${(r.montant_total || 0).toLocaleString()}</small></td>
                <td>${otpDisplay}</td>
                <td>
                    <div style="display:flex; gap:5px; flex-wrap:wrap;">
                        ${btnAction}
                        <button class="btn-action-small btn-edit" onclick="ouvrirModifResa(${r.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn-action-small btn-delete" onclick="annulerResa(${r.id})"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
    }).join('');
}

/* --------------------------------------------------- */
/* --- 3. ACTIONS SUR LES RÉSERVATIONS --- */
/* --------------------------------------------------- */

function toggleNewResaForm() {
    const form = document.getElementById('form-new-resa');
    form.style.display = (form.style.display === 'none') ? 'block' : 'none';
}

function calculerPrixAdmin() {
    const idVoiture = document.getElementById('new-resa-voiture').value;
    const debut = document.getElementById('new-resa-debut').value;
    const fin = document.getElementById('new-resa-fin').value;
    if (!idVoiture || !debut || !fin) return;

    const voiture = voituresCache.find(v => v.id == idVoiture);
    if (!voiture) return;

    const d1 = new Date(debut), d2 = new Date(fin);
    if (d2 < d1) return;

    const diffDays = Math.ceil(Math.abs(d2 - d1) / 86400000) + 1;
    const total = voiture.prix_base * diffDays;
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
    const resaData = {
        id_voiture: document.getElementById('new-resa-voiture').value,
        nom: document.getElementById('new-resa-nom').value,
        tel: document.getElementById('new-resa-tel').value,
        date_debut: document.getElementById('new-resa-debut').value,
        date_fin: document.getElementById('new-resa-fin').value,
        montant_total: document.getElementById('new-resa-montant').value || 0,
        statut: document.getElementById('new-resa-statut').value,
        paiement_methode: 'espece',
        paiement_montant_declare: document.getElementById('new-resa-paye').value || 0,
        paiement_titulaire: document.getElementById('new-resa-nom').value
    };

    if (!resaData.id_voiture || !resaData.nom || !resaData.date_debut || !resaData.date_fin) {
        return alert("Veuillez remplir tous les champs obligatoires.");
    }

    const { error } = await supabaseClient.from('reservations').insert([resaData]);
    if (error) {
        alert("Erreur lors de la création : " + error.message);
    } else {
        alert("Réservation créée avec succès !");
        toggleNewResaForm();
        loadReservations();
    }
}

async function ouvrirModifResa(id) {
    const resa = reservationsCache.find(r => r.id === id);
    if (resa) {
        document.getElementById('edit-resa-id').value = resa.id;
        document.getElementById('edit-resa-client').innerText = `${resa.nom} (${resa.tel || 'N/A'})`;
        document.getElementById('edit-resa-debut').value = resa.date_debut;
        document.getElementById('edit-resa-fin').value = resa.date_fin;
        document.getElementById('edit-resa-montant').value = resa.montant_total;
        document.getElementById('edit-resa-statut').value = resa.statut;
        document.getElementById('modal-edit-resa').style.display = 'flex';
    }
}

async function sauvegarderModificationResa() {
    const id = document.getElementById('edit-resa-id').value;
    const payload = {
        date_debut: document.getElementById('edit-resa-debut').value,
        date_fin: document.getElementById('edit-resa-fin').value,
        montant_total: document.getElementById('edit-resa-montant').value,
        statut: document.getElementById('edit-resa-statut').value
    };
    const { error } = await supabaseClient.from('reservations').update(payload).eq('id', id);
    if (error) {
        alert("Erreur de mise à jour : " + error.message);
    } else {
        closeModal('modal-edit-resa');
        await loadReservations();
    }
}

async function validerResa(id) {
    const code = document.getElementById('otp-' + id).value;
    if (!code) return alert("Veuillez entrer un code OTP pour valider.");
    await supabaseClient.from('reservations').update({ statut: 'valide', code_otp: code }).eq('id', id);
    await loadReservations();
}

async function annulerResa(id) {
    if (confirm('⚠️ Voulez-vous vraiment supprimer définitivement cette réservation ?')) {
        await supabaseClient.from('reservations').delete().eq('id', id);
        await loadReservations();
    }
}

/* --------------------------------------------------- */
/* --- 4. UTILITAIRES --- */
/* --------------------------------------------------- */

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function exportReservations() {
    const rows = [
        ['ID', 'Client', 'Téléphone', 'Voiture', 'Départ', 'Retour', 'Montant', 'Payé', 'Statut']
    ];
    reservationsCache.forEach((res) => {
        rows.push([
            res.id, res.nom, res.tel || '', res.voitures?.nom || '',
            res.date_debut, res.date_fin, res.montant_total || 0,
            res.paiement_montant_declare || 0, res.statut
        ]);
    });
    const csv = rows.map((row) => row.map((v) => `"${v ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reservations_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// Exposer les fonctions nécessaires au HTML
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
