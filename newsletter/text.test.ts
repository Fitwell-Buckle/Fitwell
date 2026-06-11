import { describe, expect, it } from "vitest";
import { cleanHeadline, decodeEntities, toPlainText } from "./text";

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

describe("cleanHeadline", () => {
  it("strips colon-delimited editorial prefixes", () => {
    expect(
      cleanHeadline("Business News: Richard Mille Owner Files Legal Action"),
    ).toBe("Richard Mille Owner Files Legal Action");
    expect(cleanHeadline("Introducing: The Christopher Ward C60 Pool Diver")).toBe(
      "The Christopher Ward C60 Pool Diver",
    );
    expect(cleanHeadline("New: Girard-Perregaux Laureato Fifty")).toBe(
      "Girard-Perregaux Laureato Fifty",
    );
  });

  it("strips dash-delimited prefixes (en, em, spaced hyphen)", () => {
    expect(cleanHeadline("First Look – The Longines Master Collection")).toBe(
      "The Longines Master Collection",
    );
    expect(cleanHeadline("Introducing — The Urwerk UR-120")).toBe("The Urwerk UR-120");
    expect(cleanHeadline("Hands-On - The Oris Hölstein 2026")).toBe(
      "The Oris Hölstein 2026",
    );
  });

  it("prefers the longest matching prefix (New Release vs New)", () => {
    expect(cleanHeadline("New Release: The Glashütte Original Seventies")).toBe(
      "The Glashütte Original Seventies",
    );
  });

  it("does NOT strip legitimate leading words", () => {
    expect(cleanHeadline("New CEO at Rolex as Heinrich Steps Down")).toBe(
      "New CEO at Rolex as Heinrich Steps Down",
    );
    expect(cleanHeadline("Rolex hikes prices by 5% on gold watches")).toBe(
      "Rolex hikes prices by 5% on gold watches",
    );
  });

  it("never blanks a headline that is only a prefix", () => {
    expect(cleanHeadline("Introducing:")).toBe("Introducing:");
  });

  it("re-capitalizes when the strip leaves a lowercase start", () => {
    expect(cleanHeadline("Introducing: the new Tudor Black Bay")).toBe(
      "The new Tudor Black Bay",
    );
  });

  it("is case-insensitive on the prefix", () => {
    expect(cleanHeadline("INTRODUCING: The MB&F HM12")).toBe("The MB&F HM12");
  });
});

describe("cleanHeadline — no-colon lead-ins", () => {
  it("strips 'Introducing the/a' but keeps the rest", () => {
    expect(
      cleanHeadline("Introducing the Autodromo Group C Turbo Sport, the Brand’s First Ana-Digi Watch"),
    ).toBe("The Autodromo Group C Turbo Sport, the Brand’s First Ana-Digi Watch");
    expect(cleanHeadline("First Look at the New Oris Diver")).toBe("The New Oris Diver");
  });

  it("leaves a podcast/show name with a colon intact", () => {
    expect(
      cleanHeadline("The Business of Watches Podcast: Benjamin Arabov, CEO Of Jacob & Co."),
    ).toBe("The Business of Watches Podcast: Benjamin Arabov, CEO Of Jacob & Co.");
  });
});
