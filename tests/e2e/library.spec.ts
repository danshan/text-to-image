import { expect, test } from "@playwright/test";

test("renders the warm thumbnail first screen within two seconds", async ({ page }) => {
  const startedAt = Date.now();
  await page.goto("/gallery");
  await expect(page.getByAltText("Generated image from Minimal Fixture")).toBeVisible();
  expect(Date.now() - startedAt).toBeLessThanOrEqual(2_000);
});

test("keeps the compact desktop shell visually stable", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/gallery");
  await expect(page).toHaveScreenshot("gallery-1024.png", {
    fullPage: true,
    animations: "disabled",
    mask: [page.locator("time"), page.locator("code"), page.locator(".revision-chip")],
    maxDiffPixels: 1_000,
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/creations/f69e912d-c504-4278-89d5-4558ba452df0");
  await expect(page).toHaveScreenshot("creation-1440.png", {
    fullPage: true,
    animations: "disabled",
    mask: [page.locator("time"), page.locator("code"), page.locator(".revision-chip")],
    maxDiffPixels: 1_000,
  });
});

test("traverses immutable provenance from an image to its creation", async ({ page }) => {
  await page.goto("/gallery");

  await expect(page.getByRole("heading", { level: 1, name: "Gallery" })).toBeVisible();
  await expect(page.getByText("1 frames")).toBeVisible();

  await page
    .getByRole("link")
    .filter({ has: page.getByAltText("Generated image from Minimal Fixture") })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Minimal Fixture" })).toBeVisible();

  await expect(page.locator(".provenance-section .relation-card")).toHaveCount(2);
  await page.locator(".provenance-section .relation-card").first().click();
  await expect(page.getByRole("heading", { level: 2, name: "Prompt Revision" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Outputs" })).toBeVisible();

  await page.getByRole("link", { name: /Open linked Prompt Revision/ }).click();
  await expect(page).toHaveURL(/\/creations\/[^?]+\?revision=[^&]+&generation=/);
  await expect(page.getByRole("heading", { level: 1, name: "Minimal Fixture" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Prompt History" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Generation Timeline" })).toBeVisible();
  await expect(page.locator(".revision-item.is-focused")).toHaveCount(1);
  await expect(page.locator(".timeline > li.is-focused")).toHaveCount(1);
});

test("keeps gallery search in the URL and restores it through browser history", async ({
  page,
}) => {
  await page.goto("/gallery");

  const search = page.getByRole("searchbox", { name: "Search prompts, titles, tags and notes" });
  await search.fill("no-match");
  await search.press("Enter");

  await expect(page).toHaveURL(/\/gallery\?q=no-match/);
  await expect(
    page.getByRole("heading", { level: 2, name: "No frames match this exposure" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Clear search and filters" }).click();
  await expect(page).toHaveURL(/\/gallery$/);
  await expect(page.getByAltText("Generated image from Minimal Fixture")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/gallery\?q=no-match/);
  await expect(search).toHaveValue("no-match");
});

test("supports keyboard skip navigation and persistent theme selection", async ({
  page,
}, testInfo) => {
  await page.goto("/gallery");

  await expect(page.getByRole("heading", { level: 1, name: "Gallery" })).toBeVisible();
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  if (testInfo.project.name === "webkit") {
    await skipLink.focus();
  } else {
    await page.keyboard.press("Tab");
  }
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  await page.getByRole("button", { name: "dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByRole("button", { name: "dark" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("filters curated images and persists optimistic curation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The shared E2E Library is mutated once.");
  await page.goto("/gallery");

  const favorite = page.getByRole("button", { name: "Add to favorites" });
  await favorite.click();
  await expect(page.getByRole("button", { name: "Remove from favorites" })).toBeVisible();

  await page.getByRole("button", { name: /Filters/ }).click();
  await page.getByRole("checkbox", { name: "Favorites only" }).check();
  await page.getByRole("button", { name: "Apply filters" }).click();

  await expect(page).toHaveURL(/favorite=true/);
  await expect(page.getByAltText("Generated image from Minimal Fixture")).toBeVisible();
});

test("compares prompt revisions and previews recovery without mutation", async ({ page }) => {
  await page.goto("/creations/f69e912d-c504-4278-89d5-4558ba452df0");

  const revisionSelectors = page.getByRole("checkbox", { name: "Compare" });
  await expect(revisionSelectors).toHaveCount(2);
  await revisionSelectors.nth(0).check();
  await revisionSelectors.nth(1).check();
  await expect(page.getByLabel("Prompt revision comparison")).toBeVisible();

  await page.getByRole("link", { name: /Recovery/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Recovery" })).toBeVisible();
  await page.getByRole("button", { name: "Dry-run cancel" }).click();
  await expect(page.getByRole("dialog", { name: "cancel" })).toContainText(
    "Review the staged transaction before confirming this action.",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "cancel" })).toHaveCount(0);
});

test("reviews Purge impact without requiring typed target identity", async ({ page }) => {
  await page.goto("/creations/f69e912d-c504-4278-89d5-4558ba452df0");

  const review = page.getByRole("button", { name: "Review Purge impact" });
  await review.click();
  const dialog = page.getByRole("dialog", { name: /Permanently delete this Creation/u });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Permanently delete" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(review).toBeFocused();
});

test("aligns Image Asset Purge impact labels and values", async ({ page }) => {
  await page.goto("/gallery");
  await page
    .getByRole("link")
    .filter({ has: page.getByAltText("Generated image from Minimal Fixture") })
    .click();

  await page.getByRole("button", { name: "Review Purge impact" }).click();
  const dialog = page.getByRole("dialog", { name: /Permanently delete this Image Asset/u });
  await expect(dialog).toBeVisible();
  const bytesRow = dialog.getByText("Bytes", { exact: true }).locator("..");
  const labelBox = await bytesRow.locator("dt").boundingBox();
  const valueBox = await bytesRow.locator("dd").boundingBox();

  expect(labelBox).not.toBeNull();
  expect(valueBox).not.toBeNull();
  if (!labelBox || !valueBox) throw new Error("Expected Purge impact metrics to be visible.");
  expect(Math.abs(labelBox.x - valueBox.x)).toBeLessThan(1);
});
