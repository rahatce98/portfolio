/* =============================================================================
   UI layer. Reads window.SITE (assets/js/data.js) and renders every list.
   Adding content = edit data.js only. Nothing below needs to change.
   ============================================================================= */

(function () {
  "use strict";

  var D = window.SITE;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------- helpers */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function html(target, markup) {
    var el = typeof target === "string" ? $(target) : target;
    if (el) el.innerHTML = markup;
    return el;
  }

  /* --------------------------------------------------------------- icons */

  var P = {
    linkedin: '<path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM10 9h3.8v1.7h.05c.53-.95 1.83-1.95 3.77-1.95C21.4 8.75 22 11.2 22 14.4V21h-4v-5.9c0-1.4-.03-3.2-2-3.2-2 0-2.3 1.5-2.3 3.1V21h-4z"/>',
    github:   '<path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/>',
    x:        '<path d="M17.7 3h3.3l-7.2 8.24L22.3 21h-6.63l-5.2-6.79L4.5 21H1.2l7.7-8.8L1.7 3h6.8l4.7 6.2zm-1.16 16h1.83L7.55 4.9H5.58z"/>',
    whatsapp: '<path d="M12.04 2C6.6 2 2.18 6.42 2.18 11.86c0 1.74.46 3.44 1.32 4.94L2 22l5.35-1.4a9.8 9.8 0 0 0 4.69 1.2h.01c5.43 0 9.85-4.42 9.85-9.86A9.8 9.8 0 0 0 12.04 2zm5.77 14.1c-.24.68-1.4 1.3-1.94 1.34-.5.05-1.13.07-1.82-.11a15.6 15.6 0 0 1-1.65-.62c-2.9-1.26-4.8-4.2-4.94-4.4-.15-.2-1.19-1.58-1.19-3.02s.76-2.14 1.03-2.44c.27-.3.58-.37.78-.37h.56c.18 0 .42-.07.66.5.24.58.83 2.02.9 2.17.08.15.13.32.03.52-.1.2-.15.32-.3.5-.14.17-.3.38-.44.51-.15.15-.3.31-.13.61.17.3.76 1.25 1.63 2.03 1.12 1 2.06 1.3 2.36 1.45.3.15.47.13.64-.08.17-.2.74-.86.93-1.16.2-.3.4-.25.66-.15.27.1 1.7.8 1.99.95.29.15.48.22.55.34.07.13.07.72-.17 1.41z"/>',
    mail:     '<path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1.6 2L12 12.3 19.4 7zM20 8.9l-7.4 5.3a1 1 0 0 1-1.2 0L4 8.9V17h16z"/>',
    phone:    '<path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.6a1 1 0 0 1-.25 1z"/>',
    pin:      '<path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/>',
    arrow:    '<path d="M13.2 5.6 11.8 7l4 4H4v2h11.8l-4 4 1.4 1.4L19.6 12z"/>',
    upright:  '<path d="M8 5v2h6.6L5 16.6 6.4 18 16 8.4V15h2V5z"/>',
    code:     '<path d="M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6zm5.2 0 4.6-4.6L14.6 7.4 16 6l6 6-6 6z"/>',
    hardhat:  '<path d="M12 3a1 1 0 0 1 1 1v3.2a6 6 0 0 1 4 5.4V15h1.5a1.5 1.5 0 0 1 0 3h-13a1.5 1.5 0 1 1 0-3H7v-2.4a6 6 0 0 1 4-5.4V4a1 1 0 0 1 1-1zm-1 6.3A4 4 0 0 0 9 12.6V15h6v-2.4a4 4 0 0 0-2-3.3v3.2h-2z"/>',
    layers:   '<path d="m12 2 9.5 5-9.5 5-9.5-5zM4.9 11.6 12 15.3l7.1-3.7 2.4 1.3L12 18 2.5 12.9zm0 4.6L12 19.9l7.1-3.7 2.4 1.3L12 22.6 2.5 17.5z"/>',
    spark:    '<path d="M12 2c.4 3.6 2.4 5.6 6 6-3.6.4-5.6 2.4-6 6-.4-3.6-2.4-5.6-6-6 3.6-.4 5.6-2.4 6-6zm6.5 11c.2 1.8 1.2 2.8 3 3-1.8.2-2.8 1.2-3 3-.2-1.8-1.2-2.8-3-3 1.8-.2 2.8-1.2 3-3zM5 14c.16 1.4.94 2.2 2.3 2.4-1.36.16-2.14.94-2.3 2.3-.16-1.36-.94-2.14-2.3-2.3C4.06 16.2 4.84 15.4 5 14z"/>',
    compass:  '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm4.2-12.2-6 2.6-2.6 6 6-2.6zM12 13.1A1.1 1.1 0 1 1 12 11a1.1 1.1 0 0 1 0 2.2z"/>',
    chart:    '<path d="M3 20h18v2H3zM5 10h3v8H5zm5.5-5h3v13h-3zM16 13h3v5h-3z"/>',
    cap:      '<path d="m12 3 10 5-10 5L2 8zm-6 8.6 6 3 6-3v3.6c0 1.9-2.7 3.4-6 3.4s-6-1.5-6-3.4z"/>',
    moon:     '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
    sun:      '<path d="M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-13.5a1 1 0 0 1 1 1V6a1 1 0 1 1-2 0V4.5a1 1 0 0 1 1-1zm0 15a1 1 0 0 1 1 1V21a1 1 0 1 1-2 0v-1.5a1 1 0 0 1 1-1zM21 11a1 1 0 1 1 0 2h-1.5a1 1 0 1 1 0-2zm-16.5 0a1 1 0 1 1 0 2H3a1 1 0 1 1 0-2zm13.8-6.3a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.5-1.4l1-1a1 1 0 0 1 1.5 0zM7.2 15.4a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.5-1.4l1-1a1 1 0 0 1 1.5 0zm11.1 1a1 1 0 0 1-1.5 1.4l-1-1a1 1 0 0 1 1.5-1.4zM7.2 8.6a1 1 0 0 1-1.5 1.4l-1-1a1 1 0 0 1 1.5-1.4z"/>',
    menu:     '<path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/>',
    close:    '<path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4L10.6 10.6l6.3-6.3z"/>'
  };

  function icon(name, cls) {
    var d = P[name] || P.spark;
    return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"' +
      (cls ? ' class="' + cls + '"' : "") + ">" + d + "</svg>";
  }

  /* ------------------------------------------------ abstract project art */

  var ART = {
    grid: function () {
      var r = "";
      for (var y = 0; y < 6; y++) {
        for (var x = 0; x < 12; x++) {
          var o = ((x * 7 + y * 13) % 11) / 22 + 0.06;
          var w = 18 + ((x + y) % 3) * 4;
          r += '<rect x="' + (x * 28 + 6) + '" y="' + (y * 26 + 8) + '" width="' + w +
               '" height="12" rx="3" fill="currentColor" opacity="' + o.toFixed(2) + '"/>';
        }
      }
      return r;
    },
    network: function () {
      var pts = [[40,120],[110,60],[180,130],[250,70],[320,120],[75,30],[215,25],[290,150],[150,160]];
      var s = "";
      var links = [[0,1],[1,2],[2,3],[3,4],[1,5],[3,6],[4,7],[2,8],[0,8]];
      links.forEach(function (l) {
        s += '<line x1="' + pts[l[0]][0] + '" y1="' + pts[l[0]][1] + '" x2="' + pts[l[1]][0] +
             '" y2="' + pts[l[1]][1] + '" stroke="currentColor" stroke-width="1.2" opacity=".3"/>';
      });
      pts.forEach(function (p, i) {
        s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (i % 3 === 0 ? 6 : 3.5) +
             '" fill="currentColor" opacity="' + (i % 3 === 0 ? ".85" : ".45") + '"/>';
      });
      return s;
    },
    contour: function () {
      var s = "";
      for (var i = 0; i < 7; i++) {
        var k = i * 13;
        s += '<path d="M-10 ' + (150 - k) + ' C 70 ' + (110 - k) + ', 110 ' + (185 - k) +
             ', 190 ' + (140 - k) + ' S 300 ' + (95 - k) + ', 370 ' + (135 - k) +
             '" fill="none" stroke="currentColor" stroke-width="1.3" opacity="' +
             (0.5 - i * 0.055).toFixed(2) + '"/>';
      }
      return s;
    },
    flow: function () {
      var s = "";
      var cols = [30, 130, 230, 310];
      cols.forEach(function (x, i) {
        s += '<rect x="' + x + '" y="' + (44 + (i % 2) * 34) + '" width="62" height="46" rx="9" ' +
             'fill="none" stroke="currentColor" stroke-width="1.4" opacity=".5"/>';
        if (i < cols.length - 1) {
          s += '<path d="M' + (x + 62) + ' ' + (67 + (i % 2) * 34) + ' H' + (cols[i + 1]) +
               '" stroke="currentColor" stroke-width="1.2" opacity=".3" stroke-dasharray="4 4"/>';
        }
        s += '<circle cx="' + (x + 31) + '" cy="' + (67 + (i % 2) * 34) + '" r="4" fill="currentColor" opacity=".7"/>';
      });
      return s;
    },
    signal: function () {
      var s = "", d = "M0 100";
      for (var x = 0; x <= 360; x += 12) {
        var y = 100 - Math.sin(x / 34) * 34 - Math.sin(x / 11) * 9;
        d += " L" + x + " " + y.toFixed(1);
      }
      s += '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".65"/>';
      for (var i = 0; i < 18; i++) {
        s += '<rect x="' + (i * 20 + 6) + '" y="128" width="6" height="' +
             (8 + ((i * 5) % 26)) + '" rx="2" fill="currentColor" opacity=".28"/>';
      }
      return s;
    },
    geometric: function () {
      var s = "";
      for (var i = 0; i < 5; i++) {
        s += '<rect x="' + (40 + i * 22) + '" y="' + (18 + i * 12) + '" width="' + (120 - i * 6) +
             '" height="' + (120 - i * 16) + '" rx="14" fill="none" stroke="currentColor" ' +
             'stroke-width="1.3" opacity="' + (0.45 - i * 0.06).toFixed(2) +
             '" transform="rotate(' + (i * 6) + ' 200 90)"/>';
      }
      s += '<circle cx="278" cy="52" r="26" fill="currentColor" opacity=".1"/>';
      return s;
    }
  };

  function artSvg(kind) {
    var gen = ART[kind] || ART.geometric;
    return '<svg viewBox="0 0 360 170" preserveAspectRatio="xMidYMid slice" ' +
           'style="color:var(--accent)" aria-hidden="true">' + gen() + "</svg>";
  }

  /* --------------------------------------------------------- brand mark */

  function markSvg(size) {
    var id = "g" + Math.random().toString(36).slice(2, 7);
    return '<svg class="brand__mark" viewBox="0 0 48 48" role="img" aria-label="' +
      esc(D.person.name) + ' monogram" style="width:' + size + 'px;height:' + size + 'px">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent-2)"/>' +
      "</linearGradient></defs>" +
      '<rect x="2.5" y="2.5" width="43" height="43" rx="13" fill="none" stroke="url(#' + id + ')" stroke-width="2"/>' +
      '<path d="M14 34V15h6.6c3.1 0 4.9 1.8 4.9 4.5 0 2.1-1.1 3.6-3 4.2L26 34h-3.6l-3-9.4h-2.1V34z" fill="url(#' + id + ')"/>' +
      '<path d="M28.5 34V15h3.4v7.6h4.2V15H39v19h-2.9v-8.3h-4.2V34z" fill="url(#' + id + ')" opacity=".72"/>' +
      "</svg>";
  }

  /* --------------------------------------------------------------- render */

  function renderIdentity() {
    var p = D.person;

    document.title = D.seo.title;
    $$("[data-slot='name']").forEach(function (n) { n.textContent = p.name; });
    $$("[data-slot='role']").forEach(function (n) { n.textContent = p.role; });
    $$("[data-slot='mark']").forEach(function (n) { n.innerHTML = markSvg(n.dataset.size || 38); });

    $("#heroEyebrow").textContent = p.eyebrow;
    $("#heroTagline").innerHTML = esc(p.tagline).replace("smarter infrastructure", "<b>smarter infrastructure</b>");
    $("#heroIntro").textContent = p.intro;
    $("#portraitTag").textContent = p.location;

    // portrait with monogram fallback if the photo file is absent
    var frame = $("#portraitFrame");
    var img = new Image();
    img.alt = p.photoAlt;
    img.loading = "eager";
    img.decoding = "async";
    img.onload = function () { frame.innerHTML = ""; frame.appendChild(img); };
    img.onerror = function () {
      frame.innerHTML = '<div class="portrait__fallback" role="img" aria-label="' +
        esc(p.name) + '">' + esc(p.monogram) + "</div>";
    };
    img.src = p.photo;

    if (p.resume) {
      $("#heroCta").insertAdjacentHTML("beforeend",
        '<a class="btn" href="' + esc(p.resume) + '" download>' + icon("upright") + "Resume</a>");
    }
  }

  function renderQuickLinks() {
    var wanted = ["linkedin", "github", "email"];
    html("#heroQuick", D.socials.filter(function (s) { return wanted.indexOf(s.id) > -1; })
      .map(function (s) {
        return '<a class="chip" href="' + esc(s.url) + '"' + ext(s.url) + '>' +
          icon(s.icon) + esc(s.label) + "</a>";
      }).join(""));
  }

  function ext(url) {
    return /^https?:/.test(url) ? ' target="_blank" rel="noopener noreferrer"' : "";
  }

  function renderCapabilities() {
    html("#capStrip", D.capabilities.map(function (c) {
      return "<div><dt>" + esc(c.k) + "</dt><dd>" + esc(c.v) + "</dd></div>";
    }).join(""));
  }

  function renderAbout() {
    $("#aboutLead").textContent = D.about.lead;
    html("#aboutBody", D.about.body.map(function (t) { return "<p>" + esc(t) + "</p>"; }).join(""));
    html("#pillars", D.about.pillars.map(function (p) {
      return '<article class="pillar glass lit reveal">' +
        '<span class="icon-badge">' + icon(p.icon) + "</span>" +
        "<div><h3>" + esc(p.title) + "</h3><p>" + esc(p.text) + "</p></div></article>";
    }).join(""));
  }

  function renderExpertise() {
    html("#expGrid", D.expertise.map(function (g, i) {
      return '<article class="exp-card glass lit reveal" style="--d:' + (i * 70) + 'ms">' +
        '<header class="exp-card__head"><span class="icon-badge">' + icon(g.icon) + "</span>" +
        "<h3>" + esc(g.title) + "</h3></header><ul>" +
        g.items.map(function (it) { return '<li><span class="chip">' + esc(it) + "</span></li>"; }).join("") +
        "</ul></article>";
    }).join(""));
  }

  function renderChain() {
    $("#chainHeading").textContent = D.chain.heading;
    $("#chainLead").textContent = D.chain.lead;
    html("#chainGrid", D.chain.steps.map(function (s, i) {
      return '<article class="chain__node reveal' + (s.accent ? " chain__node--accent" : "") +
        '" style="--d:' + (i * 60) + 'ms"><h3>' + esc(s.label) + "</h3><p>" + esc(s.note) +
        '</p><span class="chain__bar"></span></article>';
    }).join(""));
  }

  function renderExperience() {
    html("#timeline", D.experience.map(function (e) {
      return '<article class="tl-item glass lit reveal">' +
        '<header class="tl-head"><h3>' + esc(e.role) + '</h3><span class="tl-org">' + esc(e.org) + "</span></header>" +
        '<div class="tl-meta"><span>' + esc(e.period) + "</span><span>" + esc(e.type) +
        "</span><span>" + esc(e.place) + "</span></div>" +
        '<p class="tl-summary">' + esc(e.summary) + "</p>" +
        '<ul class="tl-points">' + e.points.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") +
        "</ul></article>";
    }).join(""));
  }

  function renderEducation() {
    html("#eduGrid", D.education.map(function (e, i) {
      return '<article class="edu-card glass lit reveal" style="--d:' + (i * 80) + 'ms">' +
        '<span class="edu-card__sigil">' + icon("cap") + "</span>" +
        "<h3>" + esc(e.degree) + '</h3><div class="school">' + esc(e.school) + "</div>" +
        '<div class="place">' + esc(e.place) + '</div><p class="note">' + esc(e.note) + "</p></article>";
    }).join(""));
  }

  function renderProjects() {
    html("#filters", D.projectCategories.map(function (c, i) {
      return '<button type="button" class="filter" data-cat="' + esc(c) +
        '" aria-pressed="' + (i === 0) + '">' + esc(c) + "</button>";
    }).join(""));

    html("#projGrid", D.projects.map(function (p, i) {
      var links = p.links || {};
      var btns = "";
      if (links.demo)   btns += '<a class="btn btn--sm" href="' + esc(links.demo) + '"' + ext(links.demo) + ">" + icon("upright") + "View Project</a>";
      if (links.repo)   btns += '<a class="btn btn--sm" href="' + esc(links.repo) + '"' + ext(links.repo) + ">" + icon("github") + "Code</a>";
      if (links.detail) btns += '<a class="btn btn--sm" href="' + esc(links.detail) + '"' + ext(links.detail) + ">" + icon("arrow") + "Details</a>";

      return '<article class="proj glass lit reveal" data-cat="' + esc(p.category) +
        '" style="--d:' + ((i % 3) * 80) + 'ms">' +
        '<div class="proj__art">' + artSvg(p.art) +
        '<span class="proj__badge">' + esc(p.badge) + "</span></div>" +
        '<div class="proj__body"><span class="proj__cat">' + esc(p.category) + "</span>" +
        "<h3>" + esc(p.title) + '</h3><p class="proj__desc">' + esc(p.description) + "</p>" +
        '<p class="proj__role"><b>Role:</b> ' + esc(p.role) + "</p>" +
        '<div class="proj__tech">' + p.tech.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>" +
        (btns ? '<div class="proj__links">' + btns + "</div>" : "") +
        "</div></article>";
    }).join(""));

    $("#filters").addEventListener("click", function (ev) {
      var btn = ev.target.closest(".filter");
      if (!btn) return;
      var cat = btn.dataset.cat;
      $$(".filter").forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
      $$("#projGrid .proj").forEach(function (card) {
        card.hidden = !(cat === "All" || card.dataset.cat === cat);
      });
    });
  }

  function renderLab() {
    html("#labGrid", D.lab.items.map(function (it, i) {
      return '<div class="lab-item reveal" data-status="' + esc(it.status) + '" style="--d:' + (i * 40) + 'ms">' +
        '<span class="dot"></span><span class="name">' + esc(it.name) + "</span>" +
        '<span class="status">' + esc(it.status) + "</span></div>";
    }).join(""));
    $("#labNote").textContent = D.lab.note;

    $("#nowStamp").textContent = "Updated " + D.now.updated;
    html("#nowList", D.now.items.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join(""));
  }

  function renderContact() {
    var c = D.contact;
    var lines = [
      { icon: "mail",  label: "Email",            value: c.email,      href: "mailto:" + c.email },
      { icon: "whatsapp", label: "WhatsApp",      value: c.phoneLabel, href: c.whatsapp },
      { icon: "pin",   label: "Based in",         value: c.location,   href: "" }
    ];
    html("#contactLines", lines.map(function (l) {
      var inner = '<span class="icon-badge">' + icon(l.icon) + "</span><dl><dt>" + esc(l.label) +
        "</dt><dd>" + esc(l.value) + "</dd></dl>";
      return l.href
        ? '<a class="contact-line" href="' + esc(l.href) + '"' + ext(l.href) + ">" + inner + "</a>"
        : '<div class="contact-line">' + inner + "</div>";
    }).join(""));

    html("#socialRow", D.socials.map(function (s) {
      return '<a class="chip" href="' + esc(s.url) + '"' + ext(s.url) +
        ' aria-label="' + esc(s.label) + ': ' + esc(s.handle) + '">' + icon(s.icon) + esc(s.label) + "</a>";
    }).join(""));

    html("#footerSocial", D.socials.map(function (s) {
      return '<a class="icon-btn" href="' + esc(s.url) + '"' + ext(s.url) +
        ' aria-label="' + esc(s.label) + '">' + icon(s.icon) + "</a>";
    }).join(""));

    $("#mailtoLink").href = "mailto:" + c.email;
    $("#mailtoLink").textContent = c.email;

    // Static hosting has no backend, so the form composes a message in the
    // visitor's own mail client. No fake "sent" state is ever shown.
    $("#contactForm").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var f = ev.currentTarget;
      var name = f.name_.value.trim();
      var email = f.email_.value.trim();
      var msg = f.message_.value.trim();
      if (!name || !email || !msg) return;
      var subject = "Portfolio enquiry from " + name;
      var body = msg + "\n\n--\n" + name + "\n" + email;
      window.location.href = "mailto:" + c.email +
        "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    });
  }

  function renderFooter() {
    $("#year").textContent = new Date().getFullYear();
  }

  function renderSeo() {
    var s = D.seo, p = D.person;
    function meta(sel, val) { var m = $(sel); if (m) m.setAttribute("content", val); }
    meta('meta[name="description"]', s.description);
    meta('meta[property="og:title"]', s.title);
    meta('meta[property="og:description"]', s.description);
    meta('meta[name="twitter:title"]', s.title);
    meta('meta[name="twitter:description"]', s.description);
    if (s.canonical) {
      $("#canonical").href = s.canonical;
      meta('meta[property="og:url"]', s.canonical);
    }

    var ld = {
      "@context": "https://schema.org",
      "@type": "Person",
      name: p.name,
      jobTitle: p.role,
      description: s.description,
      address: { "@type": "PostalAddress", addressLocality: p.location },
      email: "mailto:" + D.contact.email,
      alumniOf: D.education.map(function (e) { return { "@type": "CollegeOrUniversity", name: e.school }; }),
      worksFor: { "@type": "Organization", name: D.experience[0].org },
      knowsAbout: ["Civil Engineering", "Water Distribution Networks", "Sewerage Networks",
                   "GIS", "AutoCAD", "Project Monitoring", "Automation", "Artificial Intelligence"],
      sameAs: D.socials.filter(function (x) { return /^https?:/.test(x.url); })
                       .map(function (x) { return x.url; })
    };
    if (s.canonical) ld.url = s.canonical;
    $("#ldjson").textContent = JSON.stringify(ld);
  }

  /* ------------------------------------------------------------ behaviour */

  function initNav() {
    var nav = $("#nav"), mobile = $("#navMobile"), burger = $("#burger");

    function stick() { nav.classList.toggle("is-stuck", window.scrollY > 12); }
    stick();
    window.addEventListener("scroll", stick, { passive: true });

    burger.addEventListener("click", function () {
      var open = mobile.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", String(open));
      burger.innerHTML = icon(open ? "close" : "menu");
    });
    mobile.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        mobile.classList.remove("is-open");
        burger.setAttribute("aria-expanded", "false");
        burger.innerHTML = icon("menu");
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && mobile.classList.contains("is-open")) burger.click();
    });

    // scroll spy
    var links = $$("[data-navlink]");
    var sections = links.map(function (a) { return $(a.getAttribute("href")); }).filter(Boolean);
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) {
          a.setAttribute("aria-current", String(a.getAttribute("href") === "#" + en.target.id));
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { spy.observe(s); });
  }

  function initReveal() {
    var items = $$(".reveal");
    if (reduced || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });

    // Safety net: some embedded/preview contexts never fire the observer.
    // If nothing has revealed shortly after load, show everything rather than
    // leaving the page blank.
    window.setTimeout(function () {
      if (!document.querySelector(".reveal.is-in")) {
        items.forEach(function (el) {
          el.style.transition = "none";
          el.classList.add("is-in");
        });
      }
    }, 1800);
  }

  function initLight() {
    if (reduced) return;
    document.addEventListener("pointermove", function (e) {
      var card = e.target.closest(".lit");
      if (!card) return;
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", (e.clientX - r.left) + "px");
      card.style.setProperty("--my", (e.clientY - r.top) + "px");
    }, { passive: true });
  }

  function initTheme() {
    var btn = $("#themeBtn");
    var stored = null;
    try { stored = localStorage.getItem("theme"); } catch (err) { /* private mode */ }
    if (stored) document.documentElement.setAttribute("data-theme", stored);

    btn.addEventListener("click", function () {
      var root = document.documentElement;
      var current = root.getAttribute("data-theme");
      if (!current) {
        current = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
      }
      var next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (err) { /* ignore */ }
      btn.setAttribute("aria-label", "Switch to " + (next === "dark" ? "light" : "dark") + " theme");
    });
  }

  /* ------------------------------------------------------------------ boot */

  function boot() {
    if (!D) return;
    renderIdentity();
    renderQuickLinks();
    renderCapabilities();
    renderAbout();
    renderExpertise();
    renderChain();
    renderExperience();
    renderEducation();
    renderProjects();
    renderLab();
    renderContact();
    renderFooter();
    renderSeo();

    $("#burger").innerHTML = icon("menu");
    $("#themeBtn").innerHTML = icon("moon", "i-moon") + icon("sun", "i-sun");

    initNav();
    initReveal();
    initLight();
    initTheme();
    document.body.classList.add("is-ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
