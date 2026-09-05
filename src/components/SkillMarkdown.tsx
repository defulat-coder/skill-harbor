import { cjk } from "@streamdown/cjk";
import { Streamdown, type Components } from "streamdown";
import { cn } from "../utils";

interface SkillMarkdownProps {
  content: string;
  className?: string;
}

const markdownComponents: Components = {
  h1: ({ className, node: _node, ...props }) => (
    <h1
      className={cn("mb-4 text-[28px] font-semibold leading-tight text-primary", className)}
      {...props}
    />
  ),
  h2: ({ className, node: _node, ...props }) => (
    <h2
      className={cn("mb-3 mt-8 text-[20px] font-semibold leading-tight text-primary", className)}
      {...props}
    />
  ),
  h3: ({ className, node: _node, ...props }) => (
    <h3
      className={cn("mb-2 mt-6 text-[16px] font-semibold leading-tight text-primary", className)}
      {...props}
    />
  ),
  p: ({ className, node: _node, ...props }) => (
    <p className={cn("mb-4 text-[14px] leading-7 text-secondary", className)} {...props} />
  ),
  a: ({ className, href, node: _node, ...props }) => {
    const dangerous = /^(javascript|vbscript|data):/i;
    const safeHref = href && !dangerous.test(href.trim()) ? href : undefined;
    return (
      <a
        className={cn(
          "text-accent-light underline decoration-accent-border underline-offset-4",
          className,
        )}
        href={safeHref}
        target="_blank"
        rel="noreferrer"
        {...props}
      />
    );
  },
  ul: ({ className, node: _node, ...props }) => (
    <ul className={cn("mb-4 list-disc space-y-1 pl-5 text-secondary", className)} {...props} />
  ),
  ol: ({ className, node: _node, ...props }) => (
    <ol className={cn("mb-4 list-decimal space-y-1 pl-5 text-secondary", className)} {...props} />
  ),
  li: ({ className, node: _node, ...props }) => (
    <li className={cn("pl-1 marker:text-muted", className)} {...props} />
  ),
  strong: ({ className, node: _node, ...props }) => (
    <strong className={cn("font-semibold text-primary", className)} {...props} />
  ),
  blockquote: ({ className, node: _node, ...props }) => (
    <blockquote
      className={cn(
        "mb-4 border-l-2 border-accent-border bg-surface/70 px-4 py-2 text-tertiary italic",
        className,
      )}
      {...props}
    />
  ),
  hr: ({ className, node: _node, ...props }) => (
    <hr className={cn("my-6 border-border-subtle", className)} {...props} />
  ),
  code: ({ className, children, node: _node, ...props }) => {
    const isBlock = (className || "").includes("language-");
    if (isBlock) {
      return (
        <code className={cn("block text-[13px] leading-6 text-secondary", className)} {...props}>
          {children}
        </code>
      );
    }

    return (
      <code
        className={cn(
          "rounded-sm bg-surface-hover px-1.5 py-0.5 font-mono text-[13px] text-accent-light",
          className,
        )}
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ className, node: _node, ...props }) => (
    <pre
      className={cn(
        "mb-4 overflow-x-auto rounded-xl border border-border-subtle bg-background px-4 py-3",
        className,
      )}
      {...props}
    />
  ),
  table: ({ className, node: _node, ...props }) => (
    <div className="mb-4 overflow-x-auto rounded-xl border border-border-subtle">
      <table
        className={cn("min-w-full border-collapse text-left text-[13px]", className)}
        {...props}
      />
    </div>
  ),
  thead: ({ className, node: _node, ...props }) => (
    <thead className={cn("bg-surface-hover text-primary", className)} {...props} />
  ),
  th: ({ className, node: _node, ...props }) => (
    <th
      className={cn("border-b border-border-subtle px-3 py-2 font-medium", className)}
      {...props}
    />
  ),
  td: ({ className, node: _node, ...props }) => (
    <td
      className={cn("border-b border-border-subtle px-3 py-2 text-secondary", className)}
      {...props}
    />
  ),
};

function stripMarkdownFrontmatter(content: string) {
  if (!content.startsWith("---\n")) return content;

  const end = content.indexOf("\n---\n", 4);
  if (end === -1) return content;

  return content.slice(end + 5).trimStart();
}

export function SkillMarkdown({ content, className }: SkillMarkdownProps) {
  const markdown = stripMarkdownFrontmatter(content);

  return (
    <article
      className={cn("mx-auto w-full max-w-[76ch] text-[14px] leading-7 text-secondary", className)}
    >
      <Streamdown components={markdownComponents} plugins={{ cjk }}>
        {markdown}
      </Streamdown>
    </article>
  );
}
