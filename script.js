// -----------------------------------------------------------------------------
// CONFIGURATION SUPABASE
// -----------------------------------------------------------------------------
const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';

let sb = null;
try {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (err) {
  console.error('Supabase indisponible', err);
}

let calendarInstance = null;
let voitureSelectionnee = null;
let currentCarReservations = [];
let currentReservationId = null;
let reductionActive = 0;
let siteConfigGlobal = null;

// -----------------------------------------------------------------------------
// UTILITAIRES
// -----------------------------------------------------------------------------
function toggleMenu() {
  const nav = document.getElementById('nav-menu');
  if (nav) nav.classList.toggle('active');
}

function genererCouleur(id) {
  const couleurs = ['#3498db', '#9b59b6', '#2ecc71', '#f1c40f', '#1abc9c', '#34495e', '#e67e22', '#16a085', '#8e44ad', '#2980b9'];
  if (!id) return couleurs[Math.floor(Math.random() * couleurs.length)];
  let hash = 0;
  for (let i = 0; i < id.toString().length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return couleurs[Math.abs(hash) % couleurs.length];
}

function formatPrix(val) {
  if (val === null || val === undefined) return '0';
  return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// -----------------------------------------------------------------------------
// CHARGEMENT INITIAL
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  if (!sb) return;
  await loadConfig();
  await chargerPublicites();

  const containerVoitures = document.getElementById('container-voitures');
  if (containerVoitures) {
    await chargerVoituresAccueil(containerVoitures);
    chargerMedia('radios');
    chargerAvis();
  }
});
// -----------------------------------------------------------------------------
// CONFIGURATION SITE
// -----------------------------------------------------------------------------
async function loadConfig() {
  try {
    const response = await fetch('site_config.json');
    siteConfigGlobal = await response.json();
    const headerName = document.getElementById('header-site-name');
    const headerLogo = document.getElementById('header-logo');
    const heroTitle = document.getElementById('hero-title');
    const footerTitle = document.getElementById('footer-title');
    const footerAddress = document.getElementById('footer-address');
    const footerNif = document.getElementById('footer-nif');
    const footerStat = document.getElementById('footer-stat');
    const footerPhone = document.getElementById('footer-phone');
    const callBtnLink = document.getElementById('call-btn-link');

    if (headerName) headerName.innerText = siteConfigGlobal.header.siteName;
    if (headerLogo) headerLogo.src = siteConfigGlobal.header.logoUrl;
    if (heroTitle) heroTitle.innerText = siteConfigGlobal.header.siteName;
    if (footerTitle) footerTitle.innerText = siteConfigGlobal.header.siteName;
    if (footerAddress) footerAddress.innerText = siteConfigGlobal.footer.address;
    if (footerNif) footerNif.innerText = siteConfigGlobal.footer.nif;
    if (footerStat) footerStat.innerText = siteConfigGlobal.footer.stat;
    if (footerPhone) footerPhone.innerText = siteConfigGlobal.contact.phoneDisplay;
    if (callBtnLink) callBtnLink.href = `tel:${siteConfigGlobal.contact.phoneCall}`;

    const socialsContainer = document.getElementById('footer-socials');
    if (socialsContainer) {
      socialsContainer.innerHTML = '';
      const icons = { facebook: 'fab fa-facebook', instagram: 'fab fa-instagram', tiktok: 'fab fa-tiktok' };
      Object.entries(siteConfigGlobal.footer.socials || {}).forEach(([network, url]) => {
        if (!url) return;
        socialsContainer.innerHTML += `
          <a href="${url}" target="_blank" style="color:white; margin:0 10px; font-size:1.5rem;">
            <i class="${icons[network] || 'fas fa-globe'}"></i>
          </a>`;
      });
    }

    const mapContainer = document.getElementById('footer-map');
    if (mapContainer && siteConfigGlobal.footer.mapUrl) {
      mapContainer.innerHTML = `<iframe src="${siteConfigGlobal.footer.mapUrl}" width="100%" height="250" style="border:0; border-radius:10px;" allowfullscreen loading="lazy"></iframe>`;
    }

    const featuresContainer = document.getElementById('features-container-dynamic');
    if (featuresContainer && Array.isArray(siteConfigGlobal.features)) {
      featuresContainer.innerHTML = siteConfigGlobal.features.map((feat) => `
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
  } catch (e) {
    console.error('Erreur chargement config JSON', e);
  }

  try {
    const respCond = await fetch('conditions.json');
    const conditions = await respCond.json();
    const container = document.getElementById('container-conditions-cards');
    if (container) {
      container.innerHTML = conditions.map((cond) => `
        <div class="flip-card" onclick="this.classList.toggle('flipped')">
          <div class="flip-card-inner">
            <div class="flip-card-front">
              <i class="${cond.icon}" style="font-size:2rem; margin-bottom:10px;"></i>
              <h3>${cond.title}</h3>
              <small>(Voir)</small>
            </div>
            <div class="flip-card-back">
              <p>${cond.details}</p>
            </div>
          </div>
        </div>`).join('');
    }
  } catch (e) {
    console.error('Erreur chargement conditions', e);
  }

  if (sb) {
    const { data } = await sb.from('config_site').select('value').eq('key', 'calendar_visible').maybeSingle();
    if (data) {
      const isVisible = data.value === true || data.value === 'true';
      const wrapper = document.getElementById('wrapper-calendrier-global');
      if (wrapper) wrapper.style.display = isVisible ? 'block' : 'none';
    }
  }
}

// -----------------------------------------------------------------------------
// PUBLICITÉS
// -----------------------------------------------------------------------------
async function chargerPublicites() {
  const targets = {
    home_top: document.getElementById('pub-home_top'),
    home_bot: document.getElementById('pub-home_bot'),
    flotte_top: document.getElementById('pub-flotte_top'),
    flotte_bot: document.getElementById('pub-flotte_bot'),
    media_top: document.getElementById('pub-media_top'),
    media_bot: document.getElementById('pub-media_bot'),
  };
  Object.values(targets).forEach((ref) => {
    if (ref) { ref.style.display = 'none'; ref.innerHTML = ''; }
  });

  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await sb
    .from('publicites')
    .select('*')
    .eq('actif', true)
    .lte('date_debut', today)
    .gte('date_fin', today);

  if (error) return console.error('Publicités', error);

  (data || []).forEach((pub) => {
    const block = targets[pub.emplacement];
    if (!block) return;
    block.innerHTML = `
      <a href="${pub.lien_redirection || '#'}" target="_blank" rel="noopener">
        <img src="${pub.image_url}" alt="${pub.societe || 'Publicité'}">
      </a>`;
    block.style.display = 'block';
  });
}

// -----------------------------------------------------------------------------
// AFFICHAGE DES VOITURES
// -----------------------------------------------------------------------------
async function chargerVoituresAccueil(container) {
  const { data: voitures, error } = await sb
    .from('voitures')
    .select('*')
    .order('prix_base', { ascending: true });

  if (error) {
    container.innerHTML = '<p>Impossible de charger les voitures.</p>';
    return;
  }
  if (!voitures?.length) {
    container.innerHTML = '<p>Aucune voiture disponible pour le moment.</p>';
    return;
  }

  container.innerHTML = voitures.map((v) => {
    const places = v.places ? `<i class="fas fa-user-friends"></i> ${v.places} places` : '';
    const carbu = v.carburant ? `<i class="fas fa-gas-pump"></i> ${v.carburant}` : '';
    const desc = (v.description || '').trim();
    const resume = desc ? `<p class="carte-desc">${desc.slice(0, 110)}${desc.length > 110 ? '…' : ''}</p>` : '';
    const reservable = v.reservable !== false;

    return `
      <div class="carte-voiture">
        <img src="${v.image_url}" alt="${v.nom}">
        <h3>${v.nom}</h3>
        <div style="padding:0 20px; color:#555; font-size:.9rem; display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <span><i class="fas fa-cogs"></i> ${v.transmission || '-'}</span>
          ${places ? `<span>${places}</span>` : ''}
          ${carbu ? `<span>${carbu}</span>` : ''}
        </div>
        ${resume}
        <p class="prix">${formatPrix(v.prix_base)} Ar / jour</p>
        <button onclick='selectionnerVoiture("${v.id}", ${JSON.stringify(v.nom)}, ${v.prix_base}, ${JSON.stringify(v.ref_id || '')}, ${JSON.stringify(desc)}, ${reservable})'>
          ${reservable ? 'Réserver' : 'Contacter'}
        </button>
      </div>`;
  }).join('');
}

// -----------------------------------------------------------------------------
// NAVIGATION + SÉLECTION
// -----------------------------------------------------------------------------
function naviguerVers(pageId) {
  document.querySelectorAll('.page-section').forEach((sec) => (sec.style.display = 'none'));
  const section = document.getElementById(pageId);
  if (section) section.style.display = 'block';
  window.scrollTo(0, 0);
  const nav = document.getElementById('nav-menu');
  if (nav) nav.classList.remove('active');
}

function selectionnerVoiture(id, nom, prix, ref, description, isReservable) {
  if (!isReservable) {
    document.getElementById('contact-car-name').innerText = nom;
    if (siteConfigGlobal?.contact) {
      document.getElementById('btn-modal-call').href = `tel:${siteConfigGlobal.contact.phoneCall}`;
      document.getElementById('btn-modal-wa').href = `https://wa.me/${siteConfigGlobal.contact.whatsapp}?text=${encodeURIComponent(`Bonjour, je suis intéressé par ${nom}`)}`;
      document.getElementById('txt-modal-phone').innerText = siteConfigGlobal.contact.phoneDisplay;
    }
    document.getElementById('modal-contact-only').style.display = 'flex';
    return;
  }

  voitureSelectionnee = { id, nom, prix, ref };
  naviguerVers('reservation');
  document.getElementById('nom-voiture-selectionnee').innerText = nom;
  document.getElementById('desc-voiture-selectionnee').innerText = description || '';
  document.getElementById('id-voiture-input').value = id;
  document.getElementById('ref-voiture-input').value = ref;
  document.getElementById('prix-base-input').value = prix;

  ['date-debut','date-fin','lieu-livraison','heure-livraison','lieu-recuperation','heure-recuperation','trajet-1','trajet-2','trajet-3'].forEach((field) => {
    document.getElementById(field).value = '';
  });

  document.getElementById('step-1-actions').style.display = 'block';
  document.getElementById('step-2-paiement').style.display = 'none';
  document.getElementById('step-3-download').style.display = 'none';

  initCalendar(id);
}

// -----------------------------------------------------------------------------
// CALENDRIER
// -----------------------------------------------------------------------------
async function initCalendar(idVoiture) {
  const calendarEl = document.getElementById('calendrier-dispo');
  if (calendarInstance) calendarInstance.destroy();

  const { data: resas } = await sb
    .from('reservations')
    .select('id, date_debut, date_fin')
    .eq('id_voiture', idVoiture)
    .eq('statut', 'valide');

  const { data: maints } = await sb
    .from('maintenances')
    .select('date_debut, date_fin')
    .eq('id_voiture', idVoiture);

  currentCarReservations = [];
  const events = [];

  (resas || []).forEach((r) => {
    currentCarReservations.push({ start: new Date(r.date_debut), end: new Date(r.date_fin) });
    const end = new Date(r.date_fin); end.setDate(end.getDate() + 1);
    events.push({ title: 'Loué', start: r.date_debut, end: end.toISOString().split('T')[0], display: 'background', color: genererCouleur(r.id) });
  });
  (maints || []).forEach((m) => {
    currentCarReservations.push({ start: new Date(m.date_debut), end: new Date(m.date_fin) });
    const end = new Date(m.date_fin); end.setDate(end.getDate() + 1);
    events.push({ title: 'Entretien', start: m.date_debut, end: end.toISOString().split('T')[0], display: 'background', color: '#c0392b' });
  });

  calendarInstance = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    locale: 'fr',
    height: 'auto',
    events,
    headerToolbar: { left: 'prev,next', center: 'title', right: '' },
    dateClick(info) {
      const dDebut = document.getElementById('date-debut');
      const dFin = document.getElementById('date-fin');
      if (!dDebut.value || new Date(info.dateStr) < new Date(dDebut.value)) {
        dDebut.value = info.dateStr;
        dFin.value = '';
      } else {
        dFin.value = info.dateStr;
      }
      calculerPrix();
    },
  });
  calendarInstance.render();
}

