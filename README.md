# StyleMatch AI — Virtual Try-On Store
**Meta Global AI Developer Hackathon 2026 Submission**

A small, finish-able virtual try-on store: upload a full-body photo → AI estimates body measurements (ranges) → finds 3 dresses that fit & suit you → generates a realistic try-on → add to cart.

> **Scope intentionally small** to ship before **Nov 4, 9:00 PM ET**. No real payment, no stored photos, no heavy ML in browser.

---

## ✨ Live Demo

- **Vercel:** `https://your-vercel-url.vercel.app` (deploy steps below)
- **Local:** `npx serve .` then open `http://localhost:3000`

---

## 📁 File Structure

```
/
├── index.html                # Single-page app, 5 steps
├── style.css             # Dark theme, CSS variables, mobile-first responsive
├── 
│   ├── app.js                # Orchestrates upload → measure → match → try-on → cart
│   ├── compress.js           # Browser-side image compression + overlay fallback
│   ├── api.js                # Proxy helper + JSON extract & validation + retry
│   ├── matching.js           # Size-fit / shape / colour scoring
│   └── tryon.js              # Try-on generation + fallback logic
├── api/proxy.js              # One Vercel serverless function (export default handler)
├── catalogue.json       # 30 dresses with size charts, images, buy_url
├── public/dresses/           # ← Put YOUR current dress photos here (see its README)
├── vercel.json               # Rewrites & headers
├── .env.example              # Required env vars
└── README.md
```

---

## 🧰 Tech Stack (per brief)

- **Frontend:** plain HTML, CSS, JS ES modules — **no framework, no build step**
- **Backend:** one serverless function `api/proxy.js` on Vercel (`export default function handler(req,res)`)
- **Styling:** dark theme with CSS variables, fully responsive (phone, tablet, laptop, large screens), mobile-first
- **Phone-friendly:** files kept small for coding on Android (Termux + Acode)

---

## 🔐 Environment Variables

Create `.env` (local) or set in Vercel Dashboard → Settings → Environment Variables:

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `META_API_KEY` | ✅ | — | Bearer token for `https://api.meta.ai/v1/responses` |
| `META_MODEL` | — | `muse-wonder-1.0` | Vision model for measurement (e.g. `muse-spark`, `muse-wonder-1.0`) |
| `META_IMAGE_MODEL` | — | `muse-image-1.0` | Try-on image generation model |
| `META_SAM_MODEL` | — | `sam-3.1` | Segmentation model (SAM 3.1) |

> API key lives **only in `META_API_KEY` on the server**. Frontend never sees it.

**Meta Model API (must follow exactly):**
```
POST https://api.meta.ai/v1/responses
Header: Authorization: Bearer ${process.env.META_API_KEY}
Body: { model, input: [{ role: "user", content: [{ type: "input_text", text }, { type: "input_image", image_url }] }], reasoning: { effort: "low" }, stream: false }
Read: data.output.find(x => x.type === "message").content[0].text
```
We use vision for body/face analysis, SAM 3.1 to segment the person, and Muse Image to generate the try-on photo. **If an endpoint or model name is unclear in Meta's docs, we state it in a comment and fall back to the vision model + simple overlay of the catalogue image on the user's photo** — see `api/proxy.js` lines 36-52 and `tryon.js`.

---

## 🚀 Setup, Run & Deploy

### 1. Clone
```bash
git clone https://github.com/your/stylematch-ai.git
cd stylematch-ai
```

### 2. Local (no build)
```bash
# No npm needed — but for local serving:
npx serve .
# open http://localhost:3000
# API will 500 without key — demo falls back to mock measurements so UI still works
```

To test with real API locally:
```bash
npm i -g vercel   # if you have npm
vercel dev        # reads .env, serves api/proxy.js
# or set env and run with node: node --env-file=.env api/proxy.js (needs adapt)
```

Create `.env` (or `.env.local` for `vercel dev`):
```
META_API_KEY=sk_meta_xxxx
META_MODEL=muse-wonder-1.0
```

### 3. Deploy to Vercel
```bash
vercel --prod
# or connect GitHub repo at vercel.com/new
```
Then in **Vercel Dashboard → your project → Settings → Environment Variables** add `META_API_KEY` (and optionally `META_MODEL`). Redeploy.

