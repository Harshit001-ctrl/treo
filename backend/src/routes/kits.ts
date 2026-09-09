import { Router } from "express";
import { z } from "zod";
import { Kit, QuestionCategory as QuestionCategorySchema } from "@prepkit/shared";
import { KitModel } from "../db/models/Kit";
import { requireAuth } from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/asyncHandler";
import { badRequest, notFound } from "../lib/httpError";
import { dedupeHash } from "../lib/dedupeHash";
import { assertValidKit } from "../lib/validateKit";
import { enqueueKitGeneration } from "../jobQueue";
import { orderPracticeSession } from "../lib/practiceOrder";
import * as regenerate from "../server/regenerate";

export const kitsRouter = Router();
kitsRouter.use(requireAuth);

const caseInputSchema = z.object({
  jd: z.string().trim().min(10, "Job description is too short."),
  companyUrl: z.string().trim().url("Company URL must be a valid URL."),
  days: z.number().int().min(1).max(60),
});

async function getOwnedKitDoc(userId: string, kitId: string) {
  const doc = await KitModel.findOne({ _id: kitId, userId });
  if (!doc) throw notFound("Kit not found.");
  return doc;
}

function requireReadyKit(doc: Awaited<ReturnType<typeof getOwnedKitDoc>>): Kit {
  if (doc.status !== "ready" || !doc.kit) {
    throw badRequest("KIT_NOT_READY", "This kit hasn't finished generating yet.");
  }
  return doc.kit as Kit;
}

async function createOneKit(userId: string, input: z.infer<typeof caseInputSchema>) {
  const hash = dedupeHash(input.jd, input.companyUrl);
  const existing = await KitModel.findOne({ userId, dedupeHash: hash });
  if (existing) return { id: existing._id.toString(), status: existing.status, duplicate: true };

  const doc = await KitModel.create({
    userId,
    input: { jd: input.jd, companyUrl: input.companyUrl, days: input.days },
    dedupeHash: hash,
    status: "queued",
  });
  enqueueKitGeneration(doc._id.toString());
  return { id: doc._id.toString(), status: doc.status, duplicate: false };
}

// --- Create -----------------------------------------------------------

kitsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = caseInputSchema.parse(req.body);
    const result = await createOneKit(req.userId!, input);
    res.status(result.duplicate ? 200 : 201).json(result);
  })
);

/** Section 2: "a way to prepare for more than one role — pasting again, or
 * uploading a file of description-and-company pairs." */
kitsRouter.post(
  "/bulk",
  asyncHandler(async (req, res) => {
    const items = z.array(caseInputSchema).min(1).max(50).parse(req.body?.items);
    const results = await Promise.all(items.map((item) => createOneKit(req.userId!, item)));
    res.status(201).json({ kits: results });
  })
);

// --- Read ---------------------------------------------------------------

kitsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const docs = await KitModel.find({ userId: req.userId }).sort({ createdAt: -1 }).select("status input createdAt updatedAt kit.source error");
    res.json({
      kits: docs.map((d) => ({
        id: d._id,
        status: d.status,
        company: d.kit?.source?.company ?? null,
        role: d.kit?.source?.role ?? null,
        days: d.input?.days,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        error: d.error,
      })),
    });
  })
);

kitsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const doc = await getOwnedKitDoc(req.userId!, req.params.id);
    res.json({
      id: doc._id,
      status: doc.status,
      progressLog: doc.progressLog,
      error: doc.error,
      kit: doc.kit,
      practice: doc.practice,
    });
  })
);

// --- Item mutations -------------------------------------------------------

const editQuestionSchema = z.object({
  prompt: z.string().min(1).optional(),
  answer_outline: z.string().optional(),
  difficulty: z.number().int().min(1).max(3).optional(),
  category: QuestionCategorySchema.optional(),
});

kitsRouter.patch(
  "/:id/questions/:questionId",
  asyncHandler(async (req, res) => {
    const doc = await getOwnedKitDoc(req.userId!, req.params.id);
    let kit = requireReadyKit(doc);
    const body = editQuestionSchema.parse(req.body);

    const { category, ...fieldUpdates } = body;
    if (Object.keys(fieldUpdates).length > 0) {
      kit = regenerate.editQuestion(kit, req.params.questionId, fieldUpdates);
    }
    if (category) {
      kit = regenerate.moveQuestionCategory(kit, req.params.questionId, category);
    }

    doc.kit = assertValidKit(kit);
    doc.markModified("kit");
    await doc.save();
    res.json({ kit: doc.kit });
  })
);

const addQuestionSchema = z.object({
  category: QuestionCategorySchema,
  prompt: z.string().min(1),
  answer_outline: z.string().default(""),
  difficulty: z.number().int().min(1).max(3),
  requirement_ids: z.array(z.string()).default([]),
});

kitsRouter.post(
  "/:id/questions",
  asyncHandler(async (req, res) => {
    const doc = await getOwnedKitDoc(req.userId!, req.params.id);
    const kit = requireReadyKit(doc);
    const draft = addQuestionSchema.parse(req.body);
    const updated = regenerate.addQuestion(kit, draft);
    doc.kit = assertValidKit(updated);
    doc.markModified("kit");
    await doc.save();
    res.status(201).json({ kit: doc.kit });
  })
);

