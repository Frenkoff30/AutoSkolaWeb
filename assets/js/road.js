/* Autoškola Zavřel: hero jako pohled z místa řidiče
   Levý sloupek s bočním oknem, naznačeným zrcátkem a vnitřkem dveří, palubní deska
   s přístrojovým štítem, velký volant s logem a tablet s navigací uprostřed desky.
   Vše se kreslí do canvasu. Rozměry kabiny se odvozují od výšky i šířky,
   takže se na mobilu nic nenatahuje, jen se ukáže užší výřez. */
(() => {
  const canvas = document.querySelector('[data-road]');
  if (!canvas || !canvas.getContext) return;
  const hero = canvas.closest('[data-hero]');
  const copy = hero.querySelector('[data-hero-copy]');
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const ORANGE = '#FF8114';
  const CAM = 8;     // hloubka kamery ve světových jednotkách
  const EYE = 1.3;   // výška očí řidiče v metrech
  const SEAT = 0.42; // řidič sedí kousek vlevo od středu pruhu

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
  const TAU = Math.PI * 2;
  // deterministický šum, aby mraky vypadaly při každém načtení stejně
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  let W = 0, H = 0, hz = 0, dpr = 1;
  let travel = 0, boost = 0, curve = 0, targetCurve = 0, pointerAt = -1e9, lastT = 0;
  let running = false, inView = true, raf = 0, lastScroll = window.scrollY;
  let loadedAt = reduceMotion ? -1e6 : 0;
  let speedAngle = -120, rpmAngle = -120, kmh = 0, kmhAt = 0;
  let nextSignAt = 0, signType = 0;
  let hazard = false, hazardAt = 0;
  const signs = [];
  const G = {};
  const frameLayer = document.createElement('canvas');
  const dashLayer = document.createElement('canvas');
  const wheelLayer = document.createElement('canvas');
  const skyLayer = document.createElement('canvas');
  const SKY = { x: 0, y: 0, w: 0, h: 0 };

  const rrect = (c, x, y, w, h, r) => {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  };
  const trace = (c, fn, x0, x1, move) => {
    const n = Math.max(8, Math.ceil(Math.abs(x1 - x0) / 18));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      if (i === 0 && move) c.moveTo(x, fn(x));
      else c.lineTo(x, fn(x));
    }
  };

  /* ---------- projekce silnice ---------- */
  const dOf = (z) => CAM / (z + CAM);
  const depthY = (d) => hz + (H - hz) * d;
  const meter = (d) => ((H - hz) * d) / EYE;
  const bend = (d) => curve * W * 0.4 * Math.pow(1 - Math.min(d, 1), 2.4) - curve * W * 0.04 * d;
  const roadX = (d, across) => W / 2 + bend(d) + meter(d) * G.lane * (across - SEAT);

  // horní hrana palubní desky (klesá k okrajům) a kapoty
  const dashAt = (x) => G.dashY + G.drop * Math.pow((x - W / 2) / (W / 2), 2);
  const hoodAt = (x) => dashAt(x) - G.hood * (1 - 0.4 * Math.pow((x - W / 2) / (W / 2), 2));

  /* ---------- rozložení kabiny ---------- */
  const layout = () => {
    const p = clamp((1.3 - W / H) / 0.75, 0, 1); // 0 na šířku, 1 telefon na výšku
    G.p = p;
    const blocks = Array.from(copy.querySelectorAll('.line, .hero__actions')).map((el) => {
      let x = 0, y = 0, n = el;
      while (n && n !== hero) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      return { l: x, r: x + el.offsetWidth, t: y, b: y + el.offsetHeight };
    });
    const copyTop = copy.offsetTop;
    const copyBottom = copyTop + copy.offsetHeight;
    G.shade = {
      x: copy.offsetLeft + copy.offsetWidth / 2,
      y: copyTop + copy.offsetHeight * 0.45,
      rx: Math.max(copy.offsetWidth * 0.72, 180),
      ry: copy.offsetHeight * 0.9,
    };

    hz = clamp(copyBottom + lerp(40, 26, p), H * 0.3, H * 0.72);
    G.lane = lerp(3.5, 2.3, p);

    // volant celý i se středem, kousek vlevo, aby uprostřed desky zbylo místo na tablet
    const roadMin = H * lerp(0.13, 0.12, p);
    let R = Math.min(H * 0.3, W * lerp(0.15, 0.48, p), (H - hz - roadMin) / 1.16);
    R = Math.max(R, Math.min(W * 0.3, 120));
    G.R = R;
    G.cx = W * lerp(0.43, 0.5, p);
    G.cy = H - 0.06 * R;
    G.drop = H * lerp(0.05, 0.02, p);
    G.dashY = G.cy - 1.1 * R - G.drop * Math.pow((G.cx - W / 2) / (W / 2), 2);
    G.hood = H * lerp(0.016, 0.012, p);

    // levý A sloupek s bočním oknem; nesmí zasahovat do textu
    let tO = W * lerp(0.02, -0.3, p);
    let tI = W * lerp(0.135, -0.08, p);
    let bO = W * lerp(0.225, -0.06, p);
    let bI = W * lerp(0.3, 0.05, p);
    if (p < 0.5 && blocks.length) {
      const baseY = dashAt(bI);
      const edgeAt = (y) => tI + (bI - tI) * clamp(y / baseY, 0, 1);
      const over = Math.max(...blocks.map((b) => edgeAt(b.b) + 28 - b.l));
      if (over > 0) { tO -= over; tI -= over; bO -= over; bI -= over; }
    }
    G.pillar = { tO, tI, bO, bI };
    G.beltAt = (x) => dashAt(bO) + (bO - x) * 0.3 * (H / W);
    G.side = null;
    if (p < 0.5 && bO > W * 0.1) {
      const w = clamp(bO * 0.62, 90, 190), h = w * 0.62;
      const x = bO - w - W * 0.018;
      G.side = { x, y: G.beltAt(x + w * 0.6) - h * 0.85, w, h };
    }

    // vnitřní zpětné zrcátko, jen naznačené
    G.mirror = null;
    if (W >= 700 && p < 0.85) {
      const w = clamp(W * 0.12, 140, 230), h = w * 0.3;
      let x = W * lerp(0.79, 0.83, p) - w / 2;
      const y = H * lerp(0.11, 0.085, p);
      const rows = blocks.filter((b) => y + h > b.t - 14 && y < b.b + 14);
      if (rows.length) x = Math.max(x, Math.max(...rows.map((b) => b.r)) + 28);
      if (x + w * 0.7 <= W) G.mirror = { x, y, w, h };
    }

    // tablet uprostřed desky, vedle něj výstražná světla a větrák
    G.screen = null;
    G.hazard = null;
    G.vent = null;
    if (p < 0.6) {
      const left = G.cx + R + W * 0.03;
      let sw = Math.min(clamp(W * 0.17, 220, 340), (W * 0.97 - left) * 0.72);
      let sh = sw * 0.6;
      const y = dashAt(left + sw / 2) + H * 0.02;
      if (y + sh > H - 10) { sh = H - 10 - y; sw = sh / 0.6; }
      if (sw >= 170) {
        G.screen = { x: left, y, w: sw, h: sh };
        const rest = W - (left + sw);
        if (rest > 140) {
          const r = clamp(sw * 0.045, 9, 15);
          G.hazard = { x: left + sw + Math.min(rest * 0.2, 40), y: y + sh * 0.5, r };
          const vx = G.hazard.x + r + 20;
          const vw = Math.min(150, W * 0.97 - vx);
          if (vw > 70) G.vent = { x: vx, y: y + sh * 0.5 - vw * 0.2, w: vw, h: vw * 0.4 };
        }
      }
    }

    // přístrojový štít
    G.gauges = [-1, 1].map((s) => ({ x: G.cx + s * 0.4 * R, y: G.cy - 0.55 * R, r: 0.25 * R }));
  };

  /* ---------- statické vrstvy ---------- */
  const prepare = (layer) => {
    layer.width = Math.max(1, Math.round(W * dpr));
    layer.height = Math.max(1, Math.round(H * dpr));
    const c = layer.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    return c;
  };

  // sklo zrcátka bez odrazu, jen jemný lesk
  const glass = (c, x, y, w, h, r) => {
    rrect(c, x, y, w, h, r);
    const g = c.createLinearGradient(x, y, x + w * 0.4, y + h);
    g.addColorStop(0, '#1D1E23');
    g.addColorStop(1, '#0B0B0D');
    c.fillStyle = g;
    c.fill();
    c.save();
    rrect(c, x, y, w, h, r);
    c.clip();
    c.beginPath();
    c.moveTo(x + w * 0.2, y);
    c.lineTo(x + w * 0.32, y);
    c.lineTo(x + w * 0.16, y + h);
    c.lineTo(x + w * 0.04, y + h);
    c.closePath();
    c.fillStyle = 'rgba(255, 255, 255, 0.05)';
    c.fill();
    c.restore();
  };

  const paintFrame = () => {
    const c = prepare(frameLayer);
    const P = G.pillar;

    // tónovaný pruh u horní hrany čelního skla
    let g = c.createLinearGradient(0, 0, 0, H * 0.24);
    g.addColorStop(0, 'rgba(4, 4, 6, 0.6)');
    g.addColorStop(1, 'rgba(4, 4, 6, 0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H * 0.24);

    // boční okno u řidiče
    c.beginPath();
    c.moveTo(-4, -4);
    c.lineTo(P.tO, -4);
    c.lineTo(P.bO, dashAt(P.bO));
    c.lineTo(-4, G.beltAt(-4));
    c.closePath();
    c.fillStyle = 'rgba(4, 4, 6, 0.5)';
    c.fill();

    // naznačené boční zrcátko
    const S = G.side;
    if (S) {
      c.beginPath();
      c.moveTo(S.x + S.w * 0.7, S.y + S.h * 0.45);
      c.lineTo(P.bO + 2, dashAt(P.bO) - S.h * 0.3);
      c.lineTo(P.bO + 2, dashAt(P.bO) + 4);
      c.lineTo(S.x + S.w * 0.7, S.y + S.h * 0.9);
      c.closePath();
      c.fillStyle = '#08080A';
      c.fill();
      rrect(c, S.x, S.y, S.w, S.h, S.h * 0.42);
      c.fillStyle = '#0A0A0C';
      c.fill();
      c.strokeStyle = 'rgba(255, 255, 255, 0.09)';
      c.lineWidth = 1;
      c.stroke();
      glass(c, S.x + S.h * 0.12, S.y + S.h * 0.12, S.w - S.h * 0.24, S.h * 0.76, S.h * 0.32);
    }

    // A sloupek se světlejší vnitřní plochou
    const mT = lerp(P.tO, P.tI, 0.55), mB = lerp(P.bO, P.bI, 0.5);
    c.beginPath();
    c.moveTo(P.tO, -4);
    c.lineTo(P.tI, -4);
    c.lineTo(P.bI, dashAt(P.bI) + 6);
    c.lineTo(P.bO, dashAt(P.bO) + 6);
    c.closePath();
    c.fillStyle = '#060607';
    c.fill();
    c.beginPath();
    c.moveTo(mT, -4);
    c.lineTo(P.tI, -4);
    c.lineTo(P.bI, dashAt(P.bI) + 6);
    c.lineTo(mB, dashAt(mB) + 6);
    c.closePath();
    g = c.createLinearGradient(P.tI, 0, P.bI, H);
    g.addColorStop(0, '#18181B');
    g.addColorStop(1, '#101012');
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1;
    [[P.tI, P.bI, 0.1], [mT, mB, 0.045], [P.tO, P.bO, 0.05]].forEach(([a, b, alpha]) => {
      c.beginPath();
      c.moveTo(a, -4);
      c.lineTo(b, dashAt(b));
      c.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      c.stroke();
    });

    // zpětné zrcátko
    const M = G.mirror;
    if (M) {
      rrect(c, M.x + M.w * 0.47, -4, M.w * 0.06, M.y + 8, 3);
      c.fillStyle = '#0A0A0B';
      c.fill();
      rrect(c, M.x - 6, M.y - 6, M.w + 12, M.h + 12, (M.h + 12) * 0.42);
      c.fillStyle = '#0C0C0E';
      c.fill();
      c.strokeStyle = 'rgba(255, 255, 255, 0.09)';
      c.lineWidth = 1;
      c.stroke();
      glass(c, M.x, M.y, M.w, M.h, M.h * 0.36);
    }
  };

  const paintDash = () => {
    const c = prepare(dashLayer);
    const { cx, cy, R } = G;
    const P = G.pillar;

    // kapota s odrazem západu
    c.beginPath();
    trace(c, hoodAt, P.bI - 4, W + 4, true);
    trace(c, (x) => dashAt(x) + 2, W + 4, P.bI - 4, false);
    c.closePath();
    let g = c.createLinearGradient(0, G.dashY - G.hood, 0, G.dashY + 2);
    g.addColorStop(0, '#1E1611');
    g.addColorStop(1, '#0B0B0C');
    c.fillStyle = g;
    c.fill();
    g = c.createRadialGradient(W / 2, G.dashY, 0, W / 2, G.dashY, W * 0.4);
    g.addColorStop(0, 'rgba(255, 150, 80, 0.14)');
    g.addColorStop(1, 'rgba(255, 150, 80, 0)');
    c.fillStyle = g;
    c.fill();

    // palubní deska, pod bočním oknem přechází do dveří
    c.beginPath();
    trace(c, dashAt, P.bO, W + 4, true);
    c.lineTo(W + 4, H + 4);
    c.lineTo(-4, H + 4);
    c.lineTo(-4, G.beltAt(-4));
    c.closePath();
    g = c.createLinearGradient(0, G.dashY, 0, H);
    g.addColorStop(0, '#1C1C1F');
    g.addColorStop(0.2, '#121214');
    g.addColorStop(1, '#060607');
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1;
    c.beginPath();
    trace(c, dashAt, Math.max(P.bO, -4), W + 4, true);
    c.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    c.stroke();
    // plocha desky a její čelo
    const faceAt = (x) => dashAt(x) + (H - G.dashY) * 0.3;
    c.beginPath();
    trace(c, faceAt, Math.max(P.bO, -4), W + 4, true);
    c.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    c.stroke();
    if (cx + R * 1.04 < W - 40) {
      c.beginPath();
      trace(c, (x) => faceAt(x) + 7, cx + R * 1.04, W * 0.99, true);
      c.strokeStyle = 'rgba(255, 129, 20, 0.6)';
      c.lineWidth = 2;
      c.lineCap = 'round';
      c.stroke();
    }
    if (P.bO > 0 && cx - R * 1.04 > P.bO + 40) {
      c.beginPath();
      trace(c, (x) => faceAt(x) + 7, P.bO + 20, cx - R * 1.04, true);
      c.strokeStyle = 'rgba(255, 129, 20, 0.35)';
      c.lineWidth = 2;
      c.lineCap = 'round';
      c.stroke();
    }

    // vnitřek dveří: parapet, klika, loketní opěrka a spára k desce
    if (P.bO > W * 0.08) {
      const topY = dashAt(P.bO);
      const seamB = P.bO - W * 0.014;
      const doorPath = () => {
        c.beginPath();
        c.moveTo(-4, G.beltAt(-4));
        c.lineTo(P.bO, topY);
        c.lineTo(seamB, H + 4);
        c.lineTo(-4, H + 4);
        c.closePath();
      };
      doorPath();
      g = c.createLinearGradient(0, topY, 0, H);
      g.addColorStop(0, '#131315');
      g.addColorStop(1, '#070708');
      c.fillStyle = g;
      c.fill();
      c.save();
      doorPath();
      c.clip();
      const sill = Math.max(10, H * 0.02);
      c.beginPath();
      c.moveTo(-4, G.beltAt(-4));
      c.lineTo(P.bO, topY);
      c.lineTo(P.bO, topY + sill);
      c.lineTo(-4, G.beltAt(-4) + sill);
      c.closePath();
      c.fillStyle = '#1A1A1D';
      c.fill();
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(-4, G.beltAt(-4));
      c.lineTo(P.bO, topY);
      c.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      c.stroke();
      c.beginPath();
      c.moveTo(-4, G.beltAt(-4) + sill);
      c.lineTo(P.bO, topY + sill);
      c.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      c.stroke();
      const low = (x, k) => G.beltAt(x) + (H - G.beltAt(x)) * k;
      c.beginPath();
      c.moveTo(P.bO, low(P.bO, 0.64));
      c.lineTo(-4, low(-4, 0.72));
      c.lineTo(-4, H + 4);
      c.lineTo(P.bO, H + 4);
      c.closePath();
      c.fillStyle = 'rgba(255, 255, 255, 0.03)';
      c.fill();
      c.beginPath();
      c.moveTo(P.bO, low(P.bO, 0.64));
      c.lineTo(-4, low(-4, 0.72));
      c.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      c.stroke();
      const hw = Math.min(W * 0.06, P.bO * 0.32), hh = Math.max(8, hw * 0.17);
      const hx = P.bO * 0.55, hy = low(hx, 0.38);
      rrect(c, hx - hw / 2, hy - hh / 2, hw, hh, hh / 2);
      c.fillStyle = '#050506';
      c.fill();
      c.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      c.stroke();
      rrect(c, hx - hw * 0.34, hy - hh * 0.16, hw * 0.68, hh * 0.32, hh * 0.16);
      c.fillStyle = 'rgba(255, 255, 255, 0.13)';
      c.fill();
      c.restore();
      c.beginPath();
      c.moveTo(P.bO, topY);
      c.lineTo(seamB, H + 4);
      c.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      c.lineWidth = 2;
      c.stroke();
      c.beginPath();
      c.moveTo(P.bO + 2, topY);
      c.lineTo(seamB + 2, H + 4);
      c.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      c.lineWidth = 1;
      c.stroke();
    }

    // kryt budíků
    const dome = (k, top) => {
      c.beginPath();
      c.moveTo(cx - k * R, cy - 0.08 * R);
      c.bezierCurveTo(cx - k * R, cy - (top - 0.28) * R, cx - k * 0.66 * R, cy - top * R, cx, cy - top * R);
      c.bezierCurveTo(cx + k * 0.66 * R, cy - top * R, cx + k * R, cy - (top - 0.28) * R, cx + k * R, cy - 0.08 * R);
      c.closePath();
    };
    dome(0.98, 1.06);
    g = c.createLinearGradient(0, cy - 1.06 * R, 0, cy);
    g.addColorStop(0, '#161618');
    g.addColorStop(1, '#0B0B0C');
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    c.lineWidth = 1.5;
    c.stroke();
    dome(0.9, 0.96);
    c.fillStyle = '#050506';
    c.fill();

    // budíky
    G.gauges.forEach((gg) => {
      c.beginPath();
      c.arc(gg.x, gg.y, gg.r, 0, TAU);
      c.fillStyle = '#09090A';
      c.fill();
      c.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      c.lineWidth = 1.5;
      c.stroke();
      c.strokeStyle = 'rgba(245, 243, 238, 0.55)';
      c.lineWidth = Math.max(1.2, gg.r * 0.06);
      c.lineCap = 'butt';
      for (let k = 0; k <= 16; k++) {
        const a = ((-120 + k * 15) * Math.PI) / 180;
        const sx = Math.sin(a), sy = -Math.cos(a);
        c.beginPath();
        c.moveTo(gg.x + sx * gg.r * 0.78, gg.y + sy * gg.r * 0.78);
        c.lineTo(gg.x + sx * gg.r * 0.86, gg.y + sy * gg.r * 0.86);
        c.stroke();
      }
      c.beginPath();
      c.arc(gg.x, gg.y, gg.r * 0.66, (-10 * Math.PI) / 180, (30 * Math.PI) / 180);
      c.strokeStyle = ORANGE;
      c.lineWidth = Math.max(1.5, gg.r * 0.045);
      c.lineCap = 'round';
      c.stroke();
    });

    // štítek L
    const ls = 0.11 * R;
    const lx = cx - ls / 2, ly = cy - 0.84 * R;
    rrect(c, lx, ly, ls, ls, ls * 0.14);
    c.fillStyle = '#1C4FA6';
    c.fill();
    c.beginPath();
    c.moveTo(lx + ls * 0.32, ly + ls * 0.22);
    c.lineTo(lx + ls * 0.32, ly + ls * 0.76);
    c.lineTo(lx + ls * 0.72, ly + ls * 0.76);
    c.strokeStyle = '#FFFFFF';
    c.lineWidth = Math.max(1.2, ls * 0.13);
    c.lineCap = 'square';
    c.lineJoin = 'miter';
    c.stroke();

    // tablet, výstražná světla a větrák
    const T = G.screen;
    if (T) {
      g = c.createLinearGradient(0, T.y + T.h, 0, T.y + T.h + 26);
      g.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      c.fillStyle = g;
      c.fillRect(T.x, T.y + T.h, T.w, 26);
      rrect(c, T.x - 7, T.y - 7, T.w + 14, T.h + 14, 18);
      c.fillStyle = '#0A0A0B';
      c.fill();
      c.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      c.lineWidth = 1;
      c.stroke();
    }
    const Z = G.hazard;
    if (Z) {
      c.beginPath();
      c.arc(Z.x, Z.y, Z.r, 0, TAU);
      c.fillStyle = '#0D0D0F';
      c.fill();
      c.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      c.lineWidth = 1;
      c.stroke();
    }
    const V = G.vent;
    if (V) {
      rrect(c, V.x, V.y, V.w, V.h, V.h * 0.28);
      c.fillStyle = '#08080A';
      c.fill();
      c.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      c.lineWidth = 1;
      c.stroke();
      c.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      c.lineWidth = Math.max(2, V.h * 0.06);
      c.lineCap = 'round';
      for (let k = 1; k <= 3; k++) {
        const y = V.y + (V.h * k) / 4;
        c.beginPath();
        c.moveTo(V.x + V.h * 0.26, y);
        c.lineTo(V.x + V.w - V.h * 0.26, y);
        c.stroke();
      }
    }
  };

  const paintWheel = () => {
    const R = G.R;
    const size = Math.ceil(R * 2 + 8);
    wheelLayer.width = Math.round(size * dpr);
    wheelLayer.height = Math.round(size * dpr);
    const c = wheelLayer.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, (size * dpr) / 2, (size * dpr) / 2);
    G.wheelSize = size;

    // paprsky
    let g = c.createLinearGradient(0, -0.1 * R, 0, 0.9 * R);
    g.addColorStop(0, '#242426');
    g.addColorStop(1, '#101011');
    c.fillStyle = g;
    [-1, 1].forEach((s) => {
      c.beginPath();
      c.moveTo(s * 0.3 * R, -0.07 * R);
      c.quadraticCurveTo(s * 0.62 * R, -0.05 * R, s * 0.9 * R, -0.03 * R);
      c.lineTo(s * 0.9 * R, 0.2 * R);
      c.quadraticCurveTo(s * 0.62 * R, 0.21 * R, s * 0.3 * R, 0.27 * R);
      c.closePath();
      c.fill();
    });
    c.beginPath();
    c.moveTo(-0.12 * R, 0.3 * R);
    c.lineTo(0.12 * R, 0.3 * R);
    c.lineTo(0.08 * R, 0.9 * R);
    c.lineTo(-0.08 * R, 0.9 * R);
    c.closePath();
    c.fill();

    // věnec
    c.beginPath();
    c.arc(0, 0, 0.93 * R, 0, TAU);
    g = c.createLinearGradient(0, -R, 0, R);
    g.addColorStop(0, '#2B2A2B');
    g.addColorStop(0.5, '#161617');
    g.addColorStop(1, '#0D0D0E');
    c.strokeStyle = g;
    c.lineWidth = 0.14 * R;
    c.stroke();
    c.lineWidth = 0.15 * R;
    c.strokeStyle = 'rgba(10, 10, 11, 0.55)';
    [[1.25, 1.33], [1.67, 1.75]].forEach(([a, b]) => {
      c.beginPath();
      c.arc(0, 0, 0.93 * R, Math.PI * a, Math.PI * b);
      c.stroke();
    });
    c.lineWidth = 1.5;
    c.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    c.beginPath();
    c.arc(0, 0, 0.995 * R, 0, TAU);
    c.stroke();
    c.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    c.beginPath();
    c.arc(0, 0, 0.865 * R, 0, TAU);
    c.stroke();
    c.beginPath();
    c.arc(0, 0, 0.965 * R, Math.PI * 1.13, Math.PI * 1.87);
    c.strokeStyle = 'rgba(255, 210, 168, 0.14)';
    c.lineWidth = Math.max(1.5, 0.012 * R);
    c.lineCap = 'round';
    c.stroke();
    c.setLineDash([3, 5]);
    c.beginPath();
    c.arc(0, 0, 0.93 * R, 0, TAU);
    c.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    c.lineWidth = 1;
    c.stroke();
    c.setLineDash([]);
    rrect(c, -0.04 * R, -0.998 * R, 0.08 * R, 0.14 * R, 2);
    c.fillStyle = ORANGE;
    c.fill();

    // střed s logem
    rrect(c, -0.31 * R, -0.28 * R, 0.62 * R, 0.62 * R, 0.24 * R);
    g = c.createLinearGradient(0, -0.28 * R, 0, 0.34 * R);
    g.addColorStop(0, '#242426');
    g.addColorStop(1, '#101011');
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    c.lineWidth = 1;
    c.stroke();
    const lr = 0.095 * R;
    c.beginPath();
    c.arc(0, 0, lr, 0, TAU);
    c.strokeStyle = ORANGE;
    c.lineWidth = Math.max(1.5, 0.015 * R);
    c.stroke();
    const z = lr * 0.4;
    c.beginPath();
    c.moveTo(-z, -z);
    c.lineTo(z, -z);
    c.lineTo(-z, z);
    c.lineTo(z, z);
    c.lineJoin = 'round';
    c.lineWidth = Math.max(1.5, 0.017 * R);
    c.stroke();
  };

  /* ---------- svět za čelním sklem ---------- */
  // obloha po západu slunce s tenkými nasvícenými mraky; mraky jsou měkké, stačí nižší rozlišení
  const paintSky = () => {
    const x0 = -W * 0.25, y0 = -H * 0.2, w = W * 1.5, h = hz - y0 + 2;
    const k = Math.min(dpr, 1);
    skyLayer.width = Math.max(1, Math.round(w * k));
    skyLayer.height = Math.max(1, Math.round(h * k));
    const c = skyLayer.getContext('2d');
    c.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    Object.assign(SKY, { x: x0, y: y0, w, h });

    let g = c.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, '#07080D');
    g.addColorStop(0.45, '#0B0B12');
    g.addColorStop(0.72, '#171116');
    g.addColorStop(0.9, '#2E1914');
    g.addColorStop(1, '#442313');
    c.fillStyle = g;
    c.fillRect(x0, y0, w, h);

    for (let i = 0; i < 10; i++) {
      const r = (n) => hash(i * 13.7 + n);
      const low = r(1);
      const cy = hz * (0.52 + low * 0.4);
      const cx = x0 + w * r(2);
      const rx = W * (0.1 + r(3) * 0.2);
      const ry = hz * (0.005 + r(4) * 0.012);
      c.save();
      c.translate(cx, cy);
      c.scale(1, ry / rx);
      g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, `rgba(255, 146, 86, ${0.04 + low * 0.11})`);
      g.addColorStop(1, 'rgba(255, 146, 86, 0)');
      c.fillStyle = g;
      c.fillRect(-rx, -rx, rx * 2, rx * 2);
      c.restore();
    }
  };

  // hřeben kopců v dálce
  const ridge = (amp, freq, sd, parallax, color) => {
    const off = curve * W * parallax;
    const scale = 1600 / Math.max(W, 900);
    ctx.beginPath();
    ctx.moveTo(-W * 0.2, hz + 2);
    for (let x = -W * 0.2; x <= W * 1.2 + 12; x += 12) {
      const xx = (x + off) * scale;
      ctx.lineTo(x, hz - amp * (0.55 + 0.45 * Math.sin(xx * freq + sd)) * (0.65 + 0.35 * Math.sin(xx * freq * 0.41 + sd * 1.7)));
    }
    ctx.lineTo(W * 1.2 + 12, hz + 2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };

  const samples = [];
  for (let i = 0; i <= 56; i++) samples.push(0.004 + Math.pow(i / 56, 2.1) * 1.1);

  // pás po délce silnice; bez pomocných polí, kreslí se desítkykrát za snímek
  const band = (across, half, d0, d1, fill) => {
    let i0 = 0;
    while (i0 < samples.length && samples[i0] <= d0) i0++;
    let i1 = i0;
    while (i1 < samples.length && samples[i1] < d1) i1++;
    ctx.beginPath();
    ctx.moveTo(roadX(d0, across) - meter(d0) * half, depthY(d0));
    for (let i = i0; i < i1; i++) ctx.lineTo(roadX(samples[i], across) - meter(samples[i]) * half, depthY(samples[i]));
    ctx.lineTo(roadX(d1, across) - meter(d1) * half, depthY(d1));
    ctx.lineTo(roadX(d1, across) + meter(d1) * half, depthY(d1));
    for (let i = i1 - 1; i >= i0; i--) ctx.lineTo(roadX(samples[i], across) + meter(samples[i]) * half, depthY(samples[i]));
    ctx.lineTo(roadX(d0, across) + meter(d0) * half, depthY(d0));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };

  // přechody se vytvoří jednou po změně velikosti, ne v každém snímku
  let GR = {};
  const grad = (key, make) => GR[key] || (GR[key] = make());
  const radial = (r, stops) => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    stops.forEach(([at, color]) => g.addColorStop(at, color));
    return g;
  };
  const linear = (y0, y1, stops) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([at, color]) => g.addColorStop(at, color));
    return g;
  };

  const drawWorld = (t, dt, speed, lights) => {
    const vx = W / 2 + bend(0);
    const dVis = clamp((Math.max(G.dashY + G.drop, G.beltAt(0)) + H * 0.04 - hz) / (H - hz), 0.08, 1.1);
    let nVis = 0;
    while (nVis < samples.length && samples[nVis] <= dVis) nVis++;

    // obloha a záře zapadajícího slunce nad obzorem
    ctx.drawImage(skyLayer, SKY.x + curve * W * 0.03, SKY.y, SKY.w, SKY.h);
    ctx.save();
    ctx.translate(vx, hz);
    ctx.fillStyle = grad('glow', () => radial(Math.max(W, H) * 0.62, [
      [0, 'rgba(255, 170, 110, 0.34)'], [0.16, 'rgba(230, 120, 50, 0.12)'], [0.45, 'rgba(230, 120, 50, 0.03)'], [1, 'rgba(230, 120, 50, 0)'],
    ]));
    ctx.fillRect(-W * 0.2 - vx, -H * 0.2 - hz, W * 1.4, H * 1.4);
    ctx.restore();

    // kopce do dálky, čím dál, tím světlejší v oparu
    ridge(hz * 0.16, 0.0028, 1.3, 0.05, 'rgba(66, 40, 31, 0.78)');
    ridge(hz * 0.105, 0.0047, 4.2, 0.1, '#241815');
    ridge(hz * 0.055, 0.0075, 7.7, 0.16, '#141011');

    ctx.fillStyle = grad('ground', () => linear(hz, H, [[0, '#141011'], [1, '#070708']]));
    ctx.fillRect(-W * 0.2, hz, W * 1.4, H * 1.2);

    // opar přes obzor, aby kopce a pole plynule splynuly
    const hr = W * 0.8;
    ctx.save();
    ctx.translate(vx, hz);
    ctx.scale(1, (hz * 0.08) / hr);
    ctx.fillStyle = grad('haze', () => radial(hr, [[0, 'rgba(255, 160, 110, 0.16)'], [0.5, 'rgba(230, 120, 70, 0.05)'], [1, 'rgba(230, 120, 70, 0)']]));
    ctx.fillRect(-hr, -hr, hr * 2, hr * 2);
    ctx.restore();

    // pole kolem silnice
    const fShift = travel % 5;
    ctx.fillStyle = 'rgb(255, 235, 215)';
    for (let k = 0; k < 30; k++) {
      const z = k * 5 - fShift;
      if (z < 0) continue;
      const d = dOf(z);
      if (d > dVis) continue;
      const y = depthY(d);
      const h = Math.max(1, d * 2);
      ctx.globalAlpha = 0.035 * d;
      ctx.fillRect(-W * 0.2, y, Math.max(0, roadX(d, -1.45) + W * 0.2), h);
      ctx.fillRect(roadX(d, 1.45), y, W * 1.4, h);
    }
    ctx.globalAlpha = 1;

    // štěrková krajnice
    band(-1.1, 0.12, 0.004, dVis, 'rgba(92, 76, 62, 0.16)');
    band(1.1, 0.12, 0.004, dVis, 'rgba(92, 76, 62, 0.16)');

    // asfalt
    ctx.beginPath();
    for (let i = 0; i < nVis; i++) {
      const d = samples[i];
      if (i) ctx.lineTo(roadX(d, -1), depthY(d));
      else ctx.moveTo(roadX(d, -1), depthY(d));
    }
    for (let i = nVis - 1; i >= 0; i--) ctx.lineTo(roadX(samples[i], 1), depthY(samples[i]));
    ctx.closePath();
    ctx.fillStyle = grad('asphalt', () => linear(hz, H, [[0, '#2C221B'], [0.06, '#191614'], [1, '#0E0E0F']]));
    ctx.fill();

    // světla našeho auta
    if (lights > 0) {
      const bd = clamp((G.dashY - hz) / (H - hz), 0.05, 0.6) * 0.85;
      const rx = meter(bd) * G.lane * 1.2;
      const ry = Math.max(10, (depthY(bd) - hz) * 0.75);
      const beam = () => radial(rx, [[0, 'rgba(255, 240, 215, ' + (0.13 * lights) + ')'], [1, 'rgba(255, 240, 215, 0)']]);
      ctx.save();
      ctx.translate(roadX(bd, SEAT + 0.12), depthY(bd));
      ctx.scale(1, ry / rx);
      ctx.fillStyle = lights >= 1 ? grad('beam', beam) : beam();
      ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
      ctx.restore();
    }
    const lit = 0.6 + 0.4 * lights;

    // vodorovné značení
    ctx.globalAlpha = 0.42 * lit;
    band(-0.95, 0.02, 0.004, dVis, 'rgb(236, 232, 226)');
    band(0.95, 0.02, 0.004, dVis, 'rgb(236, 232, 226)');
    const period = 7;
    const dashLen = 3 + Math.min(2.2, boost * 0.45);
    const shift = travel % period;
    for (let k = 0; k < 60; k++) {
      const z0 = k * period - shift;
      const z1 = z0 + dashLen;
      if (z1 < -1) continue;
      const d0 = dOf(Math.max(z0, -1));
      const d1 = dOf(z1);
      if (d1 < 0.006) break;
      if (d1 > dVis) continue;
      ctx.globalAlpha = Math.min(0.85, 0.25 + d0) * lit;
      band(0, 0.024, d1, Math.min(d0, dVis), 'rgb(240, 236, 230)');
    }

    // směrové sloupky
    const pp = 16, ps = travel % pp;
    for (let k = 28; k >= 0; k--) {
      const z = k * pp - ps + 3;
      if (z < -4) continue;
      const d = dOf(z);
      if (d < 0.03 || d > dVis * 1.8) continue;
      const m = meter(d);
      const y = depthY(d);
      const h = m * 0.36;
      const w = Math.max(1, m * 0.028);
      const a = Math.min(1, (d - 0.03) * 5);
      for (let side = -1; side <= 1; side += 2) {
        const x = roadX(d, side * 1.18);
        ctx.globalAlpha = 0.6 * a * lit;
        ctx.fillStyle = 'rgb(222, 216, 208)';
        ctx.fillRect(x - w / 2, y - h, w, h);
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgb(12, 12, 13)';
        ctx.fillRect(x - w / 2, y - h * 0.8, w, h * 0.12);
        ctx.globalAlpha = (side < 0 ? 0.8 : 0.85) * a;
        ctx.fillStyle = side < 0 ? 'rgb(235, 235, 235)' : 'rgb(230, 110, 30)';
        ctx.fillRect(x - w * 0.32, y - h * 0.62, w * 0.64, h * 0.1);
      }
    }
    ctx.globalAlpha = 1;

    // dopravní značky vpravo u silnice
    if (!reduceMotion && loadedAt) {
      if (!nextSignAt) {
        nextSignAt = t + 2600;
      } else if (t > nextSignAt) {
        signs.push({ z: 170, type: signType });
        signType = 1 - signType;
        nextSignAt = t + 15000;
      }
    }
    for (let i = signs.length - 1; i >= 0; i--) {
      const s = signs[i];
      s.z -= speed * dt * 13;
      if (s.z < -3) { signs.splice(i, 1); continue; }
      const d = dOf(s.z);
      if (d < 0.035) continue;
      const m = meter(d);
      const a = clamp((d - 0.035) * 8, 0, 1);
      const x = roadX(d, 1.36);
      const y = depthY(d);
      const postH = m * 0.42;
      const sw = m * (s.type ? 0.76 : 0.55);
      const sh = sw * (s.type ? 0.36 : 0.44);
      const top = y - postH - sh;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#5E5D5B';
      ctx.fillRect(x - Math.max(1, m * 0.008), y - postH, Math.max(2, m * 0.016), postH);
      rrect(ctx, x - sw / 2, top, sw, sh, sh * 0.08);
      ctx.fillStyle = s.type ? '#1C4FA6' : '#F2F1EC';
      ctx.fill();
      ctx.lineWidth = Math.max(1, sh * 0.06);
      ctx.strokeStyle = s.type ? '#F2F1EC' : '#151515';
      rrect(ctx, x - sw / 2 + sh * 0.08, top + sh * 0.08, sw - sh * 0.16, sh * 0.84, sh * 0.06);
      ctx.stroke();
      if (sh > 6) {
        ctx.fillStyle = s.type ? '#F2F1EC' : '#151515';
        ctx.font = `700 ${Math.round(sh * (s.type ? 0.34 : 0.42))}px Arial, Helvetica, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.type ? 'Autoškola Zavřel' : 'Hlinsko', x, top + sh * 0.53);
      }
      ctx.globalAlpha = 1;
    }
  };

  /* ---------- živé části kabiny ---------- */
  const drawShade = () => {
    const s = G.shade;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(1, s.ry / s.rx);
    ctx.fillStyle = grad('shade', () => radial(s.rx, [[0, 'rgba(6, 6, 8, 0.45)'], [1, 'rgba(6, 6, 8, 0)']]));
    ctx.fillRect(-s.rx, -s.rx, s.rx * 2, s.rx * 2);
    ctx.restore();
  };

  const drawScreen = () => {
    const S = G.screen;
    if (!S) return;
    const { x, y, w, h } = S;
    ctx.save();
    rrect(ctx, x, y, w, h, 12);
    ctx.clip();
    ctx.fillStyle = '#0E1116';
    ctx.fillRect(x, y, w, h);
    const cell = Math.max(26, w * 0.12);
    const tilt = w * 0.045;
    const off = (travel * 3) % cell;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = Math.max(3, w * 0.012);
    for (let k = -1; k < h / cell + 2; k++) {
      const yy = y + k * cell + off;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy - tilt);
      ctx.stroke();
    }
    ctx.lineWidth = Math.max(2, w * 0.008);
    [0.2, 0.82].forEach((px) => {
      ctx.beginPath();
      ctx.moveTo(x + w * px, y);
      ctx.lineTo(x + w * px + w * 0.03, y + h);
      ctx.stroke();
    });
    const carX = x + w * 0.5;
    const carY = y + h * 0.78;
    ctx.beginPath();
    ctx.moveTo(carX, carY);
    ctx.bezierCurveTo(carX, carY - h * 0.3, carX + curve * w * 0.35, carY - h * 0.45, carX + curve * w * 0.3, y - 4);
    ctx.strokeStyle = ORANGE;
    ctx.lineWidth = Math.max(4, w * 0.017);
    ctx.lineCap = 'round';
    ctx.stroke();
    const a = Math.max(7, w * 0.03);
    ctx.beginPath();
    ctx.moveTo(carX, carY - a * 1.3);
    ctx.lineTo(carX + a, carY + a);
    ctx.lineTo(carX, carY + a * 0.45);
    ctx.lineTo(carX - a, carY + a);
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    const bar = clamp(h * 0.14, 22, 32);
    ctx.fillStyle = 'rgba(10, 10, 11, 0.8)';
    ctx.fillRect(x, y, w, bar);
    ctx.fillStyle = 'rgba(245, 243, 238, 0.88)';
    ctx.font = `600 ${Math.round(bar * 0.46)}px Manrope, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Hlinsko', x + bar * 0.5, y + bar / 2);
    ctx.fillStyle = ORANGE;
    ctx.beginPath();
    ctx.arc(x + w - bar * 0.6, y + bar / 2, bar * 0.14, 0, TAU);
    ctx.fill();
    ctx.restore();
  };

  const drawCluster = (t, lights, ign) => {
    const { cx, cy, R } = G;
    const blink = hazard && (t - hazardAt) % 760 < 400;
    G.gauges.forEach((gg, i) => {
      if (lights < 1) {
        ctx.beginPath();
        ctx.arc(gg.x, gg.y, gg.r * 0.92, 0, TAU);
        ctx.fillStyle = `rgba(9, 9, 10, ${0.75 * (1 - lights)})`;
        ctx.fill();
      }
      if (blink) {
        const s = i ? 1 : -1;
        const ax = gg.x + s * gg.r * 0.02, ay = gg.y + gg.r * 0.5, as = gg.r * 0.12;
        ctx.beginPath();
        ctx.moveTo(ax + s * as, ay);
        ctx.lineTo(ax - s * as * 0.3, ay - as * 0.8);
        ctx.lineTo(ax - s * as * 0.3, ay + as * 0.8);
        ctx.closePath();
        ctx.fillStyle = '#35D07F';
        ctx.fill();
      }
      const a = ((i ? rpmAngle : speedAngle) * Math.PI) / 180;
      const sx = Math.sin(a), sy = -Math.cos(a);
      ctx.beginPath();
      ctx.moveTo(gg.x - sx * gg.r * 0.1, gg.y - sy * gg.r * 0.1);
      ctx.lineTo(gg.x + sx * gg.r * 0.76, gg.y + sy * gg.r * 0.76);
      ctx.strokeStyle = ORANGE;
      ctx.lineWidth = Math.max(2, gg.r * 0.055);
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(gg.x, gg.y, gg.r * 0.12, 0, TAU);
      ctx.fillStyle = '#1B1B1D';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // rychlost mezi budíky, při startu logo
    if (ign >= 0) {
      const y = cy - 0.56 * R;
      if (ign < 1500) {
        const r = 0.075 * R;
        ctx.globalAlpha = Math.min(1, ign / 300) * Math.min(1, (1500 - ign) / 300);
        ctx.strokeStyle = ORANGE;
        ctx.lineWidth = Math.max(1.5, r * 0.16);
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.arc(cx, y, r, 0, TAU);
        ctx.stroke();
        const z = r * 0.42;
        ctx.beginPath();
        ctx.moveTo(cx - z, y - z);
        ctx.lineTo(cx + z, y - z);
        ctx.lineTo(cx - z, y + z);
        ctx.lineTo(cx + z, y + z);
        ctx.stroke();
      } else {
        ctx.globalAlpha = Math.min(1, (ign - 1500) / 300);
        ctx.fillStyle = '#F5F3EE';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `800 ${Math.round(0.15 * R)}px Archivo, system-ui, sans-serif`;
        ctx.fillText(String(kmh), cx, y);
        const unit = Math.round(0.052 * R);
        if (unit >= 7) {
          ctx.fillStyle = 'rgba(245, 243, 238, 0.5)';
          ctx.font = `700 ${unit}px Manrope, system-ui, sans-serif`;
          ctx.fillText('km/h', cx, y + 0.12 * R);
        }
      }
      ctx.globalAlpha = 1;
    }

    const Z = G.hazard;
    if (Z) {
      const r = Z.r * 0.56;
      ctx.beginPath();
      ctx.moveTo(Z.x, Z.y - r);
      ctx.lineTo(Z.x + r * 0.95, Z.y + r * 0.64);
      ctx.lineTo(Z.x - r * 0.95, Z.y + r * 0.64);
      ctx.closePath();
      ctx.lineJoin = 'round';
      if (blink) {
        ctx.fillStyle = '#E5484D';
        ctx.fill();
      }
      ctx.strokeStyle = '#E5484D';
      ctx.lineWidth = Math.max(1.5, Z.r * 0.12);
      ctx.stroke();
    }
  };

  /* ---------- snímek ---------- */
  function draw(t) {
    if (!G.R) return;
    const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000)) || 0.016;
    lastT = t;
    if (!loadedAt && document.body.classList.contains('is-loaded')) loadedAt = t;
    const since = loadedAt ? t - loadedAt : -1;
    const ign = since < 0 ? -1 : since - 900;
    const lights = ign < 0 ? 0 : easeOut(ign / 700);
    const dashOff = since < 0 ? H : (1 - easeOut(since / 1500)) * H * 0.4;
    const frameA = since < 0 ? 0 : easeOut(since / 800);

    const auto = Math.sin(t * 0.00021) * 0.5 + Math.sin(t * 0.00057 + 1.3) * 0.18;
    const goal = t - pointerAt < 2600 ? targetCurve : auto;
    curve += (goal - curve) * Math.min(1, dt * 1.5);
    boost *= Math.pow(0.2, dt);
    const speed = 1 + boost;
    travel += speed * dt * 13;

    if (reduceMotion) {
      speedAngle = -60;
      rpmAngle = -75;
    } else if (ign < 0) {
      speedAngle = rpmAngle = -120;
    } else if (ign < 1500) {
      speedAngle = rpmAngle = -120 + 240 * Math.sin((Math.PI * ign) / 1500);
    } else {
      const k = Math.min(1, dt * 3);
      speedAngle += (clamp(-60 + boost * 26, -120, 112) - speedAngle) * k;
      rpmAngle += (clamp(-75 + boost * 30 + Math.sin(t * 0.004) * 3, -120, 116) - rpmAngle) * k;
    }
    if (reduceMotion || t - kmhAt > 160) {
      kmh = Math.round(clamp(((speedAngle + 120) / 240) * 200, 0, 199));
      kmhAt = t;
    }

    ctx.fillStyle = '#08090C';
    ctx.fillRect(0, 0, W, H);
    const bump = reduceMotion ? 0 : (Math.sin(t * 0.013) * 0.5 + Math.sin(t * 0.031) * 0.35) * (0.6 + boost * 0.25);
    ctx.save();
    ctx.translate(W / 2, hz);
    ctx.rotate(-curve * 0.018);
    ctx.translate(-W / 2, -hz + bump);
    drawWorld(t, dt, speed, lights);
    ctx.restore();
    drawShade();

    if (frameA > 0) {
      ctx.globalAlpha = frameA;
      ctx.drawImage(frameLayer, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (dashOff < H * 0.99) {
      ctx.save();
      ctx.translate(0, dashOff);
      ctx.drawImage(dashLayer, 0, 0, W, H);
      drawScreen();
      drawCluster(t, lights, ign);
      const s = G.wheelSize;
      ctx.translate(G.cx, G.cy);
      ctx.rotate((curve * 62 * Math.PI) / 180);
      ctx.drawImage(wheelLayer, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }

  const resize = () => {
    const r = hero.getBoundingClientRect();
    if (!r.width || !r.height) return;
    W = r.width;
    H = r.height;
    // strop počtu pixelů drží snímek levný i na retina displejích
    dpr = clamp(Math.min(window.devicePixelRatio || 1, Math.sqrt(2.6e6 / (W * H))), 1, 1.6);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    GR = {};
    layout();
    paintSky();
    paintFrame();
    paintDash();
    paintWheel();
    if (!running) draw(performance.now());
  };

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

  const onHazard = (e) => {
    if (!G.hazard || e.target.closest('a, button')) return false;
    const r = hero.getBoundingClientRect();
    return Math.hypot(e.clientX - r.left - G.hazard.x, e.clientY - r.top - G.hazard.y) < G.hazard.r + 8;
  };
  if (finePointer) {
    hero.addEventListener('pointermove', (e) => {
      targetCurve = clamp((e.clientX / window.innerWidth - 0.5) * 2, -1, 1);
      pointerAt = performance.now();
      hero.style.cursor = onHazard(e) ? 'pointer' : '';
    });
  }
  hero.addEventListener('click', (e) => {
    if (!onHazard(e)) return;
    hazard = !hazard;
    hazardAt = performance.now();
    if (!running) draw(performance.now());
  });
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
