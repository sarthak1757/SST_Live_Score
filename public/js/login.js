const form = document.getElementById('login-form');
const msg = document.getElementById('msg');
const submit = document.getElementById('submit');

if (getToken() && getUser()) window.location.href = '/dashboard.html';

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
    window.location.href = '/dashboard.html';
  } catch (err) {
    showMsg(msg, 'error', err.message);
    submit.disabled = false;
    submit.textContent = 'Log in';
  }
});
