const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';
const supabaseAdmin = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser, partenairesCache = [];

document.addEventListener('DOMContentLoaded', initAdmin);

async function initAdmin() {
  const { data } = await supabaseAdmin.auth.getSession();
  if (!data.session) {
    window.location.href = 'login.html';
    return;
  }
  currentUser = data.session.user;
  renderHeader();
  bindEvents();
  await loadStats();
  await loadPartenaires();
}

function renderHeader() {
  document.getElementById('user-email').textContent = currentUser.email;
  const role = currentUser.user_metadata?.role || 'ADMIN';
  document.getElementById('user-role').textContent = role.toUpperCase();
}

function bindEvents() {
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabaseAdmin.auth.signOut();
    window.location.href = 'login.html';
  });
  document.getElementById('partner-form').addEventListener('submit', submitPartner);
}

async function loadStats() {
  const statsGrid = document.getElementById('stats-grid');
  statsGrid.innerHTML = '<p>Chargement…</p>';

  const [
    voitures, partenaires, reservations, offres
  ] = await Promise.all([
    supabaseAdmin.from('voitures').select('id,reservable'),
    supabaseAdmin.from('partenaires').select('id,est_gele'),
    supabaseAdmin.from('reservations').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('offres_emploi').select('id', { count: 'exact', head: true })
  ]);

  const stats = [
    { label: 'Véhicules', value: voitures.data?.length || 0, icon: 'car' },
    { label: 'Partenaires actifs', value: (partenaires.data || []).filter(p => !p.est_gele).length, icon: 'handshake' },
    { label: 'Réservations totales', value: reservations.count || 0, icon: 'calendar-check' },
    { label: 'Offres emploi', value: offres.count || 0, icon: 'briefcase' }
  ];
  statsGrid.innerHTML = stats.map(stat => `
    <article class="car-card">
      <h4><i class="fas fa-${stat.icon}"></i> ${stat.label}</h4>
      <p style="font-size:2rem; margin:10px 0 0;">${stat.value}</p>
    </article>
  `).join('');
}

async function loadPartenaires() {
  const tableBody = document.querySelector('#table-partenaires tbody');
  tableBody.innerHTML = '<tr><td colspan="6">Chargement…</td></tr>';

  const { data, error } = await supabaseAdmin
    .from('partenaires')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    tableBody.innerHTML = `<tr><td colspan="6">${error.message}</td></tr>`;
    return;
  }
  partenairesCache = data;
  renderPartnerTable(data);
}

function renderPartnerTable(list) {
  const tableBody = document.querySelector('#table-partenaires tbody');
  if (!list.length) {
    tableBody.innerHTML = '<tr><td colspan="6">Aucun partenaire</td></tr>';
    return;
  }
  tableBody.innerHTML = list.map(p => `
    <tr>
      <td>${p.nom_complet || '-'}</td>
      <td>${p.email}</td>
      <td>${p.telephone || '-'}</td>
      <td>${p.commission_taux || 0}%</td>
      <td>
        <label class="switch">
          <input type="checkbox" ${p.est_gele ? '' : 'checked'} onchange="togglePartner('${p.id}', this.checked)">
          <span class="slider"></span>
        </label>
      </td>
      <td>
        <button class="btn-small btn-sec" onclick="editPartner('${p.id}')"><i class="fas fa-pen"></i></button>
        <button class="btn-small" style="background:#f59e0b; color:white;" onclick="viewPartner('${p.id}')"><i class="fas fa-eye"></i></button>
      </td>
    </tr>
  `).join('');
}

async function togglePartner(id, active) {
  await supabaseAdmin
    .from('partenaires')
    .update({ est_gele: !active })
    .eq('id', id);
  loadPartenaires();
}

function openPartnerModal() {
  document.getElementById('partner-modal').style.display = 'flex';
  document.getElementById('partner-feedback').textContent = '';
}
function closePartnerModal() {
  document.getElementById('partner-modal').style.display = 'none';
  document.getElementById('partner-form').reset();
}

async function submitPartner(event) {
  event.preventDefault();
  const feedback = document.getElementById('partner-feedback');
  feedback.textContent = 'Création en cours…';

  const prenom = document.getElementById('new-prenom').value.trim();
  const nom = document.getElementById('new-nom').value.trim();
  const email = document.getElementById('new-email').value.trim();
  const tel = document.getElementById('new-tel').value.trim();
  const commission = parseInt(document.getElementById('new-commission').value, 10) || 15;
  const loginEmail = document.getElementById('new-login').value.trim();
  let password = document.getElementById('new-password').value.trim();
  if (!password) {
    password = `RCS-${Math.random().toString(36).slice(2, 8)}!`;
    document.getElementById('new-password').value = password;
  }

  const { data, error } = await supabaseAdmin.auth.signUp({
    email: loginEmail,
    password,
    options: { data: { role: 'partenaire' } }
  });
  if (error) {
    feedback.textContent = error.message;
    feedback.style.color = '#e74c3c';
    return;
  }
  const userId = data.user.id;
  const { error: insertError } = await supabaseAdmin.from('partenaires').insert([{
    user_id: userId,
    prenom,
    nom_complet: `${prenom} ${nom}`,
    email,
    telephone: tel,
    commission_taux: commission,
    est_gele: false
  }]);
  if (insertError) {
    feedback.textContent = insertError.message;
    feedback.style.color = '#e74c3c';
    return;
  }
  feedback.textContent = 'Partenaire créé !';
  feedback.style.color = '#27ae60';
  loadPartenaires();
  setTimeout(closePartnerModal, 1500);
}

// Hooks called by inline buttons
window.togglePartner = togglePartner;
window.editPartner = (id) => alert(`Formulaire d'édition à connecter (${id})`);
window.viewPartner = (id) => {
  const partner = partenairesCache.find(p => p.id === id);
  if (!partner) return;
  alert(`Partenaire : ${partner.nom_complet}\nEmail : ${partner.email}`);
};
