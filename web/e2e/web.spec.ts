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

  await page.getByRole("link", { name: "Warranty", exact: true }).click();
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

test("testnet badge is visible on every route", async ({ page }) => {
  for (const path of [
    "/",
    "/asset/EB-001",
    "/asset/EB-001/owner",
    "/asset/EB-001/history",
    "/issuer",
    "/workshop",
    "/how-it-works",
    "/does-not-exist",
  ]) {
    await page.goto(path);
    await expect(page.locator(".tag")).toHaveText("Testnet");
  }
});

test("B3 next claim is hidden when a claim is impossible", async ({ page }) => {
  await page.goto("/asset/EB-EMPTY");
  await expect(page.getByText("Next claim: —")).toBeVisible();
  await expect(page.getByText("Next claim: possible now")).toHaveCount(0);

  await page.goto("/asset/EB-DONE");
  await expect(page.getByText("Next claim: expired")).toBeVisible();
});

test("unknown route shows Page not found with the shell around it", async ({ page }) => {
  await page.goto("/does-not-exist");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByText("This page does not exist.")).toBeVisible();
  await expect(page.locator(".tag")).toHaveText("Testnet");
  await expect(page.getByRole("link", { name: "Back to Home" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page.getByRole("heading", { name: "The warranty travels with the bike" })).toBeVisible();
});

test("issuer page hides the mint form until a wallet is connected", async ({ page }) => {
  await page.goto("/issuer");
  await expect(page.getByRole("heading", { name: "Mint a warranty" })).toBeVisible();
  await expect(page.getByText("Connect an issuer wallet to mint warranties.")).toBeVisible();
  await expect(page.locator("#token-id")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mint warranty" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Fill demo values" })).toHaveCount(0);

  await page.getByRole("button", { name: "Connect wallet" }).click();
  const picker = page.getByTestId("wallet-picker");
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "Meteor Wallet" }).click();
  await expect(page.locator("#token-id")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mint warranty" })).toBeVisible();
  await expect(page.getByText("Only accounts on the issuer allowlist can mint.")).toBeVisible();
});

test("a non-issuer sees the allowlist message from the contract", async ({ page }) => {
  await page.goto("/issuer");
  await page.getByRole("button", { name: "alice.test" }).click();
  await page.getByRole("button", { name: "Fill demo values" }).click();
  await page.getByRole("button", { name: "Mint warranty" }).click();
  await expect(page.getByRole("alert")).toContainText("This account is not an allowed issuer.");
});

test("home page offers one Connect wallet entry point", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Connect a wallet to see your warranties.")).toBeVisible();
  const buttons = page.getByRole("button", { name: "Connect wallet" });
  await expect(buttons).toHaveCount(0);
});

test("mobile: warranty table header is hidden and h1 is 2.25rem at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.locator("#all-warranties tbody tr").first()).toBeVisible();
  await expect(page.locator("#all-warranties thead")).toBeHidden();
  const fontSize = await page.locator("h1").first().evaluate((el) => getComputedStyle(el).fontSize);
  // The hero h1 clamps between 2.25rem and 3.5rem; 375px sits at the floor.
  expect(Number.parseFloat(fontSize)).toBeCloseTo(36, 1);
});

test("app CSS does not leak into the wallet modal host", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const probe = await page.evaluate(() => {
    const measure = (className: string) => {
      const el = document.createElement("div");
      el.className = className;
      el.textContent = "probe";
      document.body.appendChild(el);
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      // getComputedStyle is live: copy the values before the node is removed.
      const out = {
        height: box.height,
        display: style.display,
        padding: style.padding,
        background: style.backgroundColor,
      };
      document.body.removeChild(el);
      return out;
    };
    return { card: measure("card"), app: measure("app"), sidebar: measure("sidebar") };
  });
  // The wallet selector modal mounts on document.body, outside #root. Leaking
  // app CSS into it is the PR #7 bug: rows became ~862px tall. A wallet row is
  // about 62px, so anything near 100+ means the leak is back.
  expect(probe.card.background).toBe("rgba(0, 0, 0, 0)");
  expect(probe.card.padding).toBe("0px");
  expect(probe.card.height).toBeLessThan(100);
  expect(probe.app.display).not.toBe("grid");
  expect(probe.sidebar.height).toBeLessThan(100);
});

