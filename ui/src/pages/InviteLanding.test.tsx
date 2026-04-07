// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { resolvePostAcceptAction } from "./InviteLanding";

describe("resolvePostAcceptAction", () => {
  it("returns 'navigate-home' when payload has status='approved'", () => {
    const payload = { id: "jr-1", status: "approved", companyId: "co-1" };
    expect(resolvePostAcceptAction(payload)).toBe("navigate-home");
  });

  it("returns 'show-join-result' when payload has status='pending_approval'", () => {
    const payload = { id: "jr-1", status: "pending_approval", companyId: "co-1" };
    expect(resolvePostAcceptAction(payload)).toBe("show-join-result");
  });

  it("returns 'show-bootstrap' when payload has bootstrapAccepted", () => {
    const payload = { bootstrapAccepted: true };
    expect(resolvePostAcceptAction(payload)).toBe("show-bootstrap");
  });

  it("returns 'show-join-result' for null payload", () => {
    expect(resolvePostAcceptAction(null)).toBe("show-join-result");
  });

  it("returns 'show-join-result' for undefined payload", () => {
    expect(resolvePostAcceptAction(undefined)).toBe("show-join-result");
  });
});
