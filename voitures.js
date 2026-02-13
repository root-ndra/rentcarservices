let supabaseClient = null;
let siteConfig = null;
let voituresCache = [];
let filtresActifs = false;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initSupabase();
    await loadSiteConfig();
    await chargerVoitures();
  } catch (error) {
    console.error('Erreur initialisation page voitures :', error);
    document.getElementById('container-voitures').innerHTML = 
      '<div class="loading-placeholder"><p>Erreur de chargement des véhicules</p></div>';
  }
});

/* ---------- INITIALISATION ---------- */
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

  // Configuration du header et footer
  setText('header-site-name', siteConfig.header.siteName);
  setAttr('header-logo', 'src', siteConfig.header.logoUrl);
  setText('footer-title', siteConfig.header.siteName);
  setText('footer-address', siteConfig.footer.address);
  setText('footer-nif', siteConfig.footer.nif);
  setText('footer-stat', siteConfig.footer.stat);
  setText('footer-phone', siteConfig.contact.phoneDisplay);

  // Réseaux sociaux
  const socials = document.getElementById('footer-socials');
  if (socials) {
    socials.innerHTML = '';
    const icons = { 
      facebook: 'fab fa-facebook', 
      instagram: 'fab fa-instagram', 
      tiktok: 'fab fa-tiktok' 
    };
    Object.entries(siteConfig.footer.socials || {}).forEach(([network, url]) => {
      if (!url || url === '#') return;
      socials.innerHTML += `
        <a href="${url}" target="_blank" rel="noopener"
           style="color:white;margin:0 8px;font-size:1.3rem;">
          <i class="${icons[network] || 'fas fa-globe'}"></i>
        </a>`;
    });
  }
}

/* ---------- CHARGEMENT DES VOITURES ---------- */
async function chargerVoitures() {
  const container = document.getElementById('container-voitures');
  
  const { data: voitures, error } = await supabaseClient
    .from('voitures')
    .select('*')
    .eq('est_public', true)
    .order('nom', { ascending: true });

  if (error) {
    container.innerHTML = '<div class="loading-placeholder"><p>Erreur lors du chargement</p></div>';
    console.error('Erreur Supabase:', error);
    return;
  }

  voituresCache = voitures || [];
  renderVoitures(voituresCache);
  updateResultsCount(voituresCache.length);
}

function renderVoitures(voitures) {
  const container = document.getElementById('container-voitures');
  
  if (!voitures.length) {
    container.innerHTML = `
      <div class="loading-placeholder">
        <i class="fas fa-car"></i>
        <p>Aucun véhicule ne correspond à vos critères</p>
      </div>`;
    return;
  }

  container.innerHTML = voitures.map(voiture => createCarCard(voiture)).join('');
}

function createCarCard(v) {
  const estReservable = v.reservable !== false;
  const aChauffeur = (v.chauffeur_option === true || v.chauffeur_option === "true");
  
  // CORRECTION : Utilisation de data-attributes au lieu d'onclick avec guillemets
  const boutonsHtml = estReservable 
    ? `<a href="reservations.html?id=${v.id}&nom=${encodeURIComponent(v.nom)}&prix=${v.prix_base}" class="btn-car btn-reserver">
         <i class="fas fa-calendar-check"></i> Réserver
       </a>`
    : `<button class="btn-car btn-contact" data-car-name="${v.nom.replace(/"/g, '&quot;')}" onclick="openContactModal(this.dataset.carName)">
         <i class="fas fa-phone"></i> Contacter
       </button>`;

  return `
    <div class="car-card">
      <div class="car-image-container">
        <img src="${v.image_url || 'https://via.placeholder.com/400x250?text=Image+indisponible'}" 
             alt="${v.nom}" class="car-image">
        ${aChauffeur 
          ? `<div class="badge-chauffeur" style="background: #dcfce7; color: #166534;">
               <i class="fas fa-user-tie"></i> Avec chauffeur
             </div>`
          : ''
        }
      </div>
      
      <div class="car-body">
        <h3>${v.nom}</h3>
        
        <div class="car-specs">
          <span><i class="fas fa-users"></i> ${v.places || 5} places</span>
          <span><i class="fas fa-gas-pump"></i> ${v.carburant || 'N/C'}</span>
          <span><i class="fas fa-cog"></i> ${v.transmission || 'Manuelle'}</span>
        </div>

        <p class="car-description">${v.description || 'Pas de description disponible.'}</p>

        <div class="car-footer">
          <div class="car-price">
            <div class="price-amount">${formatPrix(v.prix_base)} Ar</div>
            <div class="price-period">par jour</div>
          </div>
          
          <div class="car-actions">
            ${boutonsHtml}
          </div>
        </div>
      </div>
    </div>`;
}

