import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../api/client";
import { RecoveryPage } from "./recovery-page";

describe("RecoveryPage", () => {
  it("requires a dry-run before a state-specific action", async () => {
    const user = userEvent.setup();
    const recoveryDryRun = vi.fn().mockResolvedValue({
      consequence: "Publish the complete prepared transaction.",
      warnings: [],
    });
    const recoveryAction = vi.fn().mockResolvedValue({ status: "committed" });
    const api = {
      recovery: vi.fn().mockResolvedValue({
        items: [
          {
            transactionId: "transaction-1",
            state: "ready_to_commit",
            creationId: "creation-1",
            generationId: "generation-1",
            ageSeconds: 90,
            validation: [],
            recommendedAction: "commit",
            availableActions: ["commit"],
          },
        ],
        quarantineCount: 0,
        lock: { present: false, owner: null },
      }),
      recoveryDryRun,
      recoveryAction,
    } as unknown as ApiClient;

    render(<RecoveryPage api={api} />);
    await user.click(await screen.findByRole("button", { name: "Dry-run commit" }));

    expect(recoveryDryRun).toHaveBeenCalledWith("transaction-1", "commit");
    expect(recoveryAction).not.toHaveBeenCalled();
    expect((await screen.findByRole("dialog")).textContent).toContain(
      "Publish the complete prepared transaction.",
    );

    await user.click(screen.getByRole("button", { name: "Confirm action" }));
    await waitFor(() => expect(recoveryAction).toHaveBeenCalledWith("transaction-1", "commit"));
  });
});
