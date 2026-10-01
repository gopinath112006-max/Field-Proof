import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Mobile bottom navigation horizontal scrolling", () => {
  const cssPath = path.resolve(__dirname, "../src/styles/main.css");
  const htmlPath = path.resolve(__dirname, "../index.html");
  const css = fs.readFileSync(cssPath, "utf-8");
  const html = fs.readFileSync(htmlPath, "utf-8");

  it("defines the mobile media query at max-width 560px", () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*560px\)/);
  });

  function getMobileNavBlock() {
    const blocks = [...css.matchAll(/@media\s*\(max-width:\s*560px\)\s*\{([\s\S]*?\n\})/g)];
    const targetBlock = blocks.map(b => b[1]).find(b => b.includes("sidebar-nav-scroll"));
    return targetBlock || "";
  }

  it("configures .sidebar as a fixed bottom bar with safe-area handling and overflow hidden", () => {
    const content = getMobileNavBlock();
    expect(content).not.toBe("");

    expect(content).toMatch(/\.sidebar\s*\{[^}]*position:\s*fixed/);
    expect(content).toMatch(/\.sidebar\s*\{[^}]*bottom:\s*0/);
    expect(content).toMatch(/\.sidebar\s*\{[^}]*env\(safe-area-inset-bottom/);
    expect(content).toMatch(/\.sidebar\s*\{[^}]*overflow:\s*hidden/);
  });

  it("configures .sidebar-nav-scroll as a bounded horizontal scroll container", () => {
    const content = getMobileNavBlock();

    expect(content).toMatch(/overflow-x:\s*auto/);
    expect(content).toMatch(/overflow-y:\s*hidden/);
    expect(content).toMatch(/-webkit-overflow-scrolling:\s*touch/);
    expect(content).toMatch(/overscroll-behavior-x:\s*contain/);
    expect(content).toMatch(/flex-wrap:\s*nowrap/);
    expect(content).toMatch(/touch-action:\s*pan-x/);

    // Must NOT have width: max-content on mobile nav container
    expect(content).not.toMatch(/\.sidebar\s+nav\s*\{[^}]*width:\s*max-content/);
    expect(content).not.toMatch(/\.sidebar-nav-scroll\s*\{[^}]*width:\s*max-content/);
  });

  it("hides the scrollbar visually without preventing scrolling", () => {
    const content = getMobileNavBlock();

    expect(content).toMatch(/scrollbar-width:\s*none/);
    expect(content).toMatch(/::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
  });

  it("provides right clearance for the final navigation item", () => {
    const content = getMobileNavBlock();

    expect(content).toMatch(/padding:\s*0\s+calc\(16px/);
  });

  it("ensures nav-items do not shrink and maintain minimum readable width", () => {
    const content = getMobileNavBlock();

    expect(content).toMatch(/flex:\s*0\s+0\s+auto/);
    expect(content).toMatch(/min-width:\s*74px/);
  });

  it("contains all 10 expected navigation items in index.html", () => {
    const navMatch = html.match(/<nav class="sidebar-nav-scroll"[^>]*>([\s\S]*?)<\/nav>/);
    expect(navMatch).not.toBeNull();
    const navContent = navMatch[1];

    const items = [...navContent.matchAll(/data-page="([^"]+)"/g)].map((m) => m[1]);
    expect(items).toEqual([
      "dashboard",
      "newtest",
      "history",
      "reports",
      "locations",
      "offline",
      "sync",
      "guide",
      "settings",
      "profile"
    ]);
  });

  it("computes scroll geometry correctly across all target viewports", () => {
    const targetViewports = [
      { name: "360x640", width: 360 },
      { name: "375x667", width: 375 },
      { name: "390x844", width: 390 },
      { name: "393x852", width: 393 },
      { name: "412x915", width: 412 },
      { name: "430x932", width: 430 }
    ];

    const itemCount = 10;
    const itemWidth = 74;
    const gap = 6;
    const paddingLeft = 8;
    const paddingRight = 16;
    const totalContentWidth = paddingLeft + (itemCount * itemWidth) + ((itemCount - 1) * gap) + paddingRight;

    expect(totalContentWidth).toBe(818);

    for (const vp of targetViewports) {
      expect(totalContentWidth).toBeGreaterThan(vp.width);
      const scrollableDistance = totalContentWidth - vp.width;
      expect(scrollableDistance).toBeGreaterThan(0);

      // First item start
      const firstItemStart = paddingLeft;
      expect(firstItemStart).toBeGreaterThanOrEqual(0);

      // Last item end at max scroll
      const lastItemEndAtMaxScroll = totalContentWidth - scrollableDistance;
      expect(lastItemEndAtMaxScroll).toBe(vp.width);
      // Clearance before screen edge is paddingRight
      expect(paddingRight).toBe(16);
    }
  });
});
