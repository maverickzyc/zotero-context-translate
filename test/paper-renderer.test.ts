import { expect } from "chai";
import {
  applyPaperTemplate,
  renderPaperBody,
} from "../src/modules/paper-translate/html-renderer";
import { PaperDocument } from "../src/modules/paper-translate/types";

describe("paper HTML renderer", function () {
  const document: PaperDocument = {
    version: 1,
    sourceAttachmentID: 1,
    sourceFingerprint: "fingerprint",
    parser: "mineru",
    metadata: {
      title: "A <Paper>",
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
    },
    glossary: [],
    blocks: [
      {
        id: "b0001",
        type: "title",
        source: "A <Paper>",
        translation: "一篇论文",
        status: "validated",
      },
      {
        id: "b0002",
        type: "author",
        source: "Junping Lu $^{*}$",
        status: "validated",
      },
      {
        id: "b0003",
        type: "paragraph",
        source: "English paragraph.",
        translation: "中文段落。",
        status: "validated",
      },
      {
        id: "b0004",
        type: "reference",
        source: "Rose, N. (1999).",
        status: "validated",
      },
      {
        id: "b0005",
        type: "image",
        source: "Figure",
        assetPath: "/tmp/figure.png",
        status: "validated",
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  };

  it("renders paired text, source-only references and embedded images", async function () {
    const body = await renderPaperBody(
      document,
      async () => new Uint8Array([1, 2, 3]),
    );
    expect(body).to.include("&lt;Paper&gt;");
    expect(body).to.include('<h1 class="bilingual-block"');
    expect(body).to.include("Junping Lu <sup>*</sup>");
    expect(body).to.include("中文段落。");
    expect(body).to.include('class="reference en-always"');
    expect(body).to.include("data:image/png;base64,AQID");
  });

  it("applies escaped metadata to a deterministic template", function () {
    const html = applyPaperTemplate(
      "<title>{{TITLE}}</title><main>{{BODY}}</main><small>{{META}}</small>",
      document,
      "<p>body</p>",
    );
    expect(html).to.include("<title>A &lt;Paper&gt;</title>");
    expect(html).to.include("<main><p>body</p></main>");
  });

  it("strips legacy protocol markers at the rendering boundary", async function () {
    const contaminated = {
      ...document,
      blocks: document.blocks.map((block) =>
        block.id === "b0003"
          ? { ...block, translation: "[TYPE=paragraph]\n中文段落。" }
          : block,
      ),
    };
    const body = await renderPaperBody(
      contaminated,
      async () => new Uint8Array([1, 2, 3]),
    );
    expect(body).not.to.include("TYPE=paragraph");
    expect(body).to.include("中文段落。");
  });
});
