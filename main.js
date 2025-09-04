const axiosInstance = axios.create({
  baseURL: location.host.includes('localhost') ? 'http://localhost:3000/' : 'https://api.astria.ai/',
  headers: {
    'Accept': 'application/json',
  }
});
const GEMINI_URL = location.host.includes('localhost') ? 'tunes/33/prompts' : 'tunes/3159068/prompts';

async function finalizeResponse(serverPrompt, bounds, prompt) {
  if (serverPrompt.user_error || serverPrompt.images.length === 0) {
    alert(serverPrompt.user_error || "Unknown error");
    return;
  }
  const imageUrl = serverPrompt.images[0];
  document.getElementById('preview-image').src = imageUrl;
  console.log('resizing back to', boundWidth(bounds), boundHeight(bounds), 'bounds', bounds)
  await photopeaContext.pasteImageOnPhotopea(
    await resizeImage(imageUrl, boundWidth(bounds), boundHeight(bounds)),
    bounds,
    prompt.slice(0, 10)
  )
}

let authHeadersInitialized = false;
function initAuthHeaders() {
  if (authHeadersInitialized) {
    return;
  }
  let apiKey = localStorage.getItem('astriaApiKey');
  if (!apiKey) {
    apiKey = prompt('Astria API KEY');
    if (apiKey) {
      localStorage.setItem('astriaApiKey', apiKey);
    } else {
      throw new Error('API key required');
    }
  }
  axiosInstance.interceptors.request.use(function (config) {
    console.log('adding auth header');
    config.headers.Authorization =  'Bearer ' + apiKey;
    return config;
  });
  authHeadersInitialized = true;

}

function dataURItoBlob(dataURI) {
  // convert base64 to raw binary data held in a string
  // doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
  var byteString = atob(dataURI.split(',')[1]);

  // separate out the mime component
  var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0]

  // write the bytes of the string to an ArrayBuffer
  var ab = new ArrayBuffer(byteString.length);

  // create a view into the buffer
  var ia = new Uint8Array(ab);

  // set the bytes of the buffer to the correct values
  for (var i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }

  // write the ArrayBuffer to a blob, and you're done
  var blob = new Blob([ab], {type: mimeString});
  return blob;

}

// Toggle spinner visibility and disable/enable the submit button during processing
function toggleProcessing(isProcessing) {
  const spinner = document.getElementById('spinner');
  const form = document.getElementById('prompt-form');
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
  if (spinner) spinner.classList.toggle('hidden', !isProcessing);
  if (submitBtn) submitBtn.disabled = isProcessing;
}

let isProcessing = false;

document.getElementById('prompt-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isProcessing) return; // Prevent duplicate submissions
  isProcessing = true;
  toggleProcessing(true);
  try {
    initAuthHeaders();
    const prompt_text = document.getElementById('prompt-input').value;
    const imageBuffer = await photopeaContext.invokeAsTask('exportAllLayers', 'PNG');
    let bounds;
    try {
      const selectionStr = await photopeaContext.invokeAsTask('getSelectionBound');
      bounds = JSON.parse(selectionStr);
    } catch (e) {
      console.warn('getSelectionBound failed, falling back to whole picture. Error:', e);
      // Derive full-image bounds from exported buffer size
      try {
        const imgObj = await loadImage(imageBuffer);
        bounds = [0, 0, imgObj.width, imgObj.height];
      } catch (e2) {
        console.error('Failed to determine image size from buffer for fallback:', e2);
        throw new Error('Unable to determine bounds');
      }
    }

    const croppedPayloadImage = await cropImage(imageBuffer, bounds);
    document.getElementById('preview-image').src = croppedPayloadImage.dataURL
    const imageBlob = dataURItoBlob(croppedPayloadImage.dataURL);
    const form = new FormData();
    form.append('prompt[text]', prompt_text);
    form.append('prompt[num_images]', 1);
    form.append('prompt[input_image]', imageBlob, 'image.png')
    const response = await axiosInstance.post(GEMINI_URL, form)
    const id = response.data.id;
    for (let i = 0; i < 60; i++) {
      const pollResponse = await axiosInstance.get(`prompts/${id}`)
      if (pollResponse.data.trained_at) {
        await finalizeResponse(pollResponse.data, bounds, prompt_text)
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    alert('Processing timed out. Please try again.');
  } catch (e) {
    console.error(e);
    alert(e?.message || 'An unexpected error occurred.');
  } finally {
    toggleProcessing(false);
    isProcessing = false;
  }
});
