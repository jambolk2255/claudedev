import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { PrismaClient } from "@prisma/client";
import { PASSWORD, WebClient, bootTestApp } from "./helpers";

describe("RBAC, invitations, tenant isolation and onboarding (e2e)", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let ownerA: WebClient;
  let ownerB: WebClient;

  beforeAll(async () => {
    ({ app, prisma } = await bootTestApp());
    ownerA = new WebClient(app);
    ownerB = new WebClient(app);
    await ownerA.send("post", "/auth/register", { companyName: "Alpha Stores", name: "Alpha Owner", email: "a@alpha.lk", password: PASSWORD });
    await ownerB.send("post", "/auth/register", { companyName: "Beta Pharma", name: "Beta Owner", email: "b@beta.lk", password: PASSWORD });
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("invites a viewer who can read but not manage", async () => {
    const roles = await ownerA.send("get", "/roles");
    expect(roles.body.map((r: { key: string }) => r.key)).toEqual(["owner", "admin", "manager", "storekeeper", "sales", "accountant", "viewer"]);
    const viewerRole = roles.body.find((r: { key: string }) => r.key === "viewer");
    const invite = await ownerA.send("post", "/users/invitations", { email: "viewer@alpha.lk", roleId: viewerRole.id });
    expect(invite.status).toBe(201);
    const token = (invite.body.inviteUrl as string).split("/invite/")[1];

    const info = await new WebClient(app).send("get", `/auth/invitations/${token}`);
    expect(info.body).toMatchObject({ email: "viewer@alpha.lk", organization: "Alpha Stores", role: "Viewer" });

    const viewer = new WebClient(app);
    const accepted = await viewer.send("post", "/auth/accept-invite", { token, name: "View Only", password: PASSWORD });
    expect(accepted.status).toBe(201);
    expect(accepted.body.user.organization.name).toBe("Alpha Stores");

    expect((await viewer.send("get", "/users")).status).toBe(200);
    expect((await viewer.send("patch", "/organization", { name: "Hacked" })).status).toBe(403);
    expect((await viewer.send("get", "/audit")).status).toBe(403);
    expect((await viewer.send("post", "/roles", { name: "Super", permissions: ["audit.view"] })).status).toBe(403);

    // Invitation tokens are single use.
    expect((await new WebClient(app).send("post", "/auth/accept-invite", { token, name: "Again", password: PASSWORD })).status).toBe(404);
  });

  it("never exposes or modifies another organization's data", async () => {
    const usersB = await ownerB.send("get", "/users");
    expect(usersB.body.items.map((u: { email: string }) => u.email)).toEqual(["b@beta.lk"]);

    const usersA = await ownerA.send("get", "/users");
    const viewerId = usersA.body.items.find((u: { email: string }) => u.email === "viewer@alpha.lk").id;
    const rolesB = await ownerB.send("get", "/roles");
    const adminB = rolesB.body.find((r: { key: string }) => r.key === "admin");

    const crossEdit = await ownerB.send("patch", `/users/${viewerId}`, { roleId: adminB.id });
    expect(crossEdit.status).toBe(404);
    const viewer = await prisma.user.findUniqueOrThrow({ where: { id: viewerId }, include: { role: true } });
    expect(viewer.role.key).toBe("viewer");
  });

  it("deactivating a user kills their sessions", async () => {
    const usersA = await ownerA.send("get", "/users");
    const viewerId = usersA.body.items.find((u: { email: string }) => u.email === "viewer@alpha.lk").id;
    const viewer = new WebClient(app);
    await viewer.send("post", "/auth/login", { email: "viewer@alpha.lk", password: PASSWORD });
    expect((await ownerA.send("patch", `/users/${viewerId}`, { active: false })).status).toBe(200);
    expect((await viewer.send("get", "/auth/me")).status).toBe(401);
  });

  it("walks the onboarding wizard and applies every step on completion", async () => {
    const early = await ownerA.send("post", "/onboarding/complete", {});
    expect(early.status).toBe(400);
    expect(early.body.code).toBe("ONBOARDING_INCOMPLETE");

    const steps: Record<string, unknown> = {
      company: { name: "Alpha Stores (Pvt) Ltd", vatNo: "123456789-7000", city: "Colombo", country: "LK" },
      industry: { industry: "pharmacy" },
      modules: { mode: "simple", modules: ["inventory", "sales", "batches"] },
      finance: {
        currency: "LKR",
        fiscalYearStartMonth: 4,
        vatRegistered: true,
        vatRate: 18,
        ssclEnabled: true,
        ssclRate: 2.5,
        valuationMethod: "fifo",
        allowNegativeStock: false,
      },
      warehouses: {
        warehouses: [
          { name: "Main Store", code: "main", latitude: 6.9271, longitude: 79.8612, isDefault: true },
          { name: "Kandy Branch", code: "KDY" },
        ],
      },
      numbering: { prefixes: { invoice: "ALINV" }, includeYear: true, padding: 5 },
      team: { invites: [{ email: "store@alpha.lk", roleKey: "storekeeper" }] },
      data: { start: "empty" },
    };
    expect((await ownerA.send("put", "/onboarding/finance", { currency: "XXX" })).status).toBe(400);
    for (const [step, body] of Object.entries(steps)) {
      const res = await ownerA.send("put", `/onboarding/${step}`, body);
      expect(res.status).toBe(200);
    }
    const state = await ownerA.send("get", "/onboarding");
    expect(state.body.completedSteps).toHaveLength(8);

    const done = await ownerA.send("post", "/onboarding/complete", {});
    expect(done.status).toBe(200);
    expect(done.body.invites).toHaveLength(1);

    const me = await ownerA.send("get", "/auth/me");
    expect(me.body.organization).toMatchObject({ name: "Alpha Stores (Pvt) Ltd", onboardingCompleted: true, mode: "simple", currency: "LKR" });
    // Advanced-only module dropped in simple mode.
    expect(me.body.organization.modules).toEqual(["inventory", "sales"]);

    const overview = await ownerA.send("get", "/organization/overview");
    expect(overview.body.warehouses.map((w: { code: string }) => w.code)).toEqual(["MAIN", "KDY"]);
    expect(overview.body.taxRates.map((t: { code: string }) => t.code).sort()).toEqual(["EXEMPT", "SSCL", "VAT"]);

    const orgId = me.body.organization.id;
    const seq = await prisma.documentSequence.findUniqueOrThrow({ where: { organizationId_type: { organizationId: orgId, type: "invoice" } } });
    expect(seq.prefix).toBe("ALINV");
    expect(await prisma.category.count({ where: { organizationId: orgId } })).toBeGreaterThan(0);

    expect((await ownerA.send("post", "/onboarding/complete", {})).status).toBe(409);
    // Org B is untouched.
    expect((await ownerB.send("get", "/organization/overview")).body.warehouses).toEqual([]);
  });

  it("records an audit trail", async () => {
    const audit = await ownerA.send("get", "/audit?pageSize=50");
    const actions = audit.body.items.map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["organization.created", "user.invited", "user.joined", "user.updated", "onboarding.completed"]));
    const auditB = await ownerB.send("get", "/audit?pageSize=50");
    expect(auditB.body.items.every((a: { action: string }) => !a.action.startsWith("onboarding"))).toBe(true);
  });
});
