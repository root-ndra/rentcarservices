// --- UTILITAIRES GLOBAUX ---
function toggleMenu() {
    const nav = document.getElementById('nav-menu');
    if (nav) nav.classList.toggle('active');
}

function genererCouleur(id) {
    const couleurs = ['#3498db', '#9b59b6', '#2ecc71', '#f1c40f', '#1abc9c', '#34495e', '#e67e22', '#16a085', '#8e44ad', '#2980b9'];
    if (!id) return couleurs[Math.floor(Math.random() * couleurs.length)];
    let hash = 0;
    for (let i = 0; i < id.toString().length; i++) {
        hash = id.toString().charCodeAt(i) + ((hash << 5) - hash);
    }
    return couleurs[Math.abs(hash) % couleurs.length];
}

// --- CONFIGURATION SUPABASE ---
const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';

let sb = null;
try {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (e) {
    console.error('Supabase indisponible', e);
}

let calendar = null;
let voitureSelectionnee = null;
let currentReservationId = null;
let reductionActive = 0;
let currentCarReservations = [];
let siteConfigGlobal = null;

// --- CHARGEMENT INITIAL ---
document.addEventListener('DOMContentLoaded', async () => {
    if (!sb) return;
    await loadConfig();
    await chargerPublicites();

    const containerVoitures = document.getElementById('container-voitures');
    if (containerVoitures) {
        await chargerVoituresAccueil(containerVoitures);
        chargerMedia('radios');
        chargerAvis();
    }
});

// --- CHARGEMENT CONFIGURATION & FEATURES ---
async function loadConfig() {
    try {
        const response = await fetch('site_config.json');
        siteConfigGlobal = await response.json();

        if (document.getElementById('header-site-name')) {
            const headerName = document.getElementById('header-site-name');
            const headerLogo = document.getElementById('header-logo');
            const footerTitle = document.getElementById('footer-title');

            headerName.innerText = siteConfigGlobal.header.siteName;
            headerLogo.src = siteConfigGlobal.header.logoUrl;
            if (document.getElementById('hero-title')) document.getElementById('hero-title').innerText = siteConfigGlobal.header.siteName;
            if (footerTitle) footerTitle.innerText = siteConfigGlobal.header.siteName;

            document.getElementById('footer-address').innerText = siteConfigGlobal.footer.address;
            document.getElementById('footer-nif').innerText = siteConfigGlobal.footer.nif;
            document.getElementById('footer-stat').innerText = siteConfigGlobal.footer.stat;
            document.getElementById('footer-phone').innerText = siteConfigGlobal.contact.phoneDisplay;

            const callBtn = document.getElementById('call-btn-link');
            if (callBtn) callBtn.href = `tel:${siteConfigGlobal.contact.phoneCall}`;

            const socials = document.getElementById('footer-socials');
            if (socials) {
                socials.innerHTML = '';
                const icons = { facebook: 'fab fa-facebook', instagram: 'fab fa-instagram', tiktok: 'fab fa-tiktok' };
                Object.entries(siteConfigGlobal.footer.socials || {}).forEach(([network, url]) => {
                    if (!url) return;
                    socials.innerHTML += `<a href="${url}" target="_blank" style="color:white; margin:0 10px; font-size:1.5rem;"><i class="${icons[network] || 'fas fa-globe'}"></i></a>`;
                });
            }

            const footerMap = document.getElementById('footer-map');
            if (footerMap && siteConfigGlobal.footer.mapUrl) {
                footerMap.innerHTML = `<iframe src="${siteConfigGlobal.footer.mapUrl}" width="100%" height="250" style="border:0; border-radius:10px;" allowfullscreen="" loading="lazy"></iframe>`;
            }

            const featuresContainer = document.getElementById('features-container-dynamic');
            if (featuresContainer && Array.isArray(siteConfigGlobal.features)) {
                featuresContainer.innerHTML = '';
                siteConfigGlobal.features.forEach((feat) => {
                    featuresContainer.innerHTML += `
                        <div class="flip-card" onclick="this.classList.toggle('flipped')">
                            <div class="flip-card-inner">
                                <div class="flip-card-front">
                                    <span class="feature-emoji">${feat.emoji}</span>
                                    <h3>${feat.title}</h3>
                                    <small>(Cliquez ici)</small>
                                </div>
                                <div class="flip-card-back">
                                    <p>${feat.text}</p>
                                </div>
                            </div>
                        </div>`;
                });
            }
        }
    } catch (e) {
        console.error('Erreur chargement config JSON', e);
    }

    try {
        const respCond = await fetch('conditions.json');
        const conditions = await respCond.json();
        const condContainer = document.getElementById('container-conditions-cards');
        if (condContainer) {
            condContainer.innerHTML = '';
            conditions.forEach((c) => {
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
        }
    } catch (e) {
        console.error('Erreur chargement conditions', e);
    }

    if (sb) {
        const { data: calConfig } = await sb
            .from('config_site')
            .select('value')
            .eq('key', 'calendar_visible')
            .maybeSingle();

        if (calConfig) {
            const isVisible = calConfig.value === true || calConfig.value === 'true';
            const wrapper = document.getElementById('wrapper-calendrier-global');
            if (wrapper) wrapper.style.display = isVisible ? 'block' : 'none';
        }
    }
}

// --- PUBLICITÉS ---
async function chargerPublicites() {
    const containers = {
        home_top: document.getElementById('pub-home_top'),
        home_bot: document.getElementById('pub-home_bot'),
        flotte_top: document.getElementById('pub-flotte_top'),
        flotte_bot: document.getElementById('pub-flotte_bot'),
        media_top: document.getElementById('pub-media_top'),
        media_bot: document.getElementById('pub-media_bot'),
    };

    Object.values(containers).forEach((el) => {
        if (el) {
            el.style.display = 'none';
            el.innerHTML = '';
        }
    });

    if (!sb) return;
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await sb
        .from('publicites')
        .select('*')
        .eq('actif', true)
        .lte('date_debut', today)
        .gte('date_fin', today);

    if (error) {
        console.error('Publicités', error);
        return;
    }

    data.forEach((pub) => {
        const block = containers[pub.emplacement];
        if (!block) return;
        const link = pub.lien_redirection || '#';
        block.innerHTML = `
            <a href="${link}" target="_blank" rel="noopener">
                <img src="${pub.image_url}" alt="${pub.societe || 'Publicité'}">
            </a>`;
        block.style.display = 'block';
    });
}

// --- CHARGEMENT DES VOITURES ---
async function chargerVoituresAccueil(container) {
    const { data: voitures, error } = await sb.from('voitures').select('*').order('prix_base', { ascending: true });

    if (error) {
        container.innerHTML = '<p>Impossible de charger les voitures.</p>';
        return;
    }
    if (!voitures || !voitures.length) {
        container.innerHTML = '<p>Aucune voiture disponible pour le moment.</p>';
        return;
    }

    container.innerHTML = '';
    voitures.forEach((v) => {
        const div = document.createElement('div');
        div.className = 'carte-voiture';

        const places = v.places ? `<i class="fas fa-user-friends"></i> ${v.places} places` : '';
        const carbu = v.carburant ? `<i class="fas fa-gas-pump"></i> ${v.carburant}` : '';
        const description = (v.description || '').trim();
        const resume = description ? `<p class="carte-desc">${description.slice(0, 110)}${description.length > 110 ? '…' : ''}</p>` : '';
        const isReservable = v.reservable !== false;

        div.innerHTML = `
            <img src="${v.image_url}" alt="${v.nom}">
            <h3>${v.nom}</h3>
            <div style="padding: 0 20px; color: #555; font-size: 0.9rem; display: flex; gap: 10px; justify-content: center; flex-wrap:wrap;">
                <span><i class="fas fa-cogs"></i> ${v.transmission || '-'}</span>
                ${places ? `<span>${places}</span>` : ''}
                ${carbu ? `<span>${carbu}</span>` : ''}
            </div>
            ${resume}
            <p class="prix">${formatPrix(v.prix_base)} Ar / jour</p>
            <button onclick='selectionnerVoiture("${v.id}", ${JSON.stringify(v.nom)}, ${v.prix_base}, ${JSON.stringify(v.ref_id || '')}, ${JSON.stringify(description)}, ${isReservable})'>
                ${isReservable ? 'Réserver' : 'Contacter'}
            </button>
        `;
        container.appendChild(div);
    });
}

function formatPrix(prix) {
    if (!prix && prix !== 0) return '0';
    return prix.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// --- NAVIGATION ---
function naviguerVers(pageId) {
    document.querySelectorAll('.page-section').forEach((sec) => (sec.style.display = 'none'));
    const activeSection = document.getElementById(pageId);
    if (activeSection) activeSection.style.display = 'block';
    window.scrollTo(0, 0);

    const navMenu = document.getElementById('nav-menu');
    if (navMenu) navMenu.classList.remove('active');
}

// --- SÉLECTION VOITURE ---
function selectionnerVoiture(id, nom, prix, ref, description, isReservable) {
    if (isReservable === false) {
        document.getElementById('contact-car-name').innerText = nom;
        if (siteConfigGlobal?.contact) {
            document.getElementById('btn-modal-call').href = `tel:${siteConfigGlobal.contact.phoneCall}`;
            document.getElementById('btn-modal-wa').href = `https://wa.me/${siteConfigGlobal.contact.whatsapp}?text=${encodeURIComponent(`Bonjour, je suis intéressé par ${nom}`)}`;
            document.getElementById('txt-modal-phone').innerText = siteConfigGlobal.contact.phoneDisplay;
        }
        document.getElementById('modal-contact-only').style.display = 'flex';
        return;
    }

    voitureSelectionnee = { id, nom, prix, ref };
    naviguerVers('reservation');

    document.getElementById('nom-voiture-selectionnee').innerText = nom;
    document.getElementById('desc-voiture-selectionnee').innerText = description || '';
    document.getElementById('id-voiture-input').value = id;
    document.getElementById('ref-voiture-input').value = ref;
    document.getElementById('prix-base-input').value = prix;

    ['date-debut', 'date-fin', 'lieu-livraison', 'heure-livraison', 'lieu-recuperation', 'heure-recuperation', 'trajet-1', 'trajet-2', 'trajet-3'].forEach(
        (field) => (document.getElementById(field).value = '')
    );

    document.getElementById('step-1-actions').style.display = 'block';
    document.getElementById('step-2-paiement').style.display = 'none';
    document.getElementById('step-3-download').style.display = 'none';

    initCalendar(id);
}

// --- CALENDRIER ---
async function initCalendar(idVoiture) {
    const calendarEl = document.getElementById('calendrier-dispo');
    if (calendar) calendar.destroy();

    const { data: resas } = await sb.from('reservations').select('id, date_debut, date_fin').eq('id_voiture', idVoiture).eq('statut', 'valide');
    const { data: maints } = await sb.from('maintenances').select('date_debut, date_fin').eq('id_voiture', idVoiture);

    currentCarReservations = [];
    const events = [];

    (resas || []).forEach((r) => {
        currentCarReservations.push({ start: new Date(r.date_debut), end: new Date(r.date_fin) });
        const end = new Date(r.date_fin);
        end.setDate(end.getDate() + 1);
        events.push({ title: 'Loué', start: r.date_debut, end: end.toISOString().split('T')[0], display: 'background', color: genererCouleur(r.id) });
    });

    (maints || []).forEach((m) => {
        currentCarReservations.push({ start: new Date(m.date_debut), end: new Date(m.date_fin) });
        const end = new Date(m.date_fin);
        end.setDate(end.getDate() + 1);
        events.push({ title: 'Entretien', start: m.date_debut, end: end.toISOString().split('T')[0], display: 'background', color: '#c0392b' });
    });

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'fr',
        height: 'auto',
        events,
        headerToolbar: { left: 'prev,next', center: 'title', right: '' },
        dateClick(info) {
            const dDebut = document.getElementById('date-debut');
            const dFin = document.getElementById('date-fin');
            if (!dDebut.value) {
                dDebut.value = info.dateStr;
            } else if (new Date(info.dateStr) < new Date(dDebut.value)) {
                dDebut.value = info.dateStr;
                dFin.value = '';
            } else {
                dFin.value = info.dateStr;
            }
            calculerPrix();
        },
    });
    calendar.render();
}

function toggleCalendarVisibility() {
    const el = document.getElementById('wrapper-calendrier');
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
    if (el.style.display === 'block' && calendar) calendar.render();
}

function verifierDisponibilite(debut, fin) {
    const d1 = new Date(debut);
    const d2 = new Date(fin);
    for (const resa of currentCarReservations) {
        if (d1 <= resa.end && d2 >= resa.start) return false;
    }
    return true;
}

// --- CALCULS FINANCIERS ---
function faireLeCalculMathematique() {
    const prixBase = parseInt(document.getElementById('prix-base-input').value, 10);
    const dateDebut = document.getElementById('date-debut').value;
    const dateFin = document.getElementById('date-fin').value;

    if (dateDebut && dateFin && prixBase) {
        const d1 = new Date(dateDebut);
        const d2 = new Date(dateFin);
        const diffDays = Math.ceil(Math.abs(d2 - d1) / 86400000) + 1;

        let multiplier = 1;
        let formuleChoisie = 'jour';
        const radioOffre = document.querySelector('input[name="offre"]:checked');
        if (radioOffre) {
            formuleChoisie = radioOffre.value;
            if (formuleChoisie === 'nuit') multiplier = 1.5;
            if (formuleChoisie === '24h') multiplier = 2;
        }

        let coutLocation = diffDays * prixBase * multiplier;
        if (diffDays >= 30) coutLocation *= 0.85;
        else if (diffDays >= 7) coutLocation *= 0.9;

        if (reductionActive > 0) coutLocation *= 1 - reductionActive / 100;

        let fraisOptions = 0;
        if (document.getElementById('opt-livraison').checked) fraisOptions += 15000;
        if (document.getElementById('opt-recuperation').checked) fraisOptions += 15000;

        const total = Math.round(coutLocation + fraisOptions);
        return { ok: true, total, acompte: Math.round(total * 0.5), offre: formuleChoisie, duree: diffDays };
    }
    return { ok: false };
}

function calculerPrix() {
    const res = faireLeCalculMathematique();
    if (!res.ok) return;
    document.getElementById('prix-total').innerText = formatPrix(res.total);
    document.getElementById('prix-acompte').innerText = formatPrix(res.acompte);
    document.getElementById('txt-jours').innerText = res.duree;
    document.getElementById('txt-formule').innerText = res.offre.toUpperCase();
}

// --- PROMO ---
async function verifierPromo() {
    const code = document.getElementById('code-promo').value.toUpperCase().trim();
    const msg = document.getElementById('msg-promo');
    const dateDebut = document.getElementById('date-debut').value;
    const dateFin = document.getElementById('date-fin').value;

    if (!dateDebut || !dateFin) {
        msg.innerText = '⚠️ Sélectionnez vos dates avant.';
        return;
    }

    const { data, error } = await sb.from('codes_promo').select('*').eq('code', code).eq('actif', true).maybeSingle();
    if (error || !data) {
        reductionActive = 0;
        msg.innerText = '❌ Code invalide ou expiré.';
        msg.style.color = 'red';
    } else {
        reductionActive = data.reduction_pourcent;
        msg.innerText = `✅ Réduction ${reductionActive}% appliquée`;
        msg.style.color = 'green';
    }
    calculerPrix();
}

// --- RÉSERVATION ---
async function lancerReservationWhatsApp() {
    if (!document.getElementById('check-conditions-step1').checked) {
        alert('Veuillez accepter les conditions.');
        return;
    }

    const client = {
        nom: document.getElementById('loueur-nom').value.trim(),
        prenom: document.getElementById('loueur-prenom').value.trim(),
        tel: document.getElementById('loueur-tel').value.trim(),
        adresse: document.getElementById('loueur-adresse').value.trim(),
        cin: document.getElementById('loueur-cin').value.trim(),
    };

    if (!client.nom || !client.tel || !client.cin) {
        alert('Nom, Téléphone et CIN sont obligatoires.');
        return;
    }

    const calcul = faireLeCalculMathematique();
    if (!calcul.ok) return alert('Dates invalides');
    if (!verifierDisponibilite(document.getElementById('date-debut').value, document.getElementById('date-fin').value)) {
        alert('❌ Ces dates ne sont plus disponibles.');
        return;
    }

    const livraison = {
        lieu: document.getElementById('lieu-livraison').value.trim(),
        heure: document.getElementById('heure-livraison').value.trim(),
    };
    const recuperation = {
        lieu: document.getElementById('lieu-recuperation').value.trim(),
        heure: document.getElementById('heure-recuperation').value.trim(),
    };
    const trajet = [document.getElementById('trajet-1').value, document.getElementById('trajet-2').value, document.getElementById('trajet-3').value]
        .filter(Boolean)
        .join(' -> ');

    const reservationData = {
        id_voiture: document.getElementById('id-voiture-input').value,
        date_debut: document.getElementById('date-debut').value,
        date_fin: document.getElementById('date-fin').value,
        nom: client.nom,
        prenom: client.prenom,
        adresse: client.adresse,
        tel: client.tel,
        cin_passeport: client.cin,
        urgence_nom: document.getElementById('urgence-nom').value.trim(),
        urgence_adresse: document.getElementById('urgence-adresse').value.trim(),
        urgence_tel: document.getElementById('urgence-tel').value.trim(),
        type_offre: calcul.offre,
        montant_total: calcul.total,
        statut: 'en_attente',
        lieu_livraison: livraison.lieu,
        heure_livraison: livraison.heure,
        lieu_recuperation: recuperation.lieu,
        heure_recuperation: recuperation.heure,
        trajet_details: trajet,
    };

    await sb.from('clients').upsert({ nom: client.nom, tel: client.tel, adresse: client.adresse }, { onConflict: 'tel' });
    const { data, error } = await sb.from('reservations').insert([reservationData]).select();

    if (error) {
        alert(`Erreur réservation : ${error.message}`);
        return;
    }

    currentReservationId = data[0].id;
    window.currentResaData = data[0];

    const waNumber = siteConfigGlobal?.contact?.whatsapp || '261388552432';
    let msg = `Bonjour, réservation *${document.getElementById('nom-voiture-selectionnee').innerText}* (#${currentReservationId}).\n`;
    msg += `📅 ${reservationData.date_debut} au ${reservationData.date_fin}\n`;
    msg += `🚗 Livraison: ${livraison.lieu || 'Agence'} (${livraison.heure || '-'})\n`;
    msg += `↩️ Récupération: ${recuperation.lieu || 'Agence'} (${recuperation.heure || '-'})\n`;
    msg += `🛣️ Trajet: ${trajet || 'Local'}\n`;
    msg += `💰 Total: ${formatPrix(calcul.total)} Ar\n👤 ${client.nom} ${client.prenom || ''}\n📞 ${client.tel}`;

    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`, '_blank');

    document.getElementById('step-1-actions').style.display = 'none';
    document.getElementById('step-2-paiement').style.display = 'block';
    setTimeout(() => document.getElementById('step-2-paiement').scrollIntoView({ behavior: 'smooth' }), 600);
}

// --- PAIEMENT & OTP ---
async function envoyerInfosPaiement() {
    if (!currentReservationId) return;
    const method = document.getElementById('pay-method').value;

    const payInfo = {
        methode: method,
        titulaire: method === 'mvola' ? document.getElementById('pay-mvola-nom').value.trim() : document.getElementById('pay-cash-nom').value.trim(),
        numero: method === 'mvola' ? document.getElementById('pay-mvola-num').value.trim() : '',
        ref: method === 'mvola' ? document.getElementById('pay-mvola-ref').value.trim() : '',
        type_montant: document.getElementById('pay-choix-montant').value,
    };

    let montantDeclare = payInfo.type_montant === '50' ? window.currentResaData.montant_total / 2 : window.currentResaData.montant_total;
    if (payInfo.type_montant === 'autre') montantDeclare = parseFloat(document.getElementById('pay-valeur-autre').value) || 0;

    await sb
        .from('reservations')
        .update({
            paiement_methode: payInfo.methode,
            paiement_titulaire: payInfo.titulaire,
            paiement_numero: payInfo.numero,
            paiement_ref: payInfo.ref,
            paiement_montant_declare: montantDeclare,
        })
        .eq('id', currentReservationId);

    window.currentResaData.paiement_titulaire = payInfo.titulaire;
    window.currentResaData.paiement_montant_declare = montantDeclare;

    document.getElementById('step-2-paiement').style.display = 'none';
    document.getElementById('step-3-download').style.display = 'block';

    sb.channel(`suivi-resa-${currentReservationId}`)
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'reservations', filter: `id=eq.${currentReservationId}` },
            (payload) => {
                if (payload.new?.code_otp) activerBoutonDownload(payload.new.code_otp);
            }
        )
        .subscribe();
}

function activerBoutonDownload(code) {
    document.getElementById('input-otp-auto').value = code;
    const btn = document.getElementById('btn-dl-pdf');
    btn.disabled = false;
    btn.classList.add('btn-pdf-active');
    if (window.currentResaData) window.currentResaData.code_otp = code;
}

function telechargerFactureAuto() {
    if (window.currentResaData) genererPDF(window.currentResaData);
}

// --- PDF ---
function genererPDF(resa) {
    if (!window.jspdf) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFillColor(44, 62, 80);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text(siteConfigGlobal?.header?.siteName || 'RIJA NIAINA CAR SERVICES', 105, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.text(siteConfigGlobal?.footer?.address || 'Antananarivo', 105, 25, { align: 'center' });
    doc.text(`Tel: ${siteConfigGlobal?.contact?.phoneDisplay || '+261 38 85 524 32'}`, 105, 32, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.text(`Date : ${new Date().toLocaleDateString('fr-FR')}`, 195, 50, { align: 'right' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`FACTURE / REÇU N° ${resa.id}`, 14, 60);

    const d1 = new Date(resa.date_debut);
    const d2 = new Date(resa.date_fin);
    const duree = Math.ceil(Math.abs(d2 - d1) / 86400000) + 1;

    const clientInfo = [
        `Nom: ${resa.nom} ${resa.prenom || ''}`,
        `Tél: ${resa.tel}`,
        `Adresse: ${resa.adresse || '-'}`,
        `CIN: ${resa.cin_passeport || '-'}`,
        `Contact urgence: ${resa.urgence_nom || '-'} (${resa.urgence_tel || '-'})`,
    ].join('\n');

    const locInfo = [
        `Du ${resa.date_debut} au ${resa.date_fin} (${duree} j)`,
        `Livraison: ${resa.lieu_livraison || 'Agence'} (${resa.heure_livraison || '-'})`,
        `Retour: ${resa.lieu_recuperation || 'Agence'} (${resa.heure_recuperation || '-'})`,
        `Trajet: ${resa.trajet_details || 'Non précisé'}`,
    ].join('\n');

    const paye = parseFloat(resa.paiement_montant_declare) || 0;
    const total = parseFloat(resa.montant_total) || 0;
    const payInfo = [`Total: ${formatPrix(total)} Ar`, `Payé: ${formatPrix(paye)} Ar`, `Reste: ${formatPrix(total - paye)} Ar`, `Payeur: ${resa.paiement_titulaire || '-'}`].join('\n');

    doc.autoTable({
        startY: 70,
        head: [['CLIENT', 'DÉTAILS LOCATION', 'FINANCIER']],
        body: [[clientInfo, locInfo, payInfo]],
        theme: 'grid',
        headStyles: { fillColor: [52, 152, 219], halign: 'center' },
        styles: { fontSize: 9, cellPadding: 4, valign: 'top' },
    });

    if (resa.code_otp) {
        doc.setTextColor(39, 174, 96);
        doc.text(`Validé - OTP: ${resa.code_otp}`, 14, doc.lastAutoTable.finalY + 8);
    }

    doc.save(`Facture_${resa.id}.pdf`);
}

// --- AVIS & CONTACT ---
async function chargerAvis() {
    const liste = document.getElementById('liste-avis');
    if (!liste) return;
    const { data, error } = await sb.from('avis').select('*').eq('visible', true).order('created_at', { ascending: false }).limit(3);
    if (error) return console.error('Avis', error);
    if (!data?.length) {
        liste.innerHTML = '<p>Aucun avis pour le moment.</p>';
        return;
    }
    liste.innerHTML = data
        .map(
            (a) => `
            <div style="background:#f9f9f9; padding:10px; margin-bottom:5px; border-radius:8px;">
                <strong>${'⭐'.repeat(a.note)} ${a.nom}</strong>
                <p>${a.commentaire}</p>
            </div>`
        )
        .join('');
}

async function envoyerAvis() {
    const nom = document.getElementById('avis-nom').value.trim();
    const note = parseInt(document.getElementById('avis-note').value, 10);
    const commentaire = document.getElementById('avis-commentaire').value.trim();
    if (!nom || !commentaire) return alert('Merci de remplir le nom et votre avis.');
    const { error } = await sb.from('avis').insert([{ nom, note, commentaire, visible: false }]);
    if (error) return alert('Erreur envoi avis.');
    alert('Merci ! Votre avis sera publié après validation.');
    document.getElementById('avis-nom').value = '';
    document.getElementById('avis-commentaire').value = '';
}

function envoyerContactWhatsApp() {
    const sujet = document.getElementById('contact-sujet').value;
    const nom = document.getElementById('contact-nom').value.trim();
    const msg = document.getElementById('contact-message').value.trim();
    const waNumber = siteConfigGlobal?.contact?.whatsapp || '261388552432';

    if (!msg) return alert('Merci de saisir un message.');
    const texte = `[${sujet}] ${nom ? nom + ' - ' : ''}${msg}`;
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(texte)}`, '_blank');
}

// --- MÉDIAS ---
async function chargerMedia(type) {
    const conteneur = document.getElementById('conteneur-media');
    if (!conteneur) return;

    const table = type === 'radios' ? 'radios' : 'playlists';
    const { data, error } = await sb.from(table).select('*').eq('actif', true);
    if (error) {
        conteneur.innerHTML = '<p>Impossible de charger le contenu.</p>';
        return;
    }

    conteneur.innerHTML = '';
    if (!data?.length) {
        conteneur.innerHTML = '<p>Aucun contenu disponible.</p>';
        return;
    }

    conteneur.innerHTML = data
        .map((item) => {
            if (type === 'radios') {
                return `
                    <div class="carte-voiture" style="padding:15px; text-align:center;">
                        <img src="${item.image_url}" alt="${item.nom}" style="width:60px; height:60px; object-fit:contain; margin-bottom:10px;">
                        <h4>${item.nom}</h4>
                        <audio controls src="${item.url_flux}" style="width:100%; margin-top:10px;"></audio>
                    </div>`;
            }
            return `
                <div class="carte-voiture" style="padding:0;">
                    <iframe src="${item.url_embed}" width="100%" height="220" style="border:0;" allow="autoplay"></iframe>
                    <div style="padding:15px;">
                        <strong>${item.titre}</strong><br>
                        <small>${item.plateforme}</small>
                    </div>
                </div>`;
        })
        .join('');
}

// --- MODALES ---
function ouvrirModalConditions() {
    document.getElementById('modal-conditions').style.display = 'flex';
}
function fermerModalConditions() {
    document.getElementById('modal-conditions').style.display = 'none';
}
function fermerModalContactOnly() {
    document.getElementById('modal-contact-only').style.display = 'none';
}

// --- PAYMENT UI TOGGLES ---
function togglePaymentFields() {
    const method = document.getElementById('pay-method').value;
    document.getElementById('fields-mvola').style.display = method === 'mvola' ? 'block' : 'none';
    document.getElementById('fields-espece').style.display = method === 'espece' ? 'block' : 'none';
    document.getElementById('fields-montant').style.display = method ? 'block' : 'none';
}
function toggleAutreMontant() {
    const choix = document.getElementById('pay-choix-montant').value;
    document.getElementById('field-autre-montant').style.display = choix === 'autre' ? 'block' : 'none';
}
