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
    var checklistPercent = checklistMeter ? checklistMeter.querySelector("[data-checklist-percent]") : null;
    var checklistSummary = checklistMeter ? checklistMeter.querySelector("[data-checklist-summary]") : null;
    var checklistRequiredBar = checklistMeter ? checklistMeter.querySelector("[data-checklist-bar-required]") : null;
    var checklistOptionalBar = checklistMeter ? checklistMeter.querySelector("[data-checklist-bar-optional]") : null;
    var checklistRequiredItems = checklistItems.filter(function (item) {
      return item.hasAttribute("data-checklist-required");
    });
    var checklistOptionalItems = checklistItems.filter(function (item) {
      return item.hasAttribute("data-checklist-optional");
    });
    var checklistCards = Array.prototype.slice.call(document.querySelectorAll(".checklist-card"));
    var checklistCompleteDialog = document.querySelector("[data-checklist-complete-dialog]");
    var checklistDialogMark = checklistCompleteDialog
      ? checklistCompleteDialog.querySelector("[data-checklist-dialog-mark]")
      : null;
    var checklistDialogPrompt = checklistCompleteDialog
      ? checklistCompleteDialog.querySelector("[data-checklist-dialog-prompt]")
      : null;
    var checklistDialogTitle = checklistCompleteDialog
      ? checklistCompleteDialog.querySelector("[data-checklist-dialog-title]")
      : null;
    var checklistDialogMessage = checklistCompleteDialog
      ? checklistCompleteDialog.querySelector("[data-checklist-dialog-message]")
      : null;
    var checklistRequiredShown = false;
    var checklistAllShown = false;
    var checklistCompletionTimer = null;
    var checklistScheduledMilestone = null;
    var checklistInteractionsReady = false;
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

    var showChecklistDialog = function (milestone) {
      var isAllComplete = milestone === "all";

      if (checklistDialogMark) {
        checklistDialogMark.textContent = isAllComplete ? "10/10" : "READY";
      }

      if (checklistDialogPrompt) {
        checklistDialogPrompt.textContent = isAllComplete ? "$ ./overachiever_mode.sh" : "$ ./ready_to_hack.sh";
      }

      if (checklistDialogTitle) {
        checklistDialogTitle.textContent = isAllComplete
          ? "WOW! You've done everything?"
          : "You're ready for the hackathon.";
      }

      if (checklistDialogMessage) {
        checklistDialogMessage.textContent = isAllComplete
          ? "What kind of project are you cooking up?!"
          : "All 3 mandatory items are complete. Please complete prerequisite trainings for any and all other machines you may wish to utilize.";
      }

      if (typeof checklistCompleteDialog.showModal === "function") {
        checklistCompleteDialog.showModal();
      } else {
        checklistCompleteDialog.setAttribute("open", "");
      }
    };

    var scheduleChecklistDialog = function (milestone) {
      if (checklistCompletionTimer) {
        window.clearTimeout(checklistCompletionTimer);
      }

      checklistScheduledMilestone = milestone;
      checklistCompletionTimer = window.setTimeout(function () {
        var requiredComplete = checklistRequiredItems.every(function (item) {
          return item.checked;
        });
        var allComplete = checklistItems.every(function (item) {
          return item.checked;
        });
        var shouldShow = milestone === "all" ? allComplete : requiredComplete && !allComplete;

        if (shouldShow) {
          showChecklistDialog(milestone);
        }

        checklistCompletionTimer = null;
        checklistScheduledMilestone = null;
      }, 900);
    };

    var updateChecklistProgress = function () {
      var completed = checklistItems.filter(function (item) {
        return item.checked;
      }).length;
      var requiredCompleted = checklistRequiredItems.filter(function (item) {
        return item.checked;
      }).length;
      var optionalCompleted = checklistOptionalItems.filter(function (item) {
        return item.checked;
      }).length;
      var percent = Math.round((completed / checklistItems.length) * 100);
      var requiredPercent = (requiredCompleted / checklistItems.length) * 100;
      var optionalPercent = (optionalCompleted / checklistItems.length) * 100;
      var requiredComplete = requiredCompleted === checklistRequiredItems.length;
      var allComplete = completed === checklistItems.length;

      if (checklistPercent) {
        checklistPercent.textContent = percent + "%";
        checklistPercent.setAttribute("data-text", percent + "%");
        checklistPercent.setAttribute("aria-label", percent + "%");
      }

      if (checklistSummary) {
        checklistSummary.textContent =
          requiredCompleted +
          "/" +
          checklistRequiredItems.length +
          " mandatory · " +
          optionalCompleted +
          "/" +
          checklistOptionalItems.length +
          " optional";
      }

      if (checklistRequiredBar) {
        checklistRequiredBar.style.width = requiredPercent + "%";
      }

      if (checklistOptionalBar) {
        checklistOptionalBar.style.width = optionalPercent + "%";
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

      if (checklistInteractionsReady && allComplete && !checklistAllShown && checklistCompleteDialog) {
        checklistAllShown = true;
        checklistRequiredShown = true;
        scheduleChecklistDialog("all");
      } else if (
        checklistInteractionsReady &&
        requiredComplete &&
        !checklistRequiredShown &&
        checklistCompleteDialog
      ) {
        checklistRequiredShown = true;
        scheduleChecklistDialog("required");
      } else if (
        checklistCompletionTimer &&
        ((checklistScheduledMilestone === "all" && !allComplete) ||
          (checklistScheduledMilestone === "required" && (!requiredComplete || allComplete)))
      ) {
        window.clearTimeout(checklistCompletionTimer);
        checklistCompletionTimer = null;
        checklistScheduledMilestone = null;
      }

      if (!requiredComplete) {
        checklistRequiredShown = false;
        checklistAllShown = false;
      } else if (!allComplete) {
        checklistAllShown = false;
      }
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
    checklistInteractionsReady = true;
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

  document.querySelectorAll(".judge-dialog, .team-dialog, .checklist-complete-dialog").forEach(function (dialog) {
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) {
        dialog.close();
      }
    });
  });

  var trackShowcase = document.querySelector("[data-track-mascots]");

  if (trackShowcase) {
    var trackCards = Array.prototype.slice.call(trackShowcase.querySelectorAll(".track-card"));
    var mascotPreview = trackShowcase.querySelector(".track-mascot-preview");
    var mascotPreviewImage = mascotPreview ? mascotPreview.querySelector("img") : null;
    var desktopTrackMedia = window.matchMedia("(min-width: 721px)");
    var mascotSwapTimeout;

    var clearTrackSelection = function () {
      trackCards.forEach(function (card) {
        card.classList.remove("is-active");

        if (card.hasAttribute("aria-expanded")) {
          card.setAttribute("aria-expanded", "false");
        }
      });
    };

    var updateMascotPreview = function (src, alt, key) {
      if (!mascotPreview || !mascotPreviewImage) {
        return;
      }

      mascotPreview.classList.remove("is-health", "is-nature");
      mascotPreviewImage.setAttribute("src", src);
      mascotPreviewImage.setAttribute("alt", alt);

      if (key) {
        mascotPreview.classList.add("is-" + key);
      }

      void mascotPreview.offsetWidth;
      mascotPreview.classList.add("is-visible");
    };

    var showTrackMascot = function (card) {
      var src = card.getAttribute("data-mascot-src");
      var alt = card.getAttribute("data-mascot-alt") || "";
      var key = card.getAttribute("data-mascot-key");

      if (!src) {
        return;
      }

      clearTrackSelection();
      void card.offsetWidth;
      card.classList.add("is-active");
      card.setAttribute("aria-expanded", "true");

      if (!mascotPreview || !mascotPreviewImage) {
        return;
      }

      window.clearTimeout(mascotSwapTimeout);

      if (!desktopTrackMedia.matches) {
        updateMascotPreview(src, alt, key);
        return;
      }

      if (mascotPreviewImage.getAttribute("src") === src) {
        mascotPreview.classList.add("is-visible");
        return;
      }

      mascotPreview.classList.remove("is-visible");

      if (!mascotPreviewImage.getAttribute("src")) {
        updateMascotPreview(src, alt, key);
        return;
      }

      mascotSwapTimeout = window.setTimeout(function () {
        updateMascotPreview(src, alt, key);
      }, 240);
    };

    trackCards.forEach(function (card) {
      card.addEventListener("mouseenter", function () {
        showTrackMascot(card);
      });

      card.addEventListener("focus", function () {
        showTrackMascot(card);
      });

      card.addEventListener("click", function () {
        showTrackMascot(card);
      });

      card.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          showTrackMascot(card);
        }
      });
    });
  }

  var glitchTitle = document.querySelector(".glitch-title");

  if (glitchTitle) {
    var glitchBase = glitchTitle.querySelector(".glitch-base");
    var glitchIcons = ["health", "leaf", "bulb"];
    var glitchIndex = 0;
    var glitchDuration = 1350;
    var glitchTimeout;

    if (glitchBase && !glitchTitle.querySelector(".glitch-slice")) {
      ["top", "bottom"].forEach(function (sliceName) {
        var glitchSlice = glitchBase.cloneNode(true);
        glitchSlice.classList.remove("glitch-base");
        glitchSlice.classList.add("glitch-slice", "glitch-slice-" + sliceName);
        glitchSlice.setAttribute("aria-hidden", "true");
        glitchTitle.appendChild(glitchSlice);
      });
    }

    var triggerTitleGlitch = function () {
      window.clearTimeout(glitchTimeout);
      glitchTitle.classList.remove("is-glitching");
      glitchTitle.setAttribute("data-glitch-icon", glitchIcons[glitchIndex % glitchIcons.length]);
      void glitchTitle.offsetWidth;
      glitchTitle.classList.add("is-glitching");
      glitchIndex += 1;

      glitchTimeout = window.setTimeout(function () {
        glitchTitle.classList.remove("is-glitching");
        glitchTitle.removeAttribute("data-glitch-icon");
      }, glitchDuration);
    };

    window.setInterval(triggerTitleGlitch, 10000);
  }
})();
