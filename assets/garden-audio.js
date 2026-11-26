import {makeVoice} from './membrane-voice.mjs?v=20261126-voices';

const rewet = 0.56;
const saturation = 0.82;
const maxVoices = 5;

function touch(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < (a.radius + b.radius) * 1.35;
}

export function connectGardenAudio(canvas, button, preview) {
  const status = document.getElementById('sound-status');
  const activeVoices = new Set();
  const lastSpoken = new Map();
  let context;
  let previous;
  let nextPhrase = 0;
  let eventSeed = 0;

  function stopVoices() {
    for (const voice of activeVoices) voice.stop();
    activeVoices.clear();
  }

  function play(kind, creature, volume, delay = 0) {
    if (activeVoices.size >= maxVoices) return;
    const wave = makeVoice({
      kind, id: creature.id, water: creature.water, size: creature.radius,
      eventSeed: eventSeed++, rate: context.sampleRate,
    });
    const source = context.createBufferSource();
    const gain = context.createGain();
    const buffer = context.createBuffer(1, wave.length, context.sampleRate);
    buffer.getChannelData(0).set(wave);
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain);
    if (context.createStereoPanner) {
      const pan = context.createStereoPanner();
      pan.pan.value = creature.pan * 0.75;
      gain.connect(pan).connect(context.destination);
    } else {
      gain.connect(context.destination);
    }
    source.onended = () => activeVoices.delete(source);
    activeVoices.add(source);
    source.start(context.currentTime + delay);
    lastSpoken.set(creature.id, context.currentTime + delay);
  }

  function onSoundState() {
    const state = canvas.dataset.soundState;
    if (!state || !canvas.hasAttribute('data-listening')) return;
    const [header, ...rows] = state.split(';');
    const [time, paused] = header.split(',').map(Number);
    const creatures = rows.map((row, id) => {
      const [water, x, y, z, radius, pan, visible] = row.split(',').map(Number);
      return {id, water, x, y, z, radius, pan, visible};
    });
    const last = previous;
    previous = {time, creatures};

    if (paused || (last && time < last.time)) {
      stopVoices();
      nextPhrase = 0;
      lastSpoken.clear();
      return;
    }
    if (!last || time === last.time || !preview.paused || context.state !== 'running') return;

    const newborn = creatures.slice(last.creatures.length).find(creature => creature.visible);
    if (newborn) play('release', newborn, 0.33);

    const now = context.currentTime;
    const ready = creatures.slice(0, last.creatures.length).filter(creature => creature.visible
      && now - (lastSpoken.get(creature.id) ?? -100) > 1.05);
    const before = creature => last.creatures[creature.id];
    const crosses = (creature, threshold) => before(creature).water < threshold && creature.water >= threshold;
    const open = ready.filter(creature => crosses(creature, rewet));
    const full = ready.filter(creature => crosses(creature, saturation));

    if (now < nextPhrase) return;
    const call = open.find(creature => (creature.id + eventSeed) % 3 === 1) ?? open[0];
    const drain = full.at(-1);
    if (call || drain) {
      const lead = call ?? drain;
      play(call ? 'rewet' : 'drain', lead, 0.64);
      const neighbor = ready.find(creature => creature !== lead && creature.water >= rewet && touch(creature, lead));
      if (neighbor) play('contact', neighbor, 0.31, 0.23 + (neighbor.id % 5) * 0.053);
      nextPhrase = now + 0.28 + (lead.id % 4) * 0.09;
      return;
    }

    // 濕的褶片在局部拉扯時也會顫動。使用不等週期，乾燥或離開畫面時保持安靜。
    const flex = ready.find(creature => {
      if (creature.water < 0.64) return false;
      const period = 2.8 + (creature.id % 7) * 0.43;
      const shift = creature.id * 0.71;
      return Math.floor((time + shift) / period) > Math.floor((last.time + shift) / period);
    });
    const separated = ready.find(creature => before(creature).water >= rewet
      && creature.water < rewet && last.creatures.some(other => other.id !== creature.id
        && other.water >= rewet && touch(other, before(creature))));
    if (separated || flex) {
      play(separated ? 'separate' : 'flex', separated ?? flex, 0.30);
      nextPhrase = now + 0.51;
    }
  }

  const observer = new MutationObserver(onSoundState);
  observer.observe(canvas, {attributes: true, attributeFilter: ['data-sound-state']});
  preview.addEventListener('play', stopVoices);
  button.addEventListener('click', async () => {
    if (canvas.hasAttribute('data-listening')) {
      canvas.removeAttribute('data-listening');
      previous = undefined;
      nextPhrase = 0;
      lastSpoken.clear();
      stopVoices();
      button.setAttribute('aria-pressed', 'false');
      button.textContent = '聽聲';
      status.textContent = '';
      return;
    }

    button.disabled = true;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Web Audio unavailable');
      context ??= new Audio();
      await context.resume();
      preview.pause();
      canvas.setAttribute('data-listening', '');
      button.setAttribute('aria-pressed', 'true');
      button.textContent = '靜音';
      status.textContent = '';
    } catch {
      status.textContent = '暫時無法播放互動聲音，可在生態誌試聽。';
    } finally {
      button.disabled = false;
    }
  });
}
