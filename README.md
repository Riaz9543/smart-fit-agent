# StyleMatch AI — Virtual Try-On Store

**Meta Global AI Developer Hackathon 2026 Submission**

Upload a full-body photo → AI estimates body measurements (ranges) → finds 3 dresses that fit & suit you → generates a realistic try-on → add to cart.

Scope is intentionally small to ship before **Nov 4, 9:00 PM ET**. No real payment, no stored photos, no heavy ML in the browser.

---

## ✨ Live Demo

- **Vercel:** https://smart-fit-agent.vercel.app
- **Local:** Run `npx serve .` then open http://localhost:3000

The frontend includes a **demo-mode fallback** so the UI remains clickable even without an API key. Real Meta API calls require `META_API_KEY` set on the server (see below).

---

## 📁 File Structure (actual)

/
├── index.html          # Single-page app, 5 steps
├── style.css           # Dark theme, CSS variables, mobile-first responsive
├── app.js              # All frontend logic: upload → compress → measure → match → try-on → cart
├── catalogue.json      # 30 dresses with size charts, images, buy_url
├── api/
│   └── proxy.js        # Single Vercel serverless function (export default handler)
├── .gitignore
└── README.md

> **Note for judges:** All frontend logic lives in `app.js` (single file, ~337 lines). It is organized by function:
> - `compressImage()` — browser-side compression to <600KB
> - `getBestSize()` — size-fit scoring from catalogue size charts
> - scoring helpers — body-shape and colour suitability
> - try-on handler — calls `/api/proxy`, renders side-by-side result
> - cart handlers — mock checkout (no real payment)

---

## 🧰 Tech Stack (per brief)

- **Frontend:** plain HTML, CSS, JS ES modules — no framework, no build step
- **Backend:** one serverless function `api/proxy.js` on Vercel (`export default function handler(req, res)`)
- **Styling:** dark theme with CSS variables, fully responsive (phone, tablet, laptop)
- **Phone-friendly:** files kept small for coding on Android (Termux + Acode)

---

## 🔐 Environment Variables

Set in **Vercel Dashboard → Settings → Environment Variables** (and locally in `.env` if using `vercel dev`).

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `META_API_KEY` | ✅ | — | Bearer token for https://api.meta.ai/v1/responses |
| `META_MODEL` | — | `muse-wonder-1.0` | Vision model for measurement |
| `META_IMAGE_MODEL` | — | `muse-image-1.0` | Try-on image generation model |
| `META_SAM_MODEL` | — | `sam-3.1` | Segmentation model (SAM 3.1) |

The API key lives **only** in `META_API_KEY` on the server. The frontend never sees it.

### Meta Model API (as used in `api/proxy.js`)

POST https://api.meta.ai/v1/responses
Header: Authorization: Bearer ${process.env.META_API_KEY}
Body: {
  model,
  input: [{ role: "user", content: [
    { type: "input_text", text },
    { type: "input_image", image_url }
  ]}],
  reasoning: { effort: "low" },
  stream: false
}
Read: data.output.find(x => x.type === "message").content[0].text

`api/proxy.js` is a thin forwarder: it receives the request from the browser, injects the Bearer token from the server environment, calls Meta, and returns the raw response. **No fallback logic is implemented in the proxy.** If the Meta call fails or returns an unexpected shape, the **frontend handles it** — `app.js` catches the error and switches to demo-mode behaviour so the UI does not break. This is by design and is stated here so judges do not look for fallback code inside `api/proxy.js`.

---

## 🚀 Setup, Run & Deploy

### 1. Clone
git clone https://github.com/Riaz9543/smart-fit-agent.git
cd smart-fit-agent

### 2. Local (no build)
npx serve .
# open http://localhost:3000

The API route will 500 without a key — the frontend falls back to mock measurements so the UI still works.

To test with the real API locally:
npm i -g vercel
vercel dev
# reads .env, serves api/proxy.js

Create `.env` for local use:
META_API_KEY=sk_meta_xxxx
META_MODEL=muse-wonder-1.0

### 3. Deploy to Vercel
vercel --prod

Or connect the GitHub repo at https://vercel.com/new. Then in **Vercel Dashboard → Settings → Environment Variables** add `META_API_KEY` (and optionally the other model vars). Redeploy.

