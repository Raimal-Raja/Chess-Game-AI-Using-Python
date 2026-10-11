/* Small, offline Web Audio cues; browsers unlock playback on a user gesture. */
class ChessSound {
  constructor() {
    this.enabled = true;
    this.context = null;
    try { this.enabled = localStorage.getItem('chess-sound') !== 'off'; } catch {}
  }
  unlock() {
    if (!this.enabled) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      this.context ||= new Context();
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch {}
  }
  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem('chess-sound', this.enabled ? 'on' : 'off'); } catch {}
    this.unlock();
    return this.enabled;
  }
  play(kind = 'move') {
    if (!this.enabled || !this.context) return;
    const patterns = {
      move: [[660, 0, .07], [440, .045, .08]],
      capture: [[220, 0, .1], [165, .055, .12]],
      check: [[880, 0, .1], [1046, .12, .12]],
      start: [[523, 0, .1], [659, .1, .1], [784, .2, .12]],
      end: [[784, 0, .14], [659, .15, .14], [523, .3, .22]],
    };
    try {
      for (const [frequency, delay, duration] of patterns[kind] || patterns.move) {
        const start = this.context.currentTime + delay;
        const oscillator = this.context.createOscillator(), gain = this.context.createGain();
        oscillator.type = kind === 'capture' ? 'triangle' : 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(.001, start);
        gain.gain.exponentialRampToValueAtTime(.055, start + .008);
        gain.gain.exponentialRampToValueAtTime(.001, start + duration);
        oscillator.connect(gain); gain.connect(this.context.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start); oscillator.stop(start + duration + .01);
      }
    } catch {}
  }
}
