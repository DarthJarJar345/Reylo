<div align="center">
  <img src="images/logo.png" width="120" alt="Reylo AI logo" />

  <h1>Reylo AI</h1>

  <p><strong>Free, private AI chat that runs entirely in your browser.</strong><br />
  No API keys · No sign-up · No cost · No data leaves your device.</p>

  <p>
    <a href="https://darthjarjar345.github.io/Reylo/"><strong>🚀 Try the live site →</strong></a>
  </p>

  <p>
    <img alt="GitHub Pages" src="https://img.shields.io/badge/Hosting-GitHub%20Pages-blue" />
    <img alt="No API keys" src="https://img.shields.io/badge/API%20keys-none-3ddc84" />
    <img alt="Price" src="https://img.shields.io/badge/price-free%20forever-brightgreen" />
    <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-orange" />
    <img alt="Privacy" src="https://img.shields.io/badge/privacy-100%25%20on--device-purple" />
  </p>
</div>

![Reylo AI hero](images/og-card.png)

## ✨ What is this?

**Reylo AI** is an open-source AI chatbot website with **two engines** — and it needs **zero API keys**, because the AI runs on *your* device, not someone's paid cloud GPU.

| Engine | What it is | Download | Works offline |
|---|---|---|---|
| ⚡ **Reylo Core** | Instant toolkit intelligence: math parser, unit conversions, code recipes, curated knowledge (AI, programming, science, history, health…), text tools (summarize, word count, base64…) | None | ✅ Yes |
| 🧠 **Reylo Neural** | A **real LLM** (Qwen 2.5 0.5B / SmolLM2) streamed token-by-token via [Transformers.js](https://github.com/huggingface/transformers.js) + WebGPU (WASM fallback) | One-time ~75–350 MB, then browser-cached | After first load, ✅ |

## 🧩 Features

- 💬 **Chat UI** — streaming replies, markdown + code highlighting, copy buttons, suggestion chips
- 🗂️ **Conversation history** — saved in your browser's local storage (multi-chat, rename, delete, export to Markdown)
- 🧮 **Instant tools** — `(18 + 4) * 3^2`, `15% of 240`, `convert 72 f to c`, `write code for fibonacci in python`, `summarize: …`
- 🔒 **Privacy by architecture** — no backend, no analytics, no accounts. The repo literally contains no server code.
- 🌐 **WebGPU acceleration** with automatic WASM fallback — works on old hardware too
- 📱 **Responsive** — desktop and mobile layouts
- 🪶 **Zero dependencies to build** — plain HTML/CSS/JS, deploys as static files

## 🤔 How can it be free — and why no API keys?

Traditional AI apps send every prompt to a cloud GPU and pay per token. That's why they need API keys, accounts, and subscriptions.

Reylo flips the model: **open-weights models + your own hardware**. The model downloads once from Hugging Face's public CDN and then runs locally in your browser. There's no meter to read, no key to leak, and no bill to pay.

## 🏃 Run locally

```bash
git clone https://github.com/DarthJarJar345/Reylo.git
cd Reylo
python3 -m http.server 8000        # or: npx serve .
```

Open http://localhost:8000 — that's it. (A local server is required for ES modules; `file://` won't work.)

Run the Core engine tests:

```bash
node tests/core.test.mjs
```

## 🚀 Deploying

The site deploys itself: pushing to `main` triggers `.github/workflows/deploy.yml`, which publishes the static files to **GitHub Pages**. No tokens, no secrets, no configuration.

Live URL: **https://darthjarjar345.github.io/Reylo/**

## 🧱 Project layout

```
index.html            # the app shell
css/style.css         # design system
js/core.js            # Reylo Core — instant local engine (also runs in Node tests)
js/neural.js          # Reylo Neural — Transformers.js + WebGPU LLM runner
js/app.js             # UI controller: chat, storage, streaming, settings
tests/core.test.mjs   # unit tests for the Core engine
.github/workflows/    # GitHub Pages deployment
```

## 📏 Honest limitations

Small on-device models are amazing for privacy and price, but they are **not** larger cloud models: long-form reasoning, niche topics, and multi-step coding can be weaker than ChatGPT/Claude. Reylo's pitch is different — **$0, zero keys, zero tracking, works everywhere** — with instant built-in tools that don't need a model at all.

## 🤝 Contributing

Issues and pull requests are welcome. Some ideas:

- More Core knowledge entries & code recipes
- RAG over user-provided documents (still 100% local)
- Voice input via Web Speech API
- PWA/offline manifest

## 📄 License

[MIT](LICENSE) — use it, fork it, ship it.
