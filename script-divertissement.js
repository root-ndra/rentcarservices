/* ---------- CHARGEMENT SUPABASE VIA JSON ---------- */
let supabaseClient = null;

async function initSupabase() {
  if (supabaseClient) return;
  try {
    const response = await fetch('supabase-config.json');
    if (!response.ok) throw new Error('supabase-config.json introuvable');
    const { supabaseUrl, supabaseKey } = await response.json();
    supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
  } catch (error) {
    console.error("Erreur d'initialisation de Supabase:", error);
    throw error; // Propage l'erreur pour la gérer dans le listener principal
  }
}

/* ---------- DONNÉES GLOBALES ---------- */
let siteConfig = null;
let radiosCache = [];
let playlistsCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initSupabase();
    await loadSiteConfig();
    await chargerRadios();
    await chargerPlaylists();
  } catch (error) {
    console.error("Impossible de charger la page Divertissement:", error);
    document.getElementById('radios-grid').innerHTML = '<p class="empty-state">Erreur de chargement.</p>';
    document.getElementById('playlists-grid').innerHTML = '<p class="empty-state">Erreur de chargement.</p>';
  }
});

/* ---------- UTILITAIRES UI ---------- */
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

/* ---------- CONFIGURATION (logo, footer, contact) ---------- */
async function loadSiteConfig() {
  const resp = await fetch('site_config.json');
  if (!resp.ok) throw new Error('site_config.json introuvable');
  siteConfig = await resp.json();

  const { header, footer } = siteConfig;
  setText('header-site-name', header.siteName);
  setAttr('header-logo', 'src', header.logoUrl);
  setText('footer-title', header.siteName);
  setText('footer-address', footer.address);
  setText('footer-nif', footer.nif);
  setText('footer-stat', footer.stat);
  setText('footer-phone', siteConfig.contact.phoneDisplay);

  const socials = document.getElementById('footer-socials');
  if (socials) {
    socials.innerHTML = '';
    const icons = { facebook: 'fab fa-facebook', instagram: 'fab fa-instagram', tiktok: 'fab fa-tiktok' };
    Object.entries(footer.socials || {}).forEach(([network, url]) => {
      if (!url || url === '#') return;
      socials.innerHTML += `<a href="${url}" target="_blank" rel="noopener" style="color:white;margin:0 8px;font-size:1.3rem;"><i class="${icons[network] || 'fas fa-globe'}"></i></a>`;
    });
  }
}

async function chargerRadios() {
  const grid = document.getElementById('radios-grid');
  grid.innerHTML = '<p class="empty-state">Chargement des radios…</p>';

  const { data, error } = await supabaseClient
    .from('radios')
    .select('*')
    .eq('actif', true)
    .order('nom', { ascending: true });

  if (error) {
    grid.innerHTML = `<p class="empty-state">Erreur : ${error.message}</p>`;
    return;
  }
  radiosCache = data || [];
  renderRadios(radiosCache);
}

function renderRadios(list) {
  const grid = document.getElementById('radios-grid');
  if (!list.length) {
    grid.innerHTML = '<p class="empty-state">Aucune radio active.</p>';
    return;
  }
  grid.innerHTML = list.map((radio) => `
    <article class="media-card">
      <img src="${radio.image_url || 'https://placehold.co/80x80'}" alt="${radio.nom}">
      <h3>${radio.nom}</h3>
      <p style="color:#64748b;">${radio.description || 'Flux en direct'}</p>
      <audio controls preload="none" src="${radio.url_flux}"></audio>
    </article>`).join('');
}

function filterRadios() {
  const query = document.getElementById('search-radio').value.toLowerCase();
  const filtered = radiosCache.filter((radio) =>
    radio.nom.toLowerCase().includes(query) ||
    (radio.description || '').toLowerCase().includes(query)
  );
  renderRadios(filtered);
}

async function chargerPlaylists() {
  const grid = document.getElementById('playlists-grid');
  grid.innerHTML = '<p class="empty-state">Chargement des playlists…</p>';

  const { data, error } = await supabaseClient
    .from('playlists')
    .select('*')
    .eq('actif', true)
    .order('created_at', { ascending: false });

  if (error) {
    grid.innerHTML = `<p class="empty-state">Erreur : ${error.message}</p>`;
    return;
  }
  playlistsCache = data || [];
  renderPlaylists(playlistsCache);
}

function renderPlaylists(list) {
  const grid = document.getElementById('playlists-grid');
  if (!list.length) {
    grid.innerHTML = '<p class="empty-state">Aucune playlist active.</p>';
    return;
  }
  grid.innerHTML = list.map((pl) => `
    <article class="media-card playlist-card">
      <h3><i class="fas fa-music"></i> ${pl.titre}</h3>
      <p style="color:#475569;">Plateforme : ${pl.plateforme}</p>
      <iframe src="${pl.url_embed}" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>
    </article>`).join('');
}

function filterPlaylists() {
  const platform = document.getElementById('select-plateforme').value;
  const filtered = !platform ? playlistsCache : playlistsCache.filter((pl) => pl.plateforme === platform);
  renderPlaylists(filtered);
}

// Exposer les fonctions nécessaires au HTML
window.toggleMenu = toggleMenu;
window.filterRadios = filterRadios;
window.filterPlaylists = filterPlaylists;
