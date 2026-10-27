const form = document.getElementById('signup-form');
const msg = document.getElementById('msg');
const submit = document.getElementById('submit');

if (getToken() && getUser()) window.location.href = homeFor(getUser());

form.addEventListener('submit', async function (e) {
  e.preventDefault();
  showMsg(msg, '', '');
  submit.disabled = true;
  submit.textContent = 'Creating account...';
  try {
    const data = await api('POST', '/api/auth/signup', {
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
    });
    saveLogin(data.token, data.user);
    window.location.href = '/feed.html';
  } catch (err) {
    showMsg(msg, 'error', err.message);
    submit.disabled = false;
    submit.textContent = 'Create account';
  }
});
