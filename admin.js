const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';
const supabaseAdmin = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let partenairesCache = [];
let editingPartnerKey = null;

document.addEventListener('DOMContentLoaded', initAdmin);

async function initAdmin() {
  const { data } = await supabaseAdmin.auth.getSession();
  if (!data.session) {
    window.location.href = 'login.html';
    return;
  }
  currentUser = data.session.user;
  document.getElementById('user-email').textContent = currentUser.email;
  document.getElementById('user-role').textContent = (currentUser.user_metadata?.role || 'super_admin').toUpperCase();

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabaseAdmin.auth.signOut();
    window.location.href = 'login.html';
  });

  document.getElementById('partner-form').addEventListener('submit', submitPartner);

  await loadStats();
  await loadPartenaires();
}

async function loadStats() {
  const statsGrid = document.getElementById('stats-grid');
  statsGrid.innerHTML = '<p>Chargement…</p>';

  const [voitures, partenaires, reservations, offres] = await Promise.all([
    supabaseAdmin.from('voitures').select('id'),
    supabaseAdmin.from('partenaires').select('id, est_gele'),
    supabaseAdmin.from('reservations').select('id', { head: true, count: 'exact' }),
    supabaseAdmin.from('offres_emploi').select('id', { head: true, count: 'exact' })
  ]);

  const stats = [
    { label: 'Véhicules', value: voitures.data?.length || 0, icon: 'car' },
    { label: 'Partenaires actifs', value: (partenaires.data || []).filter(p => !p.est_gele).length, icon: 'handshake' },
    { label: 'Réservations', value: reservations.count || 0, icon: 'calendar-check' },
    { label: 'Offres emploi', value: offres.count || 0, icon: 'briefcase' }
  ];
  statsGrid.innerHTML = stats.map(stat => `
    <article class="car-card">
      <h4><i class="fas fa-${stat.icon}"></i> ${stat.label}</h4>
      <p style="font-size:2rem; margin:0;">${stat.value}</p>
    </article>
  `).join('');
}

async function loadPartenaires() {
  const tbody = document.getElementById('partners-body');
  tbody.innerHTML = '<tr><td colspan="6">Chargement…</td></tr>';

  const { data, error } = await supabaseAdmin
    .from('partenaires')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6">${error.message}</td></tr>`;
    return;
  }

  partenairesCache = data || [];
  renderPartnerTable(partenairesCache);
}

function renderPartnerTable(list) {
  const tbody = document.getElementById('partners-body');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6">Aucun partenaire pour le moment.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(p => {
    const partnerKey = p.id || p.user_id;
    return `
      <tr>
        <td>${p.nom_complet || '-'}</td>
        <td>${p.email}</td>
        <td>${p.telephone || '-'}</td>
        <td>${p.commission_taux || 0}%</td>
        <td>
          <label class="switch">
            <input type="checkbox" ${p.est_gele ? '' : 'checked'} onchange="togglePartner('${partnerKey}', this.checked)">
            <span class="slider"></span>
          </label>
        </td>
        <td>
          <button class="btn-small btn-sec" onclick="openPartnerModal('${partnerKey}')"><i class="fas fa-pen"></i></button>
          <button class="btn-small" style="background:#6366f1;color:white;" onclick="viewPartner('${partnerKey}')"><i class="fas fa-eye"></i></button>
        </td>
      </tr>
    `;
  }).join('');
}

function findPartnerByKey(key) {
  return partenairesCache.find(p => (p.id && p.id === key) || (p.user_id && p.user_id === key));
}

function getPartnerIdentifier(key) {
  const partner = findPartnerByKey(key);
  if (partner?.id) return { column: 'id', value: partner.id };
  if (partner?.user_id) return { column: 'user_id', value: partner.user_id };
  return { column: 'id', value: key };
}

