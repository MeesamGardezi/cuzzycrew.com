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

  function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    localStorage.setItem('cc-theme', theme);
    if (icon) icon.textContent = theme === 'dark' ? '☀' : '☽';
    if (lbl)  lbl.textContent  = theme === 'dark' ? 'LIGHT' : 'DARK';
  }

  // Apply saved or default theme on load
  var saved = localStorage.getItem('cc-theme');
  if (saved === 'dark') applyTheme('dark');

  if (btn) {
    btn.addEventListener('click', function () {
      var current = html.getAttribute('data-theme');
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  }
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

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email  = form.querySelector('.hero-join-input').value.trim();
    var msg    = document.getElementById('join-msg');
    var btn    = form.querySelector('.join-submit');

    btn.disabled    = true;
    btn.textContent = 'Sending\u2026';
    msg.textContent = '';
    msg.className   = 'join-msg';

    fetch('/join', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: email }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          msg.textContent = data.already
            ? 'Already signed up.'
            : 'You\u2019re in.';
          msg.className = 'join-msg join-success';
          form.reset();
        } else {
          msg.textContent = data.error || 'Something went wrong.';
          msg.className   = 'join-msg join-error';
        }
      })
      .catch(function () {
        msg.textContent = 'Connection issue \u2014 try again.';
        msg.className   = 'join-msg join-error';
      })
      .finally(function () {
        btn.disabled    = false;
        btn.textContent = 'Join The Crew \u2192';
      });
  });
})();
