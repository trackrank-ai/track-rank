import { z } from "zod";

export const promptQuestionText = z.string().trim().min(3).max(700);
