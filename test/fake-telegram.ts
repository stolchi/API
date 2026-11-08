import type { BotIdentity } from '../src/telegram/telegram-api.js';
import { TelegramRefused } from '../src/telegram/telegram-api.js';

export interface SentMessage {
  token: string;
  chatId: string;
  text: string;
  openApp?: { text: string; url: string };
}

/** Stands in for Telegram: records what the platform asked, and refuses on cue. */
export class FakeTelegramApi {
  sent: SentMessage[] = [];
  webhooks: { token: string; url: string; secret: string }[] = [];
  menuButtons: { token: string; url: string }[] = [];
  deleted: string[] = [];
  /** Telegram's answer to the next setWebhook, when it should fail. */
  webhookError: string | null = null;

  reset(): void {
    this.sent = [];
    this.webhooks = [];
    this.menuButtons = [];
    this.deleted = [];
    this.webhookError = null;
  }

  getMe(token: string): Promise<BotIdentity> {
    if (token.includes('REVOKED')) {
      return Promise.reject(new TelegramRefused('Unauthorized'));
    }
    const id = Number(token.split(':')[0]);
    return Promise.resolve({ id, username: `bot${id}_bot` });
  }

  setWebhook(token: string, url: string, secret: string): Promise<void> {
    if (this.webhookError) {
      const error = this.webhookError;
      this.webhookError = null;
      return Promise.reject(new TelegramRefused(error));
    }
    this.webhooks.push({ token, url, secret });
    return Promise.resolve();
  }

  deleteWebhook(token: string): Promise<void> {
    this.deleted.push(token);
    return Promise.resolve();
  }

  setMenuButton(token: string, _text: string, url: string): Promise<void> {
    this.menuButtons.push({ token, url });
    return Promise.resolve();
  }

  sendMessage(
    token: string,
    chatId: number | string,
    text: string,
    options: { openApp?: { text: string; url: string } } = {},
  ): Promise<void> {
    this.sent.push({ token, chatId: String(chatId), text, ...options });
    return Promise.resolve();
  }
}
