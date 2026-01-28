/* ---------- INITIALISATION DES VARIABLES GLOBALES ---------- */
let sb = null;
let calendar = null;
let voitureSelectionnee = null;
let currentCarReservations = [];
let currentReservationId = null;
let reductionActive = 0;
let voituresCache = [];
let siteConfig = null;

/**
 * Initialise la connexion à Supabase via le fichier de config
 */
async function initSupabase() {
    if (sb) return;
    const response = await fetch('supabase-config.json');
    if (!response.ok) throw new Error('supabase-config.json introuvable');
    const { supabaseUrl, supabaseKey } = await response.json();
    sb = supabase.createClient(supabaseUrl, supabaseKey);
}

/**
 * Au chargement du document
 */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initSupabase();
        await chargerVoitures();
        bindFiltres();
        await loadSiteConfig();
    } catch (e) {
        console.error("Erreur d'initialisation:", e);
        const container = document.getElementById('container-voitures');
        if (container) container.innerHTML = '<p style="text-align:center;padding:50px;">Erreur de connexion aux données. Veuillez rafraîchir la page.</p>';
    }
});

/* ---------- CONFIGURATION DYNAMIQUE DU SITE ---------- */
async function loadSiteConfig() {
    try {
        const resp = await fetch('site_config.json');
        if (!resp.ok) return;
        siteConfig = await resp.json();
        
        // Remplissage du Header et du Footer (Synchro avec index.html)
        setText('header-site-name', siteConfig.header?.siteName);
        setAttr('header-logo', 'src', siteConfig.header?.logoUrl);
        setText('footer-title', siteConfig.header?.siteName);
        setText('footer-address', siteConfig.footer?.address);
        setText('footer-phone', siteConfig.contact?.phoneDisplay);
        setText('footer-nif', siteConfig.footer?.nif);
        setText('footer-stat', siteConfig.footer?.stat);
        setText('txt-modal-phone', siteConfig.contact?.phoneDisplay);
        
        // Réseaux sociaux du footer
        const socials = document.getElementById('footer-socials');
        if (socials && siteConfig.footer?.socials) {
            socials.innerHTML = '';
            const icons = { facebook: 'fab fa-facebook', instagram: 'fab fa-instagram', tiktok: 'fab fa-tiktok' };
            Object.entries(siteConfig.footer.socials).forEach(([k, url]) => {
                if (url && url !== '#') {
                    socials.innerHTML += `<a href="${url}" target="_blank" style="color:white;margin:0 10px;font-size:1.5rem;"><i class="${icons[k] || 'fas fa-globe'}"></i></a>`;
                }
            });
        }
    } catch (err) { 
        console.log("Configuration site_config.json non chargée, utilisation des valeurs par défaut."); 
    }
}

/* ---------- GESTION DU CATALOGUE DE VOITURES ---------- */
async function chargerVoitures() {
    const container = document.getElementById('container-voitures');
    container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:50px;"><i class="fas fa-spinner fa-spin"></i> Chargement du catalogue...</div>';

    const { data, error } = await sb.from('voitures')
        .select('*')
        .eq('est_public', true)
        .order('prix_base', { ascending: true });
    
    if (error) {
        container.innerHTML = `<p>Erreur lors du chargement : ${error.message}</p>`;
        return;
    }

    voituresCache = data || [];
    remplirFiltresDynamiques(voituresCache);
    renderVoitures(voituresCache);
}

