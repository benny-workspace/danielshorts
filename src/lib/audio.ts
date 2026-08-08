/**
 * The OST synthesiser.
 *
 * A small Web Audio arrangement — sine "piano" arpeggios over a triangle pad,
 * run through a shared lowpass and a convolution reverb built from noise. No
 * audio files, so it costs nothing to ship and starts instantly.
 */

type Progression = number[][];

/** i–VI–III–VII in A minor: the standard K-drama ballad turn. */
const PROGRESSIONS: Record<string, Progression> = {
  warm: [
    [220.0, 261.63, 329.63], // Am
    [174.61, 220.0, 261.63], // F
    [196.0, 246.94, 293.66], // G
    [164.81, 207.65, 246.94], // Em
  ],
  bright: [
    [261.63, 329.63, 392.0], // C
    [196.0, 246.94, 293.66], // G
    [220.0, 261.63, 329.63], // Am
    [174.61, 220.0, 261.63], // F
  ],
};

function buildReverb(ctx: AudioContext, seconds = 2.6): ConvolverNode {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = ctx.createBuffer(2, length, rate);

  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      // Exponentially decaying noise gives a soft, hall-like tail.
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.6;
    }
  }

  const convolver = ctx.createConvolver();
  convolver.buffer = impulse;
  return convolver;
}

export class OstPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  private step = 0;
  private progression: Progression = PROGRESSIONS.warm;

  playing = false;

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;

    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2600;
    filter.Q.value = 0.5;

    const reverb = buildReverb(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.36;

    master.connect(filter);
    filter.connect(ctx.destination);
    filter.connect(wet);
    wet.connect(reverb);
    reverb.connect(ctx.destination);

    this.ctx = ctx;
    this.master = master;

    return ctx;
  }

  private note(frequency: number, at: number, duration: number, gain: number, type: OscillatorType) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);

    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + 0.035);
    env.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    osc.connect(env);
    env.connect(master);
    osc.start(at);
    osc.stop(at + duration + 0.05);
  }

  private tick = () => {
    const ctx = this.ctx;
    if (!ctx) return;

    const chord = this.progression[this.step % this.progression.length];
    const now = ctx.currentTime + 0.03;

    // Pad: the root an octave down, held under the whole bar.
    this.note(chord[0] / 2, now, 3.4, 0.05, 'triangle');

    // Arpeggio with a light swing so it never sounds like a metronome.
    chord.forEach((frequency, index) => {
      this.note(frequency, now + index * 0.42, 1.5, 0.075, 'sine');
      this.note(frequency * 2, now + index * 0.42 + 0.02, 1.1, 0.028, 'sine');
    });

    // Answering top note on alternate bars.
    if (this.step % 2 === 1) {
      this.note(chord[2] * 2, now + 1.5, 1.6, 0.045, 'sine');
    }

    this.step += 1;
  };

  async start(mood: keyof typeof PROGRESSIONS = 'warm'): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return false;

    // Browsers suspend contexts created outside a gesture; this runs from a click.
    if (ctx.state === 'suspended') await ctx.resume();

    this.progression = PROGRESSIONS[mood] ?? PROGRESSIONS.warm;
    this.playing = true;

    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setValueAtTime(this.master.gain.value, ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.2);

    this.tick();
    this.timer = window.setInterval(this.tick, 3400);
    return true;
  }

  stop(): void {
    this.playing = false;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    const ctx = this.ctx;
    if (!ctx || !this.master) return;

    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setValueAtTime(this.master.gain.value, ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
  }

  async toggle(mood?: keyof typeof PROGRESSIONS): Promise<boolean> {
    if (this.playing) {
      this.stop();
      return false;
    }
    return this.start(mood);
  }

  dispose(): void {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;

  }
}
