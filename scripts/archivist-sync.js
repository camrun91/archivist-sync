/**
 * Archivist Sync Module for Foundry VTT v13
 *
 * A comprehensive module for synchronizing world data with the Archivist API.
 * This is the main orchestrator that coordinates all module components.
 */

// Import all module components
import { CONFIG } from "./modules/config.js";
import { settingsManager } from "./modules/settings-manager.js";
import { archivistApi } from "./services/archivist-api.js";
import { Utils } from "./modules/utils.js";
import { linkIndexer } from "./modules/links/indexer.js";
import { AskChatWindow } from "./dialogs/ask-chat-window.js";
import AskChatSidebarTab from "./sidebar/ask-chat-sidebar-tab.js";
import { ensureChatSlot } from "./sidebar/ask-chat-tab.js";
import { SyncDialog } from "./dialogs/sync-dialog.js";
import { WorldSetupDialog } from "./dialogs/world-setup-dialog.js";
// import { openV2SheetFor } from './modules/sheets/v2-sheets.js';
import { LinkHelpers } from "./modules/links/helpers.js";

/**
 * Initialize the module when Foundry VTT is ready
 */

Hooks.once("init", async function () {
  try {
    console.log("[Archivist Sync] init");
  } catch (_) {}
  // Register settings as early as possible so other early hooks can read them
  try {
    settingsManager.registerSettings?.();
  } catch (e) {
    console.warn(
      "[Archivist Sync] Settings registration failed during init",
      e
    );
  }
  // Register custom Journal sheets (v13)
  // Disable V1 DocumentSheet registrations in favor of V2 apps
  // (We rely on directory and TOC intercepts to open V2 sheets.)
  try {
    /* intentionally not registering V1 sheets */
  } catch (e) {
    console.warn(
      "[Archivist Sync] Sheet registration skipped; using V2 sheets only",
      e
    );
  }

  // Register JournalEntry sheet classes with the core sheet registry (V2 DocumentSheet)
  try {
    const {
      EntryPageSheetV2,
      PCPageSheetV2,
      NPCPageSheetV2,
      CharacterPageSheetV2,
      ItemPageSheetV2,
      LocationPageSheetV2,
      FactionPageSheetV2,
      RecapPageSheetV2,
    } = await import("./modules/sheets/page-sheet-v2.js");

    const DSC =
      foundry?.applications?.apps?.DocumentSheetConfig || DocumentSheetConfig;
    DSC.registerSheet(JournalEntry, "archivist-sync", EntryPageSheetV2, {
      label: "Archivist: Entry",
      types: ["base"],
      makeDefault: false,
    });
    DSC.registerSheet(JournalEntry, "archivist-sync", PCPageSheetV2, {
      label: "Archivist: PC",
      types: ["base"],
      makeDefault: false,
    });
    DSC.registerSheet(JournalEntry, "archivist-sync", NPCPageSheetV2, {
      label: "Archivist: NPC",
      types: ["base"],
      makeDefault: false,
    });
    DSC.registerSheet(JournalEntry, "archivist-sync", ItemPageSheetV2, {
      label: "Archivist: Item",
      types: ["base"],
      makeDefault: false,
    });
    DSC.registerSheet(JournalEntry, "archivist-sync", LocationPageSheetV2, {
      label: "Archivist: Location",
      types: ["base"],
      makeDefault: false,
    });
    DSC.registerSheet(JournalEntry, "archivist-sync", FactionPageSheetV2, {
      label: "Archivist: Faction",
      types: ["base"],
      makeDefault: false,
    });
    DSC.registerSheet(JournalEntry, "archivist-sync", RecapPageSheetV2, {
      label: "Archivist: Recap",
      types: ["base"],
      makeDefault: false,
    });
  } catch (e) {
    console.error(
      "[Archivist Sync] Failed to register V2 DocumentSheet sheets",
      e
    );
  }
  // Register the Archivist Chat tab with the core Sidebar early so it renders its
  // nav button and panel using the Application V2 TabGroup. Availability will be
  // handled at runtime by showing/hiding the button and panel.
  try {
    const Sidebar = foundry.applications.sidebar?.Sidebar;
    if (Sidebar) {
      const label =
        game.i18n?.localize?.("ARCHIVIST_SYNC.Menu.AskChat.Label") ||
        "Archivist Chat";
      Sidebar.TABS = Sidebar.TABS || {};
      Sidebar.TABS["archivist-chat"] = {
        id: "archivist-chat",
        title: label,
        icon: "fa-solid fa-sparkles",
        group: "primary",
        tooltip: label,
        tab: AskChatSidebarTab,
        app: AskChatSidebarTab,
      };
    }
  } catch (_) {
    /* no-op */
  }
});

Hooks.once("setup", function () {
  try {
    console.log("[Archivist Sync] setup");
  } catch (_) {}
  // Ensure registration also occurs here in case Sidebar wasn't ready during init
  try {
    const Sidebar = foundry.applications.sidebar?.Sidebar;
    if (Sidebar) {
      const label =
        game.i18n?.localize?.("ARCHIVIST_SYNC.Menu.AskChat.Label") ||
        "Archivist Chat";
      Sidebar.TABS = Sidebar.TABS || {};
      Sidebar.TABS["archivist-chat"] = Sidebar.TABS["archivist-chat"] || {
        id: "archivist-chat",
        title: label,
        icon: "fa-solid fa-sparkles",
        group: "primary",
        tooltip: label,
        tab: AskChatSidebarTab,
        app: AskChatSidebarTab,
      };
    }
  } catch (_) {
    /* no-op */
  }
});

// Register Scene Controls immediately (outside ready) so it's available on reloads
// Scene control buttons no longer used; Hub removed

