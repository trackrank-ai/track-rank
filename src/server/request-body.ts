import type { z } from "zod";
import { HttpError } from "./types";

export async function body<T>(req: Request, s: z.ZodType<T>, limit = 32_768): Promise<T> {
  if (Number(req.headers.get("content-length") || 0) > limit)
    throw new HttpError(413, "Request too large");
  const reader = req.body?.getReader();
  const decoder = new TextDecoder();
  let text = "", bytes = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel().catch(() => {});
        throw new HttpError(413, "Request too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new HttpError(400, "JSON body required");
  }
  const parsed = s.safeParse(value);
  if (!parsed.success)
    throw new HttpError(
      400,
      parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")
        .slice(0, 500),
    );
  return parsed.data;
}
