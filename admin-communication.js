const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';
const supabaseCom = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;

document.addEventListener('DOMContentLoaded', initCommunication);

async function initCommunication() {
  const { data } = await supabaseCom.auth.getSession();
  if (!data.session) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = data.session.user;
  document.getElementById('user-email').textContent = currentUser.email;
  document.getElementById('user-role').textContent = (currentUser.user_metadata?.role || 'communication').toUpperCase();
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabaseCom.auth.signOut();
    window.location.href = 'login.html';
  });

  await loadAds();
  await loadPromos();
  await loadAvis();
}

/* ---------- PUBLICITÉS ---------- */
async function loadAds() {
  const { data, error } = await supabaseCom
    .from('publicites')
    .select('*')
    .order('id', { ascending: false }); // on trie par id pour éviter la colonne created_at manquante

  const grid = document.getElementById('ads-grid');

  if (error) {
    grid.innerHTML = `<p>Erreur : ${error.message}</p>`;
    return;
  }

  if (!data?.length) {
    grid.innerHTML = '<p>Aucune publicité configurée.</p>';
    return;
  }

  grid.innerHTML = data
    .map(
      (ad) => `
      <article class="car-card">
        <h4>${ad.titre}</h4>
        <p>${ad.description || ''}</p>
        <small>Position : ${ad.position || '-'}</small><br>
        <label class="switch">
          <input type="checkbox" ${ad.actif ? 'checked' : ''} onchange="toggleAd('${ad.id}', this.checked)">
          <span class="slider"></span>
        </label>
      </article>`
    )
    .join('');
}

async function toggleAd(id, active) {
  await supabaseCom.from('publicites').update({ actif: active }).eq('id', id);
}

/* ---------- CODES PROMO ---------- */
async function loadPromos() {
  const tbody = document.getElementById('promo-body');
  const { data, error } = await supabaseCom
    .from('codes_promo')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4">${error.message}</td></tr>`;
    return;
  }

  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="4">Aucun code promo pour l’instant.</td></tr>';
    return;
  }

  tbody.innerHTML = data
    .map(
      (code) => `
      <tr>
        <td>${code.code}</td>
        <td>${code.pourcentage}%</td>
        <td>${code.date_expiration || '-'}</td>
        <td>
          <label class="switch">
            <input type="checkbox" ${code.actif ? 'checked' : ''} onchange="togglePromo('${code.id}', this.checked)">
            <span class="slider"></span>
          </label>
        </td>
      </tr>`
    )
    .join('');
}

async function createPromo() {
  const code = document.getElementById('promo-code').value.trim().toUpperCase();
  const percent = parseInt(document.getElementById('promo-percent').value, 10);
  const expire = document.getElementById('promo-expire').value || null;

  if (!code || !percent) {
    alert('Merci de renseigner le code et le pourcentage.');
    return;
  }

  const { error } = await supabaseCom.from('codes_promo').insert([
    { code, pourcentage: percent, date_expiration: expire, actif: true }
  ]);

  if (error) {
    alert(error.message);
    return;
  }

  document.getElementById('promo-code').value = '';
  document.getElementById('promo-percent').value = '';
  document.getElementById('promo-expire').value = '';
  loadPromos();
}

async function togglePromo(id, active) {
  await supabaseCom.from('codes_promo').update({ actif: active }).eq('id', id);
  loadPromos();
}

/* ---------- AVIS CLIENTS ---------- */
async function loadAvis() {
  const container = document.getElementById('avis-list');
  const { data, error } = await supabaseCom
    .from('avis')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<p>Erreur : ${error.message}</p>`;
    return;
  }

  if (!data?.length) {
    container.innerHTML = '<p>Aucun avis en base.</p>';
    return;
  }

  container.innerHTML = data
    .map(
      (avis) => `
        <article class="car-card">
          <p>${'⭐'.repeat(avis.note || 0)}</p>
          <p>${avis.commentaire || '(pas de commentaire)'}</p>
          <small>${avis.nom || 'Anonyme'} — ${new Date(avis.created_at).toLocaleDateString('fr-FR')}</small>
          <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn-small btn-sec" onclick="setAvisVisible('${avis.id}', true)">Publier</button>
            <button class="btn-small" style="background:#ef4444;color:white;" onclick="setAvisVisible('${avis.id}', false)">Masquer</button>
          </div>
        </article>`
    )
    .join('');
}

async function setAvisVisible(id, visible) {
  await supabaseCom.from('avis').update({ visible }).eq('id', id);
  loadAvis();
}

/* ---------- EXPOSE GLOBAL FUNCTIONS ---------- */
window.toggleAd = toggleAd;
window.createPromo = createPromo;
window.togglePromo = togglePromo;
window.setAvisVisible = setAvisVisible;
