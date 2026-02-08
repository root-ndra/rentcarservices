let sb = null;
let calendar = null;
let voituresCache = [];

/**
 * Initialisation Supabase
 */
async function initSupabase() {
    const response = await fetch('supabase-config.json');
    const { supabaseUrl, supabaseKey } = await response.json();
    sb = supabase.createClient(supabaseUrl, supabaseKey);
}

document.addEventListener('DOMContentLoaded', async () => {
    await initSupabase();
    await chargerCatalogue();
});

/**
 * Charge les voitures et les affiche
 */
async function chargerCatalogue() {
    const { data, error } = await sb.from('voitures').select('*').eq('est_public', true);
    if (error) return;

    voituresCache = data;
    const container = document.getElementById('container-voitures');
    container.innerHTML = "";

    data.forEach(v => {
        const estReservable = (v.reservable === true || v.reservable === "true");
        const aChauffeur = (v.chauffeur_option === "true" || v.chauffeur_option === true);

        // Badge Chauffeur
        const badgeChauffeur = aChauffeur ? `<div class="badge-chauffeur"><i class="fas fa-user-tie"></i> Chauffeur inclus (Frais inclus)</div>` : '';

        const card = `
            <div class="car-card">
                <img src="${v.image_url}" class="car-image">
                <div class="car-body">
                    ${badgeChauffeur}
                    <h3>${v.nom}</h3>
                    <p class="prix">${v.prix_base.toLocaleString()} Ar / jour</p>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${estReservable ? 
                            `<button class="btn-reserver" onclick="ouvrirReservation('${v.id}', '${v.nom}', ${v.prix_base})">RÉSERVER</button>` :
                            `<button class="btn-reserver btn-disabled" disabled>INDISPONIBLE</button>`
                        }
                        <button class="btn-contact" onclick="ouvrirModalContact('${v.id}')">CONTACTEZ-NOUS</button>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += card;
    });
}

/**
 * MODALE CONTACT (Correction de l'affichage)
 */
function ouvrirModalContact(idVoiture) {
    const v = voituresCache.find(car => car.id == idVoiture);
    if (!v) return;

    document.getElementById('contact-car-name').innerText = v.nom;
    const modal = document.getElementById('modal-contact-only');
    modal.style.display = 'flex'; // Force l'affichage
}

function closeContactModal() {
    document.getElementById('modal-contact-only').style.display = 'none';
}

/**
 * CALENDRIER (Correction : Débloque la sélection de dates)
 */
function ouvrirReservation(id, nom, prix) {
    document.getElementById('reservation').style.display = 'block';
    document.getElementById('nom-voiture-selectionnee').innerText = nom;
    document.getElementById('id-voiture-input').value = id;
    document.getElementById('prix-base-input').value = prix;

    document.getElementById('reservation').scrollIntoView({ behavior: 'smooth' });

    initCalendar(id);
}

function initCalendar(idVoiture) {
    const calendarEl = document.getElementById('calendrier-dispo');
    if (calendar) calendar.destroy();

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'fr',
        selectable: true, // PERMET DE SÉLECTIONNER DES PLAGES DE DATES LIBREMENT
        selectMirror: true,
        unselectAuto: false,
        select: function(info) {
            // Remplit les champs date
            document.getElementById('date-debut').value = info.startStr;
            
            // FullCalendar met la fin au lendemain 00h, on retire 1 jour pour l'affichage
            let fin = new Date(info.end);
            fin.setDate(fin.getDate() - 1);
            document.getElementById('date-fin').value = fin.toISOString().split('T')[0];
            
            calculerPrixTotal();
        }
    });
    calendar.render();
}

function calculerPrixTotal() {
    const prixBase = parseInt(document.getElementById('prix-base-input').value);
    const d1 = new Date(document.getElementById('date-debut').value);
    const d2 = new Date(document.getElementById('date-fin').value);

    if (d1 && d2 && d2 >= d1) {
        const diff = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
        document.getElementById('txt-jours').innerText = diff;
        document.getElementById('prix-total').innerText = (diff * prixBase).toLocaleString();
    }
}
