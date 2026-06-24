(function () {
  var countdown = document.querySelector("[data-countdown]");

  if (countdown) {
    var target = new Date(countdown.getAttribute("data-countdown"));
    var fields = {
      days: countdown.querySelector('[data-countdown-value="days"]'),
      hours: countdown.querySelector('[data-countdown-value="hours"]'),
      minutes: countdown.querySelector('[data-countdown-value="minutes"]'),
      seconds: countdown.querySelector('[data-countdown-value="seconds"]')
    };

    var pad = function (value, size) {
      return String(value).padStart(size, "0");
    };

    var renderCountdown = function () {
      var distance = target.getTime() - Date.now();

      if (Number.isNaN(target.getTime())) {
        return;
      }

      if (distance <= 0) {
        fields.days.textContent = "000";
        fields.hours.textContent = "00";
        fields.minutes.textContent = "00";
        fields.seconds.textContent = "00";
        return;
      }

      var seconds = Math.floor(distance / 1000);
      var days = Math.floor(seconds / 86400);
      var hours = Math.floor((seconds % 86400) / 3600);
      var minutes = Math.floor((seconds % 3600) / 60);
      var remainingSeconds = seconds % 60;

      fields.days.textContent = pad(days, 3);
      fields.hours.textContent = pad(hours, 2);
      fields.minutes.textContent = pad(minutes, 2);
      fields.seconds.textContent = pad(remainingSeconds, 2);
    };

    renderCountdown();
    window.setInterval(renderCountdown, 1000);
  }

  var checklistItems = Array.prototype.slice.call(document.querySelectorAll("[data-checklist-item]"));

  if (checklistItems.length) {
    var checklistMeter = document.querySelector(".checklist-meter");
    var checklistPercent = checklistMeter ? checklistMeter.querySelector("strong") : null;
    var checklistBar = checklistMeter ? checklistMeter.querySelector(".meter-track i") : null;
    var checklistCards = Array.prototype.slice.call(document.querySelectorAll(".checklist-card"));
    var storagePrefix = "makecu-checklist:" + window.location.pathname + ":";

    var setStoredValue = function (key, value) {
      try {
        window.localStorage.setItem(key, value ? "1" : "0");
      } catch (error) {
        return;
      }
    };

    var getStoredValue = function (key) {
      try {
        return window.localStorage.getItem(key);
      } catch (error) {
        return null;
      }
    };

    var updateChecklistProgress = function () {
      var completed = checklistItems.filter(function (item) {
        return item.checked;
      }).length;
      var percent = Math.round((completed / checklistItems.length) * 100);

      if (checklistPercent) {
        checklistPercent.textContent = percent + "%";
      }

      if (checklistBar) {
        checklistBar.style.width = percent + "%";
      }

      checklistCards.forEach(function (card) {
        var cardItems = Array.prototype.slice.call(card.querySelectorAll("[data-checklist-item]"));
        var cardCompleted = cardItems.filter(function (item) {
          return item.checked;
        }).length;
        var cardCounter = card.querySelector(".checklist-card-header span");

        if (cardCounter) {
          cardCounter.textContent = cardCompleted + "/" + cardItems.length;
        }
      });
    };

    checklistItems.forEach(function (item) {
      var key = storagePrefix + item.id;
      var savedValue = getStoredValue(key);
      var row = item.closest("li");

      if (savedValue === "1") {
        item.checked = true;
      }

      if (row) {
        row.classList.toggle("is-complete", item.checked);
      }

      item.addEventListener("change", function () {
        setStoredValue(key, item.checked);

        if (row) {
          row.classList.toggle("is-complete", item.checked);
        }

        updateChecklistProgress();
      });
    });

    updateChecklistProgress();
  }

  document.querySelectorAll("[data-dialog-target]").forEach(function (trigger) {
    var dialog = document.getElementById(trigger.getAttribute("data-dialog-target"));

    if (!dialog) {
      return;
    }

    trigger.addEventListener("click", function () {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    });
  });

  document.querySelectorAll("[data-dialog-close]").forEach(function (button) {
    button.addEventListener("click", function () {
      var dialog = button.closest("dialog");

      if (dialog) {
        dialog.close();
      }
    });
  });

  document.querySelectorAll(".judge-dialog").forEach(function (dialog) {
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) {
        dialog.close();
      }
    });
  });

  var glitchTitle = document.querySelector(".glitch-title");

  if (glitchTitle) {
    var glitchIcons = ["health", "leaf", "bulb"];
    var glitchIndex = 0;
    var glitchDuration = 1800;

    var triggerTitleGlitch = function () {
      glitchTitle.setAttribute("data-glitch-icon", glitchIcons[glitchIndex % glitchIcons.length]);
      glitchTitle.classList.add("is-glitching");
      glitchIndex += 1;

      window.setTimeout(function () {
        glitchTitle.classList.remove("is-glitching");
        glitchTitle.removeAttribute("data-glitch-icon");
      }, glitchDuration);
    };

    window.setInterval(triggerTitleGlitch, 10000);
  }
})();
