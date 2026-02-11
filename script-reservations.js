// --- 0. FONCTION DU MENU & UTILS (Tout en haut) ---
function toggleMenu() { 
    const nav = document.getElementById('nav-menu');
    if(nav) nav.classList.toggle('active');
}

// Fonction Couleur Aléatoire (Pour le calendrier)
function genererCouleur(id) {
    const couleurs = ['#3498db', '#9b59b6', '#2ecc71', '#f1c40f', '#1abc9c', '#34495e', '#e67e22', '#16a085', '#8e44ad', '#2980b9'];
    if (!id) return couleurs[Math.floor(Math.random() * couleurs.length)];
    let hash = 0; for (let i = 0; i < id.toString().length; i++) { hash = id.toString().charCodeAt(i) + ((hash << 5) - hash); }
    return couleurs[Math.abs(hash) % couleurs.length];
}

// --- NAVIGATION GENERIQUE ---
function naviguerVers(pageId) {
    const sections = document.querySelectorAll('.page-section');
    sections.forEach(sec => sec.style.display = 'none');
    
    const activeSection = document.getElementById(pageId);
    if(activeSection) activeSection.style.display = 'block';

    window.scrollTo(0,0);
    const menu = document.getElementById('nav-menu');
    if (menu && menu.classList.contains('active')) menu.classList.remove('active');
}

// --- CONFIGURATION SUPABASE ---
const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';

let sb = null;
try {
    // On vérifie si la librairie est chargée avant d'initier
    if(typeof supabase !== 'undefined') {
        sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
        console.error("Librairie Supabase non chargée dans le HTML.");
    }
} catch (e) {
    console.error("Erreur Supabase (Probablement hors ligne)", e);
}

// --- VARIABLES GLOBALES ---
let calendar;
let currentCarId = null;
let currentCarReservations = []; // Stocke les plages indisponibles pour vérification JS
let reductionActive = 0; 
let currentReservationId = null; 
let windowResaData = null; // Données locales de la résa en cours

// --- 1. DÉMARRAGE (DOMContentLoaded) ---
document.addEventListener('DOMContentLoaded', async () => {
    // Récupération des paramètres URL (ex: reservations.html?id=12&nom=Peugeot&prix=100000)
    const params = new URLSearchParams(window.location.search);
    currentCarId = params.get('id');
    const nomVoiture = params.get('nom');
    const prixVoiture = params.get('prix');
    const refVoiture = params.get('ref');

    if (!currentCarId) {
        console.warn("Aucun ID de voiture dans l'URL.");
        // Optionnel : rediriger ou afficher un message
    } else {
        // Mise à jour de l'interface avec les infos URL
        const titreEl = document.getElementById('titre-page');
        if(titreEl) titreEl.innerText = `Réservation : ${nomVoiture || 'Voiture'}`;
        
        const inputId = document.getElementById('id-voiture-input');
        if(inputId) inputId.value = currentCarId;
        
        const inputNom = document.getElementById('nom-voiture-hidden');
        if(inputNom) inputNom.value = nomVoiture;

        const inputPrix = document.getElementById('prix-base-input');
        if(inputPrix) inputPrix.value = prixVoiture;

        const inputRef = document.getElementById('ref-voiture-input');
        if(inputRef) inputRef.value = refVoiture || '';
        
        // Initialisation du calendrier
        await initCalendar(currentCarId);
    }
});

