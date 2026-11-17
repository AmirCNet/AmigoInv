'use strict';

const $ = (id) => document.getElementById(id);

/* ------------------------------ Utilidades ------------------------------ */

const api = {
  async get() {
    const r = await fetch('/api/state', { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se pudo conectar con el servidor.');
    return j;
  },
  async post(action, data = {}) {
    const r = await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Error inesperado. Probá de nuevo.');
    return j;
  },
};

const cleanName = (s) => String(s || '').trim().replace(/\s+/g, ' ');
const nameKey = (s) =>
  cleanName(s).toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function initials(name) {
  const parts = cleanName(name).split(' ').filter(Boolean);
  if (!parts.length) return '🎶';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function show(view) {
  document.querySelectorAll('[data-view]').forEach((el) => {
    el.hidden = el.dataset.view !== view;
  });
  updateAdminTopbar();
  window.scrollTo(0, 0);
}

function showError(el, msg) {
  el.textContent = msg || '';
  el.hidden = !msg;
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('¡Copiado al portapapeles! 📋');
}

function setBusy(btn, busy, label) {
  if (busy) {
    btn.dataset.label = btn.textContent;
    btn.textContent = label || 'Un momento…';
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.label || btn.textContent;
    btn.disabled = false;
  }
}

/* --------------------- Notas musicales y Confetti ---------------------- */

function initFloatingNotes() {
  const layer = $('notesLayer');
  if (!layer) return;
  const symbols = ['♪', '♫', '♬', '𝄞'];
  for (let i = 0; i < 14; i++) {
    const span = document.createElement('span');
    span.className = 'floating-note';
    span.textContent = symbols[i % symbols.length];
    span.style.setProperty('--x', `${(i * 7.3 + 5) % 94}%`);
    span.style.setProperty('--sz', `${16 + (i % 4) * 5}px`);
    span.style.setProperty('--dur', `${15 + (i % 5) * 3}s`);
    span.style.setProperty('--del', `${-(i * 2.1)}s`);
    layer.appendChild(span);
  }
}

function burstConfetti() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = $('confettiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.scale(dpr, dpr);

  const colors = ['#F6D38B', '#E8A33D', '#3E7BFF', '#72A8FF', '#FFFFFF'];
  const pieces = Array.from({ length: 85 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 9;
    return {
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.45,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 5,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 5,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.25,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
    };
  });

  let frame = 0;
  function step() {
    frame++;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let alive = false;
    for (const p of pieces) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.24;
      p.vx *= 0.99;
      p.rot += p.vrot;
      if (frame > 45) p.alpha -= 0.022;
      if (p.alpha > 0 && p.y < window.innerHeight + 40) {
        alive = true;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
    }
    if (alive && frame < 120) requestAnimationFrame(step);
    else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
  requestAnimationFrame(step);
}

/* ----------------------- Plan B de Foto de Fondo ----------------------- */

function applyBgPref() {
  const pref = localStorage.getItem('ai-bg');
  const noPhoto = pref === 'lights';
  document.body.classList.toggle('no-photo', noPhoto);
  const btn = $('toggleBgBtn');
  if (btn) btn.textContent = noPhoto ? '🖼️ Fondo: Solo Luces' : '🖼️ Fondo: Con Foto';
}

$('toggleBgBtn').addEventListener('click', () => {
  const next = document.body.classList.contains('no-photo') ? 'photo' : 'lights';
  localStorage.setItem('ai-bg', next);
  applyBgPref();
  toast(next === 'lights' ? 'Plan B activado: solo luces de escenario ✨' : 'Foto de escenario activada 📸');
});

/* -------------------------------- Estado -------------------------------- */

let state = null;
let current = null;

const meKey = () => `ai-me-${state && state.drawId}`;
const shareUrl = () => location.origin + location.pathname;
const isAdminHash = () => location.hash === '#organizador' || location.hash === '#admin';

function updateAdminTopbar() {
  const hasSession = !!sessionStorage.getItem('ai-admin');
  $('adminBarTop').hidden = !hasSession;
  if (hasSession) {
    $('switchViewBtn').textContent = isAdminHash() ? '👥 Ver lista pública' : '🛠️ Volver al panel';
  }
}

$('switchViewBtn').addEventListener('click', () => {
  location.hash = isAdminHash() ? '' : '#organizador';
});

$('adminLogoutTop').addEventListener('click', () => {
  sessionStorage.removeItem('ai-admin');
  adminData = null;
  updateAdminTopbar();
  location.hash = '';
  toast('Sesión de organizador cerrada');
});

async function loadState() {
  state = await api.get();
  const title = (state.exists && state.title) || 'AMIGO INVISIBLE';
  $('eventTitle').textContent = title.toUpperCase();
  document.title = `${title} · MUSICAP`;
}

async function route() {
  try {
    if (!state) await loadState();
  } catch (e) {
    $('errorText').textContent = e.message;
    return show('error');
  }
  if (isAdminHash()) {
    return openAdmin();
  }
  if (!state.exists) {
    return show('waiting');
  }
  renderParticipants();
  show('participants');
}

window.addEventListener('hashchange', route);

/* --------------- Crear sorteo (Interactivo sin errores) ---------------- */

const DRAFT_KEY = 'ai-draft-v3';
let builder = loadDraft();
let excTargetPerson = null;

function loadDraft() {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
    const names = Array.isArray(raw.names) ? raw.names.map(cleanName).filter(Boolean) : [];
    const set = new Set(names);
    const pairs = Array.isArray(raw.pairs)
      ? raw.pairs.filter((p) => Array.isArray(p) && p.length === 2 && set.has(p[0]) && set.has(p[1]) && p[0] !== p[1])
      : [];
    return { names, pairs };
  } catch {
    return { names: [], pairs: [] };
  }
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(builder));
  } catch {}
}

function hasPair(a, b) {
  return builder.pairs.some((p) => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
}

function togglePair(a, b, enabled) {
  if (a === b) return;
  builder.pairs = builder.pairs.filter((p) => !((p[0] === a && p[1] === b) || (p[0] === b && p[1] === a)));
  if (enabled) builder.pairs.push([a, b]);
  saveDraft();
  renderBuilder();
}

function exclusionsFor(person) {
  const out = [];
  for (const [a, b] of builder.pairs) {
    if (a === person) out.push(b);
    else if (b === person) out.push(a);
  }
  return out;
}

function addPersonFromInput() {
  const input = $('newPersonInput');
  const err = $('personAddError');
  showError(err, '');
  showError($('setupError'), '');

  const raw = cleanName(input.value);
  if (!raw) {
    input.focus();
    return;
  }

  const key = nameKey(raw);
  const existing = builder.names.find((n) => nameKey(n) === key);
  if (existing) {
    showError(err, `⚠️ "${existing}" ya está en la lista. Agregale inicial, apellido o apodo para diferenciarlos.`);
    input.select();
    return;
  }

  builder.names.push(raw);
  saveDraft();
  input.value = '';
  renderBuilder();
  input.focus();
}

function removePerson(name) {
  builder.names = builder.names.filter((n) => n !== name);
  builder.pairs = builder.pairs.filter(([a, b]) => a !== name && b !== name);
  saveDraft();
  renderBuilder();
}

function renderBuilder() {
  const count = builder.names.length;
  $('namesInfo').textContent = `${count} participante${count === 1 ? '' : 's'}`;
  $('clearDraftBtn').hidden = count === 0;
  $('builderEmpty').hidden = count > 0;

  const list = $('builderList');
  list.replaceChildren(
    ...builder.names.map((name, idx) => {
      const li = document.createElement('li');
      li.className = 'builder-row';

      const main = document.createElement('div');
      main.className = 'builder-row-main';

      const num = document.createElement('span');
      num.className = 'builder-num';
      num.textContent = String(idx + 1);

      const label = document.createElement('span');
      label.className = 'builder-name';
      label.textContent = name;

      main.append(num, label);

      const excs = exclusionsFor(name);
      if (excs.length) {
        const badges = document.createElement('div');
        badges.className = 'builder-exc-badges';
        for (const other of excs) {
          const pill = document.createElement('span');
          pill.className = 'mini-exc';
          pill.textContent = `🚫 ${other}`;
          badges.appendChild(pill);
        }
        main.appendChild(badges);
      }

      const actions = document.createElement('div');
      actions.className = 'builder-row-actions';

      const excBtn = document.createElement('button');
      excBtn.type = 'button';
      excBtn.className = 'btn ghost tiny';
      excBtn.textContent = excs.length ? `🚫 Excepciones (${excs.length})` : '🚫 Excepciones';
      excBtn.addEventListener('click', () => openExcModal(name));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn-remove';
      delBtn.title = `Quitar a ${name}`;
      delBtn.setAttribute('aria-label', `Quitar a ${name}`);
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => removePerson(name));

      actions.append(excBtn, delBtn);
      li.append(main, actions);
      return li;
    })
  );

  // Resumen de excepciones abajo
  const pCount = builder.pairs.length;
  $('exclusionsEmpty').hidden = pCount > 0;
  $('exclusionsInfo').textContent = pCount
    ? `${pCount} restricci${pCount === 1 ? 'ón activa' : 'ones activas'}`
    : '';

  const chips = $('exclusionsChips');
  chips.replaceChildren(
    ...builder.pairs.map(([a, b]) => {
      const chip = document.createElement('span');
      chip.className = 'exc-chip';
      const txt = document.createElement('span');
      txt.textContent = `${a} ↔ ${b}`;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.title = 'Quitar esta excepción';
      rm.textContent = '✕';
      rm.addEventListener('click', () => togglePair(a, b, false));
      chip.append(txt, rm);
      return chip;
    })
  );
}

$('addPersonBtn').addEventListener('click', addPersonFromInput);
$('newPersonInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addPersonFromInput();
  }
});
$('newPersonInput').addEventListener('input', () => showError($('personAddError'), ''));

