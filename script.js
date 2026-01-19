// --- CONFIGURATION SUPABASE ---
const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables Globales
let vehiculeSelectionne = null;
let prixJournalierSelectionne = 0;
let montantTotalGlobal = 0;
let configSite = {};

// --- INITIALISATION ---
window.addEventListener('DOMContentLoaded', async () => {
    await chargerConfiguration();
    await chargerVoitures();
});

// 1. CHARGEMENT DE LA CONFIG (JSON)
async function chargerConfiguration() {
    try {
        // On récupère la config depuis la table 'site_config' (clé 'global_config')
        const { data, error } = await sb.from('site_config').select('value').eq('key', 'global_config').single();
        
        if (data && data.value) {
            configSite = data.value;

            // BACKGROUND
            if(configSite.background_url) {
                document.body.style.backgroundImage = `url('${configSite.background_url}')`;
            }

            // HEADER
            document.title = configSite.header.nom;
            document.getElementById('site-name-header').innerText = configSite.header.nom;
            if (configSite.header.logo) {
                const logo = document.getElementById('site-logo');
                logo.src = configSite.header.logo;
                logo.style.display = 'block';
                logo.style.height = '50px';
            }

            // FOOTER
            document.getElementById('footer-site-name').innerText = configSite.header.nom;
            document.getElementById('footer-addr').innerText = configSite.footer.adresse || '';
            document.getElementById('footer-nif').innerText = configSite.footer.nif || '';
            document.getElementById('footer-stat').innerText = configSite.footer.stat || '';
            document.getElementById('footer-phone').innerText = configSite.footer.contact || '';

            // RESEAUX SOCIAUX
            const s = configSite.footer;
            const socialsDiv = document.getElementById('footer-socials');
            socialsDiv.innerHTML = `
                ${s.facebook ? `<a href="${s.facebook}" target="_blank"><i class="fab fa-facebook"></i></a>` : ''}
                ${s.instagram ? `<a href="${s.instagram}" target="_blank"><i class="fab fa-instagram"></i></a>` : ''}
                ${s.tiktok ? `<a href="${s.tiktok}" target="_blank"><i class="fab fa-tiktok"></i></a>` : ''}
                ${s.whatsapp ? `<a href="https://wa.me/${s.whatsapp}" target="_blank"><i class="fab fa-whatsapp"></i></a>` : ''}
            `;

            // CONDITIONS (FLIP CARDS)
            if (configSite.conditions) {
                const container = document.getElementById('conditions-container');
                container.innerHTML = configSite.conditions.map(c => `
                    <div class="flip-card">
                        <div class="flip-card-inner">
                            <div class="flip-card-front">
                                <h4>${c.titre}</h4>
                                <i class="fas fa-info-circle" style="margin-top:10px; opacity:0.7;"></i>
                            </div>
                            <div class="flip-card-back">
                                <p>${c.texte}</p>
                            </div>
                        </div>
                    </div>
                `).join('');
            }
        }
    } catch (e) {
        console.error("Erreur chargement config:", e);
    }
}

// 2. CHARGEMENT DES VOITURES
async function chargerVoitures() {
    const container = document.getElementById('choix-vehicule-container');
    const { data: voitures, error } = await sb.from('voitures').select('*').order('prix_journalier', { ascending: true });

    if (error) {
        container.innerHTML = "<p>Impossible de charger les véhicules.</p>";
        return;
    }

    container.innerHTML = '';
    voitures.forEach(v => {
        // Si le calendrier est masqué par l'admin, on peut ajouter une classe CSS spécifique si besoin
        const hiddenClass = !v.calendrier_public ? 'calendar-hidden' : '';
        
        container.innerHTML += `
            <div class="card-car ${hiddenClass}" onclick="selectionnerVoiture(${v.id}, ${v.prix_journalier}, '${v.nom}')">
                <img src="${v.image_url}" alt="${v.nom}">
                <div class="card-info">
                    <h3>${v.nom}</h3>
                    <p class="price">${v.prix_journalier.toLocaleString()} Ar / jour</p>
                </div>
            </div>
        `;
    });
}

