/**
 * Full-screen rain ambience.
 * Sound is synthesized with the Web Audio API (looped filtered noise
 * plus soft droplet taps). There is no audio file and no license.
 *
 * The picture is intentionally calm: few drops, one gentle vertical layer,
 * and dim blue-grey streaks on pure black, so the motion does not rush or lean.
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
    var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    var reduced = motionQuery.matches;
    var drops = [];
    var splashes = [];
    var splashCursor = 0;
    var splashPool = 160;
    var width = 0;
    var height = 0;
    var dpr = 1;
    var running = true;
    var last = 0;
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
        alpha: 0.3
      });
    }

    function rand(min, max) {
      return min + Math.random() * (max - min);
    }

    function look() {
      if (reduced) {
        return {
          len: [6, 11],
          speed: [48, 72],
          alpha: [0.08, 0.15],
          width: [0.4, 0.65],
          splash: 0.65
        };
      }
      return {
        len: [8, 15],
        speed: [100, 150],
        alpha: [0.1, 0.2],
        width: [0.45, 0.75],
        splash: 0.8
      };
    }

    function targetCount() {
      var area = width * 0.5 + height * 0.06;
      var count = Math.round(Math.min(240, Math.max(32, area * 0.26)));
      if (reduced) count = Math.max(14, Math.round(count * 0.4));
      return count;
    }

    function configureDrop(drop, scatter) {
      var style = look();
      drop.len = rand(style.len[0], style.len[1]);
      drop.speed = rand(style.speed[0], style.speed[1]);
      drop.alpha = rand(style.alpha[0], style.alpha[1]);
      drop.w = rand(style.width[0], style.width[1]);
      drop.splash = style.splash;
      drop.hit = false;
      drop.x = Math.random() * width;
      drop.y = scatter ? Math.random() * height : -drop.len - Math.random() * 40;
    }

    function rebuild(scatter) {
      var total = targetCount();
      var k;
      drops.length = 0;
      for (k = 0; k < total; k++) {
        var drop = {};
        configureDrop(drop, scatter);
        drops.push(drop);
      }
      document.body.dataset.drops = String(drops.length);
      document.body.dataset.motion = reduced ? "reduce" : "no-preference";
    }

    function paintBackground() {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);
    }

    function resize() {
      var nextW = canvas.clientWidth || window.innerWidth;
      var nextH = canvas.clientHeight || window.innerHeight;
      var nextDpr = Math.min(window.devicePixelRatio || 1, 2);
      var prevW = width;
      var prevH = height;
      var sx;
      var sy;
      var n;
      var nextTotal;
      nextW = Math.max(1, Math.round(nextW));
      nextH = Math.max(1, Math.round(nextH));
      if (nextW === width && nextH === height && nextDpr === dpr && drops.length) return;
      width = nextW;
      height = nextH;
      dpr = nextDpr;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nextTotal = targetCount();
      if (!drops.length || Math.abs(drops.length - nextTotal) > Math.max(8, drops.length * 0.2)) {
        rebuild(true);
      } else if (prevW > 0 && prevH > 0) {
        sx = width / prevW;
        sy = height / prevH;
        for (n = 0; n < drops.length; n++) {
          drops[n].x *= sx;
          drops[n].y *= sy;
        }
        document.body.dataset.drops = String(drops.length);
      }
    }

    function spawnSplash(x, y) {
      var count = reduced ? 1 : 2;
      var n;
      var dir = Math.random() < 0.5 ? -1 : 1;
      for (n = 0; n < count; n++) {
        var splash = splashes[splashCursor];
        splashCursor = (splashCursor + 1) % splashes.length;
        splash.alive = true;
        splash.x = x + rand(-0.6, 0.6);
        splash.y = y;
        splash.vx = dir * rand(12, 36);
        splash.vy = -rand(6, 18);
        splash.life = splash.max = rand(0.45, 0.75);
        splash.w = rand(0.45, 0.75);
        splash.len = rand(3, 5.5);
        splash.alpha = rand(0.22, 0.36);
        dir = -dir;
      }
    }

    function frame(now) {
      var dt;
      var i;
      var drop;
      var splash;
      var age;
      var envelope;
      var mag;
      if (!running) return;
      raf = 0;
      if (!last) last = now;
      dt = Math.min(0.034, (now - last) / 1000);
      last = now;

      paintBackground();
      ctx.lineCap = "round";
      ctx.strokeStyle = "#9aafc3";

      for (i = 0; i < drops.length; i++) {
        drop = drops[i];
        drop.y += drop.speed * dt;

        if (!drop.hit && drop.y >= height) {
          drop.hit = true;
          if (drop.x >= 0 && drop.x <= width && Math.random() < drop.splash) {
            spawnSplash(drop.x, height - 3);
          }
        }
        if (drop.y - drop.len > height) {
          drop.hit = false;
          drop.y = -drop.len - Math.random() * 30;
          drop.x = Math.random() * width;
        }

        ctx.beginPath();
        ctx.globalAlpha = drop.alpha;
        ctx.lineWidth = drop.w;
        ctx.moveTo(drop.x, drop.y - drop.len);
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
        splash.vy += 48 * dt;
        age = 1 - splash.life / splash.max;
        envelope = Math.sin(age * Math.PI);
        mag = Math.hypot(splash.vx, splash.vy) || 1;
        ctx.beginPath();
        ctx.globalAlpha = splash.alpha * envelope;
        ctx.lineWidth = splash.w;
        ctx.moveTo(splash.x, splash.y);
        ctx.lineTo(
          splash.x - (splash.vx / mag) * splash.len * envelope,
          splash.y - (splash.vy / mag) * splash.len * 0.35 * envelope
        );
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }

    function startLoop() {
      if (!raf) raf = requestAnimationFrame(frame);
    }

    function onMotionChange() {
      reduced = motionQuery.matches;
      rebuild(true);
    }

    function start() {
      resize();
      window.addEventListener("resize", resize);
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", resize);
      }
      if (motionQuery.addEventListener) {
        motionQuery.addEventListener("change", onMotionChange);
      } else if (motionQuery.addListener) {
        motionQuery.addListener(onMotionChange);
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
    var dropBus = null;
    var muteLevel = 0.62;
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
      var freq = 360 + Math.random() * 780;
      var peak = 0.012 + Math.random() * 0.02;
      var dur = 0.07 + Math.random() * 0.09;
      var attack = Math.min(0.02, dur * 0.3);
      var source = ctx.createBufferSource();
      var filter = ctx.createBiquadFilter();
      var gain = ctx.createGain();
      var panner = null;
      source.buffer = dropBuffer;
      source.playbackRate.value = 0.32 + Math.random() * 0.38;
      filter.type = "lowpass";
      filter.frequency.value = freq;
      filter.Q.value = 0.5;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(peak, time + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      source.connect(filter);
      filter.connect(gain);
      if (ctx.createStereoPanner) {
        panner = ctx.createStereoPanner();
        panner.pan.value = Math.random() * 0.7 - 0.35;
        gain.connect(panner);
        panner.connect(dropBus);
      } else {
        gain.connect(dropBus);
      }
      source.start(time);
      source.stop(time + dur + 0.03);
    }

    function pump() {
      if (!ctx) return;
      var horizon = ctx.currentTime + 1.6;
      while (nextDrop < horizon) {
        scheduleDrop(nextDrop);
        nextDrop += 0.18 + Math.random() * 0.28;
      }
    }

    function start() {
      var compressor;
      var tone;
      var highpass;
      var bed;
      var body;
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
      highpass.frequency.value = 45;
      highpass.Q.value = 0.7;
      highpass.connect(ctx.destination);

      muteGain = ctx.createGain();
      muteGain.gain.value = 0.62;
      muteGain.connect(highpass);

      tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      tone.frequency.value = 900;
      tone.Q.value = 0.5;
      tone.connect(muteGain);

      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -28;
      compressor.knee.value = 18;
      compressor.ratio.value = 1.3;
      compressor.attack.value = 0.03;
      compressor.release.value = 0.4;
      compressor.connect(tone);

      bed = playLoop(makeBuffer(5, "brown", 2), "lowpass", 180, 0.7, 0.28);
      body = playLoop(makeBuffer(6, "pink", 2), "lowpass", 620, 0.6, 0.16);
      bed.gain.connect(compressor);
      body.gain.connect(compressor);

      lfo = ctx.createOscillator();
      lfo.frequency.value = 0.02;
      lfoGain = ctx.createGain();
      lfoGain.gain.value = 40;
      lfo.connect(lfoGain);
      lfoGain.connect(body.filter.frequency);
      lfo.start();

      now = ctx.currentTime;
      bed.gain.gain.setValueAtTime(0, now);
      body.gain.gain.setValueAtTime(0, now);
      bed.gain.gain.linearRampToValueAtTime(0.28, now + 2.4);
      body.gain.gain.linearRampToValueAtTime(0.16, now + 2.4);

      bed.source.start(now);
      body.source.start(now);

      dropBus = ctx.createGain();
      dropBus.gain.value = 0.7;
      dropBus.connect(compressor);

      dropBuffer = makeBuffer(0.25, "white", 1, false);
      nextDrop = now + 0.4;
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
      next = muted ? 0 : 0.62;
      muteGain.gain.cancelScheduledValues(now);
      muteGain.gain.setValueAtTime(muteLevel, now);
      muteGain.gain.linearRampToValueAtTime(next, now + 0.12);
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
