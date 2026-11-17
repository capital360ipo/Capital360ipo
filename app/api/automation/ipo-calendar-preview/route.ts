async function inspectPageReferences(
  html: string,
  pageUrl: string
) {
  const scriptSources = new Set<string>();
  const apiReferences = new Set<string>();
  const requestIndicators = new Set<string>();

  type ContextResult = {
    matchTerm: string;
    classification: string;
    lineNumber: number;
    endLineNumber: number;
    isMinified: boolean;
    contextLines: string[];
    characterContext?: string;
  };

  const scriptScans: Array<{
    url: string;
    status: string;
    httpStatus: number | null;
    length: number;
    possibleApiReferences: string[];
    requestIndicators: string[];
    contextSnippets: string[];
    relevantContextSnippets: ContextResult[];
    error?: string;
  }> = [];

  const scriptRegex =
    /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

  let scriptMatch: RegExpExecArray | null;

  while ((scriptMatch = scriptRegex.exec(html)) !== null) {
    try {
      scriptSources.add(
        new URL(scriptMatch[1], pageUrl).toString()
      );
    } catch {
      // Ignore malformed script URLs.
    }
  }

  const urlRegex =
    /(?:https?:\/\/[^"'`\s<>]+|\/[a-zA-Z0-9_./?=&%-]*(?:api|ipo|issue|public)[a-zA-Z0-9_./?=&%-]*)/gi;

  let urlMatch: RegExpExecArray | null;

  while ((urlMatch = urlRegex.exec(html)) !== null) {
    const value = urlMatch[0].replace(/[),;]+$/, "");

    if (/api|ipo|issue|publicissue|public-issue/i.test(value)) {
      try {
        apiReferences.add(
          new URL(value, pageUrl).toString()
        );
      } catch {
        // Ignore malformed references.
      }
    }
  }

  const htmlIndicatorPatterns = [
    { pattern: /fetch\s*\(/gi, label: "fetch()" },
    { pattern: /\$\.ajax\s*\(/gi, label: "$.ajax()" },
    { pattern: /XMLHttpRequest/gi, label: "XMLHttpRequest" },
    { pattern: /DataTable\s*\(/gi, label: "DataTable()" },
    { pattern: /ajax\s*:/gi, label: "ajax configuration" },
    { pattern: /__NEXT_DATA__/gi, label: "Next.js data marker" },
    { pattern: /application\/json/gi, label: "JSON data marker" },
  ];

  for (const item of htmlIndicatorPatterns) {
    if (item.pattern.test(html)) {
      requestIndicators.add(item.label);
    }
  }

  // Only exact first-party BSE HTTPS scripts are allowed.
  const trustedScripts = Array.from(scriptSources).filter((url) => {
    try {
      const parsed = new URL(url);

      return (
        parsed.protocol === "https:" &&
        parsed.hostname === "www.bseindia.com"
      );
    } catch {
      return false;
    }
  });

  // Maximum 10 first-party scripts.
  for (const scriptUrl of trustedScripts.slice(0, 10)) {
    try {
      const response = await fetch(scriptUrl, {
        method: "GET",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(12000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
          Accept:
            "application/javascript,text/javascript,text/plain,*/*;q=0.8",
        },
      });

      if (!response.ok) {
        scriptScans.push({
          url: scriptUrl,
          status: "HTTP_ERROR",
          httpStatus: response.status,
          length: 0,
          possibleApiReferences: [],
          requestIndicators: [],
          contextSnippets: [],
          relevantContextSnippets: [],
        });
        continue;
      }

      const finalScriptUrl = response.url || scriptUrl;
      const finalParsedUrl = new URL(finalScriptUrl);

      if (
        finalParsedUrl.protocol !== "https:" ||
        finalParsedUrl.hostname !== "www.bseindia.com"
      ) {
        scriptScans.push({
          url: scriptUrl,
          status: "REDIRECT_OUTSIDE_TRUSTED_HOST",
          httpStatus: response.status,
          length: 0,
          possibleApiReferences: [],
          requestIndicators: [],
          contextSnippets: [],
          relevantContextSnippets: [],
        });
        continue;
      }

      const contentType =
        response.headers.get("content-type") || "";

      // Read only the script itself. Do not follow API references.
      const scriptText = (await response.text()).slice(
        0,
        2 * 1024 * 1024
      );

      if (
        !scriptText.trim() ||
        /<html\b|<!doctype html/i.test(scriptText.slice(0, 1000))
      ) {
        scriptScans.push({
          url: scriptUrl,
          status: "EMPTY_OR_NON_SCRIPT_RESPONSE",
          httpStatus: response.status,
          length: scriptText.length,
          possibleApiReferences: [],
          requestIndicators: [],
          contextSnippets: [],
          relevantContextSnippets: [],
        });
        continue;
      }

      const foundApis = new Set<string>();
      const foundIndicators = new Set<string>();
      const snippets: string[] = [];

      const relevantContextSnippets: ContextResult[] = [];

      const scriptUrlRegex =
        /(?:https?:\/\/[^"'`\s<>]+|["'`]\/[^"'`\s<>]*?(?:api|ipo|issue|public)[^"'`\s<>]*["'`])/gi;

      let scriptUrlMatch: RegExpExecArray | null;

      while (
        (scriptUrlMatch = scriptUrlRegex.exec(scriptText)) !== null
      ) {
        const raw = scriptUrlMatch[0].replace(
          /^["'`]|["'`]$/g,
          ""
        );

        const value = raw.replace(/[),;]+$/, "");

        try {
          const resolved = new URL(
            value,
            finalScriptUrl
          ).toString();

          if (/api|ipo|issue|publicissue|public-issue/i.test(resolved)) {
            foundApis.add(resolved);
            apiReferences.add(resolved);
          }
        } catch {
          // Ignore malformed references.
        }
      }

      const scriptIndicators = [
        { pattern: /fetch\s*\(/gi, label: "fetch()" },
        { pattern: /XMLHttpRequest/gi, label: "XMLHttpRequest" },
        { pattern: /axios/gi, label: "axios" },
        { pattern: /\.get\s*\(/gi, label: ".get()" },
        { pattern: /\.post\s*\(/gi, label: ".post()" },
        { pattern: /baseURL/gi, label: "baseURL" },
        { pattern: /api\.bseindia\.com/gi, label: "api.bseindia.com" },
      ];

      for (const item of scriptIndicators) {
        if (item.pattern.test(scriptText)) {
          foundIndicators.add(item.label);
          requestIndicators.add(item.label);
        }
      }

      const keywordPattern =
        /fetch\s*\(|XMLHttpRequest|axios|\.get\s*\(|\.post\s*\(|baseURL|api\.bseindia\.com|\/api\/|\/ipo\//gi;

      let keywordMatch: RegExpExecArray | null;

      while (
        (keywordMatch = keywordPattern.exec(scriptText)) !== null &&
        snippets.length < 12
      ) {
        const start = Math.max(0, keywordMatch.index - 160);
        const end = Math.min(
          scriptText.length,
          keywordMatch.index + 280
        );

        const snippet = scriptText
          .slice(start, end)
          .replace(/\s+/g, " ")
          .trim();

        if (snippet) snippets.push(snippet);
      }

      // Target definitions, assignments and relevant usages.
      const contextTargets = [
        {
          label: "BSE_Domain_APIUrl declaration",
          classification: "CONFIG_DECLARATION",
          pattern: /\bBSE_Domain_APIUrl\b\s*[:=]/gi,
        },
        {
          label: "BSE_Domain_APIUrl all occurrences",
          classification: "CONFIG_REFERENCE",
          pattern: /\bBSE_Domain_APIUrl\b/gi,
        },
        {
          label: "window.__env",
          classification: "ENVIRONMENT_CONFIGURATION",
          pattern: /window\s*\.\s*__env|__env\s*\[/gi,
        },
        {
          label: "IS_INTERNATIONAL",
          classification: "ENVIRONMENT_CONFIGURATION",
          pattern: /\bIS_INTERNATIONAL\b/gi,
        },
        {
          label: "M.url object declaration",
          classification: "ROUTE_OBJECT_DECLARATION",
          pattern: /\bM\s*\.\s*url\s*[:=]\s*\{/gi,
        },
        {
          label: "M.url.GetPublicIssue_par",
          classification: "IPO_ROUTE_MAPPING",
          pattern: /\bM\s*\.\s*url\s*\.\s*GetPublicIssue_par\b/gi,
        },
        {
          label: "GetPublicIssue_par property",
          classification: "IPO_ROUTE_MAPPING",
          pattern: /\bGetPublicIssue_par\b/gi,
        },
        {
          label: "GetPublicIssue_par_updated",
          classification: "IPO_ROUTE_MAPPING",
          pattern: /\bGetPublicIssue_par_updated\b/gi,
        },
        {
          label: "IPOTrackerN",
          classification: "IPO_ROUTE_MAPPING",
          pattern: /\bIPOTrackerN\b/gi,
        },
        {
          label: "Get_issuetype_dropdown",
          classification: "IPO_ROUTE_MAPPING",
          pattern: /\bGet_issuetype_dropdown\b/gi,
        },
        {
          label: "fetchData implementation",
          classification: "DATA_SERVICE_IMPLEMENTATION",
          pattern: /\bfetchData\s*\([^)]*\)\s*(?::[^={]+)?\{/gi,
        },
        {
          label: "getData implementation",
          classification: "DATA_SERVICE_IMPLEMENTATION",
          pattern: /\bgetData\s*\([^)]*\)\s*(?::[^={]+)?\{/gi,
        },
        {
          label: "dataService.fetchData usage",
          classification: "DATA_SERVICE_USAGE",
          pattern: /dataService\s*\.\s*fetchData\s*\(/gi,
        },
        {
          label: "dataService.getData usage",
          classification: "DATA_SERVICE_USAGE",
          pattern: /dataService\s*\.\s*getData\s*\(/gi,
        },
        {
          label: "HttpClient and credentials",
          classification: "HTTP_CONFIGURATION",
          pattern: /HttpClient|withCredentials|credentials\s*:/gi,
        },
        {
          label: "HTTP headers and authorization",
          classification: "HTTP_CONFIGURATION",
          pattern: /headers\s*[:=]|setHeaders|Authorization/gi,
        },
      ];

      // Preserve original line positions.
      const lines = scriptText.split(/\r\n|\n|\r/);
      const lineStarts: number[] = [];

      let runningOffset = 0;

      for (const line of lines) {
        lineStarts.push(runningOffset);
        runningOffset += line.length + 1;
      }

      function findLineNumber(offset: number) {
        let low = 0;
        let high = lineStarts.length - 1;
        let result = 0;

        while (low <= high) {
          const middle = Math.floor((low + high) / 2);

          if (lineStarts[middle] <= offset) {
            result = middle;
            low = middle + 1;
          } else {
            high = middle - 1;
          }
        }

        return result;
      }

      const snippetSet = new Set<string>();

      for (const target of contextTargets) {
        let match: RegExpExecArray | null;
        let targetMatches = 0;

        target.pattern.lastIndex = 0;

        while (
          (match = target.pattern.exec(scriptText)) !== null &&
          targetMatches < 20 &&
          relevantContextSnippets.length < 100
        ) {
          const lineIndex = findLineNumber(match.index);
          const startLineIndex = Math.max(0, lineIndex - 10);
          const endLineIndex = Math.min(
            lines.length - 1,
            lineIndex + 10
          );

          const isMinified =
            lines.length <= 3 ||
            lines[lineIndex].length > 2000;

          const uniqueKey =
            `${target.label}:${match.index}`;

          if (snippetSet.has(uniqueKey)) continue;
          snippetSet.add(uniqueKey);

          const contextLines = lines
            .slice(startLineIndex, endLineIndex + 1)
            .map((line, index) => {
              const actualLine = startLineIndex + index + 1;

              // Prevent extremely large minified lines in JSON.
              if (line.length > 4000) {
                const isMatchLine =
                  actualLine === lineIndex + 1;

                if (isMatchLine) {
                  const relative = match.index - lineStarts[lineIndex];
                  const start = Math.max(0, relative - 1000);
                  const end = Math.min(
                    line.length,
                    relative + 1500
                  );

                  return `${actualLine}: ${line.slice(start, end)} [LINE TRUNCATED]`;
                }

                return `${actualLine}: [LONG LINE OMITTED]`;
              }

              return `${actualLine}: ${line}`;
            });

          let characterContext: string | undefined;

          if (isMinified) {
            const start = Math.max(0, match.index - 1000);
            const end = Math.min(
              scriptText.length,
              match.index + 1500
            );

            characterContext = scriptText
              .slice(start, end)
              .replace(/\s+/g, " ")
              .trim();
          }

          relevantContextSnippets.push({
            matchTerm: target.label,
            classification: target.classification,
            lineNumber: lineIndex + 1,
            endLineNumber: endLineIndex + 1,
            isMinified,
            contextLines,
            ...(characterContext
              ? { characterContext }
              : {}),
          });

          targetMatches++;
        }
      }

      scriptScans.push({
        url: scriptUrl,
        status: "SCANNED",
        httpStatus: response.status,
        length: scriptText.length,
        possibleApiReferences: Array.from(foundApis).slice(0, 60),
        requestIndicators: Array.from(foundIndicators),
        contextSnippets: snippets,
        relevantContextSnippets,
      });
    } catch (error) {
      scriptScans.push({
        url: scriptUrl,
        status: "FETCH_FAILED",
        httpStatus: null,
        length: 0,
        possibleApiReferences: [],
        requestIndicators: [],
        contextSnippets: [],
        relevantContextSnippets: [],
        error:
          error instanceof Error
            ? error.message
            : "Unknown script scan error",
      });
    }
  }

  return {
    diagnosticType:
      "READ_ONLY_BSE_CONFIGURATION_AND_IPO_ROUTE_CONTEXT_SCAN",

    pageUrl,

    scriptSourceCount: scriptSources.size,
    scriptSources: Array.from(scriptSources).slice(0, 40),

    firstPartyScriptsScanned: scriptScans.length,

    possibleApiReferenceCount: apiReferences.size,
    possibleApiReferences: Array.from(apiReferences).slice(0, 60),

    requestIndicators: Array.from(requestIndicators),

    scanTargets: contextTargets.map((item) => ({
      name: item.label,
      classification: item.classification,
    })),

    contextWindow: {
      linesBefore: 10,
      linesAfter: 10,
      minifiedCharacterContext: true,
    },

    scriptScans,

    verificationStatus: "UNVERIFIED",

    note:
      "Read-only diagnostic. Only exact www.bseindia.com HTTPS scripts were inspected. Discovered API endpoints were not called. Context matches do not independently prove runtime configuration values. No database writes were performed.",
  };
}
