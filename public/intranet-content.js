export async function loadPublishedSections() {
  const response = await fetch("/api/sections");
  let result;
  try {
    result = JSON.parse(await response.text());
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    const contentType = response.headers.get("content-type");
    const responseType = contentType ? ` (${contentType})` : "";
    const migrationHint = response.status >= 500
      ? " Kontrollera serverloggarna och att migration 0012 är applicerad i D1."
      : "";
    throw new Error(
      `Servern returnerade ett ogiltigt svar för avsnitten (HTTP ${response.status}${responseType}).${migrationHint}`
    );
  }
  if (!response.ok) throw new Error(result?.error || `Avsnitten kunde inte hämtas (HTTP ${response.status}).`);
  if (!Array.isArray(result?.sections)) throw new Error("Svaret från servern hade ett oväntat format.");
  return result.sections;
}

export function renderSectionContent(section, container) {
  const blocks = section.content.map(item => {
    const article = document.createElement("article");
    article.className = "content-block";
    if (item.title) {
      const heading = document.createElement("h2");
      heading.textContent = item.title;
      article.append(heading);
    }
    if (item.body) {
      const paragraph = document.createElement("p");
      paragraph.textContent = item.body;
      paragraph.style.whiteSpace = "pre-wrap";
      article.append(paragraph);
    }
    return article;
  });
  container.replaceChildren(...blocks);
}