function renderVoitures(list) {
    const container = document.getElementById('container-voitures');
    if (!list.length) {
        container.innerHTML = '<p style="grid-column:1/-1;text-align:center;">Aucun véhicule ne correspond à vos critères.</p>';
        return;
    }

    container.innerHTML = list.map(v => {
        // Logique de réservation : grisé si pas de ref_id
        const estReservable = v.ref_id && v.ref_id.trim() !== "" && v.ref_id !== "null";
        const descriptionCourte = v.description ? v.description.substring(0, 100) + '...' : 'Pas de description disponible.';

        return `
        <article class="carte-voiture ${!estReservable ? 'indisponible' : ''}">
            <div class="badge-status" style="display:${!estReservable ? 'block' : 'none'}">Indisponible</div>
            <img src="${v.image_url || 'https://placehold.co/800x500?text=Image+Indisponible'}" 
                 alt="${v.nom}" 
                 style="${!estReservable ? 'filter: grayscale(1); opacity: 0.6;' : ''}">
            
            <div class="carte-body">
                <h3>${v.nom}</h3>
                <div class="car-tags">
                    <span><i class="fas fa-gas-pump"></i> ${v.carburant || 'N/C'}</span>
                    <span><i class="fas fa-cogs"></i> ${v.transmission || 'Manuelle'}</span>
                    <span><i class="fas fa-user-friends"></i> ${v.places || '5'} places</span>
                </div>
                <p class="carte-desc">${descriptionCourte}</p>
                <p class="prix">${(v.prix_base || 0).toLocaleString('fr-FR')} Ar <small>/ jour</small></p>
                
                <div class="card-actions">
                    ${estReservable ? 
                        `<button class="btn-reserver" onclick="ouvrirReservationDepuisCarte('${v.id}', '${v.nom.replace(/'/g, "\\'")}', ${v.prix_base}, '${v.ref_id}')">RÉSERVER</button>` :
                        `<button class="btn-reserver btn-disabled" disabled>INDISPONIBLE</button>`
                    }
                    <button class="btn-contact" onclick="ouvrirModalContact('${v.id}')"><i class="fab fa-whatsapp"></i> CONTACT</button>
                </div>
            </div>
        </article>
    `}).join('');
}

/* ---------- FILTRES ET TRI ---------- */
function remplirFiltresDynamiques(list) {
    const types = [...new Set(list.map(v => v.type))].filter(Boolean).sort();
    const selectType = document.getElementById('filter-type');
    if (selectType) {
        selectType.innerHTML = '<option value="">Tous les types</option>' + 
                               types.map(t => `<option value="${t}">${t}</option>`).join('');
    }
}

function bindFiltres() {
    const inputs = ['filter-type', 'sort-prix', 'filter-prix-max'];
    inputs.forEach(id => {
        document.getElementById(id)?.addEventListener('change', appliquerFiltres);
        document.getElementById(id)?.addEventListener('input', appliquerFiltres);
    });
}

function appliquerFiltres() {
    const type = document.getElementById('filter-type').value;
    const sort = document.getElementById('sort-prix').value;
    const prixMax = parseInt(document.getElementById('filter-prix-max')?.value) || Infinity;

    let resultat = voituresCache.filter(v => {
        const matchType = !type || v.type === type;
        const matchPrix = (v.prix_base || 0) <= prixMax;
        return matchType && matchPrix;
    });

    if (sort === 'prix-asc') resultat.sort((a, b) => a.prix_base - b.prix_base);
    if (sort === 'prix-desc') resultat.sort((a, b) => b.prix_base - a.prix_base);

    renderVoitures(resultat);
}

/* ---------- PROCESSUS DE RÉSERVATION ---------- */
function ouvrirReservationDepuisCarte(id, nom, prix, ref) {
    // Double sécurité si le bouton n'est pas grisé correctement
    if (!ref || ref === "null" || ref === "") {
        alert("Ce véhicule n'est pas ouvert à la réservation en ligne.");
        return;
    }

    voitureSelectionnee = { id, nom, prix, ref };
    
    // Remplissage des champs cachés et labels
    document.getElementById('nom-voiture-selectionnee').innerText = nom;
    document.getElementById('id-voiture-input').value = id;
    document.getElementById('ref-voiture-input').value = ref;
    document.getElementById('prix-base-input').value = prix;
    
    // Reset du formulaire
    resetFormulaireResa();

    // Affichage et scroll
    document.getElementById('reservation').style.display = 'block';
    document.getElementById('reservation').scrollIntoView({ behavior: 'smooth' });
    
    // Charger les dates indisponibles
    initCalendar(id);
}

function resetFormulaireResa() {
    const fields = ['date-debut', 'date-fin', 'loueur-nom', 'loueur-prenom', 'loueur-tel', 'loueur-cin', 'loueur-adresse'];
    fields.forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ''; });
    document.getElementById('check-conditions-step1').checked = false;
    document.getElementById('prix-total').innerText = '0';
    document.getElementById('prix-acompte').innerText = '0';
    document.getElementById('step-1-actions').style.display = 'block';
    document.getElementById('step-2-paiement').style.display = 'none';
}

/* ---------- CALENDRIER (FULLCALENDAR) ---------- */
async function initCalendar(idVoiture) {
    if (calendar) calendar.destroy();
    
    // Récupération des réservations existantes pour cette voiture
    const { data: resas, error } = await sb.from('reservations')
        .select('date_debut, date_fin')
        .eq('id_voiture', idVoiture)
        .neq('statut', 'annulé');
    
    const events = (resas || []).map(r => ({
        start: r.date_debut,
        end: r.date_fin,
        display: 'background',
        color: '#ff4d4d',
        overlap: false
    }));

    const calendarEl = document.getElementById('calendrier-dispo');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'fr',
        firstDay: 1,
        headerToolbar: { left: 'prev,next', center: 'title', right: '' },
        events: events,
        dateClick: function(info) {
            const dateDebInput = document.getElementById('date-debut');
            const dateFinInput = document.getElementById('date-fin');
            
            if (!dateDebInput.value || (dateDebInput.value && dateFinInput.value)) {
                dateDebInput.value = info.dateStr;
                dateFinInput.value = '';
            } else {
                if (new Date(info.dateStr) < new Date(dateDebInput.value)) {
                    dateDebInput.value = info.dateStr;
                } else {
                    dateFinInput.value = info.dateStr;
                }
            }
            calculerPrix();
        }
    });
    calendar.render();
}

function calculerPrix() {
    const pBase = parseInt(document.getElementById('prix-base-input').value) || 0;
    const d1 = new Date(document.getElementById('date-debut').value);
    const d2 = new Date(document.getElementById('date-fin').value);
    
    if (isNaN(d1) || isNaN(d2) || d2 < d1) return;

    const diffTime = Math.abs(d2 - d1);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    let total = pBase * diffDays;
    
    // Options supplémentaires
    if (document.getElementById('opt-livraison')?.checked) total += 15000;
    if (document.getElementById('opt-recuperation')?.checked) total += 15000;

    document.getElementById('txt-jours').innerText = diffDays;
    document.getElementById('prix-total').innerText = total.toLocaleString('fr-FR');
    document.getElementById('prix-acompte').innerText = Math.round(total / 2).toLocaleString('fr-FR');
}

/* ---------- ENVOI WHATSAPP ET SAUVEGARDE DB ---------- */
async function lancerReservationWhatsApp() {
    if (!document.getElementById('check-conditions-step1').checked) {
        alert("Veuillez accepter les conditions générales.");
        return;
    }

    const payload = {
        id_voiture: document.getElementById('id-voiture-input').value,
        date_debut: document.getElementById('date-debut').value,
        date_fin: document.getElementById('date-fin').value,
        nom: document.getElementById('loueur-nom').value.trim(),
        prenom: document.getElementById('loueur-prenom').value.trim(),
        tel: document.getElementById('loueur-tel').value.trim(),
        cin_passeport: document.getElementById('loueur-cin').value.trim(),
        adresse: document.getElementById('loueur-adresse').value.trim(),
        montant_total: parseInt(document.getElementById('prix-total').innerText.replace(/\s/g, '')),
        statut: 'en_attente'
    };

    if (!payload.nom || !payload.tel || !payload.date_debut || !payload.date_fin) {
        alert("Veuillez remplir toutes les informations client et choisir vos dates.");
        return;
    }

    // 1. OUVERTURE WHATSAPP IMMÉDIATE (ANTI-LATENCE)
    const waNumber = siteConfig?.contact?.whatsapp?.replace(/\D/g, '') || '261388552432';
    const message = `Bonjour Rija, je souhaite réserver : ${voitureSelectionnee.nom} (Ref: ${voitureSelectionnee.ref}).\n` +
                    `Dates : du ${payload.date_debut} au ${payload.date_fin}\n` +
                    `Client : ${payload.nom} ${payload.prenom}\n` +
                    `Montant total : ${payload.montant_total.toLocaleString()} Ar.`;
    
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`, '_blank');

    // 2. ENREGISTREMENT DB EN ARRIÈRE-PLAN
    const { data, error } = await sb.from('reservations').insert([payload]).select();
    
    if (error) {
        console.error("Erreur Supabase:", error.message);
    } else {
        currentReservationId = data[0].id;
        document.getElementById('step-1-actions').style.display = 'none';
        document.getElementById('step-2-paiement').style.display = 'block';
        document.getElementById('step-2-paiement').scrollIntoView({ behavior: 'smooth' });
    }
}

