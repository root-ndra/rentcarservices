/* ---------- INITIALISATION ---------- */
let sb = null;
let calendar = null;
let voitureSelectionnee = null;
let currentCarReservations = [];
let currentReservationId = null;
let realTimeSubscription = null;
let reductionActive = 0;
let currentResaData = null;
let voituresCache = [];
let siteConfig = null;

async function initSupabase() {
  if (sb) return;
  const response = await fetch('supabase-config.json');
  if (!response.ok) throw new Error('supabase-config.json introuvable');
  const { supabaseUrl, supabaseKey } = await response.json();
  sb = supabase.createClient(supabaseUrl, supabaseKey);
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initSupabase();
    await chargerVoitures();
    bindFiltres();
    await loadSiteConfig();
  } catch (e) {
    console.error(e);
    const container = document.getElementById('container-voitures');
    if (container) container.innerHTML = '<p>Impossible de charger les véhicules.</p>';
  }
});

/* ---------- CONFIG SITE ---------- */
async function loadSiteConfig() {
  const resp = await fetch('site_config.json');
  if (!resp.ok) return;
  siteConfig = await resp.json();
  setText('header-site-name', siteConfig.header?.siteName || 'RIJA NIAINA CAR SERVICES');
  setAttr('header-logo', 'src', siteConfig.header?.logoUrl || 'https://i.ibb.co/dw8gxWXL/1765001359376.png');
  setText('footer-title', siteConfig.header?.siteName || 'Rija NIAINA Car Services');
  setText('footer-address', siteConfig.footer?.address || 'Siae 33 Ambodifilao, Analakely, Antananarivo 101');
  setText('footer-phone', siteConfig.contact?.phoneDisplay || '+261 38 85 524 32');
  setText('footer-nif', siteConfig.footer?.nif || '5012357932');
  setText('footer-stat', siteConfig.footer?.stat || '70209 11 2025 0 06328');
  setText('txt-modal-phone', siteConfig.contact?.phoneDisplay || '+261 38 85 524 32');
  if (siteConfig.footer?.socials) {
    const footerSocials = document.getElementById('footer-socials');
    footerSocials.innerHTML = '';
    Object.entries(siteConfig.footer.socials).forEach(([k, url]) => {
      if (url) footerSocials.innerHTML += `<a href="${url}" target="_blank" style="color:white;margin:0 8px;"><i class="fab fa-${k}"></i></a>`;
    });
  }
}
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text ?? '';
}
function setAttr(id, attr, value) {
  const el = document.getElementById(id);
  if (el) el.setAttribute(attr, value ?? '');
}
function toggleMenu() { document.getElementById('nav-menu')?.classList.toggle('active'); }
function formatPrix(val) { return (val || 0).toLocaleString('fr-FR'); }

/* ---------- CHARGEMENT VOITURES ---------- */
async function chargerVoitures() {
  const container = document.getElementById('container-voitures');
  container.innerHTML = '<p>Chargement...</p>';

  const { data, error } = await sb.from('voitures')
    .select('*')
    .eq('est_public', true)
    .order('prix_base');
  if (error) {
    container.innerHTML = `<p>Erreur : ${error.message}</p>`;
    return;
  }

  voituresCache = data || [];
  remplirFiltres(voituresCache);
  renderVoitures(voituresCache);
}

