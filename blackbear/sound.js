// Web Audio API sound synthesizer: zero external network dependencies, lightweight & child-friendly.
class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem('bb_sound_muted') === '1';
    } catch {}
  }
  _init() {
    if (!this.ctx && typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }
  toggle() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('bb_sound_muted', this.muted ? '1' : '0');
    } catch {}
    if (!this.muted) this.playTap();
    return !this.muted;
  }
  isMuted() {
    return this.muted;
  }
  _playTone(freq, type, duration, gainStart = 0.15, gainEnd = 0.001, delay = 0) {
    if (this.muted) return;
    try {
      this._init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime + delay;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(gainStart, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(gainEnd, 0.0001), now + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    } catch {}
  }
  playTap() {
    this._playTone(520, 'sine', 0.08, 0.12, 0.001);
  }
  playOption(index = 0) {
    const freqs = [440, 523.25, 659.25, 783.99]; // A4, C5, E5, G5
    const f = freqs[index % freqs.length];
    this._playTone(f, 'triangle', 0.14, 0.18, 0.001);
  }
  playStep() {
    this._playTone(587.33, 'sine', 0.08, 0.12, 0.001, 0);
    this._playTone(783.99, 'sine', 0.12, 0.14, 0.001, 0.06);
  }
  playVictory() {
    if (this.muted) return;
    const chord = [
      { f: 523.25, d: 0.12, t: 0 },
      { f: 659.25, d: 0.12, t: 0.1 },
      { f: 783.99, d: 0.15, t: 0.2 },
      { f: 1046.5, d: 0.45, t: 0.32 },
    ];
    for (const note of chord) {
      this._playTone(note.f, 'triangle', note.d, 0.2, 0.001, note.t);
    }
  }
  playEncourage() {
    if (this.muted) return;
    const chord = [
      { f: 392.00, d: 0.25, t: 0 },
      { f: 493.88, d: 0.25, t: 0.1 },
      { f: 587.33, d: 0.35, t: 0.2 },
    ];
    for (const note of chord) {
      this._playTone(note.f, 'sine', note.d, 0.16, 0.001, note.t);
    }
  }
}
export const sound = new SoundManager();
