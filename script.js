// --- FONCTION DU MENU ---
function toggleMenu() { 
    const nav = document.getElementById('nav-menu');
    nav.classList.toggle('active');
}

// Fonction Couleur Aléatoire
function genererCouleur(id) {
    const couleurs = ['#3498db', '#9b59b6', '#2ecc71', '#f1c40f', '#1abc9c', '#34495e', '#e67e22', '#16a085', '#8e44ad', '#2980b9'];
    if (!id) return couleurs[Math.floor(Math.random() * couleurs.length)];
    let hash = 0; for (let i = 0; i < id.toString().length; i++) { hash = id.toString().charCodeAt(i) + ((hash << 5) - hash); }
    return couleurs[Math.abs(hash) % couleurs.length];
}

// --- CONFIGURATION SUPABASE ---
const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';

let sb;
try { sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch (e) { console.error("Erreur Supabase", e); }

let calendar;
let voitureSelectionnee = null;
let currentReservationId = null; 
let reductionActive = 0;
let currentCarReservations = [];

// --- 0. CHARGEMENT CONFIG JSON & DB ---
async function loadConfig() {
    // 1. Charger Config JSON (Textes, Logo)
    try {
        const response = await fetch('site_config.json');
        const config = await response.json();

        // Header
        document.getElementById('header-site-name').innerText = config.header.siteName;
        document.getElementById('header-logo').src = config.header.logoUrl;
        document.getElementById('hero-title').innerText = config.header.siteName;
        document.getElementById('footer-title').innerText = config.header.siteName;

        // Footer
        document.getElementById('footer-address').innerText = config.footer.address;
        document.getElementById('footer-nif').innerText = config.footer.nif;
        document.getElementById('footer-stat').innerText = config.footer.stat;
        document.getElementById('footer-phone').innerText = config.footer.phone;
        
        // Socials
        const socialContainer = document.getElementById('footer-socials');
        if(config.footer.socials.facebook) socialContainer.innerHTML += `<a href="${config.footer.socials.facebook}" target="_blank" style="color:white; margin:0 10px; font-size:1.5rem;"><i class="fab fa-facebook"></i></a>`;
        if(config.footer.socials.tiktok) socialContainer.innerHTML += `<a href="${config.footer.socials.tiktok}" target="_blank" style="color:white; margin:0 10px; font-size:1.5rem;"><i class="fab fa-tiktok"></i></a>`;
        if(config.footer.socials.instagram) socialContainer.innerHTML += `<a href="${config.footer.socials.instagram}" target="_blank" style="color:white; margin:0 10px; font-size:1.5rem;"><i class="fab fa-instagram"></i></a>`;

        // Map
        if(config.footer.mapUrl) {
            document.getElementById('footer-map').innerHTML = `<iframe src="${config.footer.mapUrl}" width="100%" height="250" style="border:0; border-radius:10px;" allowfullscreen="" loading="lazy"></iframe>`;
        }

    } catch (e) { console.error("Erreur chargement config", e); }

    // 2. Charger Conditions JSON
    try {
        const respCond = await fetch('conditions.json');
        const conditions = await respCond.json();
        const condContainer = document.getElementById('container-conditions-cards');
        condContainer.innerHTML = '';
        conditions.forEach(c => {
            condContainer.innerHTML += `
            <div class="flip-card" onclick="this.classList.toggle('flipped')">
                <div class="flip-card-inner">
                    <div class="flip-card-front">
                        <i class="${c.icon}" style="font-size:2rem; margin-bottom:10px;"></i>
                        <h3>${c.title}</h3>
                        <small>(Voir)</small>
                    </div>
                    <div class="flip-card-back">
                        <p>${c.details}</p>
                    </div>
                </div>
            </div>`;
        });
    } catch (e) { console.error("Erreur chargement conditions", e); }

    // 3. CHARGER CONFIG CALENDRIER DEPUIS DB (ADMIN CONTROL)
    const { data: calConfig } = await sb.from('config_site').select('value').eq('key', 'calendar_visible').single();
    if (calConfig) {
        const isVisible = (calConfig.value === true || calConfig.value === "true");
        const wrapper = document.getElementById('wrapper-calendrier-global');
        if (wrapper) {
            wrapper.style.display = isVisible ? 'block' : 'none';
        }
    }
}

// --- INTERFACE ---
function togglePaymentFields() {
    const method = document.getElementById('pay-method').value;
    document.getElementById('fields-mvola').style.display = (method === 'mvola') ? 'block' : 'none';
    document.getElementById('fields-espece').style.display = (method === 'espece') ? 'block' : 'none';
    document.getElementById('fields-montant').style.display = (method !== '') ? 'block' : 'none';
}

function toggleAutreMontant() {
    const choix = document.getElementById('pay-choix-montant').value;
    document.getElementById('field-autre-montant').style.display = (choix === 'autre') ? 'block' : 'none';
}

function toggleCalendarVisibility() {
    const el = document.getElementById('wrapper-calendrier');
    el.style.display = (el.style.display === 'none') ? 'block' : 'none';
    if(el.style.display === 'block' && calendar) calendar.render(); // Force redraw
}

// --- NAVIGATION ---
function naviguerVers(pageId) {
    document.querySelectorAll('.page-section').forEach(sec => sec.style.display = 'none');
    const activeSection = document.getElementById(pageId);
    if(activeSection) activeSection.style.display = 'block';
    window.scrollTo(0,0);
    document.getElementById('nav-menu').classList.remove('active');
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', async () => {
    if(!sb) return;
    loadConfig();

    const container = document.getElementById('container-voitures');
    const { data: voitures } = await sb.from('voitures').select('*');
    
    if(voitures) {
        container.innerHTML = ''; 
        voitures.forEach(v => {
            const div = document.createElement('div');
            div.className = 'carte-voiture';
            
            // Infos dynamiques
            const places = v.places ? `<i class="fas fa-user-friends"></i> ${v.places} places` : '';
            const carbu = v.carburant ? `<i class="fas fa-gas-pump"></i> ${v.carburant}` : '';
            
            div.innerHTML = `
                <img src="${v.image_url}" alt="${v.nom}">
                <h3>${v.nom}</h3>
                <div style="padding: 0 20px; color: #555; font-size: 0.9rem; display: flex; gap: 10px; justify-content: center;">
                    <span><i class="fas fa-cogs"></i> ${v.transmission}</span>
                    <span>${places}</span>
                    <span>${carbu}</span>
                </div>
                <p class="prix">${formatPrix(v.prix_base)} Ar / jour</p>
                <button onclick="selectionnerVoiture('${v.id}', '${v.nom}', ${v.prix_base}, '${v.ref_id}', \`${v.description || ''}\`)">Réserver</button>
            `;
            container.appendChild(div);
        });
    } else { container.innerHTML = "<p>Impossible de charger les voitures.</p>"; }
    
    chargerMedia('radios'); 
    chargerAvis(); 
    chargerPublicites();
});

