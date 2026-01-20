const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let domainesConfig = [];
let offresCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  await chargerDomaines();
  await chargerOffres();
});

async function chargerDomaines() {
  try {
    const resp = await fetch('domaines_emplois.json');
    const data = await resp.json();
    domainesConfig = data.domaines || [];
    const select = document.getElementById('select-domaine');
    domainesConfig.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d.code;
      opt.textContent = d.label;
      select.appendChild(opt);
    });
  } catch (err) {
    console.warn('Domaines JSON manquant', err);
  }
}

async function chargerOffres() {
  const grid = document.getElementById('jobs-grid');
  grid.innerHTML = '<p class="empty-state">Chargement des offres…</p>';

  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await sb
    .from('offres_emploi')
    .select('*')
    .eq('actif', true)
    .gte('date_limite', today)
    .order('created_at', { ascending: false });

  if (error) {
    grid.innerHTML = `<p class="empty-state">Erreur : ${error.message}</p>`;
    return;
  }
  offresCache = data || [];
  afficherOffres(offresCache);
}

function afficherOffres(offres) {
  const grid = document.getElementById('jobs-grid');
  if (!offres.length) {
    grid.innerHTML = '<p class="empty-state">Aucune offre ne correspond à votre recherche.</p>';
    return;
  }
  grid.innerHTML = offres.map((job) => `
    <article class="job-card" onclick="this.classList.toggle('flipped')">
      <div class="job-card-inner">
        <div class="job-side job-front">
          <h3>${job.titre}</h3>
          <div class="meta">
            <span><i class="fas fa-briefcase"></i> ${job.type_contrat}</span>
            <span><i class="fas fa-map-marker-alt"></i> ${job.localisation}</span>
          </div>
          <div class="tags">
            ${job.domaine ? `<span class="tag">${labelDomaine(job.domaine)}</span>` : ''}
            ${job.date_publication ? `<span class="tag">Publié ${job.date_publication}</span>` : ''}
          </div>
          <div style="margin-top:auto; color:#94a3b8; font-size:.9rem;">
            Expire ${job.date_limite || '—'}
          </div>
        </div>
        <div class="job-side job-back">
          <p>${job.description}</p>
          ${job.contact ? `<p><strong>Contact :</strong> ${job.contact}</p>` : ''}
          ${job.lien_postuler ? `<a href="${job.lien_postuler}" target="_blank">Postuler</a>` : ''}
        </div>
      </div>
    </article>
  `).join('');
}

function labelDomaine(code) {
  return domainesConfig.find((d) => d.code === code)?.label || code;
}

function filtrerOffres() {
  const motCle = document.getElementById('search-input').value.toLowerCase();
  const domaine = document.getElementById('select-domaine').value;
  const filtres = offresCache.filter((job) => {
    const texte = `${job.titre} ${job.description} ${job.localisation} ${job.type_contrat}`.toLowerCase();
    const matchMotCle = texte.includes(motCle);
    const matchDomaine = !domaine || job.domaine === domaine;
    return matchMotCle && matchDomaine;
  });
  afficherOffres(filtres);
}
