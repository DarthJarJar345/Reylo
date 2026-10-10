/**
 * Reylo Neural — real on-device LLM powered by Transformers.js.
 * Loads a quantized open-weights model into the browser (WebGPU or WASM).
 * No API keys, no server: the model runs on the user's own hardware.
 */

export const MODELS = [
  {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    label: 'Qwen 2.5 0.5B',
    tag: 'Smart',
    size: '~350 MB',
    description: 'Best reasoning of the built-in set. 4-bit quantized, WebGPU-accelerated.',
    dtype: 'q4',
  },
  {
    id: 'onnx-community/SmolLM2-360M-Instruct',
    label: 'SmolLM2 360M',
    tag: 'Balanced',
    size: '~200 MB',
    description: 'Good quality with a smaller download. Great everyday chat.',
    dtype: 'q4',
  },
  {
    id: 'onnx-community/SmolLM2-135M-Instruct',
    label: 'SmolLM2 135M',
    tag: 'Turbo',
    size: '~75 MB',
    description: 'Smallest and fastest. Loads in seconds — ideal for older devices.',
    dtype: 'q4',
  },
];

const SYSTEM_PROMPT =
  'You are Reylo AI, a free, privacy-first assistant that runs on the user\'s device. ' +
  'Be helpful, accurate, clear and friendly. Prefer concise answers with short paragraphs or ' +
  'bullet points. Use markdown formatting for code. If you are unsure, say so honestly. ' +
  'Never claim to browse the internet — you cannot.';

const CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';

export class ReyloNeural {
  constructor({ onStatus = () => {} } = {}) {
    this.onStatus = onStatus;
    this.pipe = null;
    this.modelId = null;
    this.device = null;
    this.loading = false;
    this.abortRequested = false;
    this._module = null;
  }

  get ready() {
    return !!this.pipe;
  }

  async _import() {
    if (this._module) return this._module;
    this.onStatus({ phase: 'importing', message: 'Loading Transformers.js runtime…' });
    try {
      this._module = await import(/* webpackIgnore: true */ CDN);
    } catch (err) {
      throw new Error(
        'Could not load the Transformers.js runtime (network or CDN issue). ' +
          'Reylo Core still works offline.'
      );
    }
    return this._module;
  }

  async load(modelId = MODELS[0].id, { dtype = 'q4' } = {}) {
    if (this.pipe && this.modelId === modelId) return;
    if (this.loading) return;
    this.loading = true;

    try {
      const { pipeline, env } = await this._import();
      env.allowLocalModels = false;
      env.useBrowserCache = true;

      const model = MODELS.find((m) => m.id === modelId) ?? MODELS[0];
      const webgpu = typeof navigator !== 'undefined' && !!navigator.gpu;

      this.onStatus({
        phase: 'downloading',
        progress: 0,
        message: `Downloading ${model.label} (${model.size}) — first time only, then cached…`,
      });

      let pipe;
      try {
        pipe = await pipeline('text-generation', model.id, {
          dtype: model.dtype ?? dtype,
          device: webgpu ? 'webgpu' : 'wasm',
          progress_callback: (p) => {
            if (p.status === 'progress' && p.total) {
              const progress = Math.min(100, Math.round(((p.loaded ?? 0) / p.total) * 100));
              this.onStatus({
                phase: 'downloading',
                progress,
                message: `Downloading ${model.label}… ${progress}%`,
              });
            } else if (p.status === 'done') {
              this.onStatus({ phase: 'downloaded', message: `${model.label} downloaded — warming up…` });
            }
          },
        });
      } catch (err) {
        if (webgpu) {
          // WebGPU init can fail on some drivers — retry on WASM.
          this.onStatus({ phase: 'retrying', message: 'WebGPU unavailable — falling back to WASM…' });
          pipe = await pipeline('text-generation', model.id, {
            dtype: model.dtype ?? dtype,
            device: 'wasm',
          });
        } else {
          throw err;
        }
      }

      this.pipe = pipe;
      this.modelId = model.id;
      this.device = typeof navigator !== 'undefined' && navigator.gpu ? 'webgpu' : 'wasm';
      this.onStatus({
        phase: 'ready',
        message: `${model.label} ready (${this.device.toUpperCase()})`,
        model: model.label,
      });
    } catch (err) {
      this.onStatus({ phase: 'error', message: err?.message ?? String(err) });
      throw err;
    } finally {
      this.loading = false;
    }
  }

  stop() {
    this.abortRequested = true;
  }

  /**
   * Generate a reply. `messages` = [{role, content}, ...] (user/assistant).
   * Streams tokens through onToken(text). Returns the full text.
   */
  async generate(messages, { onToken = null, temperature = 0.7, maxNewTokens = 256 } = {}) {
    if (!this.pipe) throw new Error('Neural engine not loaded yet.');
    this.abortRequested = false;

    const { TextStreamer } = await this._import();
    const chatMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages.slice(-8)];

    let assembled = '';
    const streamer = new TextStreamer(this.pipe.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (token) => {
        if (this.abortRequested) throw new Error('__abort__');
        assembled += token;
        if (onToken) onToken(token, assembled);
      },
    });

    try {
      const output = await this.pipe(chatMessages, {
        max_new_tokens: maxNewTokens,
        temperature,
        do_sample: temperature > 0.05,
        top_p: 0.9,
        repetition_penalty: 1.1,
        streamer,
      });

      // Fallback if the streamer callback never fired (older runtimes).
      if (!assembled && output?.length) {
        const last = output[0].generated_text;
        const text = Array.isArray(last)
          ? last[last.length - 1]?.content ?? ''
          : typeof last === 'string'
            ? last
            : '';
        assembled = text.trim();
        if (onToken && assembled) onToken(assembled, assembled);
      }
      return assembled.trim() || '(empty response — try again or lower the temperature)';
    } catch (err) {
      if (err?.message === '__abort__') {
        return assembled.trim() || '(stopped)';
      }
      throw err;
    }
  }
}

export default ReyloNeural;
