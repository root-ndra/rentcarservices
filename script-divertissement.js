const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let radiosCache = [];
let playlistsCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  await chargerConfigFooter();
  await chargerRadios();
  await chargerPlaylists();
});

function toggleMenu() {
  document.getElementById('nav-menu')?.classList.toggle('active');
}

async function chargerConfigFooter() {
  try {
    const resp = await fetch('site_config.json');
    const config = await resp.json();
    document.getElementById('header-logo').src = config.header.logoUrl;
    document.getElementById('header-site-name').innerText = config.header.siteName;
    document.getElementById('footer-title').innerText = config.header.siteName;
    document.getElementById('footer-address').innerText = config.footer.address;
    document.getElementById('footer-nif').innerText = config.footer.nif;
    document.getElementById('footer-stat').innerText = config.footer.stat;
    document.getElementById('footer-phone').innerText = config.contact.phoneDisplay;

    const socials = document.getElementById('footer-socials');
    const icons = { facebook: 'fab fa-facebook', instagram: 'fab fa-instagram', tiktok: 'fab fa-tiktok' };
    socials.innerHTML = '';
    Object.entries(config.footer.socials || {}).forEach(([network, url]) => {
      if (!url || url === '#') return;
      socials.innerHTML += `<a href="${url}" target="_blank" style="color:white;margin:0 8px;font-size:1.3rem;"><i class="${icons[network] || 'fas fa-globe'}"></i></a>`;
    });
  } catch (err) {
    console.error('Config divertissement', err);
  }
}

async function chargerRadios() {
  const grid = document.getElementById('radios-grid');
  grid.innerHTML = '<p class="empty-state">Chargement des radios…</p>';

  const { data, error } = await sb
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

  const { data, error } = await sb
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
