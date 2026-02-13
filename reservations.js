// --- VARIABLES GLOBALES ---
let sb = null;
let siteConfig = null;
let calendar = null;
let currentCarId = null;
let currentCarReservations = [];
let reductionActive = 0;
let currentReservationId = null;
let voitureSelectionnee = null;
let realTimeSubscription = null;

// --- INITIALISATION ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initSupabase();
        await loadSiteConfig();
        await chargerDetailsVoiture();
    } catch (error) {
        console.error('Erreur initialisation page réservations :', error);
        document.getElementById('titre-page').textContent = 'Erreur de chargement';
    }
});

/* ---------- INITIALISATION SUPABASE ---------- */
async function initSupabase() {
    const response = await fetch('supabase-config.json');
    if (!response.ok) throw new Error('supabase-config.json introuvable');
    const { supabaseUrl, supabaseKey } = await response.json();
    sb = supabase.createClient(supabaseUrl, supabaseKey);
}

/* ---------- CONFIGURATION SITE ---------- */
async function loadSiteConfig() {
    const response = await fetch('site_config.json');
    if (!response.ok) throw new Error('site_config.json introuvable');
    siteConfig = await response.json();

    // Header
    setText('header-site-name', siteConfig.header.siteName);
    setAttr('header-logo', 'src', siteConfig.header.logoUrl);
    
    // Footer
    setText('footer-title', siteConfig.header.siteName);
    setText('footer-address', siteConfig.footer.address);
    setText('footer-nif', siteConfig.footer.nif);
    setText('footer-stat', siteConfig.footer.stat);
    setText('footer-phone', siteConfig.contact.phoneDisplay);

    // Réseaux sociaux
    const socials = document.getElementById('footer-socials');
    if (socials) {
        socials.innerHTML = '';
        const icons = { 
            facebook: 'fab fa-facebook', 
            instagram: 'fab fa-instagram', 
            tiktok: 'fab fa-tiktok' 
        };
        Object.entries(siteConfig.footer.socials || {}).forEach(([network, url]) => {
            if (!url || url === '#') return;
            socials.innerHTML += `
                <a href="${url}" target="_blank" rel="noopener"
                   style="color:white;margin:0 8px;font-size:1.3rem;">
                  <i class="${icons[network] || 'fas fa-globe'}"></i>
                </a>`;
        });
    }
}

/* ---------- CHARGEMENT DÉTAILS VOITURE ---------- */
async function chargerDetailsVoiture() {
    // Récupération des paramètres URL
    const params = new URLSearchParams(window.location.search);
    currentCarId = params.get('id');
    const nomVoiture = params.get('nom');
    const prixVoiture = params.get('prix');
    const refVoiture = params.get('ref');

    if (!currentCarId) {
        console.warn("Aucun ID de voiture dans l'URL.");
        document.getElementById('titre-page').textContent = 'Erreur : Véhicule non spécifié';
        return;
    }

    // Mise à jour de l'interface avec les infos URL
    const titreEl = document.getElementById('titre-page');
    if (titreEl) titreEl.textContent = `Réservation : ${nomVoiture || 'Voiture'}`;
    
    // Remplissage des champs cachés
    setValue('id-voiture-input', currentCarId);
    setValue('nom-voiture-hidden', nomVoiture);
    setValue('prix-base-input', prixVoiture);
    setValue('ref-voiture-input', refVoiture || '');

    // Initialisation du calendrier
    await initCalendar(currentCarId);
}

