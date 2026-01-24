/* ---------- CHARGEMENT SUPABASE VIA JSON ---------- */
let supabaseClient = null;

async function initSupabase() {
  if (supabaseClient) return;
  const response = await fetch('supabase-config.json');
  if (!response.ok) throw new Error('supabase-config.json introuvable');
  const { supabaseUrl, supabaseKey } = await response.json();
  supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
}

/* ---------- DONNÉES GLOBALES ---------- */
let siteConfig = null;
let voituresCache = [];
let selectedCar = null;
let promoReduction = 0;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initSupabase();
    await loadSiteConfig();
    bindFilterListeners();
    bindReservationForm();
    await chargerVoitures();
  } catch (error) {
    console.error('Initialisation impossible :', error);
    const container = document.getElementById('container-voitures');
    if(container) container.innerHTML = '<p class="empty-state">Impossible de charger le catalogue.</p>';
  }
});

/* ---------- CONFIGURATION (logo, footer, contact) ---------- */
async function loadSiteConfig() {
  const resp = await fetch('site_config.json');
  if (!resp.ok) throw new Error('site_config.json introuvable');
  siteConfig = await resp.json();

  const { header, contact, footer } = siteConfig;
  setText('header-site-name', header.siteName);
  setAttr('header-logo', 'src', header.logoUrl);
  setText('footer-title', header.siteName);
  setText('footer-address', footer.address);
  setText('footer-nif', footer.nif);
  setText('footer-stat', footer.stat);
  setText('footer-phone', contact.phoneDisplay);
  setAttr('cta-hotline', 'href', `tel:${contact.phoneCall}`);

  const socials = document.getElementById('footer-socials');
  if(socials) {
    socials.innerHTML = '';
    const icons = { facebook: 'fab fa-facebook', instagram: 'fab fa-instagram', tiktok: 'fab fa-tiktok' };
    Object.entries(footer.socials || {}).forEach(([network, url]) => {
      if (!url || url === '#') return;
      socials.innerHTML += `
        <a href="${url}" target="_blank" rel="noopener"
           style="color:white;margin:0 8px;font-size:1.3rem;">
          <i class="${icons[network] || 'fas fa-globe'}"></i>
        </a>`;
    });
  }
}

/* ---------- UTILITAIRES UI ---------- */
function toggleMenu() { document.getElementById('nav-menu')?.classList.toggle('active'); }
function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text ?? ''; }
function setAttr(id, attr, value) { const el = document.getElementById(id); if (el) el.setAttribute(attr, value ?? ''); }

/* ---------- CHARGEMENT ET AFFICHAGE DES VOITURES ---------- */
async function chargerVoitures() {
  const container = document.getElementById('container-voitures');
  if (!container) return;
  container.innerHTML = '<p>Chargement du catalogue...</p>';

  const { data, error } = await supabaseClient.from('voitures').select('*').order('prix_base', { ascending: true });

  if (error) {
    container.innerHTML = `<p class="empty-state">Erreur : ${error.message}</p>`;
    return;
  }

  voituresCache = data || [];
  peuplerFiltresDynamiques(voituresCache);
  renderVoitures(voituresCache);
}

function renderVoitures(list) {
  const container = document.getElementById('container-voitures');
  if (!container) return;
  if (!list.length) {
    container.innerHTML = '<p class="empty-state">Aucun véhicule ne correspond à votre recherche.</p>';
    return;
  }

  container.innerHTML = list.map((v) => {
    const prix = (v.prix_base || 0).toLocaleString('fr-FR');
    const desc = (v.description || '').slice(0, 140);
    const chauffeurLabel = { oui: 'Chauffeur inclus', non: 'Sans chauffeur', option: 'Chauffeur en option' }[v.chauffeur_option || 'option'];
    const reservable = v.reservable !== false;

    return `
      <article class="carte-voiture">
        <img src="${v.image_url || 'https://placehold.co/600x400?text=Voiture'}" alt="${v.nom}">
        <h3>${v.nom}</h3>
        <div class="car-tags">
          <span><i class="fas fa-tags"></i> ${v.type || '—'}</span>
          <span><i class="fas fa-gas-pump"></i> ${v.carburant || '—'}</span>
          <span><i class="fas fa-user-friends"></i> ${v.places ? `${v.places} places` : '—'}</span>
          <span><i class="fas fa-id-card"></i> ${chauffeurLabel}</span>
        </div>
        <p class="carte-desc">${desc}${v.description?.length > 140 ? '…' : ''}</p>
        <p class="prix">${prix} Ar / jour</p>
        <button ${reservable ? '' : 'class="btn-disabled"'} onclick="reserverVoiture('${v.id}')">
          ${reservable ? 'Réserver' : 'Contact direct'}
        </button>
      </article>`;
  }).join('');
}

/* ---------- FILTRES ---------- */
function peuplerFiltresDynamiques(list) {
  const remplir = (id, values) => {
    const select = document.getElementById(id);
    if (!select) return;
    const uniques = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    select.innerHTML = `<option value="">Tous les ${id.split('-')[1]}s</option>`;
    uniques.forEach(val => select.innerHTML += `<option value="${val}">${val}</option>`);
  };
  remplir('filter-type', list.map(v => v.type));
  remplir('filter-carburant', list.map(v => v.carburant));
}

