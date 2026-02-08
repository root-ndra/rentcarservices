let sb = null;
let voituresCache = [];

/**
 * Initialisation de Supabase
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
 * Charge les voitures depuis la base de données
 */
async function chargerCatalogue() {
    const { data, error } = await sb.from('voitures').select('*').eq('est_public', true);
    
    if (error) {
        console.error("Erreur de chargement des voitures:", error);
        return;
    }

    voituresCache = data;
    const container = document.getElementById('container-voitures');
    container.innerHTML = "";

    data.forEach(v => {
        // On vérifie les booléens (format texte ou booléen selon Supabase)
        const estReservable = (v.reservable === true || v.reservable === "true");
        const aChauffeur = (v.chauffeur_option === "true" || v.chauffeur_option === true);

        const card = `
            <div class="car-card">
                <img src="${v.image_url}" class="car-image">
                <div class="car-body" style="padding: 20px;">
                    ${aChauffeur ? `<div class="badge-chauffeur" style="background:#fff3cd; color:#856404; padding:5px 10px; border-radius:15px; display:inline-block; font-size:0.8rem; margin-bottom:10px;">Chauffeur inclus</div>` : ''}
                    <h3 style="margin: 0 0 10px 0;">${v.nom}</h3>
                    
                    <div style="font-size: 0.9rem; color: #64748b; margin-bottom: 10px;">
                        <i class="fas fa-car"></i> ${v.type || 'N/C'} | 
                        <i class="fas fa-users"></i> ${v.places || '5'} places | 
                        <i class="fas fa-gas-pump"></i> ${v.carburant || 'N/C'}
                    </div>

                    <p style="font-size: 0.85rem; color: #94a3b8; height: 40px; overflow: hidden;">${v.description || ''}</p>

                    <p style="font-size: 1.4rem; font-weight: bold; color: #3498db; margin: 15px 0;">
                        ${v.prix_base.toLocaleString()} Ar <span style="font-size:0.9rem; color:#64748b;">/ jour</span>
                    </p>

                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${estReservable ? 
                            `<button class="btn-reserver" onclick="ouvrirReservation('${v.id}', '${v.nom}', ${v.prix_base})">RÉSERVER</button>` : 
                            `<button class="btn-reserver btn-disabled" disabled>NON DISPONIBLE</button>`
                        }
                        <button class="btn-contact" onclick="ouvrirModalContact('${v.id}')">CONTACTER</button>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += card;
    });
}

/**
 * REDIRECTION VERS LA PAGE RESERVATION
 */
function ouvrirReservation(id, nom, prix) {
    // On construit l'URL avec les paramètres pour la page reservations.html
    const url = `reservations.html?id=${id}&nom=${encodeURIComponent(nom)}&prix=${prix}`;
    
    // Redirection
    window.location.href = url;
}

/**
 * MODALE CONTACT
 */
function ouvrirModalContact(id) {
    const v = voituresCache.find(car => car.id == id);
    if(v) document.getElementById('contact-car-name').innerText = v.nom;
    document.getElementById('modal-contact-only').style.display = 'flex';
}

function closeContactModal() {
    document.getElementById('modal-contact-only').style.display = 'none';
}