Hooks.once("ready", async function () {
  console.log("[Archivist Sync] ready: begin");
  console.log(
    "[Archivist Sync] ready - sidebar exists:",
    !!document.getElementById("sidebar")
  );
  const sidebarCheck = document.getElementById("sidebar");
  const tabsNavCheck = sidebarCheck?.querySelector?.("#sidebar-tabs, nav.tabs");
  console.log("[Archivist Sync] ready - tabsNav exists:", !!tabsNavCheck);
  try {
    if (!document.getElementById("sidebar")) {
      console.log(
        "[Archivist Sync] ready - sidebar not found, attempting to render"
      );
      await ui.sidebar?.render?.();
    }
  } catch (e) {
    console.error("[Archivist Sync] ready - error rendering sidebar:", e);
  }

  // INTERCEPT sidebar.collapse() to see who's calling it
  const originalSidebarCollapse = ui.sidebar?.collapse;
  if (
    originalSidebarCollapse &&
    typeof originalSidebarCollapse === "function"
  ) {
    ui.sidebar.collapse = function () {
      const stack = new Error().stack;
      // Check if this might be related to a dice roll click
      const hasDiceRollInStack =
        stack.includes("dice") ||
        stack.includes("roll") ||
        stack.includes("chat");
      if (hasDiceRollInStack) {
        console.warn("[Archivist Sync] ===== sidebar.collapse() CALLED! =====");
        console.warn("[Archivist Sync] Stack trace:", stack);
        console.warn(
          "[Archivist Sync] This might be collapsing the dice roll card!"
        );
      }
      return originalSidebarCollapse.call(this);
    };
  }

  // CRITICAL FIX: Ensure CoC7 dice roll cards stay expanded after clicking
  // CoC7's handler uses preventDefault() correctly - we should not intercept it
  // Instead, we monitor for any attempts to hide .card-buttons and immediately restore them

  // Monitor for class changes on dice roll cards that might indicate collapse
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "class"
      ) {
        const target = mutation.target;
        const isDiceRoll = target?.closest?.(
          ".chat-card, .roll-card, .card-buttons, .dice-roll, .dice-result, .dice-formula, .roll-result"
        );
        if (isDiceRoll) {
          const oldClass = mutation.oldValue || "";
          const newClass = target.className || "";
          // Check if a collapse-related class was added
          if (
            newClass.includes("collapsed") ||
            newClass.includes("folded") ||
            (oldClass.includes("expanded") && !newClass.includes("expanded"))
          ) {
            console.warn(
              "[Archivist Sync] ===== DICE ROLL CARD CLASS CHANGED (might be collapsing) ====="
            );
            console.warn("[Archivist Sync] Old class:", oldClass);
            console.warn("[Archivist Sync] New class:", newClass);
            console.warn("[Archivist Sync] Stack trace:", new Error().stack);
          }
        }
      }

      // Also watch for style changes on card-buttons that might hide them
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "style"
      ) {
        const target = mutation.target;
        if (target.classList?.contains("card-buttons")) {
          const display = window.getComputedStyle(target).display;
          if (display === "none") {
            console.warn(
              "[Archivist Sync] ===== CARD BUTTONS DISPLAY SET TO NONE - PREVENTING! ====="
            );
            // Prevent the buttons from being hidden
            target.style.display = "";
            target.style.visibility = "";
            target.style.opacity = "";
          }
        }
      }
    });
  });

  // Observe all dice roll cards in the chat log
  const observeChatLog = () => {
    const chatLog = document.querySelector(".chat-log, #chat .chat-log");
    if (chatLog) {
      observer.observe(chatLog, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ["class", "style"], // Watch both class and style changes
      });
      console.log(
        "[Archivist Sync] Started observing chat log for dice roll card changes"
      );
    }
  };

  // Start observing when ready
  observeChatLog();

  // Also observe if chat log is added later
  const chatLogObserver = new MutationObserver(() => {
    const chatLog = document.querySelector(".chat-log, #chat .chat-log");
    if (chatLog && !chatLog.dataset.archivistObserved) {
      chatLog.dataset.archivistObserved = "true";
      observeChatLog();
    }
  });

  chatLogObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // CRITICAL FIX: Monitor what's actually changing when dice roll cards collapse
  // CoC7's handler toggles .dice-tooltip visibility, but we need to see what else is changing
  // Monitor the entire card, dice-tooltip, and card-buttons to understand the collapse
  // Track when we're making changes to prevent infinite loops
  const ourChanges = new WeakSet();

  // Track recent clicks on dice-roll elements to know if we're expanding
  const recentDiceRollClicks = new WeakMap();

  // Track recent collapse clicks to prevent slideDown after intentional collapse
  const recentCollapseClicks = new WeakMap();

  // Track processed click events to prevent double-handling
  const processedClicks = new WeakSet();

  // Intercept jQuery's slideUp to prevent collapsing tooltips that should be expanded
  const installSlideUpInterceptor = () => {
    if (
      window.jQuery &&
      window.jQuery.fn &&
      !window.jQuery.fn.slideUp._archivistIntercepted
    ) {
      const originalSlideUp = window.jQuery.fn.slideUp;

      window.jQuery.fn.slideUp = function (...args) {
        // Check each element in the jQuery set
        let shouldPrevent = false;
        let preventedCount = 0;
        const preventedElements = [];

        this.each((index, element) => {
          if (
            element &&
            element.classList &&
            element.classList.contains("dice-tooltip")
          ) {
            const message = element.closest?.(".message");
            const messageId = message?.dataset?.messageId;

            if (messageId) {
              const msg = game.messages.get(messageId);
              const hasExpanded = element.classList.contains("expanded");
              const display = window.getComputedStyle(element).display;
              const height = element.offsetHeight;
              const isVisible = display !== "none" && height > 10;

              console.warn(
                `[Archivist Sync] ===== slideUp CALLED on tooltip! =====`,
                `messageId: ${messageId}, hasExpanded: ${hasExpanded}, display: ${display}, height: ${height}px, isVisible: ${isVisible}, _rollExpanded: ${msg?._rollExpanded}`
              );

              // Check if this was recently clicked to expand
              const clickTime = msg ? recentDiceRollClicks.get(msg) : null;
              const wasRecentlyClicked = clickTime !== undefined;
              const timeSinceClick = wasRecentlyClicked
                ? Date.now() - clickTime
                : Infinity;

              // Only prevent slideUp if:
              // 1. Tooltip was recently clicked to expand (within 400ms), AND
              // 2. Tooltip is currently visible (has expanded class OR is actually visible)
              // We check visibility, not just the class, because CoC7 may have removed the class incorrectly
              // This prevents accidental collapse right after expanding, but allows intentional collapse
              const shouldPreventSlideUp =
                wasRecentlyClicked &&
                timeSinceClick < 400 &&
                (hasExpanded || isVisible); // Check class OR visibility

              if (shouldPreventSlideUp) {
                shouldPrevent = true;
                preventedCount++;
                preventedElements.push({
                  messageId,
                  hasExpanded,
                  _rollExpanded: msg?._rollExpanded,
                  wasRecentlyClicked,
                  timeSinceClick,
                });

                console.warn(
                  `[Archivist Sync] ===== PREVENTED slideUp on expanded tooltip! =====`,
                  `messageId: ${messageId}, hasExpanded: ${hasExpanded}, _rollExpanded: ${msg?._rollExpanded}, wasRecentlyClicked: ${wasRecentlyClicked}, timeSinceClick: ${timeSinceClick}ms`
                );

                // Stop any ongoing animation by stopping the queue and clearing inline styles
                const $el = window.jQuery(element);
                $el.stop(true, true); // Stop all animations and jump to end

                // Ensure it stays visible and expanded
                element.classList.add("expanded");
                if (msg) msg._rollExpanded = true;

                // Force it to be visible
                element.style.display = "";
                element.style.height = "";
                element.style.overflow = "";
              } else {
                // Allow normal slideUp - user is intentionally collapsing or enough time has passed
                // Only log if it was recently clicked but we're still allowing it (for debugging)
                if (wasRecentlyClicked && timeSinceClick < 400) {
                  console.log(
                    `[Archivist Sync] Allowing slideUp (protection expired or user collapsing) - messageId: ${messageId}, _rollExpanded: ${msg?._rollExpanded}, timeSinceClick: ${timeSinceClick}ms`
                  );
                }
              }
            }
          }
        });

        // If we prevented the slideUp, return the jQuery object without calling original
        if (shouldPrevent) {
          console.warn(
            `[Archivist Sync] Prevented slideUp on ${preventedCount} tooltip(s):`,
            preventedElements.map((e) => e.messageId).join(", ")
          );
          return this;
        }

        // For non-tooltip elements or tooltips that should collapse, call original
        return originalSlideUp.apply(this, args);
      };

      // Mark as intercepted so we don't install multiple times
      window.jQuery.fn.slideUp._archivistIntercepted = true;
      console.log("[Archivist Sync] jQuery slideUp interceptor installed");
    }
  };

  // Intercept jQuery's slideDown to prevent re-expansion after intentional collapse
  const installSlideDownInterceptor = () => {
    if (
      window.jQuery &&
      window.jQuery.fn &&
      !window.jQuery.fn.slideDown._archivistIntercepted
    ) {
      const originalSlideDown = window.jQuery.fn.slideDown;

      window.jQuery.fn.slideDown = function (...args) {
        // Check each element in the jQuery set
        let shouldPrevent = false;
        let preventedCount = 0;
        const preventedElements = [];

        this.each((index, element) => {
          if (
            element &&
            element.classList &&
            element.classList.contains("dice-tooltip")
          ) {
            const message = element.closest?.(".message");
            const messageId = message?.dataset?.messageId;

            if (messageId) {
              const msg = game.messages.get(messageId);

              // Check if user just collapsed (tracked collapse click)
              const collapseTime = msg ? recentCollapseClicks.get(msg) : null;
              const wasRecentlyCollapsed = collapseTime !== undefined;
              const timeSinceCollapse = wasRecentlyCollapsed
                ? Date.now() - collapseTime
                : Infinity;

              // Check if user recently clicked to expand (might be expanding)
              const expandTime = msg ? recentDiceRollClicks.get(msg) : null;
              const wasRecentlyClickedToExpand = expandTime !== undefined;
              const timeSinceExpand = wasRecentlyClickedToExpand
                ? Date.now() - expandTime
                : Infinity;

              // Check if tooltip is currently collapsed (height < 10px)
              const height = element.offsetHeight;
              const display = window.getComputedStyle(element).display;
              const isCollapsed = display === "none" || height < 10;

              console.warn(
                `[Archivist Sync] ===== slideDown CALLED on tooltip! =====`,
                `messageId: ${messageId}, isCollapsed: ${isCollapsed}, height: ${height}px, display: ${display}`,
                `wasRecentlyCollapsed: ${wasRecentlyCollapsed}, timeSinceCollapse: ${timeSinceCollapse}ms`,
                `wasRecentlyClickedToExpand: ${wasRecentlyClickedToExpand}, timeSinceExpand: ${timeSinceExpand}ms`
              );

              // Prevent slideDown if:
              // 1. User recently collapsed (within 400ms), AND
              // 2. User did NOT recently click to expand (no expand protection window active)
              //
              // Note: We don't check if tooltip is currently collapsed because CoC7 calls
              // slideDown immediately after slideUp starts, before the collapse animation completes.
              // So we prevent based solely on the recent collapse click, not visual state.
              const shouldPreventSlideDown =
                wasRecentlyCollapsed &&
                timeSinceCollapse < 400 &&
                !wasRecentlyClickedToExpand;

              if (shouldPreventSlideDown) {
                shouldPrevent = true;
                preventedCount++;
                preventedElements.push({
                  messageId,
                  isCollapsed,
                  wasRecentlyCollapsed,
                  timeSinceCollapse,
                  wasRecentlyClickedToExpand,
                  timeSinceExpand,
                });

                console.warn(
                  `[Archivist Sync] ===== PREVENTED slideDown after collapse! =====`,
                  `messageId: ${messageId}, isCollapsed: ${isCollapsed}, wasRecentlyClickedToExpand: ${wasRecentlyClickedToExpand}, height: ${height}px`
                );

                // Don't call original - just return the jQuery object
                return;
              }
            }
          }
        });

        // If we prevented the slideDown, return the jQuery object without calling original
        if (shouldPrevent) {
          console.warn(
            `[Archivist Sync] Prevented slideDown on ${preventedCount} tooltip(s):`,
            preventedElements.map((e) => e.messageId).join(", ")
          );
          return this;
        }

        // For non-tooltip elements or tooltips that should expand, call original
        return originalSlideDown.apply(this, args);
      };

      // Mark as intercepted so we don't install multiple times
      window.jQuery.fn.slideDown._archivistIntercepted = true;
      console.log("[Archivist Sync] jQuery slideDown interceptor installed");
    }
  };

  // Try to install immediately if jQuery is already loaded
  if (window.jQuery) {
    installSlideUpInterceptor();
    installSlideDownInterceptor();
  } else {
    // Also try on ready hook in case jQuery loads later
    Hooks.once("ready", () => {
      installSlideUpInterceptor();
      installSlideDownInterceptor();
    });
  }

  const cardObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      const target = mutation.target;
      const isDiceRollCard = target.closest?.(
        ".chat-card.roll-card, .roll-card"
      );

      if (!isDiceRollCard) return;

      // Skip if this is a change we made ourselves
      if (ourChanges.has(target)) {
        ourChanges.delete(target);
        return;
      }

      // Skip if element is marked as protected by our module (unless it's being removed)
      if (
        target.dataset?.archivistProtected === "true" &&
        mutation.type === "attributes"
      ) {
        // Only skip if we're not trying to protect it again
        const attrName = mutation.attributeName;
        if (attrName === "class" && target.classList.contains("expanded")) {
          // If expanded class is present and we're protecting it, allow the change to be logged but don't interfere
          console.log(
            `[Archivist Sync] Protected element change detected: ${target.tagName}.${target.className || ""} (${attrName})`
          );
        }
      }

      // Log all changes to understand what's happening
      if (mutation.type === "attributes") {
        const attrName = mutation.attributeName;
        const oldValue = mutation.oldValue;
        const newValue =
          attrName === "style"
            ? target.style.cssText
            : attrName === "class"
              ? target.className
              : target.getAttribute(attrName);

        // Only log if it's a significant change
        if (attrName === "style" && oldValue !== newValue) {
          const display = window.getComputedStyle(target).display;
          const height = window.getComputedStyle(target).height;
          console.warn(
            `[Archivist Sync] STYLE CHANGE on ${target.tagName}.${target.className || ""}:`,
            `display=${display}, height=${height}`,
            `oldValue=${oldValue?.substring(0, 50)}`,
            `newValue=${newValue?.substring(0, 50)}`
          );
        } else if (attrName === "class" && oldValue !== newValue) {
          console.warn(
            `[Archivist Sync] CLASS CHANGE on ${target.tagName}.${target.className || ""}:`,
            `oldValue=${oldValue}`,
            `newValue=${newValue}`
          );
        }

        // If dice-tooltip's expanded class is being removed, prevent it if tooltip is currently visible
        if (
          target.classList?.contains("dice-tooltip") &&
          attrName === "class"
        ) {
          const oldValue = mutation.oldValue || "";
          const newValue = target.className || "";
          // Check if expanded class was removed
          if (oldValue.includes("expanded") && !newValue.includes("expanded")) {
            const height = window.getComputedStyle(target).height;
            const display = window.getComputedStyle(target).display;
            const offsetHeight = target.offsetHeight;

            const message = target.closest?.(".message");
            const messageId = message?.dataset?.messageId;
            const msg = messageId ? game.messages.get(messageId) : null;
            const wasRecentlyClicked = msg && recentDiceRollClicks.has(msg);
            const timeSinceClick = wasRecentlyClicked
              ? Date.now() - recentDiceRollClicks.get(msg)
              : Infinity;

            console.warn(
              `[Archivist Sync] ===== EXPANDED CLASS REMOVED! =====`,
              `display=${display}, height=${height}, offsetHeight=${offsetHeight}`,
              `oldValue="${oldValue}", newValue="${newValue}"`,
              `messageId=${messageId || "unknown"}, wasRecentlyClicked=${wasRecentlyClicked}, timeSinceClick=${timeSinceClick}ms`,
              `message._rollExpanded=${msg?._rollExpanded}`
            );

            // Prevent removal if:
            // 1. User recently clicked to expand (within last 300ms) AND tooltip is currently visible, OR
            // 2. User recently clicked to expand (within last 300ms) AND message flag says it should be expanded
            // If user is collapsing (no recent click), allow the class removal even if flag/height suggest expanded
            const shouldPrevent =
              (wasRecentlyClicked &&
                timeSinceClick < 300 &&
                display !== "none" &&
                (parseFloat(height) > 50 || offsetHeight > 50)) ||
              (wasRecentlyClicked &&
                timeSinceClick < 300 &&
                msg?._rollExpanded === true);

            if (shouldPrevent) {
              // Mark this as our change to prevent infinite loops
              ourChanges.add(target);

              // Mark element as protected by our module
              target.dataset.archivistProtected = "true";

              // Temporarily disconnect observer to prevent our change from triggering it
              cardObserver.disconnect();

              target.classList.add("expanded");

              // Also ensure the message flag is set to expanded
              const message = target.closest?.(".message");
              const messageId = message?.dataset?.messageId;
              if (messageId) {
                const msg = game.messages.get(messageId);
                if (msg) {
                  msg._rollExpanded = true;
                  // Mark message as protected too
                  if (message) message.dataset.archivistProtected = "true";
                  console.warn(
                    `[Archivist Sync] ✓ PREVENTED expanded class removal - tooltip is visible (messageId: ${messageId}, height: ${offsetHeight}px)`
                  );
                }
              }

              // Reconnect observer after a brief delay
              setTimeout(() => {
                const actualCard = target.closest?.(
                  ".chat-card.roll-card, .roll-card"
                );
                if (actualCard) {
                  cardObserver.observe(actualCard, {
                    attributes: true,
                    attributeFilter: ["style", "class"],
                    attributeOldValue: true,
                    subtree: true,
                  });
                }
              }, 10);
            } else {
              console.warn(
                `[Archivist Sync] Allowing expanded class removal - tooltip is not visible (height: ${offsetHeight}px), wasRecentlyClicked=${wasRecentlyClicked}, timeSinceClick=${timeSinceClick}ms, message._rollExpanded=${msg?._rollExpanded}`
              );
            }
          }
        }

        // If dice-tooltip is being hidden via style, prevent it if it should be expanded
        if (
          target.classList?.contains("dice-tooltip") &&
          attrName === "style"
        ) {
          const display = window.getComputedStyle(target).display;
          if (display === "none") {
            // Check if tooltip has expanded class or if message is marked as expanded
            const hasExpanded = target.classList.contains("expanded");
            const message = target.closest?.(".message");
            const messageId = message?.dataset?.messageId;
            const msg = messageId ? game.messages.get(messageId) : null;

            // Check if user is intentionally collapsing (no recent click to expand)
            const clickTime = msg ? recentDiceRollClicks.get(msg) : null;
            const wasRecentlyClickedToExpand = clickTime !== undefined;
            const timeSinceClick = wasRecentlyClickedToExpand
              ? Date.now() - clickTime
              : Infinity;

            // Only prevent hiding if:
            // 1. User recently clicked to expand (within 400ms), AND
            // 2. Message flag says it should be expanded OR it has the expanded class
            // If user is collapsing (no recent click), allow the hide
            let shouldBeExpanded = false;
            let reason = "";

            if (wasRecentlyClickedToExpand && timeSinceClick < 400) {
              // User clicked to expand recently - check if it should be expanded
              shouldBeExpanded = hasExpanded || msg?._rollExpanded === true;
              reason = shouldBeExpanded
                ? hasExpanded
                  ? "has expanded class and was recently clicked to expand"
                  : "message._rollExpanded is true and was recently clicked to expand"
                : "was recently clicked but flag/class indicate collapse";
            } else {
              // No recent click or click was for collapse - allow hiding
              shouldBeExpanded = false;
              reason = wasRecentlyClickedToExpand
                ? "click was for collapse (protection window expired or cleared)"
                : "no recent click to expand - allowing collapse";
            }

            console.warn(
              `[Archivist Sync] ===== DICE-TOOLTIP BEING HIDDEN! =====`,
              `display=${display}, hasExpanded=${hasExpanded}, shouldBeExpanded=${shouldBeExpanded}`,
              `reason=${reason}, messageId=${messageId || "unknown"}, wasRecentlyClicked=${wasRecentlyClickedToExpand}, timeSinceClick=${timeSinceClick}ms`
            );

            if (shouldBeExpanded) {
              // Mark this as our change to prevent infinite loops
              ourChanges.add(target);

              // Mark element as protected by our module
              target.dataset.archivistProtected = "true";

              // Temporarily disconnect observer to prevent our change from triggering it
              cardObserver.disconnect();

              // Re-show the tooltip and ensure expanded class is present
              target.style.display = "";
              target.classList.add("expanded");

              const message = target.closest?.(".message");
              if (messageId) {
                const msg = game.messages.get(messageId);
                if (msg) {
                  msg._rollExpanded = true;
                  // Mark message as protected too
                  if (message) message.dataset.archivistProtected = "true";
                }
              }

              console.warn(
                `[Archivist Sync] ✓ PREVENTED dice-tooltip from being hidden - should be expanded (messageId: ${
                  messageId || "unknown"
                }, reason: ${reason})`
              );

              // Reconnect observer after a brief delay
              setTimeout(() => {
                const actualCard = target.closest?.(
                  ".chat-card.roll-card, .roll-card"
                );
                if (actualCard) {
                  cardObserver.observe(actualCard, {
                    attributes: true,
                    attributeFilter: ["style", "class"],
                    attributeOldValue: true,
                    subtree: true,
                  });
                }
              }, 10);
            } else {
              console.warn(
                `[Archivist Sync] Allowing dice-tooltip to be hidden - not expanded (reason: ${reason})`
              );
            }
          }
        }

        // If card-buttons are being hidden, restore them
        if (
          target.classList?.contains("card-buttons") &&
          attrName === "style"
        ) {
          const display = window.getComputedStyle(target).display;
          if (display === "none") {
            target.style.display = "";
            console.warn(
              `[Archivist Sync] Re-showed card-buttons that were hidden`
            );
          }
        }
      }
    });
  });

  // Helper to check and log the state of a dice roll card
  const checkCardState = (cardElement, label) => {
    const cardButtons = cardElement.querySelector?.(".card-buttons");
    const diceTooltips = cardElement.querySelectorAll?.(".dice-tooltip");
    const cardDisplay = window.getComputedStyle(cardElement).display;
    const cardHeight = cardElement.offsetHeight;

    console.log(`[Archivist Sync] Card state at ${label}:`, {
      cardDisplay,
      cardHeight,
      cardClasses: cardElement.className,
      hasCardButtons: !!cardButtons,
      cardButtonsDisplay: cardButtons
        ? window.getComputedStyle(cardButtons).display
        : "N/A",
      diceTooltipCount: diceTooltips?.length || 0,
      diceTooltipDisplays: diceTooltips
        ? Array.from(diceTooltips).map(
            (t) => window.getComputedStyle(t).display
          )
        : [],
    });

    // Fix any hidden elements
    let fixed = false;
    if (cardButtons) {
      const buttonsDisplay = window.getComputedStyle(cardButtons).display;
      if (buttonsDisplay === "none") {
        cardButtons.style.display = "";
        fixed = true;
      }
    }

    if (diceTooltips) {
      diceTooltips.forEach((tip) => {
        const tipDisplay = window.getComputedStyle(tip).display;
        if (tipDisplay === "none" && !tip.classList.contains("expanded")) {
          // Only fix if it should be expanded (has expanded class or message flag says so)
          const message = cardElement.closest?.(".message");
          const messageId = message?.dataset?.messageId;
          if (messageId) {
            const msg = game.messages.get(messageId);
            if (msg?._rollExpanded) {
              tip.style.display = "";
              fixed = true;
            }
          }
        }
      });
    }

    return fixed;
  };

  // Click handler in CAPTURE phase to track clicks BEFORE CoC7's handler runs
  // This ensures our tracking is set before slideUp is called
  document.addEventListener(
    "click",
    (ev) => {
      const target = ev.target;
      const diceRoll = target.closest?.(".dice-roll");

      // Check if this is a click on a .dice-roll element itself
      if (diceRoll) {
        const message = diceRoll.closest?.(".message");
        const messageId = message?.dataset?.messageId;

        if (messageId) {
          const msg = game.messages.get(messageId);
          if (msg) {
            // Check ACTUAL visual state (DOM) to determine if we're expanding or collapsing
            // Don't rely on _rollExpanded flag alone, as it may not be updated yet
            const tooltip = diceRoll.querySelector(".dice-tooltip");
            const isVisuallyExpanded =
              tooltip &&
              (tooltip.classList.contains("expanded") ||
                window.getComputedStyle(tooltip).display !== "none" ||
                tooltip.offsetHeight > 10);

            // Also check flag for additional context
            const wasExpandedBefore = msg._rollExpanded === true;

            // We're collapsing if tooltip is visually expanded OR flag says expanded
            // We're expanding if tooltip is NOT visually expanded AND flag says not expanded
            const isCollapsing = isVisuallyExpanded || wasExpandedBefore;
            const isExpanding = !isVisuallyExpanded && !wasExpandedBefore;

            if (isCollapsing) {
              // User is collapsing - clear any existing expand protection and set collapse tracking
              // This prevents false expand tracking from causing re-expansion
              if (recentDiceRollClicks.has(msg)) {
                recentDiceRollClicks.delete(msg);
              }
              // Track collapse click to prevent slideDown from re-expanding
              recentCollapseClicks.set(msg, Date.now());

              // Clear collapse protection after 400ms (protection window)
              setTimeout(() => {
                if (recentCollapseClicks.has(msg)) {
                  recentCollapseClicks.delete(msg);
                  console.log(
                    `[Archivist Sync] Cleared collapse protection window for messageId: ${messageId}`
                  );
                }
              }, 400);

              console.warn(
                `[Archivist Sync] ===== DICE-ROLL CLICKED (CAPTURE - COLLAPSE)! =====`,
                `messageId: ${messageId}, isVisuallyExpanded: ${isVisuallyExpanded}, wasExpanded: ${wasExpandedBefore}, cleared expand protection, set collapse tracking`
              );
            } else if (isExpanding) {
              // Mark this click for slideUp protection IMMEDIATELY (only if expanding)
              // This must happen in capture phase so it's available when slideUp is called

              // Clear any collapse tracking (user is expanding, not collapsing)
              if (recentCollapseClicks.has(msg)) {
                recentCollapseClicks.delete(msg);
              }

              recentDiceRollClicks.set(msg, Date.now());
              console.warn(
                `[Archivist Sync] ===== DICE-ROLL CLICKED (CAPTURE - EXPAND)! =====`,
                `messageId: ${messageId}, isVisuallyExpanded: ${isVisuallyExpanded}, wasExpanded: ${wasExpandedBefore}`
              );
            }
          }
        }
      }
    },
    true // Capture phase - run BEFORE CoC7's handler
  );

  // Click handler in BUBBLE phase to fix state AFTER CoC7's handler runs
  document.addEventListener(
    "click",
    (ev) => {
      // Prevent double-handling of the same event
      if (processedClicks.has(ev)) {
        return;
      }

      const target = ev.target;
      const diceRoll = target.closest?.(".dice-roll");

      // Check if this is a click on a .dice-roll element itself
      if (diceRoll) {
        // Mark this event as processed to prevent double-handling
        processedClicks.add(ev);

        const message = diceRoll.closest?.(".message");
        const messageId = message?.dataset?.messageId;

        if (messageId) {
          const msg = game.messages.get(messageId);

          // Get the state BEFORE CoC7's handler toggles it (for tracking)
          const wasExpandedBefore = msg?._rollExpanded === true;
          const shouldExpand = !wasExpandedBefore;

          console.warn(
            `[Archivist Sync] ===== DICE-ROLL CLICKED (BUBBLE)! =====`,
            `messageId: ${messageId}, wasExpanded: ${wasExpandedBefore}, shouldExpand: ${shouldExpand}`
          );

          // Mark this click for slideUp protection (only if expanding)
          // Note: This should already be set in capture phase, but set it here too as backup
          if (shouldExpand) {
            // Clear any collapse tracking (user is expanding, not collapsing)
            if (recentCollapseClicks.has(msg)) {
              recentCollapseClicks.delete(msg);
            }

            recentDiceRollClicks.set(msg, Date.now());

            // Clear the protection after 400ms (protection window)
            setTimeout(() => {
              if (recentDiceRollClicks.has(msg)) {
                recentDiceRollClicks.delete(msg);
                console.log(
                  `[Archivist Sync] Cleared protection window for messageId: ${messageId}`
                );
              }
            }, 400);

            // Wait for CoC7's handler to complete, then check if it collapsed incorrectly
            // Use a delay to ensure CoC7's handler has finished
            setTimeout(() => {
              const msgAfter = game.messages.get(messageId);
              if (msgAfter && shouldExpand) {
                const isExpanded = msgAfter._rollExpanded === true;
                const tooltips = diceRoll.querySelectorAll(".dice-tooltip");

                console.warn(
                  `[Archivist Sync] After CoC7 handler (100ms) - messageId: ${messageId}, _rollExpanded: ${isExpanded}, tooltipCount: ${tooltips.length}`
                );

                // Only fix if CoC7's handler collapsed it when it should be expanded
                // This happens if CoC7's handler ran twice or there was a race condition
                if (!isExpanded && shouldExpand) {
                  // Check if tooltip is actually collapsed (not just the flag)
                  let tooltipIsCollapsed = false;
                  tooltips.forEach((tip) => {
                    const display = window.getComputedStyle(tip).display;
                    if (
                      display === "none" ||
                      !tip.classList.contains("expanded")
                    ) {
                      tooltipIsCollapsed = true;
                    }
                  });

                  // Only fix if tooltip is actually collapsed
                  if (tooltipIsCollapsed) {
                    msgAfter._rollExpanded = true;
                    console.warn(
                      `[Archivist Sync] ✓ FIXED: CoC7 collapsed when it should expand - Set _rollExpanded=true for messageId: ${messageId}`
                    );

                    // Ensure all tooltips have the expanded class and are visible
                    tooltips.forEach((tip) => {
                      if (!tip.classList.contains("expanded")) {
                        ourChanges.add(tip);
                        tip.classList.add("expanded");
                        tip.dataset.archivistProtected = "true";
                      }

                      const display = window.getComputedStyle(tip).display;
                      if (display === "none") {
                        ourChanges.add(tip);
                        tip.style.display = "";
                        tip.dataset.archivistProtected = "true";
                      }
                    });
                  }
                }
              }
            }, 100);
          } else {
            // User is collapsing - clear any existing expand protection and set collapse tracking
            if (recentDiceRollClicks.has(msg)) {
              recentDiceRollClicks.delete(msg);
              console.log(
                `[Archivist Sync] Cleared expand protection - user collapsing messageId: ${messageId}`
              );
            }

            // Track collapse click to prevent slideDown from re-expanding (backup, should already be set in capture)
            if (!recentCollapseClicks.has(msg)) {
              recentCollapseClicks.set(msg, Date.now());

              // Clear collapse protection after 400ms (protection window)
              setTimeout(() => {
                if (recentCollapseClicks.has(msg)) {
                  recentCollapseClicks.delete(msg);
                  console.log(
                    `[Archivist Sync] Cleared collapse protection window for messageId: ${messageId}`
                  );
                }
              }, 400);
            }

            // Don't interfere with collapse - let CoC7 handle it normally
          }

          // Clean up processed click after a delay to prevent memory buildup
          setTimeout(() => {
            processedClicks.delete(ev);
          }, 1000);
        }
      }

      const diceRollCard = target.closest?.(
        ".chat-card, .roll-card, .dice-roll, .dice-result, .dice-formula, .roll-result"
      );

      if (diceRollCard) {
        const actualCard =
          diceRollCard.classList?.contains("chat-card") ||
          diceRollCard.classList?.contains("roll-card")
            ? diceRollCard
            : diceRollCard.closest?.(".chat-card, .roll-card");

        if (actualCard) {
          // Start observing this card
          cardObserver.observe(actualCard, {
            attributes: true,
            attributeFilter: ["style", "class"],
            attributeOldValue: true,
            subtree: true,
          });

          // Check state at multiple intervals to see what's changing
          checkCardState(actualCard, "immediately after click");

          setTimeout(() => {
            checkCardState(actualCard, "50ms after click");
          }, 50);

          setTimeout(() => {
            checkCardState(
              actualCard,
              "250ms after click (after CoC7 animation)"
            );
          }, 250);

          setTimeout(() => {
            checkCardState(actualCard, "500ms after click");
          }, 500);
        }
      }
    }
    // Bubble phase - run AFTER CoC7's handler so we can see what CoC7 did
  );

  // Observe all dice roll cards when they're added to the chat
  const observeDiceRollCards = () => {
    document
      .querySelectorAll(".chat-card.roll-card, .roll-card")
      .forEach((card) => {
        cardObserver.observe(card, {
          attributes: true,
          attributeFilter: ["style", "class"],
          attributeOldValue: true,
          subtree: true,
        });
      });
  };

  // Start observing when the DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observeDiceRollCards);
  } else {
    observeDiceRollCards();
  }

  // Also observe new cards as they're added to the chat
  const chatObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          // Element node
          const card =
            node.classList?.contains("roll-card") ||
            node.classList?.contains("chat-card")
              ? node
              : node.querySelector?.(".chat-card.roll-card, .roll-card");

          if (card) {
            cardObserver.observe(card, {
              attributes: true,
              attributeFilter: ["style", "class"],
              attributeOldValue: true,
              subtree: true,
            });
          }
        }
      });
    });
  });

  const chatSection = document.querySelector("#chat");
  if (chatSection) {
    chatObserver.observe(chatSection, {
      childList: true,
      subtree: true,
    });
  }

  Utils.log("Module initialized");

  // Register module settings and menu
  settingsManager.registerSettings();
  // Ensure organized folders exist (always during ready) so imports land correctly
  try {
    await Utils.ensureArchivistFolders();
  } catch (_) {}

  // Normalize Recaps ordering on ready in case they were imported previously
  try {
    const normalizeRecapsOrdering = async () => {
      try {
        const folder = (game.folders?.contents || []).find(
          (f) =>
            f?.type === "JournalEntry" &&
            String(f?.name || "").toLowerCase() === "recaps"
        );
        if (!folder) return;
        if (folder.sorting !== "m") await folder.update({ sorting: "m" });
        const entries = (game.journal?.contents || [])
          .filter((j) => (j.folder?.id || null) === folder.id)
          .filter((j) => {
            try {
              const a = j.getFlag(CONFIG.MODULE_ID, "archivist") || {};
              return String(a.sheetType || "") === "recap";
            } catch (_) {
              return false;
            }
          });
        const withDates = entries.map((j) => ({
          j,
          dateMs: (() => {
            const iso = String(
              j.getFlag(CONFIG.MODULE_ID, "sessionDate") || ""
            ).trim();
            const t = iso ? new Date(iso).getTime() : NaN;
            return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
          })(),
        }));
        withDates.sort((a, b) => a.dateMs - b.dateMs);
        let i = 0;
        for (const { j } of withDates) {
          const desired = i * 1000;
          i += 1;
          if (j.sort !== desired)
            await j.update({ sort: desired }, { render: false });
        }
        try {
          ui.journal?.render?.(true);
        } catch (_) {}
      } catch (e) {
        console.warn("[Archivist Sync][Recaps] Ready normalization failed:", e);
      }
    };
    // Run shortly after ready so the directory exists
    setTimeout(() => normalizeRecapsOrdering(), 250);
  } catch (_) {}

  // Ensure world initialization flag exists (but don't auto-initialize)
  try {
    const flagCreated = await settingsManager.ensureWorldInitializationFlag();
    if (flagCreated) {
      Utils.log(
        "Created world initialization flag (set to false - awaiting setup)"
      );
    }
  } catch (error) {
    console.error(
      "[Archivist Sync] Failed to ensure world initialization flag:",
      error
    );
  }

  // Initialize debugging interface
  initializeDebugInterface();

  // Conditionally set up Archivist chat based on availability
  updateArchivistChatAvailability();
  try {
    console.log("[Archivist Sync] after availability update", {
      activeTab: ui.sidebar?.activeTab,
      hasSidebar: !!ui.sidebar,
    });
  } catch (_) {}

  // Delegated renderer: when the archivist tab button is clicked, render chat into panel
  try {
    console.log("[Archivist Sync] installing delegated renderer - START");
    const sidebar = document.getElementById("sidebar");
    console.log("[Archivist Sync] sidebar element:", sidebar);
    const tabsNav = sidebar?.querySelector?.("#sidebar-tabs, nav.tabs");
    console.log("[Archivist Sync] tabsNav element:", tabsNav);
    if (!tabsNav) {
      console.warn(
        "[Archivist Sync] Sidebar tabs nav not found, skipping click handler"
      );
      return;
    }

    const onClick = (ev) => {
      // CRITICAL: Ignore clicks on dice roll cards or any elements inside them
      // This prevents interference with CoC7's dice roll expansion
      const isInDiceRoll = ev.target?.closest?.(
        ".chat-card, .roll-card, .card-buttons, .dice-roll, .dice-result, .dice-formula, .roll-result, .dice-tooltip"
      );
      if (isInDiceRoll) {
        console.log(
          "[Archivist Sync] onClick - ignoring click on dice roll card, not touching event"
        );
        // Don't touch the event object at all - just return immediately
        return; // Don't interfere with dice roll interactions
      }

      // Also check if the click is inside the chat content area (not on tab buttons)
      // This ensures we only handle clicks on actual tab navigation buttons
      const isInChatContent = ev.target?.closest?.(
        "#chat, .chat-sidebar, .chat-log, .chat-message, .message-content"
      );
      if (isInChatContent) {
        // Only proceed if we're clicking on a tab button, not on chat content
        const isTabButton = ev.target?.closest?.('button[data-action="tab"]');
        if (!isTabButton) {
          console.log(
            "[Archivist Sync] onClick - click is in chat content but not on tab button, ignoring"
          );
          return;
        }
      }

      console.log(
        "[Archivist Sync] onClick FIRED - target:",
        ev.target,
        "currentTarget:",
        ev.currentTarget
      );
      console.log(
        "[Archivist Sync] onClick - target tagName:",
        ev.target?.tagName,
        "className:",
        ev.target?.className
      );
      // Only handle clicks on tab buttons - since we're listening to the nav container,
      // we only need to check if it's a tab button
      const btn = ev.target.closest?.(
        'button[data-action="tab"][data-tab="archivist-chat"]'
      );
      console.log("[Archivist Sync] onClick - closest button result:", btn);
      if (!btn) {
        console.log(
          "[Archivist Sync] onClick - no matching button, returning early"
        );
        return;
      }
      console.log(
        "[Archivist Sync] onClick - MATCHED archivist-chat button, proceeding"
      );

      setTimeout(async () => {
        console.log("[Archivist Sync] onClick timeout", btn);
        try {
          const sidebar = document.getElementById("sidebar");
          const panel = sidebar?.querySelector?.("#archivist-chat.tab");
          if (!panel) return;

          // Ensure this panel is visible/active even if core didn't switch
          try {
            const contentWrap = panel.parentElement;
            contentWrap?.querySelectorAll?.(".tab").forEach((el) => {
              el.classList.remove("active");
              el.style.display = "none";
            });
            panel.style.display = "";
            panel.classList.add("active");
            btn.setAttribute("aria-pressed", "true");
            btn.setAttribute("aria-selected", "true");
            btn.classList?.add?.("active");
          } catch (_) {}

          if (!window.__ARCHIVIST_SIDEBAR_CHAT__) {
            window.__ARCHIVIST_SIDEBAR_CHAT__ = new AskChatWindow({
              popOut: false,
            });
          }
          window.__ARCHIVIST_SIDEBAR_CHAT__._mountEl = panel;
          await window.__ARCHIVIST_SIDEBAR_CHAT__.render(false);
        } catch (e) {
          console.warn("[Archivist Sync] Delegated render failed", e);
        }
      }, 0);
    };
    console.log("[Archivist Sync] About to attach onClick listener to tabsNav");
    tabsNav.addEventListener("click", onClick);
    console.log(
      "[Archivist Sync] Successfully attached onClick listener to tabsNav"
    );
  } catch (e) {
    console.error("[Archivist Sync] Failed to install delegated renderer", e);
  }

  // Delegated cleanup: when any other tab is clicked, clear our forced overrides
  try {
    console.log("[Archivist Sync] installing cleanup handler - START");
    const sidebar = document.getElementById("sidebar");
    console.log("[Archivist Sync] cleanup - sidebar element:", sidebar);
    const tabsNav = sidebar?.querySelector?.("#sidebar-tabs, nav.tabs");
    console.log("[Archivist Sync] cleanup - tabsNav element:", tabsNav);
    if (!tabsNav) {
      console.warn(
        "[Archivist Sync] Sidebar tabs nav not found, skipping cleanup handler"
      );
      return;
    }

    const onOtherTabClick = (ev) => {
      // CRITICAL: Ignore clicks on dice roll cards or any elements inside them
      // This prevents interference with CoC7's dice roll expansion
      const isInDiceRoll = ev.target?.closest?.(
        ".chat-card, .roll-card, .card-buttons, .dice-roll, .dice-result, .dice-formula, .roll-result, .dice-tooltip"
      );
      if (isInDiceRoll) {
        console.log(
          "[Archivist Sync] onOtherTabClick - ignoring click on dice roll card, not touching event"
        );
        // Don't touch the event object at all - just return immediately
        return; // Don't interfere with dice roll interactions
      }

      // Also check if the click is inside the chat content area (not on tab buttons)
      // This ensures we only handle clicks on actual tab navigation buttons
      const isInChatContent = ev.target?.closest?.(
        "#chat, .chat-sidebar, .chat-log, .chat-message, .message-content"
      );
      if (isInChatContent) {
        // Only proceed if we're clicking on a tab button, not on chat content
        const isTabButton = ev.target?.closest?.('button[data-action="tab"]');
        if (!isTabButton) {
          console.log(
            "[Archivist Sync] onOtherTabClick - click is in chat content but not on tab button, ignoring"
          );
          return;
        }
      }

      console.log(
        "[Archivist Sync] onOtherTabClick FIRED - target:",
        ev.target,
        "currentTarget:",
        ev.currentTarget
      );
      console.log(
        "[Archivist Sync] onOtherTabClick - target tagName:",
        ev.target?.tagName,
        "className:",
        ev.target?.className
      );
      // Only handle clicks on tab buttons - check if it's a tab button that's NOT archivist-chat
      const other = ev.target.closest?.('button[data-action="tab"][data-tab]');
      console.log(
        "[Archivist Sync] onOtherTabClick - closest button result:",
        other
      );
      if (!other) {
        console.log(
          "[Archivist Sync] onOtherTabClick - no matching button, returning early"
        );
        return;
      }

      const tabId = other.dataset?.tab;
      console.log("[Archivist Sync] onOtherTabClick - tabId:", tabId);
      if (tabId === "archivist-chat") {
        console.log(
          "[Archivist Sync] onOtherTabClick - is archivist-chat, returning (handled by other handler)"
        );
        return; // our renderer handles the archivist tab
      }
      console.log(
        "[Archivist Sync] onOtherTabClick - MATCHED other tab button, proceeding"
      );

      setTimeout(() => {
        try {
          const sidebar = document.getElementById("sidebar");
          const contentWrap =
            sidebar?.querySelector?.(
              "#sidebar-content, section.content, .content"
            ) || sidebar?.querySelector("section.tab, .tab")?.parentElement;
          if (contentWrap) {
            // Remove inline display overrides so core can manage visibility
            contentWrap.querySelectorAll(".tab").forEach((el) => {
              el.style.display = "";
            });
            const panel = contentWrap.querySelector("#archivist-chat.tab");
            if (panel) panel.classList.remove("active");
          }
          const myBtn = tabsNav?.querySelector?.(
            '[data-action="tab"][data-tab="archivist-chat"]'
          );
          if (myBtn) {
            console.log(
              "[Archivist Sync] clearing overrides for archivist-chat",
              myBtn
            );
            myBtn.classList?.remove?.("active");
            myBtn.setAttribute("aria-pressed", "false");
            myBtn.setAttribute("aria-selected", "false");
          }
        } catch (e) {
          console.warn("[Archivist Sync] Failed clearing overrides", e);
        }
      }, 0);
    };
    console.log(
      "[Archivist Sync] About to attach onOtherTabClick listener to tabsNav"
    );
    tabsNav.addEventListener("click", onOtherTabClick);
    console.log(
      "[Archivist Sync] Successfully attached onOtherTabClick listener to tabsNav"
    );
  } catch (e) {
    console.error("[Archivist Sync] Failed to install delegated cleanup", e);
  }

  // Do not force-switch tabs; allow user/system to control active tab

  // Build initial link index from local world flags
  try {
    linkIndexer.buildFromWorld();
  } catch (e) {
    console.warn("[Archivist Sync] Link index build failed", e);
  }

  // Install Real-Time Sync listeners (CRUD) if enabled and world is selected
  try {
    if (
      settingsManager.isWorldSelected() &&
      settingsManager.isRealtimeSyncEnabled?.()
    ) {
      installRealtimeSyncListeners();
      console.log("[Archivist Sync] Real-Time Sync listeners installed");
    } else {
      console.log(
        "[Archivist Sync] Real-Time Sync disabled or no world selected"
      );
    }
  } catch (e) {
    console.warn(
      "[Archivist Sync] Failed to install Real-Time Sync listeners",
      e
    );
  }

  // Inject a Journal Directory header button to open Sync Dialog
  Hooks.on("renderJournalDirectory", (app, html) => {
    try {
      // Only show sync button if world is initialized and GM
      const isWorldInitialized = settingsManager.isWorldInitialized?.();
      if (!isWorldInitialized) return;
      if (!game.user?.isGM) return;

      const root = html instanceof jQuery ? html[0] : html?.element || html;
      if (!root) return;
      const header =
        root.querySelector("header.directory-header") ||
        root.querySelector("header.header") ||
        root.querySelector("header") ||
        root.querySelector(".directory-header") ||
        root.querySelector(".header");
      if (!header) return;
      if (header.querySelector?.(".archivist-sync-btn")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "archivist-sync-btn";
      btn.textContent = "Sync with Archivist";
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        try {
          new SyncDialog().render(true);
        } catch (_) {}
      });
      header.appendChild(btn);
    } catch (_) {}
  });

  // Inject quick-create buttons for Archivist sheets in the Journal Directory header
  Hooks.on("renderJournalDirectory", (app, html) => {
    try {
      // Only show create buttons if world is initialized
      const isWorldInitialized = settingsManager.isWorldInitialized?.();
      if (!isWorldInitialized) return;
      if (!game.user?.isGM) return;
      const root = html instanceof jQuery ? html[0] : html?.element || html;
      if (!root) return;
      const header =
        root.querySelector("header.directory-header") ||
        root.querySelector("header.header") ||
        root.querySelector("header") ||
        root.querySelector(".directory-header") ||
        root.querySelector(".header");
      if (!header) return;
      if (header.querySelector(".archivist-create-buttons")) return;

      const wrap = document.createElement("div");
      wrap.className = "archivist-create-buttons";
      wrap.style.display = "flex";
      wrap.style.flexWrap = "wrap";
      wrap.style.gap = "6px";
      wrap.style.marginTop = "6px";

      const types = [
        { key: "pc", label: "PC", icon: "fa-user", tooltip: "Create New PC" },
        {
          key: "npc",
          label: "NPC",
          icon: "fa-user-ninja",
          tooltip: "Create New NPC",
        },
        {
          key: "item",
          label: "Item",
          icon: "fa-gem",
          tooltip: "Create New Item",
        },
        {
          key: "location",
          label: "Location",
          icon: "fa-location-dot",
          tooltip: "Create New Location",
        },
        {
          key: "faction",
          label: "Faction",
          icon: "fa-people-group",
          tooltip: "Create New Faction",
        },
      ];

      const promptForName = async (title) => {
        try {
          const name = await foundry.applications.api.DialogV2.prompt({
            window: { title },
            content: `
              <div class="form-group">
                <label>Name:</label>
                <input type="text" name="name" placeholder="Enter name..." autofocus style="width: 100%;" />
              </div>
            `,
            ok: {
              icon: '<i class="fas fa-check"></i>',
              label: "Create",
              callback: (event, button) => {
                const enteredName = button.form.elements.name.value.trim();
                return enteredName || null;
              },
            },
            cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" },
            rejectClose: true,
          });
          return name;
        } catch (_) {
          return null;
        }
      };

      const makeBtn = (t) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "archivist-create-btn";
        b.innerHTML = `<i class="fas ${t.icon}"></i>`;
        b.title = t.tooltip;
        b.dataset.type = t.key;
        b.addEventListener("click", async (ev) => {
          ev.preventDefault();
          try {
            const worldId = settingsManager.getSelectedWorldId?.();
            const name = await promptForName(`Create ${t.label}`);
            if (!name) return;

            let journal = null;
            if (t.key === "pc")
              journal = await Utils.createPcJournal({ name, worldId });
            else if (t.key === "npc")
              journal = await Utils.createNpcJournal({ name, worldId });
            else if (t.key === "item")
              journal = await Utils.createItemJournal({ name, worldId });
            else if (t.key === "location")
              journal = await Utils.createLocationJournal({ name, worldId });
            else if (t.key === "faction")
              journal = await Utils.createFactionJournal({ name, worldId });

            // Open the newly created sheet and bring it to front
            if (journal) {
              journal.sheet?.render?.(true);
              setTimeout(() => journal.sheet?.bringToFront?.(), 50);
            }
          } catch (e) {
            console.warn("[Archivist Sync] create button failed", e);
          }
        });
        return b;
      };

      for (const t of types) wrap.appendChild(makeBtn(t));
      header.appendChild(wrap);
    } catch (e) {
      console.warn("[Archivist Sync] Failed to inject create buttons", e);
    }
  });

  // Add Archivist type selector to Create Journal dialog (optional)
  Hooks.on("renderDialogV2", (dialog, html, data) => {
    try {
      if (dialog.title !== "Create Journal Entry") return;
      const form = html.querySelector("form");
      if (
        !form ||
        form.querySelector('[name="flags.archivist-sync.archivist.sheetType"]')
      )
        return;
      const sel = document.createElement("div");
      sel.className = "form-group";
      sel.innerHTML = `
        <label>Archivist Type</label>
        <div class="form-fields">
          <select name="flags.archivist-sync.archivist.sheetType">
            <option value="">Standard</option>
            <optgroup label="Archivist">
              <option value="pc">PC</option>
              <option value="npc">NPC</option>
              <option value="item">Item</option>
              <option value="location">Location</option>
              <option value="faction">Faction</option>
            </optgroup>
          </select>
        </div>`;
      const nameInput = form.querySelector('input[name="name"]');
      if (nameInput)
        nameInput
          .closest(".form-group")
          ?.insertAdjacentElement("afterend", sel);
    } catch (_) {}
  });

  // Auto-place new Archivist journals into organized folders and seed a text page
  Hooks.on("createJournalEntry", async (entry, options, userId) => {
    try {
      if (game.user.id !== userId) return;
      const flags = entry.getFlag(CONFIG.MODULE_ID, "archivist") || {};
      const type = String(flags.sheetType || "").toLowerCase();
      if (!type) return;
      // Move to organized folder when enabled
      try {
        await Utils.moveJournalToTypeFolder(entry);
      } catch (_) {}
      // Ensure it has a text page seeded with a header
      const pages = entry.pages?.contents || [];
      if (!pages.some((p) => p.type === "text")) {
        await entry.createEmbeddedDocuments("JournalEntryPage", [
          {
            name: "Overview",
            type: "text",
            text: {
              content: `<h1>${foundry.utils.escapeHTML(entry.name)}</h1>`,
              markdown: `# ${entry.name}`,
              format: 2,
            },
          },
        ]);
      }
    } catch (e) {
      console.warn("[Archivist Sync] createJournalEntry post-hook failed", e);
    }
  });

  // No auto-switch; DocumentSheet registrations handle sheet selection

  // Keep LinkIndexer current when archivist flags change
  Hooks.on("updateJournalEntry", (doc, changes) => {
    try {
      if (changes?.flags?.[CONFIG.MODULE_ID]?.archivist) {
        try {
          linkIndexer.buildFromWorld();
        } catch (_) {}
      }
    } catch (_) {}
  });
  Hooks.on("updateJournalEntryPage", (page, changes) => {
    try {
      if (changes?.flags?.[CONFIG.MODULE_ID]?.archivist) {
        try {
          linkIndexer.buildFromWorld();
        } catch (_) {}
      }
    } catch (_) {}
  });

  // Canvas drop: place Actor tokens when a UUID or linked Actor is dropped
  Hooks.on("dropCanvasData", async (canvasApp, data) => {
    try {
      const uuid = data?.uuid || data?.data?.uuid;
      if (!uuid) return false;
      const doc = await fromUuid(uuid).catch(() => null);
      if (!doc) return false;

      if (doc.documentName === "Actor") {
        // Allow Foundry's default actor drop handling to proceed untouched
        return false;
      }

      let actor = null;
      if (doc.documentName === "JournalEntry") {
        const flags = doc.getFlag(CONFIG.MODULE_ID, "archivist") || {};
        const actorIds = Array.isArray(flags?.foundryRefs?.actors)
          ? flags.foundryRefs.actors
          : [];
        if (actorIds.length) actor = game.actors.get(actorIds[0]) || null;
      }
      if (!actor) return false;

      if (!canvas?.ready) {
        ui.notifications?.warn?.("Open a Scene first.");
        return false;
      }
      const x = Number.isFinite(data?.x)
        ? data.x
        : canvas.app.renderer.width / 2;
      const y = Number.isFinite(data?.y)
        ? data.y
        : canvas.app.renderer.height / 2;
      const pt = canvas.stage.worldTransform.applyInverse({ x, y });
      const tokenData = await actor.getTokenDocument({ x: pt.x, y: pt.y });
      await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
      return true;
    } catch (e) {
      console.warn("[Archivist Sync] dropCanvasData handler failed", e);
      return false;
    }
  });

  // Remove AppV2 sheet intercepts in favor of registered DocumentSheet V2

  // Scene controls no longer modified by this module

  // Auto-open World Setup wizard for GMs when not initialized
  try {
    if (game.user?.isGM && !settingsManager.isWorldInitialized()) {
      (window.__ARCHIVIST_SETUP__ ||= new WorldSetupDialog()).render(true);
    }
  } catch (_) {}

  // No Hub restoration on canvasReady; feature removed
});