function renderVoitures(list) {
  const container = document.getElementById('container-voitures');
  if (!list.length) {
    container.innerHTML = '<p>Aucune voiture ne correspond.</p>';
    return;
  }

  container.innerHTML = list.map(v => {
    const reservable = v.reservable !== false;
    const chauffeur = v.chauffeur_option === 'oui'
      ? 'Chauffeur inclus'
      : v.chauffeur_option === 'non'
        ? 'Sans chauffeur'
        : 'Chauffeur en option';
    const desc = v.description
      ? v.description.slice(0, 140) + (v.description.length > 140 ? '…' : '')
      : 'Description à venir.';

    return `
      <article class="carte-voiture">
        <img src="${v.image_url || 'https://placehold.co/800x500?text=Voiture'}" alt="${v.nom}">
        <div class="carte-body">
          <h3>${v.nom}</h3>
          <div class="car-tags">
            <span><i class="fas fa-tags"></i> ${v.type || '—'}</span>
            <span><i class="fas fa-gas-pump"></i> ${v.carburant || '—'}</span>
            <span><i class="fas fa-user-friends"></i> ${v.places ? `${v.places} places` : '—'}</span>
            <span><i class="fas fa-id-card"></i> ${chauffeur}</span>
          </div>
          <p class="carte-desc">${desc}</p>
          <div class="car-infos">
            <div><i class="fas fa-cogs"></i>${v.transmission || '—'}</div>
            <div><i class="fas fa-car-side"></i>${v.categorie || v.segment || 'Usage mixte'}</div>
          </div>
          <p class="prix">${formatPrix(v.prix_base)} Ar / jour</p>
          <div class="card-actions">
            <button class="btn-reserver ${reservable ? '' : 'btn-disabled'}"
                    data-id="${v.id}"
                    data-nom="${v.nom.replace(/"/g, '&quot;')}"
                    data-prix="${v.prix_base || 0}"
                    data-ref="${v.ref_id || ''}"
                    onclick="${reservable ? 'handleReserveClick(event)' : 'return false;'}"
                    ${reservable ? '' : 'disabled'}>
              RÉSERVER
            </button>
            <button class="btn-contact" onclick="ouvrirModalContact('${v.id}')">CONTACTER</button>
          </div>
        </div>
      </article>`;
  }).join('');
}

function handleReserveClick(evt) {
  const btn = evt.currentTarget;
  ouvrirReservationDepuisCarte(
    btn.dataset.id,
    btn.dataset.nom,
    parseInt(btn.dataset.prix, 10) || 0,
    btn.dataset.ref || ''
  );
}

/* ---------- FILTRES ---------- */
function bindFiltres() {
  ['filter-type', 'filter-carburant', 'filter-places', 'filter-prix-max', 'sort-prix']
    .forEach(id => document.getElementById(id)?.addEventListener('input', appliquerFiltres));
}
function remplirFiltres(list) {
  const remplir = (id, values) => {
    const select = document.getElementById(id);
    if (!select) return;
    const uniques = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    const label = select.options[0]?.text || 'Tous';
    select.innerHTML = `<option value="">${label}</option>`;
    uniques.forEach(val => select.innerHTML += `<option value="${val}">${val}</option>`);
  };
  remplir('filter-type', list.map(v => v.type));
  remplir('filter-carburant', list.map(v => v.carburant));
}
function appliquerFiltres() {
  const type = document.getElementById('filter-type').value;
  const carburant = document.getElementById('filter-carburant').value;
  const places = document.getElementById('filter-places').value;
  const prixMax = parseInt(document.getElementById('filter-prix-max').value, 10) || 0;
  const sort = document.getElementById('sort-prix').value;

  const resultat = voituresCache.filter(v => {
    const matchType = !type || v.type === type;
    const matchCarb = !carburant || v.carburant === carburant;
    const matchPlaces = !places || (places === '7+' ? (v.places || 0) >= 7 : String(v.places || '') === places);
    const matchPrix = !prixMax || (v.prix_base || 0) <= prixMax;
    return matchType && matchCarb && matchPlaces && matchPrix;
  });

  resultat.sort((a, b) => sort === 'prix-desc'
    ? (b.prix_base || 0) - (a.prix_base || 0)
    : (a.prix_base || 0) - (b.prix_base || 0));

  renderVoitures(resultat);
}

/* ---------- ACTIONS CARTES ---------- */
function ouvrirReservationDepuisCarte(id, nom, prix, ref) {
  selectionnerVoiture(id, nom, prix, ref);
  const section = document.getElementById('reservation');
  if (section) {
    section.style.display = 'block';
    window.scrollTo({ top: section.offsetTop - 30, behavior: 'smooth' });
  }
}

function ouvrirModalContact(idVoiture) {
  const voiture = voituresCache.find(v => v.id == idVoiture);
  if (!voiture) return;
  setText('contact-car-name', voiture.nom);
  if (siteConfig?.contact) {
    setAttr('btn-modal-call', 'href', `tel:${siteConfig.contact.phoneCall}`);
    const wa = siteConfig.contact.whatsapp.replace(/\D/g, '');
    const message = encodeURIComponent(`Bonjour, je suis intéressé(e) par ${voiture.nom}.`);
    setAttr('btn-modal-wa', 'href', `https://wa.me/${wa}?text=${message}`);
    setText('txt-modal-phone', siteConfig.contact.phoneDisplay);
  }
  document.getElementById('modal-contact-only').style.display = 'flex';
}
function closeContactModal() { document.getElementById('modal-contact-only').style.display = 'none'; }

