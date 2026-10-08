import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { FastifyReply } from "fastify";

/** Uniform error body `{ statusCode, message, code?, issues? }`; never leaks stack traces. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const body = typeof res === "string" ? { message: res } : (res as Record<string, unknown>);
      return reply.status(status).send({ statusCode: status, ...body });
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002") {
        return reply.status(HttpStatus.CONFLICT).send({ statusCode: 409, message: "Already exists", code: "DUPLICATE" });
      }
      if (exception.code === "P2003") {
        return reply.status(HttpStatus.CONFLICT).send({ statusCode: 409, message: "Record is still in use", code: "IN_USE" });
      }
      if (exception.code === "P2025") {
        return reply.status(HttpStatus.NOT_FOUND).send({ statusCode: 404, message: "Not found", code: "NOT_FOUND" });
      }
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return reply.status(500).send({ statusCode: 500, message: "Internal server error" });
  }
}
