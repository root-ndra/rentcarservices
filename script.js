// --- CONFIGURATION ---
const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let calendar;
let voitureSelectionnee = null;
let currentResaId = null;
let reductionActive = 0;

// --- NAVIGATION SCROLL SNAP ---
function scrollToId(id) {
    document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
    toggleMenu(); // Fermer menu mobile si ouvert
}

function toggleMenu() {
    document.getElementById('nav-menu').classList.toggle('active');
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', async () => {
    chargerVoitures();
    chargerMedia('radios');
    chargerAvis();
    chargerPubs();
});

// --- VOITURES ---
async function chargerVoitures() {
    const container = document.getElementById('container-voitures');
    const { data: voitures } = await sb.from('voitures').select('*');
    container.innerHTML = '';
    
    if(voitures) {
        voitures.forEach(v => {
            container.innerHTML += `
                <div class="carte-voiture">
                    <img src="${v.image_url}" alt="${v.nom}">
                    <h3>${v.nom}</h3>
                    <p class="prix">${v.prix_base.toLocaleString()} Ar / jour</p>
                    <button onclick="ouvrirReservation(${v.id}, '${v.nom}', ${v.prix_base})">Réserver</button>
                </div>
            `;
        });
    }
}

// --- RESERVATION ---
function ouvrirReservation(id, nom, prix) {
    voitureSelectionnee = { id, nom, prix };
    document.getElementById('reservation-panel').style.display = 'block';
    document.getElementById('nom-voiture-selectionnee').innerText = nom;
    document.getElementById('id-voiture-input').value = id;
    document.getElementById('prix-base-input').value = prix;
    
    // Scroll fluide vers le formulaire qui vient de s'ouvrir dans la section flotte
    document.getElementById('reservation-panel').scrollIntoView({ behavior: 'smooth' });
    initCalendar(id);
}

function fermerReservation() {
    document.getElementById('reservation-panel').style.display = 'none';
}

function initCalendar(idVoiture) {
    const calendarEl = document.getElementById('calendrier-dispo');
    if(calendar) calendar.destroy();
    
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth', locale: 'fr', height: '300px',
        headerToolbar: { left: 'prev,next', center: 'title', right: '' }
    });
    calendar.render();
    // (Note: La logique de récupération des événements occupés est conservée de votre code original, simplifiée ici pour l'exemple d'affichage)
}

function calculerPrix() {
    const debut = new Date(document.getElementById('date-debut').value);
    const fin = new Date(document.getElementById('date-fin').value);
    const prixBase = parseInt(document.getElementById('prix-base-input').value);
    
    if(debut && fin && prixBase && fin >= debut) {
        const jours = Math.ceil((fin - debut) / (1000 * 60 * 60 * 24)) + 1;
        let total = jours * prixBase;
        
        if(document.getElementById('opt-livraison').checked) total += 15000;
        if(document.getElementById('opt-recuperation').checked) total += 15000;
        
        if(reductionActive > 0) total = total * (1 - (reductionActive/100));
        
        document.getElementById('prix-total').innerText = total.toLocaleString();
        document.getElementById('prix-acompte').innerText = (total * 0.5).toLocaleString();
    }
}

async function verifierPromo() {
    const code = document.getElementById('code-promo').value.toUpperCase();
    const { data } = await sb.from('codes_promo').select('*').eq('code', code).eq('actif', true).single();
    if(data) {
        reductionActive = data.reduction_pourcent;
        document.getElementById('msg-promo').innerText = `-${reductionActive}% !`;
        document.getElementById('msg-promo').style.color = 'green';
    } else {
        reductionActive = 0;
        document.getElementById('msg-promo').innerText = "Invalide";
        document.getElementById('msg-promo').style.color = 'red';
    }
    calculerPrix();
}

