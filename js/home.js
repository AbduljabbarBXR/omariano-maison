/* Omariano Bookshop | homepage sections built from the real catalogue. */

(function () {
  "use strict";

  function byId(id) {
    return window.OM.getProduct(id);
  }

  function render() {
    const OM = window.OM;
    const site = OM.state.site;
    if (!site) return;

    document.querySelectorAll("[data-total]").forEach((element) => {
      element.textContent = String(site.total);
    });

    const collections = document.querySelector("#collection-grid");
    if (collections) {
      collections.innerHTML = site.collections
        .map(
          (collection) => `
        <a class="collection-card" href="shop.html?collection=${encodeURIComponent(collection.key)}">
          <div class="collection-card__media">
            <img src="${OM.escape(collection.cover)}" alt="" loading="lazy">
          </div>
          <div class="collection-card__body">
            <span class="collection-card__count">${collection.count} ${OM.plural(collection.count, "title")}</span>
            <h3>${OM.escape(collection.label)}</h3>
            <p>${OM.escape(collection.blurb)}</p>
            <span class="link-arrow">Explore
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </span>
          </div>
        </a>`
        )
        .join("");
    }

    const edit = document.querySelector("#edit-track");
    if (edit) {
      edit.innerHTML = site.edit
        .map((id) => byId(id))
        .filter(Boolean)
        .map((product, index) => OM.editCard(product, index))
        .join("");
    }

    const arrivals = document.querySelector("#new-grid");
    if (arrivals) {
      const products = site.new.map(byId).filter(Boolean).slice(0, 8);
      arrivals.innerHTML = products.map((product) => OM.card(product)).join("");
    }

    const kids = document.querySelector("#kids-covers");
    if (kids) {
      kids.innerHTML = site.children
        .map((id) => byId(id))
        .filter(Boolean)
        .map(
          (product) => `
          <a class="kids-cover" href="shop.html?open=${product.id}">
            <img src="${OM.escape(product.image)}" alt="${OM.escape(product.title)}" loading="lazy">
            <span class="kids-cover__label">${OM.escape(product.title)}</span>
          </a>`
        )
        .join("");
    }

    const pick = byId(255);
    if (pick) {
      const image = document.querySelector("#pick-image");
      const title = document.querySelector("#pick-title");
      const author = document.querySelector("#pick-author");
      const description = document.querySelector("#pick-desc");
      const price = document.querySelector("#pick-price");
      if (image) {
        image.src = pick.image;
        image.alt = pick.title;
      }
      if (title) title.textContent = pick.title;
      if (author) author.textContent = pick.author || pick.brand;
      if (description) {
        description.textContent = pick.blurb || description.textContent;
      }
      if (price) {
        price.innerHTML = `<strong>${OM.money(pick.price)}</strong>${pick.compareAt ? `<s>${OM.money(pick.compareAt)}</s>` : ""}`;
      }
      document.querySelectorAll('[data-product="255"]').forEach((button) => {
        button.setAttribute("aria-label", `Read ${pick.title}`);
      });
    }
  }

  document.addEventListener("om:ready", render);
})();