/* ---------- RÉSERVATION ---------- */
function selectionnerVoiture(id, nom, prix, ref) {
  voitureSelectionnee = { id, nom, prix, ref };
  document.getElementById('nom-voiture-selectionnee').innerText = nom;
  document.getElementById('id-voiture-input').value = id;
  document.getElementById('ref-voiture-input').value = ref;
  document.getElementById('prix-base-input').value = prix;

  resetReservationForm();
  document.getElementById('reservation').style.display = 'block';
  initCalendar(id);
}

function resetReservationForm() {
  ['date-debut', 'date-fin', 'code-promo', 'loueur-nom', 'loueur-prenom',
   'loueur-adresse', 'loueur-tel', 'loueur-tel2', 'loueur-cin',
   'urgence-nom', 'urgence-prenom', 'urgence-tel'
  ].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

  reductionActive = 0;
  document.getElementById('msg-promo').innerText = '';
  document.getElementById('opt-livraison').checked = false;
  document.getElementById('opt-recuperation').checked = false;
  document.querySelector('input[name="offre"][value="jour"]').checked = true;
  document.getElementById('check-conditions-step1').checked = false;

  document.getElementById('step-1-actions').style.display = 'block';
  document.getElementById('step-2-paiement').style.display = 'none';
  document.getElementById('step-3-download').style.display = 'none';
  document.getElementById('btn-dl-pdf').disabled = true;
  document.getElementById('btn-dl-pdf').classList.remove('btn-pdf-active');
  document.getElementById('input-otp-auto').value = '';
}

/* ---------- CALENDRIER & DISPONIBILITÉ ---------- */
async function initCalendar(idVoiture) {
  if (calendar) calendar.destroy();
  const calendarEl = document.getElementById('calendrier-dispo');

  const [{ data: resas }, { data: maints }] = await Promise.all([
    sb.from('reservations')
      .select('date_debut, date_fin')
      .eq('id_voiture', idVoiture)
      .neq('code_otp', null),
    sb.from('maintenances')
      .select('date_debut, date_fin')
      .eq('id_voiture', idVoiture)
  ]);

  currentCarReservations = [];
  const events = [];

  (resas || []).forEach(r => {
    currentCarReservations.push({ start: new Date(r.date_debut), end: new Date(r.date_fin) });
    const finPlus = new Date(r.date_fin);
    finPlus.setDate(finPlus.getDate() + 1);
    events.push({
      title: 'Loué',
      start: r.date_debut,
      end: finPlus.toISOString().split('T')[0],
      display: 'background',
      color: '#e74c3c'
    });
  });

  (maints || []).forEach(m => {
    currentCarReservations.push({ start: new Date(m.date_debut), end: new Date(m.date_fin) });
    const finPlus = new Date(m.date_fin);
    finPlus.setDate(finPlus.getDate() + 1);
    events.push({
      title: 'Maintenance',
      start: m.date_debut,
      end: finPlus.toISOString().split('T')[0],
      display: 'background',
      color: '#f39c12'
    });
  });

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    locale: 'fr',
    events,
    dateClick: info => {
      const debut = document.getElementById('date-debut');
      const fin = document.getElementById('date-fin');
      if (!debut.value) debut.value = info.dateStr;
      else if (!fin.value) {
        if (new Date(info.dateStr) >= new Date(debut.value)) {
          fin.value = info.dateStr;
        } else {
          debut.value = info.dateStr;
          fin.value = '';
        }
      } else {
        debut.value = info.dateStr;
        fin.value = '';
      }
      calculerPrix();
    }
  });
  calendar.render();
}

function verifierDisponibilite(debut, fin) {
  const d1 = new Date(debut);
  const d2 = new Date(fin);
  return !currentCarReservations.some(resa => d1 <= resa.end && d2 >= resa.start);
}

