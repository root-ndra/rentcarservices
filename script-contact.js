const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

document.addEventListener('DOMContentLoaded', async () => {
  await chargerConfigContact();
  await chargerAvis();
  initForms();
});

function toggleMenu() {
  document.getElementById('nav-menu')?.classList.toggle('active');
}

async function chargerConfigContact() {
  try {
    const resp = await fetch('site_config.json');
    const config = await resp.json();
    document.getElementById('header-logo').src = config.header.logoUrl;
    document.getElementById('header-site-name').innerText = config.header.siteName;
    document.getElementById('footer-title').innerText = config.header.siteName;
    document.getElementById('footer-address').innerText = config.footer.address;
    document.getElementById('footer-nif').innerText = config.footer.nif;
    document.getElementById('footer-stat').innerText = config.footer.stat;
    document.getElementById('footer-phone').innerText = config.contact.phoneDisplay;
    document.getElementById('btn-call').href = `tel:${config.contact.phoneCall}`;
    document.getElementById('btn-wa').href = `https://wa.me/${config.contact.whatsapp.replace('+','')}`;
    document.getElementById('contact-hotline').innerText = config.contact.phoneDisplay;
    document.getElementById('contact-address').innerText = config.footer.address;

    if (config.footer.mapUrl) {
      document.getElementById('contact-map').innerHTML =
        `<iframe src="${config.footer.mapUrl}" width="100%" height="320" style="border:0;" allowfullscreen loading="lazy"></iframe>`;
    }

    const cards = [
      { icon: 'fas fa-phone-volume', title: 'Hotline & WhatsApp', value: config.contact.phoneDisplay, cta: `tel:${config.contact.phoneCall}` },
      { icon: 'fas fa-envelope', title: 'Support email', value: 'support@rentcarservices.mg', cta: 'mailto:support@rentcarservices.mg' },
      { icon: 'fas fa-building', title: 'Agence principale', value: config.footer.address, cta: config.footer.mapUrl || '#' },
    ];
    document.getElementById('cards-contact').innerHTML = cards.map((card) => `
      <article class="card-contact">
        <h3><i class="${card.icon}"></i> ${card.title}</h3>
        <p>${card.value}</p>
        <a href="${card.cta}" target="_blank">Voir</a>
      </article>`).join('');
  } catch (err) {
    console.error('Config contact', err);
  }
}

function initForms() {
  const contactForm = document.getElementById('form-contact');
  const feedback = document.getElementById('contact-feedback');
  contactForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    feedback.textContent = 'Envoi en cours…';
    feedback.style.color = '#2563eb';

    const payload = {
      sujet: document.getElementById('contact-sujet').value,
      nom: document.getElementById('contact-nom').value,
      email: document.getElementById('contact-email').value,
      tel: document.getElementById('contact-tel').value,
      message: document.getElementById('contact-message').value,
    };

    const { error } = await sb.from('messages_contact').insert([payload]);
    if (error) {
      feedback.textContent = error.message;
      feedback.style.color = '#e74c3c';
      return;
    }
    feedback.textContent = 'Message envoyé ! Nous revenons vers vous très vite.';
    feedback.style.color = '#16a34a';
    contactForm.reset();
  });

  const avisForm = document.getElementById('form-avis');
  const avisFeedback = document.getElementById('avis-feedback');
  avisForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    avisFeedback.textContent = 'Transmission…';
    avisFeedback.style.color = '#2563eb';

    const { error } = await sb.from('avis').insert([{
      nom: document.getElementById('avis-nom').value,
      note: parseInt(document.getElementById('avis-note').value, 10),
      commentaire: document.getElementById('avis-message').value,
      visible: false,
    }]);

    if (error) {
      avisFeedback.textContent = error.message;
      avisFeedback.style.color = '#e74c3c';
      return;
    }
    avisFeedback.textContent = 'Merci ! Votre avis sera publiée après validation.';
    avisFeedback.style.color = '#16a34a';
    e.target.reset();
    chargerAvis();
  });
}

async function chargerAvis() {
  const container = document.getElementById('avis-list');
  container.innerHTML = '<p>Chargement des avis…</p>';
  const { data, error } = await sb
    .from('avis')
    .select('*')
    .eq('visible', true)
    .order('created_at', { ascending: false })
    .limit(6);

  if (error) {
    container.innerHTML = `<p>Erreur : ${error.message}</p>`;
    return;
  }
  if (!data?.length) {
    container.innerHTML = '<p>Aucun avis publié pour le moment.</p>';
    return;
  }
  container.innerHTML = data.map((avis) => `
    <article class="avis-card">
      <div class="note">${'⭐'.repeat(avis.note || 0)}</div>
      <p style="margin:10px 0; color:#475569;">${avis.commentaire}</p>
      <strong>${avis.nom}</strong>
      <small style="color:#94a3b8;">${new Date(avis.created_at).toLocaleDateString('fr-FR')}</small>
    </article>`).join('');
}
