// The ONLY place the browser talks to the backend.
// '' means same origin (Express serves both the API and these files).
// To host the frontend separately later, set this to the backend URL, e.g. 'https://sst-live.onrender.com'
// (the backend would then also need CORS enabled).
const API_BASE = '';

// Full URL for an API path - also used for the SSE stream (EventSource).
function apiUrl(path) {
  return API_BASE + path;
}

// fetch wrapper: returns parsed JSON or throws an Error with a readable message.
async function api(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;

  let response;
  try {
    response = await fetch(apiUrl(url), { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined });
  } catch (networkError) {
    throw new Error('Cannot reach the server. Check your internet connection and try again.');
  }

  let data = null;
  try { data = await response.json(); } catch (e) { /* empty body */ }

  if (!response.ok) {
    // Expired or invalid token on a protected call: send the user back to login.
    if (response.status === 401 && token && url.indexOf('/api/auth/login') === -1) {
      logout();
    }
    throw new Error((data && data.error) || 'Request failed (' + response.status + ')');
  }
  return data;
}
