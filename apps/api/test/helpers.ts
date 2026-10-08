import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import request from "supertest";
import { createApp } from "../src/bootstrap";

export async function bootTestApp() {
  execSync("npx prisma migrate deploy", { env: process.env, stdio: "ignore" });
  const prisma = new PrismaClient();
  await prisma.$executeRawUnsafe(
    `TRUNCATE "JournalLine","JournalEntry","Allocation","Payment","NoteLine","Note","InvoiceLine","Invoice","OrderLine","Order","Account","StockMovement","StockDocumentLine","StockDocument","CostLayer","BatchBalance","Batch","StockLevel","Product","Partner","AuditLog","Session","Invitation","User","Role","Warehouse","TaxRate","DocumentSequence","Category","Unit","Organization" CASCADE`,
  );
  const app = await createApp({ logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, prisma };
}

/** Minimal cookie-jar browser client that mimics the web app (cookies + CSRF header). */
export class WebClient {
  cookies = new Map<string, string>();

  constructor(private readonly app: NestFastifyApplication) {}

  private store(res: request.Response) {
    const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
    for (const c of raw ?? []) {
      const [pair] = c.split(";");
      const [name, ...rest] = pair!.split("=");
      const value = rest.join("=");
      if (value === "" || /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)) this.cookies.delete(name!);
      else this.cookies.set(name!, value);
    }
    return res;
  }

  private cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async send(method: "get" | "post" | "put" | "patch" | "delete", url: string, body?: unknown, opts: { csrf?: boolean } = {}) {
    let req = request(this.app.getHttpServer())[method](`/api/v1${url}`).set("cookie", this.cookieHeader());
    const csrf = this.cookies.get("sf_csrf");
    if (csrf && opts.csrf !== false) req = req.set("x-csrf-token", csrf);
    if (body !== undefined) req = req.send(body as object);
    return this.store(await req);
  }
}

export function mobile(app: NestFastifyApplication, method: "get" | "post" | "patch" | "put" | "delete", url: string, token?: string) {
  let req = request(app.getHttpServer())[method](`/api/v1${url}`).set("x-client", "mobile");
  if (token) req = req.set("authorization", `Bearer ${token}`);
  return req;
}

export const PASSWORD = "Sup3r-Secret-Pass";
