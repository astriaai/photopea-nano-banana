let isDev = location.host.includes('localhost');
const axiosInstance = axios.create({
  baseURL: isDev ? 'http://localhost:3000/' : 'https://api.astria.ai/',
  headers: {
    'Accept': 'application/json',
  }
});
const GEMINI_URL = isDev ? 'tunes/33/prompts' : 'tunes/3159068/prompts';

const MODEL_URLS = {
  "Flux1 Dev": isDev ? 'tunes/2/prompts' : 'tunes/1504944/prompts',
  "Flux Kontext Dev": isDev ? 'tunes/1/prompts' : 'tunes/3159068/prompts',
  "Flux Kontext Pro": isDev ? 'tunes/1/prompts' : 'tunes/2739411/prompts',
  "Flux Kontext Max": isDev ? 'tunes/1/prompts' : 'tunes/2739410/prompts',
  "Gemini 2.5 Nano Banana": isDev ? 'tunes/33/prompts' : 'tunes/3159068/prompts',
}

function addAuthHeaders(apiKey) {
  axiosInstance.interceptors.request.use(function (config) {
    config.headers.Authorization =  'Bearer ' + apiKey;
    return config;
  });
}

async function createPrompt(url, payload) {
  const response = await axiosInstance.post(url, payload)
  id = response.data.id;
  for (let i = 0; i < 60; i++) {
    const pollResponse = await axiosInstance.get(`prompts/${id}`)
    const data = pollResponse.data;
    if (data.trained_at) {
      if (data.user_error || data.images.length === 0) {
        throw new Error(data.user_error || 'Unknown error');
      }
      return data;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Processing Timeout');
}
