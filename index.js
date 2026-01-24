let supabaseClient = null;
let siteConfig = null;

document.addEventListener('DOMContentLoaded', bootstrap);

async function bootstrap() {
  await initSupabase();
  await loadSiteConfig();
  setupHeroButtons();
  await Promise.all([loadStats(), loadCars(), loadAvis()]);
  restoreSelectedCar();
}

async function initSupabase() {
  const response = await fetch('supabase-config.json');
  if (!response.ok) throw new Error('Impossible de charger supabase-config.json');
  const { supabaseUrl, supabaseKey } = await response.json();
  supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
}

async function loadSiteConfig() {
  const response = await fetch('site_config.json');
  siteConfig = await response.json();

  const {
    header,
    contact,
    footer,
    features = []
  } = siteConfig;

  setText('header-site-name', header.siteName);
  setAttr('header-logo', 'src', header.logoUrl);
  setText('footer-title', header.siteName);
  setText('footer-address', footer.address);
  setText('footer-nif', footer.nif);
  setText('footer-stat', footer.stat);
  setText('footer-phone', contact.phoneDisplay);
  setAttr('cta-hotline', 'href', `tel:${contact.phoneCall}`);

  const socials = document.getElementById('footer-socials');
  socials.innerHTML = '';
  const icons = { facebook: 'fab fa-facebook', instagram: 'fab fa-instagram', tiktok: 'fab fa-tiktok' };
  Object.entries(footer.socials || {}).forEach(([network, url]) => {
    if (!url || url === '#') return;
    socials.innerHTML += `
      <a href="${url}" target="_blank" rel="noopener" style="color:white;margin:0 8px;font-size:1.3rem;">
        <i class="${icons[network] || 'fas fa-globe'}"></i>
      </a>`;
  });

  const featuresContainer = document.getElementById('features-container-dynamic');
  featuresContainer.innerHTML = features.map((feat) => `
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
    </div>`).join('');
}

function setupHeroButtons() {
  if (!siteConfig?.contact) return;
  const whatsappLink = `https://wa.me/${siteConfig.contact.whatsapp.replace(/\D/g, '')}`;
  setAttr('btn-whatsapp-hero', 'href', whatsappLink);
}

async function loadStats() {
  if (!supabaseClient) return;
  const [{ data: cars }, { data: partners }, { count: reservationsCount }] = await Promise.all([
    supabaseClient.from('voitures').select('id'),
    supabaseClient.from('partenaires').select('id'),
    supabaseClient.from('reservations').select('id', { count: 'exact', head: true })
  ]);

  setText('stat-voitures', cars?.length ?? 0);
  setText('stat-partenaires', partners?.length ?? 0);
  setText('stat-reservations', reservationsCount ?? 0);
}

async function loadCars() {
  const container = document.getElementById('container-voitures');
  container.innerHTML = '<p>Chargement…</p>';

  const { data, error } = await supabaseClient
    .from('voitures')
    .select('*')
    .order('prix_base', { ascending: true });

  if (error || !data?.length) {
    container.innerHTML = '<p class="empty-state">Aucune voiture disponible pour le moment.</p>';
    return;
  }

  container.innerHTML = data.map((car) => {
    const desc = (car.description || '').slice(0, 120);
    const reservable = car.reservable !== false;
    return `
      <article class="carte-voiture">
        <img src="${car.image_url || 'https://placehold.co/600x400?text=Voiture'}" alt="${car.nom}">
        <h3>${car.nom}</h3>
        <div style="padding:0 20px; color:#555; font-size:.9rem; display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <span><i class="fas fa-cogs"></i> ${car.transmission || '-'}</span>
          <span><i class="fas fa-gas-pump"></i> ${car.carburant || '-'}</span>
          <span><i class="fas fa-user-friends"></i> ${car.places || '-'} places</span>
        </div>
        <p class="carte-desc">${desc}${car.description?.length > 120 ? '…' : ''}</p>
        <p class="prix">${(car.prix_base || 0).toLocaleString('fr-FR')} Ar / jour</p>
        <button ${reservable ? '' : 'class="btn-disabled" disabled'}
          onclick='selectCar(${JSON.stringify({
            id: car.id,
            nom: car.nom,
            prix: car.prix_base,
            ref: car.ref_id || '',
            description: car.description || '',
            reservable
          })})'>
          ${reservable ? 'Réserver' : 'Contact direct'}
        </button>
      </article>`;
  }).join('');
}

function selectCar(data) {
  sessionStorage.setItem('voitureSelectionnee', JSON.stringify(data));
  if (data.reservable) {
    window.location.href = 'index.html#reservation';
  } else {
    alert(`Merci de contacter notre équipe pour ${data.nom}.`);
  }
}

function restoreSelectedCar() {
  const stored = sessionStorage.getItem('voitureSelectionnee');
  if (!stored) return;
  const { nom } = JSON.parse(stored);
  console.info(`Véhicule sélectionné précédemment : ${nom}`);
}

async function loadAvis() {
  const container = document.getElementById('avis-home');
  const { data, error } = await supabaseClient
    .from('avis')
    .select('*')
    .eq('visible', true)
    .order('created_at', { ascending: false })
    .limit(6);

  if (error || !data?.length) {
    container.innerHTML = '<p class="empty-state" style="grid-column:1/-1;">Aucun avis publié pour le moment.</p>';
    return;
  }

  container.innerHTML = data.map((avis) => `
    <article class="avis-card">
      <div class="note">${'⭐'.repeat(avis.note || 0)}</div>
      <p>${avis.commentaire || ''}</p>
      <strong>${avis.nom || 'Anonyme'}</strong>
      <small style="color:#94a3b8;">${new Date(avis.created_at).toLocaleDateString('fr-FR')}</small>
    </article>`).join('');
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
  if (el) el.setAttribute(attr, value);
}
