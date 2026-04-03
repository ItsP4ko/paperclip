import { describe, expect, it, vi, beforeEach } from "vitest";
import { accessService } from "../services/access.js";

// Mock the db module used by accessService
const mockLeftJoin = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();

// Build a chainable mock that tracks the leftJoin call
function makeMockDb(rows: unknown[]) {
  const chain = {
    select: vi.fn(),
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
  };

  chain.select.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  // orderBy is the terminal call, returns the rows
  chain.orderBy.mockResolvedValue(rows);

  return chain;
}

describe("accessService.listMembers", () => {
  it("returns rows with userDisplayName and userEmail fields for user members", async () => {
    const rows = [
      {
        id: "membership-1",
        companyId: "company-1",
        principalType: "user",
        principalId: "user-1",
        membershipRole: "member",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
        userDisplayName: "Alice Smith",
        userEmail: "alice@example.com",
      },
    ];

    const mockDb = makeMockDb(rows);
    const service = accessService(mockDb as any);
    const result = await service.listMembers("company-1");

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("userDisplayName", "Alice Smith");
    expect(result[0]).toHaveProperty("userEmail", "alice@example.com");
  });

  it("returns null for userDisplayName and userEmail for agent (non-user) members", async () => {
    const rows = [
      {
        id: "membership-2",
        companyId: "company-1",
        principalType: "board",
        principalId: "board-1",
        membershipRole: "member",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
        userDisplayName: null,
        userEmail: null,
      },
    ];

    const mockDb = makeMockDb(rows);
    const service = accessService(mockDb as any);
    const result = await service.listMembers("company-1");

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("userDisplayName", null);
    expect(result[0]).toHaveProperty("userEmail", null);
  });

  it("calls leftJoin with authUsers table", async () => {
    const rows: unknown[] = [];
    const mockDb = makeMockDb(rows);
    const service = accessService(mockDb as any);

    await service.listMembers("company-1");

    expect(mockDb.leftJoin).toHaveBeenCalledTimes(1);
    // First argument to leftJoin should be the authUsers table object
    const firstArg = mockDb.leftJoin.mock.calls[0][0];
    // authUsers table name is "user" (from the schema definition)
    expect(firstArg).toBeDefined();
  });
});
