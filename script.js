// --- script.js (PUBLIC) ---

// CONFIGURATION SUPABASE
const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';

let sb;
try { sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } 
catch (e) { console.error("Erreur Supabase", e); }

// --- AFFICHAGE FLOTTE (ACCUEIL) ---
document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('container-voitures');
    
    // Si l'élément container-voitures existe, on charge la liste
    if (container && sb) {
        // Cette requête fonctionne pour tout le monde grâce au RLS "Lecture publique"
        const { data: voitures, error } = await sb
            .from('voitures')
            .select('*')
            .order('prix_base', { ascending: true });

        if (error) {
            console.error(error);
            container.innerHTML = "<p>Erreur de chargement.</p>";
            return;
        }

        container.innerHTML = '';
        if (voitures.length > 0) {
            voitures.forEach(v => {
                const div = document.createElement('div');
                div.className = 'carte-voiture';
                
                const img = v.image_url || 'https://via.placeholder.com/300';
                
                // Logique Réservation vs Contact
                let actionBtn = '';
                if(v.reservable) {
                    actionBtn = `<button onclick="goToResa('${v.id}', '${v.nom}', ${v.prix_base})">Réserver</button>`;
                } else {
                    actionBtn = `<button class="btn-contact" onclick="alert('Veuillez appeler pour ce modèle.')">Nous contacter</button>`;
                }

                div.innerHTML = `
                    <img src="${img}" alt="${v.nom}">
                    <div class="info">
                        <h3>${v.nom}</h3>
                        <p class="prix">${v.prix_base} Ar / jour</p>
                        ${actionBtn}
                    </div>
                `;
                container.appendChild(div);
            });
        } else {
            container.innerHTML = "<p>Aucune voiture disponible.</p>";
        }
    }
});

// Navigation simple
function goToResa(id, nom, prix) {
    // On stocke les infos pour la page de réservation
    localStorage.setItem('resa_id', id);
    localStorage.setItem('resa_nom', nom);
    localStorage.setItem('resa_prix', prix);
    
    // Si on est sur index.html qui a des sections
    const sectionResa = document.getElementById('reservation');
    if(sectionResa) {
        document.querySelectorAll('.page-section').forEach(s => s.style.display = 'none');
        sectionResa.style.display = 'block';
        
        // Remplissage auto
        document.getElementById('nom-voiture-selectionnee').innerText = nom;
        document.getElementById('id-voiture-input').value = id;
        document.getElementById('prix-base-input').value = prix;
        
        window.scrollTo(0,0);
    } else {
        window.location.href = 'reservation.html';
    }
}

function toggleMenu() {
    const nav = document.getElementById('nav-menu');
    if(nav) nav.classList.toggle('active');
}
