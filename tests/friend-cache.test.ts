import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUpdateFriendPreference } from "@/hooks/mutations/useFriendMutations";
import { queryKeys } from "@/hooks/queries/queryKeys";

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));
vi.mock("@/utils/api/friend", () => ({
  updateFriendPreference: vi.fn(),
  deleteFriend: vi.fn(),
  createFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  rejectFriendRequest: vi.fn(),
  withdrawFriendRequest: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
}));

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient();
  vi.mocked(useQueryClient).mockReturnValue(client);
});

function completePreferenceUpdate(variables: {
  userId: number;
  remark?: string;
  is_favorite?: boolean;
}) {
  // oxlint-disable-next-line react-hooks/rules-of-hooks -- React hooks are mocked; only the mutation callback runs against a real QueryClient.
  useUpdateFriendPreference();
  const options = vi.mocked(useMutation).mock.calls[0][0];
  return options.onSuccess?.(null, variables, undefined, {
    client,
    meta: undefined,
    mutationKey: undefined,
  });
}

describe("friend preference cache updates", () => {
  it("updates identity caches across games without invalidating score data", async () => {
    const alice = { user_id: 2, username: "alice", remark: "old", is_favorite: false };
    const bob = { user_id: 3, username: "bob", remark: "unchanged", is_favorite: false };
    client.setQueryData(queryKeys.friends.list(), { friends: [alice, bob] });
    client.setQueryData(queryKeys.friends.relationship("ALICE"), { ...alice, status: "friend" });
    client.setQueryData(queryKeys.friends.relationship("bob"), { ...bob, status: "friend" });
    for (const game of ["maimai", "chunithm"] as const) {
      client.setQueryData(queryKeys.friends.ranking(game, new URLSearchParams({ song_id: "1" })), [
        alice,
        bob,
      ]);
    }
    const scores = [{ id: 1, achievements: 100 }];
    const scoreKey = queryKeys.friends.scores(2, "maimai");
    client.setQueryData(scoreKey, scores);
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await completePreferenceUpdate({ userId: 2, remark: " new ", is_favorite: true });

    expect(client.getQueryData(queryKeys.friends.list())).toEqual({
      friends: [{ ...alice, remark: "new", is_favorite: true }, bob],
    });
    expect(client.getQueryData(queryKeys.friends.relationship("ALICE"))).toMatchObject({
      remark: "new",
      is_favorite: true,
    });
    expect(client.getQueryData(queryKeys.friends.relationship("bob"))).toMatchObject(bob);
    for (const game of ["maimai", "chunithm"] as const) {
      expect(
        client.getQueryData(queryKeys.friends.ranking(game, new URLSearchParams({ song_id: "1" }))),
      ).toEqual([{ ...alice, remark: "new" }, bob]);
    }
    expect(client.getQueryData(scoreKey)).toBe(scores);
    expect(client.getQueryState(scoreKey)?.isInvalidated).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
    client.clear();
  });

  it("does not invent partial cache entries or erase remarks on a favorite-only update", async () => {
    const alice = { user_id: 2, username: "alice", remark: "keep", is_favorite: false };
    client.setQueryData(queryKeys.friends.list(), { friends: [alice] });
    await completePreferenceUpdate({ userId: 2, is_favorite: true });
    expect(client.getQueryData(queryKeys.friends.list())).toEqual({
      friends: [{ ...alice, is_favorite: true }],
    });
    expect(client.getQueryData(queryKeys.friends.relationship("alice"))).toBeUndefined();
    expect(client.getQueryCache().getAll()).toHaveLength(1);
    client.clear();
  });
});
