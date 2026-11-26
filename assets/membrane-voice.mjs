// 放大的薄膜振動。數值服務展演，並非微尺度聲壓或共振頻率的預測。
const gestures = {
  rewet:   {parts: 3, gap: 0.066, bend: 0.17, tail: 0.034, tone: 0.80, peel: 0.24},
  drain:   {parts: 2, gap: 0.047, bend: 0.24, tail: 0.046, tone: 0.68, peel: 0.37},
  flex:    {parts: 4, gap: 0.050, bend: 0.11, tail: 0.026, tone: 0.75, peel: 0.32},
  contact: {parts: 2, gap: 0.061, bend: 0.08, tail: 0.032, tone: 0.68, peel: 0.24},
  release: {parts: 1, gap: 0.040, bend: 0.22, tail: 0.019, tone: 0.56, peel: 0.26},
  separate:{parts: 3, gap: 0.037, bend: 0.28, tail: 0.016, tone: 0.56, peel: 0.43},
};

const modeGain = [0.58, 0.26, 0.17, 0.075];

function randomFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// 紋理固定於個體，水量與當下的動作再改變同一副褶瓣的聲音。
export function makeVoice({kind, id, water, size, eventSeed, rate}) {
  const body = randomFrom(19073 + id * 9821);
  const jitter = randomFrom(31415 + eventSeed * 11587 + id * 1013);
  const form = gestures[kind];
  const wet = Math.max(0.36, Math.min(1, water));
  const breadth = Math.max(20, Math.min(74, size));
  const tension = 0.74 + body() * 0.54;
  const mass = Math.sqrt(35 / breadth) / (0.74 + wet * 0.61);
  const root = 690 * tension * mass * (kind === 'release' ? 1.21 : 1);
  const fold = [1, 1.29 + body() * 0.25, 1.86 + body() * 0.34, 2.62 + body() * 0.50];
  const flutter = 12 + body() * 21;
  const tissue = 0.68 + body() * 0.70;
  const parts = Math.max(1, form.parts + Math.floor(jitter() * 3) - 1);
  const samples = new Float32Array(Math.ceil(0.92 * rate));
  let offset = 0.042;
  let end = 0;

  for (let part = 0; part < parts; part++) {
    const intensity = (0.60 + jitter() * 0.32) * Math.pow(0.73, part);
    const freq = root * (0.84 + jitter() * 0.34);
    const sweep = form.bend * (0.52 + jitter() * 0.68);
    const decay = form.tail * tissue * (1.17 - 0.43 * wet) * (0.78 + 0.46 * jitter());
    const friction = form.peel * (0.76 + jitter() * 0.75);
    const start = Math.round((offset - 0.030) * rate);
    const limit = Math.min(samples.length, Math.ceil((offset + decay * 5.5) * rate));
    const roughness = jitter() * 0.26;
    const reverse = jitter() < 0.31 ? -1 : 1;
    let fast = 0;
    let slow = 0;
    for (let i = start; i < limit; i++) {
      const t = i / rate - offset;
      const noise = jitter() * 2 - 1;
      fast += 0.24 * (noise - fast);
      slow += 0.036 * (fast - slow);
      // 水絲先拖曳，再脫扣。摩擦聲跟著接點形變而變，不會整段維持。
      const peel = (fast - slow) * (t < 0 ? Math.exp(t / 0.007) : Math.exp(-t / 0.012));
      let membrane = 0;
      if (t >= 0) {
        const slide = t + reverse * sweep * 0.020 * (1 - Math.exp(-t / 0.020));
        const beat = 1 - roughness * (0.5 + 0.5 * Math.sin(2 * Math.PI * flutter * t));
        const attack = 1 - Math.exp(-t / 0.007);
        for (let mode = 0; mode < fold.length; mode++) {
          const phase = 2 * Math.PI * freq * fold[mode] * slide;
          const damping = Math.exp(-t * (1 + 0.48 * mode) / decay);
          membrane += Math.sin(phase) * damping * modeGain[mode];
        }
        membrane *= attack * beat;
      }
      samples[i] += intensity * (form.tone * membrane + friction * peel) * 0.82;
    }
    end = Math.max(end, limit);
    offset += form.gap * (0.63 + jitter() * 0.85) + (part === 0 ? 0.027 : 0);
  }
  return samples.subarray(0, end);
}