kitsRouter.delete(
  "/:id/questions/:questionId",
  asyncHandler(async (req, res) => {
    const doc = await getOwnedKitDoc(req.userId!, req.params.id);
    const kit = requireReadyKit(doc);
    const updated = regenerate.deleteQuestion(kit, req.params.questionId);
    doc.kit = assertValidKit(updated);
    doc.markModified("kit");
    await doc.save();
    res.json({ kit: doc.kit });
  })
);

const reorderSchema = z.object({
  category: QuestionCategorySchema,
  orderedIds: z.array(z.string()).min(1),
});

kitsRouter.post(
  "/:id/questions/reorder",
  asyncHandler(async (req, res) => {
    const doc = await getOwnedKitDoc(req.userId!, req.params.id);
    const kit = requireReadyKit(doc);
    const { category, orderedIds } = reorderSchema.parse(req.body);
    const updated = regenerate.reorderQuestions(kit, category, orderedIds);
    doc.kit = assertValidKit(updated);
    doc.markModified("kit");
    await doc.save();
    res.json({ kit: doc.kit });
  })
);

const editFlashcardSchema = z.object({
  front: z.string().min(1).optional(),
  back: z.string().min(1).optional(),
});

kitsRouter.patch(
  "/:id/flashcards/:flashcardId",
  asyncHandler(async (req, res) => {
    const doc = await getOwnedKitDoc(req.userId!, req.params.id);
    const kit = requireReadyKit(doc);
    const updates = editFlashcardSchema.parse(req.body);
    const updated = regenerate.editFlashcard(kit, req.params.flashcardId, updates);
    doc.kit = assertValidKit(updated);
    doc.markModified("kit");
    await doc.save();
    res.json({ kit: doc.kit });
  })
);

const addFlashcardSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  requirement_ids: z.array(z.string()).default([]),
});

kitsRouter.post(
  "/:id/flashcards",
  asyncHandler(async (req, res) => {
    const doc = await getOwnedKitDoc(req.userId!, req.params.id);
    const kit = requireReadyKit(doc);
    const draft = addFlashcardSchema.parse(req.body);
    const updated = regenerate.addFlashcard(kit, draft);
    doc.kit = assertValidKit(updated);
    doc.markModified("kit");
    await doc.save();
    res.status(201).json({ kit: doc.kit });
  })
);

kitsRouter.delete(
  "/:id/flashcards/:flashcardId",
  asyncHandler(async (req, res) => {
    const doc = await getOwnedKitDoc(req.userId!, req.params.id);
    const kit = requireReadyKit(doc);
    const updated = regenerate.deleteFlashcard(kit, req.params.flashcardId);
    doc.kit = assertValidKit(updated);
    doc.markModified("kit");
    await doc.save();
    res.json({ kit: doc.kit });
  })
);

// --- Regenerate -----------------------------------------------------------

const regenerateSchema = z.object({
  section: z.enum(["brief", "schedule", "flashcards", "technical", "behavioural", "system-design", "company-fit"]),
});

kitsRouter.post(
  "/:id/regenerate",
  asyncHandler(async (req, res) => {
    const doc = await getOwnedKitDoc(req.userId!, req.params.id);
    const kit = requireReadyKit(doc);
    const { section } = regenerateSchema.parse(req.body);

    let updated: Kit;
    if (section === "brief") updated = await regenerate.regenerateCompanyBrief(kit);
    else if (section === "schedule") updated = regenerate.regenerateSchedule(kit);
    else if (section === "flashcards") updated = await regenerate.regenerateFlashcards(kit);
    else updated = await regenerate.regenerateQuestionCategory(kit, section);

    doc.kit = assertValidKit(updated);
    doc.markModified("kit");
    await doc.save();
    res.json({ kit: doc.kit });
  })
);

// --- Practice ---------------------------------------------------------------

const recordPracticeSchema = z.object({
  flashcardId: z.string().min(1),
  confidence: z.number().int().min(1).max(3),
});

kitsRouter.post(
  "/:id/practice",
  asyncHandler(async (req, res) => {
    const doc = await getOwnedKitDoc(req.userId!, req.params.id);
    requireReadyKit(doc);
    const { flashcardId, confidence } = recordPracticeSchema.parse(req.body);

    const existing = doc.practice.find((p) => p.flashcardId === flashcardId);
    if (existing) {
      existing.lastConfidence = confidence;
      existing.timesReviewed += 1;
      existing.lastReviewedAt = new Date();
    } else {
      doc.practice.push({ flashcardId, lastConfidence: confidence, timesReviewed: 1, lastReviewedAt: new Date() });
    }
    await doc.save();
    res.json({ practice: doc.practice });
  })
);

kitsRouter.get(
  "/:id/practice/session",
  asyncHandler(async (req, res) => {
    const doc = await getOwnedKitDoc(req.userId!, req.params.id);
    const kit = requireReadyKit(doc);
    const orderedIds = orderPracticeSession(
      kit.flashcards.map((f) => f.id),
      doc.practice.map((p) => ({ flashcardId: p.flashcardId, lastConfidence: p.lastConfidence, timesReviewed: p.timesReviewed }))
    );
    res.json({ orderedFlashcardIds: orderedIds });
  })
);
