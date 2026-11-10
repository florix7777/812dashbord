// Dashboard SC — мост к живым данным (API Mode)
//
// Синхронный XHR оставлен намеренно: скрипты выполняются по порядку, и DASHBOARD_DATA
// гарантированно заполнен до того, как app.js начнёт рисовать страницу.
// Порядок на страницах с данными: data.js -> data-loader.js -> app.js
//
// Что изменилось: больше нет «тихой» подмены на старые данные.
//  - сервер ответил и данные есть   -> показываем их;
//  - сервер ответил, но данных нет  -> пустая страница + подсказка «загрузите отчёт»
//    (старые данные из data.js НЕ подставляются, чтобы их не принять за свежие);
//  - сервер недоступен              -> пустая страница и красная плашка «нет связи с сервером».
(function () {
  var STATUS_ATTR = "data-source";

  function markSource(source) { document.documentElement.setAttribute(STATUS_ATTR, source); }

  function banner(kind, text) {
    function add() {
      var div = document.createElement("div");
      div.className = "sync-banner " + kind;
      div.textContent = text;
      document.body.insertBefore(div, document.body.firstChild);
    }
    if (document.body) add(); else document.addEventListener("DOMContentLoaded", add);
  }

  try {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/metrics", false);
    xhr.send(null);

    if (xhr.status === 200) {
      var apiData = JSON.parse(xhr.responseText);
      if (apiData && Object.keys(apiData).length > 0) {
        DASHBOARD_DATA = apiData;
        markSource("api");
      } else {
        DASHBOARD_DATA = {};
        markSource("api-empty");
        banner("warn", "Данные ещё не загружены. Нажмите «Загрузить отчёт» в меню слева и выберите Excel с оценками звонков.");
      }
    } else {
      markSource("static-api-error");
      banner("err", "Сервер вернул ошибку " + xhr.status + ". Данные не загружены, попробуйте обновить страницу позже.");
    }
  } catch (e) {
    markSource("static-api-unreachable");
    banner("err", "Нет связи с сервером. Данные не загружены, проверьте соединение и обновите страницу.");
  }
})();
