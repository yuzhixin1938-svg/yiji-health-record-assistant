import { copyFile, cp, mkdir, rm, writeFile } from "node:fs/promises";

await mkdir("public", { recursive: true });
await copyFile("app.html", "public/index.html");
await copyFile("app.html", "public/app.html");
await copyFile("index.html", "public/prototype.html");
await copyFile("privacy.html", "public/privacy.html");
await copyFile("terms.html", "public/terms.html");
await copyFile("project-story.html", "public/project-story.html");
await rm("public/docs", { recursive: true, force: true });
await cp("project-docs", "public/docs", { recursive: true });
await writeFile(
  "public/robots.txt",
  ["User-agent: *", "Allow: /", "Disallow: /api/", "Disallow: /v1/", ""].join("\n"),
);
