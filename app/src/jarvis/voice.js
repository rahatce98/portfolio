/* -----------------------------------------------------------------------------
 * Voice engine — speaks while the answer is still streaming, listens hands-free.
 *
 * Speaker  sentence-by-sentence speechSynthesis, so the first words play
 *          while the model is still writing. Picks the best installed voice
 *          per sentence (Bangla text → a Bangla voice, else a natural English
 *          one — Edge's "Online (Natural)" voices are excellent).
 * Listener Web Speech recognition (Chrome, Edge, Safari) in one-shot or
 *          hands-free mode with the wake word "Jarvis". Where the browser has
 *          no recognition (Firefox), it records with a simple voice-activity
 *          detector and transcribes with Whisper on Groq (owner key needed).
 * -------------------------------------------------------------------------- */

import { transcribe, canTranscribe } from './brain';

const BN = /[\u0980-\u09FF]/;
const HI = /[\u0900-\u097F]/;
export const WAKE = /(?<![a-zঀ-৿])(?:(?:hey|hi|ok|okay|yo|এই|হেই)\s+)?(?:jarvis|jervis|jarvi|javis|জার্ভিস|জারভিস|জার্ভিশ)(?![a-zঀ-৿])[\s,.!?:।-]*/i;

export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
export const canRecognise = !!SR;
export const canRecord = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

function pickVoice(script) {
  const v = speechSynthesis.getVoices();
  if (script === 'bn') return v.find((x) => /^bn/i.test(x.lang) && /natural|online/i.test(x.name)) || v.find((x) => /^bn/i.test(x.lang)) || null;
  if (script === 'hi') return v.find((x) => /^hi/i.test(x.lang) && /natural|online/i.test(x.name)) || v.find((x) => /^hi/i.test(x.lang)) || null;
  return (
    v.find((x) => /en-GB/i.test(x.lang) && /natural|online/i.test(x.name) && /ryan|thomas|oliver|male/i.test(x.name)) ||
    v.find((x) => /^en/i.test(x.lang) && /natural|online/i.test(x.name) && /guy|andrew|brian|davis|ryan|christopher|eric/i.test(x.name)) ||
    v.find((x) => /Google UK English Male/i.test(x.name)) ||
    v.find((x) => /en-GB/i.test(x.lang) && /daniel|george|ryan|male/i.test(x.name)) ||
    v.find((x) => /en-GB/i.test(x.lang)) ||
    v.find((x) => /^en/i.test(x.lang)) ||
    null
  );
}
if (canSpeak) speechSynthesis.getVoices(); // warm the voice list