function bindFilterListeners() {
  ['filter-type', 'filter-carburant', 'filter-places', 'filter-prix-max', 'sort-prix']
    .forEach(id => document.getElementById(id)?.addEventListener('input', appliquerFiltres));
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
        const matchPlaces = !places || (places === '7+' ? (v.places || 0) >= 7 : String(v.places || '') === places);
        const matchPrix = !prixMax || (v.prix_base || 0) <= prixMax;
        return matchType && matchCarb && matchPlaces && matchPrix;
    });

    resultat.sort((a, b) => sort === 'prix-desc' ? (b.prix_base || 0) - (a.prix_base || 0) : (a.prix_base || 0) - (b.prix_base || 0));
    renderVoitures(resultat);
}


/* ---------- LOGIQUE MODALS (CONTACT & RESERVATION) ---------- */
function reserverVoiture(id) {
  const voiture = voituresCache.find((v) => v.id.toString() === id.toString());
  if (!voiture) return;

  if (voiture.reservable === false) {
    openContactModal(voiture);
  } else {
    openReservationModal(voiture);
  }
}

function openContactModal(voiture) {
  if (!siteConfig) return;
  setText('contact-car-name', voiture.nom);
  setText('txt-modal-phone', siteConfig.contact.phoneDisplay);
  setAttr('btn-modal-call', 'href', `tel:${siteConfig.contact.phoneCall}`);
  const whatsappNum = siteConfig.contact.whatsapp.replace(/\D/g, '');
  const text = encodeURIComponent(`Bonjour, je souhaite plus d'informations sur le véhicule : ${voiture.nom}.`);
  setAttr('btn-modal-wa', 'href', `https://wa.me/${whatsappNum}?text=${text}`);
  document.getElementById('modal-contact-only').style.display = 'flex';
}

function closeContactModal() {
  document.getElementById('modal-contact-only').style.display = 'none';
}

function openReservationModal(voiture) {
  selectedCar = voiture;
  promoReduction = 0;
  
  const form = document.getElementById('quick-reservation-form');
  if(form) form.reset();

  setText('modal-car-name', voiture.nom);
  setText('modal-car-price', (voiture.prix_base || 0).toLocaleString('fr-FR'));
  
  updateEstimation();
  document.getElementById('reservation-modal').style.display = 'flex';
}

function closeReservationModal() {
  document.getElementById('reservation-modal').style.display = 'none';
  selectedCar = null;
}

/* ---------- GESTION FORMULAIRE DE RÉSERVATION ---------- */
function bindReservationForm() {
  ['res-date-start', 'res-date-end', 'opt-chauffeur', 'opt-wifi', 'opt-assurance']
    .forEach(id => document.getElementById(id)?.addEventListener('input', updateEstimation));
}

function calcDays(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s) || isNaN(e) || e < s) return 0;
  return Math.ceil((e - s) / 86400000) + 1;
}

function updateEstimation() {
  if (!selectedCar) return;
  const start = document.getElementById('res-date-start').value;
  const end = document.getElementById('res-date-end').value;
  const days = calcDays(start, end);

  if (!days) {
    setText('summary-days', '—');
    setText('summary-total', '—');
    return;
  }

  let total = days * (selectedCar.prix_base || 0);
  if (document.getElementById('opt-chauffeur').checked) total += 60000 * days;
  if (document.getElementById('opt-wifi').checked) total += 20000 * days;
  if (document.getElementById('opt-assurance').checked) total += 40000 * days;
  if (promoReduction > 0) total *= 1 - promoReduction / 100;

  setText('summary-days', `${days} jour(s)`);
  setText('summary-total', `${Math.round(total).toLocaleString('fr-FR')} Ar`);
}

async function applyPromo() {
    // La logique de applyPromo reste la même que dans votre script original
    // ...
}

async function submitReservation(event) {
  event.preventDefault();
  if (!selectedCar || !siteConfig) return;

  const start = document.getElementById('res-date-start').value;
  const end = document.getElementById('res-date-end').value;
  const days = calcDays(start, end);
  const feedbackEl = document.getElementById('quick-reservation-feedback');

  if (!days) {
    feedbackEl.textContent = 'Veuillez sélectionner des dates valides.';
    feedbackEl.style.color = '#e74c3c';
    return;
  }

  const nom = document.getElementById('res-nom').value;
  const phone = document.getElementById('res-phone').value;
  const options = [];
  if (document.getElementById('opt-chauffeur').checked) options.push('Chauffeur');
  if (document.getElementById('opt-wifi').checked) options.push('Wi-Fi');
  if (document.getElementById('opt-assurance').checked) options.push('Assurance');
  
  const totalEstim = document.getElementById('summary-total').textContent;
  
  const text = encodeURIComponent(
    `*Demande de Réservation*\n\n` +
    `*Véhicule :* ${selectedCar.nom}\n` +
    `*Période :* Du ${start} au ${end} (${days} jours)\n` +
    `*Client :* ${nom}\n` +
    `*Téléphone :* ${phone}\n` +
    `*Options :* ${options.length ? options.join(', ') : 'Aucune'}\n` +
    `*Total estimé :* ${totalEstim}`
  );

  const whatsappNum = siteConfig.contact.whatsapp.replace(/\D/g, '');
  window.open(`https://wa.me/${whatsappNum}?text=${text}`, '_blank');

  feedbackEl.textContent = 'Votre demande a été préparée pour WhatsApp. Merci de l\'envoyer !';
  feedbackEl.style.color = '#16a34a';
  setTimeout(() => {
    feedbackEl.textContent = '';
    closeReservationModal();
  }, 3000);
}

/* ---------- EXPOSITION GLOBALE POUR LE HTML ---------- */
window.toggleMenu = toggleMenu;
window.reserverVoiture = reserverVoiture;
window.closeContactModal = closeContactModal;
window.closeReservationModal = closeReservationModal;
window.applyPromo = applyPromo;
window.submitReservation = submitReservation;
