// script.js - principales fonctions client & interaction Supabase
// NOTE: Ce fichier contient les fonctions principales pour le site client (index.html).
// Il intègre les nouveaux champs : livraison_lieu/heure, recuperation_lieu/heure, trajet_1..4
// et une vérification améliorée des conflits de réservation.

// --- 0. FONCTIONS UTILITAIRES ---
function toggleMenu() { 
    const nav = document.getElementById('nav-menu');
    if(nav) nav.classList.toggle('active');
}

function genererCouleur(id) {
    const couleurs = ['#3498db', '#9b59b6', '#2ecc71', '#f1c40f', '#1abc9c', '#34495e', '#e67e22', '#16a085', '#8e44ad', '#2980b9'];
    if (!id) return couleurs[Math.floor(Math.random() * couleurs.length)];
    let hash = 0; for (let i = 0; i < id.toString().length; i++) { hash = id.toString().charCodeAt(i) + ((hash << 5) - hash); }
    return couleurs[Math.abs(hash) % couleurs.length];
}

// --- CONFIG SUPABASE ---
const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';

let sb;
try {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (e) {
    console.error("Erreur Supabase (Probablement hors ligne)", e);
}

let currentReservationId = null;
let reductionActive = 0;
let windowCurrentResaData = null;
let realTimeSubscription = null;

// --- FONCTIONS PRIX / FORMULAIRES ---
function faireLeCalculMathematique() {
    // simplifié : calcule la durée et prix basique
    const dateDeb = document.getElementById('date-debut').value;
    const dateFin = document.getElementById('date-fin').value;
    const voiturePrix =  (document.getElementById('id-voiture-input') && document.getElementById('id-voiture-input').dataset.prix) ? parseFloat(document.getElementById('id-voiture-input').dataset.prix) : 0;
    if(!dateDeb || !dateFin) return { ok: false };
    const d1 = new Date(dateDeb), d2 = new Date(dateFin);
    if(d2 < d1) return { ok: false };
    const jours = Math.ceil(Math.abs(d2 - d1) / 86400000) + 1;
    const total = (voiturePrix || 0) * jours;
    const acompte = Math.round(total * 0.3);
    const offre = 'Standard';
    return { ok: true, total, acompte, duree: jours, offre };
}

function calculerPrix() {
    const res = faireLeCalculMathematique();
    if(res.ok) {
        const prixElt = document.getElementById("prix-total");
        if(prixElt) prixElt.innerText = formatPrix(res.total);
        const acompteElt = document.getElementById("prix-acompte");
        if(acompteElt) acompteElt.innerText = formatPrix(res.acompte);
    }
}

async function verifierPromo() {
    const codeInput = document.getElementById('code-promo');
    const msg = document.getElementById('msg-promo');
    if(!codeInput || !msg) return;
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

// --- 1. NOUVELLE VERIFICATION DISPONIBILITÉ (RETURNE CONFLITS) ---
async function verifierDisponibilite(debut, fin, voitureId) {
    // compatibilité : si voitureId absent, tenter d'obtenir depuis champ id-voiture-input
    if(!voitureId && document.getElementById('id-voiture-input')) voitureId = document.getElementById('id-voiture-input').value;
    if(!sb) {
        console.error("Supabase non initialisé");
        return { ok: false, conflits: [] };
    }
    try {
        if(!voitureId) {
            // fallback simple : vérifier toutes les réservations valides qui chevauchent
            const { data: conflitsAll, error } = await sb
                .from('reservations')
                .select('id, id_voiture, date_debut, date_fin, nom, tel')
                .eq('statut', 'valide')
                .or(`and(date_debut.lte.${fin},date_fin.gte.${debut})`);
            if(error) {
                console.error(error);
                return { ok: false, conflits: [] };
            }
            return { ok: !(conflitsAll && conflitsAll.length > 0), conflits: conflitsAll || [] };
        } else {
            const { data: conflits, error } = await sb
                .from('reservations')
                .select('id, date_debut, date_fin, nom, tel')
                .eq('id_voiture', voitureId)
                .eq('statut', 'valide')
                .or(`and(date_debut.lte.${fin},date_fin.gte.${debut})`);
            if(error) {
                console.error('Erreur vérification disponibilite', error);
                return { ok: false, conflits: [] };
            }
            return { ok: (conflits && conflits.length === 0), conflits: conflits || [] };
        }
    } catch (e) {
        console.error(e);
        return { ok: false, conflits: [] };
    }
}

// --- 2. LANCER RÉSERVATION (modifié pour inclure nouveaux champs) ---
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

    const voitureId = document.getElementById('id-voiture-input').value;
    const debut = document.getElementById('date-debut').value;
    const fin = document.getElementById('date-fin').value;

    // Vérification détaillée : si conflits, afficher les périodes et proposer un autre véhicule
    const dispo = await verifierDisponibilite(debut, fin, voitureId);
    if(!dispo.ok) {
        if(dispo.conflits && dispo.conflits.length > 0) {
            const ranges = dispo.conflits.map(c => `${c.date_debut} → ${c.date_fin}`);
            alert("⛔ Cette voiture est déjà réservée sur :\n" + ranges.join("\n") + "\n\nVeuillez choisir une autre voiture ou modifier vos dates.");
        } else {
            alert("❌ Dates indisponibles.");
        }
        return;
    }

    // Récupérer les nouveaux champs (livraison / récupération / trajets)
    const livraison_lieu = document.getElementById('livraison-lieu') ? document.getElementById('livraison-lieu').value : null;
    const livraison_heure = document.getElementById('livraison-heure') ? document.getElementById('livraison-heure').value : null;
    const recuperation_lieu = document.getElementById('recuperation-lieu') ? document.getElementById('recuperation-lieu').value : null;
    const recuperation_heure = document.getElementById('recuperation-heure') ? document.getElementById('recuperation-heure').value : null;

    const trajet_1 = document.getElementById('trajet-1') ? document.getElementById('trajet-1').value : null;
    const trajet_2 = document.getElementById('trajet-2') ? document.getElementById('trajet-2').value : null;
    const trajet_3 = document.getElementById('trajet-3') ? document.getElementById('trajet-3').value : null;
    const trajet_4 = document.getElementById('trajet-4') ? document.getElementById('trajet-4').value : null;

    const reservationData = {
        id_voiture: voitureId,
        date_debut: debut,
        date_fin: fin,
        nom: client.nom, prenom: client.prenom, adresse: client.adresse, tel: client.tel,
        cin_passeport: client.cin,
        urgence_nom: document.getElementById('urgence-nom') ? document.getElementById('urgence-nom').value : null,
        urgence_adresse: document.getElementById('urgence-adresse') ? document.getElementById('urgence-adresse').value : null,
        urgence_tel: document.getElementById('urgence-tel') ? document.getElementById('urgence-tel').value : null,
        type_offre: calcul.offre,
        montant_total: calcul.total,
        statut: 'en_attente',

        // Nouveaux champs
        livraison_lieu, livraison_heure, recuperation_lieu, recuperation_heure,
        trajet_1, trajet_2, trajet_3, trajet_4
    };

    try {
        await sb.from('clients').upsert({ nom: client.nom, tel: client.tel }, { onConflict: 'tel' });
        const { data, error } = await sb.from('reservations').insert([reservationData]).select();
        if(error) return alert("Erreur connexion: " + error.message);

        currentReservationId = data[0].id;
        window.currentResaData = data[0];

        let voitureNom = document.getElementById("nom-voiture-selectionnee").innerText;
        let msg = `Bonjour Rija, Réservation *${voitureNom}* (#${currentReservationId}).\n`;
        msg += `📅 Du ${reservationData.date_debut} au ${reservationData.date_fin}\n`;
        msg += `💰 Total: ${formatPrix(calcul.total)} Ar\n`;
        msg += `👤 ${client.nom} ${client.prenom}\n`;
        msg += `🆔 CIN: ${client.cin}\n`;
        msg += `📞 Tél: ${client.tel}\n\n`;
        if(livraison_lieu || recuperation_lieu) {
            msg += `📦 Livraison: ${livraison_lieu || '-'} à ${livraison_heure || '-'}\n🔁 Récupération: ${recuperation_lieu || '-'} à ${recuperation_heure || '-'}`;
        }
        const trajets = [trajet_1, trajet_2, trajet_3, trajet_4].filter(Boolean);
        if(trajets.length) msg += `\n🚗 Trajet: ${trajets.join(' → ')}`;

        window.open(`https://wa.me/261388552432?text=${encodeURIComponent(msg)}`, '_blank');

        document.getElementById('step-1-actions').style.display = 'none';
        document.getElementById('step-2-paiement').style.display = 'block';
        setTimeout(() => { document.getElementById('step-2-paiement').scrollIntoView({behavior:'smooth'}); }, 1000);

        // ecoute admin pour code otp
        ecouterValidationAdmin();
    } catch (e) {
        console.error(e);
        alert("Erreur lors de la création de la réservation.");
    }
}

// --- 3. PAIEMENT / OTP / PDF ---
async function envoyerInfosPaiement() {
    if(!currentReservationId) return alert("Erreur ID réservation manquant.");

    const method = document.getElementById('pay-method').value;
    if(!method) return alert("Choisissez un mode de paiement.");

    let payInfo = {
        methode: method,
        titulaire: (method === 'mvola') ? document.getElementById('pay-mvola-nom').value : document.getElementById('pay-cash-nom').value,
        numero: (method === 'mvola') ? document.getElementById('pay-mvola-num').value : '',
        ref: (method === 'mvola') ? document.getElementById('pay-mvola-ref').value : '',
        type_montant: document.getElementById('pay-choix-montant') ? document.getElementById('pay-choix-montant').value : 'total'
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

    document.getElementById('step-2-paiement').style.display = 'none';
    document.getElementById('step-3-download').style.display = 'block';
    ecouterValidationAdmin();
}

function ecouterValidationAdmin() {
    if(!currentReservationId || !sb) return;
    if(realTimeSubscription) try { realTimeSubscription.unsubscribe(); } catch(e){}
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

    if(input) { input.value = code; input.style.borderColor = "#2ecc71"; input.style.color = "#2ecc71"; input.style.fontWeight = "bold"; }
    if(btn) { btn.disabled = false; btn.classList.add('btn-pdf-active'); btn.innerHTML = '<i class="fas fa-file-download"></i> TÉLÉCHARGER FACTURE'; }
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

    const livraisonStr = `Livraison: ${resa.livraison_lieu || '-'} à ${resa.livraison_heure || '-'}`;
    const recuperationStr = `Récupération: ${resa.recuperation_lieu || '-'} à ${resa.recuperation_heure || '-'}`;
    const trajetArray = [resa.trajet_1, resa.trajet_2, resa.trajet_3, resa.trajet_4].filter(Boolean);
    const trajetStr = trajetArray.length ? `Trajet: ${trajetArray.join(' → ')}` : '';

    const paiementContent = [
        `Méthode: ${resa.paiement_methode === 'mvola' ? 'Mobile Money' : 'Espèces'}`,
        `Montant Payé: ${formatPrix(paye)} Ar`,
        `Reste à Payer: ${formatPrix(reste)} Ar`
    ].join('\n');

    doc.autoTable({
        startY: 70,
        head: [['CLIENT', 'VOITURE & TARIFS', 'PAIEMENT']],
        body: [[clientContent + '\n\n' + livraisonStr + '\n' + recuperationStr,
                voitureContent + '\n\n' + trajetStr,
                paiementContent]],
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
    if(!div || !sb) return;
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

// --- DEBUG / Helpers ---
function formatPrix(v) { return (v || 0).toLocaleString('fr-FR') + ' Ar'; }

// --- Initialization sample to wire some UI (minimale) ---
document.addEventListener('DOMContentLoaded', async () => {
    // Set navigation handlers, etc.
    // Here you should load voiture selection, set prix metadata, etc.
    // Example: set up some event listeners to calculate price
    const dateDeb = document.getElementById('date-debut');
    const dateFin = document.getElementById('date-fin');
    if(dateDeb) dateDeb.addEventListener('change', calculerPrix);
    if(dateFin) dateFin.addEventListener('change', calculerPrix);
});