function formatPrix(prix) { return prix.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " "); }

// --- SELECTION VOITURE ---
function selectionnerVoiture(id, nom, prix, ref, description) {
    voitureSelectionnee = { id, nom, prix, ref };
    naviguerVers('reservation');
    
    document.getElementById('nom-voiture-selectionnee').innerText = nom;
    document.getElementById('desc-voiture-selectionnee').innerText = description || ""; // Affiche la description
    document.getElementById('id-voiture-input').value = id;
    document.getElementById('ref-voiture-input').value = ref;
    document.getElementById('prix-base-input').value = prix;
    
    // Reset inputs
    document.getElementById("date-debut").value = "";
    document.getElementById("date-fin").value = "";
    document.getElementById('lieu-livraison').value = "";
    document.getElementById('heure-livraison').value = "";
    document.getElementById('lieu-recuperation').value = "";
    document.getElementById('heure-recuperation').value = "";
    document.getElementById('trajet-1').value = "";
    document.getElementById('trajet-2').value = "";
    document.getElementById('trajet-3').value = "";

    document.getElementById('step-1-actions').style.display = 'block';
    document.getElementById('step-2-paiement').style.display = 'none';
    document.getElementById('step-3-download').style.display = 'none';

    initCalendar(id);
}

// --- CALENDRIER ---
async function initCalendar(idVoiture) {
    const calendarEl = document.getElementById('calendrier-dispo');
    if(calendar) { calendar.destroy(); }

    const { data: resas } = await sb.from('reservations').select('id, date_debut, date_fin').eq('id_voiture', idVoiture).eq('statut', 'valide');
    const { data: maints } = await sb.from('maintenances').select('date_debut, date_fin').eq('id_voiture', idVoiture);

    currentCarReservations = []; 
    let events = [];

    if(resas) resas.forEach(r => {
        currentCarReservations.push({ start: new Date(r.date_debut), end: new Date(r.date_fin) });
        let fin = new Date(r.date_fin); fin.setDate(fin.getDate() + 1);
        events.push({ title: 'Loué', start: r.date_debut, end: fin.toISOString().split('T')[0], display: 'background', color: genererCouleur(r.id) });
    });

    if(maints) maints.forEach(m => {
        currentCarReservations.push({ start: new Date(m.date_debut), end: new Date(m.date_fin) });
        let fin = new Date(m.date_fin); fin.setDate(fin.getDate() + 1);
        events.push({ title: 'Entretien', start: m.date_debut, end: fin.toISOString().split('T')[0], display: 'background', color: '#c0392b' });
    });

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth', locale: 'fr', height: 'auto', events: events,
        headerToolbar: { left: 'prev,next', center: 'title', right: '' },
        dateClick: function(info) {
            let dDebut = document.getElementById('date-debut');
            let dFin = document.getElementById('date-fin');
            if(!dDebut.value) { dDebut.value = info.dateStr; } 
            else { 
                if (new Date(info.dateStr) < new Date(dDebut.value)) { dDebut.value = info.dateStr; dFin.value = ""; } 
                else { dFin.value = info.dateStr; } 
            }
            calculerPrix();
        }
    });
    calendar.render();
}

