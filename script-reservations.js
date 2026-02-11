let sb = null;

// Variables Globales
let currentCarId = null;
let currentCarReservations = [];
let reductionActive = 0;
let calendar = null;
let currentReservationId = null;
let windowResaData = null; // Stockage données réservation

// --- 1. DÉMARRAGE & URL PARAMS ---
document.addEventListener('DOMContentLoaded', async () => {
    // Récupération des paramètres URL
    const params = new URLSearchParams(window.location.search);
    currentCarId = params.get('id');
    const nomVoiture = params.get('nom');
    const prixVoiture = params.get('prix');
    const refVoiture = params.get('ref');

    if (!currentCarId) {
        alert("Aucune voiture sélectionnée. Retour au catalogue.");
        window.location.href = 'index.html'; // Redirection si pas d'ID
        return;
    }

    // Remplissage des champs cachés et interface
    document.getElementById('titre-page').innerText = `Réservation : ${nomVoiture}`;
    document.getElementById('id-voiture-input').value = currentCarId;
    document.getElementById('nom-voiture-hidden').value = nomVoiture;
    document.getElementById('prix-base-input').value = prixVoiture;
    document.getElementById('ref-voiture-input').value = refVoiture || '';

    // Initialisation Calendrier
    await initCalendar(currentCarId);
});

// --- HELPER PRIX ---
function formatPrix(prix) {
    return prix.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// --- 2. CALENDRIER & DISPONIBILITÉ ---
async function initCalendar(idVoiture) {
    const calendarEl = document.getElementById('calendrier-dispo');
    
    // Récupération Réservations & Maintenance depuis Supabase
    const { data: resas } = await sb.from('reservations').select('id, date_debut, date_fin').eq('id_voiture', idVoiture).eq('statut', 'valide');
    const { data: maints } = await sb.from('maintenances').select('date_debut, date_fin').eq('id_voiture', idVoiture);

    currentCarReservations = [];
    let events = [];

    if(resas) {
        resas.forEach(r => {
            currentCarReservations.push({ start: new Date(r.date_debut), end: new Date(r.date_fin) });
            // FullCalendar exclut la date de fin, donc on ajoute +1 jour visuellement
            let fin = new Date(r.date_fin); fin.setDate(fin.getDate() + 1);
            events.push({ 
                title: 'Loué', start: r.date_debut, end: fin.toISOString().split('T')[0], 
                display: 'background', color: '#e74c3c' 
            });
        });
    }
    if(maints) {
        maints.forEach(m => {
            currentCarReservations.push({ start: new Date(m.date_debut), end: new Date(m.date_fin) });
            let fin = new Date(m.date_fin); fin.setDate(fin.getDate() + 1);
            events.push({ 
                title: 'Maintenance', start: m.date_debut, end: fin.toISOString().split('T')[0], 
                display: 'background', color: '#c0392b' 
            });
        });
    }

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth', locale: 'fr', height: 'auto', events: events,
        headerToolbar: { left: 'prev,next', center: 'title', right: '' },
        validRange: { start: new Date().toISOString().split('T')[0] }, // Pas de date passée
        dateClick: function(info) {
            let dDebut = document.getElementById('date-debut');
            let dFin = document.getElementById('date-fin');
            
            // Logique de sélection simple (Début puis Fin)
            if(!dDebut.value || (dDebut.value && dFin.value)) { 
                dDebut.value = info.dateStr; 
                dFin.value = ""; 
            } else { 
                if (new Date(info.dateStr) < new Date(dDebut.value)) { 
                    dDebut.value = info.dateStr; dFin.value = ""; 
                } else { 
                    dFin.value = info.dateStr; 
                } 
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
        // Chevauchement de dates
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
        
        // Gestion Formule (Jour/Nuit/24h)
        const radioOffre = document.querySelector('input[name="offre"]:checked');
        if (radioOffre) {
            formuleChoisie = radioOffre.value; 
            if (formuleChoisie === 'nuit') multiplier = 1.5;
            if (formuleChoisie === '24h') multiplier = 2;
        }

        let coutLocation = diffDays * prixBase * multiplier;
        
        // Remises dégressives
        if (diffDays >= 7 && diffDays < 30) { coutLocation = coutLocation * 0.90; } // -10%
        else if (diffDays >= 30) { coutLocation = coutLocation * 0.85; } // -15%

        // Code Promo
        if (reductionActive > 0) {
            coutLocation = coutLocation * (1 - (reductionActive / 100));
        }

        // Options Logistiques
        let fraisOptions = 0;
        if (document.getElementById('opt-livraison').checked) fraisOptions += 15000;
        if (document.getElementById('opt-recuperation').checked) fraisOptions += 15000;

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

async function verifierPromo() {
    const codeInput = document.getElementById('code-promo');
    const msg = document.getElementById('msg-promo');
    const code = codeInput.value.toUpperCase().trim();
    const dateDebut = document.getElementById("date-debut").value;
    const dateFin = document.getElementById("date-fin").value;

    if(!dateDebut || !dateFin) { msg.innerText = "⚠️ Sélectionnez d'abord vos dates"; return; }

    const d1 = new Date(dateDebut); const d2 = new Date(dateFin);
    const diffDays = Math.ceil(Math.abs(d2 - d1) / (86400000)) + 1;

    // Appel Supabase
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

// --- 4. WORKFLOW : RÉSERVATION WHATSAPP ---
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
        alert("❌ Ces dates ne sont plus disponibles."); return; 
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
    step2.scrollIntoView({behavior:'smooth'});
}

// --- 5. GESTION UI PAIEMENT ---
function togglePaymentFields() {
    const method = document.getElementById('pay-method').value;
    document.getElementById('fields-mvola').style.display = (method === 'mvola') ? 'block' : 'none';
    document.getElementById('fields-espece').style.display = (method === 'espece') ? 'block' : 'none';
    document.getElementById('fields-montant').style.display = method ? 'block' : 'none';
}

function toggleAutreMontant() {
    const val = document.getElementById('pay-choix-montant').value;
    document.getElementById('field-autre-montant').style.display = (val === 'autre') ? 'block' : 'none';
}

// --- 6. ENVOI PREUVE PAIEMENT ---
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
    document.getElementById('step-3-download').style.display = 'block';
    
    // Lancement écouteur temps réel
    ecouterValidationAdmin();
}

// --- 7. REALTIME & VALIDATION ---
function ecouterValidationAdmin() {
    if(!currentReservationId) return;
    
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
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const now = new Date();
    
    // Header Bleu
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
