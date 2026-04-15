'use strict';

(function () {
  var searchInput = document.querySelector('[data-admin-search]');
  var selectAll = document.querySelector('[data-select-all]');
  var rowChecks = Array.prototype.slice.call(document.querySelectorAll('[data-contact-select]'));
  var openRows = Array.prototype.slice.call(document.querySelectorAll('[data-row-open]'));
  var countLabel = document.querySelector('[data-selected-count]');
  var logoutForm = document.querySelector('.admin-logout-form');

  function shouldIgnoreRowOpen(target) {
    if (!target || !target.closest) return false;
    return Boolean(target.closest('a,button,input,select,textarea,label,[data-no-row-open]'));
  }

  function updateSelectedCount() {
    if (!countLabel) return;
    var selected = rowChecks.filter(function (checkbox) {
      return checkbox.checked;
    }).length;
    countLabel.textContent = String(selected);
  }

  if (selectAll) {
    selectAll.addEventListener('change', function () {
      rowChecks.forEach(function (checkbox) {
        checkbox.checked = selectAll.checked;
      });
      updateSelectedCount();
    });

    rowChecks.forEach(function (checkbox) {
      checkbox.addEventListener('change', function () {
        var allChecked = rowChecks.length > 0 && rowChecks.every(function (item) {
          return item.checked;
        });
        selectAll.checked = allChecked;
        updateSelectedCount();
      });
    });

    updateSelectedCount();
  }

  if (openRows.length) {
    openRows.forEach(function (row) {
      var destination = row.getAttribute('data-row-open');
      if (!destination) return;

      row.addEventListener('click', function (event) {
        if (shouldIgnoreRowOpen(event.target)) return;
        window.location.href = destination;
      });

      row.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (shouldIgnoreRowOpen(event.target)) return;
        event.preventDefault();
        window.location.href = destination;
      });
    });
  }

  document.addEventListener('keydown', function (event) {
    if (!searchInput) return;
    if (event.key !== '/') return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    var tagName = event.target && event.target.tagName;
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;
    event.preventDefault();
    searchInput.focus();
    if (typeof searchInput.select === 'function') searchInput.select();
  });

  if (logoutForm) {
    logoutForm.addEventListener('submit', function () {
      var button = logoutForm.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
    });
  }

  var autoForms = Array.prototype.slice.call(document.querySelectorAll('form[data-auto-submit]'));

  autoForms.forEach(function (form) {
    var pending = null;
    var hasSubmitted = false;
    var liveNotes = Array.prototype.slice.call(form.querySelectorAll('[data-live-note]'));

    function setLiveMessage(message) {
      liveNotes.forEach(function (node) {
        node.textContent = message;
      });
    }

    function queueSubmit(delay) {
      if (hasSubmitted) return;
      if (pending) window.clearTimeout(pending);

      setLiveMessage('Updating results...');
      pending = window.setTimeout(function () {
        hasSubmitted = true;
        form.submit();
      }, delay);
    }

    form.addEventListener('input', function (event) {
      var target = event.target;
      if (!target || !target.name || target.tagName === 'SELECT') return;
      queueSubmit(320);
    });

    form.addEventListener('change', function (event) {
      var target = event.target;
      if (!target || !target.name) return;
      queueSubmit(120);
    });

    form.addEventListener('submit', function () {
      hasSubmitted = true;
      setLiveMessage('Updating results...');
    });
  });
})();
