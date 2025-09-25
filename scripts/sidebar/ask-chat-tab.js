import { AskChatWindow } from '../dialogs/ask-chat-window.js';

const TAB_ID = 'archivist-chat';
const ICON = 'archivist-icon';
const LABEL = () => game.i18n.localize('ARCHIVIST_SYNC.Menu.AskChat.Label') || 'Archivist Chat';

let chatApp = null;
let delegatesInstalled = false;

function getSidebarContainers(sidebarRoot) {
    const sidebar = sidebarRoot || document.getElementById('sidebar');
    if (!sidebar) return { tabsNav: null, contentWrap: null };

    const tabsNav = sidebar.querySelector('#sidebar-tabs, nav.tabs') || document.querySelector('#sidebar #sidebar-tabs, #sidebar nav.tabs');

    // Foundry versions differ: try multiple options and fall back to deriving from an existing tab
    let contentWrap = sidebar.querySelector('#sidebar-content, section.content, .content');
    if (!contentWrap) {
        const anyPanel = sidebar.querySelector('section.tab, .tab');
        if (anyPanel && anyPanel.parentElement) contentWrap = anyPanel.parentElement;
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
    const sidebar = (sidebarHtml && sidebarHtml[0]) ? sidebarHtml[0] : (sidebarHtml || document.getElementById('sidebar'));
    if (!sidebar) return;

    const { tabsNav, contentWrap } = getSidebarContainers(sidebar);
    if (!tabsNav || !contentWrap) {
        console.warn('[Archivist Sync] Sidebar tabs or content wrapper not found. tabsNav?', !!tabsNav, 'contentWrap?', !!contentWrap);
        return;
    }

    // Add nav icon if missing
    if (!tabsNav.querySelector(`[data-tab="${TAB_ID}"]`)) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ui-control plain icon';
        btn.setAttribute('data-action', 'tab');
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-controls', TAB_ID);
        btn.setAttribute('data-group', tabsNav.getAttribute('data-group') || 'primary');
        btn.dataset.tab = TAB_ID;
        btn.setAttribute('aria-label', LABEL());
        btn.setAttribute('data-tooltip', LABEL());
        btn.setAttribute('data-tooltip-direction', 'RIGHT');

        // Use a standard Font Awesome icon to match core button styling
        const i = document.createElement('i');
        i.className = 'fa-solid fa-sparkles';
        btn.appendChild(i);

        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            try { ui.sidebar?.expand?.(); } catch (_) { /* no-op */ }
            openArchivistChatTab();
        });

        li.appendChild(btn);
        const menu = tabsNav.querySelector('menu.flexcol') || tabsNav;
        menu.appendChild(li);
    }

    // Add content panel if missing
    if (!contentWrap.querySelector(`#${TAB_ID}.tab`)) {
        const panel = document.createElement('section');
        panel.id = TAB_ID;
        panel.className = 'tab sidebar-tab';
        panel.dataset.tab = TAB_ID;
        panel.style.height = '100%';
        panel.style.overflow = 'hidden auto';
        contentWrap.appendChild(panel);
    }
}

/**
 * Install delegated click handler so that when the Archivist tab button is
 * clicked (whether created by us or by core Sidebar), we render our content
 * and ensure the panel becomes active. Safe to call multiple times.
 */
export function installArchivistChatDelegates() {
    if (delegatesInstalled) return;
    delegatesInstalled = true;
    document.addEventListener('click', (ev) => {
        try {
            // Only react to clicks on the NAV TAB BUTTON, not inside the content panel
            const btn = ev.target && (ev.target.closest?.(`#sidebar nav.tabs [data-action="tab"][data-tab="${TAB_ID}"]`)
                || ev.target.closest?.(`#sidebar #sidebar-tabs [data-action="tab"][data-tab="${TAB_ID}"]`)
                || null);
            if (!btn) return;
            // Defer slightly to let core toggle states, then render our UI
            setTimeout(() => { try { openArchivistChatTab(); } catch (_) { } }, 0);
        } catch (_) { }
    }, true);

    // When any other tab button is clicked, hide our panel so it doesn't share the layout
    document.addEventListener('click', (ev) => {
        try {
            const otherBtn = ev.target && (ev.target.closest?.(`#sidebar [data-action="tab"][data-tab]`) || null);
            if (!otherBtn) return;
            if (otherBtn.dataset?.tab === TAB_ID) return; // handled above
            const sidebar = document.getElementById('sidebar');
            const { contentWrap } = getSidebarContainers(sidebar);
            const panel = contentWrap?.querySelector(`#${TAB_ID}.tab`);
            if (panel) {
                panel.classList.remove('active');
                panel.style.display = 'none';
            }
        } catch (_) { }
    }, true);
}