function toggleCalendarVisibility() {
  const el = document.getElementById('wrapper-calendrier');
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
  if (el.style.display === 'block' && calendarInstance) calendarInstance.render();
}

function verifierDisponibilite(debut, fin) {
  const d1 = new Date(debut);
  const d2 = new Date(fin);
  return currentCarReservations.every(({ start, end }) => d2 < start || d1 > end);
}
// -----------------------------------------------------------------------------
// CALCULS FINANCIERS / PROMO
// -----------------------------------------------------------------------------
function faireLeCalculMathematique() {
  const prixBase = parseInt(document.getElementById('prix-base-input').value, 10);
  const d1 = document.getElementById('date-debut').value;
  const d2 = document.getElementById('date-fin').value;
  if (!prixBase || !d1 || !d2) return { ok: false };

  const start = new Date(d1);
  const end = new Date(d2);
  if (end < start) return { ok: false };

  const diffDays = Math.ceil((end - start) / 86400000) + 1;
  const radioOffre = document.querySelector('input[name="offre"]:checked');
  let formule = 'jour';
  let multiplier = 1;
  if (radioOffre) {
    formule = radioOffre.value;
    if (formule === 'nuit') multiplier = 1.5;
    if (formule === '24h') multiplier = 2;
  }

  let cout = diffDays * prixBase * multiplier;
  if (diffDays >= 30) cout *= 0.85;
  else if (diffDays >= 7) cout *= 0.9;
  if (reductionActive > 0) cout *= 1 - reductionActive / 100;

  let options = 0;
  if (document.getElementById('opt-livraison').checked) options += 15000;
  if (document.getElementById('opt-recuperation').checked) options += 15000;

  const total = Math.round(cout + options);
  return {
    ok: true,
    total,
    acompte: Math.round(total * 0.5),
    offre: formule,
    duree: diffDays,
  };
}