$('clearDraftBtn').addEventListener('click', () => {
  if (!confirm('¿Vaciar toda la lista de participantes y excepciones cargadas?')) return;
  builder = { names: [], pairs: [] };
  saveDraft();
  renderBuilder();
});

/* ---------------- Modal Selector Visual de Excepciones ----------------- */

function openExcModal(person) {
  if (builder.names.length < 2) {
    return toast('Agregá al menos 2 participantes para configurar excepciones');
  }
  excTargetPerson = person;
  $('excModalTitle').textContent = `Excepciones de ${person}`;
  $('excModalSub').textContent = `Tildá con quiénes ${person} NO puede regalarse (ni darle ni recibir):`;
  $('excSearch').value = '';
  renderExcChecklist();
  $('excModal').hidden = false;
}

function closeExcModal() {
  $('excModal').hidden = true;
  excTargetPerson = null;
}

function renderExcChecklist() {
  if (!excTargetPerson) return;
  const q = nameKey($('excSearch').value);
  const others = builder.names.filter((n) => n !== excTargetPerson && (!q || nameKey(n).includes(q)));

  $('excChecklist').replaceChildren(
    ...others.map((other) => {
      const active = hasPair(excTargetPerson, other);
      const li = document.createElement('li');
      const label = document.createElement('label');
      label.className = `exc-item${active ? ' active' : ''}`;

      const span = document.createElement('span');
      span.textContent = other;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = active;
      cb.addEventListener('change', () => {
        togglePair(excTargetPerson, other, cb.checked);
        label.classList.toggle('active', cb.checked);
      });

      label.append(span, cb);
      li.appendChild(label);
      return li;
    })
  );
}