// --- HELPER FORMAT PRIX ---
function formatPrix(prix) {
    if(!prix) return "0";
    return prix.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// --- 2. CALENDRIER & LOGIQUE DE SÉLECTION ---
async function initCalendar(idVoiture) {
    const calendarEl = document.getElementById('calendrier-dispo');
    if(!calendarEl) return; // Sécurité si l'élément n'existe pas

    currentCarReservations = [];
    let events = [];

    // Récupération des données SI Supabase est connecté
    if(sb) {
        const { data: resas } = await sb.from('reservations')
            .select('id, date_debut, date_fin')
            .eq('id_voiture', idVoiture)
            .eq('statut', 'valide'); // On ne prend que les validées
        
        const { data: maints } = await sb.from('maintenances')
            .select('date_debut, date_fin')
            .eq('id_voiture', idVoiture);

        if(resas) {
            resas.forEach(r => {
                currentCarReservations.push({ start: new Date(r.date_debut), end: new Date(r.date_fin) });
                // FullCalendar exclut la date de fin visuellement, on ajoute +1 jour
                let fin = new Date(r.date_fin); fin.setDate(fin.getDate() + 1);
                events.push({ 
                    title: 'Loué', 
                    start: r.date_debut, 
                    end: fin.toISOString().split('T')[0], 
                    display: 'background', 
                    color: genererCouleur(r.id) // Utilisation de ta fonction couleur
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
                    color: '#c0392b' 
                });
            });
        }
    }

    // Initialisation FullCalendar
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth', 
        locale: 'fr', 
        height: 'auto', 
        events: events,
        headerToolbar: { left: 'prev,next', center: 'title', right: '' },
        validRange: { start: new Date().toISOString().split('T')[0] }, // Empêcher dates passées

        // LOGIQUE DE CLIC (DÉBUT / FIN)
        dateClick: function(info) {
            let dDebut = document.getElementById('date-debut');
            let dFin = document.getElementById('date-fin');
            
            // Cas 1: Rien n'est sélectionné OU les deux sont déjà remplis (on reset)
            if(!dDebut.value || (dDebut.value && dFin.value)) { 
                dDebut.value = info.dateStr; 
                dFin.value = ""; 
            } 
            // Cas 2: Date de début existe, on essaie de mettre la fin
            else { 
                // Si la nouvelle date est AVANT le début, elle devient le nouveau début
                if (new Date(info.dateStr) < new Date(dDebut.value)) { 
                    dDebut.value = info.dateStr; 
                    dFin.value = ""; 
                } else { 
                    // Sinon c'est la date de fin
                    dFin.value = info.dateStr; 
                } 
            }
            // On lance le calcul à chaque clic
            calculerPrix();
        }
    });
    calendar.render();
}

// Vérifie si la période sélectionnée chevauche une réservation existante
function verifierDisponibilite(debut, fin) {
    let d1 = new Date(debut);
    let d2 = new Date(fin);
    for (let resa of currentCarReservations) {
        if (d1 <= resa.end && d2 >= resa.start) { return false; }
    }
    return true; 
}

