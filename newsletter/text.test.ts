import { describe, expect, it } from "vitest";
import { decodeEntities, toPlainText } from "./text";

describe("decodeEntities", () => {
  it("decodes the named curly-quote entities that caused the title bug", () => {
    expect(
      decodeEntities("Marteau & Co's auction &ldquo;The Heat Wave&rdquo;, June 10"),
    ).toBe("Marteau & Co's auction “The Heat Wave”, June 10");
  });

  it("decodes apostrophes, dashes, ellipsis, and nbsp", () => {
    expect(decodeEntities("Rolex&rsquo;s&nbsp;move&hellip;")).toBe("Rolex’s move…");
    expect(decodeEntities("CHF 500&ndash;600")).toBe("CHF 500–600");
  });

  it("decodes accented brand names (named + numeric + hex)", () => {
    expect(decodeEntities("Chronom&eacute;trie")).toBe("Chronométrie");
    expect(decodeEntities("Caf&#233; / Caf&#xe9;")).toBe("Café / Café");
  });

  it("leaves unknown entities and bare ampersands untouched", () => {
    expect(decodeEntities("A&B &notareal; C")).toBe("A&B &notareal; C");
  });

  it("decodes &amp; without double-decoding the rest", () => {
    expect(decodeEntities("Tudor &amp; &lt;tag&gt;")).toBe("Tudor & <tag>");
  });
});

describe("toPlainText", () => {
  it("strips tags, decodes entities, and collapses whitespace", () => {
    expect(toPlainText("<p>The   <b>brand&rsquo;s</b>\n new\tline</p>")).toBe(
      "The brand’s new line",
    );
  });
});