$('excSearch').addEventListener('input', renderExcChecklist);
$('excModalClose').addEventListener('click', closeExcModal);
$('excModalDone').addEventListener('click', closeExcModal);
$('excModal').addEventListener('click', (e) => {
  if (e.target === $('excModal')) closeExcModal();
});

function validateSetup() {
  renderBuilder();
  return { names: builder.names, groups: builder.pairs };
}

$('setupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('setupError');
  const { names, groups } = validateSetup();
  const pw = sessionStorage.getItem('ai-admin') || '';

  if (names.length < 3) {
    return showError(err, `Agregá al menos 3 participantes (ahora hay ${names.length}).`);
  }
  if (!confirm(`¿Confirmás sortear entre ${names.length} participantes?`)) return;

  showError(err, '');
  const btn = $('setupBtn');
  setBusy(btn, true, 'Sorteando en secreto…');
  try {
    await api.post('create_draw', {
      title: $('setupTitle').value,
      names,
      exclusions: groups,
      adminPassword: pw,
    });
    builder = { names: [], pairs: [] };
    localStorage.removeItem(DRAFT_KEY);
    await loadState();
    const url = shareUrl();
    $('shareLink').textContent = url;
    const msg = `🎶 ¡Ya está listo el sorteo de ${state.title}! Entrá a este link, buscá tu nombre y creá tu PIN de 4 números para descubrir a quién le regalás: ${url}`;
    $('waShareBtn').href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    $('setupPanel').hidden = true;
    $('adminPanel').hidden = true;
    $('createdPanel').hidden = false;
    burstConfetti();
  } catch (ex) {
    showError(err, ex.message);
  } finally {
    setBusy(btn, false);
  }
});