/**
 * Update Archivist chat availability based on current settings
 * Shows or hides the sidebar tab and updates UI accordingly
 */
function updateArchivistChatAvailability() {
  console.warn(
    "[Archivist Sync] ===== updateArchivistChatAvailability() CALLED ===== "
  );
  console.warn("[Archivist Sync] Stack trace:", new Error().stack);
  const isAvailable = settingsManager.isArchivistChatAvailable();
  try {
    console.log("[Archivist Sync] updateArchivistChatAvailability()", {
      isAvailable,
    });
  } catch (_) {}

  if (isAvailable) {
    // Ensure visibility of the nav button and panel if already rendered
    const sidebar = document.getElementById("sidebar");
    if (sidebar) {
      const tabsNav = sidebar.querySelector("#sidebar-tabs, nav.tabs");
      const tabButton = sidebar.querySelector('[data-tab="archivist-chat"]');
      let tabPanel = sidebar.querySelector("#archivist-chat.tab");
      if (tabButton) {
        tabButton.style.display = "";
        const label =
          game.i18n?.localize?.("ARCHIVIST_SYNC.Menu.AskChat.Label") ||
          "Archivist Chat";
        tabButton.setAttribute("title", label);
        tabButton.setAttribute("data-tooltip", label);
        tabButton.setAttribute("data-tooltip-direction", "LEFT");
      }
      if (tabPanel) tabPanel.style.display = "";

      // Ensure a content panel exists (template slot or create one)
      try {
        ensureChatSlot();
      } catch (_) {}
      if (!tabPanel) {
        const contentWrap =
          sidebar.querySelector(
            "#sidebar-content, section.content, .content"
          ) || sidebar.querySelector("section.tab, .tab")?.parentElement;
        if (contentWrap && !contentWrap.querySelector("#archivist-chat.tab")) {
          const panel = document.createElement("section");
          panel.id = "archivist-chat";
          panel.className = "tab sidebar-tab";
          panel.dataset.tab = "archivist-chat";
          panel.style.height = "100%";
          panel.style.overflow = "hidden auto";
          contentWrap.appendChild(panel);
          tabPanel = panel;
        }
      }

      // Fallback: if the core Sidebar did not render the nav button, inject a compatible button
      if (!tabButton && tabsNav) {
        try {
          const li = document.createElement("li");
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "ui-control plain icon";
          btn.setAttribute("data-action", "tab");
          btn.setAttribute("role", "tab");
          btn.setAttribute("aria-controls", "archivist-chat");
          btn.setAttribute(
            "data-group",
            tabsNav.getAttribute("data-group") || "primary"
          );
          btn.dataset.tab = "archivist-chat";
          btn.setAttribute(
            "aria-label",
            game.i18n?.localize?.("ARCHIVIST_SYNC.Menu.AskChat.Label") ||
              "Archivist Chat"
          );
          btn.setAttribute(
            "data-tooltip",
            game.i18n?.localize?.("ARCHIVIST_SYNC.Menu.AskChat.Label") ||
              "Archivist Chat"
          );
          btn.setAttribute("data-tooltip-direction", "RIGHT");
          const i = document.createElement("i");
          i.className = "fa-solid fa-sparkles";
          btn.appendChild(i);
          btn.addEventListener("click", async (ev) => {
            ev.preventDefault();
            try {
              console.log("[Archivist Sync] Sidebar button click");
            } catch (_) {}
            const isActive = ui.sidebar?.activeTab === "archivist-chat";
            const isExpanded = ui.sidebar?._expanded;
            try {
              console.log("[Archivist Sync] click state", {
                isActive,
                isExpanded,
              });
            } catch (_) {}
            if (isActive && isExpanded) {
              try {
                ui.sidebar?.collapse?.();
              } catch (_) {}
            } else {
              try {
                ui.sidebar?.expand?.();
              } catch (_) {}
              try {
                ui.sidebar?.changeTab?.("archivist-chat");
              } catch (_) {}
              // Ensure panel exists and render the chat UI as a fallback
              const sb = document.getElementById("sidebar");
              let panel = sb?.querySelector?.("#archivist-chat.tab");
              if (!panel) {
                const contentWrap =
                  sb?.querySelector(
                    "#sidebar-content, section.content, .content"
                  ) || sb?.querySelector("section.tab, .tab")?.parentElement;
                if (contentWrap) {
                  panel = document.createElement("section");
                  panel.id = "archivist-chat";
                  panel.className = "tab sidebar-tab active";
                  panel.dataset.tab = "archivist-chat";
                  panel.style.height = "100%";
                  panel.style.overflow = "hidden auto";
                  contentWrap.appendChild(panel);
                }
              }
              if (panel) {
                try {
                  console.log("[Archivist Sync] rendering fallback chat");
                  if (!window.__ARCHIVIST_SIDEBAR_CHAT__) {
                    window.__ARCHIVIST_SIDEBAR_CHAT__ = new AskChatWindow({
                      popOut: false,
                    });
                  }
                  window.__ARCHIVIST_SIDEBAR_CHAT__._mountEl = panel;
                  await window.__ARCHIVIST_SIDEBAR_CHAT__.render(false);
                } catch (e) {
                  console.warn(
                    "[Archivist Sync] Fallback chat render failed",
                    e
                  );
                }
              }
            }
          });
          li.appendChild(btn);
          const menu = tabsNav.querySelector("menu.flexcol") || tabsNav;
          menu.appendChild(li);
        } catch (e) {
          console.warn(
            "[Archivist Sync] Failed to inject fallback Sidebar tab button",
            e
          );
        }
      }
    }
    // Re-render to reflect visibility changes
    try {
      console.warn(
        "[Archivist Sync] ===== CALLING sidebar.render({ force: true }) ===== "
      );
      console.warn(
        "[Archivist Sync] This will re-render the sidebar and may collapse dice roll cards!"
      );
      ui.sidebar?.render?.({ force: true });
    } catch (e) {
      console.warn("[Archivist Sync] Sidebar render failed", e);
    }
  } else {
    // Hide/remove sidebar tab if conditions are not met
    try {
      // Hide existing tab button and panel if they exist
      const sidebar = document.getElementById("sidebar");
      if (sidebar) {
        const tabButton = sidebar.querySelector('[data-tab="archivist-chat"]');
        const tabPanel = sidebar.querySelector("#archivist-chat.tab");
        if (tabButton) tabButton.style.display = "none";
        if (tabPanel) {
          tabPanel.style.display = "none";
          tabPanel.classList.remove("active");
        }
      }
      // Force sidebar re-render to hide the tab (Application V2 signature)
      try {
        console.warn(
          "[Archivist Sync] ===== CALLING sidebar.render({ force: true }) to hide tab ===== "
        );
        console.warn(
          "[Archivist Sync] This will re-render the sidebar and may collapse dice roll cards!"
        );
        ui.sidebar?.render?.({ force: true });
      } catch (e) {
        console.warn("[Archivist Sync] Sidebar render failed", e);
      }
    } catch (e) {
      console.warn("[Archivist Sync] Failed to hide chat tab:", e);
    }
  }

  // Update scene controls (they will be re-evaluated on next render)
  try {
    ui.controls?.render?.(true);
  } catch (_) {}

  Utils.log(`Archivist chat availability updated: ${isAvailable}`);
}