test("holder page prefills the claim amount with the claimable maximum", async ({ page }) => {
  await page.goto("/asset/EB-001/owner");
  await page.getByRole("button", { name: "alice.test" }).click();
  await expect(page.locator("#amount")).toHaveValue("3");
  await expect(page.getByTestId("claim-hint")).toContainText("You can claim up to 3 NEAR now.");
});

test("claim button is disabled during the cooldown and counts down", async ({ page }) => {
  await page.goto("/asset/EB-001/owner");
  await page.getByRole("button", { name: "alice.test" }).click();
  await expect(page.getByRole("button", { name: "Request service payment" })).toBeDisabled();
  await expect(page.getByTestId("claim-blocked")).toContainText("Next claim available at");
  await expect(page.getByTestId("claim-blocked")).toContainText("(in ");
});

test("claim amount is validated in plain English before signing", async ({ page }) => {
  await page.goto("/asset/EB-001/owner");
  await page.getByRole("button", { name: "alice.test" }).click();

  await page.locator("#amount").fill("0");
  await expect(page.getByTestId("claim-problem")).toHaveText("The amount must be more than 0 NEAR.");

  await page.locator("#amount").fill("abc");
  await expect(page.getByTestId("claim-problem")).toHaveText("Enter a NEAR amount such as 0.2.");

  await page.locator("#amount").fill("5");
  await expect(page.getByTestId("claim-problem")).toHaveText("The amount is above the per-claim limit of 3 NEAR.");

  await page.locator("#amount").fill("3");
  await expect(page.getByTestId("claim-problem")).toHaveCount(0);
});

test("claim amount above the remaining fund is rejected", async ({ page }) => {
  await page.goto("/asset/EB-EMPTY/owner");
  await page.getByRole("button", { name: "alice.test" }).click();
  await expect(page.getByTestId("claim-blocked")).toHaveText("The fund is empty.");
  await page.locator("#amount").fill("1");
  await expect(page.getByTestId("claim-problem")).toHaveText("The amount is above the remaining fund of 0 NEAR.");
});

test("a connected non-holder sees who holds the warranty and can switch account", async ({ page }) => {
  await page.goto("/asset/EB-001/owner");
  await page.getByRole("button", { name: "budi.test" }).click();
  await expect(page.getByText(/You are signed in as budi\.test, but this warranty is held by alice\.test\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the warranty" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Request service payment" })).toHaveCount(0);
});

test("the amount refills with the new maximum after a successful claim", async ({ page }) => {
  await page.goto("/asset/EB-FRESH/owner");
  await page.getByRole("button", { name: "alice.test" }).click();
  await expect(page.locator("#amount")).toHaveValue("3");
  await expect(page.getByTestId("cooldown-note")).toContainText("Cooldown between claims: 1 minute.");

  await page.getByRole("button", { name: "Request service payment" }).click();
  await expect(page.getByText("The workshop was paid.")).toBeVisible();
  await expect(page.getByTestId("fund")).toHaveText("1 NEAR");
  await expect(page.locator("#amount")).toHaveValue("1");
});

test("the claim form states the real cooldown from the contract", async ({ page }) => {
  await page.goto("/asset/EB-001/owner");
  await page.getByRole("button", { name: "alice.test" }).click();
  await expect(page.getByTestId("cooldown-note")).toContainText("Cooldown between claims: 1 minute.");
  await expect(page.getByTestId("cooldown-note")).toContainText("This is a short demo cooldown. A real warranty would use days.");
});

test("how it works lists the supported wallets with an honest status", async ({ page }) => {
  await page.goto("/how-it-works");
  const table = page.locator("#supported-wallets");
  // The detail table starts collapsed; the logo strip is the first thing readers see.
  await expect(table).toBeHidden();
  await page.locator(".wallet-details summary").click();
  await expect(table).toBeVisible();
  await expect(table.locator("tbody tr")).toHaveCount(10);
  await expect(table).toContainText("MyNearWallet");
  await expect(table).toContainText("Ledger");
  await expect(table).toContainText("MetaMask");
  await expect(table).toContainText("Retired");
  await expect(table.locator("tbody")).toContainText("not verified");
});