$('copyLinkBtn').addEventListener('click', () => copyText(shareUrl()));
$('goToListBtn').addEventListener('click', () => {
  location.hash = '';
});
$('goToAdminDashBtn').addEventListener('click', () => {
  openAdmin();
});

/* ---------------------------- Participantes ----------------------------- */

function renderParticipants() {
  const list = $('nameList');
  const rawQ = $('search').value;
  $('clearSearch').hidden = !rawQ;
  const q = nameKey(rawQ);
  const me = localStorage.getItem(meKey());
  const items = state.participants.filter((p) => !q || nameKey(p.name).includes(q));
  const done = state.participants.filter((p) => p.hasPin).length;

  $('progress').textContent = `🎶 ${done} de ${state.participants.length} ya abrieron su sobre`;
  list.replaceChildren(
    ...items.map((p, idx) => {
      const li = document.createElement('li');
      li.style.setProperty('--d', `${Math.min(idx * 18, 360)}ms`);

      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seat-btn';
      if (p.hasPin) b.classList.add('claimed');

      const left = document.createElement('div');
      left.className = 'seat-left';

      const av = document.createElement('span');
      av.className = 'seat-avatar';
      av.textContent = initials(p.name);

      const name = document.createElement('span');
      name.className = 'seat-name';
      name.textContent = p.name;

      left.append(av, name);

      const tag = document.createElement('span');
      tag.className = 'seat-tag';
      tag.textContent = p.hasPin ? '🔒 Con PIN' : '✨ Descubrir';

      if (String(p.id) === me) {
        b.classList.add('me');
        tag.textContent = '⭐ Vos';
      }

      b.append(left, tag);
      b.addEventListener('click', () => openPin(p));
      li.appendChild(b);
      return li;
    })
  );
  $('noResults').hidden = items.length > 0;
}

$('search').addEventListener('input', renderParticipants);
$('clearSearch').addEventListener('click', () => {
  $('search').value = '';
  renderParticipants();
  $('search').focus();
});

/* ----------------------- Casilleros de PIN y Modal ---------------------- */

function setupPinBoxes(containerId) {
  const box = $(containerId);
  const hiddenInput = $(box.dataset.target);
  const digits = [...box.querySelectorAll('.pin-digit')];

  function sync() {
    hiddenInput.value = digits.map((d) => d.value).join('');
  }

  digits.forEach((input, idx) => {
    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val.slice(-1);
      sync();
      if (e.target.value && idx < digits.length - 1) {
        digits[idx + 1].focus();
      } else if (e.target.value && idx === digits.length - 1 && containerId === 'pinBoxes1' && !$('pin2Field').hidden) {
        const first2 = $('pinBoxes2').querySelector('.pin-digit');
        if (first2 && !first2.value) first2.focus();
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        digits[idx - 1].value = '';
        sync();
        digits[idx - 1].focus();
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4);
      pasted.split('').forEach((ch, i) => {
        if (digits[i]) digits[i].value = ch;
      });
      sync();
      if (pasted.length) digits[Math.min(pasted.length, digits.length) - 1].focus();
    });
  });

  return {
    clear() {
      digits.forEach((d) => (d.value = ''));
      hiddenInput.value = '';
    },
    focusFirst() {
      digits[0].focus();
    },
    shake() {
      box.classList.remove('shake');
      void box.offsetWidth;
      box.classList.add('shake');
    },
  };
}

const pinUI1 = setupPinBoxes('pinBoxes1');
const pinUI2 = setupPinBoxes('pinBoxes2');

