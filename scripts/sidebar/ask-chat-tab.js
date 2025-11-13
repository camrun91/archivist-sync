import { AskChatWindow } from "../dialogs/ask-chat-window.js";

const TAB_ID = "archivist-chat";
const LABEL = () =>
  game.i18n.localize("ARCHIVIST_SYNC.Menu.AskChat.Label") || "Archivist Chat";

let chatApp = null;
let delegatesInstalled = false;

function getSidebarContainers(sidebarRoot) {
  const sidebar = sidebarRoot || document.getElementById("sidebar");
  if (!sidebar) return { tabsNav: null, contentWrap: null };

  const tabsNav =
    sidebar.querySelector("#sidebar-tabs, nav.tabs") ||
    document.querySelector("#sidebar #sidebar-tabs, #sidebar nav.tabs");

  // Foundry versions differ: try multiple options and fall back to deriving from an existing tab
  let contentWrap = sidebar.querySelector(
    "#sidebar-content, section.content, .content"
  );
  if (!contentWrap) {
    const anyPanel = sidebar.querySelector("section.tab, .tab");
    if (anyPanel && anyPanel.parentElement)
      contentWrap = anyPanel.parentElement;
  }

  return { tabsNav, contentWrap };
}

/**
 * Ensure our sidebar tab button and content container exist (idempotent).
 * Safe to call on ready and on sidebar re-renders.
 * @param {HTMLElement|JQuery} sidebarHtml
 */
export function registerArchivistSidebarTab(sidebarHtml) {
  // Support HTMLElement or jQuery-like objects without referencing jQuery global
  const sidebar =
    sidebarHtml && sidebarHtml[0]
      ? sidebarHtml[0]
      : sidebarHtml || document.getElementById("sidebar");
  if (!sidebar) return;

  const { tabsNav, contentWrap } = getSidebarContainers(sidebar);
  if (!tabsNav || !contentWrap) {
    console.warn(
      "[Archivist Sync] Sidebar tabs or content wrapper not found. tabsNav?",
      !!tabsNav,
      "contentWrap?",
      !!contentWrap
    );
    return;
  }

  // Add nav icon if missing
  if (!tabsNav.querySelector(`[data-tab="${TAB_ID}"]`)) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ui-control plain icon";
    btn.setAttribute("data-action", "tab");
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-controls", TAB_ID);
    btn.setAttribute(
      "data-group",
      tabsNav.getAttribute("data-group") || "primary"
    );
    btn.dataset.tab = TAB_ID;
    btn.setAttribute("aria-label", LABEL());
    btn.setAttribute("data-tooltip", LABEL());
    btn.setAttribute("data-tooltip-direction", "RIGHT");

    // Use a standard Font Awesome icon to match core button styling
    const i = document.createElement("i");
    i.className = "fa-solid fa-sparkles";
    btn.appendChild(i);

    btn.addEventListener("click", (ev) => {
      ev.preventDefault();

      // Check if this tab is already active and sidebar is expanded
      const sidebar = ui.sidebar;
      const isActive =
        btn.getAttribute("aria-selected") === "true" ||
        btn.classList.contains("active");
      const isExpanded = sidebar?._expanded;

      // If tab is already active and sidebar is expanded, collapse it
      if (isActive && isExpanded) {
        try {
          sidebar.collapse();
        } catch (_) {
          // Fallback for older API
          try {
            sidebar.toggleExpanded?.(false);
          } catch (_) {
            /* no-op */
          }
        }
      } else {
        // Otherwise, expand and open the tab
        try {
          sidebar?.expand?.();
        } catch (_) {
          /* no-op */
        }
        openArchivistChatTab();
      }
    });

    li.appendChild(btn);
    const menu = tabsNav.querySelector("menu.flexcol") || tabsNav;
    menu.appendChild(li);
  }

  // Add content panel if missing
  if (!contentWrap.querySelector(`#${TAB_ID}.tab`)) {
    const panel = document.createElement("section");
    panel.id = TAB_ID;
    panel.className = "tab sidebar-tab";
    panel.dataset.tab = TAB_ID;
    panel.style.height = "100%";
    panel.style.overflow = "hidden auto";
    contentWrap.appendChild(panel);
  }
}

/**
 * Install delegated click handler so that when the Archivist tab button is
 * clicked (whether created by us or by core Sidebar), we render our content
 * and ensure the panel becomes active. Safe to call multiple times.
 */
