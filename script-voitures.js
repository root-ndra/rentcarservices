/* ---------- INITIALISATION ---------- */
let sb = null;
let calendar = null;
let voitureSelectionnee = null;
let currentCarReservations = [];
let currentReservationId = null;
let reductionActive = 0;
let voituresCache = [];
let siteConfig = null;

async function initSupabase() {
    if (sb) return;
    const response = await fetch('supabase-config.json');
    if (!response.ok) throw new Error('supabase-config.json introuvable');
    const { supabaseUrl, supabaseKey } = await response.json();
    sb = supabase.createClient(supabaseUrl, supabaseKey);
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initSupabase();
        await chargerVoitures();
        bindFiltres();
        await loadSiteConfig();
    } catch (e) {
        console.error(e);
        const container = document.getElementById('container-voitures');
        if (container) container.innerHTML = '<p>Erreur de connexion aux données.</p>';
    }
});

/* ---------- CONFIGURATION SITE (HEADER/FOOTER) ---------- */
async function loadSiteConfig() {
    try {
        const resp = await fetch('site_config.json');
        if (!resp.ok) return;
        siteConfig = await resp.json();
        
        // Synchro avec les IDs de l'index
        setText('header-site-name', siteConfig.header?.siteName);
        setAttr('header-logo', 'src', siteConfig.header?.logoUrl);
        setText('footer-title', siteConfig.header?.siteName);
        setText('footer-address', siteConfig.footer?.address);
        setText('footer-phone', siteConfig.contact?.phoneDisplay);
        setText('footer-nif', siteConfig.footer?.nif);
        setText('footer-stat', siteConfig.footer?.stat);
        
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
    } catch (err) { console.log("Site config non chargé."); }
}

/* ---------- CATALOGUE & FILTRES ---------- */
async function chargerVoitures() {
    const container = document.getElementById('container-voitures');
    container.innerHTML = '<div class="loading">Chargement du catalogue...</div>';

    const { data, error } = await sb.from('voitures')
        .select('*')
        .eq('est_public', true)
        .order('prix_base');
    
    if (error) {
        container.innerHTML = `<p>Erreur : ${error.message}</p>`;
        return;
    }

    voituresCache = data || [];
    remplirFiltres(voituresCache);
    renderVoitures(voituresCache);
}

function renderVoitures(list) {
    const container = document.getElementById('container-voitures');
    if (!list.length) {
        container.innerHTML = '<p>Aucun véhicule trouvé.</p>';
        return;
    }

    container.innerHTML = list.map(v => `
        <article class="carte-voiture">
            <img src="${v.image_url || 'https://placehold.co/800x500'}" alt="${v.nom}">
            <div class="carte-body">
                <h3>${v.nom}</h3>
                <div class="car-tags">
                    <span><i class="fas fa-gas-pump"></i> ${v.carburant || '—'}</span>
                    <span><i class="fas fa-user-friends"></i> ${v.places || '—'} pl.</span>
                </div>
                <p class="prix">${(v.prix_base || 0).toLocaleString()} Ar / jour</p>
                <div class="card-actions">
                    <button class="btn-reserver" onclick="ouvrirReservationDepuisCarte('${v.id}', '${v.nom.replace(/'/g, "\\'")}', ${v.prix_base}, '${v.ref_id}')">RÉSERVER</button>
                </div>
            </div>
        </article>
    `).join('');
}

function remplirFiltres(list) {
    const types = [...new Set(list.map(v => v.type))].filter(Boolean);
    const sel = document.getElementById('filter-type');
    if(sel) {
        sel.innerHTML = '<option value="">Tous les types</option>' + 
                        types.map(t => `<option value="${t}">${t}</option>`).join('');
    }
}

function bindFiltres() {
    ['filter-type', 'sort-prix'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', appliquerFiltres);
    });
}

function appliquerFiltres() {
    const type = document.getElementById('filter-type').value;
    const sort = document.getElementById('sort-prix').value;

    let res = voituresCache.filter(v => !type || v.type === type);
    res.sort((a, b) => sort === 'prix-desc' ? b.prix_base - a.prix_base : a.prix_base - b.prix_base);
    renderVoitures(res);
}

/* ---------- RÉSERVATION & CALENDRIER ---------- */
function ouvrirReservationDepuisCarte(id, nom, prix, ref) {
    voitureSelectionnee = { id, nom, prix, ref };
    document.getElementById('nom-voiture-selectionnee').innerText = nom;
    document.getElementById('id-voiture-input').value = id;
    document.getElementById('prix-base-input').value = prix;
    
    document.getElementById('reservation').style.display = 'block';
    document.getElementById('reservation').scrollIntoView({ behavior: 'smooth' });
    initCalendar(id);
}