function openPin(p) {
  current = p;
  const isNew = !p.hasPin;
  $('modalEyebrow').textContent = isNew ? 'Primera vez en escena' : 'Bienvenido de vuelta';
  $('modalName').textContent = p.name;
  $('warnName').textContent = p.name;
  $('newPinWarning').hidden = !isNew;
  $('pin2Field').hidden = !isNew;
  $('pinLabel').textContent = isNew ? 'Creá tu PIN secreto de 4 números' : 'Ingresá tu PIN de 4 números';
  $('pinHelp').textContent = isNew
    ? 'Guardalo bien: con este mismo PIN vas a poder volver a entrar cuando quieras.'
    : '¿Te olvidaste tu PIN? Pedile al organizador que te lo blanquee.';
  $('pinBtn').textContent = isNew ? 'Guardar PIN y ver mi sobre' : 'Abrir mi sobre';

  pinUI1.clear();
  pinUI2.clear();
  showError($('pinError'), '');

  $('pinStep').hidden = false;
  $('revealStep').hidden = true;
  $('giftStage').classList.remove('opening');
  $('giftBoxWrap').hidden = false;
  $('ticketReveal').hidden = true;
  $('modal').hidden = false;

  setTimeout(() => pinUI1.focusFirst(), 60);
}

function closeModal() {
  $('modal').hidden = true;
  $('revealTarget').textContent = '';
  current = null;
}

$('pinStep').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('pinError');
  const pin = $('pin').value;
  const isNew = !current.hasPin;

  if (!/^\d{4}$/.test(pin)) {
    pinUI1.shake();
    return showError(err, 'Completá los 4 números de tu PIN.');
  }
  if (isNew && pin !== $('pin2').value) {
    pinUI2.shake();
    return showError(err, 'Los dos PINs no coinciden. Revisalos.');
  }

  showError(err, '');
  const btn = $('pinBtn');
  setBusy(btn, true, 'Verificando…');
  try {
    const r = await api.post('reveal', { id: current.id, pin });
    current.hasPin = true;
    localStorage.setItem(meKey(), String(current.id));
    $('revealHello').textContent = `Butaca de ${r.name}`;
    $('revealTarget').textContent = r.target;
    $('revealNote').textContent = r.created
      ? 'Tu PIN de 4 números quedó guardado. Podés volver a entrar cuando quieras.'
      : 'Podés volver a consultar tu entrada todas las veces que necesites.';
    $('pinStep').hidden = true;
    $('revealStep').hidden = false;
    renderParticipants();
  } catch (ex) {
    pinUI1.shake();
    showError(err, ex.message);
    loadState().then(renderParticipants).catch(() => {});
  } finally {
    setBusy(btn, false);
  }
});

function openGiftBox() {
  if (!$('ticketReveal').hidden) return;
  $('giftStage').classList.add('opening');
  setTimeout(() => {
    $('giftBoxWrap').hidden = true;
    $('ticketReveal').hidden = false;
    burstConfetti();
  }, 280);
}

$('giftStage').addEventListener('click', openGiftBox);
$('giftStage').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    openGiftBox();
  }
});

$('modalClose').addEventListener('click', closeModal);
$('revealClose').addEventListener('click', closeModal);
$('modal').addEventListener('click', (e) => {
  if (e.target === $('modal')) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('excModal').hidden) closeExcModal();
  else if (e.key === 'Escape' && !$('modal').hidden) closeModal();
});

/* ------------------------- Área del Organizador ------------------------- */

let adminData = null;

async function openAdmin() {
  show('admin');
  $('createdPanel').hidden = true;
  const pw = sessionStorage.getItem('ai-admin');
  if (!pw) {
    $('adminLogin').hidden = false;
    $('setupPanel').hidden = true;
    $('adminPanel').hidden = true;
    setTimeout(() => $('adminPw').focus(), 60);
    return;
  }

  try {
    adminData = await api.post('admin_status', { adminPassword: pw });
    $('adminLogin').hidden = true;
    updateAdminTopbar();

    if (!adminData.exists) {
      $('setupPanel').hidden = false;
      $('adminPanel').hidden = true;
      validateSetup();
    } else {
      $('setupPanel').hidden = true;
      $('adminPanel').hidden = false;
      renderAdmin();
    }
  } catch (e) {
    sessionStorage.removeItem('ai-admin');
    updateAdminTopbar();
    $('adminLogin').hidden = false;
    $('setupPanel').hidden = true;
    $('adminPanel').hidden = true;
    showError($('adminLoginError'), e.message);
  }
}