function calculerPrix() {
  const res = faireLeCalculMathematique();
  if (!res.ok) return;
  document.getElementById('prix-total').innerText = formatPrix(res.total);
  document.getElementById('prix-acompte').innerText = formatPrix(res.acompte);
  document.getElementById('txt-jours').innerText = res.duree;
  document.getElementById('txt-formule').innerText = res.offre.toUpperCase();
}

async function verifierPromo() {
  const code = document.getElementById('code-promo').value.trim().toUpperCase();
  const msg = document.getElementById('msg-promo');
  msg.innerText = '';
  reductionActive = 0;
  calculerPrix();
  if (!code) return;

  const d1 = document.getElementById('date-debut').value;
  const d2 = document.getElementById('date-fin').value;
  if (!d1 || !d2) {
    msg.innerText = 'Sélectionnez vos dates avant le code promo.';
    msg.style.color = '#e67e22';
    return;
  }
  const diffDays = Math.ceil((new Date(d2) - new Date(d1)) / 86400000) + 1;

  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await sb
    .from('codes_promo')
    .select('*')
    .eq('code', code)
    .eq('actif', true)
    .lte('date_debut', today)
    .gte('date_fin', today)
    .maybeSingle();

  if (error || !data) {
    msg.innerText = 'Code invalide ou expiré.';
    msg.style.color = '#e74c3c';
    return;
  }

  if (diffDays < data.min_jours) {
    msg.innerText = `Minimum ${data.min_jours} jour(s) requis.`;
    msg.style.color = '#e67e22';
    return;
  }

  reductionActive = data.reduction_pourcent;
  msg.innerText = `Code appliqué : -${reductionActive}%`;
  msg.style.color = '#27ae60';
  calculerPrix();
}