function verifierDisponibilite(debut, fin) {
    let d1 = new Date(debut); let d2 = new Date(fin);
    for (let resa of currentCarReservations) { if (d1 <= resa.end && d2 >= resa.start) return false; }
    return true; 
}

// --- CALCUL PRIX ---
function faireLeCalculMathematique() {
    const prixBase = parseInt(document.getElementById('prix-base-input').value);
    const dateDebut = document.getElementById("date-debut").value;
    const dateFin = document.getElementById("date-fin").value;

    if (dateDebut && dateFin && prixBase) {
        const d1 = new Date(dateDebut); const d2 = new Date(dateFin);
        const diffDays = Math.ceil(Math.abs(d2 - d1) / (86400000)) + 1; 
        
        let multiplier = 1;
        let formuleChoisie = "Jour";
        const radioOffre = document.querySelector('input[name="offre"]:checked');
        if (radioOffre) {
            formuleChoisie = radioOffre.value; 
            if (formuleChoisie === 'nuit') multiplier = 1.5;
            if (formuleChoisie === '24h') multiplier = 2;
        }

        let coutLocation = diffDays * prixBase * multiplier;
        if (diffDays >= 7 && diffDays < 30) coutLocation *= 0.90;
        else if (diffDays >= 30) coutLocation *= 0.85;

        if (reductionActive > 0) coutLocation = coutLocation * (1 - (reductionActive / 100));

        let fraisOptions = 0;
        if (document.getElementById('opt-livraison').checked) fraisOptions += 15000;
        if (document.getElementById('opt-recuperation').checked) fraisOptions += 15000;

        return { ok: true, total: Math.round(coutLocation + fraisOptions), acompte: Math.round((coutLocation + fraisOptions) * 0.5), offre: formuleChoisie, duree: diffDays };
    }
    return { ok: false };
}

