/* Omariano Bookshop | catalogue filtering, sorting and load-more. */

(function () {
  "use strict";

  const OM = window.OM;
  const PAGE_SIZE = 12;

  const PRICE_RANGES = {
    under1000: { label: "Under Ksh 1,000", min: 0, max: 999 },
    "1000-2500": { label: "Ksh 1,000–2,500", min: 1000, max: 2499 },
    "2500-5000": { label: "Ksh 2,500–5,000", min: 2500, max: 4999 },
    over5000: { label: "Ksh 5,000 and above", min: 5000, max: Infinity },
  };

  const filters = {
    collection: "all",
    q: "",
    sort: "curated",
    price: "all",
    stock: false,
    sale: false,
    shown: PAGE_SIZE,
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function readParams() {
    const params = new URLSearchParams(window.location.search);
    const collection = params.get("collection") || "all";
    const price = params.get("price") || "all";
    filters.collection = collection;
    filters.q = params.get("q") || "";
    filters.sort = params.get("sort") || "curated";
    filters.price = PRICE_RANGES[price] ? price : "all";
    filters.stock = params.get("stock") === "1";
    filters.sale = params.get("sale") === "1";
  }

  function writeParams() {
    const params = new URLSearchParams();
    if (filters.collection !== "all") params.set("collection", filters.collection);
    if (filters.q) params.set("q", filters.q);
    if (filters.sort !== "curated") params.set("sort", filters.sort);
    if (filters.price !== "all") params.set("price", filters.price);
    if (filters.stock) params.set("stock", "1");
    if (filters.sale) params.set("sale", "1");
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ""}`;
    window.history.replaceState(null, "", next);
  }

  function matches(product) {
    if (filters.collection !== "all" && product.collection !== filters.collection) return false;
    if (filters.q) {
      const needle = filters.q.toLowerCase();
      if (!product.search.includes(needle)) return false;
    }
    if (filters.price !== "all") {
      const range = PRICE_RANGES[filters.price];
      if (product.price < range.min || product.price > range.max) return false;
    }
    if (filters.stock && !product.inStock) return false;
    if (filters.sale && !product.compareAt) return false;
    return true;
  }

  function sortProducts(products) {
    const items = [...products];
    switch (filters.sort) {
      case "newest":
        return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title));
      case "price-asc":
        return items.sort((a, b) => a.price - b.price || a.title.localeCompare(b.title));
      case "price-desc":
        return items.sort((a, b) => b.price - a.price || a.title.localeCompare(b.title));
      case "title":
        return items.sort((a, b) => a.title.localeCompare(b.title));
      default:
        return items;
    }
  }

  function filteredProducts() {
    return sortProducts(OM.state.products.filter(matches));
  }

  function buildFilters() {
    const list = $("#collection-filters");
    const site = OM.state.site;
    if (!list || !site) return;

    list.innerHTML =
      `<button class="filter-link${filters.collection === "all" ? " is-active" : ""}" type="button" data-filter-collection="all">All books <span>${site.total}</span></button>` +
      site.collections
        .map(
          (collection) => `
        <button class="filter-link${filters.collection === collection.key ? " is-active" : ""}" type="button" data-filter-collection="${collection.key}">
          ${OM.escape(collection.label)} <span>${collection.count}</span>
        </button>`
        )
        .join("");

    const priceList = $("#price-filters");
    if (priceList) {
      priceList.innerHTML =
        `<label class="filter-option"><input type="radio" name="price" value="all" ${filters.price === "all" ? "checked" : ""}> All prices</label>` +
        Object.entries(PRICE_RANGES)
          .map(
            ([key, range]) =>
              `<label class="filter-option"><input type="radio" name="price" value="${key}" ${filters.price === key ? "checked" : ""}> ${range.label}</label>`
          )
          .join("");
    }

    const stock = $("#filter-stock");
    if (stock) stock.checked = filters.stock;
    const sale = $("#filter-sale");
    if (sale) sale.checked = filters.sale;

    const search = $("#shop-search");
    if (search && filters.q) search.value = filters.q;
    const sort = $("#sort");
    if (sort) sort.value = filters.sort;

    syncFilterControls();
  }

  function syncFilterControls() {
    $$("[data-filter-collection]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.filterCollection === filters.collection);
    });
  }

  function activeChips() {
    const chips = [];
    if (filters.collection !== "all") {
      const collection = OM.state.site?.collections.find((item) => item.key === filters.collection);
      chips.push({ key: "collection", label: collection?.label || "Collection" });
    }
    if (filters.q) chips.push({ key: "q", label: `“${filters.q}”` });
    if (filters.price !== "all") chips.push({ key: "price", label: PRICE_RANGES[filters.price].label });
    if (filters.stock) chips.push({ key: "stock", label: "In stock" });
    if (filters.sale) chips.push({ key: "sale", label: "On offer" });
    return chips;
  }

  function renderActiveFilters() {
    const container = $("#active-filters");
    if (!container) return;
    const chips = activeChips();
    container.innerHTML = chips
      .map(
        (chip) => `
      <button class="filter-chip" type="button" data-clear-chip="${chip.key}">
        ${OM.escape(chip.label)}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
      </button>`
      )
      .join("");
  }

  function render(reset) {
    const grid = $("#shop-grid");
    if (!grid) return;
    if (reset) filters.shown = PAGE_SIZE;

    const items = filteredProducts();
    const visible = items.slice(0, filters.shown);

    if (!items.length) {
      grid.innerHTML = `
        <div class="shop-empty">
          <h3>No books on this shelf.</h3>
          <p>Try another collection, a broader price range, or clear the filters.</p>
          <button class="btn btn--outline" type="button" data-clear-filters>Clear all filters</button>
        </div>`;
    } else {
      grid.innerHTML = visible.map((product) => OM.card(product)).join("");
    }

    const count = $("#result-count");
    if (count) {
      count.textContent = items.length
        ? `Showing ${visible.length} of ${items.length} ${OM.plural(items.length, "title")}`
        : `0 titles`;
    }

    const more = $("#load-more");
    const status = $("#load-status");
    if (more) {
      more.hidden = filters.shown >= items.length;
      more.textContent = `Load more books (${Math.max(0, items.length - filters.shown)})`;
    }
    if (status) {
      status.textContent = items.length
        ? `${Math.min(filters.shown, items.length)} of ${items.length} shown`
        : "";
    }

    renderActiveFilters();
    writeParams();
  }

  function resetFilters() {
    filters.collection = "all";
    filters.q = "";
    filters.sort = "curated";
    filters.price = "all";
    filters.stock = false;
    filters.sale = false;
    filters.shown = PAGE_SIZE;
    const search = $("#shop-search");
    if (search) search.value = "";
    const sort = $("#sort");
    if (sort) sort.value = "curated";
    buildFilters();
    render(true);
  }

  function openFilters() {
    $("#filters")?.classList.add("is-open");
    $("#filters-overlay")?.classList.add("is-open");
    document.body.classList.add("is-locked");
  }

  function closeFilters() {
    $("#filters")?.classList.remove("is-open");
    $("#filters-overlay")?.classList.remove("is-open");
    document.body.classList.remove("is-locked");
  }

  function bind() {
    $("#filters")?.addEventListener("click", (event) => {
      const category = event.target.closest("[data-filter-collection]");
      if (category) {
        filters.collection = category.dataset.filterCollection;
        filters.shown = PAGE_SIZE;
        syncFilterControls();
        render(true);
        return;
      }
      if (event.target.closest("[data-clear-filters]")) {
        resetFilters();
      }
    });

    $("#filters")?.addEventListener("change", (event) => {
      if (event.target.name === "price") {
        filters.price = event.target.value;
        filters.shown = PAGE_SIZE;
        render(true);
        return;
      }
      if (event.target.id === "filter-stock") {
        filters.stock = event.target.checked;
        filters.shown = PAGE_SIZE;
        render(true);
        return;
      }
      if (event.target.id === "filter-sale") {
        filters.sale = event.target.checked;
        filters.shown = PAGE_SIZE;
        render(true);
      }
    });

    $("#shop-grid")?.addEventListener("click", (event) => {
      if (event.target.closest("[data-clear-filters]")) resetFilters();
    });

    $("#active-filters")?.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-clear-chip]");
      if (!chip) return;
      const key = chip.dataset.clearChip;
      if (key === "collection") filters.collection = "all";
      if (key === "q") {
        filters.q = "";
        const search = $("#shop-search");
        if (search) search.value = "";
      }
      if (key === "price") {
        filters.price = "all";
        const all = $('input[name="price"][value="all"]');
        if (all) all.checked = true;
      }
      if (key === "stock") {
        filters.stock = false;
        const input = $("#filter-stock");
        if (input) input.checked = false;
      }
      if (key === "sale") {
        filters.sale = false;
        const input = $("#filter-sale");
        if (input) input.checked = false;
      }
      filters.shown = PAGE_SIZE;
      syncFilterControls();
      render(true);
    });

    let debounce;
    $("#shop-search")?.addEventListener("input", (event) => {
      window.clearTimeout(debounce);
      const value = event.target.value.trim();
      debounce = window.setTimeout(() => {
        filters.q = value;
        filters.shown = PAGE_SIZE;
        render(true);
      }, 140);
    });

    $("#sort")?.addEventListener("change", (event) => {
      filters.sort = event.target.value;
      filters.shown = PAGE_SIZE;
      render(true);
    });

    $("#load-more")?.addEventListener("click", () => {
      filters.shown += PAGE_SIZE;
      render(false);
    });

    $$("[data-filter-open]").forEach((button) => button.addEventListener("click", openFilters));
    $$("[data-filter-close]").forEach((button) => button.addEventListener("click", closeFilters));
    $("#filters-overlay")?.addEventListener("click", closeFilters);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeFilters();
    });
  }

  function boot() {
    readParams();
    buildFilters();
    bind();
    render(true);

    const params = new URLSearchParams(window.location.search);
    const open = Number(params.get("open"));
    if (open) {
      const product = OM.getProduct(open);
      if (product) OM.openProduct(open);
    }
  }

  document.addEventListener("om:ready", boot);
})();
