/* chargement Supabase via supabase-config.json */
let supabaseClient = null;
async function initSupabase() {
  if (supabaseClient) return;
  const resp = await fetch('supabase-config.json');
  if (!resp.ok) throw new Error('supabase-config.json introuvable');
  const { supabaseUrl, supabaseKey } = await resp.json();
  supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
}

/* données globales */
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
    document.getElementById('container-voitures').innerHTML =
      '<p class="empty-state">Erreur de chargement.</p>';
  }
});

/* config site pour header/footer & contacts */
async function loadSiteConfig() {
  const resp = await fetch('site_config.json');
  if (!resp.ok) throw new Error('site_config.json introuvable');
  siteConfig = await resp.json();

  setText('header-site-name', siteConfig.header.siteName);
  setAttr('header-logo', 'src', siteConfig.header.logoUrl);
  setText('footer-title', siteConfig.header.siteName);
  setText('footer-address', siteConfig.footer.address);
  setText('footer-nif', siteConfig.footer.nif);
  setText('footer-stat', siteConfig.footer.stat);
  setText('footer-phone', siteConfig.contact.phoneDisplay);
  setAttr('cta-hotline', 'href', `tel:${siteConfig.contact.phoneCall}`);

  const socials = document.getElementById('footer-socials');
  socials.innerHTML = '';
  const icons = { facebook: 'fab fa-facebook', instagram: 'fab fa-instagram', tiktok: 'fab fa-tiktok' };
  Object.entries(siteConfig.footer.socials || {}).forEach(([network, url]) => {
    if (!url || url === '#') return;
    socials.innerHTML += `<a href="${url}" target="_blank" style="color:white;margin:0 8px;font-size:1.3rem;">
      <i class="${icons[network] || 'fas fa-globe'}"></i></a>`;
  });
}

/* utilitaires */
function toggleMenu() { document.getElementById('nav-menu')?.classList.toggle('active'); }
function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text ?? ''; }
function setAttr(id, attr, value) { const el = document.getElementById(id); if (el) el.setAttribute(attr, value ?? ''); }

/* chargement & rendu flotte */
async function chargerVoitures() {
  const container = document.getElementById('container-voitures');
  container.innerHTML = '<p>Chargement…</p>';

  const { data, error } = await supabaseClient
    .from('voitures')
    .select('*')
    .order('prix_base', { ascending: true });

  if (error) {
    container.innerHTML = `<p class="empty-state">${error.message}</p>`;
    return;
  }

  voituresCache = data || [];
  populateDynamicFilters();
  renderVoitures(voituresCache);
}