### 4. Use your own dresses
- Drop photos into `public/dresses/` (keep each <600KB, or compress in browser)
- Update `catalogue.json` `image` to `public/dresses/your.jpg` or keep Unsplash URLs

---

## 🖼️ Third-Party Assets & Where to Get Them

| Asset | Source | License | Notes |
|-------|--------|---------|-------|
| Dress images (30) | Unsplash — search `dress`, `fashion`, `satin dress` | Unsplash License (free for demo) | URLs in `catalogue.json`; replace with your own in `public/dresses/` |
| Fonts | System stack (Inter, Segoe UI) | — | No download needed |
| Icons | Unicode emoji (👗, ✨, 🛒) | — | — |

All code needed to run demo is in public repo. No private assets.

---

## 🔄 Features (built in order)

1. **Upload:** full-body photo, browser-side compression to <600KB, adult-only consent checkbox, tips list (standing straight, full body, plain background)
2. **Measurement:** user enters height to calibrate. Model returns strict JSON `{ body_shape, face_shape, shoulder_width_cm, chest_cm, waist_cm, hip_cm, arm_length_cm, inseam_cm, confidence }` with ranges (e.g. `[88,92]`). Validated + retried once. User can edit every number.
3. **Catalogue:** `catalogue.json` — 30 dresses (id, name, colour, style, fit, neckline, length, price, sizes with size chart in cm, image, buy_url)
4. **Matching:** score each dress on size-fit (from size chart), body-shape suitability, colour for chosen skin tone (swatches). Show top 3 with match %, recommended size, one-line respectful reason.
5. **Try-on:** generate photo of user wearing chosen dress, keeping face/pose/background. Side-by-side original vs result with loading state. SAM 3.1 + Muse Image; overlay fallback if endpoint unclear.
6. **Buy:** Add to cart + mock checkout (no real payment) with size & price summary.

---

## 🛡️ Safety & Privacy

- **Never store photos/measurements** — process in memory only; stated in UI hero & footer
- **Respectful wording** — "fits you well", "colours that suit you", never judgemental
- **Clear errors:** bad photo, no person detected, API failure, invalid JSON, rate limit (10/min), 600KB limit

---

## ✅ What is Finished vs Intentionally Left Out

**Finished:**
- All 6 features end-to-end, responsive dark UI, compression, validation, retry, editable measurements, swatch filtering, scoring, side-by-side try-on, fallback overlay, cart, mock checkout
- Rate limiting + 600KB guard + key-only-on-server
- Demo-mode fallback so judges can click through without API key

**Intentionally left out (to keep scope small):**
- No real payment (Stripe/PayPal)
- No auth / user accounts / DB
- No persistent storage (by design)
- No advanced SAM mask editing UI (proxy ready, client fallback)
- No video try-on
- No automated tests (manual QA checklist in comments)

This is deliberate — hackathon judging favors **creative use of Meta tools + demo quality** over breadth.

---

## 🧪 Manual QA Checklist

- [ ] Upload >600KB image → error shown
- [ ] No consent → button disabled
- [ ] Height empty → error
- [ ] Bad photo (no person) → `no_person` message
- [ ] Invalid JSON → retry once, then show fallback
- [ ] Rate limit → 429 message
- [ ] Skin tone swatch changes top 3
- [ ] Try-on fallback overlay appears if no image returned
- [ ] Cart total matches price × qty
- [ ] Mobile (360px), tablet, laptop all readable

---

## 📜 License

MIT — hackathon demo. Dress photos remain property of original photographers via Unsplash.

## 🙏 Credits

Built for **Meta Global AI Developer Hackathon 2026**. Uses:
- **Muse Spark / Muse Wonder** (vision) — https://dev.meta.ai/models/muse-spark/
- **SAM 3.1** (segmentation) — https://dev.meta.ai/models/sam-3.1
- **Muse Image** (generation) — https://dev.meta.ai/models/muse-image

Benchmarks on each model page at https://dev.meta.ai/platform/models.

---

## 📎 For Your Folder

You asked for a folder for your current dresses — it's at **`public/dresses/`**. See `public/dresses/README.md` for how to add them.
