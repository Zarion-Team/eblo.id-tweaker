(function () {
  'use strict';
  if (window.self !== window.top) {
    const blockedEndpoints = ['api/notifications', 'api/feed', 'session-status'];
    if (window.fetch) {
      const originalFetch = window.fetch;
      window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (blockedEndpoints.some(ep => url.includes(ep))) {
          return Promise.resolve(new Response(JSON.stringify({ data: [], success: true }), { status: 200 }));
        }
        return originalFetch.call(this, input, init);
      };
    }
    if (window.XMLHttpRequest) {
      const originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method, url, ...args) {
        if (typeof url === 'string' && blockedEndpoints.some(ep => url.includes(ep))) {
          this._blocked = true;
        }
        return originalOpen.apply(this, [method, url, ...args]);
      };
      const originalSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function (...args) {
        if (this._blocked) {

          Object.defineProperty(this, 'readyState', { writable: true, value: 4 });
          Object.defineProperty(this, 'status', { writable: true, value: 200 });
          Object.defineProperty(this, 'statusText', { writable: true, value: 'OK' });
          Object.defineProperty(this, 'responseText', { writable: true, value: JSON.stringify({ data: [], success: true }) });
          Object.defineProperty(this, 'response', { writable: true, value: { data: [], success: true } });
          if (typeof this.onreadystatechange === 'function') {
            this.onreadystatechange();
          }
          this.dispatchEvent(new Event('readystatechange'));
          this.dispatchEvent(new Event('load'));
          return;
        }
        return originalSend.apply(this, args);
      };
    }
  }
})();