/**
 * Initialize global debugging interface
 * Makes key components available in the console for debugging
 */
function initializeDebugInterface() {
  window.ARCHIVIST_SYNC = {
    CONFIG,
    settingsManager,
    archivistApi,
    updateChatAvailability: updateArchivistChatAvailability,
    installRealtimeSyncListeners,
    Utils,
    AskChatWindow,
    async projection() {
      const { SlotResolver } = await import(
        "./modules/projection/slot-resolver.js"
      );
      return SlotResolver;
    },
  };

  Utils.log(
    "Debug interface initialized. Use window.ARCHIVIST_SYNC to access module components."
  );
}

// Export main components for potential use by other modules
export { CONFIG, settingsManager, archivistApi, Utils };

/**
 * Real-Time Sync: listen to Foundry CRUD and POST/PATCH/DELETE to Archivist
 * Only runs for GMs and when a world is selected & setting enabled.
 */
function installRealtimeSyncListeners() {
  const isGM = game.user?.isGM;
  if (!isGM) return; // Only the GM client should perform API writes

  const apiKey = settingsManager.getApiKey();
  const worldId = settingsManager.getSelectedWorldId();
  if (!apiKey || !worldId) return;

  const toItemPayload = (item) => {
    const name = item?.name || "Item";
    const rawImg = String(item?.img || "").trim();
    const image = rawImg.startsWith("https://") ? rawImg : undefined;
    const desc = String(
      item?.system?.description?.value || item?.system?.description || ""
    );
    return {
      name,
      description: Utils.toMarkdownIfHtml?.(desc) || desc,
      ...(image ? { image } : {}),
      campaign_id: worldId,
    };
  };

  const toCharacterPayload = (actor) =>
    Utils.toApiCharacterPayload(actor, worldId);
  const toFactionPayload = (page) => {
    const name = page?.name || "Faction";
    const html = Utils.extractPageHtml(page);
    // Strip leading image since it's stored separately in the image property
    const cleaned = Utils.stripLeadingImage?.(html) ?? html;
    const rawImg = String(page?.parent?.img || "").trim();
    const image = rawImg.startsWith("https://") ? rawImg : undefined;
    return {
      name,
      description: Utils.toMarkdownIfHtml?.(cleaned) || cleaned,
      ...(image ? { image } : {}),
      campaign_id: worldId,
    };
  };
  const toLocationPayload = (page) => {
    const name = page?.name || "Location";
    const html = Utils.extractPageHtml(page);
    // Strip leading image since it's stored separately in the image property
    const cleaned = Utils.stripLeadingImage?.(html) ?? html;
    const rawImg = String(page?.parent?.img || "").trim();
    const image = rawImg.startsWith("https://") ? rawImg : undefined;
    return {
      name,
      description: Utils.toMarkdownIfHtml?.(cleaned) || cleaned,
      ...(image ? { image } : {}),
      campaign_id: worldId,
    };
  };

  // Create
  Hooks.on("createActor", async (doc) => {
    try {
      // Always-on realtime rules; respect suppression during bulk ops
      if (
        !settingsManager.isRealtimeSyncEnabled?.() ||
        settingsManager.isRealtimeSyncSuppressed?.()
      )
        return;
      // Do not auto-create Archivist Characters from Foundry actor creations
      return;
    } catch (e) {
      console.warn("[RTS] createActor failed", e);
    }
  });
  Hooks.on("createItem", async (doc) => {
    try {
      if (
        !settingsManager.isRealtimeSyncEnabled?.() ||
        settingsManager.isRealtimeSyncSuppressed?.()
      )
        return;
      const id = doc.getFlag(CONFIG.MODULE_ID, "archivistId");
      if (id) return;
      const payload = toItemPayload(doc);
      const res = await archivistApi.createItem(apiKey, payload);
      if (res?.success && res?.data?.id) {
        await doc.setFlag(CONFIG.MODULE_ID, "archivistId", res.data.id);
        await doc.setFlag(CONFIG.MODULE_ID, "archivistWorldId", worldId);
      }
    } catch (e) {
      console.warn("[RTS] createItem failed", e);
    }
  });

  // JournalEntry create - create Archivist entities when a custom page-based sheet is created
  Hooks.on("createJournalEntry", async (entry, options, userId) => {
    try {
      if (
        !settingsManager.isRealtimeSyncEnabled?.() ||
        settingsManager.isRealtimeSyncSuppressed?.()
      )
        return;
      if (game.user.id !== userId) return;

      // Determine sheet type from flags set at creation time
      const flags = entry.getFlag(CONFIG.MODULE_ID, "archivist") || {};
      const sheetType = String(flags.sheetType || "").toLowerCase();
      if (!sheetType) return;

      // Skip if already linked
      if (flags.archivistId) return;

      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      if (!apiKey || !worldId) return;

      // Gather description from first text page
      const pages = entry.pages?.contents || [];
      const textPage = pages.find((p) => p.type === "text") || pages[0];
      const html = textPage?.text?.content || "";
      const description = Utils.toMarkdownIfHtml?.(html) || html || "";

      let res = { success: false, data: null };
      if (
        sheetType === "pc" ||
        sheetType === "npc" ||
        sheetType === "character"
      ) {
        const payload = {
          character_name: entry.name || "Character",
          description,
          type: sheetType === "npc" ? "NPC" : "PC",
          campaign_id: worldId,
        };
        res = await archivistApi.createCharacter(apiKey, payload);
      } else if (sheetType === "item") {
        res = await archivistApi.createItem(apiKey, {
          name: entry.name || "Item",
          description,
          campaign_id: worldId,
        });
      } else if (sheetType === "location") {
        const rawImg = String(entry?.img || "").trim();
        const image = rawImg.startsWith("https://") ? rawImg : undefined;
        res = await archivistApi.createLocation(apiKey, {
          name: entry.name || "Location",
          description,
          ...(image ? { image } : {}),
          campaign_id: worldId,
        });
      } else if (sheetType === "faction") {
        const rawImg = String(entry?.img || "").trim();
        const image = rawImg.startsWith("https://") ? rawImg : undefined;
        res = await archivistApi.createFaction(apiKey, {
          name: entry.name || "Faction",
          description,
          ...(image ? { image } : {}),
          campaign_id: worldId,
        });
      }

      if (res.success && res.data?.id) {
        await entry.setFlag(CONFIG.MODULE_ID, "archivist", {
          sheetType,
          archivistId: res.data.id,
          archivistWorldId: worldId,
          archivistRefs: {
            characters: [],
            items: [],
            entries: [],
            factions: [],
            locationsAssociative: [],
          },
          foundryRefs: { actors: [], items: [], scenes: [], journals: [] },
        });
      }
    } catch (e) {
      console.warn("[RTS] createJournalEntry (flags) failed", e);
    }
  });

  // JournalEntryPage create (Factions / Locations containers only)
  const isFactionPage = (p) => p?.parent?.name === "Factions";
  const isLocationPage = (p) => p?.parent?.name === "Locations";
  const isRecapPage = (p) => p?.parent?.name === "Recaps";

  Hooks.on("createJournalEntryPage", async (page) => {
    try {
      if (
        !settingsManager.isRealtimeSyncEnabled?.() ||
        settingsManager.isRealtimeSyncSuppressed?.()
      )
        return;
      if (isRecapPage(page)) return; // Recaps are read-only for creation
      const metaId = page.getFlag(CONFIG.MODULE_ID, "archivistId");
      if (metaId) return;
      if (isFactionPage(page)) {
        const res = await archivistApi.createFaction(
          apiKey,
          toFactionPayload(page)
        );
        if (res?.success && res?.data?.id) {
          await Utils.setPageArchivistMeta(
            page,
            res.data.id,
            "faction",
            worldId
          );
        } else if (!res?.success && res?.isDescriptionTooLong) {
          ui.notifications?.error?.(
            `Failed to create ${res.entityName || page?.name}: Description exceeds the maximum length of 10,000 characters. Please shorten the description and try again.`,
            { permanent: true }
          );
        }
      } else if (isLocationPage(page)) {
        const res = await archivistApi.createLocation(
          apiKey,
          toLocationPayload(page)
        );
        if (res?.success && res?.data?.id) {
          await Utils.setPageArchivistMeta(
            page,
            res.data.id,
            "location",
            worldId
          );
        } else if (!res?.success && res?.isDescriptionTooLong) {
          ui.notifications?.error?.(
            `Failed to create ${res.entityName || page?.name}: Description exceeds the maximum length of 10,000 characters. Please shorten the description and try again.`,
            { permanent: true }
          );
        }
      }
    } catch (e) {
      console.warn("[RTS] createJournalEntryPage failed", e);
    }
  });

  // Update
  Hooks.on("updateActor", async (doc, changes) => {
    try {
      // Always-on realtime rules; respect suppression during bulk ops
      if (
        !settingsManager.isRealtimeSyncEnabled?.() ||
        settingsManager.isRealtimeSyncSuppressed?.()
      )
        return;
      // Do not PATCH Archivist Characters from Foundry actor updates
      return;
    } catch (e) {
      console.warn("[RTS] updateActor failed", e);
    }
  });
  Hooks.on("updateItem", async (doc, changes) => {
    try {
      if (
        !settingsManager.isRealtimeSyncEnabled?.() ||
        settingsManager.isRealtimeSyncSuppressed?.()
      )
        return;
      const id = doc.getFlag(CONFIG.MODULE_ID, "archivistId");
      if (!id) return;
      const res = await archivistApi.updateItem(apiKey, id, toItemPayload(doc));
      if (!res?.success) {
        if (res.isDescriptionTooLong) {
          ui.notifications?.error?.(
            `Failed to sync ${res.entityName || doc?.name}: Description exceeds the maximum length of 10,000 characters. Please shorten the description and try again.`,
            { permanent: true }
          );
        } else {
          console.warn("[RTS] updateItem failed");
        }
      }
    } catch (e) {
      console.warn("[RTS] updateItem failed", e);
    }
  });
  Hooks.on("updateJournalEntryPage", async (page, changes) => {
    try {
      // Always-on realtime rules; respect suppression during bulk ops
      if (
        !settingsManager.isRealtimeSyncEnabled?.() ||
        settingsManager.isRealtimeSyncSuppressed?.()
      )
        return;
      // Op marker: ignore our projection-originated write operations
      try {
        const mod = changes?.flags?.[CONFIG.MODULE_ID];
        if (mod && Object.prototype.hasOwnProperty.call(mod, "op")) return;
      } catch (_) {}
      const meta = Utils.getPageArchivistMeta(page);
      if (!meta?.id) return;
      let res;
      // Faction pages: update Faction
      if (isFactionPage(page)) {
        res = await archivistApi.updateFaction(
          apiKey,
          meta.id,
          toFactionPayload(page)
        );
        if (!res?.success && res?.isDescriptionTooLong) {
          ui.notifications?.error?.(
            `Failed to sync ${res.entityName || page?.name}: Description exceeds the maximum length of 10,000 characters. Please shorten the description and try again.`,
            { permanent: true }
          );
        }
        // Location pages: update Location
      } else if (isLocationPage(page)) {
        res = await archivistApi.updateLocation(
          apiKey,
          meta.id,
          toLocationPayload(page)
        );
        if (!res?.success && res?.isDescriptionTooLong) {
          ui.notifications?.error?.(
            `Failed to sync ${res.entityName || page?.name}: Description exceeds the maximum length of 10,000 characters. Please shorten the description and try again.`,
            { permanent: true }
          );
        }
        // Recap pages: update Session title/summary only
      } else if (isRecapPage(page)) {
        // Recaps: update session summary/title only; do not create/delete
        const title = page.name;
        const html = Utils.extractPageHtml(page);
        await archivistApi.updateSession(apiKey, meta.id, {
          title,
          summary: Utils.toMarkdownIfHtml?.(html) || html,
        });
      } else {
        // If the parent journal is flagged as character (pc/npc) or item, update those entities
        const parent = page?.parent;
        const flags = parent?.getFlag?.(CONFIG.MODULE_ID, "archivist") || {};
        const html = Utils.extractPageHtml(page);
        const isCharacter =
          flags?.sheetType === "pc" ||
          flags?.sheetType === "npc" ||
          flags?.sheetType === "character";
        if (isCharacter && flags.archivistId) {
          res = await archivistApi.updateCharacter(apiKey, flags.archivistId, {
            description: Utils.toMarkdownIfHtml?.(html) || html,
          });
          if (!res?.success && res?.isDescriptionTooLong) {
            ui.notifications?.error?.(
              `Failed to sync ${res.entityName || parent?.name}: Description exceeds the maximum length of 10,000 characters. Please shorten the description and try again.`,
              { permanent: true }
            );
          }
        }
        if (flags?.sheetType === "item" && flags.archivistId) {
          res = await archivistApi.updateItem(apiKey, flags.archivistId, {
            description: Utils.toMarkdownIfHtml?.(html) || html,
          });
          if (!res?.success && res?.isDescriptionTooLong) {
            ui.notifications?.error?.(
              `Failed to sync ${res.entityName || parent?.name}: Description exceeds the maximum length of 10,000 characters. Please shorten the description and try again.`,
              { permanent: true }
            );
          }
        }
        if (flags?.sheetType === "location" && flags.archivistId) {
          res = await archivistApi.updateLocation(apiKey, flags.archivistId, {
            description: Utils.toMarkdownIfHtml?.(html) || html,
          });
          if (!res?.success && res?.isDescriptionTooLong) {
            ui.notifications?.error?.(
              `Failed to sync ${res.entityName || parent?.name}: Description exceeds the maximum length of 10,000 characters. Please shorten the description and try again.`,
              { permanent: true }
            );
          }
        }
        if (flags?.sheetType === "faction" && flags.archivistId) {
          res = await archivistApi.updateFaction(apiKey, flags.archivistId, {
            description: Utils.toMarkdownIfHtml?.(html) || html,
          });
          if (!res?.success && res?.isDescriptionTooLong) {
            ui.notifications?.error?.(
              `Failed to sync ${res.entityName || parent?.name}: Description exceeds the maximum length of 10,000 characters. Please shorten the description and try again.`,
              { permanent: true }
            );
          }
        }
      }
    } catch (e) {
      console.warn("[RTS] updateJournalEntryPage failed", e);
    }
  });

  // When a sheet's title changes, PATCH the corresponding Archivist entity name/title
  Hooks.on("updateJournalEntry", async (entry, diff) => {
    try {
      if (
        !settingsManager.isRealtimeSyncEnabled?.() ||
        settingsManager.isRealtimeSyncSuppressed?.()
      )
        return;
      // Op marker: ignore projection-originated writes
      try {
        const mod = diff?.flags?.[CONFIG.MODULE_ID];
        if (mod && Object.prototype.hasOwnProperty.call(mod, "op")) return;
      } catch (_) {}
      const flags = entry.getFlag(CONFIG.MODULE_ID, "archivist") || {};
      const id = flags?.archivistId;
      const st = String(flags?.sheetType || "");
      if (!id || !diff?.name) return;
      const name = String(diff.name);
      const isCharacter = st === "pc" || st === "npc" || st === "character";
      if (isCharacter) {
        await archivistApi.updateCharacter(apiKey, id, {
          character_name: name,
        });
      } else if (st === "item") {
        await archivistApi.updateItem(apiKey, id, { name });
      } else if (st === "location") {
        await archivistApi.updateLocation(apiKey, id, { name });
      } else if (st === "faction") {
        await archivistApi.updateFaction(apiKey, id, { name });
      }
    } catch (e) {
      console.warn("[RTS] updateJournalEntry (title sync) failed", e);
    }
  });

  // Delete (preDelete to capture flags before doc vanishes)
  Hooks.on("preDeleteActor", async (doc) => {
    try {
      if (
        !settingsManager.isRealtimeSyncEnabled?.() ||
        settingsManager.isRealtimeSyncSuppressed?.()
      )
        return;
      const id = doc.getFlag(CONFIG.MODULE_ID, "archivistId");
      if (!id) return;
      // No deleteCharacter API currently; we skip or could introduce one in API later
    } catch (e) {
      console.warn("[RTS] preDeleteActor failed", e);
    }
  });
  Hooks.on("preDeleteItem", async (doc) => {
    try {
      if (
        !settingsManager.isRealtimeSyncEnabled?.() ||
        settingsManager.isRealtimeSyncSuppressed?.()
      )
        return;
      const id = doc.getFlag(CONFIG.MODULE_ID, "archivistId");
      if (!id) return;
      if (archivistApi.deleteItem) await archivistApi.deleteItem(apiKey, id);
    } catch (e) {
      console.warn("[RTS] preDeleteItem failed", e);
    }
  });
  Hooks.on("preDeleteJournalEntryPage", async (page) => {
    try {
      if (
        !settingsManager.isRealtimeSyncEnabled?.() ||
        settingsManager.isRealtimeSyncSuppressed?.()
      )
        return;
      const meta = Utils.getPageArchivistMeta(page);
      if (!meta?.id) return;
      if (isRecapPage(page)) return; // Recaps are read-only for delete
      if (isFactionPage(page) && archivistApi.deleteFaction) {
        await archivistApi.deleteFaction(apiKey, meta.id);
      }
      if (isLocationPage(page) && archivistApi.deleteLocation) {
        await archivistApi.deleteLocation(apiKey, meta.id);
      }
      // Character sheets: delete Character in Archivist when custom Character sheet root is deleted
      const parent = page?.parent;
      const flags = parent?.getFlag?.(CONFIG.MODULE_ID, "archivist") || {};
      const isCharacter =
        flags?.sheetType === "pc" ||
        flags?.sheetType === "npc" ||
        flags?.sheetType === "character";
      if (isCharacter && flags.archivistId && archivistApi.deleteCharacter) {
        await archivistApi.deleteCharacter(apiKey, flags.archivistId);
      }
    } catch (e) {
      console.warn("[RTS] preDeleteJournalEntryPage failed", e);
    }
  });

  // Delete custom sheets when the JournalEntry itself is deleted
  Hooks.on("preDeleteJournalEntry", async (entry) => {
    try {
      if (
        !settingsManager.isRealtimeSyncEnabled?.() ||
        settingsManager.isRealtimeSyncSuppressed?.()
      )
        return;
      const flags = entry.getFlag(CONFIG.MODULE_ID, "archivist") || {};
      const id = flags?.archivistId;
      const st = String(flags?.sheetType || "").toLowerCase();
      if (!id) return;
      if (st === "recap") return; // Never create/delete recaps
      if (
        (st === "pc" || st === "npc" || st === "character") &&
        archivistApi.deleteCharacter
      ) {
        await archivistApi.deleteCharacter(apiKey, id);
      } else if (st === "item" && archivistApi.deleteItem) {
        await archivistApi.deleteItem(apiKey, id);
      } else if (st === "location" && archivistApi.deleteLocation) {
        await archivistApi.deleteLocation(apiKey, id);
      } else if (st === "faction" && archivistApi.deleteFaction) {
        await archivistApi.deleteFaction(apiKey, id);
      }
    } catch (e) {
      console.warn("[RTS] preDeleteJournalEntry failed", e);
    }
  });
}

