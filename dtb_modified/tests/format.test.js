import { describe, it, expect } from "vitest";
import {
  observationLabel,
  observationPill,
  syncPill,
  formatRecordDate,
  formatGps,
  coveragePct,
  percent
} from "../src/lib/format.js";
import { escapeHtml, escapeJsArg } from "../src/lib/dom.js";

describe("observation wording", () => {
  it("never presents an operator reading as a bare verdict", () => {
    expect(observationLabel("positive")).toBe("Observed positive");
    expect(observationLabel("negative")).toBe("Observed negative");
    expect(observationLabel("unreadable")).toBe("Not read");
  });

  it("falls back to 'Not read' for anything unrecognised", () => {
    for (const value of ["confirmed", "", null, undefined, "POSITIVE", 7, {}]) {
      expect(observationLabel(value)).toBe("Not read");
    }
  });

  it("escapes the label it renders into a pill", () => {
    const pill = observationPill("positive");
    expect(pill).toContain("Observed positive");
    expect(pill).toContain('class="status-pill positive"');
    // An injected value cannot reach the DOM as markup.
    expect(observationPill("<img onerror=alert(1)>")).not.toContain("<img");
  });
});

describe("syncPill", () => {
  it("distinguishes uploaded from on-device", () => {
    expect(syncPill("synced")).toContain("SYNCED");
    expect(syncPill("offline")).toContain("ON DEVICE");
    // Anything that is not a confirmed upload reads as on-device.
    expect(syncPill("pending")).toContain("ON DEVICE");
    expect(syncPill(undefined)).toContain("ON DEVICE");
  });
});

describe("formatRecordDate", () => {
  it("says Unknown rather than 'Invalid Date'", () => {
    expect(formatRecordDate(null)).toBe("Unknown");
    expect(formatRecordDate("")).toBe("Unknown");
    expect(formatRecordDate("not a date")).toBe("Unknown");
    expect(formatRecordDate(new Date("nope"))).toBe("Unknown");
  });

  it("formats a real date", () => {
    const formatted = formatRecordDate("2026-03-15T09:30:00.000Z");
    expect(formatted).not.toBe("Unknown");
    expect(formatted).toMatch(/2026/);
  });
});

describe("formatGps", () => {
  it("reports a missing fix plainly", () => {
    expect(formatGps(null, 77.1, 5)).toBe("Not captured");
    expect(formatGps(12.5, undefined, 5)).toBe("Not captured");
    expect(formatGps("12.5", "77.1", 5)).toBe("Not captured");
    expect(formatGps(NaN, 77.1, 5)).toBe("Not captured");
  });

  it("formats a fix to six decimal places and shows accuracy when known", () => {
    expect(formatGps(12.5, 77.1, null)).toBe("12.500000, 77.100000");
    expect(formatGps(12.5, 77.1, 12.4)).toBe("12.500000, 77.100000 (±12 m)");
  });
});

describe("percentages", () => {
  it("returns a number for anything unusable rather than NaN", () => {
    for (const value of [NaN, Infinity, undefined, null, "abc", {}]) {
      expect(percent(value)).toBe(0);
      expect(coveragePct(value)).toBe(0);
    }
    expect(percent(0.4)).toBe(0);
    expect(percent(0.5)).toBe(1);
    expect(coveragePct(0.0642)).toBe(6);
  });
});

describe("escapeHtml", () => {
  it("escapes every character that can break out of text or an attribute", () => {
    expect(escapeHtml('<script>"x"&\'y\'</script>')).toBe(
      "&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;"
    );
  });

  it("renders nullish values as empty, not as the text 'undefined'", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(0)).toBe("0");
    expect(escapeHtml(false)).toBe("false");
  });
});

describe("escapeJsArg", () => {
  /**
   * The real property is that the escaped output, dropped inside a
   * single-quoted string in an HTML attribute, still parses back to the
   * original value -- i.e. nothing in the value can terminate the string early.
   */
  const roundTripsInsideSingleQuotes = (value) => {
    const escaped = escapeJsArg(value);
    // eslint-disable-next-line no-new-func
    const parsed = new Function(`return '${escaped}';`)();
    return parsed === value;
  };

  it("round-trips hostile values through a single-quoted attribute", () => {
    for (const hostile of [
      "');alert(1);//",
      "'-alert(1)-'",
      "\\'; alert(1); //",
      "</script><script>alert(1)</script>",
      "a'b'c",
      'say "hi"',
      "back\\slash",
      "trailing\\",
      ""
    ]) {
      expect(roundTripsInsideSingleQuotes(hostile)).toBe(true);
    }
  });

  it("cannot break out of an attribute even when concatenated into a handler", () => {
    // Reproduces the v1 pattern: an inline onclick built by concatenation.
    const hostile = "x');document.body.innerHTML='pwned';//";
    const attribute = `onclick="doIt('${escapeJsArg(hostile)}')"`;
    // Count only quotes that are not backslash-escaped: those are the ones
    // that could terminate the string. There must be exactly the two the
    // template itself contributes.
    const unescaped = (attribute.match(/(?<!\\)'/g) || []).length;
    expect(unescaped).toBe(2);
    expect(attribute.endsWith(`')"`)).toBe(true);
    expect(roundTripsInsideSingleQuotes(hostile)).toBe(true);
  });

  it("preserves backslashes instead of doubling them", () => {
    // Regression: an earlier version escaped backslashes after JSON.stringify
    // had already escaped them, so one backslash became two and the stored
    // value no longer matched what the operator typed.
    for (const value of ["back\\slash", "trailing\\", "\\'; alert(1); //", 'say "hi"']) {
      expect(roundTripsInsideSingleQuotes(value)).toBe(true);
    }
  });

  it("renders nullish values as an empty string, not 'undefined'", () => {
    expect(escapeJsArg(null)).toBe("");
    expect(escapeJsArg(undefined)).toBe("");
  });
});
