import { expect, type Page, test } from "@playwright/test";

async function openS03(page: Page) {
  await page.goto("/");
  await page.getByTestId("picker").selectOption("S03-single-delay");
  await expect(page.getByTestId("live")).toHaveText("VALID");
}

test("no horizontal page scroll at 400 px width", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await openS03(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("Gantt bars are keyboard focusable", async ({ page }) => {
  await openS03(page);
  const bar = page.locator('[data-testid^="sim-bar-"]').first();
  await expect(bar).toHaveAttribute("tabindex", "0");
  await bar.focus();
  await expect(bar).toBeFocused();
});

test("Tab reaches the main buttons in a sensible order", async ({ page }) => {
  await openS03(page);
  const order: string[] = [];
  for (let i = 0; i < 600; i++) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? (el.textContent ?? "").trim().slice(0, 40) : "";
    });
    if (label === "Break it" || label === "Inject") order.push(label);
    if (order.includes("Break it") && order.includes("Inject")) break;
  }
  expect(order, "Break it and Inject must both be reachable by Tab").toEqual(
    expect.arrayContaining(["Break it", "Inject"]),
  );
  expect(order.indexOf("Break it")).toBeLessThan(order.indexOf("Inject"));
});

test("focused controls show a visible focus indicator", async ({ page }) => {
  await openS03(page);
  const button = page.getByRole("button", { name: "Inject", exact: true });
  await button.focus();
  const style = await button.evaluate((el) => {
    const s = getComputedStyle(el);
    return { outlineStyle: s.outlineStyle, outlineWidth: Number.parseFloat(s.outlineWidth) };
  });
  expect(style.outlineStyle).not.toBe("none");
  expect(style.outlineWidth).toBeGreaterThanOrEqual(2);
});

test("conflicts are marked with text, not colour alone", async ({ page }) => {
  await openS03(page);
  await page.getByRole("button", { name: "Break it" }).click();
  await expect(page.getByTestId("live")).toHaveText("INVALID");
  const flagged = page.locator('[data-testid^="sim-bar-"][data-conflict="true"]').first();
  await expect(flagged).toContainText("!");
});

test("dark theme keeps the page readable", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openS03(page);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const fg = await page.evaluate(() => getComputedStyle(document.body).color);
  expect(bg).not.toBe(fg);
});
