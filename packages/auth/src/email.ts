import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

/**
 * OTP email delivery.
 *
 * One interface, two implementations: AWS SES for real environments and a
 * console sender for local development so the auth flow is exercisable
 * without AWS credentials.
 */

export type OtpType = "sign-in" | "email-verification" | "forget-password" | "change-email";

export interface SendOtpParams {
  to: string;
  otp: string;
  type: OtpType;
  expiresInMinutes: number;
}

export interface EmailSender {
  sendOtp(params: SendOtpParams): Promise<void>;
}

interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

function renderOtpEmail({ otp, type, expiresInMinutes }: SendOtpParams): RenderedEmail {
  const purpose: Record<OtpType, string> = {
    "sign-in": "sign in to Lighthouse",
    "email-verification": "verify your email address",
    "forget-password": "reset your Lighthouse password",
    "change-email": "confirm your new email address",
  };

  const subject = `Lighthouse verification code: ${otp}`;
  const action = purpose[type];
  const text = [
    `Your Lighthouse verification code is ${otp}.`,
    "",
    `Enter this code to ${action}. It expires in ${expiresInMinutes} minutes.`,
    "",
    "If you did not request this code, you can ignore this email.",
  ].join("\n");

  const html = [
    '<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5">',
    `<p>Your Lighthouse verification code is:</p>`,
    `<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0">${otp}</p>`,
    `<p>Enter this code to ${action}. It expires in ${expiresInMinutes} minutes.</p>`,
    '<p style="color:#666;font-size:13px">If you did not request this code, you can ignore this email.</p>',
    "</div>",
  ].join("");

  return { subject, text, html };
}

export interface SesEmailSenderConfig {
  /** Verified SES identity, e.g. "Lighthouse <no-reply@teambespin.us>". */
  fromAddress: string;
  region: string;
  /** Optional SES configuration set for dedicated event tracking. */
  configurationSetName?: string;
  /** Injectable for tests; defaults to the ambient credential chain. */
  client?: SESv2Client;
}

export function createSesEmailSender(config: SesEmailSenderConfig): EmailSender {
  const client = config.client ?? new SESv2Client({ region: config.region });

  return {
    async sendOtp(params) {
      const { subject, text, html } = renderOtpEmail(params);

      await client.send(
        new SendEmailCommand({
          FromEmailAddress: config.fromAddress,
          Destination: { ToAddresses: [params.to] },
          ConfigurationSetName: config.configurationSetName,
          Content: {
            Simple: {
              Subject: { Data: subject, Charset: "UTF-8" },
              Body: {
                Text: { Data: text, Charset: "UTF-8" },
                Html: { Data: html, Charset: "UTF-8" },
              },
            },
          },
        }),
      );
    },
  };
}

/**
 * Development sender: prints the code instead of sending mail.
 * Refuses to run when NODE_ENV is production so it can never silently
 * become the delivery mechanism in a deployed environment.
 */
export function createConsoleEmailSender(): EmailSender {
  if (process.env.NODE_ENV === "production") {
    throw new Error("createConsoleEmailSender must not be used in production");
  }

  return {
    async sendOtp({ to, otp, type, expiresInMinutes }) {
      console.log(
        `[auth] OTP for ${to} (${type}): ${otp} — expires in ${expiresInMinutes} minute(s)`,
      );
    },
  };
}

/**
 * Pick a sender from the environment: SES when configured, console otherwise.
 * Throws in production when SES configuration is missing rather than silently
 * degrading to console output.
 */
export function loadEmailSender(env: NodeJS.ProcessEnv = process.env): EmailSender {
  const fromAddress = env.AUTH_EMAIL_FROM;
  const region = env.AWS_REGION ?? env.AWS_DEFAULT_REGION;

  if (fromAddress && region) {
    return createSesEmailSender({
      fromAddress,
      region,
      configurationSetName: env.AUTH_SES_CONFIGURATION_SET,
    });
  }

  if (env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_EMAIL_FROM and AWS_REGION are required in production for SES email delivery",
    );
  }

  return createConsoleEmailSender();
}
