import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

async function join(browser: Browser, name: string, url = "/") {
  const context = await browser.newContext({
    httpCredentials: { username: "e2e", password: "pw" },
  });
  const page = await context.newPage();
  await page.goto(url);
  await page.getByLabel("Display name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  return page;
}

const addCard = async (page: Page, column: number, text: string) => {
  const col = page.locator(".column").nth(column);
  await col.getByLabel("New card").fill(text);
  await col.getByRole("button", { name: "Add", exact: true }).click();
};

async function drag(page: Page, from: Locator, to: Locator) {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
  await page.mouse.up();
}

test("retro flow with several participants", async ({ browser }) => {
  const owner = await join(browser, "Olga");
  await owner.getByRole("button", { name: "New board" }).click();
  await owner.getByRole("button", { name: "Create board" }).click();
  await owner.waitForURL(/\/boards\//);
  const boardUrl = owner.url();

  const alice = await join(browser, "Alice", boardUrl);
  const bob = await join(browser, "Bob", boardUrl);
  await expect(owner.getByText("Online (3)")).toBeVisible();

  // Write: others' cards are blurred and their text is not in the DOM.
  await addCard(alice, 0, "Alice: deploys are slow");
  await addCard(alice, 0, "Alice: flaky tests");
  await addCard(bob, 1, "Bob: stop long meetings");
  await expect(alice.getByText("Alice: deploys are slow")).toBeVisible();
  await expect(bob.getByRole("img", { name: "Hidden card" })).toHaveCount(2);
  await expect(bob.getByText("Alice: deploys are slow")).toHaveCount(0);
  await expect(owner.getByRole("img", { name: "Hidden card" })).toHaveCount(3);

  // Only the owner can switch phases.
  await expect(alice.getByRole("button", { name: "Group" })).toBeDisabled();

  // Group: owner sees everything and groups two cards; everyone sees the group.
  await owner.getByRole("button", { name: "Group", exact: true }).click();
  await expect(owner.getByText("Alice: flaky tests")).toBeVisible();
  await drag(
    owner,
    owner.locator(".card", { hasText: "Alice: flaky tests" }),
    owner.locator(".card", { hasText: "Alice: deploys are slow" }),
  );
  await expect(owner.locator(".group .card")).toHaveCount(2);
  await expect(bob.getByText("Alice: flaky tests")).toBeVisible(); // revealed by grouping
  await expect(bob.locator(".group .card")).toHaveCount(2);

  // Discuss: a single topic for everyone, in the owner's order.
  await owner.getByRole("button", { name: "Discuss", exact: true }).click();
  await expect(bob.getByText("Topic 1 of 2")).toBeVisible();
  await expect(bob.locator(".card")).toHaveCount(2);
  await expect(bob.getByText("Bob: stop long meetings")).toHaveCount(0);
  await expect(bob.getByRole("button", { name: "Next →" })).toHaveCount(0);

  // Issue creation (GitHub faked): anyone can create one for the current topic.
  await bob.getByRole("button", { name: "Create issue" }).click();
  await bob.getByLabel(/Additional description/).fill("Needs an owner");
  await bob.getByRole("button", { name: "Create issue" }).last().click();
  await expect(owner.getByRole("link", { name: /#1 / })).toBeVisible();
  const issues = (await (await fetch("http://localhost:4010/__issues")).json()) as {
    title: string;
    body: string;
    labels: string[];
  }[];
  expect(issues).toHaveLength(1);
  expect(issues[0]!.labels).toEqual(["retro"]);
  expect(issues[0]!.body).toContain("Needs an owner");
  expect(issues[0]!.body).toContain("/boards/");
  expect(issues[0]!.body).toContain("?topic=");

  // Timer advances and the owner moves on with the keyboard.
  await owner.waitForTimeout(1500);
  await expect(owner.locator(".timer")).not.toHaveText("0:00");
  await owner.keyboard.press("ArrowRight");
  await expect(bob.getByText("Topic 2 of 2")).toBeVisible();
  await expect(bob.getByText("Bob: stop long meetings")).toBeVisible();
  await expect(bob.getByText("discussed")).toHaveCount(0);

  // Done: the full board for everyone, with the issue visible on its card.
  await owner.getByRole("button", { name: "Done", exact: true }).click();
  await expect(bob.locator(".card-text", { hasText: "Alice: deploys are slow" })).toBeVisible();
  await expect(bob.locator(".card-text", { hasText: "Bob: stop long meetings" })).toBeVisible();
  await expect(bob.getByRole("link", { name: /#1 / })).toBeVisible();

  // The board is listed and survives a reload.
  await owner.goto("/");
  await expect(owner.getByRole("link", { name: /Retro/ })).toBeVisible();

  for (const p of [owner, alice, bob]) await p.context().close();
});

test("owner offline: temporary owner, then the owner returns and declines", async ({ browser }) => {
  const owner = await join(browser, "Olga");
  await owner.getByRole("button", { name: "New board" }).click();
  await owner.getByRole("button", { name: "Create board" }).click();
  await owner.waitForURL(/\/boards\//);
  const boardUrl = owner.url();
  await owner.goto("/"); // owner goes offline

  const alice = await join(browser, "Alice", boardUrl);
  const bob = await join(browser, "Bob", boardUrl);
  await alice.getByRole("button", { name: "Group", exact: true }).click();
  await expect(alice.getByText("You are the temporary owner")).toBeVisible();
  await expect(bob.getByRole("button", { name: "Discuss", exact: true })).toBeDisabled();

  await owner.goto(boardUrl);
  await expect(owner.getByText(/took over this board/)).toBeVisible();
  await owner.getByRole("button", { name: "Decline" }).click();
  await expect(owner.getByRole("button", { name: "Discuss", exact: true })).toBeDisabled();
  await expect(alice.getByRole("button", { name: "Discuss", exact: true })).toBeEnabled();

  for (const p of [owner, alice, bob]) await p.context().close();
});