test("connect dialog at 375px lists the NEAR wallets and the Meteor hint", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  // Below 900px the sidebar is collapsed behind the Menu button.
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Choose a wallet" }).click();

  const dialog = page.getByTestId("wallet-picker");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("NEAR wallets");
  await expect(dialog).toContainText("Meteor Wallet");
  await expect(page.getByTestId("meteor-hint")).toHaveText(
    "Meteor opens a popup window. Allow popups for this site.",
  );
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);

  await page.screenshot({ path: "test-results/connect-dialog-375.png" });

  // The picker still signs in through the test wallet in the test build.
  await dialog.getByRole("button", { name: "Meteor Wallet" }).click();
  await expect(dialog).toHaveCount(0);
  // The account line lives in the sidebar, which is collapsed at 375px.
  await expect(page.locator(".who")).toHaveText("Signed in as alice.test");
});

async function openPickerFromSidebar(page: import("@playwright/test").Page, mobile: boolean) {
  if (mobile) {
    await page.getByRole("button", { name: "Menu" }).click();
  }
  await page.getByRole("button", { name: "Choose a wallet" }).click();
}

test.describe("wallet picker is a real modal", () => {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800, mobile: false },
    { name: "mobile", width: 375, height: 812, mobile: true },
  ]) {
    test(`${viewport.name}: opens inside the viewport at scrollY 0 and closes on Escape`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/");
      await page.evaluate(() => window.scrollTo(0, 0));
      await openPickerFromSidebar(page, viewport.mobile);

      const dialog = page.getByTestId("wallet-picker");
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute("open", "");

      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      }

      await expect(dialog).toContainText("NEAR wallets");
      await expect(dialog).toContainText("Meteor Wallet");
      // Retired wallets stay listed but cannot be picked.
      await expect(dialog.getByRole("button", { name: "MyNearWallet" })).toBeDisabled();

      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    });
  }

  test("the issuer connect button opens the picker instead of a wallet", async ({ page }) => {
    await page.goto("/issuer");
    await expect(page.getByText("Connect an issuer wallet to mint warranties.")).toBeVisible();
    await page.getByRole("button", { name: "Connect wallet" }).click();
    const dialog = page.getByTestId("wallet-picker");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Meteor Wallet");
    // Nothing navigates and no wallet popup is attempted until a wallet is picked.
    await expect(page).toHaveURL(/\/issuer$/);
    await page.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("the holder page connect button opens the picker", async ({ page }) => {
    await page.goto("/asset/EB-001/owner");
    await page.getByRole("button", { name: "Connect wallet" }).click();
    await expect(page.getByTestId("wallet-picker")).toBeVisible();
  });

  test("the picker still opens with a locked-down window.ethereum", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "ethereum", {
        value: { isMetaMask: false },
        configurable: false,
        writable: false,
      });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Choose a wallet" }).click();
    await expect(page.getByTestId("wallet-picker")).toBeVisible();
  });
});

test("the EVM group appears after the NEAR wallets with logos or fallbacks", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Choose a wallet" }).click();

  const dialog = page.getByTestId("wallet-picker");
  await expect(dialog).toBeVisible();
  const headings = await dialog.locator("h3").allInnerTexts();
  expect(headings).toEqual(["NEAR wallets", "Other wallets (EVM)"]);
  // One honest EVM entry: the picker cannot name a specific extension, because
  // whichever wallet owns window.ethereum is the one that opens.
  await expect(dialog).toContainText("Other wallet");
  await expect(dialog).toContainText("MetaMask, Coinbase Wallet, Phantom, Rabby, Zerion or OKX");
  // Six NEAR wallets plus the retired MyNearWallet row, which stays visible
  // but disabled, and one EVM entry. Bitte Wallet is no longer listed.
  expect(await dialog.locator("li").count()).toBe(8);
  await expect(dialog.getByRole("button", { name: "MyNearWallet" })).toBeDisabled();

  // Every row carries a bundled logo or the neutral initial badge.
  const rows = dialog.locator("li");
  const rowCount = await rows.count();
  const withArt = await dialog.locator("img.wallet-logo, .wallet-logo-fallback").count();
  expect(withArt).toBe(rowCount);
  expect(await dialog.locator("img.wallet-logo").count()).toBeGreaterThan(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.screenshot({ path: "test-results/picker-with-evm-375.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
