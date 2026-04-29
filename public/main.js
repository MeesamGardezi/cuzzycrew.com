'use strict';

/* ================================================================
   DARK MODE TOGGLE
   Persists preference in localStorage, applies on load.
================================================================ */
(function () {
  var html = document.documentElement;
  var btn  = document.getElementById('theme-toggle');
  var icon = document.getElementById('theme-icon');
  var lbl  = document.getElementById('theme-label');
  var logos = document.querySelectorAll('[data-theme-logo]');

  function readTheme() {
    try {
      return localStorage.getItem('cc-theme');
    } catch (_error) {
      return null;
    }
  }

  function writeTheme(theme) {
    try {
      localStorage.setItem('cc-theme', theme);
    } catch (_error) {
      // Ignore storage restrictions so other scripts keep running.
    }
  }

  function syncThemeLogos(theme) {
    logos.forEach(function (logo) {
      var nextSrc = theme === 'dark'
        ? logo.getAttribute('data-logo-dark')
        : logo.getAttribute('data-logo-light');

      if (nextSrc) {
        logo.setAttribute('src', nextSrc);
      }
    });
  }

  function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    writeTheme(theme);
    syncThemeLogos(theme);
    if (icon) icon.textContent = theme === 'dark' ? '☀' : '☽';
    if (lbl)  lbl.textContent  = theme === 'dark' ? 'LIGHT' : 'DARK';
  }

  // Apply saved or default theme on load
  var saved = readTheme();
  if (saved === 'dark') {
    applyTheme('dark');
  } else {
    syncThemeLogos('light');
  }

  if (btn) {
    btn.addEventListener('click', function () {
      var current = html.getAttribute('data-theme');
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  }
})();

/* ================================================================
   MOBILE NAV TOGGLE
================================================================ */
(function () {
  var navLinks = document.querySelector('.nav-links');
  var navToggle = document.querySelector('[data-nav-toggle]');
  if (!navLinks || !navToggle) return;

  function setExpanded(expanded) {
    navToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  navToggle.addEventListener('click', function () {
    var isOpen = navLinks.classList.toggle('show');
    setExpanded(isOpen);
  });

  navLinks.addEventListener('click', function (event) {
    if (!event.target.closest('a')) return;
    navLinks.classList.remove('show');
    setExpanded(false);
  });

  window.addEventListener('resize', function () {
    if (window.innerWidth > 900) {
      navLinks.classList.remove('show');
      setExpanded(false);
    }
  });
})();

/* ================================================================
   LIVE INSTAGRAM FOLLOWER REFRESH
   Polls /api/followers every 5 minutes and updates the counter.
================================================================ */
(function () {
  var el = document.getElementById('ig-count');
  if (!el) return;

  function refresh() {
    fetch('/api/followers')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (data) {
        if (data && data.count) el.textContent = data.count;
      })
      .catch(function () { /* silently keep existing value */ });
  }

  // First refresh after 30s, then every 5 min
  setTimeout(function () {
    refresh();
    setInterval(refresh, 5 * 60 * 1000);
  }, 30000);
})();

/* ================================================================
   SECTION VIEW TRACKING
   Fires once per section per page load via IntersectionObserver.
   Saves counts server-side in data/views.json.
================================================================ */
(function () {
  if (!('IntersectionObserver' in window)) return;

  var seen = {};
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var id = entry.target.id;
      if (entry.isIntersecting && id && !seen[id]) {
        seen[id] = true;
        fetch('/api/views/' + id, { method: 'POST' }).catch(function () {});
      }
    });
  }, { threshold: 0.25 });

  document.querySelectorAll('section[id], header[id]').forEach(function (el) {
    observer.observe(el);
  });
})();

/* ================================================================
   JOIN CUZZYCREW FORM
   Async submit — no page reload.
================================================================ */
(function () {
  var form = document.getElementById('join-form');
  if (!form) return;
  if (typeof window.fetch !== 'function') return;

  var input = form.querySelector('.hero-join-input');
  var msg = document.getElementById('join-msg');
  var btn = form.querySelector('button[type="submit"]');
  if (!input || !msg || !btn) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = input.value.trim();

    if (!email) {
      msg.textContent = '\u2717 Enter your email first.';
      msg.className = 'join-msg join-error';
      return;
    }

    btn.disabled    = true;
    btn.textContent = 'Sending\u2026';
    msg.textContent = '';
    msg.className   = 'join-msg';
    msg.setAttribute('role', 'status');
    msg.setAttribute('aria-live', 'polite');

    fetch('/join', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: email }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          msg.textContent = data.already
            ? '\u2713 Already signed up.'
            : '\u2713 You\u2019re in.';
          msg.className = 'join-msg join-success';
          form.reset();
        } else {
          msg.textContent = '\u2717 ' + (data.error || 'Something went wrong.');
          msg.className   = 'join-msg join-error';
        }
      })
      .catch(function () {
        msg.textContent = '\u2717 Connection issue \u2014 try again.';
        msg.className   = 'join-msg join-error';
      })
      .finally(function () {
        btn.disabled    = false;
        btn.textContent = 'Join \u2192';
      });
  });
})();
