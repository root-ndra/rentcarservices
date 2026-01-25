/* ---------- INITIALISATION ---------- */
let sb = null;
let calendar = null;
let voitureSelectionnee = null;
let currentCarReservations = [];
let currentReservationId = null;
let realTimeSubscription = null;
let reductionActive = 0;
let currentResaData = null;

async function initSupabase() {
  if (sb) return;
  const response = await fetch('supabase-config.json');
  if (!response.ok) throw new Error('supabase-config introuvable');
  const { supabaseUrl, supabaseKey } = await response.json();
  sb = supabase.createClient(supabaseUrl, supabaseKey);
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initSupabase();
    await chargerVoitures();
    bindFiltres();
  } catch (e) {
    console.error(e);
    const container = document.getElementById('container-voitures');
    if (container) container.innerHTML = '<p>Impossible de charger les véhicules.</p>';
  }
});

/* ---------- UI ---------- */
function toggleMenu() {
  document.getElementById('nav-menu')?.classList.toggle('active');
}

function afficherSection(id) {
  document.querySelectorAll('.page-section').forEach(sec => sec.style.display = 'none');
  document.getElementById(id).style.display = 'block';
  window.scrollTo(0, 0);
}

function formatPrix(val) {
  return (val || 0).toLocaleString('fr-FR');
}

/* ---------- CHARGEMENT VOITURES ---------- */
let voituresCache = [];

