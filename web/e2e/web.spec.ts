import { expect, test } from "@playwright/test";

test("T31 gated page access", async ({ page }) => {
  await page.goto("/asset/EB-001/owner");
  await page.getByRole("button", { name: "alice.test" }).click();
  await expect(page.getByRole("heading", { name: "Pay workshop from warranty fund" })).toBeVisible();

  await page.getByRole("button", { name: "Sell this item" }).click();
  await page.getByLabel("Buyer account").fill("budi.test");
  await page.getByRole("button", { name: "Confirm sale" }).click();
  await expect(page.getByRole("heading", { name: "Only the current holder can open this page" })).toBeVisible();

  await page.getByRole("button", { name: "budi.test" }).click();
  await expect(page.getByRole("heading", { name: "Pay workshop from warranty fund" })).toBeVisible();
});

test("T32 sell button flow", async ({ page }) => {
  await page.goto("/asset/EB-001/owner");
  await page.getByRole("button", { name: "alice.test" }).click();
  await expect(page.getByTestId("fund")).toHaveText("10 NEAR");

  await page.getByRole("button", { name: "Sell this item" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("next claim possible at");
  await page.getByLabel("Buyer account").fill("budi.test");
  await page.getByRole("button", { name: "Confirm sale" }).click();

  await expect(page.getByText("Owner is now budi.test")).toBeVisible();
  await expect(page.getByText("Fund is still 10 NEAR")).toBeVisible();
  await expect(page.getByText("2 transfers in total, showing the latest 50")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Only the current holder can open this page" })).toBeVisible();

  await page.getByRole("link", { name: "Warranty EB-001" }).click();
  await expect(page.getByTestId("owner")).toHaveText("budi.test");
  await expect(page.getByTestId("fund")).toHaveText("10 NEAR");
});

test("T38 status labels and next claim", async ({ page }) => {
  await page.goto("/asset/EB-001");
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  await expect(page.getByText(/Next claim possible at /)).toBeVisible();

  await page.goto("/asset/EB-EMPTY");
  await expect(page.getByText("Empty (fund used up)")).toBeVisible();

  await page.goto("/asset/EB-PENDING");
  await expect(page.getByText("Expired, close pending")).toBeVisible();

  await page.goto("/asset/EB-DONE");
  await expect(page.getByText("Expired", { exact: true })).toBeVisible();

  await page.goto("/asset/EB-001/owner");
  await page.getByRole("button", { name: "alice.test" }).click();
  await page.getByRole("button", { name: "Sell this item" }).click();
  await expect(page.getByRole("dialog")).toContainText("next claim possible at");
});
