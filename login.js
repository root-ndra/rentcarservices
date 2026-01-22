const SUPABASE_URL = 'https://ctijwjcjmbfmfhzwbguk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aWp3amNqbWJmbWZoendiZ3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzEyOTgsImV4cCI6MjA4MTQwNzI5OH0.gEPvDc0lgf1o1Ol5AJFDPFG8Oh5SIbsZvg-8KTB4utk';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const redirectByRole = {
  super_admin: 'admin.html',
  admin: 'admin.html',
  partenaire: 'admin-reservations.html',
  flotte: 'admin-reservations.html',
  maintenance: 'admin-maintenance.html',
  communication: 'admin-communication.html',
  ressources_humaines: 'admin-emplois.html',
  recruteur: 'admin-emplois.html'
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-form').addEventListener('submit', authenticate);
  checkExistingSession();
});

async function checkExistingSession() {
  const { data } = await supabaseClient.auth.getSession();
  const session = data.session;
  if (!session) return;
  reroute(session.user);
}

async function authenticate(event) {
  event.preventDefault();
  const feedback = document.getElementById('login-feedback');
  feedback.textContent = 'Vérification…';
  feedback.style.color = '#60a5fa';

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    feedback.textContent = error.message;
    feedback.style.color = '#f87171';
    return;
  }
  reroute(data.user);
}

function reroute(user) {
  const role = user?.user_metadata?.role || 'super_admin';
  const target = redirectByRole[role] || 'admin.html';
  window.location.href = target;
}
