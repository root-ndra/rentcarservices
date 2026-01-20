// -----------------------------------------------------------------------------
// CONFIG SUPABASE
// -----------------------------------------------------------------------------
const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let maintenanceOptions = [];
let globalVoitures = [];

// -----------------------------------------------------------------------------
// LOGIN / SESSION
// -----------------------------------------------------------------------------
async function loginPartenaire() {
  const email = document.getElementById('partner-email').value.trim();
  const password = document.getElementById('partner-pass').value.trim();
  const errorMsg = document.getElementById('login-error');
  errorMsg.style.display = 'none';

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errorMsg.innerText = error.message;
    errorMsg.style.display = 'block';
  } else {
    verifierSessionPart();
  }
}

async function logoutPartenaire() {
  await sb.auth.signOut();
  window.location.reload();
}

async function verifierSessionPart() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('partner-content').style.display = 'none';
    return;
  }
  currentUser = session.user;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('partner-content').style.display = 'block';
  document.getElementById('header-partner-name').innerText = currentUser.email;

  await chargerMaintenanceOptions();
  chargerDashboardPart();
  chargerVoituresPourSelect();
  chargerTableReservations();
  chargerTableMaintenances();
}

// -----------------------------------------------------------------------------
// UTILITAIRES & NAVIGATION
// -----------------------------------------------------------------------------
function switchTabPartner(tab, evt) {
  const views = ['dashboard','reservations','maintenances'];
  views.forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.style.display = v === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));
  if (evt?.currentTarget) evt.currentTarget.classList.add('active');
}

function formatPrix(val) {
  if (val === null || val === undefined) return '0';
  return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// -----------------------------------------------------------------------------
// DASHBOARD VOITURES
// -----------------------------------------------------------------------------
async function chargerDashboardPart() {
  const grid = document.getElementById('grid-voitures');
  grid.innerHTML = '<p>Chargement…</p>';

  const { data, error } = await sb
    .from('voitures')
    .select('*')
    .eq('proprietaire_id', currentUser.id)
    .order('nom', { ascending: true });

  if (error) {
    grid.innerHTML = `<p>Erreur: ${error.message}</p>`;
    return;
  }
  globalVoitures = data || [];

  if (!globalVoitures.length) {
    grid.innerHTML = '<p>Vous n’avez pas encore de véhicule enregistré.</p>';
    return;
  }

  grid.innerHTML = globalVoitures.map((voiture) => `
    <div class="car-card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>${voiture.nom}</strong>
        <span style="color:#7f8c8d;">Ref: ${voiture.ref_id || '-'}</span>
      </div>
      <div class="meta">
        <span><i class="fas fa-gas-pump"></i> ${voiture.carburant || '-'}</span>
        <span><i class="fas fa-cogs"></i> ${voiture.transmission || '-'}</span>
        <span><i class="fas fa-money-bill"></i> ${formatPrix(voiture.prix_base)} Ar</span>
      </div>
      <div class="actions">
        <button class="btn-action btn-sec" onclick="ouvrirModalVoiturePartner('${voiture.id}')">Modifier</button>
      </div>
    </div>`).join('');
}

function ouvrirModalVoiturePartner(id = null) {
  document.getElementById('modal-voiture').style.display = 'flex';
  document.getElementById('modal-voiture').dataset.editId = id || '';

  const fields = ['new-car-nom','new-car-prix','new-car-places','new-car-desc','new-car-img','new-car-ref'];
  fields.forEach((f) => document.getElementById(f).value = '');
  document.getElementById('new-car-trans').value = 'Manuelle';
  document.getElementById('new-car-carburant').value = 'Essence';

  if (!id) return;

  const voiture = globalVoitures.find((v) => v.id === id);
  if (!voiture) return;
  document.getElementById('new-car-nom').value = voiture.nom || '';
  document.getElementById('new-car-prix').value = voiture.prix_base || '';
  document.getElementById('new-car-places').value = voiture.places || '';
  document.getElementById('new-car-trans').value = voiture.transmission || 'Manuelle';
  document.getElementById('new-car-carburant').value = voiture.carburant || 'Essence';
  document.getElementById('new-car-desc').value = voiture.description || '';
  document.getElementById('new-car-img').value = voiture.image_url || '';
  document.getElementById('new-car-ref').value = voiture.ref_id || '';
}

async function ajouterVoiture() {
  const editId = document.getElement__()