// Header controls (v13): add quick-create buttons to Journal Directory
Hooks.on("getJournalDirectoryHeaderButtons", (app, buttons) => {
  try {
    // Only show create buttons if world is initialized
    const isWorldInitialized = settingsManager.isWorldInitialized?.();
    if (!isWorldInitialized) return;
    if (!game.user?.isGM) return;

    const promptForName = async (title) => {
      try {
        const name = await foundry.applications.api.DialogV2.prompt({
          window: { title },
          content: `
            <div class="form-group">
              <label>Name:</label>
              <input type="text" name="name" placeholder="Enter name..." autofocus style="width: 100%;" />
            </div>
          `,
          ok: {
            icon: '<i class="fas fa-check"></i>',
            label: "Create",
            callback: (event, button) => {
              const enteredName = button.form.elements.name.value.trim();
              return enteredName || null;
            },
          },
          cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" },
          rejectClose: true,
        });
        return name;
      } catch (_) {
        return null;
      }
    };

    const make = (key, label, icon) => ({
      class: `archivist-header-create-${key}`,
      label,
      icon,
      onclick: async (ev) => {
        ev?.preventDefault?.();
        try {
          const worldId = settingsManager.getSelectedWorldId?.();
          const name = await promptForName(`Create ${label}`);
          if (!name) return;
          let journal = null;
          if (key === "pc")
            journal = await Utils.createPcJournal({ name, worldId });
          else if (key === "npc")
            journal = await Utils.createNpcJournal({ name, worldId });
          else if (key === "item")
            journal = await Utils.createItemJournal({ name, worldId });
          else if (key === "location")
            journal = await Utils.createLocationJournal({ name, worldId });
          else if (key === "faction")
            journal = await Utils.createFactionJournal({ name, worldId });
          // Open the newly created sheet and bring it to front
          if (journal) {
            journal.sheet?.render?.(true);
            setTimeout(() => journal.sheet?.bringToFront?.(), 50);
          }
        } catch (e) {
          console.warn("[Archivist Sync] header create failed", e);
        }
      },
    });

    // Add buttons to the left of default controls (unshift to place first)
    buttons.unshift(make("faction", "Faction", "fas fa-people-group"));
    buttons.unshift(make("location", "Location", "fas fa-location-dot"));
    buttons.unshift(make("item", "Item", "fas fa-gem"));
    buttons.unshift(make("npc", "NPC", "fas fa-user-ninja"));
    buttons.unshift(make("pc", "PC", "fas fa-user"));
  } catch (e) {
    console.warn("[Archivist Sync] getJournalDirectoryHeaderButtons failed", e);
  }
});