async function chargerVoitures() {
  const container = document.getElementById('container-voitures');
  container.innerHTML = '<p>Chargement...</p>';

  const { data, error } = await sb.from('voitures')
    .select('*')
    .eq('est_public', true)
    .neq('reservable', false)
    .order('prix_base', { ascending: true });

  if (error) {
    container.innerHTML = `<p>${error.message}</p>`;
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

  container.innerHTML = list.map(v => `
    <article class="carte-voiture">
      <img src="${v.image_url || 'https://placehold.co/600x400'}" alt="${v.nom}">
      <h3>${v.nom}</h3>
      <p>${v.type || '-'} · ${v.transmission || '-'}</p>
      <p class="prix">${formatPrix(v.prix_base)} Ar / jour</p>
      <button onclick="selectionnerVoiture('${v.id}', '${v.nom.replace(/'/g, "\\'")}', ${v.prix_base}, '${v.ref_id || ''}')">
        Réserver
      </button>
    </article>
  `).join('');
}

function bindFiltres() {
  ['filtre-type', 'filtre-transmission', 'filtre-places', 'filtre-prix']
    .forEach(id => document.getElementById(id)?.addEventListener('input', appliquerFiltres));
}

function remplirFiltres(list) {
  const remplir = (id, values) => {
    const select = document.getElementById(id);
    if (!select) return;
    const uniques = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    uniques.forEach(val => select.innerHTML += `<option value="${val}">${val}</option>`);
  };
  remplir('filtre-type', list.map(v => v.type));
  remplir('filtre-transmission', list.map(v => v.transmission));
}

function appliquerFiltres() {
  const type = document.getElementById('filtre-type').value;
  const trans = document.getElementById('filtre-transmission').value;
  const places = document.getElementById('filtre-places').value;
  const prix = parseInt(document.getElementById('filtre-prix').value, 10) || 0;

  const res = voituresCache.filter(v => {
    const matchType = !type || v.type === type;
    const matchTrans = !trans || v.transmission === trans;
    const matchPlaces = !places ||
      (places === '7+' ? (v.places || 0) >= 7 : String(v.places || '') === places);
    const matchPrix = !prix || (v.prix_base || 0) <= prix;
    return matchType && matchTrans && matchPlaces && matchPrix;
  });

  renderVoitures(res);
}

/* ---------- RÉSERVATION ---------- */
function selectionnerVoiture(id, nom, prix, ref) {
  voitureSelectionnee = { id, nom, prix, ref };
  document.getElementById('nom-voiture-selectionnee').innerText = nom;
  document.getElementById('id-voiture-input').value = id;
  document.getElementById('ref-voiture-input').value = ref;
  document.getElementById('prix-base-input').value = prix;

  resetReservationForm();
  afficherSection('reservation');
  initCalendar(id);
}

function resetReservationForm() {
  ['date-debut', 'date-fin', 'code-promo', 'loueur-nom', 'loueur-prenom',
   'loueur-adresse', 'loueur-tel', 'loueur-tel2', 'loueur-cin',
   'urgence-nom', 'urgence-prenom', 'urgence-tel'
  ].forEach(id => { if (document.getElementById(id)) document.getElementById(id).value = ''; });

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

/* ---------- CALENDRIER ---------- */
async function initCalendar(idVoiture) {
  if (calendar) calendar.destroy();
  const calendarEl = document.getElementById('calendrier-dispo');

  const [{ data: resas }, { data: maints }] = await Promise.all([
    sb.from('reservations').select('date_debut, date_fin').eq('id_voiture', idVoiture).neq('code_otp', null),
    sb.from('maintenances').select('date_debut, date_fin').eq('id_voiture', idVoiture)
  ]);

  currentCarReservations = [];
  const events = [];

  (resas || []).forEach(r => {
    currentCarReservations.push({ start: new Date(r.date_debut), end: new Date(r.date_fin) });
    const finPlus = new Date(r.date_fin); finPlus.setDate(finPlus.getDate() + 1);
    events.push({ title: 'Loué', start: r.date_debut, end: finPlus.toISOString().split('T')[0], display: 'background', color: '#e74c3c' });
  });

  (maints || []).forEach(m => {
    currentCarReservations.push({ start: new Date(m.date_debut), end: new Date(m.date_fin) });
    const finPlus = new Date(m.date_fin); finPlus.setDate(finPlus.getDate() + 1);
    events.push({ title: 'Maintenance', start: m.date_debut, end: finPlus.toISOString().split('T')[0], display: 'background', color: '#f39c12' });
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
        if (new Date(info.dateStr) >= new Date(debut.value)) fin.value = info.dateStr;
        else { debut.value = info.dateStr; fin.value = ''; }
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
function togglePaymentFields() {
  const method = document.getElementById('pay-method').value;
  document.getElementById('fields-mvola').style.display = method === 'mvola' ? 'block' : 'none';
  document.getElementById('fields-espece').style.display = method === 'espece' ? 'block' : 'none';
}

function toggleAutreMontant() {
  const choix = document.getElementById('pay-choix-montant').value;
  document.getElementById('pay-valeur-autre').style.display = (choix === 'autre') ? 'block' : 'none';
}

async function envoyerInfosPaiement() {
  if (!currentReservationId) {
    alert('Aucune réservation en cours.');
    return;
  }
  const method = document.getElementById('pay-method').value;
  if (!method) return alert('Choisissez un mode de paiement.');

  const paiement = {
    methode: method,
    titulaire_nom: method === 'mvola' ? document.getElementById('pay-mvola-nom').value.trim() : document.getElementById('pay-cash-nom').value.trim(),
    titulaire_prenom: method === 'mvola' ? document.getElementById('pay-mvola-prenom').value.trim() : document.getElementById('pay-cash-prenom').value.trim(),
    numero: method === 'mvola' ? document.getElementById('pay-mvola-num').value.trim() : document.getElementById('pay-cash-num').value.trim(),
    reference: method === 'mvola' ? document.getElementById('pay-mvola-ref').value.trim() : '',
    type_montant: document.getElementById('pay-choix-montant').value
  };
  if (!paiement.titulaire_nom) return alert('Nom du payeur requis.');

  const montantBase = currentResaData.montant_total;
  let montantDeclare = montantBase / 2;
  if (paiement.type_montant === '100') montantDeclare = montantBase;
  if (paiement.type_montant === 'autre') {
    montantDeclare = parseFloat(document.getElementById('pay-valeur-autre').value) || 0;
  }

  const { error } = await sb.from('reservations').update({
    paiement_methode: paiement.methode,
    paiement_titulaire: `${paiement.titulaire_nom} ${paiement.titulaire_prenom}`.trim(),
    paiement_numero: paiement.numero,
    paiement_ref: paiement.reference,
    paiement_type_montant: paiement.type_montant,
    paiement_montant_declare: montantDeclare
  }).eq('id', currentReservationId);

  if (error) {
    alert('Erreur : ' + error.message);
    return;
  }

  Object.assign(currentResaData, {
    paiement_methode: paiement.methode,
    paiement_titulaire: `${paiement.titulaire_nom} ${paiement.titulaire_prenom}`.trim(),
    paiement_numero: paiement.numero,
    paiement_ref: paiement.reference,
    paiement_montant_declare: montantDeclare
  });

  document.getElementById('step-2-paiement').style.display = 'none';
  document.getElementById('step-3-download').style.display = 'block';
  ecouterValidationAdmin();
}

function ecouterValidationAdmin() {
  if (!currentReservationId) return;

  if (realTimeSubscription) sb.removeChannel(realTimeSubscription);

  realTimeSubscription = sb.channel('suivi-resa-' + currentReservationId)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'reservations',
      filter: `id=eq.${currentReservationId}`
    }, payload => {
      if (payload.new.code_otp) {
        activerBoutonDownload(payload.new.code_otp);
        currentResaData = payload.new;
      }
    })
    .subscribe();
}

function activerBoutonDownload(code) {
  const input = document.getElementById('input-otp-auto');
  const btn = document.getElementById('btn-dl-pdf');
  input.value = code;
  input.style.borderColor = '#2ecc71';
  btn.disabled = false;
  btn.classList.add('btn-pdf-active');
  document.querySelector('.otp-loader').innerHTML = '<i class="fas fa-check-circle" style="color:green"></i> Paiement validé !';
}

/* ---------- PDF ---------- */
function telechargerFactureAuto() {
  if (!currentResaData) return;
  genererPDF(currentResaData);
}

function genererPDF(resa) {
  if (!window.jspdf) return alert('Librairie PDF manquante.');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const timestamp = new Date();
  const nomFichier = formatDateFile(timestamp) + '.pdf';

  doc.setFillColor(44, 62, 80);
  doc.rect(0, 0, 210, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text('RIJA NIAINA CAR SERVICES', 105, 15, { align: 'center' });
  doc.setFontSize(10);
  doc.text('SIAE 33 Ambodifilao, Analakely, Antananarivo', 105, 25, { align: 'center' });
  doc.text('Tel : +261 38 85 524 32', 105, 32, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.text(`Facture N° ${resa.id}`, 14, 55);
  doc.text(`Date : ${timestamp.toLocaleDateString('fr-FR')}`, 195, 55, { align: 'right' });

  const d1 = new Date(resa.date_debut);
  const d2 = new Date(resa.date_fin);
  const duree = Math.ceil((d2 - d1) / 86400000) + 1;

  const paye = parseFloat(resa.paiement_montant_declare) || 0;
  const reste = (resa.montant_total || 0) - paye;

  doc.autoTable({
    startY: 65,
    head: [['CLIENT', 'LOCATION', 'PAIEMENT']],
    body: [[
      `Nom : ${resa.nom} ${resa.prenom || ''}\nTel : ${resa.tel}\nAdresse : ${resa.adresse || '-'}`,
      `Voiture : ${document.getElementById('nom-voiture-selectionnee').innerText}\nPériode : ${resa.date_debut} → ${resa.date_fin}\nDurée : ${duree} jour(s)\nTotal : ${formatPrix(resa.montant_total)} Ar`,
      `Méthode : ${resa.paiement_methode || '-'}\nPayé : ${formatPrix(paye)} Ar\nReste : ${formatPrix(reste)} Ar\nOTP : ${resa.code_otp || '-'}`,
    ]],
    theme: 'grid',
    headStyles: { fillColor: [52, 152, 219] },
    styles: { cellPadding: 5, fontSize: 10 }
  });

  doc.save(nomFichier);
}

function formatDateFile(dateObj) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(dateObj.getHours())}-${pad(dateObj.getMinutes())}-${pad(dateObj.getSeconds())}-${pad(dateObj.getDate())}-${pad(dateObj.getMonth() + 1)}-${dateObj.getFullYear()}`;
}

/* ---------- MODAL CONDITIONS ---------- */
function ouvrirModalConditions() {
  document.getElementById('modal-conditions').style.display = 'flex';
}

function fermerModalConditions() {
  document.getElementById('modal-conditions').style.display = 'none';
}

/* ---------- EXPORT GLOBAL ---------- */
window.toggleMenu = toggleMenu;
window.selectionnerVoiture = selectionnerVoiture;
window.calculerPrix = calculerPrix;
window.verifierPromo = verifierPromo;
window.lancerReservationWhatsApp = lancerReservationWhatsApp;
window.togglePaymentFields = togglePaymentFields;
window.toggleAutreMontant = toggleAutreMontant;
window.envoyerInfosPaiement = envoyerInfosPaiement;
window.telechargerFactureAuto = telechargerFactureAuto;
window.ouvrirModalConditions = ouvrirModalConditions;
window.fermerModalConditions = fermerModalConditions;
window.afficherSection = afficherSection;
