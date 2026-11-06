// Dashboard SC — live data bridge (API Mode)
//
// Why synchronous XHR: <script> tags execute in document order and block
// the parser, so this guarantees DASHBOARD_DATA holds live data from
// Postgres BEFORE app.js runs its DOMContentLoaded init — without having
// to rewrite app.js's ~1400 lines into an async-aware flow.
//
// Load order on data-driven pages: data.js -> data-loader.js -> app.js
// Tactical pages (instruments/law/manual/objections) intentionally do NOT
// include this file — they must stay fetch-free per stability requirements.
(function () {
  var STATUS_ATTR = "data-source";

  function markSource(source) {
    document.documentElement.setAttribute(STATUS_ATTR, source);
  }

  try {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/metrics", false); // false = synchronous, intentional (see note above)
    xhr.send(null);

    if (xhr.status === 200) {
      var apiData = JSON.parse(xhr.responseText);
      if (apiData && Object.keys(apiData).length > 0) {
        DASHBOARD_DATA = apiData;
        markSource("api");
        console.info(
          "[data-loader] Live data from /api/metrics (" + Object.keys(apiData).length + " employees)."
        );
      } else {
        markSource("static-empty-api");
        console.warn("[data-loader] /api/metrics returned no employees yet, using static fallback from data.js.");
      }
    } else {
      markSource("static-api-error");
      console.warn("[data-loader] /api/metrics responded with status " + xhr.status + ", using static fallback.");
    }
  } catch (e) {
    markSource("static-api-unreachable");
    console.warn("[data-loader] /api/metrics unreachable, using static fallback from data.js.", e);
  }
})();
