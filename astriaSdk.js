let isDev = false; // location.host.includes('localhost');
const axiosInstance = axios.create({
  baseURL: isDev ? 'http://localhost:3000/' : 'https://api.astria.ai/',
  headers: {
    'Accept': 'application/json',
  }
});
const GEMINI_URL = isDev ? 'tunes/33/prompts' : 'tunes/3159068/prompts';

const MODEL_URLS = {
  "Gemini 2.5 Nano Banana": isDev ? '33' : '3159068',
  "Upscale": isDev ? '2' : '1504944',
  "Remove background": isDev ? '2' : '1504944',
  "Flux1 Dev": isDev ? '2' : '1504944',
  "Flux Kontext Dev": isDev ? '1' : '3159068',
  "Flux Kontext Pro": isDev ? '1' : '2739411',
  "Flux Kontext Max": isDev ? '1' : '2739410',
}

const OVERRIDE_PAYLOAD = {
  "Upscale": {
    "text": "",
    "denoising_strength": 0,
    "super_resolution": true,
  },
  "Remove background": {
    "text": "--remove_background",
    "denoising_strength": 0,
  }
}
window.MODEL_URLS = MODEL_URLS;

function addAuthHeaders(apiKey) {
  axiosInstance.interceptors.request.use(function (config) {
    config.headers.Authorization =  'Bearer ' + apiKey;
    return config;
  });
}

async function createPromptByModelName(name, payload) {
  if (OVERRIDE_PAYLOAD[name]) {
    payload = {...payload, ...OVERRIDE_PAYLOAD[name]};
  }
  if(!payload['num_images']) {
    payload['num_images'] = 1
  }
  const url = `/tunes/${MODEL_URLS[name]}/prompts`;
  return createPrompt(url, payload)
}

async function createPrompt(url, payload) {
  const formData = new FormData();
  // iterate payload and add to formData
  for (const [key, value] of Object.entries(payload)) {
    if(key === 'input_image') {
      formData.append('prompt[input_image]', value, 'image.png')
    } else {
      formData.append(`prompt[${key}]`, value);
    }
  }

  let id;
  try {
    const response = await axiosInstance.post(url, formData);
    id = response.data.id;
  } catch (err) {
    if (err?.response?.status === 422) {
      throw new Error(JSON.stringify(err.response.data));
    }
    throw err;
  }

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