export function installArchivistChatDelegates() {
  console.log(
    "[Archivist Sync] installArchivistChatDelegates - START, delegatesInstalled:",
    delegatesInstalled
  );
  if (delegatesInstalled) {
    console.log(
      "[Archivist Sync] installArchivistChatDelegates - already installed, returning"
    );
    return;
  }
  delegatesInstalled = true;
  console.log(
    "[Archivist Sync] installArchivistChatDelegates - setting delegatesInstalled to true"
  );

  const sidebar = document.getElementById("sidebar");
  console.log(
    "[Archivist Sync] installArchivistChatDelegates - sidebar element:",
    sidebar
  );
  const tabsNav = sidebar?.querySelector?.("#sidebar-tabs, nav.tabs");
  console.log(
    "[Archivist Sync] installArchivistChatDelegates - tabsNav element:",
    tabsNav
  );
  if (!tabsNav) {
    console.warn(
      "[Archivist Sync] Sidebar tabs nav not found, skipping delegate installation"
    );
    return;
  }

  // Handle clicks on the archivist-chat tab button
  console.log(
    "[Archivist Sync] installArchivistChatDelegates - About to attach first click listener"
  );
  tabsNav.addEventListener("click", (ev) => {
    // CRITICAL: Ignore clicks on dice roll cards or any elements inside them
    // This prevents interference with CoC7's dice roll expansion
    const isInDiceRoll = ev.target?.closest?.(
      ".chat-card, .roll-card, .card-buttons, .dice-roll, .dice-result, .dice-formula, .roll-result, .dice-tooltip"
    );
    if (isInDiceRoll) {
      console.log(
        "[Archivist Sync] installArchivistChatDelegates - ignoring click on dice roll card, not touching event"
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
          "[Archivist Sync] installArchivistChatDelegates - click is in chat content but not on tab button, ignoring"
        );
        return;
      }
    }

    console.log(
      "[Archivist Sync] installArchivistChatDelegates click FIRED - target:",
      ev.target,
      "currentTarget:",
      ev.currentTarget
    );
    console.log(
      "[Archivist Sync] installArchivistChatDelegates - target tagName:",
      ev.target?.tagName,
      "className:",
      ev.target?.className
    );
    try {
      // Only handle clicks on our specific tab button
      const btn = ev.target.closest?.(
        `button[data-action="tab"][data-tab="${TAB_ID}"]`
      );
      console.log(
        "[Archivist Sync] installArchivistChatDelegates - closest button result:",
        btn
      );
      if (!btn) {
        console.log(
          "[Archivist Sync] installArchivistChatDelegates - no matching button, returning early"
        );
        return;
      }
      console.log(
        "[Archivist Sync] installArchivistChatDelegates - MATCHED archivist-chat button, proceeding"
      );

      // Check if this tab is already active and sidebar is expanded
      const sidebar = ui.sidebar;
      const isActive =
        btn.getAttribute("aria-selected") === "true" ||
        btn.classList.contains("active");
      const isExpanded = sidebar?._expanded;

      // If tab is already active and sidebar is expanded, collapse it
      if (isActive && isExpanded) {
        ev.preventDefault();
        ev.stopPropagation();
        try {
          sidebar.collapse();
        } catch (_) {
          // Fallback for older API
          try {
            sidebar.toggleExpanded?.(false);
          } catch (_) {
            /* no-op */
          }
        }
      } else {
        // Otherwise, defer slightly to let core toggle states, then render our UI
        setTimeout(() => {
          try {
            openArchivistChatTab();
          } catch (_) {}
        }, 0);
      }
    } catch (e) {
      console.error(
        "[Archivist Sync] installArchivistChatDelegates - error in first handler:",
        e
      );
    }
  });
  console.log(
    "[Archivist Sync] installArchivistChatDelegates - Successfully attached first click listener"
  );

  // When any other tab button is clicked, hide our panel so it doesn't share the layout
  console.log(
    "[Archivist Sync] installArchivistChatDelegates - About to attach second click listener"
  );
  tabsNav.addEventListener("click", (ev) => {
    // CRITICAL: Ignore clicks on dice roll cards or any elements inside them
    // This prevents interference with CoC7's dice roll expansion
    const isInDiceRoll = ev.target?.closest?.(
      ".chat-card, .roll-card, .card-buttons, .dice-roll, .dice-result, .dice-formula, .roll-result, .dice-tooltip"
    );
    if (isInDiceRoll) {
      console.log(
        "[Archivist Sync] installArchivistChatDelegates second - ignoring click on dice roll card, not touching event"
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
          "[Archivist Sync] installArchivistChatDelegates second - click is in chat content but not on tab button, ignoring"
        );
        return;
      }
    }

    console.log(
      "[Archivist Sync] installArchivistChatDelegates second click FIRED - target:",
      ev.target,
      "currentTarget:",
      ev.currentTarget
    );
    console.log(
      "[Archivist Sync] installArchivistChatDelegates second - target tagName:",
      ev.target?.tagName,
      "className:",
      ev.target?.className
    );
    try {
      // Only handle clicks on tab buttons that are NOT archivist-chat
      const otherBtn = ev.target.closest?.(
        `button[data-action="tab"][data-tab]`
      );
      console.log(
        "[Archivist Sync] installArchivistChatDelegates second - closest button result:",
        otherBtn
      );
      if (!otherBtn) {
        console.log(
          "[Archivist Sync] installArchivistChatDelegates second - no matching button, returning early"
        );
        return;
      }
      console.log(
        "[Archivist Sync] installArchivistChatDelegates second - button tabId:",
        otherBtn.dataset?.tab
      );
      if (otherBtn.dataset?.tab === TAB_ID) {
        console.log(
          "[Archivist Sync] installArchivistChatDelegates second - is archivist-chat, returning (handled above)"
        );
        return; // handled above
      }
      console.log(
        "[Archivist Sync] installArchivistChatDelegates second - MATCHED other tab button, proceeding"
      );

      const sidebar = document.getElementById("sidebar");
      const { contentWrap } = getSidebarContainers(sidebar);
      const panel = contentWrap?.querySelector(`#${TAB_ID}.tab`);
      if (panel) {
        panel.classList.remove("active");
        panel.style.display = "none";
      }
    } catch (e) {
      console.error(
        "[Archivist Sync] installArchivistChatDelegates - error in second handler:",
        e
      );
    }
  });
  console.log(
    "[Archivist Sync] installArchivistChatDelegates - Successfully attached second click listener"
  );
  console.log("[Archivist Sync] installArchivistChatDelegates - COMPLETE");
}

