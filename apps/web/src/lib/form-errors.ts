import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "./api";

/** Maps API validation issues onto form fields; anything else becomes a toast. */
export function handleFormError<T extends FieldValues>(err: unknown, setError?: UseFormSetError<T>, fallback = "Something went wrong") {
  if (err instanceof ApiError) {
    if (err.issues?.length && setError) {
      for (const issue of err.issues) setError(issue.path as Path<T>, { message: issue.message });
      return;
    }
    toast.error(err.message);
    return;
  }
  toast.error(fallback);
}
