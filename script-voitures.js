let supabaseClient = null;
let siteConfig = null;
let voituresCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initSupabase();
    await loadSiteConfig();
    initFilterListeners();
    await chargerVoitures();
  } catch (error) {
    console.error('Initialisation impossible :', error);
    document.getElementById('container-voitures').innerHTML =
      '<p class="empty-state">Une erreur est survenue lors du chargement.</p>';
  }
});

async function initSupabase() {
  const response = await fetch('supabase-config.json');
  if (!response.ok) throw new Error('supabase-config.json introuvable');
  const { supabaseUrl, supabaseKey } = await response.json();
  supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
}

async function loadSiteConfig() {
  const response = await fetch('site_config.json');
  if (!response.ok) throw new Error('site_config.json introuvable');
  siteConfig = await response.json();

  setText('header-site-name', siteConfig.header.siteName);
  setAttr('header-logo', 'src', siteConfig.header.logoUrl);
  setText('footer-title', siteConfig.header.siteName);
  setText('footer-address', siteConfig.footer.address);
  setText('footer-phone', siteConfig.contact.phoneDisplay);
  setText('footer-nif', siteConfig.footer.nif);
  setText('footer-stat', siteConfig.footer.stat);
  setAttr('cta-hotline', 'href', `tel:${siteConfig.contact.phoneCall}`);

  const socials = document.getElementById('footer-socials');
  socials.innerHTML = '';
  const icons = { facebook: 'fab fa-facebook', instagram: 'fab fa-instagram', tiktok: 'fab fa-tiktok' };
  Object.entries(siteConfig.footer.socials || {}).forEach(([network, url]) => {
    if (!url || url === '#') return;
    socials.innerHTML += `
      <a href="${url}" target="_blank" rel="noopener"
         style="color:white;margin:0 8px;font-size:1.3rem;">
        <i class="${icons[network] || 'fas fa-globe'}"></i>
      </a>`;
  });
}

function toggleMenu() {
  document.getElementById('nav-menu')?.classList.toggle('active');
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text ?? '';
}

function setAttr(id, attr, value) {
  const el = document.getElementById(id);
  if (el) el.setAttribute(attr, value ?? '');
}

async function chargerVoitures() {
  const container = document.getElementById('container-voitures');
  container.innerHTML = '<p>Chargement…</p>';

  const { data, error } = await supabaseClient
    .from('voitures')
    .select('*')
    .order('prix_base', { ascending: true });

  if (error) {
    container.innerHTML = `<p class="empty-state">Erreur : ${error.message}</p>`;
    return;
  }

  voituresCache = data || [];
  peuplerFiltresDynamiques(voituresCache);
  renderVoitures(voituresCache);
}

function peuplerFiltresDynamiques(list) {
  const remplirSelect = (id, values) => {
    const select = document.getElementById(id);
    if (!select) return;
    const uniques = Array.from(new Set(values.filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    const current = select.value;
    select.innerHTML = '<option value="">Tous</option>';
    uniques.forEach((val) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      select.appendChild(opt);
    });
    if (current && uniques.includes(current)) select.value = current;
  };

  remplirSelect('filter-type', list.map((v) => v.type));
  remplirSelect('filter-carburant', list.map((v) => v.carburant));
}

function initFilterListeners() {
  ['filter-type', 'filter-carburant', 'filter-places', 'filter-prix-max', 'sort-prix']
    .forEach((id) => {
      document.getElementById(id)?.addEventListener('input', appliquerFiltres);
    });
}

function appliquerFiltres() {
  const type = document.getElementById('filter-type').value;
  const carburant = document.getElementById('filter-carburant').value;
  const places = document.getElementById('filter-places').value;
  const prixMax = parseInt(document.getElementById('filter-prix-max').value, 10);
  const sort = document.getElementById('sort-prix').value;

  let resultat = voituresCache.filter((v) => {
    const matchType = !type || v.type === type;
    const matchCarburant = !carburant || v.carburant === carburant;
    const matchPlaces =
      !places ||
      (places === '7+' ? (v.places || 0) >= 7 : String(v.places || '') === places);
    const matchPrix = !prixMax || (v.prix_base || 0) <= prixMax;
    return matchType && matchCarburant && matchPlaces && matchPrix;
  });

  resultat = trierVoitures(resultat, sort);
  renderVoitures(resultat);
}

function trierVoitures(list, sort) {
  const comparator = {
    'prix-asc': (a, b) => (a.prix_base || 0) - (b.prix_base || 0),
    'prix-desc': (a, b) => (b.prix_base || 0) - (a.prix_base || 0),
    'type-asc': (a, b) => (a.type || '').localeCompare(b.type || '', 'fr', { sensitivity: 'base' }),
    'carburant-asc': (a, b) =>
      (a.carburant || '').localeCompare(b.carburant || '', 'fr', { sensitivity: 'base' }),
  };
  const fn = comparator[sort] || comparator['prix-asc'];
  return [...list].sort(fn);
}

function renderVoitures(list) {
  const container = document.getElementById('container-voitures');
  if (!list.length) {
    container.innerHTML = '<p class="empty-state">Aucun véhicule ne correspond aux filtres.</p>';
    return;
  }

  container.innerHTML = list.map((v) => {
    const prix = (v.prix_base || 0).toLocaleString('fr-FR');
    const places = v.places ? `${v.places} places` : '—';
    const carbu = v.carburant || '—';
    const type = v.type || '—';
    const desc = (v.description || '').slice(0, 140);
    const isReservable = v.reservable !== false;

    return `
      <article class="carte-voiture">
        <img src="${v.image_url || 'https://placehold.co/600x400?text=Voiture'}" alt="${v.nom}">
        <h3>${v.nom}</h3>
        <div style="padding:0 20px; color:#64748b; font-size:.9rem; display:flex; flex-wrap:wrap; gap:10px; justify-content:center;">
          <span><i class="fas fa-tags"></i> ${type}</span>
          <span><i class="fas fa-gas-pump"></i> ${carbu}</span>
          <span><i class="fas fa-user-friends"></i> ${places}</span>
        </div>
        <p class="carte-desc">${desc}${v.description?.length > 140 ? '…' : ''}</p>
        <p class="prix">${prix} Ar / jour</p>
        <button ${isReservable ? '' : 'class="btn-disabled" disabled'}
          onclick="reserverVoiture('${v.id}')">
          ${isReservable ? 'Réserver' : 'Contact direct'}
        </button>
      </article>`;
  }).join('');
}

function reserverVoiture(id) {
  const voiture = voituresCache.find((v) => v.id === id);
  if (!voiture) return;
  sessionStorage.setItem(
    'voitureSelectionnee',
    JSON.stringify({
      id: voiture.id,
      nom: voiture.nom,
      prix_base: voiture.prix_base,
      ref_id: voiture.ref_id || '',
      description: voiture.description || '',
      reservable: voiture.reservable !== false,
    })
  );
  window.location.href = 'index.html#reservation';
}