async function lancerReservationWhatsApp() {
    if(!document.getElementById('check-conditions').checked) return alert("Acceptez les conditions.");
    
    const nom = document.getElementById('loueur-nom').value;
    const tel = document.getElementById('loueur-tel').value;
    const debut = document.getElementById('date-debut').value;
    const fin = document.getElementById('date-fin').value;
    const totalStr = document.getElementById('prix-total').innerText.replace(/\s/g, '');
    const total = parseInt(totalStr);

    if(!nom || !tel || !debut) return alert("Infos manquantes.");

    // Insertion Supabase
    const { data, error } = await sb.from('reservations').insert([{
        id_voiture: voitureSelectionnee.id,
        nom: nom, tel: tel, date_debut: debut, date_fin: fin,
        montant_total: total, statut: 'en_attente',
        paiement_montant_declare: 0
    }]).select();

    if(error) return alert("Erreur: " + error.message);
    
    currentResaId = data[0].id;
    
    // Lien WhatsApp
    const msg = `Bonjour, je réserve ${voitureSelectionnee.nom} du ${debut} au ${fin}. Total: ${total} Ar. Nom: ${nom}.`;
    window.open(`https://wa.me/261388552432?text=${encodeURIComponent(msg)}`, '_blank');
    
    document.getElementById('step-paiement').style.display = 'block';
}

async function envoyerInfosPaiement() {
    const methode = document.getElementById('pay-method').value;
    const ref = document.getElementById('pay-ref').value;
    
    await sb.from('reservations').update({
        paiement_methode: methode, paiement_ref: ref
    }).eq('id', currentResaId);
    
    document.getElementById('step-download').style.display = 'block';
    
    // Écoute temps réel validation admin
    sb.channel('suivi-'+currentResaId)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reservations', filter: `id=eq.${currentResaId}` }, 
    payload => {
        if(payload.new.statut === 'valide') {
            alert("Paiement validé par l'admin ! Vous pouvez télécharger la facture.");
        }
    }).subscribe();
}

function telechargerFactureAuto() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text(`FACTURE RIJA CARS #${currentResaId}`, 10, 10);
    doc.text(`Voiture: ${voitureSelectionnee.nom}`, 10, 20);
    doc.text(`Total: ${document.getElementById('prix-total').innerText} Ar`, 10, 30);
    doc.text("Payé et Validé.", 10, 40);
    doc.save("facture.pdf");
}

// --- MEDIAS & AVIS ---
async function chargerMedia(type) {
    const table = type === 'radios' ? 'radios' : 'divertissements';
    const container = document.getElementById('conteneur-media');
    const { data } = await sb.from(table).select('*').eq('actif', true);
    container.innerHTML = '';
    
    if(data) data.forEach(m => {
        container.innerHTML += `
            <div class="carte-voiture" style="padding:10px; text-align:center;">
                <h3>${m.nom || m.titre}</h3>
                ${m.url_flux ? `<audio controls src="${m.url_flux}" style="width:100%"></audio>` : `<a href="${m.url_media}" target="_blank">Ouvrir</a>`}
            </div>
        `;
    });
}

async function chargerAvis() {
    const { data } = await sb.from('avis').select('*').eq('visible', true).limit(5);
    const div = document.getElementById('liste-avis');
    div.innerHTML = '';
    if(data) data.forEach(a => {
        div.innerHTML += `<div style="background:#eee; padding:10px; margin-bottom:5px; border-radius:5px;"><strong>${a.nom}</strong>: ${a.commentaire}</div>`;
    });
}

async function envoyerAvis() {
    const nom = document.getElementById('avis-nom').value;
    const msg = document.getElementById('avis-msg').value;
    await sb.from('avis').insert([{ nom: nom, commentaire: msg, visible: false }]);
    alert("Merci ! Avis en attente de validation.");
}

async function chargerPubs() {
    // Logique pubs (similaire à media)
}

function envoyerContactWhatsApp() {
    const msg = document.getElementById('contact-message').value;
    window.open(`https://wa.me/261388552432?text=${encodeURIComponent(msg)}`, '_blank');
}