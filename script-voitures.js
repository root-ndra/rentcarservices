let sb = null;
let voituresCache = [];

/**
 * 1. Initialisation de Supabase
 */
async function initSupabase() {
    try {
        const response = await fetch('supabase-config.json');
        if (!response.ok) throw new Error('Fichier de configuration introuvable');
        const { supabaseUrl, supabaseKey } = await response.json();
        sb = supabase.createClient(supabaseUrl, supabaseKey);
    } catch (error) {
        console.error("Erreur d'initialisation Supabase:", error);
    }
}

/**
 * 2. Lancement au chargement de la page
 */
document.addEventListener('DOMContentLoaded', async () => {
    await initSupabase();
    if (sb) {
        await chargerCatalogue();
    }
});

/**
 * 3. Chargement et affichage des voitures
 */
async function chargerCatalogue() {
    const container = document.getElementById('container-voitures');
    if (!container) return;

    // Récupération des voitures publiques uniquement
    const { data, error } = await sb
        .from('voitures')
        .select('*')
        .eq('est_public', true)
        .order('nom', { ascending: true });

    if (error) {
        console.error("Erreur lors du chargement des voitures:", error);
        container.innerHTML = "<p>Erreur lors du chargement des véhicules.</p>";
        return;
    }

    voituresCache = data;
    container.innerHTML = ""; // On vide le conteneur

    if (data.length === 0) {
        container.innerHTML = "<p>Aucun véhicule disponible pour le moment.</p>";
        return;
    }

    data.forEach(v => {
        // Vérification de l'option chauffeur (gère booléen ou texte)
        const aChauffeur = (v.chauffeur_option === true || v.chauffeur_option === "true");
        const estReservable = (v.reservable === true || v.reservable === "true");

        // Construction de la carte HTML
        const card = `
            <div class="car-card">
                <div class="car-image-container">
                    <img src="${v.image_url || 'https://via.placeholder.com/400x250?text=Image+indisponible'}" 
                         alt="${v.nom}" class="car-image">
                </div>
                
                <div class="car-body" style="padding: 20px;">
                    <div style="margin-bottom: 12px;">
                        ${aChauffeur 
                            ? `<span class="badge-chauffeur" style="background: #dcfce7; color: #166534; padding: 5px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: bold; border: 1px solid #bbf7d0;">
                                <i class="fas fa-user-tie"></i> Avec chauffeur
                               </span>`
                            : `<span class="badge-chauffeur" style="background: #f1f5f9; color: #475569; padding: 5px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: bold; border: 1px solid #e2e8f0;">
                                <i class="fas fa-car"></i> Sans chauffeur
                               </span>`
                        }
                    </div>

                    <h3 style="margin: 0 0 10px 0; color: #1e293b;">${v.nom}</h3>
                    
                    <div class="car-specs" style="display: flex; gap: 15px; font-size: 0.85rem; color: #64748b; margin-bottom: 15px;">
                        <span><i class="fas fa-users"></i> ${v.places || 5} places</span>
                        <span><i class="fas fa-gas-pump"></i> ${v.carburant || 'N/C'}</span>
                        <span><i class="fas fa-cog"></i> ${v.transmission || 'Manuelle'}</span>
                    </div>

                    <p style="font-size: 0.9rem; color: #475569; line-height: 1.4; height: 40px; overflow: hidden; margin-bottom: 15px;">
                        ${v.description || 'Pas de description disponible.'}
                    </p>

                    <div class="car-footer" style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9; pt: 15px; padding-top: 15px;">
                        <div class="price">
                            <span style="font-size: 1.25rem; font-weight: bold; color: #2563eb;">${v.prix_base.toLocaleString()} Ar</span>
                            <span style="font-size: 0.8rem; color: #64748b;">/jour</span>
                        </div>
                        
                        <div style="display: flex; gap: 8px;">
                             ${estReservable 
                                ? `<button class="btn-reserver" onclick="ouvrirReservation('${v.id}', '${v.nom}', ${v.prix_base})" 
                                           style="background: #2563eb; color: white; border: none; padding: 8px 15px; border-radius: 6px; cursor: pointer; font-weight: bold;">
                                        RÉSERVER
                                   </button>`
                                : `<button class="btn-disabled" disabled 
                                           style="background: #cbd5e1; color: #64748b; border: none; padding: 8px 15px; border-radius: 6px; cursor: not-allowed;">
                                        INDISPO.
                                   </button>`
                             }
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += card;
    });
}

/**
 * 4. Redirection vers la page de réservation avec paramètres URL
 */
function ouvrirReservation(id, nom, prix) {
    // encodeURIComponent permet de gérer les espaces et caractères spéciaux dans le nom
    const url = `reservations.html?id=${id}&nom=${encodeURIComponent(nom)}&prix=${prix}`;
    window.location.href = url;
}

/**
 * 5. Optionnel : Ouverture d'une modale de contact direct
 */
function ouvrirModalContact(id) {
    const v = voituresCache.find(car => car.id == id);
    if(v) {
        alert("Contactez-nous pour la " + v.nom + " au +261 34 91 207 26");
    }
}