function openPartnerModal(partnerKey = null) {
  const modal = document.getElementById('partner-modal');
  const authOnly = document.querySelectorAll('.auth-only');
  const title = document.getElementById('partner-modal-title');
  const form = document.getElementById('partner-form');

  form.reset();
  document.getElementById('partner-id').value = partnerKey || '';

  editingPartnerKey = partnerKey;
  authOnly.forEach(bloc => bloc.style.display = partnerKey ? 'none' : 'block');
  document.getElementById('new-login').disabled = !!partnerKey;
  document.getElementById('new-password').disabled = !!partnerKey;

  if (partnerKey) {
    const partner = findPartnerByKey(partnerKey);
    title.textContent = 'Modifier partenaire';
    document.getElementById('new-prenom').value = partner?.prenom || '';
    document.getElementById('new-nom').value = partner?.nom_complet?.split(' ').slice(-1).join(' ') || '';
    document.getElementById('new-email').value = partner?.email || '';
    document.getElementById('new-tel').value = partner?.telephone || '';
    document.getElementById('new-commission').value = partner?.commission_taux || 15;
  } else {
    title.textContent = 'Nouveau partenaire';
  }

  document.getElementById('partner-feedback').textContent = '';
  modal.style.display = 'flex';
}

function closePartnerModal() {
  document.getElementById('partner-modal').style.display = 'none';
  editingPartnerKey = null;
}

async function submitPartner(event) {
  event.preventDefault();
  const feedback = document.getElementById('partner-feedback');
  feedback.textContent = 'Traitement…';
  feedback.style.color = '#1e40af';

  const prenom = document.getElementById('new-prenom').value.trim();
  const nom = document.getElementById('new-nom').value.trim();
  const email = document.getElementById('new-email').value.trim();
  const tel = document.getElementById('new-tel').value.trim();
  const commission = parseInt(document.getElementById('new-commission').value, 10) || 15;

  if (editingPartnerKey) {
    const { column, value } = getPartnerIdentifier(editingPartnerKey);
    const payload = {
      prenom,
      nom_complet: `${prenom} ${nom}`.trim(),
      email,
      telephone: tel,
      commission_taux: commission
    };
    const { error } = await supabaseAdmin.from('partenaires').update(payload).eq(column, value);
    if (error) {
      feedback.textContent = error.message;
      feedback.style.color = '#e74c3c';
      return;
    }
    feedback.textContent = 'Partenaire mis à jour ✅';
    feedback.style.color = '#16a34a';
    await loadPartenaires();
    setTimeout(closePartnerModal, 800);
    return;
  }

  const loginEmail = document.getElementById('new-login').value.trim();
  let password = document.getElementById('new-password').value.trim();
  if (!loginEmail) {
    feedback.textContent = 'Le login Supabase est obligatoire pour créer un compte.';
    feedback.style.color = '#e74c3c';
    return;
  }
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
    nom_complet: `${prenom} ${nom}`.trim(),
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
  feedback.textContent = 'Partenaire créé ✅ (pense à valider son email)';
  feedback.style.color = '#16a34a';
  await loadPartenaires();
  setTimeout(closePartnerModal, 1200);
}

async function togglePartner(partnerKey, isActive) {
  const { column, value } = getPartnerIdentifier(partnerKey);
  await supabaseAdmin
    .from('partenaires')
    .update({ est_gele: !isActive })
    .eq(column, value);
  await loadPartenaires();
}

function viewPartner(partnerKey) {
  const partner = findPartnerByKey(partnerKey);
  if (!partner) return;
  alert(
    `Partenaire : ${partner.nom_complet}\n` +
    `Email : ${partner.email}\n` +
    `Téléphone : ${partner.telephone || '-'}\n` +
    `Commission : ${partner.commission_taux || 0}%`
  );
}

window.openPartnerModal = openPartnerModal;
window.closePartnerModal = closePartnerModal;
window.togglePartner = togglePartner;
window.viewPartner = viewPartner;
