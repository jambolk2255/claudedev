import type { FastifyRequest } from "fastify";

export interface RequestUser {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  roleId: string;
  roleKey: string | null;
  permissions: string[];
  familyId: string;
}

export interface RequestContext {
  user: RequestUser;
  ip: string | undefined;
  userAgent: string | undefined;
}

export type AuthedRequest = FastifyRequest & { user?: RequestUser };

export function requestMeta(req: FastifyRequest): { ip: string | undefined; userAgent: string | undefined } {
  const ua = req.headers["user-agent"];
  return { ip: req.ip, userAgent: typeof ua === "string" ? ua.slice(0, 300) : undefined };
}