// 3. SELECTION & DISPONIBILITE
function selectionnerVoiture(id, prix, nom) {
    vehiculeSelectionne = id;
    prixJournalierSelectionne = prix;
    
    // UI Update
    document.querySelectorAll('.card-car').forEach(c => c.classList.remove('selected'));
    event.currentTarget.classList.add('selected');

    document.getElementById('form-details-reservation').style.display = 'block';
    
    // Scroll fluide vers le formulaire
    document.getElementById('form-details-reservation').scrollIntoView({ behavior: 'smooth' });
    
    verifierDisponibilite();
}

async function verifierDisponibilite() {
    const debut = document.getElementById('res-debut').value;
    const fin = document.getElementById('res-fin').value;
    const warningZone = document.getElementById('dispo-warning');
    const btn = document.getElementById('btn-reserver');

    if (!vehiculeSelectionne || !debut || !fin) return;

    if (new Date(debut) > new Date(fin)) {
        warningZone.innerHTML = "La date de début doit être avant la date de fin.";
        warningZone.style.display = 'block';
        btn.disabled = true;
        return;
    }

    // Requête Supabase pour trouver les conflits
    const { data: conflits } = await sb.from('reservations')
        .select('date_debut, date_fin')
        .eq('voiture_id', vehiculeSelectionne)
        .neq('statut', 'annulé') // On ignore les annulés
        .or(`date_debut.lte.${fin},date_fin.gte.${debut}`); // Chevauchement

    // Filtrage JS précis (Supabase .or peut être large)
    const vraisConflits = conflits.filter(r => {
        return (debut <= r.date_fin && fin >= r.date_debut);
    });

    if (vraisConflits.length > 0) {
        // On prend la première réservation qui bloque
        const gene = vraisConflits[0];
        const dateD = new Date(gene.date_debut).toLocaleDateString('fr-FR');
        const dateF = new Date(gene.date_fin).toLocaleDateString('fr-FR');

        warningZone.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i> 
            <strong>Indisponible :</strong> Ce véhicule est réservé du ${dateD} au ${dateF}.<br>
            <a href="#choix-vehicule-container" style="color:#856404; text-decoration:underline;">Veuillez choisir un autre véhicule.</a>
        `;
        warningZone.style.display = 'block';
        btn.disabled = true;
        btn.style.opacity = '0.5';
        document.getElementById('calcul-prix').innerText = '';
    } else {
        warningZone.style.display = 'none';
        btn.disabled = false;
        btn.style.opacity = '1';
        calculerPrix(debut, fin);
    }
}

function calculerPrix(d1, d2) {
    const date1 = new Date(d1);
    const date2 = new Date(d2);
    const diffTime = Math.abs(date2 - date1);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
    
    montantTotalGlobal = diffDays * prixJournalierSelectionne;
    
    document.getElementById('calcul-prix').innerHTML = `
        <span style="font-size:0.9rem; color:#666;">Durée : ${diffDays} jours</span><br>
        Total Estimé : ${montantTotalGlobal.toLocaleString()} Ar
    `;
}

// 4. CONFIRMATION FINALE
async function confirmerReservation() {
    const resa = {
        voiture_id: vehiculeSelectionne,
        nom: document.getElementById('res-nom').value,
        tel: document.getElementById('res-tel').value,
        date_debut: document.getElementById('res-debut').value,
        date_fin: document.getElementById('res-fin').value,
        
        // NOUVEAUX CHAMPS
        lieu_livraison: document.getElementById('res-lieu-livraison').value,
        heure_livraison: document.getElementById('res-heure-livraison').value,
        lieu_recup: document.getElementById('res-lieu-recup').value,
        heure_recup: document.getElementById('res-heure-recup').value,
        
        trajet_1: document.getElementById('res-trajet-1').value,
        trajet_2: document.getElementById('res-trajet-2').value,
        trajet_3: document.getElementById('res-trajet-3').value,
        trajet_4: document.getElementById('res-trajet-4').value,

        montant_total: montantTotalGlobal,
        statut: 'en attente'
    };

    if (!resa.nom || !resa.tel || !resa.date_debut) {
        alert("Merci de remplir au moins votre nom, téléphone et les dates.");
        return;
    }

    const { error } = await sb.from('reservations').insert([resa]);

    if (error) {
        alert("Erreur lors de la réservation : " + error.message);
    } else {
        alert("✅ Demande envoyée avec succès ! Nous vous recontacterons très vite.");
        location.reload();
    }
}

function toggleMenu() {
    document.getElementById('nav-menu').classList.toggle('active');
}