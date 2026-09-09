import { Schema, model, InferSchemaType, Types } from "mongoose";
import { KIT_STATUSES } from "../../pipeline/status";

/**
 * The generated kit content (Appendix A shape + our origin/edited extensions)
 * is stored as `Mixed` rather than mirrored into a second, parallel Mongoose
 * schema. `@prepkit/shared`'s Zod schema is the single source of truth for
 * that shape; every write path validates against it explicitly (see
 * lib/validateKit.ts) before persisting, per the brief's "validate a
 * generated kit against the expected structure before saving it." Mongoose's
 * own schema below only models what Mongo/the app actually needs to query on.
 *
 * KIT_STATUSES lives in pipeline/status.ts, not here — the pipeline owns what
 * its stages are; this model just persists whichever one a kit is currently in.
 */
export { KIT_STATUSES };

const progressEntrySchema = new Schema(
  {
    step: { type: String, required: true },
    message: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const practiceEntrySchema = new Schema(
  {
    flashcardId: { type: String, required: true },
    lastConfidence: { type: Number, min: 1, max: 3, required: true },
    timesReviewed: { type: Number, default: 0 },
    lastReviewedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const kitDocSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // Original input, kept so a section can be regenerated without asking the
    // user to re-paste anything.
    input: {
      jd: { type: String, required: true },
      companyUrl: { type: String, required: true },
      days: { type: Number, required: true },
    },

    // Dedupe guard for "the same description and company are submitted
    // twice" (Section 10) — unique per user, not globally.
    dedupeHash: { type: String, required: true, index: true },

    status: { type: String, enum: KIT_STATUSES, default: "queued", index: true },
    progressLog: { type: [progressEntrySchema], default: [] },
    error: {
      type: new Schema({ code: String, message: String }, { _id: false }),
      default: null,
    },

    // The Appendix-A-shaped generated content. Null until generation finishes
    // at least once.
    kit: { type: Schema.Types.Mixed, default: null },

    practice: { type: [practiceEntrySchema], default: [] },
  },
  { timestamps: true }
);

kitDocSchema.index({ userId: 1, dedupeHash: 1 }, { unique: true });

export type KitDoc = InferSchemaType<typeof kitDocSchema> & { _id: Types.ObjectId };

export const KitModel = model("Kit", kitDocSchema);