const clean = (t) =>
  t
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/\[([^\]]+)\]\(https?:[^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'the link')
    .replace(/[*_`#>|[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export class Speaker {
  constructor({ onStart, onIdle, onLevel } = {}) {
    Object.assign(this, { onStart, onIdle, onLevel });
    this.on = false;
    this.buf = '';
    this.pending = 0;
    this.audio = null;
  }
  get speaking() {
    return this.pending > 0;
  }
  /** Feed streamed text; complete sentences are spoken at once. */
  feed(delta) {
    if (!this.on || !canSpeak) return;
    this.buf += delta;
    for (;;) {
      const m = this.buf.match(/^([\s\S]*?[.!?।॥:;\n])(\s+|$)/);
      // Wait for a few words so tiny fragments don't sound choppy.
      if (!m || (m[1].length < 24 && this.buf.length < 60 && !/\n/.test(m[1]))) break;
      this.buf = this.buf.slice(m[0].length);
      this.say(m[1], true);
    }
  }
  flush() {
    const rest = this.buf;
    this.buf = '';
    if (rest.trim()) this.say(rest, true);
    else if (!this.pending) this.onIdle?.();
  }
  say(text, queued) {
    if (!this.on || !canSpeak) return this.onIdle?.();
    if (!queued) this.cancel();
    const t = clean(text).slice(0, 900);
    if (!t) return;
    const script = BN.test(t) ? 'bn' : HI.test(t) ? 'hi' : 'en';
    const u = new SpeechSynthesisUtterance(t);
    const v = pickVoice(script);
    if (v) u.voice = v;
    u.lang = v?.lang || { bn: 'bn-BD', hi: 'hi-IN', en: 'en-GB' }[script];
    u.rate = script === 'en' ? 1.04 : 1;
    u.pitch = script === 'en' ? 0.94 : 1;
    this.pending++;
    u.onstart = () => this.onStart?.();
    u.onboundary = () => this.onLevel?.(0.55 + Math.random() * 0.35);
    u.onend = u.onerror = () => {
      this.pending = Math.max(0, this.pending - 1);
      this.onLevel?.(0);
      if (!this.pending && !this.buf) this.onIdle?.();
    };
    speechSynthesis.speak(u);
    // Chrome pauses long queues on some platforms; nudge it.
    if (speechSynthesis.paused) speechSynthesis.resume();
  }
  cancel() {
    this.buf = '';
    this.pending = 0;
    if (canSpeak) speechSynthesis.cancel();
    this.onLevel?.(0);
  }
}

/* ------------------------------------------------------------ listening --- */

export class Listener {
  /**
   * onText(text, { wake }) — a final utterance (wake word already stripped)
   * onInterim(text)        — live partial transcript
   * onState(listening)     — mic open / closed
   * onLevel(0..1)          — mic amplitude for the core animation
   */
  constructor(h) {
    this.h = h;
    this.lang = 'en-US';
    this.hands = false;
    this.awakeUntil = 0;
    this.paused = false;
    this.rec = null;
    this.stream = null;
    this.alive = false;
    this.fails = 0;
  }

  /* 'auto' language = Whisper (understands Bangla, English, Hindi and mixed
     speech without choosing). Fixed languages use the browser's recogniser,
     which streams words live. */
  get engine() {
    const whisper = canRecord && canTranscribe();
    if (this.lang === 'auto' && whisper) return 'whisper';
    return canRecognise ? 'browser' : whisper ? 'whisper' : null;
  }

  wake(ms = 9000) {
    this.awakeUntil = Date.now() + ms;
  }

  /* Decide what to do with a final transcript. */
  handle(raw) {
    const t = raw.trim();
    if (!t) return;
    if (!this.hands) return this.h.onText(t.replace(WAKE, '').trim() || t, { wake: false });
    const awake = Date.now() < this.awakeUntil;
    const m = t.match(WAKE);
    if (m) {
      // "Jarvis, switch brain" and "switch your brain, Jarvis" both work.
      const cmd = (t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)).replace(/^[\s,.!?।-]+|[\s,.!?।-]+$/g, '').trim();
      if (!cmd) {
        this.wake();
        return this.h.onText('', { wake: true });
      }
      return this.h.onText(cmd, { wake: false });
    }
    if (awake) return this.h.onText(t, { wake: false });
    // Not addressed to Jarvis — ignore (hands-free only reacts to its name).
  }

  async start({ hands = this.hands } = {}) {
    this.hands = hands;
    this.paused = false;
    if (this.alive) return true;
    if (this.engine === 'browser') return this.startBrowser();
    if (this.engine === 'whisper') return this.startWhisper();
    return false;
  }

  stop() {
    this.hands = false;
    this.alive = false;
    try {
      this.rec?.abort();
    } catch {
      /* already stopped */
    }
    this.rec = null;
    this.stopStream();
    this.h.onState(false);
  }

  /** Temporarily close the mic (while Jarvis speaks — it would hear itself). */
  pause() {
    if (!this.alive) return;
    this.paused = true;
    try {
      this.rec?.abort();
    } catch {
      /* fine */
    }
  }
  resume() {
    if (!this.hands || !this.paused) return;
    this.paused = false;
    if (this.engine === 'browser') {
      this.alive = false;
      this.startBrowser();
    }
  }

  startBrowser() {
    const r = new SR();
    r.lang = this.lang === 'auto' ? navigator.language || 'en-US' : this.lang;
    r.interimResults = true;
    r.continuous = this.hands;
    r.maxAlternatives = 1;
    let finalText = '';
    let pending = ''; // interim words not yet finalised
    let quiet = 0;
    // Some browsers (Edge, Android) are slow to mark a phrase final, or end
    // the session without doing so. A short pause counts as the end of the
    // sentence, so a spoken command is always sent — no button press.
    const commit = () => {
      clearTimeout(quiet);
      const t = pending.trim();
      pending = '';
      if (t) {
        finalText = t;
        this.handle(t);
      }
    };
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const x = e.results[i];
        if (x.isFinal) {
          clearTimeout(quiet);
          pending = '';
          finalText = x[0].transcript;
          this.handle(finalText);
        } else interim += x[0].transcript;
      }
      this.fails = 0;
      if (interim) {
        pending = interim;
        this.h.onInterim(interim);
        clearTimeout(quiet);
        quiet = setTimeout(() => {
          commit();
          if (!this.hands) {
            try {
              r.stop();
            } catch {
              /* already stopped */
            }
          }
        }, 1300);
      }
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.hands = false;
        this.h.onDenied?.();
        this.h.onError?.('Microphone permission was denied. Allow it in the address bar, then try again.');
      } else if (e.error === 'network') this.fails++;
      else if (e.error === 'language-not-supported') this.h.onError?.(`This browser can't recognise ${this.lang}.`);
    };
    r.onend = () => {
      if (pending) commit();
      this.alive = false;
      this.rec = null;
      // Hands-free: reopen unless paused (speaking) or stopped. Back off on
      // repeated network failures so a dead connection doesn't spin.
      if (this.hands && !this.paused) {
        if (this.fails > 4 && canRecord && canTranscribe()) {
          this.fails = 0;
          return this.startWhisper();
        }
        return setTimeout(() => this.hands && !this.paused && !this.alive && this.startBrowser(), Math.min(4000, 150 + this.fails * 800));
      }
      if (!this.paused) this.h.onState(false);
    };
    try {
      r.start();
      this.rec = r;
      this.alive = true;
      this.h.onState(true);
      return true;
    } catch {
      return false;
    }
  }

  stopStream() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ac?.close().catch(() => {});
    this.ac = null;
  }

  /* Whisper path: record → detect end of speech → transcribe → repeat. */
  async startWhisper() {
    try {
      this.stream = this.stream || (await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }));
    } catch {
      this.hands = false;
      this.h.onDenied?.();
      this.h.onError?.('Microphone permission was denied.');
      return false;
    }
    this.alive = true;
    this.h.onState(true);
    const ac = (this.ac = new AudioContext());
    const an = ac.createAnalyser();
    an.fftSize = 512;
    ac.createMediaStreamSource(this.stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const rms = () => {
      an.getByteTimeDomainData(buf);
      let s = 0;
      for (const v of buf) s += ((v - 128) / 128) ** 2;
      return Math.sqrt(s / buf.length);
    };
    const loop = async () => {
      while (this.alive) {
        if (this.paused) {
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        const blob = await this.recordOne(rms);
        if (!this.alive) break;
        if (!blob) {
          if (!this.hands && !this.paused) break;
          continue;
        }
        try {
          this.h.onInterim('…');
          const text = await transcribe(blob, this.lang);
          if (text && !/^(thank you\.?|you|\.)$/i.test(text)) this.handle(text);
        } catch (e) {
          this.h.onError?.(`Speech-to-text failed: ${e.message}`);
        }
        if (!this.hands) break;
      }
      if (!this.hands) this.stop();
    };
    loop();
    return true;
  }

  recordOne(rms) {
    return new Promise((resolve) => {
      const rec = new MediaRecorder(this.stream);
      const chunks = [];
      let spoke = false;
      let quietSince = 0;
      const t0 = Date.now();
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => resolve(spoke ? new Blob(chunks, { type: rec.mimeType || 'audio/webm' }) : null);
      rec.start(250);
      const tick = () => {
        if (!this.alive || this.paused) return rec.state !== 'inactive' && rec.stop();
        const l = rms();
        this.h.onLevel?.(Math.min(1, l * 4));
        const now = Date.now();
        if (l > 0.035) {
          spoke = true;
          quietSince = 0;
        } else if (spoke && !quietSince) quietSince = now;
        const long = now - t0 > 20000;
        const done = spoke && quietSince && now - quietSince > 900;
        const idle = !spoke && !this.hands && now - t0 > 7000;
        if (done || long || idle) return rec.stop();
        requestAnimationFrame(tick);
      };
      tick();
    });
  }
}