/* ---------- FILTRES ---------- */
function filtrerVoitures() {
  const type = document.getElementById('filter-type').value;
  const transmission = document.getElementById('filter-transmission').value;
  const places = document.getElementById('filter-places').value;
  const prix = document.getElementById('filter-prix').value;
  const chauffeur = document.getElementById('filter-chauffeur').value;
  const search = document.getElementById('search-input').value.toLowerCase();

  const filtered = voituresCache.filter(v => {
    const matchType = !type || v.type === type;
    const matchTransmission = !transmission || v.transmission === transmission;
    const matchPlaces = !places || v.places == places;
    const matchSearch = !search || v.nom.toLowerCase().includes(search) || 
                       (v.description || '').toLowerCase().includes(search);
    
    let matchPrix = true;
    if (prix) {
      const prixBase = v.prix_base || 0;
      if (prix === '0-50000') matchPrix = prixBase <= 50000;
      else if (prix === '50000-100000') matchPrix = prixBase > 50000 && prixBase <= 100000;
      else if (prix === '100000-200000') matchPrix = prixBase > 100000 && prixBase <= 200000;
      else if (prix === '200000+') matchPrix = prixBase > 200000;
    }
    
    let matchChauffeur = true;
    if (chauffeur) {
      const aChauffeur = (v.chauffeur_option === true || v.chauffeur_option === "true");
      if (chauffeur === 'avec') matchChauffeur = aChauffeur;
      else if (chauffeur === 'sans') matchChauffeur = !aChauffeur;
    }

    return matchType && matchTransmission && matchPlaces && matchPrix && matchChauffeur && matchSearch;
  });

  renderVoitures(filtered);
  updateResultsCount(filtered.length);
  
  // Afficher/masquer le bouton reset
  filtresActifs = type || transmission || places || prix || chauffeur || search;
  const btnReset = document.querySelector('.btn-reset');
  if (btnReset) {
    btnReset.style.display = filtresActifs ? 'block' : 'none';
  }
}

function resetFiltres() {
  document.getElementById('filter-type').value = '';
  document.getElementById('filter-transmission').value = '';
  document.getElementById('filter-places').value = '';
  document.getElementById('filter-prix').value = '';
  document.getElementById('filter-chauffeur').value = '';
  document.getElementById('search-input').value = '';
  
  renderVoitures(voituresCache);
  updateResultsCount(voituresCache.length);
  
  const btnReset = document.querySelector('.btn-reset');
  if (btnReset) {
    btnReset.style.display = 'none';
  }
  filtresActifs = false;
}

function updateResultsCount(count) {
  const countElement = document.getElementById('results-count');
  if (countElement) {
    countElement.textContent = `${count} véhicule${count > 1 ? 's' : ''} trouvé${count > 1 ? 's' : ''}`;
  }
}

/* ---------- MODAL CONTACT ---------- */
function openContactModal(nomVoiture) {
  document.getElementById('contact-car-name').textContent = nomVoiture;
  
  if (siteConfig?.contact) {
    document.getElementById('btn-modal-call').href = `tel:${siteConfig.contact.phoneCall}`;
    document.getElementById('contact-phone').textContent = siteConfig.contact.phoneDisplay;
    
    const whatsappNumber = siteConfig.contact.whatsapp.replace(/\D/g, '');
    const message = encodeURIComponent(`Bonjour, je suis intéressé par ${nomVoiture}`);
    document.getElementById('btn-modal-wa').href = `https://wa.me/${whatsappNumber}?text=${message}`;
  }
  
  document.getElementById('modal-contact-only').style.display = 'flex';
}

function closeContactModal() {
  document.getElementById('modal-contact-only').style.display = 'none';
}

/* ---------- UTILITAIRES ---------- */
function toggleMenu() {
  const menu = document.getElementById('nav-menu');
  if (menu) {
    menu.classList.toggle('active');
  }
}

function formatPrix(prix) {
  if (!prix) return '0';
  return prix.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text ?? '';
}

function setAttr(id, attr, value) {
  const el = document.getElementById(id);
  if (el) el.setAttribute(attr, value ?? '');
}

/* ---------- EXPOSITION GLOBALE ---------- */
window.toggleMenu = toggleMenu;
window.filtrerVoitures = filtrerVoitures;
window.resetFiltres = resetFiltres;
window.openContactModal = openContactModal;
window.closeContactModal = closeContactModal;