$('adminLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  showError($('adminLoginError'), '');
  const btn = $('adminLoginBtn');
  setBusy(btn, true, 'Verificando…');
  sessionStorage.setItem('ai-admin', $('adminPw').value);
  $('adminPw').value = '';
  try {
    await openAdmin();
  } finally {
    setBusy(btn, false);
  }
});

$('adminRefresh').addEventListener('click', openAdmin);
$('adminSearch').addEventListener('input', renderAdmin);
$('onlyPending').addEventListener('change', renderAdmin);
$('copyGroupLinkAdmin').addEventListener('click', () => copyText(shareUrl()));

function fmtDate(ts) {
  return new Date(ts).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderAdmin() {
  if (!adminData || !adminData.exists) return;
  const ps = adminData.participants;
  const done = ps.filter((p) => p.hasPin).length;
  const total = ps.length;
  const pct = total ? done / total : 0;
  const circumference = 314.16;

  $('adminRingNumbers').textContent = `${done}/${total}`;
  $('adminRingCircle').style.strokeDashoffset = String(circumference * (1 - pct));
  $('adminProgressText').textContent =
    done === total
      ? '¡Todos los participantes ya abrieron su sobre! 🎉'
      : `Faltan entrar ${total - done} participante${total - done === 1 ? '' : 's'}.`;

  const q = nameKey($('adminSearch').value);
  const onlyPending = $('onlyPending').checked;
  const items = ps.filter((p) => (!q || nameKey(p.name).includes(q)) && (!onlyPending || !p.hasPin));

  $('adminList').replaceChildren(
    ...items.map((p) => {
      const li = document.createElement('li');
      const who = document.createElement('div');
      who.className = 'who';
      const strong = document.createElement('strong');
      strong.textContent = p.name;
      const status = document.createElement('span');
      status.textContent = p.locked
        ? '🔒 Bloqueado temporalmente por intentos fallidos'
        : p.hasPin
          ? `✅ Ya entró${p.lastSeen ? ` · última vez ${fmtDate(p.lastSeen)}` : ''}`
          : '⏳ Pendiente de entrar';
      who.append(strong, status);
      li.appendChild(who);

      if (p.hasPin || p.locked) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn ghost small';
        b.textContent = 'Resetear PIN';
        b.addEventListener('click', () => resetPin(p, b));
        li.appendChild(b);
      }
      return li;
    })
  );
}

async function resetPin(p, btn) {
  if (
    !confirm(
      `¿Resetear el PIN de ${p.name}?\n\nCuando vuelva a entrar va a poder crear un PIN nuevo. Su amigo invisible asignado NO cambia.`
    )
  ) {
    return;
  }
  setBusy(btn, true, '…');
  try {
    await api.post('reset_pin', { adminPassword: sessionStorage.getItem('ai-admin'), id: p.id });
    toast(`PIN de ${p.name} blanqueado`);
    await loadState();
    await openAdmin();
  } catch (e) {
    alert(e.message);
    setBusy(btn, false);
  }
}

$('copyPendingBtn').addEventListener('click', () => {
  if (!adminData || !adminData.exists) return;
  const pending = adminData.participants.filter((p) => !p.hasPin).map((p) => p.name);
  if (!pending.length) return toast('¡Ya entraron todos! 🎉');
  copyText(
    `🎶 Todavía faltan abrir su sobre del Amigo Invisible (${pending.length}):\n${pending
      .map((n) => `• ${n}`)
      .join('\n')}\n\nEntren acá: ${shareUrl()}`
  );
});

$('resetAllBtn').addEventListener('click', async () => {
  const answer = prompt(
    'Esto borra el sorteo actual y todos los PINs para poder armar uno nuevo desde cero.\n\nEscribí BORRAR para confirmar:'
  );
  if (answer === null) return;
  if (answer.trim().toUpperCase() !== 'BORRAR') return alert('Cancelado: no se borró nada.');
  try {
    await api.post('reset_all', { adminPassword: sessionStorage.getItem('ai-admin') });
    state = null;
    toast('Sorteo anterior borrado');
    await loadState();
    await openAdmin();
  } catch (e) {
    alert(e.message);
  }
});

/* -------------------------------- Inicio -------------------------------- */

applyBgPref();
initFloatingNotes();
route();
