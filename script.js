// --- FONCTION DU MENU ---
function toggleMenu() { 
    const nav = document.getElementById('nav-menu');
    if(nav) nav.classList.toggle('active');
}

// --- CONFIGURATION SUPABASE ---
const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';

let sb;
try { sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch (e) { console.error("Erreur Supabase", e); }

let calendar;
let currentReservationId = null; 
let siteConfigGlobal = null; 

// --- CHARGEMENT CONFIG & VOITURES (Page Publique) ---
document.addEventListener('DOMContentLoaded', async () => {
    if(!sb) return;

    // 1. Charger Config JSON (si existant)
    try {
        const response = await fetch('site_config.json');
        siteConfigGlobal = await response.json();
        // ... (Logique d'affichage header/footer existante conservée) ...
    } catch (e) { console.log("Config JSON par défaut"); }

    const container = document.getElementById('container-voitures');
    
    // Si on est sur la page d'accueil avec le container
    if (container) {
        // La RLS "Lecture Publique" permet à tout le monde de voir ça
        const { data: voitures } = await sb.from('voitures').select('*').order('prix_base', { ascending: true });
        
        if(voitures) {
            container.innerHTML = ''; 
            voitures.forEach(v => {
                const div = document.createElement('div');
                div.className = 'carte-voiture';
                const isReservable = (v.reservable !== false);
                
                div.innerHTML = `
                    <img src="${v.image_url}" alt="${v.nom}">
                    <h3>${v.nom}</h3>
                    <p class="prix">${v.prix_base.toLocaleString()} Ar / jour</p>
                    <button onclick='selectionnerVoiture("${v.id}", "${v.nom}", ${v.prix_base}, "${v.ref_id}", ${isReservable})'>Réserver</button>
                `;
                container.appendChild(div);
            });
        }
    }
});

// --- LOGIQUE RESERVATION (Simplifiée pour lecture, identique à l'existant) ---
function selectionnerVoiture(id, nom, prix, ref, isReservable) {
    if (isReservable === false) {
        alert("Ce véhicule nécessite un contact direct par téléphone.");
        return;
    }
    // Redirection et remplissage du formulaire (logique existante)
    naviguerVers('reservation');
    document.getElementById('nom-voiture-selectionnee').innerText = nom;
    document.getElementById('id-voiture-input').value = id;
    document.getElementById('prix-base-input').value = prix;
}

// Fonction de navigation simple
function naviguerVers(pageId) {
    document.querySelectorAll('.page-section').forEach(sec => sec.style.display = 'none');
    const activeSection = document.getElementById(pageId);
    if(activeSection) activeSection.style.display = 'block';
    window.scrollTo(0,0);
}

// (Le reste des fonctions: calculerPrix, lancerReservationWhatsApp, etc. restent identiques au fichier original)