/* ---------- CALENDRIER ---------- */
async function initCalendar(idVoiture) {
    const calendarEl = document.getElementById('calendrier-dispo');
    if (!calendarEl) return;

    if (calendar) calendar.destroy();

    currentCarReservations = [];
    let events = [];

    // Récupération des réservations et maintenances
    if (sb) {
        const { data: resas } = await sb
            .from('reservations')
            .select('id, date_debut, date_fin')
            .eq('id_voiture', idVoiture)
            .eq('statut', 'valide');
        
        const { data: maints } = await sb
            .from('maintenances')
            .select('date_debut, date_fin')
            .eq('id_voiture', idVoiture);

        if (resas) {
            resas.forEach(r => {
                currentCarReservations.push({ 
                    start: new Date(r.date_debut), 
                    end: new Date(r.date_fin) 
                });
                
                let fin = new Date(r.date_fin);
                fin.setDate(fin.getDate() + 1);
                events.push({ 
                    title: 'Loué', 
                    start: r.date_debut, 
                    end: fin.toISOString().split('T')[0], 
                    display: 'background', 
                    color: genererCouleur(r.id)
                });
            });
        }

        if (maints) {
            maints.forEach(m => {
                currentCarReservations.push({ 
                    start: new Date(m.date_debut), 
                    end: new Date(m.date_fin) 
                });
                
                let fin = new Date(m.date_fin);
                fin.setDate(fin.getDate() + 1);
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
        headerToolbar: { 
            left: 'prev,next', 
            center: 'title', 
            right: '' 
        },
        validRange: { 
            start: new Date().toISOString().split('T')[0] 
        },
        dateClick: function(info) {
            const dDebut = document.getElementById('date-debut');
            const dFin = document.getElementById('date-fin');
            
            if (!dDebut.value || (dDebut.value && dFin.value)) { 
                dDebut.value = info.dateStr; 
                dFin.value = ""; 
            } else { 
                if (new Date(info.dateStr) < new Date(dDebut.value)) { 
                    dDebut.value = info.dateStr; 
                    dFin.value = ""; 
                } else { 
                    dFin.value = info.dateStr; 
                } 
            }
            calculerPrix();
        }
    });
    
    calendar.render();
}

/* ---------- VÉRIFICATION DISPONIBILITÉ ---------- */
function verifierDisponibilite(debut, fin) {
    const d1 = new Date(debut);
    const d2 = new Date(fin);
    
    for (let resa of currentCarReservations) {
        if (d1 <= resa.end && d2 >= resa.start) { 
            return false; 
        }
    }
    return true; 
}

/* ---------- UTILITAIRES ---------- */
function genererCouleur(id) {
    const couleurs = ['#3498db', '#9b59b6', '#2ecc71', '#f1c40f', '#1abc9c', '#34495e', '#e67e22', '#16a085', '#8e44ad', '#2980b9'];
    if (!id) return couleurs[Math.floor(Math.random() * couleurs.length)];
    let hash = 0;
    for (let i = 0; i < id.toString().length; i++) {
        hash = id.toString().charCodeAt(i) + ((hash << 5) - hash);
    }
    return couleurs[Math.abs(hash) % couleurs.length];
}

function formatPrix(prix) {
    if (!prix) return "0";
    return prix.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text ?? '';
}

function setAttr(id, attr, value) {
    const el = document.getElementById(id);
    if (el) el.setAttribute(attr, value ?? '');
}

function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
}

function toggleMenu() {
    const menu = document.getElementById('nav-menu');
    if (menu) {
        menu.classList.toggle('active');
    }
}
/* ---------- CALCULS FINANCIERS ---------- */
function faireLeCalculMathematique() {
    const rawPrix = document.getElementById('prix-base-input').value;
    const prixBase = parseInt(rawPrix);
    
    const dateDebut = document.getElementById("date-debut").value;
    const dateFin = document.getElementById("date-fin").value;

    if (dateDebut && dateFin && prixBase) {
        const d1 = new Date(dateDebut);
        const d2 = new Date(dateFin);
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
        if (diffDays >= 7 && diffDays < 30) { 
            coutLocation = coutLocation * 0.90; // -10%
        } else if (diffDays >= 30) { 
            coutLocation = coutLocation * 0.85; // -15%
        }

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
    if (res.ok) {
        setText("prix-total", formatPrix(res.total));
        setText("prix-acompte", formatPrix(res.acompte));
        setText("txt-jours", res.duree);
        setText("txt-formule", res.offre);
    }
}

/* ---------- VÉRIFICATION CODE PROMO ---------- */
async function verifierPromo() {
    if (!sb) return;

    const codeInput = document.getElementById('code-promo');
    const msg = document.getElementById('msg-promo');
    const code = codeInput.value.toUpperCase().trim();
    const dateDebut = document.getElementById("date-debut").value;
    const dateFin = document.getElementById("date-fin").value;

    if (!dateDebut || !dateFin) { 
        msg.innerText = "⚠️ Sélectionnez d'abord vos dates"; 
        msg.style.color = "#e67e22";
        return; 
    }

    const d1 = new Date(dateDebut);
    const d2 = new Date(dateFin);
    const diffDays = Math.ceil(Math.abs(d2 - d1) / (86400000)) + 1;

    const { data, error } = await sb
        .from('codes_promo')
        .select('*')
        .eq('code', code)
        .eq('actif', true)
        .maybeSingle();
    
    if (data && !error) { 
        const today = new Date().toISOString().split('T')[0];
        
        if (today < data.date_debut || today > data.date_fin) {
            reductionActive = 0; 
            msg.innerText = `❌ Code expiré`; 
            msg.style.color = "red";
        } else if (diffDays < (data.min_jours || 1)) {
            reductionActive = 0; 
            msg.innerText = `❌ Min. ${data.min_jours || 1} jours requis`; 
            msg.style.color = "red";
        } else {
            reductionActive = data.reduction_pourcent || data.pourcentage || 0; 
            msg.innerText = `✅ -${reductionActive}% appliqué !`; 
            msg.style.color = "green"; 
        }
    } else { 
        reductionActive = 0; 
        msg.innerText = "❌ Code invalide"; 
        msg.style.color = "red"; 
    }
    calculerPrix();
}

/* ---------- WORKFLOW RÉSERVATION ---------- */
async function lancerReservationWhatsApp() {
    if (!sb) return alert("Système hors ligne, impossible d'enregistrer.");

    const conditions = document.getElementById('check-conditions-step1').checked;
    if (!conditions) return alert("Veuillez accepter les conditions générales.");

    const client = {
        nom: document.getElementById('loueur-nom').value.trim(),
        prenom: document.getElementById('loueur-prenom').value.trim(),
        tel: document.getElementById('loueur-tel').value.trim(),
        adresse: document.getElementById('loueur-adresse').value.trim(),
        cin: document.getElementById('loueur-cin').value.trim()
    };
    
    if (!client.nom || !client.tel || !client.cin) {
        return alert("Merci de remplir Nom, Téléphone et CIN.");
    }

    const calcul = faireLeCalculMathematique();
    if (!calcul.ok) return alert("Dates invalides");

    if (!verifierDisponibilite(
        document.getElementById('date-debut').value, 
        document.getElementById('date-fin').value
    )) { 
        alert("❌ Ces dates ne sont plus disponibles (chevauchement)."); 
        return; 
    }

    const urgence = {
        nom: document.getElementById('urgence-nom').value.trim(),
        adresse: document.getElementById('urgence-adresse').value.trim(),
        tel: document.getElementById('urgence-tel').value.trim()
    };

    const reservationData = {
        id_voiture: currentCarId,
        date_debut: document.getElementById('date-debut').value,
        date_fin: document.getElementById('date-fin').value,
        nom: client.nom,
        prenom: client.prenom,
        adresse: client.adresse,
        tel: client.tel,
        cin_passeport: client.cin,
        urgence_nom: urgence.nom,
        urgence_adresse: urgence.adresse,
        urgence_tel: urgence.tel,
        type_offre: calcul.offre,
        montant_total: calcul.total, 
        statut: 'en_attente'
    };

    try {
        // 1. Sauvegarde Client (Upsert)
        await sb.from('clients').upsert(
            { nom: client.nom, tel: client.tel }, 
            { onConflict: 'tel' }
        );
        
        // 2. Création Réservation
        const { data, error } = await sb
            .from('reservations')
            .insert([reservationData])
            .select();

        if (error) return alert("Erreur connexion: " + error.message);

        currentReservationId = data[0].id;
        voitureSelectionnee = { 
            ...voitureSelectionnee, 
            reservationData: data[0] 
        };

        // 3. Envoi WhatsApp
        const voitureNom = getValue('nom-voiture-hidden');
        let msg = `Bonjour RentCarServices,\n\nDemande de réservation *${voitureNom}* (Ref #${currentReservationId}).\n`;
        msg += `📅 Du ${reservationData.date_debut} au ${reservationData.date_fin}\n`;
        msg += `💰 Total: ${formatPrix(calcul.total)} Ar (Acompte: ${formatPrix(calcul.acompte)} Ar)\n`;
        msg += `👤 ${client.nom} ${client.prenom}\n`;
        msg += `📞 ${client.tel}\n\n`;
        msg += `Je procède au paiement sur le site.`;

        const whatsappNumber = siteConfig?.contact?.whatsapp?.replace(/\D/g, '') || '261388552432';
        window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`, '_blank');

        // 4. Transition UI
        document.getElementById('step-1-configuration').style.display = 'none';
        const step2 = document.getElementById('step-2-paiement');
        step2.style.display = 'block';
        step2.classList.remove('hidden-step');
        step2.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('Erreur lors de la réservation:', error);
        alert('Erreur lors de l\'enregistrement de la réservation.');
    }
}

/* ---------- GESTION PAIEMENT ---------- */
function togglePaymentFields() {
    const method = getValue('pay-method');
    
    // Masquage par défaut
    document.getElementById('fields-mvola').style.display = 'none';
    document.getElementById('fields-espece').style.display = 'none';
    document.getElementById('fields-montant').style.display = 'none';

    // Affichage conditionnel
    if (method === 'mvola') document.getElementById('fields-mvola').style.display = 'block';
    if (method === 'espece') document.getElementById('fields-espece').style.display = 'block';
    
    // Si une méthode est choisie, on affiche le choix du montant
    if (method !== '') document.getElementById('fields-montant').style.display = 'block';
}

function toggleAutreMontant() {
    const choix = getValue('pay-choix-montant');
    document.getElementById('field-autre-montant').style.display = 
        (choix === 'autre') ? 'block' : 'none';
}

async function envoyerInfosPaiement() {
    if (!currentReservationId || !sb) return alert("Erreur système ou ID manquant.");

    const method = getValue('pay-method');
    if (!method) return alert("Choisissez un mode de paiement.");

    let payInfo = {
        methode: method,
        titulaire: (method === 'mvola') ? 
            getValue('pay-mvola-nom') : getValue('pay-cash-nom'),
        numero: (method === 'mvola') ? getValue('pay-mvola-num') : '',
        ref: (method === 'mvola') ? getValue('pay-mvola-ref') : '',
        type_montant: getValue('pay-choix-montant')
    };

    if (!payInfo.titulaire) return alert("Nom du payeur obligatoire.");

    // Calcul montant déclaré
    let montantDeclare = 0;
    const totalReservation = voitureSelectionnee.reservationData.montant_total;
    
    if (payInfo.type_montant === '50') {
        montantDeclare = totalReservation / 2;
    } else if (payInfo.type_montant === '100') {
        montantDeclare = totalReservation;
    } else {
        montantDeclare = parseFloat(getValue('pay-valeur-autre')) || 0;
    }

    try {
        // Mise à jour Supabase
        const { error } = await sb
            .from('reservations')
            .update({
                paiement_methode: payInfo.methode,
                paiement_titulaire: payInfo.titulaire,
                paiement_numero: payInfo.numero,
                paiement_ref: payInfo.ref,
                paiement_type_montant: payInfo.type_montant,
                paiement_montant_declare: montantDeclare
            })
            .eq('id', currentReservationId);

        if (error) return alert("Erreur mise à jour: " + error.message);

        // Mise à jour locale
        voitureSelectionnee.reservationData.paiement_methode = payInfo.methode;
        voitureSelectionnee.reservationData.paiement_titulaire = payInfo.titulaire;
        voitureSelectionnee.reservationData.paiement_montant_declare = montantDeclare;
        voitureSelectionnee.reservationData.paiement_ref = payInfo.ref;

        // Transition UI
        document.getElementById('step-2-paiement').style.display = 'none';
        const step3 = document.getElementById('step-3-download');
        step3.style.display = 'block';
        step3.classList.remove('hidden-step');
        
        // Lancement écouteur temps réel
        ecouterValidationAdmin();

    } catch (error) {
        console.error('Erreur paiement:', error);
        alert('Erreur lors de l\'enregistrement du paiement.');
    }
}

/* ---------- REALTIME & VALIDATION ---------- */
function ecouterValidationAdmin() {
    if (!currentReservationId || !sb) return;
    
    // Abonnement aux changements sur CETTE réservation
    realTimeSubscription = sb
        .channel('suivi-resa-' + currentReservationId)
        .on('postgres_changes', 
            { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'reservations', 
                filter: `id=eq.${currentReservationId}` 
            },
            (payload) => {
                const newData = payload.new;
                // Si l'admin a ajouté un code OTP
                if (newData.code_otp && newData.code_otp.length > 0) {
                    activerBoutonDownload(newData.code_otp);
                }
            }
        )
        .subscribe();
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
    voitureSelectionnee
	/* ---------- REALTIME & VALIDATION (suite) ---------- */
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
    
    // Mise à jour des données locales
    if (voitureSelectionnee && voitureSelectionnee.reservationData) {
        voitureSelectionnee.reservationData.code_otp = code;
    }
    
    // Notification visuelle/sonore
    if (navigator.vibrate) navigator.vibrate(200);
}

/* ---------- GESTION PAIEMENT (suite) ---------- */
function togglePaymentFields() {
    const method = document.getElementById('pay-method').value;
    
    // Masquage par défaut
    document.getElementById('fields-mvola').style.display = 'none';
    document.getElementById('fields-espece').style.display = 'none';
    document.getElementById('fields-montant').style.display = 'none';

    // Affichage conditionnel
    if (method === 'mvola') {
        document.getElementById('fields-mvola').style.display = 'block';
    }
    if (method === 'espece') {
        document.getElementById('fields-espece').style.display = 'block';
    }
    
    // Si une méthode est choisie, on affiche le choix du montant
    if (method !== '') {
        document.getElementById('fields-montant').style.display = 'block';
    }
}

function toggleAutreMontant() {
    const choix = document.getElementById('pay-choix-montant').value;
    const fieldAutre = document.getElementById('field-autre-montant');
    
    if (fieldAutre) {
        fieldAutre.style.display = (choix === 'autre') ? 'block' : 'none';
    }
}

/* ---------- GÉNÉRATION PDF ---------- */
function telechargerFactureAuto() {
    if (voitureSelectionnee && voitureSelectionnee.reservationData) {
        genererPDF(voitureSelectionnee.reservationData);
    } else {
        alert('Erreur : Données de réservation manquantes');
    }
}

function genererPDF(resa) {
    // Vérification de jsPDF
    if (!window.jspdf) {
        alert("Erreur: Librairie PDF manquante.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const now = new Date();
    
    // Header avec logo et informations entreprise
    doc.setFillColor(44, 62, 80);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text(siteConfig?.header?.siteName || "RentCarServices", 105, 15, { align: "center" });
    doc.setFontSize(10);
    doc.text(siteConfig?.footer?.address || "Antananarivo, Madagascar", 105, 25, { align: "center" });
    doc.text(`Tel: ${siteConfig?.contact?.phoneDisplay || '+261 34 91 207 26'}`, 105, 32, { align: "center" });

    // Informations de la facture
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.text(`Date : ${now.toLocaleDateString('fr-FR')}`, 195, 50, { align: "right" });
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`REÇU DE RÉSERVATION N° ${resa.id}`, 14, 60);

    // Calculs pour affichage
    const dateDebut = new Date(resa.date_debut);
    const dateFin = new Date(resa.date_fin);
    const duree = Math.ceil(Math.abs(dateFin - dateDebut) / (86400000)) + 1;
    
    const totalNet = parseFloat(resa.montant_total) || 0;
    const paye = parseFloat(resa.paiement_montant_declare) || 0;
    const reste = totalNet - paye;

    // Contenu du tableau principal
    const clientContent = [
        `Client: ${(resa.nom || '').toUpperCase()} ${resa.prenom || ''}`,
        `Tél: ${resa.tel || '-'}`,
        `Adresse: ${resa.adresse || 'Non renseignée'}`,
        `CIN: ${resa.cin_passeport || '-'}`
    ].join('\n');

    const voitureContent = [
        `Véhicule: ${getValue('nom-voiture-hidden') || 'Véhicule'}`,
        `Du ${resa.date_debut} au ${resa.date_fin}`,
        `Durée: ${duree} jour${duree > 1 ? 's' : ''}`,
        `Formule: ${resa.type_offre || 'Standard'}`,
        `TOTAL: ${formatPrix(totalNet)} Ar`
    ].join('\n');

    const paiementContent = [
        `Méthode: ${resa.paiement_methode === 'mvola' ? 'Mobile Money' : 'Espèces'}`,
        `Ref: ${resa.paiement_ref || '-'}`,
        `Payé: ${formatPrix(paye)} Ar`,
        `RESTE À PAYER: ${formatPrix(reste)} Ar`
    ].join('\n');

    // Création du tableau avec autoTable
    doc.autoTable({
        startY: 70,
        head: [['DETAILS CLIENT', 'LOCATION', 'ÉTAT PAIEMENT']],
        body: [[clientContent, voitureContent, paiementContent]],
        theme: 'grid',
        headStyles: { 
            fillColor: [52, 152, 219], 
            halign: 'center',
            fontStyle: 'bold'
        },
        styles: { 
            cellPadding: 5, 
            fontSize: 10, 
            valign: 'top',
            lineColor: [200, 200, 200],
            lineWidth: 0.5
        },
        columnStyles: {
            0: { cellWidth: 65 },
            1: { cellWidth: 70 },
            2: { cellWidth: 65 }
        }
    });

    // Section validation avec code OTP
    if (resa.code_otp) {
        const finalY = doc.lastAutoTable.finalY + 20;
        
        // Encadré de validation
        doc.setDrawColor(39, 174, 96);
        doc.setFillColor(236, 253, 243);
        doc.rect(14, finalY, 182, 25, 'FD');
        
        doc.setFontSize(12);
        doc.setTextColor(39, 174, 96);
        doc.setFont("helvetica", "bold");
        doc.text(`✓ DOCUMENT VALIDÉ - CODE: ${resa.code_otp}`, 105, finalY + 15, { align: "center" });
        
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`Généré le ${now.toLocaleString('fr-FR')}`, 105, finalY + 22, { align: "center" });
    }

    // Pied de page
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Ce document fait foi de votre réservation.", 105, 280, { align: "center" });

    // Téléchargement du fichier
    const fileName = `Recu_${siteConfig?.header?.siteName?.replace(/\s+/g, '') || 'RentCar'}_${resa.id}.pdf`;
    doc.save(fileName);
}

/* ---------- UTILITAIRES COMPLÉMENTAIRES ---------- */
function getValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function clearForm() {
    // Réinitialise le formulaire de réservation
    const fields = [
        'date-debut', 'date-fin', 'loueur-nom', 'loueur-prenom',
        'loueur-tel', 'loueur-adresse', 'loueur-cin',
        'urgence-nom', 'urgence-tel', 'urgence-adresse', 'code-promo'
    ];
    
    fields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) field.value = '';
    });
    
    // Réinitialise les checkboxes et radios
    document.getElementById('opt-livraison').checked = false;
    document.getElementById('opt-recuperation').checked = false;
    document.querySelector('input[name="offre"][value="jour"]').checked = true;
    document.getElementById('check-conditions-step1').checked = false;
    
    // Réinitialise les prix
    setText('prix-total', '0');
    setText('prix-acompte', '0');
    setText('txt-jours', '0');
    setText('txt-formule', 'JOUR');
    
    // Réinitialise les variables globales
    reductionActive = 0;
    currentReservationId = null;
    voitureSelectionnee = null;
}

function retourCatalogue() {
    // Fonction pour retourner au catalogue
    if (confirm('Voulez-vous vraiment quitter cette réservation ?')) {
        window.location.href = 'voitures.html';
    }
}

/* ---------- GESTION D'ERREURS ---------- */
window.addEventListener('error', function(e) {
    console.error('Erreur JavaScript:', e.error);
    // Optionnel : afficher un message d'erreur à l'utilisateur
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Promise rejetée:', e.reason);
    // Optionnel : afficher un message d'erreur à l'utilisateur
});

/* ---------- EXPOSITION GLOBALE (pour les appels HTML) ---------- */
window.toggleMenu = toggleMenu;
window.calculerPrix = calculerPrix;
window.verifierPromo = verifierPromo;
window.lancerReservationWhatsApp = lancerReservationWhatsApp;
window.togglePaymentFields = togglePaymentFields;
window.toggleAutreMontant = toggleAutreMontant;
window.envoyerInfosPaiement = envoyerInfosPaiement;
window.telechargerFactureAuto = telechargerFactureAuto;
window.retourCatalogue = retourCatalogue;
