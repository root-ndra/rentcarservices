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
    throw error;
  }
}

/* ---------- DONNÉES GLOBALES ---------- */
let siteConfig = null;
let offresCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initSupabase();
    await loadSiteConfig();
    await chargerDomaines();
    await chargerOffres();
  } catch (error) {
    console.error("Impossible de charger la page Emplois:", error);
    document.getElementById('jobs-grid').innerHTML = '<p class="empty-state">Erreur de chargement des offres.</p>';
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

  const { header, footer, contact } = siteConfig;
  setText('header-site-name', header.siteName);
  setAttr('header-logo', 'src', header.logoUrl);
  setText('footer-title', header.siteName);
  setText('footer-address', footer.address);
  setText('footer-nif', footer.nif);
  setText('footer-stat', footer.stat);
  setText('footer-phone', contact.phoneDisplay);

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


/* ---------- LOGIQUE DE LA PAGE EMPLOIS ---------- */
async function chargerDomaines() {
  const select = document.getElementById('select-domaine');
  try {
    const response = await fetch('domaines_emplois.json');
    const domaines = await response.json();
    domaines.forEach(d => {
      select.innerHTML += `<option value="${d.nom}">${d.nom}</option>`;
    });
  } catch (error) {
    console.error('Erreur chargement domaines:', error);
  }
}

async function chargerOffres() {
  const grid = document.getElementById('jobs-grid');
  grid.innerHTML = '<p class="empty-state">Chargement des offres…</p>';

  const { data, error } = await supabaseClient
    .from('emplois')
    .select('*')
    .eq('actif', true)
    .order('created_at', { ascending: false });

  if (error) {
    grid.innerHTML = `<p class="empty-state">Erreur: ${error.message}</p>`;
    return;
  }

  offresCache = data || [];
  renderOffres(offresCache);
}

function renderOffres(list) {
  const grid = document.getElementById('jobs-grid');
  if (!list.length) {
    grid.innerHTML = '<p class="empty-state">Aucune offre ne correspond à votre recherche pour le moment.</p>';
    return;
  }

  grid.innerHTML = list.map(offre => `
    <div class="job-card" onclick="flipCard(this)">
      <div class="job-card-inner">
        <div class="job-side job-front">
          <h3>${offre.titre}</h3>
          <div class="meta">
            <span><i class="fas fa-map-marker-alt"></i> ${offre.lieu}</span>
            <span><i class="fas fa-file-contract"></i> ${offre.contrat}</span>
          </div>
          <div class="tags">
            ${(offre.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('')}
          </div>
          <p style="margin-top:auto; color:#94a3b8; font-style:italic;">Cliquez pour voir les détails</p>
        </div>
        <div class="job-side job-back">
          <p>${offre.description}</p>
          <a href="mailto:${siteConfig?.contact.email}?subject=Candidature: ${offre.titre}" target="_blank">
            Postuler <i class="fas fa-arrow-right"></i>
          </a>
        </div>
      </div>
    </div>
  `).join('');
}

function filtrerOffres() {
  const query = document.getElementById('search-input').value.toLowerCase();
  const domaine = document.getElementById('select-domaine').value;

  const filtered = offresCache.filter(offre => {
    const matchQuery = !query || offre.titre.toLowerCase().includes(query) || offre.description.toLowerCase().includes(query);
    const matchDomaine = !domaine || offre.domaine === domaine;
    return matchQuery && matchDomaine;
  });

  renderOffres(filtered);
}

function flipCard(card) {
  card.classList.toggle('flipped');
}

// Exposer les fonctions au scope global pour les `onclick`
window.toggleMenu = toggleMenu;
window.filtrerOffres = filtrerOffres;
window.flipCard = flipCard;
