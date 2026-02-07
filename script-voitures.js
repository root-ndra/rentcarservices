/* ---------- INITIALISATION & VARIABLES ---------- */
let sb = null;
let calendar = null;
let voitureSelectionnee = null;
let reductionPourcentage = 0;

async function initSupabase() {
    if (sb) return;
    const response = await fetch('supabase-config.json');
    const { supabaseUrl, supabaseKey } = await response.json();
    sb = supabase.createClient(supabaseUrl, supabaseKey);
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initSupabase();
        await loadSiteConfig();

        // CAS 1 : On est sur la page CATALOGUE
        if (document.getElementById('container-voitures')) {
            await chargerVoitures();
            bindFiltres();
        }

        // CAS 2 : On est sur la page RESERVATION
        const params = new URLSearchParams(window.location.search);
        const carId = params.get('id');
        if (carId && document.getElementById('form-reservation')) {
            chargerDetailsReservation(carId);
        }

    } catch (e) {
        console.error("Erreur d'initialisation:", e);
    }
});

/* ---------- LOGIQUE CATALOGUE (voitures.html) ---------- */
async function chargerVoitures() {
    const { data, error } = await sb.from('voitures').select('*').eq('est_public', true);
    if (error) return;
    renderVoitures(data);
}

function renderVoitures(liste) {
    const container = document.getElementById('container-voitures');
    container.innerHTML = liste.map(v => `
        <div class="car-card">
            <img src="${v.image_url}" class="car-image">
            <div class="car-info">
                <h3>${v.nom}</h3>
                <p class="car-price">${v.prix_base.toLocaleString()} Ar / jour</p>
                <button class="btn-reserver" onclick="window.location.href='reservations.html?id=${v.id}'">
                    Réserver ce véhicule
                </button>
            </div>
        </div>
    `).join('');
}

/* ---------- LOGIQUE FORMULAIRE (reservations.html) ---------- */
async function chargerDetailsReservation(id) {
    const { data: v, error } = await sb.from('voitures').select('*').eq('id', id).single();
    if (error || !v) return;

    voitureSelectionnee = v;
    document.getElementById('nom-voiture-selectionnee').innerText = v.nom;
    document.getElementById('id-voiture-input').value = v.id;
    document.getElementById('prix-base-input').value = v.prix_base;

    initCalendrier(v.id);
}

function initCalendrier(carId) {
    const calendarEl = document.getElementById('calendrier-dispo');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'fr',
        selectable: true,
        select: (info) => {
            document.getElementById('date-debut').value = info.startStr;
            // On retire 1 jour à la fin car FullCalendar exclus le dernier jour de la sélection
            let endDate = new Date(info.end);
            endDate.setDate(endDate.getDate() - 1);
            document.getElementById('date-fin').value = endDate.toISOString().split('T')[0];
            calculerPrix();
        }
    });
    calendar.render();
}

function toggleLivraisonFields() {
    const display = document.getElementById('opt-livraison').checked ? 'block' : 'none';
    document.getElementById('livraison-details').style.display = display;
    calculerPrix();
}

function appliquerCodePromo() {
    const code = document.getElementById('code-promo').value.toUpperCase();
    const msg = document.getElementById('promo-msg');
    if (code === "RENT10") {
        reductionPourcentage = 10;
        msg.innerHTML = "<small style='color:green'>Promo -10% activée</small>";
    } else {
        reductionPourcentage = 0;
        msg.innerHTML = "<small style='color:red'>Code invalide</small>";
    }
    calculerPrix();
}

function calculerPrix() {
    const pBase = parseInt(document.getElementById('prix-base-input').value) || 0;
    const d1 = new Date(document.getElementById('date-debut').value);
    const d2 = new Date(document.getElementById('date-fin').value);

    if (isNaN(d1) || isNaN(d2)) return;

    const jours = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
    let total = pBase * jours;

    if (document.getElementById('opt-livraison').checked) total += 15000;
    if (document.getElementById('opt-recuperation')?.checked) total += 15000;

    if (reductionPourcentage > 0) total = total * (1 - reductionPourcentage / 100);

    document.getElementById('txt-jours').innerText = jours;
    document.getElementById('prix-total').innerText = Math.round(total).toLocaleString();
    document.getElementById('prix-acompte').innerText = Math.round(total / 2).toLocaleString();
}

async function lancerReservationWhatsApp() {
    if (!document.getElementById('check-conditions-step1').checked) return alert("Acceptez les conditions.");

    const nom = document.getElementById('loueur-nom').value;
    const tel = document.getElementById('loueur-tel').value;
    const debut = document.getElementById('date-debut').value;
    const fin = document.getElementById('date-fin').value;

    if (!nom || !tel || !debut) return alert("Veuillez remplir les informations de contact et les dates.");

    const totalStr = document.getElementById('prix-total').innerText;
    
    // Construction du message
    let msg = `*RÉSERVATION EN COURS*\n`;
    msg += `🚗 Véhicule : ${voitureSelectionnee.nom}\n`;
    msg += `📅 Dates : Du ${debut} au ${fin}\n`;
    msg += `👤 Client : ${nom} ${document.getElementById('loueur-prenom').value}\n`;
    msg += `📄 CIN/Permis : ${document.getElementById('loueur-cin').value}\n`;
    msg += `📞 Tél : ${tel}\n`;
    msg += `🆘 Urgence : ${document.getElementById('urgence-nom').value} (${document.getElementById('urgence-tel').value})\n`;
    msg += `💰 *TOTAL : ${totalStr} Ar*`;

    const waNumber = "261325264535"; // Ton numéro WhatsApp
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ---------- CONFIG SITE (FOOTER/HEADER) ---------- */
async function loadSiteConfig() {
    const resp = await fetch('site_config.json');
    const config = await resp.json();
    document.getElementById('header-site-name').innerText = config.header.siteName;
    document.getElementById('header-logo').src = config.header.logoUrl;
    if (document.getElementById('footer-address')) {
        document.getElementById('footer-address').innerText = config.footer.address;
    }
}
