/* Autoškola Zavřel: interakce */
(() => {
  const doc = document.documentElement;
  const body = document.body;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- Plynulý scroll ---------- */
  let lenis = null;
  if (!reduceMotion && typeof window.Lenis === 'function') {
    lenis = new window.Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.4,
    });
    const raf = (time) => {
      lenis.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }

  const scrollToTarget = (target, offset = 0) => {
    if (lenis) {
      lenis.scrollTo(target, { offset, duration: 1.4 });
    } else {
      const y = typeof target === 'number' ? target : target.getBoundingClientRect().top + window.scrollY + offset;
      window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  };

  /* ---------- Navigace ---------- */
  const nav = $('[data-nav]');
  const burger = $('[data-burger]');
  const mmenu = $('[data-mmenu]');
  const drops = $$('[data-drop]');

  const closeDrops = (except) => {
    drops.forEach((d) => {
      if (d === except) return;
      d.classList.remove('is-open');
      const btn = $('button', d);
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  };
  const openDrop = (d) => {
    closeDrops(d);
    d.classList.add('is-open');
    $('button', d).setAttribute('aria-expanded', 'true');
  };

  drops.forEach((d) => {
    const btn = $('button', d);
    let timer;
    btn.addEventListener('click', () => {
      d.classList.contains('is-open') ? closeDrops() : openDrop(d);
    });
    if (finePointer) {
      d.addEventListener('mouseenter', () => { clearTimeout(timer); timer = setTimeout(() => openDrop(d), 60); });
      d.addEventListener('mouseleave', () => { clearTimeout(timer); timer = setTimeout(() => closeDrops(), 180); });
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-drop]')) closeDrops();
  });

  const setMenu = (open) => {
    if (!mmenu) return;
    nav.classList.toggle('is-open', open);
    mmenu.classList.toggle('is-open', open);
    mmenu.setAttribute('aria-hidden', String(!open));
    mmenu.toggleAttribute('inert', !open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Zavřít menu' : 'Otevřít menu');
    doc.style.overflow = open ? 'hidden' : '';
    if (lenis) open ? lenis.stop() : lenis.start();
  };
  if (burger) burger.addEventListener('click', () => setMenu(!mmenu.classList.contains('is-open')));

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeDrops();
    if (mmenu && mmenu.classList.contains('is-open')) { setMenu(false); burger.focus(); }
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1180 && mmenu && mmenu.classList.contains('is-open')) setMenu(false);
  });

  /* Kotvy */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href*="#"]');
    if (!a) return;
    const url = new URL(a.getAttribute('href'), location.href);
    if (url.pathname !== location.pathname || !url.hash) return;
    const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (!target) return;
    e.preventDefault();
    closeDrops();
    const wasOpen = mmenu && mmenu.classList.contains('is-open');
    if (wasOpen) setMenu(false);
    const tabBtn = $(`[role="tab"][aria-controls="${target.id}"]`);
    if (tabBtn) tabBtn.click();
    const scrollTarget = tabBtn ? tabBtn.closest('[data-tabs]') : target;
    setTimeout(() => scrollToTarget(scrollTarget, target.classList.contains('footer') ? 0 : -100), wasOpen ? 350 : 0);
    history.replaceState(null, '', url.hash);
  });

  $$('[data-to-top]').forEach((b) => b.addEventListener('click', () => scrollToTarget(0)));
  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  /* ---------- Nástup stránky ---------- */
  const heroImgs = $$('.hero img, .phero__media img');
  const decoded = Promise.all(heroImgs.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve())));
  const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
  Promise.race([Promise.all([decoded, fonts]), new Promise((r) => setTimeout(r, 900))]).then(() => {
    requestAnimationFrame(() => body.classList.add('is-loaded'));
  });

  /* ---------- Reveal ---------- */
  const revealEls = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.classList.add('is-in');
        io.unobserve(el);
        const delay = parseFloat(getComputedStyle(el).getPropertyValue('--d')) || 0;
        setTimeout(() => el.removeAttribute('data-reveal'), (delay + 1.2) * 1000);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => { el.classList.add('is-in'); el.removeAttribute('data-reveal'); });
  }

  /* ---------- Plynulá změna barev sekcí ---------- */
  const toned = $$('[data-tone]');
  if ('IntersectionObserver' in window && toned.length) {
    const themeIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) body.dataset.theme = entry.target.dataset.tone;
      });
    }, { rootMargin: '-46% 0px -53% 0px' });
    toned.forEach((s) => themeIO.observe(s));
  }

  /* ---------- Rozdělení textu na slova ---------- */
  const splitWords = (el) => {
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part) && !/ /.test(part)) {
              frag.appendChild(document.createTextNode(part));
            } else {
              const span = document.createElement('span');
              span.className = 'w';
              span.textContent = part;
              frag.appendChild(span);
            }
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) {
          walk(child);
        }
      });
    };
    walk(el);
    return $$('.w', el);
  };
  const wordBlocks = reduceMotion ? [] : $$('[data-words]').map((el) => ({ el, words: splitWords(el), last: -1 }));

  /* ---------- Cesta k řidičáku ---------- */
  const track = $('[data-track]');
  const trackSteps = track ? $$('[data-step]', track) : [];
  const verticalTrack = window.matchMedia('(max-width: 860px)');
  let stepThresholds = [];
  const measureTrack = () => {
    if (!track) return;
    const rail = $('.track__rail', track);
    const vertical = verticalTrack.matches;
    const railSize = vertical ? track.offsetHeight : rail.offsetWidth;
    stepThresholds = trackSteps.map((s) => (vertical ? s.offsetTop : s.offsetLeft) / Math.max(1, railSize));
  };

  /* ---------- Hero parallax ---------- */
  const hero = $('[data-hero]');
  const heroCopy = $('[data-hero-copy]');
  const pheroMedia = $('.phero__media');
  const desktopMotion = window.matchMedia('(min-width: 1025px) and (hover: hover) and (pointer: fine)');
  const footer = $('.footer');
  const fab = $('.fab');
  const progress = $('.progress span');

  /* ---------- Hlavní smyčka při scrollu ---------- */
  let lastY = window.scrollY;
  let ticking = false;
  let navHidden = false;

  function update() {
    ticking = false;
    const y = window.scrollY;
    const vh = window.innerHeight;
    const max = Math.max(1, doc.scrollHeight - vh);

    if (progress) progress.style.transform = `scaleX(${clamp(y / max, 0, 1)})`;

    // navigace
    if (nav) {
      nav.classList.toggle('is-scrolled', y > 24);
      const delta = y - lastY;
      const menuOpen = nav.classList.contains('is-open') || drops.some((d) => d.classList.contains('is-open'));
      if (!menuOpen && Math.abs(delta) > 3) {
        const hide = delta > 0 && y > 420;
        if (hide !== navHidden) {
          navHidden = hide;
          nav.classList.toggle('is-hidden', hide);
          body.classList.toggle('nav-hidden', hide);
        }
      }
    }
    lastY = y;

    // hero text při scrollu odplouvá jen na desktopu, na telefonu stojí
    if (hero && heroCopy && !reduceMotion && desktopMotion.matches && y < vh * 1.3) {
      heroCopy.style.transform = `translate3d(0, ${(y * 0.28).toFixed(1)}px, 0) scale(${(1 - clamp(y / vh, 0, 1) * 0.06).toFixed(4)})`;
      heroCopy.style.opacity = clamp(1 - y / (vh * 0.7), 0, 1).toFixed(3);
    } else if (heroCopy && heroCopy.style.transform && !desktopMotion.matches) {
      heroCopy.style.transform = '';
      heroCopy.style.opacity = '';
    }

    // vozidla v hlavičce podstránek se posouvají jen na desktopu
    if (pheroMedia && !reduceMotion && desktopMotion.matches && y < vh) {
      pheroMedia.style.transform = `translate3d(${-y * 0.08}px, ${y * 0.12}px, 0)`;
    } else if (pheroMedia && pheroMedia.style.transform && !desktopMotion.matches) {
      pheroMedia.style.transform = '';
    }

    // cesta
    if (track) {
      const r = track.getBoundingClientRect();
      const p = verticalTrack.matches
        ? clamp((vh * 0.62 - r.top) / r.height, 0, 1)
        : clamp((vh * 0.88 - r.top) / (vh * 0.62), 0, 1);
      track.style.setProperty('--p', p.toFixed(4));
      trackSteps.forEach((s, i) => s.classList.toggle('is-active', p >= stepThresholds[i] - 0.001));
    }

    // slova
    wordBlocks.forEach((b) => {
      const r = b.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      const p = clamp((vh * 0.88 - r.top) / (r.height + vh * 0.3), 0, 1);
      const count = Math.round(p * b.words.length * 1.08);
      if (count === b.last) return;
      b.last = count;
      b.words.forEach((w, i) => w.classList.toggle('is-on', i < count));
    });

    // patička
    if (footer) {
      const fr = footer.getBoundingClientRect();
      if (fab) fab.classList.toggle('is-visible', y > vh * 0.8 && fr.top > vh * 0.9);
    }
  }

  function schedule() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', () => { measureTrack(); schedule(); });
  window.addEventListener('load', () => { measureTrack(); schedule(); });
  measureTrack();
  update();

  /* ---------- 3D náklon karet a magnetická tlačítka ---------- */
  if (finePointer && !reduceMotion) {
    $$('[data-tilt]').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        if (card.hasAttribute('data-reveal')) return;
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.classList.add('is-tilting');
        card.style.transform = `perspective(1000px) rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 9).toFixed(2)}deg) translateY(-6px)`;
      });
      card.addEventListener('pointerleave', () => {
        card.classList.remove('is-tilting');
        card.style.transform = '';
      });
    });

    $$('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${(x * 0.2).toFixed(1)}px, ${(y * 0.32).toFixed(1)}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ---------- Mini test ---------- */
  const confetti = (host, originEl) => {
    if (reduceMotion || !host.animate) return;
    const hr = host.getBoundingClientRect();
    const or = originEl.getBoundingClientRect();
    const ox = or.left - hr.left + or.width / 2;
    const oy = or.top - hr.top + or.height / 2;
    const colors = ['#FF8114', '#FFC58A', '#FFFFFF', '#E96C00'];
    for (let i = 0; i < 56; i++) {
      const bit = document.createElement('i');
      bit.className = 'confetti';
      bit.style.left = `${ox}px`;
      bit.style.top = `${oy}px`;
      bit.style.background = colors[i % colors.length];
      host.appendChild(bit);
      const angle = Math.random() * Math.PI * 2;
      const dist = 90 + Math.random() * 220;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist * 0.7 - 80;
      bit.animate([
        { transform: 'translate(-50%, -50%) rotate(0deg) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 180}px)) rotate(${Math.random() * 900 - 450}deg) scale(.5)`, opacity: 0 },
      ], { duration: 1300 + Math.random() * 700, easing: 'cubic-bezier(.15,.8,.3,1)', fill: 'forwards' }).onfinish = () => bit.remove();
    }
  };

  $$('[data-quiz]').forEach((quiz) => {
    const card = $('.quiz__card', quiz);
    const questions = $$('[data-q]', quiz);
    const result = $('[data-result]', quiz);
    const next = $('[data-quiz-next]', quiz);
    const nextLabel = $('[data-next-label]', quiz);
    const dots = $$('.quiz__dots span', quiz);
    const verdicts = [
      ['Nevadí, od toho jsme tu', 'Pravidla vám vysvětlíme tak, aby dávala smysl a zůstala v hlavě.'],
      ['Nevadí, od toho jsme tu', 'Pravidla vám vysvětlíme tak, aby dávala smysl a zůstala v hlavě.'],
      ['Dobrý start', 'Něco už víte a zbytek doladíme spolu. Přesně na to je výuka teorie.'],
      ['Skvělý základ', 'Ještě pár detailů a budete připravení. Pojďme na to.'],
      ['Máte to v malíčku', 'Teorie vám půjde sama. Teď spolu zvládneme i jízdy.'],
    ];
    let index = 0;
    let score = 0;

    const show = (el) => {
      $$('.q', quiz).forEach((q) => q.classList.remove('is-active'));
      el.classList.add('is-active');
    };
    const paintDots = () => dots.forEach((d, i) => d.classList.toggle('is-current', i === index && index < questions.length));

    questions.forEach((q, qi) => {
      const opts = $$('.opt', q);
      const answer = Number(q.dataset.answer);
      opts.forEach((opt, oi) => opt.addEventListener('click', () => {
        if (q.classList.contains('is-answered')) return;
        q.classList.add('is-answered');
        const ok = oi === answer;
        if (ok) score++;
        opts[answer].classList.add('is-correct');
        if (!ok) opt.classList.add('is-wrong');
        opts.forEach((o) => { o.disabled = true; });
        if (dots[qi]) dots[qi].classList.add(ok ? 'is-ok' : 'is-bad');
        nextLabel.textContent = qi === questions.length - 1 ? 'Zobrazit výsledek' : 'Další otázka';
        next.hidden = false;
      }));
    });

    next.addEventListener('click', () => {
      next.hidden = true;
      index++;
      if (index < questions.length) {
        show(questions[index]);
      } else {
        $('[data-score]', result).textContent = score;
        $('[data-verdict]', result).textContent = verdicts[score][0];
        $('[data-verdict-text]', result).textContent = verdicts[score][1];
        show(result);
        if (score >= 3) setTimeout(() => confetti(card, $('[data-score]', result)), 250);
      }
      paintDots();
    });

    $('[data-quiz-restart]', quiz).addEventListener('click', () => {
      index = 0;
      score = 0;
      questions.forEach((q) => {
        q.classList.remove('is-answered');
        $$('.opt', q).forEach((o) => { o.disabled = false; o.classList.remove('is-correct', 'is-wrong'); });
      });
      dots.forEach((d) => d.classList.remove('is-ok', 'is-bad'));
      show(questions[0]);
      paintDots();
    });

    paintDots();
  });

  /* ---------- Akordeon ---------- */
  $$('.qa').forEach((item) => {
    const summary = $('summary', item);
    const panel = $('.qa__a', item);
    let anim = null;
    summary.addEventListener('click', (e) => {
      if (reduceMotion || !panel.animate) return;
      e.preventDefault();
      if (anim) anim.cancel();
      if (item.open) {
        const h = panel.offsetHeight;
        anim = panel.animate([{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
        anim.onfinish = () => { item.open = false; anim = null; };
      } else {
        item.open = true;
        const h = panel.scrollHeight;
        anim = panel.animate([{ height: '0px', opacity: 0 }, { height: `${h}px`, opacity: 1 }], { duration: 560, easing: 'cubic-bezier(.22,1,.36,1)' });
        anim.onfinish = () => { anim = null; };
      }
    });
  });

  /* ---------- Záložky ---------- */
  $$('[data-tabs]').forEach((wrap) => {
    const tabs = $$('[role="tab"]', wrap);
    const ind = $('.tabs__ind', wrap);
    const moveInd = (tab, instant) => {
      if (!ind) return;
      if (instant) ind.style.transition = 'none';
      ind.style.width = `${tab.offsetWidth}px`;
      ind.style.height = `${tab.offsetHeight}px`;
      ind.style.transform = `translate(${tab.offsetLeft}px, ${tab.offsetTop - 6}px)`;
      if (instant) { ind.offsetWidth; ind.style.transition = ''; }
    };
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (!panel) return;
        if (on) {
          const wasHidden = panel.hidden;
          panel.hidden = false;
          if (wasHidden && !reduceMotion) {
            panel.classList.remove('is-entering');
            void panel.offsetWidth;
            panel.classList.add('is-entering');
          }
        } else {
          panel.hidden = true;
        }
      });
      moveInd(tab);
      if (focus) tab.focus();
      schedule();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (e) => {
        const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        select(tabs[(i + dir + tabs.length) % tabs.length], true);
      });
    });
    const fromHash = location.hash && tabs.find((t) => `#${t.getAttribute('aria-controls')}` === location.hash);
    const initial = fromHash || tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0];
    select(initial);
    moveInd(initial, true);
    window.addEventListener('resize', () => moveInd(tabs.find((t) => t.getAttribute('aria-selected') === 'true'), true));
    if (document.fonts) document.fonts.ready.then(() => moveInd(tabs.find((t) => t.getAttribute('aria-selected') === 'true'), true));
  });

  /* ---------- Ceník: aktivní kategorie ---------- */
  const pnav = $('.pnav');
  if (pnav && 'IntersectionObserver' in window) {
    const links = $$('a', pnav);
    const setActive = (id) => {
      links.forEach((a) => {
        const on = a.getAttribute('href') === `#${id}`;
        a.classList.toggle('is-active', on);
        if (on) pnav.scrollTo({ left: a.offsetLeft - pnav.clientWidth / 2 + a.offsetWidth / 2, behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    };
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) setActive(entry.target.id); });
    }, { rootMargin: '-30% 0px -65% 0px' });
    $$('.pblock').forEach((b) => spy.observe(b));
  }

  /* ---------- Mapa ---------- */
  $$('[data-map]').forEach((map) => {
    const btn = $('[data-map-load]', map);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const iframe = document.createElement('iframe');
      iframe.title = 'Mapa: Autoškola Zavřel, Rataje 1635, Hlinsko';
      iframe.loading = 'lazy';
      iframe.referrerPolicy = 'no-referrer-when-downgrade';
      iframe.allowFullscreen = true;
      iframe.src = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2577.2966704184532!2d15.921653!3d49.7616762!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x470dbb433d9e4675%3A0x82ee7382ee8ea8f7!2sRataje%201635%2C%20539%2001%20Hlinsko%20v%20%C4%8Cech%C3%A1ch%201!5e0!3m2!1scs!2scz!4v1746011680600!5m2!1scs!2scz';
      iframe.addEventListener('load', () => map.classList.add('is-loaded'));
      map.appendChild(iframe);
      map.setAttribute('data-lenis-prevent', '');
    }, { once: true });
  });
})();
