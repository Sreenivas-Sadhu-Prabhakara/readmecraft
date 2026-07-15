/* ============================================================
   readmecraft — client-side README interview + generator.
   No network. No dependencies. Draft in localStorage.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- tiny helpers ---------- */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }
  var STORE_KEY = "readmecraft:draft:v1";

  /* ============================================================
     SECTION MODEL
     Core body sections can be toggled + reordered. `fixed:true`
     means always-on / not reorderable (title, license).
     A section may declare free-text fields shown in "The content".
     ============================================================ */
  var SECTIONS = [
    { id: "title",   name: "Title & pitch",     fixed: true,  on: true },
    { id: "badges",  name: "Badges / tech",     fixed: false, on: false,
      fields: [{ key: "tech", type: "text", label: "Tech / badges",
        sub: "comma-separated (e.g. TypeScript, Node 20, MIT)",
        ph: "TypeScript, Node 20, Zero deps" }] },
    { id: "about",   name: "About / why",       fixed: false, on: true,
      fields: [{ key: "problem_note", type: "info",
        text: "Uses “The problem it solves” from the basics above." }] },
    { id: "features", name: "Features",         fixed: false, on: true,
      fields: [{ key: "features", type: "textarea", rows: 4, label: "Features",
        sub: "one per line", ph: "Streams input, so file size is not a limit\nZero runtime dependencies\nWorks in Node and the browser" }] },
    { id: "install", name: "Installation",      fixed: false, on: true,
      fields: [{ key: "install", type: "textarea", rows: 2, label: "Install command(s)",
        sub: "shown as a shell code block", ph: "npm install acme-parser" }] },
    { id: "usage",   name: "Usage / quickstart", fixed: false, on: true,
      fields: [
        { key: "usage_lang", type: "text", label: "Example language",
          sub: "for syntax fence (e.g. js, python, bash)", ph: "js" },
        { key: "usage", type: "textarea", rows: 5, label: "Usage example",
          sub: "shown as a fenced code block", ph: "import { parse } from 'acme-parser';\n\nconst rows = parse(readFileSync('acme.log', 'utf8'));\nconsole.log(rows.length);" }] },
    { id: "config",  name: "Configuration",     fixed: false, on: false,
      fields: [{ key: "config", type: "textarea", rows: 3, label: "Configuration notes",
        sub: "options, env vars, flags", ph: "ACME_STRICT=1   Fail on malformed lines instead of skipping them." }] },
    { id: "contributing", name: "Contributing", fixed: false, on: false,
      fields: [{ key: "contributing", type: "textarea", rows: 3, label: "How to contribute",
        sub: "leave blank for a sensible default", ph: "" }] },
    { id: "acknowledgements", name: "Acknowledgements", fixed: false, on: false,
      fields: [{ key: "acks", type: "textarea", rows: 2, label: "Thanks / credits",
        sub: "one per line", ph: "Inspired by fast-log\nIcon by @someone" }] },
    { id: "license", name: "License",           fixed: true,  on: true }
  ];

  /* ============================================================
     PRESETS — reshape which optional sections are ON and prime
     a couple of empty fields with type-appropriate placeholders.
     Presets never overwrite text the user has already typed.
     ============================================================ */
  var PRESETS = {
    cli: {
      on:  ["about", "features", "install", "usage", "config", "license"],
      off: ["badges", "contributing", "acknowledgements"],
      seed: { usage_lang: "bash" }
    },
    library: {
      on:  ["badges", "about", "features", "install", "usage", "license"],
      off: ["config", "contributing", "acknowledgements"],
      seed: { usage_lang: "js" }
    },
    webapp: {
      on:  ["about", "features", "install", "usage", "contributing", "license"],
      off: ["badges", "config", "acknowledgements"],
      seed: { usage_lang: "bash" }
    },
    api: {
      on:  ["about", "features", "install", "usage", "config", "license"],
      off: ["badges", "contributing", "acknowledgements"],
      seed: { usage_lang: "http" }
    }
  };

  /* ============================================================
     STATE
     ============================================================ */
  var state = {
    preset: "library",
    order: SECTIONS.map(function (s) { return s.id; }),
    enabled: {},          // id -> bool
    values: {}            // field key -> string
  };
  SECTIONS.forEach(function (s) { state.enabled[s.id] = !!s.on; });

  var storageOk = true;

  function sectionById(id) {
    for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].id === id) return SECTIONS[i];
    return null;
  }

  /* --- persistence --- */
  function save() {
    if (!storageOk) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        preset: state.preset, order: state.order,
        enabled: state.enabled, values: state.values
      }));
    } catch (e) { storageOk = false; }
  }
  function load() {
    if (!storageOk) return;
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (!d || typeof d !== "object") return;
      if (typeof d.preset === "string" && PRESETS[d.preset]) state.preset = d.preset;
      if (d.values && typeof d.values === "object") state.values = d.values;
      if (d.enabled && typeof d.enabled === "object") {
        SECTIONS.forEach(function (s) {
          if (s.fixed) { state.enabled[s.id] = true; return; }
          if (typeof d.enabled[s.id] === "boolean") state.enabled[s.id] = d.enabled[s.id];
        });
      }
      if (Array.isArray(d.order)) {
        // keep only known ids, then append any missing (schema evolution)
        var known = {}; SECTIONS.forEach(function (s) { known[s.id] = true; });
        var clean = d.order.filter(function (id) { return known[id]; });
        SECTIONS.forEach(function (s) { if (clean.indexOf(s.id) < 0) clean.push(s.id); });
        state.order = clean;
      }
    } catch (e) { /* ignore corrupt draft */ }
  }

  /* ---------- value getters ---------- */
  function val(key) { return (state.values[key] || "").trim(); }
  function rawVal(key) { return state.values[key] || ""; }
  function lines(key) {
    return rawVal(key).split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
  }

  /* ============================================================
     THE MARKDOWN ASSEMBLER
     Builds a real README.md string from state, in section order,
     skipping disabled/empty sections cleanly.
     ============================================================ */
  function niceLicenseName(id) {
    var map = {
      "MIT": "MIT License", "Apache-2.0": "Apache License 2.0",
      "GPL-3.0": "GNU General Public License v3.0",
      "BSD-3-Clause": "BSD 3-Clause License", "MPL-2.0": "Mozilla Public License 2.0",
      "Unlicense": "The Unlicense"
    };
    return map[id] || id;
  }

  function buildMarkdown() {
    var name = val("name") || "Project Name";
    var out = [];

    state.order.forEach(function (id) {
      if (!state.enabled[id]) return;
      var block = renderSectionMd(id, name);
      if (block != null && block !== "") out.push(block);
    });

    return out.join("\n\n") + "\n";
  }

  function renderSectionMd(id, name) {
    switch (id) {
      case "title": {
        var s = "# " + name;
        var tag = val("tagline");
        if (tag) s += "\n\n> " + tag;
        return s;
      }
      case "badges": {
        var tech = val("tech");
        if (!tech) return "";
        var parts = tech.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
        if (!parts.length) return "";
        // Shields-style static badges: text-only, no external image needed to be valid Markdown.
        var badges = parts.map(function (t) {
          return "`" + t + "`";
        }).join(" ");
        return badges;
      }
      case "about": {
        var problem = val("problem");
        var tagline = val("tagline");
        if (!problem && !tagline) return "";
        var body = problem || tagline;
        return "## About\n\n" + body;
      }
      case "features": {
        var feats = lines("features");
        if (!feats.length) return "";
        return "## Features\n\n" + feats.map(function (f) { return "- " + f; }).join("\n");
      }
      case "install": {
        var ins = rawVal("install").trim();
        if (!ins) return "";
        return "## Installation\n\n```sh\n" + ins.replace(/\s+$/, "") + "\n```";
      }
      case "usage": {
        var code = rawVal("usage").replace(/\s+$/, "");
        if (!code.trim()) return "";
        var lang = val("usage_lang");
        var fence = lang ? lang : "";
        return "## Usage\n\n```" + fence + "\n" + code + "\n```";
      }
      case "config": {
        var cfg = rawVal("config").trim();
        if (!cfg) return "";
        return "## Configuration\n\n" + cfg;
      }
      case "contributing": {
        var c = rawVal("contributing").trim();
        if (c) return "## Contributing\n\n" + c;
        // sensible default when the section is on but left blank
        return "## Contributing\n\nContributions are welcome! Please open an issue to discuss a "
          + "change before submitting a pull request, and make sure any tests pass.";
      }
      case "acknowledgements": {
        var acks = lines("acks");
        if (!acks.length) return "";
        return "## Acknowledgements\n\n" + acks.map(function (a) { return "- " + a; }).join("\n");
      }
      case "license": {
        var lic = val("license") || "MIT";
        if (lic === "none") return "";
        var holder = val("author");
        var year = val("year") || "2026";
        var line = holder
          ? "© " + year + " " + holder + "."
          : "Released under the " + niceLicenseName(lic) + ".";
        if (lic === "Unlicense") {
          return "## License\n\nReleased into the public domain under [The Unlicense](./LICENSE).";
        }
        return "## License\n\n[" + niceLicenseName(lic) + "](./LICENSE)"
          + (holder ? " — " + line : ".");
      }
    }
    return "";
  }

  /* ============================================================
     HAND-ROLLED MARKDOWN RENDERER (subset, no library)
     Supports: h1-h4, fenced code, unordered/ordered lists,
     blockquotes, hr, paragraphs, inline **bold** *em* `code`
     [text](url). Everything is escaped first, so this cannot
     inject HTML from user text.
     ============================================================ */
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderInline(text) {
    // text is already HTML-escaped. Order matters: code first so we
    // don't format inside inline code.
    var s = text;
    // inline code
    s = s.replace(/`([^`]+)`/g, function (_, c) { return "<code>" + c + "</code>"; });
    // links [text](url) — restrict url scheme to http/https/mailto/relative
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, url) {
      if (/^(https?:\/\/|mailto:|\.\/|\/|#)/.test(url)) {
        return '<a href="' + url + '" rel="noopener nofollow">' + label + "</a>";
      }
      return label; // drop unsafe scheme, keep text
    });
    // bold then italic
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    return s;
  }

  function renderMarkdown(md) {
    var srcLines = md.replace(/\r\n/g, "\n").split("\n");
    var html = [];
    var i = 0;

    function flushList(items, ordered) {
      if (!items.length) return;
      var tag = ordered ? "ol" : "ul";
      html.push("<" + tag + ">");
      items.forEach(function (it) { html.push("<li>" + renderInline(escapeHtml(it)) + "</li>"); });
      html.push("</" + tag + ">");
    }

    while (i < srcLines.length) {
      var line = srcLines[i];

      // fenced code
      var fence = line.match(/^```(\w*)\s*$/);
      if (fence) {
        var lang = fence[1] || "";
        var buf = [];
        i++;
        while (i < srcLines.length && !/^```\s*$/.test(srcLines[i])) { buf.push(srcLines[i]); i++; }
        i++; // consume closing fence
        html.push('<pre><code class="lang-' + escapeHtml(lang) + '">' + escapeHtml(buf.join("\n")) + "</code></pre>");
        continue;
      }

      // heading
      var h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) {
        var lvl = h[1].length;
        html.push("<h" + lvl + ">" + renderInline(escapeHtml(h[2])) + "</h" + lvl + ">");
        i++;
        continue;
      }

      // hr
      if (/^(-{3,}|\*{3,})\s*$/.test(line)) { html.push("<hr>"); i++; continue; }

      // blockquote (collect consecutive)
      if (/^>\s?/.test(line)) {
        var q = [];
        while (i < srcLines.length && /^>\s?/.test(srcLines[i])) {
          q.push(srcLines[i].replace(/^>\s?/, "")); i++;
        }
        html.push("<blockquote>" + renderInline(escapeHtml(q.join(" "))) + "</blockquote>");
        continue;
      }

      // unordered list
      if (/^[-*]\s+/.test(line)) {
        var ul = [];
        while (i < srcLines.length && /^[-*]\s+/.test(srcLines[i])) {
          ul.push(srcLines[i].replace(/^[-*]\s+/, "")); i++;
        }
        flushList(ul, false);
        continue;
      }

      // ordered list
      if (/^\d+\.\s+/.test(line)) {
        var ol = [];
        while (i < srcLines.length && /^\d+\.\s+/.test(srcLines[i])) {
          ol.push(srcLines[i].replace(/^\d+\.\s+/, "")); i++;
        }
        flushList(ol, true);
        continue;
      }

      // blank
      if (/^\s*$/.test(line)) { i++; continue; }

      // paragraph — collect until blank or block start
      var para = [];
      while (i < srcLines.length && !/^\s*$/.test(srcLines[i]) &&
             !/^(#{1,4}\s|```|>\s?|[-*]\s+|\d+\.\s+|-{3,}\s*$|\*{3,}\s*$)/.test(srcLines[i])) {
        para.push(srcLines[i]); i++;
      }
      html.push("<p>" + renderInline(escapeHtml(para.join(" "))) + "</p>");
    }

    return html.join("\n");
  }

  /* ============================================================
     SOURCE HIGHLIGHTER — tiny per-line tokenizer (no library)
     Produces safe spans for the "Markdown" tab.
     ============================================================ */
  function highlightSource(md) {
    var out = md.replace(/\r\n/g, "\n").split("\n").map(function (line) {
      var e = escapeHtml(line);
      // fenced code delimiters
      if (/^```/.test(line)) return '<span class="t-fence">' + e + "</span>";
      // headings
      if (/^#{1,4}\s/.test(line)) return '<span class="t-h">' + e + "</span>";
      // blockquote
      if (/^>\s?/.test(line)) return '<span class="t-em">' + e + "</span>";
      // list bullet: color just the marker
      var bullet = e.match(/^([-*]\s+|\d+\.\s+)([\s\S]*)$/);
      if (bullet) {
        return '<span class="t-bullet">' + bullet[1] + "</span>" + inlineHi(bullet[2]);
      }
      return inlineHi(e);
    }).join("\n");
    return out;
  }
  function inlineHi(escaped) {
    // escaped is already HTML-safe; wrap inline code + links lightly
    return escaped
      .replace(/`([^`]+)`/g, '<span class="t-code">`$1`</span>')
      .replace(/(\[[^\]]+\]\([^)\s]+\))/g, '<span class="t-link">$1</span>');
  }

  /* ============================================================
     RENDER — sections list, content fields, preview
     ============================================================ */
  var previewMode = "rendered";

  function renderSectionsList() {
    var root = $("#sections");
    root.innerHTML = "";
    state.order.forEach(function (id, idx) {
      var s = sectionById(id);
      if (!s) return;
      var row = el("li", "section-row" + (s.fixed ? " is-fixed" : "") + (state.enabled[id] ? "" : " is-off"));

      // toggle
      var tog = el("span", "section-row__toggle");
      var cb = el("input");
      cb.type = "checkbox";
      cb.checked = !!state.enabled[id];
      cb.setAttribute("aria-label", "Include " + s.name + " section");
      if (s.fixed) { cb.disabled = true; }
      cb.addEventListener("change", function () {
        state.enabled[id] = cb.checked;
        row.classList.toggle("is-off", !cb.checked);
        save(); renderContentFields(); renderPreview();
      });
      tog.appendChild(cb);
      tog.appendChild(el("span"));
      row.appendChild(tog);

      row.appendChild(el("span", "section-row__name", s.name));
      if (s.fixed) row.appendChild(el("span", "section-row__req", "always"));

      // move buttons (disabled for fixed and at bounds)
      var moves = el("div", "section-row__moves");
      var up = moveBtn("up", "Move " + s.name + " up");
      var down = moveBtn("down", "Move " + s.name + " down");
      if (s.fixed || idx === 0 || sectionById(state.order[idx - 1]).fixed) up.disabled = true;
      if (s.fixed || idx === state.order.length - 1 || sectionById(state.order[idx + 1]).fixed) down.disabled = true;
      up.addEventListener("click", function () { moveSection(idx, -1); });
      down.addEventListener("click", function () { moveSection(idx, 1); });
      moves.appendChild(up);
      moves.appendChild(down);
      row.appendChild(moves);

      root.appendChild(row);
    });
  }

  function moveBtn(dir, label) {
    var b = el("button", "movebtn");
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.innerHTML = dir === "up"
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
    return b;
  }

  function moveSection(idx, delta) {
    var target = idx + delta;
    if (target < 0 || target >= state.order.length) return;
    if (sectionById(state.order[target]).fixed) return;
    if (sectionById(state.order[idx]).fixed) return;
    var arr = state.order;
    var tmp = arr[idx]; arr[idx] = arr[target]; arr[target] = tmp;
    save(); renderSectionsList(); renderPreview();
  }

  function renderContentFields() {
    var root = $("#contentFields");
    root.innerHTML = "";
    // show fields for enabled sections, in section order
    state.order.forEach(function (id) {
      if (!state.enabled[id]) return;
      var s = sectionById(id);
      if (!s || !s.fields) return;
      s.fields.forEach(function (f) {
        if (f.type === "info") {
          var info = el("p", "panel__hint", f.text);
          root.appendChild(info);
          return;
        }
        var field = el("div", "field");
        var lab = el("label");
        lab.setAttribute("for", "f-" + f.key);
        lab.appendChild(document.createTextNode(f.label + " "));
        if (f.sub) lab.appendChild(el("span", "field__sub", f.sub));
        field.appendChild(lab);

        var input;
        if (f.type === "textarea") {
          input = el("textarea");
          input.rows = f.rows || 3;
        } else {
          input = el("input");
          input.type = "text";
          input.autocomplete = "off";
          if (f.key === "usage_lang" || f.key === "tech") input.className = "mono-input";
        }
        input.id = "f-" + f.key;
        input.name = f.key;
        if (f.ph) input.placeholder = f.ph;
        input.value = rawVal(f.key);
        input.addEventListener("input", function () {
          state.values[f.key] = input.value;
          savePreview();
        });
        field.appendChild(input);
        root.appendChild(field);
      });
    });
  }

  function renderPreview() {
    var md = buildMarkdown();
    if (previewMode === "rendered") {
      $("#paneRendered").innerHTML = renderMarkdown(md) ||
        '<p class="md-empty">Start typing on the left — your README appears here.</p>';
    } else {
      $("#srcCode").innerHTML = highlightSource(md);
    }
    // status: word/section count
    var enabledCount = state.order.filter(function (id) {
      return state.enabled[id] && renderSectionMd(id, val("name") || "Project Name") !== "";
    }).length;
    var chars = md.length;
    $("#status").textContent = enabledCount + " " + (enabledCount === 1 ? "section" : "sections")
      + " · " + chars + " characters of Markdown";
  }

  var savePreview = debounce(function () { save(); renderPreview(); }, 140);

  /* ============================================================
     PRESETS wiring
     ============================================================ */
  function applyPreset(id, isUserAction) {
    var p = PRESETS[id];
    if (!p) return;
    state.preset = id;
    // toggle sections per preset (respect fixed=always-on)
    p.on.forEach(function (sid) { if (!sectionById(sid).fixed) state.enabled[sid] = true; });
    p.off.forEach(function (sid) { if (!sectionById(sid).fixed) state.enabled[sid] = false; });
    // seed only empty fields — never clobber user text
    if (p.seed) {
      Object.keys(p.seed).forEach(function (k) {
        if (!val(k)) state.values[k] = p.seed[k];
      });
    }
    save();
    renderSectionsList();
    renderContentFields();
    renderPreview();
    // reflect on radios
    $$("input[name=preset]").forEach(function (r) { r.checked = (r.value === id); });
  }

  /* ============================================================
     META fields (basics + license)
     ============================================================ */
  var META_FIELDS = ["name", "tagline", "problem", "author", "year"];
  function wireMetaFields() {
    META_FIELDS.forEach(function (key) {
      var input = $("#" + key);
      if (!input) return;
      input.value = rawVal(key);
      input.addEventListener("input", function () {
        state.values[key] = input.value;
        savePreview();
      });
    });
    var lic = $("#license");
    lic.value = val("license") || "MIT";
    lic.addEventListener("change", function () {
      state.values.license = lic.value;
      save(); renderPreview();
    });
  }

  /* ============================================================
     TABS
     ============================================================ */
  function setMode(mode) {
    previewMode = mode;
    var rendered = mode === "rendered";
    $("#tabRendered").classList.toggle("is-active", rendered);
    $("#tabSource").classList.toggle("is-active", !rendered);
    $("#tabRendered").setAttribute("aria-selected", rendered ? "true" : "false");
    $("#tabSource").setAttribute("aria-selected", rendered ? "false" : "true");
    $("#paneRendered").hidden = !rendered;
    $("#paneSource").hidden = rendered;
    renderPreview();
  }

  /* ============================================================
     COPY + DOWNLOAD (no network)
     ============================================================ */
  function copyMarkdown() {
    var md = buildMarkdown();
    var btn = $("#copyBtn");
    var done = function () {
      btn.textContent = "Copied ✓";
      btn.classList.add("is-done");
      setTimeout(function () {
        btn.textContent = btn.getAttribute("data-copy-label");
        btn.classList.remove("is-done");
      }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(md).then(done, function () { fallbackCopy(md, done); });
    } else {
      fallbackCopy(md, done);
    }
  }
  function fallbackCopy(text, done) {
    var ta = el("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); }
    catch (e) { $("#status").textContent = "Copy failed — select the Markdown tab and copy manually."; }
    document.body.removeChild(ta);
  }

  function downloadMarkdown() {
    var md = buildMarkdown();
    // data: URL keeps us fully offline and within CSP (no blob: needed)
    var href = "data:text/markdown;charset=utf-8," + encodeURIComponent(md);
    var a = el("a");
    a.href = href;
    a.download = "README.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    $("#status").textContent = "Downloaded README.md — nothing left your device.";
  }

  /* ============================================================
     RESET
     ============================================================ */
  function resetDraft() {
    state.values = {};
    state.enabled = {};
    SECTIONS.forEach(function (s) { state.enabled[s.id] = !!s.on; });
    state.order = SECTIONS.map(function (s) { return s.id; });
    state.preset = "library";
    if (storageOk) { try { localStorage.removeItem(STORE_KEY); } catch (e) {} }
    // reset meta inputs
    META_FIELDS.forEach(function (k) { var n = $("#" + k); if (n) n.value = ""; });
    $("#license").value = "MIT";
    applyPreset("library", false);
    wireMetaFields();
    $("#status").textContent = "Draft cleared.";
  }

  /* ============================================================
     INIT
     ============================================================ */
  function init() {
    try { localStorage.setItem("readmecraft:test", "1"); localStorage.removeItem("readmecraft:test"); }
    catch (e) { storageOk = false; }

    load();

    // preset radios
    $$("input[name=preset]").forEach(function (r) {
      r.checked = (r.value === state.preset);
      r.addEventListener("change", function () { if (r.checked) applyPreset(r.value, true); });
    });

    // action buttons
    $("#copyBtn").addEventListener("click", copyMarkdown);
    $("#downloadBtn").addEventListener("click", downloadMarkdown);
    $("#resetBtn").addEventListener("click", resetDraft);

    // tabs
    $("#tabRendered").addEventListener("click", function () { setMode("rendered"); });
    $("#tabSource").addEventListener("click", function () { setMode("source"); });

    wireMetaFields();
    renderSectionsList();
    renderContentFields();
    renderPreview();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* ---- expose pure functions for self-test (node) ---- */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { buildMarkdown: buildMarkdown, renderMarkdown: renderMarkdown, escapeHtml: escapeHtml, _state: state, renderSectionMd: renderSectionMd };
  }
})();
