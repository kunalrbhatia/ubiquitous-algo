import env from '../schemas/env';
import logger from '../logging/logger';

export interface INotifier {
  send(message: string): Promise<void>;
}

export class Notifier implements INotifier {
  async send(message: string): Promise<void> {
    logger.info(`Notification: ${message}`);

    const promises: Promise<void>[] = [];

    if (env.TELEGRAM_ENABLED && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      promises.push(this.sendTelegram(message));
    }

    if (env.SLACK_ENABLED && env.SLACK_WEBHOOK_URL) {
      promises.push(this.sendSlack(message));
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  private async sendTelegram(message: string): Promise<void> {
    const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: message,
        }),
      });

      if (!response.ok) {
        logger.error(`Telegram notification failed: ${response.statusText}`);
      }
    } catch (err: unknown) {
      /* istanbul ignore next */
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Error sending Telegram notification: ${msg}`);
    }
  }

  private async sendSlack(message: string): Promise<void> {
    try {
      const response = await fetch(env.SLACK_WEBHOOK_URL!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });

      if (!response.ok) {
        logger.error(`Slack notification failed: ${response.statusText}`);
      }
    } catch (err: unknown) {
      /* istanbul ignore next */
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Error sending Slack notification: ${msg}`);
    }
  }
}

export const notifier = new Notifier();
export default notifier;
