const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

document.addEventListener('DOMContentLoaded', chargerOffres);

async function chargerOffres() {
  const container = document.getElementById('jobs-container');
  container.innerHTML = '<p class="empty-state">Chargement des offres…</p>';

  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await sb
    .from('offres_emploi')
    .select('*')
    .eq('actif', true)
    .gte('date_limite', today)
    .order('date_limite', { ascending: true });

  if (error) {
    container.innerHTML = `<p class="empty-state">Erreur : ${error.message}</p>`;
    return;
  }
  if (!data?.length) {
    container.innerHTML = '<p class="empty-state">Aucune offre n’est disponible pour le moment.</p>';
    return;
  }

  container.innerHTML = data.map((job) => `
    <article class="job-card">
      <h3>${job.titre}</h3>
      <div class="meta">
        <span><i class="fas fa-briefcase"></i> ${job.type_contrat}</span>
        <span><i class="fas fa-map-marker-alt"></i> ${job.localisation}</span>
      </div>
      <p>${job.description.slice(0, 220)}${job.description.length > 220 ? '…' : ''}</p>
      <footer>
        <span>${job.date_limite ? `Jusqu’au ${job.date_limite}` : 'Date limite non précisée'}</span>
      </footer>
      ${job.lien_postuler
        ? `<a href="${job.lien_postuler}" target="_blank" rel="noopener">Postuler</a>`
        : ''}
    </article>
  `).join('');
}
