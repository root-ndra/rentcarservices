const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6...'; // même clé publique qu’ailleurs
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let voituresCache = [];

document.addEventListener('DOMContentLoaded', () => {
  chargerVoitures();
  initFilterListeners();
  initPartnerForm();
});

function toggleMenu() {
  const nav = document.getElementById('nav-menu');
  if (nav) nav.classList.toggle('active');
}

async function chargerVoitures() {
  const container = document.getElementById('container-voitures');
  container.innerHTML = '<p>Chargement…</p>';

  const { data, error } = await sb
    .from('voitures')
    .select('*')
    .order('prix_base', { ascending: true });

  if (error) {
    container.innerHTML = `<p class="empty-state">Erreur : ${error.message}</p>`;
    return;
  }

  voituresCache = data || [];
  peuplerFiltresDynamiques(voituresCache);
  renderVoitures(voituresCache);
}

function peuplerFiltresDynamiques(list) {
  const remplirSelect = (id, values) => {
    const select = document.getElementById(id);
    if (!select) return;
    const uniques = Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'fr', { sensitivity: 'base' })
    );
    const current = select.value;
    select.innerHTML = '<option value="">Tous</option>';
    uniques.forEach((val) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      select.appendChild(opt);
    });
    if (current && uniques.includes(current)) select.value = current;
  };

  remplirSelect('filter-type', list.map((v) => v.type));
  remplirSelect('filter-carburant', list.map((v) => v.carburant));
}

function initFilterListeners() {
  const ids = ['filter-type', 'filter-carburant', 'filter-places', 'filter-prix-max', 'sort-prix'];
  ids.forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.addEventListener('input', appliquerFiltres);
  });
}

function appliquerFiltres() {
  const type = document.getElementById('filter-type').value;
  const carburant = document.getElementById('filter-carburant').value;
  const places = document.getElementById('filter-places').value;
  const prixMax = parseInt(document.getElementById('filter-prix-max').value, 10);
  const sort = document.getElementById('sort-prix').value;

  let resultat = voituresCache.filter((v) => {
    const matchType = !type || v.type === type;
    const matchCarburant = !carburant || v.carburant === carburant;
    const matchPlaces =
      !places ||
      (places === '7+' ? (v.places || 0) >= 7 : String(v.places || '') === places);
    const matchPrix = !prixMax || (v.prix_base || 0) <= prixMax;
    return matchType && matchCarburant && matchPlaces && matchPrix;
  });

  resultat = trierVoitures(resultat, sort);
  renderVoitures(resultat);
}

function trierVoitures(list, sort) {
  const comparator = {
    'prix-asc': (a, b) => (a.prix_base || 0) - (b.prix_base || 0),
    'prix-desc': (a, b) => (b.prix_base || 0) - (a.prix_base || 0),
    'type-asc': (a, b) => (a.type || '').localeCompare(b.type || '', 'fr', { sensitivity: 'base' }),
    'carburant-asc': (a, b) =>
      (a.carburant || '').localeCompare(b.carburant || '', 'fr', { sensitivity: 'base' }),
  };
  const fn = comparator[sort] || comparator['prix-asc'];
  return [...list].sort(fn);
}

function renderVoitures(list) {
  const container = document.getElementById('container-voitures');
  if (!list.length) {
    container.innerHTML = '<p class="empty-state">Aucun véhicule ne correspond aux filtres.</p>';
    return;
  }

  container.innerHTML = list
    .map((v) => {
      const prix = (v.prix_base || 0).toLocaleString('fr-FR');
      const places = v.places ? `${v.places} places` : '—';
      const carbu = v.carburant || '—';
      const type = v.type || '—';
      const desc = (v.description || '').slice(0, 140);
      const isReservable = v.reservable !== false;

      return `
        <article class="carte-voiture">
          <img src="${v.image_url || 'https://placehold.co/600x400?text=Voiture'}" alt="${v.nom}">
          <h3>${v.nom}</h3>
          <div style="padding:0 20px; color:#64748b; font-size:.9rem; display:flex; flex-wrap:wrap; gap:10px; justify-content:center;">
            <span><i class="fas fa-tags"></i> ${type}</span>
            <span><i class="fas fa-gas-pump"></i> ${carbu}</span>
            <span><i class="fas fa-user-friends"></i> ${places}</span>
          </div>
          <p class="carte-desc">${desc}${v.description?.length > 140 ? '…' : ''}</p>
          <p class="prix">${prix} Ar / jour</p>
          <button ${isReservable ? '' : 'class="btn-disabled" disabled'}
            onclick="reserverVoiture('${v.id}')">
            ${isReservable ? 'Réserver' : 'Contact direct'}
          </button>
        </article>`;
    })
    .join('');
}

function reserverVoiture(id) {
  const voiture = voituresCache.find((v) => v.id === id);
  if (!voiture) return;
  sessionStorage.setItem(
    'voitureSelectionnee',
    JSON.stringify({
      id: voiture.id,
      nom: voiture.nom,
      prix_base: voiture.prix_base,
      ref_id: voiture.ref_id || '',
      description: voiture.description || '',
      reservable: voiture.reservable !== false,
    })
  );
  window.location.href = 'index.html#reservation';
}

function initPartnerForm() {
  const form = document.getElementById('form-partenaire');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const feedback = document.getElementById('partner-feedback');
    const submitBtn = form.querySelector('button[type="submit"]');

    const prenom = document.getElementById('partner-prenom').value.trim();
    const nom = document.getElementById('partner-nom').value.trim();
    const email = document.getElementById('partner-email').value.trim();
    const phone = document.getElementById('partner-tel').value.trim();
    const adresse = document.getElementById('partner-adresse').value.trim();
    const commission = parseInt(document.getElementById('partner-commission').value, 10) || 15;
    const loginEmail = document.getElementById('partner-login-email').value.trim();
    const password = document.getElementById('partner-password').value;
    const passwordConfirm = document.getElementById('partner-password-confirm').value;
    const accepted = document.getElementById('partner-conditions').checked;

    if (password !== passwordConfirm) {
      feedback.textContent = 'Les mots de passe ne correspondent pas.';
      feedback.style.color = '#e74c3c';
      return;
    }
    if (!accepted) {
      feedback.textContent = 'Merci d’accepter la validation manuelle.';
      feedback.style.color = '#e67e22';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Envoi…';
    feedback.textContent = '';

    try {
      const { data, error } = await sb.auth.signUp({
        email: loginEmail,
        password,
        options: { data: { role: 'partenaire' } },
      });
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) throw new Error("Impossible de récupérer l'identifiant utilisateur.");

      const partnerRow = {
        user_id: userId,
        email,
        nom_complet: `${prenom} ${nom}`.trim(),
        prenom,
        telephone: phone,
        commission_taux: commission,
        role: 'partenaire',
        est_gele: true,
        adresse, // ⚠️ assurez-vous que la colonne existe dans la table partenaires.
      };

      const { error: insertError } = await sb.from('partenaires').insert([partnerRow]);
      if (insertError) throw insertError;

      feedback.textContent =
        'Merci ! Votre compte a été créé. Vérifiez vos emails (validation Supabase) puis attendez la confirmation admin.';
      feedback.style.color = '#16a34a';
      form.reset();
    } catch (err) {
      feedback.textContent = err.message;
      feedback.style.color = '#e74c3c';
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Envoyer';
    }
  });
}