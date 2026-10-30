/* ============================================================
   StyleMatch AI — Advanced Agentic + Client-Side Vector Search
   ============================================================ */

const MAX_UPLOAD_BYTES = 600 * 1024;

async function callMeta(endpoint, payload) {
  const r = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, payload })
  });
  if (!r.ok) throw new Error(`Proxy error ${r.status}`);
  return r.json();
}

const CATALOGUE = [];
let displayLimit = 40;

const STATE = {
  photoDataUrl: null,
  heightCm: 170,
  analysis: null,
  userMeasurements: null,
  selectedSize: 'M',
  looks: [],
  tryOnResults: [null, null, null],
  selectedLookIndex: null,
  cart: [],
};

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const stepPanels = {
  '1': $('step-photo'), '2': $('step-measure'), '4': $('step-tryon'),
  '5': $('step-cart'), 'catalogue': $('view-catalogue'), 'admin': $('view-admin')
};
const stepIndicators = document.querySelectorAll('.step');

// ---------- Helpers ----------
function toast(message, type = 'info') {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast ${type === 'error' ? 'error' : ''} show`;
  el.hidden = false;
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 250);
  }, 3500);
}

function showLoading(text = 'Working…') {
  $('loadingText').textContent = text;
  $('loadingOverlay').hidden = false;
}
function hideLoading() { $('loadingOverlay').hidden = true; }

function goToView(n) {
  Object.entries(stepPanels).forEach(([key, panel]) => {
    panel.classList.toggle('active', key === String(n));
  });
  if (n === 'catalogue' || n === 'admin') {
    document.querySelector('.steps').style.opacity = '0.3';
  } else {
    document.querySelector('.steps').style.opacity = '1';
    stepIndicators.forEach(ind => {
      const s = Number(ind.dataset.step);
      ind.classList.toggle('active', s === Number(n));
      ind.classList.toggle('done', s < Number(n));
    });
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- Client-Side Vector Math ----------
function embedText(text) {
  const DIM = 384;
  const vec = new Array(DIM).fill(0);
  const tokens = String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) { hash ^= token.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    vec[Math.abs(hash) % DIM] += (hash & 1 ? 1 : -1) * (1 + Math.log(1 + token.length));
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// ---------- Smart Size Auto-Detection ----------
function getBestSize(itemSizes, userMeasurements) {
  const sizes = Object.keys(itemSizes || {});
  if (!sizes.length) return 'M';
  const userChest = userMeasurements?.chest_cm || 95;
  const userWaist = userMeasurements?.waist_cm || 80;
  let bestSize = sizes[0];
  let minDiff = Infinity;

  for (const size of sizes) {
    const chart = itemSizes[size];
    if (!chart.chest && !chart.waist) continue;
    const parseRange = (str) => {
      if (!str) return null;
      const parts = String(str).split('-').map(Number);
      return parts.length === 2 ? (parts[0] + parts[1]) / 2 : parts[0];
    };
    const cDiff = parseRange(chart.chest) ? Math.abs(parseRange(chart.chest) - userChest) : 0;
    const wDiff = parseRange(chart.waist) ? Math.abs(parseRange(chart.waist) - userWaist) : 0;
    const totalDiff = cDiff + wDiff;
    if (totalDiff < minDiff) { minDiff = totalDiff; bestSize = size; }
  }
  return bestSize;
}

// ---------- Image Compression ----------
function fileToDataURL(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

async function compressImage(file, maxBytes = MAX_UPLOAD_BYTES) {
  const originalDataUrl = await fileToDataURL(file);
  const img = new Image();
  img.src = originalDataUrl;
  await new Promise(r => img.onload = r);

  let maxDim = 1200, quality = 0.85, dataUrl = originalDataUrl;
  for (let i = 0; i < 10; i++) {
    const canvas = document.createElement('canvas');
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      const ratio = Math.min(maxDim / width, maxDim / height);
      width = Math.round(width * ratio); height = Math.round(height * ratio);
    }
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (Math.round(dataUrl.length * 0.75) <= maxBytes) return dataUrl;
    if (quality > 0.4) quality -= 0.1; else { maxDim = Math.round(maxDim * 0.8); quality = 0.7; }
  }
  return dataUrl;
}

async function handlePhotoFile(file) {
  if (!file) return;
  try {
    showLoading('Compressing photo…');
    STATE.photoDataUrl = await compressImage(file);
    $('photoPreview').src = STATE.photoDataUrl;
    $('photoPreviewWrap').hidden = false;
    $('dropPlaceholder').hidden = true;
    validateStep1();
    toast('Photo ready.');
  } catch (err) { toast(err.message, 'error'); } finally { hideLoading(); }
}

// ---------- Step 1: Analyze ----------
function validateStep1() {
  const h = Number($('heightInput').value);
  $('analyzeBtn').disabled = !(STATE.photoDataUrl && $('consentInput').checked && h >= 120 && h <= 230);
}

async function analyzeBody() {
  STATE.heightCm = Number($('heightInput').value);
  showLoading('AI is analyzing your body…');

  try {
    const data = await callMeta('chat/completions', {
      model: 'muse-spark-1.3',
      messages: [
        { role: 'system', content: 'You are a fashion anthropologist. Return STRICT JSON matching this schema: {"gender":"female|male|non-binary", "face_shape":"oval|round|square|heart|diamond|oblong|triangle", "body_shape":"hourglass|pear|apple|rectangle|inverted_triangle|athletic", "measurements":{"shoulder_cm":number,"chest_cm":number,"waist_cm":number,"hip_cm":number,"inseam_cm":number}, "skin_undertone":"warm|cool|neutral", "confidence":number, "summary":"string"}' },
        { role: 'user', content: [
          { type: 'text', text: `Height is ${STATE.heightCm}cm. Analyze my body.` },
          { type: 'image_url', image_url: { url: STATE.photoDataUrl } }
        ]}
      ],
      temperature: 0.1, response_format: { type: 'json_object' }
    });
    
    STATE.analysis = JSON.parse(data.choices[0].message.content);
  } catch (err) {
    console.warn('Analysis failed:', err);
    toast('Using demo measurements for testing.', 'error');
    STATE.analysis = {
      gender: 'male', face_shape: 'oval', body_shape: 'athletic', skin_undertone: 'warm', confidence: 0.9, summary: 'Demo',
      measurements: { shoulder_cm: 45, chest_cm: 100, waist_cm: 85, hip_cm: 95, inseam_cm: 80 }
    };
  }

  renderMeasurementForm(STATE.analysis);
  goToView(2);
  hideLoading();
}

// ---------- Step 2: Measurements, Vibe & Size ----------
function renderMeasurementForm(a) {
  const m = a.measurements;
  $('confidenceBadge').hidden = false;
  $('confidenceBadge').textContent = `AI Confidence: ${Math.round(a.confidence * 100)}% · Undertone: ${a.skin_undertone}`;

  const dummySizes = { "XS": {"chest":"78-82"}, "S": {"chest":"82-86"}, "M": {"chest":"86-90"}, "L": {"chest":"90-96"}, "XL": {"chest":"96-102"} };
  const autoSize = getBestSize(dummySizes, m);
  STATE.selectedSize = autoSize;

  $('measurementForm').innerHTML = `
    <label class="field full"><span>Describe the look you want (AI Stylist)</span>
      <input id="mUserVibe" type="text" placeholder="e.g. 'Make me look handsome in a leather jacket'" style="border-color: var(--accent);">
    </label>
    <label class="field full"><span>Category Preference (Optional)</span><select id="mStyle">
      <option value="any">Surprise me (Best Fit)</option>
      <option value="shirt">Tops / Shirts</option>
      <option value="pants">Pants / Trousers</option>
      <option value="jacket">Jackets / Coats</option>
      <option value="dress">Dresses</option>
    </select></label>
    <label class="field"><span>Gender</span><select id="mGender">
      ${['female','male','non-binary'].map(v => `<option value="${v}" ${a.gender===v?'selected':''}>${v}</option>`).join('')}
    </select></label>
    <label class="field"><span>Body Shape</span><select id="mBodyShape">
      ${['hourglass','pear','apple','rectangle','inverted_triangle','athletic'].map(v => `<option value="${v}" ${a.body_shape===v?'selected':''}>${v}</option>`).join('')}
    </select></label>
    <label class="field"><span>Chest (cm)</span><input id="mChest" type="number" value="${m.chest_cm}"></label>
    <label class="field"><span>Waist (cm)</span><input id="mWaist" type="number" value="${m.waist_cm}"></label>
    <label class="field"><span>Hip (cm)</span><input id="mHip" type="number" value="${m.hip_cm}"></label>
    <label class="field"><span>Inseam (cm)</span><input id="mInseam" type="number" value="${m.inseam_cm}"></label>
    
    <label class="field full" style="margin-top: 8px;">
      <span>Auto-Recommended Size</span>
      <select id="mSize" style="border-color: var(--accent); font-weight: bold;">
        ${['XS','S','M','L','XL'].map(v => `<option value="${v}" ${autoSize===v?'selected':''}>${v}</option>`).join('')}
      </select>
    </label>
  `;

  $('mSize').addEventListener('change', (e) => {
    STATE.selectedSize = e.target.value;
  });
}

// ---------- Agentic Recommendation Engine ----------
async function generateThreeLooks() {
  if (CATALOGUE.length === 0) return toast('Catalogue is still loading...', 'error');

  const userVibe = $('mUserVibe').value.trim();
  const profile = {
    gender: $('mGender').value,
    body_shape: $('mBodyShape').value,
    style: $('mStyle').value,
    undertone: STATE.analysis.skin_undertone || 'neutral',
    measurements: { 
      chest_cm: Number($('mChest').value), 
      waist_cm: Number($('mWaist').value),
      hip_cm: Number($('mHip').value)
    }
  };
  STATE.userMeasurements = profile.measurements;

  showLoading('Agent 1: Retrieving best fits…');
  
  let pool = CATALOGUE.filter(c => c.gender === profile.gender);
  if (profile.style !== 'any') {
    const styledPool = pool.filter(c => c.category === profile.style);
    if (styledPool.length >= 3) pool = styledPool;
  }

  const queryText = `${profile.gender} ${profile.body_shape} ${profile.undertone} ${profile.style} ${userVibe}`;
  const queryVec = embedText(queryText);

  const scoredItems = pool.map(item => {
    let score = 0;
    const itemVec = embedText(`${item.name} ${item.category} ${item.style} ${item.description} ${item.colour}`);
    score += cosineSimilarity(queryVec, itemVec) * 2.0;

    const col = (item.colour || '').toLowerCase();
    if (profile.undertone === 'warm') {
      if (['camel','rust','olive','gold','beige','brown','burgundy','coral','mustard','khaki'].some(c => col.includes(c))) score += 0.5;
    } else if (profile.undertone === 'cool') {
      if (['navy','emerald','crimson','blue','silver','charcoal','black','white','ruby','cobalt'].some(c => col.includes(c))) score += 0.5;
    } else {
      score += 0.2;
    }

    const shape = profile.body_shape;
    if (shape === 'pear' && ['dress', 'jacket'].includes(item.category)) score += 0.6;
    if (shape === 'apple' && ['shirt', 'dress'].includes(item.category)) score += 0.6;
    if (shape === 'athletic' && item.style.includes('tailored')) score += 0.5;
    if (shape === 'hourglass' && item.style.includes('wrap')) score += 0.6;

    return { item, score, category: item.category };
  }).sort((a, b) => b.score - a.score);

  const tops = scoredItems.filter(i => i.category === 'shirt').map(i => i.item);
  const jackets = scoredItems.filter(i => i.category === 'jacket').map(i => i.item);
  const bottoms = scoredItems.filter(i => i.category === 'pants' || i.category === 'skirt').map(i => i.item);
  const dresses = scoredItems.filter(i => i.category === 'dress').map(i => i.item);

  const looks = [];

  if (profile.gender === 'female' && dresses.length > 0) {
    if (dresses[0]) looks.push([dresses[0]]);
    if (dresses[1]) looks.push([dresses[1]]);
    if (tops.length && bottoms.length) looks.push([tops[0], bottoms[0]]);
  } else {
    for (let i = 0; i < 3; i++) {
      const t = tops[i] || tops[0];
      const b = bottoms[i] || bottoms[0];
      const j = jackets[i]; 

      if (t && b) {
        let outfit = [t, b];
        if (j && i === 0) outfit.unshift(j);
        looks.push(outfit);
      } else if (t) looks.push([t]);
      else if (b) looks.push([b]);
    }
  }

  while (looks.length < 3) {
    const fallback = scoredItems[looks.length]?.item || scoredItems[0]?.item;
    if (fallback) looks.push([fallback]);
    else break;
  }

  STATE.looks = looks.slice(0, 3);
  STATE.tryOnResults = [null, null, null];
  STATE.selectedLookIndex = null;
  $('lookProducts').hidden = true;
  $('downloadResult').hidden = true;

  // HACKATHON REQUIREMENT: Generate Agentic Reasoning
  generateStylistNotes(profile, STATE.looks);

  renderTryOnSkeletons();
  goToView(4);
  hideLoading();

  STATE.looks.forEach(async (lookItems, index) => {
    try {
      const url = await generateLookPhoto(lookItems, userVibe, profile);
      STATE.tryOnResults[index] = url;
      updateTryOnSlot(index, url, lookItems);
    } catch (err) {
      console.warn(`Look ${index} failed:`, err);
      STATE.tryOnResults[index] = STATE.photoDataUrl;
      updateTryOnSlot(index, STATE.photoDataUrl, lookItems);
    }
  });
}

// ---------- AI Agent: Stylist Reasoning ----------
async function generateStylistNotes(profile, looks) {
  const notesBox = $('stylistNotes');
  const notesText = $('stylistNotesText');
  notesBox.hidden = false;
  notesText.textContent = 'Agent is analyzing why these shapes flatter your silhouette...';

  const itemsList = looks.flat().map(i => i.name).join(', ');
  const prompt = `You are an expert fashion stylist. The user has a ${profile.body_shape} body shape and a ${profile.undertone} skin undertone. 
  The AI recommended these items: ${itemsList}. 
  Write a 2-sentence, highly professional explanation of WHY these specific outfits flatter their body shape and complement their skin tone. Be specific about proportions and colors.`;

  try {
    const data = await callMeta('chat/completions', {
      model: 'muse-spark-1.3',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      max_tokens: 100
    });
    
    notesText.textContent = `"${data.choices[0].message.content.trim()}"`;
  } catch (err) {
    notesText.textContent = `"These pieces are curated to balance your ${profile.body_shape} silhouette, using colors that perfectly match your ${profile.undertone} undertone."`;
  }
}

// ---------- Image Generation ----------
async function generateLookPhoto(items, userVibe, profile) {
  try {
    const images = [{ image_url: STATE.photoDataUrl }];
    const itemDescriptions = items.map(i => `${i.colour} ${i.category}`).join(' and ');
    
    for (const item of items) {
      const res = await fetch(item.image_url);
      const blob = await res.blob();
      const b64 = await new Promise(r => {
        const fr = new FileReader();
        fr.onload = () => r(fr.result);
        fr.readAsDataURL(blob);
      });
      images.push({ image_url: b64 });
    }

    const prompt = `STRICT FACE AND CLOTHING LOCK MODE.
Image 1 is the base person (${profile.gender}).
Image 2 through ${items.length + 1} are the exact garments to wear.
TASK: Create a breathtaking, professional, ultra-high-resolution fashion editorial portrait of the person from Image 1 wearing the EXACT garments shown in the subsequent images (${itemDescriptions}).
CRITICAL INSTRUCTIONS:
1. GENDER LOCK: The person in Image 1 is a ${profile.gender}. Do NOT change their gender or facial identity.
2. GARMENT LOCK: You MUST use the exact colors, textures, and cuts from the provided garment images.
3. LIGHTING & QUALITY: Ignore the original image lighting. Re-render the skin with flawless, photorealistic texture. Use stunning cinematic studio lighting. 8k magazine cover quality.
4. USER VIBE: The user specifically requested: "${userVibe || 'high fashion editorial'}".
NEGATIVE PROMPTS: No distorted hands, no extra limbs, no low-resolution faces, no flat lighting, no original background.`;

    const data = await callMeta('images/edits', {
      model: 'muse-image-1.0',
      prompt: prompt,
      images: images,
      size: '1024x1024', n: 1
    });

    const url = data.data?.[0]?.url
      || (data.data?.[0]?.b64_json ? `data:image/png;base64,${data.data[0].b64_json}` : null);
    if (url) return url;
    
  } catch (err) {
    console.warn('AI gen failed:', err);
  }
  return STATE.photoDataUrl;
}

// ---------- Step 4: render looks ----------
function renderTryOnSkeletons() {
  $('tryonGrid').innerHTML = [0, 1, 2].map(i => `
    <div class="result-card" id="result-${i}" style="display:flex; align-items:center; justify-content:center; background: var(--card-2); min-height: 380px;">
      <div class="spinner" style="width: 30px; height: 30px; border-width: 3px;"></div>
    </div>
  `).join('');
}

function updateTryOnSlot(index, url, items) {
  const el = document.getElementById(`result-${index}`);
  if (!el) return;
  el.innerHTML = `
    <img src="${url}" alt="Look ${index + 1}" />
    <div class="look-label">Outfit ${index + 1}</div>
  `;
  el.onclick = () => window.selectLook(index);
}

window.selectLook = (index) => {
  STATE.selectedLookIndex = index;
  document.querySelectorAll('.result-card').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById(`result-${index}`);
  if (el) el.classList.add('selected');

  $('downloadResult').href = STATE.tryOnResults[index];
  $('downloadResult').hidden = false;

  renderLookProducts(index);
};

function renderLookProducts(index) {
  const items = STATE.looks[index];
  if (!items) return;

  const html = items.map(item => {
    return `
      <div class="look-product">
        <img src="${item.image_url}" alt="${item.name}" />
        <div class="look-product-info">
          <h4>${item.name}</h4>
          <p>${item.category} · ${item.colour} · Size ${STATE.selectedSize}</p>
          <strong>$${item.price.toFixed(2)}</strong>
        </div>
        <button class="primary-btn small" id="add-btn-${item.id}" onclick="window.addToCart(${index}, '${item.id}')">Add</button>
      </div>
    `;
  }).join('');

  $('lookProducts').innerHTML = `
    <div class="look-products-header">Products in this outfit</div>
    ${html}
  `;
  $('lookProducts').hidden = false;
}

// ---------- CART LOGIC (BUG FIXED) ----------
window.addToCart = (lookIndex, itemId) => {
  const look = STATE.looks[lookIndex];
  const item = look.find(i => i.id === itemId);
  if (!item) return;
  
  const exists = STATE.cart.find(c => c.id === item.id);
  if (exists) {
    toast('Item already in cart', 'info');
    return;
  }

  STATE.cart.push({
    id: item.id, name: item.name, price: item.price,
    image_url: item.image_url, size: STATE.selectedSize, qty: 1,
    generatedUrl: STATE.tryOnResults[lookIndex]
  });

  renderCart();
  toast(`${item.name} added to cart.`);
  
  // Visual update instead of redirecting the user
  const btn = document.getElementById(`add-btn-${item.id}`);
  if (btn) {
    btn.textContent = '✓ Added';
    btn.style.background = 'var(--success)';
    btn.style.color = '#000';
    btn.disabled = true;
  }
};

// ---------- Step 5: Cart ----------
function renderCart() {
  const badge = $('cartBadge');
  if (badge) {
    badge.textContent = STATE.cart.length;
    badge.hidden = STATE.cart.length === 0;
  }

  if (!STATE.cart.length) {
    $('cartItems').innerHTML = '';
    $('cartSummary').hidden = true;
    $('cartEmpty').hidden = false;
    return;
  }
  $('cartEmpty').hidden = true; $('cartSummary').hidden = false;
  $('cartItems').innerHTML = STATE.cart.map((item, i) => `
    <div class="cart-item">
      <img src="${item.generatedUrl || item.image_url}" />
      <div class="cart-item-info">
        <h4>${item.name}</h4><p>Size: ${item.size}</p><strong>$${item.price.toFixed(2)}</strong>
      </div>
      <button class="remove-item" onclick="window.removeCart(${i})">×</button>
    </div>
  `).join('');
  const total = STATE.cart.reduce((s, i) => s + i.price, 0);
  $('cartSubtotal').textContent = `$${total.toFixed(2)}`;
  $('cartTotal').textContent = `$${total.toFixed(2)}`;
}
window.removeCart = (i) => { STATE.cart.splice(i, 1); renderCart(); };

function checkout() {
  STATE.cart = []; renderCart();
  $('cartItems').innerHTML = `<div class="empty-state"><div style="font-size:42px;">✓</div><h3>Order confirmed!</h3><p>Demo checkout complete.</p></div>`;
  $('cartSummary').hidden = true;
}

// ---------- CATALOGUE VIEW ----------
function renderCatalogue() {
  const itemsToShow = CATALOGUE.slice(0, displayLimit);
  $('catalogueGrid').innerHTML = itemsToShow.map(item => `
    <div class="cat-card">
      <img src="${item.image_url}" alt="${item.name}" loading="lazy" />
      <div class="cat-body">
        <h4>${item.name}</h4>
        <span>${item.gender} · ${item.category}</span>
        <strong>$${item.price}</strong>
      </div>
    </div>
  `).join('');

  const loadMoreBtn = $('loadMoreBtn');
  if (loadMoreBtn) {
    if (displayLimit < CATALOGUE.length) {
      loadMoreBtn.hidden = false;
      loadMoreBtn.textContent = `Load More (${displayLimit} of ${CATALOGUE.length} shown)`;
    } else {
      loadMoreBtn.hidden = true;
    }
  }
}

// ---------- ADMIN UPLOAD LOGIC ----------
async function saveProduct() {
  const name = $('addName').value;
  const price = Number($('addPrice').value);
  const gender = $('addGender').value;
  const category = $('addCategory').value;
  const colour = $('addColour').value;
  const style = $('addStyle').value;
  const imageUrl = $('addImage').value;
  const description = $('addDesc').value;

  if (!name || !price || !imageUrl) return toast('Name, Price, and Image URL are required.', 'error');

  showLoading('Saving to Firebase…');
  try {
    const { db, collection, addDoc } = window.FirebaseDB;
    const newItem = {
      name, price, gender, category, colour, style, image_url: imageUrl, description,
      sizes: gender === 'male'
        ? { "S": {"chest": "86-91"}, "M": {"chest": "91-97"}, "L": {"chest": "97-102"}, "XL": {"chest": "102-107"} }
        : { "XS": {"chest": "78-82"}, "S": {"chest": "82-86"}, "M": {"chest": "86-90"}, "L": {"chest": "90-96"} }
    };

    const docRef = await addDoc(collection(db, 'garments_v2'), newItem);
    newItem.id = docRef.id;
    CATALOGUE.unshift(newItem);
    toast('Product added successfully to Firebase!');
    goToView('catalogue');
  } catch (err) {
    console.error(err);
    toast('Failed to save: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ---------- FIREBASE LOADING ----------
async function loadCatalogueFromFirebase() {
  showLoading('Connecting to Firestore…');
  const { db, collection, getDocs, doc, writeBatch } = window.FirebaseDB;

  try {
    const garmentsRef = collection(db, 'garments_v2');
    const snapshot = await getDocs(garmentsRef);

    if (snapshot.empty) {
      $('loadingText').textContent = 'Loading 50 accurate items (first time only)…';

      const res = await fetch('catalogue.json');
      const baseItems = await res.json();
      
      const generatedItems = baseItems.map((item, i) => ({
        ...item,
        id: `gen_${item.id}_${Date.now()}`
      }));
      
      generatedItems.sort(() => Math.random() - 0.5);

      const batch = writeBatch(db);
      generatedItems.forEach(item => {
        const docRef = doc(garmentsRef);
        item.id = docRef.id;
        batch.set(docRef, item);
      });
      await batch.commit();
      
      CATALOGUE.push(...generatedItems);
      toast('Successfully loaded 50 accurate items!');
    } else {
      snapshot.forEach(doc => CATALOGUE.push({ id: doc.id, ...doc.data() }));
    }
    renderCatalogue();
  } catch (e) {
    console.error("Firebase error:", e);
    toast("Firebase failed. Check Rules!", "error");
  } finally {
    hideLoading();
  }
}

// ---------- Events ----------
$('photoInput').addEventListener('change', e => handlePhotoFile(e.target.files[0]));
$('heightInput').addEventListener('input', validateStep1);
$('consentInput').addEventListener('change', validateStep1);
$('analyzeBtn').addEventListener('click', analyzeBody);
$('generateLooksBtn').addEventListener('click', generateThreeLooks);
$('checkoutBtn').addEventListener('click', checkout);
$('catalogueBtn').addEventListener('click', () => goToView('catalogue'));
$('backFromCatalogue').addEventListener('click', () => goToView(1));
$('backToPhoto').addEventListener('click', () => goToView(1));
$('backToMeasure').addEventListener('click', () => goToView(2));
$('cartBtn').addEventListener('click', () => { renderCart(); goToView(5); });
$('startOverBtn').addEventListener('click', () => location.reload());

if ($('adminBtn')) $('adminBtn').addEventListener('click', () => goToView('admin'));
if ($('backFromAdmin')) $('backFromAdmin').addEventListener('click', () => goToView('catalogue'));
if ($('saveProductBtn')) $('saveProductBtn').addEventListener('click', saveProduct);

// ---------- Init ----------
loadCatalogueFromFirebase();
goToView(1);