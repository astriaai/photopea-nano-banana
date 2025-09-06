function initializeModels() {
  const select = document.getElementById('model-select');
  if (!select || !window.MODEL_URLS) return;
  // Clear existing options
  select.innerHTML = '';
  // Populate from MODEL_URLS
  Object.entries(window.MODEL_URLS).forEach(([name, url], index) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (index === 0) opt.selected = true;
    select.appendChild(opt);
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initializeModels();
});

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

async function getImageBlob() {
  const imageBuffer = await photopeaContext.invokeAsTask('exportAllLayers', 'PNG');
  let bounds;
  try {
    const selectionStr = await photopeaContext.invokeAsTask('getSelectionBound');
    bounds = JSON.parse(selectionStr);
  } catch (e) {
    console.warn('getSelectionBound failed, falling back to whole picture. Error:', e);
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
  return [imageBlob, bounds];
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

async function pasteBackResponseImage(serverPrompt, bounds, prompt_text) {
  const imageUrl = serverPrompt.images[0];
  document.getElementById('preview-image').src = imageUrl;
  console.log('resizing back to', boundWidth(bounds), boundHeight(bounds), 'bounds', bounds)
  await photopeaContext.pasteImageOnPhotopea(
    await resizeImage(imageUrl, boundWidth(bounds), boundHeight(bounds)),
    bounds,
    prompt_text.slice(0, 10)
  )
}


document.getElementById('prompt-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isProcessing) return; // Prevent duplicate submissions
  isProcessing = true;
  toggleProcessing(true);
  let id = null;
  try {
    const form = new FormData();
    const [imageBlob, bounds] = await getImageBlob();
    const url = document.getElementById('model-select').value
    const prompt_text = document.getElementById('prompt-input').value;
    const serverPrompt = await createPromptByModelName(url, {
      text: prompt_text,
      input_image: imageBlob,
    })
    await pasteBackResponseImage(serverPrompt, bounds, prompt_text)
  } catch (e) {
    if(e.message === 'Request failed with status code 401') {
      signout()
    }
    console.error(e);
    alert(e?.message || 'An unexpected error occurred.');
  } finally {
    if (id) {
      // await axiosInstance.delete(`prompts/${id}`);
    }
    toggleProcessing(false);
    isProcessing = false;
  }
});
