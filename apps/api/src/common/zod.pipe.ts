import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import type { ZodTypeAny, infer as ZodInfer } from "zod";

@Injectable()
export class ZodPipe<T extends ZodTypeAny> implements PipeTransform<unknown, ZodInfer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): ZodInfer<T> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new BadRequestException({
        message: "Validation failed",
        code: "VALIDATION_ERROR",
        issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return result.data;
  }
}
