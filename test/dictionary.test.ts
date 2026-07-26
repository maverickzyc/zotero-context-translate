import { expect } from "chai";
import { isDictionaryLookupCandidate } from "../src/modules/context/dictionary";

describe("dictionary lookup routing", function () {
  it("routes a single English word or hyphenated term to the local dictionary", function () {
    expect(isDictionaryLookupCandidate("agency")).to.equal(true);
    expect(isDictionaryLookupCandidate("self-efficacy")).to.equal(true);
    expect(isDictionaryLookupCandidate("teacher's")).to.equal(true);
  });

  it("routes phrases and sentences to contextual translation", function () {
    expect(isDictionaryLookupCandidate("teacher agency")).to.equal(false);
    expect(isDictionaryLookupCandidate("a useful finding")).to.equal(false);
    expect(isDictionaryLookupCandidate("教师能动性")).to.equal(false);
  });
});