function calculerPrix() {
    const res = faireLeCalculMathematique();
    if(res.ok) {
        document.getElementById("prix-total").innerText = formatPrix(res.total);
        document.getElementById("prix-acompte").innerText = formatPrix(res.acompte);
        document.getElementById("txt-jours").innerText = res.duree;
        document.getElementById("txt-formule").innerText = res.offre;
    }
}

async function verifierPromo() {
    // Logique promo standard (inchangée)
    const code = document.getElementById('code-promo').value.toUpperCase().trim();
    const dateDebut = document.getElementById("date-debut").value;
    const dateFin = document.getElementById("date-fin").value;
    const msg = document.getElementById('msg-promo');

    if(!dateDebut || !dateFin) { msg.innerText = "⚠️ Sélectionnez dates"; return; }

    const { data } = await sb.from('codes_promo').select('*').eq('code', code).eq('actif', true).single();
    if(data) { reductionActive = data.reduction_pourcent; msg.innerText = `✅ -${reductionActive}%`; msg.style.color="green"; }
    else { reductionActive = 0; msg.innerText = "❌ Invalide"; msg.style.color="red"; }
    calculerPrix();
}

// --- RESERVATION ---
async function lancerReservationWhatsApp() {
    if (!document.getElementById('check-conditions-step1').checked) return alert("Acceptez les conditions.");

    const client = {
        nom: document.getElementById('loueur-nom').value,
        prenom: document.getElementById('loueur-prenom').value,
        tel: document.getElementById('loueur-tel').value,
        adresse: document.getElementById('loueur-adresse').value,
        cin: document.getElementById('loueur-cin').value
    };
    
    if(!client.nom || !client.tel || !client.cin) return alert("Remplissez Nom, Tél et CIN.");
    const calcul = faireLeCalculMathematique();
    if(!calcul.ok) return alert("Dates invalides");
    if (!verifierDisponibilite(document.getElementById('date-debut').value, document.getElementById('date-fin').value)) return alert("❌ Indisponible.");

    // Récupération des nouveaux champs
    const livraison = {
        lieu: document.getElementById('lieu-livraison').value,
        heure: document.getElementById('heure-livraison').value
    };
    const recuperation = {
        lieu: document.getElementById('lieu-recuperation').value,
        heure: document.getElementById('heure-recuperation').value
    };
    const trajet = [
        document.getElementById('trajet-1').value,
        document.getElementById('trajet-2').value,
        document.getElementById('trajet-3').value
    ].filter(Boolean).join(" -> ");

    const reservationData = {
        id_voiture: document.getElementById('id-voiture-input').value,
        date_debut: document.getElementById('date-debut').value,
        date_fin: document.getElementById('date-fin').value,
        nom: client.nom, prenom: client.prenom, adresse: client.adresse, tel: client.tel,
        cin_passeport: client.cin,
        urgence_nom: document.getElementById('urgence-nom').value,
        urgence_adresse: document.getElementById('urgence-adresse').value,
        urgence_tel: document.getElementById('urgence-tel').value,
        type_offre: calcul.offre,
        montant_total: calcul.total,
        statut: 'en_attente',
        lieu_livraison: livraison.lieu,
        heure_livraison: livraison.heure,
        lieu_recuperation: recuperation.lieu,
        heure_recuperation: recuperation.heure,
        trajet_details: trajet
    };

    await sb.from('clients').upsert({ nom: client.nom, tel: client.tel }, { onConflict: 'tel' });
    const { data, error } = await sb.from('reservations').insert([reservationData]).select();

    if(error) return alert("Erreur: " + error.message);

    currentReservationId = data[0].id;
    window.currentResaData = data[0]; 

    let msg = `Bonjour Rija, Réservation *${document.getElementById("nom-voiture-selectionnee").innerText}* (#${currentReservationId}).\n`;
    msg += `📅 Du ${reservationData.date_debut} au ${reservationData.date_fin}\n`;
    msg += `📍 Liv: ${livraison.lieu || 'Agence'} (${livraison.heure})\n`;
    msg += `📍 Rec: ${recuperation.lieu || 'Agence'} (${recuperation.heure})\n`;
    msg += `🛣️ Trajet: ${trajet || 'Local'}\n`;
    msg += `💰 Total: ${formatPrix(calcul.total)} Ar\n👤 ${client.nom} ${client.prenom}\n📞 ${client.tel}`;

    window.open(`https://wa.me/261388552432?text=${encodeURIComponent(msg)}`, '_blank');

    document.getElementById('step-1-actions').style.display = 'none';
    document.getElementById('step-2-paiement').style.display = 'block';
    setTimeout(() => { document.getElementById('step-2-paiement').scrollIntoView({behavior:'smooth'}); }, 1000);
}

