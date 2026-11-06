/* =========================================================
   ICCA Complete Recipe Book - script.js
   Keep this file in the same folder as index.html.
   Sections:
     1. Helpers
     2. Search + category filter + collapsible categories
     3. Highlight the recipe you are reading in the sidebar
     4. Back-to-top (link + floating button)
     5. Keyboard shortcuts
     6. Recipe photos (add / replace / remove, stored in browser)
     7. Save page with photos
   ========================================================= */
(function () {
  'use strict';

  /* ---------- 1. Helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  // lower-case, remove accents (crème -> creme), collapse spaces
  const norm = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  // elements created by this script are tagged data-js so they can be stripped when saving
  const make = (tag, props = {}, ...kids) => {
    const el = Object.assign(document.createElement(tag), props);
    el.setAttribute('data-js', '');
    kids.forEach(k => el.append(k));
    return el;
  };

  const search = $('#recipeSearch');
  const links = $$('.recipe-link');
  const heads = $$('.cat-head');
  const countEl = $('#recipeCount');
  const emptyEl = $('#emptyMessage');
  const collapsed = new Set();           // categories folded in the sidebar
  let catSelect = null;

  /* ---------- 2. Search + category filter + collapsible categories ---------- */
  links.forEach(a => { a.dataset.norm = norm(a.dataset.name); });

  function applyFilters() {
    const terms = norm(search.value).split(' ').filter(Boolean);
    const cat = catSelect ? catSelect.value : '';
    const filtering = terms.length > 0 || cat !== '';
    const matchesByCat = {};
    let shown = 0;
    links.forEach(a => {
      const match = (!cat || a.dataset.cat === cat) && terms.every(t => a.dataset.norm.includes(t));
      const folded = !filtering && collapsed.has(a.dataset.cat);
      a.hidden = !match || folded;
      if (match) { shown++; matchesByCat[a.dataset.cat] = (matchesByCat[a.dataset.cat] || 0) + 1; }
    });
    heads.forEach(h => {
      h.hidden = !matchesByCat[h.dataset.cat];
      h.classList.toggle('collapsed', !filtering && collapsed.has(h.dataset.cat));
    });
    countEl.textContent = shown === links.length
      ? `Showing ${links.length} recipes`
      : `Showing ${shown} of ${links.length} recipes`;
    if (emptyEl) emptyEl.style.display = shown ? 'none' : 'block';
    if (toggleAll) toggleAll.textContent = collapsed.size ? 'Expand all' : 'Collapse all';
  }

  // category dropdown + collapse-all button, inserted under the search box
  let toggleAll = null;
  (function buildSidebarTools() {
    if (!heads.length) return;
    catSelect = make('select', { id: 'categoryFilter', ariaLabel: 'Filter by category' });
    catSelect.append(new Option('All categories', ''));
    heads.forEach(h => catSelect.append(new Option(h.dataset.cat, h.dataset.cat)));
    toggleAll = make('button', { type: 'button', textContent: 'Collapse all' });
    const row = make('div', { className: 'nav-tools' }, toggleAll);
    search.insertAdjacentElement('afterend', row);
    search.insertAdjacentElement('afterend', catSelect);

    catSelect.addEventListener('change', () => {
      applyFilters();
      const head = heads.find(h => h.dataset.cat === catSelect.value);
      const target = head && document.getElementById(head.querySelector('a').hash.slice(1));
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
    toggleAll.addEventListener('click', () => {
      if (collapsed.size) collapsed.clear(); else heads.forEach(h => collapsed.add(h.dataset.cat));
      applyFilters();
    });
    heads.forEach(h => {
      const btn = make('button', { type: 'button', className: 'cat-toggle', textContent: '\u25BE', title: 'Show / hide this category' });
      btn.addEventListener('click', () => {
        const c = h.dataset.cat;
        collapsed.has(c) ? collapsed.delete(c) : collapsed.add(c);
        applyFilters();
      });
      h.prepend(btn);
    });
  })();

  search.addEventListener('input', applyFilters);
  applyFilters();

  /* ---------- 3. Highlight the recipe being read ---------- */
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) links.forEach(a => a.classList.toggle('active', a.hash === '#' + entry.target.id));
      });
    }, { rootMargin: '-10% 0px -75% 0px' });
    $$('main h1[id]').forEach(h => observer.observe(h));
  }

  /* ---------- 4. Back-to-top ---------- */
  const toTop = make('button', { id: 'toTop', type: 'button', textContent: '\u2191', title: 'Back to top', ariaLabel: 'Back to top' });
  document.body.append(toTop);
  const goTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  toTop.addEventListener('click', goTop);
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a.back-top');
    if (a) { e.preventDefault(); goTop(); }
  });
  const onScroll = () => toTop.classList.toggle('show', window.scrollY > 600);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- 5. Keyboard shortcuts ---------- */
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === '/' && !typing) { e.preventDefault(); search.focus(); search.select(); }
    if (e.key === 'Escape' && document.activeElement === search) { search.value = ''; applyFilters(); search.blur(); }
  });

  /* ---------- 6. Recipe photos ---------- */
  const STORE = 'p';
  let dbp;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('icca-photos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const dbGet = async k => { try { const d = await db(); return await new Promise(res => { const q = d.transaction(STORE).objectStore(STORE).get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(); }); } catch (e) {} };
  const dbPut = async (k, v) => { try { const d = await db(); const o = d.transaction(STORE, 'readwrite').objectStore(STORE); v ? o.put(v, k) : o.delete(k); } catch (e) {} };
  // shrink big phone photos so the saved page stays a sensible size
  const shrink = file => new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const s = Math.min(1, 900 / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', .85));
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(); };
    im.src = url;
  });

  $$('figure.recipe-photo').forEach(async fig => {
    const id = fig.dataset.id, name = fig.dataset.name;
    const saved = fig.querySelector('img');
    const embedded = saved ? saved.getAttribute('src') : null;
    fig.innerHTML = '';
    const frame = document.createElement('div'); frame.className = 'photo-frame'; frame.tabIndex = 0;
    const ctl = document.createElement('div'); ctl.className = 'photo-ctl';
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.hidden = true;
    const change = document.createElement('button'); change.type = 'button';
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove';
    const find = document.createElement('a'); find.target = '_blank'; find.rel = 'noopener';
    find.href = 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(name + ' recipe'); find.textContent = 'Find image \u2197';
    ctl.append(change, remove, find);
    fig.append(frame, ctl, input);
    const show = src => {
      frame.innerHTML = ''; frame.classList.toggle('has', !!src); fig.classList.toggle('has', !!src);
      if (src) { const im = document.createElement('img'); im.src = src; im.alt = name; frame.append(im); }
      else frame.textContent = 'Click, drop or paste a photo (7 \u00d7 7 cm)';
      change.textContent = src ? 'Replace photo' : 'Add photo'; remove.hidden = !src;
    };
    const load = async f => { if (f && f.type.startsWith('image/')) { try { const d = await shrink(f); show(d); dbPut(id, d); } catch (e) {} } };
    show(embedded || null);
    if (!embedded) { const d = await dbGet(id); if (d) show(d); }
    frame.addEventListener('click', () => { if (!frame.classList.contains('has')) input.click(); });
    frame.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !frame.classList.contains('has')) { e.preventDefault(); input.click(); } });
    change.addEventListener('click', () => input.click());
    remove.addEventListener('click', () => { show(null); dbPut(id, null); });
    input.addEventListener('change', () => { load(input.files[0]); input.value = ''; });
    frame.addEventListener('dragover', e => { e.preventDefault(); frame.classList.add('drag'); });
    frame.addEventListener('dragleave', () => frame.classList.remove('drag'));
    frame.addEventListener('drop', e => { e.preventDefault(); frame.classList.remove('drag'); load(e.dataTransfer.files[0]); });
    fig._paste = load;
  });
  document.addEventListener('paste', e => {
    const fig = document.activeElement && document.activeElement.closest && document.activeElement.closest('figure.recipe-photo');
    if (!fig) return;
    const item = [...(e.clipboardData ? e.clipboardData.items : [])].find(i => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); fig._paste(item.getAsFile()); }
  });

  /* ---------- 7. Save page with photos ---------- */
  const saveBtn = $('#savePhotos');
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const clone = document.documentElement.cloneNode(true);
    // remove everything this script builds at run time (it is rebuilt when the saved page opens)
    $$('[data-js]', clone).forEach(el => el.remove());
    $$('figure.recipe-photo', clone).forEach(f => {
      const im = f.querySelector('img'); f.innerHTML = ''; f.className = 'recipe-photo';
      if (im) f.append(im.cloneNode(true));
    });
    $$('[hidden]', clone).forEach(el => { if (el.matches('.recipe-link, .cat-head')) el.removeAttribute('hidden'); });
    $$('.recipe-link.active', clone).forEach(el => el.classList.remove('active'));
    // try to put this script inside the saved page so it also works as ONE file (e.g. sent to a phone)
    const tag = $('script[src*="script.js"]', clone);
    if (tag) {
      try {
        const r = await fetch(tag.getAttribute('src'));
        if (r.ok) {
          const inline = document.createElement('script');
          inline.textContent = (await r.text()).replace(/<\/script/gi, '<\\/script');
          tag.replaceWith(inline);
        }
      } catch (e) { /* opened from a local file: keep the link, script.js must sit beside the page */ }
    }
    // same for the stylesheet, so the saved page keeps its design when sent on its own
    const css = $('link[rel="stylesheet"][href*="style.css"]', clone);
    if (css) {
      try {
        const r = await fetch(css.getAttribute('href'));
        if (r.ok) {
          const inlineCss = document.createElement('style');
          inlineCss.textContent = (await r.text()).replace(/<\/style/gi, '<\\/style');
          css.replaceWith(inlineCss);
        }
      } catch (e) { /* opened from a local file: keep the link, style.css must sit beside the page */ }
    }
    const blob = new Blob(['<!DOCTYPE html>\n' + clone.outerHTML], { type: 'text/html' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'index.html'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
})();
