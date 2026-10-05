import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;
  let send: jest.Mock;

  beforeEach(async () => {
    const config: Record<string, string> = {
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
      GOOGLE_REDIRECT_URI: 'https://example.com/oauth2callback',
      GOOGLE_REFRESH_TOKEN: 'refresh-token',
      EMAIL_USER: 'Youthmeeting@gmail.com',
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: ConfigService, useValue: { get: (key: string) => config[key] } },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
    send = jest.fn().mockResolvedValue({ data: { id: 'test-message' } });
    Object.assign(service, { gmail: { users: { messages: { send } } } });
  });

  it('uses the requested sender and branding for both OTP emails', async () => {
    for (const [method, subject, bodySnippet] of [
      ['sendVerificationOTP', 'Your Taralally_Theater_Team Verification Code: 123456', 'Your verification code is: 123456'],
      ['sendPasswordResetOTP', 'Your Taralally_Theater_Team Password Reset Code: 123456', 'Your password reset code is: 123456'],
    ] as const) {
      await service[method]('recipient@example.com', '123456');
      const raw = send.mock.lastCall?.[0].requestBody.raw as string;
      const message = Buffer.from(raw, 'base64url').toString('utf8');

      expect(message).toMatch(/^From: .*Taralally_Theater_Team.*<Youthmeeting@gmail\.com>/m);
      expect(message).toContain(`Subject: ${subject}`);
      expect(message).not.toContain('EventTix');
      expect(message).not.toMatch(/^Reply-To:/m);
      expect(message).toMatch(/^Message-ID: <[^>\r\n]+>/m);
      expect(message).not.toContain('@eventtix.app');
      expect(message).toMatch(/^Content-Type: multipart\/alternative;/m);
      expect(message).toMatch(/^Content-Type: text\/plain;/m);
      expect(message).toMatch(/^Content-Type: text\/html;/m);
      expect(message).toContain(bodySnippet);
    }
    expect(send).toHaveBeenCalledTimes(2);
  });
});
