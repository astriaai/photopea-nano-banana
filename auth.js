LOCAL_STORAGE_API_KEY = 'astriaApiKey'
function initializeAuth() {
  let apiKey = localStorage.getItem(LOCAL_STORAGE_API_KEY);
  document.getElementById('auth').classList.toggle('hidden', !!apiKey);
  document.getElementById('signout').classList.toggle('hidden', !apiKey);
  document.getElementById('main').classList.toggle('hidden', !apiKey);
  if (apiKey) {
    addAuthHeaders(apiKey);
  }
}

function signout() {
  localStorage.removeItem(LOCAL_STORAGE_API_KEY);
  initializeAuth();
}

function submitAuth() {
  const apiKey = document.getElementById('api-key-input').value;
  if (apiKey) {
    localStorage.setItem(LOCAL_STORAGE_API_KEY, apiKey);
    initializeAuth();
  }
}
initializeAuth()

