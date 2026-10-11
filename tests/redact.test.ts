import { describe, expect, it } from "vitest";
import { luhnValid, redactPii, REDACTION_MARKERS as M } from "@/lib/privacy/redact";

const types = (text: string) => redactPii(text).redactions.map((r) => r.type);

describe("PII redaction", () => {
  describe("card numbers", () => {
    it("checks the Luhn digit", () => {
      expect(luhnValid("4111111111111111")).toBe(true);
      expect(luhnValid("4111111111111112")).toBe(false);
      expect(luhnValid("378282246310005")).toBe(true); // Amex test number
    });

    it("removes Luhn-valid card numbers in common formats", () => {
      expect(redactPii("my card is 4111 1111 1111 1111").text).toBe(`my card is ${M.card_number}`);
      expect(redactPii("4111-1111-1111-1111").text).toBe(M.card_number);
      expect(redactPii("card 4111111111111111.").text).toBe(`card ${M.card_number}.`);
      expect(redactPii("amex 3782 822463 10005 please").text).toBe(`amex ${M.card_number} please`);
    });

    it("keeps trailing digits that are not part of the card (e.g. an expiry date)", () => {
      expect(redactPii("4111 1111 1111 1111 12 28").text).toBe(`${M.card_number} 12 28`);
    });

    it("leaves long numbers that fail the Luhn check", () => {
      expect(redactPii("serial 1234 5678 9012 3456").text).toBe("serial 1234 5678 9012 3456");
      expect(types("0000 0000 0000 0000")).not.toContain("card_number");
    });
  });

  describe("email addresses", () => {
    it("removes email addresses", () => {
      const r = redactPii("email me at jane.doe+router@example.co.uk thanks");
      expect(r.text).toBe(`email me at ${M.email} thanks`);
      expect(r.redactions).toEqual([{ type: "email", count: 1 }]);
    });
  });

  describe("phone numbers", () => {
    it("removes UK national and international numbers", () => {
      expect(redactPii("call 07700 900123").text).toBe(`call ${M.phone}`);
      expect(redactPii("ring me on 020 7946 0958.").text).toBe(`ring me on ${M.phone}.`);
      expect(redactPii("+44 7700 900123 is my mobile").text).toBe(`${M.phone} is my mobile`);
      expect(redactPii("(01632) 960 001").text).toBe(M.phone);
      expect(redactPii("my number is 0044 7700 900123").text).toBe(`my number is ${M.phone}`);
      expect(redactPii("US office +1 415 555 0100").text).toBe(`US office ${M.phone}`);
    });

    it("does not treat IP addresses, versions, speeds, times or dates as phone numbers", () => {
      for (const s of [
        "the router is at 192.168.1.254",
        "firmware 10.2.1.1234",
        "I get 80 Mbps on a good day",
        "it went off at 10:30 this morning",
        "since 11/10/2026",
        "error code 651",
        "the lights flash 3 times",
        "WPS PIN 12345670",
      ]) {
        expect(redactPii(s).text, s).toBe(s);
      }
    });
  });

  describe("UK postcodes", () => {
    it("removes postcodes with or without a space", () => {
      expect(redactPii("I live at SW1A 1AA").text).toBe(`I live at ${M.postcode}`);
      expect(redactPii("postcode m1 1ae please").text).toBe(`postcode ${M.postcode} please`);
      expect(redactPii("EC1A1BB").text).toBe(M.postcode);
      expect(redactPii("B33 8TH, near the shops").text).toBe(`${M.postcode}, near the shops`);
    });

    it("does not match everyday tokens that share the shape", () => {
      for (const s of ["see you b4 2pm", "my PS5 2GB update", "the 5G band", "Hub 3 lights", "model DG8245V", "it is on 2.4 GHz"]) {
        expect(redactPii(s).text, s).toBe(s);
      }
    });
  });

  describe("account numbers", () => {
    it("removes numbers introduced as an account number or sort code", () => {
      expect(redactPii("my account number is 12345678").text).toBe(`my account number is ${M.account_number}`);
      expect(redactPii("Account no. 9876 5432").text).toBe(`Account no. ${M.account_number}`);
      expect(redactPii("customer ref: 556677889").text).toBe(`customer ref: ${M.account_number}`);
      expect(redactPii("sort code 12-34-56").text).toBe(`sort code ${M.account_number}`);
    });

    it("leaves bare numbers without account context", () => {
      expect(redactPii("I tried 12345678 as the wifi password").text).toBe("I tried 12345678 as the wifi password");
      expect(redactPii("my account is broken").text).toBe("my account is broken");
    });
  });

  it("counts several kinds in one utterance and keeps ordinary troubleshooting text intact", () => {
    const r = redactPii("I'm at N1 9GU, call 07700 900123 or 07700 900456, card 4111 1111 1111 1111, the internet light is red");
    expect(r.text).toBe(`I'm at ${M.postcode}, call ${M.phone} or ${M.phone}, card ${M.card_number}, the internet light is red`);
    expect(r.redactions).toEqual([
      { type: "card_number", count: 1 },
      { type: "phone", count: 2 },
      { type: "postcode", count: 1 },
    ]);
    expect(r.total).toBe(4);
  });

  it("is idempotent and leaves text with nothing personal untouched", () => {
    const once = redactPii("email a@b.com, phone 07700 900123").text;
    expect(redactPii(once).text).toBe(once);
    expect(redactPii(once).total).toBe(0);
    const plain = "The power light is green and the broadband light is flashing amber";
    expect(redactPii(plain)).toEqual({ text: plain, redactions: [], total: 0 });
  });
});
