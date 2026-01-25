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
function toggleMenu() { document.getElementById('nav-menu')?.classList.toggle('active'); }
function afficherSection(id) {
  document.querySelectorAll('.page-section').forEach(sec => sec.style.display = 'none');
  document.getElementById(id).style.display = 'block';
  window.scrollTo(0, 0);
}
function formatPrix(val) { return (val || 0).toLocaleString('fr-FR'); }

/* ---------- CHARGEMENT VOITURES ---------- */
let voituresCache = [];

async function chargerVoitures() {
  const container = document.getElementById('container-voitures');
  container.innerHTML = '<p>Chargement...</p>';

  const { data, error } = await sb.from('voitures').select('*').eq('est_public', true).order('prix_base');
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
    const btnLabel = reservable ? 'Réserver' : 'Contactez-nous';
    const btnClass = reservable ? '' : 'btn-disabled';
    return `
      <article class="carte-voiture">
        <img src="${v.image_url || 'https://placehold.co/600x400'}" alt="${v.nom}">
        <h3>${v.nom}</h3>
        <p>${v.type || '-'} · ${v.transmission || '-'}</p>
        <p class="prix">${formatPrix(v.prix_base)} Ar / jour</p>
        <button class="${btnClass}" onclick="gererClickVoiture('${v.id}', ${reservable})">${btnLabel}</button>
      </article>`;
  }).join('');
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

  let resultat = voituresCache.filter(v => {
    const matchType = !type || v.type === type;
    const matchCarb = !carburant || v.carburant === carburant;
    const matchPlaces = !places ||
      (places === '7+' ? (v.places || 0) >= 7 : String(v.places || '') === places);
    const matchPrix = !prixMax || (v.prix_base || 0) <= prixMax;
    return matchType && matchCarb && matchPlaces && matchPrix;
  });

  resultat.sort((a, b) => sort === 'prix-desc'
    ? (b.prix_base || 0) - (a.prix_base || 0)
    : (a.prix_base || 0) - (b.prix_base || 0));

  renderVoitures(resultat);
}

/* ---------- ROUTAGE BOUTON ---------- */
function gererClickVoiture(idVoiture, isReservable) {
  const voiture = voituresCache.find(v => v.id == idVoiture);
  if (!voiture) return;
  if (isReservable) {
    selectionnerVoiture(voiture.id, voiture.nom, voiture.prix_base, voiture.ref_id || '');
  } else {
    ouvrirModalContact(voiture);
  }
}

function ouvrirModalContact(voiture) {
  document.getElementById('contact-car-name').innerText = voiture.nom;
  document.getElementById('btn-modal-call').href = 'tel:+261388552432';
  const message = encodeURIComponent(`Bonjour, je souhaite louer ${voiture.nom}.`);
  document.getElementById('btn-modal-wa').href = `https://wa.me/261388552432?text=${message}`;
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
  const prixBase = parseInt(document.getElementById('prix-base ছাড়া').value || 0, 10); // keep as-is? but original code not truncated? we'll assume original.