// --- 3. CALCULATEUR FINANCIER ---
function faireLeCalculMathematique() {
    const rawPrix = document.getElementById('prix-base-input').value;
    const prixBase = parseInt(rawPrix);
    
    const dateDebut = document.getElementById("date-debut").value;
    const dateFin = document.getElementById("date-fin").value;

    if (dateDebut && dateFin && prixBase) {
        const d1 = new Date(dateDebut); const d2 = new Date(dateFin);
        const diffTime = Math.abs(d2 - d1);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
        
        let multiplier = 1;
        let formuleChoisie = "Jour";
        
        // Gestion Formule via Radio Boutons
        const radioOffre = document.querySelector('input[name="offre"]:checked');
        if (radioOffre) {
            formuleChoisie = radioOffre.value; 
            if (formuleChoisie === 'nuit') multiplier = 1.5;
            if (formuleChoisie === '24h') multiplier = 2;
        }

        let coutLocation = diffDays * prixBase * multiplier;
        
        // Logique de remise longue durée
        if (diffDays >= 7 && diffDays < 30) { coutLocation = coutLocation * 0.90; } // -10%
        else if (diffDays >= 30) { coutLocation = coutLocation * 0.85; } // -15%

        // Application Code Promo
        if (reductionActive > 0) {
            coutLocation = coutLocation * (1 - (reductionActive / 100));
        }

        // Options Logistiques
        let fraisOptions = 0;
        const optLiv = document.getElementById('opt-livraison');
        const optRec = document.getElementById('opt-recuperation');
        if (optLiv && optLiv.checked) fraisOptions += 15000;
        if (optRec && optRec.checked) fraisOptions += 15000;

        let totalFinal = coutLocation + fraisOptions;

        return { 
            ok: true, 
            total: Math.round(totalFinal), 
            acompte: Math.round(totalFinal * 0.5), 
            offre: formuleChoisie, 
            duree: diffDays 
        };
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

// Vérification Code Promo via Supabase
async function verifierPromo() {
    if(!sb) return; // Pas de connexion

    const codeInput = document.getElementById('code-promo');
    const msg = document.getElementById('msg-promo');
    const code = codeInput.value.toUpperCase().trim();
    const dateDebut = document.getElementById("date-debut").value;
    const dateFin = document.getElementById("date-fin").value;

    if(!dateDebut || !dateFin) { msg.innerText = "⚠️ Sélectionnez d'abord vos dates"; return; }

    const d1 = new Date(dateDebut); const d2 = new Date(dateFin);
    const diffDays = Math.ceil(Math.abs(d2 - d1) / (86400000)) + 1;

    const { data } = await sb.from('codes_promo').select('*').eq('code', code).eq('actif', true).single();
    
    if(data) { 
        if (dateDebut < data.date_debut || dateDebut > data.date_fin) {
            reductionActive = 0; msg.innerText = `❌ Code expiré`; msg.style.color = "red";
        } else if (diffDays < data.min_jours) {
            reductionActive = 0; msg.innerText = `❌ Min. ${data.min_jours} jours requis`; msg.style.color = "red";
        } else {
            reductionActive = data.reduction_pourcent; 
            msg.innerText = `✅ -${reductionActive}% appliqué !`; 
            msg.style.color = "green"; 
        }
    } else { 
        reductionActive = 0; msg.innerText = "❌ Code invalide"; msg.style.color = "red"; 
    }
    calculerPrix();
}

// --- 4. INTERFACE PAIEMENT (Tes fonctions demandées) ---
function togglePaymentFields() {
    const method = document.getElementById('pay-method').value;
    
    // Masquage par défaut
    document.getElementById('fields-mvola').style.display = 'none';
    document.getElementById('fields-espece').style.display = 'none';
    document.getElementById('fields-montant').style.display = 'none';

    // Affichage conditionnel
    if(method === 'mvola') document.getElementById('fields-mvola').style.display = 'block';
    if(method === 'espece') document.getElementById('fields-espece').style.display = 'block';
    
    // Si une méthode est choisie (différent de vide), on affiche le choix du montant
    if(method !== '') document.getElementById('fields-montant').style.display = 'block';
}

function toggleAutreMontant() {
    const choix = document.getElementById('pay-choix-montant').value;
    document.getElementById('field-autre-montant').style.display = (choix === 'autre') ? 'block' : 'none';
}

// --- 5. WORKFLOW : RÉSERVATION WHATSAPP ---
async function lancerReservationWhatsApp() {
    if(!sb) return alert("Système hors ligne, impossible d'enregistrer.");

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
        alert("❌ Ces dates ne sont plus disponibles (chevauchement)."); return; 
    }

    const urgence = {
        nom: document.getElementById('urgence-nom').value,
        adresse: document.getElementById('urgence-adresse').value,
        tel: document.getElementById('urgence-tel').value
    };

    const reservationData = {
        id_voiture: currentCarId,
        date_debut: document.getElementById('date-debut').value,
        date_fin: document.getElementById('date-fin').value,
        nom: client.nom, prenom: client.prenom, adresse: client.adresse, tel: client.tel,
        cin_passeport: client.cin,
        urgence_nom: urgence.nom, urgence_adresse: urgence.adresse, urgence_tel: urgence.tel,
        type_offre: calcul.offre,
        montant_total: calcul.total, 
        statut: 'en_attente'
    };

    // 1. Sauvegarde Client (Upsert)
    await sb.from('clients').upsert({ nom: client.nom, tel: client.tel }, { onConflict: 'tel' });
    
    // 2. Création Réservation
    const { data, error } = await sb.from('reservations').insert([reservationData]).select();

    if(error) return alert("Erreur connexion: " + error.message);

    currentReservationId = data[0].id;
    windowResaData = data[0]; // Stockage local

    // 3. Envoi WhatsApp
    let voitureNom = document.getElementById("nom-voiture-hidden").value;
    let msg = `Bonjour Rija,\nDemande de réservation *${voitureNom}* (Ref #${currentReservationId}).\n`;
    msg += `📅 Du ${reservationData.date_debut} au ${reservationData.date_fin}\n`;
    msg += `💰 Total: ${formatPrix(calcul.total)} Ar (Acompte: ${formatPrix(calcul.acompte)} Ar)\n`;
    msg += `👤 ${client.nom} ${client.prenom}\n`;
    msg += `📞 ${client.tel}\n\n`;
    msg += `Je procède au paiement sur le site.`;

    window.open(`https://wa.me/261388552432?text=${encodeURIComponent(msg)}`, '_blank');

    // 4. Transition UI
    document.getElementById('step-1-configuration').style.display = 'none';
    const step2 = document.getElementById('step-2-paiement');
    step2.style.display = 'block';
    step2.classList.remove('hidden-step'); // Au cas où la classe CSS cache l'élément
    step2.scrollIntoView({behavior:'smooth'});
}

// --- 6. ENVOI PREUVE PAIEMENT ---
async function envoyerInfosPaiement() {
    if(!currentReservationId || !sb) return alert("Erreur système ou ID manquant.");

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

    // Calcul montant déclaré
    let montantDeclare = 0;
    if(payInfo.type_montant === '50') montantDeclare = windowResaData.montant_total / 2;
    else if(payInfo.type_montant === '100') montantDeclare = windowResaData.montant_total;
    else montantDeclare = parseFloat(document.getElementById('pay-valeur-autre').value) || 0;

    // Mise à jour Supabase
    const { error } = await sb.from('reservations').update({
        paiement_methode: payInfo.methode,
        paiement_titulaire: payInfo.titulaire,
        paiement_numero: payInfo.numero,
        paiement_ref: payInfo.ref,
        paiement_type_montant: payInfo.type_montant,
        paiement_montant_declare: montantDeclare
    }).eq('id', currentReservationId);

    if(error) return alert("Erreur mise à jour: " + error.message);

    // Mise à jour locale
    windowResaData.paiement_methode = payInfo.methode;
    windowResaData.paiement_titulaire = payInfo.titulaire;
    windowResaData.paiement_montant_declare = montantDeclare;
    windowResaData.paiement_ref = payInfo.ref;

    // Transition UI
    document.getElementById('step-2-paiement').style.display = 'none';
    const step3 = document.getElementById('step-3-download');
    step3.style.display = 'block';
    step3.classList.remove('hidden-step');
    
    // Lancement écouteur temps réel
    ecouterValidationAdmin();
}

// --- 7. REALTIME & VALIDATION ---
function ecouterValidationAdmin() {
    if(!currentReservationId || !sb) return;
    
    // Abonnement aux changements sur CETTE réservation
    sb.channel('suivi-resa-' + currentReservationId)
        .on('postgres_changes', 
            { event: 'UPDATE', schema: 'public', table: 'reservations', filter: `id=eq.${currentReservationId}` },
            (payload) => {
                const newData = payload.new;
                // Si l'admin a ajouté un code OTP
                if (newData.code_otp && newData.code_otp.length > 0) {
                    activerBoutonDownload(newData.code_otp);
                }
            }
        ).subscribe();
}

function activerBoutonDownload(code) {
    const input = document.getElementById('input-otp-auto');
    const btn = document.getElementById('btn-dl-pdf');
    const loader = document.getElementById('loader-msg');

    input.value = code;
    input.style.borderColor = "#2ecc71";
    input.style.color = "#2ecc71";
    input.style.fontWeight = "bold";

    btn.disabled = false;
    btn.classList.add('btn-pdf-active');
    btn.innerHTML = '<i class="fas fa-file-download"></i> TÉLÉCHARGER FACTURE';
    
    loader.innerHTML = '<i class="fas fa-check-circle" style="color:green"></i> Paiement Validé par Admin !';
    windowResaData.code_otp = code;
    
    if(navigator.vibrate) navigator.vibrate(200);
}

// --- 8. GÉNÉRATION PDF ---
function telechargerFactureAuto() {
    if(windowResaData) genererPDF(windowResaData);
}

function genererPDF(resa) {
    // Vérification de jsPDF
    if (!window.jspdf) return alert("Erreur: Librairie PDF manquante.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const now = new Date();
    
    // Header
    doc.setFillColor(44, 62, 80); doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(22); 
    doc.text("RIJA NIAINA CAR SERVICES", 105, 15, { align: "center" });
    doc.setFontSize(10); 
    doc.text("Antananarivo, Madagascar", 105, 25, { align: "center" });
    doc.text("Tel: +261 38 85 524 32", 105, 32, { align: "center" });

    // Infos Facture
    doc.setTextColor(0, 0, 0); doc.setFontSize(11);
    doc.text(`Date : ${now.toLocaleDateString('fr-FR')}`, 195, 50, { align: "right" });
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(`REÇU DE RÉSERVATION N° ${resa.id}`, 14, 60);

    // Calculs pour affichage
    const d1 = new Date(resa.date_debut); const d2 = new Date(resa.date_fin);
    const duree = Math.ceil(Math.abs(d2 - d1) / (86400000)) + 1;
    
    let totalNet = parseFloat(resa.montant_total);
    let paye = parseFloat(resa.paiement_montant_declare) || 0;
    let reste = totalNet - paye;

    // Contenu Tableau
    const clientContent = [
        `Client: ${resa.nom.toUpperCase()} ${resa.prenom}`,
        `Tél: ${resa.tel}`,
        `Adresse: ${resa.adresse || 'Non renseignée'}`,
        `CIN: ${resa.cin_passeport || '-'}`
    ].join('\n');

    const voitureContent = [
        `Véhicule: ${document.getElementById('nom-voiture-hidden').value}`,
        `Du ${resa.date_debut} au ${resa.date_fin}`,
        `Durée: ${duree} jours`,
        `Formule: ${resa.type_offre || 'Standard'}`,
        `TOTAL: ${formatPrix(totalNet)} Ar`
    ].join('\n');

    const paiementContent = [
        `Méthode: ${resa.paiement_methode === 'mvola' ? 'Mobile Money' : 'Espèces'}`,
        `Ref: ${resa.paiement_ref || '-'}`,
        `Payé: ${formatPrix(paye)} Ar`,
        `RESTE À PAYER: ${formatPrix(reste)} Ar`
    ].join('\n');

    doc.autoTable({
        startY: 70,
        head: [['DETAILS CLIENT', 'LOCATION', 'ÉTAT PAIEMENT']],
        body: [[clientContent, voitureContent, paiementContent]],
        theme: 'grid',
        headStyles: { fillColor: [52, 152, 219], halign: 'center' },
        styles: { cellPadding: 5, fontSize: 10, valign: 'top' }
    });

    // Pied de page validation
    if(resa.code_otp) {
        doc.setFontSize(12); doc.setTextColor(39, 174, 96); doc.setFont("helvetica", "bold");
        doc.text(`DOCUMENT VALIDÉ - CODE: ${resa.code_otp}`, 105, doc.lastAutoTable.finalY + 20, { align: "center" });
    }

    doc.save(`Recu_RijaCars_${resa.id}.pdf`);
}
