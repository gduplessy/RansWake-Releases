// Points every download button at the latest release zip and renders the changelog from the
// public GitHub Releases API. Without JS (or if the API is rate-limited) the buttons still go to
// /releases/latest and the changelog links to GitHub.
(function () {
  "use strict";

  var REPO = "gduplessy/RansWake-Releases";
  var API = "https://api.github.com/repos/" + REPO + "/releases?per_page=6";
  var TAG = /^b(\d+)-([0-9a-f]{7,40})$/i;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function zipOf(release) {
    var assets = release.assets || [];
    for (var i = 0; i < assets.length; i++) {
      if (/^RansWake-Windows-.*\.zip$/i.test(assets[i].name)) return assets[i];
    }
    return null;
  }

  function buildNumber(release) {
    var m = TAG.exec(release.tag_name || "");
    return m ? m[1] : null;
  }

  function date(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch (e) {
      return iso.slice(0, 10);
    }
  }

  function renderLatest(release) {
    var zip = zipOf(release);
    if (!zip) return;
    var n = buildNumber(release);
    var mb = Math.round(zip.size / 1048576);
    document.querySelectorAll("[data-download]").forEach(function (a) {
      a.href = zip.browser_download_url;
      a.setAttribute("download", "");
    });
    document.querySelectorAll("[data-release-meta]").forEach(function (p) {
      p.textContent = (n ? "Build " + n + " · " : "") + date(release.published_at) + " · " + mb + " MB zip · Windows 10/11 64-bit";
    });
  }

  function renderLog(releases) {
    var log = document.getElementById("log");
    if (!log) return;
    log.textContent = "";
    releases.forEach(function (release, i) {
      var li = el("li");
      li.appendChild(el("span", "tele when", date(release.published_at) + " · " + release.tag_name));
      var h = el("h3", null, release.name || release.tag_name);
      if (i === 0) h.appendChild(el("span", "latest", "Latest"));
      li.appendChild(h);
      // Release notes are plain text written by the publish script; render as text, never HTML.
      li.appendChild(el("p", null, (release.body || "").trim() || "No notes."));
      log.appendChild(li);
    });
  }

  function fail() {
    var log = document.getElementById("log");
    if (log) log.innerHTML = '<li class="muted">Could not reach GitHub just now. See every build on the releases page below.</li>';
  }

  // Mobile sticky download bar: only once the hero button has scrolled away, so one orange
  // button is on screen at a time (DESIGN.md).
  var sticky = document.querySelector(".sticky-cta");
  var inline = Array.prototype.filter.call(document.querySelectorAll("[data-download]"), function (a) {
    return !sticky || !sticky.contains(a);
  });
  if (sticky && inline.length && "IntersectionObserver" in window) {
    var visible = new Set();
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target); });
      sticky.classList.toggle("show", visible.size === 0);
    });
    inline.forEach(function (a) { io.observe(a); });
  }

  if (!window.fetch) { fail(); return; }
  fetch(API, { headers: { Accept: "application/vnd.github+json" } })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (list) {
      var published = list.filter(function (r) { return !r.draft && !r.prerelease; });
      if (!published.length) { fail(); return; }
      renderLatest(published[0]);
      renderLog(published);
    })
    .catch(fail);
})();