// Inject inline visibility toggle buttons (GM-only) into Journal Directory rows
Hooks.on("renderJournalDirectory", (app, html) => {
  try {
    if (!game.user?.isGM) return;
    const root = html instanceof jQuery ? html[0] : html?.element || html;
    if (!root) return;
    const list =
      root.querySelector("ol.directory-list") ||
      root.querySelector(".directory-list") ||
      root;
    const items = list.querySelectorAll(
      "li[data-document-id], li.directory-item, li.document, li.journal-entry"
    );
    const OBS = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    const NON = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
    items.forEach((li) => {
      try {
        const id =
          li.getAttribute("data-document-id") ||
          li.getAttribute("data-entry-id");
        if (!id) return;
        if (li.querySelector(".archivist-eye")) return;
        const j = game.journal?.get?.(id);
        if (!j) return;
        // Only render for Archivist custom sheets (identified by our flags)
        let isCustom = false;
        try {
          const f = j.getFlag(CONFIG.MODULE_ID, "archivist") || {};
          isCustom = !!(f.archivistId || f.sheetType);
        } catch (_) {
          isCustom = false;
        }
        if (!isCustom) return;
        const cur = Number(j?.ownership?.default ?? NON);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "archivist-eye";
        const icon = document.createElement("i");
        icon.className = cur >= OBS ? "fas fa-eye" : "fas fa-eye-slash";
        btn.title = cur >= OBS ? "Hide from Players" : "Show to Players";
        btn.appendChild(icon);
        btn.addEventListener("click", async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          try {
            const now = Number(j?.ownership?.default ?? NON);
            const next = now >= OBS ? NON : OBS;
            await j.update({ ownership: { default: next } });
            icon.className = next >= OBS ? "fas fa-eye" : "fas fa-eye-slash";
            btn.title = next >= OBS ? "Hide from Players" : "Show to Players";
          } catch (_) {}
        });
        // Append to the end of the row
        li.appendChild(btn);
      } catch (_) {}
    });
  } catch (_) {}
});
