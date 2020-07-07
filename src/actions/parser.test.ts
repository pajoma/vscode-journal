import * as assert from "assert";
import { Parser } from "./parser";

describe("parser", () => {
  describe("tags", () => {
    const data = [
      {
        input: "#tag",
        tags: ["#tag"],
      },
      {
        input: "  #tag something else",
        tags: ["#tag"],
      },
      {
        input: "#tag #tag2 #tag3",
        tags: ["#tag","#tag2","#tag3"],
      },
      {
        input: "#tag,#tag2,#tag3",
        tags: ["#tag","#tag2","#tag3"],
      },
      {
        input: "#tag#tag2#tag3",
        tags: ["#tag","#tag2","#tag3"],
      },
    ];
    data.forEach((el) => {
      it(`${el.input} => ${el.tags}`, () => {
        const tags = Parser.extractTags(el.input);
        
        assert.deepEqual(tags, el.tags);
      });
    });
  });
});
