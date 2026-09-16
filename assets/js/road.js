/* Autoškola Zavřel: hero jako pohled z místa řidiče */
(() => {
  const canvas = document.querySelector('[data-road]');
  if (!canvas || !canvas.getContext) return;
  const hero = canvas.closest('[data-hero]');
  const copy = hero.querySelector('[data-hero-copy]');
  const wheel = hero.querySelector('[data-wheel]');
  const needleSpeed = hero.querySelector('[data-needle="speed"]');
  const needleRpm = hero.querySelector('[data-needle="rpm"]');
  const dash = hero.querySelector('.dash');
  const screen = hero.querySelector('[data-nav-screen]');
  const sctx = screen ? screen.getContext('2d') : null;
  let SW = 0, SH = 0;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const CAM = 8;
  let W = 0, H = 0, hz = 0, dpr = 1;
  let travel = 0, boost = 0, curve = 0, targetCurve = 0, pointerAt = -1e9, lastT = 0;
  let running = false, inView = true, raf = 0, lastScroll = window.scrollY;
  let speedAngle = -120, rpmAngle = -120;
  const ignitionAt = performance.now() + 1100;
  let nextSignAt = ignitionAt + 2600;
  let signType = 0;
  const signs = [];

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const dOf = (z) => CAM / (z + CAM);
  const depthY = (d) => hz + (H - hz) * d;
  const halfW = (d) => W * (W < 700 ? 0.95 : 0.62) * d + 1;
  const bend = (d) => curve * W * 0.46 * Math.pow(1 - Math.min(d, 1), 2.4) - curve * W * 0.05 * d;
  // jedeme v pravém pruhu, středová čára je vlevo od nás
  const roadX = (d, across) => W / 2 + bend(d) + halfW(d) * (across - 0.5);

  const rrect = (x, y, w, h, r) => {
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  };

  const resize = () => {
    const r = hero.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    W = r.width;
    H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const copyBottom = copy.offsetTop + copy.offsetHeight;
    hz = clamp(copyBottom + 26, H * 0.45, H * 0.72);
    if (screen) {
      SW = screen.clientWidth;
      SH = screen.clientHeight;
      screen.width = Math.round(SW * dpr);
      screen.height = Math.round(SH * dpr);
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (!running) draw(performance.now());
  };

  const samples = [];
  for (let i = 0; i <= 56; i++) samples.push(0.004 + Math.pow(i / 56, 2.1) * 1.1);

  const band = (across, width, d0, d1, fill) => {
    const list = [d0, ...samples.filter((d) => d > d0 && d < d1), d1];
    ctx.beginPath();
    list.forEach((d, i) => {
      const x = roadX(d, across) - W * width * d;
      i ? ctx.lineTo(x, depthY(d)) : ctx.moveTo(x, depthY(d));
    });
    for (let i = list.length - 1; i >= 0; i--) ctx.lineTo(roadX(list[i], across) + W * width * list[i], depthY(list[i]));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };

  const hills = (amp, freq, seed, color, parallax) => {
    ctx.beginPath();
    ctx.moveTo(-W * 0.2, hz + 1);
    for (let x = -W * 0.2; x <= W * 1.2 + 16; x += 16) {
      const xx = x + curve * W * parallax;
      const a = 0.55 + 0.45 * Math.sin(xx * freq + seed);
      const b = 0.65 + 0.35 * Math.sin(xx * freq * 0.41 + seed * 1.7);
      ctx.lineTo(x, hz - amp * a * b);
    }
    ctx.lineTo(W * 1.2, hz + 1);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };

  /* ---------- svět za čelním sklem ---------- */
  const drawWorld = (t, dt, speed) => {
    const sunX = W / 2 + curve * W * 0.2;

    let g = ctx.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, '#08090C');
    g.addColorStop(0.55, '#0D0D10');
    g.addColorStop(1, '#241811');
    ctx.fillStyle = g;
    ctx.fillRect(-W * 0.2, -H * 0.2, W * 1.4, hz + H * 0.2 + 1);
    g = ctx.createRadialGradient(sunX, hz, 0, sunX, hz, Math.max(W, H) * 0.62);
    g.addColorStop(0, 'rgba(255, 170, 110, 0.32)');
    g.addColorStop(0.16, 'rgba(230, 120, 50, 0.12)');
    g.addColorStop(0.45, 'rgba(230, 120, 50, 0.03)');
    g.addColorStop(1, 'rgba(230, 120, 50, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(-W * 0.2, -H * 0.2, W * 1.4, H * 1.4);

    hills(H * 0.07, 0.0036, 1.3, 'rgba(20, 16, 15, 0.96)', 0.1);
    hills(H * 0.038, 0.0082, 4.2, '#0E0B09', 0.2);

    g = ctx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, '#121010');
    g.addColorStop(1, '#070708');
    ctx.fillStyle = g;
    ctx.fillRect(-W * 0.2, hz, W * 1.4, H * 1.2);

    g = ctx.createLinearGradient(0, 0, W, 0);
    const sx = clamp(sunX / W, 0.1, 0.9);
    g.addColorStop(0, 'rgba(255, 150, 60, 0)');
    g.addColorStop(sx, 'rgba(255, 205, 160, 0.45)');
    g.addColorStop(1, 'rgba(255, 150, 60, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(-W * 0.2, hz - 0.75, W * 1.4, 1.5);

    // pole kolem silnice
    const fShift = travel % 5;
    for (let k = 0; k < 30; k++) {
      const z = k * 5 - fShift;
      if (z < 0) continue;
      const d = dOf(z);
      const y = depthY(d);
      ctx.fillStyle = `rgba(255, 235, 215, ${0.035 * d})`;
      ctx.fillRect(-W * 0.2, y, Math.max(0, roadX(d, -1.45) + W * 0.2), Math.max(1, d * 2));
      ctx.fillRect(roadX(d, 1.45), y, W * 1.2, Math.max(1, d * 2));
    }

    // asfalt
    ctx.beginPath();
    samples.forEach((d, i) => (i ? ctx.lineTo(roadX(d, -1), depthY(d)) : ctx.moveTo(roadX(d, -1), depthY(d))));
    for (let i = samples.length - 1; i >= 0; i--) ctx.lineTo(roadX(samples[i], 1), depthY(samples[i]));
    ctx.closePath();
    g = ctx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, '#2C221B');
    g.addColorStop(0.06, '#191614');
    g.addColorStop(1, '#0E0E0F');
    ctx.fillStyle = g;
    ctx.fill();

    // světla našeho auta v jízdním pruhu
    const bd = 0.4;
    const bx = roadX(bd, 0.5);
    const by = depthY(bd);
    const brx = halfW(bd) * 1.05;
    const bry = (H - hz) * 0.3;
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(1, bry / brx);
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, brx);
    g.addColorStop(0, 'rgba(255, 240, 215, 0.11)');
    g.addColorStop(1, 'rgba(255, 240, 215, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(-brx, -brx, brx * 2, brx * 2);
    ctx.restore();

    // vodorovné značení
    band(-0.93, 0.0042, 0.004, 1.1, 'rgba(236, 232, 226, 0.42)');
    band(0.93, 0.0042, 0.004, 1.1, 'rgba(236, 232, 226, 0.42)');
    const period = 7;
    const dash = 3 + Math.min(2.2, boost * 0.45);
    const shift = travel % period;
    for (let k = 0; k < 60; k++) {
      const z0 = k * period - shift;
      const z1 = z0 + dash;
      if (z1 < -1) continue;
      const d0 = dOf(Math.max(z0, -1));
      const d1 = dOf(z1);
      if (d1 < 0.006) break;
      band(0, 0.0046, d1, d0, `rgba(240, 236, 230, ${Math.min(0.85, 0.25 + d0)})`);
    }

    // směrové sloupky
    const pp = 16, ps = travel % pp;
    for (let k = 28; k >= 0; k--) {
      const z = k * pp - ps + 3;
      if (z < -4) continue;
      const d = dOf(z);
      if (d < 0.03 || d > 2) continue;
      const y = depthY(d);
      const h = H * 0.13 * d;
      const w = Math.max(1, W * 0.0055 * d);
      const a = Math.min(1, (d - 0.03) * 5);
      [-1, 1].forEach((side) => {
        const x = roadX(d, side * 1.16);
        ctx.fillStyle = `rgba(222, 216, 208, ${0.6 * a})`;
        ctx.fillRect(x - w / 2, y - h, w, h);
        ctx.fillStyle = `rgba(12, 12, 13, ${a})`;
        ctx.fillRect(x - w / 2, y - h * 0.8, w, h * 0.12);
        ctx.fillStyle = side < 0 ? `rgba(235, 235, 235, ${0.8 * a})` : `rgba(230, 110, 30, ${0.85 * a})`;
        ctx.fillRect(x - w * 0.32, y - h * 0.62, w * 0.64, h * 0.1);
      });
    }

    // dopravní značky vpravo u silnice
    if (!reduceMotion && t > nextSignAt) {
      signs.push({ z: 170, type: signType });
      signType = 1 - signType;
      nextSignAt = t + 15000;
    }
    for (let i = signs.length - 1; i >= 0; i--) {
      const s = signs[i];
      s.z -= speed * dt * 13;
      if (s.z < -3) { signs.splice(i, 1); continue; }
      const d = dOf(s.z);
      if (d < 0.035) continue;
      const a = clamp((d - 0.035) * 8, 0, 1);
      const x = roadX(d, 1.36);
      const y = depthY(d);
      const postH = H * 0.16 * d;
      const sw = W * (s.type ? 0.15 : 0.11) * d;
      const sh = sw * (s.type ? 0.36 : 0.44);
      const top = y - postH - sh;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#5E5D5B';
      ctx.fillRect(x - Math.max(1, W * 0.002 * d), y - postH, Math.max(2, W * 0.004 * d), postH);
      rrect(x - sw / 2, top, sw, sh, sh * 0.08);
      ctx.fillStyle = s.type ? '#1C4FA6' : '#F2F1EC';
      ctx.fill();
      ctx.lineWidth = Math.max(1, sh * 0.06);
      ctx.strokeStyle = s.type ? '#F2F1EC' : '#151515';
      rrect(x - sw / 2 + sh * 0.08, top + sh * 0.08, sw - sh * 0.16, sh * 0.84, sh * 0.06);
      ctx.stroke();
      ctx.fillStyle = s.type ? '#F2F1EC' : '#151515';
      ctx.font = `700 ${Math.max(4, sh * (s.type ? 0.34 : 0.42))}px Arial, Helvetica, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.type ? 'Autoškola Zavřel' : 'Hlinsko', x, top + sh * 0.53);
      ctx.globalAlpha = 1;
    }
  };

  /* ---------- zpětné zrcátko ---------- */
  const drawMirror = (t) => {
    if (W < 560) return;
    const mw = clamp(W * 0.13, 150, 240);
    const mh = mw * 0.3;
    const cx = W / 2;
    const mx = cx - mw / 2;
    const my = Math.max(copy.offsetTop - mh - 22, 74);
    ctx.fillStyle = '#0A0A0B';
    ctx.fillRect(cx - 4, 0, 8, my);
    rrect(mx - 6, my - 6, mw + 12, mh + 12, (mh + 12) * 0.42);
    ctx.fillStyle = '#0C0C0D';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    rrect(mx, my, mw, mh, mh * 0.36);
    ctx.clip();
    const hy = my + mh * 0.5;
    let g = ctx.createLinearGradient(0, my, 0, hy);
    g.addColorStop(0, '#0B0C10');
    g.addColorStop(1, '#2A1B12');
    ctx.fillStyle = g;
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = '#0F0E0E';
    ctx.fillRect(mx, hy, mw, mh);
    const rc = cx - curve * mw * 0.12;
    ctx.beginPath();
    ctx.moveTo(rc - mw * 0.02, hy);
    ctx.lineTo(rc + mw * 0.02, hy);
    ctx.lineTo(rc + mw * 0.5, my + mh);
    ctx.lineTo(rc - mw * 0.62, my + mh);
    ctx.closePath();
    ctx.fillStyle = '#1B1816';
    ctx.fill();
    for (let k = 0; k < 6; k++) {
      const p = 1 - (((k / 6) + travel * 0.018) % 1);
      const f = p * p;
      const y = hy + (my + mh - hy) * f;
      const x = rc - mw * 0.2 * f;
      ctx.fillStyle = `rgba(240, 236, 230, ${0.2 + f * 0.6})`;
      ctx.fillRect(x - 0.6 - f, y, 1.2 + f * 2, Math.max(1, f * mh * 0.12));
    }
    // opěrky zadních sedadel
    ctx.fillStyle = '#070708';
    [0.3, 0.7].forEach((px) => {
      rrect(mx + mw * px - mw * 0.1, my + mh * 0.66, mw * 0.2, mh * 0.5, mh * 0.14);
      ctx.fill();
    });
    ctx.restore();
    rrect(mx, my, mw, mh, mh * 0.36);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();
  };

  /* ---------- stěrače u spodní hrany skla ---------- */
  const drawWipers = () => {
    if (!dash) return;
    const dh = dash.offsetHeight;
    const top = H - dh;
    const surface = (fx) => top + dh * (20 + 54 * Math.pow(Math.abs(fx - 0.5) * 2, 1.8)) / 300;
    ctx.lineCap = 'round';
    [[0.14, 0.45], [0.53, 0.84]].forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(W * a, surface(a) - 3);
      ctx.lineTo(W * b, surface(b) - 9);
      ctx.strokeStyle = '#040405';
      ctx.lineWidth = Math.max(3, W * 0.0028);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(W * a, surface(a) - 6);
      ctx.lineTo(W * b, surface(b) - 12);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  };

  /* ---------- displej navigace na palubní desce ---------- */
  const drawScreen = () => {
    if (!sctx || !SW || screen.offsetParent === null) return;
    const c = sctx;
    c.fillStyle = '#0E1116';
    c.fillRect(0, 0, SW, SH);
    const off = (travel * 3) % 30;
    c.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    c.lineWidth = 3;
    for (let k = -1; k < SH / 30 + 2; k++) {
      const yy = k * 30 + off;
      c.beginPath();
      c.moveTo(0, yy);
      c.lineTo(SW, yy - 12);
      c.stroke();
    }
    c.lineWidth = 2;
    [0.2, 0.82].forEach((px) => {
      c.beginPath();
      c.moveTo(SW * px, 0);
      c.lineTo(SW * px + 8, SH);
      c.stroke();
    });
    const carX = SW * 0.5;
    const carY = SH * 0.8;
    c.beginPath();
    c.moveTo(carX, carY);
    c.bezierCurveTo(carX, carY - SH * 0.3, carX + curve * SW * 0.35, carY - SH * 0.45, carX + curve * SW * 0.3, -4);
    c.strokeStyle = '#FF8114';
    c.lineWidth = 4;
    c.lineCap = 'round';
    c.stroke();
    c.beginPath();
    c.moveTo(carX, carY - 9);
    c.lineTo(carX + 7, carY + 7);
    c.lineTo(carX, carY + 3);
    c.lineTo(carX - 7, carY + 7);
    c.closePath();
    c.fillStyle = '#FFFFFF';
    c.fill();
    c.fillStyle = 'rgba(10, 10, 11, 0.78)';
    c.fillRect(0, 0, SW, 22);
    c.fillStyle = 'rgba(245, 243, 238, 0.85)';
    c.font = '600 11px Manrope, system-ui, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText('Hlinsko', 10, 11);
    c.fillStyle = '#FF8114';
    c.beginPath();
    c.arc(SW - 14, 11, 3.5, 0, Math.PI * 2);
    c.fill();
  };

  function draw(t) {
    const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000)) || 0.016;
    lastT = t;

    const auto = Math.sin(t * 0.00021) * 0.5 + Math.sin(t * 0.00057 + 1.3) * 0.18;
    const goal = t - pointerAt < 2600 ? targetCurve : auto;
    curve += (goal - curve) * Math.min(1, dt * 1.5);
    boost *= Math.pow(0.2, dt);
    const speed = 1 + boost;
    travel += speed * dt * 13;

    ctx.fillStyle = '#08090C';
    ctx.fillRect(0, 0, W, H);

    // lehké naklonění v zatáčce a otřesy vozovky
    const bump = reduceMotion ? 0 : (Math.sin(t * 0.013) * 0.5 + Math.sin(t * 0.031) * 0.35) * (0.7 + boost * 0.25);
    ctx.save();
    ctx.translate(W / 2, hz);
    ctx.rotate(-curve * 0.02);
    ctx.translate(-W / 2, -hz + bump);
    drawWorld(t, dt, speed);
    ctx.restore();

    drawWipers();
    drawMirror(t);
    drawScreen();

    if (wheel) wheel.style.transform = `rotate(${(curve * 62).toFixed(2)}deg)`;
    const since = (t - ignitionAt) / 1000;
    if (reduceMotion) {
      speedAngle = -55;
      rpmAngle = -70;
    } else if (since < 0) {
      speedAngle = rpmAngle = -120;
    } else if (since < 1.6) {
      speedAngle = rpmAngle = -120 + 240 * Math.sin(Math.PI * (since / 1.6));
    } else {
      const k = Math.min(1, dt * 3);
      speedAngle += (clamp(-58 + boost * 26, -120, 112) - speedAngle) * k;
      rpmAngle += (clamp(-72 + boost * 30 + Math.sin(t * 0.004) * 3, -120, 116) - rpmAngle) * k;
    }
    if (needleSpeed) needleSpeed.setAttribute('transform', `rotate(${speedAngle.toFixed(1)} 122 124)`);
    if (needleRpm) needleRpm.setAttribute('transform', `rotate(${rpmAngle.toFixed(1)} 278 124)`);
  }

  const loop = (t) => {
    draw(t);
    raf = requestAnimationFrame(loop);
  };
  const start = () => {
    if (running || reduceMotion || !inView || document.hidden) return;
    running = true;
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  if (finePointer) {
    hero.addEventListener('pointermove', (e) => {
      targetCurve = (e.clientX / window.innerWidth - 0.5) * 2;
      pointerAt = performance.now();
    });
  }
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    boost = Math.min(7, boost + Math.abs(y - lastScroll) * 0.025);
    lastScroll = y;
  }, { passive: true });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      inView ? start() : stop();
    }).observe(hero);
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(hero);
  else window.addEventListener('resize', resize);
  if (document.fonts) document.fonts.ready.then(resize);

  resize();
  start();
})();
