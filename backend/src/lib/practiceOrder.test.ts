import { orderPracticeSession, PracticeEntry } from "./practiceOrder";

function makeEntry(overrides: Partial<PracticeEntry> = {}): PracticeEntry {
  return { flashcardId: "f1", lastConfidence: 3, timesReviewed: 1, ...overrides };
}

describe("orderPracticeSession", () => {
  it("orders ascending by lastConfidence — least confident first", () => {
    const practice = [
      makeEntry({ flashcardId: "f1", lastConfidence: 4 }),
      makeEntry({ flashcardId: "f2", lastConfidence: 1 }),
      makeEntry({ flashcardId: "f3", lastConfidence: 3 }),
    ];
    const result = orderPracticeSession(["f1", "f2", "f3"], practice);
    expect(result).toEqual(["f2", "f3", "f1"]);
  });

  it("treats a never-reviewed card as lower confidence than any rated card, including a rating of 1", () => {
    const practice = [makeEntry({ flashcardId: "f1", lastConfidence: 1 })];
    // f2 has no practice entry at all.
    const result = orderPracticeSession(["f1", "f2"], practice);
    expect(result).toEqual(["f2", "f1"]);
  });

  it("does not mutate the input array", () => {
    const input = ["f1", "f2", "f3"];
    const copy = [...input];
    orderPracticeSession(input, [makeEntry({ flashcardId: "f2", lastConfidence: 0 })]);
    expect(input).toEqual(copy);
  });

  it("handles an empty flashcard list", () => {
    expect(orderPracticeSession([], [])).toEqual([]);
  });

  it("is stable-ish for ties (all unseen cards) — preserves relative order when scores are equal", () => {
    const result = orderPracticeSession(["f1", "f2", "f3"], []);
    expect(result).toEqual(["f1", "f2", "f3"]);
  });
});