/* ---------- MODAL CONTACT (WHATSAPP DIRECT) ---------- */
function ouvrirModalContact(idVoiture) {
    const v = voituresCache.find(car => car.id == idVoiture);
    if (!v) return;
    
    document.getElementById('contact-car-name').innerText = v.nom;
    document.getElementById('modal-contact-only').style.display = 'flex';
    
    const waNumber = siteConfig?.contact?.whatsapp?.replace(/\D/g, '') || '261388552432';
    const text = `Bonjour, je souhaiterais avoir des renseignements sur le véhicule : ${v.nom}`;
    document.getElementById('btn-modal-wa').href = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
    
    if (siteConfig?.contact?.phoneCall) {
        document.getElementById('btn-modal-call').href = `tel:${siteConfig.contact.phoneCall}`;
    }
}

function closeContactModal() {
    document.getElementById('modal-contact-only').style.display = 'none';
}

/* ---------- MODAL CONDITIONS (FLIP CARDS DYNAMIQUES) ---------- */
async function ouvrirModalConditions() {
    const modal = document.getElementById('modal-conditions');
    const container = modal.querySelector('.conditions-scroll-box');
    modal.style.display = 'flex';
    container.innerHTML = '<p style="text-align:center;">Chargement des conditions...</p>';

    try {
        const resp = await fetch('conditions.json');
        const conditions = await resp.json();

        container.innerHTML = `
            <div class="features-container" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:20px;">
                ${conditions.map(c => `
                    <div class="flip-card" onclick="this.classList.toggle('flipped')" style="height:180px;">
                        <div class="flip-card-inner">
                            <div class="flip-card-front" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:15px; text-align:center;">
                                <i class="${c.icon}" style="font-size:2.5rem; color:var(--primary); margin-bottom:15px;"></i>
                                <h4 style="font-size:1.1rem;">${c.title}</h4>
                                <small style="margin-top:10px; color:#888;">Cliquez pour lire</small>
                            </div>
                            <div class="flip-card-back" style="display:flex; align-items:center; justify-content:center; padding:20px; text-align:center; font-size:0.9rem; background:#f8fafc;">
                                <p>${c.details}</p>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (e) {
        container.innerHTML = "<p>Erreur lors du chargement des conditions générales.</p>";
    }
}

function fermerModalConditions() {
    document.getElementById('modal-conditions').style.display = 'none';
}

/* ---------- FONCTIONS UTILITAIRES ---------- */
function toggleMenu() {
    document.getElementById('nav-menu').classList.toggle('active');
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val || '';
}

function setAttr(id, attr, val) {
    const el = document.getElementById(id);
    if (el) el.setAttribute(attr, val || '');
}

function togglePaymentFields() {
    const method = document.getElementById('pay-method').value;
    const mvola = document.getElementById('fields-mvola');
    const espece = document.getElementById('fields-espece');
    
    if (mvola) mvola.style.display = method === 'mvola' ? 'block' : 'none';
    if (espece) espece.style.display = method === 'espece' ? 'block' : 'none';
}
