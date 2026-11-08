import { Injectable } from '@nestjs/common';
import { Api, GrammyError, InlineKeyboard } from 'grammy';

export interface BotIdentity {
  id: number;
  username: string;
}

/** A Telegram refusal, with Telegram's own words for the settings page. */
export class TelegramRefused extends Error {}

const refused = (error: unknown): never => {
  if (error instanceof GrammyError)
    throw new TelegramRefused(error.description);
  throw error;
};

/**
 * Everything the platform asks of Telegram, in one place so tests can stand in for it.
 * One backend serves many bots, so each call names the bot's token.
 */
@Injectable()
export class TelegramApi {
  async getMe(token: string): Promise<BotIdentity> {
    const me = await new Api(token).getMe().catch(refused);
    return { id: me.id, username: me.username };
  }

  async setWebhook(token: string, url: string, secret: string): Promise<void> {
    await new Api(token)
      .setWebhook(url, {
        secret_token: secret,
        allowed_updates: ['message'],
        drop_pending_updates: true,
      })
      .catch(refused);
  }

  async deleteWebhook(token: string): Promise<void> {
    await new Api(token).deleteWebhook().catch(refused);
  }

  /** The button beside the message field that opens the menu. */
  async setMenuButton(token: string, text: string, url: string): Promise<void> {
    await new Api(token)
      .setChatMenuButton({
        menu_button: { type: 'web_app', text, web_app: { url } },
      })
      .catch(refused);
  }

  async sendMessage(
    token: string,
    chatId: number | string,
    text: string,
    options: { openApp?: { text: string; url: string } } = {},
  ): Promise<void> {
    await new Api(token)
      .sendMessage(chatId, text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(options.openApp && {
          reply_markup: new InlineKeyboard().webApp(
            options.openApp.text,
            options.openApp.url,
          ),
        }),
      })
      .catch(refused);
  }
}
