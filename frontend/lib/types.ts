import { z } from "zod";
import {
  QuestionCategory as QuestionCategorySchema,
  RequirementKind as RequirementKindSchema,
  RequirementPriority as RequirementPrioritySchema,
  ItemOrigin as ItemOriginSchema,
} from "@prepkit/shared";

export type QuestionCategory = z.infer<typeof QuestionCategorySchema>;
export type RequirementKind = z.infer<typeof RequirementKindSchema>;
export type RequirementPriority = z.infer<typeof RequirementPrioritySchema>;
export type ItemOrigin = z.infer<typeof ItemOriginSchema>;
