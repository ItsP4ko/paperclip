import { describe, expect, it } from "vitest";
import { resolveHumanJoinStatus } from "../routes/access.js";

describe("resolveHumanJoinStatus", () => {
  it("returns approved + shouldAutoApprove=true for requestType 'human'", () => {
    const result = resolveHumanJoinStatus("human");
    expect(result.status).toBe("approved");
    expect(result.shouldAutoApprove).toBe(true);
  });

  it("returns pending_approval + shouldAutoApprove=false for requestType 'agent'", () => {
    const result = resolveHumanJoinStatus("agent");
    expect(result.status).toBe("pending_approval");
    expect(result.shouldAutoApprove).toBe(false);
  });
});