// --- PAIEMENT & PDF ---
async function envoyerInfosPaiement() {
    if(!currentReservationId) return;
    const method = document.getElementById('pay-method').value;
    
    let payInfo = {
        methode: method,
        titulaire: (method === 'mvola') ? document.getElementById('pay-mvola-nom').value : document.getElementById('pay-cash-nom').value,
        numero: (method === 'mvola') ? document.getElementById('pay-mvola-num').value : '',
        ref: (method === 'mvola') ? document.getElementById('pay-mvola-ref').value : '',
        type_montant: document.getElementById('pay-choix-montant').value
    };
    
    let montantDeclare = (payInfo.type_montant === '50') ? (window.currentResaData.montant_total / 2) : (window.currentResaData.montant_total);
    if(payInfo.type_montant === 'autre') montantDeclare = parseFloat(document.getElementById('pay-valeur-autre').value) || 0;

    await sb.from('reservations').update({
        paiement_methode: payInfo.methode, paiement_titulaire: payInfo.titulaire,
        paiement_numero: payInfo.numero, paiement_ref: payInfo.ref,
        paiement_montant_declare: montantDeclare
    }).eq('id', currentReservationId);

    window.currentResaData.paiement_titulaire = payInfo.titulaire;
    window.currentResaData.paiement_montant_declare = montantDeclare;

    document.getElementById('step-2-paiement').style.display = 'none';
    document.getElementById('step-3-download').style.display = 'block';
    
    // Écoute temps réel validation
    sb.channel('suivi-resa-' + currentReservationId)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reservations', filter: `id=eq.${currentReservationId}` },
            (payload) => { if (payload.new.code_otp) activerBoutonDownload(payload.new.code_otp); }
        ).subscribe();
}

function activerBoutonDownload(code) {
    document.getElementById('input-otp-auto').value = code;
    const btn = document.getElementById('btn-dl-pdf');
    btn.disabled = false; btn.classList.add('btn-pdf-active');
    if(window.currentResaData) window.currentResaData.code_otp = code;
}

function telechargerFactureAuto() { if(window.currentResaData) genererPDF(window.currentResaData); }

