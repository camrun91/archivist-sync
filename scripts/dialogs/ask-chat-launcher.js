import { AskChatWindow } from './ask-chat-window.js';

/**
 * Minimal launcher used solely to satisfy Settings menu requirements.
 * When opened from the Settings menu, it immediately opens the real chat window
 * and then closes itself.
 */
export class AskChatLauncher extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'archivist-ask-chat-launcher',
      title: game.i18n.localize('ARCHIVIST_SYNC.chat.title'),
      template: 'modules/archivist-sync/templates/empty.hbs',
      width: 1,
      height: 1,
      popOut: true,
    });
  }

  getData() {
    return {};
  }

  async render(force, options) {
    const result = await super.render(force, options);
    try {
      new AskChatWindow().render(true);
    } finally {
      // Close immediately to avoid showing a redundant window
      this.close({ force: true });
    }
    return result;
  }
}

export default AskChatLauncher;
