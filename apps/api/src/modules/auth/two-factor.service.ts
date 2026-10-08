import { Injectable } from "@nestjs/common";
import { authenticator } from "otplib";
import { toDataURL } from "qrcode";
import { decrypt, encrypt } from "../../common/crypto";

authenticator.options = { window: 1 };

@Injectable()
export class TwoFactorService {
  async createSecret(email: string, issuer: string) {
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(email, issuer, secret);
    const qrDataUrl = await toDataURL(otpauthUrl, { margin: 1, width: 240 });
    return { encryptedSecret: encrypt(secret), secret, otpauthUrl, qrDataUrl };
  }

  verify(encryptedSecret: string, code: string): boolean {
    try {
      return authenticator.check(code, decrypt(encryptedSecret));
    } catch {
      return false;
    }
  }
}
