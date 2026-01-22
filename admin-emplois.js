/* ... imports + session check identiques ... */

async function loadRecruiters() {
  const body = document.getElementById('recruteurs-body');
  const { data, error } = await supabaseJobs.from('recruteurs').select('*');

  if (error) {
    if (error.message.includes('recruteurs')) {
      body.innerHTML = `
        <tr>
          <td colspan="4">
            La table <strong>recruteurs</strong> n’existe pas encore.
            Exécute le script SQL indiqué plus haut pour l’activer.
          </td>
        </tr>`;
      return;
    }
    body.innerHTML = `<tr><td colspan="4">${error.message}</td></tr>`;
    return;
  }

  recruitersCache = data || [];
  body.innerHTML = recruitersCache.length
    ? recruitersCache.map(rec => `
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
        </tr>`).join('')
    : '<tr><td colspan="4">Aucun recruteur.</td></tr>';
}
