const supabaseCom = supabase.createClient(
  'https://ctijwjcjmbfmfhzwbguk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk'
);
let comUser;

document.addEventListener('DOMContentLoaded', async () => {
  const { data } = await supabaseCom.auth.getSession();
  if (!data.session) { window.location='login.html'; return; }
  comUser = data.session.user;
  document.getElementById('user-email').textContent = comUser.email;
  document.getElementById('user-role').textContent = (comUser.user_metadata?.role || 'communication').toUpperCase();
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabaseCom.auth.signOut(); window.location='login.html';
  });

  loadAds();
  loadPromos();
  loadAvis();
});

async function loadAds() {
  const { data, error } = await supabaseCom.from('publicites').select('*').order('created_at', { ascending:false });
  if (error) { alert(error.message); return; }
  const grid = document.getElementById('ads-grid');
  grid.innerHTML = data.length ? data.map(ad => `
    <article class="car-card">
      <h4>${ad.titre}</h4>
      <p>${ad.description || ''}</p>
      <span>Position : ${ad.position}</span><br>
      <label class="switch">
        <input type="checkbox" ${ad.actif ? 'checked' : ''} onchange="toggleAd('${ad.id}', this.checked)">
        <span class="slider"></span>
      </label>
    </article>
  `).join('') : '<p>Aucune publicité.</p>';
}

async function toggleAd(id, active) {
  await supabaseCom.from('publicites').update({ actif: active }).eq('id', id);
}

async function loadPromos() {
  const { data, error } = await supabaseCom.from('codes_promo').select('*').order('created_at', { ascending:false });
  if (error) { alert(error.message); return; }
  document.getElementById('promo-body').innerHTML = data.length ? data.map(code => `
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
    </tr>
  `).join('') : '<tr><td colspan="4">Aucun code</td></tr>';
}

async function createPromo() {
  const code = document.getElementById('promo-code').value.trim().toUpperCase();
  const percent = parseInt(document.getElementById('promo-percent').value, 10);
  const expire = document.getElementById('promo-expire').value || null;
  if (!code || !percent) { alert('Compléter les champs'); return; }
  await supabaseCom.from('codes_promo').insert([{ code, pourcentage: percent, date_expiration: expire, actif: true }]);
  document.getElementById('promo-code').value = '';
  document.getElementById('promo-percent').value = '';
  document.getElementById('promo-expire').value = '';
  loadPromos();
}

async function togglePromo(id, active) {
  await supabaseCom.from('codes_promo').update({ actif: active }).eq('id', id);
}

async function loadAvis() {
  const { data, error } = await supabaseCom.from('avis').select('*').order('created_at', { ascending:false });
  if (error) { alert(error.message); return; }
  document.getElementById('avis-list').innerHTML = data.map(avis => `
    <article class="car-card">
      <p>${'⭐'.repeat(avis.note || 0)}</p>
      <p>${avis.commentaire}</p>
      <small>${avis.nom} — ${new Date(avis.created_at).toLocaleDateString('fr-FR')}</small>
      <div style="margin-top:10px;">
        <button class="btn-small btn-sec" onclick="setAvisVisible('${avis.id}', true)">Publier</button>
        <button class="btn-small" style="background:#ef4444;color:white;" onclick="setAvisVisible('${avis.id}', false)">Masquer</button>
      </div>
    </article>
  `).join('');
}

async function setAvisVisible(id, visible) {
  await supabaseCom.from('avis').update({ visible }).eq('id', id);
  loadAvis();
}

window.toggleAd = toggleAd;
window.togglePromo = togglePromo;
window.createPromo = createPromo;
window.setAvisVisible = setAvisVisible;
