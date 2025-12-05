import { AskChatWindow } from '../dialogs/ask-chat-window.js';

export class AskChatSidebarTab extends foundry.applications.sidebar
  .AbstractSidebarTab {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    foundry.utils.deepClone(super.DEFAULT_OPTIONS),
    {
      id: 'archivist-chat',
      title:
        game.i18n?.localize?.('ARCHIVIST_SYNC.Menu.AskChat.Label') ??
        'Archivist Chat',
      icon: 'fa-solid fa-sparkles',
      tooltip:
        game.i18n?.localize?.('ARCHIVIST_SYNC.Menu.AskChat.Label') ??
        'Archivist Chat',
      group: 'primary',
      contentTemplate: 'modules/archivist-sync/templates/ask-chat-window.hbs',
      popOut: false,
    }
  );

  async getData(options) {
    try {
      console.log('[Archivist Sync][SidebarTab] getData()', { options });
    } catch (_) {}
    if (!this.chatApp) this.chatApp = new AskChatWindow({ popOut: false });
    return this.chatApp.getData();
  }

  async activateListeners(html) {
    try {
      console.log('[Archivist Sync][SidebarTab] activateListeners()', { html });
    } catch (_) {}
    super.activateListeners(html);
    if (!this.chatApp) this.chatApp = new AskChatWindow({ popOut: false });
    const el = this.element;
    if (el) {
      el.style.height = '100%';
      el.style.overflow = 'hidden auto';
      // Mount and render the chat UI into the sidebar panel
      this.chatApp._mountEl = el;
      await this.chatApp.render(false);
      const msgList = el.querySelector?.('.messages');
      if (msgList) msgList.scrollTop = msgList.scrollHeight;
      console.log('[Archivist Sync][SidebarTab] content mounted');
    }
  }
}

export default AskChatSidebarTab;
