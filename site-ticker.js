(function () {
  if (document.querySelector(".evb-ticker")) return;

  document.querySelectorAll(".cp-ticker, .hero-topstrip.ticker, div.ticker").forEach(function (el) {
    el.remove();
  });

  var anchor = document.getElementById("evbDrawer") || document.getElementById("evbNav");
  if (!anchor) return;

  var categories = [
    { name: "Gold", tone: "gold" },
    { name: "Diamonds", tone: "gold" },
    { name: "Silver", tone: "gold" },
    { name: "Estate Jewelry", tone: "gold" },
    { name: "Watches", tone: "ink" },
    { name: "Designer", tone: "ink" },
    { name: "Sneakers", tone: "ink" },
    { name: "Streetwear", tone: "ink" }
  ];

  function buildSet() {
    return categories
      .map(function (cat, index) {
        var item =
          '<span class="evb-t-item">' +
          '<span class="evb-t-label">We Buy &amp; Sell</span> ' +
          '<span class="evb-t-cat evb-t-' + cat.tone + '">' + cat.name + "</span>" +
          "</span>";
        if (index < categories.length - 1) {
          item += '<span class="evb-t-sep" aria-hidden="true">·</span>';
        }
        return item;
      })
      .join("");
  }

  var setHtml = buildSet();
  var ticker = document.createElement("div");
  ticker.className = "evb-ticker";
  ticker.setAttribute("aria-label", "Categories we buy and sell");
  ticker.innerHTML =
    '<div class="evb-ticker-inner">' +
    '<div class="evb-ticker-track">' +
    '<span class="evb-ticker-set">' + setHtml + "</span>" +
    '<span class="evb-ticker-set" aria-hidden="true">' + setHtml + "</span>" +
    "</div></div>";

  anchor.parentNode.insertBefore(ticker, anchor.nextSibling);

  document.addEventListener("visibilitychange", function () {
    document.querySelectorAll(".evb-ticker-track").forEach(function (track) {
      track.style.animationPlayState = document.hidden ? "paused" : "running";
    });
  });
})();
