/* ==========================================================================
   Omariano Bookshop | shared storefront behaviour
   Catalogue, search, product dialog, shopping bag and small UI details.
   ========================================================================== */

(function () {
  "use strict";

  const OM = (window.OM = window.OM || {});
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const CART_KEY = "omariano-maison-bag-v1";
  const DELIVERY_THRESHOLD = 5000;

  const state = {
    products: [],
    site: null,
    cart: [],
    ready: false,
  };

  const esc = (value) =>
    String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character]));

  const money = (value) => "Ksh " + Number(value || 0).toLocaleString("en-KE");
  const plural = (count, singular, pluralForm) =>
    count === 1 ? singular : pluralForm || singular + "s";

  OM.escape = esc;
  OM.money = money;
  OM.plural = plural;
  OM.state = state;
  OM.getProduct = (id) => state.products.find((product) => product.id === Number(id));

  function toast(message) {
    const element = $("#toast");
    if (!element) return;
    element.textContent = message;
    element.classList.add("is-show");
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => element.classList.remove("is-show"), 2600);
  }

  /* ------------------------------------------------------------------------
     Data
     ------------------------------------------------------------------------ */

  async function loadData() {
    try {
      const [productsResponse, siteResponse] = await Promise.all([
        fetch("data/products.json"),
        fetch("data/site.json"),
      ]);
      if (!productsResponse.ok || !siteResponse.ok) throw new Error("Could not load catalogue");
      state.products = await productsResponse.json();
      state.site = await siteResponse.json();
      state.ready = true;
      document.dispatchEvent(new CustomEvent("om:ready"));
    } catch (error) {
      console.error("[Omariano] Catalogue failed to load:", error);
      const grid = $("#new-grid") || $("#shop-grid");
      if (grid) {
        grid.innerHTML =
          '<p style="grid-column:1/-1;color:#6b675e;font-size:.9rem">The catalogue could not be loaded. Please refresh the page, or open the site through a local web server.</p>';
      }
    }
  }

  /* ------------------------------------------------------------------------
     Header, menu, reveal
     ------------------------------------------------------------------------ */

  function initHeader() {
    const header = $("#site-header");
    if (header) {
      const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    const page = document.body.dataset.page;
    const current = { shop: "shop.html", about: "about.html", contact: "contact.html" }[page];
    if (current) {
      $$(".nav a").forEach((link) => {
        if (link.getAttribute("href") === current && !link.getAttribute("aria-current")) {
          link.setAttribute("aria-current", "page");
        }
      });
    }

    const menu = $("#mobile-menu");
    const openMenu = () => {
      if (!menu) return;
      menu.classList.add("is-open");
      menu.setAttribute("aria-hidden", "false");
      document.body.classList.add("is-locked");
    };
    const closeMenu = () => {
      if (!menu) return;
      menu.classList.remove("is-open");
      menu.setAttribute("aria-hidden", "true");
      document.body.classList.remove("is-locked");
    };

    $$("[data-menu-open]").forEach((button) => button.addEventListener("click", openMenu));
    $$("[data-menu-close]").forEach((button) => button.addEventListener("click", closeMenu));
    if (menu) {
      $$("a", menu).forEach((link) => link.addEventListener("click", closeMenu));
    }

    const year = $("[data-year]");
    if (year) year.textContent = new Date().getFullYear();

    // Reveal-on-scroll, only where motion is welcome.
    const elements = $$("[data-reveal]");
    if (!elements.length) return;
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      elements.forEach((element) => element.classList.add("is-in"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    elements.forEach((element) => observer.observe(element));
  }

  function initNewsletter() {
    $$("[data-newsletter]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const input = $("input[type='email']", form);
        const note = $("[data-newsletter-note]", form.parentElement) || $("[data-newsletter-note]");
        if (!input || !input.value.trim()) return;
        if (note) note.textContent = "Thank you. The bookshop will be in touch.";
        form.reset();
      });
    });
  }

  function initContactForm() {
    const form = $("[data-contact-form]");
    if (!form) return;
    const note = $("[data-contact-note]", form);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const name = String(data.get("name") || "").trim();
      const email = String(data.get("email") || "").trim();
      const phone = String(data.get("phone") || "").trim();
      const topic = String(data.get("topic") || "Website enquiry");
      const message = String(data.get("message") || "").trim();
      if (!name || !email || !message) {
        if (note) note.textContent = "Please add your name, email and a short message.";
        return;
      }
      const lines = [`Name: ${name}`, `Email: ${email}`];
      if (phone) lines.push(`Phone: ${phone}`);
      lines.push("", message);
      const body = lines.join("\n");
      const href = `mailto:info@omariano.com?subject=${encodeURIComponent(
        `Website enquiry: ${topic}`
      )}&body=${encodeURIComponent(body)}`;
      if (note) {
        note.textContent = "Opening your email app. Send the message and the bookshop will reply.";
      }
      window.location.href = href;
    });
  }

  /* ------------------------------------------------------------------------
     Search
     ------------------------------------------------------------------------ */

  function initSearch() {
    const dialog = $("#search-dialog");
    const input = $("#search-input");
    const results = $("#search-results");
    if (!dialog || !input || !results) return;

    const suggestions = ["Qur’an", "Seerah", "Children", "Fiction", "Self-help"];

    const suggestionMarkup = () => `
      <p class="search-hint">Popular in the bookshop</p>
      <div class="search-suggestions">
        ${suggestions.map((term) => `<button type="button" data-search-term="${esc(term)}">${esc(term)}</button>`).join("")}
      </div>`;

    const render = () => {
      const query = input.value.trim();
      if (query.length < 2) {
        results.innerHTML = suggestionMarkup();
        return;
      }
      const needle = query.toLowerCase();
      const matches = state.products
        .filter((product) => product.search.includes(needle))
        .sort((a, b) => {
          const aStarts = a.title.toLowerCase().startsWith(needle) ? 0 : 1;
          const bStarts = b.title.toLowerCase().startsWith(needle) ? 0 : 1;
          return aStarts - bStarts || b.sales - a.sales || a.title.localeCompare(b.title);
        })
        .slice(0, 7);

      if (!matches.length) {
        results.innerHTML = `<p class="search-empty">No books match “${esc(query)}”. Try a title, an author, or a subject.</p>`;
        return;
      }

      results.innerHTML =
        `<p class="search-hint">${matches.length} ${plural(matches.length, "book")} found</p>` +
        matches
          .map(
            (product) => `
          <a class="search-result" href="shop.html?q=${encodeURIComponent(query)}&open=${product.id}" data-search-result="${product.id}">
            <img src="${esc(product.image)}" alt="" loading="lazy">
            <div>
              <p class="search-result__cat">${esc(product.collectionLabel)}</p>
              <h4>${esc(product.title)}</h4>
              <p class="search-result__author">${esc(product.author || product.brand)}</p>
            </div>
            <span class="search-result__price">${money(product.price)}</span>
          </a>`
          )
          .join("");
    };

    const open = () => {
      if (!dialog.open) dialog.showModal();
      input.value = "";
      render();
      window.setTimeout(() => input.focus(), 30);
    };
    const close = () => {
      if (dialog.open) dialog.close();
    };

    $$("[data-search-open]").forEach((button) => button.addEventListener("click", open));
    $$("[data-search-close]").forEach((button) => button.addEventListener("click", close));

    input.addEventListener("input", render);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) close();
    });
    $("#search-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const query = input.value.trim();
      window.location.href = query ? `shop.html?q=${encodeURIComponent(query)}` : "shop.html";
    });
    results.addEventListener("click", (event) => {
      const term = event.target.closest("[data-search-term]");
      if (term) {
        input.value = term.dataset.searchTerm;
        render();
        input.focus();
        return;
      }
      const link = event.target.closest("[data-search-result]");
      if (link && document.body.dataset.page === "shop") {
        event.preventDefault();
        close();
        OM.openProduct(Number(link.dataset.searchResult));
      }
    });

    document.addEventListener("keydown", (event) => {
      const tag = (event.target.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || tag === "select" || event.target.isContentEditable;
      if (typing) return;
      if (event.key === "/" || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault();
        open();
      }
    });
  }

  /* ------------------------------------------------------------------------
     Product cards + dialog
     ------------------------------------------------------------------------ */

  function badgeFor(product) {
    if (!product.inStock) return '<span class="badge badge--out">Out of stock</span>';
    if (product.isNew) return '<span class="badge badge--new">New</span>';
    if (product.featured) return '<span class="badge badge--pick">Bookshop pick</span>';
    if (product.compareAt) return `<span class="badge badge--sale">Save ${money(product.save)}</span>`;
    return "";
  }

  OM.card = function card(product) {
    return `
      <article class="product-card${product.inStock ? "" : " is-out"}">
        <div class="product-card__media">
          <button class="product-card__open" type="button" data-product="${product.id}" aria-label="View ${esc(product.title)}">
            <img src="${esc(product.image)}" alt="${esc(product.title)}" loading="lazy">
          </button>
          ${badgeFor(product)}
          ${
            product.inStock
              ? `<button class="quick-add" type="button" data-add="${product.id}" aria-label="Add ${esc(product.title)} to bag">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                </button>`
              : ""
          }
        </div>
        <div class="product-card__body">
          <p class="product-card__cat">${esc(product.collectionLabel)}</p>
          <h3><button type="button" data-product="${product.id}">${esc(product.title)}</button></h3>
          ${product.author ? `<p class="product-card__author">${esc(product.author)}</p>` : ""}
          <p class="product-card__price">
            ${product.compareAt ? `<span class="was">${money(product.compareAt)}</span>` : ""}
            <span>${money(product.price)}</span>
          </p>
          ${!product.inStock ? '<p class="product-card__stock">Ask us to reserve a copy</p>' : product.lowStock ? `<p class="product-card__stock">Only ${product.stock} left</p>` : ""}
        </div>
      </article>`;
  };

  OM.editCard = function editCard(product, index) {
    return `
      <article class="edit-card">
        <button class="edit-card__media" type="button" data-product="${product.id}" aria-label="View ${esc(product.title)}">
          <img src="${esc(product.image)}" alt="${esc(product.title)}" loading="lazy">
        </button>
        <div class="edit-card__body">
          <span class="edit-card__no">${String(index + 1).padStart(2, "0")}</span>
          <h3><button type="button" data-product="${product.id}">${esc(product.title)}</button></h3>
          ${product.author ? `<p class="edit-card__author">${esc(product.author)}</p>` : ""}
          <p class="edit-card__price">${money(product.price)}</p>
        </div>
      </article>`;
  };

  function relatedFor(product) {
    const same = state.products.filter(
      (item) => item.id !== product.id && item.collection === product.collection && item.inStock
    );
    const others = state.products.filter(
      (item) => item.id !== product.id && item.collection !== product.collection && item.inStock
    );
    return [...same, ...others].slice(0, 3);
  }

  OM.openProduct = function openProduct(id) {
    const product = OM.getProduct(id);
    const dialog = $("#product-dialog");
    const content = $("#product-content");
    if (!product || !dialog || !content) return;

    const description = product.description
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${esc(paragraph)}</p>`)
      .join("");

    const availability = !product.inStock
      ? "Out of stock. Call to reserve"
      : product.lowStock
      ? `Only ${product.stock} left in the bookshop`
      : "In stock";

    const related = relatedFor(product);

    content.innerHTML = `
      <div class="pd">
        <div class="pd__media">
          ${badgeFor(product)}
          <img src="${esc(product.image)}" alt="${esc(product.title)}">
        </div>
        <div class="pd__body">
          <p class="eyebrow"><span class="eyebrow__line"></span>${esc(product.collectionLabel)} · ${esc(product.category)}</p>
          <h2>${esc(product.title)}</h2>
          ${product.author ? `<p class="pd__author">by ${esc(product.author)}</p>` : ""}
          <div class="pd__price">
            ${product.compareAt ? `<s>${money(product.compareAt)}</s>` : ""}
            <span>${money(product.price)}</span>
            ${product.compareAt ? `<span class="save">Save ${money(product.save)}</span>` : ""}
          </div>
          <div class="pd__desc">${description}</div>
          <div class="pd__buy">
            <div class="qty" aria-label="Quantity">
              <button type="button" data-pd-qty="-1" aria-label="Decrease quantity">−</button>
              <span id="pd-qty">1</span>
              <button type="button" data-pd-qty="1" aria-label="Increase quantity">+</button>
            </div>
            <button class="btn btn--primary" type="button" data-pd-add="${product.id}" ${product.inStock ? "" : "disabled"}>
              ${product.inStock ? `Add to bag · ${money(product.price)}` : "Out of stock"}
            </button>
          </div>
          <dl class="pd__meta">
            <div><dt>Availability</dt><dd>${esc(availability)}</dd></div>
            <div><dt>Publisher</dt><dd>${esc(product.brand)}</dd></div>
            <div><dt>Delivery</dt><dd>Nairobi &amp; countrywide</dd></div>
          </dl>
          <p class="pd__note">Not sure if this is the right book for you? Call the bookshop on <a href="tel:+254794677029" style="text-decoration:underline;text-underline-offset:3px">+254 794 677 029</a> and we’ll help you choose.</p>
        </div>
      </div>
      ${
        related.length
          ? `<div class="pd__related">
              <h3>You may also like</h3>
              ${related
                .map(
                  (item) => `
                <button class="pd-related-card" type="button" data-product="${item.id}">
                  <img src="${esc(item.image)}" alt="" loading="lazy">
                  <p>${esc(item.title)}</p>
                </button>`
                )
                .join("")}
            </div>`
          : ""
      }`;

    if (!dialog.open) dialog.showModal();
    document.body.classList.add("is-locked");
  };

  function closeProduct() {
    const dialog = $("#product-dialog");
    if (dialog && dialog.open) dialog.close();
    document.body.classList.remove("is-locked");
  }

  function initProductDialog() {
    const dialog = $("#product-dialog");
    if (!dialog) return;
    $$("[data-product-close]").forEach((button) => button.addEventListener("click", closeProduct));
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeProduct();
    });
    dialog.addEventListener("cancel", () => document.body.classList.remove("is-locked"));
    dialog.addEventListener("click", (event) => {
      const step = event.target.closest("[data-pd-qty]");
      if (step) {
        const display = $("#pd-qty");
        if (!display) return;
        const current = Number(display.textContent) || 1;
        const product = OM.getProduct(Number($("[data-pd-add]", dialog)?.dataset.pdAdd));
        const max = product ? Math.max(1, product.stock) : 99;
        display.textContent = String(Math.min(max, Math.max(1, current + Number(step.dataset.pdQty))));
        return;
      }
      const add = event.target.closest("[data-pd-add]");
      if (add) {
        const qty = Number($("#pd-qty")?.textContent) || 1;
        OM.addToCart(Number(add.dataset.pdAdd), qty);
        closeProduct();
        OM.openCart();
      }
    });
  }

  /* ------------------------------------------------------------------------
     Cart
     ------------------------------------------------------------------------ */

  function loadCart() {
    try {
      const stored = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      if (Array.isArray(stored)) {
        state.cart = stored
          .filter((item) => item && Number.isFinite(Number(item.id)) && Number(item.qty) > 0)
          .map((item) => ({ id: Number(item.id), qty: Math.min(99, Math.max(1, Number(item.qty))) }));
      }
    } catch (error) {
      state.cart = [];
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
    } catch (error) {
      /* Private mode: the bag still works for this page. */
    }
  }

  function cartItems() {
    return state.cart
      .map((item) => ({ ...item, product: OM.getProduct(item.id) }))
      .filter((item) => Boolean(item.product));
  }

  function cartCount() {
    return state.cart.reduce((total, item) => total + item.qty, 0);
  }

  function cartSubtotal() {
    return cartItems().reduce((total, item) => total + item.product.price * item.qty, 0);
  }

  function updateCartBadges(bump) {
    const count = cartCount();
    $$("[data-cart-count]").forEach((element) => {
      element.textContent = String(count);
      if (bump) {
        element.classList.add("is-bumped");
        window.setTimeout(() => element.classList.remove("is-bumped"), 320);
      }
    });
    $$("[data-cart-label]").forEach((element) => {
      element.textContent = `${count} ${plural(count, "book")}`;
    });
  }

  function renderCart() {
    const body = $("#cart-body");
    const foot = $("#cart-foot");
    if (!body || !foot) return;

    const items = cartItems();
    if (!items.length) {
      body.innerHTML = `
        <div class="cart-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
          <h3>Your bag is quiet.</h3>
          <p>Add a book from the collection and it will wait for you here.</p>
          <a class="btn btn--outline" href="shop.html" data-cart-close>Browse the shelves</a>
        </div>`;
      foot.innerHTML = "";
      foot.style.display = "none";
      return;
    }

    foot.style.display = "";
    body.innerHTML = items
      .map(({ product, qty }) => {
        const lineTotal = product.price * qty;
        return `
          <article class="cart-item">
            <div class="cart-item__media"><img src="${esc(product.image)}" alt="" loading="lazy"></div>
            <div>
              <p class="cart-item__cat">${esc(product.collectionLabel)}</p>
              <h4>${esc(product.title)}</h4>
              ${product.author ? `<p class="cart-item__author">${esc(product.author)}</p>` : ""}
              <div class="cart-item__row">
                <div class="cart-item__qty" aria-label="Quantity for ${esc(product.title)}">
                  <button type="button" data-cart-dec="${product.id}" aria-label="Decrease quantity">−</button>
                  <span>${qty}</span>
                  <button type="button" data-cart-inc="${product.id}" aria-label="Increase quantity" ${qty >= product.stock ? "disabled" : ""}>+</button>
                </div>
                <span class="cart-item__price">${money(lineTotal)}</span>
              </div>
              <button class="cart-item__remove" type="button" data-cart-remove="${product.id}">Remove</button>
            </div>
          </article>`;
      })
      .join("");

    const subtotal = cartSubtotal();
    const remaining = Math.max(0, DELIVERY_THRESHOLD - subtotal);
    const progress = Math.min(100, (subtotal / DELIVERY_THRESHOLD) * 100);
    const orderLines = items
      .map(({ product, qty }) => `• ${product.title} × ${qty} · ${money(product.price * qty)}`)
      .join("\n");
    const message = `Hello Omariano, I'd like to order:\n\n${orderLines}\n\nSubtotal: ${money(subtotal)}\n\n(Sent from the Omariano Bookshop preview)`;
    const whatsapp = state.site?.whatsapp || "254794677029";

    foot.innerHTML = `
      <div class="cart-progress">
        <p>${remaining > 0 ? `Add ${money(remaining)} for complimentary delivery in Nairobi.` : "Complimentary Nairobi delivery unlocked."}</p>
        <div class="cart-progress__bar"><span style="width:${progress}%"></span></div>
      </div>
      <div class="cart-subtotal"><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
      <a class="btn btn--primary" href="https://wa.me/${esc(whatsapp)}?text=${encodeURIComponent(message)}" target="_blank" rel="noopener">
        Complete order on WhatsApp
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </a>
      <p class="cart-note">This is a preview. The Omariano team confirms stock, delivery and payment with you directly.</p>`;
  }

  function updateCartUI(bump) {
    updateCartBadges(bump);
    renderCart();
  }

  OM.addToCart = function addToCart(id, qty = 1) {
    const product = OM.getProduct(id);
    if (!product) return;
    if (!product.inStock) {
      toast("That title is currently out of stock.");
      return;
    }
    const existing = state.cart.find((item) => item.id === product.id);
    const nextQty = Math.min(product.stock, (existing?.qty || 0) + Math.max(1, Number(qty) || 1));
    if (existing) existing.qty = nextQty;
    else state.cart.push({ id: product.id, qty: nextQty });
    saveCart();
    updateCartUI(true);
    toast(`${product.title} added to your bag.`);
  };

  function changeQty(id, delta) {
    const item = state.cart.find((entry) => entry.id === Number(id));
    if (!item) return;
    const product = OM.getProduct(item.id);
    const max = product ? Math.max(1, product.stock) : 99;
    item.qty = Math.min(max, Math.max(1, item.qty + delta));
    saveCart();
    updateCartUI(false);
  }

  function removeItem(id) {
    state.cart = state.cart.filter((item) => item.id !== Number(id));
    saveCart();
    updateCartUI(false);
  }

  OM.openCart = function openCart() {
    const drawer = $("#cart-drawer");
    const overlay = $(".cart-overlay");
    if (!drawer) return;
    renderCart();
    drawer.classList.add("is-open");
    overlay?.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-locked");
    window.setTimeout(() => $(".cart-close")?.focus(), 40);
  };

  OM.closeCart = function closeCart() {
    const drawer = $("#cart-drawer");
    const overlay = $(".cart-overlay");
    drawer?.classList.remove("is-open");
    overlay?.classList.remove("is-open");
    drawer?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-locked");
  };

  function initCart() {
    loadCart();
    updateCartUI(false);

    $$("[data-cart-open]").forEach((button) => button.addEventListener("click", OM.openCart));
    $$("[data-cart-close]").forEach((button) => button.addEventListener("click", OM.closeCart));

    $("#cart-body")?.addEventListener("click", (event) => {
      const inc = event.target.closest("[data-cart-inc]");
      const dec = event.target.closest("[data-cart-dec]");
      const remove = event.target.closest("[data-cart-remove]");
      if (inc) changeQty(inc.dataset.cartInc, 1);
      if (dec) changeQty(dec.dataset.cartDec, -1);
      if (remove) removeItem(remove.dataset.cartRemove);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        OM.closeCart();
        const menu = $("#mobile-menu");
        if (menu?.classList.contains("is-open")) {
          menu.classList.remove("is-open");
          menu.setAttribute("aria-hidden", "true");
          document.body.classList.remove("is-locked");
        }
      }
    });
  }

  /* ------------------------------------------------------------------------
     Global click delegation
     ------------------------------------------------------------------------ */

  function initDelegates() {
    document.addEventListener("click", (event) => {
      const add = event.target.closest("[data-add]");
      if (add) {
        event.preventDefault();
        OM.addToCart(Number(add.dataset.add), 1);
        return;
      }
      const product = event.target.closest("[data-product]");
      if (product) {
        event.preventDefault();
        OM.closeCart();
        OM.openProduct(Number(product.dataset.product));
      }
    });
  }

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */

  function boot() {
    initHeader();
    initNewsletter();
    initContactForm();
    initSearch();
    initProductDialog();
    initCart();
    initDelegates();
    loadData();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