### 4. Use your own dresses

Drop photos into `public/dresses/` (keep each <600KB, or compress in browser), then update `catalogue.json` `image` fields to point at `public/dresses/your.jpg` (or keep the existing Unsplash URLs).

---

## 🖼️ Third-Party Assets

| Asset | Source | License | Notes |
|-------|--------|---------|-------|
| Dress images (30) | Unsplash — search *dress*, *fashion* | Unsplash License | URLs in `catalogue.json`; replace with your own |
| Fonts | System stack (Inter, Segoe UI) | — | No download needed |
| Icons | Unicode emoji (👗, ✨, 🛒) | — | — |

All code needed to run the demo is in this public repo. No private assets are used.

---

## 🔄 Features (built in order)

1. **Upload** — full-body photo, browser-side compression to <600KB, adult-only consent checkbox, tips list (standing straight, full body, plain background).
2. **Measurement** — user enters height to calibrate. Model returns strict JSON `{ body_shape, face_shape, shoulder_width_cm, chest_cm, waist_cm, hip_cm, arm_length_cm, inseam_cm, confidence }` with ranges (e.g. `[88,92]`). Validated + retried once. Every number is editable by the user.
3. **Catalogue** — `catalogue.json` with 30 dresses (id, name, colour, style, fit, neckline, length, price, sizes with size chart in cm, image, buy_url).
4. **Matching** — score each dress on size-fit (from size chart), body-shape suitability, and colour for the chosen skin tone. Show top 3 with match %, recommended size, and a one-line respectful reason.
5. **Try-on** — generate a photo of the user wearing the chosen dress, keeping face/pose/background. Side-by-side original vs result with loading state.
6. **Buy** — add to cart + mock checkout (no real payment) with size & price summary.

---

## 🛡️ Safety & Privacy

- **Never store photos or measurements** — processed in memory only; stated in UI hero & footer.
- **Respectful wording** — "fits you well", "colours that suit you". Never judgemental.
- **Clear errors** — bad photo, no person detected, API failure, invalid JSON, rate limit (10/min), 600KB limit.

---

## ✅ What Is Finished vs Intentionally Left Out

**Finished:**
- All 6 features end-to-end, responsive dark UI
- Image compression, JSON validation, retry-once logic
- Editable measurements, swatch-based colour filtering
- Size-fit / shape / colour scoring
- Side-by-side try-on view
- Cart + mock checkout
- Rate limiting + 600KB guard + key-only-on-server
- Demo-mode fallback so judges can click through without an API key

**Intentionally left out (to keep scope small):**
- No real payment (Stripe / PayPal)
- No auth / user accounts / DB
- No persistent storage (by design)
- No advanced SAM mask editing UI
- No video try-on
- No automated tests (manual QA checklist below)

This is deliberate — hackathon judging favours creative use of Meta tools + demo quality over breadth.

---

## 🧪 Manual QA Checklist

- [ ] Upload >600KB image → error shown
- [ ] No consent → button disabled
- [ ] Height empty → error
- [ ] Bad photo (no person) → `no_person` message
- [ ] Invalid JSON → retry once, then show fallback
- [ ] Rate limit → 429 message
- [ ] Skin-tone swatch changes top 3
- [ ] Try-on fallback overlay appears if no image is returned
- [ ] Cart total matches `price × qty`
- [ ] Mobile (360px), tablet, laptop all readable

---

## 📜 License

MIT — see [LICENSE](LICENSE) for full text.

Dress photos remain the property of the original photographers via Unsplash.

---

## 🙏 Credits

Built for **Meta Global AI Developer Hackathon 2026**. Uses:

- Muse Spark / Muse Wonder (vision) — https://dev.meta.ai/models/muse-spark/
- SAM 3.1 (segmentation) — https://dev.meta.ai/models/sam-3.1
- Muse Image (generation) — https://dev.meta.ai/models/muse-image

Benchmarks on each model page at https://dev.meta.ai/platform/models.

---

## 📎 For Your Folder

Place your current dress photos in `public/dresses/`. Keep each file **<600KB** (or let the browser compress on upload).
