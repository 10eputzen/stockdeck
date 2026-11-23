import { describe, expect, it } from "vitest";
import { cryptoQuery, pairsFor } from "./cryptoPairs";

describe("cryptoQuery", () => {
  it("erkennt Paare mit Trennzeichen", () => {
    expect(cryptoQuery("btc-usdt")).toEqual({ base: "BTC", currency: "USD" });
    expect(cryptoQuery("BTC/USD")).toEqual({ base: "BTC", currency: "USD" });
    expect(cryptoQuery("sol eur")).toEqual({ base: "SOL", currency: "EUR" });
    expect(cryptoQuery("eth-usdc")).toEqual({ base: "ETH", currency: "USD" });
  });
  it("erkennt Börsenpaare ohne Trennzeichen nur mit Stablecoin", () => {
    expect(cryptoQuery("BTCUSDT")).toEqual({ base: "BTC", currency: "USD" });
    expect(cryptoQuery("ethusdc")).toEqual({ base: "ETH", currency: "USD" });
    expect(cryptoQuery("SEUR")).toBeNull();
    expect(cryptoQuery("BTCUSD")).toBeNull();
  });
  it("lässt normale Suchbegriffe in Ruhe", () => {
    expect(cryptoQuery("bitcoin")).toBeNull();
    expect(cryptoQuery("SAP.DE")).toBeNull();
    expect(cryptoQuery("")).toBeNull();
  });
});

describe("pairsFor", () => {
  it("liefert Euro und Dollar in Wunschreihenfolge", () => {
    expect(pairsFor("BTC")).toEqual(["BTC-EUR", "BTC-USD"]);
    expect(pairsFor("BTC", "USD")).toEqual(["BTC-USD", "BTC-EUR"]);
  });
});
