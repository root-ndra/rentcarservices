const supabaseJobs = supabase.createClient(
  'https://ctijwjcjmbfmfhzwbguk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk'
);

let jobsCache = [], recruitersCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  const { data } = await supabaseJobs.auth.getSession();
  if (!data.session) { window.location='login.html'; return; }
  const user = data.session.user;
  document.getElementById('user-email').textContent = user.email;
  document.getElementById('user-role').textContent = (user.user_metadata?.role || 'rh').toUpperCase();
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabaseJobs.auth.signOut(); window.location='login.html';
  });

  await loadJobs();
  await loadRecruiters();

  document.getElementById('job-status').addEventListener('change', renderJobs);
  document.getElementById('job-form').addEventListener('submit', saveJob);
});

async function loadJobs() {
  const { data, error } = await supabaseJobs
    .from('offres_emploi')
    .select('*')
    .order('created_at', { ascending:false });
  if (error) { alert(error.message); return; }
  jobsCache = data || [];
  renderJobs();
}

function renderJobs() {
  const status = document.getElementById('job-status').value;
  const today = new Date().toISOString().split('T')[0];
  const filtered = jobsCache.filter(job => {
    if (status === 'actif') return job.actif;
    if (status === 'attente') return !job.actif;
    if (status === 'expiré') return job.date_limite && job.date_limite < today;
    return true;
  });
  const body = document.getElementById('jobs-body');
  body.innerHTML = filtered.length ? filtered.map(job => `
    <tr>
      <td>${job.titre}</td>
      <td>${job.entreprise || job.recruteur_nom || '-'}</td>
      <td>${job.domaine || '-'}</td>
      <td>${formatDate(job.created_at)}</td>
      <td>${job.date_limite || '-'}</td>
      <td>
        <label class="switch">
          <input type="checkbox" ${job.actif ? 'checked' : ''} onchange="toggleJob('${job.id}', this.checked)">
          <span class="slider"></span>
        </label>
      </td>
      <td>
        <button class="btn-small btn-sec" onclick="editJob('${job.id}')"><i class="fas fa-pen"></i></button>
        <button class="btn-small" style="background:#ef4444;color:white;" onclick="deleteJob('${job.id}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="7">Aucune offre</td></tr>';
}

async function loadRecruiters() {
  const { data, error } = await supabaseJobs
    .from('recruteurs')
    .select('*');
  if (error) { alert(error.message); return; }
  recruitersCache = data || [];
  const body = document.getElementById('recruteurs-body');
  body.innerHTML = recruitersCache.length ? recruitersCache.map(rec => `
    <tr>
      <td>${rec.entreprise}</td>
      <td>${rec.email}</td>
      <td>${rec.domaine || '-'}</td>
      <td>
        <label class="switch">
          <input type="checkbox" ${rec.actif ? 'checked' : ''} onchange="toggleRecruiter('${rec.id}', this.checked)">
          <span class="slider"></span>
        </label>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="4">Aucun recruteur</td></tr>';
}

function openJobModal() {
  document.getElementById('job-form').reset();
  document.getElementById('job-id').value = '';
  document.getElementById('job-modal').style.display='flex';
}
function closeJobModal() {
  document.getElementById('job-modal').style.display='none';
}

function editJob(id) {
  const job = jobsCache.find(j => j.id === id);
  if (!job) return;
  document.getElementById('job-id').value = job.id;
  document.getElementById('job-title').value = job.titre;
  document.getElementById('job-company').value = job.entreprise || '';
  document.getElementById('job-domain').value = job.domaine || '';
  document.getElementById('job-desc').value = job.description || '';
  document.getElementById('job-limit').value = job.date_limite || '';
  document.getElementById('job-email').value = job.email_contact || '';
  document.getElementById('job-link').value = job.lien_postuler || '';
  document.getElementById('job-active').value = job.actif ? 'true' : 'false';
  document.getElementById('job-modal').style.display='flex';
}

async function saveJob(event) {
  event.preventDefault();
  const feedback = document.getElementById('job-feedback');
  feedback.textContent = 'Enregistrement…';

  const payload = {
    titre: document.getElementById('job-title').value,
    entreprise: document.getElementById('job-company').value,
    domaine: document.getElementById('job-domain').value,
    description: document.getElementById('job-desc').value,
    date_limite: document.getElementById('job-limit').value || null,
    email_contact: document.getElementById('job-email').value || null,
    lien_postuler: document.getElementById('job-link').value || null,
    actif: document.getElementById('job-active').value === 'true'
  };
  const id = document.getElementById('job-id').value;
  const { error } = id
    ? await supabaseJobs.from('offres_emploi').update(payload).eq('id', id)
    : await supabaseJobs.from('offres_emploi').insert([payload]);
  if (error) {
    feedback.textContent = error.message;
    feedback.style.color = '#e74c3c';
    return;
  }
  feedback.textContent = 'Sauvegardé !';
  feedback.style.color = '#16a34a';
  await loadJobs();
  setTimeout(closeJobModal, 800);
}

async function toggleJob(id, active) {
  await supabaseJobs.from('offres_emploi').update({ actif: active }).eq('id', id);
  loadJobs();
}
async function deleteJob(id) {
  if (!confirm('Supprimer cette offre ?')) return;
  await supabaseJobs.from('offres_emploi').delete().eq('id', id);
  loadJobs();
}
async function toggleRecruiter(id, active) {
  await supabaseJobs.from('recruteurs').update({ actif: active }).eq('id', id);
  loadRecruiters();
}

function formatDate(date) {
  return date ? new Date(date).toLocaleDateString('fr-FR') : '-';
}

window.openJobModal = openJobModal;
window.closeJobModal = closeJobModal;
window.editJob = editJob;
window.toggleJob = toggleJob;
window.deleteJob = deleteJob;
window.toggleRecruiter = toggleRecruiter;
