// Typewriter sound effects (Web Audio synthesis, no assets)
window.useTypeSound = function useTypeSound() {
  const { useRef, useCallback } = React;
  const ctxRef = useRef(null);
  const getCtx = () => {
    if (!ctxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
    return ctxRef.current;
  };

  // Mechanical key click — short noise burst through high-pass + tiny "thunk"
  const playKey = useCallback(() => {
    try {
      const ctx = getCtx();
      const now = ctx.currentTime;
      // 1) high-frequency click (the strike)
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / ctx.sampleRate;
        data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 180) * 0.18;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1200 + Math.random() * 800;
      const g = ctx.createGain(); g.gain.value = 0.8;
      src.connect(hp).connect(g).connect(ctx.destination);
      src.start(now);
      // 2) low "thunk" — the hammer hitting platen
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120 + Math.random() * 40, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.06);
      og.gain.setValueAtTime(0.08, now);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(og).connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.1);
    } catch (e) {}
  }, []);

  // Margin bell — sine ding ~2200Hz with quick decay
  const playBell = useCallback(() => {
    try {
      const ctx = getCtx();
      const now = ctx.currentTime;
      [2200, 3300].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.08 / (i + 1), now + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc.connect(g).connect(ctx.destination);
        osc.start(now); osc.stop(now + 0.85);
      });
    } catch (e) {}
  }, []);

  // Carriage return — slide + thud
  const playReturn = useCallback(() => {
    try {
      const ctx = getCtx();
      const now = ctx.currentTime;
      // slide (filtered noise sweep)
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.35, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / ctx.sampleRate;
        data[i] = (Math.random() * 2 - 1) * (1 - t / 0.35) * 0.12;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(800, now);
      bp.frequency.exponentialRampToValueAtTime(300, now + 0.3);
      src.connect(bp).connect(ctx.destination);
      src.start(now);
      // thud at end
      setTimeout(() => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 80;
        g.gain.setValueAtTime(0.15, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        o.connect(g).connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.2);
      }, 280);
    } catch (e) {}
  }, []);

  // Paper roll (for ritual)
  const playRoll = useCallback(() => {
    try {
      const ctx = getCtx();
      const now = ctx.currentTime;
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.04;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 600;
      src.connect(lp).connect(ctx.destination);
      src.start(now);
    } catch (e) {}
  }, []);

  // Stamp — sharp impact
  const playStamp = useCallback(() => {
    try {
      const ctx = getCtx();
      const now = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(180, now);
      o.frequency.exponentialRampToValueAtTime(60, now + 0.08);
      g.gain.setValueAtTime(0.25, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      o.connect(g).connect(ctx.destination);
      o.start(now); o.stop(now + 0.12);
    } catch (e) {}
  }, []);

  return { playKey, playBell, playReturn, playRoll, playStamp };
};
