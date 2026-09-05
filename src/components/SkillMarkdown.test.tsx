import { render, screen } from "@testing-library/react";
import { SkillMarkdown } from "./SkillMarkdown";

describe("SkillMarkdown", () => {
  it("renders headings, paragraphs and GFM tables", () => {
    const { container } = render(
      <SkillMarkdown content={"# 标题\n\n正文一段。\n\n| A | B |\n| - | - |\n| 1 | 2 |"} />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "标题" })).toBeInTheDocument();
    expect(screen.getByText("正文一段。")).toBeInTheDocument();
    expect(container.querySelector("table")).not.toBeNull();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("strips YAML frontmatter before rendering", () => {
    render(<SkillMarkdown content={"---\nname: demo\n---\n\n# 正文标题"} />);
    expect(screen.getByRole("heading", { level: 1, name: "正文标题" })).toBeInTheDocument();
    expect(screen.queryByText(/name: demo/)).not.toBeInTheDocument();
  });

  it("keeps safe links clickable", () => {
    render(<SkillMarkdown content={"[官网](https://example.com)"} />);
    const link = screen.getByRole("link", { name: "官网" });
    expect(link).toHaveAttribute("href", "https://example.com/");
  });

  it("blocks dangerous link protocols", () => {
    const { container } = render(<SkillMarkdown content={"[点我](javascript:alert(1))"} />);
    expect(container.querySelector("a[href]")).toBeNull();
    expect(screen.getByText(/点我/)).toBeInTheDocument();
  });

  it("parses emphasis and strikethrough adjacent to CJK text", () => {
    const { container } = render(
      <SkillMarkdown content={"中文**加粗**混排，以及~~删除线~~收尾。"} />,
    );
    expect(container.querySelector("strong")?.textContent).toBe("加粗");
    expect(container.querySelector("del")?.textContent).toBe("删除线");
  });
});
