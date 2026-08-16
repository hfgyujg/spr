(function () {
  'use strict';
  var script = document.currentScript;
  var scriptUrl = script && script.src ? new URL(script.src) : null;
  var defaultBase = scriptUrl ? scriptUrl.origin : window.location.origin;

  function mount(node) {
    var passportId = node.getAttribute('data-spr-passport');
    if (!passportId) return;
    var base = node.getAttribute('data-spr-base-url') || defaultBase;
    var width = node.getAttribute('data-spr-width') || '320';
    var height = node.getAttribute('data-spr-height') || '62';
    var frame = document.createElement('iframe');
    frame.title = 'SPR Software Trust Badge';
    frame.loading = 'lazy';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.style.width = width + 'px';
    frame.style.height = height + 'px';
    frame.style.border = '0';
    frame.style.background = 'transparent';
    frame.src = base.replace(/\/$/, '') + '/api/v1/public/passports/' + encodeURIComponent(passportId) + '/badge';
    node.replaceChildren(frame);
  }

  function init() {
    document.querySelectorAll('[data-spr-passport]').forEach(mount);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