function populateDynamicFilters() {
  const fillSelect = (id, values) => {
    const select = document.getElementById(id);
    if (!select) return;
    const uniques = Array.from(new Set(values.filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    const oldValue = select.value;
    select.innerHTML = '<option value="">Tous</option>';
    uniques.forEach((val) => {
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = val;
      select.appendChild(opt);
    });
    if (oldValue && uniques.includes(oldValue)) select.value = oldValue;
  };

  fillSelect('filter-type', voituresCache.map((v) => v.type));
  fillSelect('filter-carburant', voituresCache.map((v) => v.carburant));
}

function bindFilterListeners() {
  ['filter-type','filter-carburant','filter-places','filter-prix-max','sort-prix']
    .forEach((id) => document.getElementById(id)?.addEventListener('input', applyFilters));
}

function applyFilters() {
  const type = document.getElementById('filter-type').value;
  const carburant = document.getElementById('filter-carburant').value;
  const places = document.getElementById('filter-places').value;
  const prixMax = parseInt(document.getElementById('filter-prix-max').value, 10);
  const sort = document.getElementById('sort-prix').value;

  let result = voituresCache.filter((v) => {
    const matchType = !type || v.type === type;
    const matchCarb = !carburant || v.carburant === carburant;
    const matchPlaces = !places ||
      (places === '7+' ? (v.places || 0) >= 7 : String(v.places || '') === places);
    const matchPrix = !prixMax || (v.prix_base || 0) <= prixMax;
    return matchType && matchCarb && matchPlaces && matchPrix;
  });

  const sorters = {
    'prix-asc': (a, b) => (a.prix_base || 0) - (b.prix_base || 0),
    'prix-desc': (a, b) => (b.prix_base || 0) - (a.prix_base || 0),
    'type-asc': (a, b) => (a.type || '').localeCompare(b.type || '', 'fr'),
    'carburant-asc': (a, b) => (a.carburant || '').localeCompare(b.carburant || '', 'fr'),
  };
  result = [...result].sort(sorters[sort] || sorters['prix-asc']);

  renderVoitures(result);
}

function renderVoitures(list) {
  const container = document.getElementById('container-voitures');
  if (!list.length) {
    container.innerHTML = '<p class="empty-state">Aucun véhicule ne correspond aux filtres.</p>';
    return;
  }

  container.innerHTML = list.map((v) => {
    const prix = (v.prix_base || 0).toLocaleString('fr-FR');
    const desc = (v.description || '').slice(0, 140);
    const chauffeur = { oui: 'Chauffeur inclus', non: 'Sans chauffeur', option: 'Chauffeur en option' }[v.chauffeur_option || 'option'];
    const reservable = v.reservable !== false;

    return `
      <article class="carte-voiture">
        <img src="${v.image_url || 'https://placehold.co/600x400?text=Voiture'}" alt="${v.nom}">
        <h3>${v.nom}</h3>
        <div style="padding:0 20px; color:#64748b; font-size:.9rem; display:flex; flex-wrap:wrap; gap:10px; justify-content:center;">
          <span><i class="fas fa-tags"></i> ${v.type || '—'}</span>
          <span><i class="fas fa-gas-pump"></i> ${v.carburant || '—'}</span>
          <span><i class="fas fa-user-friends"></i> ${v.places ? `${v.places} places` : '—'}</span>
          <span><i class="fas fa-id-card"></i> ${chauffeur}</span>
        </div>
        <p class="carte-desc">${desc}${v.description?.length > 140 ? '…' : ''}</p>
        <p class="prix">${prix} Ar / jour</p>
        <button ${reservable ? '' : 'class="btn-disabled"'}
          onclick="reserverVoiture('${v.id}')">
          ${reservable ? 'Réserver' : 'Contact direct'}
        </button>
      </article>`;
  }).join('');
}

/* reservation / contact */
function bindReservationForm() {
  ['res-date-start','res-date-end','opt-chauffeur','opt-wifi','opt-assurance']
    .forEach((id) => document.getElementById(id)?.addEventListener('input', updateEstimation));
  document.getElementById('quick-reservation-form')?.addEventListener('submit', submitReservation);
}

function reserverVoiture(id) {
  const car = voituresCache.find((v) => v.id === id);
  if (!car) return;

  if (car.reservable === false) {
    openContactModal(car);
    return;
  }
  openReservationModal(car);
}

function openContactModal(car) {
  document.getElementById('contact-car-name').textContent = car.nom;
  document.getElementById('txt-modal-phone').textContent = siteConfig.contact.phoneDisplay;
  document.getElementById('btn-modal-call').href = `tel:${siteConfig.contact.phoneCall}`;
  const whatsapp = siteConfig.contact.whatsapp.replace(/\D/g, '');
  const message = encodeURIComponent(`Bonjour, je souhaite plus d'informations sur ${car.nom}.`);
  document.getElementById('btn-modal-wa').href = `https://wa.me/${whatsapp}?text=${message}`;
  document.getElementById('modal-contact-only').style.display = 'flex';
}

function closeContactModal() {
  document.getElementById('modal-contact-only').style.display = 'none';
}

function openReservationModal(car) {
  selectedCar = car;
  promoReduction = 0;
  document.getElementById('modal-car-name').textContent = car.nom;
  document.getElementById('modal-car-price').textContent = (car.prix_base || 0).toLocaleString('fr-FR');
  document.getElementById('quick-reservation-form').reset();
  document.getElementById('promo-feedback').textContent = '';
  updateEstimation();
  document.getElementById('reservation-modal').style.display = 'flex';
}

function closeReservationModal() {
  document.getElementById('reservation-modal').style.display = 'none';
  selectedCar = null;
}

function calcDays(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.ceil((e - s) / 86400000) + 1;
}

function updateEstimation() {
  const summaryDays = document.getElementById('summary-days');
  const summaryTotal = document.getElementById('summary-total');
  if (!selectedCar) {
    summaryDays.textContent = '—';
    summaryTotal.textContent = '—';
    return;
  }

  const start = document.getElementById('res-date-start').value;
  const end = document.getElementById('res-date-end').value;
  const days = calcDays(start, end);
  if (!days) {
    summaryDays.textContent = '—';
    summaryTotal.textContent = '—';
    return;
  }

  let total = days * (selectedCar.prix_base || 0);
  if (document.getElementById('opt-chauffeur').checked) total += 60000 * days;
  if (document.getElementById('opt-wifi').checked) total += 20000 * days;
  if (document.getElementById('opt-assurance').checked) total += 40000 * days;
  if (promoReduction > 0) total *= 1 - promoReduction / 100;

  summaryDays.textContent = `${days} jour(s)`;
  summaryTotal.textContent = `${Math.round(total).toLocaleString('fr-FR')} Ar`;
}

window.applyPromo = async function applyPromo() {
  const codeInput = document.getElementById('res-promo');
  const feedback = document.getElementById('promo-feedback');
  const code = codeInput.value.trim().toUpperCase();
  promoReduction = 0;
  feedback.textContent = '';
  if (!code) { updateEstimation(); return; }

  const start = document.getElementById('res-date-start').value;
  const end = document.getElementById('res-date-end').value;
  if (!start || !end) {
    feedback.textContent = 'Choisissez vos dates avant d’appliquer un code.';
    feedback.style.color = '#e67e22';
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabaseClient
    .from('codes_promo')
    .select('*')
    .eq('code', code)
    .eq('actif', true)
    .lte('date_debut', today)
    .gte('date_fin', today)
    .maybeSingle();

  if (error || !data) {
    feedback.textContent = 'Code invalide ou expiré.';
    feedback.style.color = '#e74c3c';
    return;
  }

  const days = calcDays(start, end);
  if (days < data.min_jours) {
    feedback.textContent = `Minimum ${data.min_jours} jour(s).`;
    feedback.style.color = '#e67e22';
    return;
  }

  promoReduction = data.reduction_pourcent || 0;
  feedback.textContent = `Code appliqué : -${promoReduction}%`;
  feedback.style.color = '#16a34a';
  updateEstimation();
};

async function submitReservation(event) {
  event.preventDefault();
  if (!selectedCar) return;

  const start = document.getElementById('res-date-start').value;
  const end = document.getElementById('res-date-end').value;
  const days = calcDays(start, end);
  if (!days) {
    const fb = document.getElementById('quick-reservation-feedback');
    fb.textContent = 'Sélectionnez des dates valides.';
    fb.style.color = '#e74c3c';
    return;
  }

  const summaryTotal = document.getElementById('summary-total').textContent;
  const nom = document.getElementById('res-nom').value.trim();
  const email = document.getElementById('res-email').value.trim();
  const phone = document.getElementById('res-phone').value.trim();
  const passagers = document.getElementById('res-passagers').value || '1';
  const message = document.getElementById('res-message').value.trim();
  const codePromo = document.getElementById('res-promo').value.trim();
  const options = [];
  if (document.getElementById('opt-chauffeur').checked) options.push('Chauffeur');
  if (document.getElementById('opt-wifi').checked) options.push('Wi-Fi');
  if (document.getElementById('opt-assurance').checked) options.push('Assurance');

  const text = encodeURIComponent(
    `Réservation via RentCarServices (page flotte)%0A%0A` +
    `Véhicule : ${selectedCar.nom}%0A` +
    `Période : ${start} -> ${end} (${days}j)%0A` +
    `Options : ${options.length ? options.join(', ') : 'Aucune'}%0A` +
    (codePromo ? `Code promo : ${codePromo}%0A` : '') +
    `Montant estimé : ${summaryTotal}%0A%0A` +
    `Client : ${nom}%0A` +
    `Email : ${email}%0A` +
    `Téléphone : ${phone}%0A` +
    `Passagers : ${passagers}%0A` +
    `Message : ${message || '—'}`
  );

  const whatsapp = siteConfig.contact.whatsapp.replace(/\D/g, '');
  window.open(`https://wa.me/${whatsapp}?text=${text}`, '_blank');

  const fb = document.getElementById('quick-reservation-feedback');
  fb.textContent = 'Votre demande est transmise sur WhatsApp. Merci !';
  fb.style.color = '#16a34a';
  setTimeout(() => {
    fb.textContent = '';
    closeReservationModal();
  }, 1200);
}

/* exposition globale */
window.toggleMenu = toggleMenu;
window.reserverVoiture = reserverVoiture;
window.closeContactModal = closeContactModal;
window.closeReservationModal = closeReservationModal;
