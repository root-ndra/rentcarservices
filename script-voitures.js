/* ---------- VARIABLES GLOBALES ---------- */
let sb = null;
let calendar = null;
let voitureSelectionnee = null;
let reductionPourcentage = 0;

/* ---------- INITIALISATION SUPABASE ---------- */
async function initSupabase() {
    if (sb) return;
    const response = await fetch('supabase-config.json');
    const { supabaseUrl, supabaseKey } = await response.json();
    sb = supabase.createClient(supabaseUrl, supabaseKey);
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initSupabase();

        // 1. SI ON EST SUR LE CATALOGUE (voitures.html)
        if (document.getElementById('container-voitures')) {
            chargerCatalogue();
        }

        // 2. SI ON EST SUR LA RESERVATION (reservations.html)
        const params = new URLSearchParams(window.location.search);
        const carId = params.get('id');
        if (carId && document.getElementById('form-reservation')) {
            chargerPageReservation(carId);
        }

    } catch (e) {
        console.error("Erreur d'initialisation :", e);
    }
});

/* ---------- LOGIQUE CATALOGUE ---------- */
async function chargerCatalogue() {
    const { data, error } = await sb.from('voitures').select('*').eq('est_public', true);
    if (error) return;

    const container = document.getElementById('container-voitures');
    container.innerHTML = data.map(v => {
        // Logique "Reservable" demandée
        let reserverBtn = "";
        let contactAction = "ouvrirModalContact()"; // Par défaut ouvre la modale contact

        if (v.reservable) {
            reserverBtn = `<button class="btn-reserver" onclick="window.location.href='reservations.html?id=${v.id}'">Réserver ce véhicule</button>`;
        } else {
            reserverBtn = `<button class="btn-reserver btn-disabled" disabled>Indisponible</button>`;
        }

        return `
            <div class="car-card">
                <img src="${v.image_url}" class="car-image">
                <div class="car-info">
                    <h3>${v.nom}</h3>
                    <p class="car-price">${v.prix_base.toLocaleString()} Ar / jour</p>
                    <div class="card-buttons">
                        ${reserverBtn}
                        <button class="btn-contact-green" onclick="${contactAction}">Contactez-nous</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/* ---------- LOGIQUE PAGE RÉSERVATION ---------- */
async function chargerPageReservation(id) {
    const { data: v, error } = await sb.from('voitures').select('*').eq('id', id).single();
    if (error || !v) {
        alert("Véhicule introuvable.");
        window.location.href = 'voitures.html';
        return;
    }

    voitureSelectionnee = v;
    document.getElementById('nom-voiture-selectionnee').innerText = v.nom;
    document.getElementById('id-voiture-input').value = v.id;
    document.getElementById('prix-base-input').value = v.prix_base;

    initCalendrier();
}

/* ---------- FIX CALENDRIER SÉLECTION ---------- */
function initCalendrier() {
    const calendarEl = document.getElementById('calendrier-dispo');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'fr',
        selectable: true,
        unselectAuto: false,
        headerToolbar: { left: 'prev,next', center: 'title', right: '' },
        select: function(info) {
            // Remplir les champs
            document.getElementById('date-debut').value = info.startStr;
            
            // Fix date de fin (soustraire un jour car exclusif)
            let endDate = new Date(info.end);
            endDate.setDate(endDate.getDate() - 1);
            document.getElementById('date-fin').value = endDate.toISOString().split('T')[0];
            
            calculerPrix();
        }
    });
    calendar.render();
}

/* ---------- CALCULS ET PROMO ---------- */
function toggleLivraisonFields() {
    const isChecked = document.getElementById('opt-livraison').checked;
    document.getElementById('livraison-details').style.display = isChecked ? 'block' : 'none';
    calculerPrix();
}

function appliquerCodePromo() {
    const code = document.getElementById('code-promo').value.trim().toUpperCase();
    const msg = document.getElementById('promo-msg');
    
    // Exemple de code
    if (code === "RENT2024") {
        reductionPourcentage = 10;
        msg.innerHTML = "<small style='color:green'>Félicitations ! -10% appliqué.</small>";
    } else {
        reductionPourcentage = 0;
        msg.innerHTML = "<small style='color:red'>Code promo invalide.</small>";
    }
    calculerPrix();
}

function calculerPrix() {
    const pBase = parseInt(document.getElementById('prix-base-input').value) || 0;
    const d1 = new Date(document.getElementById('date-debut').value);
    const d2 = new Date(document.getElementById('date-fin').value);

    if (isNaN(d1) || isNaN(d2)) return;

    // Calcul des jours (minimum 1)
    const diffTime = Math.abs(d2 - d1);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    let total = pBase * diffDays;

    // Options
    if (document.getElementById('opt-livraison').checked) total += 15000;
    if (document.getElementById('opt-recuperation').checked) total += 15000;

    // Promo
    if (reductionPourcentage > 0) {
        total = total * (1 - (reductionPourcentage / 100));
    }

    document.getElementById('txt-jours').innerText = diffDays;
    document.getElementById('prix-total').innerText = Math.round(total).toLocaleString();
    document.getElementById('prix-acompte').innerText = Math.round(total / 2).toLocaleString();
}

/* ---------- MODALE CONDITIONS ---------- */
function ouvrirModalConditions() {
    document.getElementById('modal-conditions').style.display = 'flex';
}
function fermerModalConditions() {
    document.getElementById('modal-conditions').style.display = 'none';
}

/* ---------- ENVOI WHATSAPP ---------- */
async function lancerReservationWhatsApp() {
    const check = document.getElementById('check-conditions-step1').checked;
    if (!check) {
        alert("Vous devez accepter les conditions de location.");
        return;
    }

    const nom = document.getElementById('loueur-nom').value;
    const prenom = document.getElementById('loueur-prenom').value;
    const tel = document.getElementById('loueur-tel').value;
    const debut = document.getElementById('date-debut').value;
    const fin = document.getElementById('date-fin').value;
    const total = document.getElementById('prix-total').innerText;

    if (!debut || !nom || !tel) {
        alert("Veuillez remplir les informations obligatoires.");
        return;
    }

    // Construction du message WhatsApp
    let texte = `*NOUVELLE RÉSERVATION*\n`;
    texte += `🚗 *Véhicule :* ${voitureSelectionnee.nom}\n`;
    texte += `📅 *Dates :* Du ${debut} au ${fin}\n`;
    texte += `👤 *Client :* ${prenom} ${nom}\n`;
    texte += `📞 *WhatsApp :* ${tel}\n`;
    texte += `📄 *CIN/Permis :* ${document.getElementById('loueur-cin').value}\n`;
    texte += `🆘 *Urgence :* ${document.getElementById('urgence-nom').value} (${document.getElementById('urgence-tel').value})\n`;
    texte += `💰 *TOTAL : ${total} Ar*\n`;
    
    const waNumber = "261325264535"; // Votre numéro
    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(texte)}`;
    window.open(url, '_blank');
}
