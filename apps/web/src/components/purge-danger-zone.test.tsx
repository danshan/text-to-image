import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PurgePlan } from "../types";
import type { ApiClient } from "../api/client";
import { PurgeDangerZone } from "./purge-danger-zone";

const creationId = "11111111-1111-4111-8111-111111111111";

describe("PurgeDangerZone", () => {
  it("reviews a prepared executable Plan in a final confirmation dialog", async () => {
    const user = userEvent.setup();
    const plan: PurgePlan = {
      schemaVersion: 1,
      target: { kind: "creation", creationId },
      libraryId: "22222222-2222-4222-8222-222222222222",
      snapshotDigest: "a".repeat(64),
      planDigest: "b".repeat(64),
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

    const review = screen.getByRole("button", { name: "Review Purge impact" });
    await user.click(review);
    expect(screen.queryByRole("textbox")).toBeNull();
    const execute = screen.getByRole("button", { name: "Permanently delete" });
    expect(execute).toHaveProperty("disabled", false);
    await user.click(execute);

    expect(executePurge).toHaveBeenCalledWith("creation", creationId, plan);
    expect(window.location.pathname).toBe("/creations");
  });

  it("keeps execution disabled when surviving relations block the Plan", async () => {
    const user = userEvent.setup();
    const api = {
      preparePurge: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        target: { kind: "image", assetSha256: "a".repeat(64) },
        libraryId: "22222222-2222-4222-8222-222222222222",
        snapshotDigest: "b".repeat(64),
        planDigest: "c".repeat(64),
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

    const review = screen.getByRole("button", { name: "Review Purge impact" });
    await user.click(review);

    expect(screen.getByRole("button", { name: "Permanently delete" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByText(/reference by Generation/u)).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(review));
  });

  it("combines exact recovery evidence selection with the final Purge confirmation", async () => {
    const user = userEvent.setup();
    const transactionId = "44444444-4444-4444-8444-444444444444";
    const basePlan: PurgePlan = {
      schemaVersion: 1,
      target: { kind: "creation", creationId },
      libraryId: "22222222-2222-4222-8222-222222222222",
      snapshotDigest: "a".repeat(64),
      planDigest: "b".repeat(64),
      executable: false,
      deletePaths: [`creations/${creationId}`],
      retainedAssetSha256: [],
      blockingRelations: [],
      recoveryEvidence: [
        {
          transactionId,
          location: "quarantine",
          state: "malformed",
          byteCount: 9,
        },
      ],
      abandonedRecoveryTransactionIds: [],
      warnings: [],
      deleteByteCount: 42,
      fallbackCopyByteCount: 100,
    };
    const approvedPlan: PurgePlan = {
      ...basePlan,
      planDigest: "c".repeat(64),
      executable: true,
      abandonedRecoveryTransactionIds: [transactionId],
    };
    const executePurge = vi.fn().mockResolvedValue(undefined);
    const preparePurge = vi
      .fn()
      .mockResolvedValueOnce(basePlan)
      .mockResolvedValueOnce(approvedPlan);
    const api = { preparePurge, executePurge } as unknown as ApiClient;
    render(<PurgeDangerZone api={api} kind="creation" id={creationId} />);

    await user.click(screen.getByRole("button", { name: "Review Purge impact" }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "Rebuild Plan with selected abandonment" }),
    );

    expect(preparePurge).toHaveBeenLastCalledWith("creation", creationId, [transactionId]);
    expect(screen.getByText(/also abandons 1 selected recovery transaction/u)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Permanently delete" }));
    expect(executePurge).toHaveBeenCalledWith("creation", creationId, approvedPlan);
  });
});
