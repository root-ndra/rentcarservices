let sb = null;
let calendar = null;
let voituresCache = [];

async function initSupabase() {
    const response = await fetch('supabase-config.json');
    const { supabaseUrl, supabaseKey } = await response.json();
    sb = supabase.createClient(supabaseUrl, supabaseKey);
}

document.addEventListener('DOMContentLoaded', async () => {
    await initSupabase();
    await chargerVoitures();
});

async function chargerVoitures() {
    const { data, error } = await sb.from('voitures').select('*').eq('est_public', true);
    if (error) return;
    voituresCache = data;

    const container = document.getElementById('container-voitures');
    container.innerHTML = data.map(v => {
        const estReservable = (v.reservable === true || v.reservable === "true");
        const aChauffeur = (v.chauffeur_option === "true" || v.chauffeur_option === true);

        return `
            <div class="car-card">
                <img src="${v.image_url}" class="car-image">
                <div class="car-info" style="padding: 20px;">
                    ${aChauffeur ? `<div class="badge-chauffeur">Avec chauffeur inclus</div>` : ''}
                    <h3 style="margin-bottom:5px;">${v.nom}</h3>
                    <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 10px;">
                        <i class="fas fa-car"></i> ${v.type || 'Non spécifié'} | 
                        <i class="fas fa-cog"></i> ${v.transmission || 'Manuelle'}
                    </p>
                    
                    <div style="display:flex; gap:15px; font-size:0.85rem; color:#475569; margin-bottom:15px;">
                        <span><i class="fas fa-users"></i> ${v.places || '5'} places</span>
                        <span><i class="fas fa-gas-pump"></i> ${v.carburant || 'Essence'}</span>
                    </div>

                    <p style="font-size:0.85rem; color:#64748b; margin-bottom:15px; line-height:1.4;">
                        ${v.description || 'Aucune description disponible.'}
                    </p>

                    <p class="car-price" style="font-size: 1.3rem; font-weight: 800; color: #3498db; margin-bottom: 15px;">
                        ${v.prix_base.toLocaleString()} Ar <small>/ jour</small>
                    </p>

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
    }).join('');
}

function ouvrirModalContact(id) {
    const v = voituresCache.find(car => car.id == id);
    if(v) document.getElementById('contact-car-name').innerText = v.nom;
    document.getElementById('modal-contact-only').style.display = 'flex';
}

function closeContactModal() {
    document.getElementById('modal-contact-only').style.display = 'none';
}

function ouvrirReservation(id, nom, prix) {
    document.getElementById('reservation-section').style.display = 'block';
    document.getElementById('res-nom-voiture').innerText = "Réserver : " + nom;
    document.getElementById('id-voiture-input').value = id;
    document.getElementById('prix-base-input').value = prix;
    document.getElementById('reservation-section').scrollIntoView({ behavior: 'smooth' });
    initCalendar(id);
}

function initCalendar(idVoiture) {
    const calendarEl = document.getElementById('calendrier-dispo');
    if (calendar) calendar.destroy();
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'fr',
        selectable: true,
        select: function(info) {
            document.getElementById('date-debut').value = info.startStr;
            let fin = new Date(info.end);
            fin.setDate(fin.getDate() - 1);
            document.getElementById('date-fin').value = fin.toISOString().split('T')[0];
            
            const diff = Math.ceil((new Date(info.end) - new Date(info.start)) / (1000*60*60*24));
            const total = diff * parseInt(document.getElementById('prix-base-input').value);
            document.getElementById('prix-total').innerText = total.toLocaleString();
        }
    });
    calendar.render();
}
