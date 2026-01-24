let supabaseClient = null;
let siteConfig = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initSupabase();
    await loadSiteConfig();
    setupHeroButtons();
    bindPartnerModal();
  } catch (error) {
    console.error('Initialisation impossible :', error);
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
  setText('footer-nif', siteConfig.footer.nif);
  setText('footer-stat', siteConfig.footer.stat);
  setText('footer-phone', siteConfig.contact.phoneDisplay);
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

  const featuresContainer = document.getElementById('features-container-dynamic');
  const features = siteConfig.features || [];
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
  const whatsapp = siteConfig.contact.whatsapp.replace(/\D/g, '');
  setAttr('btn-whatsapp-hero', 'href', `https://wa.me/${whatsapp}`);
}

function bindPartnerModal() {
  document.querySelectorAll('[data-open-partner]').forEach((btn) => {
    btn.addEventListener('click', openPartnerModal);
  });
  document.getElementById('partner-lead-form')?.addEventListener('submit', submitPartnerLead);
}

function openPartnerModal() {
  document.getElementById('partner-modal').style.display = 'flex';
}

function closePartnerModal() {
  document.getElementById('partner-modal').style.display = 'none';
}

async function submitPartnerLead(event) {
  event.preventDefault();
  const feedback = document.getElementById('partner-lead-feedback');
  feedback.textContent = 'Ouverture de WhatsApp…';
  feedback.style.color = '#2563eb';

  const data = {
    prenom: document.getElementById('lead-prenom').value.trim(),
    nom: document.getElementById('lead-nom').value.trim(),
    email: document.getElementById('lead-email').value.trim(),
    telephone: document.getElementById('lead-phone').value.trim(),
    agence: document.getElementById('lead-agence').value.trim(),
    flotte: document.getElementById('lead-fleet').value.trim() || '1',
    message: document.getElementById('lead-message').value.trim()
  };

  const waNumber = siteConfig?.contact?.whatsapp?.replace(/\D/g, '') || '2610000000';
  const text = encodeURIComponent(
    `Bonjour RentCarServices,%0A%0A` +
    `Je souhaite devenir partenaire.%0A` +
    `Nom : ${data.prenom} ${data.nom}%0A` +
    `Email : ${data.email}%0A` +
    `Téléphone : ${data.telephone}%0A` +
    `Agence / Ville : ${data.agence}%0A` +
    `Flotte estimée : ${data.flotte} véhicule(s)%0A%0A` +
    `${data.message}`
  );

  window.open(`https://wa.me/${waNumber}?text=${text}`, '_blank');

  feedback.textContent = 'Redirection effectuée. Merci !';
  feedback.style.color = '#16a34a';
  event.target.reset();
  setTimeout(closePartnerModal, 1200);
}

/* ---------- UTILITAIRES ---------- */
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

/* Exposition globale pour le HTML inline */
window.toggleMenu = toggleMenu;
window.openPartnerModal = openPartnerModal;
window.closePartnerModal = closePartnerModal;