function genererPDF(resa) {
    if (!window.jspdf) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFillColor(44, 62, 80); doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(22); 
    doc.text("RIJA NIAINA CAR SERVICES", 105, 15, { align: "center" });
    doc.setFontSize(10); 
    doc.text("Siae 33 Ambodifilao, Analakely, Antananarivo 101", 105, 25, { align: "center" });
    doc.text("Tel: +261 38 85 524 32", 105, 32, { align: "center" });

    doc.setTextColor(0, 0, 0); doc.setFontSize(11);
    doc.text(`Date : ${new Date().toLocaleDateString('fr-FR')}`, 195, 50, { align: "right" });
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(`FACTURE / REÇU N° ${resa.id}`, 14, 60);

    const d1 = new Date(resa.date_debut); const d2 = new Date(resa.date_fin);
    const duree = Math.ceil(Math.abs(d2 - d1) / (86400000)) + 1;
    
    // Détails complets Client
    const clientInfo = [
        `Nom: ${resa.nom} ${resa.prenom || ''}`,
        `Tél: ${resa.tel}`,
        `Adresse: ${resa.adresse || '-'}`,
        `CIN: ${resa.cin_passeport || '-'}`,
        `Urgence: ${resa.urgence_nom || '-'} (${resa.urgence_tel || '-'})`
    ].join('\n');

    // Détails complets Location
    const locInfo = [
        `Du: ${resa.date_debut} Au: ${resa.date_fin} (${duree}j)`,
        `Départ: ${resa.lieu_livraison || 'Agence'} à ${resa.heure_livraison || '-'}`,
        `Retour: ${resa.lieu_recuperation || 'Agence'} à ${resa.heure_recuperation || '-'}`,
        `Trajet: ${resa.trajet_details || 'Non précisé'}`
    ].join('\n');

    // Paiement
    const paye = parseFloat(resa.paiement_montant_declare) || 0;
    const total = parseFloat(resa.montant_total);
    const reste = total - paye;
    const payInfo = [
        `Total: ${formatPrix(total)} Ar`,
        `Payé: ${formatPrix(paye)} Ar`,
        `Reste: ${formatPrix(reste)} Ar`,
        `Payeur: ${resa.paiement_titulaire || '-'}`
    ].join('\n');

    doc.autoTable({
        startY: 70,
        head: [['CLIENT', 'DÉTAILS LOCATION', 'FINANCIER']],
        body: [[clientInfo, locInfo, payInfo]],
        theme: 'grid',
        headStyles: { fillColor: [52, 152, 219], halign: 'center' },
        styles: { fontSize: 9, cellPadding: 4, valign: 'top' },
        columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 80 }, 2: { cellWidth: 50 } }
    });

    if(resa.code_otp) {
        doc.setTextColor(39, 174, 96);
        doc.text(`Validé - OTP: ${resa.code_otp}`, 14, doc.lastAutoTable.finalY + 10);
    }
    doc.save(`Facture_Rija_${resa.id}.pdf`);
}

// Helpers
async function chargerAvis() {
    const d = document.getElementById('liste-avis');
    const { data } = await sb.from('avis').select('*').eq('visible', true).limit(3);
    if(data) d.innerHTML = data.map(a => `<div style="background:#f9f9f9; padding:10px; margin-bottom:5px;"><strong>${'⭐'.repeat(a.note)} ${a.nom}</strong><p>${a.commentaire}</p></div>`).join('');
}
function envoyerContactWhatsApp() {
    window.open(`https://wa.me/261388552432?text=${encodeURIComponent(`[${document.getElementById('contact-sujet').value}] ${document.getElementById('contact-message').value}`)}`, '_blank');
}
async function chargerMedia(t) {
    const c = document.getElementById('conteneur-media');
    const { data } = await sb.from(t).select('*').eq('actif', true);
    c.innerHTML = data ? data.map(i => t==='radios' ? `<div class="carte-voiture" style="padding:10px; text-align:center;"><img src="${i.image_url}" style="width:50px;"><br>${i.nom}<br><audio controls src="${i.url_flux}" style="width:100%"></audio></div>` : `<div class="carte-voiture"><iframe src="${i.url_embed}" width="100%" height="200"></iframe></div>`).join('') : '';
}
async function chargerPublicites() { /* Code pub existant */ }
async function envoyerAvis() { /* Code avis existant */ }
function ouvrirModalConditions() { document.getElementById('modal-conditions').style.display = 'flex'; }
function fermerModalConditions() { document.getElementById('modal-conditions').style.display = 'none'; }