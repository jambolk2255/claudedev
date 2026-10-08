import { z } from "zod";

/**
 * Client-side error map: turns Zod issues into translation keys understood by
 * `useZodMessage` ("required", "too_small:2", "invalid_email" ...).
 * Messages set explicitly in schemas (e.g. "password.min") still win.
 */
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return { message: issue.received === "undefined" || issue.received === "null" ? "required" : "invalid" };
    case z.ZodIssueCode.too_small:
      if (issue.type === "string") return { message: Number(issue.minimum) <= 1 ? "required" : `too_small:${issue.minimum}` };
      if (issue.type === "array") return { message: `min_items:${issue.minimum}` };
      return { message: `min_value:${issue.minimum}` };
    case z.ZodIssueCode.too_big:
      if (issue.type === "string") return { message: `too_big:${issue.maximum}` };
      return { message: `max_value:${issue.maximum}` };
    case z.ZodIssueCode.invalid_string:
      return { message: issue.validation === "email" ? "invalid_email" : "invalid" };
    default:
      return { message: ctx.defaultError ? "invalid" : "invalid" };
  }
});
