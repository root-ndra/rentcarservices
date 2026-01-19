// --- 0. FONCTION DU MENU (Tout en haut pour éviter les bugs) ---
function toggleMenu() { 
    const nav = document.getElementById('nav-menu');
    nav.classList.toggle('active');
}

// Fonction Couleur Aléatoire (Pour le calendrier)
function genererCouleur(id) {
    const couleurs = ['#3498db', '#9b59b6', '#2ecc71', '#f1c40f', '#1abc9c', '#34495e', '#e67e22', '#16a085', '#8e44ad', '#2980b9'];
    if (!id) return couleurs[Math.floor(Math.random() * couleurs.length)];
    let hash = 0; for (let i = 0; i < id.toString().length; i++) { hash = id.toString().charCodeAt(i) + ((hash << 5) - hash); }
    return couleurs[Math.abs(hash) % couleurs.length];
}

// --- CONFIGURATION ---
const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';

let sb;
try {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (e) {
    console.error("Erreur Supabase (Probablement hors ligne)", e);
}

let calendar;
let voitureSelectionnee = null;
let lastReservationId = null;
let reductionActive = 0; // Stocke le % de réduction
let currentCarReservations = [];
let currentReservationId = null; 
let realTimeSubscription = null;

// --- INTERFACE (Paiement) ---
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

// --- NAVIGATION ---
function naviguerVers(pageId) {
    const sections = document.querySelectorAll('.page-section');
    sections.forEach(sec => sec.style.display = 'none');
    
    const activeSection = document.getElementById(pageId);
    if(activeSection) activeSection.style.display = 'block';

    window.scrollTo(0,0);
    const menu = document.getElementById('nav-menu');
    if (menu.classList.contains('active')) menu.classList.remove('active');
}

// --- 1. DÉMARRAGE ---
document.addEventListener('DOMContentLoaded', async () => {
    if(!sb) return;

    const container = document.getElementById('container-voitures');
    const { data: voitures } = await sb.from('voitures').select('*');
    
    if(voitures) {
        container.innerHTML = ''; 
        voitures.forEach(v => {
            const div = document.createElement('div');
            div.className = 'carte-voiture';
            div.innerHTML = `
                <img src="${v.image_url}" alt="${v.nom}">
                <h3>${v.nom}</h3>
                <p>${v.type} - ${v.transmission}</p>
                <p class="prix">${formatPrix(v.prix_base)} Ar / jour</p>
                <button onclick="selectionnerVoiture('${v.id}', '${v.nom}', ${v.prix_base}, '${v.ref_id}')">Réserver</button>
            `;
            container.appendChild(div);
        });
    } else {
        container.innerHTML = "<p>Impossible de charger les voitures.</p>";
    }
    
    chargerMedia('radios'); 
    chargerAvis(); 
    chargerPublicites();
});

// --- HELPER PRIX ---
function formatPrix(prix) {
    return prix.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// --- 2. SÉLECTION VOITURE ---
function selectionnerVoiture(id, nom, prix, ref) {
    voitureSelectionnee = { id, nom, prix, ref };
    naviguerVers('reservation');
    
    document.getElementById('nom-voiture-selectionnee').innerText = nom;
    document.getElementById('id-voiture-input').value = id;
    document.getElementById('ref-voiture-input').value = ref;
    document.getElementById('prix-base-input').value = prix;
    
    document.getElementById("date-debut").value = "";
    document.getElementById("date-fin").value = "";
    document.getElementById("prix-total").innerText = "0";
    document.getElementById("prix-acompte").innerText = "0";
    
    // Reset workflow
    document.getElementById('step-1-actions').style.display = 'block';
    document.getElementById('step-2-paiement').style.display = 'none';
    document.getElementById('step-3-download').style.display = 'none';

    initCalendar(id);
}

// --- 3. CALENDRIER ---
async function initCalendar(idVoiture) {
    const calendarEl = document.getElementById('calendrier-dispo');
    if(calendar) { calendar.destroy(); }

    // On prend toutes les réservations VALIDÉES
    const { data: resas } = await sb.from('reservations').select('id, date_debut, date_fin').eq('id_voiture', idVoiture).eq('statut', 'valide');
    const { data: maints } = await sb.from('maintenances').select('date_debut, date_fin').eq('id_voiture', idVoiture);

    currentCarReservations = []; 
    let events = [];

    if(resas) {
        resas.forEach(r => {
            currentCarReservations.push({ start: new Date(r.date_debut), end: new Date(r.date_fin) });
            let fin = new Date(r.date_fin); fin.setDate(fin.getDate() + 1);
            events.push({ 
                title: 'Loué', 
                start: r.date_debut, 
                end: fin.toISOString().split('T')[0], 
                display: 'background', 
                color: genererCouleur(r.id) // Couleur aléatoire
            });
        });
    }
    if(maints) {
        maints.forEach(m => {
            currentCarReservations.push({ start: new Date(m.date_debut), end: new Date(m.date_fin) });
            let fin = new Date(m.date_fin); fin.setDate(fin.getDate() + 1);
            events.push({ 
                title: 'Entretien', 
                start: m.date_debut, 
                end: fin.toISOString().split('T')[0], 
                display: 'background', 
                color: '#c0392b' // ROUGE pour maintenance
            });
        });
    }

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
    let d1 = new Date(debut);
    let d2 = new Date(fin);
    for (let resa of currentCarReservations) {
        if (d1 <= resa.end && d2 >= resa.start) { return false; }
    }
    return true; 
}

// --- 4. CALCUL PRIX (LOGIQUE COMPLETE) ---
function faireLeCalculMathematique() {
    const rawPrix = document.getElementById('prix-base-input').value;
    const prixBase = parseInt(rawPrix.toString().replace(/\s/g, ''));
    
    const dateDebut = document.getElementById("date-debut").value;
    const dateFin = document.getElementById("date-fin").value;

    if (dateDebut && dateFin && prixBase) {
        const d1 = new Date(dateDebut); const d2 = new Date(dateFin);
        const diffTime = Math.abs(d2 - d1);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
        
        let multiplier = 1;
        let formuleChoisie = "Jour";
        
        const radioOffre = document.querySelector('input[name="offre"]:checked');
        if (radioOffre) {
            formuleChoisie = radioOffre.value; 
            if (formuleChoisie === 'nuit') multiplier = 1.5;
            if (formuleChoisie === '24h') multiplier = 2;
        }

        let coutLocation = diffDays * prixBase * multiplier;
        
        if (diffDays >= 7 && diffDays < 30) { coutLocation = coutLocation * 0.90; }
        else if (diffDays >= 30) { coutLocation = coutLocation * 0.85; }

        if (reductionActive > 0) {
            coutLocation = coutLocation * (1 - (reductionActive / 100));
        }

        let fraisOptions = 0;
        const optLiv = document.getElementById('opt-livraison');
        const optRec = document.getElementById('opt-recuperation');
        if (optLiv && optLiv.checked) { fraisOptions += 15000; }
        if (optRec && optRec.checked) { fraisOptions += 15000; }

        let totalFinal = coutLocation + fraisOptions;

        return { ok: true, total: Math.round(totalFinal), acompte: Math.round(totalFinal * 0.5), offre: formuleChoisie, duree: diffDays };
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
    const codeInput = document.getElementById('code-promo');
    const msg = document.getElementById('msg-promo');
    const code = codeInput.value.toUpperCase().trim();
    const dateDebut = document.getElementById("date-debut").value;
    const dateFin = document.getElementById("date-fin").value;

    if(!dateDebut || !dateFin) { msg.innerText = "⚠️ Sélectionnez d'abord vos dates"; return; }

    let d1 = new Date(dateDebut); let d2 = new Date(dateFin);
    let diffDays = Math.ceil(Math.abs(d2 - d1) / (86400000)) + 1;

    const { data } = await sb.from('codes_promo').select('*').eq('code', code).eq('actif', true).single();
    
    if(data) { 
        if (dateDebut < data.date_debut || dateDebut > data.date_fin) {
            reductionActive = 0; msg.innerText = `❌ Code expiré`; msg.style.color = "red";
        } else if (diffDays < data.min_jours) {
            reductionActive = 0; msg.innerText = `❌ Min. ${data.min_jours} jours requis`; msg.style.color = "red";
        } else {
            reductionActive = data.reduction_pourcent; msg.innerText = `✅ -${reductionActive}% appliqué !`; msg.style.color = "green"; 
        }
    } else { 
        reductionActive = 0; msg.innerText = "❌ Code invalide"; msg.style.color = "red"; 
    }
    calculerPrix();
}

// --- 5. WORKFLOW COMPLET ---
async function lancerReservationWhatsApp() {
    const conditions = document.getElementById('check-conditions-step1').checked;
    if (!conditions) return alert("Veuillez accepter les conditions générales.");

    const client = {
        nom: document.getElementById('loueur-nom').value,
        prenom: document.getElementById('loueur-prenom').value,
        tel: document.getElementById('loueur-tel').value,
        adresse: document.getElementById('loueur-adresse').value,
        cin: document.getElementById('loueur-cin').value
    };
    
    if(!client.nom || !client.tel || !client.cin) return alert("Merci de remplir Nom, Tél et CIN.");

    const calcul = faireLeCalculMathematique();
    if(!calcul.ok) return alert("Dates invalides");

    if (!verifierDisponibilite(document.getElementById('date-debut').value, document.getElementById('date-fin').value)) { 
        alert("❌ Dates indisponibles."); return; 
    }

    const urgence = {
        nom: document.getElementById('urgence-nom').value,
        adresse: document.getElementById('urgence-adresse').value,
        tel: document.getElementById('urgence-tel').value
    };

    const reservationData = {
        id_voiture: document.getElementById('id-voiture-input').value,
        date_debut: document.getElementById('date-debut').value,
        date_fin: document.getElementById('date-fin').value,
        nom: client.nom, prenom: client.prenom, adresse: client.adresse, tel: client.tel,
        cin_passeport: client.cin,
        urgence_nom: urgence.nom, urgence_adresse: urgence.adresse, urgence_tel: urgence.tel,
        type_offre: calcul.offre,
        montant_total: calcul.total, 
        statut: 'en_attente'
    };

    await sb.from('clients').upsert({ nom: client.nom, tel: client.tel }, { onConflict: 'tel' });
    const { data, error } = await sb.from('reservations').insert([reservationData]).select();

    if(error) return alert("Erreur connexion: " + error.message);

    currentReservationId = data[0].id;
    window.currentResaData = data[0]; // Stockage local des données

    let voitureNom = document.getElementById("nom-voiture-selectionnee").innerText;
    let msg = `Bonjour Rija, Réservation *${voitureNom}* (#${currentReservationId}).\n`;
    msg += `📅 Du ${reservationData.date_debut} au ${reservationData.date_fin}\n`;
    msg += `💰 Total: ${formatPrix(calcul.total)} Ar (Acompte: ${formatPrix(calcul.acompte)} Ar)\n`;
    msg += `👤 ${client.nom} ${client.prenom}\n`;
    msg += `🆔 CIN: ${client.cin}\n`;
    msg += `📞 Tél: ${client.tel}\n\n`;
    msg += `Je procède au paiement sur le site.`;

    window.open(`https://wa.me/261388552432?text=${encodeURIComponent(msg)}`, '_blank');

    document.getElementById('step-1-actions').style.display = 'none';
    document.getElementById('step-2-paiement').style.display = 'block';
    setTimeout(() => { document.getElementById('step-2-paiement').scrollIntoView({behavior:'smooth'}); }, 1000);
}

async function envoyerInfosPaiement() {
    if(!currentReservationId) return alert("Erreur ID réservation manquant.");

    const method = document.getElementById('pay-method').value;
    if(!method) return alert("Choisissez un mode de paiement.");

    let payInfo = {
        methode: method,
        titulaire: (method === 'mvola') ? document.getElementById('pay-mvola-nom').value : document.getElementById('pay-cash-nom').value,
        numero: (method === 'mvola') ? document.getElementById('pay-mvola-num').value : '',
        ref: (method === 'mvola') ? document.getElementById('pay-mvola-ref').value : '',
        type_montant: document.getElementById('pay-choix-montant').value
    };

    if(!payInfo.titulaire) return alert("Nom du payeur obligatoire.");

    let montantDeclare = (payInfo.type_montant === '50') ? (window.currentResaData.montant_total / 2) : (window.currentResaData.montant_total);
    if(payInfo.type_montant === 'autre') montantDeclare = parseFloat(document.getElementById('pay-valeur-autre').value) || 0;

    const { error } = await sb.from('reservations').update({
        paiement_methode: payInfo.methode,
        paiement_titulaire: payInfo.titulaire,
        paiement_numero: payInfo.numero,
        paiement_ref: payInfo.ref,
        paiement_type_montant: payInfo.type_montant,
        paiement_montant_declare: montantDeclare
    }).eq('id', currentReservationId);

    if(error) return alert("Erreur mise à jour: " + error.message);

    window.currentResaData.paiement_methode = payInfo.methode;
    window.currentResaData.paiement_titulaire = payInfo.titulaire;
    window.currentResaData.paiement_montant_declare = montantDeclare;
    window.currentResaData.paiement_ref = payInfo.ref;

    document.getElementById('step-2-paiement').style.display = 'none';
    document.getElementById('step-3-download').style.display = 'block';
    ecouterValidationAdmin();
}

function ecouterValidationAdmin() {
    if(!currentReservationId) return;
    realTimeSubscription = sb.channel('suivi-resa-' + currentReservationId)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reservations', filter: `id=eq.${currentReservationId}` },
            (payload) => {
                const newData = payload.new;
                if (newData.code_otp && newData.code_otp.length > 0) {
                    activerBoutonDownload(newData.code_otp);
                }
            }
        ).subscribe();
}

function activerBoutonDownload(code) {
    const input = document.getElementById('input-otp-auto');
    const btn = document.getElementById('btn-dl-pdf');
    const loader = document.querySelector('.otp-loader');

    input.value = code;
    input.style.borderColor = "#2ecc71";
    input.style.color = "#2ecc71";
    input.style.fontWeight = "bold";

    btn.disabled = false;
    btn.classList.add('btn-pdf-active');
    btn.innerHTML = '<i class="fas fa-file-download"></i> TÉLÉCHARGER FACTURE';
    
    if(loader) loader.innerHTML = '<i class="fas fa-check-circle" style="color:green"></i> Paiement Validé par Admin !';
    if(window.currentResaData) window.currentResaData.code_otp = code;
    if(navigator.vibrate) navigator.vibrate(200);
}

function telechargerFactureAuto() {
    if(window.currentResaData) genererPDF(window.currentResaData);
}

function genererPDF(resa) {
    if (!window.jspdf) { alert("Librairie PDF non chargée."); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const now = new Date();
    
    doc.setFillColor(44, 62, 80); doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(22); 
    doc.text("RIJA NIAINA CAR SERVICES", 105, 15, { align: "center" });
    doc.setFontSize(10); 
    doc.text("Siae 33 Ambodifilao, Analakely, Antananarivo 101", 105, 25, { align: "center" });
    doc.text("Tel: +261 38 85 524 32", 105, 32, { align: "center" });

    doc.setTextColor(0, 0, 0); doc.setFontSize(11);
    doc.text(`Date : ${now.toLocaleDateString('fr-FR')}`, 195, 50, { align: "right" });
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(`FACTURE / REÇU N° ${resa.id}`, 14, 60);

    const d1 = new Date(resa.date_debut); const d2 = new Date(resa.date_fin);
    const duree = Math.ceil(Math.abs(d2 - d1) / (86400000)) + 1;
    
    let totalNet = parseFloat(resa.montant_total);
    let promoTxt = "0%";
    let totalBrut = totalNet;

    if (reductionActive > 0) {
        totalBrut = totalNet / (1 - (reductionActive / 100));
        promoTxt = `-${reductionActive}%`;
    }

    let paye = parseFloat(resa.paiement_montant_declare) || 0;
    let reste = totalNet - paye;

    const clientContent = [
        `Nom: ${resa.nom.toUpperCase()} ${resa.prenom}`,
        `Tél: ${resa.tel}`,
        `Adresse: ${resa.adresse || 'Non renseignée'}`
    ].join('\n');

    const voitureContent = [
        `Dates: Du ${resa.date_debut} au ${resa.date_fin}`,
        `Durée: ${duree} jours`,
        `Code Promo: ${promoTxt}`,
        `Total Normal: ${formatPrix(Math.round(totalBrut))} Ar`,
        `Total Remisé: ${formatPrix(totalNet)} Ar`
    ].join('\n');

    const paiementContent = [
        `Méthode: ${resa.paiement_methode === 'mvola' ? 'Mobile Money' : 'Espèces'}`,
        `Montant Payé: ${formatPrix(paye)} Ar`,
        `Reste à Payer: ${formatPrix(reste)} Ar`
    ].join('\n');

    doc.autoTable({
        startY: 70,
        head: [['CLIENT', 'VOITURE & TARIFS', 'PAIEMENT']],
        body: [[clientContent, voitureContent, paiementContent]],
        theme: 'grid',
        headStyles: { fillColor: [52, 152, 219], halign: 'center' },
        styles: { cellPadding: 5, fontSize: 10, valign: 'top' },
        columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 70 }, 2: { cellWidth: 60 } }
    });

    if(resa.code_otp) {
        doc.setFontSize(10); doc.setTextColor(39, 174, 96);
        doc.text(`Validé par Admin - Code: ${resa.code_otp}`, 14, doc.lastAutoTable.finalY + 10);
    }

    doc.save(`Facture_RijaCars_${resa.id}.pdf`);
}

// --- DIVERS (Avis, Contact) ---
async function chargerAvis() {
    const div = document.getElementById('liste-avis');
    const { data } = await sb.from('avis').select('*').eq('visible', true).order('created_at', {ascending:false}).limit(3);
    if(data) {
        div.innerHTML = '';
        data.forEach(a => {
            div.innerHTML += `<div style="background:#f9f9f9; padding:10px; margin-bottom:10px; border-radius:5px;"><strong style="color:#e67e22;">${'⭐'.repeat(a.note)}</strong> <strong>${a.nom}</strong><p style="margin:5px 0 0; color:#555; font-size:0.9rem;">"${a.commentaire}"</p></div>`;
        });
    }
}
async function envoyerAvis() {
    const avis = { nom: document.getElementById('avis-nom').value, note: document.getElementById('avis-note').value, commentaire: document.getElementById('avis-commentaire').value, visible: false };
    if(avis.nom && avis.commentaire) { await sb.from('avis').insert([avis]); alert("Avis envoyé ! (En attente de validation)"); }
}

async function chargerMedia(table) {
    const container = document.getElementById('conteneur-media');
    const { data } = await sb.from(table).select('*').eq('actif', true);
    container.innerHTML = '';
    if(data) data.forEach(item => {
        let content = '';
        if(table === 'radios') content = `<div class="carte-voiture" style="text-align:center; padding:20px;"><img src="${item.image_url}" style="height:100px; width:auto; border-radius:50%; margin-bottom:10px;"><h3>${item.nom}</h3><audio controls src="${item.url_flux}" style="width:100%; margin-top:10px;"></audio></div>`;
        else content = `<div class="carte-voiture"><iframe src="${item.url_embed}" width="100%" height="300" frameborder="0" allowtransparency="true" allow="encrypted-media"></iframe></div>`;
        container.innerHTML += content;
    });
}

function envoyerContactWhatsApp() {
    const sujet = document.getElementById('contact-sujet').value;
    const msg = document.getElementById('contact-message').value;
    const nom = document.getElementById('contact-nom').value;
    window.open(`https://wa.me/261388552432?text=${encodeURIComponent(`[${sujet}] De: ${nom}\n\n${msg}`)}`, '_blank');
}

async function chargerPublicites() {
    const { data } = await sb.from('publicites').select('*').eq('actif', true);
    if(data) data.forEach(pub => {
        const zone = document.getElementById(`pub-${pub.emplacement}`);
        if(zone) {
            zone.style.display = 'block';
            zone.innerHTML = `<a href="${pub.lien_redirection}" target="_blank"><img src="${pub.image_url}" alt="Publicité ${pub.societe}"></a>`;
        }
    });
}

// MODALES
function ouvrirModalConditions() { document.getElementById('modal-conditions').style.display = 'flex'; }
function fermerModalConditions() { document.getElementById('modal-conditions').style.display = 'none'; }