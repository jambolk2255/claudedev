import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { PrismaClient } from "@prisma/client";
import { authenticator } from "otplib";
import { PASSWORD, WebClient, bootTestApp, mobile } from "./helpers";

describe("Auth (e2e)", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ app, prisma } = await bootTestApp());
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("reports that setup is needed on an empty database", async () => {
    const res = await new WebClient(app).send("get", "/auth/setup-status");
    expect(res.body).toEqual({ needsSetup: true, signupOpen: true });
  });

  it("registers an owner with httpOnly cookies and serves /auth/me", async () => {
    const web = new WebClient(app);
    const res = await web.send("post", "/auth/register", { companyName: "Lanka Traders", name: "Nimal Perera", email: "owner@lanka.lk", password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.tokens).toBeUndefined();
    expect(res.body.user.role.key).toBe("owner");
    const setCookie = (res.headers["set-cookie"] as unknown as string[]).join("\n");
    expect(setCookie).toMatch(/sf_at=.*HttpOnly/);
    expect(setCookie).toMatch(/sf_rt=.*Path=\/api\/v1\/auth.*HttpOnly/);

    const me = await web.send("get", "/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.organization.name).toBe("Lanka Traders");
    expect(me.body.organization.onboardingCompleted).toBe(false);
  });

  it("rejects weak passwords and duplicate emails", async () => {
    const web = new WebClient(app);
    const weak = await web.send("post", "/auth/register", { companyName: "X Ltd", name: "Weak User", email: "weak@x.lk", password: "password" });
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe("VALIDATION_ERROR");
    const dup = await web.send("post", "/auth/register", { companyName: "X Ltd", name: "Dup User", email: "owner@lanka.lk", password: PASSWORD });
    expect(dup.status).toBe(409);
  });

  it("requires a CSRF token for cookie-authenticated mutations", async () => {
    const web = new WebClient(app);
    await web.send("post", "/auth/login", { email: "owner@lanka.lk", password: PASSWORD });
    const blocked = await web.send("patch", "/users/me", { name: "Changed" }, { csrf: false });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("CSRF");
    const allowed = await web.send("patch", "/users/me", { name: "Nimal P." });
    expect(allowed.status).toBe(200);
  });

  it("rotates refresh tokens and revokes the family when an old token is reused", async () => {
    const res = await mobile(app, "post", "/auth/login").send({ email: "owner@lanka.lk", password: PASSWORD });
    expect(res.status).toBe(200);
    const first = res.body.tokens.refreshToken as string;

    const rotated = await mobile(app, "post", "/auth/refresh").send({ refreshToken: first });
    expect(rotated.status).toBe(200);
    const second = rotated.body.tokens.refreshToken as string;
    expect(second).not.toEqual(first);
    expect((await mobile(app, "get", "/auth/me", rotated.body.tokens.accessToken)).status).toBe(200);

    const reuse = await mobile(app, "post", "/auth/refresh").send({ refreshToken: first });
    expect(reuse.status).toBe(401);
    // Theft detected: the legitimate newer token and its access token are dead too.
    expect((await mobile(app, "post", "/auth/refresh").send({ refreshToken: second })).status).toBe(401);
    expect((await mobile(app, "get", "/auth/me", rotated.body.tokens.accessToken)).status).toBe(401);
  });

  it("locks the account after repeated failed logins", async () => {
    const web = new WebClient(app);
    await web.send("post", "/auth/register", { companyName: "Lock Co", name: "Lock User", email: "lock@co.lk", password: PASSWORD });
    for (let i = 0; i < 5; i++) {
      const r = await mobile(app, "post", "/auth/login").send({ email: "lock@co.lk", password: "Wrong-Pass-123" });
      expect(r.status).toBe(401);
    }
    const locked = await mobile(app, "post", "/auth/login").send({ email: "lock@co.lk", password: PASSWORD });
    expect(locked.status).toBe(401);
    expect(locked.body.code).toBe("LOCKED");
  });

  it("enforces TOTP two-factor authentication once enabled", async () => {
    const login = await mobile(app, "post", "/auth/login").send({ email: "owner@lanka.lk", password: PASSWORD });
    const token = login.body.tokens.accessToken as string;
    const setup = await mobile(app, "post", "/auth/2fa/setup", token);
    expect(setup.status).toBe(200);
    expect(setup.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    expect((await mobile(app, "post", "/auth/2fa/enable", token).send({ code: "000000" })).status).toBe(400);
    const enable = await mobile(app, "post", "/auth/2fa/enable", token).send({ code: authenticator.generate(setup.body.secret) });
    expect(enable.status).toBe(204);

    const challenge = await mobile(app, "post", "/auth/login").send({ email: "owner@lanka.lk", password: PASSWORD });
    expect(challenge.body).toEqual({ requiresTwoFactor: true });
    const ok = await mobile(app, "post", "/auth/login").send({ email: "owner@lanka.lk", password: PASSWORD, totp: authenticator.generate(setup.body.secret) });
    expect(ok.status).toBe(200);

    const disable = await mobile(app, "post", "/auth/2fa/disable", ok.body.tokens.accessToken).send({ code: authenticator.generate(setup.body.secret) });
    expect(disable.status).toBe(204);
  });

  it("logout clears cookies and invalidates the session", async () => {
    const web = new WebClient(app);
    await web.send("post", "/auth/login", { email: "owner@lanka.lk", password: PASSWORD });
    const access = web.cookies.get("sf_at")!;
    expect((await web.send("post", "/auth/logout", {})).status).toBe(204);
    expect(web.cookies.has("sf_at")).toBe(false);
    expect((await mobile(app, "get", "/auth/me", access)).status).toBe(401);
  });
});
