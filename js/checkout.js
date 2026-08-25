(function () {
  var app = document.querySelector("[data-checkout-app]");

  if (!app) {
    return;
  }

  var state = {
    user: null,
    components: [],
    cart: {},
    dashboard: { orders: [], inventory: [], cooldownSeconds: 0 },
    adminOrders: [],
    teams: [],
    selectedTeamId: null,
    pollTimer: null,
    toastTimer: null
  };
  var categories = ["Audio", "Button", "Camera", "Communication", "Distance", "Electronics", "Microcontroller", "Motor", "Motor Related", "Pi-related", "Power", "Sensor", "Tool"];
  var loadingState = document.querySelector("[data-loading-state]");
  var closedState = document.querySelector("[data-closed-state]");
  var loginState = document.querySelector("[data-login-state]");
  var teamApp = document.querySelector("[data-team-app]");
  var adminApp = document.querySelector("[data-admin-app]");
  var session = document.querySelector("[data-session]");
  var toast = document.querySelector("[data-toast]");
  var cartDialog = document.querySelector("[data-cart-dialog]");
  var orderDialog = document.querySelector("[data-order-dialog]");
  var confirmDialog = document.querySelector("[data-confirm-dialog]");
  var teamCreateDialog = document.querySelector("[data-team-create-dialog]");
  var componentDialog = document.querySelector("[data-component-dialog]");

  var escapeHtml = function (value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  var formatDate = function (value) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value));
  };

  var statusLabel = function (status) {
    return {
      submitted: "Submitted",
      reviewing: "Reviewing",
      ready: "Ready for Pickup",
      picked_up: "Picked Up",
      cancelled: "Cancelled"
    }[status] || status;
  };

  var api = async function (action, payload) {
    var response = await window.fetch("/api/checkout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    });
    var result = await response.json().catch(function () { return {}; });

    if (!response.ok) {
      var error = new Error(result.error || "The checkout system could not complete that action.");
      error.status = response.status;
      error.details = result.details;
      throw error;
    }

    return result;
  };

  var showOnly = function (element) {
    [loadingState, closedState, loginState, teamApp, adminApp].forEach(function (candidate) {
      candidate.hidden = candidate !== element;
    });
  };

  var notify = function (message) {
    window.clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    state.toastTimer = window.setTimeout(function () {
      toast.hidden = true;
    }, 4200);
  };

  var setBusy = function (button, busy, label) {
    if (!button) {
      return;
    }

    if (busy) {
      button.dataset.originalLabel = button.textContent;
      button.textContent = label || "Working…";
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalLabel || button.textContent;
      button.disabled = false;
    }
  };

  var setSession = function (user) {
    state.user = user;
    session.hidden = !user;

    if (user) {
      session.querySelector("[data-session-name]").textContent = user.role === "team"
        ? user.teamName
        : user.displayName;
    }
  };

  var imageMarkup = function (component) {
    if (component.imageUrl) {
      return '<img src="' + escapeHtml(component.imageUrl) + '" alt="' + escapeHtml(component.name) + '">';
    }

    return '<span class="checkout-component-placeholder" aria-hidden="true">' + escapeHtml(component.name.slice(0, 2).toUpperCase()) + "</span>";
  };

  var tagTone = function (value) {
    var tones = {
      "Audio": 0,
      "Button": 4,
      "Camera": 3,
      "Communication": 1,
      "Distance": 5,
      "Electronics": 2,
      "Microcontroller": 0,
      "Motor": 4,
      "Motor Related": 3,
      "Pi-related": 1,
      "Power": 5,
      "Sensor": 2,
      "Tool": 0,
      "Arduino": 0,
      "Raspberry Pi": 1,
      "Arduino + Raspberry Pi": 3,
      "N/A": 5
    };

    if (Object.prototype.hasOwnProperty.call(tones, value)) {
      return " checkout-tag-tone-" + tones[value];
    }

    var hash = String(value).split("").reduce(function (total, character) {
      return total + character.charCodeAt(0);
    }, 0);
    return " checkout-tag-tone-" + (hash % 6);
  };

  var tagMarkup = function (value) {
    return '<span class="checkout-tag' + tagTone(value) + '">' + escapeHtml(value) + "</span>";
  };

  var itemImageMarkup = function (item) {
    if (item.imageUrl) {
      return '<img src="' + escapeHtml(item.imageUrl) + '" alt="">';
    }

    return '<span aria-hidden="true">' + escapeHtml(item.name.slice(0, 2).toUpperCase()) + "</span>";
  };

  var updateCartCounts = function () {
    var count = Object.keys(state.cart).reduce(function (total, key) {
      return total + state.cart[key];
    }, 0);

    document.querySelectorAll("[data-cart-count], [data-cart-button-count]").forEach(function (element) {
      element.textContent = count;
    });
  };

  var componentMaximum = function (component) {
    var stockMaximum = component.availableQuantity;

    if (component.maxActivePerTeam == null) {
      return stockMaximum;
    }

    return Math.max(0, Math.min(stockMaximum, component.maxActivePerTeam - component.teamActiveQuantity));
  };

  var renderCatalog = function () {
    var grid = document.querySelector("[data-component-grid]");
    var search = document.querySelector("[data-component-search]").value.trim().toLowerCase();
    var category = document.querySelector("[data-category-filter]").value;
    var compatibility = document.querySelector("[data-compatibility-filter]").value;
    var availableOnly = document.querySelector("[data-availability-filter]").checked;
    var visible = state.components.filter(function (component) {
      var haystack = (component.name + " " + component.description).toLowerCase();
      return (!search || haystack.indexOf(search) >= 0) &&
        (!category || component.category === category) &&
        (!compatibility || component.compatibility === compatibility) &&
        (!availableOnly || componentMaximum(component) > 0);
    });

    if (!visible.length) {
      grid.innerHTML = '<p class="checkout-empty">No components match these filters.</p>';
      return;
    }

    grid.innerHTML = visible.map(function (component) {
      var maximum = componentMaximum(component);
      var quantity = state.cart[component.id] || 0;
      var stockClass = maximum === 0 ? " checkout-stock-out" : maximum <= 3 ? " checkout-stock-low" : "";
      var stockLabel = maximum === 0
        ? (component.availableQuantity === 0 ? "Out of Stock" : "Limit Reached")
        : "Available: " + component.availableQuantity;
      var limit = component.maxActivePerTeam == null
        ? ""
        : '<p class="checkout-limit">Maximum ' + component.maxActivePerTeam + " active per team" +
          (component.teamActiveQuantity ? " · You already have/reserved " + component.teamActiveQuantity : "") + "</p>";

      return '<article class="checkout-component-card" data-component-id="' + component.id + '">' +
        '<div class="checkout-component-image">' + imageMarkup(component) + "</div>" +
        '<div class="checkout-component-body"><h2>' + escapeHtml(component.name) + "</h2>" +
        '<div class="checkout-tags">' + tagMarkup(component.category) + tagMarkup(component.compatibility) + "</div>" +
        '<p class="checkout-component-description">' + escapeHtml(component.description) + "</p>" +
        '<p class="checkout-stock' + stockClass + '">' + stockLabel + "</p>" + limit +
        '<div class="checkout-quantity-row"><button type="button" data-quantity-change="-1" aria-label="Remove one ' + escapeHtml(component.name) + '"' + (quantity === 0 ? " disabled" : "") + '>−</button><output aria-live="polite">' + quantity + '</output><button type="button" data-quantity-change="1" aria-label="Add one ' + escapeHtml(component.name) + '"' + (quantity >= maximum ? " disabled" : "") + ">+</button></div>" +
        "</div></article>";
    }).join("");
  };

  var renderCooldown = function () {
    var cooldown = document.querySelector("[data-cooldown]");
    var seconds = Math.max(0, Math.ceil(state.dashboard.cooldownSeconds));

    if (!seconds) {
      cooldown.hidden = true;
      return;
    }

    var minutes = Math.floor(seconds / 60);
    var remainder = String(seconds % 60).padStart(2, "0");
    cooldown.textContent = "You can place another order in " + String(minutes).padStart(2, "0") + ":" + remainder;
    cooldown.hidden = false;
  };

  var orderItemsMarkup = function (order, adjustable, showImages) {
    return '<div class="checkout-order-items">' + order.items.map(function (item) {
      var changed = item.approvedQuantity !== item.requestedQuantity;
      var adjustment = changed
        ? "<small>Approved " + item.approvedQuantity + " of " + item.requestedQuantity + (item.adjustmentReason ? " · " + escapeHtml(item.adjustmentReason) : "") + "</small>"
        : "";
      var controls = "";

      if (adjustable) {
        controls = '<div class="checkout-approved-input"><label>Approved<input type="number" min="0" max="' + item.requestedQuantity + '" value="' + item.approvedQuantity + '" data-adjust-quantity="' + item.id + '"></label><label>Reason<select data-adjust-reason="' + item.id + '"><option value="">No adjustment</option><option>Out of Stock</option><option>Reached Max Per Team</option><option>Component Unavailable</option><option>Quantity Adjusted by Volunteer</option><option>Other</option></select></label><label>Note<input maxlength="1000" data-adjust-note="' + item.id + '" value="' + escapeHtml(item.note || "") + '"></label></div>';
      }

      var image = showImages
        ? '<div class="checkout-order-item-image">' + itemImageMarkup(item) + "</div>"
        : "";
      var category = showImages ? '<div class="checkout-order-item-tags">' + tagMarkup(item.category) + "</div>" : "";

      return '<div class="checkout-order-item' + (showImages ? " checkout-order-item-with-image" : "") + '">' + image + '<span><strong>' + escapeHtml(item.name) + "</strong>" + category + adjustment + controls + '</span><span class="checkout-order-item-quantity">× ' + item.approvedQuantity + "</span></div>";
    }).join("") + "</div>";
  };

  var openOrderReceipt = function (order) {
    var title = order.status === "ready" ? "READY FOR PICKUP" : "Order #" + order.id;
    var heroClass = order.status === "ready" ? " checkout-receipt-ready" : "";
    orderDialog.querySelector("[data-order-dialog-title]").textContent = title;
    orderDialog.querySelector("[data-order-dialog-body]").innerHTML =
      '<div class="checkout-receipt-hero' + heroClass + '"><span>' + escapeHtml(statusLabel(order.status).toUpperCase()) + '</span><strong>#' + order.id + "</strong><span>" + escapeHtml(order.teamName) + " · " + formatDate(order.createdAt) + "</span></div>" +
      orderItemsMarkup(order, false) +
      (order.status === "ready" ? "<p><strong>Please bring this screen to the hardware desk.</strong></p>" : "");
    orderDialog.showModal();
  };

  var renderTeamOrders = function () {
    var list = document.querySelector("[data-team-orders]");

    if (!state.dashboard.orders.length) {
      list.innerHTML = '<p class="checkout-empty">No orders yet. Browse components to place your first reservation.</p>';
      return;
    }

    list.innerHTML = state.dashboard.orders.map(function (order) {
      return '<article class="checkout-order-card"><div class="checkout-order-card-header"><div><h2>Order #' + order.id + '</h2><p class="checkout-order-card-meta">' + formatDate(order.createdAt) + '</p></div><span class="checkout-status checkout-status-' + order.status + '">' + escapeHtml(statusLabel(order.status)) + "</span></div>" +
        orderItemsMarkup(order, false) + '<div class="checkout-order-actions"><button class="checkout-button checkout-button-secondary" type="button" data-view-order="' + order.id + '">Open receipt</button></div></article>';
    }).join("");
  };

  var renderHolding = function () {
    var grid = document.querySelector("[data-team-holding]");

    if (!state.dashboard.inventory.length) {
      grid.innerHTML = '<p class="checkout-empty">Your team is not holding any checked-out hardware.</p>';
      return;
    }

    grid.innerHTML = state.dashboard.inventory.map(function (item) {
      return '<article class="checkout-holding-card">' + tagMarkup(item.category) + '<h2>' + escapeHtml(item.name) + '</h2><p class="checkout-holding-quantity">× ' + item.checkedOutQuantity + "</p></article>";
    }).join("");
  };

  var loadTeamData = async function (quiet) {
    try {
      var results = await Promise.all([api("catalog"), api("team-dashboard")]);
      state.components = results[0].components;
      state.dashboard = results[1];
      renderCatalog();
      renderCooldown();
      renderTeamOrders();
      renderHolding();
    } catch (error) {
      if (!quiet) {
        notify(error.message);
      }
    }
  };

  var renderCart = function () {
    var items = Object.keys(state.cart).map(function (id) {
      return state.components.find(function (component) { return component.id === Number(id); });
    }).filter(Boolean);
    var container = document.querySelector("[data-cart-items]");
    var submit = document.querySelector("[data-submit-order]");

    if (!items.length) {
      container.innerHTML = '<p class="checkout-empty">Your order is empty.</p>';
      submit.disabled = true;
      return;
    }

    submit.disabled = state.dashboard.cooldownSeconds > 0;
    container.innerHTML = items.map(function (component) {
      return '<div class="checkout-cart-row"><strong>' + escapeHtml(component.name) + '</strong><span>× ' + state.cart[component.id] + '</span><button type="button" data-cart-remove="' + component.id + '">Remove</button></div>';
    }).join("");
  };

  var teamTab = function (name) {
    document.querySelectorAll("[data-team-tab]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.teamTab === name);
    });
    document.querySelectorAll("[data-team-panel]").forEach(function (panel) {
      panel.hidden = panel.dataset.teamPanel !== name;
    });
  };

  var renderOverview = function (overview) {
    var orderCounts = overview.orders || {};
    document.querySelector("[data-admin-overview]").innerHTML =
      '<article class="checkout-metric-card"><h2>Orders</h2><dl class="checkout-metric-list"><div><dt>Submitted</dt><dd>' + (orderCounts.submitted || 0) + '</dd></div><div><dt>Reviewing</dt><dd>' + (orderCounts.reviewing || 0) + '</dd></div><div><dt>Ready</dt><dd>' + (orderCounts.ready || 0) + "</dd></div></dl></article>" +
      '<article class="checkout-metric-card"><h2>Inventory</h2><dl class="checkout-metric-list"><div><dt>Available</dt><dd>' + overview.inventory.available + '</dd></div><div><dt>Reserved</dt><dd>' + overview.inventory.reserved + '</dd></div><div><dt>Checked Out</dt><dd>' + overview.inventory.checked_out + '</dd></div><div><dt>Unavailable</dt><dd>' + overview.inventory.unavailable + "</dd></div></dl></article>" +
      '<article class="checkout-metric-card"><h2>Returns</h2><dl class="checkout-metric-list"><div><dt>Teams holding hardware</dt><dd>' + overview.teamsHoldingHardware + "</dd></div></dl></article>";
  };

  var adminOrderActions = function (order) {
    if (order.status === "submitted") {
      return '<button class="checkout-button checkout-button-primary" type="button" data-claim-order="' + order.id + '">Review Order</button>';
    }

    if (order.status === "reviewing" && order.reviewedBy === state.user.id) {
      return '<button class="checkout-button checkout-button-secondary" type="button" data-save-adjustments="' + order.id + '">Save Adjustments</button><button class="checkout-button checkout-button-primary" type="button" data-mark-ready="' + order.id + '">Mark Ready for Pickup</button><button class="checkout-button checkout-button-danger" type="button" data-cancel-order="' + order.id + '">Cancel Order</button>';
    }

    if (order.status === "ready") {
      return '<button class="checkout-button checkout-button-primary" type="button" data-confirm-pickup="' + order.id + '">Confirm Pickup</button><button class="checkout-button checkout-button-danger" type="button" data-cancel-order="' + order.id + '">Cancel Order</button>';
    }

    return "";
  };

  var renderAdminOrders = function () {
    var list = document.querySelector("[data-admin-orders]");
    var stages = [
      { status: "submitted", label: "Submitted" },
      { status: "reviewing", label: "Reviewing" },
      { status: "ready", label: "Ready for pickup" },
      { status: "picked_up", label: "Picked up" },
      { status: "cancelled", label: "Cancelled" }
    ];

    list.innerHTML = stages.map(function (stage) {
      var orders = state.adminOrders.filter(function (order) { return order.status === stage.status; });
      var cards = orders.length ? orders.map(function (order) {
        var adjustable = order.status === "reviewing" && order.reviewedBy === state.user.id;
        return '<article class="checkout-order-card checkout-order-board-card" data-admin-order="' + order.id + '"><div class="checkout-order-card-header"><div><h2>#' + order.id + " — " + escapeHtml(order.teamName) + '</h2><p class="checkout-order-card-meta">Submitted ' + formatDate(order.createdAt) + (order.reviewerName ? " · " + escapeHtml(order.reviewerName) : "") + "</p></div></div>" +
          orderItemsMarkup(order, adjustable, true) + '<div class="checkout-order-actions">' + adminOrderActions(order) + "</div></article>";
      }).join("") : '<p class="checkout-stage-empty">No ' + stage.label.toLowerCase() + " orders.</p>";

      return '<section class="checkout-order-column checkout-order-column-' + stage.status + '"><header><span class="checkout-status checkout-status-' + stage.status + '">' + escapeHtml(stage.label) + '</span><strong>' + orders.length + '</strong></header><div class="checkout-order-column-cards">' + cards + "</div></section>";
    }).join("");
  };

  var loadAdminOverview = async function () {
    renderOverview(await api("admin-overview"));
  };

  var loadAdminOrders = async function () {
    state.adminOrders = (await api("admin-orders")).orders;
    renderAdminOrders();
  };

  var renderTeams = function () {
    var list = document.querySelector("[data-team-list]");

    if (!state.teams.length) {
      list.innerHTML = '<p class="checkout-empty">No teams found.</p>';
      return;
    }

    list.innerHTML = state.teams.map(function (team) {
      return '<button class="checkout-team-button' + (team.id === state.selectedTeamId ? " is-active" : "") + '" type="button" data-select-team="' + team.id + '"><strong>' + escapeHtml(team.name) + '</strong><small>@' + escapeHtml(team.username) + " · " + team.checkedOutQuantity + " items out</small></button>";
    }).join("");
  };

  var loadTeams = async function () {
    var search = document.querySelector("[data-team-search]").value;
    state.teams = (await api("teams", { search: search })).teams;
    renderTeams();
  };

  var renderTeamDetail = function (detail) {
    var container = document.querySelector("[data-team-detail]");
    var holding = detail.inventory.length ? detail.inventory.map(function (item) {
      return '<div class="checkout-return-row" data-return-component="' + item.componentId + '"><strong>' + escapeHtml(item.name) + '<span>Currently holding ' + item.checkedOutQuantity + '</span></strong><label>Return now<input type="number" min="0" max="' + item.checkedOutQuantity + '" value="0" data-return-quantity></label><label>Condition<select data-return-condition><option value="good">Good</option><option value="damaged">Damaged</option><option value="missing">Missing</option></select></label><label>Note<input maxlength="1000" placeholder="Required if damaged/missing" data-return-note></label></div>';
    }).join("") + '<div class="checkout-order-actions"><button class="checkout-button checkout-button-primary" type="button" data-process-return="' + detail.team.id + '">Process Return</button></div>' : '<p class="checkout-empty">This team has returned all checked-out hardware.</p>';
    var receipts = detail.returns.length ? detail.returns.map(function (receipt) {
      return '<article class="checkout-receipt"><strong>Return #R-' + receipt.id + '</strong><p>' + formatDate(receipt.createdAt) + " · " + escapeHtml(receipt.processedBy) + '</p><p>' + receipt.items.map(function (item) { return item.quantity + " × " + escapeHtml(item.name) + " — " + escapeHtml(item.condition); }).join("<br>") + "</p></article>";
    }).join("") : '<p class="checkout-empty">No return receipts yet.</p>';
    var orders = detail.orders.length ? detail.orders.map(function (order) {
      return '<button class="checkout-team-button" type="button" data-view-admin-order="' + order.id + '"><strong>Order #' + order.id + '</strong><small>' + escapeHtml(statusLabel(order.status)) + " · " + formatDate(order.createdAt) + "</small></button>";
    }).join("") : '<p class="checkout-empty">No orders yet.</p>';

    container.innerHTML = '<div class="checkout-order-card-header"><div><span class="checkout-kicker">TEAM</span><h2>' + escapeHtml(detail.team.name) + '</h2><p class="checkout-order-card-meta">' + escapeHtml(detail.team.identifier) + '</p></div><button class="checkout-button checkout-button-secondary" type="button" data-reset-password="' + detail.team.id + '">Reset password</button></div><h3 class="checkout-section-title">Currently Holding</h3>' + holding + '<h3 class="checkout-section-title">Orders & Pickup History</h3>' + orders + '<h3 class="checkout-section-title">Return History</h3>' + receipts;
  };

  var loadTeamDetail = async function (teamId) {
    state.selectedTeamId = Number(teamId);
    renderTeams();
    renderTeamDetail(await api("team-detail", { teamId: teamId }));
  };

  var renderInventory = function () {
    document.querySelector("[data-inventory-table]").innerHTML = state.components.map(function (component) {
      return '<tr><td><strong>' + escapeHtml(component.name) + '</strong><br><small>' + escapeHtml(component.category) + (component.active ? "" : " · Disabled") + '</small></td><td>' + component.availableQuantity + '</td><td>' + component.reservedQuantity + '</td><td>' + component.checkedOutQuantity + '</td><td>' + component.unavailableQuantity + '</td><td>' + component.totalQuantity + '</td><td><button class="checkout-button checkout-button-secondary" type="button" data-edit-component="' + component.id + '">Edit</button></td></tr>';
    }).join("");
  };

  var loadInventory = async function () {
    state.components = (await api("catalog")).components;
    renderInventory();
  };

  var loadActivity = async function () {
    var items = (await api("activity")).activity;
    document.querySelector("[data-activity-list]").innerHTML = items.length ? items.map(function (item) {
      return '<li><time datetime="' + escapeHtml(item.createdAt) + '">' + formatDate(item.createdAt) + '</time><span>' + escapeHtml(item.message) + "</span></li>";
    }).join("") : '<li class="checkout-empty">No activity yet.</li>';
  };

  var adminTab = async function (name) {
    document.querySelectorAll("[data-admin-tab]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.adminTab === name);
    });
    document.querySelectorAll("[data-admin-panel]").forEach(function (panel) {
      panel.hidden = panel.dataset.adminPanel !== name;
    });

    try {
      if (name === "overview") {
        await loadAdminOverview();
      } else if (name === "orders") {
        await loadAdminOrders();
      } else if (name === "teams") {
        await loadTeams();
      } else if (name === "inventory") {
        await loadInventory();
      } else if (name === "activity") {
        await loadActivity();
      }
    } catch (error) {
      notify(error.message);
    }
  };

  var confirmAction = function (title, message, buttonLabel) {
    return new Promise(function (resolve) {
      confirmDialog.querySelector("[data-confirm-title]").textContent = title;
      confirmDialog.querySelector("[data-confirm-body]").textContent = message;
      var accept = confirmDialog.querySelector("[data-confirm-accept]");
      var cancel = confirmDialog.querySelector("[data-confirm-cancel]");
      accept.textContent = buttonLabel || "Confirm";

      var finish = function (value) {
        accept.removeEventListener("click", acceptAction);
        cancel.removeEventListener("click", cancelAction);
        confirmDialog.close();
        resolve(value);
      };
      var acceptAction = function () { finish(true); };
      var cancelAction = function () { finish(false); };
      accept.addEventListener("click", acceptAction);
      cancel.addEventListener("click", cancelAction);
      confirmDialog.showModal();
    });
  };

  var beginPolling = function () {
    window.clearInterval(state.pollTimer);
    state.pollTimer = window.setInterval(function () {
      if (state.user && state.user.role === "team") {
        loadTeamData(true);
      } else if (state.user && state.user.role === "admin") {
        loadAdminOverview().catch(function () {});
      }
    }, 5000);
  };

  var enterApplication = async function (user) {
    setSession(user);

    if (user.role === "team") {
      showOnly(teamApp);
      await loadTeamData();
    } else {
      showOnly(adminApp);
      await adminTab("overview");
    }

    beginPolling();
  };

  var initialize = async function () {
    try {
      var response = await window.fetch("/api/checkout?action=status", { credentials: "same-origin" });
      var statusResult = await response.json();

      if (!statusResult.status.live) {
        document.querySelector("[data-live-start]").textContent = formatDate(statusResult.status.startsAt);
        document.querySelector("[data-live-end]").textContent = formatDate(statusResult.status.endsAt);
        showOnly(closedState);
        return;
      }

      try {
        var me = await api("me");
        await enterApplication(me.user);
      } catch (error) {
        if (error.status === 401) {
          setSession(null);
          showOnly(loginState);
        } else {
          throw error;
        }
      }
    } catch (error) {
      loadingState.querySelector("h1").textContent = "The hardware desk is temporarily unavailable.";
      loadingState.insertAdjacentHTML("beforeend", '<p class="checkout-form-error">' + escapeHtml(error.message) + "</p>");
    }
  };

  document.querySelector("[data-login-form]").addEventListener("submit", async function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    var errorElement = document.querySelector("[data-login-error]");
    var button = form.querySelector("button[type=submit]");
    errorElement.hidden = true;
    setBusy(button, true, "Signing in…");

    try {
      var result = await api("login", { username: form.username.value, password: form.password.value });
      form.reset();
      await enterApplication(result.user);
    } catch (error) {
      errorElement.textContent = error.message;
      errorElement.hidden = false;
    } finally {
      setBusy(button, false);
    }
  });

  document.querySelector("[data-logout]").addEventListener("click", async function () {
    await api("logout").catch(function () {});
    window.clearInterval(state.pollTimer);
    setSession(null);
    showOnly(loginState);
  });

  document.querySelectorAll("[data-team-tab]").forEach(function (button) {
    button.addEventListener("click", function () { teamTab(button.dataset.teamTab); });
  });

  ["[data-component-search]", "[data-category-filter]", "[data-compatibility-filter]", "[data-availability-filter]"].forEach(function (selector) {
    document.querySelector(selector).addEventListener("input", renderCatalog);
  });

  document.querySelector("[data-component-grid]").addEventListener("click", function (event) {
    var button = event.target.closest("[data-quantity-change]");

    if (!button) {
      return;
    }

    var card = button.closest("[data-component-id]");
    var componentId = Number(card.dataset.componentId);
    var component = state.components.find(function (item) { return item.id === componentId; });
    var next = (state.cart[componentId] || 0) + Number(button.dataset.quantityChange);
    state.cart[componentId] = Math.max(0, Math.min(componentMaximum(component), next));

    if (!state.cart[componentId]) {
      delete state.cart[componentId];
    }

    updateCartCounts();
    renderCatalog();
  });

  document.querySelector("[data-open-cart]").addEventListener("click", function () {
    renderCart();
    document.querySelector("[data-cart-error]").hidden = true;
    cartDialog.showModal();
  });
  document.querySelector("[data-cart-close]").addEventListener("click", function () { cartDialog.close(); });
  document.querySelector("[data-cart-items]").addEventListener("click", function (event) {
    var button = event.target.closest("[data-cart-remove]");

    if (button) {
      delete state.cart[button.dataset.cartRemove];
      updateCartCounts();
      renderCart();
      renderCatalog();
    }
  });
  document.querySelector("[data-submit-order]").addEventListener("click", async function (event) {
    var button = event.currentTarget;
    var errorElement = document.querySelector("[data-cart-error]");
    var items = Object.keys(state.cart).map(function (componentId) {
      return { componentId: Number(componentId), quantity: state.cart[componentId] };
    });
    errorElement.hidden = true;
    setBusy(button, true, "Reserving…");

    try {
      var result = await api("submit-order", { items: items });
      state.cart = {};
      updateCartCounts();
      cartDialog.close();
      await loadTeamData();
      teamTab("orders");
      openOrderReceipt(result.order);
      notify("Order #" + result.order.id + " is reserved and waiting for review.");
    } catch (error) {
      var details = error.details && error.details.items
        ? " " + error.details.items.map(function (item) { return item.message; }).join(" ")
        : "";
      errorElement.textContent = error.message + details;
      errorElement.hidden = false;
    } finally {
      setBusy(button, false);
    }
  });

  document.querySelector("[data-team-orders]").addEventListener("click", function (event) {
    var button = event.target.closest("[data-view-order]");

    if (button) {
      var order = state.dashboard.orders.find(function (item) { return item.id === Number(button.dataset.viewOrder); });
      openOrderReceipt(order);
    }
  });

  document.querySelectorAll("[data-admin-tab]").forEach(function (button) {
    button.addEventListener("click", function () { adminTab(button.dataset.adminTab); });
  });
  document.querySelector("[data-refresh-orders]").addEventListener("click", loadAdminOrders);
  document.querySelector("[data-admin-orders]").addEventListener("click", async function (event) {
    var actionButton = event.target.closest("button[data-claim-order], button[data-save-adjustments], button[data-mark-ready], button[data-confirm-pickup], button[data-cancel-order]");

    if (!actionButton) {
      return;
    }

    var orderId = Number(actionButton.dataset.claimOrder || actionButton.dataset.saveAdjustments || actionButton.dataset.markReady || actionButton.dataset.confirmPickup || actionButton.dataset.cancelOrder);
    var order = state.adminOrders.find(function (item) { return item.id === orderId; });

    try {
      if (actionButton.hasAttribute("data-claim-order")) {
        setBusy(actionButton, true, "Claiming…");
        await api("claim-order", { orderId: orderId });
        notify("Order #" + orderId + " is assigned to you.");
      } else if (actionButton.hasAttribute("data-save-adjustments")) {
        var card = actionButton.closest("[data-admin-order]");
        var items = order.items.map(function (item) {
          return {
            itemId: item.id,
            approvedQuantity: Number(card.querySelector('[data-adjust-quantity="' + item.id + '"]').value),
            reason: card.querySelector('[data-adjust-reason="' + item.id + '"]').value,
            note: card.querySelector('[data-adjust-note="' + item.id + '"]').value
          };
        });
        setBusy(actionButton, true, "Saving…");
        await api("adjust-order", { orderId: orderId, items: items });
        notify("Approved quantities saved.");
      } else if (actionButton.hasAttribute("data-mark-ready")) {
        if (!(await confirmAction("Mark Order #" + orderId + " ready?", "Confirm that every approved component has been physically prepared. Inventory remains reserved until pickup.", "Mark Ready"))) {
          return;
        }
        await api("mark-ready", { orderId: orderId });
        notify("Order #" + orderId + " is ready for pickup.");
      } else if (actionButton.hasAttribute("data-confirm-pickup")) {
        var total = order.items.reduce(function (sum, item) { return sum + item.approvedQuantity; }, 0);
        if (!(await confirmAction("Confirm pickup for Order #" + orderId + "?", "You are handing " + total + " component" + (total === 1 ? "" : "s") + " to " + order.teamName + ". This moves inventory from reserved to checked out.", "Confirm Pickup"))) {
          return;
        }
        await api("confirm-pickup", { orderId: orderId });
        notify("Pickup recorded for Order #" + orderId + ".");
      } else if (actionButton.hasAttribute("data-cancel-order")) {
        if (!(await confirmAction("Cancel Order #" + orderId + "?", "All reserved quantities in this order will be released back to available inventory.", "Cancel Order"))) {
          return;
        }
        await api("cancel-order", { orderId: orderId });
        notify("Order #" + orderId + " was cancelled.");
      }

      await Promise.all([loadAdminOrders(), loadAdminOverview()]);
    } catch (error) {
      notify(error.message);
      await loadAdminOrders().catch(function () {});
    } finally {
      setBusy(actionButton, false);
    }
  });

  var teamSearchTimer;
  document.querySelector("[data-team-search]").addEventListener("input", function () {
    window.clearTimeout(teamSearchTimer);
    teamSearchTimer = window.setTimeout(function () { loadTeams().catch(function (error) { notify(error.message); }); }, 220);
  });
  document.querySelector("[data-team-list]").addEventListener("click", function (event) {
    var button = event.target.closest("[data-select-team]");

    if (button) {
      loadTeamDetail(button.dataset.selectTeam).catch(function (error) { notify(error.message); });
    }
  });
  document.querySelector("[data-team-detail]").addEventListener("click", async function (event) {
    var returnButton = event.target.closest("[data-process-return]");
    var resetButton = event.target.closest("[data-reset-password]");
    var orderButton = event.target.closest("[data-view-admin-order]");

    try {
      if (returnButton) {
        var rows = Array.prototype.slice.call(document.querySelectorAll("[data-return-component]"));
        var items = rows.map(function (row) {
          return {
            componentId: Number(row.dataset.returnComponent),
            quantity: Number(row.querySelector("[data-return-quantity]").value),
            condition: row.querySelector("[data-return-condition]").value,
            note: row.querySelector("[data-return-note]").value
          };
        }).filter(function (item) { return item.quantity > 0; });

        if (!items.length) {
          notify("Enter a return quantity for at least one component.");
          return;
        }

        if (!(await confirmAction("Process this return?", "You are confirming that " + items.reduce(function (sum, item) { return sum + item.quantity; }, 0) + " component(s) were physically returned or finalized as missing.", "Process Return"))) {
          return;
        }

        setBusy(returnButton, true, "Processing…");
        var detail = await api("process-return", { teamId: Number(returnButton.dataset.processReturn), items: items });
        renderTeamDetail(detail);
        await loadTeams();
        notify("Return receipt created.");
      } else if (resetButton) {
        var password = window.prompt("Enter a new temporary password (at least 8 characters):");

        if (!password) {
          return;
        }

        await api("reset-team-password", { teamId: Number(resetButton.dataset.resetPassword), password: password });
        notify("Team password reset. Existing team sessions were signed out.");
      } else if (orderButton) {
        var result = await api("order", { orderId: Number(orderButton.dataset.viewAdminOrder) });
        openOrderReceipt(result.order);
      }
    } catch (error) {
      notify(error.message);
    } finally {
      if (returnButton) {
        setBusy(returnButton, false);
      }
    }
  });

  document.querySelector("[data-open-team-create]").addEventListener("click", function () { teamCreateDialog.showModal(); });
  document.querySelector("[data-team-create-form]").addEventListener("submit", async function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = form.querySelector("button[type=submit]");
    var errorElement = form.querySelector("[data-team-create-error]");
    errorElement.hidden = true;
    setBusy(button, true, "Creating…");

    try {
      await api("create-team", { name: form.name.value, identifier: form.identifier.value, username: form.username.value, password: form.password.value });
      form.reset();
      teamCreateDialog.close();
      await loadTeams();
      notify("Team credentials created.");
    } catch (error) {
      errorElement.textContent = error.message;
      errorElement.hidden = false;
    } finally {
      setBusy(button, false);
    }
  });

  var openComponentForm = function (component) {
    var form = document.querySelector("[data-component-form]");
    form.reset();
    form.id.value = component ? component.id : "";
    form.name.value = component ? component.name : "";
    form.description.value = component ? component.description : "";
    form.imageUrl.value = component ? component.imageUrl : "";
    form.category.value = component ? component.category : categories[0];
    form.compatibility.value = component ? component.compatibility : "Arduino + Raspberry Pi";
    form.totalQuantity.value = component ? component.totalQuantity : 0;
    form.unavailableQuantity.value = component ? component.unavailableQuantity : 0;
    form.maxActivePerTeam.value = component && component.maxActivePerTeam != null ? component.maxActivePerTeam : "";
    form.adminNotes.value = component ? component.adminNotes : "";
    form.active.checked = component ? component.active : true;
    form.querySelector("[data-component-form-title]").textContent = component ? "Edit " + component.name : "Add component";
    form.querySelector("[data-component-error]").hidden = true;
    componentDialog.showModal();
  };

  document.querySelector("[data-new-component]").addEventListener("click", function () { openComponentForm(null); });
  document.querySelector("[data-inventory-table]").addEventListener("click", function (event) {
    var button = event.target.closest("[data-edit-component]");

    if (button) {
      openComponentForm(state.components.find(function (component) { return component.id === Number(button.dataset.editComponent); }));
    }
  });
  document.querySelector("[data-component-form]").addEventListener("submit", async function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = form.querySelector("button[type=submit]");
    var errorElement = form.querySelector("[data-component-error]");
    var payload = {
      id: form.id.value ? Number(form.id.value) : null,
      name: form.name.value,
      description: form.description.value,
      imageUrl: form.imageUrl.value,
      category: form.category.value,
      compatibility: form.compatibility.value,
      totalQuantity: Number(form.totalQuantity.value),
      unavailableQuantity: Number(form.unavailableQuantity.value),
      maxActivePerTeam: form.maxActivePerTeam.value ? Number(form.maxActivePerTeam.value) : null,
      adminNotes: form.adminNotes.value,
      active: form.active.checked
    };
    errorElement.hidden = true;
    setBusy(button, true, "Saving…");

    try {
      if (payload.id && !(await confirmAction("Save inventory changes?", "Changing total or unavailable inventory affects live availability. Existing reservations and checkouts remain protected.", "Save Changes"))) {
        return;
      }

      await api("save-component", payload);
      componentDialog.close();
      await loadInventory();
      notify(payload.id ? "Component updated." : "Component added.");
    } catch (error) {
      errorElement.textContent = error.message;
      errorElement.hidden = false;
    } finally {
      setBusy(button, false);
    }
  });

  document.querySelectorAll("[data-dialog-close]").forEach(function (button) {
    button.addEventListener("click", function () { button.closest("dialog").close(); });
  });

  var categoryOptions = categories.map(function (category) {
    return '<option value="' + escapeHtml(category) + '">' + escapeHtml(category) + "</option>";
  }).join("");
  document.querySelector("[data-category-filter]").insertAdjacentHTML("beforeend", categoryOptions);
  document.querySelector("[data-component-form] select[name=category]").innerHTML = categoryOptions;

  window.setInterval(function () {
    if (state.dashboard.cooldownSeconds > 0) {
      state.dashboard.cooldownSeconds -= 1;
      renderCooldown();
    }
  }, 1000);

  initialize();
})();