/**
 * If the core Sidebar rendered a <template id="archivist-chat"> placeholder
 * (from Sidebar.TABS), replace it with a real <section> container so we can
 * mount our chat UI.
 */
export function ensureChatSlot() {
    const sidebar = document.getElementById('sidebar');
    const { contentWrap } = getSidebarContainers(sidebar);
    if (!contentWrap) return;
    const tpl = contentWrap.querySelector('template#archivist-chat, template[data-tab="archivist-chat"]');
    if (tpl) {
        const panel = document.createElement('section');
        panel.id = TAB_ID;
        panel.className = 'tab sidebar-tab';
        panel.dataset.tab = TAB_ID;
        panel.style.height = '100%';
        panel.style.overflow = 'hidden auto';
        tpl.replaceWith(panel);
    }
}

/**
 * Activate our tab and render the AskChatWindow inside the sidebar drawer.
 */
export async function openArchivistChatTab() {
    const sidebar = document.getElementById('sidebar');
    ensureChatSlot();
    const { tabsNav, contentWrap } = getSidebarContainers(sidebar);
    const panel = contentWrap?.querySelector(`#${TAB_ID}.tab`) || sidebar?.querySelector(`#${TAB_ID}.tab`);
    if (!tabsNav || !contentWrap) return;
    // If panel is missing, create it now
    let targetPanel = panel;
    if (!targetPanel) {
        const p = document.createElement('section');
        p.id = TAB_ID;
        p.className = 'tab sidebar-tab';
        p.dataset.tab = TAB_ID;
        contentWrap.appendChild(p);
        targetPanel = p;
    }

    // Expand drawer and mark active
    try { ui.sidebar?.expand?.(); } catch (_) { /* no-op */ }

    // Ask core Sidebar to activate our tab when possible, else fall back
    try {
        if (ui.sidebar?.changeTab) {
            ui.sidebar.changeTab(TAB_ID);
        } else {
            // Fallback: manually toggle aria + active states
            tabsNav.querySelectorAll('[data-action="tab"]').forEach(el => {
                el.setAttribute('aria-pressed', 'false');
                el.setAttribute('aria-selected', 'false');
            });
            contentWrap.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
            const myBtn = tabsNav.querySelector(`[data-tab="${TAB_ID}"]`);
            if (myBtn) {
                myBtn.setAttribute('aria-pressed', 'true');
                myBtn.setAttribute('aria-selected', 'true');
                myBtn.classList?.add?.('active');
            }
            targetPanel.classList.add('active');
        }
    } catch (_) { targetPanel.classList.add('active'); }

    // Ensure activation no matter what core did
    try {
        contentWrap.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
        targetPanel.style.display = '';
        targetPanel.classList.add('active');
        const myBtn = tabsNav.querySelector(`[data-tab="${TAB_ID}"]`);
        if (myBtn) {
            myBtn.setAttribute('aria-pressed', 'true');
            myBtn.setAttribute('aria-selected', 'true');
            myBtn.classList?.add?.('active');
        }
    } catch (_) { }

    // Render chat UI using existing Application logic, mounted inline
    if (!chatApp) chatApp = new AskChatWindow({ popOut: false });
    chatApp._mountEl = targetPanel; // private host reference for incremental updates

    const data = await chatApp.getData();
    const html = await foundry.applications.handlebars.renderTemplate('modules/archivist-sync/templates/ask-chat-window.hbs', data);
    targetPanel.innerHTML = html;

    chatApp.activateListeners(targetPanel);

    const msgList = targetPanel.querySelector('.messages');
    if (msgList) msgList.scrollTop = msgList.scrollHeight;
}
