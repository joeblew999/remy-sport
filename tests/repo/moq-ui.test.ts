import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { sources } from "./lib/ast"

it("MoQ chrome uses the installed registry and media access stays in its adapter", () => {
  for (const path of sources("src/web").filter(path => !path.includes("/ui/"))) {
    const text = readFileSync(path, "utf8")
    expect(text, path).not.toMatch(/<moq-(?:watch|publish)-(?:ui|support)\b/)
    if (path !== "src/web/lib/moq-adapter.ts") {
      expect(text, path).not.toMatch(/from ["']@moq\/(?:watch|publish)(?:\/support)?["']/)
    }
  }
  const presentation = readFileSync("src/web/components/moq-video.tsx", "utf8")
  expect(presentation).not.toMatch(/\b(?:SURFACE|HINT)\b|broadcast\.status|as HTMLElement/)
  expect(presentation).not.toMatch(/\b(?:text-(?:xs|sm|base|lg|xl|\dxl)|font-(?:normal|medium|semibold|bold)|bg-(?:background|foreground|black|white)|rounded-\w+)\b/)
})
