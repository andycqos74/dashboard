/*
 * QoS Staff Dashboard — pluggable logo storage.
 *
 * One small interface, several interchangeable backends ("drivers"), so where
 * uploaded logos live is a config choice rather than a code change:
 *
 *   Storage.init(config)      -> Promise, picks and prepares the driver
 *   Storage.put(file)         -> Promise<key>   store an image, return its key
 *   Storage.remove(key)       -> Promise        delete a stored image
 *   Storage.hydrate(keys)     -> Promise        resolve keys to URLs up front
 *   Storage.url(key)          -> string|null    synchronous lookup for render
 *   Storage.isKey(value)      -> bool           is this a stored-image key?
 *   Storage.driverName()      -> string
 *
 * Keys look like "store:<id>". Anything else in a link's `logo` field (an http
 * URL or a repo-relative path like assets/logos/xero.png) is used verbatim, so
 * hand-authored logos in config/links.json keep working untouched.
 *
 * Drivers:
 *   indexeddb  browser-local; no backend needed. Uploads stay in that browser.
 *   http       POST multipart to an upload endpoint; shared by everyone.
 *   none       uploads disabled (URLs still work).
 */
window.Storage = (function () {
  "use strict";

  var KEY_PREFIX = 'store:';
  var MAX_SOURCE_BYTES = 5 * 1024 * 1024;   // reject anything larger up front
  var MAX_EDGE = 512;                        // downscale longest edge to this
  var cfg = { driver: 'indexeddb', endpoint: '', maxEdge: MAX_EDGE };
  var driver = null;
  var urls = {};    // key -> resolved URL, for synchronous render

  function isKey(v) { return typeof v === 'string' && v.indexOf(KEY_PREFIX) === 0; }
  function idOf(key) { return String(key).slice(KEY_PREFIX.length); }
  function newId() {
    return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---- image normalisation -------------------------------------------------
  // Downscale raster images before storing: a 4MB phone photo dropped on a tile
  // becomes a few KB, which matters whether we're filling browser storage or
  // pushing bytes to a server. SVGs pass through untouched (already ideal).
  function normalise(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error('No file'));
      if (!/^image\//.test(file.type)) return reject(new Error('Not an image file'));
      if (file.size > MAX_SOURCE_BYTES) return reject(new Error('Image is larger than 5MB'));
      if (file.type === 'image/svg+xml' || file.type === 'image/gif') return resolve(file);

      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var max = cfg.maxEdge || MAX_EDGE;
        var scale = Math.min(1, max / Math.max(w, h));
        if (scale >= 1) { URL.revokeObjectURL(url); return resolve(file); }
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * scale));
        c.height = Math.max(1, Math.round(h * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (blob) {
          URL.revokeObjectURL(url);
          resolve(blob || file);
        }, 'image/png');
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
      img.src = url;
    });
  }

  // ---- driver: indexeddb ---------------------------------------------------
  var idb = (function () {
    var DB = 'qos-dash', STORE = 'logos', dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise(function (resolve, reject) {
        var req = indexedDB.open(DB, 1);
        req.onupgradeneeded = function () {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
      return dbp;
    }
    function tx(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var t = db.transaction(STORE, mode), store = t.objectStore(STORE), out;
          out = fn(store);
          t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
          t.onerror = function () { reject(t.error); };
        });
      });
    }
    return {
      name: 'indexeddb',
      available: function () { return typeof indexedDB !== 'undefined'; },
      put: function (blob) {
        var id = newId();
        return tx('readwrite', function (s) { s.put(blob, id); }).then(function () { return KEY_PREFIX + id; });
      },
      remove: function (key) {
        return tx('readwrite', function (s) { s.delete(idOf(key)); });
      },
      resolve: function (key) {
        return tx('readonly', function (s) { return s.get(idOf(key)); }).then(function (blob) {
          return blob ? URL.createObjectURL(blob) : null;
        });
      }
    };
  })();

  // ---- driver: http --------------------------------------------------------
  // Expects an endpoint that accepts multipart POST (field "file") and answers
  // with JSON {"key":"..."} or {"url":"..."}; GET {endpoint}/{id} serves it.
  var http = {
    name: 'http',
    available: function () { return !!cfg.endpoint; },
    put: function (blob, filename) {
      var fd = new FormData();
      fd.append('file', blob, filename || 'logo.png');
      return fetch(cfg.endpoint, { method: 'POST', body: fd }).then(function (r) {
        if (!r.ok) throw new Error('Upload failed (' + r.status + ')');
        return r.json().catch(function () { return {}; });
      }).then(function (j) {
        if (j.key) return isKey(j.key) ? j.key : KEY_PREFIX + j.key;
        if (j.url) return j.url;                 // absolute URL, stored as-is
        throw new Error('Upload endpoint returned no key or url');
      });
    },
    remove: function (key) {
      return fetch(cfg.endpoint + '/' + encodeURIComponent(idOf(key)), { method: 'DELETE' })
        .catch(function () { /* deletion is best-effort */ });
    },
    resolve: function (key) {
      return Promise.resolve(cfg.endpoint + '/' + encodeURIComponent(idOf(key)));
    }
  };

  // ---- driver: combinedstorage --------------------------------------------
  // Uploads through this dashboard's own /upload proxy, which holds the
  // Combined Storage admin credentials server-side (a browser cannot keep a
  // secret) and forwards to POST /api/files/{parent}/upload. Combined Storage
  // answers with a stable public CDN URL (/f/<token>) that needs no auth to
  // read, so the logo is stored as a plain URL and every visitor sees it.
  var combined = {
    name: 'combinedstorage',
    available: function () { return !!cfg.endpoint; },
    put: function (blob, filename) {
      var name = filename || 'logo.png';
      return fetch(cfg.endpoint + '?name=' + encodeURIComponent(name), {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'application/octet-stream' },
        body: blob
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) throw new Error(j.error || ('Upload failed (' + r.status + ')'));
          return j;
        });
      }).then(function (j) {
        if (!j.url) throw new Error('Upload succeeded but returned no URL');
        return j.url;                      // public CDN URL, stored verbatim
      });
    },
    // The bytes live in Combined Storage and may be shared; manage/remove them
    // there rather than deleting from a link tile.
    remove: function () { return Promise.resolve(); },
    resolve: function (key) { return Promise.resolve(key); }
  };

  var none = {
    name: 'none',
    available: function () { return true; },
    put: function () { return Promise.reject(new Error('Uploads are disabled')); },
    remove: function () { return Promise.resolve(); },
    resolve: function () { return Promise.resolve(null); }
  };

  var DRIVERS = { indexeddb: idb, http: http, combinedstorage: combined, none: none };

  function pick(name) {
    var d = DRIVERS[name];
    if (d && d.available()) return d;
    if (name && name !== 'indexeddb') {
      // Configured driver unusable (e.g. http with no endpoint): fall back to
      // browser-local so uploading still works rather than silently breaking.
      if (idb.available()) return idb;
    }
    return idb.available() ? idb : none;
  }

  return {
    init: function (config) {
      if (config) {
        if (config.driver) cfg.driver = config.driver;
        if (config.endpoint) cfg.endpoint = String(config.endpoint).replace(/\/$/, '');
        if (config.maxEdge) cfg.maxEdge = config.maxEdge;
      }
      driver = pick(cfg.driver);
      return Promise.resolve(driver.name);
    },
    driverName: function () { return driver ? driver.name : 'none'; },
    uploadsEnabled: function () { return !!driver && driver.name !== 'none'; },
    isKey: isKey,
    put: function (file) {
      if (!driver) return Promise.reject(new Error('Storage not ready'));
      return normalise(file).then(function (blob) {
        return driver.put(blob, file.name);
      }).then(function (key) {
        if (!isKey(key)) return key;                       // absolute URL
        return driver.resolve(key).then(function (u) { urls[key] = u; return key; });
      });
    },
    remove: function (key) {
      if (!driver || !isKey(key)) return Promise.resolve();
      delete urls[key];
      return driver.remove(key);
    },
    // Resolve every stored key we are about to render, so url() can be sync.
    hydrate: function (keys) {
      if (!driver) return Promise.resolve();
      var todo = (keys || []).filter(function (k) { return isKey(k) && !urls[k]; });
      if (!todo.length) return Promise.resolve();
      return Promise.all(todo.map(function (k) {
        return driver.resolve(k).then(function (u) { if (u) urls[k] = u; })
          .catch(function () {});
      }));
    },
    url: function (key) {
      if (!isKey(key)) return key || null;   // plain URL / path passes through
      return urls[key] || null;
    }
  };
})();
