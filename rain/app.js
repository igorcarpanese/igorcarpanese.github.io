/**
 * Full-screen rain ambience.
 * Sound is synthesized with the Web Audio API (looped filtered noise
 * plus short droplet bursts). There is no audio file and no license.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("rain");
  var gfx = canvas.getContext("2d", { alpha: false });
  var startBtn = document.getElementById("start");
  var muteBtn = document.getElementById("mute");

  var field = createField(canvas, gfx);
  var audio = createRainAudio();
  var started = false;

  field.start();

  startBtn.addEventListener("click", function () {
    if (started) return;
    started = true;
    audio.start();
    document.body.dataset.audio = audio.state();
    startBtn.classList.add("is-gone");
    startBtn.setAttribute("aria-hidden", "true");
    muteBtn.hidden = false;
    window.setTimeout(function () {
      startBtn.hidden = true;
    }, 750);
    startBtn.blur();
  });

  muteBtn.addEventListener("click", function () {
    if (!started) return;
    var muted = audio.toggleMute();
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    muteBtn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
  });

  document.addEventListener("keydown", function (event) {
    if (!started) return;
    if (event.key === "m" || event.key === "M") {
      if (event.repeat) return;
      event.preventDefault();
      muteBtn.click();
    }
  });

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && started) audio.resume();
  });

  function createField(canvas, ctx) {
    var layers = [
      { frac: 0.5, depth: 0.28, len: [8, 16], speed: [240, 400], alpha: [0.07, 0.16], width: [0.5, 0.8], splash: 0.04 },
      { frac: 0.33, depth: 0.62, len: [16, 32], speed: [460, 720], alpha: [0.16, 0.34], width: [0.8, 1.15], splash: 0.32 },
      { frac: 0.17, depth: 1, len: [28, 54], speed: [820, 1240], alpha: [0.32, 0.62], width: [1.05, 1.55], splash: 0.8 }
    ];

    var drops = [];
    var splashes = [];
    var splashCursor = 0;
    var splashPool = 420;
    var width = 0;
    var height = 0;
    var dpr = 1;
    var running = true;
    var last = 0;
    var time = 0;
    var raf = 0;
    var i;

    for (i = 0; i < splashPool; i++) {
      splashes.push({
        alive: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        max: 0,
        w: 1,
        len: 3,
        alpha: 0.4
      });
    }

    function rand(min, max) {
      return min + Math.random() * (max - min);
    }

    function targetCount() {
      var base = Math.round(Math.min(1000, Math.max(220, width * 0.5 + height * 0.06)));
      return base;
    }

    function configureDrop(drop, layer, scatter) {
      drop.layer = layer;
      drop.len = rand(layer.len[0], layer.len[1]);
      drop.speed = rand(layer.speed[0], layer.speed[1]);
      drop.alpha = rand(layer.alpha[0], layer.alpha[1]);
      drop.w = rand(layer.width[0], layer.width[1]);
      drop.phase = Math.random() * Math.PI * 2;
      drop.hit = false;
      drop.x = Math.random() * (width + 100) - 50;
      drop.y = scatter ? Math.random() * height : -drop.len - Math.random() * 80;
    }

    function rebuild(scatter) {
      var total = targetCount();
      var counts = [];
      var assigned = 0;
      var li;
      var n;
      var k;
      drops.length = 0;
      for (li = 0; li < layers.length; li++) {
        if (li === layers.length - 1) n = total - assigned;
        else n = Math.round(total * layers[li].frac);
        counts.push(n);
        assigned += n;
      }
      for (li = 0; li < layers.length; li++) {
        for (k = 0; k < counts[li]; k++) {
          var drop = {};
          configureDrop(drop, layers[li], scatter);
          drops.push(drop);
        }
      }
    }

    function resize() {
      var nextW = canvas.clientWidth || window.innerWidth;
      var nextH = canvas.clientHeight || window.innerHeight;
      var nextDpr = Math.min(window.devicePixelRatio || 1, 2);
      var prevW = width;
      var prevH = height;
      var sx;
      var sy;
      var i;
      var nextTotal;
      nextW = Math.max(1, Math.round(nextW));
      nextH = Math.max(1, Math.round(nextH));
      if (nextW === width && nextH === height && nextDpr === dpr) return;
      width = nextW;
      height = nextH;
      dpr = nextDpr;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nextTotal = targetCount();
      if (!drops.length || Math.abs(drops.length - nextTotal) > Math.max(24, drops.length * 0.12)) {
        rebuild(true);
      } else if (prevW > 0 && prevH > 0) {
        sx = width / prevW;
        sy = height / prevH;
        for (i = 0; i < drops.length; i++) {
          drops[i].x *= sx;
          drops[i].y *= sy;
        }
      }
    }

    function spawnSplash(x, y, depth) {
      var count = depth > 0.8 ? 3 : 2;
      var n;
      for (n = 0; n < count; n++) {
        var splash = splashes[splashCursor];
        splashCursor = (splashCursor + 1) % splashes.length;
        splash.alive = true;
        splash.x = x + rand(-1.5, 1.5);
        splash.y = y;
        splash.vx = rand(-1, 1) * rand(40, 160) * depth;
        splash.vy = -rand(30, 110) * depth;
        splash.life = splash.max = rand(0.12, 0.26);
        splash.w = rand(0.6, 1.15);
        splash.len = rand(1.5, 4.5);
        splash.alpha = 0.22 + depth * 0.38;
      }
    }

    function frame(now) {
      var dt;
      var wind;
      var i;
      var drop;
      var slant;
      var speed;
      var dx;
      var tailX;
      var tailY;
      var midX;
      var midY;
      var splash;
      var life;
      if (!running) return;
      raf = 0;
      if (!last) last = now;
      dt = Math.min(0.034, (now - last) / 1000);
      last = now;
      time += dt;
      wind = 0.11 + Math.sin(time * 0.17) * 0.03;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      ctx.lineCap = "round";
      ctx.strokeStyle = "#d7e1ee";

      for (i = 0; i < drops.length; i++) {
        drop = drops[i];
        slant = wind * drop.layer.depth + Math.sin(time * 0.9 + drop.phase) * 0.012;
        speed = drop.speed * (1 + Math.sin(time * 1.4 + drop.phase) * 0.035);
        drop.y += speed * dt;
        drop.x += speed * slant * dt;

        if (!drop.hit && drop.y >= height) {
          drop.hit = true;
          if (drop.x > 0 && drop.x < width && Math.random() < drop.layer.splash) {
            spawnSplash(drop.x, height - 2, drop.layer.depth);
          }
        }
        if (drop.y - drop.len > height) {
          drop.hit = false;
          drop.y = -drop.len - Math.random() * 60;
          drop.x = Math.random() * (width + 120) - 60;
        } else if (drop.x > width + 80) {
          drop.x = -40;
        } else if (drop.x < -80) {
          drop.x = width + 40;
        }

        dx = slant * drop.len;
        tailX = drop.x - dx;
        tailY = drop.y - drop.len;
        midX = drop.x - dx * 0.42;
        midY = drop.y - drop.len * 0.42;

        ctx.beginPath();
        ctx.globalAlpha = drop.alpha * 0.38;
        ctx.lineWidth = drop.w;
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(drop.x, drop.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.globalAlpha = drop.alpha;
        ctx.moveTo(midX, midY);
        ctx.lineTo(drop.x, drop.y);
        ctx.stroke();
      }

      for (i = 0; i < splashes.length; i++) {
        splash = splashes[i];
        if (!splash.alive) continue;
        splash.life -= dt;
        if (splash.life <= 0) {
          splash.alive = false;
          continue;
        }
        splash.x += splash.vx * dt;
        splash.y += splash.vy * dt;
        splash.vy += 420 * dt;
        life = splash.life / splash.max;
        ctx.beginPath();
        ctx.globalAlpha = splash.alpha * life;
        ctx.lineWidth = splash.w;
        ctx.moveTo(splash.x, splash.y);
        ctx.lineTo(splash.x - splash.vx * 0.016, splash.y - Math.min(splash.vy, 0) * 0.016 - splash.len * 0.15);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }

    function startLoop() {
      if (!raf) raf = requestAnimationFrame(frame);
    }

    function start() {
      resize();
      window.addEventListener("resize", resize);
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", resize);
      }
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) {
          running = false;
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
        } else {
          running = true;
          last = 0;
          resize();
          startLoop();
        }
      });
      startLoop();
    }

    return { start: start };
  }

  function createRainAudio() {
    var ctx = null;
    var muteGain = null;
    var muteLevel = 1;
    var muted = false;
    var timer = 0;
    var nextDrop = 0;
    var dropBuffer = null;

    function freshState() {
      return { b: 0, b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0 };
    }

    function sample(kind, state) {
      var white = Math.random() * 2 - 1;
      var pink;
      if (kind === "white") return white;
      if (kind === "brown") {
        state.b = (state.b + 0.02 * white) / 1.02;
        return state.b * 3.5;
      }
      state.b0 = 0.99886 * state.b0 + white * 0.0555179;
      state.b1 = 0.99332 * state.b1 + white * 0.0750759;
      state.b2 = 0.969 * state.b2 + white * 0.153852;
      state.b3 = 0.8665 * state.b3 + white * 0.3104856;
      state.b4 = 0.55 * state.b4 + white * 0.5329522;
      state.b5 = -0.7616 * state.b5 - white * 0.016898;
      pink = state.b0 + state.b1 + state.b2 + state.b3 + state.b4 + state.b5 + state.b6 + white * 0.5362;
      state.b6 = white * 0.115926;
      return pink * 0.11;
    }

    function makeBuffer(seconds, kind, channels, seamless) {
      var rate = ctx.sampleRate;
      var fade = seamless === false ? 0 : Math.floor(rate * 0.2);
      var length = Math.floor(rate * seconds);
      var buffer = ctx.createBuffer(channels, length, rate);
      var c;
      var raw;
      var state;
      var i;
      var sum;
      var rms;
      var scale;
      var peak;
      var t;
      var mixed;
      var data;
      for (c = 0; c < channels; c++) {
        raw = new Float32Array(length + fade);
        state = freshState();
        for (i = 0; i < raw.length; i++) raw[i] = sample(kind, state);
        sum = 0;
        for (i = 0; i < raw.length; i++) sum += raw[i] * raw[i];
        rms = Math.sqrt(sum / raw.length) || 1;
        scale = 0.18 / rms;
        peak = 0;
        for (i = 0; i < raw.length; i++) {
          raw[i] *= scale;
          peak = Math.max(peak, Math.abs(raw[i]));
        }
        if (peak > 0.95) {
          scale = 0.95 / peak;
          for (i = 0; i < raw.length; i++) raw[i] *= scale;
        }
        data = buffer.getChannelData(c);
        for (i = 0; i < length; i++) {
          mixed = raw[i];
          if (i < fade) {
            t = i / fade;
            mixed = raw[i] * Math.sin(t * Math.PI * 0.5) + raw[length + i] * Math.cos(t * Math.PI * 0.5);
          }
          data[i] = mixed;
        }
      }
      return buffer;
    }

    function playLoop(buffer, type, freq, q, level) {
      var source = ctx.createBufferSource();
      var filter = ctx.createBiquadFilter();
      var gain = ctx.createGain();
      source.buffer = buffer;
      source.loop = true;
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      gain.gain.value = level;
      source.connect(filter);
      filter.connect(gain);
      return { source: source, filter: filter, gain: gain };
    }

    function scheduleDrop(time) {
      var roll = Math.random();
      var freq;
      var q;
      var peak;
      var dur;
      var attack;
      var source;
      var filter;
      var gain;
      var panner;
      if (roll < 0.08) {
        freq = 380 + Math.random() * 900;
        q = 1.4 + Math.random() * 1.6;
        peak = 0.1 + Math.random() * 0.12;
        dur = 0.05 + Math.random() * 0.06;
      } else if (roll < 0.4) {
        freq = 900 + Math.random() * 1800;
        q = 0.8 + Math.random() * 1.4;
        peak = 0.045 + Math.random() * 0.07;
        dur = 0.028 + Math.random() * 0.04;
      } else {
        freq = 2200 + Math.random() * 6200;
        q = 0.6 + Math.random() * 1.2;
        peak = 0.02 + Math.random() * 0.045;
        dur = 0.012 + Math.random() * 0.028;
      }
      attack = Math.min(0.008, dur * 0.25);
      source = ctx.createBufferSource();
      source.buffer = dropBuffer;
      source.playbackRate.value = 0.45 + Math.random() * 1.35;
      filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = freq;
      filter.Q.value = q;
      gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(peak, time + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      source.connect(filter);
      filter.connect(gain);
      if (ctx.createStereoPanner) {
        panner = ctx.createStereoPanner();
        panner.pan.value = Math.random() * 1.7 - 0.85;
        gain.connect(panner);
        panner.connect(muteGain);
      } else {
        gain.connect(muteGain);
      }
      source.start(time);
      source.stop(time + dur + 0.02);
    }

    function pump() {
      if (!ctx) return;
      var horizon = ctx.currentTime + 1.6;
      while (nextDrop < horizon) {
        scheduleDrop(nextDrop);
        nextDrop += Math.random() < 0.07 ? 0.1 + Math.random() * 0.18 : 0.02 + Math.random() * 0.055;
      }
    }

    function start() {
      var compressor;
      var highpass;
      var bed;
      var body;
      var air;
      var lfo;
      var lfoGain;
      var now;
      var resumed;
      if (ctx) {
        resume();
        return;
      }
      ctx = new AudioContext();
      var silent = ctx.createBuffer(1, 1, ctx.sampleRate);
      var unlock = ctx.createBufferSource();
      unlock.buffer = silent;
      unlock.connect(ctx.destination);
      unlock.start(0);
      resumed = ctx.resume();
      if (resumed && resumed.then) {
        resumed.then(function () {
          document.body.dataset.audio = ctx.state;
        });
      }

      highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 35;
      highpass.Q.value = 0.7;
      highpass.connect(ctx.destination);

      muteGain = ctx.createGain();
      muteGain.gain.value = 1;
      muteGain.connect(highpass);

      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 16;
      compressor.ratio.value = 2.2;
      compressor.attack.value = 0.01;
      compressor.release.value = 0.25;
      compressor.connect(muteGain);

      bed = playLoop(makeBuffer(5, "brown", 2), "lowpass", 240, 0.7, 0.62);
      body = playLoop(makeBuffer(6, "pink", 2), "lowpass", 1500, 0.65, 0.42);
      air = playLoop(makeBuffer(4, "white", 2), "highpass", 4200, 0.7, 0.07);
      bed.gain.connect(compressor);
      body.gain.connect(compressor);
      air.gain.connect(compressor);

      lfo = ctx.createOscillator();
      lfo.frequency.value = 0.035;
      lfoGain = ctx.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain);
      lfoGain.connect(body.filter.frequency);
      lfo.start();

      now = ctx.currentTime;
      bed.gain.gain.setValueAtTime(0, now);
      body.gain.gain.setValueAtTime(0, now);
      air.gain.gain.setValueAtTime(0, now);
      bed.gain.gain.linearRampToValueAtTime(0.62, now + 1.2);
      body.gain.gain.linearRampToValueAtTime(0.42, now + 1.2);
      air.gain.gain.linearRampToValueAtTime(0.07, now + 1.2);

      bed.source.start(now);
      body.source.start(now);
      air.source.start(now);

      dropBuffer = makeBuffer(0.25, "white", 1, false);
      nextDrop = now + 0.15;
      pump();
      timer = window.setInterval(pump, 500);
      document.body.dataset.audio = ctx.state;
    }

    function resume() {
      if (ctx && ctx.state !== "running") {
        ctx.resume();
        document.body.dataset.audio = "running";
      }
    }

    function toggleMute() {
      var now;
      var next;
      if (!ctx || !muteGain) return muted;
      muted = !muted;
      now = ctx.currentTime;
      next = muted ? 0 : 1;
      muteGain.gain.cancelScheduledValues(now);
      muteGain.gain.setValueAtTime(muteLevel, now);
      muteGain.gain.linearRampToValueAtTime(next, now + 0.06);
      muteLevel = next;
      if (!muted) resume();
      return muted;
    }

    function state() {
      return ctx ? ctx.state : "pending";
    }

    return {
      start: start,
      resume: resume,
      toggleMute: toggleMute,
      state: state
    };
  }
})();
