import { registerArchivistSidebarTab, openArchivistChatTab } from '../sidebar/ask-chat-tab.js';
import { AskChatWindow } from './ask-chat-window.js';

/**
 * Minimal ApplicationV2 used only to satisfy Settings menu requirements.
 * When opened, it activates the sidebar chat tab and immediately closes.
 */
export class AskChatMenu extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: 'archivist-ask-chat-menu',
    title: 'Archivist Chat',
    template: 'modules/archivist-sync/templates/empty.hbs',
    width: 1,
    height: 1,
    popOut: true,
  });

  /** @override */
  _onRender(context, options) {
    try {
      // Ensure the tab is present, then try to open it
      try {
        registerArchivistSidebarTab(document.getElementById('sidebar'));
      } catch (_) {
        /* no-op */
      }
      openArchivistChatTab();
    } finally {
      this.close({ force: true });
    }
  }
}

export default AskChatMenu;