/**
 * If the core Sidebar rendered a <template id="archivist-chat"> placeholder
 * (from Sidebar.TABS), replace it with a real <section> container so we can
 * mount our chat UI.
 */
export function ensureChatSlot() {
  const sidebar = document.getElementById("sidebar");
  const { contentWrap } = getSidebarContainers(sidebar);
  if (!contentWrap) return;
  const tpl = contentWrap.querySelector(
    'template#archivist-chat, template[data-tab="archivist-chat"]'
  );
  if (tpl) {
    const panel = document.createElement("section");
    panel.id = TAB_ID;
    panel.className = "tab sidebar-tab";
    panel.dataset.tab = TAB_ID;
    panel.style.height = "100%";
    panel.style.overflow = "hidden auto";
    tpl.replaceWith(panel);
  }
}

/**
 * Activate our tab and render the AskChatWindow inside the sidebar drawer.
 */
export async function openArchivistChatTab() {
  const sidebar = document.getElementById("sidebar");
  ensureChatSlot();
  const { tabsNav, contentWrap } = getSidebarContainers(sidebar);
  const panel =
    contentWrap?.querySelector(`#${TAB_ID}.tab`) ||
    sidebar?.querySelector(`#${TAB_ID}.tab`);
  if (!tabsNav || !contentWrap) return;
  // If panel is missing, create it now
  let targetPanel = panel;
  if (!targetPanel) {
    const p = document.createElement("section");
    p.id = TAB_ID;
    p.className = "tab sidebar-tab";
    p.dataset.tab = TAB_ID;
    contentWrap.appendChild(p);
    targetPanel = p;
  }

  // Expand drawer and mark active
  try {
    ui.sidebar?.expand?.();
  } catch (_) {
    /* no-op */
  }

  // Ask core Sidebar to activate our tab when possible, else fall back
  try {
    if (ui.sidebar?.changeTab) {
      ui.sidebar.changeTab(TAB_ID);
    } else {
      // Fallback: manually toggle aria + active states
      tabsNav.querySelectorAll('[data-action="tab"]').forEach((el) => {
        el.setAttribute("aria-pressed", "false");
        el.setAttribute("aria-selected", "false");
      });
      contentWrap
        .querySelectorAll(".tab")
        .forEach((el) => el.classList.remove("active"));
      const myBtn = tabsNav.querySelector(`[data-tab="${TAB_ID}"]`);
      if (myBtn) {
        myBtn.setAttribute("aria-pressed", "true");
        myBtn.setAttribute("aria-selected", "true");
        myBtn.classList?.add?.("active");
      }
      targetPanel.classList.add("active");
    }
  } catch (_) {
    targetPanel.classList.add("active");
  }

  // Ensure activation no matter what core did
  try {
    contentWrap
      .querySelectorAll(".tab")
      .forEach((el) => el.classList.remove("active"));
    targetPanel.style.display = "";
    targetPanel.classList.add("active");
    const myBtn = tabsNav.querySelector(`[data-tab="${TAB_ID}"]`);
    if (myBtn) {
      myBtn.setAttribute("aria-pressed", "true");
      myBtn.setAttribute("aria-selected", "true");
      myBtn.classList?.add?.("active");
    }
  } catch (_) {}

  // Render chat UI using existing Application logic, mounted inline
  if (!chatApp) chatApp = new AskChatWindow({ popOut: false });
  chatApp._mountEl = targetPanel; // private host reference for incremental updates

  const data = await chatApp.getData();
  const html = await foundry.applications.handlebars.renderTemplate(
    "modules/archivist-sync/templates/ask-chat-window.hbs",
    data
  );
  targetPanel.innerHTML = html;

  chatApp.activateListeners(targetPanel);

  const msgList = targetPanel.querySelector(".messages");
  if (msgList) msgList.scrollTop = msgList.scrollHeight;
}
