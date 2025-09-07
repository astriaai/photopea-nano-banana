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
  if(payload['input_images'] && payload['input_images'].length > 0) {
    const base_tune_id = MODEL_URLS[name]
    return createTune(base_tune_id, payload)
  }
  const url = `/tunes/${MODEL_URLS[name]}/prompts`;
  return createPrompt(url, payload)
}

async function createTune(base_tune_id, payload) {
  let input_images = payload['input_images'];
  delete payload['input_images'];
  const tunePayload = {
    name: 'subject',
    // add timestamp to avoid idempodent requests
    title: 'subject ' + new Date().getTime(),
    model_type: 'faceid',
    base_tune_id: base_tune_id,
    images: input_images,
    // prompts_attributes: [
    //   payload
    // ]
  }
  const formData = appendToFormData(tunePayload, 'tune')
  try {
    const response = await axiosInstance.post('/tunes', formData);
    const tuneData = response.data;
    // if(!tuneData.prompts || tuneData.prompts.length == 0) {
    //   throw new Error("Failed creating prompts");
    // }
    // return await pollPrompt(tuneData.prompts[0].id);

    const responsePrompt = await axiosInstance.post(`/tunes/${tuneData.id}/prompts`, appendToFormData(payload, 'prompt'));
    const processedPrompt =  await pollPrompt(responsePrompt.data.id);
    processedPrompt.tunes = [tuneData];
    return processedPrompt;
  } catch (err) {
    if (err?.response?.status === 422) {
      throw new Error(JSON.stringify(err.response.data));
    }
    throw err;
  }
}

function appendToFormData(payload, prefix, formData) {
  if(!formData) {
    formData = new FormData();
  }
  for (const [key, value] of Object.entries(payload)) {
    if(value instanceof FileList) {
      for (let i = 0; i < value.length; i++) {
        formData.append(`${prefix}[${key}][${i}]`, value[i]);
      }
    } else if(value instanceof Blob) {
      // the Photopea image is PNG exported
      formData.append(`${prefix}[${key}]`, value, 'image.png');
    } else if(typeof value === 'object') {
      if(Array.isArray(value)) {
        value.forEach((v, i) => appendToFormData(v, `${prefix}[${key}][]`, formData))
      } else {
        appendToFormData(value, `${prefix}[${key}]`, formData);
      }
    } else {
      formData.append(`${prefix}[${key}]`, value);
    }
  }
  return formData;
}

async function pollPrompt(id) {
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

async function createPrompt(url, payload) {
  const formData = appendToFormData(payload, 'prompt');
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
  return await pollPrompt(id);
}