async function initCalendar(idVoiture) {
    if (calendar) calendar.destroy();
    const { data: resas } = await sb.from('reservations').select('date_debut, date_fin').eq('id_voiture', idVoiture);
    
    const events = (resas || []).map(r => ({
        start: r.date_debut,
        end: r.date_fin,
        display: 'background',
        color: '#ff4d4d'
    }));

    calendar = new FullCalendar.Calendar(document.getElementById('calendrier-dispo'), {
        initialView: 'dayGridMonth',
        locale: 'fr',
        events: events,
        dateClick: (info) => {
            const deb = document.getElementById('date-debut');
            const fin = document.getElementById('date-fin');
            if (!deb.value) deb.value = info.dateStr;
            else if (!fin.value) fin.value = info.dateStr;
            else { deb.value = info.dateStr; fin.value = ''; }
            calculerPrix();
        }
    });
    calendar.render();
}

function calculerPrix() {
    const pBase = parseInt(document.getElementById('prix-base-input').value);
    const d1 = new Date(document.getElementById('date-debut').value);
    const d2 = new Date(document.getElementById('date-fin').value);
    
    if (isNaN(d1) || isNaN(d2) || d2 < d1) return;

    const jours = Math.ceil((d2 - d1) / (1000*60*60*24)) + 1;
    let total = pBase * jours;
    
    if (document.getElementById('opt-livraison').checked) total += 15000;
    
    document.getElementById('txt-jours').innerText = jours;
    document.getElementById('prix-total').innerText = total.toLocaleString();
    document.getElementById('prix-acompte').innerText = Math.round(total/2).toLocaleString();
}

/* ---------- WHATSAPP & DB (CORRECTED) ---------- */
async function lancerReservationWhatsApp() {
    if (!document.getElementById('check-conditions-step1').checked) {
        alert("Veuillez accepter les conditions."); return;
    }

    const payload = {
        id_voiture: document.getElementById('id-voiture-input').value,
        date_debut: document.getElementById('date-debut').value,
        date_fin: document.getElementById('date-fin').value,
        nom: document.getElementById('loueur-nom').value,
        prenom: document.getElementById('loueur-prenom').value,
        tel: document.getElementById('loueur-tel').value,
        cin_passeport: document.getElementById('loueur-cin').value,
        montant_total: parseInt(document.getElementById('prix-total').innerText.replace(/\s/g, '')),
        statut: 'en_attente'
        // TEL2 EST SUPPRIMÉ ICI POUR ÉVITER L'ERREUR SQL
    };

    const { data, error } = await sb.from('reservations').insert([payload]).select();
    
    if (error) {
        alert("Erreur base de données : " + error.message);
    } else {
        currentReservationId = data[0].id;
        const msg = `Bonjour, réservation #${currentReservationId} pour ${payload.nom} ${payload.prenom}. Voiture: ${voitureSelectionnee.nom}. Dates: ${payload.date_debut} au ${payload.date_fin}.`;
        window.open(`https://wa.me/261388552432?text=${encodeURIComponent(msg)}`, '_blank');
        
        document.getElementById('step-1-actions').style.display = 'none';
        document.getElementById('step-2-paiement').style.display = 'block';
    }
}

/* ---------- MODAL CONDITIONS (FLIP CARDS) ---------- */
async function ouvrirModalConditions() {
    const modal = document.getElementById('modal-conditions');
    const container = modal.querySelector('.conditions-scroll-box');
    modal.style.display = 'flex';
    container.innerHTML = '<p>Chargement...</p>';

    try {
        const resp = await fetch('conditions.json');
        const conditions = await resp.json();

        container.innerHTML = `
            <div class="features-container" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:20px;">
                ${conditions.map(c => `
                    <div class="flip-card" onclick="this.classList.toggle('flipped')" style="height:160px;">
                        <div class="flip-card-inner">
                            <div class="flip-card-front">
                                <i class="${c.icon}" style="font-size:2rem; color:var(--primary);"></i>
                                <h4>${c.title}</h4>
                                <p style="font-size:0.7rem; margin-top:5px;">Cliquez pour voir</p>
                            </div>
                            <div class="flip-card-back" style="padding:15px; font-size:0.85rem; display:flex; align-items:center;">
                                <p>${c.details}</p>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (e) {
        container.innerHTML = "Erreur de chargement des conditions.";
    }
}

/* ---------- UTILS ---------- */
function toggleMenu() { document.getElementById('nav-menu').classList.toggle('active'); }
function setText(id, t) { const e = document.getElementById(id); if(e) e.innerText = t || ''; }
function setAttr(id, a, v) { const e = document.getElementById(id); if(e) e.setAttribute(a, v || ''); }
function fermerModalConditions() { document.getElementById('modal-conditions').style.display = 'none'; }
function togglePaymentFields() {
    const m = document.getElementById('pay-method').value;
    document.getElementById('fields-mvola').style.display = m === 'mvola' ? 'block' : 'none';
    document.getElementById('fields-espece').style.display = m === 'espece' ? 'block' : 'none';
}
