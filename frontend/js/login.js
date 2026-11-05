const form = document.getElementById('login-form');
const msg = document.getElementById('msg');
const submit = document.getElementById('submit');

if (getToken() && getUser()) window.location.href = homeFor(getUser());

form.addEventListener('submit', async function (e) {
  e.preventDefault();
  showMsg(msg, '', '');
  submit.disabled = true;
  submit.textContent = 'Logging in...';
  try {
    const data = await api('POST', '/api/auth/login', {
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
    });
    saveLogin(data.token, data.user);
    window.location.href = homeFor(data.user);
  } catch (err) {
    showMsg(msg, 'error', err.message);
    submit.disabled = false;
    submit.textContent = 'Log in';
  }
});

// ---- Sign in with Google (Google Identity Services)
async function onGoogleCredential(response) {
  const out = document.getElementById('google-msg');
  showMsg(out, '', '');
  try {
    const data = await api('POST', '/api/auth/google', { credential: response.credential });
    saveLogin(data.token, data.user);
    window.location.href = homeFor(data.user);
  } catch (err) {
    showMsg(out, 'error', err.message);
  }
}

async function setupGoogle() {
  const out = document.getElementById('google-msg');
  try {
    const cfg = await api('GET', '/api/config');
    if (!cfg.googleClientId) { showMsg(out, 'info', 'Google sign-in is not set up yet. Staff can use the password form below.'); return; }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = function () {
      google.accounts.id.initialize({ client_id: cfg.googleClientId, callback: onGoogleCredential });
      google.accounts.id.renderButton(document.getElementById('google-btn'), { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill', width: 300 });
    };
    script.onerror = function () { showMsg(out, 'error', 'Could not load Google sign-in. Check your connection.'); };
    document.head.appendChild(script);
  } catch (err) {
    showMsg(out, 'error', err.message);
  }
}
setupGoogle();
