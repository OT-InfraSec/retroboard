// Minimal GitHub API stand-in: records created issues and serves them for assertions.
import { createServer } from "node:http";

const issues = [];
createServer((req, res) => {
  if (req.method === "POST" && /^\/repos\/[^/]+\/[^/]+\/issues$/.test(req.url)) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const issue = JSON.parse(body);
      issues.push(issue);
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          number: issues.length,
          html_url: `https://github.test/issues/${issues.length}`,
        }),
      );
    });
  } else if (req.url === "/__issues") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(issues));
  } else {
    res.writeHead(404).end();
  }
}).listen(4010, () => console.log("fake github on :4010"));
