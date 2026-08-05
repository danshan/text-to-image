import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PurgePlan } from "../types";
import type { ApiClient } from "../api/client";
import { PurgeDangerZone } from "./purge-danger-zone";

const creationId = "11111111-1111-4111-8111-111111111111";

describe("PurgeDangerZone", () => {
  it("requires a prepared executable Plan and exact typed confirmation", async () => {
    const user = userEvent.setup();
    const plan: PurgePlan = {
      schemaVersion: 1,
      target: { kind: "creation", creationId },
      libraryId: "22222222-2222-4222-8222-222222222222",
      snapshotDigest: "a".repeat(64),
      planDigest: "b".repeat(64),
      confirmationPhrase: `PURGE CREATION ${creationId}`,
      executable: true,
      deletePaths: [`creations/${creationId}`],
      retainedAssetSha256: [],
      blockingRelations: [],
      recoveryEvidence: [],
      abandonedRecoveryTransactionIds: [],
      warnings: [],
      deleteByteCount: 42,
      fallbackCopyByteCount: 100,
    };
    const executePurge = vi.fn().mockResolvedValue(undefined);
    const api = {
      preparePurge: vi.fn().mockResolvedValue(plan),
      executePurge,
    } as unknown as ApiClient;
    render(<PurgeDangerZone api={api} kind="creation" id={creationId} />);

    await user.click(screen.getByRole("button", { name: "Review Purge impact" }));
    const execute = screen.getByRole("button", { name: "Purge permanently" });
    expect(execute).toHaveProperty("disabled", true);

    await user.type(screen.getByRole("textbox"), plan.confirmationPhrase);
    expect(execute).toHaveProperty("disabled", false);
    await user.click(execute);

    expect(executePurge).toHaveBeenCalledWith("creation", creationId, plan);
    expect(window.location.pathname).toBe("/creations");
  });

  it("keeps execution disabled when surviving relations block the Plan", async () => {
    const user = userEvent.setup();
    const phrase = `PURGE IMAGE ${"a".repeat(64)}`;
    const api = {
      preparePurge: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        target: { kind: "image", assetSha256: "a".repeat(64) },
        libraryId: "22222222-2222-4222-8222-222222222222",
        snapshotDigest: "b".repeat(64),
        planDigest: "c".repeat(64),
        confirmationPhrase: phrase,
        executable: false,
        deletePaths: [],
        retainedAssetSha256: [],
        blockingRelations: [
          {
            creationId,
            generationId: "33333333-3333-4333-8333-333333333333",
            relationType: "reference",
          },
        ],
        recoveryEvidence: [],
        abandonedRecoveryTransactionIds: [],
        warnings: [],
        deleteByteCount: 0,
        fallbackCopyByteCount: 0,
      } satisfies PurgePlan),
      executePurge: vi.fn(),
    } as unknown as ApiClient;
    render(<PurgeDangerZone api={api} kind="image" id={"a".repeat(64)} />);

    await user.click(screen.getByRole("button", { name: "Review Purge impact" }));
    await user.type(screen.getByRole("textbox"), phrase);

    expect(screen.getByRole("button", { name: "Purge permanently" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByText(/reference by Generation/u)).toBeTruthy();
  });
});