/* ---------- CALCUL PRIX & PROMO ---------- */
function calculerPrix() {
  const prixBase = parseInt(document.getElementById('prix-base-input').value || 0, 10);
  const dateDebut = document.getElementById('date-debut').value;
  const dateFin = document.getElementById('date-fin').value;
  if (!prixBase || !dateDebut || !dateFin) return;

  const d1 = new Date(dateDebut);
  const d2 = new Date(dateFin);
  if (d2 < d1) return;

  const jours = Math.ceil((d2 - d1) / 86400000) + 1;
  const formule = document.querySelector('input[name="offre"]:checked').value;
  let multiplicateur = 1;
  if (formule === 'nuit') multiplicateur = 0.8;
  if (formule === '24h') multiplicateur = 1.3;

  let total = prixBase * jours * multiplicateur;
  if (document.getElementById('opt-livraison').checked) total += 15000;
  if (document.getElementById('opt-recuperation').checked) total += 15000;

  if (reductionActive > 0) total = total * (1 - reductionActive / 100);

  const acompte = Math.round(total * 0.5);

  document.getElementById('txt-jours').innerText = jours;
  document.getElementById('txt-formule').innerText = formule.toUpperCase();
  document.getElementById('prix-total').innerText = formatPrix(Math.round(total));
  document.getElementById('prix-acompte').innerText = formatPrix(acompte);
  document.getElementById('pay-reste').innerText = formatPrix(Math.round(total) - acompte);
}

async function verifierPromo() {
  const code = document.getElementById('code-promo').value.trim().toUpperCase();
  const msg = document.getElementById('msg-promo');
  const dateDebut = document.getElementById('date-debut').value;
  const dateFin = document.getElementById('date-fin').value;
  if (!dateDebut || !dateFin) {
    msg.innerText = 'Sélectionnez les dates.';
    msg.style.color = 'red';
    return;
  }

  const diffDays = Math.ceil((new Date(dateFin) - new Date(dateDebut)) / 86400000) + 1;
  const { data } = await sb.from('codes_promo').select('*').eq('code', code).eq('actif', true).single();

  if (!data) {
    reductionActive = 0;
    msg.innerText = 'Code invalide.';
    msg.style.color = 'red';
  } else if (dateDebut < data.date_debut || dateDebut > data.date_fin) {
    reductionActive = 0;
    msg.innerText = 'Code expiré/non actif.';
    msg.style.color = 'red';
  } else if (diffDays < data.min_jours) {
    reductionActive = 0;
    msg.innerText = `Minimum ${data.min_jours} jours requis.`;
    msg.style.color = 'red';
  } else {
    reductionActive = data.reduction_pourcent;
    msg.innerText = `-${reductionActive}% appliqué.`;
    msg.style.color = 'green';
  }
  calculerPrix();
}

/* ---------- WORKFLOW ---------- */
function faireLeCalculMathematique() {
  const prixTotal = parseInt(document.getElementById('prix-total').innerText.replace(/\s/g, ''), 10);
  const jours = parseInt(document.getElementById('txt-jours').innerText, 10);
  if (!prixTotal || !jours) return { ok: false };

  return {
    ok: true,
    total: prixTotal,
    acompte: Math.round(prixTotal / 2),
    offre: document.querySelector('input[name="offre"]:checked').value
  };
}

async function lancerReservationWhatsApp() {
  if (!document.getElementById('check-conditions-step1').checked) {
    alert('Merci d’accepter les conditions.');
    return;
  }

  const payload = construirePayloadClient();
  if (!payload) return;

  if (!verifierDisponibilite(payload.date_debut, payload.date_fin)) {
    alert('Ces dates ne sont plus disponibles.');
    return;
  }

  await sb.from('clients').upsert({ nom: payload.nom, tel: payload.tel }, { onConflict: 'tel' });
  const { data, error } = await sb.from('reservations').insert([payload]).select();
  if (error) {
    alert('Erreur : ' + error.message);
    return;
  }

  currentReservationId = data[0].id;
  currentResaData = data[0];

  ouvrirWhatsApp(payload);
  document.getElementById('step-1-actions').style.display = 'none';
  document.getElementById('step-2-paiement').style.display = 'block';
  document.getElementById('step-2-paiement').scrollIntoView({ behavior: 'smooth' });
}

function construirePayloadClient() {
  const dateDebut = document.getElementById('date-debut').value;
  const dateFin = document.getElementById('date-fin').value;
  if (!dateDebut || !dateFin) {
    alert('Choisissez vos dates.');
    return null;
  }

  const nom = document.getElementById('loueur-nom').value.trim();
  const prenom = document.getElementById('loueur-prenom').value.trim();
  const tel = document.getElementById('loueur-tel').value.trim();
  const cin = document.getElementById('loueur-cin').value.trim();
  if (!nom || !tel || !cin) {
    alert('Nom, téléphone et CIN sont obligatoires.');
    return null;
  }

  const calcul = faireLeCalculMathematique();
  if (!calcul.ok) {
    alert('Vérifiez vos dates.');
    return null;
  }

  return {
    id_voiture: document.getElementById('id-voiture-input').value,
    date_debut: dateDebut,
    date_fin: dateFin,
    nom,
    prenom,
    adresse: document.getElementById('loueur-adresse').value,
    tel,
    tel2: document.getElementById('loueur-tel2').value,
    cin_passeport: cin,
    urgence_nom: document.getElementById('urgence-nom').value,
    urgence_prenom: document.getElementById('urgence-prenom').value,
    urgence_tel: document.getElementById('urgence-tel').value,
    type_offre: calcul.offre,
    montant_total: calcul.total,
    statut: 'en_attente'
  };
}

function ouvrirWhatsApp(payload) {
  const message = [
    `Bonjour Rija,`,
    `Réservation *${document.getElementById('nom-voiture-selectionnee').innerText}* (#${currentReservationId})`,
    `Du ${payload.date_debut} au ${payload.date_fin}`,
    `Total : ${formatPrix(payload.montant_total)} Ar`,
    `Client : ${payload.nom} ${payload.prenom}`,
    `CIN : ${payload.cin_passeport}`,
    `Tel : ${payload.tel}`,
    `Je procède au paiement.`,
  ].join('\n');
  window.open(`https://wa.me/261388552432?text=${encodeURIComponent(message)}`, '_blank');
}

/* ---------- PAIEMENT & OTP ---------- */
/* ---------- PAIEMENT & OTP ---------- */
function togglePaymentFields() {
  const method = document.getElementById('pay-method').value;
  
  // Gestion de l'affichage Mvola
  const divMvola = document.getElementById('fields-mvola');
  if (divMvola) {
      divMvola.style.display = method === 'mvola' ? 'block' : 'none';
  }

  // Gestion de l'affichage Espèce (C'est ici que votre code coupait)
  const divEspece = document.getElementById('fields-espece');
  if (divEspece) {
      divEspece.style.display = method === 'espece' ? 'block' : 'none';
  }
}

// Fonction manquante pour toggleAutreMontant (appelée dans le HTML mais absente du JS)
function toggleAutreMontant() {
    const choix = document.getElementById('pay-choix-montant').value;
    const inputAutre = document.getElementById('pay-valeur-autre');
    if (inputAutre) {
        inputAutre.style.display = choix === 'autre' ? 'block' : 'none';
    }
    calculerResteAPayer(); // Mise à jour dynamique
}

// Fonction utile pour mettre à jour le texte "Reste à payer" lors du paiement
function calculerResteAPayer() {
    const total = parseInt(document.getElementById('prix-total').innerText.replace(/\s/g, ''), 10) || 0;
    const choix = document.getElementById('pay-choix-montant').value;
    let paye = 0;

    if (choix === '50') paye = total * 0.5;
    else if (choix === '100') paye = total;
    else {
        paye = parseInt(document.getElementById('pay-valeur-autre').value, 10) || 0;
    }

    const reste = Math.max(0, total - paye);
    const elReste = document.getElementById('pay-reste');
    if (elReste) elReste.innerText = formatPrix(reste);
}

// Fonction placeholder pour éviter une erreur si on clique sur "Confirmer le paiement"
function envoyerInfosPaiement() {
    alert("Fonctionnalité de paiement à implémenter (Mvola/Espèce).");
}

// Fonction placeholder pour le téléchargement PDF
function telechargerFactureAuto() {
    alert("Téléchargement de la facture...");
}
